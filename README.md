# Handshake Fit Finder

A local-first app that captures Handshake job search results from your browser session and shows them in a dashboard.

## Current Scope

- Chrome extension captures the jobs available on the current Handshake results page.
- FastAPI backend stores captured jobs and returns them to the app.
- React dashboard displays captured jobs with a simple local fit score.
- MySQL is available through Docker Compose for local persistence.

This version focuses on reliable Handshake capture and a simple local dashboard.

## Local development

Install frontend dependencies from the repo root:

```bash
pnpm install
```

Backend:

```bash
cd apps/api
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
pnpm dev
```

Database:

```bash
docker compose up -d mysql
```

Requires Docker Desktop to be installed and running.

The Docker MySQL container is exposed on host port `3307` to avoid conflicts with any MySQL already installed on your Mac. The API default database URL is:

```text
mysql+pymysql://handshake:handshake@127.0.0.1:3307/handshake_fit_finder
```

Chrome extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `apps/extension`.
5. After code changes, click the extension reload icon and confirm the Fit Finder widget version matches `apps/extension/manifest.json`.
6. Open Handshake and search normally.
7. Click "Capture visible jobs" in the Fit Finder widget.

The extension posts the visible job cards to `http://127.0.0.1:8000/api/extension/capture`.

## Compliance boundary

The extension assists a user's own Handshake browsing session. It reads the jobs rendered in the user's browser page; it does not crawl Handshake, bypass access controls, call hidden APIs, or bulk collect marketplace data.
