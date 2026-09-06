// Shared report renderer: builds the verification report DOM from a report object.
// Uses textContent everywhere (no innerHTML with model output) and only http(s) links.
// UI labels are localized via i18n.js; engine-generated report text (summary, notes,
// heuristic flag labels, disclaimer) intentionally stays as produced.

import { t, resolveLocale } from "./i18n.js";

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return e;
}

const TONE = {
  good: { bg: "#dcfce7", fg: "#166534" },
  warn: { bg: "#fef3c7", fg: "#92400e" },
  bad: { bg: "#fee2e2", fg: "#991b1b" },
  neutral: { bg: "#f3f4f6", fg: "#374151" }
};

const CLAIM_TONE = { supported: "good", mixed: "warn", contradicted: "bad", unverifiable: "neutral" };
const TRUST_TONE = {
  "well-supported": "good",
  mixed: "warn",
  "one-sided": "warn",
  contradicted: "bad",
  "manipulated-sources": "bad",
  unverifiable: "neutral",
  "no-claims": "neutral"
};
const QUOTE_TONE = { verified: "good", partial: "warn", "not-found": "bad", "page-not-fetched": "neutral", none: null };
const VERDICTS = ["supported", "mixed", "contradicted", "unverifiable"];
const STANCES = ["support", "contradict", "nuance"];

function chip(text, tone) {
  const tt = TONE[tone] || TONE.neutral;
  return el("span", {
    class: "fl-chip",
    text,
    style: `background:${tt.bg};color:${tt.fg}`
  });
}

function safeLink(url, text) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return document.createTextNode(text || "");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return document.createTextNode(text || "");
  return el("a", { href: u.href, target: "_blank", rel: "noopener noreferrer", text: text || u.hostname });
}

