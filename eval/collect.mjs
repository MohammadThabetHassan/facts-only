// Collect real Wayback archive profiles for the legitimate-publisher corpus.
//
// Run occasionally, commit the result: eval/corpus.json. The measurement itself
// (eval/run.mjs) is then fully offline and deterministic, so CI can gate on it
// and a contributor can reproduce the numbers without network access.
//
//   node eval/collect.mjs
//
// Only the Wayback CDX API is contacted, keylessly, once per domain. The pages
// themselves are deliberately NOT fetched: the false-positive test supplies
// worst-case page metadata instead (see run.mjs), which is both faster and a
// harder test than whatever those sites happen to be publishing today.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchArchiveProfile, domainAgeDays, isEstablishedDomain } from "../extension/engine/sourceProfiler.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// The Wayback CDX endpoint rate-limits hard: a run at concurrency 4 returned a
// contiguous block of failures two-thirds of the way through. Low concurrency
// plus backoff plus resume is the difference between a corpus that quietly
// drops its most interesting entries and one that is actually complete.
const CONCURRENCY = 2;
const ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

async function profileWithRetry(domain) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const p = await fetchArchiveProfile(domain);
    if (p) return p;
    await sleep(1500 * 2 ** attempt + Math.random() * 500);
  }
  return null;
}

const { outlets } = JSON.parse(readFileSync(join(HERE, "outlets.json"), "utf8"));
const corpusPath = join(HERE, "corpus.json");

// Resume: keep what previous runs already collected, only chase what is missing.
const existing = new Map();
if (existsSync(corpusPath)) {
  for (const o of JSON.parse(readFileSync(corpusPath, "utf8")).outlets || []) existing.set(o.domain, o);
}
const todo = outlets.filter((o) => !existing.has(o.domain));

console.log(`Corpus: ${outlets.length} outlets, ${existing.size} already collected, ${todo.length} to fetch.`);

let done = 0;
const fetched = await mapLimit(todo, CONCURRENCY, async (o) => {
  const profile = await profileWithRetry(o.domain);
  done++;
  const ageDays = profile ? domainAgeDays(profile.firstSeen) : null;
  process.stdout.write(
    `  [${String(done).padStart(2)}/${todo.length}] ${o.domain.padEnd(24)} ` +
      `${profile ? `${(ageDays / 365).toFixed(1)}y, ${profile.months} months archived` : "LOOKUP FAILED"}\n`
  );
  return profile
    ? { ...o, allowlisted: isEstablishedDomain(`https://${o.domain}/`), archive: { ageDays, months: profile.months } }
    : null;
});

for (const row of fetched) if (row) existing.set(row.domain, row);

// Keep corpus order stable with outlets.json so diffs stay readable.
const ordered = outlets.map((o) => existing.get(o.domain)).filter(Boolean);
writeFileSync(
  corpusPath,
  JSON.stringify(
    { collectedAt: new Date().toISOString(), note: "Real Wayback archive profiles. Regenerate with `node eval/collect.mjs` (resumable).", outlets: ordered },
    null,
    2
  ) + "\n"
);

const missing = outlets.filter((o) => !existing.has(o.domain)).map((o) => o.domain);
console.log(`\nWrote eval/corpus.json \u2014 ${ordered.length}/${outlets.length} outlets`);
if (missing.length) console.log(`Still missing (re-run to retry): ${missing.join(", ")}`);
console.log(`${ordered.filter((o) => o.allowlisted).length} of ${ordered.length} are on the ESTABLISHED allowlist; the rest must earn their score from evidence.`);
