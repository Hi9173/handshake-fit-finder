from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import delete, inspect, select, text
from sqlalchemy.orm import Session

from app.database import Base, get_db
from app.models import FitScore, Job, Profile, utc_now
from app.schemas import JobCaptureBatch, JobCreate, JobRead, JobStatusUpdate, ProfileRead, ProfileUpdate
from app.services.profile_store import get_or_create_profile, has_resume, profile_input, zero_resume_score
from app.services.resume_parser import extract_characteristics, parse_resume_upload
from app.services.scoring import JobInput, job_signals, score_job

router = APIRouter(prefix="/api", tags=["jobs"])

MAX_TITLE_LENGTH = 255
MAX_COMPANY_LENGTH = 255
MAX_LOCATION_LENGTH = 255
MAX_SOURCE_URL_LENGTH = 1000
MAX_SOURCE_LENGTH = 80


@router.get("/profile", response_model=ProfileRead)
def get_profile(db: Session = Depends(get_db)) -> ProfileRead:
    _ensure_schema(db)
    profile = get_or_create_profile(db)
    _backfill_resume_characteristics(profile)
    db.commit()
    return _serialize_profile(profile)


@router.put("/profile", response_model=ProfileRead)
def update_profile(update: ProfileUpdate, db: Session = Depends(get_db)) -> ProfileRead:
    _ensure_schema(db)
    profile = get_or_create_profile(db)
    profile.name = update.name
    profile.target_roles = update.target_roles
    profile.skills = update.skills
    profile.locations = update.locations
    profile.dealbreakers = update.dealbreakers
    if update.resume_characteristics is not None:
        profile.resume_characteristics = _dedupe_terms(update.resume_characteristics)
    if update.user_characteristics is not None:
        profile.user_characteristics = _dedupe_terms(update.user_characteristics)
    profile.seniority = update.seniority
    _rescore_all_jobs(db, profile)
    db.commit()
    db.refresh(profile)
    return _serialize_profile(profile)


@router.post("/profile/resume", response_model=ProfileRead)
async def upload_resume(file: UploadFile, db: Session = Depends(get_db)) -> ProfileRead:
    _ensure_schema(db)
    profile = get_or_create_profile(db)
    parsed = await parse_resume_upload(file)
    profile.resume_filename = parsed.filename
    profile.resume_path = parsed.path
    profile.resume_text = parsed.text
    profile.resume_uploaded_at = utc_now()
    profile.target_roles = parsed.target_roles or profile.target_roles
    profile.skills = parsed.skills
    profile.locations = parsed.locations or profile.locations
    profile.resume_characteristics = parsed.characteristics
    profile.seniority = parsed.seniority
    _rescore_all_jobs(db, profile)
    db.commit()
    db.refresh(profile)
    return _serialize_profile(profile)


@router.get("/jobs", response_model=list[JobRead])
def list_jobs(db: Session = Depends(get_db)) -> list[JobRead]:
    _ensure_schema(db)
    profile = get_or_create_profile(db)
    stored_jobs = db.scalars(select(Job).order_by(Job.created_at.desc())).all()
    serialized = [_serialize_job(job, profile) for job in stored_jobs if job.score is not None]
    return sorted(serialized, key=lambda item: item.fit.score, reverse=True)


@router.delete("/jobs")
def delete_jobs(db: Session = Depends(get_db)) -> dict[str, int]:
    _ensure_schema(db)
    db.execute(delete(FitScore))
    deleted = db.execute(delete(Job)).rowcount or 0
    db.commit()
    return {"deleted": deleted}


@router.patch("/jobs/{job_id}/status", response_model=JobRead)
def update_job_status(job_id: int, update: JobStatusUpdate, db: Session = Depends(get_db)) -> JobRead:
    _ensure_schema(db)
    profile = get_or_create_profile(db)
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = update.status.value
    db.commit()
    db.refresh(job)
    return _serialize_job(job, profile)


@router.post("/jobs/score", response_model=JobRead)
def score_new_job(job: JobCreate, db: Session = Depends(get_db)) -> JobRead:
    _ensure_schema(db)
    profile = get_or_create_profile(db)
    result = _score_for_job(profile, job)
    return JobRead(id=999, **job.model_dump(), fit=result.__dict__)


@router.post("/extension/capture", response_model=list[JobRead])
def capture_visible_jobs(batch: JobCaptureBatch, db: Session = Depends(get_db)) -> list[JobRead]:
    _ensure_schema(db)
    profile = get_or_create_profile(db)
    captured = [_upsert_job(db, profile, job) for job in batch.jobs]
    db.commit()
    return sorted((_serialize_job(job, profile) for job in captured), key=lambda item: item.fit.score, reverse=True)


def _upsert_job(db: Session, profile: Profile, job_input: JobCreate) -> Job:
    job_input = _sanitize_job_input(job_input)
    existing_job = _find_existing_job(db, job_input)
    if existing_job is None:
        existing_job = Job(
            title=job_input.title,
            company=job_input.company,
            location=job_input.location,
            description=job_input.description,
            source_url=job_input.source_url,
            source=job_input.source,
        )
        db.add(existing_job)
    else:
        existing_job.title = job_input.title
        existing_job.company = job_input.company
        existing_job.location = job_input.location
        existing_job.description = job_input.description
        existing_job.source_url = job_input.source_url
        existing_job.source = job_input.source

    db.flush()
    score = _score_for_job(profile, job_input)
    if existing_job.score is None:
        existing_job.score = FitScore(job_id=existing_job.id, **score.__dict__)
    else:
        existing_job.score.score = score.score
        existing_job.score.matched_skills = score.matched_skills
        existing_job.score.missing_skills = score.missing_skills
        existing_job.score.required_signals = score.required_signals
        existing_job.score.preferred_signals = score.preferred_signals
        existing_job.score.role_matches = score.role_matches
        existing_job.score.penalties = score.penalties
        existing_job.score.summary = score.summary

    db.flush()
    return existing_job


