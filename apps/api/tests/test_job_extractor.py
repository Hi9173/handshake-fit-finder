import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.schemas import JobCreate
from app.services.job_extractor import ExtractedJobFacts, extract_job_facts


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None

    def read(self):
        return json.dumps(
            {
                "output_text": json.dumps(
                    {
                        "jobs": [
                            {
                                "index": 0,
                                "title": "Software Engineer Intern",
                                "company": "Kira Labs",
                                "location": "Remote",
                                "work_mode": "remote",
                                "employment_type": "internship",
                                "required_skills": ["Python", "SQL"],
                                "preferred_skills": ["React"],
                                "confidence": 0.82,
                            }
                        ]
                    }
                )
            }
        ).encode()


class JobExtractorTests(unittest.TestCase):
    def test_returns_none_without_api_key(self):
        settings = SimpleNamespace(openai_api_key="", openai_model="gpt-test", openai_batch_size=10)
        jobs = [JobCreate(title="Engineer", company="", location="", description="Python role")]

        self.assertEqual(extract_job_facts(jobs, settings), [None])

    def test_extracts_job_facts_from_openai_response(self):
        settings = SimpleNamespace(openai_api_key="key", openai_model="gpt-test", openai_batch_size=10)
        jobs = [JobCreate(title="Intern", company="", location="", description="Remote internship using Python")]

        with patch("app.services.job_extractor.urlopen", return_value=FakeResponse()) as urlopen:
            facts = extract_job_facts(jobs, settings)

        self.assertEqual(
            facts,
            [
                ExtractedJobFacts(
                    title="Software Engineer Intern",
                    company="Kira Labs",
                    location="Remote",
                    work_mode="remote",
                    employment_type="internship",
                    required_skills=["Python", "SQL"],
                    preferred_skills=["React"],
                    confidence=0.82,
                )
            ],
        )
        sent = json.loads(urlopen.call_args.args[0].data)
        self.assertEqual(sent["model"], "gpt-test")
        self.assertIn("Remote internship using Python", sent["input"][1]["content"])
        schema = sent["text"]["format"]["schema"]["properties"]["jobs"]["items"]
        self.assertIn("title", schema["required"])
        self.assertIn("title", schema["properties"])

    def test_filters_non_technical_and_mode_terms_from_skill_signals(self):
        facts = ExtractedJobFacts(
            work_mode="remote",
            employment_type="internship",
            required_skills=["Python", "written communication", "problem-solving", "Remote", "Internship"],
            preferred_skills=["React", "teamwork", "curiosity"],
        )

        self.assertEqual(facts.required_signals(), ["Python"])
        self.assertEqual(facts.preferred_signals(), ["React"])

    def test_does_not_send_captured_metadata_to_openai(self):
        settings = SimpleNamespace(openai_api_key="key", openai_model="gpt-test", openai_batch_size=10)
        jobs = [
            JobCreate(
                title="Kira JewelsWeb Development Intern",
                company="Wrong But Plausible LLC",
                location="San Diego, CA",
                description="Remote internship",
            )
        ]

        with patch("app.services.job_extractor.urlopen", return_value=FakeResponse()) as urlopen:
            extract_job_facts(jobs, settings)

        sent = json.loads(urlopen.call_args.args[0].data)
        user_payload = json.loads(sent["input"][1]["content"])
        self.assertEqual(user_payload["jobs"][0]["company"], "")
        self.assertEqual(user_payload["jobs"][0]["location"], "")

    def test_prompt_keeps_batch_jobs_independent_and_handles_glued_titles(self):
        settings = SimpleNamespace(openai_api_key="key", openai_model="gpt-test", openai_batch_size=10)
        jobs = [JobCreate(title="ImmobileyesOptical Engineer", company="", location="", description="Job description")]

        with patch("app.services.job_extractor.urlopen", return_value=FakeResponse()) as urlopen:
            extract_job_facts(jobs, settings)

        sent = json.loads(urlopen.call_args.args[0].data)
        system_prompt = sent["input"][0]["content"]
        self.assertIn("Process each job independently", system_prompt)
        self.assertIn("If a title or description starts with a glued company name immediately followed by the role", system_prompt)
        self.assertIn("Return the actual role title", system_prompt)

    def test_prompt_extracts_required_signals_beyond_named_tools(self):
        settings = SimpleNamespace(openai_api_key="key", openai_model="gpt-test", openai_batch_size=10)
        jobs = [JobCreate(title="Software Engineer", company="", location="", description="Bachelor's degree required.")]

        with patch("app.services.job_extractor.urlopen", return_value=FakeResponse()) as urlopen:
            extract_job_facts(jobs, settings)

        system_prompt = json.loads(urlopen.call_args.args[0].data)["input"][0]["content"]
        self.assertIn("Bachelor's degree", system_prompt)
        self.assertIn("programming language experience", system_prompt)
        self.assertIn("Only put a signal in required_skills", system_prompt)

    def test_sends_long_raw_job_details_to_openai(self):
        settings = SimpleNamespace(openai_api_key="key", openai_model="gpt-test", openai_batch_size=10)
        jobs = [JobCreate(title="Engineer", company="", location="", description="x" * 13000)]

        with patch("app.services.job_extractor.urlopen", return_value=FakeResponse()) as urlopen:
            extract_job_facts(jobs, settings)

        sent = json.loads(urlopen.call_args.args[0].data)
        user_payload = json.loads(sent["input"][1]["content"])
        self.assertEqual(len(user_payload["jobs"][0]["description"]), 12000)


if __name__ == "__main__":
    unittest.main()
