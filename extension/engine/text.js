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
