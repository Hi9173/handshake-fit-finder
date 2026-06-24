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

REQUIRED_SECTION_HEADINGS = (
    "minimum requirements",
    "required qualifications",
    "requirements",
    "qualifications",
)

PREFERRED_SECTION_HEADINGS = (
    "skills we're looking for",
    "skills we’re looking for",
    "preferred qualifications",
    "preferred skills",
    "nice to have",
    "bonus points",
)

SECTION_STOP_HEADINGS = (
    "job description",
    "responsibilities",
    "minimum requirements",
    "required qualifications",
    "requirements",
    "qualifications",
    "skills we're looking for",
    "skills we’re looking for",
    "preferred qualifications",
    "preferred skills",
    "nice to have",
    "bonus points",
    "about",
)

REQUIRED_SIGNAL_RULES = (
    (
        r"(undergraduate|graduate|bachelor|master|degree|program).{0,160}"
        r"(computer science|software engineering|information systems|closely related)",
        "B.S / Masters in CS",
    ),
    (
        r"(computer science|software engineering|information systems|closely related).{0,160}"
        r"(undergraduate|graduate|bachelor|master|degree|program)",
        "B.S / Masters in CS",
    ),
    (
        r"(shipped at least one real web project|real web project end-to-end|"
        r"github or a live url|strong public portfolio)",
        "Shipped real web project",
    ),
    (r"\bhtml\b", "HTML"),
    (r"\bcss\b", "CSS"),
    (r"\bjavascript\b", "JavaScript"),
    (r"\bgit\b", "Git"),
)

PREFERRED_SIGNAL_RULES = (
    (r"\breact\b", "React"),
    (r"\bnext\.?js\b", "Next.js"),
    (r"\btypescript\b", "TypeScript"),
    (r"\brest\b", "REST API"),
    (r"\bgraphql\b", "GraphQL"),
    (r"\bheadless commerce\b", "Headless commerce"),
    (r"\bmedusa\b", "Medusa"),
    (r"\bshopify hydrogen\b", "Shopify Hydrogen"),
    (r"\bcommerce\.js\b", "Commerce.js"),
    (r"\bwoocommerce\b", "WooCommerce"),
    (r"\bshopify\b", "Shopify"),
    (r"\bpostgres\b", "Postgres"),
    (r"\bsupabase\b", "Supabase"),
    (r"\bvercel\b", "Vercel"),
    (r"\bcdn\b", "CDN configuration"),
    (r"\bcloudflare\b", "Cloudflare"),
    (r"\bauthentication\b", "Authentication flows"),
    (r"\boauth\b", "OAuth"),
    (r"\bjwt\b", "JWT"),
    (r"\bsession management\b", "Session management"),
    (r"\bb2b e-?commerce\b", "B2B e-commerce"),
    (r"\b(jewelry|luxury|fashion)\b", "Jewelry / luxury / fashion"),
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
    required_signals: list[str]
    preferred_signals: list[str]
    role_matches: list[str]
    penalties: list[str]
    summary: str


def score_job(profile: ProfileInput, job: JobInput) -> ScoreResult:
    profile_skills = _normalize_terms(profile.skills)
    job_text = _job_text(job)
    matched_skills = sorted(skill for skill in profile_skills if _contains_term(job_text, skill))
    required_skills = sorted(skill for skill in COMMON_JOB_SKILLS if _contains_term(job_text, skill))
    required_signals, preferred_signals = job_signals(job)
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
        required_signals=required_signals,
        preferred_signals=preferred_signals,
        role_matches=role_matches,
        penalties=penalties,
        summary=summary,
    )


def job_signals(job: JobInput) -> tuple[list[str], list[str]]:
    description = _job_signal_text(job.description)
    required_section = _extract_section(description, REQUIRED_SECTION_HEADINGS)
    required_text = required_section or description
    preferred_text = _extract_section(description, PREFERRED_SECTION_HEADINGS)
    required_signals = _signals_from_rules(required_text, REQUIRED_SIGNAL_RULES)
    if not required_section and _looks_like_detail_description(description):
        required_signals.extend(sorted(skill for skill in COMMON_JOB_SKILLS if _contains_term(_normalize(description), skill)))
    hours_signal = _hours_signal(required_text)
    if hours_signal:
        required_signals.append(hours_signal)
    preferred_signals = _signals_from_rules(preferred_text, PREFERRED_SIGNAL_RULES)
    return _dedupe(required_signals), _dedupe(preferred_signals)


def _summary(score: int, matched_skills: list[str], missing_skills: list[str], penalties: list[str]) -> str:
    if penalties:
        return f"{score}% fit with {len(penalties)} caution signal(s)."
    if missing_skills:
        return f"{score}% fit with {len(missing_skills)} skill gap(s) to review."
    return f"{score}% fit with strong skill alignment."


def _job_text(job: JobInput) -> str:
    return _normalize(" ".join([job.title, job.company, job.location, job.description]))


def _job_signal_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _extract_section(text: str, headings: tuple[str, ...]) -> str:
    normalized_text = text.lower()
    starts = [
        (match.start(), heading)
        for heading in headings
        for match in _heading_matches(normalized_text, heading)
    ]
    if not starts:
        return ""

    start, heading = min(starts)
    body_start = start + len(heading)
    stop_positions = [
        normalized_text.find(stop_heading, body_start)
        for stop_heading in SECTION_STOP_HEADINGS
        if normalized_text.find(stop_heading, body_start) >= 0
    ]
    body_end = min(stop_positions) if stop_positions else len(text)
    return text[body_start:body_end].strip()


def _heading_matches(text: str, heading: str):
    if heading in {"requirements", "qualifications"}:
        return re.finditer(rf"(^|[.!?]\s+)({re.escape(heading)})\b", text)
    return re.finditer(rf"\b{re.escape(heading)}\b", text)


def _signals_from_rules(text: str, rules: tuple[tuple[str, str], ...]) -> list[str]:
    return [label for pattern, label in rules if re.search(pattern, text, re.IGNORECASE)]


def _hours_signal(text: str) -> str:
    match = re.search(r"(\d+)\s*[–-]\s*(\d+)\s*hours?\s+per\s+week", text, re.IGNORECASE)
    if not match:
        return ""
    return f"{match.group(1)}-{match.group(2)} Hours per week"


def _looks_like_detail_description(text: str) -> bool:
    return len(text) > 80 and bool(re.search(r"\b(job description|responsibilities|requirements|qualifications)\b", text, re.IGNORECASE))


def _normalize_terms(values: list[str]) -> set[str]:
    return {_normalize(value) for value in values if value.strip()}


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        key = value.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(value)
    return deduped


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
