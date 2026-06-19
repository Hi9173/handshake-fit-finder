# Resume Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local resume upload, structured profile extraction, and resume-gated job scoring.

**Architecture:** Store one active local profile in MySQL, including resume metadata and extracted profile fields. Resume upload saves the file locally, extracts text, updates the profile, and rescoring all stored jobs. The dashboard shows a resume panel and uses the same `/api/profile` and `/api/jobs` refresh flow.

**Tech Stack:** FastAPI, SQLAlchemy, MySQL/SQLite tests, Pydantic, React, Vite, browser-native file input.

---

## File Map

- Modify `apps/api/app/models.py`: add resume fields to `Profile`.
- Modify `apps/api/app/schemas.py`: add profile update/read fields and resume metadata.
- Create `apps/api/app/services/profile_store.py`: get or create the single local profile, convert it into scoring input.
- Create `apps/api/app/services/resume_parser.py`: validate file extensions, save the local file, extract text, derive structured fields.
- Modify `apps/api/app/routes/jobs.py`: persist profile, add upload/update endpoints, gate scoring at `0%` before resume upload, rescore jobs after profile changes.
- Modify `apps/api/tests/test_api.py`: cover no-resume scoring, resume upload, and rescore behavior.
- Modify `apps/web/src/App.tsx`: add resume upload panel, editable profile fields, save/refresh behavior.
- Modify `apps/web/src/styles.css`: style upload/edit controls using existing dashboard language.
- Modify `docs/superpowers/specs/2026-06-19-resume-scoring-design.md`: add a short implementation note if a decision changes during coding.

## Task 1: Backend No-Resume Score Gate

**Files:**
- Modify: `apps/api/tests/test_api.py`
- Modify: `apps/api/app/routes/jobs.py`
- Create: `apps/api/app/services/profile_store.py`

- [ ] **Step 1: Write the failing test**

Add this test to `ApiTests` in `apps/api/tests/test_api.py`:

```python
def test_capture_scores_zero_before_resume_upload(self):
    response = self.client.post(
        "/api/extension/capture",
        json={
            "jobs": [
                {
                    "title": "Entry Level Data Analyst",
                    "company": "Bright Metrics",
                    "location": "New York, NY",
                    "description": "Analyze customer data with SQL, Python, Excel, and Tableau.",
                    "source_url": "https://app.joinhandshake.com/stu/jobs/123",
                    "source": "handshake-extension",
                }
            ]
        },
    )

    self.assertEqual(response.status_code, 200)
    job = response.json()[0]
    self.assertEqual(job["fit"]["score"], 0)
    self.assertEqual(job["fit"]["matched_skills"], [])
    self.assertEqual(job["fit"]["missing_skills"], [])
    self.assertIn("Upload a resume", job["fit"]["summary"])
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
PYTHONPATH=. .venv/bin/python -m unittest tests.test_api.ApiTests.test_capture_scores_zero_before_resume_upload
```

Expected: FAIL because the current default profile produces a non-zero score.

- [ ] **Step 3: Implement minimal profile store and zero score**

Create `apps/api/app/services/profile_store.py`:

```python
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
```

Update `apps/api/app/routes/jobs.py` so `_score_for_job` accepts a `Profile` and returns `zero_resume_score()` when `has_resume(profile)` is false.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd apps/api
PYTHONPATH=. .venv/bin/python -m unittest tests.test_api.ApiTests.test_capture_scores_zero_before_resume_upload
```

Expected: PASS.

- [ ] **Step 5: Run existing API tests and adjust expectations**

Run:

```bash
cd apps/api
PYTHONPATH=. .venv/bin/python -m unittest tests.test_api
```

Expected: existing score tests that assumed default non-zero scoring now fail. Update those tests to upload a resume before asserting ranked scores.

## Task 2: Resume Persistence And Extraction

**Files:**
- Modify: `apps/api/app/models.py`
- Modify: `apps/api/app/schemas.py`
- Create: `apps/api/app/services/resume_parser.py`
- Modify: `apps/api/app/routes/jobs.py`
- Modify: `apps/api/tests/test_api.py`

- [ ] **Step 1: Write the failing upload test**

Add this test to `ApiTests`:

```python
def test_resume_upload_extracts_profile_and_rescores_jobs(self):
    self.client.post(
        "/api/extension/capture",
        json={
            "jobs": [
                {
                    "title": "Entry Level Data Analyst",
                    "company": "Bright Metrics",
                    "location": "Remote",
                    "description": "Use SQL, Python, Excel, and Tableau to analyze customer data.",
                    "source_url": "https://app.joinhandshake.com/stu/jobs/123",
                    "source": "handshake-extension",
                }
            ]
        },
    )

    response = self.client.post(
        "/api/profile/resume",
        files={"file": ("resume.md", b"# Data Analyst\nPython SQL Excel Tableau\n", "text/markdown")},
    )

    self.assertEqual(response.status_code, 200)
    profile = response.json()
    self.assertTrue(profile["has_resume"])
    self.assertEqual(profile["resume_filename"], "resume.md")
    self.assertIn("python", profile["skills"])

    jobs = self.client.get("/api/jobs").json()
    self.assertGreater(jobs[0]["fit"]["score"], 0)
    self.assertIn("python", jobs[0]["fit"]["matched_skills"])
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
PYTHONPATH=. .venv/bin/python -m unittest tests.test_api.ApiTests.test_resume_upload_extracts_profile_and_rescores_jobs
```

Expected: FAIL with 404 for `/api/profile/resume`.

- [ ] **Step 3: Add model and schema fields**

Add nullable fields to `Profile`:

```python
resume_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
resume_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
resume_text: Mapped[str | None] = mapped_column(Text, nullable=True)
resume_uploaded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