def _sanitize_job_input(job_input: JobCreate) -> JobCreate:
    return job_input.model_copy(
        update={
            "title": _clamp(job_input.title, MAX_TITLE_LENGTH),
            "company": _clamp(job_input.company, MAX_COMPANY_LENGTH),
            "location": _clamp(job_input.location, MAX_LOCATION_LENGTH),
            "source_url": _clamp(job_input.source_url, MAX_SOURCE_URL_LENGTH) if job_input.source_url else None,
            "source": _clamp(job_input.source, MAX_SOURCE_LENGTH),
        }
    )


def _clamp(value: str, limit: int) -> str:
    return value.strip()[:limit]


def _find_existing_job(db: Session, job_input: JobCreate) -> Job | None:
    if job_input.source_url:
        return db.scalar(select(Job).where(Job.source_url == job_input.source_url))
    return db.scalar(select(Job).where(Job.title == job_input.title, Job.company == job_input.company))


def _score_for_job(profile: Profile, job: JobCreate):
    job_input = JobInput(title=job.title, company=job.company, location=job.location, description=job.description)
    if not has_resume(profile):
        required_signals, preferred_signals = job_signals(job_input)
        return zero_resume_score(required_signals, preferred_signals)

    return score_job(
        profile_input(profile),
        job_input,
    )


def _rescore_all_jobs(db: Session, profile: Profile) -> None:
    jobs = db.scalars(select(Job)).all()
    for job in jobs:
        job_input = JobCreate(
            title=job.title,
            company=job.company,
            location=job.location,
            description=job.description,
            source_url=job.source_url,
            source=job.source,
        )
        score = _score_for_job(profile, job_input)
        if job.score is None:
            job.score = FitScore(job_id=job.id, **score.__dict__)
        else:
            job.score.score = score.score
            job.score.matched_skills = score.matched_skills
            job.score.missing_skills = score.missing_skills
            job.score.required_signals = score.required_signals
            job.score.preferred_signals = score.preferred_signals
            job.score.role_matches = score.role_matches
            job.score.penalties = score.penalties
            job.score.summary = score.summary
    db.flush()


def _serialize_profile(profile: Profile) -> ProfileRead:
    return ProfileRead(
        id=profile.id,
        name=profile.name,
        target_roles=profile.target_roles or [],
        skills=profile.skills or [],
        locations=profile.locations or [],
        dealbreakers=profile.dealbreakers or [],
        resume_characteristics=profile.resume_characteristics or [],
        user_characteristics=profile.user_characteristics or [],
        characteristics=_combined_characteristics(profile),
        seniority=profile.seniority or "entry",
        resume_filename=profile.resume_filename,
        resume_uploaded_at=profile.resume_uploaded_at,
        has_resume=has_resume(profile),
    )


def _backfill_resume_characteristics(profile: Profile) -> None:
    if has_resume(profile) and profile.resume_text and not (profile.resume_characteristics or []):
        profile.resume_characteristics = extract_characteristics(profile.resume_text)


def _serialize_job(job: Job, profile: Profile) -> JobRead:
    if job.score is None:
        score = _score_for_job(
            profile,
            JobCreate(
                title=job.title,
                company=job.company,
                location=job.location,
                description=job.description,
                source_url=job.source_url,
                source=job.source,
            )
        )
        fit = score.__dict__
    else:
        fit = {
            "score": job.score.score,
            "matched_skills": job.score.matched_skills,
            "missing_skills": job.score.missing_skills,
            "required_signals": job.score.required_signals,
            "preferred_signals": job.score.preferred_signals,
            "role_matches": job.score.role_matches,
            "penalties": job.score.penalties,
            "summary": job.score.summary,
        }
    return JobRead(
        id=job.id,
        title=job.title,
        company=job.company,
        location=job.location,
        description=job.description,
        source_url=job.source_url,
        source=job.source,
        status=job.status,
        fit=fit,
    )


def _ensure_schema(db: Session) -> None:
    Base.metadata.create_all(bind=db.get_bind())
    _ensure_profile_resume_columns(db)
    _ensure_fit_score_signal_columns(db)


def _ensure_profile_resume_columns(db: Session) -> None:
    inspector = inspect(db.get_bind())
    if "profiles" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("profiles")}
    missing_columns = {
        "resume_filename": "VARCHAR(255)",
        "resume_path": "VARCHAR(1000)",
        "resume_text": "TEXT",
        "resume_uploaded_at": "DATETIME",
        "resume_characteristics": "JSON",
        "user_characteristics": "JSON",
    }
    for name, column_type in missing_columns.items():
        if name not in columns:
            db.execute(text(f"ALTER TABLE profiles ADD COLUMN {name} {column_type}"))


def _ensure_fit_score_signal_columns(db: Session) -> None:
    inspector = inspect(db.get_bind())
    if "fit_scores" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("fit_scores")}
    missing_columns = {
        "required_signals": "JSON",
        "preferred_signals": "JSON",
    }
    for name, column_type in missing_columns.items():
        if name not in columns:
            db.execute(text(f"ALTER TABLE fit_scores ADD COLUMN {name} {column_type}"))


def _combined_characteristics(profile: Profile) -> list[str]:
    return _dedupe_terms([*(profile.resume_characteristics or []), *(profile.user_characteristics or [])])


def _dedupe_terms(terms: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for term in terms:
        cleaned = term.strip()
        key = cleaned.lower()
        if cleaned and key not in seen:
            deduped.append(cleaned)
            seen.add(key)
    return deduped
