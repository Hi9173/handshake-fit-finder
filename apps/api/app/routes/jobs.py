from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import Base, get_db
from app.models import FitScore, Job
from app.profile_data import DEFAULT_PROFILE
from app.schemas import JobCaptureBatch, JobCreate, JobRead, ProfileRead
from app.services.scoring import JobInput, ProfileInput, score_job

router = APIRouter(prefix="/api", tags=["jobs"])


@router.get("/profile", response_model=ProfileRead)
def get_profile() -> ProfileRead:
    return DEFAULT_PROFILE


@router.get("/jobs", response_model=list[JobRead])
def list_jobs(db: Session = Depends(get_db)) -> list[JobRead]:
    _ensure_schema(db)
    stored_jobs = db.scalars(select(Job).order_by(Job.created_at.desc())).all()
    serialized = [_serialize_job(job) for job in stored_jobs if job.score is not None]
    return sorted(serialized, key=lambda item: item.fit.score, reverse=True)


@router.post("/jobs/score", response_model=JobRead)
def score_new_job(job: JobCreate) -> JobRead:
    profile = ProfileInput(
        target_roles=DEFAULT_PROFILE.target_roles,
        skills=DEFAULT_PROFILE.skills,
        locations=DEFAULT_PROFILE.locations,
        dealbreakers=DEFAULT_PROFILE.dealbreakers,
        seniority=DEFAULT_PROFILE.seniority,
    )
    result = score_job(
        profile,
        JobInput(title=job.title, company=job.company, location=job.location, description=job.description),
    )
    return JobRead(id=999, **job.model_dump(), fit=result.__dict__)


@router.post("/extension/capture", response_model=list[JobRead])
def capture_visible_jobs(batch: JobCaptureBatch, db: Session = Depends(get_db)) -> list[JobRead]:
    _ensure_schema(db)
    captured = [_upsert_job(db, job) for job in batch.jobs]
    db.commit()
    return sorted((_serialize_job(job) for job in captured), key=lambda item: item.fit.score, reverse=True)


def _upsert_job(db: Session, job_input: JobCreate) -> Job:
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
    score = _score_for_job(job_input)
    if existing_job.score is None:
        existing_job.score = FitScore(job_id=existing_job.id, **score.__dict__)
    else:
        existing_job.score.score = score.score
        existing_job.score.matched_skills = score.matched_skills
        existing_job.score.missing_skills = score.missing_skills
        existing_job.score.role_matches = score.role_matches
        existing_job.score.penalties = score.penalties
        existing_job.score.summary = score.summary

    db.flush()
    return existing_job


def _find_existing_job(db: Session, job_input: JobCreate) -> Job | None:
    if job_input.source_url:
        return db.scalar(select(Job).where(Job.source_url == job_input.source_url))
    return db.scalar(select(Job).where(Job.title == job_input.title, Job.company == job_input.company))


def _score_for_job(job: JobCreate):
    return score_job(
        _default_profile_input(),
        JobInput(title=job.title, company=job.company, location=job.location, description=job.description),
    )


def _default_profile_input() -> ProfileInput:
    return ProfileInput(
        target_roles=DEFAULT_PROFILE.target_roles,
        skills=DEFAULT_PROFILE.skills,
        locations=DEFAULT_PROFILE.locations,
        dealbreakers=DEFAULT_PROFILE.dealbreakers,
        seniority=DEFAULT_PROFILE.seniority,
    )


def _serialize_job(job: Job) -> JobRead:
    if job.score is None:
        score = _score_for_job(
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
