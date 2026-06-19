# Handshake Fit Finder

A private local job-fit dashboard for ranking Handshake postings against a user's resume, skills, and preferences.

## Current milestone

- React + TypeScript dashboard in `apps/web`
- FastAPI backend in `apps/api`
- MySQL via Docker Compose
- Deterministic fit scoring for captured jobs
- Chrome extension scaffold in `apps/extension` for user-initiated visible job capture

## Local development

The Codex workspace provides Node and pnpm at:

```bash
/Users/justin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
/Users/justin/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/pnpm
```

Backend:

```bash
cd apps/api
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd apps/web
pnpm install
pnpm dev
```

Database:

```bash
docker compose up mysql
```

Chrome extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `apps/extension`.
5. Open Handshake and search normally.
6. Click "Capture visible jobs" in the Fit Finder widget.

The extension posts the visible job cards to `http://127.0.0.1:8000/api/extension/capture`.

## Compliance boundary

The planned browser extension should assist a user's own browsing session. It should score visible jobs and user-selected job detail pages, not crawl Handshake, bypass access controls, call hidden APIs, or bulk collect marketplace data.
