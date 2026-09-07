// Measure the placement detector: how often it accuses real publishers, and how
// much work it takes an adversary to slip past it.
//
//   node eval/run.mjs            human-readable report
//   node eval/run.mjs --json     machine-readable, for CI
//
// Fully offline and deterministic: real Wayback archive profiles come from the
// committed eval/corpus.json (regenerate with eval/collect.mjs), and the
// adversary side is synthetic by design — see docs/EVALUATION.md for why naming
// real domains as influence operations is not something this repo will do.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeFlags } from "../extension/engine/sourceProfiler.js";
import { SIGNAL_WEIGHTS, HIGH_RISK_AT, ELEVATED_AT } from "../extension/engine/sourceScore.js";
import { extractArticle, stripHtml } from "../extension/engine/text.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(HERE, "corpus.json"), "utf8"));
const JSON_OUT = process.argv.includes("--json");

// --- the rule this replaced -------------------------------------------------
// "any high-severity flag ⇒ high risk", where the only high-severity signals
// were a question-mark headline, sponsored markers, and a non-public URL.
// Kept here so every number below has something to be an improvement *over*.
const BASELINE_HIGH = new Set(["geo-question-headline", "sponsored", "non-public-url"]);
const baselineFlags = (p) => {
  const title = p.title || "";
  const hasQ = /\?|؟/.test(title);
  const interrogative = /^(?:is|are|was|were|do|does|did|can|could|should|would|will|has|have|had|am|why|how|what|who|whom|whose|which|when|where)\b/i.test(title);
  const keys = [];
  if (hasQ && interrogative) keys.push("geo-question-headline");
  if (/(sponsored|paid post|advertorial)/i.test(p.excerpt || "")) keys.push("sponsored");
  return keys.some((k) => BASELINE_HIGH.has(k));
};

// --- adversary ladder -------------------------------------------------------
// Each rung is one concrete, cheap change a publisher can make. The question the
// eval answers is not "can this be evaded" — anything can — but *how far up this
// ladder an operation has to climb*, because every rung costs real money or time.
//
// Rung 0 is assembled from the characteristics public reporting attributes to
// the case this project exists because of (The Guardian, 26 Aug 2026; Politico,
// 14 Aug 2026): a self-described think tank with no verifiable organisation
// behind it, question-titled reports at volume, a domain with no history, no
// named authors. The PROFILE is modelled from that reporting; no real domain is
// named or scored here. See docs/EVALUATION.md.
const ADVERSARY = [
  { level: 0, name: "naive content farm",
    page: { title: "Is the law a threat to human rights?", author: "", aboutLink: false, siteName: "Global Security Observatory" },
    archive: { ageDays: 30, months: 1 } },
  { level: 1, name: "drops the question mark",
    page: { title: "How the law threatens human rights", author: "", aboutLink: false, siteName: "Global Security Observatory" },
    archive: { ageDays: 30, months: 1 } },
  { level: 2, name: "+ fills the author tag with 'Editorial Team'",
    page: { title: "How the law threatens human rights", author: "Editorial Team", aboutLink: false, siteName: "Global Security Observatory" },
    archive: { ageDays: 30, months: 1 } },
  { level: 3, name: "+ invents a plausible byline",
    page: { title: "How the law threatens human rights", author: "R. Ellis", aboutLink: false, siteName: "Global Security Observatory" },
    archive: { ageDays: 30, months: 1 } },
  { level: 4, name: "+ adds an about page",
    page: { title: "How the law threatens human rights", author: "R. Ellis", aboutLink: true, siteName: "Global Security Observatory" },
    archive: { ageDays: 30, months: 1 } },
  { level: 5, name: "+ drops think-tank vocabulary from the name",
    page: { title: "How the law threatens human rights", author: "R. Ellis", aboutLink: true, siteName: "Meridian Policy Group" },
    archive: { ageDays: 30, months: 1 } },
  { level: 6, name: "+ buys an aged domain (11y old, barely archived)",
    page: { title: "How the law threatens human rights", author: "R. Ellis", aboutLink: true, siteName: "Meridian Policy Group" },
    archive: { ageDays: 4000, months: 2 } },
  { level: 7, name: "+ runs the site quietly for 18 months first",
    page: { title: "How the law threatens human rights", author: "R. Ellis", aboutLink: true, siteName: "Meridian Policy Group" },
    archive: { ageDays: 550, months: 4 } },
  { level: 8, name: "+ six years of continuous publishing (accepted ceiling)",
    page: { title: "How the law threatens human rights", author: "R. Ellis", aboutLink: true, siteName: "Meridian Policy Group" },
    archive: { ageDays: 2200, months: 70 } }
];

