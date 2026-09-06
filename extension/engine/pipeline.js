// FactLens pipeline orchestrator.
// Input: an AI answer (+ any cited links). Output: a structured verification report.
// Trust signal is computed deterministically in code from step outputs.

import { createProvider } from "./providers/index.js";
import { extractClaims } from "./steps/claims.js";
import { verifyClaim } from "./steps/evidence.js";
import { analyzeBias } from "./steps/bias.js";
import { writeSummary } from "./steps/report.js";
import { profileSources } from "./sourceProfiler.js";
import { truncate, isHttpUrl } from "./text.js";
import { sleep } from "./http.js";

export const TRUST_SIGNALS = {
  "well-supported": { label: "Well supported", tone: "good" },
  mixed: { label: "Mixed evidence", tone: "warn" },
  "one-sided": { label: "Heavily one-sided", tone: "warn" },
  contradicted: { label: "Key claims contradicted", tone: "bad" },
  "manipulated-sources": { label: "Manipulated sources detected", tone: "bad" },
  "unverifiable": { label: "Largely unverifiable", tone: "neutral" },
  "no-claims": { label: "No checkable claims", tone: "neutral" }
};

function computeTrustSignal(claimResults, sources, bias) {
  const keys = claimResults.map((c) => c.verdict);
  const anyManipulated = sources.some((s) => s.highRisk);
  if (keys.includes("contradicted") && !keys.includes("supported")) return "contradicted";
  if (anyManipulated) return "manipulated-sources";
  if (keys.includes("contradicted")) return "contradicted";
  if (bias && bias.oneSided) return "one-sided";
  if (keys.includes("supported") && keys.includes("mixed")) return "mixed";
  if (keys.every((k) => k === "unverifiable")) return "unverifiable";
  if (keys.includes("supported")) return "well-supported";
  if (keys.includes("mixed")) return "mixed";
  return "unverifiable";
}

export async function verifyAnswer(input, settings, { onProgress = () => {}, provider = null, fetchSources = true } = {}) {
  const answerText = String(input.text || "").trim().slice(0, 15000);
  if (answerText.length < 40) throw new Error("Text too short to verify — paste or select a full AI answer.");

  const prov = provider || createProvider(settings);
  const maxClaims = Math.min(Math.max(Number(settings.maxClaims) || 5, 1), 8);
  const answerExcerpt = truncate(answerText, 600);

  onProgress({ step: "claims", pct: 8, message: "Breaking the answer into checkable claims…" });
  const claims = await extractClaims(prov, settings, answerText, maxClaims);

  // Step 2: evidence hunt per claim (2 at a time to respect free-tier rate limits).
  const claimResults = [];
  let done = 0;
  const queue = [...claims];
  const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (queue.length) {
      const claim = queue.shift();
      let result;
      try {
        result = await verifyClaim(prov, settings, claim, answerExcerpt);
      } catch (e) {
        result = { verdict: "unverifiable", confidence: "low", evidence: [], notes: `Evidence step failed: ${truncate(e.message, 200)}` };
      }
      claimResults.push({ ...claim, ...result });
      done++;
      onProgress({
        step: "evidence",
        pct: 8 + Math.round((done / claims.length) * 52),
        message: `Checking claim ${done}/${claims.length}: “${truncate(claim.text, 70)}”`
      });
      if (queue.length) await sleep(400);
    }
  });
  await Promise.all(workers);
  claimResults.sort((a, b) => a.id - b.id);

  // Step 3: source profiling (the answer's cited links + every evidence link).
  onProgress({ step: "sources", pct: 66, message: "Profiling every source for manipulation patterns…" });
  const citedUrls = (input.sources || []).map((s) => s && s.url).filter(isHttpUrl);
  const evidenceUrls = claimResults.flatMap((c) => c.evidence.map((e) => e.url));
  let sources = [];
  try {
    const seedTitles = {};
    (input.sources || []).forEach((s) => {
      if (s && isHttpUrl(s.url) && s.title) seedTitles[s.url] = s.title;
    });
    sources = await profileSources(prov, settings, [...citedUrls, ...evidenceUrls], { fetchSources, seedTitles });
  } catch (e) {
    sources = [];
  }

  // Step 4: bias analysis.
  onProgress({ step: "bias", pct: 80, message: "Analyzing framing, missing context, and manipulation signals…" });
  const contextForBias =
    `Claim checks:\n` +
    claimResults
      .map((c) => `- [${c.verdict}] ${c.text} — ${truncate(c.notes, 200)}`)
      .join("\n") +
    `\n\nSource warnings:\n` +
    sources
      .flatMap((s) => s.flags.filter((f) => f.severity === "high" || f.severity === "medium").map((f) => `- ${s.url}: ${f.label}`))
      .join("\n");
  let bias;
  try {
    bias = await analyzeBias(prov, settings, answerText, contextForBias);
  } catch (e) {
    bias = { oneSided: false, framingIssues: [], missingContext: [], strongestCounterargument: "", manipulationSignals: [`Bias analysis failed: ${truncate(e.message, 150)}`] };
  }

  // Step 5: summary.
  onProgress({ step: "summary", pct: 92, message: "Writing the report…" });
  const trustKey = computeTrustSignal(claimResults, sources, bias);
  let summary = { summary: "", readerAdvice: "" };
  try {
    summary = await writeSummary(prov, settings, `Trust signal: ${TRUST_SIGNALS[trustKey].label}.\n` + contextForBias);
  } catch (e) {
    summary = { summary: `The automated trust signal for this answer is “${TRUST_SIGNALS[trustKey].label}”. See the claim and source details below.`, readerAdvice: "" };
  }

  onProgress({ step: "done", pct: 100, message: "Report ready." });

  return {
    createdAt: new Date().toISOString(),
    page: input.page || "manual",
    providerName: prov.name,
    answerExcerpt,
    trustKey,
    trustLabel: TRUST_SIGNALS[trustKey].label,
    claims: claimResults,
    sources,
    bias,
    summary: summary.summary,
    readerAdvice: summary.readerAdvice,
    disclaimer:
      "FactLens provides evidence and flags, not a verdict. AI systems — including the one doing this analysis — can be wrong or biased. Check the linked primary sources yourself before deciding what is true."
  };
}
