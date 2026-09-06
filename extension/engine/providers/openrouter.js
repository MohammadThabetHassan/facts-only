// OpenRouter provider. Works with free models ("...:free" suffix) and paid ones.
// Free models cannot search the web — the pipeline degrades gracefully.

import { postJson } from "../http.js";

export function createOpenRouterProvider(settings) {
  const name = "openrouter";
  const supportsSearch = false;

  async function complete({ system, user, json = false, search = false, task = "", temperature = 0.2, signal }) {
    const key = (settings.openrouterKey || "").trim();
    if (!key) throw new Error("Missing OpenRouter API key. Open FactLens settings and paste your key from openrouter.ai/keys.");
    const model = (settings.openrouterModel || "google/gemini-2.5-flash").trim();
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
        "HTTP-Referer": "https://github.com/factlens-extension",
        "X-Title": "FactLens"
      },
      { signal }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenRouter error ${res.status}: ${errText.slice(0, 400)}`);
    }
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    return { text: (msg && msg.content) || "", meta: { model } };
  }

  return { name, supportsSearch, complete };
}
