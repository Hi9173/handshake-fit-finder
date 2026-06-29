from dataclasses import dataclass
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import Settings, get_settings
from app.services.job_extractor import NON_TECHNICAL_SKILLS


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
MAX_RESUME_CHARS = 12000


@dataclass(frozen=True)
class ExtractedResumeFacts:
    target_roles: list[str]
    skills: list[str]
    locations: list[str]
    characteristics: list[str]
    seniority: str


def extract_resume_facts(text: str, settings: Settings | None = None) -> ExtractedResumeFacts | None:
    settings = settings or get_settings()
    if not settings.openai_api_key:
        return None

    try:
        request = Request(
            OPENAI_RESPONSES_URL,
            data=json.dumps(_payload(text[:MAX_RESUME_CHARS], settings.openai_model)).encode(),
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlopen(request, timeout=30) as response:
            return _parse_response(response.read())
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        return None


def _payload(text: str, model: str) -> dict:
    return {
        "model": model,
        "input": [
            {
                "role": "system",
                "content": (
                    "Extract resume facts for local job matching. This is resume extraction, not job description "
                    "extraction. Skills must be concrete technical skills, tools, languages, frameworks, platforms, "
                    "databases, cloud services, APIs, developer workflows, or domain-specific technical methods the "
                    "candidate claims. Do not include generic professional traits such as communication, teamwork, "
                    "organization, leadership, problem-solving, curiosity, attention to detail, time management, or "
                    "willingness to learn as skills. Characteristics may include profile-level facts such as New "
                    "graduate, Willing to relocate, Open to startups, US work authorization, or portfolio/GitHub."
                ),
            },
            {"role": "user", "content": text},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "resume_extraction",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["target_roles", "skills", "locations", "characteristics", "seniority"],
                    "properties": {
                        "target_roles": {"type": "array", "items": {"type": "string"}},
                        "skills": {"type": "array", "items": {"type": "string"}},
                        "locations": {"type": "array", "items": {"type": "string"}},
                        "characteristics": {"type": "array", "items": {"type": "string"}},
                        "seniority": {"type": "string", "enum": ["entry", "junior", "mid", "senior", "unknown"]},
                    },
                },
            }
        },
    }


def _parse_response(body: bytes) -> ExtractedResumeFacts:
    payload = json.loads(body)
    text = payload.get("output_text") or _output_text(payload)
    data = json.loads(text)
    skills = _technical_terms(data.get("skills", []))
    return ExtractedResumeFacts(
        target_roles=_clean_list(data.get("target_roles", [])),
        skills=skills,
        locations=_clean_list(data.get("locations", [])),
        characteristics=_clean_list(data.get("characteristics", [])),
        seniority=_clean(data.get("seniority", "entry")) or "entry",
    )


def _output_text(payload: dict) -> str:
    for output in payload.get("output", []):
        for content in output.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                return content["text"]
    raise ValueError("OpenAI response did not include output text")


def _technical_terms(values: object) -> list[str]:
    return [value for value in _clean_list(values) if _normalize(value) not in NON_TECHNICAL_SKILLS]


def _clean_list(values: object) -> list[str]:
    if not isinstance(values, list):
        return []
    return _dedupe([_clean(value) for value in values if _clean(value)])


def _clean(value: object) -> str:
    return str(value).strip() if value is not None else ""


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
