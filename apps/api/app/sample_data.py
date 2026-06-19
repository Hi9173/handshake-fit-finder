from app.schemas import JobCreate, JobRead, ProfileRead
from app.services.scoring import JobInput, ProfileInput, score_job


DEFAULT_PROFILE = ProfileRead()

SAMPLE_JOBS = [
    JobCreate(
        title="Entry Level Data Analyst",
        company="Bright Metrics",
        location="New York, NY",
        description="Use SQL, Python, Excel, and Tableau to analyze customer data and create dashboards.",
        source_url="https://app.joinhandshake.com/stu/jobs/sample-1",
        source="sample",
    ),
    JobCreate(
        title="Junior Software Engineer",
        company="Launchpad Labs",
        location="Remote",
        description="Build internal tools with React, TypeScript, Python APIs, SQL, Docker, and AWS.",
        source_url="https://app.joinhandshake.com/stu/jobs/sample-2",
        source="sample",
    ),
    JobCreate(
        title="Senior Business Intelligence Engineer",
        company="Scale Systems",
        location="Boston, MA",
        description="Senior onsite only role requiring 5+ years of SQL, Tableau, Python, and data modeling.",
        source_url="https://app.joinhandshake.com/stu/jobs/sample-3",
        source="sample",
    ),
]


def ranked_sample_jobs() -> list[JobRead]:
    profile = ProfileInput(
        target_roles=DEFAULT_PROFILE.target_roles,
        skills=DEFAULT_PROFILE.skills,
        locations=DEFAULT_PROFILE.locations,
        dealbreakers=DEFAULT_PROFILE.dealbreakers,
        seniority=DEFAULT_PROFILE.seniority,
    )
    jobs = []
    for index, job in enumerate(SAMPLE_JOBS, start=1):
        score = score_job(
            profile,
            JobInput(title=job.title, company=job.company, location=job.location, description=job.description),
        )
        jobs.append(JobRead(id=index, **job.model_dump(), fit=score.__dict__))
    return sorted(jobs, key=lambda item: item.fit.score, reverse=True)
