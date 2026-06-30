const assert = require("node:assert/strict");
const test = require("node:test");

const { collectJobsAcrossScroll } = require("../src/capturePage.js");

test("collectJobsAcrossScroll captures one visible snapshot without rescanning or scrolling", async () => {
  let extractCalls = 0;
  let scrollCalls = 0;
  let resetCalls = 0;
  const extractor = {
    extractVisibleJobs: () => {
      extractCalls += 1;
      return makeJobs(1, 7);
    },
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
    resetScroll: async () => {
      resetCalls += 1;
    },
    scroll: async () => {
      scrollCalls += 1;
      return { moved: true };
    },
  });

  assert.equal(result.jobs.length, 7);
  assert.equal(result.passes, 1);
  assert.equal(extractCalls, 1);
  assert.equal(scrollCalls, 0);
  assert.equal(resetCalls, 0);
  assert.equal(result.stopReason, "visible_jobs_visited_once");
  assert.equal(result.snapshots[0].visibleJobs, 7);
  assert.equal(result.snapshots[0].totalJobs, 7);
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
    baseUrl: "https://app.joinhandshake.com/job-search/999",
    maxPasses: 1,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => ({ moved: false }),
  });

  assert.match(result.jobs[0].description, /Minimum Requirements/);
  assert.match(result.jobs[0].description, /HTML, CSS, JavaScript, and Git/);
});

test("collectJobsAcrossScroll clicks anchor detail triggers", async () => {
  let anchorClicked = false;
  let detailText = "Loading...";
  const root = {
    get textContent() {
      return detailText;
    },
    querySelectorAll: () => [],
  };
  const anchor = {
    tagName: "A",
    href: "https://app.joinhandshake.com/job-search/11128657",
    click: () => {
      anchorClicked = true;
      detailText =
        "Job description Kira builds commerce software. Minimum Requirements HTML, CSS, JavaScript, and Git are required.";
    },
  };
  const job = {
    title: "Web Development Intern",
    company: "Kira Jewels",
    description: "Kira Jewels Web Development Intern Remote",
    source_url: "https://app.joinhandshake.com/job-search/11128657",
    detailTrigger: anchor,
    card: {
      click: () => {
        throw new Error("card fallback should not be clicked when detail trigger exists");
      },
    },
  };
  const extractor = {
    extractVisibleJobs: () => [job],
    dedupeJobs: (jobs) => jobs.slice(0, 1),
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl: "https://app.joinhandshake.com/job-search/999",
    maxPasses: 1,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => ({ moved: false }),
  });

  assert.equal(anchorClicked, true);
  assert.match(result.jobs[0].description, /Minimum Requirements/);
  assert.match(result.jobs[0].description, /HTML, CSS, JavaScript, and Git/);
});

test("collectJobsAcrossScroll captures detail panes that start with about the role", async () => {
  let detailText = "Loading...";
  const job = {
    title: "Financial Quantitative Analyst",
    company: "Shepherd VenturesAI",
    description: "Shepherd VenturesAI Financial Quantitative Analyst Remote",
    source_url: "https://app.joinhandshake.com/job-search/11168341",
    detailTrigger: {
      click: () => {
        detailText =
          "About the role Shepherd VenturesAI is looking for a quantitative analyst intern. Qualifications include Python, statistics, financial modeling, and portfolio analysis.";
      },
    },
  };
  const root = {
    get textContent() {
      return detailText;
    },
    querySelectorAll: () => [],
  };
  const extractor = {
    extractVisibleJobs: () => [job],
    dedupeJobs: (jobs) => jobs.slice(0, 1),
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl: "https://app.joinhandshake.com/job-search/999",
    maxPasses: 1,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => ({ moved: false }),
  });

  assert.match(result.jobs[0].description, /quantitative analyst intern/);
  assert.match(result.jobs[0].description, /financial modeling/);
});

