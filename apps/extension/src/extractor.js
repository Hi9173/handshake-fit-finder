(function attachExtractor(global) {
  const JOB_LINK_SELECTOR = 'a[href*="/job-search/"], a[href*="/stu/jobs/"]';
  const SAVE_JOB_BUTTON_SELECTOR = 'button[aria-label^="Save "]';
  const JOB_CARD_SELECTOR = [
    "article",
    "li",
    '[role="listitem"]',
    '[data-test*="job"]',
    '[data-testid*="job"]',
    '[data-hook*="job"]',
    '[class*="job"]',
    "button[aria-label]",
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

    const saveButtons = Array.from(root.querySelectorAll(SAVE_JOB_BUTTON_SELECTOR));
    const jobsFromSaveButtons = saveButtons
      .map((button) => extractJobFromSaveButton(button, baseUrl))
      .filter((job) => looksLikeJob(job));

    return enrichCurrentJobDetails(
      dedupeJobs([...jobsFromAnchors, ...jobsFromCards, ...jobsFromSaveButtons]),
      root,
      baseUrl,
    );
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
      detailTrigger: anchor,
    };
  }

  function extractJobFromCard(card, baseUrl) {
    const link = typeof card.querySelector === "function" ? card.querySelector("a[href]") : null;
    const ariaLabel = cleanText(typeof card.getAttribute === "function" ? card.getAttribute("aria-label") : "");
    if (isActionButtonLabel(ariaLabel)) {
      return {};
    }
    const logoAlt =
      typeof card.querySelector === "function"
        ? cleanText(card.querySelector("img[alt]")?.getAttribute("alt"))
        : "";
    const lines = textLines([ariaLabel, card ? card.textContent : ""].filter(Boolean).join("\n"));
    const company = logoAlt || firstDifferentLine(lines, ariaLabel || lines[0]) || "Unknown company";
    const title =
      cleanText(link ? link.textContent : "") ||
      titleFromAriaLabel(ariaLabel, company) ||
      lines[0] ||
      "Untitled job";
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
      detailTrigger: link || card,
    };
  }

  function extractJobFromSaveButton(button, baseUrl) {
    const label = cleanText(typeof button.getAttribute === "function" ? button.getAttribute("aria-label") : "");
    const title = cleanText(label.replace(/^Save\s+/i, ""));
    const card = closestActionCard(button, title);
    const cardText = cleanText(card ? card.textContent : "");
    const company = inferCompanyFromCardText(cardText, title) || "Unknown company";
    const location = inferLocation([cardText]);

    return {
      title,
      company,
      location,
      description: cardText || title,
      source_url: fallbackSourceUrl(baseUrl, title, company),
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

  function enrichCurrentJobDetails(jobs, root, baseUrl) {
    const currentJobId = jobIdFromUrl(baseUrl);
    const detailText = visibleDetailText(root);
    if (!currentJobId || !detailText) {
      return jobs;
    }

    return jobs.map((job) => {
      if (jobIdFromUrl(job.source_url) !== currentJobId) {
        return job;
      }
      return {
        ...job,
        description: appendUniqueText(job.description, detailText),
      };
    });
  }

  function visibleDetailText(root) {
    const text = cleanText(root.body?.textContent || root.textContent);
    const match = text.match(/\b(job description|minimum requirements|requirements|responsibilities)\b/i);
    return match ? text.slice(match.index) : "";
  }

  function jobIdFromUrl(url) {
    try {
      const parsed = new URL(url, "https://app.joinhandshake.com");
      return parsed.pathname.match(/\/(?:stu\/jobs|jobs|job-search)\/(\d+)/)?.[1] || "";
    } catch (_error) {
      return "";
    }
  }

  function appendUniqueText(baseText, extraText) {
    const base = cleanText(baseText);
    const extra = cleanText(extraText);
    if (!extra || base.includes(extra)) {
      return base;
    }
    return `${base}\n${extra}`.trim();
  }

  function closestJobCard(anchor) {
    if (typeof anchor.closest !== "function") {
      return anchor;
    }
    return anchor.closest("article, li, [data-test*='job'], [data-hook*='job'], div") || anchor;
  }

  function closestActionCard(element, title) {
    let current = element;
    let best = null;
    for (let depth = 0; current && depth < 8; depth += 1) {
      const text = cleanText(current.textContent);
      if (title && text.includes(title) && text.length > title.length && text.length < 600) {
        best = current;
      }
      current = current.parentElement;
    }
    return best || element;
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

  function titleFromAriaLabel(label, company) {
    if (!label || !company || !label.toLowerCase().startsWith(company.toLowerCase())) {
      return "";
    }
    return cleanText(
      label
        .slice(company.length)
        .replace(/\s+(?:unpaid|paid|\$[\d,]|posted\b|apply by\b|remote\b|hybrid\b|onsite\b|promoted\b|new\b).*/i, ""),
    );
  }

  function inferCompanyFromCardText(text, title) {
    const index = text.indexOf(title);
    if (index <= 0) {
      return "";
    }
    const company = cleanText(text.slice(0, index));
    return company.length <= 90 ? company : "";
  }

  function isActionButtonLabel(label) {
    return /^(save|hide|clear|close|open|more actions|show more|apply|follow|first page|previous page|next page|last page)\b/i.test(
      label,
    );
  }


  function inferLocation(lines) {
    for (const line of lines) {
      const workMode = line.match(/(remote|hybrid|onsite)(?:\b|[∙·]|$)/i);
      if (workMode) {
        if (line.length <= 60) {
          return line;
        }
        return `${workMode[1][0].toUpperCase()}${workMode[1].slice(1).toLowerCase()}`;
      }
      const cityState = line.match(/\b([A-Z][a-zA-Z .'-]+,\s*[A-Z]{2})\b/);
      if (cityState) {
        return cityState[1];
      }
    }
    return "";
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
    if (job.title.length > 160 || job.company.length > 120 || isSearchChrome(job)) {
      return false;
    }
    const text = `${job.title} ${job.company} ${job.location} ${job.description}`.toLowerCase();
    return /\b(job|intern|analyst|engineer|developer|associate|specialist|manager|remote|hybrid|onsite)\b/.test(text);
  }

  function isSearchChrome(job) {
    const title = cleanText(job.title).toLowerCase();
    const description = cleanText(job.description).toLowerCase();
    return (
      /^(job search filters|filters|suggested for you|search results)$/.test(title) ||
      (description.includes("job search filters") && description.includes("filters")) ||
      /\b\d+\/300\d* of 300 characters used\b/.test(description)
    );
  }

  function extractionStats(root) {
    return {
      jobLinks: root.querySelectorAll(JOB_LINK_SELECTOR).length,
      jobCards: root.querySelectorAll(JOB_CARD_SELECTOR).length,
      saveButtons: root.querySelectorAll(SAVE_JOB_BUTTON_SELECTOR).length,
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
