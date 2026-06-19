const assert = require("node:assert/strict");
const test = require("node:test");

const { captureJobs } = require("../src/background.js");

test("captureJobs posts visible jobs to the local API", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => [{ id: 1, title: "Data Analyst", fit: { score: 94 } }],
    };
  };

  const result = await captureJobs(
    [{ title: "Data Analyst", company: "Bright Metrics", source_url: "https://example.test/jobs/1" }],
    fakeFetch,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8000/api/extension/capture");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body).jobs[0].title, "Data Analyst");
  assert.equal(result[0].fit.score, 94);
});

test("captureJobs throws a useful error when the local API rejects the request", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 500,
    text: async () => "database unavailable",
  });

  await assert.rejects(
    () => captureJobs([{ title: "Data Analyst" }], fakeFetch),
    /Local API returned 500: database unavailable/,
  );
});
