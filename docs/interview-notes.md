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