export function renderReport(container, report, { onExport, onCopy, lang = "en" } = {}) {
  const L = resolveLocale(lang);
  container.innerHTML = "";

  // Trust banner with the counts behind it
  const tone = TONE[TRUST_TONE[report.trustKey] || "neutral"];
  const c = report.trustCounts || {};
  const countsText = c.checked != null
    ? `${c.supported || 0} ${t("verdict.supported", L)} · ${c.mixed || 0} ${t("verdict.mixed", L)} · ${c.contradicted || 0} ${t("verdict.contradicted", L)} · ${c.unverifiable || 0} ${t("verdict.unverifiable", L)}`
    : "";
  container.appendChild(
    el("div", {
      class: "fl-banner",
      style: `background:${tone.bg};color:${tone.fg}`
    }, [
      el("strong", { text: t("trust." + report.trustKey, L) !== "trust." + report.trustKey ? t("trust." + report.trustKey, L) : report.trustLabel }),
      el("span", {
        class: "fl-banner-sub",
        text: ` — ${t("rep.verifiedWith", L)} ${report.providerName}${report.providerModel ? ` (${report.providerModel})` : ""}${report.page && report.page !== "manual" ? ` · ${report.page}` : ""}`
      }),
      countsText ? el("div", { class: "fl-banner-counts", text: countsText }) : null
    ])
  );

  // Method / transparency line — what this verification actually did
  const m = report.method;
  if (m) {
    const bits = [
      m.searchUsed ? t("m.searchUsed", L) : t("m.noSearch", L),
      m.claimsChecked != null && m.additionalCheckable > 0
        ? t("m.coverage", L, { checked: m.claimsChecked, total: m.claimsTotal, extra: m.additionalCheckable })
        : (m.claimsChecked != null ? t("m.coverageAll", L, { checked: m.claimsChecked }) : null),
      m.quotesVerified > 0 ? t("m.quotesOk", L, { n: m.quotesVerified }) : null,
      m.quotesMissing > 0 ? t("m.quotesMissing", L, { n: m.quotesMissing }) : null,
      m.secondOpinionUsed ? t("m.secondOn", L) : t("m.secondOff", L)
    ].filter(Boolean);
    container.appendChild(el("p", { class: "fl-method", text: `${t("rep.method", L)} ${bits.join(" · ")}` }));
  }

  if (report.summary) container.appendChild(el("p", { class: "fl-summary", text: report.summary }));
  if (report.readerAdvice) {
    container.appendChild(el("p", { class: "fl-advice" }, [el("strong", { text: t("rep.nextStep", L) }), document.createTextNode(report.readerAdvice)]));
  }

  // Claims
  const claimsBox = el("section", { class: "fl-section" }, [el("h3", { text: t("rep.claims", L, { n: report.claims.length }) })]);
  for (const cl of report.claims) {
    const card = el("div", { class: "fl-card" }, [
      el("div", { class: "fl-card-head" }, [
        chip(t("verdict." + cl.verdict, L), CLAIM_TONE[cl.verdict] || "neutral"),
        chip(t("rep.confidence", L, { v: cl.confidence }), "neutral"),
        chip(cl.type, "neutral")
      ]),
      el("p", { class: "fl-claim-text", text: cl.text })
    ]);
    if (cl.notes) card.appendChild(el("p", { class: "fl-notes", text: cl.notes }));
    if (cl.evidence.length) {
      const ul = el("ul", { class: "fl-evidence" });
      for (const ev of cl.evidence) {
        const li = el("li", {}, [
          chip(t("stance." + ev.stance, L), ev.stance === "support" ? "good" : ev.stance === "contradict" ? "bad" : "neutral"),
          " ",
          safeLink(ev.url, ev.title || ev.url)
        ]);
        if (ev.publisher) li.appendChild(el("span", { class: "fl-dim", text: ` — ${ev.publisher}` }));
        if (ev.quote) {
          li.appendChild(el("blockquote", { class: "fl-quote", text: `“${ev.quote}”` }));
          const qTone = QUOTE_TONE[ev.quoteStatus];
          if (qTone) li.appendChild(chip(t("quote." + ev.quoteStatus, L), qTone));
        }
        ul.appendChild(li);
      }
      card.appendChild(ul);
    } else {
      card.appendChild(el("p", { class: "fl-dim", text: t("rep.noEvidence", L) }));
    }
    claimsBox.appendChild(card);
  }
  container.appendChild(claimsBox);

  // Sources
  const flagged = report.sources.filter((s) => s.flags.some((f) => f.severity !== "info"));
  const srcBox = el("section", { class: "fl-section" }, [el("h3", { text: t("rep.sources", L, { n: report.sources.length }) })]);
  if (!report.sources.length) srcBox.appendChild(el("p", { class: "fl-dim", text: t("rep.noEvidence", L) }));
  for (const s of report.sources) {
    const card = el("div", { class: "fl-card" }, [
      el("div", { class: "fl-card-head" }, [
        safeLink(s.url, s.title || s.siteName || s.url),
        s.established ? chip("established", "good") : null,
        s.credibility && s.credibility !== "unknown" ? chip(`${s.credibility} credibility`, s.credibility === "high" ? "good" : s.credibility === "low" ? "bad" : "warn") : null
      ])
    ]);
    if (!s.fetched && s.fetchNote) card.appendChild(el("p", { class: "fl-dim", text: t("rep.notFetched", L, { note: s.fetchNote }) }));
    if (s.firstArchived) card.appendChild(el("p", { class: "fl-dim", text: `Domain first archived (Wayback): ${s.firstArchived}` }));
    if (s.publisher) card.appendChild(el("p", { class: "fl-notes", text: `Publisher: ${s.publisher}${s.likelyFunding ? ` · Funding: ${s.likelyFunding}` : ""}${s.stance ? ` · Stance: ${s.stance}` : ""}` }));
    for (const f of s.flags) {
      if (f.severity === "info") continue;
      card.appendChild(
        el("p", {
          class: `fl-flag ${f.severity}`,
          text: `⚠ ${f.label}${f.detail ? ` — ${f.detail}` : ""}`
        })
      );
    }
    srcBox.appendChild(card);
  }
  if (flagged.length) {
    srcBox.appendChild(el("p", { class: "fl-warn", text: t("rep.warnSources", L, { n: flagged.length }) }));
  }
  container.appendChild(srcBox);

  // Bias
  const b = report.bias;
  const biasBox = el("section", { class: "fl-section" }, [el("h3", { text: t("rep.bias", L) })]);
  if (b.strongestCounterargument) {
    biasBox.appendChild(el("p", {}, [el("strong", { text: t("rep.strongest", L) }), document.createTextNode(b.strongestCounterargument)]));
  }
  const list = (title, items) => {
    if (!items || !items.length) return;
    biasBox.appendChild(el("p", { class: "fl-subhead", text: title }));
    const ul = el("ul", {});
    items.forEach((it) => ul.appendChild(el("li", { text: it })));
    biasBox.appendChild(ul);
  };
  list("Framing issues", b.framingIssues);
  list("Missing context", b.missingContext);
  list("Manipulation signals", b.manipulationSignals);
  if (!b.strongestCounterargument && !b.framingIssues.length && !b.missingContext.length && !b.manipulationSignals.length) {
    biasBox.appendChild(el("p", { class: "fl-dim", text: t("rep.noBias", L) }));
  }
  container.appendChild(biasBox);

  // Second opinion (cross-model check)
  const so = report.secondOpinion;
  if (so) {
    const soBox = el("section", { class: "fl-section" }, [
      el("h3", { text: `${t("rep.second", L)}${so.available ? ` — ${so.providerName}${so.model ? ` (${so.model})` : ""}` : ""}` })
    ]);
    if (!so.available) {
      soBox.appendChild(el("p", { class: "fl-dim", text: so.note || "—" }));
    } else {
      if (so.disagreements === 0) {
        soBox.appendChild(el("p", { class: "fl-agree", text: t("rep.secondAgree", L) }));
      } else {
        soBox.appendChild(el("p", { class: "fl-warn", text: t("rep.secondDisagree", L, { n: so.disagreements }) }));
      }
      for (const a of so.assessments) {
        const claim = (report.claims || []).find((x) => x.id === a.id);
        const card = el("div", { class: "fl-card" }, [
          el("div", { class: "fl-card-head" }, [
            chip(a.agrees === false ? "disagrees" : a.agrees === true ? "agrees" : "no match", a.agrees === false ? "bad" : a.agrees === true ? "good" : "neutral"),
            chip(t("verdict." + a.verdict, L), CLAIM_TONE[a.verdict] || "neutral"),
            chip(t("rep.confidence", L, { v: a.confidence }), "neutral")
          ]),
          el("p", { class: "fl-claim-text", text: claim ? claim.text : `#${a.id}` })
        ]);
        if (a.note) card.appendChild(el("p", { class: "fl-notes", text: a.note }));
        soBox.appendChild(card);
      }
      if (so.missedContext && so.missedContext.length) {
        soBox.appendChild(el("p", { class: "fl-subhead", text: t("rep.missedCtx", L) }));
        const ul = el("ul", {});
        so.missedContext.forEach((x) => ul.appendChild(el("li", { text: x })));
        soBox.appendChild(ul);
      }
      if (so.overallNote) soBox.appendChild(el("p", { class: "fl-notes", text: so.overallNote }));
    }
    container.appendChild(soBox);
  }

  // Footer
  const foot = el("footer", { class: "fl-footer" }, [el("p", { class: "fl-dim", text: report.disclaimer })]);
  if (onExport) {
    foot.appendChild(el("button", { type: "button", class: "secondary", onclick: onExport }, [document.createTextNode(t("btn.export", L))]));
  }
  if (onCopy) {
    foot.appendChild(el("button", { type: "button", class: "secondary", onclick: onCopy }, [document.createTextNode(t("btn.copy", L))]));
  }
  container.appendChild(foot);
}

