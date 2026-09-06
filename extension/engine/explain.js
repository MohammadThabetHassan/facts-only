// Plain-language risk explanation.
//
// The source flags are accurate but they read like a security tool: "Headline
// mimics a chatbot question (GEO pattern)". A reader who just wants to know
// whether they were sold something should not have to parse that, nor scroll to
// the bottom of the report to find it.
//
// This module turns the scored sources into ONE sentence a non-technical reader
// understands, and it does so in code — deterministically, from the same
// evidence shown further down — so the headline explanation cannot be written,
// softened, or flattered by the model being checked.
//
// IMPORTANT: the level is driven by each source's PLACEMENT SCORE, never by the
// mere presence of a signal. Keying off signal keys alone was the original bug:
// a single question-shaped headline is common in ordinary journalism, and
// letting it decide the headline meant announcing "this source looks planted"
// above real reporting. A signal only speaks once the score says it earned it.

import { scoreSignals } from "./sourceScore.js";

// Ranked worst-first. The first level that matches wins, so a paid placement is
// never described merely as "an unnamed publisher".
const LEVELS = [
  {
    key: "paid",
    tone: "bad",
    // Explicit paid/advertorial markers, on a source the score already doubts.
    matches: (a) => a.keys.has("sponsored")
  },
  {
    key: "planted",
    tone: "bad",
    // Enough accumulated placement evidence to say so plainly.
    matches: (a) => a.level === "high"
  },
  {
    key: "opaque",
    tone: "warn",
    // Something is off, but not enough to call it placed.
    matches: (a) => a.level === "elevated"
  }
];

/**
 * Assess one profiled source. Prefers the score the profiler already computed;
 * falls back to scoring its flags so the function stays usable on any report,
 * including ones serialized before this field existed.
 */
function assess(s) {
  const flags = Array.isArray(s && s.flags) ? s.flags : [];
  // Positive signals ("names its author", "continuously archived for years")
  // carry severity "info" and must never be quoted back as reasons to worry.
  const concerning = flags.filter((f) => f && f.severity !== "info");
  const level = s && s.placementLevel ? s.placementLevel : scoreSignals(flags.map((f) => f && f.key)).level;
  // A source we could neither fetch nor look up in the archive told us nothing.
  // Scoring silence as "clean" would turn a failed check into an all-clear,
  // which is the single most harmful thing this report could say: the reader
  // came here precisely because they could not tell. In the web app this is the
  // normal case - CORS blocks both the page fetch and the Wayback API - so it
  // has to be reported honestly rather than treated as an edge case.
  const unchecked = !!s && !s.established && !s.fetched && !s.archivedMonths && !s.firstArchived;
  return {
    url: s && s.url,
    name: (s && (s.siteName || s.title)) || (s && s.url) || "",
    established: !!(s && s.established),
    unchecked,
    level,
    keys: new Set(concerning.map((f) => f.key)),
    orderedKeys: concerning.map((f) => f.key)
  };
}

/**
 * Summarize why a reader should be careful, from the profiled sources alone.
 *
 * Returns a plain object (no DOM, no i18n) so it is testable and so the caller
 * decides the wording:
 *   level            "paid" | "planted" | "opaque" | "clean"
 *   tone             "bad" | "warn" | "good"
 *   reasonKeys       flag keys behind the level, deduped
 *   offenders        [{ url, name, reasonKeys }] — the sources responsible
 *   establishedCount how many sources are known publishers or scored clean
 *   total            how many sources were profiled
 */
export function summarizeRisk(sources = []) {
  const list = Array.isArray(sources) ? sources : [];
  const total = list.length;
  const assessed = list.map(assess);
  // "Trustworthy" means allowlisted, or scored clean ON EVIDENCE WE ACTUALLY
  // HAVE - the point of the scoring rewrite was that a publisher can earn this
  // without being on anyone's list. A source we could not reach is neither:
  // counting it here would let a blocked fetch inflate the reassuring number.
  const establishedCount = assessed.filter((a) => a.established || (a.level === "clean" && !a.unchecked)).length;

  const flagged = assessed.filter((a) => a.level !== "clean");
  const level = flagged.length ? LEVELS.find((l) => flagged.some((a) => l.matches(a))) : null;
  if (!level) {
    // Nothing was flagged - but say so only if we actually managed to look.
    const unchecked = assessed.filter((a) => a.unchecked);
    if (unchecked.length) {
      return {
        level: "unknown",
        tone: "warn",
        reasonKeys: [],
        offenders: unchecked.map((a) => ({ url: a.url, name: a.name, reasonKeys: [] })),
        uncheckedCount: unchecked.length,
        establishedCount,
        total
      };
    }
    return { level: "clean", tone: "good", reasonKeys: [], offenders: [], uncheckedCount: 0, establishedCount, total };
  }

  // Only sources that actually triggered this level are named, so the sentence
  // points at something the reader can go and look at. For those sources we
  // then list every concerning reason, worst-weighted first (the profiler
  // already sorts flags by weight), so the list justifies the headline and then
  // deepens it.
  const offenders = flagged
    .filter((a) => level.matches(a))
    .map((a) => ({ url: a.url, name: a.name, reasonKeys: [...new Set(a.orderedKeys)] }))
    .filter((o) => o.reasonKeys.length > 0);

  const reasonKeys = [...new Set(offenders.flatMap((o) => o.reasonKeys))];
  return {
    level: level.key,
    tone: level.tone,
    reasonKeys,
    offenders,
    uncheckedCount: assessed.filter((a) => a.unchecked).length,
    establishedCount,
    total
  };
}
