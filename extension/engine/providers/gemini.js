// Gemini API provider. Free-tier key from https://aistudio.google.com/apikey
// Supports Google Search grounding (the tool's "independent evidence" superpower).

import { postJson } from "../http.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGenerate({ model, key, body, signal }) {
  // The key goes in a header, never in the query string: URLs end up in browser
  // history, devtools network panes, proxy logs, and crash reports — headers do not.
  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;
  const res = await postJson(url, body, 90000, { "x-goog-api-key": key }, { retries: 2, signal });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err = new Error(`Gemini API error ${res.status}: ${errText.slice(0, 400)}`);
    err.status = res.status;
    err.raw = errText;
    throw err;
  }
  return res.json();
}

export function createGeminiProvider(settings) {
  const name = "gemini";
  const supportsSearch = settings.grounding !== false;

  async function complete({ system, user, json = false, search = false, task = "", temperature = 0.2, signal }) {
    const key = (settings.geminiKey || "").trim();
    if (!key) throw new Error("Missing Gemini API key. Open Facts Only settings and paste your free key from aistudio.google.com.");
    const model = (settings.geminiModel || "gemini-2.5-flash").trim();
    const useGrounding = search && supportsSearch;

    const base = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature }
    };
    if (useGrounding) base.tools = [{ google_search: {} }];

    // Some model/tool combinations reject responseMimeType; degrade gracefully.
    const variants = [];
    if (json && !useGrounding) variants.push({ ...base, generationConfig: { ...base.generationConfig, responseMimeType: "application/json" } });
    variants.push(base);

    let lastErr = null;
    for (const body of variants) {
      try {
        const data = await callGenerate({ model, key, body, signal });
        const cand = (data.candidates && data.candidates[0]) || {};
        const text = ((cand.content && cand.content.parts) || [])
          .map((p) => p.text || "")
          .join("");
        const chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
        const sources = chunks
          .map((c) => ({ url: c.web && c.web.uri, title: (c.web && c.web.title) || "" }))
          .filter((s) => s.url);
        return { text, meta: { model, groundingSources: sources } };
      } catch (e) {
        lastErr = e;
        if (e.status === 400) continue; // try the simpler request shape
        throw e;
      }
    }
    throw lastErr || new Error("Gemini request failed");
  }

  return { name, supportsSearch, complete };
}