Add to `ProfileRead`:

```python
resume_filename: str | None = None
resume_uploaded_at: datetime | None = None
has_resume: bool = False
```

Create `ProfileUpdate` with editable arrays and `seniority`.

- [ ] **Step 4: Add resume parser**

Create `apps/api/app/services/resume_parser.py` with:

```python
from dataclasses import dataclass
from pathlib import Path
import re

from fastapi import HTTPException, UploadFile

from app.models import utc_now
from app.services.scoring import COMMON_JOB_SKILLS

ALLOWED_EXTENSIONS = {".md", ".tex", ".pdf"}
RESUME_DIR = Path(__file__).resolve().parents[2] / "storage" / "resume" / "active"


@dataclass(frozen=True)
class ParsedResume:
    filename: str
    path: str
    text: str
    target_roles: list[str]
    skills: list[str]
    locations: list[str]
    seniority: str


async def parse_resume_upload(file: UploadFile) -> ParsedResume:
    filename = Path(file.filename or "").name
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Upload a .pdf, .tex, or .md resume.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Resume file is empty.")

    RESUME_DIR.mkdir(parents=True, exist_ok=True)
    path = RESUME_DIR / filename
    path.write_bytes(content)

    text = _extract_text(content, extension).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Could not extract text from resume.")

    return ParsedResume(
        filename=filename,
        path=str(path),
        text=text,
        target_roles=_extract_roles(text),
        skills=_extract_skills(text),
        locations=_extract_locations(text),
        seniority="entry",
    )
```

Use simple helper functions for `_extract_text`, `_extract_skills`, `_extract_roles`, and `_extract_locations`. For `.pdf`, try `pypdf` if installed and raise a 400 if unavailable or unreadable.

- [ ] **Step 5: Add upload endpoint and rescore helper**

In `apps/api/app/routes/jobs.py`, add:

```python
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
    profile.seniority = parsed.seniority
    _rescore_all_jobs(db, profile)
    db.commit()
    db.refresh(profile)
    return _serialize_profile(profile)
```

- [ ] **Step 6: Run upload test to verify it passes**

Run:

```bash
cd apps/api
PYTHONPATH=. .venv/bin/python -m unittest tests.test_api.ApiTests.test_resume_upload_extracts_profile_and_rescores_jobs
```

Expected: PASS.

## Task 3: Manual Profile Edit Rescore

**Files:**
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/routes/jobs.py`
- Modify: `apps/api/tests/test_api.py`

- [ ] **Step 1: Write the failing edit test**

Add this test to `ApiTests`:

```python
def test_profile_update_rescores_existing_jobs(self):
    self.client.post(
        "/api/profile/resume",
        files={"file": ("resume.md", b"# Software Engineer\nReact TypeScript\n", "text/markdown")},
    )
    self.client.post(
        "/api/extension/capture",
        json={
            "jobs": [
                {
                    "title": "Data Analyst",
                    "company": "Bright Metrics",
                    "location": "Remote",
                    "description": "Use SQL and Python for reporting.",
                    "source_url": "https://app.joinhandshake.com/stu/jobs/456",
                    "source": "handshake-extension",
                }
            ]
        },
    )
    before = self.client.get("/api/jobs").json()[0]["fit"]["score"]

    response = self.client.put(
        "/api/profile",
        json={
            "name": "Local Profile",
            "target_roles": ["data analyst"],
            "skills": ["sql", "python"],
            "locations": ["remote"],
            "dealbreakers": [],
            "seniority": "entry",
        },
    )

    self.assertEqual(response.status_code, 200)
    after = self.client.get("/api/jobs").json()[0]["fit"]["score"]
    self.assertGreater(after, before)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
