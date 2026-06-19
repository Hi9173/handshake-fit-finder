#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORT = 9222;
const DEFAULT_EXTENSION_NAME = "Handshake Fit Finder";
const DEFAULT_ARTIFACTS_DIR = "debug-artifacts";

export function parseArgs(argv) {
  const options = {
    url: "",
    port: DEFAULT_PORT,
    artifactsDir: DEFAULT_ARTIFACTS_DIR,
    extensionId: "",
    extensionName: DEFAULT_EXTENSION_NAME,
    skipExtensionReload: false,
    timeoutMs: 45000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--url") {
      options.url = requireValue(argv, (index += 1), arg);
    } else if (arg === "--port") {
      options.port = Number(requireValue(argv, (index += 1), arg));
    } else if (arg === "--artifacts-dir") {
      options.artifactsDir = requireValue(argv, (index += 1), arg);
    } else if (arg === "--extension-id") {
      options.extensionId = requireValue(argv, (index += 1), arg);
    } else if (arg === "--extension-name") {
      options.extensionName = requireValue(argv, (index += 1), arg);
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(requireValue(argv, (index += 1), arg));
    } else if (arg === "--skip-extension-reload") {
      options.skipExtensionReload = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.port) || options.port <= 0) {
    throw new Error("--port must be a positive number");
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }
  return options;
}

export function summarizeDiagnostics({ url, debugPayload, consoleErrors }) {
  const sent = Number(debugPayload?.sent || 0);
  const received = Number(debugPayload?.received || 0);
  const requestedPageSize = pageSizeFromUrl(url);
  const hasContextInvalidation = consoleErrors.some((entry) =>
    /extension context invalidated/i.test(entry.text || ""),
  );

  if (hasContextInvalidation) {
    return {
      status: "extension-context-invalidated",
      message: "Chrome invalidated the extension context, usually after an extension reload. Refresh the Handshake page and rerun capture.",
    };
  }
  if (debugPayload?.phase === "error") {
    return {
      status: "capture-error",
      message: debugPayload.message || "The extension reported an unknown capture error.",
    };
  }
  if (requestedPageSize && sent > 0 && sent < requestedPageSize) {
    return {
      status: "under-captured",
      message: `Captured ${sent} of requested page size ${requestedPageSize}. This usually means the page virtualized results or the scroll target was wrong.`,
    };
  }
  if (sent !== received) {
    return {
      status: "backend-mismatch",
      message: `The extension sent ${sent} jobs but the backend returned ${received}.`,
    };
  }
  return {
    status: "ok",
    message: `Captured ${sent} jobs.`,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const baseUrl = `http://127.0.0.1:${options.port}`;
  const version = await fetchJson(`${baseUrl}/json/version`).catch((error) => {
    throw new Error(
      `Could not connect to Chrome DevTools on ${baseUrl}. Start normal Chrome with:\n` +
        `open -na "Google Chrome" --args --remote-debugging-port=${options.port}\n\n` +
        `Original error: ${error.message}`,
    );
  });

  const browser = await CdpConnection.connect(version.webSocketDebuggerUrl);
  const consoleErrors = [];
  browser.on("Log.entryAdded", ({ entry }) => {
    if (entry?.level === "error") {
      consoleErrors.push({ source: entry.source, text: entry.text, url: entry.url });
    }
  });
  browser.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") {
      consoleErrors.push({
        source: "console",
        text: event.args?.map((arg) => arg.description || arg.value || "").join(" "),
      });
    }
  });
  await browser.send("Log.enable");

  if (!options.skipExtensionReload) {
    await tryReloadExtension(baseUrl, options).catch((error) => {
      consoleErrors.push({ source: "extension-reload", text: error.message });
    });
  }

  const target = await findOrCreateHandshakeTarget(baseUrl, options.url);
  const page = await CdpConnection.connect(target.webSocketDebuggerUrl);
  page.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") {
      consoleErrors.push({
        source: "page-console",
        text: event.args?.map((arg) => arg.description || arg.value || "").join(" "),
      });
    }
  });
  await page.send("Runtime.enable");
  await page.send("Page.enable");

  if (options.url) {
    await page.send("Page.navigate", { url: options.url });
  } else {
    await page.send("Page.reload", { ignoreCache: true });
  }
  await waitForPageReady(page, options.timeoutMs);
  await waitForSelector(page, "#hff-capture-button", options.timeoutMs);

  await page.evaluate(`document.querySelector("#hff-capture-button").click()`);
  const debugPayload = await waitForDebugPayload(page, options.timeoutMs);
  const screenshot = await page.send("Page.captureScreenshot", { format: "png" }).catch(() => null);

  const diagnostics = {
    generatedAt: new Date().toISOString(),
    url: options.url || target.url,
    options,
    debugPayload,
    consoleErrors,
    summary: summarizeDiagnostics({
      url: options.url || target.url,
      debugPayload,
      consoleErrors,
    }),
  };

  if (screenshot?.data) {
    diagnostics.screenshot = "latest.png";
  }

  await writeArtifacts(options.artifactsDir, diagnostics, screenshot?.data);
  console.log(JSON.stringify(diagnostics.summary, null, 2));
}

