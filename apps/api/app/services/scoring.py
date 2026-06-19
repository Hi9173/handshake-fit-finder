from dataclasses import dataclass
import re


COMMON_JOB_SKILLS = {
    "aws",
    "docker",
    "excel",
    "fastapi",
    "git",
    "java",
    "javascript",
    "mysql",
    "postgres",
    "python",
    "react",
    "sql",
    "tableau",
    "typescript",
}

SENIOR_SIGNALS = (
    "senior",
    "staff",
    "principal",
    "lead ",
    "5+ years",
    "6+ years",
    "7+ years",
)


@dataclass(frozen=True)
class ProfileInput:
    target_roles: list[str]
    skills: list[str]
    locations: list[str]
    dealbreakers: list[str]
    seniority: str


@dataclass(frozen=True)
class JobInput:
    title: str
    company: str
    location: str
    description: str


@dataclass(frozen=True)
class ScoreResult:
    score: int
    matched_skills: list[str]
    missing_skills: list[str]
    role_matches: list[str]
    penalties: list[str]
    summary: str


def score_job(profile: ProfileInput, job: JobInput) -> ScoreResult:
    profile_skills = _normalize_terms(profile.skills)
    job_text = _job_text(job)
    matched_skills = sorted(skill for skill in profile_skills if _contains_term(job_text, skill))
    required_skills = sorted(skill for skill in COMMON_JOB_SKILLS if _contains_term(job_text, skill))
    missing_skills = sorted(skill for skill in required_skills if skill not in profile_skills)
    role_matches = sorted(role for role in _normalize_terms(profile.target_roles) if _contains_term(_normalize(job.title), role))

    score = 45
    score += min(30, len(matched_skills) * 8)
    score += 15 if role_matches else 0
    score += 10 if _location_matches(profile.locations, job.location) else 0
    score -= min(18, len(missing_skills) * 4)

    penalties: list[str] = []
    if not _location_matches(profile.locations, job.location):
        penalties.append("Location does not match preferences")
        score -= 8

    for dealbreaker in _normalize_terms(profile.dealbreakers):
        if _contains_term(job_text, dealbreaker):
            penalties.append(f"Dealbreaker matched: {dealbreaker}")
            score -= 25

    if profile.seniority.lower() in {"entry", "junior"} and _has_senior_signal(job_text):
        penalties.append("Seniority appears above entry level")
        score -= 18

    bounded_score = max(0, min(100, score))
    summary = _summary(bounded_score, matched_skills, missing_skills, penalties)
    return ScoreResult(
        score=bounded_score,
        matched_skills=matched_skills,
        missing_skills=missing_skills,
        role_matches=role_matches,
        penalties=penalties,
        summary=summary,
    )


def _summary(score: int, matched_skills: list[str], missing_skills: list[str], penalties: list[str]) -> str:
    if penalties:
        return f"{score}% fit with {len(penalties)} caution signal(s)."
    if missing_skills:
        return f"{score}% fit with {len(missing_skills)} skill gap(s) to review."
    return f"{score}% fit with strong skill alignment."


def _job_text(job: JobInput) -> str:
    return _normalize(" ".join([job.title, job.company, job.location, job.description]))


def _normalize_terms(values: list[str]) -> set[str]:
    return {_normalize(value) for value in values if value.strip()}


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def _contains_term(text: str, term: str) -> bool:
    escaped = re.escape(term)
    return re.search(rf"(^|[^a-z0-9+#]){escaped}([^a-z0-9+#]|$)", text) is not None


def _location_matches(preferred_locations: list[str], job_location: str) -> bool:
    normalized_location = _normalize(job_location)
    for location in _normalize_terms(preferred_locations):
        if location == "remote" and _contains_term(normalized_location, "remote"):
            return True
        if location and location in normalized_location:
            return True
    return False


def _has_senior_signal(text: str) -> bool:
    return any(signal in text for signal in SENIOR_SIGNALS)
