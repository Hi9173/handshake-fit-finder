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

test("extractVisibleJobs treats Handshake job-search links as job links", () => {
  const card = fakeCard("Web Development Intern\nKira Jewels\nRemote", "/job-search/11128657?page=1");
  const root = {
    querySelectorAll: (selector) => (selector.includes("/job-search/") ? [card.anchor] : []),
  };

  const jobs = extractVisibleJobs(root, "https://app.joinhandshake.com/job-search/11143320");

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].source_url, "https://app.joinhandshake.com/job-search/11128657?page=1");
});

test("extractVisibleJobs ignores direct jobs links from detail panes", () => {
  const card = fakeCard("Web Development Intern\nKira Jewels\nRemote", "/jobs/11128657");
  const root = {
    querySelectorAll: (selector) => (selector.includes('href*="/jobs/"') ? [card.anchor] : []),
  };

  const jobs = extractVisibleJobs(root, "https://app.joinhandshake.com/job-search/11128657");

  assert.equal(jobs.length, 0);
});

test("extractVisibleJobs falls back to job-like cards without anchors", () => {
  const card = {
    textContent: "Product Data Analyst\nNorthstar Analytics\nHybrid - Austin, TX",
    querySelector: () => null,
  };
  const root = {
    querySelectorAll: (selector) => {
      if (selector.includes("a[")) {
        return [];
      }
      return [card];
    },
  };

  const jobs = extractVisibleJobs(root, "https://app.joinhandshake.com/stu/postings");

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, "Product Data Analyst");
  assert.equal(jobs[0].company, "Northstar Analytics");
  assert.equal(jobs[0].location, "Hybrid - Austin, TX");
  assert.equal(jobs[0].source_url, "https://app.joinhandshake.com/stu/postings#product-data-analyst-northstar-analytics");
});

test("extractVisibleJobs combines link jobs with extra card jobs", () => {
  const linkCard = fakeCard("Entry Level Data Analyst\nBright Metrics\nRemote", "/stu/jobs/123");
  const cardOnly = {
    textContent: "Operations Analyst\nCivic Systems\nChicago, IL",
    querySelector: () => null,
  };
  const root = {
    querySelectorAll: (selector) => {
      if (selector.includes("a[")) {
        return [linkCard.anchor];
      }
      return [linkCard, cardOnly];
    },
  };

  const jobs = extractVisibleJobs(root, "https://app.joinhandshake.com/job-search/11070797");

  assert.equal(jobs.length, 2);
  assert.deepEqual(
    jobs.map((job) => job.title),
    ["Entry Level Data Analyst", "Operations Analyst"],
  );
});

test("extractVisibleJobs adds visible detail text to the currently open job", () => {
  const linkCard = fakeCard("Web Development Intern\nKira\nRemote", "/stu/jobs/987");
  const root = {
    textContent:
      "Web Development Intern\nKira\nRemote\nJob Description\nBuild the B2B platform.\nMinimum Requirements\nHTML, CSS, JavaScript, and Git are required.",
    querySelectorAll: (selector) => {
      if (selector.includes("a[")) {
        return [linkCard.anchor];
      }
      return [linkCard];
    },
  };

  const jobs = extractVisibleJobs(root, "https://app.joinhandshake.com/job-search/987?query=kira");

  assert.equal(jobs.length, 1);
  assert.match(jobs[0].description, /Minimum Requirements/);
  assert.match(jobs[0].description, /HTML, CSS, JavaScript, and Git/);
});

test("extractVisibleJobs ignores Handshake search filter panels", () => {
  const filterPanel = {
    textContent:
      "Job search filters\nSuggested for youRefreshBackend Software Engineer roles in San Diego, CA focusing on scalable systems and distributed computing\nneoboard8/3008 of 300 characters used\nUCSD collections\nLocation\nFull-time job\nInternship\nPart time\nFilters1",
    querySelector: () => null,
  };
  const root = {
    querySelectorAll: (selector) => {
      if (selector.includes("a[")) {
        return [];
      }
      return [filterPanel];
    },
  };

  const jobs = extractVisibleJobs(root, "https://app.joinhandshake.com/job-search/10926674");

  assert.equal(jobs.length, 0);
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
