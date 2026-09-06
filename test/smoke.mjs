// Offline smoke test: runs the full pipeline with the mock provider (no network, no API key).
// Run: node test/smoke.mjs   (from the factlens/ directory)

import { verifyAnswer } from "../extension/engine/pipeline.js";
import { createProvider } from "../extension/engine/providers/index.js";
import { extractJson } from "../extension/engine/json.js";
import { stripHtml, truncate, hash32, domainOf } from "../extension/engine/text.js";
import { postJson } from "../extension/engine/http.js";
import { computeFlags, isEstablishedDomain, looksLikeQuestionHeadline } from "../extension/engine/sourceProfiler.js";

const SAMPLE_ANSWER = `Country X's parliament passed the emergency law on 12 March 2025. According to the Global
Security Observatory, the law allows detention without trial for up to 90 days, and over 40,000
people were affected in the first month. Critics say this is the harshest measure in a decade.`;

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name} ${extra}`);
  }
}

// --- unit bits -------------------------------------------------------------
console.log("unit checks:");
check("stripHtml removes tags", stripHtml("<p>Hello <b>world</b></p>").includes("Hello world"));
check("extractJson survives fences", extractJson('```json\n{"a":1}\n```').a === 1);
check("extractJson survives prose", extractJson('Sure! Here you go: {"a":[1,2],"b":"x"} hope it helps').a.length === 2);
check("truncate", truncate("abcdef", 4).length === 4);
check("hash32 stable", hash32("test") === hash32("test"));
check("domainOf strips www", domainOf("https://www.example.org/x") === "example.org");
check("established domain", isEstablishedDomain("https://www.reuters.com/a") === true);
check("gov domain", isEstablishedDomain("https://un.org/report") === true);

const geoPage = computeFlags({
  url: "https://global-security-observatory.org/is-x-a-threat",
  title: "Is Country X's emergency law a threat to human rights?",
  fetched: true,
  author: "",
  aboutLink: false,
  excerpt: "Our institute believes sponsored content is absent here."
});
check(
  "GEO question-headline flagged high risk",
  geoPage.highRisk && geoPage.flags.some((f) => f.key === "geo-question-headline"),
  JSON.stringify(geoPage.flags)
);

const reutersPage = computeFlags({
  url: "https://www.reuters.com/world/x-law-2025",
  title: "Country X passes emergency law",
  fetched: true,
  author: "Jane Doe",
  aboutLink: true,
  excerpt: "..."
});
check("reuters flagged established, low risk", reutersPage.established === true && !reutersPage.highRisk);

// --- multilingual heuristics (0.2.0) ---------------------------------------
console.log("multilingual checks:");
check(
  "Arabic yes/no headline (هل …؟) flagged",
  looksLikeQuestionHeadline("هل القانون يشكل تهديداً لحقوق الإنسان؟")
);
check(
  "Arabic wh-headline (لماذا …؟) flagged",
  looksLikeQuestionHeadline("لماذا فشل الرصد الإعلامي للقانون؟")
);
check("Arabic non-question headline not flagged", !looksLikeQuestionHeadline("تقرير جديد عن قانون الطوارئ"));
check("English non-question with colon not flagged", !looksLikeQuestionHeadline("The 2025 law: an analysis"));
check(
  "Arabic think-tank name flagged",
  computeFlags({
    url: "https://al-merasad-alami.org/report",
    title: "تقرير عن قانون الطوارئ",
    siteName: "مرصد الأمن العالمي",
    fetched: false,
    author: "",
    excerpt: ""
  }).flags.some((f) => f.key === "think-tank-unverified")
);
check(
  "established list is cross-partisan (Al Jazeera + Times of Israel + Reuters)",
  isEstablishedDomain("https://www.aljazeera.com/news/x") &&
    isEstablishedDomain("https://www.timesofisrael.com/x") &&
    isEstablishedDomain("https://reuters.com/x")
);

// --- retry/backoff on rate limits (0.2.0) -----------------------------------
console.log("retry checks:");
const realFetch = globalThis.fetch;
try {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    const headers = { get: () => "0" }; // Retry-After: 0 → minimal backoff
    if (calls <= 2) {
      return { status: 429, ok: false, headers, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    return {
      status: 200,
      ok: true,
      headers,
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => ({ success: true })
    };
  };
  const t0 = Date.now();
  const res = await postJson("https://mock.invalid/v1", {}, 5000, {}, { retries: 3 });
  const elapsed = Date.now() - t0;
  check("429s retried until success", res.status === 200 && calls === 3, `calls=${calls}`);
  check("Retry-After: 0 keeps backoff short", elapsed < 2500, `elapsed=${elapsed}ms`);

  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return {
      status: 400,
      ok: false,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0)
    };
  };
  const res400 = await postJson("https://mock.invalid/v1", {}, 5000, {}, { retries: 3 });
  check("non-retryable 400 returned immediately", res400.status === 400 && calls === 1, `calls=${calls}`);
} finally {
  globalThis.fetch = realFetch;
}

// --- full pipeline with mock provider ---------------------------------------
console.log("pipeline (mock provider):");
const settings = { provider: "mock", maxClaims: 5, grounding: false };
const progress = [];
const report = await verifyAnswer(
  {
    text: SAMPLE_ANSWER,
    sources: [{ url: "https://global-security-observatory.org/is-x-a-threat", title: "Is the law a threat?" }],
    page: "smoke-test"
  },
  settings,
  {
    fetchSources: false, // keep the test fully offline
    provider: createProvider(settings),
    onProgress: (p) => progress.push(p)
  }
);

check("progress reached done", progress.some((p) => p.step === "done"));
check("3 claims extracted", report.claims.length === 3, `got ${report.claims.length}`);
check("claims have verdicts", report.claims.every((c) => ["supported", "mixed", "contradicted", "unverifiable"].includes(c.verdict)));
check("evidence attached to claims", report.claims.every((c) => Array.isArray(c.evidence)));
check("sources profiled", report.sources.length >= 1, `got ${report.sources.length}`);
check(
  "GEO source flagged in report",
  report.sources.some((s) => s.highRisk || s.flags.some((f) => f.key === "geo-question-headline")),
  JSON.stringify(report.sources.map((s) => s.flags))
);
check("bias analyzed", typeof report.bias.oneSided === "boolean" && report.bias.strongestCounterargument.length > 0);
check("summary present", report.summary.length > 0);
check("trust signal is a known key", ["well-supported", "mixed", "one-sided", "contradicted", "manipulated-sources", "unverifiable", "no-claims"].includes(report.trustKey), report.trustKey);
check("GEO flags push signal to manipulated-sources", report.trustKey === "manipulated-sources", report.trustKey);
check("disclaimer present", report.disclaimer.includes("not a verdict"));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
