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
