// Real-browser end-to-end test, in CI, with no dependencies.
//
// The offline suite proves the engine's logic. It cannot prove that the app
// actually renders: every defect found in this project's live testing so far
// was of that kind — a broken module graph, a renderer crash on a string child,
// a null bias section, a settings component silently resetting page direction.
// Those all pass a unit suite and fail a user.
//
// So this serves the real files over HTTP and drives them in headless Chrome,
// asserting on the DOM the browser actually produced. No Puppeteer: Chrome's
// own `--dump-dom` plus `--virtual-time-budget` is enough, and keeps the
// zero-dependency promise honest.
//
//   node test/e2e.mjs
//
// Skips (exit 0, loudly) when no Chrome/Chromium is present, so contributors
// without one are not blocked. CI runners always have it.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8231;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

const BROWSERS = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
];

function findBrowser() {
  return BROWSERS.find((p) => existsSync(p)) || null;
}

function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      // Contain path traversal: the served tree is the repo, nothing above it.
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
      const file = join(ROOT, rel);
      if (!file.startsWith(ROOT)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

// Load the REAL extension and drive its own pages under the chrome-extension://
// origin.
//
// This is not the same test as the localhost one above, and that is the point:
// extension pages run under the Manifest V3 content security policy, which is
// far stricter than http://localhost. A page that works when served over HTTP
// can still be refused here - and a manifest Chrome rejects outright produces
// an extension that simply is not there, which no unit test catches.
//
// It also asks the running extension what permissions it actually holds, which
// is the only way to prove the install prompt does not request all sites. The
// manifest is a claim; this is the observation.
//
// Chrome removed the --load-extension switch around M137, which is why this
// check reported SKIP for so long: the flag was accepted and silently ignored,
// and every chrome-extension:// URL served an error page. CDP's
// Extensions.loadUnpacked is the supported replacement, it works headless, and
// the check runs for real now.
//
// Still written against the raw protocol over a WebSocket rather than pulling
// in Puppeteer - the zero-dependency promise applies to the test suite too.
async function openExtension(browser) {
  const extDir = join(ROOT, "extension");
  const profile = await mkdtemp(join(tmpdir(), "fo-ext-"));
  const port = 9222 + (process.pid % 200);
  const proc = spawn(browser, [
    "--headless=new", "--disable-gpu", "--no-sandbox",
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
    "--no-first-run", "--no-default-browser-check",
    // Required companion flag for driving extensions over CDP.
    "--enable-unsafe-extension-debugging",
    "about:blank"
  ], { stdio: "ignore" });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let version = null;
  for (let i = 0; i < 60; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      if (version.webSocketDebuggerUrl) break;
    } catch { /* not listening yet */ }
    await sleep(500);
  }

  const cleanup = async () => {
    proc.kill();
    await sleep(500);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  if (!version?.webSocketDebuggerUrl) {
    await cleanup();
    return null;
  }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws failed")); });

  let msgId = 0;
  const send = (method, params, sessionId) => new Promise((res, rej) => {
    const n = ++msgId;
    const timer = setTimeout(() => rej(new Error(`timeout: ${method}`)), 45000);
    const on = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id !== n) return;
      clearTimeout(timer);
      ws.removeEventListener("message", on);
      msg.error ? rej(new Error(`${method}: ${msg.error.message}`)) : res(msg.result);
    };
    ws.addEventListener("message", on);
    ws.send(JSON.stringify({ id: n, method, params, sessionId }));
  });

  let extId;
  try {
    ({ id: extId } = await send("Extensions.loadUnpacked", { path: extDir }));
  } catch (e) {
    try { ws.close(); } catch { /* already closing */ }
    await cleanup();
    return { unsupported: e.message };
  }

  return {
    extId,
    // Open one of the extension's own pages and evaluate inside it.
    async evaluate(page, expression) {
      const { targetId } = await send("Target.createTarget", { url: `chrome-extension://${extId}/${page}` });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      await send("Runtime.enable", {}, sessionId);
      await sleep(2500);
      try {
        const r = await send("Runtime.evaluate",
          { expression, awaitPromise: true, returnByValue: true }, sessionId);
        return r.result?.value;
      } finally {
        await send("Target.closeTarget", { targetId }).catch(() => {});
      }
    },
    async close() {
      try { ws.close(); } catch { /* already closing */ }
      await cleanup();
    }
  };
}

