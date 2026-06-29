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

    def test_extracts_requirement_signals_without_changing_score_inputs(self):
        profile = ProfileInput(
            target_roles=["software engineer"],
            skills=["python"],
            locations=["remote"],
            dealbreakers=[],
            seniority="entry",
        )
        job = JobInput(
            title="Web Development Intern",
            company="Launchpad Labs",
            location="Remote",
            description="""
            Minimum Requirements
            Candidates must be currently enrolled in an undergraduate or graduate program in Computer Science,
            Software Engineering, Information Systems, or a closely related field, or be a self-taught developer
            with a strong public portfolio. You must have shipped at least one real web project end-to-end
            (school capstone, side project, hackathon, or freelance work - GitHub or a live URL required).
            Strong working knowledge of HTML, CSS, JavaScript, and Git is required. You must be able to commit
            a minimum of 15-20 hours per week over the course of the internship.

            Skills We're Looking For
            The strongest candidates will bring solid experience with React and Next.js, comfort with modern
            JavaScript or TypeScript, and a working understanding of REST and/or GraphQL APIs.
            """,
        )

        result = score_job(profile, job)

        self.assertEqual(
            result.required_signals,
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
        self.assertIn("React", result.preferred_signals)
        self.assertIn("Next.js", result.preferred_signals)
        self.assertIn("TypeScript", result.preferred_signals)
        self.assertIn("REST API", result.preferred_signals)
        self.assertIn("GraphQL", result.preferred_signals)
        self.assertEqual(result.matched_skills, [])
        self.assertIn("javascript", result.missing_skills)
        self.assertIn("react", result.missing_skills)

    def test_extracts_minimum_requirements_after_responsibilities_mentions_requirements(self):
        profile = ProfileInput(
            target_roles=["software engineer"],
            skills=[],
            locations=["remote"],
            dealbreakers=[],
            seniority="entry",
        )
        job = JobInput(
            title="Web Development Intern",
            company="Kira Jewels",
            location="Remote",
            description=(
                "Responsibilities You will translate wireframes and product requirements into clean React components. "
                "Minimum Requirements Candidates must be currently enrolled in an undergraduate or graduate program "
                "in Computer Science, Software Engineering, Information Systems, or a closely related field. "
                "Strong working knowledge of HTML, CSS, JavaScript, and Git is required. "
                "You must be able to commit a minimum of [15–20 hours per week]. "
                "Skills We're Looking For React and Next.js experience."
            ),
        )

        result = score_job(profile, job)

        self.assertIn("B.S / Masters in CS", result.required_signals)
        self.assertIn("HTML", result.required_signals)
        self.assertIn("CSS", result.required_signals)
        self.assertIn("JavaScript", result.required_signals)
        self.assertIn("Git", result.required_signals)
        self.assertIn("15-20 Hours per week", result.required_signals)

    def test_extracts_common_skill_signals_from_real_detail_without_requirement_heading(self):
        profile = ProfileInput(
            target_roles=["software engineer"],
            skills=[],
            locations=["remote"],
            dealbreakers=[],
            seniority="entry",
        )
        job = JobInput(
            title="Software Engineer Intern",
            company="Launchpad Labs",
            location="Remote",
            description="Job description Build production services with Python, React, SQL, Docker, and AWS for customer workflows.",
        )

        result = score_job(profile, job)

        self.assertIn("python", result.required_signals)
        self.assertIn("react", result.required_signals)
        self.assertIn("sql", result.required_signals)
        self.assertIn("docker", result.required_signals)
        self.assertIn("aws", result.required_signals)

    def test_does_not_treat_card_role_text_as_requirement_signals(self):
        profile = ProfileInput(
            target_roles=["software engineer"],
            skills=[],
            locations=["remote"],
            dealbreakers=[],
            seniority="entry",
        )
        job = JobInput(
            title="VisioneerITBackend Software DeveloperUnpaid · Internship · Jun 21—Jul 1Remote∙4d ago",
            company="VisioneerIT",
            location="Remote",
            description="VisioneerITBackend Software DeveloperUnpaid · Internship · Jun 21—Jul 1Remote∙4d ago",
        )

        result = score_job(profile, job)

        self.assertEqual(result.required_signals, [])
        self.assertEqual(result.preferred_signals, [])

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
