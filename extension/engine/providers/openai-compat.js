// Generic OpenAI-compatible provider (OpenAI, Groq, local servers, etc.)

import { postJson } from "../http.js";

export function createCompatProvider(settings) {
  const name = "openai-compat";
  const supportsSearch = false;

  async function complete({ system, user, json = false, search = false, task = "", temperature = 0.2, signal }) {
    const key = (settings.compatKey || "").trim();
    const base = (settings.compatBase || "https://api.openai.com/v1").replace(/\/+$/, "");
    if (!key) throw new Error("Missing API key for the custom OpenAI-compatible endpoint. Open Touchstone settings.");
    const body = {
      model: (settings.compatModel || "gpt-4o-mini").trim(),
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    };
    if (json) body.response_format = { type: "json_object" };
    const res = await postJson(`${base}/chat/completions`, body, 120000, {
      Authorization: `Bearer ${key}`
    }, { signal });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`API error ${res.status}: ${errText.slice(0, 400)}`);
    }
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    return { text: (msg && msg.content) || "", meta: { model: body.model } };
  }

  return { name, supportsSearch, complete };
}
