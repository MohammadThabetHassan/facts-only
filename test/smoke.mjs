// Offline smoke test: runs unit checks and the full pipeline with the mock
// provider (no network, no API key).
// Run: node test/smoke.mjs   (from the facts-only/ directory)

import { verifyAnswer, computeTrustSignal, TRUST_SIGNALS } from "../extension/engine/pipeline.js";
import { createProvider } from "../extension/engine/providers/index.js";
import { extractJson } from "../extension/engine/json.js";
import { stripHtml, truncate, hash32, domainOf, extractUrls, normText, isPublicHttpUrl } from "../extension/engine/text.js";
import { postJson } from "../extension/engine/http.js";
import { computeFlags, isEstablishedDomain, looksLikeQuestionHeadline, looksLikePromptShapedHeadline, verifyQuoteInPage, profileSources, domainAgeDays, formatFirstSeen } from "../extension/engine/sourceProfiler.js";
import { pickFreeModels } from "../extension/engine/providers/openrouter.js";
import { lookupCache, saveToCache, settingsFingerprint } from "../extension/engine/ui/cache.js";
import { t, resolveLocale, keys, locales, isRtl } from "../extension/engine/ui/i18n.js";
import { summarizeRisk } from "../extension/engine/explain.js";
import { checkSources } from "../extension/engine/sourceCheck.js";
import { scoreSignals, classifyAuthor, SIGNAL_WEIGHTS, HIGH_RISK_AT } from "../extension/engine/sourceScore.js";

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
// Regression: the second-opinion step used to slice indexOf("{")..lastIndexOf("}"),
// which a brace in TRAILING prose, or a second object, silently corrupts.
check("extractJson stops at the first complete object (trailing brace in prose)",
  extractJson('{"a":1}\nNote: see item {b}').a === 1);
check("extractJson stops at the first complete object (two objects)",
  extractJson('{"a":1}\n{"b":2}').a === 1);
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

// --- OpenRouter auto-free model selection -------------------------------------
console.log("auto-free model checks:");
const FAKE_CATALOG = [
  { id: "openrouter/free", pricing: { prompt: "0", completion: "0" }, context_length: 200000 },
  { id: "minimax/minimax-m3:free", pricing: { prompt: "0", completion: "0" }, context_length: 1048576 },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", pricing: { prompt: "0", completion: "0" }, context_length: 262144 },
  { id: "nvidia/nemotron-3.5-content-safety:free", pricing: { prompt: "0", completion: "0" }, context_length: 128000 },
  { id: "cohere/north-mini-code:free", pricing: { prompt: "0", completion: "0" }, context_length: 256000 },
  { id: "paid/model", pricing: { prompt: "0.001", completion: "0.002" }, context_length: 128000 }
];
const ranked = pickFreeModels(FAKE_CATALOG);
check("auto-free skips specialized + paid models", !ranked.some((m) => /code|safety|paid/.test(m)), JSON.stringify(ranked));
check("auto-free prefers known generalist families first", ranked[0] === "minimax/minimax-m3:free" || ranked[0] === "nvidia/nemotron-3-super-120b-a12b:free", JSON.stringify(ranked.slice(0, 2)));
check("auto-free keeps multiple fallback candidates", ranked.length === 3, JSON.stringify(ranked));
check("auto-free openrouter/free router is in the candidate list", ranked.includes("openrouter/free"));

// --- domain-age (Wayback first-seen) flags --------------------------------------
console.log("domain-age checks:");
const recentTs = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10).replace(/-/g, "") + "000000";
const oldTs = "19961231000000";
check("domainAgeDays parses recent timestamp", domainAgeDays(recentTs) >= 28 && domainAgeDays(recentTs) <= 32, domainAgeDays(recentTs));
check("domainAgeDays for 1996 is very old", domainAgeDays(oldTs) > 9000);
check("formatFirstSeen renders YYYY-MM", formatFirstSeen("19961231000000") === "1996-12");
const page = (over) => computeFlags({
  url: "https://analysis-site.org/report", title: "Country X passes law", fetched: true,
  author: "Jane Doe", aboutLink: true, excerpt: "...", ...over
});
const keysOf = (r) => r.flags.map((f) => f.key);

check("fresh domain (<90d) flagged",
  keysOf(page({ archive: { ageDays: 30, months: 1 } })).includes("domain-fresh"));
