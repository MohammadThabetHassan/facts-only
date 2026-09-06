// FactLens side panel: paste an answer (or receive one from the detector /
// context menu) and run the verification pipeline.

import { renderSettings } from "../engine/ui/settings-ui.js";
import { renderReport, reportToMarkdown } from "../engine/ui/report-view.js";
import { getSettings, set, get, remove, onChanged } from "../engine/ui/storage.js";
import { verifyAnswer } from "../engine/pipeline.js";
import { createProvider } from "../engine/providers/index.js";
import { truncate } from "../engine/text.js";

const $ = (id) => document.getElementById(id);
const input = $("input");
const progressBar = $("bar");
const progressList = $("progress");
const errorBox = $("error");
const reportBox = $("report");

renderSettings($("settings"));

let running = false;
let pendingSources = [];
let pendingPage = "manual";

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
    return;
  }
  progressBar.hidden = false;
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

async function run(text, sources = [], providerOverride = null) {
  if (running) return;
  running = true;
  clearError();
  reportBox.innerHTML = "";
  progressList.innerHTML = "";
  $("run").disabled = true;

  try {
    const settings = await getSettings();
    const provider = providerOverride || createProvider(settings);
    const report = await verifyAnswer(
      { text, sources, page: pendingPage },
      settings,
      { onProgress: setProgress, provider }
    );
    reportBox.innerHTML = "";
    renderReport(reportBox, report, { onExport: () => exportReport(report) });
    await saveHistory(report);
  } catch (e) {
    showError(`Verification failed: ${String(e.message || e)}

If this says the API key is missing, open “⚙️ Settings” above and paste a free Gemini key (aistudio.google.com/apikey), or switch the provider to Demo mode to see how reports look.`);
  } finally {
    setProgress(null);
    $("run").disabled = false;
    running = false;
  }
}

function exportReport(report) {
  const md = reportToMarkdown(report);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `factlens-report-${new Date().toISOString().slice(0, 10)}.md`;
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
    btn.className = "fl-history-item";
    btn.textContent = `${item.trustLabel} — ${item.excerpt}`;
    btn.addEventListener("click", () => {
      reportBox.innerHTML = "";
      renderReport(reportBox, item.report, { onExport: () => exportReport(item.report) });
      reportBox.scrollIntoView({ behavior: "smooth" });
    });
    box.appendChild(btn);
  }
}

// ---- buttons ---------------------------------------------------------------
$("run").addEventListener("click", () => {
  const text = input.value.trim();
  if (text.length < 40) {
    showError("Paste a longer answer (at least a couple of sentences) to verify.");
    return;
  }
  run(text, pendingSources.slice());
});

$("demo").addEventListener("click", () => {
  const demoText =
    "Country X's parliament passed the emergency law on 12 March 2025. According to the Global Security Observatory, the law allows detention without trial for up to 90 days, and over 40,000 people were affected in the first month. Critics say this is the harshest measure in a decade.";
  input.value = demoText;
  pendingSources = [{ url: "https://global-security-observatory.org/is-x-a-threat", title: "Is the law a threat?" }];
  pendingPage = "demo";
  run(demoText, pendingSources.slice(), createProvider({ provider: "mock", grounding: false }));
});

$("clear").addEventListener("click", async () => {
  input.value = "";
  pendingSources = [];
  pendingPage = "manual";
  reportBox.innerHTML = "";
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