test("collectJobsAcrossScroll keeps at-a-glance fields from the selected job detail", async () => {
  let detailText = "Loading...";
  const job = {
    title: "Coursicle Software Engineer Internship - NYC Summer 2027",
    company: "Coursicle",
    description: "Coursicle Software Engineer Internship - NYC Summer 2027",
    source_url: "https://app.joinhandshake.com/jobs/11168427",
    detailTrigger: {
      click: () => {
        detailText = [
          "Coursicle logo",
          "Coursicle",
          "Internet & Software",
          "Coursicle Software Engineer Internship - NYC Summer 2027",
          "Posted 2 hours ago Apply by July 29, 2026",
          "At a glance",
          "$15-20/hr",
          "Onsite, based in New York, NY",
          "Internship",
          "Full-time From June 5, 2027 to August 16, 2027",
          "US work authorization not required",
          "Job description",
          "Over 2 million college students use Coursicle to stay on top of their classes and homework.",
        ].join(" ");
      },
    },
  };
  const root = {
    get textContent() {
      return detailText;
    },
    querySelectorAll: () => [],
  };
  const extractor = {
    extractVisibleJobs: () => [job],
    dedupeJobs: (jobs) => jobs.slice(0, 1),
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl: "https://app.joinhandshake.com/job-search/999",
    maxPasses: 1,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => ({ moved: false }),
  });

  assert.match(result.jobs[0].description, /At a glance/);
  assert.match(result.jobs[0].description, /\$15-20\/hr/);
  assert.match(result.jobs[0].description, /US work authorization not required/);
});

test("collectJobsAcrossScroll uses queued triggers without re-querying visible jobs", async () => {
  const clickedQueuedIds = [];
  let extractCalls = 0;
  let detailText = "Job description Current selected job. Minimum Requirements C++.";
  const root = {
    get textContent() {
      return detailText;
    },
    querySelectorAll: () => [],
  };
  const extractor = {
    extractVisibleJobs: () => {
      extractCalls += 1;
      if (extractCalls === 1) {
        return [
          makeJobWithTrigger("111", () => {
            clickedQueuedIds.push("111");
          }),
          makeJobWithTrigger("222", () => {
            clickedQueuedIds.push("222");
            detailText = "Job description Second job. Minimum Requirements Python.";
          }),
          makeJobWithTrigger("333", () => {
            clickedQueuedIds.push("333");
            detailText = "Job description Third job. Minimum Requirements Java.";
          }),
        ];
      }
      throw new Error("capture should not re-query visible jobs");
    },
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
    root,
    baseUrl: "https://app.joinhandshake.com/job-search/111?page=1",
    maxPasses: 1,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => ({ moved: false }),
  });

  assert.equal(extractCalls, 1);
  assert.deepEqual(clickedQueuedIds, ["222", "333"]);
  assert.match(result.jobs[0].description, /Current selected job/);
  assert.match(result.jobs[1].description, /Python/);
  assert.match(result.jobs[2].description, /Java/);
});

test("collectJobsAcrossScroll does not attach detail text from another queued company", async () => {
  let detailText = "Loading...";
  const jobs = [
    {
      title: "Sales Account Manager",
      company: "Quake Global",
      description: "Quake Global Sales Account Manager San Diego, CA",
      source_url: "https://app.joinhandshake.com/job-search/11168346",
      detailTrigger: {
        click: () => {
          detailText = "Job description About the role Persona's infrastructure team builds cloud platforms.";
        },
      },
    },
    {
      title: "Infrastructure Engineering Resident",
      company: "Persona",
      description: "Persona Infrastructure Engineering Resident",
      source_url: "https://app.joinhandshake.com/job-search/999",
      detailTrigger: {
        click: () => {
          detailText = "Job description Persona builds identity infrastructure. Minimum Requirements Kubernetes.";
        },
      },
    },
  ];
  const root = {
    get textContent() {
      return detailText;
    },
    querySelectorAll: () => [],
  };
  const extractor = {
    extractVisibleJobs: () => jobs,
    dedupeJobs: (items) => items,
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl: "https://app.joinhandshake.com/job-search/123",
    maxPasses: 1,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => ({ moved: false }),
  });

  assert.doesNotMatch(result.jobs[0].description, /Persona/);
  assert.match(result.jobs[1].description, /Kubernetes/);
});

