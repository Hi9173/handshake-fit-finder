# Handshake Fit Finder Design

## Goal

Build a private local application that ranks Handshake jobs against a user's resume and preferences, starting with a local dashboard and backend, then adding a compliant browser-assisted capture flow.

## Product Boundary

The app helps the user evaluate jobs they can already see in their own browser session. It does not crawl Handshake, bypass access controls, call hidden APIs, auto-apply, or collect marketplace data in bulk.

## Architecture

The first milestone is a monorepo with a FastAPI backend, MySQL database, and React + TypeScript dashboard. The backend owns persistence, scoring, and future extension ingestion APIs. The dashboard lets the user edit profile preferences, inspect ranked jobs, and track application status.

## Core Units

- API app: FastAPI routes, SQLAlchemy models, Pydantic schemas, scoring service, and database session management.
- Scoring engine: deterministic Python module that compares profile preferences with job data and returns a transparent score breakdown.
- Web app: React dashboard with ranked jobs, metric summaries, job detail panels, and preference-aware messaging.
- Database: MySQL tables for profiles, jobs, fit scores, and application status.

## Data Flow

The dashboard or future extension sends job records to the backend. The backend normalizes the job text, computes fit scores against the user's active profile, stores the job and score, and returns ranked results to the dashboard.

## First Milestone

The initial version ships with scoring tests, backend endpoints, MySQL configuration, a usable dashboard shell, and extension-driven capture. The dashboard shows an empty state until real jobs are captured from the user's browsing session.

## Testing

The scoring engine is tested first because it drives the app's value. Backend route tests should use FastAPI's test client where possible. Frontend verification should include TypeScript build checks once dependencies are installed.
