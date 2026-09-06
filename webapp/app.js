// Facts Only web app: same engine as the extension, paste-text workflow.
// Cited links are extracted from the pasted text (markdown or bare URLs) so
// source profiling works here too; cross-origin page fetching may still be
// blocked by CORS, in which case profiling degrades to link text + LLM knowledge.

import { renderSettings } from "../extension/engine/ui/settings-ui.js";
import { renderReport, reportToMarkdown } from "../extension/engine/ui/report-view.js";
import { getSettings } from "../extension/engine/ui/storage.js";
import { lookupCache, saveToCache, settingsFingerprint } from "../extension/engine/ui/cache.js";
import { verifyAnswer } from "../extension/engine/pipeline.js";
import { checkSources } from "../extension/engine/sourceCheck.js";
import { createProvider } from "../extension/engine/providers/index.js";
import { extractUrls } from "../extension/engine/text.js";
import { t, resolveLocale, applyDirection, applyI18n } from "../extension/engine/ui/i18n.js";

const $ = (id) => document.getElementById(id);

renderSettings($("settings"));

// ?lang=en|ar overrides the stored preference for this page load, so the app can
// be linked in a specific language (and so the RTL screenshot is reproducible).
const langOverride = new URLSearchParams(location.search).get("lang");
let currentLang = "en";
(async () => {
  currentLang = resolveLocale(langOverride || (await getSettings()).language);
  applyDirection(currentLang);
  applyI18n(document, currentLang);
})();

let running = false;
let currentAbort = null;
let lastRunWasCached = false;

function setProgress(p) {
  const bar = $("bar");
  const list = $("progress");
  if (!p) {
    bar.hidden = true;
    list.innerHTML = "";
    $("cancel").hidden = true;
    return;
  }
  bar.hidden = false;
  $("cancel").hidden = false;
  bar.firstElementChild.style.width = `${p.pct}%`;
  let li = list.querySelector(`li[data-step="${p.step}"]`);
  if (!li) {
    li = document.createElement("li");
    li.dataset.step = p.step;
    list.appendChild(li);
  }
  list.querySelectorAll("li").forEach((n) => n.classList.remove("active"));
  li.classList.add("active");
  li.textContent = `${p.pct}% — ${p.message}`;
}

async function run(text, sources, providerOverride = null, { ignoreCache = false } = {}) {
  if (running) return;
  running = true;
  $("error").hidden = true;
  $("error").textContent = "";
  $("report").innerHTML = "";
  $("run").disabled = true;
  currentAbort = new AbortController();
  try {
    const settings = await getSettings();
    if (!providerOverride && !ignoreCache) {
      const cached = await lookupCache(text, settingsFingerprint(settings));
      if (cached) {
        const mins = Math.max(1, Math.round((Date.now() - cached.ts) / 60000));
        // Same options as a fresh render — a cached report used to lose its
        // language and its Copy button.
        renderReport($("report"), cached.report, {
          lang: currentLang,
          onExport: () => downloadMd(cached.report),
          onCopy: () => navigator.clipboard.writeText(reportToMarkdown(cached.report))
        });
        const note = document.createElement("p");
        note.className = "fo-hint";
        note.textContent = `Loaded from cache (ran ${mins} min ago) — press “Verify answer” again to force a fresh run.`;
        $("report").prepend(note);
        lastRunWasCached = true;
        return;
      }
    }
    // Past the cache branch this is a real run, so the next Verify press should
    // be allowed to hit the cache again. Without this reset the flag latched on
    // after the first hit and every later run bypassed the cache forever.
    lastRunWasCached = false;
    const provider = providerOverride || createProvider(settings);
    const report = await verifyAnswer({ text, sources, page: "webapp" }, settings, {
      onProgress: setProgress,
      provider,
      fetchSources: true,
      signal: currentAbort.signal
    });
    renderReport($("report"), report, {
      lang: currentLang,
      onExport: () => downloadMd(report),
      onCopy: () => navigator.clipboard.writeText(reportToMarkdown(report))
    });
    await saveToCache(text, settingsFingerprint(settings), report);
  } catch (e) {
    if (e && (e.name === "AbortError" || /abort/i.test(String(e.message)))) {
      $("error").textContent = t("msg.cancelled", currentLang);
    } else {
      $("error").textContent = `Verification failed: ${String(e.message || e)}

If the key is missing, open “⚙️ Settings” above and paste a free Gemini key (aistudio.google.com/apikey), or switch to Demo mode.`;
    }
    $("error").hidden = false;
  } finally {
    setProgress(null);
    $("run").disabled = false;
    running = false;
    currentAbort = null;
  }
}

function downloadMd(report) {
  const blob = new Blob([reportToMarkdown(report)], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `facts-only-report-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
}

$("run").addEventListener("click", () => {
  const text = $("input").value.trim();
  if (text.length < 40) {
    $("error").textContent = "Paste a longer answer (at least a couple of sentences) to verify.";
    $("error").hidden = false;
    return;
  }
  // A cached run is replaced by a fresh run when Verify is pressed again.
  run(text, extractUrls(text), null, { ignoreCache: lastRunWasCached });
});

$("cancel").addEventListener("click", () => {
  if (currentAbort) currentAbort.abort();
});

function runDemo() {
  const demoText =
    "Country X's parliament passed the emergency law on 12 March 2025. According to the [Is the law a threat to human rights?](https://global-security-observatory.org/is-x-a-threat) report by the Global Security Observatory, the law allows detention without trial for up to 90 days, and over 40,000 people were affected in the first month. Critics say this is the harshest measure in a decade.";
  $("input").value = demoText;
  run(demoText, extractUrls(demoText), createProvider({ provider: "mock", grounding: false }));
}

// Keyless source check. Deliberately its own button rather than a fallback
// inside Verify: it answers a narrower question ("who is behind these sources?")
// and the report says so, so it must be something the reader chose.
$("sources").addEventListener("click", async () => {
  const text = $("input").value.trim();
  const sources = extractUrls(text);
  if (!sources.length) {
    $("error").textContent = t("msg.noLinks", currentLang);
    $("error").hidden = false;
    return;
  }
  if (running) return;
  running = true;
  $("error").hidden = true;
  $("report").innerHTML = "";
  $("run").disabled = true;
  currentAbort = new AbortController();
  try {
    const report = await checkSources({ text, sources, page: "webapp" }, {
      onProgress: setProgress,
      signal: currentAbort.signal
    });
    renderReport($("report"), report, {
      lang: currentLang,
      onExport: () => downloadMd(report),
      onCopy: () => navigator.clipboard.writeText(reportToMarkdown(report))
    });
  } catch (e) {
    $("error").textContent =
      e && (e.name === "AbortError" || /abort/i.test(String(e.message)))
        ? t("msg.cancelled", currentLang)
        : String(e.message || e);
    $("error").hidden = false;
  } finally {
    setProgress(null);
    $("run").disabled = false;
    running = false;
    currentAbort = null;
  }
});

$("demo").addEventListener("click", runDemo);

// ?demo=1 runs the sample report on load. Handy for sharing a link that shows
// what the tool produces, and it makes the documentation screenshots
// reproducible (see scripts/capture-screenshots.py).
const params = new URLSearchParams(location.search);
if (params.get("shot") === "1") document.body.classList.add("fo-shot");
if (params.get("demo") === "1") runDemo();
