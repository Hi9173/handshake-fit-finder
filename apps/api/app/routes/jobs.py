from fastapi import APIRouter

from app.sample_data import DEFAULT_PROFILE, ranked_sample_jobs
from app.schemas import JobCreate, JobRead, ProfileRead
from app.services.scoring import JobInput, ProfileInput, score_job

router = APIRouter(prefix="/api", tags=["jobs"])


@router.get("/profile", response_model=ProfileRead)
def get_profile() -> ProfileRead:
    return DEFAULT_PROFILE


@router.get("/jobs", response_model=list[JobRead])
def list_jobs() -> list[JobRead]:
    return ranked_sample_jobs()


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
