import unittest
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Profile, utc_now
from app.services.job_extractor import ExtractedJobFacts
from app.services.resume_extractor import ExtractedResumeFacts


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=self.engine)

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def upload_data_resume(self):
        return self.client.post(
            "/api/profile/resume",
            files={"file": ("resume.md", b"# Data Analyst\nPython SQL Excel Tableau\nRemote\n", "text/markdown")},
        )

    def test_health_returns_ok(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_jobs_are_ranked_by_fit_score(self):
        self.upload_data_resume()
        self.client.post(
            "/api/extension/capture",
            json={
                "jobs": [
                    {
                        "title": "Entry Level Data Analyst",
                        "company": "Bright Metrics",
                        "location": "New York, NY",
                        "description": "Analyze customer data with SQL, Python, Excel, and Tableau.",
                        "source_url": "https://app.joinhandshake.com/stu/jobs/123",
                        "source": "handshake-extension",
                    },
                    {
                        "title": "Senior Backend Engineer",
                        "company": "Scale Systems",
                        "location": "Boston, MA",
                        "description": "Senior onsite only role requiring 5+ years with Python and AWS.",
                        "source_url": "https://app.joinhandshake.com/stu/jobs/456",
                        "source": "handshake-extension",
                    },
                ]
            },
        )

        response = self.client.get("/api/jobs")

        self.assertEqual(response.status_code, 200)
        jobs = response.json()
        scores = [job["fit"]["score"] for job in jobs]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_jobs_are_empty_before_capture(self):
        response = self.client.get("/api/jobs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_capture_scores_zero_before_resume_upload(self):
        response = self.client.post(
            "/api/extension/capture",
            json={
                "jobs": [
                    {
                        "title": "Entry Level Data Analyst",
                        "company": "Bright Metrics",
                        "location": "New York, NY",
                        "description": "Analyze customer data with SQL, Python, Excel, and Tableau.",
                        "source_url": "https://app.joinhandshake.com/stu/jobs/123",
                        "source": "handshake-extension",
                    }
                ]
            },
        )

        self.assertEqual(response.status_code, 200)
        job = response.json()[0]
        self.assertEqual(job["fit"]["score"], 0)
        self.assertEqual(job["fit"]["matched_skills"], [])
        self.assertEqual(job["fit"]["missing_skills"], [])
        self.assertIn("Upload a resume", job["fit"]["summary"])

    def test_capture_returns_job_signals_before_resume_upload(self):
        response = self.client.post(
            "/api/extension/capture",
            json={
                "jobs": [
                    {
                        "title": "Web Development Intern",
                        "company": "Kira",
                        "location": "Remote",
                        "description": (
                            "Minimum Requirements\n"
                            "Candidates must be currently enrolled in an undergraduate or graduate program in "
                            "Computer Science, Software Engineering, Information Systems, or a closely related field, "
                            "or be a self-taught developer with a strong public portfolio. You must have shipped at "
                            "least one real web project end-to-end. Strong working knowledge of HTML, CSS, JavaScript, "
                            "and Git is required. You must be able to commit a minimum of 15-20 hours per week.\n\n"
                            "Skills We're Looking For\n"
                            "The strongest candidates will bring solid experience with React and Next.js, comfort "
                            "with modern JavaScript or TypeScript, and REST and/or GraphQL APIs."
                        ),
                        "source_url": "https://app.joinhandshake.com/stu/jobs/987",
                        "source": "handshake-extension",
                    }
                ]
            },
        )

        self.assertEqual(response.status_code, 200)
        fit = response.json()[0]["fit"]
        self.assertEqual(fit["score"], 0)
        self.assertEqual(
            fit["required_signals"],
            [
                "B.S / Masters in CS",
                "Shipped real web project",
                "HTML",
                "CSS",
                "JavaScript",
                "Git",
                "15-20 Hours per week",
            ],
        )
        self.assertIn("React", fit["preferred_signals"])
        self.assertIn("Next.js", fit["preferred_signals"])
        self.assertIn("TypeScript", fit["preferred_signals"])
        self.assertIn("REST API", fit["preferred_signals"])
        self.assertIn("GraphQL", fit["preferred_signals"])

    def test_resume_upload_extracts_profile_and_rescores_jobs(self):
        self.client.post(
            "/api/extension/capture",
            json={
                "jobs": [
                    {
                        "title": "Entry Level Data Analyst",
                        "company": "Bright Metrics",
                        "location": "Remote",
                        "description": "Use SQL, Python, Excel, and Tableau to analyze customer data.",
                        "source_url": "https://app.joinhandshake.com/stu/jobs/123",
                        "source": "handshake-extension",
                    }
                ]
            },
        )

        response = self.client.post(
            "/api/profile/resume",
            files={"file": ("resume.md", b"# Data Analyst\nPython SQL Excel Tableau\n", "text/markdown")},
        )

        self.assertEqual(response.status_code, 200)
        profile = response.json()
        self.assertTrue(profile["has_resume"])
        self.assertEqual(profile["resume_filename"], "resume.md")
        self.assertIn("python", profile["skills"])

        jobs = self.client.get("/api/jobs").json()
        self.assertGreater(jobs[0]["fit"]["score"], 0)
        self.assertIn("python", jobs[0]["fit"]["matched_skills"])

    def test_resume_upload_generates_resume_characteristics(self):
        response = self.client.post(
            "/api/profile/resume",
            files={
                "file": (
                    "resume.md",
                    b"# Software Engineer\nPython SQL\nRecent graduate willing to relocate\n",
                    "text/markdown",
                )
            },
        )

        self.assertEqual(response.status_code, 200)
        profile = response.json()
        characteristics = profile["characteristics"]
        self.assertEqual(profile["user_characteristics"], [])
        self.assertIn("python", characteristics)
        self.assertIn("sql", characteristics)
        self.assertIn("New graduate", characteristics)
        self.assertIn("Willing to relocate", characteristics)
        self.assertEqual(profile["resume_characteristics"], characteristics)

    def test_resume_upload_uses_openai_resume_extraction_when_available(self):
        extracted = ExtractedResumeFacts(
            target_roles=["software engineer"],
            skills=["Python", "React"],
            locations=["remote"],
            characteristics=["Python", "React", "New graduate"],
            seniority="entry",
        )

        with patch("app.services.resume_parser.extract_resume_facts", return_value=extracted):
            response = self.client.post(
                "/api/profile/resume",
                files={
                    "file": (
                        "resume.md",
                        b"# Software Engineer\nPython React\nRecent graduate\n",
                        "text/markdown",
                    )
                },
            )

        self.assertEqual(response.status_code, 200)
        profile = response.json()
        self.assertEqual(profile["target_roles"], ["software engineer"])
        self.assertEqual(profile["skills"], ["Python", "React"])
        self.assertEqual(profile["locations"], ["remote"])
        self.assertEqual(profile["resume_characteristics"], ["Python", "React", "New graduate"])

    def test_resume_upload_replaces_only_resume_characteristics(self):
        self.client.put(
            "/api/profile",
            json={
                "name": "Local Profile",
                "target_roles": ["data analyst"],
                "skills": ["sql"],
                "locations": ["remote"],
                "dealbreakers": [],
                "seniority": "entry",
                "user_characteristics": ["Open to startups"],
            },
        )
        first_upload = self.client.post(
            "/api/profile/resume",
            files={"file": ("resume.md", b"# Software Engineer\nPython\nRecent graduate\n", "text/markdown")},
        )
        self.assertEqual(first_upload.status_code, 200)
        self.assertIn("python", first_upload.json()["resume_characteristics"])

        second_upload = self.client.post(
            "/api/profile/resume",
            files={"file": ("resume.md", b"# Software Engineer\nJava\n", "text/markdown")},
        )

        self.assertEqual(second_upload.status_code, 200)
        profile = second_upload.json()
        self.assertEqual(profile["user_characteristics"], ["Open to startups"])
        self.assertIn("java", profile["resume_characteristics"])
        self.assertNotIn("python", profile["resume_characteristics"])
        self.assertNotIn("New graduate", profile["resume_characteristics"])
        self.assertIn("Open to startups", profile["characteristics"])
        self.assertIn("java", profile["characteristics"])

    def test_profile_update_saves_user_characteristics_without_changing_scoring_inputs(self):
        response = self.client.put(
            "/api/profile",
            json={
                "name": "Local Profile",
                "target_roles": ["data analyst"],
                "skills": ["sql"],
                "locations": ["remote"],
                "dealbreakers": [],
                "seniority": "entry",
                "user_characteristics": ["New graduate", "Willing to relocate"],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["resume_characteristics"], [])
        self.assertEqual(response.json()["user_characteristics"], ["New graduate", "Willing to relocate"])
        self.assertEqual(response.json()["characteristics"], ["New graduate", "Willing to relocate"])

    def test_profile_update_saves_resume_and_user_characteristics(self):
        self.client.post(
            "/api/profile/resume",
            files={
                "file": (
                    "resume.md",
                    b"# Software Engineer\nPython SQL\nRecent graduate willing to relocate\n",
                    "text/markdown",
                )
            },
        )

        response = self.client.put(
            "/api/profile",
            json={
                "name": "Local Profile",
                "target_roles": ["software engineer"],
                "skills": ["python"],
                "locations": ["remote"],
                "dealbreakers": [],
                "seniority": "entry",
                "resume_characteristics": ["python", "New graduate"],
                "user_characteristics": ["Open to startups"],
            },
        )

        self.assertEqual(response.status_code, 200)
        profile = response.json()
        self.assertEqual(profile["resume_characteristics"], ["python", "New graduate"])
        self.assertEqual(profile["user_characteristics"], ["Open to startups"])
        self.assertEqual(profile["characteristics"], ["python", "New graduate", "Open to startups"])

    def test_profile_update_clear_signals_stays_clear_after_refresh(self):
        self.client.post(
            "/api/profile/resume",
            files={"file": ("resume.md", b"# Software Engineer\nPython\nRecent graduate\n", "text/markdown")},
        )

        response = self.client.put(
            "/api/profile",
            json={
                "name": "Local Profile",
                "target_roles": ["software engineer"],
                "skills": ["python"],
                "locations": ["remote"],
                "dealbreakers": [],
                "seniority": "entry",
                "resume_characteristics": [],
                "user_characteristics": [],
            },
        )
        refreshed = self.client.get("/api/profile")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(refreshed.status_code, 200)
        self.assertEqual(refreshed.json()["resume_characteristics"], [])
        self.assertEqual(refreshed.json()["user_characteristics"], [])
        self.assertEqual(refreshed.json()["characteristics"], [])

    def test_profile_backfills_resume_characteristics_from_stored_resume_text(self):
        with self.SessionLocal() as db:
            db.add(
                Profile(
                    id=1,
                    name="Local Profile",
                    target_roles=["software engineer"],
                    skills=["python"],
                    locations=["remote"],
                    dealbreakers=[],
                    resume_characteristics=[],
                    user_characteristics=["Open to startups"],
                    seniority="entry",
                    resume_filename="resume.md",
                    resume_path="/tmp/resume.md",
                    resume_text="# Software Engineer\nPython\nRecent graduate\n",
                    resume_uploaded_at=utc_now(),
                )
            )
            db.commit()

        response = self.client.get("/api/profile")

        self.assertEqual(response.status_code, 200)
        profile = response.json()
        self.assertIn("python", profile["resume_characteristics"])
        self.assertIn("New graduate", profile["resume_characteristics"])
        self.assertEqual(profile["user_characteristics"], ["Open to startups"])
        self.assertIn("Open to startups", profile["characteristics"])

    def test_resume_upload_rejects_unsupported_file_type(self):
        response = self.client.post(
            "/api/profile/resume",
            files={"file": ("resume.docx", b"Python SQL", "application/octet-stream")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn(".pdf, .tex, or .md", response.json()["detail"])

    def test_failed_resume_upload_does_not_overwrite_current_file(self):
        with TemporaryDirectory() as directory:
            resume_dir = Path(directory)
            current_file = resume_dir / "resume.pdf"
            current_file.write_bytes(b"current resume bytes")

            with patch("app.services.resume_parser.RESUME_DIR", resume_dir):
                response = self.client.post(
                    "/api/profile/resume",
                    files={"file": ("resume.pdf", b"not a real pdf", "application/pdf")},
                )

            self.assertEqual(response.status_code, 400)
            self.assertEqual(current_file.read_bytes(), b"current resume bytes")

    def test_profile_update_rescores_existing_jobs(self):
        self.client.post(
            "/api/profile/resume",
            files={"file": ("resume.md", b"# Software Engineer\nReact TypeScript\n", "text/markdown")},
        )
        self.client.post(
            "/api/extension/capture",
            json={
                "jobs": [
                    {
                        "title": "Data Analyst",
                        "company": "Bright Metrics",
                        "location": "Remote",
                        "description": "Use SQL and Python for reporting.",
                        "source_url": "https://app.joinhandshake.com/stu/jobs/456",
                        "source": "handshake-extension",
                    }
                ]
            },
        )
        before = self.client.get("/api/jobs").json()[0]["fit"]["score"]

        response = self.client.put(
            "/api/profile",
            json={
                "name": "Local Profile",
                "target_roles": ["data analyst"],
                "skills": ["sql", "python"],
                "locations": ["remote"],
                "dealbreakers": [],
                "seniority": "entry",
            },
        )

        self.assertEqual(response.status_code, 200)
        after = self.client.get("/api/jobs").json()[0]["fit"]["score"]
        self.assertGreater(after, before)

    def test_capture_visible_jobs_scores_and_persists_them(self):
        self.upload_data_resume()
        response = self.client.post(
            "/api/extension/capture",
            json={
                "jobs": [
                    {
                        "title": "Entry Level Data Analyst",
                        "company": "Bright Metrics",
                        "location": "New York, NY",
                        "description": "Analyze customer data with SQL, Python, Excel, and Tableau.",
                        "source_url": "https://app.joinhandshake.com/stu/jobs/123",
                        "source": "handshake-extension",
                    },
                    {
                        "title": "Senior Backend Engineer",
                        "company": "Scale Systems",
                        "location": "Boston, MA",
                        "description": "Senior onsite only role requiring 5+ years with Python and AWS.",
                        "source_url": "https://app.joinhandshake.com/stu/jobs/456",
                        "source": "handshake-extension",
                    },
                ]
            },
        )

        self.assertEqual(response.status_code, 200)
        captured = response.json()
        self.assertEqual(len(captured), 2)
        self.assertGreater(captured[0]["fit"]["score"], captured[1]["fit"]["score"])

        list_response = self.client.get("/api/jobs")
        self.assertEqual(list_response.status_code, 200)
        jobs = list_response.json()
        self.assertEqual([job["source_url"] for job in jobs], [
            "https://app.joinhandshake.com/stu/jobs/123",
            "https://app.joinhandshake.com/stu/jobs/456",
        ])

    def test_capture_visible_jobs_updates_existing_job_by_source_url(self):
        self.upload_data_resume()
        payload = {
            "jobs": [
                {
                    "title": "Data Analyst",
                    "company": "Bright Metrics",
                    "location": "Remote",
                    "description": "Analyze data with SQL.",
                    "source_url": "https://app.joinhandshake.com/stu/jobs/123",
                    "source": "handshake-extension",
                }
            ]
        }

        first_response = self.client.post("/api/extension/capture", json=payload)
        self.assertEqual(first_response.status_code, 200)

        payload["jobs"][0]["description"] = "Analyze data with SQL, Python, Excel, and Tableau."
        second_response = self.client.post("/api/extension/capture", json=payload)

        self.assertEqual(second_response.status_code, 200)
        jobs = self.client.get("/api/jobs").json()
        self.assertEqual(len(jobs), 1)
        self.assertIn("python", jobs[0]["fit"]["matched_skills"])

    def test_profile_rescore_uses_extracted_job_signals_before_deterministic_fallback(self):
        self.upload_data_resume()
        extracted = ExtractedJobFacts(
            required_skills=["LangGraph"],
            preferred_skills=["Vector DB"],
        )
        payload = {
            "jobs": [
                {
                    "title": "AI Engineer",
                    "company": "Model Works",
                    "location": "Remote",
                    "description": "Build agent systems.",
                    "source_url": "https://app.joinhandshake.com/stu/jobs/789",
                    "source": "handshake-extension",
                }
            ]
        }

        with patch("app.routes.jobs.extract_job_facts", return_value=[extracted]):
            self.client.post("/api/extension/capture", json=payload)
            response = self.client.put(
                "/api/profile",
                json={
                    "name": "Local Profile",
                    "target_roles": ["ai engineer"],
                    "skills": ["python"],
                    "locations": ["remote"],
                    "dealbreakers": [],
                    "seniority": "entry",
                },
            )

        job = self.client.get("/api/jobs").json()[0]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(job["fit"]["required_signals"], ["LangGraph"])
        self.assertEqual(job["fit"]["preferred_signals"], ["Vector DB"])

    def test_profile_toggle_uses_deterministic_job_extraction(self):
        response = self.client.put(
            "/api/profile",
            json={
                "name": "Local Profile",
                "target_roles": ["software engineer"],
                "skills": ["html"],
                "locations": ["remote"],
                "dealbreakers": [],
                "seniority": "entry",
                "use_deterministic_extraction": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["use_deterministic_extraction"])

        with patch("app.routes.jobs.extract_job_facts", side_effect=AssertionError("OpenAI extractor called")):
            capture = self.client.post(
                "/api/extension/capture",
                json={
                    "jobs": [
                        {
                            "title": "Web Engineer",
                            "company": "Kira",
                            "location": "Remote",
                            "description": "Minimum Requirements HTML, CSS, JavaScript, and Git.",
                            "source_url": "https://app.joinhandshake.com/stu/jobs/654",
                            "source": "handshake-extension",
                        }
                    ]
                },
            )

        self.assertEqual(capture.status_code, 200)
        self.assertEqual(capture.json()[0]["fit"]["required_signals"], ["HTML", "CSS", "JavaScript", "Git"])

    def test_delete_jobs_clears_captured_jobs_and_scores(self):
        self.client.post(
            "/api/extension/capture",
            json={
                "jobs": [
                    {
                        "title": "Data Analyst",
                        "company": "Bright Metrics",
                        "location": "Remote",
                        "description": "Analyze data with SQL.",
                        "source_url": "https://app.joinhandshake.com/stu/jobs/123",
                        "source": "handshake-extension",
                    }
                ]
            },
        )

        response = self.client.delete("/api/jobs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"deleted": 1})
        self.assertEqual(self.client.get("/api/jobs").json(), [])

    def test_update_job_status_persists(self):
        self.client.post(
            "/api/extension/capture",
            json={
                "jobs": [
                    {
                        "title": "Data Analyst",
                        "company": "Bright Metrics",
                        "location": "Remote",
                        "description": "Analyze data with SQL.",
                        "source_url": "https://app.joinhandshake.com/stu/jobs/123",
                        "source": "handshake-extension",
                    }
                ]
            },
        )
        job_id = self.client.get("/api/jobs").json()[0]["id"]

        response = self.client.patch(f"/api/jobs/{job_id}/status", json={"status": "saved"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "saved")
        self.assertEqual(self.client.get("/api/jobs").json()[0]["status"], "saved")

    def test_capture_visible_jobs_clamps_overlong_page_text(self):
        long_company = "Suggested for you" + (" Backend Software Engineer" * 20)
        response = self.client.post(
            "/api/extension/capture",
            json={
                "jobs": [
                    {
                        "title": "Job search filters",
                        "company": long_company,
                        "location": "Suggested for you Backend Software Engineer roles in San Diego, CA",
                        "description": "SQL Python analytics",
                        "source_url": "https://app.joinhandshake.com/job-search/10926674#job-search-filters",
                        "source": "handshake-extension",
                    }
                ]
            },
        )

        self.assertEqual(response.status_code, 200)
        job = response.json()[0]
        self.assertLessEqual(len(job["company"]), 255)
        self.assertLessEqual(len(job["location"]), 255)

    def test_extension_debug_log_appends_jsonl(self):
        with TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "extension-debug.jsonl"
            with patch("app.routes.jobs.DEBUG_LOG_PATH", log_path):
                response = self.client.post(
                    "/api/extension/debug-log",
                    json={"phase": "captured", "detailDebug": [{"status": "timeout_for_detail_to_load"}]},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"path": str(log_path)})
            entry = json.loads(log_path.read_text().strip())
            self.assertEqual(entry["payload"]["phase"], "captured")
            self.assertEqual(entry["payload"]["detailDebug"][0]["status"], "timeout_for_detail_to_load")


if __name__ == "__main__":
    unittest.main()
