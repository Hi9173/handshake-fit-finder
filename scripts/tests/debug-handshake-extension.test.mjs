import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs, summarizeDiagnostics } from "../debug-handshake-extension.mjs";

test("parseArgs accepts a flexible Handshake URL and defaults", () => {
  const options = parseArgs([
    "--url",
    "https://app.joinhandshake.com/job-search/10926674?query=neoboard",
    "--port",
    "9333",
  ]);

  assert.equal(options.url, "https://app.joinhandshake.com/job-search/10926674?query=neoboard");
  assert.equal(options.port, 9333);
  assert.equal(options.artifactsDir, "debug-artifacts");
  assert.equal(options.extensionName, "Handshake Fit Finder");
});

test("parseArgs supports current tab mode and extension id", () => {
  const options = parseArgs(["--extension-id", "abc123", "--skip-extension-reload"]);

  assert.equal(options.url, "");
  assert.equal(options.extensionId, "abc123");
  assert.equal(options.skipExtensionReload, true);
});

test("summarizeDiagnostics flags under-capture against requested page size", () => {
  const summary = summarizeDiagnostics({
    url: "https://app.joinhandshake.com/job-search/10926674?per_page=45",
    debugPayload: {
      phase: "captured",
      sent: 7,
      received: 7,
      snapshots: [{ pass: 1, totalJobs: 7 }],
    },
    consoleErrors: [],
  });

  assert.equal(summary.status, "under-captured");
  assert.match(summary.message, /captured 7 of requested page size 45/i);
});

test("summarizeDiagnostics reports extension context invalidation", () => {
  const summary = summarizeDiagnostics({
    url: "https://app.joinhandshake.com/job-search/10926674?per_page=45",
    debugPayload: { phase: "captured", sent: 45, received: 45 },
    consoleErrors: [{ text: "Error: Extension context invalidated." }],
  });

  assert.equal(summary.status, "extension-context-invalidated");
});