test("collectJobsAcrossScroll waits past stale detail text until it matches the queued company", async () => {
  let detailText = "Loading...";
  let waits = 0;
  const jobs = [
    {
      title: "Sales Account Manager",
      company: "Quake Global",
      description: "Quake Global Sales Account Manager San Diego, CA",
      source_url: "https://app.joinhandshake.com/job-search/11168346",
      detailTrigger: {
        click: () => {
          detailText = "Job description Persona builds identity infrastructure.";
        },
      },
    },
    {
      title: "Infrastructure Engineering Resident",
      company: "Persona",
      description: "Persona Infrastructure Engineering Resident",
      source_url: "https://app.joinhandshake.com/job-search/999",
      detailTrigger: {
        click: () => {},
      },
    },
  ];
  const root = {
    get textContent() {
      return detailText;
    },
    querySelectorAll: () => [],
  };
  const extractor = {
    extractVisibleJobs: () => jobs,
    dedupeJobs: (items) => items,
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl: "https://app.joinhandshake.com/job-search/123",
    maxPasses: 1,
    wait: async () => {
      waits += 1;
      if (waits > 1 && /Persona builds/.test(detailText)) {
        detailText = "Job description Quake Global sells IoT connectivity. Minimum Requirements CRM.";
      }
    },
    resetScroll: async () => {},
    scroll: async () => ({ moved: false }),
  });

  assert.match(result.jobs[0].description, /Quake Global sells IoT connectivity/);
  assert.doesNotMatch(result.jobs[0].description, /Persona builds/);
});

test("collectJobsAcrossScroll waits past stale stitched detail until the selected job loads", async () => {
  let detailText = "Job description Now Expanding Across All 50 States. State license required.";
  let href = "https://app.joinhandshake.com/job-search/11168478";
  let waits = 0;
  const job = {
    title: "Deep Learning Research Intern",
    company: "Tenvos",
    description: "Tenvos Deep Learning Research Intern Remote",
    source_url: "https://app.joinhandshake.com/job-search/11168470",
    detailTrigger: {
      click: () => {
        detailText = [
          "Tenvos Deep Learning Research Intern Remote Job description Now Expanding Across All 50 States.",
          "We help families improve their financial future through life insurance, retirement, investments, and financial strategies.",
          "State license required.",
        ].join(" ");
      },
    },
  };
  const root = {
    location: {
      get href() {
        return href;
      },
    },
    get textContent() {
      return detailText;
    },
    querySelectorAll: () => [],
  };
  const extractor = {
    extractVisibleJobs: () => [job],
    dedupeJobs: (items) => items,
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl: "https://app.joinhandshake.com/job-search/11168478",
    maxPasses: 1,
    wait: async () => {
      waits += 1;
      if (waits === 2) {
        href = job.source_url;
        detailText =
          "Tenvos Deep Learning Research Intern At a glance Remote Job description Join our small, innovative startup at Tenvos AI.";
      }
    },
    resetScroll: async () => {},
    scroll: async () => ({ moved: false }),
  });

  assert.match(result.jobs[0].description, /innovative startup/);
  assert.doesNotMatch(result.jobs[0].description, /Now Expanding/);
});

test("collectJobsAcrossScroll keeps card-only results without rescanning for a fuller later pass", async () => {
  let scrollCalls = 0;
  let extractCalls = 0;
  const extractor = {
    extractVisibleJobs: () => {
      extractCalls += 1;
      return [
        {
          title: "Software Engineer Internship",
          company: "Coursicle",
          description: "Coursicle Software Engineer Internship New York, NY",
          source_url: "https://app.joinhandshake.com/job-search/11168427",
        },
      ];
    },
    dedupeJobs: (items) => items,
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root: {},
    baseUrl: "https://app.joinhandshake.com/job-search/999?per_page=1",
    maxPasses: 10,
    stablePasses: 2,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => {
      scrollCalls += 1;
      return { moved: true };
    },
  });

  assert.equal(result.passes, 1);
  assert.equal(extractCalls, 1);
  assert.equal(scrollCalls, 0);
  assert.equal(result.jobs.length, 1);
  assert.match(result.jobs[0].description, /Software Engineer Internship/);
  assert.equal(result.stopReason, "visible_jobs_visited_once");
});

