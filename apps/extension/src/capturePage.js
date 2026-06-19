(function attachCapturePage(global) {
  async function collectJobsAcrossScroll({
    extractor,
    root,
    baseUrl,
    maxPasses = 18,
    stablePasses = 2,
    wait = defaultWait,
    scroll = defaultScroll,
    onProgress = () => {},
  }) {
    let allJobs = [];
    let lastTotal = 0;
    let stableCount = 0;
    const snapshots = [];

    for (let pass = 0; pass < maxPasses; pass += 1) {
      const visibleJobs = extractor.extractVisibleJobs(root, baseUrl);
      allJobs = extractor.dedupeJobs([...allJobs, ...visibleJobs]);

      const snapshot = {
        pass: pass + 1,
        visibleJobs: visibleJobs.length,
        totalJobs: allJobs.length,
      };
      snapshots.push(snapshot);
      onProgress(snapshot);

      if (allJobs.length === lastTotal) {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      lastTotal = allJobs.length;

      if (stableCount >= stablePasses) {
        break;
      }

      const scrollResult = await scroll(root);
      if (scrollResult && scrollResult.moved === false && stableCount >= 1) {
        break;
      }
      await wait(350);
    }

    return {
      jobs: allJobs,
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
    return { moved: after > before, before, after };
  }

  function findBestScrollTarget(root) {
    const doc = root.ownerDocument || root;
    const candidates = Array.from(doc.querySelectorAll("main, section, div, ul, [role='list']"));
    let best = null;
    let bestScrollableDistance = 0;

    for (const element of candidates) {
      const scrollableDistance = (element.scrollHeight || 0) - (element.clientHeight || 0);
      if (scrollableDistance > bestScrollableDistance) {
        bestScrollableDistance = scrollableDistance;
        best = element;
      }
    }

    return bestScrollableDistance > 120 ? best : global;
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

  const api = {
    collectJobsAcrossScroll,
    findBestScrollTarget,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.HandshakeFitFinderCapture = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