PYTHONPATH=. .venv/bin/python -m unittest tests.test_api.ApiTests.test_profile_update_rescores_existing_jobs
```

Expected: FAIL with 405 or 404 for `PUT /api/profile`.

- [ ] **Step 3: Add update endpoint**

In `apps/api/app/routes/jobs.py`, add:

```python
@router.put("/profile", response_model=ProfileRead)
def update_profile(update: ProfileUpdate, db: Session = Depends(get_db)) -> ProfileRead:
    _ensure_schema(db)
    profile = get_or_create_profile(db)
    profile.name = update.name
    profile.target_roles = update.target_roles
    profile.skills = update.skills
    profile.locations = update.locations
    profile.dealbreakers = update.dealbreakers
    profile.seniority = update.seniority
    _rescore_all_jobs(db, profile)
    db.commit()
    db.refresh(profile)
    return _serialize_profile(profile)
```

- [ ] **Step 4: Run edit test to verify it passes**

Run:

```bash
cd apps/api
PYTHONPATH=. .venv/bin/python -m unittest tests.test_api.ApiTests.test_profile_update_rescores_existing_jobs
```

Expected: PASS.

## Task 4: Dashboard Resume Panel

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add frontend state and API types**

Update `ApiProfile` with:

```ts
seniority: string;
resume_filename: string | null;
resume_uploaded_at: string | null;
has_resume: boolean;
```

Add `profileDraft`, `notice`, and `isSaving` state. Add `refreshDashboardData()`, `uploadResume()`, and `saveProfile()` helper functions inside `App`.

- [ ] **Step 2: Add resume panel markup**

In the sidebar, add a panel before the existing Profile panel:

```tsx
<section className="panel resume-panel">
  <div className="panel-heading">
    <FileText size={18} aria-hidden="true" />
    <h2>Resume</h2>
  </div>
  <p className={profile.hasResume ? "resume-status ready" : "resume-status"}>
    {profile.hasResume ? profile.resumeFilename : "Upload a resume to calculate fit scores."}
  </p>
  <label className="upload-control">
    <Upload size={16} aria-hidden="true" />
    <span>{profile.hasResume ? "Replace resume" : "Upload resume"}</span>
    <input type="file" accept=".pdf,.tex,.md" onChange={uploadResume} />
  </label>
  {notice ? <p className="form-notice">{notice}</p> : null}
</section>
```

- [ ] **Step 3: Add editable profile form**

Replace static profile display with controlled text inputs for comma-separated target roles, skills, locations, dealbreakers, plus a seniority input. The save button calls `saveProfile`.

- [ ] **Step 4: Style controls**

Add CSS for `.resume-panel`, `.resume-status`, `.upload-control`, `.profile-form`, `.text-field`, and `.form-notice`. Keep radius at 8px or less and use the existing muted palette.

- [ ] **Step 5: Build frontend**

Run:

```bash
pnpm --dir apps/web build
```

Expected: PASS.

## Task 5: Full Verification And Local Notes

**Files:**
- Modify: `docs/superpowers/specs/2026-06-19-resume-scoring-design.md` only if implementation decisions changed.

- [ ] **Step 1: Run backend tests**

Run:

```bash
cd apps/api
PYTHONPATH=. .venv/bin/python -m unittest tests.test_api tests.test_scoring
```

Expected: PASS.

- [ ] **Step 2: Run extension tests**

Run:

```bash
node --test apps/extension/tests/*.test.cjs scripts/tests/*.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```bash
pnpm --dir apps/web build
```

Expected: PASS.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add apps/api apps/web docs/superpowers/specs/2026-06-19-resume-scoring-design.md
git commit -m "feat: score jobs from local resume profile"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: no-resume `0%`, resume upload, stored local file, structured profile, new-job scoring, resume/profile rescore, dashboard reminder, and editable profile are covered.
- Placeholder scan: every task has concrete files, commands, and expected behavior.
- Type consistency: backend uses `ProfileRead`, `ProfileUpdate`, `ScoreResult`, `ProfileInput`; frontend maps API snake_case fields into dashboard camelCase fields.
