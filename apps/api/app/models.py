from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ApplicationStatus(str, Enum):
    captured = "captured"
    saved = "saved"
    applied = "applied"
    interviewing = "interviewing"
    rejected = "rejected"


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="My Profile")
    target_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    skills: Mapped[list[str]] = mapped_column(JSON, default=list)
    locations: Mapped[list[str]] = mapped_column(JSON, default=list)
    dealbreakers: Mapped[list[str]] = mapped_column(JSON, default=list)
    seniority: Mapped[str] = mapped_column(String(50), default="entry")
    resume_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resume_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    resume_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    resume_uploaded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    company: Mapped[str] = mapped_column(String(255), index=True)
    location: Mapped[str] = mapped_column(String(255), default="")
    description: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source: Mapped[str] = mapped_column(String(80), default="manual")
    status: Mapped[ApplicationStatus] = mapped_column(String(50), default=ApplicationStatus.captured)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    score: Mapped["FitScore"] = relationship(back_populates="job", uselist=False, cascade="all, delete-orphan")


class FitScore(Base):
    __tablename__ = "fit_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), unique=True)
    score: Mapped[int] = mapped_column(Integer)
    matched_skills: Mapped[list[str]] = mapped_column(JSON, default=list)
    missing_skills: Mapped[list[str]] = mapped_column(JSON, default=list)
    role_matches: Mapped[list[str]] = mapped_column(JSON, default=list)
    penalties: Mapped[list[str]] = mapped_column(JSON, default=list)
    summary: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    job: Mapped[Job] = relationship(back_populates="score")
