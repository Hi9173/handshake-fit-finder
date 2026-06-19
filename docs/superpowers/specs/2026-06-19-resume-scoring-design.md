# Resume Scoring Design

## Goal

Add a local resume upload flow so the dashboard can score captured Handshake jobs against the user's saved resume profile. Until a resume exists, every captured job should show `0%` fit and a clear reminder that resume upload is required.

## Current Context

The local app already has three working pieces:

- A Chrome extension that captures visible Handshake jobs and posts them to the local API.
- A FastAPI backend that stores captured jobs in MySQL and returns fit scores.
- A Vite dashboard that reads `/api/profile` and `/api/jobs`.

Right now scoring always uses a hard-coded default profile. That makes the dashboard useful as a mock demo, but not yet user-specific.

## Chosen Approach

We will use a structured profile plus stored resume file.

- The uploaded resume file stays on the local machine.
- The backend extracts text from the file and derives structured profile fields from it.
- The structured profile becomes the source of truth for scoring.
- The dashboard shows the extracted profile and lets the user edit it before or after rescoring.

This keeps the system software-engineering-heavy instead of turning every score request into a document parsing problem. It also gives the user an inspectable profile they can talk about in interviews.

## Why This Approach

### Option 1: Structured profile plus stored resume file (chosen)

Pros:

- Keeps scoring deterministic and cheap after upload.
- Makes rescoring all jobs simple when the resume changes.
- Gives the dashboard editable fields that are easy to understand.
- Fits the local-first architecture well.

Cons:

- Requires a profile extraction step.
- Needs a little more persistence than raw text-only scoring.

### Option 2: Raw resume text as the scoring source

Pros:

- Fewer stored fields.
- Fastest path for a prototype.

Cons:

- Harder to explain and debug why a job scored the way it did.
- Harder to let the user correct extraction mistakes.
- More brittle over time.

### Option 3: Per-job resume parsing at scoring time

Pros:

- Minimal stored state.

Cons:

- Wasteful repeated work.
- Slowest scoring path.
- Worst fit for "recalculate all jobs when resume updates."

## Backend Data Model

We will keep a single active local profile row and extend it with resume state instead of creating a multi-user system.

### Profile fields

Existing fields stay:

- `name`
- `target_roles`
- `skills`
- `locations`
- `dealbreakers`
- `seniority`

New fields:

- `resume_filename`
- `resume_path`
- `resume_text`
- `resume_uploaded_at`
- `has_resume`

Notes:

- `resume_path` points to a local file under an app-owned uploads directory.
- `resume_text` stores extracted plain text for debugging and repeatable rescoring behavior.
- `has_resume` is the simple gate for score behavior and dashboard state.

## File Storage

Resume files will be stored locally under a dedicated uploads folder owned by the API, for example:

`apps/api/storage/resume/active/`

Rules:

- Only one active resume is kept.
- Uploading a new resume replaces the previously active file reference.
- We do not build version history yet.
- We do not sync files anywhere remote.

This is the laziest durable setup that still supports rescoring and future debugging.

## Supported Resume Formats

The first version supports:

- `.md`
- `.tex`
- `.pdf`

Parsing rules:

- `.md` and `.tex` are read as local text files.
- `.pdf` is converted to text locally before profile extraction.
- Unsupported types return a validation error from the upload endpoint.

## Profile Extraction

Upload processing happens in two stages:

1. Extract plain text from the file.
2. Convert that text into structured fields for scoring.

First version extraction should stay simple and deterministic:

- `skills`: match against a maintained skill vocabulary already used by the scorer, expanded with obvious resume terms.
- `target_roles`: infer from resume title lines and role keywords.
- `locations`: infer only when clearly present; otherwise keep the current default or an empty list.
- `seniority`: default to `entry` unless the resume strongly indicates otherwise.
- `dealbreakers`: do not infer from the resume; keep them user-editable only.

The user can then edit the extracted profile in the dashboard and save changes.

## Scoring Rules

### Before resume upload

Any captured job should return:

- `score = 0`
- empty `matched_skills`
- empty `missing_skills`
- empty `role_matches`
- empty `penalties`
- summary reminding the user to upload a resume

This makes the product state honest instead of pretending to know fit.

### After resume upload

New jobs captured by the extension are scored immediately against the saved structured profile.

### After resume replacement or profile edit

All stored jobs are rescored against the latest saved profile.

This keeps one consistent scoring model across the whole dashboard.

## API Design

### `GET /api/profile`

Returns the current profile including resume metadata and `has_resume`.

### `POST /api/profile/resume`

Multipart upload endpoint that:

- validates file type
- saves the file locally
- extracts text
- derives structured profile fields
- persists the updated profile
- rescoring all stored jobs
- returns the updated profile

### `PUT /api/profile`

Accepts manual profile edits from the dashboard and rescoring all stored jobs after save.

### `GET /api/jobs`

Returns stored jobs sorted by score descending. If there is no resume, the jobs still return with `0%` scores and the upload reminder summary.

### Existing `POST /api/extension/capture`

Stays the extension entry point.

Behavior change:

- if `has_resume` is false, upsert jobs and assign `0%` fit payloads
- if `has_resume` is true, score against the stored structured profile

## Dashboard Design

The left sidebar gains a resume panel above or near the profile controls.

### State 1: No resume uploaded

Show:

- upload control
- supported file types
- reminder that fit scores stay `0%` until a resume is uploaded

Job cards should still render normally, but their summaries explain that resume upload is required.

### State 2: Resume uploaded

Show:

- filename
- upload timestamp
- replace resume action
- editable extracted profile fields

The editable profile keeps the app interview-friendly because the user can explain how extracted data becomes scoring input.

### State 3: Processing

Show:

- uploading or rescoring status
- disabled actions while the current request is in flight

We do not need fancy progress bars for the first version.

## Error Handling

We should handle these cases explicitly:

- upload file type not supported
- PDF text extraction fails
- empty extracted text
- malformed multipart upload
- database save or rescore failure

User-facing behavior:

- keep the previous valid profile if a new upload fails
- show a clear error message in the dashboard
- do not delete stored jobs on upload failure

## Testing Strategy

Backend:

- upload endpoint accepts `.md` and updates profile state
- capture endpoint returns `0%` when no resume exists
- capture endpoint returns non-zero scored jobs when a resume exists
- profile update triggers rescore for stored jobs
- replacing the resume rescoring all existing jobs

Frontend:

- empty resume state renders reminder
- successful upload refreshes profile and jobs
- profile save triggers rescoring refresh

For PDF support, the first pass can keep tests narrow by unit-testing the text extraction wrapper separately and using `.md` for the main end-to-end backend flow.

## Out Of Scope For This Slice

- matching against a stored master resume plus generated variants
- multiple profiles or multiple resumes
- remote file storage
- LLM-based resume understanding
- cover letter generation
- application autofill

## Implementation Notes

Keep it small:

- extend the current `Profile` model instead of adding a user system
- add one resume upload endpoint instead of a generic documents service
- store only one active resume file
- reuse the existing scoring service with the smallest possible profile-input changes

That gives us a solid local app milestone without wandering into platform work.
