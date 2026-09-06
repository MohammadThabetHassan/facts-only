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

const fpRows = corpus.outlets.map((o, i) => {
  const title = WORST_CASE_HEADLINES[i % WORST_CASE_HEADLINES.length];
  const page = asProfile({
    url: `https://${o.domain}/article`,
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
    allowlisted: !!o.allowlisted,
    years: +(o.archive.ageDays / 365).toFixed(1),
    months: o.archive.months,
    score: r.score,
    level: r.level,
    accused: r.level === "high",
    warned: r.level !== "clean",
    baselineAccused: baselineFlags({ title, excerpt: "" })
  };
});

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

// --- results ----------------------------------------------------------------
const n = fpRows.length;
const falseAccusations = fpRows.filter((r) => r.accused);
const falseWarnings = fpRows.filter((r) => r.warned);
const baselineFalse = fpRows.filter((r) => r.baselineAccused);

// Level 8 is the documented ceiling: an adversary indistinguishable from a real
// publisher on these signals. Excluded from the detection rate, and stated
// openly rather than hidden by choosing a friendlier denominator.
const scored = advRows.filter((a) => a.level < 8);
const detected = scored.filter((a) => a.detected);
const caught = scored.filter((a) => a.caught);
const baselineDetected = scored.filter((a) => a.baselineCaught);

const results = {
  corpusCollectedAt: corpus.collectedAt,
  legitimate: {
    n,
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
  console.log(JSON.stringify({ results, fpRows, advRows }, null, 2));
} else {
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log(`\nPLACEMENT DETECTOR EVALUATION`);
  console.log(`corpus collected ${corpus.collectedAt.slice(0, 10)} · ${n} real publishers, real Wayback histories\n`);

  console.log(`FALSE POSITIVES  (worst case: every outlet given a question-shaped headline)`);
  console.log(`  accused of placement   ${String(falseAccusations.length).padStart(3)}/${n}   ${pct(falseAccusations.length / n)}`);
  console.log(`  any warning at all     ${String(falseWarnings.length).padStart(3)}/${n}   ${pct(falseWarnings.length / n)}`);
  console.log(`  previous binary rule   ${String(baselineFalse.length).padStart(3)}/${n}   ${pct(baselineFalse.length / n)}   <- what this replaced`);
  if (falseAccusations.length) {
    console.log(`  offenders: ${falseAccusations.map((r) => `${r.domain} (${r.score})`).join(", ")}`);
  }

  console.log(`\n  by region:`);
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
  console.log(`  accepted ceiling:                rung 8 — an operation that has run a real site for six years is not\n                                   distinguishable from a publisher by these signals, and is not claimed to be.\n`);
}

// --- CI gate ----------------------------------------------------------------
// Thresholds are the contract. Loosening one should be a visible, argued commit.
const GATES = [
  ["no legitimate publisher is accused of placement", results.legitimate.falselyAccused === 0],
  ["at most 10% of legitimate publishers get any warning", results.legitimate.anyWarning / n <= 0.1],
  ["every adversary rung below the ceiling is detected", results.adversary.detected === results.adversary.rungsScored],
  ["detection beats the rule it replaced", results.adversary.detectedRate > results.adversary.baselineDetectedRate],
  ["false positives beat the rule they replaced", results.legitimate.falselyAccusedRate < results.legitimate.baselineFalselyAccusedRate]
];
const failed = GATES.filter(([, ok]) => !ok);
if (!JSON_OUT) {
  for (const [name, ok] of GATES) console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  console.log("");
}
process.exit(failed.length ? 1 : 0);
