# Architecture Checkpoint

This project is a local-first Handshake job triage tool. It uses a Chrome extension for browser-assisted capture, a FastAPI backend for local persistence and scoring, and a React dashboard for review workflow.

## Current Scope

- Capture jobs from the user's active Handshake browser session.
- Store captured jobs, fit scores, required signals, preferred signals, and application status locally.
- Upload one local resume and extract editable profile signals.
- Compare job signals against profile signals in the dashboard.
- Move jobs through four local review categories: `Under Review`, `Applied`, `Saved`, and `Skipped`.

Out of scope for this checkpoint:

- Applying to jobs automatically.
- Generating tailored resumes or cover letters.
- Syncing data to a remote service.
- Crawling Handshake outside the user's visible authenticated session.

## Components

### Chrome Extension

Location: `apps/extension`

The extension injects a Fit Finder widget into Handshake pages. When the user clicks `Capture visible jobs`, it:

1. Finds visible Handshake result cards.
2. Iterates through result links that keep the user on the search page.
3. Opens each result detail pane, expands `More` when present, and captures full visible description text.
4. Restores the initially selected job when scanning completes.
5. Sends the captured jobs to the local API through the background worker.

The extension intentionally avoids hidden APIs, access-control bypasses, and site-wide crawling.

### FastAPI Backend

Location: `apps/api`

The backend owns local persistence and scoring. Main endpoints:

- `GET /api/profile`: returns resume metadata and profile signals.
- `POST /api/profile/resume`: stores a local resume, extracts text, updates resume-derived profile signals, and rescores jobs.
- `PUT /api/profile`: updates user-managed profile signals and rescores jobs.
- `GET /api/jobs`: returns captured jobs with score payloads and status.
- `DELETE /api/jobs`: clears captured jobs for testing.
- `PATCH /api/jobs/{job_id}/status`: moves a job between local workflow categories.
- `POST /api/extension/capture`: upserts captured jobs and scores them against the current profile.

Persistence is MySQL for local development, with the project-owned database expected on host port `3307` to avoid conflicts with any system MySQL on `3306`.

### React Dashboard

Location: `apps/web`

The dashboard shows:

- Resume upload and replacement.
- `Profile Signals`, split internally by source: resume-derived versus user-added.
- Four clickable category tiles: `Under Review`, `Applied`, `Saved`, `Skipped`.
- Job cards filtered by the active category.
- Per-job action buttons for moving a job to another category.
- Required and preferred job signals, with matched profile signals shown first.

Signal chips use:

- light green for signals matched by the user's profile signals
- light red for unmatched signals

## Data Model

### Profile

The profile stores:

- structured scoring fields: target roles, skills, locations, dealbreakers, seniority
- resume metadata: filename, path, extracted text, uploaded timestamp
- `resume_characteristics`: signals extracted from the current resume
- `user_characteristics`: signals manually added by the user

The API returns a combined `characteristics` list for simple dashboard rendering. Replacing the resume only changes `resume_characteristics`; user-added signals remain intact.

### Job

Each job stores:

- title, company, location, description, source URL, source
- `status`: one of `captured`, `saved`, `applied`, `interviewing`, `rejected`
- a related fit score payload

Dashboard categories are derived from status:

- `captured` -> `Under Review`
- `saved` -> `Saved`
- `applied` or `interviewing` -> `Applied`
- `rejected` -> `Skipped`

### Fit Score

Each fit score stores:

- numeric score
- matched skills
- missing skills
- required signals
- preferred signals
- role matches
- penalties
- summary

The UI currently emphasizes required and preferred signals. The numeric score still exists in the backend, but the job card no longer displays a top-right score badge.

## Core Flows

### Capture Flow

1. User searches on Handshake.
2. User clicks `Capture visible jobs`.
3. Extension captures visible cards plus expanded detail text.
4. Backend upserts jobs by source URL when available.
5. Backend extracts job signals and scores each job.
6. Dashboard refreshes from `GET /api/jobs`.

### Resume Flow

1. User uploads `.pdf`, `.tex`, or `.md`.
2. Backend extracts text locally.
3. Backend derives structured profile fields and resume signals.
4. Backend stores the valid file only after parsing succeeds.
5. Existing jobs are rescored.

Before a resume is uploaded, captured jobs still persist and show job signals, but the fit score is `0` with an upload reminder.

### Category Workflow

The dashboard treats the four category tiles as tabs. Only jobs in the active category render in the job list.

Each job card shows action buttons for the other categories only. For example:

- an `Under Review` job can be moved to `Apply`, `Save`, or `Skip`
- a `Saved` job can be moved to `Review`, `Apply`, or `Skip`

The move calls `PATCH /api/jobs/{job_id}/status`, updates local React state from the returned job, and immediately changes the category counts.

## Signal Matching

Job signals are extracted deterministically from the job description:

- required signals from sections such as `Minimum Requirements`
- preferred signals from sections such as `Skills We're Looking For`
- fallback technical skill signals when a full detail description lacks clean headings

The dashboard compares each job signal against the user's combined profile signals using normalized exact matching:

- trim whitespace
- collapse repeated spaces
- compare case-insensitively

Matched signals are rendered before unmatched signals inside each signal group.

## Design Constraints

- Keep the tool private and local-first.
- Keep browser capture user-initiated and visible.
- Prefer deterministic extraction over LLM parsing for this stage.
- Keep profile and job-signal provenance inspectable for interview discussion.
- Avoid premature product features such as auto-apply, public accounts, or cloud sync.
