# Interview Notes

## Resume Scoring Architecture

Decision: use a structured profile plus a locally stored resume file.

Why it matters:

- The resume file stays private on the user's machine.
- Upload happens once, then the backend extracts text and saves structured fields such as skills, target roles, locations, and seniority.
- Job scoring uses the structured profile instead of reparsing the resume for every job.
- Before a resume is uploaded, every job gets `0%` fit with a clear upload reminder.
- When a new job is captured, it is scored against the current saved profile.
- When the resume or profile is updated, all stored jobs are rescored.

Good interview framing:

- This separates document ingestion from scoring, which makes the system easier to test and debug.
- It keeps the MVP local-first and privacy-friendly.
- It gives users an editable extracted profile, so they can correct imperfect parsing without needing an LLM.
- It avoids premature complexity such as multiple resumes, remote storage, and per-job resume parsing.

Tradeoff:

- The first parser is deterministic and simple, so it may miss skills or roles not in the vocabulary. That is acceptable for the MVP because the extracted profile is editable.

## Local MySQL Credential Debugging

Problem:

- The API default expected `handshake:handshake@localhost:3306`.
- A standalone `/usr/local/mysql` server was already running on `3306`.
- That server was not the project's Docker Compose database and rejected both the project app user and compose root credentials.

Root cause:

- The local machine had a pre-existing MySQL Community Server install with unknown credentials.
- The project config was correct for the intended database, but the intended database was not the server actually answering on `3306`.

Solution:

- Keep the system MySQL untouched to avoid destructive credential resets.
- Use the repo's Docker Compose MySQL service as the project-owned database.
- Map the Docker container to host port `3307` so it does not conflict with the standalone MySQL server on `3306`.
- Point the API default database URL at `127.0.0.1:3307`.
- Keep credentials deterministic for local development: `handshake` / `handshake`.

Good interview framing:

- This is a clean example of debugging environment drift across app config, database service, and local machine state.
- The fix avoided resetting a global database service and instead isolated the project database in Docker.
- The project still uses MySQL, but local development is now reproducible even when another MySQL server owns port `3306`.

## Capture 500 From Handshake Filter Text

Problem:

- The extension reached the local API, but the API returned `500 Internal Server Error`.
- The backend traceback showed MySQL error `Data too long for column 'company'`.
- The captured payload included a fake job titled `Job search filters`; Handshake's search/filter UI text had been interpreted as a job card.

Root cause:

- The extractor intentionally used broad DOM selectors so it could work with Handshake's changing markup.
- That flexibility also allowed non-job UI with job-related words, such as filters and suggested searches, to pass the "looks like a job" heuristic.
- The backend trusted extension input and wrote strings directly into `VARCHAR` columns, so one bad capture could fail the whole batch.

Solution:

- Tighten the extension heuristic so search/filter panels are ignored and suspiciously long title/company values are rejected before capture.
- Add backend input clamping for persisted fields such as title, company, location, source URL, and source.
- Bump the extension version to make reload verification obvious in Chrome.

Good interview framing:

- This bug is a useful example of defense in depth: browser extraction should be accurate, but the backend still has to protect its persistence boundary.
- The fix kept the scraper lightweight and compliant while making the local API resilient to messy page text.
- The debugging path followed the real data flow: extension payload -> API route -> ORM flush -> MySQL column constraint.

## Resume Upload Checkpoint Scan

Problem:

- The app advertised `.pdf`, `.tex`, and `.md` resume uploads, but PDF parsing depended on `pypdf`, which was not listed in API requirements.
- Resume files were written to local storage before text extraction completed.

Root cause:

- The parser handled missing `pypdf` at runtime, but the dependency was never promoted into install requirements.
- The write order optimized for simplicity, but it meant a failed upload with the same filename could overwrite the current local resume file.

Solution:

- Pin `pypdf` in `apps/api/requirements.txt` so PDF upload support installs with the backend.
- Extract text first, then write the file only after parsing succeeds.
- Add a regression test proving failed resume uploads do not overwrite the existing stored file.

Good interview framing:

- This is a checkpoint-quality bug because it connects user trust, local privacy, and failure handling.
- The fix is intentionally small: no file versioning system yet, just preserving the current file unless the replacement is valid.
