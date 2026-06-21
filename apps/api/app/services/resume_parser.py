from dataclasses import dataclass
from pathlib import Path
import re

from fastapi import HTTPException, UploadFile

from app.services.scoring import COMMON_JOB_SKILLS

ALLOWED_EXTENSIONS = {".md", ".tex", ".pdf"}
RESUME_DIR = Path(__file__).resolve().parents[2] / "storage" / "resume" / "active"
ROLE_KEYWORDS = ("data analyst", "business analyst", "software engineer", "backend engineer", "frontend engineer")
LOCATION_KEYWORDS = ("remote", "san francisco", "new york", "boston", "seattle", "los angeles")


@dataclass(frozen=True)
class ParsedResume:
    filename: str
    path: str
    text: str
    target_roles: list[str]
    skills: list[str]
    locations: list[str]
    characteristics: list[str]
    seniority: str


async def parse_resume_upload(file: UploadFile) -> ParsedResume:
    filename = Path(file.filename or "").name
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Upload a .pdf, .tex, or .md resume.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Resume file is empty.")

    text = _extract_text(content, extension).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Could not extract text from resume.")

    RESUME_DIR.mkdir(parents=True, exist_ok=True)
    path = RESUME_DIR / filename
    path.write_bytes(content)

    return ParsedResume(
        filename=filename,
        path=str(path),
        text=text,
        target_roles=_extract_roles(text),
        skills=_extract_skills(text),
        locations=_extract_locations(text),
        characteristics=extract_characteristics(text),
        seniority="entry",
    )


def _extract_text(content: bytes, extension: str) -> str:
    if extension in {".md", ".tex"}:
        return content.decode("utf-8", errors="ignore")
    return _extract_pdf_text(content)


def _extract_pdf_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as error:
        raise HTTPException(status_code=400, detail="PDF parsing is not installed locally.") from error

    try:
        import io

        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as error:
        raise HTTPException(status_code=400, detail="Could not extract text from PDF resume.") from error


def _extract_skills(text: str) -> list[str]:
    normalized = _normalize(text)
    return sorted(skill for skill in COMMON_JOB_SKILLS if _contains_term(normalized, skill))


def _extract_roles(text: str) -> list[str]:
    normalized = _normalize(text)
    return [role for role in ROLE_KEYWORDS if _contains_term(normalized, role)]


def _extract_locations(text: str) -> list[str]:
    normalized = _normalize(text)
    return [location for location in LOCATION_KEYWORDS if _contains_term(normalized, location)]


def extract_characteristics(text: str) -> list[str]:
    normalized = _normalize(text)
    characteristics = list(_extract_skills(text))
    if "recent graduate" in normalized or "new graduate" in normalized or "new grad" in normalized:
        characteristics.append("New graduate")
    if "willing to relocate" in normalized or "open to relocate" in normalized or "open to relocation" in normalized:
        characteristics.append("Willing to relocate")
    return list(dict.fromkeys(characteristics))


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def _contains_term(text: str, term: str) -> bool:
    escaped = re.escape(term)
    return re.search(rf"(^|[^a-z0-9+#]){escaped}([^a-z0-9+#]|$)", text) is not None
