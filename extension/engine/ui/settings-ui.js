// Shared settings form used by the popup, the side panel, and the web app.
// All providers' fields stay in the DOM (shown/hidden) so switching providers
// never loses a saved key. UI labels are localized (en/ar); changing the UI
// language re-renders the form immediately.

import { getSettings, saveSettings, DEFAULT_SETTINGS } from "./storage.js";
import { createProvider } from "../providers/index.js";
import { t, resolveLocale, applyDirection } from "./i18n.js";

const PROVIDER_INFO = {
  gemini: {
    label: "provider.gemini",
    hint: "hint.gemini"
  },
  openrouter: {
    label: "provider.openrouter",
    hint: "hint.openrouter"
  },
  "openai-compat": {
    label: "provider.compat",
    hint: "hint.compat"
  },
  mock: {
    label: "provider.mock",
    hint: "hint.mock"
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
  const wrap = el("div", { class: "ts-field" });
  if (provider) wrap.dataset.provider = provider;
  wrap.appendChild(el("label", { text: labelText }));
  wrap.appendChild(control);
  return wrap;
}

export function renderSettings(container) {
  container.innerHTML = "";

  (async () => {
    const s = await getSettings();
    const L = resolveLocale(s.language);

    const providerSel = el("select", { id: "ts-provider" });
    for (const [key, info] of Object.entries(PROVIDER_INFO)) {
      providerSel.appendChild(el("option", { value: key, text: t(info.label, L) }));
    }

    const secondSel = el("select", { id: "ts-second" });
    for (const [v, key] of [["none", "second.none"], ["gemini", "provider.gemini"], ["openrouter", "provider.openrouter"], ["openai-compat", "provider.compat"]]) {
      secondSel.appendChild(el("option", { value: v, text: t(key, L) }));
    }

    const langSel = el("select", { id: "ts-language" });
    for (const [v, key] of [["auto", "lang.auto"], ["en", "English"], ["ar", "العربية"]]) {
      langSel.appendChild(el("option", { value: v, text: t(key, L) }));
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

    const hint = el("p", { class: "ts-hint" });
    const secondHint = el("p", {
      class: "ts-hint",
      text: t("set.secondHint", L)
    });
    const status = el("p", { class: "ts-status" });
    status.setAttribute("role", "status");

    function refreshVisibility() {
      const p = providerSel.value;
      container.querySelectorAll(".ts-field[data-provider]").forEach((w) => {
        w.style.display = p === "mock" ? "none" : w.dataset.provider === p ? "" : "none";
      });
      hint.textContent = PROVIDER_INFO[p] ? t(PROVIDER_INFO[p].hint, L) : "";
    }

    langSel.addEventListener("change", async () => {
      await saveSettings({ ...s, language: langSel.value });
      applyDirection(resolveLocale(langSel.value));
      renderSettings(container); // re-render the whole form in the new locale
    });

    providerSel.addEventListener("change", refreshVisibility);

    const saveBtn = el("button", { type: "button" }, [document.createTextNode(t("btn.save", L))]);
    const testBtn = el("button", { type: "button", class: "secondary" }, [document.createTextNode(t("btn.test", L))]);

    saveBtn.addEventListener("click", async () => {
      await saveSettings(collect());
      status.textContent = t("msg.saved", L);
      setTimeout(() => (status.textContent = ""), 2500);
    });

    testBtn.addEventListener("click", async () => {
      status.textContent = t("msg.testing", L);
      try {
        await saveSettings(collect());
        const prov = createProvider(await getSettings());
        const { text } = await prov.complete({
          system: "You are a connectivity test.",
          user: "Reply with exactly: OK",
          task: "test",
          temperature: 0
        });
        status.textContent = text.toLowerCase().includes("ok") ? t("msg.testOk", L) : `Unexpected reply: ${text.slice(0, 60)}`;
      } catch (e) {
        status.textContent = `Failed: ${String(e.message || e).slice(0, 140)}`;
      }
    });

    container.appendChild(
      el("div", { class: "ts-settings" }, [
        field(t("set.provider", L), providerSel),
        field(t("set.geminiKey", L), inputs.geminiKey, "gemini"),
        field(t("set.model", L), inputs.geminiModel, "gemini"),
        field(t("set.openrouterKey", L), inputs.openrouterKey, "openrouter"),
        field(t("set.model", L), inputs.openrouterModel, "openrouter"),
        field(t("set.compatBase", L), inputs.compatBase, "openai-compat"),
        field(t("set.compatKey", L), inputs.compatKey, "openai-compat"),
        field(t("set.model", L), inputs.compatModel, "openai-compat"),
        el("label", { class: "ts-check" }, [
          inputs.grounding,
          document.createTextNode(t("set.grounding", L))
        ]),
        field(t("set.maxClaims", L), inputs.maxClaims),
        el("div", { class: "ts-sep" }),
        field(t("set.second", L), secondSel),
        secondHint,
        el("div", { class: "ts-sep" }),
        field(t("set.language", L), langSel),
        hint,
        el("div", { class: "ts-btnrow" }, [saveBtn, testBtn]),
        status,
        el("p", {
          class: "ts-hint ts-privacy",
          text: t("set.privacy", L)
        })
      ])
    );

    function collect() {
      return {
        provider: providerSel.value,
        secondProvider: secondSel.value || "none",
        language: langSel.value || "auto",
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

    providerSel.value = s.provider;
    secondSel.value = s.secondProvider || "none";
    langSel.value = s.language || "auto";
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
    applyDirection(L);
  })();
}
