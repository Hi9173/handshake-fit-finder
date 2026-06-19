import unittest

from app.services.scoring import JobInput, ProfileInput, score_job


class ScoreJobTests(unittest.TestCase):
    def test_scores_strong_skill_and_role_match_highly(self):
        profile = ProfileInput(
            target_roles=["data analyst", "business analyst"],
            skills=["sql", "python", "tableau", "excel"],
            locations=["new york", "remote"],
            dealbreakers=[],
            seniority="entry",
        )
        job = JobInput(
            title="Entry Level Data Analyst",
            company="Bright Metrics",
            location="New York, NY",
            description="Use SQL, Python, Excel, and Tableau to analyze customer data.",
        )

        result = score_job(profile, job)

        self.assertGreaterEqual(result.score, 85)
        self.assertIn("sql", result.matched_skills)
        self.assertIn("python", result.matched_skills)
        self.assertEqual(result.penalties, [])

    def test_lists_missing_profile_skills_from_job_requirements(self):
        profile = ProfileInput(
            target_roles=["software engineer"],
            skills=["python", "react"],
            locations=["remote"],
            dealbreakers=[],
            seniority="entry",
        )
        job = JobInput(
            title="Junior Software Engineer",
            company="Launchpad Labs",
            location="Remote",
            description="Build APIs with Python, React, SQL, Docker, and AWS.",
        )

        result = score_job(profile, job)

        self.assertIn("sql", result.missing_skills)
        self.assertIn("docker", result.missing_skills)
        self.assertIn("aws", result.missing_skills)
        self.assertLess(result.score, 90)

    def test_penalizes_location_dealbreakers(self):
        profile = ProfileInput(
            target_roles=["data analyst"],
            skills=["sql", "python"],
            locations=["remote", "san francisco"],
            dealbreakers=["onsite only"],
            seniority="entry",
        )
        job = JobInput(
            title="Data Analyst",
            company="Campus Ops",
            location="Boston, MA",
            description="Onsite only role using SQL and Python for operations reporting.",
        )

        result = score_job(profile, job)

        self.assertLess(result.score, 70)
        self.assertIn("Dealbreaker matched: onsite only", result.penalties)
        self.assertIn("Location does not match preferences", result.penalties)

    def test_penalizes_senior_roles_for_entry_level_profile(self):
        profile = ProfileInput(
            target_roles=["software engineer"],
            skills=["typescript", "react", "python"],
            locations=["remote"],
            dealbreakers=[],
            seniority="entry",
        )
        job = JobInput(
            title="Senior Software Engineer",
            company="Scale Systems",
            location="Remote",
            description="Senior role requiring 5+ years of TypeScript, React, and Python.",
        )

        result = score_job(profile, job)

        self.assertLess(result.score, 80)
        self.assertIn("Seniority appears above entry level", result.penalties)


if __name__ == "__main__":
    unittest.main()
