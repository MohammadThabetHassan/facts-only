// Small text helpers usable in both the browser (panel/popup/webapp) and Node (tests).
// Deliberately avoids DOMParser so the engine stays DOM-free.

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  eacute: "é",
  egrave: "è"
};

export function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch (e) {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        return String.fromCodePoint(parseInt(d, 10));
      } catch (e) {
        return "";
      }
    })
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] || m);
}

// Boilerplate containers. Their text belongs to the site, not to the article,
// and the page-voice detectors have no way to tell the difference once
// everything has been flattened to one string.
const FURNITURE = /<(nav|header|footer|aside|form|dialog)\b[^>]*>[\s\S]*?<\/\1>/gi;
const NON_CONTENT = /<(script|style|noscript|svg|template|iframe|button|select)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Narrow a fetched page down to the article before any detector reads it.
 *
 * Every page-text false positive found so far came from the same place: the
 * excerpt was the whole page, so a "Sponsored" label on an ad slot, a promo
 * rail or a footer read exactly like the article's own words. Detectors that
 * ask "what does this page say" need to be given the page's actual claim, not
 * its navigation.
 *
 * Deliberately regex-based and DOM-free: the engine runs unchanged in the
 * extension, in the web app and in Node under the test suite, and reaching for
 * DOMParser would end that. The trade is precision - a nested <article> ends
 * the match early, and unclosed furniture is left alone - so this is a
 * narrowing heuristic, never a parser. When it finds nothing it returns the
 * page as-is rather than risk discarding the content.
 *
 * @param {string} html
 * @returns {string} HTML narrowed to the article where one is identifiable.
 */
export function extractArticle(html) {
  const cleaned = String(html || "")
    .replace(NON_CONTENT, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(FURNITURE, " ");

  // Prefer what the page itself marks as the article.
  const marked =
    cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
    cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    cleaned.match(/<[^>]+\brole=["']main["'][^>]*>([\s\S]*?)<\/[a-z]+>/i);

  // A marked region that is too small to be the article is more likely a teaser
  // card than the story, so fall back rather than throw the page away.
  if (marked && marked[1] && marked[1].replace(/<[^>]+>/g, "").trim().length > 200) return marked[1];
  return cleaned;
}

export function stripHtml(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n")
    .trim();
}

export function truncate(s, n) {
  const str = String(s || "").trim();
  return str.length <= n ? str : str.slice(0, n - 1) + "…";
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}

export function isHttpUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (e) {
    return false;
  }
}

// Stable 32-bit hash (FNV-1a) used for cache keys.
export function hash32(s) {
  let h = 0x811c9dc5;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Normalize text for loose matching (quote-vs-page verification):
// lowercase, unify quotes/dashes, collapse all whitespace.
export function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// Extract source links from arbitrary pasted text. Markdown links are matched
// first so the anchor text becomes the title; bare URLs follow. Deduped.
export function extractUrls(text) {
  const out = [];
  const seen = new Set();
  const push = (url, title) => {
    if (!isHttpUrl(url) || seen.has(url)) return;
    seen.add(url);
    out.push({ url, title: truncate(title || "", 140) });
  };
  const md = /\[([^\]]{1,140})\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = md.exec(text))) push(m[2], m[1]);
  const bare = /https?:\/\/[^\s<>"'`)\]}]+/g;
  while ((m = bare.exec(text))) push(m[0].replace(/[.,;:!]+$/, ""), "");
  return out;
}

// ---------------------------------------------------------------------------
// SSRF guard for model-supplied URLs.
//
// Evidence URLs come from an LLM, and the LLM's input includes untrusted web
// pages. In the extension the fetch runs from a privileged context with
// <all_urls> and no CORS, i.e. from *inside* the user's network. A hallucinated
// or injected `http://192.168.1.1/`, `http://127.0.0.1:8080/admin` or
// `http://169.254.169.254/latest/meta-data/` would therefore be fetched, and its
// body would then be pasted into the next model prompt as a page "excerpt" —
// an exfiltration path, not just a probe.
//
// Rule: a citable source is a public DNS name. We require a dotted hostname and
// reject every IP literal. Rejecting IP literals outright (rather than
// range-matching) also defeats the obfuscated encodings — decimal
// (http://2130706433/), octal, hex, and IPv4-mapped IPv6 — in one rule.
// Residual risk: DNS rebinding, which this cannot see. See docs/THREAT-MODEL.md.

const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa", ".lan"];

export function isPublicHttpUrl(u) {
  let url;
  try {
    url = new URL(u);
  } catch (e) {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false; // credentials-in-URL

  // IPv6 literals arrive bracketed; no source is ever cited as one.
  if (url.hostname.startsWith("[")) return false;

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost") return false;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return false;

  // Reject anything that is not a dotted DNS name: bare intranet names
  // ("http://wiki/") and all-numeric hosts (decimal-encoded IPs) fail here.
  if (!host.includes(".")) return false;
  const labels = host.split(".");
  if (labels.some((l) => l.length === 0)) return false;
  const tld = labels[labels.length - 1];
  if (!/^[a-z][a-z0-9-]*$/.test(tld)) return false; // a real TLD never starts with a digit

  return true;
}
