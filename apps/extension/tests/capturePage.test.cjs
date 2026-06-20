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