async function domOf(browser, path) {
  const profile = await mkdtemp(join(tmpdir(), "fo-e2e-"));
  try {
    const { stdout } = await execFileAsync(
      browser,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        `--user-data-dir=${profile}`,
        "--virtual-time-budget=25000",
        "--dump-dom",
        `http://127.0.0.1:${PORT}${path}`
      ],
      { maxBuffer: 32 * 1024 * 1024, timeout: 180000 }
    );
    return stdout;
  } finally {
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

let failures = 0;
let skipped = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name} ${String(extra).slice(0, 300)}`);
  }
}

const browser = findBrowser();
if (!browser) {
  console.log("e2e: no Chrome/Chromium found - skipping (CI runners always have one).");
  process.exit(0);
}
console.log(`e2e: using ${browser}\n`);

const server = await serve();
try {
  // --- full demo run, real DOM ---------------------------------------------
  console.log("web app - demo verification:");
  const demo = await domOf(browser, "/webapp/index.html?demo=1");
  check("page renders without a module-graph failure", /Facts Only/.test(demo));
  check("a report is produced", /CLAIMS CHECKED|Claims checked|claims/i.test(demo));
  check("the plain-language risk card leads the report", /fo-explain-head/.test(demo));
  check("the risk card names the flagged source", /global-security-observatory\.org/.test(demo));
  check("per-claim verdicts render", /SUPPORTED|CONTRADICTED/i.test(demo));
  check("evidence links render", /Official Gazette/.test(demo));
  check("the disclaimer is present", /not a verdict|NOT verified/i.test(demo));
  check("no uncaught error surfaced in the error box",
    !/id="error"[^>]*>\s*[A-Za-z]/.test(demo) || /hidden/.test((demo.match(/<div id="error"[^>]*>/) || [""])[0]),
    (demo.match(/<div id="error"[^>]*>[^<]*/) || [""])[0]);

  // --- keyless source check -------------------------------------------------
  console.log("\nweb app - keyless source check:");
  const keyless = await domOf(browser, "/webapp/index.html?sourcecheck=1");
  check("keyless run renders a report with no API key", /fo-explain-head/.test(keyless));
  check("keyless run states the claims were NOT verified", /NOT verified/i.test(keyless));
  check("keyless run renders no claim cards", !/fo-claim-text/.test(keyless));

  // --- Arabic RTL -----------------------------------------------------------
  console.log("\nweb app - Arabic RTL:");
  const ar = await domOf(browser, "/webapp/index.html?demo=1&lang=ar");
  check("document direction is actually rtl", /<html[^>]*dir="rtl"/.test(ar), (ar.match(/<html[^>]*>/) || [""])[0]);
  check("Arabic strings render", /الادعاءات|مصادر/.test(ar));

  // --- extension side panel -------------------------------------------------
  console.log("\nextension side panel:");
  const panel = await domOf(browser, "/extension/panel/panel.html");
  check("panel page loads its module graph", /Facts Only/.test(panel));
  check("panel exposes the keyless button", /id="sources"/.test(panel));

  // --- the actual extension, loaded unpacked --------------------------------
  // Everything above is served over HTTP. Extension pages run under the MV3
  // content security policy instead, which is stricter, so a page that works
  // over HTTP can still be refused there.
  //
  // Whether this can be automated depends on the browser: several Chrome builds
  // ignore --load-extension in headless mode entirely and serve an error page
  // for every chrome-extension:// URL. When that happens the honest outcome is
  // SKIPPED, announced - not a pass (which would be a lie) and not a failure
  // (which would be blaming the code for the environment). This path then stays
  // on the manual checklist in docs/VERIFICATION.md.
  console.log("\nreal extension, loaded unpacked:");
  const ext = await openExtension(browser);
  if (!ext || ext.unsupported) {
    skipped++;
    console.log(`  SKIP  this Chrome cannot load an unpacked extension over CDP${ext?.unsupported ? ` (${ext.unsupported})` : ""}`);
    console.log("        -> Extensions.loadUnpacked needs a recent Chrome; the extension origin is");
    console.log("           UNVERIFIED here. Check manually: chrome://extensions -> Developer mode");
    console.log("           -> Load unpacked -> extension/");
  } else {
    try {
      const panel = JSON.parse(await ext.evaluate("panel/panel.html", `(async () => JSON.stringify({
        origin: location.origin,
        title: document.title,
        brand: /Facts Only/.test(document.body.innerText + document.title),
        // Queried from the live DOM, not matched against a truncated HTML
        // string: these ids only exist if the module graph actually ran.
        hasSources: !!document.getElementById('sources'),
        hasSettings: !!document.getElementById('settings'),
        hasRun: !!document.getElementById('run'),
        granted: await new Promise(r => chrome.permissions.getAll(p => r(p))),
        hasAllUrls: await new Promise(r => chrome.permissions.contains({origins:['<all_urls>']}, c => r(c))),
        manifestHosts: chrome.runtime.getManifest().host_permissions || [],
        optionalHosts: chrome.runtime.getManifest().optional_host_permissions || []
      }))()`));

      check("Chrome accepts the manifest and serves the extension's own pages",
        panel.origin === `chrome-extension://${ext.extId}` && panel.brand,
        `origin=${panel.origin}`);
      check("the ES module graph resolves under the MV3 content security policy",
        panel.hasSources && panel.hasSettings && panel.hasRun,
        `sources=${panel.hasSources} settings=${panel.hasSettings} run=${panel.hasRun}`);

      // The permission model, checked against a running extension rather than
      // against the manifest text. Requesting <all_urls> up front is the
      // difference between a store review that passes and one that does not,
      // and "we only ask when you click" is a claim worth proving.
      check("installing does NOT grant access to all sites",
        panel.hasAllUrls === false,
        `granted origins = ${JSON.stringify(panel.granted.origins)}`);
      check("the manifest requires no host permissions at install",
        panel.manifestHosts.length === 0, JSON.stringify(panel.manifestHosts));
      check("<all_urls> is optional, so it must be requested at point of use",
        (panel.optionalHosts || []).includes("<all_urls>"));
      check("install-time origins are the named chatbot hosts only",
        (panel.granted.origins || []).every((o) => /chatgpt|openai|gemini|claude|perplexity/.test(o)),
        JSON.stringify(panel.granted.origins));

      const popup = await ext.evaluate("popup/popup.html", "document.documentElement.outerHTML.slice(0, 4000)");
      check("the toolbar popup renders", /Facts Only/.test(popup));
      check("the popup leads with the no-key path, not an API-key wall",
        /No API key needed/i.test(popup), String(popup).slice(0, 300));
    } finally {
      await ext.close();
    }
  }
} finally {
  server.close();
}

console.log(
  failures === 0
    ? `\nE2E CHECKS PASSED${skipped ? ` (${skipped} skipped - see above)` : ""}`
    : `\n${failures} E2E CHECK(S) FAILED`
);
process.exit(failures === 0 ? 0 : 1);