check("long, continuously archived domain earns a legitimacy signal",
  keysOf(page({ archive: { ageDays: 9000, months: 200 } })).includes("domain-long-history"));
check("old domain is not freshness-flagged",
  !keysOf(page({ archive: { ageDays: 9000, months: 200 } })).some((k) => k === "domain-fresh" || k === "domain-unarchived"));

// Aged domains are sold specifically to defeat age checks, so age without a
// publishing history to match it is itself the signal.
check("aged domain with almost no archive history is flagged as a shell",
  keysOf(page({ archive: { ageDays: 4000, months: 2 } })).includes("domain-shell"));
check("aged shell does NOT get the long-history legitimacy signal",
  !keysOf(page({ archive: { ageDays: 4000, months: 2 } })).includes("domain-long-history"));
check("a young site publishing sporadically is flagged as thin",
  keysOf(page({ archive: { ageDays: 550, months: 3 } })).includes("domain-thin-history"));
check("a young site publishing consistently is not flagged as thin",
  !keysOf(page({ archive: { ageDays: 550, months: 16 } })).includes("domain-thin-history"));
check("a failed archive lookup emits no archive signal at all",
  !keysOf(page({ archive: null })).some((k) => k.startsWith("domain-")));

// --- i18n (en/ar parity, fallback, formatting) --------------------------------
console.log("i18n checks:");
check("locales are exactly en + ar", locales().sort().join(",") === "ar,en", locales().join(","));
const enKeys = keys("en").sort();
const arKeys = keys("ar").sort();
check("ar covers every en key", JSON.stringify(enKeys) === JSON.stringify(arKeys),
  enKeys.filter((k) => !arKeys.includes(k)).concat(arKeys.filter((k) => !enKeys.includes(k))).join(","));
check("every en value is a nonempty string", keys("en").every((k) => typeof t(k, "en") === "string" && t(k, "en").length > 0));
check("t() returns the key itself when missing", t("__nonexistent__", "ar") === "__nonexistent__");
check("t() formats {params}", (() => {
  const s = t("m.coverage", "en", { checked: 3, total: 4, extra: 1 });
  return s.includes("3") && s.includes("4") && s.includes("1");
})());
check("ar is RTL, en is not", isRtl("ar") === true && isRtl("en") === false);
check("resolveLocale: explicit ar/en", resolveLocale("ar") === "ar" && resolveLocale("en") === "en");
check("resolveLocale: unknown falls back to en", resolveLocale("xx") === "en");
check("ar verdict labels differ from en (real translation)", t("verdict.supported", "ar") !== t("verdict.supported", "en"));

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

// --- SSRF guard: model-supplied URLs are fetched from a privileged context ----
console.log("\nssrf guard:");
{
  const allowed = [
    "https://reuters.com/article/x",
    "http://example.org/a",
    "https://sub.domain.co.uk/path?q=1"
  ];
  const blocked = [
    "http://localhost:8080/admin",
    "http://127.0.0.1/",
    "https://127.0.0.1:8443/x",
    "http://169.254.169.254/latest/meta-data/",  // cloud metadata
    "http://192.168.1.1/",
    "http://10.0.0.5/internal",
    "http://[::1]/",                             // IPv6 loopback
    "http://2130706433/",                        // decimal-encoded 127.0.0.1
    "http://0x7f000001/",                        // hex-encoded 127.0.0.1
    "http://wiki/",                              // bare intranet name
    "http://printer.local/",
    "https://db.internal/dump",
    "http://user:pass@example.org/",             // credentials in URL
    "file:///etc/passwd",
    "javascript:alert(1)"
  ];
  check("SSRF guard allows public http(s) sources", allowed.every(isPublicHttpUrl),
    JSON.stringify(allowed.filter((u) => !isPublicHttpUrl(u))));
  check("SSRF guard blocks loopback, private, metadata, encoded and non-http URLs",
    blocked.every((u) => !isPublicHttpUrl(u)),
    JSON.stringify(blocked.filter(isPublicHttpUrl)));
}

