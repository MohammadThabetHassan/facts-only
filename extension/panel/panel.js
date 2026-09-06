// Facts Only side panel: paste an answer (or receive one from the detector /
// context menu) and run the verification pipeline.

import { renderSettings } from "../engine/ui/settings-ui.js";
import { renderReport, reportToMarkdown } from "../engine/ui/report-view.js";
import { getSettings, set, get, remove, onChanged } from "../engine/ui/storage.js";
import { lookupCache, saveToCache, settingsFingerprint } from "../engine/ui/cache.js";
import { verifyAnswer } from "../engine/pipeline.js";
import { createProvider } from "../engine/providers/index.js";
import { truncate, extractUrls } from "../engine/text.js";
import { t, resolveLocale, applyDirection, applyI18n } from "../engine/ui/i18n.js";

const $ = (id) => document.getElementById(id);
const input = $("input");
const progressBar = $("bar");
const progressList = $("progress");
const errorBox = $("error");
const reportBox = $("report");
const cacheBar = $("cachebar");

renderSettings($("settings"));

let currentLang = "en";
(async () => {
  currentLang = resolveLocale((await getSettings()).language);
  applyDirection(currentLang);
  applyI18n(document, currentLang);
})();
// Language changes in settings re-render the form; refresh the page chrome too.
onChanged(["settings"], async () => {
  currentLang = resolveLocale((await getSettings()).language);
  applyDirection(currentLang);
  applyI18n(document, currentLang);
});

let running = false;
let currentAbort = null;
let pendingSources = [];
let pendingPage = "manual";
let lastReport = null;

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.textContent = "";
  errorBox.hidden = true;
}

function setProgress(p) {
  if (!p) {
    progressBar.hidden = true;
    progressList.innerHTML = "";
    $("cancel").hidden = true;
    return;
  }
  progressBar.hidden = false;
  $("cancel").hidden = false;
  progressBar.firstElementChild.style.width = `${p.pct}%`;
  let li = progressList.querySelector(`li[data-step="${p.step}"]`);
  if (!li) {
    li = document.createElement("li");
    li.dataset.step = p.step;
    progressList.appendChild(li);
  }
  progressList.querySelectorAll("li").forEach((n) => n.classList.remove("active"));
  li.classList.add("active");
  li.textContent = `${p.pct}% — ${p.message}`;
}

function showCacheBar(ts, rerun) {
  cacheBar.innerHTML = "";
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  const note = document.createElement("span");
  note.className = "fo-dim";
  note.textContent = t("cache.loaded", currentLang, { mins }) + " ";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "secondary";
  btn.textContent = t("btn.rerun", currentLang);
  btn.addEventListener("click", rerun);
  cacheBar.appendChild(note);
  cacheBar.appendChild(btn);
  cacheBar.hidden = false;
}

function afterReportRendered(report) {
  renderReport(reportBox, report, {
    lang: currentLang,
    onExport: () => exportReport(report),
    onCopy: () => navigator.clipboard.writeText(reportToMarkdown(report)).then(() => {
      clearError();
      showError(t("msg.copied", currentLang));
      setTimeout(clearError, 2000);
    })
  });
  lastReport = report;
}

