// Live verification pass: runs ONE small, real verification through the full
// FactLens pipeline against a real AI provider.
//
// Usage (from the repo root):
//   FACTLENS_GEMINI_KEY=… node scripts/live-check.mjs
//   FACTLENS_PROVIDER=openrouter FACTLENS_OPENROUTER_KEY=… FACTLENS_OPENROUTER_MODEL=auto-free \
//     node scripts/live-check.mjs
//   FACTLENS_SECOND_PROVIDER=openrouter FACTLENS_SECOND_KEY=… …   # + cross-model check
//
// The key is read from the environment only — it is never written to a file,
// never logged, and nothing is persisted. Exits 0 when the live run completes,
// 1 when it fails. Quota cost: ~5 generateContent calls on the free tier.

import { verifyAnswer } from "../extension/engine/pipeline.js";

const PROVIDER = process.env.FACTLENS_PROVIDER || "gemini";
const KEY = process.env.FACTLENS_GEMINI_KEY;
const OR_KEY = process.env.FACTLENS_OPENROUTER_KEY;
const SECOND_PROVIDER = process.env.FACTLENS_SECOND_PROVIDER || "none";
const SECOND_KEY = process.env.FACTLENS_SECOND_KEY;

if (PROVIDER === "gemini" && !KEY) {
  console.error(`Missing FACTLENS_GEMINI_KEY.

Get a free key (2 minutes):
  1. https://aistudio.google.com/apikey
  2. "Create API key" → copy
  3. Run:  FACTLENS_GEMINI_KEY=your-key node scripts/live-check.mjs
     (Windows PowerShell:  $env:FACTLENS_GEMINI_KEY="your-key"; node scripts/live-check.mjs)

OpenRouter: FACTLENS_PROVIDER=openrouter FACTLENS_OPENROUTER_KEY=your-or-key \
FACTLENS_OPENROUTER_MODEL=auto-free node scripts/live-check.mjs
`);
  process.exit(1);
}
if (PROVIDER === "openrouter" && !OR_KEY) {
  console.error(`Missing FACTLENS_OPENROUTER_KEY.

Run:  FACTLENS_PROVIDER=openrouter FACTLENS_OPENROUTER_KEY=your-or-key FACTLENS_OPENROUTER_MODEL=auto-free node scripts/live-check.mjs
`);
  process.exit(1);
}

const settings = {
  provider: PROVIDER,
  geminiKey: KEY || "",
  geminiModel: process.env.FACTLENS_GEMINI_MODEL || "gemini-2.5-flash",
  openrouterKey: process.env.FACTLENS_OPENROUTER_KEY || "",
  openrouterModel: process.env.FACTLENS_OPENROUTER_MODEL || "auto-free",
  grounding: PROVIDER === "gemini" ? true : false,
  maxClaims: 2,
  secondProvider: SECOND_PROVIDER,
  compatKey: SECOND_PROVIDER === "openai-compat" ? SECOND_KEY || "" : ""
};

// Second-opinion provider credentials (uses that provider's key fields).
if (SECOND_PROVIDER === "openrouter") settings.openrouterKey = SECOND_KEY || settings.openrouterKey;
if (SECOND_PROVIDER === "gemini") settings.geminiKey = SECOND_KEY || settings.geminiKey;

// Small, real, current-events-adjacent answer whose claims are cheap to check.
const ANSWER = `Yes — the Hubble Space Telescope was launched by NASA in 1990 and is still
operating today. According to https://science.nasa.gov/mission/hubble/ it has made
more than 1.5 million observations. Its mirror was famously found to have a
manufacturing flaw, corrected by a 1993 servicing mission.`;

const started = Date.now();
try {
  const report = await verifyAnswer(
    { text: ANSWER, sources: [], page: "live-check" },
    settings,
    {
      fetchSources: true,
      onProgress: (p) => console.error(`  [${String(p.pct).padStart(3)}%] ${p.message}`)
    }
  );

  const out = {
    provider: report.providerName,
    model: report.providerModel,
    trust: { signal: report.trustLabel, score: Number(report.trustScore).toFixed(2), counts: report.trustCounts },
    method: report.method,
    claims: report.claims.map((c) => ({
      text: c.text,
      verdict: c.verdict,
      confidence: c.confidence,
      quoteStatuses: c.evidence.map((e) => e.quoteStatus),
      evidenceLinks: c.evidence.map((e) => e.url)
    })),
    sourceFlags: report.sources.flatMap((s) => s.flags.map((f) => `${s.siteName}: ${f.label}`)),
    secondOpinion: report.secondOpinion && report.secondOpinion.available
      ? {
          provider: report.secondOpinion.providerName,
          assessments: report.secondOpinion.assessments.map((a) => ({ id: a.id, verdict: a.verdict, agrees: a.agrees })),
          disagreements: report.secondOpinion.disagreements
        }
      : { available: false },
    elapsedSeconds: Math.round((Date.now() - started) / 1000)
  };
  console.log(JSON.stringify(out, null, 2));

  // Sanity gates for a healthy live run.
  const problems = [];
  if (PROVIDER === "gemini" && !report.method.searchUsed) problems.push("search grounding was not used");
  if (report.claims.every((c) => c.verdict === "unverifiable")) problems.push("every claim came back unverifiable");
  if (report.claims.every((c) => c.evidence.length === 0)) problems.push("no evidence links were returned");
  if (problems.length) {
    console.error(`\nLive run completed but looks unhealthy: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.error("\nLIVE CHECK PASSED");
} catch (e) {
  console.error(`LIVE CHECK FAILED: ${String(e.message || e)}`);
  process.exit(1);
}