// A non-public citation must be refused AND surfaced as a high-risk signal,
// not silently dropped — a model citing 127.0.0.1 is itself a detection event.
{
  const profiled = await profileSources(null, {}, ["http://127.0.0.1:8080/admin"], { fetchSources: true });
  const s0 = profiled[0];
  // A public URL that redirects to a private one used to walk straight past the
  // guard: fetch follows redirects, and the guard only saw the URL we asked for.
  {
    const realFetch2 = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      url: "http://127.0.0.1:8080/admin", // where we actually landed
      headers: { get: () => "text/html" },
      text: async () => "<title>Internal admin</title><body>secrets</body>"
    });
    try {
      const profiled = await profileSources(null, {}, ["https://public-looking.example/r"], { fetchSources: true });
      const s0 = profiled[0];
      check("a redirect to a private address is refused, not read",
        s0.fetched === false && s0.highRisk === true, JSON.stringify(s0 && { fetched: s0.fetched, note: s0.fetchNote }));
      check("the internal page body is never captured",
        !JSON.stringify(profiled).includes("secrets"));
    } finally {
      globalThis.fetch = realFetch2;
    }
  }

  check("non-public citation is profiled but never fetched",
    profiled.length === 1 && s0.fetched === false, JSON.stringify(s0 && { fetched: s0.fetched }));
  check("non-public citation flagged high risk",
    !!s0 && s0.highRisk === true && s0.flags.some((f) => f.key === "non-public-url"),
    JSON.stringify(s0 && s0.flags));
}

// --- plain-language risk explanation ----------------------------------------
console.log("\nrisk explanation:");
{
  // Sources as the profiler emits them: flags carry weights and severities, and
  // the source carries the level its score earned.
  // A source we actually managed to check: fetched, with an archive record.
  // Without those, summarizeRisk correctly refuses to call it clean.
  const src = (keys, level, established = false) => ({
    url: "https://example.org/a",
    siteName: "example.org",
    established,
    fetched: true,
    archivedMonths: 120,
    firstArchived: "2010-01",
    placementLevel: level,
    flags: keys.map((key) => ({
      key,
      severity: key === "established" || key.startsWith("named-") || key.startsWith("has-") || key === "domain-long-history" ? "info" : "high"
    }))
  });

  // A source we could not reach at all: no fetch, no archive record.
  const unreachable = () => ({
    url: "https://blocked.example/a",
    siteName: "blocked.example",
    established: false,
    fetched: false,
    archivedMonths: null,
    firstArchived: null,
    placementLevel: "clean",
    flags: []
  });

  check("clean when every source is an established publisher",
    summarizeRisk([src(["established"], "clean", true), src(["established"], "clean", true)]).level === "clean");

  // Worst-first: paid placement must never be softened into "unnamed publisher".
  check("paid content outranks every other signal",
    summarizeRisk([src(["no-author", "domain-fresh", "sponsored"], "high")]).level === "paid");

  check("a high placement score reads as planted",
    summarizeRisk([src(["prompt-shaped-headline", "no-author", "domain-fresh"], "high")]).level === "planted");

  check("an elevated placement score reads as opaque, not planted",
    summarizeRisk([src(["no-author", "domain-recent"], "elevated")]).level === "opaque");

  // THE regression that motivated the scoring rewrite: a question-shaped
  // headline is ordinary journalism. If the source scored clean, the card must
  // stay silent no matter which signals are present on it.
  check("a cleared source is never announced as planted, whatever its signals",
    summarizeRisk([src(["geo-question-headline", "domain-long-history"], "clean")]).level === "clean");

  check("positive signals are never quoted back as reasons to worry",
    (() => {
      const r = summarizeRisk([src(["sponsored", "named-author", "has-about", "domain-long-history"], "high")]);
      return r.reasonKeys.length === 1 && r.reasonKeys[0] === "sponsored";
    })());

  check("risk summary counts trustworthy sources for the reader",
    (() => {
      const r = summarizeRisk([src(["established"], "clean", true), src(["sponsored"], "high")]);
      return r.total === 2 && r.establishedCount === 1;
    })());

  check("risk summary names only the sources that triggered the level",
    (() => {
      const r = summarizeRisk([src(["established"], "clean", true), src(["sponsored"], "high")]);
      return r.offenders.length === 1 && r.offenders[0].reasonKeys.join() === "sponsored";
    })());

  check("a flagged source lists every concerning reason it has",
    (() => {
      const r = summarizeRisk([src(["prompt-shaped-headline", "no-author", "domain-fresh"], "high")]);
      return r.level === "planted" && r.offenders[0].reasonKeys.length === 3;
    })());

  // Silence is not an all-clear. In the web app CORS blocks both the page fetch
  // and the Wayback API, so this is the normal case there, not an edge case -
  // and reporting it as "clean" would be the most harmful thing this tool could
  // say to someone who came here precisely because they could not tell.
  check("a source we could not check is never reported as clean",
    summarizeRisk([unreachable()]).level === "unknown");

  check("the unknown verdict names the sources it could not reach",
    (() => {
      const r = summarizeRisk([unreachable()]);
      return r.uncheckedCount === 1 && r.offenders.length === 1 && r.offenders[0].name === "blocked.example";
    })());

  // Real evidence still outranks silence: one flagged source is worth reporting
  // even if another could not be reached.
  check("a real finding outranks an unreachable source",
    summarizeRisk([unreachable(), src(["sponsored"], "high")]).level === "paid");

  check("allowlisted sources count as checked even without a fetch",
    summarizeRisk([{ url: "https://reuters.com/a", siteName: "reuters.com", established: true, fetched: false, flags: [], placementLevel: "clean" }]).level === "clean");

  check("empty source list degrades to clean, not a crash",
    summarizeRisk([]).level === "clean" && summarizeRisk().level === "clean");

  // Every flag the profiler can emit needs plain wording in BOTH locales,
  // otherwise a reader sees a raw i18n key where the explanation should be.
  const FLAG_KEYS = Object.keys(SIGNAL_WEIGHTS).concat("established");
  for (const loc of ["en", "ar"]) {
    const missing = FLAG_KEYS.filter((k) => t("flag." + k, loc) === "flag." + k);
    check(`every source flag has plain wording in ${loc}`, missing.length === 0, missing.join());
  }
  for (const loc of ["en", "ar"]) {
    const missing = ["paid", "planted", "opaque", "clean", "unknown"].flatMap((lvl) =>
      ["head", "body"].map((part) => `explain.${lvl}.${part}`)
    ).filter((k) => t(k, loc) === k);
    check(`every risk level has plain wording in ${loc}`, missing.length === 0, missing.join());
  }
}