async function run(text, sources = [], providerOverride = null, { ignoreCache = false } = {}) {
  if (running) return;
  running = true;
  clearError();
  cacheBar.hidden = true;
  reportBox.innerHTML = "";
  progressList.innerHTML = "";
  $("run").disabled = true;
  currentAbort = new AbortController();

  try {
    const settings = await getSettings();

    if (!providerOverride && !ignoreCache) {
      const cached = await lookupCache(text, settingsFingerprint(settings));
      if (cached) {
        afterReportRendered(cached.report);
        showCacheBar(cached.ts, () => run(text, sources, null, { ignoreCache: true }));
        setProgress(null);
        $("run").disabled = false;
        running = false;
        currentAbort = null;
        return;
      }
    }

    const provider = providerOverride || createProvider(settings);
    const report = await verifyAnswer(
      { text, sources, page: pendingPage },
      settings,
      { onProgress: setProgress, provider, signal: currentAbort.signal }
    );
    afterReportRendered(report);
    await saveHistory(report);
    if (!providerOverride) await saveToCache(text, settingsFingerprint(settings), report);
  } catch (e) {
    if (e && (e.name === "AbortError" || /abort/i.test(String(e.message)))) {
      showError(t("msg.cancelled", currentLang));
    } else {
      showError(`Verification failed: ${String(e.message || e)}

If this says the API key is missing, open “⚙️ Settings” above and paste a free Gemini key (aistudio.google.com/apikey), or switch the provider to Demo mode to see how reports look.`);
    }
  } finally {
    setProgress(null);
    $("run").disabled = false;
    running = false;
    currentAbort = null;
  }
}

function exportReport(report) {
  const md = reportToMarkdown(report);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `facts-only-report-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function saveHistory(report) {
  const history = (await get("history", [])) || [];
  history.unshift({
    ts: Date.now(),
    trustKey: report.trustKey,
    trustLabel: report.trustLabel,
    excerpt: truncate(report.answerExcerpt, 110),
    report
  });
  await set({ history: history.slice(0, 5) });
  renderHistory();
}

async function renderHistory() {
  const history = (await get("history", [])) || [];
  const box = $("history");
  box.innerHTML = "";
  $("history-details").hidden = history.length === 0;
  for (const item of history) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fo-history-item";
    const when = new Date(item.ts).toLocaleString();
    btn.textContent = `${item.trustLabel} — ${item.excerpt} (${when})`;
    btn.addEventListener("click", () => {
      reportBox.innerHTML = "";
      afterReportRendered(item.report);
      reportBox.scrollIntoView({ behavior: "smooth" });
    });
    box.appendChild(btn);
  }
}

// ---- buttons ---------------------------------------------------------------
$("run").addEventListener("click", () => {
  const text = input.value.trim();
  if (text.length < 40) {
    showError(t("msg.tooShort", currentLang));
    return;
  }
  // Merge links found in the pasted text (markdown or bare URLs) with any
  // sources that came from the chatbot detector.
  const extracted = extractUrls(text);
  const merged = [...pendingSources];
  for (const u of extracted) if (!merged.some((s) => s.url === u.url)) merged.push(u);
  run(text, merged.slice());
});

$("cancel").addEventListener("click", () => {
  if (currentAbort) currentAbort.abort();
});

$("demo").addEventListener("click", () => {
  const demoText =
    "Country X's parliament passed the emergency law on 12 March 2025. According to the [Is the law a threat to human rights?](https://global-security-observatory.org/is-x-a-threat) report by the Global Security Observatory, the law allows detention without trial for up to 90 days, and over 40,000 people were affected in the first month. Critics say this is the harshest measure in a decade.";
  input.value = demoText;
  pendingSources = extractUrls(demoText);
  pendingPage = "demo";
  run(demoText, pendingSources.slice(), createProvider({ provider: "mock", grounding: false }));
});

$("clear").addEventListener("click", async () => {
  input.value = "";
  pendingSources = [];
  pendingPage = "manual";
  reportBox.innerHTML = "";
  cacheBar.hidden = true;
  clearError();
  setProgress(null);
  await remove("pendingJob");
});

// ---- incoming jobs (context menu / chatbot button) ---------------------------
async function consumePendingJob() {
  const job = await get("pendingJob");
  if (!job || !job.text) return;
  await remove("pendingJob");
  input.value = job.text;
  pendingSources = Array.isArray(job.sources) ? job.sources.slice() : [];
  pendingPage = job.page || "manual";
  run(job.text, pendingSources.slice());
}

onChanged(["pendingJob", "jobEvent"], () => {
  if (!running) consumePendingJob();
});

consumePendingJob();
renderHistory();
