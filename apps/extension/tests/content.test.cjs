const assert = require("node:assert/strict");
const test = require("node:test");

const { clampWidgetPosition, formatScanProgress } = require("../src/content.js");

test("formatScanProgress returns determinate progress when target count is known", () => {
  assert.deepEqual(formatScanProgress({ totalJobs: 6, targetJobCount: 20 }), {
    mode: "bar",
    text: "Scanned 6 of 20 jobs",
    value: 6,
    max: 20,
  });
});

test("formatScanProgress returns indeterminate progress when target count is unknown", () => {
  assert.deepEqual(formatScanProgress({ totalJobs: 2, targetJobCount: 0 }), {
    mode: "indeterminate",
    text: "Already scanned 2 jobs",
  });
});

test("clampWidgetPosition keeps the draggable widget inside the viewport", () => {
  assert.deepEqual(clampWidgetPosition(-20, 900, 240, 160, 800, 600), {
    left: 8,
    top: 432,
  });
});
