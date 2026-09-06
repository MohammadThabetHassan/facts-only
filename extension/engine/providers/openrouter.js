// OpenRouter provider. Works with free models ("...:free" suffix) and paid ones.
// Free models cannot search the web — the pipeline degrades gracefully.
//
// Auto-free model selection: set the model to "auto-free" and the provider
// discovers currently-available free models from the OpenRouter catalog,
// ranks them for general-purpose fact-checking, and falls back down the list
// when a model is unavailable or rate-limited.

import { postJson } from "../http.js";

const MODELS_URL = "https://openrouter.ai/api/v1/models";

// Model ids containing these tokens are specialized (code/music/safety/…)
// and skipped when ranking free models for general fact-checking.
const SKIP = /code|lyria|clip|safety|omni|embed|whisper|tts|vision|image|transcri/i;
// Generalist families worth preferring, in rank order.
const FAMILIES = [
  "deepseek", "minimax", "nemotron", "glm", "inkling", "qwen", "llama",
  "gemma", "ling", "mistral", "phi", "openrouter/free"
];

export function pickFreeModels(models) {
  const free = models.filter(
    (m) =>
      m &&
      typeof m.id === "string" &&
      m.pricing &&
      m.pricing.prompt === "0" &&
      m.pricing.completion === "0" &&
      !SKIP.test(m.id)
  );
  const familyRank = (id) => {
    for (let i = 0; i < FAMILIES.length; i++) {
      if (id.includes(FAMILIES[i])) return i;
    }
    return FAMILIES.length;
  };
  return free
    .sort((a, b) => {
      const ra = familyRank(a.id);
      const rb = familyRank(b.id);
      if (ra !== rb) return ra - rb;
      return (b.context_length || 0) - (a.context_length || 0);
    })
    .map((m) => m.id);
}

let cachedCandidates = null;
let cachedAt = 0;
const CACHE_TTL = 60 * 60 * 1000;

async function freeModelCandidates(key) {
  if (cachedCandidates && Date.now() - cachedAt < CACHE_TTL) return cachedCandidates;
  const res = await fetch(MODELS_URL, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`OpenRouter models listing failed (${res.status})`);
  const data = await res.json();
  cachedCandidates = pickFreeModels(data.data || []);
  cachedAt = Date.now();
  if (cachedCandidates.length === 0) throw new Error("OpenRouter lists no free models right now — try a paid model or another provider.");
  return cachedCandidates;
}

export function createOpenRouterProvider(settings) {
  const name = "openrouter";
  const supportsSearch = false;

  async function attempt(key, model, { system, user, json, temperature, signal }) {
    const body = {
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    };
    if (json) body.response_format = { type: "json_object" };
    const res = await postJson(
      "https://openrouter.ai/api/v1/chat/completions",
      body,
      120000,
      {
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://github.com/MohammadThabetHassan/factlens",
        "X-Title": "FactLens"
      },
      { signal, retries: 1 }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const err = new Error(`OpenRouter error ${res.status}: ${errText.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    return { text: (msg && msg.content) || "", meta: { model } };
  }

  async function complete({ system, user, json = false, search = false, task = "", temperature = 0.2, signal }) {
    const key = (settings.openrouterKey || "").trim();
    if (!key) throw new Error("Missing OpenRouter API key. Open FactLens settings and paste your key from openrouter.ai/keys.");
    const configured = (settings.openrouterModel || "google/gemini-2.5-flash").trim();

    let models = [configured];
    if (configured === "auto-free") {
      const candidates = await freeModelCandidates(key);
      models = candidates.slice(0, 4); // try up to 4 free models down the ranking
    }

    let lastErr = null;
    for (const model of models) {
      try {
        return await attempt(key, model, { system, user, json, temperature, signal });
      } catch (e) {
        if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
        lastErr = e;
        // model-specific unavailability → fall back to the next candidate
        if (e.status && [404, 429, 502, 503].includes(e.status)) continue;
        // generic malformed-request errors are worth one retry with the next model
        if (/no allowed providers|not a valid model/i.test(e.message)) continue;
        throw e;
      }
    }
    throw lastErr || new Error("OpenRouter request failed");
  }

  return { name, supportsSearch, complete };
}
