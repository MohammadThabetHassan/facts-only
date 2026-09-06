// Placement scoring: how much evidence is there that this source was *placed*
// rather than reported?
//
// This replaces a binary rule ("any high-severity flag ⇒ high risk") that failed
// in both directions, measurably:
//
//   * Evasion — `geo-question-headline` was the only high-severity signal, so
//     deleting one question mark from a headline took a campaign site from
//     "high risk" to "not flagged". One character.
//   * False accusation — conversely, a single question-shaped headline was
//     enough to brand ProPublica, Bellingcat, Dawn or The Hindu as manipulated,
//     because they are not on the 63-domain allowlist.
//
// Both failures had the same root cause: one weak signal could decide the
// outcome, and legitimacy could only be proven by being on a hand-written list.
//
// So: signals carry weights, evidence accumulates, and legitimacy is *earned
// from evidence* — a long, continuously archived publishing history counts
// against suspicion the same way a fresh domain counts for it. The allowlist
// survives only as a short-circuit for primary sources (courts, UN bodies,
// government gazettes), not as the definition of "real publisher".
//
// The weights below are tuned against eval/ — see docs/EVALUATION.md. Change a
// number here and `npm run eval` tells you what it cost you.

/**
 * Signal weights, in "placement points". Positive = evidence of placement.
 * Negative = evidence of an ordinary publisher.
 * @type {Record<string, number>}
 */
export const SIGNAL_WEIGHTS = {
  // --- Decisive on their own -------------------------------------------------
  "non-public-url": 100, // not a public web source at all
  sponsored: 60, // the page says it was paid for

  // --- Placement patterns ----------------------------------------------------
  // A headline written as the question a person types into a chatbot. Worth
  // real weight, never enough alone — legitimate outlets write these too.
  "geo-question-headline": 25,
  // Same shape without the question mark ("How the law threatens human rights").
  // Deliberately still counted: the question mark was the evasion.
  "prompt-shaped-headline": 14,
  "think-tank-unverified": 20,
  "ai-generated-text": 20,

  // --- Opacity ---------------------------------------------------------------
  "no-author": 15,
  "generic-author": 8, // "Admin", "Staff", "Editorial Team"
  "no-about": 10,

  // --- Archive history (Wayback, keyless) ------------------------------------
  "domain-unarchived": 30,
  "domain-fresh": 30, // first archived < 90 days ago
  "domain-new": 20, // < 1 year
  "domain-recent": 10, // 1-3 years
  // Registered years ago but barely archived: the fingerprint of an aged domain
  // bought off the shelf, which is the standard answer to a domain-age check.
  "domain-shell": 25,
  // Young AND publishing sporadically — a real outlet of the same age has
  // near-continuous coverage.
  "domain-thin-history": 15,

  // --- Earned legitimacy -----------------------------------------------------
  // The single most useful positive signal, and the expensive one to fake: a
  // domain continuously archived for years. This is what protects independent
  // and non-Western outlets that no hand-written allowlist will ever cover.
  "domain-long-history": -30,
  "named-author": -10,
  "has-about": -5
};

// Signals that decide the outcome on their own, whatever else is true.
//
// Weighting was not enough for these. A thirty-year-old newspaper running an
// advertorial scored CLEAN, because three decades of archive history
// (-30) plus a byline (-10) and an about page (-5) more than cancelled the
// paid-content signal (+60). That is exactly backwards: "who paid to be in this
// answer" is the question the tool exists to answer, and a trusted masthead
// makes paid placement more effective, not less. Reputation cannot buy off
// disclosure.
export const DECISIVE = new Set(["sponsored", "non-public-url"]);

/** Score at or above which a source is reported as placed/paid. */
export const HIGH_RISK_AT = 45;
/** Score at or above which a source is reported as opaque. */
export const ELEVATED_AT = 22;

/**
 * @param {string[]} signalKeys
 * @returns {{score:number, level:"high"|"elevated"|"clean", decisive:boolean, contributions:{key:string,weight:number}[]}}
 */
export function scoreSignals(signalKeys) {
  const seen = [...new Set(signalKeys || [])].filter((k) => SIGNAL_WEIGHTS[k] !== undefined);
  const contributions = seen
    .map((key) => ({ key, weight: SIGNAL_WEIGHTS[key] }))
    .sort((a, b) => b.weight - a.weight);
  const score = contributions.reduce((n, c) => n + c.weight, 0);
  const decisive = seen.some((k) => DECISIVE.has(k));
  const level = decisive || score >= HIGH_RISK_AT ? "high" : score >= ELEVATED_AT ? "elevated" : "clean";
  return { score, level, decisive, contributions };
}

// Months of archive coverage a domain needs before its age counts as a
// legitimacy signal rather than just an old registration.
const SUSTAINED_MONTHS = 24;
const SHELL_MONTHS = 6;

/**
 * Turn a Wayback archive profile into signal keys.
 *
 * Age alone is not enough in either direction, which is the whole point: an
 * aged domain with no publishing history is more suspicious than an honest new
 * one, and a five-year continuous archive is the strongest evidence of an
 * ordinary publisher that can be obtained without a hand-written list.
 *
 * @param {{ageDays:number|null, months:number}|null} archive
 *        ageDays: days since first snapshot, null when never archived.
 *        months: count of distinct months with at least one snapshot.
 * @returns {string[]}
 */
export function archiveSignals(archive) {
  if (!archive) return []; // lookup failed — stay silent rather than guess
  const { ageDays, months = 0 } = archive;
  if (ageDays == null) return ["domain-unarchived"];

  const years = ageDays / 365;
  const out = [];

  if (ageDays < 90) out.push("domain-fresh");
  else if (years < 1) out.push("domain-new");
  else if (years < 3) out.push("domain-recent");

  if (years >= 3 && months < SHELL_MONTHS) out.push("domain-shell");
  if (years >= 5 && months >= SUSTAINED_MONTHS) out.push("domain-long-history");
  // Sporadic coverage for its age: real outlets of the same vintage are
  // archived most months. Only meaningful once there is an age to compare to.
  if (years >= 1 && years < 5 && months * 3 < ageDays / 30) out.push("domain-thin-history");

  return out;
}

// Bylines that name nobody. Filling the author meta tag is the cheapest possible
// answer to a "no named author" check, so a generic value is treated as the
// gesture it is rather than as a byline.
const GENERIC_AUTHOR =
  /^(?:admin|administrator|author|staff|editor|editors|editorial(?:\s+team|\s+board|\s+desk)?|newsroom|news\s*(?:desk|team)|team|web(?:master|\s*desk)|correspondent|reporter|contributor|guest\s+(?:author|writer)|press\s+(?:office|team)|communications?|pr\s+team|المحرر|التحرير|فريق\s+التحرير|إدارة\s+الموقع)$/i;

/**
 * @param {string} author
 * @returns {"none"|"generic"|"named"}
 */
export function classifyAuthor(author) {
  const a = String(author || "").trim().replace(/\s+/g, " ");
  if (!a) return "none";
  if (GENERIC_AUTHOR.test(a.replace(/[.\-_|]+$/, "").trim())) return "generic";
  // A byline is a person or an organisation, not a sentence or a URL.
  if (a.length > 80 || /https?:\/\//i.test(a)) return "generic";
  return "named";
}
