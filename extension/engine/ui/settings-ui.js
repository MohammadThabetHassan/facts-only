// Shared settings form used by the popup, the side panel, and the web app.
// All providers' fields stay in the DOM (shown/hidden) so switching providers
// never loses a saved key.

import { getSettings, saveSettings } from "./storage.js";
import { createProvider } from "../providers/index.js";

const PROVIDER_INFO = {
  gemini: {
    label: "Gemini API (recommended — free, can search the web)",
    hint: "Free key: aistudio.google.com/apikey → “Create API key”. Gemini can ground answers in live Google search results, which is what powers the independent evidence check."
  },
  openrouter: {
    label: "OpenRouter (free models, no web search)",
    hint: "Key from openrouter.ai/keys. Add “:free” to a model name for free models. Free models cannot search the web, so evidence quality is lower."
  },
  "openai-compat": {
    label: "Custom OpenAI-compatible endpoint (advanced)",
    hint: "Works with OpenAI, Groq, LM Studio, Ollama (OpenAI bridge)…"
  },
  mock: {
    label: "Demo mode (no key, canned results)",
    hint: "Runs the full pipeline on stored demo data. Useful to see how reports look; it does not verify anything."
  }
};

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return e;
}

function field(labelText, control, provider) {
  const wrap = el("div", { class: "fl-field" });
  if (provider) wrap.dataset.provider = provider;
  wrap.appendChild(el("label", { text: labelText }));
  wrap.appendChild(control);
  return wrap;
}

export function renderSettings(container) {
  container.innerHTML = "";

  const providerSel = el("select", { id: "fl-provider" });
  for (const [key, info] of Object.entries(PROVIDER_INFO)) {
    providerSel.appendChild(el("option", { value: key, text: info.label }));
  }

  const inputs = {
    geminiKey: el("input", { type: "password", placeholder: "Paste Gemini API key…" }),
    geminiModel: el("input", { type: "text" }),
    openrouterKey: el("input", { type: "password", placeholder: "Paste OpenRouter key…" }),
    openrouterModel: el("input", { type: "text" }),
    compatBase: el("input", { type: "text", placeholder: "https://api.openai.com/v1" }),
    compatKey: el("input", { type: "password", placeholder: "Paste API key…" }),
    compatModel: el("input", { type: "text" }),
    grounding: el("input", { type: "checkbox" }),
    maxClaims: el("input", { type: "number", min: "1", max: "8" })
  };

  const secondSel = el("select", { id: "fl-second" });
  const SECOND_OPTIONS = [
    ["none", "No second opinion (single-model verification)"],
    ["gemini", "Gemini API"],
    ["openrouter", "OpenRouter"],
    ["openai-compat", "Custom OpenAI-compatible endpoint"]
  ];
  for (const [v, label] of SECOND_OPTIONS) secondSel.appendChild(el("option", { value: v, text: label }));

  const secondHint = el("p", {
    class: "fl-hint",
    text: "Optional cross-check against AI monoculture: the checked claims are sent to a second, different provider and it is asked to find what the first review missed. Disagreements are shown in the report. It uses that provider's key/model fields above."
  });

  const hint = el("p", { class: "fl-hint" });
  const status = el("p", { class: "fl-status" });
  status.setAttribute("role", "status");

  function refreshVisibility() {
    const p = providerSel.value;
    container.querySelectorAll(".fl-field[data-provider]").forEach((w) => {
      w.style.display = p === "mock" ? "none" : w.dataset.provider === p ? "" : "none";
    });
    hint.textContent = PROVIDER_INFO[p].hint;
  }

  providerSel.addEventListener("change", refreshVisibility);

  const saveBtn = el("button", { type: "button" }, [document.createTextNode("Save settings")]);
  const testBtn = el("button", { type: "button", class: "secondary" }, [document.createTextNode("Test connection")]);

  saveBtn.addEventListener("click", async () => {
    await saveSettings(collect());
    status.textContent = "Saved ✓";
    setTimeout(() => (status.textContent = ""), 2500);
  });

  testBtn.addEventListener("click", async () => {
    status.textContent = "Testing…";
    try {
      await saveSettings(collect());
      const prov = createProvider(await getSettings());
      const { text } = await prov.complete({
        system: "You are a connectivity test.",
        user: "Reply with exactly: OK",
        task: "test",
        temperature: 0
      });
      status.textContent = text.toLowerCase().includes("ok") ? "Connection works ✓" : `Unexpected reply: ${text.slice(0, 60)}`;
    } catch (e) {
      status.textContent = `Failed: ${String(e.message || e).slice(0, 140)}`;
    }
  });

  container.appendChild(
    el("div", { class: "fl-settings" }, [
      field("Verification provider", providerSel),
      field("Gemini API key", inputs.geminiKey, "gemini"),
      field("Model", inputs.geminiModel, "gemini"),
      field("OpenRouter API key", inputs.openrouterKey, "openrouter"),
      field("Model", inputs.openrouterModel, "openrouter"),
      field("Base URL", inputs.compatBase, "openai-compat"),
      field("API key", inputs.compatKey, "openai-compat"),
      field("Model", inputs.compatModel, "openai-compat"),
      el("label", { class: "fl-check" }, [
        inputs.grounding,
        document.createTextNode(" Use Google Search grounding (Gemini) — check claims against the live web")
      ]),
      field("Max claims to check per run (1–8)", inputs.maxClaims),
      el("div", { class: "fl-sep" }),
      field("Second opinion provider (optional cross-check)", secondSel),
      secondHint,
      hint,
      el("div", { class: "fl-btnrow" }, [saveBtn, testBtn]),
      status,
      el("p", {
        class: "fl-hint fl-privacy",
        text: "Your API key and settings stay on this device. The text you verify is sent only to the AI provider you choose."
      })
    ])
  );

  function collect() {
    return {
      provider: providerSel.value,
      secondProvider: secondSel.value || "none",
      geminiKey: inputs.geminiKey.value.trim(),
      geminiModel: inputs.geminiModel.value.trim() || "gemini-2.5-flash",
      openrouterKey: inputs.openrouterKey.value.trim(),
      openrouterModel: inputs.openrouterModel.value.trim() || "google/gemini-2.5-flash",
      compatBase: inputs.compatBase.value.trim() || "https://api.openai.com/v1",
      compatKey: inputs.compatKey.value.trim(),
      compatModel: inputs.compatModel.value.trim() || "gpt-4o-mini",
      grounding: inputs.grounding.checked,
      maxClaims: Math.min(Math.max(parseInt(inputs.maxClaims.value, 10) || 5, 1), 8)
    };
  }

  (async () => {
    const s = await getSettings();
    providerSel.value = s.provider;
    secondSel.value = s.secondProvider || "none";
    inputs.geminiKey.value = s.geminiKey || "";
    inputs.geminiModel.value = s.geminiModel || "";
    inputs.openrouterKey.value = s.openrouterKey || "";
    inputs.openrouterModel.value = s.openrouterModel || "";
    inputs.compatBase.value = s.compatBase || "";
    inputs.compatKey.value = s.compatKey || "";
    inputs.compatModel.value = s.compatModel || "";
    inputs.grounding.checked = s.grounding !== false;
    inputs.maxClaims.value = s.maxClaims || 5;
    refreshVisibility();
  })();
}
