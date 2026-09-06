// Step 5: final summary text for the report. The trust signal itself is computed
// in code (pipeline.js) from the per-claim verdicts and source flags, so the
// headline verdict is deterministic and not the model's mood.

import { extractJson } from "../json.js";
import { truncate } from "../text.js";

const SYSTEM = `You write concise, neutral verification summaries for a fact-checking tool.
You never say "true" or "false" outright — you describe what the evidence shows, what is
disputed, and what the reader should check. Answer with JSON only.`;

export async function writeSummary(provider, settings, contextSummary, signal) {
  const user = `Write the final summary for this verification report.

VERIFICATION CONTEXT:
${truncate(contextSummary, 3000)}

Return JSON exactly in this shape:
{"summary":"2-3 sentences: what checked out, what is disputed, what to be careful about",
 "readerAdvice":"1-2 sentences: the single most useful thing for the reader to do next"}`;
  const { text } = await provider.complete({ system: SYSTEM, user, json: true, task: "summary", temperature: 0.3, signal });
  const p = extractJson(text);
  return {
    summary: truncate(p.summary || "", 800),
    readerAdvice: truncate(p.readerAdvice || "", 400)
  };
}
