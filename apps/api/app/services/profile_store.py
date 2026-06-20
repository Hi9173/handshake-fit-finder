from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Profile
from app.profile_data import DEFAULT_PROFILE
from app.services.scoring import ProfileInput, ScoreResult

UPLOAD_RESUME_SUMMARY = "Upload a resume to calculate fit for this job."


def get_or_create_profile(db: Session) -> Profile:
    profile = db.scalar(select(Profile).where(Profile.id == 1))
    if profile is not None:
        return profile

    profile = Profile(
        id=1,
        name=DEFAULT_PROFILE.name,
        target_roles=DEFAULT_PROFILE.target_roles,
        skills=DEFAULT_PROFILE.skills,
        locations=DEFAULT_PROFILE.locations,
        dealbreakers=DEFAULT_PROFILE.dealbreakers,
        seniority=DEFAULT_PROFILE.seniority,
    )
    db.add(profile)
    db.flush()
    return profile


def has_resume(profile: Profile) -> bool:
    return bool(getattr(profile, "resume_path", None))


def profile_input(profile: Profile) -> ProfileInput:
    return ProfileInput(
        target_roles=profile.target_roles or [],
        skills=profile.skills or [],
        locations=profile.locations or [],
        dealbreakers=profile.dealbreakers or [],
        seniority=profile.seniority or "entry",
    )


def zero_resume_score() -> ScoreResult:
    return ScoreResult(
        score=0,
        matched_skills=[],
        missing_skills=[],
        role_matches=[],
        penalties=[],
        summary=UPLOAD_RESUME_SUMMARY,
    )
