(function attachCapturePage(global) {
  async function collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl,
    wait = defaultWait,
    onProgress = () => {},
  }) {
    const snapshots = [];
    const initialJobId = jobIdFromUrl(baseUrl);
    const detailDebug = [];

    const extractedJobs = extractor.extractVisibleJobs(root, baseUrl);
    const visibleJobs = extractor.dedupeJobs(await captureDetailsForVisibleJobs(extractedJobs, root, wait, initialJobId, detailDebug));
    const allJobs = mergeBetterJobs([], visibleJobs);
    const stopReason = "visible_jobs_visited_once";
    const snapshot = {
      pass: 1,
      visibleJobs: visibleJobs.length,
      totalJobs: allJobs.length,
      targetJobCount: extractedJobs.length,
      stopReason,
    };
    snapshots.push(snapshot);
    onProgress(snapshot);

    return {
      jobs: allJobs,
      passes: snapshots.length,
      snapshots,
      stopReason,
      detailDebug,
    };
  }

  async function captureDetailsForVisibleJobs(jobs, root, wait, initialJobId, detailDebug) {
    const enrichedJobs = [];
    for (const job of jobs) {
      const debug = detailDebugEntry(job);
      detailDebug.push(debug);
      const currentDetail = visibleDetailText(root, job);
      if (initialJobId && jobIdFromUrl(job.source_url) === initialJobId) {
        const currentMatch = detailMatchStatus(currentDetail, job, jobs, root);
        const result =
          currentDetail && currentMatch.ok && isUsefulDetailText(currentDetail)
            ? { detailText: currentDetail, status: "detail_captured", attempts: 0, ...currentMatch }
            : await waitForChangedDetail(root, wait, "", job, jobs);
        Object.assign(debug, summarizeDetailResult(result));
        enrichedJobs.push(result.detailText ? { ...job, description: appendUniqueText(job.description, result.detailText) } : job);
        continue;
      }

      const trigger = detailTriggerForJob(job);
      if (!trigger || typeof trigger.click !== "function") {
        debug.status = "no_usable_detail_trigger";
        enrichedJobs.push(job);
        continue;
      }

      const previousDetail = visibleDetailText(root);
      trigger.click();
      const result = await waitForChangedDetail(root, wait, previousDetail, job, jobs);
      Object.assign(debug, summarizeDetailResult(result));
      enrichedJobs.push(result.detailText ? { ...job, description: appendUniqueText(job.description, result.detailText) } : job);
    }
    return enrichedJobs;
  }

  function detailMatchStatus(detailText, job, allJobs, root) {
    const expectedId = jobIdFromUrl(job.source_url);
    const selectedUrl = root?.location?.href || global.location?.href || "";
    const selectedId = jobIdFromUrl(selectedUrl);
    if (expectedId && selectedUrl && !selectedId) {
      return { ok: false, status: "timeout_for_url_to_load", expectedId, selectedId };
    }
    if (expectedId && selectedId && expectedId !== selectedId) {
      return { ok: false, status: "click_does_not_select_job", expectedId, selectedId };
    }
    const detail = cleanText(detailText).toLowerCase();
    if (!detail) {
      return { ok: false, status: "timeout_for_detail_to_load", expectedId, selectedId };
    }
    const opening = detail.slice(0, 120);
    const company = cleanText(job.company).toLowerCase();
    if (company && opening.includes(company)) {
      return { ok: true, status: "detail_matches_job", expectedId, selectedId };
    }
    const rejected = allJobs.some((other) => {
      const otherCompany = cleanText(other.company).toLowerCase();
      return otherCompany && otherCompany !== company && opening.includes(otherCompany);
    });
    return rejected
      ? { ok: false, status: "guard_rejects_detail", expectedId, selectedId }
      : { ok: true, status: "detail_matches_job", expectedId, selectedId };
  }

  function mergeBetterJobs(existingJobs, newJobs) {
    const merged = [];
    const indexes = new Map();
    for (const job of [...existingJobs, ...newJobs]) {
      const key = jobKey(job) || `${cleanText(job.title).toLowerCase()}:${cleanText(job.company).toLowerCase()}`;
      const index = indexes.get(key);
      if (index === undefined) {
        indexes.set(key, merged.length);
        merged.push(job);
      } else if (descriptionQuality(job) > descriptionQuality(merged[index])) {
        merged[index] = job;
      }
    }
    return merged;
  }

  function descriptionQuality(job) {
    const description = cleanText(job?.description);
    return description.length + (hasUsefulDescription(job) ? 10000 : 0);
  }

  function hasUsefulDescription(job) {
    const description = cleanText(job?.description);
    return isUsefulDetailText(description) && /\b(job description|about the role|about this role|minimum requirements|requirements|qualifications|responsibilities)\b/i.test(description);
  }

  function detailTriggerForJob(job) {
    return job?.detailTrigger || job?.card || null;
  }

  function jobKey(job) {
    return jobIdFromUrl(job?.source_url) || job?.source_url || "";
  }

  async function waitForChangedDetail(root, wait, previousDetail, job, allJobs) {
    let bestDetail = "";
    let lastResult = { status: "timeout_for_detail_to_load", expectedId: jobIdFromUrl(job.source_url), selectedId: "" };
    let bestResult = null;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      expandCollapsedDetails(root);
      const detailText = visibleDetailText(root, job);
      const match = detailMatchStatus(detailText, job, allJobs, root);
      lastResult = match;
      if (detailText && detailText !== previousDetail && isUsefulDetailText(detailText) && match.ok) {
        return { detailText, status: "detail_captured", attempts: attempt + 1, ...match };
      }
      if (detailText && detailText !== previousDetail && match.ok && detailText.length > bestDetail.length) {
        bestDetail = detailText;
        bestResult = { ...match, status: "detail_captured_not_useful" };
        lastResult = bestResult;
      }
      await wait(250);
    }
    return { detailText: bestDetail, attempts: 14, ...(bestResult || lastResult) };
  }

  function detailDebugEntry(job) {
    return {
      jobId: jobIdFromUrl(job.source_url),
      title: job.title,
      company: job.company,
      source_url: job.source_url,
      cardDescriptionLength: cleanText(job.description).length,
      status: "pending",
    };
  }

  function summarizeDetailResult(result) {
    return {
      status: result.status,
      attempts: result.attempts,
      expectedId: result.expectedId || "",
      selectedId: result.selectedId || "",
      detailLength: cleanText(result.detailText).length,
    };
  }

  function expandCollapsedDetails(root) {
    const buttons = Array.from(root.querySelectorAll?.("button") || []);
    for (const button of buttons) {
      if (cleanText(button.innerText || button.textContent) === "More") {
        button.click();
      }
    }
  }

  function visibleDetailText(root, job) {
    const text = cleanText(root.body?.innerText || root.body?.textContent || root.innerText || root.textContent);
    const headingStart = text.search(
      /\b(job description|about the role|about this role|about us|minimum requirements|requirements|qualifications|responsibilities)\b/i,
    );
    const start = job ? jobDetailStart(text, job, headingStart) : headingStart;
    if (start < 0) {
      return "";
    }
    const detailText = text.slice(start);
    const stop = detailText.search(/\b(similar jobs|alumni in similar roles)\b/i);
    return stop > 0 ? detailText.slice(0, stop) : detailText;
  }

  function jobDetailStart(text, job, headingStart) {
    const lowerText = text.toLowerCase();
    const before = headingStart >= 0 ? headingStart : text.length;
    const title = cleanText(job.title).toLowerCase();
    const company = cleanText(job.company).toLowerCase();
    const titleStart = title ? lowerText.lastIndexOf(title, before) : -1;
    if (titleStart >= 0) {
      return titleStart;
    }
    const companyStart = company ? lowerText.lastIndexOf(company, before) : -1;
    return companyStart >= 0 ? companyStart : headingStart;
  }

  function isUsefulDetailText(text) {
    return text.length > 180 && !/^loading\.{0,3}$/i.test(text);
  }

  function appendUniqueText(baseText, extraText) {
    const base = cleanText(baseText);
    const extra = cleanText(extraText);
    if (!extra || base.includes(extra)) {
      return base;
    }
    return `${base}\n${extra}`.trim();
  }

  async function defaultWait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function jobIdFromUrl(url) {
    try {
      return new URL(url, "https://app.joinhandshake.com").pathname.match(/\/(?:job-search|stu\/jobs|jobs)\/(\d+)/)?.[1] || "";
    } catch {
      return "";
    }
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  const api = {
    collectJobsAcrossScroll,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.HandshakeFitFinderCapture = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
