(function attachCapturePage(global) {
  async function collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl,
    maxPasses = 18,
    stablePasses = 2,
    wait = defaultWait,
    scroll = defaultScroll,
    resetScroll = defaultResetScroll,
    onProgress = () => {},
  }) {
    let allJobs = [];
    let lastTotal = 0;
    let stableCount = 0;
    const snapshots = [];
    const targetJobCount = requestedJobCount(baseUrl);
    const initialJobId = jobIdFromUrl(baseUrl);
    let restoreTrigger = null;

    await resetScroll(root);
    await wait(250);

    for (let pass = 0; pass < maxPasses; pass += 1) {
      const extractedJobs = extractor.extractVisibleJobs(root, baseUrl);
      if (!restoreTrigger && initialJobId) {
        restoreTrigger = detailTriggerForJob(extractedJobs.find((job) => jobIdFromUrl(job.source_url) === initialJobId));
      }
      const visibleJobs = await captureDetailsForVisibleJobs(extractedJobs, root, wait);
      allJobs = extractor.dedupeJobs([...allJobs, ...visibleJobs]);

      const snapshot = {
        pass: pass + 1,
        visibleJobs: visibleJobs.length,
        totalJobs: allJobs.length,
        targetJobCount,
      };
      snapshots.push(snapshot);
      onProgress(snapshot);

      if (allJobs.length === lastTotal) {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      lastTotal = allJobs.length;

      if (targetJobCount && allJobs.length >= targetJobCount) {
        break;
      }

      if (stableCount >= stablePasses && !targetJobCount) {
        break;
      }

      const scrollResult = await scroll(root);
      snapshot.scroll = scrollResult;
      if (scrollResult && scrollResult.moved === false && stableCount >= 1) {
        break;
      }
      await wait(350);
    }

    restoreTrigger?.click?.();

    return {
      jobs: targetJobCount ? allJobs.slice(0, targetJobCount) : allJobs,
      passes: snapshots.length,
      snapshots,
    };
  }

  async function captureDetailsForVisibleJobs(jobs, root, wait) {
    const enrichedJobs = [];
    for (const job of jobs) {
      const trigger = detailTriggerForJob(job);
      if (!trigger || typeof trigger.click !== "function") {
        enrichedJobs.push(job);
        continue;
      }

      const previousDetail = visibleDetailText(root);
      trigger.click();
      const detailText = await waitForChangedDetail(root, wait, previousDetail);
      enrichedJobs.push(detailText ? { ...job, description: appendUniqueText(job.description, detailText) } : job);
    }
    return enrichedJobs;
  }

  function detailTriggerForJob(job) {
    return job?.detailTrigger || job?.card || null;
  }

  async function waitForChangedDetail(root, wait, previousDetail) {
    let bestDetail = "";
    for (let attempt = 0; attempt < 14; attempt += 1) {
      expandCollapsedDetails(root);
      const detailText = visibleDetailText(root);
      if (detailText && detailText !== previousDetail && isUsefulDetailText(detailText)) {
        return detailText;
      }
      if (detailText && detailText !== previousDetail && detailText.length > bestDetail.length) {
        bestDetail = detailText;
      }
      await wait(250);
    }
    return bestDetail;
  }

  function expandCollapsedDetails(root) {
    const buttons = Array.from(root.querySelectorAll?.("button") || []);
    for (const button of buttons) {
      if (cleanText(button.innerText || button.textContent) === "More") {
        button.click();
      }
    }
  }

  function visibleDetailText(root) {
    const text = cleanText(root.body?.innerText || root.body?.textContent || root.innerText || root.textContent);
    const start = text.search(/\b(job description|minimum requirements|requirements|responsibilities)\b/i);
    if (start < 0) {
      return "";
    }
    const detailText = text.slice(start);
    const stop = detailText.search(/\b(similar jobs|alumni in similar roles)\b/i);
    return stop > 0 ? detailText.slice(0, stop) : detailText;
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

  async function defaultScroll(root) {
    const target = findBestScrollTarget(root);
    const before = getScrollTop(target);
    const step = getViewportHeight(target) * 0.85;
    scrollByAmount(target, step);
    const after = getScrollTop(target);
    return { moved: after > before, before, after, target: describeScrollTarget(target) };
  }

  async function defaultResetScroll(root) {
    const target = findBestScrollTarget(root);
    scrollToTop(target);
    return { target: describeScrollTarget(target) };
  }

  function findBestScrollTarget(root) {
    const doc = root.ownerDocument || root;
    const candidates = Array.from(doc.querySelectorAll("main, section, div, ul, [role='list']"));
    const jobsRegion = doc.querySelector?.('[aria-label="Jobs List"]');
    const jobsRegionCandidates = jobsRegion
      ? candidates.filter((element) => element === jobsRegion || jobsRegion.contains?.(element))
      : [];

    return bestScrollableElement(jobsRegionCandidates) || bestScrollableElement(candidates) || global;
  }

  function bestScrollableElement(candidates) {
    let best = null;
    let bestScrollableDistance = 0;
    for (const element of candidates) {
      const scrollableDistance = (element.scrollHeight || 0) - (element.clientHeight || 0);
      if (scrollableDistance > bestScrollableDistance) {
        bestScrollableDistance = scrollableDistance;
        best = element;
      }
    }

    return bestScrollableDistance > 120 ? best : null;
  }

  function getScrollTop(target) {
    if (target === global) {
      return global.scrollY || 0;
    }
    return target.scrollTop || 0;
  }

  function getViewportHeight(target) {
    if (target === global) {
      return global.innerHeight || 700;
    }
    return target.clientHeight || 700;
  }

  function scrollByAmount(target, top) {
    if (target === global) {
      global.scrollBy({ top, behavior: "instant" });
      return;
    }
    target.scrollBy({ top, behavior: "instant" });
  }

  function scrollToTop(target) {
    if (target === global) {
      global.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    target.scrollTop = 0;
  }

  function requestedJobCount(baseUrl) {
    try {
      const value = Number(new URL(baseUrl).searchParams.get("per_page"));
      return Number.isFinite(value) && value > 0 && value <= 100 ? value : 0;
    } catch {
      return 0;
    }
  }

  function jobIdFromUrl(url) {
    try {
      return new URL(url, "https://app.joinhandshake.com").pathname.match(/\/(?:job-search|stu\/jobs)\/(\d+)/)?.[1] || "";
    } catch {
      return "";
    }
  }

  function describeScrollTarget(target) {
    if (target === global) {
      return "window";
    }
    return {
      tag: target.tagName?.toLowerCase?.() || "",
      role: target.getAttribute?.("role") || "",
      aria: target.getAttribute?.("aria-label") || "",
      className: String(target.className || "").slice(0, 80),
      scrollHeight: target.scrollHeight || 0,
      clientHeight: target.clientHeight || 0,
    };
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  const api = {
    collectJobsAcrossScroll,
    findBestScrollTarget,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.HandshakeFitFinderCapture = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
