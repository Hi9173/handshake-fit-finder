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

## Characteristics Source Tracking

Problem:

- The dashboard needs to show both resume-derived characteristics and user-added characteristics.
- If those values are stored in one list, replacing the resume can accidentally erase user-entered traits such as `Open to startups` or `Willing to relocate`.

Solution:

- Store `resume_characteristics` and `user_characteristics` separately on the local profile.
- Resume upload replaces only `resume_characteristics`.
- User edits write only to `user_characteristics`.
- The API also returns a combined `characteristics` list for simple display in the sidebar.

Good interview framing:

- This is a small data-model decision that protects user intent.
- It keeps provenance clear without adding a complex audit log or versioning system.
- It leaves scoring unchanged for now, so the feature can ship as an inspectable profile step before becoming a matching signal.

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

## Job Card Signal Display

Decision:

- Replace each job card's `Matched`, `Missing`, and `Cautions` panels with `Required Signals` and `Preferred Signals`.
- Keep fit score calculation unchanged.

Implementation:

- The backend now returns `required_signals` and `preferred_signals` in each fit payload.
- `Required Signals` are extracted from detected job-skill requirements.
- `Preferred Signals` are extracted from lightweight job attributes such as remote, internship, junior, entry-level, and new-graduate language.
- These fields are populated even before a resume is uploaded, so captured jobs can display what the job asks for while the score remains `0%`.
- Caution penalties remain in the backend score and summary, but are no longer shown as a separate per-job card panel.

Good interview framing:

- This separates "why the score is what it is" from "what the job appears to ask for."
- The change is intentionally display-only, so the UI can become clearer without creating a new scoring algorithm too early.
- It is a practical example of improving product language while preserving model behavior for easier debugging.
- It also shows a clean backend/frontend contract improvement: the API now owns the extracted job signals instead of asking the UI to infer them from scoring internals.

### Signal Extraction Follow-Up

Problem:

- The first follow-up extracted broad role/category labels such as `Software Engineering`, `Web Development`, `Internship`, and `Remote`.
- That made the UI look populated, but it was the wrong abstraction: the job already shows role, location, work mode, and employment type elsewhere.
- `Required Signals` and `Preferred Signals` should behave like `Profile Signals`: concise facts that can be compared against the candidate profile.

Solution:

- Replace role/title extraction with section-aware requirement extraction from the full job description.
- Pull `Required Signals` from sections like `Minimum Requirements`, including examples such as `B.S / Masters in CS`, `Shipped real web project`, `HTML`, `CSS`, `JavaScript`, `Git`, and `15-20 Hours per week`.
- Pull `Preferred Signals` from sections like `Skills We're Looking For`, including examples such as `React`, `Next.js`, `TypeScript`, `REST API`, and `GraphQL`.
- Keep the fit calculation unchanged for now. The display contract changed, not the scoring algorithm.
- Update the extension so the currently open Handshake job detail pane is attached to that job's capture payload when visible.

Good interview framing:

- This is a useful example of correcting an abstraction after product review, not just fixing a parsing bug.
- The fix stays intentionally simple: no LLM parsing or heavy NLP, just transparent deterministic rules that are easy to test and explain.
- The capture limitation is clear and honest: list cards usually do not contain full requirements, so high-quality signals require the full job detail text to be visible or captured.

### Signal Capture Follow-Up

Problem:

- Recapturing with extension `0.1.6` still produced no job signals.
- The stored job descriptions were only short list-card snippets, often starting with `Loading...`.
- Handshake search result links use `/job-search/<jobId>` URLs, but the extension only treated `/jobs/` and `/stu/jobs/` links as real job links.
- The full Kira job description existed in the browser only after opening the job result and clicking Handshake's collapsed `More` button.

Solution:

- Recognize `/job-search/<jobId>` anchors as first-class job links.
- During capture, click each visible job result, wait for the detail pane to change, click the exact `More` button when present, and append the expanded detail text to that job's capture payload.
- Bump the extension to `0.1.7` so reload state is visible in the floating widget.

Good interview framing:

- This is a concrete browser-assisted capture bug: the backend parser was correct, but the extension was sending the wrong layer of page data.
- The fix follows the actual UI contract of the source site: open result -> expand description -> capture text.
- It stays local and deterministic, and it avoids scraping hidden APIs or bypassing the user's logged-in browser session.

### Capture Navigation Follow-Up

Problem:

- Extension `0.1.7` visibly scanned through job cards, but the dashboard stayed empty.
- The capture loop clicked direct `/jobs/<id>` links from the detail pane and similar-jobs area.
- Those direct links navigated/reloaded the page, which destroyed the content script before it could write debug output or send the captured payload to the local API.
- The last clicked job also stayed open, which made the extension feel like it had taken over the user's browsing state.

Solution:

- Restrict result capture links to Handshake result URLs such as `/job-search/<id>` and legacy `/stu/jobs/<id>`.
- Ignore direct `/jobs/<id>` links during result scanning so the loop does not navigate away from the search page.
- Store the initially selected job result and click it again after scanning, so the page does not end on the last scanned card.
- Bump the extension to `0.1.8` so reload state is visible.

