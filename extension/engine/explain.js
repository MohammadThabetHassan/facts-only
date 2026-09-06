// Plain-language risk explanation.
//
// The source flags are accurate but they read like a security tool: "Headline
// mimics a chatbot question (GEO pattern)". A reader who just wants to know
// whether they were sold something should not have to parse that, nor scroll to
// the bottom of the report to find it.
//
// This module turns the flag set into ONE sentence a non-technical reader
// understands, and it does so in code — deterministically, from the same flags
// shown further down — so the headline explanation cannot be written, softened,
// or flattered by the model being checked.

// Ranked worst-first. The first level that matches wins, so a paid placement is
// never described merely as "an unnamed publisher".
const LEVELS = [
  {
    key: "paid",
    tone: "bad",
    // Explicit paid/advertorial markers found in the page text.
    matches: (keys) => keys.has("sponsored")
  },
  {
    key: "planted",
    tone: "bad",
    // The GEO fingerprint: written to be quoted by an AI, or a citation that
    // does not point at a real public website at all.
    matches: (keys) => keys.has("geo-question-headline") || keys.has("non-public-url")
  },
  {
    key: "opaque",
    tone: "warn",
    // Nobody will say who is behind it, or the site appeared last week.
    matches: (keys) =>
      keys.has("think-tank-unverified") ||
      keys.has("domain-unarchived") ||
      keys.has("domain-fresh") ||
      keys.has("no-author") ||
      keys.has("no-about") ||
      keys.has("ai-generated-text")
  }
];

/**
 * Summarize why a reader should be careful, from the profiled sources alone.
 *
 * Returns a plain object (no DOM, no i18n) so it is testable and so the caller
 * decides the wording:
 *   level            "paid" | "planted" | "opaque" | "clean"
 *   tone             "bad" | "warn" | "good"
 *   reasonKeys       flag keys behind the level, worst-first, deduped
 *   offenders        [{ url, name, reasonKeys }] — the sources responsible
 *   establishedCount how many sources ARE known publishers
 *   total            how many sources were profiled
 */
export function summarizeRisk(sources = []) {
  const list = Array.isArray(sources) ? sources : [];
  const total = list.length;
  const establishedCount = list.filter((s) => s && s.established).length;

  const suspect = list.filter(
    (s) => s && Array.isArray(s.flags) && s.flags.some((f) => f && f.severity !== "info")
  );
  const allKeys = new Set();
  for (const s of suspect) {
    for (const f of s.flags) {
      if (f && f.severity !== "info") allKeys.add(f.key);
    }
  }

  const level = LEVELS.find((l) => l.matches(allKeys));
  if (!level) {
    return {
      level: "clean",
      tone: "good",
      reasonKeys: [],
      offenders: [],
      establishedCount,
      total
    };
  }

  // Only sources that actually triggered this level are named, so the sentence
  // points at something the reader can go and look at. For those sources we then
  // list EVERY reason, not just the triggering one: "written to be quoted by an
  // AI" lands harder next to "and it will not say who runs it". The triggering
  // reasons come first so the list justifies the headline.
  const offenders = suspect
    .map((s) => {
      const keys = s.flags.filter((f) => f && f.severity !== "info").map((f) => f.key);
      const triggering = keys.filter((k) => level.matches(new Set([k])));
      if (triggering.length === 0) return null;
      const rest = keys.filter((k) => !triggering.includes(k));
      return {
        url: s.url,
        name: s.siteName || s.title || s.url,
        reasonKeys: [...new Set([...triggering, ...rest])]
      };
    })
    .filter(Boolean);

  const reasonKeys = [...new Set(offenders.flatMap((o) => o.reasonKeys))];

  return { level: level.key, tone: level.tone, reasonKeys, offenders, establishedCount, total };
}
