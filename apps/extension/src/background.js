(function attachBackground(global) {
  const API_URL = "http://127.0.0.1:8000/api/extension/capture";
  const CAPTURE_MESSAGE = "HFF_CAPTURE_JOBS";

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

  function handleMessage(message, _sender, sendResponse) {
    if (!message || message.type !== CAPTURE_MESSAGE) {
      return false;
    }

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

  if (global.chrome?.runtime?.onMessage) {
    global.chrome.runtime.onMessage.addListener(handleMessage);
  }

  const api = {
    API_URL,
    CAPTURE_MESSAGE,
    captureJobs,
    handleMessage,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.HandshakeFitFinderBackground = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
