// Collect REAL article pages from the corpus outlets.
//
//   node eval/collect-pages.mjs            fetch pages still missing
//   node eval/collect-pages.mjs --retry    also retry previous failures
//
// Why this exists. Until now every false-positive row was built from a
// constructed page body: assumed byline, assumed about-link, a hand-written
// excerpt. An external review made the fair point that impressive headline
// numbers from constructed inputs are regression tests, not validation on real
// articles. This fetches the real thing, so the detector is measured against
// pages nobody wrote for it.
//
// What is stored, and why it is stored rather than derived: the extracted
// article TEXT, so `eval/run.mjs` re-runs the live detectors over it on every
// commit. Freezing derived signal keys instead would mean a detector change no
// longer moved the number, which defeats the point.
//
// Courtesy: one request at a time, a real user-agent that says who this is, a
// hard timeout, and no retry storm. Outlets that refuse are recorded as
// refusals rather than retried into submission - and the refusal rate is itself
// a reported result, because "we could not read the page" is the single most
// common real-world condition this tool operates under.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractArticle, stripHtml } from "../extension/engine/text.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "pages.json");
const corpus = JSON.parse(readFileSync(join(HERE, "corpus.json"), "utf8"));
const RETRY = process.argv.includes("--retry");

const UA = "facts-only-eval/1.0 (+https://github.com/MohammadThabetHassan/facts-only; research evaluation)";
// The engine reads 12k; 4k keeps the committed corpus to a sane size while
// covering the article opening, where disclosures and AI boilerplate sit.
const EXCERPT_CAP = 4000;
const FEED_PATHS = ["/feed", "/rss", "/feed/", "/rss.xml", "/index.xml", "/atom.xml", "/feeds/all.rss", "/en/rss"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, timeoutMs = 15000) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: c.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, url: res.url || url, body };
  } catch (e) {
    return { ok: false, status: 0, url, body: "", error: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(timer);
  }
}

/** First item link out of an RSS or Atom feed, without an XML parser. */
function firstFeedLink(xml, domain) {
  const item = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/i);
  const block = item ? item[0] : xml;
  const rss = block.match(/<link>\s*(https?:\/\/[^<\s]+)\s*<\/link>/i);
  if (rss) return rss[1];
  const atom = block.match(/<link[^>]+href=["'](https?:\/\/[^"']+)["']/i);
  if (atom && !/\.(xml|rss)$/i.test(atom[1])) return atom[1];
  const guid = block.match(/<guid[^>]*>\s*(https?:\/\/[^<\s]+)\s*<\/guid>/i);
  if (guid) return guid[1];
  // Last resort: any same-domain link that looks like an article path.
  const any = [...xml.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0])
    .find((u) => u.includes(domain) && /\/\d{4}\/|\/(news|article|story|world|politics|business|opinion)\//i.test(u));
  return any || null;
}

function profileFrom(html, url) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const author =
    (html.match(/name=["']author["'][^>]*content=["']([^"']+)/i) || [])[1] ||
    (html.match(/property=["']article:author["'][^>]*content=["']([^"']+)/i) || [])[1] ||
    (html.match(/"author"\s*:\s*\{?\s*"name"\s*:\s*"([^"]{2,80})"/i) || [])[1] || "";
  const siteName = (html.match(/property=["']og:site_name["'][^>]*content=["']([^"']+)/i) || [])[1] || "";
  const aboutLink = /href=["'][^"']*(about|contact|imprint|masthead|editorial)[^"']*["']/i.test(html);
  const article = extractArticle(html);
  // Did narrowing actually find an article, or fall back to the whole page?
  const narrowed = article.length < html.length * 0.9;
  return {
    url,
    title: stripHtml(title).slice(0, 200),
    siteName: stripHtml(siteName).slice(0, 120),
    author: stripHtml(author).slice(0, 120),
    aboutLink,
    narrowed,
    excerpt: stripHtml(article).slice(0, EXCERPT_CAP)
  };
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { pages: [] };
const byDomain = new Map(prev.pages.map((p) => [p.domain, p]));

const todo = corpus.outlets.filter((o) => {
  const hit = byDomain.get(o.domain);
  if (!hit) return true;
  return RETRY && !hit.ok;
});
console.log(`${corpus.outlets.length} outlets · ${byDomain.size} already collected · ${todo.length} to fetch\n`);

let n = 0;
for (const o of todo) {
  n++;
  const label = `[${String(n).padStart(3)}/${todo.length}] ${o.domain.padEnd(28)}`;
  let articleUrl = null;

  // Feed paths are probed a few at a time rather than one-by-one: eight serial
  // timeouts against an outlet with no feed cost over a minute each and made a
  // full run impractical. Small batches keep it quick without hammering a host.
  for (let i = 0; i < FEED_PATHS.length && !articleUrl; i += 4) {
    const batch = FEED_PATHS.slice(i, i + 4);
    const results = await Promise.all(batch.map((path) => get(`https://${o.domain}${path}`, 8000)));
    for (const r of results) {
      if (r.ok && /<(rss|feed|channel)\b/i.test(r.body)) {
        articleUrl = firstFeedLink(r.body, o.domain);
        if (articleUrl) break;
      }
    }
    await sleep(200);
  }

  if (!articleUrl) {
    byDomain.set(o.domain, { domain: o.domain, region: o.region, ok: false, reason: "no readable feed" });
    console.log(`${label} no feed`);
    await sleep(400);
    continue;
  }

  const page = await get(articleUrl, 20000);
  if (!page.ok || page.body.length < 500) {
    byDomain.set(o.domain, {
      domain: o.domain, region: o.region, ok: false,
      reason: page.error ? `fetch ${page.error}` : `HTTP ${page.status}`, url: articleUrl
    });
    console.log(`${label} ${page.error || "HTTP " + page.status}`);
    await sleep(400);
    continue;
  }

  const p = profileFrom(page.body, page.url);
  byDomain.set(o.domain, { domain: o.domain, region: o.region, ok: true, ...p });
  console.log(`${label} ok  ${p.excerpt.length}ch  ${p.narrowed ? "narrowed" : "whole-page"}  author=${p.author ? "yes" : "no"}`);
  await sleep(500);
}

const pages = [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain));
const ok = pages.filter((p) => p.ok).length;
writeFileSync(OUT, JSON.stringify({ collectedAt: new Date().toISOString(), excerptCap: EXCERPT_CAP, pages }, null, 2) + "\n");
console.log(`\nWrote eval/pages.json — ${ok}/${pages.length} readable`);
console.log(`${pages.length - ok} refused or unreachable. That is a result, not a gap: it is the condition the tool meets most often in the field.`);
