# Local Dashboard and Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first private local Handshake Fit Finder app with a React dashboard, FastAPI backend, MySQL data model, and deterministic job-fit scoring.

**Architecture:** The backend owns scoring and persistence through focused services and SQLAlchemy models. The frontend consumes captured API data and presents the ranked job workflow that the Chrome extension feeds.

**Tech Stack:** FastAPI, SQLAlchemy, PyMySQL, MySQL 8.4, React, TypeScript, Vite, CSS modules/plain CSS, Docker Compose.

---

### Task 1: Repo Skeleton

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `docker-compose.yml`
- Create: `docs/superpowers/specs/2026-06-19-handshake-fit-finder-design.md`
- Create: `docs/superpowers/plans/2026-06-19-local-dashboard-backend.md`

- [ ] Create the monorepo folders and docs.
- [ ] Add MySQL Docker Compose configuration.
- [ ] Add local development instructions.

### Task 2: Scoring Engine

**Files:**
- Create: `apps/api/app/services/scoring.py`
- Create: `apps/api/tests/test_scoring.py`

- [ ] Write tests for strong matches, missing requirements, location dealbreakers, and seniority penalties.
- [ ] Run tests and confirm they fail before implementation.
- [ ] Implement deterministic scoring with a transparent breakdown.
- [ ] Run tests and confirm they pass.

### Task 3: Backend API

**Files:**
- Create: `apps/api/app/main.py`
- Create: `apps/api/app/config.py`
- Create: `apps/api/app/database.py`
- Create: `apps/api/app/models.py`
- Create: `apps/api/app/schemas.py`
- Create: `apps/api/app/routes/jobs.py`
- Create: `apps/api/requirements.txt`
- Create: `apps/api/requirements-dev.txt`

- [ ] Add FastAPI app setup with CORS.
- [ ] Add SQLAlchemy MySQL configuration.
- [ ] Add job/profile/score schemas.
- [ ] Add endpoints for health, profile, jobs, and ranking.

### Task 4: Dashboard

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/data/dashboardData.ts`

- [ ] Build a dashboard around ranked job cards and fit breakdowns.
- [ ] Include preference/profile summary and application pipeline metrics.
- [ ] Keep the UI local-tool focused, not landing-page styled.

### Task 5: Verification

**Files:**
- Modify: implementation files as needed.

- [ ] Run Python scoring tests.
- [ ] Run frontend dependency/build checks when pnpm dependencies are available.
- [ ] Check git status and mirror the repo to Desktop after user approval.

### Task 6: Browser-Assisted Capture

**Files:**
- Create: `apps/extension/manifest.json`
- Create: `apps/extension/src/extractor.js`
- Create: `apps/extension/src/content.js`
- Create: `apps/extension/src/content.css`
- Create: `apps/extension/tests/extractor.test.cjs`
- Modify: `apps/api/app/routes/jobs.py`
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/web/src/App.tsx`

- [ ] Add a user-clicked extension widget for visible job capture.
- [ ] Add a batch capture API endpoint at `/api/extension/capture`.
- [ ] Persist captured jobs and fit scores through SQLAlchemy.
- [ ] Update the dashboard to fetch local API data and show an empty state before jobs are captured.
- [ ] Verify backend tests, extension extractor tests, and frontend build.
