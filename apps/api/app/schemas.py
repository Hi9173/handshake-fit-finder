from enum import Enum

from pydantic import BaseModel, Field


class ApplicationStatus(str, Enum):
    captured = "captured"
    saved = "saved"
    applied = "applied"
    interviewing = "interviewing"
    rejected = "rejected"


class ProfileRead(BaseModel):
    id: int = 1
    name: str = "Local Profile"
    target_roles: list[str] = Field(default_factory=lambda: ["data analyst", "software engineer"])
    skills: list[str] = Field(default_factory=lambda: ["python", "sql", "react", "typescript", "excel"])
    locations: list[str] = Field(default_factory=lambda: ["remote", "san francisco", "new york"])
    dealbreakers: list[str] = Field(default_factory=lambda: ["unpaid", "onsite only"])
    seniority: str = "entry"


class JobCreate(BaseModel):
    title: str
    company: str
    location: str = ""
    description: str
    source_url: str | None = None
    source: str = "manual"


class JobCaptureBatch(BaseModel):
    jobs: list[JobCreate]


class FitScoreRead(BaseModel):
    score: int
    matched_skills: list[str]
    missing_skills: list[str]
    role_matches: list[str]
    penalties: list[str]
    summary: str


class JobRead(JobCreate):
    id: int
    status: ApplicationStatus = ApplicationStatus.captured
    fit: FitScoreRead
