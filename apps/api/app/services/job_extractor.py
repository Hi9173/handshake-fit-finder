from dataclasses import dataclass
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import Settings, get_settings
from app.schemas import JobCreate


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
MAX_DESCRIPTION_CHARS = 12000
NON_TECHNICAL_SKILLS = {
    "communication",
    "written communication",
    "verbal communication",
    "teamwork",
    "collaboration",
    "organization",
    "organizational skills",
    "leadership",
    "self-starter",
    "problem solving",
    "problem-solving",
    "curiosity",
    "attention to detail",
    "time management",
    "willingness to learn",
    "remote",
    "hybrid",
    "onsite",
    "on-site",
    "internship",
    "part time",
    "part-time",
    "full time",
    "full-time",
    "contract",
    "temporary",
}


@dataclass(frozen=True)
class ExtractedJobFacts:
    title: str = ""
    company: str = ""
    location: str = ""
    work_mode: str = "unknown"
    employment_type: str = "unknown"
    required_skills: list[str] | None = None
    preferred_skills: list[str] | None = None
    confidence: float = 0.0

    def required_signals(self) -> list[str]:
        return _technical_terms(self.required_skills or [])

    def preferred_signals(self) -> list[str]:
        return _technical_terms(self.preferred_skills or [])


def extract_job_facts(jobs: list[JobCreate], settings: Settings | None = None) -> list[ExtractedJobFacts | None]:
    settings = settings or get_settings()
    if not settings.openai_api_key:
        return [None for _ in jobs]

    batch_size = max(1, settings.openai_batch_size)
    facts: list[ExtractedJobFacts | None] = []
    for start in range(0, len(jobs), batch_size):
        facts.extend(_extract_chunk(jobs[start:start + batch_size], settings))
    return facts


def _extract_chunk(jobs: list[JobCreate], settings: Settings) -> list[ExtractedJobFacts | None]:
    try:
        request = Request(
            OPENAI_RESPONSES_URL,
            data=json.dumps(_payload(jobs, settings.openai_model)).encode(),
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlopen(request, timeout=30) as response:
            return _parse_response(response.read(), len(jobs))
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        return [None for _ in jobs]


def _payload(jobs: list[JobCreate], model: str) -> dict:
    return {
        "model": model,
        "input": [
            {
                "role": "system",
                "content": (
                    "Extract job facts from captured job postings. "
                    "Return only facts supported by the text. Use unknown for unclear enums. "
                    "Process each job independently; never copy company, location, skills, or other facts "
                    "from another job in the same batch. "
                    "If a title or description starts with a glued company name immediately followed by the role, "
                    "prefer that exact leading company name. "
                    "Return the actual role title, without company names, locations, pay, dates, or badges; "
                    "replace placeholder titles like Unknown role when the description reveals the role. "
                    "Treat required_skills and preferred_skills as profile match signals, not only named tools. "
                    "Include concrete technical skills, tools, languages, frameworks, platforms, databases, cloud "
                    "services, APIs, developer workflows, domain-specific technical methods, and hard credentials "
                    "or technical-adjacent requirements such as Bachelor's degree, programming language experience, "
                    "healthcare technology, or AI application experience. Only put a signal in required_skills if "
                    "the posting explicitly requires it; do not promote background context or preferred-only "
                    "qualifications into required_skills. Do not include work mode, employment type, or generic "
                    "soft skills such as communication, teamwork, organization, leadership, self-starter, "
                    "problem-solving, curiosity, attention to detail, time management, or willingness to learn."
                ),
            },
            {"role": "user", "content": json.dumps({"jobs": [_job_payload(index, job) for index, job in enumerate(jobs)]})},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "job_batch_extraction",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["jobs"],
                    "properties": {
                        "jobs": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": [
                                    "index",
                                    "title",
                                    "company",
                                    "location",
                                    "work_mode",
                                    "employment_type",
                                    "required_skills",
                                    "preferred_skills",
                                    "confidence",
                                ],
                                "properties": {
                                    "index": {"type": "integer"},
                                    "title": {"type": "string"},
                                    "company": {"type": "string"},
                                    "location": {"type": "string"},
                                    "work_mode": {
                                        "type": "string",
                                        "enum": ["remote", "hybrid", "onsite", "unknown"],
                                    },
                                    "employment_type": {
                                        "type": "string",
                                        "enum": ["internship", "part_time", "full_time", "contract", "temporary", "unknown"],
                                    },
                                    "required_skills": {"type": "array", "items": {"type": "string"}},
                                    "preferred_skills": {"type": "array", "items": {"type": "string"}},
                                    "confidence": {"type": "number"},
                                },
                            },
                        }
                    },
                },
            }
        },
    }


def _job_payload(index: int, job: JobCreate) -> dict[str, str | int | None]:
    return {
        "index": index,
        "title": job.title,
        "company": "",
        "location": "",
        "description": job.description[:MAX_DESCRIPTION_CHARS],
        "source_url": job.source_url,
    }


def _parse_response(body: bytes, job_count: int) -> list[ExtractedJobFacts | None]:
    payload = json.loads(body)
    text = payload.get("output_text") or _output_text(payload)
    data = json.loads(text)
    facts: list[ExtractedJobFacts | None] = [None for _ in range(job_count)]
    for item in data.get("jobs", []):
        index = item.get("index")
        if isinstance(index, int) and 0 <= index < job_count:
            facts[index] = ExtractedJobFacts(
                title=_clean(item.get("title", "")),
                company=_clean(item.get("company", "")),
                location=_clean(item.get("location", "")),
                work_mode=_clean(item.get("work_mode", "unknown")) or "unknown",
                employment_type=_clean(item.get("employment_type", "unknown")) or "unknown",
                required_skills=_clean_list(item.get("required_skills", [])),
                preferred_skills=_clean_list(item.get("preferred_skills", [])),
                confidence=float(item.get("confidence") or 0),
            )
    return facts


def _output_text(payload: dict) -> str:
    for output in payload.get("output", []):
        for content in output.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                return content["text"]
    raise ValueError("OpenAI response did not include output text")


def _clean(value: object) -> str:
    return str(value).strip() if value is not None else ""


def _clean_list(values: object) -> list[str]:
    if not isinstance(values, list):
        return []
    return _dedupe([_clean(value) for value in values if _clean(value)])


def _technical_terms(values: list[str]) -> list[str]:
    return _dedupe([value for value in values if _normalize(value) not in NON_TECHNICAL_SKILLS])


def _normalize(value: str) -> str:
    return " ".join(value.lower().replace("_", " ").split())


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = value.lower()
        if key not in seen:
            seen.add(key)
            result.append(value)
    return result
