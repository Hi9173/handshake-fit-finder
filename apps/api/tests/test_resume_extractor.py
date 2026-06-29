import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.resume_extractor import ExtractedResumeFacts, extract_resume_facts


class FakeResumeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None

    def read(self):
        return json.dumps(
            {
                "output_text": json.dumps(
                    {
                        "target_roles": ["software engineer"],
                        "skills": ["Python", "React", "written communication"],
                        "locations": ["remote"],
                        "characteristics": ["New graduate", "Willing to relocate"],
                        "seniority": "entry",
                    }
                )
            }
        ).encode()


class ResumeExtractorTests(unittest.TestCase):
    def test_returns_none_without_api_key(self):
        settings = SimpleNamespace(openai_api_key="", openai_model="gpt-test")

        self.assertIsNone(extract_resume_facts("Python React", settings))

    def test_extracts_resume_facts_with_resume_specific_rules(self):
        settings = SimpleNamespace(openai_api_key="key", openai_model="gpt-test")

        with patch("app.services.resume_extractor.urlopen", return_value=FakeResumeResponse()) as urlopen:
            facts = extract_resume_facts("Software engineer resume with Python and React.", settings)

        self.assertEqual(
            facts,
            ExtractedResumeFacts(
                target_roles=["software engineer"],
                skills=["Python", "React"],
                locations=["remote"],
                characteristics=["New graduate", "Willing to relocate"],
                seniority="entry",
            ),
        )
        sent = json.loads(urlopen.call_args.args[0].data)
        self.assertEqual(sent["model"], "gpt-test")
        self.assertIn("resume", sent["input"][0]["content"].lower())


if __name__ == "__main__":
    unittest.main()
