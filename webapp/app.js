// FactLens web app: same engine as the extension, paste-text workflow.
// Note: cross-origin page fetching is blocked by browser CORS here, so source
// profiling runs on link titles + LLM knowledge only. The extension version is stronger.

import { renderSettings } from "../extension/engine/ui/settings-ui.js";
import { renderReport, reportToMarkdown } from "../extension/engine/ui/report-view.js";
import { getSettings } from "../extension/engine/ui/storage.js";
import { verifyAnswer } from "../extension/engine/pipeline.js";
import { createProvider } from "../extension/engine/providers/index.js";

const $ = (id) => document.getElementById(id);

renderSettings($("settings"));

let running = false;

function setProgress(p) {
  const bar = $("bar");
  const list = $("progress");
  if (!p) {
    bar.hidden = true;
    list.innerHTML = "";
    return;
  }
  bar.hidden = false;
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

async function run(text, providerOverride = null) {
  if (running) return;
  running = true;
  $("error").hidden = true;
  $("error").textContent = "";
  $("report").innerHTML = "";
  $("run").disabled = true;
  try {
    const settings = await getSettings();
    const provider = providerOverride || createProvider(settings);
    const report = await verifyAnswer({ text, sources: [], page: "webapp" }, settings, {
      onProgress: setProgress,
      provider,
      fetchSources: false // browser CORS blocks most cross-origin page fetches from a plain site
    });
    renderReport($("report"), report, {
      onExport: () => {
        const blob = new Blob([reportToMarkdown(report)], { type: "text/markdown;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `factlens-report-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
      }
    });
  } catch (e) {
    $("error").textContent = `Verification failed: ${String(e.message || e)}

If the key is missing, open “⚙️ Settings” above and paste a free Gemini key (aistudio.google.com/apikey), or switch to Demo mode.`;
    $("error").hidden = false;
  } finally {
    setProgress(null);
    $("run").disabled = false;
    running = false;
  }
}

$("run").addEventListener("click", () => {
  const text = $("input").value.trim();
  if (text.length < 40) {
    $("error").textContent = "Paste a longer answer (at least a couple of sentences) to verify.";
    $("error").hidden = false;
    return;
  }
  run(text);
});

$("demo").addEventListener("click", () => {
  $("input").value =
    "Country X's parliament passed the emergency law on 12 March 2025. According to the Global Security Observatory, the law allows detention without trial for up to 90 days, and over 40,000 people were affected in the first month. Critics say this is the harshest measure in a decade.";
  run($("input").value, createProvider({ provider: "mock", grounding: false }));
});
