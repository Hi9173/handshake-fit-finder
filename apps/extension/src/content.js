(function initializeCaptureWidget() {
  const API_URL = "http://127.0.0.1:8000/api/extension/capture";
  const extractor = window.HandshakeFitFinderExtractor;

  if (!extractor || document.getElementById("hff-capture-widget")) {
    return;
  }

  const widget = document.createElement("div");
  widget.id = "hff-capture-widget";
  widget.innerHTML = `
    <div class="hff-title">Fit Finder</div>
    <button type="button" id="hff-capture-button">Capture visible jobs</button>
    <div id="hff-capture-status" role="status">Ready</div>
  `;
  document.documentElement.appendChild(widget);

  const button = document.getElementById("hff-capture-button");
  const status = document.getElementById("hff-capture-status");

  button.addEventListener("click", async () => {
    const jobs = extractor.extractVisibleJobs(document, window.location.origin).map(stripDomReferences);
    if (jobs.length === 0) {
      setStatus(status, "No visible jobs found");
      return;
    }

    setStatus(status, `Capturing ${jobs.length} visible job${jobs.length === 1 ? "" : "s"}...`);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs }),
      });
      if (!response.ok) {
        throw new Error(`Local API returned ${response.status}`);
      }
      const rankedJobs = await response.json();
      applyScoreBadges(rankedJobs);
      setStatus(status, `Captured ${rankedJobs.length} job${rankedJobs.length === 1 ? "" : "s"}`);
    } catch (error) {
      setStatus(status, "Start the local API on port 8000");
      console.error("[Handshake Fit Finder]", error);
    }
  });
})();

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