async function tryReloadExtension(baseUrl, options) {
  const target = await createTarget(baseUrl, "chrome://extensions/");
  const page = await CdpConnection.connect(target.webSocketDebuggerUrl);
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await waitForPageReady(page, 15000);
  const result = await page.evaluate(
    `(() => {
      const extensionId = ${JSON.stringify(options.extensionId)};
      const extensionName = ${JSON.stringify(options.extensionName)};
      const manager = document.querySelector("extensions-manager");
      const managerRoot = manager && manager.shadowRoot;
      const list = managerRoot && managerRoot.querySelector("extensions-item-list");
      const listRoot = list && list.shadowRoot;
      const items = listRoot ? Array.from(listRoot.querySelectorAll("extensions-item")) : [];
      const item = items.find((candidate) => {
        if (extensionId && candidate.id === extensionId) return true;
        return candidate.shadowRoot && candidate.shadowRoot.textContent.includes(extensionName);
      });
      if (!item || !item.shadowRoot) {
        return { ok: false, reason: "Extension item not found on chrome://extensions" };
      }
      const reloadButton =
        item.shadowRoot.querySelector("#dev-reload-button") ||
        item.shadowRoot.querySelector("[id*='reload']") ||
        item.shadowRoot.querySelector("cr-icon-button[title*='Reload']");
      if (!reloadButton) {
        return { ok: false, reason: "Reload button not found. Developer mode may be off." };
      }
      reloadButton.click();
      return { ok: true, extensionId: item.id || extensionId || "" };
    })()`,
  );
  if (!result.ok) {
    throw new Error(result.reason || "Extension reload failed");
  }
}

async function findOrCreateHandshakeTarget(baseUrl, url) {
  if (url) {
    return createTarget(baseUrl, url);
  }
  const targets = await fetchJson(`${baseUrl}/json/list`);
  const target = targets.find((candidate) => /app\.joinhandshake\.com/.test(candidate.url || ""));
  if (!target) {
    throw new Error("No open Handshake tab found. Pass --url to navigate to one.");
  }
  return target;
}

async function createTarget(baseUrl, url) {
  const encoded = encodeURIComponent(url);
  const response = await fetch(`${baseUrl}/json/new?${encoded}`, { method: "PUT" });
  if (!response.ok) {
    throw new Error(`Could not create Chrome target: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function waitForPageReady(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(`document.readyState`);
    if (state === "complete" || state === "interactive") {
      return;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for page readiness");
}

async function waitForSelector(page, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await page.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (found) {
      return;
    }
    await delay(300);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

async function waitForDebugPayload(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await page.evaluate(`document.querySelector("#hff-capture-debug-output")?.textContent || ""`);
    if (text && text !== "No capture yet") {
      try {
        const payload = JSON.parse(text);
        if (payload.phase === "captured" || payload.phase === "error") {
          return payload;
        }
      } catch {
        // Keep polling until the debug panel contains valid JSON.
      }
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for capture debug output");
}

async function writeArtifacts(artifactsDir, diagnostics, screenshotData) {
  await mkdir(artifactsDir, { recursive: true });
  const timestamp = diagnostics.generatedAt.replace(/[:.]/g, "-");
  const artifactPath = path.join(artifactsDir, `${timestamp}.json`);
  const latestPath = path.join(artifactsDir, "latest.json");
  await writeFile(artifactPath, JSON.stringify(diagnostics, null, 2));
  await writeFile(latestPath, JSON.stringify(diagnostics, null, 2));
  if (screenshotData) {
    await writeFile(path.join(artifactsDir, "latest.png"), Buffer.from(screenshotData, "base64"));
  }
}

function pageSizeFromUrl(url) {
  try {
    const parsed = new URL(url);
    const value = Number(parsed.searchParams.get("per_page"));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return response.json();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  console.log(`Usage:
  node scripts/debug-handshake-extension.mjs [--url URL] [--port 9222] [--extension-id ID]

Options:
  --url URL                 Navigate to this Handshake URL before capture.
  --port PORT               Chrome DevTools port. Default: 9222.
  --extension-id ID         Prefer a specific extension id on chrome://extensions.
  --extension-name NAME     Extension name to find when id is unknown. Default: Handshake Fit Finder.
  --skip-extension-reload   Do not attempt reload from chrome://extensions.
  --artifacts-dir DIR       Where to save latest.json/latest.png. Default: debug-artifacts.
`);
}

class CdpConnection {
  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    const connection = new CdpConnection(socket);
    await connection.opened;
    return connection;
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.opened = new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    socket.addEventListener("message", (event) => this.handleMessage(event));
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  evaluate(expression) {
    return this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }).then((result) => {
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
      }
      return result.result?.value;
    });
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) || [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "CDP command failed"));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method && this.handlers.has(message.method)) {
      for (const handler of this.handlers.get(message.method)) {
        handler(message.params || {});
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
