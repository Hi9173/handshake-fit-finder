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

    await resetScroll(root);
    await wait(250);

    for (let pass = 0; pass < maxPasses; pass += 1) {
      const visibleJobs = extractor.extractVisibleJobs(root, baseUrl);
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

    return {
      jobs: targetJobCount ? allJobs.slice(0, targetJobCount) : allJobs,
      passes: snapshots.length,
      snapshots,
    };
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

  const api = {
    collectJobsAcrossScroll,
    findBestScrollTarget,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.HandshakeFitFinderCapture = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
