const assert = require("node:assert/strict");
const test = require("node:test");

const { dedupeJobs, extractVisibleJobs, textLines } = require("../src/extractor.js");

test("textLines normalizes whitespace into readable lines", () => {
  assert.deepEqual(textLines(" Data Analyst   Bright Metrics \n Remote "), [
    "Data Analyst",
    "Bright Metrics",
    "Remote",
  ]);
});

test("dedupeJobs keeps the first job for each source URL", () => {
  const jobs = dedupeJobs([
    { title: "Data Analyst", company: "Bright", source_url: "https://example.test/jobs/1" },
    { title: "Data Analyst", company: "Bright", source_url: "https://example.test/jobs/1" },
    { title: "Software Engineer", company: "Launchpad", source_url: "https://example.test/jobs/2" },
  ]);

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].title, "Data Analyst");
  assert.equal(jobs[1].title, "Software Engineer");
});

test("extractVisibleJobs builds capture payloads from visible job links", () => {
  const firstCard = fakeCard("Entry Level Data Analyst\nBright Metrics\nNew York, NY", "/stu/jobs/123");
  const secondCard = fakeCard("Junior Software Engineer\nLaunchpad Labs\nRemote", "/stu/jobs/456");
  const root = {
    querySelectorAll: () => [firstCard.anchor, secondCard.anchor],
  };

  const jobs = extractVisibleJobs(root, "https://app.joinhandshake.com");

  assert.deepEqual(
    jobs.map((job) => ({
      title: job.title,
      company: job.company,
      location: job.location,
      source_url: job.source_url,
      source: job.source,
    })),
    [
      {
        title: "Entry Level Data Analyst",
        company: "Bright Metrics",
        location: "New York, NY",
        source_url: "https://app.joinhandshake.com/stu/jobs/123",
        source: "handshake-extension",
      },
      {
        title: "Junior Software Engineer",
        company: "Launchpad Labs",
        location: "Remote",
        source_url: "https://app.joinhandshake.com/stu/jobs/456",
        source: "handshake-extension",
      },
    ],
  );
});

function fakeCard(textContent, href) {
  const title = textContent.split("\n")[0];
  const card = { textContent };
  const anchor = {
    textContent: title,
    getAttribute: (name) => (name === "href" ? href : null),
    closest: () => card,
  };
  card.anchor = anchor;
  return card;
}
