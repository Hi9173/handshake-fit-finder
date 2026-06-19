(function attachExtractor(global) {
  const JOB_LINK_SELECTOR = 'a[href*="/stu/jobs/"], a[href*="/jobs/"]';
  const JOB_CARD_SELECTOR = [
    "article",
    "li",
    '[role="listitem"]',
    '[data-test*="job"]',
    '[data-testid*="job"]',
    '[data-hook*="job"]',
    '[class*="job"]',
  ].join(", ");

  function extractVisibleJobs(root, baseUrl) {
    const anchors = Array.from(root.querySelectorAll(JOB_LINK_SELECTOR));
    const jobsFromAnchors = anchors
      .map((anchor) => extractJobFromAnchor(anchor, baseUrl))
      .filter((job) => job.title && job.company && job.source_url);

    const cards = Array.from(root.querySelectorAll(JOB_CARD_SELECTOR));
    const jobsFromCards = cards
      .map((card) => extractJobFromCard(card, baseUrl))
      .filter((job) => looksLikeJob(job));
    return dedupeJobs([...jobsFromAnchors, ...jobsFromCards]);
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

  function extractJobFromCard(card, baseUrl) {
    const link = typeof card.querySelector === "function" ? card.querySelector("a[href]") : null;
    const lines = textLines(card ? card.textContent : "");
    const title = cleanText(link ? link.textContent : "") || lines[0] || "Untitled job";
    const company = firstDifferentLine(lines, title) || "Unknown company";
    const location = inferLocation(lines);
    const sourceUrl =
      absoluteUrl(link ? link.getAttribute("href") : "", baseUrl) ||
      fallbackSourceUrl(baseUrl, title, company);

    return {
      title,
      company,
      location,
      description: lines.join("\n"),
      source_url: sourceUrl,
      source: "handshake-extension",
      card,
    };
  }

  function dedupeJobs(jobs) {
    const seenSources = new Set();
    const seenIdentities = new Set();
    const unique = [];
    for (const job of jobs) {
      const sourceKey = job.source_url || "";
      const identityKey = `${cleanText(job.title).toLowerCase()}:${cleanText(job.company).toLowerCase()}`;
      if (sourceKey && seenSources.has(sourceKey)) {
        continue;
      }
      if (identityKey !== ":" && seenIdentities.has(identityKey)) {
        continue;
      }
      if (sourceKey) {
        seenSources.add(sourceKey);
      }
      seenIdentities.add(identityKey);
      unique.push(job);
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

  function fallbackSourceUrl(baseUrl, title, company) {
    const slug = cleanText(`${title}-${company}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    return `${baseUrl.split("#")[0]}#${slug || "visible-job"}`;
  }

  function looksLikeJob(job) {
    if (!job.title || !job.company || job.company === "Unknown company" || job.title === job.company) {
      return false;
    }
    const text = `${job.title} ${job.company} ${job.location} ${job.description}`.toLowerCase();
    return /\b(job|intern|analyst|engineer|developer|associate|specialist|manager|remote|hybrid|onsite)\b/.test(text);
  }

  function extractionStats(root) {
    return {
      jobLinks: root.querySelectorAll(JOB_LINK_SELECTOR).length,
      jobCards: root.querySelectorAll(JOB_CARD_SELECTOR).length,
    };
  }

  const api = {
    extractVisibleJobs,
    extractJobFromAnchor,
    extractJobFromCard,
    dedupeJobs,
    extractionStats,
    textLines,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.HandshakeFitFinderExtractor = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