// Variants that are not rungs on the same ladder but separate techniques, each
// scored on its own. A campaign does not have to be English, and "sponsored"
// markers do not have to be in the boilerplate a scraper reads first.
const VARIANTS = [
  {
    name: "Arabic-language campaign, question headline",
    page: { title: "\u0647\u0644 \u064a\u0634\u0643\u0644 \u0627\u0644\u0642\u0627\u0646\u0648\u0646 \u062a\u0647\u062f\u064a\u062f\u064b\u0627 \u0644\u062d\u0642\u0648\u0642 \u0627\u0644\u0625\u0646\u0633\u0627\u0646\u061f", author: "", aboutLink: false, siteName: "\u0645\u0631\u0635\u062f \u0627\u0644\u0623\u0645\u0646 \u0627\u0644\u0639\u0627\u0644\u0645\u064a" },
    archive: { ageDays: 45, months: 1 },
    expect: "high"
  },
  {
    name: "Arabic campaign, no question mark",
    page: { title: "\u0643\u064a\u0641 \u064a\u0647\u062f\u062f \u0627\u0644\u0642\u0627\u0646\u0648\u0646 \u062d\u0642\u0648\u0642 \u0627\u0644\u0625\u0646\u0633\u0627\u0646", author: "\u0627\u0644\u062a\u062d\u0631\u064a\u0631", aboutLink: false, siteName: "\u0645\u0631\u0635\u062f \u0627\u0644\u0623\u0645\u0646 \u0627\u0644\u0639\u0627\u0644\u0645\u064a" },
    archive: { ageDays: 45, months: 1 },
    expect: "high"
  },
  {
    name: "advertorial on an otherwise ordinary-looking site",
    page: { title: "The emergency law explained", author: "R. Ellis", aboutLink: true, siteName: "Meridian Policy Group", excerpt: "Sponsored content produced in partnership with our commercial team." },
    archive: { ageDays: 2200, months: 70 },
    expect: "high"
  },
  {
    name: "raw AI-generated filler, aged shell domain",
    page: { title: "The emergency law explained", author: "R. Ellis", aboutLink: true, siteName: "Meridian Policy Group", excerpt: "As an AI language model, I can outline the provisions of the law." },
    archive: { ageDays: 4000, months: 2 },
    // Warning rather than accusation is the defensible output here: raw AI
    // boilerplate on a shell domain is a content-farm signal, not proof of
    // payment. Requiring "high" would mean tuning weights to a synthetic case.
    expect: "elevated"
  },
  {
    name: "citation to an internal address (injection payload)",
    page: { title: "The emergency law explained", author: "R. Ellis", aboutLink: true, siteName: "Meridian Policy Group", nonPublic: true },
    archive: null,
    expect: "high"
  }
];

const asProfile = (over) => ({
  url: "https://meridian-policy.example/report",
  fetched: true, excerpt: "", ...over
});

// --- false positives --------------------------------------------------------
// Worst case on purpose: assume every real outlet published the exact headline
// shape the detector looks for. If it holds up here it holds up in the field.
const WORST_CASE_HEADLINES = [
  "Is the economy finally recovering?",
  "Why has the government delayed the report?",
  "What does the new law actually change?",
  "How did the talks collapse?",
  "Who is really paying for the pipeline?"
];

