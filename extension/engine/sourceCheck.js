// Keyless source check.
//
// The full pipeline needs an API key, which is a wall in front of exactly the
// person the plain-language warning was written for. Someone who has just read
// a chatbot answer and wants to know whether they were sold something is not
// going to clone a repo, open Google AI Studio, mint a key and paste it in.
//
// But the part they care about — *who is behind these sources* — never needed a
// model. Fetching a page, reading its byline and about link, matching headline
// shape, and asking the Wayback Machine how long the domain has actually been
// publishing are all deterministic code against keyless services. Only claim
// extraction, evidence hunting, bias analysis and the written summary need an
// LLM.
//
// So this runs the half that is free, instantly, with no setup at all, and says
// plainly what it did not do. It is not a cheaper verification; it is a
// different, narrower question, and the report labels it as such.

import { profileSources } from "./sourceProfiler.js";
import { summarizeRisk } from "./explain.js";
import { isHttpUrl } from "./text.js";

/**
 * @param {{text?: string, sources?: {url: string, title?: string}[], page?: string}} input
 * @param {{onProgress?: (p: {step: string, pct: number, message: string}) => void, signal?: AbortSignal, fetchSources?: boolean}} [options]
 * @returns {Promise<*>} a report object shaped like the full one, with
 *          `sourcesOnly: true` and no claims.
 */
export async function checkSources(input, { onProgress = () => {}, signal, fetchSources = true } = {}) {
  const cited = (input.sources || []).filter((s) => s && isHttpUrl(s.url));
  if (cited.length === 0) {
    throw new Error(
      "No links found in that text. The keyless source check reads the links an answer cites — paste an answer that includes its sources, or add an API key to check the claims themselves."
    );
  }

  onProgress({ step: "sources", pct: 20, message: `Checking who is behind ${cited.length} source${cited.length === 1 ? "" : "s"}…` });

  /** @type {Record<string,string>} */
  const seedTitles = {};
  for (const s of cited) if (s.title) seedTitles[s.url] = s.title;

  // provider = null: the LLM publisher profile is skipped, every code heuristic
  // and the Wayback lookup still run.
  const sources = await profileSources(null, {}, cited.map((s) => s.url), {
    fetchSources,
    seedTitles,
    signal
  });

  onProgress({ step: "done", pct: 100, message: "Source check ready." });

  const risk = summarizeRisk(sources);
  return {
    createdAt: new Date().toISOString(),
    page: input.page || "manual",
    sourcesOnly: true,
    providerName: "none",
    providerModel: "",
    method: {
      searchUsed: false,
      keyless: true,
      claimsChecked: 0,
      quotesVerified: 0,
      quotesMissing: 0,
      secondOpinionUsed: false
    },
    claims: [],
    sources,
    riskLevel: risk.level,
    disclaimer:
      "This was a source check only: no API key was used, so the claims in the answer were NOT verified against evidence. It reports who appears to be behind each cited source and how long they have been publishing — not whether the answer is right."
  };
}
