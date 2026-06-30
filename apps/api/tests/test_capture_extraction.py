import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.services.job_extractor import ExtractedJobFacts


class CaptureExtractionTests(unittest.TestCase):
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

    def test_capture_uses_extracted_job_facts_for_signals_and_blank_metadata(self):
        extracted = ExtractedJobFacts(
            company="Kira Labs",
            location="Remote",
            work_mode="remote",
            employment_type="internship",
            required_skills=["Python", "SQL"],
            preferred_skills=["React"],
            confidence=0.9,
        )

        with patch("app.routes.jobs.extract_job_facts", return_value=[extracted]):
            response = self.client.post(
                "/api/extension/capture",
                json={
                    "jobs": [
                        {
                            "title": "Software Intern",
                            "company": "Unknown company",
                            "location": "",
                            "description": "Remote internship using Python, SQL, and React.",
                            "source_url": "https://app.joinhandshake.com/stu/jobs/111",
                            "source": "handshake-extension",
                        }
                    ]
                },
            )

        self.assertEqual(response.status_code, 200)
        job = response.json()[0]
        self.assertEqual(job["company"], "Kira Labs")
        self.assertEqual(job["location"], "Remote")
        self.assertEqual(job["fit"]["required_signals"], ["Python", "SQL"])
        self.assertEqual(job["fit"]["preferred_signals"], ["React"])

    def test_capture_replaces_handshake_metadata_in_company_and_location(self):
        extracted = ExtractedJobFacts(
            title="Fullstack Engineer Intern",
            company="fAIshion Inc",
            location="Remote",
            work_mode="remote",
            employment_type="internship",
            required_skills=["React Native"],
            preferred_skills=[],
            confidence=0.9,
        )

        with patch("app.routes.jobs.extract_job_facts", return_value=[extracted]):
            response = self.client.post(
                "/api/extension/capture",
                json={
                    "jobs": [
                        {
                            "title": "fAIshion IncFullstack Engineer Intern",
                            "company": "Unpaid · Internship · May 31—Sep 30Remote∙4wk ago",
                            "location": "Unpaid · Internship · May 31—Sep 30Remote∙4wk ago",
                            "description": "Requirements React Native.",
                            "source_url": "https://app.joinhandshake.com/stu/jobs/222",
                            "source": "handshake-extension",
                        }
                    ]
                },
            )

        self.assertEqual(response.status_code, 200)
        job = response.json()[0]
        self.assertEqual(job["title"], "Fullstack Engineer Intern")
        self.assertEqual(job["company"], "fAIshion Inc")
        self.assertEqual(job["location"], "Remote")

    def test_capture_trusts_extracted_metadata_even_when_captured_metadata_looks_valid(self):
        extracted = ExtractedJobFacts(
            company="AppSofa",
            location="Remote",
            work_mode="remote",
            employment_type="internship",
            required_skills=["Python"],
            preferred_skills=[],
            confidence=0.9,
        )

        with patch("app.routes.jobs.extract_job_facts", return_value=[extracted]):
            response = self.client.post(
                "/api/extension/capture",
                json={
                    "jobs": [
                        {
                            "title": "AI Engineer Intern",
                            "company": "Wrong But Plausible LLC",
                            "location": "San Diego, CA",
                            "description": "Qualifications Python.",
                            "source_url": "https://app.joinhandshake.com/stu/jobs/333",
                            "source": "handshake-extension",
                        }
                    ]
                },
            )

        self.assertEqual(response.status_code, 200)
        job = response.json()[0]
        self.assertEqual(job["company"], "AppSofa")
        self.assertEqual(job["location"], "Remote")


if __name__ == "__main__":
    unittest.main()
