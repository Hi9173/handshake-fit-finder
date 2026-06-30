(function attachBackground(global) {
  const API_URL = "http://127.0.0.1:8000/api/extension/capture";
  const DEBUG_LOG_URL = "http://127.0.0.1:8000/api/extension/debug-log";
  const CAPTURE_MESSAGE = "HFF_CAPTURE_JOBS";
  const DEBUG_LOG_MESSAGE = "HFF_DEBUG_LOG";

  async function captureJobs(jobs, fetchImpl = fetch) {
    const response = await fetchImpl(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobs }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Local API returned ${response.status}: ${body || "No response body"}`);
    }
    return response.json();
  }

  async function writeDebugLog(payload, fetchImpl = fetch) {
    const response = await fetchImpl(DEBUG_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Local API returned ${response.status}: ${body || "No response body"}`);
    }
    return response.json();
  }

  function handleMessage(message, _sender, sendResponse) {
    if (!message) {
      return false;
    }

    if (message.type === CAPTURE_MESSAGE) {
      captureJobs(message.jobs || [])
        .then((jobs) => sendResponse({ ok: true, jobs }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      return true;
    }

    if (message.type === DEBUG_LOG_MESSAGE) {
      writeDebugLog(message.payload || {})
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      return true;
    }

    return false;
  }

  if (global.chrome?.runtime?.onMessage) {
    global.chrome.runtime.onMessage.addListener(handleMessage);
  }

  const api = {
    API_URL,
    DEBUG_LOG_URL,
    CAPTURE_MESSAGE,
    DEBUG_LOG_MESSAGE,
    captureJobs,
    writeDebugLog,
    handleMessage,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.HandshakeFitFinderBackground = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