// --- placement scoring -------------------------------------------------------
console.log("\nplacement scoring:");
{
  check("no single signal can convict a source on its own",
    Object.entries(SIGNAL_WEIGHTS)
      .filter(([k]) => k !== "non-public-url" && k !== "sponsored")
      .every(([, w]) => w < HIGH_RISK_AT),
    "a lone signal reaching the high-risk threshold is exactly the bug this replaced");

  check("paid content and non-public URLs ARE decisive alone",
    scoreSignals(["sponsored"]).level === "high" && scoreSignals(["non-public-url"]).level === "high");

  // The one-character evasion that motivated all of this.
  check("dropping the question mark no longer clears a campaign site",
    scoreSignals(["prompt-shaped-headline", "no-author", "no-about", "think-tank-unverified", "domain-fresh"]).level === "high");

  check("a long, continuously archived publisher survives a question headline",
    scoreSignals(["geo-question-headline", "named-author", "has-about", "domain-long-history"]).level === "clean");

  check("scoring is order-independent and ignores duplicates",
    scoreSignals(["no-author", "domain-fresh", "no-author"]).score === scoreSignals(["domain-fresh", "no-author"]).score);

  check("unknown signal keys are ignored rather than scored as zero-weight noise",
    scoreSignals(["not-a-real-signal"]).score === 0 && scoreSignals(["not-a-real-signal"]).contributions.length === 0);

  // Found by the eval, not by inspection: a thirty-year-old newspaper running an
  // advertorial scored CLEAN, because its archive history (-30), byline (-10)
  // and about page (-5) more than cancelled the paid-content signal (+60).
  // Exactly backwards - a trusted masthead makes paid placement more effective,
  // not less - so paid content is decisive regardless of everything else.
  check("reputation cannot cancel out paid content",
    (() => {
      const r = scoreSignals(["sponsored", "named-author", "has-about", "domain-long-history"]);
      return r.level === "high" && r.decisive === true && r.score < HIGH_RISK_AT;
    })());

  check("a non-public citation is decisive too",
    scoreSignals(["non-public-url", "domain-long-history", "named-author"]).level === "high");

  check("an allowlisted publisher running an advertorial is still flagged",
    (() => {
      const r = computeFlags({
        url: "https://reuters.com/x", siteName: "reuters.com", title: "The law explained",
        fetched: true, author: "R. Ellis", aboutLink: true,
        excerpt: "Sponsored content produced with our commercial team.",
        archive: { ageDays: 9000, months: 300 }
      });
      return r.established === true && r.highRisk === true && r.flags.some((f) => f.key === "sponsored");
    })());

  check("an allowlisted publisher with nothing paid is still short-circuited clean",
    (() => {
      const r = computeFlags({
        url: "https://reuters.com/x", siteName: "reuters.com", title: "Is the economy recovering?",
        fetched: true, author: "", aboutLink: false, excerpt: "", archive: null
      });
      return r.established === true && r.level === "clean";
    })());

  check("classifyAuthor separates a byline from a placeholder",
    classifyAuthor("R. Ellis") === "named" &&
    classifyAuthor("Editorial Team") === "generic" &&
    classifyAuthor("Admin") === "generic" &&
    classifyAuthor("") === "none");

  check("a prompt-shaped headline is detected without a question mark",
    looksLikePromptShapedHeadline("How the law threatens human rights") &&
    !looksLikePromptShapedHeadline("Parliament passes emergency law"));

  check("the punctuated and unpunctuated headline signals never both fire",
    !(looksLikeQuestionHeadline("Is the law a threat?") && looksLikePromptShapedHeadline("Is the law a threat?")));
}

