const assert = require("node:assert/strict");
const test = require("node:test");

const { collectJobsAcrossScroll } = require("../src/capturePage.js");

test("collectJobsAcrossScroll accumulates jobs from virtualized scroll snapshots", async () => {
  let pass = 0;
  const snapshots = [
    makeJobs(1, 7),
    makeJobs(8, 14),
    makeJobs(15, 21),
    makeJobs(15, 21),
  ];
  const extractor = {
    extractVisibleJobs: () => snapshots[Math.min(pass, snapshots.length - 1)],
    dedupeJobs: (jobs) => {
      const seen = new Set();
      return jobs.filter((job) => {
        if (seen.has(job.source_url)) {
          return false;
        }
        seen.add(job.source_url);
        return true;
      });
    },
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root: {},
    baseUrl: "https://app.joinhandshake.com/job-search/123",
    maxPasses: 6,
    stablePasses: 1,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => {
      pass += 1;
      return { moved: pass < snapshots.length };
    },
  });

  assert.equal(result.jobs.length, 21);
  assert.equal(result.passes, 4);
  assert.equal(result.snapshots[0].visibleJobs, 7);
  assert.equal(result.snapshots[2].totalJobs, 21);
});

test("collectJobsAcrossScroll stops after repeated stable snapshots", async () => {
  let scrollCalls = 0;
  const extractor = {
    extractVisibleJobs: () => makeJobs(1, 7),
    dedupeJobs: (jobs) => jobs.slice(0, 7),
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root: {},
    baseUrl: "https://app.joinhandshake.com/job-search/123",
    maxPasses: 10,
    stablePasses: 2,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => {
      scrollCalls += 1;
      return { moved: true };
    },
  });

  assert.equal(result.jobs.length, 7);
  assert.equal(result.passes, 3);
  assert.equal(scrollCalls, 2);
});

test("collectJobsAcrossScroll clicks visible jobs and expands detail text", async () => {
  let detailText = "Loading...";
  const moreButton = {
    textContent: "More",
    click: () => {
      detailText =
        "Job description Kira builds commerce software. Minimum Requirements HTML, CSS, JavaScript, and Git are required.";
    },
  };
  const job = {
    title: "Web Development Intern",
    company: "Kira Jewels",
    description: "Kira Jewels Web Development Intern Remote",
    source_url: "https://app.joinhandshake.com/job-search/11128657",
    card: {
      click: () => {
        detailText = "Job description Kira builds commerce software. More";
      },
    },
  };
  const root = {
    get textContent() {
      return detailText;
    },
    querySelectorAll: (selector) => (selector === "button" ? [moreButton] : []),
  };
  const extractor = {
    extractVisibleJobs: () => [job],
    dedupeJobs: (jobs) => jobs.slice(0, 1),
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl: "https://app.joinhandshake.com/job-search/11128657",
    maxPasses: 1,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => ({ moved: false }),
  });

  assert.match(result.jobs[0].description, /Minimum Requirements/);
  assert.match(result.jobs[0].description, /HTML, CSS, JavaScript, and Git/);
});

test("collectJobsAcrossScroll restores the initially selected job after scanning", async () => {
  let selectedJob = "111";
  const jobs = ["111", "222"].map((id) => ({
    title: `Job ${id}`,
    company: "Neoboard",
    description: `Job ${id}`,
    source_url: `https://app.joinhandshake.com/job-search/${id}`,
    detailTrigger: {
      click: () => {
        selectedJob = id;
      },
    },
  }));
  const extractor = {
    extractVisibleJobs: () => jobs,
    dedupeJobs: (items) => items,
  };

  await collectJobsAcrossScroll({
    extractor,
    root: {},
    baseUrl: "https://app.joinhandshake.com/job-search/111?page=1",
    maxPasses: 1,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => ({ moved: false }),
  });

  assert.equal(selectedJob, "111");
});

function makeJobs(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const id = start + index;
    return {
      title: `Job ${id}`,
      company: "Neoboard",
      source_url: `https://app.joinhandshake.com/stu/jobs/${id}`,
    };
  });
}
