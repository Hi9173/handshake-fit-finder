import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


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

    def test_resume_upload_rejects_unsupported_file_type(self):
        response = self.client.post(
            "/api/profile/resume",
            files={"file": ("resume.docx", b"Python SQL", "application/octet-stream")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn(".pdf, .tex, or .md", response.json()["detail"])

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


if __name__ == "__main__":
    unittest.main()
