(function initializeCaptureWidget() {
  const CAPTURE_MESSAGE = "HFF_CAPTURE_JOBS";
  const extractor = window.HandshakeFitFinderExtractor;
  const capture = window.HandshakeFitFinderCapture;

  if (!extractor || !capture || document.getElementById("hff-capture-widget")) {
    return;
  }

  const widget = document.createElement("div");
  widget.id = "hff-capture-widget";
  widget.innerHTML = `
    <div class="hff-title">Fit Finder ${getExtensionVersionLabel()}</div>
    <button type="button" id="hff-capture-button">Capture visible jobs</button>
    <div id="hff-capture-status" role="status">Ready</div>
    <details id="hff-capture-debug">
      <summary>Debug</summary>
      <pre id="hff-capture-debug-output">No capture yet</pre>
    </details>
  `;
  document.documentElement.appendChild(widget);

  const button = document.getElementById("hff-capture-button");
  const status = document.getElementById("hff-capture-status");
  const debugOutput = document.getElementById("hff-capture-debug-output");

  button.addEventListener("click", async () => {
    const stats = extractor.extractionStats(document);
    setStatus(status, "Scanning visible results...");
    const captureResult = await capture.collectJobsAcrossScroll({
      extractor,
      root: document,
      baseUrl: window.location.href,
      onProgress: (snapshot) => {
        setStatus(status, `Scanning pass ${snapshot.pass}: ${snapshot.totalJobs} job${snapshot.totalJobs === 1 ? "" : "s"}`);
      },
    });
    const jobs = captureResult.jobs.map(stripDomReferences);
    writeDebug(debugOutput, {
      phase: "extracted",
      url: window.location.href,
      stats,
      passes: captureResult.passes,
      snapshots: captureResult.snapshots,
      jobs: jobs.slice(0, 8),
    });
    if (jobs.length === 0) {
      setStatus(status, `No visible jobs found (${stats.jobLinks} links, ${stats.jobCards} cards)`);
      return;
    }

    setStatus(status, `Capturing ${jobs.length} visible job${jobs.length === 1 ? "" : "s"}...`);
    try {
      const response = await sendCaptureMessage(CAPTURE_MESSAGE, jobs);
      if (!response.ok) {
        throw new Error(response.error || "Extension background capture failed");
      }
      const rankedJobs = response.jobs;
      writeDebug(debugOutput, {
      phase: "captured",
      sent: jobs.length,
      received: rankedJobs.length,
      topScore: rankedJobs[0]?.fit?.score ?? null,
      extraction: {
        stats,
        passes: captureResult.passes,
        snapshots: captureResult.snapshots,
      },
    });
      applyScoreBadges(rankedJobs);
      setStatus(status, `Captured ${rankedJobs.length} job${rankedJobs.length === 1 ? "" : "s"}`);
    } catch (error) {
      writeDebug(debugOutput, {
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      setStatus(status, "Could not reach local API");
      console.error("[Handshake Fit Finder]", error);
    }
  });
})();

function sendCaptureMessage(type, jobs) {
  if (!chrome?.runtime?.sendMessage) {
    return Promise.reject(new Error("Chrome extension messaging is unavailable"));
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, jobs }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(response || { ok: false, error: "No response from extension background worker" });
    });
  });
}

function stripDomReferences(job) {
  return {
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    source_url: job.source_url,
    source: job.source,
  };
}

function applyScoreBadges(rankedJobs) {
  const extractor = window.HandshakeFitFinderExtractor;
  const visibleJobs = extractor.extractVisibleJobs(document, window.location.origin);
  const scoresByUrl = new Map(rankedJobs.map((job) => [job.source_url, job.fit.score]));

  for (const visibleJob of visibleJobs) {
    const score = scoresByUrl.get(visibleJob.source_url);
    if (score === undefined || !visibleJob.card) {
      continue;
    }
    let badge = visibleJob.card.querySelector?.(".hff-score-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "hff-score-badge";
      visibleJob.card.appendChild(badge);
    }
    badge.textContent = `${score}% fit`;
    badge.dataset.tone = score >= 85 ? "strong" : score >= 70 ? "medium" : "weak";
  }
}

function setStatus(status, message) {
  status.textContent = message;
}

function writeDebug(debugOutput, value) {
  debugOutput.textContent = JSON.stringify(value, null, 2);
}

function getExtensionVersionLabel() {
  const version = chrome?.runtime?.getManifest?.().version;
  return version ? `v${version}` : "";
}