// Worst-case page BODIES, and the reason this section exists.
//
// Until now every row was built with `excerpt: ""`. That quietly excluded the
// two detectors that read page text - `sponsored` and `ai-generated-text` -
// from the headline number, so 0/111 said nothing at all about them. It was not
// a hypothetical gap: a bare-word match on `sponsored` survived in the shipped
// code and had to be found by hand-probing instead, and `sponsored` is
// DECISIVE, so it produced accusations no evidence could argue down.
//
// So every outlet now gets a full HTML page, run through the real extraction
// path the profiler uses. The shapes are the ones that actually caused false
// positives: ad-slot furniture around a clean article, reporting ABOUT paid
// placement, and an explainer quoting the AI tell-tale phrase. Worst case is
// still the rule - every outlet is assumed to have published the trap.
const WORST_CASE_BODIES = [
  // 1. Ordinary reporting wrapped in the furniture of a commercial news site.
  (title) => `<body>
    <header><a href="/">Home</a></header>
    <nav><a href="/sponsored">Sponsored content</a><a href="/world">World</a></nav>
    <aside class="ad-rail"><span>Sponsored</span><p>Paid post: our partner clinic leads the region.</p></aside>
    <main><article><h1>${title}</h1>
      <p>Officials set out the details on Thursday, citing figures published earlier in the week.
      Analysts said the change was widely expected and would take effect next quarter.</p>
    </article></main>
    <footer><p>Advertisement. Subscribe today. Sponsored by our partners.</p></footer></body>`,

  // 2. An investigation into paid placement - this project's own subject matter.
  (title) => `<body><main><article><h1>${title}</h1>
      <p>Agencies sell sponsored placements to clients who want favourable answers from AI
      assistants, an investigation has found. Editors said the practice of advertorial content
      is spreading across the region.</p>
    </article></main></body>`,

  // 3. A media-literacy explainer that has to quote the phrase to explain it.
  (title) => `<body><main><article><h1>${title}</h1>
      <p>Researchers found hundreds of pages that open with the words
      &ldquo;As an AI language model, I cannot verify that claim&rdquo;, left in by careless
      operators. An advertorial is paid content designed to look like journalism.</p>
    </article></main></body>`,

  // 4. A plain article with no traps, so the corpus is not all adversarial shapes.
  (title) => `<body><main><article><h1>${title}</h1>
      <p>The committee published its findings after a six-month inquiry, setting out
      recommendations that the ministry said it would consider in full.</p>
    </article></main></body>`
];

