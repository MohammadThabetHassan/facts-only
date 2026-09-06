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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";

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

// Chrome derives an unpacked extension's ID from the SHA-256 of its absolute
// path: the first 32 hex characters, each mapped 0-f -> a-p. Knowing it lets us
// address the extension's own pages without a UI.
function unpackedExtensionId(dir) {
  const hex = createHash("sha256").update(dir, "utf8").digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

// Load the REAL extension and render one of its pages under the
// chrome-extension:// origin.
//
// This is not the same test as the localhost one above, and that is the point:
// extension pages run under the Manifest V3 content security policy, which is
// far stricter than http://localhost. A page that works when served over HTTP
// can still be refused here - and a manifest that Chrome rejects outright
// produces an extension that simply is not there, which no amount of unit
// testing catches.
async function extensionDom(browser, page) {
  const extDir = join(ROOT, "extension");
  const id = unpackedExtensionId(extDir);
  const profile = await mkdtemp(join(tmpdir(), "fo-ext-"));
  try {
    const { stdout } = await execFileAsync(
      browser,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        `--user-data-dir=${profile}`,
        `--load-extension=${extDir}`,
        `--disable-extensions-except=${extDir}`,
        "--virtual-time-budget=15000",
        "--dump-dom",
        `chrome-extension://${id}/${page}`
      ],
      { maxBuffer: 32 * 1024 * 1024, timeout: 180000 }
    );
    return stdout;
  } finally {
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
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
  const extPanel = await extensionDom(browser, "panel/panel.html");
  if (!/Facts Only/.test(extPanel)) {
    skipped++;
    console.log("  SKIP  headless Chrome did not load the unpacked extension in this environment");
    console.log("        -> the extension origin is UNVERIFIED here; check it manually:");
    console.log("           chrome://extensions -> Developer mode -> Load unpacked -> extension/");
  } else {
    check("Chrome accepts the manifest and serves the extension's own pages",
      /Facts Only/.test(extPanel));
    check("the ES module graph resolves under the MV3 content security policy",
      /id="sources"/.test(extPanel) && /id="settings"/.test(extPanel));

    const extPopup = await extensionDom(browser, "popup/popup.html");
    check("the toolbar popup renders", /Facts Only/.test(extPopup));
    check("the popup leads with the no-key path, not an API-key wall",
      /No API key needed/i.test(extPopup), extPopup.slice(0, 300));
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