// The exported Markdown is what actually gets pasted into a chat or an email,
// so it has to carry the same plain-language warning the screen does.
{
  const { reportToMarkdown } = await import("../extension/engine/ui/report-view.js");
  const md = reportToMarkdown(report);
  const head = md.split("\n").slice(0, 12).join("\n");
  check("exported report leads with the plain-language warning",
    /^# Facts Only verification report/.test(md) && /^> \*\*/m.test(head),
    head);
  check("exported warning names the flagged source and its reasons",
    /global-security-observatory\.org/.test(head) && /research institute/.test(head),
    head);
  check("exported source flags use plain wording with the technical term in parentheses",
    /- \u26a0 [^(\n]+\(/.test(md) || !/## Sources/.test(md));
}

// --- keyless source check ----------------------------------------------------
// The half of the pipeline that needs no API key, and therefore no setup at all.
console.log("\nkeyless source check:");
{
  const cited = [
    { url: "https://global-security-observatory.org/is-x-a-threat", title: "Is the law a threat to human rights?" },
    { url: "https://reuters.com/world/x", title: "Parliament passes emergency law" }
  ];
  const report = await checkSources({ text: "…", sources: cited, page: "test" }, { fetchSources: false });

  check("keyless check runs with no provider and no key", !!report && report.sourcesOnly === true);
  check("keyless check profiles every cited source", report.sources.length === 2);
  check("keyless check reports no claims rather than pretending to have checked them",
    Array.isArray(report.claims) && report.claims.length === 0 && report.method.claimsChecked === 0);
  check("keyless check advertises itself as keyless", report.method.keyless === true && report.providerName === "none");

  // The disclaimer is the whole safety story for this mode: a reader must not
  // read "sources look fine" as "the answer is true".
  check("keyless disclaimer says the claims were NOT verified",
    /NOT verified/i.test(report.disclaimer) && /source check only/i.test(report.disclaimer));

  check("keyless check still recognises an established publisher",
    report.sources.some((x) => x.url.includes("reuters.com") && x.established === true));

  // With fetching disabled nothing could be learned about the unknown domain,
  // so the verdict must be "could not check", never an all-clear.
  check("keyless check with no fetch reports unknown, not clean",
    ["unknown", "opaque", "planted", "paid"].includes(report.riskLevel), report.riskLevel);

  let threw = "";
  try {
    await checkSources({ text: "no links here at all", sources: [] }, {});
  } catch (e) {
    threw = String(e.message || e);
  }
  check("keyless check refuses text with no links, and says why", /No links found/i.test(threw), threw);

  // A sources-only report must survive the Markdown exporter, which was written
  // assuming claims, bias and a second opinion all exist.
  const { reportToMarkdown: toMd } = await import("../extension/engine/ui/report-view.js");
  let md = "";
  let mdError = "";
  try {
    md = toMd(report);
  } catch (e) {
    mdError = String(e.message || e);
  }
  check("sources-only report exports to Markdown without crashing", !mdError, mdError);
  check("exported keyless report carries the disclaimer", /NOT verified/i.test(md));
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