// --- tuning / held-out split -------------------------------------------------
//
// SIGNAL_WEIGHTS were hand-set while looking at this corpus, which means a
// number measured on all of it is a fit, not a measurement, and a reviewer is
// entitled to say so.
//
// So the corpus is split deterministically and the HELD-OUT half carries the
// headline. The split is by a stable hash of the domain, not by shuffling or by
// index: it must not move when outlets are added, reordered, or when the file is
// regenerated, or "held out" becomes whatever happens to flatter the result this
// week. Adding an outlet lands it in a fixed bucket decided by its name alone.
//
// The discipline this only works with: weights may be informed by the TUNING
// half. If a held-out number comes back worse, it gets published worse. Tuning
// against the held-out half would make this theatre.
function bucketOf(domain) {
  // FNV-1a, the same hash the engine uses for cache keys. Any stable hash does;
  // what matters is that it depends only on the name.
  let h = 0x811c9dc5;
  for (let i = 0; i < domain.length; i++) {
    h ^= domain.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}
/** ~40% held out. */
const isHeldOut = (domain) => bucketOf(domain) >= 60;

const fpRows = corpus.outlets.map((o, i) => {
  const title = WORST_CASE_HEADLINES[i % WORST_CASE_HEADLINES.length];
  // Through the real extraction path, so the eval measures what the profiler
  // will actually see rather than a hand-written excerpt.
  const excerpt = stripHtml(extractArticle(WORST_CASE_BODIES[i % WORST_CASE_BODIES.length](title)));
  const page = asProfile({
    url: `https://${o.domain}/article`,
    excerpt,
    siteName: o.domain,
    title,
    author: "Staff Reporter Named Person", // realistic byline
    aboutLink: true,
    archive: o.archive
  });
  const r = computeFlags(page);
  return {
    domain: o.domain,
    region: o.region,
    heldOut: isHeldOut(o.domain),
    allowlisted: !!o.allowlisted,
    years: +(o.archive.ageDays / 365).toFixed(1),
    months: o.archive.months,
    score: r.score,
    level: r.level,
    excerpt,
    accused: r.level === "high",
    warned: r.level !== "clean",
    baselineAccused: baselineFlags({ title, excerpt: "" })
  };
});

// Does the corpus actually put the page-text detectors under load? Measured
// from the excerpts the rows were built with, so it cannot drift out of step
// with them.
const pageTextCoverage = (() => {
  const excerpts = fpRows.map((r) => r.excerpt || "");
  const withPaidBait = excerpts.filter((e) => /sponsored|advertorial|paid post/i.test(e)).length;
  const withAiBait = excerpts.filter((e) => /as an ai language model/i.test(e)).length;
  return {
    withPaidBait,
    withAiBait,
    total: excerpts.length,
    // Both detectors must be given something to fire on, across a real share of
    // the corpus - one token row would satisfy the letter and not the point.
    exercised: withPaidBait >= excerpts.length * 0.2 && withAiBait >= excerpts.length * 0.1
  };
})();

const advRows = ADVERSARY.map((a) => {
  const r = computeFlags(asProfile({ ...a.page, archive: a.archive }));
  return {
    level: a.level,
    name: a.name,
    score: r.score,
    detectedLevel: r.level,
    detected: r.level !== "clean",
    caught: r.level === "high",
    baselineCaught: baselineFlags({ ...a.page, excerpt: "" })
  };
});

const RANK = { clean: 0, elevated: 1, high: 2 };
const variantRows = VARIANTS.map((v) => {
  const r = computeFlags(asProfile({ ...v.page, archive: v.archive }));
  // `expect` is a MINIMUM: exceeding it is a pass.
  return { name: v.name, score: r.score, level: r.level, expect: v.expect, ok: RANK[r.level] >= RANK[v.expect] };
});

// --- weight sensitivity ------------------------------------------------------
// The weights are hand-set, which invites the fair objection that the headline
// numbers are knife-edge tuning. So perturb every weight and re-measure: if the
// result only holds at exactly these values it is a fit to the corpus, not a
// model. Deterministic (fixed perturbation pattern), so CI can gate on it.
function measureWith(scale) {
  const original = { ...SIGNAL_WEIGHTS };
  for (const k of Object.keys(SIGNAL_WEIGHTS)) {
    SIGNAL_WEIGHTS[k] = Math.round(original[k] * scale[k]);
  }
  try {
    const accused = corpus.outlets.filter((o, i) => {
      const r = computeFlags(asProfile({
        url: `https://${o.domain}/a`, siteName: o.domain,
        title: WORST_CASE_HEADLINES[i % WORST_CASE_HEADLINES.length],
        author: "Staff Reporter Named Person", aboutLink: true, archive: o.archive
      }));
      return r.level === "high";
    }).length;
    const missed = ADVERSARY.filter((a) => a.level < 8).filter((a) => {
      const r = computeFlags(asProfile({ ...a.page, archive: a.archive }));
      return r.level === "clean";
    }).length;
    return { accused, missed };
  } finally {
    for (const k of Object.keys(original)) SIGNAL_WEIGHTS[k] = original[k];
  }
}

/** @type {[string, number|string][]} */
const PERTURBATIONS = [
  ["all weights -20%", 0.8],
  ["all weights +20%", 1.2],
  ["suspicion -25%, legitimacy unchanged", "suspicion-down"],
  ["legitimacy -25%, suspicion unchanged", "legitimacy-down"]
];

const sensitivity = PERTURBATIONS.map(([name, mode]) => {
  const scale = {};
  for (const k of Object.keys(SIGNAL_WEIGHTS)) {
    const w = SIGNAL_WEIGHTS[k];
    if (mode === "suspicion-down") scale[k] = w > 0 ? 0.75 : 1;
    else if (mode === "legitimacy-down") scale[k] = w < 0 ? 0.75 : 1;
    else scale[k] = mode;
  }
  return { name, ...measureWith(scale) };
});

// --- results ----------------------------------------------------------------
const nAll = fpRows.length;
const heldOutRows = fpRows.filter((r) => r.heldOut);
const tuningRows = fpRows.filter((r) => !r.heldOut);

// The headline is the held-out half. The tuning half is reported beside it, so a
// large gap between the two is visible rather than hidden - that gap IS the
// overfitting signal.
const falseAccusations = heldOutRows.filter((r) => r.accused);
const falseWarnings = heldOutRows.filter((r) => r.warned);
const baselineFalse = heldOutRows.filter((r) => r.baselineAccused);
const tuningAccused = tuningRows.filter((r) => r.accused);
const allAccused = fpRows.filter((r) => r.accused);
const n = heldOutRows.length;

// Level 8 is the documented ceiling: an adversary indistinguishable from a real
// publisher on these signals. Excluded from the detection rate, and stated
// openly rather than hidden by choosing a friendlier denominator.
const scored = advRows.filter((a) => a.level < 8);
const detected = scored.filter((a) => a.detected);
const caught = scored.filter((a) => a.caught);
const baselineDetected = scored.filter((a) => a.baselineCaught);

// --- margin, and why a clean sweep is not automatically reassuring ----------
//
// 0/111 accused is the headline, but on its own it cannot distinguish a
// well-separated model from one sitting a single point below the threshold on
// every row. "Nobody was accused" and "nobody came close to being accused" are
// different claims, and only the second says the result would survive a corpus
// slightly unlike this one.
//
// So: how much headroom is there between the worst-scoring legitimate publisher
// and the line at which the tool starts accusing?
// Reported twice, deliberately. One corpus entry - thedailystar.com.bd, an
// alias hostname the Wayback Machine has no record of - carries +30 for being
// unarchived and dominates the worst case. It is left in the corpus on purpose
// (see EVALUATION.md), so the headline margin includes it. But quoting only
// that number would misattribute the tightness to the scoring model when it
// comes from a known and documented input, so the archived-only figure is
// printed beside it. Neither is the "real" one; the pair is the finding.
const legitScores = fpRows.map((r) => r.score).sort((a, b) => a - b);
const archivedRows = fpRows.filter((r) => r.months > 0);
const archivedScores = archivedRows.map((r) => r.score).sort((a, b) => a - b);
const worstLegit = legitScores[legitScores.length - 1];
const worstArchived = archivedScores[archivedScores.length - 1];
const median = legitScores[Math.floor(legitScores.length / 2)];
const nearestAccusation = fpRows
  .slice()
  .sort((a, b) => b.score - a.score)
  .slice(0, 3)
  .map((r) => ({ domain: r.domain, score: r.score }));
const margin = {
  worstLegitScore: worstLegit,
  worstArchivedScore: worstArchived,
  medianLegitScore: median,
  accuseAt: HIGH_RISK_AT,
  warnAt: ELEVATED_AT,
  headroomToAccusation: HIGH_RISK_AT - worstLegit,
  headroomExcludingUnarchived: HIGH_RISK_AT - worstArchived,
  unarchivedInCorpus: fpRows.length - archivedRows.length,
  // The tightest adversary rung below the ceiling, for the other side of the gap.
  weakestDetectedRung: Math.min(...scored.filter((a) => a.detected).map((a) => a.score)),
  nearestAccusation
};

const results = {
  corpusCollectedAt: corpus.collectedAt,
  margin,
  legitimate: {
    n,
    corpusTotal: nAll,
    tuningN: tuningRows.length,
    tuningFalselyAccused: tuningAccused.length,
    allFalselyAccused: allAccused.length,
    falselyAccused: falseAccusations.length,
    falselyAccusedRate: +(falseAccusations.length / n).toFixed(4),
    anyWarning: falseWarnings.length,
    baselineFalselyAccused: baselineFalse.length,
    baselineFalselyAccusedRate: +(baselineFalse.length / n).toFixed(4),
    offenders: falseAccusations.map((r) => r.domain)
  },
  adversary: {
    rungsScored: scored.length,
    detected: detected.length,
    detectedRate: +(detected.length / scored.length).toFixed(4),
    highRisk: caught.length,
    baselineDetected: baselineDetected.length,
    baselineDetectedRate: +(baselineDetected.length / scored.length).toFixed(4),
    firstUndetectedRung: scored.find((a) => !a.detected)?.level ?? null,
    ceilingRung: 8
  }
};

if (JSON_OUT) {
  console.log(JSON.stringify({ results, fpRows, advRows, variantRows, sensitivity }, null, 2));
} else {
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log(`\nPLACEMENT DETECTOR EVALUATION`);
  console.log(`corpus collected ${corpus.collectedAt.slice(0, 10)} · ${nAll} real publishers, real Wayback histories\n`);

  console.log(`FALSE POSITIVES  \u2014 HELD-OUT SET  (worst case: every outlet given a question-shaped headline AND a trap page body)`);
  console.log(`  ${nAll} publishers split by a stable hash of the domain: ${tuningRows.length} tuning, ${n} held out.`);
  console.log(`  Weights may be informed by the tuning half only. These are the held-out numbers.`);
  console.log(`  Page text is under load too: ${pageTextCoverage.withPaidBait}/${pageTextCoverage.total} rows carry paid-content bait ` +
    `(ad furniture, or reporting about paid placement) and ${pageTextCoverage.withAiBait}/${pageTextCoverage.total} quote the AI tell-tale phrase.\n`);
  console.log(`  accused of placement   ${String(falseAccusations.length).padStart(3)}/${n}   ${pct(falseAccusations.length / n)}`);
  console.log(`  any warning at all     ${String(falseWarnings.length).padStart(3)}/${n}   ${pct(falseWarnings.length / n)}`);
  console.log(`  previous binary rule   ${String(baselineFalse.length).padStart(3)}/${n}   ${pct(baselineFalse.length / n)}   <- what this replaced`);
  if (falseAccusations.length) {
    console.log(`  offenders: ${falseAccusations.map((r) => `${r.domain} (${r.score})`).join(", ")}`);
  }

  console.log(`\n  for comparison (not the headline):`);
  console.log(`    tuning half accused    ${String(tuningAccused.length).padStart(3)}/${tuningRows.length}   ${pct(tuningAccused.length / tuningRows.length)}`);
  console.log(`    whole corpus accused   ${String(allAccused.length).padStart(3)}/${nAll}   ${pct(allAccused.length / nAll)}`);
  console.log(`    whole corpus warned    ${String(fpRows.filter((r) => r.warned).length).padStart(3)}/${nAll}   ${pct(fpRows.filter((r) => r.warned).length / nAll)}`);
  console.log(`    a large tuning/held-out gap would be the overfitting signal.`);

  console.log(`\n  MARGIN  (well separated, or one point below the line?)`);
  console.log(`    accuse at ${margin.accuseAt}, warn at ${margin.warnAt}. Legitimate scores: median ${margin.medianLegitScore}, worst ${margin.worstLegitScore}.`);
  console.log(`    headroom to an accusation: ${margin.headroomToAccusation} points (${margin.headroomExcludingUnarchived} excluding the ${margin.unarchivedInCorpus} unarchived alias, worst archived ${margin.worstArchivedScore})`);
  console.log(`    closest to the line: ${margin.nearestAccusation.map((x) => `${x.domain} (${x.score})`).join(", ")}`);
  console.log(`    weakest DETECTED adversary rung scores ${margin.weakestDetectedRung}, BELOW the worst legitimate score.`);
  console.log(`    So the bands overlap: detection of the top rungs relies on the warn threshold (${margin.warnAt}),`);
  console.log(`    not on separation. No legitimate publisher is accused, but "not accused" is not "well separated".`);

  console.log(`\n  by region (whole corpus):`);
  const regions = [...new Set(fpRows.map((r) => r.region))];
  for (const region of regions) {
    const rows = fpRows.filter((r) => r.region === region);
    const bad = rows.filter((r) => r.accused).length;
    console.log(`    ${region.padEnd(18)} ${String(rows.length).padStart(2)} outlets   accused: ${bad}`);
  }

  console.log(`\nADVERSARY LADDER  (each rung is one cheap change)`);
  console.log(`  lvl  score  verdict    was    change`);
  for (const a of advRows) {
    const verdict = a.caught ? "HIGH" : a.detected ? "warn" : "clean";
    const base = a.baselineCaught ? "HIGH" : "clean";
    const mark = a.level === 8 ? " (ceiling)" : "";
    console.log(
      `  ${String(a.level).padStart(3)}  ${String(a.score).padStart(5)}  ${verdict.padEnd(9)}  ${base.padEnd(5)}  ${a.name}${mark}`
    );
  }
  console.log(`\n  detected through rung ${results.adversary.rungsScored - 1}: ${detected.length}/${scored.length}  ${pct(results.adversary.detectedRate)}`);
  console.log(`  previous binary rule:            ${baselineDetected.length}/${scored.length}  ${pct(results.adversary.baselineDetectedRate)}`);
  console.log(`  first rung that slips past:      ${results.adversary.firstUndetectedRung ?? "none below the ceiling"}`);
  console.log(`\nOTHER TECHNIQUES  (scored on their own, not rungs of the ladder)`);
  for (const v of variantRows) {
    console.log(`  ${v.ok ? "PASS" : "FAIL"}  ${String(v.score).padStart(4)}  ${v.level.padEnd(9)} ${v.name}`);
  }

  console.log(`\nWEIGHT SENSITIVITY  (would the result survive different numbers?)`);
  console.log(`  of ${n} publishers and ${scored.length} adversary rungs:`);
  console.log(`  perturbation                              accused  missed`);
  for (const r of sensitivity) {
    console.log(`  ${r.name.padEnd(40)}  ${String(r.accused).padStart(7)}  ${String(r.missed).padStart(6)}`);
  }

  console.log(`  accepted ceiling:                rung 8 — an operation that has run a real site for six years is not\n                                   distinguishable from a publisher by these signals, and is not claimed to be.\n`);
}

// --- CI gate ----------------------------------------------------------------
// Thresholds are the contract. Loosening one should be a visible, argued commit.
const GATES = [
  ["no HELD-OUT legitimate publisher is accused of placement", results.legitimate.falselyAccused === 0],
  ["no legitimate publisher anywhere in the corpus is accused", results.legitimate.allFalselyAccused === 0],
  ["at most 10% of legitimate publishers get any warning", results.legitimate.anyWarning / n <= 0.1],
  ["every adversary rung below the ceiling is detected", results.adversary.detected === results.adversary.rungsScored],
  ["detection beats the rule it replaced", results.adversary.detectedRate > results.adversary.baselineDetectedRate],
  ["false positives beat the rule they replaced", results.legitimate.falselyAccusedRate < results.legitimate.baselineFalselyAccusedRate],
  ["other placement techniques are caught (Arabic, advertorial, AI filler, injection)", variantRows.every((v) => v.ok)],
  // Coverage, not accuracy. The corpus used to build every row with excerpt "",
  // which silently excluded the page-text detectors from the headline number -
  // 0/111 was measuring less than it appeared to, and a decisive false-accusation
  // bug lived in that blind spot until it was found by hand. This gate fails if
  // the corpus ever stops putting those detectors under load again.
  ["the corpus actually exercises the page-text detectors", pageTextCoverage.exercised],
  // Margin, not just outcome. 0/111 stays true right up until a weight change
  // pushes a real publisher one point over, and the outcome gate would not see
  // it coming. Archived outlets - the ones whose score reflects the model
  // rather than a missing Wayback record - must keep real distance from the
  // accusation threshold.
  ["archived publishers keep >= 20 points of headroom before accusation",
    margin.headroomExcludingUnarchived >= 20],
  // Sensitivity is reported honestly rather than gated at zero. Scaling every
  // weight is equivalent to moving the thresholds, so borderline cases moving is
  // expected; what must NOT happen is the harmful failure becoming common, or
  // detection collapsing. A model that only worked at exactly these numbers
  // would be a fit to this corpus, not a model.
  ["false accusations stay rare under +/-20% re-tuning", sensitivity.every((r) => r.accused <= 1)],
  ["detection survives +/-20% re-tuning", sensitivity.every((r) => r.missed <= 3)]
];
const failed = GATES.filter(([, ok]) => !ok);
if (!JSON_OUT) {
  for (const [name, ok] of GATES) console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  console.log("");
}
process.exit(failed.length ? 1 : 0);