Good interview framing:

- This is a browser-automation boundary bug: a click that looked harmless in code had a page-lifecycle side effect.
- The fix is intentionally surgical: narrow the selector and restore the user's prior selection instead of redesigning the capture system.

### Signal Parser Follow-Up

Problem:

- After capture started sending full descriptions, only a small number of jobs displayed extracted signals.
- The Kira job had `Minimum Requirements` in the stored description, but `Required Signals` was empty.
- The parser was treating any occurrence of `requirements` as a section heading, so it latched onto phrases like `product requirements` inside responsibilities before reaching the real `Minimum Requirements` section.
- Jobs without clean requirement headings also produced no signals even when the full description clearly mentioned tools such as `Python`, `React`, `SQL`, `Docker`, or `AWS`.

Solution:

- Make generic headings like `requirements` and `qualifications` stricter, while still allowing explicit headings such as `Minimum Requirements`.
- If no required section exists but the text looks like a real job-detail description, extract known technical skill signals from the full description.
- Keep the fallback deterministic and vocabulary-based instead of adding an LLM parser too early.

Good interview framing:

- This is an example of moving from idealized fixture text to messy production text.
- The first parser was explainable but too literal; the fix preserved transparency while making it useful on real captured jobs.
- After rescoring the captured data, `17/25` jobs had required signals instead of only a handful.

## Category Workflow Checkpoint

Decision:

- Replace score-first job review with four local workflow categories: `Under Review`, `Applied`, `Saved`, and `Skipped`.
- Keep the scoring system in the backend, but remove the top-right fit percentage from each job card.
- Let the user move jobs between categories manually with compact action buttons.

Implementation:

- Store job workflow state in the existing `status` field.
- Derive dashboard categories from status:
  - `captured` -> `Under Review`
  - `saved` -> `Saved`
  - `applied` or `interviewing` -> `Applied`
  - `rejected` -> `Skipped`
- Add `PATCH /api/jobs/{job_id}/status` so category moves persist locally.
- Make the four top metric tiles clickable tabs.
- Render only jobs from the active category.
- Highlight the active category tile with a light green outline/background.

Good interview framing:

- This changed the product from a passive ranking table into a lightweight job pipeline.
- The implementation reused the existing status enum instead of inventing a new workflow model.
- The frontend and backend share one simple mapping between storage statuses and user-facing categories.
- This is a useful example of shipping the smallest workflow that creates real user value without building an applicant tracking system too early.

Tradeoff:

- `Applied` and `Skipped` are currently user-selected local labels. The app does not verify that the user actually applied on Handshake, and it does not submit applications.

## Signal Matching Checkpoint

Decision:

- Compare each job's `Required Signals` and `Preferred Signals` against the user's combined `Profile Signals`.
- Show matched signals first.
- Surround matched signals with a light green box and unmatched signals with a light red box.

Implementation:

- Compare against the API's combined `characteristics` list, which includes both resume-derived and user-added profile signals.
- Normalize comparisons by trimming whitespace, collapsing repeated spaces, and comparing case-insensitively.
- Keep matching exact for now. For example, `JavaScript` matches `javascript`, but fuzzy synonyms are not inferred yet.

Good interview framing:

- This made the dashboard explain fit at the signal level instead of only showing a score.
- The visual design supports quick scanning: green chips tell the user what they already have, red chips show what might need review.
- Keeping the first matcher deterministic makes mistakes inspectable and easy to debug.
- Sorting matched signals first helps the strongest evidence appear before gaps.

Tradeoff:

- Exact matching is intentionally conservative. It may miss semantic matches such as `B.S. in Computer Science` versus `B.S / Masters in CS`.
- A future version could add aliases or embedding/LLM-based semantic matching, but the deterministic version is better for this checkpoint because it is explainable.

## Dashboard Layout Checkpoint

Problem:

- Category action buttons had different word lengths, such as `Review` and `Save`.
- Flex wrapping caused the job card metadata (`Company Name`, `Company Location`, work mode, employment type) to shift between categories.

Solution:

- Reserve a fixed right-side action column in each job card.
- Use a fixed three-column button grid so each category always shows the three available moves on one line.
- Keep mobile behavior responsive by letting the action group fill the card width on small screens.

Good interview framing:

- This is a small but practical UX bug: inconsistent layout makes repeated review workflows feel unstable.
- The fix used CSS layout constraints instead of adding JavaScript measurement or special-case rendering.

## Current System Talking Points

- Local-first privacy: the resume and captured jobs stay on the user's machine.
- Compliance-aware capture: the extension only works from the user's visible browser session.
- Browser automation lesson: capturing full job signals required opening each result and expanding visible detail text, not just scraping list-card snippets.
- Backend boundary lesson: input clamping and schema backfills protect persistence from messy page text.
- Product iteration lesson: the app moved from mock scoring, to resume-aware scoring, to signal-based job triage.
- Explainability: profile signals, required signals, preferred signals, and category status are all inspectable rather than hidden behind a black-box model.
