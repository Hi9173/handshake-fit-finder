(function initializeCaptureWidget(global) {
  const CAPTURE_MESSAGE = "HFF_CAPTURE_JOBS";
  const extractor = global.HandshakeFitFinderExtractor;
  const capture = global.HandshakeFitFinderCapture;
  const document = global.document;

  if (!document || !extractor || !capture || document.getElementById("hff-capture-widget")) {
    return;
  }

  const widget = document.createElement("div");
  widget.id = "hff-capture-widget";
  widget.innerHTML = `
    <div class="hff-title">Fit Finder ${getExtensionVersionLabel()}</div>
    <button type="button" id="hff-capture-button">Capture visible jobs</button>
    <div id="hff-capture-status" role="status">Ready</div>
    <div id="hff-scan-progress" hidden>
      <progress id="hff-scan-progress-bar" value="0" max="1"></progress>
      <span id="hff-scan-progress-text"></span>
    </div>
    <details id="hff-capture-debug">
      <summary>Debug</summary>
      <pre id="hff-capture-debug-output">No capture yet</pre>
    </details>
  `;
  document.documentElement.appendChild(widget);

  const button = document.getElementById("hff-capture-button");
  const status = document.getElementById("hff-capture-status");
  const progress = document.getElementById("hff-scan-progress");
  const debugOutput = document.getElementById("hff-capture-debug-output");
  initWidgetPosition(widget, global);

  button.addEventListener("click", async () => {
    const stats = extractor.extractionStats(document);
    hideScanProgress(progress);
    setStatus(status, "Scanning visible results...");
    const captureResult = await capture.collectJobsAcrossScroll({
      extractor,
      root: document,
      baseUrl: global.location.href,
      onProgress: (snapshot) => {
        updateScanProgress(progress, snapshot);
        setStatus(status, "Scanning visible results...");
      },
    });
    hideScanProgress(progress);
    const jobs = captureResult.jobs.map(stripDomReferences);
    writeDebug(debugOutput, {
      phase: "extracted",
      url: global.location.href,
      stats,
      passes: captureResult.passes,
      stopReason: captureResult.stopReason,
      snapshots: captureResult.snapshots,
      detailDebug: captureResult.detailDebug,
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
          stopReason: captureResult.stopReason,
          snapshots: captureResult.snapshots,
          detailDebug: captureResult.detailDebug,
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
})(typeof globalThis !== "undefined" ? globalThis : window);

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
  const extractor = globalThis.HandshakeFitFinderExtractor;
  const visibleJobs = extractor.extractVisibleJobs(document, location.origin);
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

function updateScanProgress(progress, snapshot) {
  const state = formatScanProgress(snapshot);
  const bar = progress.querySelector("#hff-scan-progress-bar");
  const text = progress.querySelector("#hff-scan-progress-text");
  progress.hidden = false;
  text.textContent = state.text;

  if (state.mode === "bar") {
    bar.max = state.max;
    bar.value = state.value;
    return;
  }

  bar.removeAttribute("value");
}

function hideScanProgress(progress) {
  progress.hidden = true;
}

function formatScanProgress(snapshot) {
  const totalJobs = Math.max(0, Number(snapshot?.totalJobs) || 0);
  const targetJobCount = Math.max(0, Number(snapshot?.targetJobCount) || 0);
  if (targetJobCount > 0) {
    return {
      mode: "bar",
      text: `Scanned ${Math.min(totalJobs, targetJobCount)} of ${targetJobCount} jobs`,
      value: Math.min(totalJobs, targetJobCount),
      max: targetJobCount,
    };
  }

  return {
    mode: "indeterminate",
    text: `Already scanned ${totalJobs} job${totalJobs === 1 ? "" : "s"}`,
  };
}

function writeDebug(debugOutput, value) {
  debugOutput.textContent = JSON.stringify(value, null, 2);
  persistDebugLog(value);
}

function persistDebugLog(value) {
  if (!chrome?.runtime?.sendMessage) {
    return;
  }
  chrome.runtime.sendMessage({ type: "HFF_DEBUG_LOG", payload: value }, (response) => {
    const runtimeError = chrome.runtime.lastError;
    if (runtimeError || response?.ok === false) {
      console.warn("[Handshake Fit Finder] Could not persist debug log", runtimeError?.message || response?.error);
    }
  });
}

function getExtensionVersionLabel() {
  const version = chrome?.runtime?.getManifest?.().version;
  return version ? `v${version}` : "";
}

function initWidgetPosition(widget, global) {
  const storageKey = "hff-widget-position";
  const saved = readWidgetPosition(global, storageKey);
  if (saved) {
    applyWidgetPosition(widget, saved.left, saved.top);
  }

  const title = widget.querySelector(".hff-title");
  title.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    const rect = widget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    title.setPointerCapture?.(event.pointerId);

    const move = (moveEvent) => {
      const next = clampWidgetPosition(
        moveEvent.clientX - offsetX,
        moveEvent.clientY - offsetY,
        rect.width,
        rect.height,
        global.innerWidth,
        global.innerHeight,
      );
      applyWidgetPosition(widget, next.left, next.top);
    };
    const up = () => {
      title.removeEventListener("pointermove", move);
      title.removeEventListener("pointerup", up);
      saveWidgetPosition(global, storageKey, widget);
    };

    title.addEventListener("pointermove", move);
    title.addEventListener("pointerup", up);
  });
}

function readWidgetPosition(global, storageKey) {
  try {
    const saved = JSON.parse(global.localStorage?.getItem(storageKey) || "null");
    return Number.isFinite(saved?.left) && Number.isFinite(saved?.top) ? saved : null;
  } catch (_error) {
    return null;
  }
}

function saveWidgetPosition(global, storageKey, widget) {
  try {
    const rect = widget.getBoundingClientRect();
    global.localStorage?.setItem(storageKey, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
  } catch (_error) {
    // Ignore storage failures; dragging should still work for the current page.
  }
}

function applyWidgetPosition(widget, left, top) {
  widget.style.left = `${left}px`;
  widget.style.top = `${top}px`;
  widget.style.right = "auto";
}

function clampWidgetPosition(left, top, width, height, viewportWidth, viewportHeight) {
  const margin = 8;
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const maxTop = Math.max(margin, viewportHeight - height - margin);
  return {
    left: Math.min(Math.max(margin, Math.round(left)), maxLeft),
    top: Math.min(Math.max(margin, Math.round(top)), maxTop),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    clampWidgetPosition,
    formatScanProgress,
  };
}
