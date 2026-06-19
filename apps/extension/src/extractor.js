(function attachExtractor(global) {
  const JOB_LINK_SELECTOR = 'a[href*="/stu/jobs/"], a[href*="/jobs/"]';

  function extractVisibleJobs(root, baseUrl) {
    const anchors = Array.from(root.querySelectorAll(JOB_LINK_SELECTOR));
    const jobs = anchors
      .map((anchor) => extractJobFromAnchor(anchor, baseUrl))
      .filter((job) => job.title && job.company && job.source_url);
    return dedupeJobs(jobs);
  }

  function extractJobFromAnchor(anchor, baseUrl) {
    const card = closestJobCard(anchor);
    const lines = textLines(card ? card.textContent : anchor.textContent);
    const title = cleanText(anchor.textContent) || lines[0] || "Untitled job";
    const company = firstDifferentLine(lines, title) || "Unknown company";
    const location = inferLocation(lines);
    const description = lines.join("\n");
    const sourceUrl = absoluteUrl(anchor.getAttribute("href"), baseUrl);

    return {
      title,
      company,
      location,
      description,
      source_url: sourceUrl,
      source: "handshake-extension",
      card,
    };
  }

  function dedupeJobs(jobs) {
    const seen = new Set();
    const unique = [];
    for (const job of jobs) {
      const key = job.source_url || `${job.title}:${job.company}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(job);
      }
    }
    return unique;
  }

  function closestJobCard(anchor) {
    if (typeof anchor.closest !== "function") {
      return anchor;
    }
    return anchor.closest("article, li, [data-test*='job'], [data-hook*='job'], div") || anchor;
  }

  function textLines(value) {
    return String(value || "")
      .split(/\n| {2,}/)
      .map(cleanText)
      .filter(Boolean);
  }

  function firstDifferentLine(lines, title) {
    const normalizedTitle = cleanText(title).toLowerCase();
    return lines.find((line) => line.toLowerCase() !== normalizedTitle) || "";
  }

  function inferLocation(lines) {
    return (
      lines.find((line) => /\b(remote|hybrid|onsite)\b/i.test(line)) ||
      lines.find((line) => /,\s*[A-Z]{2}\b/.test(line)) ||
      ""
    );
  }

  function absoluteUrl(href, baseUrl) {
    if (!href) {
      return "";
    }
    try {
      return new URL(href, baseUrl).toString();
    } catch (_error) {
      return href;
    }
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  const api = {
    extractVisibleJobs,
    extractJobFromAnchor,
    dedupeJobs,
    textLines,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.HandshakeFitFinderExtractor = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
