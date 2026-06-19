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

    def test_health_returns_ok(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_jobs_are_ranked_by_fit_score(self):
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

    def test_capture_visible_jobs_scores_and_persists_them(self):
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