test("collectJobsAcrossScroll reports detail capture debug reasons", async () => {
  let href = "https://app.joinhandshake.com/job-search/111";
  let detailText = "";
  const jobs = [
    {
      title: "No Trigger Job",
      company: "Acme",
      description: "Acme No Trigger Job",
      source_url: "https://app.joinhandshake.com/job-search/111",
    },
    {
      title: "Click Stuck Job",
      company: "Bolt",
      description: "Bolt Click Stuck Job",
      source_url: "https://app.joinhandshake.com/job-search/222",
      detailTrigger: {
        click: () => {
          detailText =
            "Bolt Click Stuck Job Job description This detail is long enough to be useful, but the URL never changes to the expected job id.";
        },
      },
    },
    {
      title: "Short Detail Job",
      company: "Coda",
      description: "Coda Short Detail Job",
      source_url: "https://app.joinhandshake.com/job-search/333",
      detailTrigger: {
        click: () => {
          href = "https://app.joinhandshake.com/job-search/333";
          detailText = "Coda Short Detail Job Job description Short.";
        },
      },
    },
  ];
  const root = {
    location: {
      get href() {
        return href;
      },
    },
    get textContent() {
      return detailText;
    },
    querySelectorAll: () => [],
  };
  const extractor = {
    extractVisibleJobs: () => jobs,
    dedupeJobs: (items) => items,
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl: "https://app.joinhandshake.com/job-search/999?per_page=3",
    maxPasses: 2,
    stablePasses: 1,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => ({ moved: true }),
  });

  assert.equal(result.stopReason, "visible_jobs_visited_once");
  assert.equal(result.snapshots.at(-1).stopReason, "visible_jobs_visited_once");
  assert.equal(result.detailDebug.find((item) => item.jobId === "111").status, "no_usable_detail_trigger");
  assert.equal(result.detailDebug.find((item) => item.jobId === "222").status, "click_does_not_select_job");
  assert.equal(result.detailDebug.find((item) => item.jobId === "333").status, "detail_captured_not_useful");
});

test("collectJobsAcrossScroll accepts matching detail when surrounding page text names another company later", async () => {
  let detailText = "Loading...";
  const jobs = [
    {
      title: "Sales Account Manager",
      company: "Quake Global",
      description: "Quake Global Sales Account Manager San Diego, CA",
      source_url: "https://app.joinhandshake.com/job-search/11168346",
      detailTrigger: {
        click: () => {
          detailText = [
            "Job description Build customer relationships for industrial IoT accounts.",
            "Minimum Requirements CRM experience and account planning.",
            "Other visible listings",
            "Persona Infrastructure Engineering Resident",
          ].join(" ");
        },
      },
    },
    {
      title: "Infrastructure Engineering Resident",
      company: "Persona",
      description: "Persona Infrastructure Engineering Resident",
      source_url: "https://app.joinhandshake.com/job-search/999",
      detailTrigger: {
        click: () => {},
      },
    },
  ];
  const root = {
    get textContent() {
      return detailText;
    },
    querySelectorAll: () => [],
  };
  const extractor = {
    extractVisibleJobs: () => jobs,
    dedupeJobs: (items) => items,
  };

  const result = await collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl: "https://app.joinhandshake.com/job-search/123",
    maxPasses: 1,
    wait: async () => {},
    resetScroll: async () => {},
    scroll: async () => ({ moved: false }),
  });

  assert.match(result.jobs[0].description, /industrial IoT accounts/);
});

test("collectJobsAcrossScroll does not revisit the initially selected job after scanning", async () => {
  let selectedJob = "111";
  const clicked = [];
  const jobs = ["111", "222"].map((id) => ({
    title: `Job ${id}`,
    company: "Neoboard",
    description: `Job ${id}`,
    source_url: `https://app.joinhandshake.com/job-search/${id}`,
    detailTrigger: {
      click: () => {
        clicked.push(id);
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

  assert.equal(selectedJob, "222");
  assert.deepEqual(clicked, ["222"]);
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

function makeJobWithTrigger(id, click) {
  return {
    title: `Job ${id}`,
    company: "Neoboard",
    description: `Job ${id}`,
    source_url: `https://app.joinhandshake.com/job-search/${id}`,
    detailTrigger: { click },
  };
}