export function reportToMarkdown(report) {
  const lines = [];
  const m = report.method || {};
  lines.push(`# FactLens verification report`);
  lines.push(``);
  lines.push(`- **Trust signal:** ${report.trustLabel} (weighted support score ${report.trustScore != null ? Number(report.trustScore).toFixed(2) : "?"})`);
  lines.push(`- **Verified with:** ${report.providerName}${report.providerModel ? ` (${report.providerModel})` : ""} · live web search: ${m.searchUsed ? "yes" : "no"}${m.secondOpinionUsed ? " · second-model cross-check: yes" : ""}`);
  if (m.claimsChecked != null) {
    lines.push(`- **Coverage:** ${m.claimsChecked} of ~${m.claimsTotal} checkable claims examined${m.additionalCheckable ? ` (${m.additionalCheckable} not checked)` : ""}`);
  }
  if (m.quotesVerified != null) lines.push(`- **Quote verification:** ${m.quotesVerified} verified on page, ${m.quotesMissing} not found`);
  lines.push(`- **Date:** ${report.createdAt}`);
  lines.push(``);
  lines.push(`**Summary:** ${report.summary}`);
  if (report.readerAdvice) lines.push(`\n**Next step:** ${report.readerAdvice}`);
  lines.push(``);
  lines.push(`## Claims`);
  for (const c of report.claims) {
    lines.push(``);
    lines.push(`### [${c.verdict} / ${c.confidence}] ${c.text}`);
    if (c.notes) lines.push(`${c.notes}`);
    for (const ev of c.evidence) {
      const qs = ev.quoteStatus === "verified" ? " ✔ quote verified on page"
        : ev.quoteStatus === "partial" ? " ~ quote partially found on page"
        : ev.quoteStatus === "not-found" ? " ⚠ quote NOT found on page"
        : "";
      lines.push(`- (${ev.stance}) [${ev.title || ev.url}](${ev.url})${ev.publisher ? ` — ${ev.publisher}` : ""}${ev.quote ? ` — “${ev.quote}”` : ""}${qs}`);
    }
  }
  lines.push(``);
  lines.push(`## Sources`);
  for (const s of report.sources) {
    lines.push(`- [${s.title || s.siteName || s.url}](${s.url})${s.established ? " — established" : ""}${s.credibility !== "unknown" ? ` — credibility: ${s.credibility}` : ""}`);
    for (const f of s.flags) if (f.severity !== "info") lines.push(`  - ⚠ ${f.label}`);
  }
  lines.push(``);
  lines.push(`## Bias & framing`);
  if (report.bias.strongestCounterargument) lines.push(`**Strongest argument against:** ${report.bias.strongestCounterargument}`);
  const list = (title, items) => {
    if (!items || !items.length) return;
    lines.push(``);
    lines.push(`**${title}**`);
    items.forEach((i) => lines.push(`- ${i}`));
  };
  list("Framing issues", report.bias.framingIssues);
  list("Missing context", report.bias.missingContext);
  list("Manipulation signals", report.bias.manipulationSignals);

  const so = report.secondOpinion;
  if (so) {
    lines.push(``);
    lines.push(`## Second opinion${so.available ? ` — ${so.providerName}` : ""}`);
    if (!so.available) {
      lines.push(`${so.note || "Not configured."}`);
    } else {
      for (const a of so.assessments) {
        const claim = (report.claims || []).find((x) => x.id === a.id);
        lines.push(`- [${a.agrees === false ? "DISAGREES" : a.agrees ? "agrees" : "—"}] ${claim ? claim.text : `#${a.id}`} → **${a.verdict}/${a.confidence}**${a.note ? ` — ${a.note}` : ""}`);
      }
      list("Missed context", so.missedContext);
      if (so.overallNote) lines.push(``);
      if (so.overallNote) lines.push(`${so.overallNote}`);
    }
  }

  if (Array.isArray(report.trustBasis) && report.trustBasis.length) {
    lines.push(``);
    lines.push(`## How the trust signal was computed`);
    report.trustBasis.forEach((b) => lines.push(`- ${b}`));
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(`_${report.disclaimer}_`);
  return lines.join("\n");
}
