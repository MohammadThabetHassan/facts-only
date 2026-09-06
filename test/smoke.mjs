// Offline smoke test: runs unit checks and the full pipeline with the mock
// provider (no network, no API key).
// Run: node test/smoke.mjs   (from the factlens/ directory)

import { verifyAnswer, computeTrustSignal, TRUST_SIGNALS } from "../extension/engine/pipeline.js";
import { createProvider } from "../extension/engine/providers/index.js";
import { extractJson } from "../extension/engine/json.js";
import { stripHtml, truncate, hash32, domainOf, extractUrls, normText } from "../extension/engine/text.js";
import { postJson } from "../extension/engine/http.js";
import { computeFlags, isEstablishedDomain, looksLikeQuestionHeadline, verifyQuoteInPage, profileSources } from "../extension/engine/sourceProfiler.js";
import { lookupCache, saveToCache, settingsFingerprint } from "../extension/engine/ui/cache.js";

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name} ${extra}`);
  }
}

// --- text / json utilities ---------------------------------------------------
console.log("unit checks:");
check("stripHtml removes tags", stripHtml("<p>Hello <b>world</b></p>").includes("Hello world"));
check("extractJson survives fences", extractJson('```json\n{"a":1}\n```').a === 1);
check("extractJson survives prose", extractJson('Sure! Here you go: {"a":[1,2],"b":"x"} hope it helps').a.length === 2);
check("truncate", truncate("abcdef", 4).length === 4);
check("hash32 stable", hash32("test") === hash32("test"));
check("domainOf strips www", domainOf("https://www.example.org/x") === "example.org");
check("normText unifies quotes+whitespace", normText("He said  “stop” —\n now") === 'he said "stop" - now');

check(
  "extractUrls: markdown link with anchor title",
  (() => {
    const r = extractUrls("see [the report](https://example.org/a.pdf) for details");
    return r.length === 1 && r[0].url === "https://example.org/a.pdf" && r[0].title === "the report";
  })()
);
check(
  "extractUrls: bare URLs, dedupe, trailing punctuation stripped",
  (() => {
    const r = extractUrls("visit https://example.org/x, then https://example.org/x and http://bin.org/y.");
    return r.length === 2 && r[0].url === "https://example.org/x" && r[1].url === "http://bin.org/y";
  })()
);
check("extractUrls: rejects non-http", extractUrls("ftp://x.com and javascript:alert(1)").length === 0);

// --- source heuristics --------------------------------------------------------
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

// --- multilingual heuristics ---------------------------------------------------
console.log("multilingual checks:");
check("Arabic yes/no headline (هل …؟) flagged", looksLikeQuestionHeadline("هل القانون يشكل تهديداً لحقوق الإنسان؟"));
check("Arabic wh-headline (لماذا …؟) flagged", looksLikeQuestionHeadline("لماذا فشل الرصد الإعلامي للقانون؟"));
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

// --- quote verification ---------------------------------------------------------
console.log("quote verification checks:");
const PAGE = "The law entered into force on 12 March 2025, according to the gazette. Critics disputed the numbers.";
check("exact quote verified", verifyQuoteInPage("The law entered into force on 12 March 2025", PAGE) === "verified");
check("quote verified despite curly quotes/whitespace", verifyQuoteInPage("“law  entered   into force”", PAGE) === "partial" || verifyQuoteInPage("“law  entered   into force”", PAGE) === "verified");
check("wrong quote not found", verifyQuoteInPage("The law was repealed in 2021", PAGE) === "not-found");
check("no page text → page-not-fetched", verifyQuoteInPage("anything", "") === "page-not-fetched");
check("empty quote → none", verifyQuoteInPage("", PAGE) === "none");

// --- retry/backoff on rate limits ------------------------------------------------
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

  calls = 0;
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  let abortedThrown = false;
  try {
    await postJson("https://mock.invalid/v1", {}, 5000, {}, { retries: 3, signal: alreadyAborted.signal });
  } catch (e) {
    abortedThrown = e.name === "AbortError";
  }
  check("pre-aborted signal fails fast, zero calls", abortedThrown && calls === 0, `calls=${calls}`);

  // user abort mid-run must NOT be retried
  calls = 0;
  const mid = new AbortController();
  globalThis.fetch = async (url, opts) => {
    calls++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve({
        status: 200, ok: true, headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({})
      }), 5000);
      opts.signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  };
  const slow = new AbortController();
  const slowRun = postJson("https://mock.invalid/v1", {}, 30000, {}, { retries: 3, signal: slow.signal });
  setTimeout(() => slow.abort(), 100);
  let userAbortHonored = false;
  try {
    await slowRun;
  } catch (e) {
    userAbortHonored = e.name === "AbortError" && calls === 1;
  }
  check("user abort during request is not retried", userAbortHonored, `calls=${calls}`);
} finally {
  globalThis.fetch = realFetch;
}

// --- trust signal aggregation (deterministic contract) ----------------------------
console.log("trust signal checks:");
const S = (verdict, confidence) => ({ verdict, confidence });
check(
  "all supported/high → well-supported",
  computeTrustSignal([S("supported", "high")], [], { oneSided: false }).key === "well-supported"
);
check(
  "confidence is weighted: supported/low alone is not well-supported",
  computeTrustSignal([S("supported", "low")], [], { oneSided: false }).key === "mixed"
);
check(
  "1 contradicted among 3 supported (high conf) → mixed, not contradicted",
  computeTrustSignal(
    [S("supported", "high"), S("supported", "high"), S("supported", "high"), S("contradicted", "high")],
    [],
    { oneSided: false }
  ).key === "mixed"
);
check(
  "contradicted only → contradicted",
  computeTrustSignal([S("contradicted", "high")], [], { oneSided: false }).key === "contradicted"
);
check(
  "high-risk source flags raise manipulated-sources",
  computeTrustSignal([S("mixed", "high")], [{ highRisk: true }], { oneSided: false }).key === "manipulated-sources"
);
check(
  "well-supported + manipulated source still warns (unless score very high)",
  computeTrustSignal([S("supported", "low")], [{ highRisk: true }], { oneSided: false }).key === "manipulated-sources"
);
check(
  "one-sided bias with weak support → one-sided",
  computeTrustSignal([S("supported", "low")], [], { oneSided: true }).key === "one-sided"
);
check(
  "all unverifiable → unverifiable",
  computeTrustSignal([S("unverifiable", "low"), S("unverifiable", "low")], [], { oneSided: false }).key === "unverifiable"
);
check(
  "basis lines expose counts and score",
  (() => {
    const r = computeTrustSignal([S("supported", "high"), S("contradicted", "high")], [], { oneSided: false });
    return r.basis.length >= 3 && /weighted support score/.test(r.basis[0]) && r.counts.checked === 2;
  })()
);
check("every trust key has a label", Object.keys(TRUST_SIGNALS).every((k) => !!TRUST_SIGNALS[k].label));

// --- cache ------------------------------------------------------------------------
console.log("cache checks:");
{
  const store = {
    data: new Map(),
    async get(k, fb) {
      return this.data.has(k) ? this.data.get(k) : fb;
    },
    async set(o) {
      for (const [k, v] of Object.entries(o)) this.data.set(k, v);
    }
  };
  const rep = { trustKey: "mixed", summary: "r1" };
  check("cache miss on empty store", (await lookupCache("answer text", "fp1", { storage: store })) === null);
  await saveToCache("answer text", "fp1", rep, { storage: store });
  check("cache hit after save", (await lookupCache("answer text", "fp1", { storage: store })).report.summary === "r1");
  check("different settings fingerprint → miss", (await lookupCache("answer text", "fp2", { storage: store })) === null);
  await saveToCache("a2", "fp1", { summary: "r2" }, { storage: store });
  await saveToCache("a3", "fp1", { summary: "r3" }, { storage: store });
  await saveToCache("a4", "fp1", { summary: "r4" }, { storage: store, maxEntries: 2 });
  const entries = (await store.get("cache", [])).map((e) => e.report.summary);
  check("eviction keeps newest within cap", entries.length === 2 && entries.includes("r4") && entries.includes("r3"), JSON.stringify(entries));
  check("fingerprint covers provider+grounding+secondProvider", settingsFingerprint({ provider: "gemini", grounding: true, secondProvider: "openrouter" }) !== settingsFingerprint({ provider: "gemini", grounding: true, secondProvider: "none" }));
}

// --- provider response parsing (mocked fetch) ---------------------------------------
console.log("provider parsing checks:");
{
  // Gemini: parts joined, grounding chunks surfaced, JSON-mime 400 → retry without mime
  let calls = 0;
  globalThis.fetch = async (url, opts) => {
    calls++;
    const body = JSON.parse(opts.body);
    if (body.generationConfig && body.generationConfig.responseMimeType) {
      return { status: 400, ok: false, headers: { get: () => "application/json" }, arrayBuffer: async () => new ArrayBuffer(0), text: async () => '{"error":{"message":"response_mime_type not supported with tools"}}' };
    }
    return {
      status: 200,
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: '{"claims":[]}' }, { text: "" }] },
            groundingMetadata: { groundingChunks: [{ web: { uri: "https://a.example/x", title: "A" } }] }
          }
        ]
      })
    };
  };
  try {
    const gem = createProvider({ provider: "gemini", geminiKey: "k", geminiModel: "gemini-2.5-flash", grounding: true });
    const out = await gem.complete({ system: "s", user: "u", json: true, task: "claims" });
    check("gemini: parts joined into one text", out.text === '{"claims":[]}', out.text);
    check("gemini: grounding chunks → meta.sources", out.meta.groundingSources.length === 1 && out.meta.groundingSources[0].url === "https://a.example/x");
    check("gemini: JSON-mime 400 retried without mime", calls === 2, `calls=${calls}`);

    // OpenRouter: chat.completions shape
    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ choices: [{ message: { content: '{"ok":1}' } }] })
    });
    const or = createProvider({ provider: "openrouter", openrouterKey: "k" });
    const orOut = await or.complete({ system: "s", user: "u", task: "test" });
    check("openrouter: message.content parsed", orOut.text === '{"ok":1}');
    check("openrouter: no search capability declared", or.supportsSearch === false);

    // missing key → helpful error, not a network call
    const noKey = createProvider({ provider: "gemini", geminiKey: "" });
    let keyErr = "";
    try {
      await noKey.complete({ system: "s", user: "u", task: "test" });
    } catch (e) {
      keyErr = String(e.message);
    }
    check("gemini missing key → actionable error", /aistudio\.google\.com/.test(keyErr), keyErr);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// --- profileSources: fetch-disabled path keeps seed titles --------------------------
{
  const profiles = await profileSources(null, {}, ["https://example.org/report"], { fetchSources: false, seedTitles: { "https://example.org/report": "Is this a fake report?" } });
  check(
    "profileSources: seed title survives fetch-disabled and flags GEO headline",
    profiles.length === 1 && profiles[0].title.includes("fake report") && profiles[0].flags.some((f) => f.key === "geo-question-headline"),
    JSON.stringify(profiles[0] && profiles[0].flags)
  );
}

// --- full pipeline with mock provider -----------------------------------------------
console.log("pipeline (mock provider):");
const SAMPLE_ANSWER = `Country X's parliament passed the emergency law on 12 March 2025. According to the Global
Security Observatory, the law allows detention without trial for up to 90 days, and over 40,000
people were affected in the first month. Critics say this is the harshest measure in a decade.`;

const settings = { provider: "mock", maxClaims: 5, grounding: false, secondProvider: "none" };
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
check("every evidence item carries a quote status", report.claims.every((c) => c.evidence.every((e) => ["verified", "partial", "not-found", "page-not-fetched", "none"].includes(e.quoteStatus))));
check("unfetched pages → quote status page-not-fetched", report.claims.some((c) => c.evidence.some((e) => e.quoteStatus === "page-not-fetched")));
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

// coverage + method metadata
check("method metadata present", report.method && typeof report.method.searchUsed === "boolean");
check("coverage disclosed: 3 checked of ~4 (1 additional)", report.method.claimsChecked === 3 && report.method.additionalCheckable === 1 && report.method.claimsTotal === 4, JSON.stringify(report.method));
check("search-used flag false for mock", report.method.searchUsed === false);
check("trust score + counts exposed", typeof report.trustScore === "number" && report.trustCounts.checked === 3);
check("trust basis lines present", Array.isArray(report.trustBasis) && report.trustBasis.length >= 3);

// second opinion: same provider → gracefully unavailable
check("second opinion same-provider → unavailable with note", report.secondOpinion && report.secondOpinion.available === false);

// second opinion with a different (mock) provider → mock has no "second-opinion" task,
// so the engine must degrade gracefully rather than crash
{
  const soSettings = { ...settings, secondProvider: "openai-compat", compatKey: "x" };
  const soReport = await verifyAnswer(
    { text: SAMPLE_ANSWER, sources: [], page: "smoke-test" },
    soSettings,
    { fetchSources: false, provider: createProvider(settings) }
  );
  check("second opinion cross-provider attempt degrades gracefully", soReport.secondOpinion && soReport.secondOpinion.available === true || /failed/i.test(soReport.secondOpinion?.note || ""), JSON.stringify(soReport.secondOpinion));
}

// cancellation: abort before run → AbortError surfaces
{
  const ctrl = new AbortController();
  ctrl.abort();
  let aborted = false;
  try {
    await verifyAnswer({ text: SAMPLE_ANSWER, sources: [], page: "x" }, settings, {
      fetchSources: false,
      provider: createProvider(settings),
      signal: ctrl.signal
    });
  } catch (e) {
    aborted = e.name === "AbortError" || /abort/i.test(e.message || "");
  }
  check("pipeline honors pre-aborted signal", aborted);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
