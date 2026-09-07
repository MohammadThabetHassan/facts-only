// Shared report renderer: builds the verification report DOM from a report object.
// Uses textContent everywhere (no innerHTML with model output) and only http(s) links.
// UI labels are localized via i18n.js; engine-generated report text (summary, notes,
// heuristic flag labels, disclaimer) intentionally stays as produced.

import { t, resolveLocale } from "./i18n.js";
import { summarizeRisk } from "../explain.js";

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

function chip(text, tone) {
  const tt = TONE[tone] || TONE.neutral;
  return el("span", {
    class: "fo-chip",
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

/**
 * @param {HTMLElement} container
 * @param {*} report
 * @param {{onExport?: () => void, onCopy?: () => void, lang?: string}} [options]
 */
export function renderReport(container, report, { onExport, onCopy, lang = "en" } = {}) {
  const L = resolveLocale(lang);
  container.innerHTML = "";

  // ---- Plain-language risk card -------------------------------------------
  // Deliberately the FIRST thing under the banner. The flags further down are
  // accurate but read like a security tool; a reader who only wants to know
  // whether they were sold something should get that in one sentence, before
  // any jargon. Computed in code (engine/explain.js) from the same flags, so
  // the model being checked cannot soften it.
  const risk = summarizeRisk(report.sources || []);
  {
    const box = el("section", { class: `fo-explain ${risk.tone}` }, [
      el("p", {
        class: "fo-explain-head",
        text: `${risk.tone === "good" ? "✓" : "⚠"} ${t("explain." + risk.level + ".head", L)}`
      }),
      el("p", { class: "fo-explain-body", text: t("explain." + risk.level + ".body", L) })
    ]);

    if (risk.offenders.length) {
      box.appendChild(el("p", { class: "fo-explain-why", text: t("explain.because", L) }));
      const ul = el("ul", { class: "fo-explain-list" });
      for (const o of risk.offenders) {
        // The source is named once, with its reasons underneath it. Repeating
        // the domain on every line read like several different problems.
        ul.appendChild(
          el("li", {}, [
            safeLink(o.url, o.name),
            el(
              "ul",
              { class: "fo-explain-reasons" },
              o.reasonKeys.map((key) => el("li", { text: t("flag." + key, L) }))
            )
          ])
        );
      }
      box.appendChild(ul);
    }

    if (risk.total > 0) {
      const foot = [t("explain.established", L, { n: risk.establishedCount, total: risk.total })];
      // "treat the flagged one as an argument rather than as evidence" only
      // makes sense when something was actually flagged. The unread and unknown
      // verdicts name sources we could not read, not sources we doubt.
      if (risk.reasonKeys.length) foot.push(t("explain.readFirst", L));
      box.appendChild(el("p", { class: "fo-explain-foot", text: foot.join(" ") }));
    }
    container.appendChild(box);
  }

  // A sources-only report has no claim verdicts, so everything below the
  // risk card that describes them is skipped rather than rendered empty.
  const sourcesOnly = !!report.sourcesOnly;

  // Trust banner with the counts behind it
  const tone = TONE[TRUST_TONE[report.trustKey] || "neutral"];
  if (!sourcesOnly) {
  const c = report.trustCounts || {};
  // Each "<number> <label>" pair is its own bidi-isolated node. Built as one
  // string, an RTL locale reorders the Latin digits across the separators and
  // the counts read as nonsense ("0 mixed 1" instead of "1 mixed").
  const countNodes = c.checked == null ? [] : VERDICTS.flatMap((v, i) => {
    const part = el("bdi", { class: "fo-count", text: `${c[v] || 0} ${t("verdict." + v, L)}` });
    return i === 0 ? [part] : [document.createTextNode(" · "), part];
  });
  container.appendChild(
    el("div", {
      class: "fo-banner",
      style: `background:${tone.bg};color:${tone.fg}`
    }, [
      el("strong", { text: t("trust." + report.trustKey, L) !== "trust." + report.trustKey ? t("trust." + report.trustKey, L) : report.trustLabel }),
      el("span", {
        class: "fo-banner-sub",
        text: ` — ${t("rep.verifiedWith", L)} ${report.providerName}${report.providerModel ? ` (${report.providerModel})` : ""}${report.page && report.page !== "manual" ? ` · ${report.page}` : ""}`
      }),
      countNodes.length ? el("div", { class: "fo-banner-counts" }, countNodes) : null
    ])
  );

  }

  // What this run did NOT do. On a keyless check this is the most important
  // line in the report: the reader must not mistake "sources look fine" for
  // "the answer is true".
  if (sourcesOnly) {
    container.appendChild(el("p", { class: "fo-method", text: t("rep.sourcesOnlyMethod", L) }));
  }

  // Method / transparency line — what this verification actually did
  // A keyless run has its own, clearer method line above; the generic one would
  // otherwise claim "model knowledge only" for a check that used no model.
  const m = sourcesOnly ? null : report.method;
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
    container.appendChild(el("p", { class: "fo-method", text: `${t("rep.method", L)} ${bits.join(" · ")}` }));
  }

  if (report.summary) container.appendChild(el("p", { class: "fo-summary", text: report.summary }));
  if (report.readerAdvice) {
    container.appendChild(el("p", { class: "fo-advice" }, [el("strong", { text: t("rep.nextStep", L) }), document.createTextNode(report.readerAdvice)]));
  }

  // Claims
  const claims = report.claims || [];
  const claimsBox = el("section", { class: "fo-section" }, [el("h3", { text: t("rep.claims", L, { n: claims.length }) })]);
  for (const cl of claims) {
    const card = el("div", { class: "fo-card" }, [
      el("div", { class: "fo-card-head" }, [
        chip(t("verdict." + cl.verdict, L), CLAIM_TONE[cl.verdict] || "neutral"),
        chip(t("rep.confidence", L, { v: t("conf." + cl.confidence, L) }), "neutral"),
        chip(t("type." + cl.type, L), "neutral")
      ]),
      el("p", { class: "fo-claim-text", text: cl.text })
    ]);
    if (cl.notes) card.appendChild(el("p", { class: "fo-notes", text: cl.notes }));
    if (cl.evidence.length) {
      const ul = el("ul", { class: "fo-evidence" });
      for (const ev of cl.evidence) {
        const li = el("li", {}, [
          chip(t("stance." + ev.stance, L), ev.stance === "support" ? "good" : ev.stance === "contradict" ? "bad" : "neutral"),
          " ",
          safeLink(ev.url, ev.title || ev.url)
        ]);
        if (ev.publisher) li.appendChild(el("span", { class: "fo-dim", text: ` — ${ev.publisher}` }));
        if (ev.quote) {
          li.appendChild(el("blockquote", { class: "fo-quote", text: `“${ev.quote}”` }));
          const qTone = QUOTE_TONE[ev.quoteStatus];
          if (qTone) li.appendChild(chip(t("quote." + ev.quoteStatus, L), qTone));
        }
        ul.appendChild(li);
      }
      card.appendChild(ul);
    } else {
      card.appendChild(el("p", { class: "fo-dim", text: t("rep.noEvidence", L) }));
    }
    claimsBox.appendChild(card);
  }
  if (claims.length) container.appendChild(claimsBox);

  // Sources
  const flagged = report.sources.filter((s) => s.flags.some((f) => f.severity !== "info"));
  const srcBox = el("section", { class: "fo-section" }, [el("h3", { text: t("rep.sources", L, { n: report.sources.length }) })]);
  if (!report.sources.length) srcBox.appendChild(el("p", { class: "fo-dim", text: t("rep.noEvidence", L) }));
  for (const s of report.sources) {
    const card = el("div", { class: "fo-card" }, [
      el("div", { class: "fo-card-head" }, [
        safeLink(s.url, s.title || s.siteName || s.url),
        s.established ? chip("established", "good") : null,
        s.credibility && s.credibility !== "unknown" ? chip(`${s.credibility} credibility`, s.credibility === "high" ? "good" : s.credibility === "low" ? "bad" : "warn") : null
      ])
    ]);
    if (typeof s.placementScore === "number" && !s.established) {
      card.appendChild(el("p", { class: "fo-dim", text: t("rep.placementScore", L, { n: s.placementScore }) }));
    }
    if (!s.fetched && s.fetchNote) card.appendChild(el("p", { class: "fo-dim", text: t("rep.notFetched", L, { note: s.fetchNote }) }));
    if (s.firstArchived) card.appendChild(el("p", { class: "fo-dim", text: `Domain first archived (Wayback): ${s.firstArchived}` }));
    if (s.publisher) card.appendChild(el("p", { class: "fo-notes", text: `Publisher: ${s.publisher}${s.likelyFunding ? ` · Funding: ${s.likelyFunding}` : ""}${s.stance ? ` · Stance: ${s.stance}` : ""}` }));
    for (const f of s.flags) {
      if (f.severity === "info") continue;
      // Plain sentence first. The engine wording (f.label/f.detail) is precise
      // but jargon-heavy, so it moves into a collapsed "Technical detail".
      const plain = t("flag." + f.key, L);
      const hasPlain = plain !== "flag." + f.key;
      const flagBox = el("div", { class: `fo-flag ${f.severity}` }, [
        el("p", { class: "fo-flag-head", text: `⚠ ${hasPlain ? plain : f.label}` })
      ]);
      if (f.detail || hasPlain) {
        flagBox.appendChild(
          el("details", { class: "fo-flag-more" }, [
            el("summary", { text: t("flag.technical", L) }),
            el("p", { text: `${f.label}${f.detail ? ` — ${f.detail}` : ""}` }),
            // The arithmetic, shown rather than asserted: a reader who wants to
            // argue with a verdict can see exactly what it was built from.
            typeof f.weight === "number"
              ? el("p", { class: "fo-dim", text: t("rep.contribution", L, { n: f.weight > 0 ? `+${f.weight}` : String(f.weight) }) })
              : null
          ])
        );
      }
      card.appendChild(flagBox);
    }
    srcBox.appendChild(card);
  }
  if (flagged.length) {
    srcBox.appendChild(el("p", { class: "fo-warn", text: t("rep.warnSources", L, { n: flagged.length }) }));
  }
  container.appendChild(srcBox);

  // Bias
  const b = sourcesOnly ? null : report.bias;
  if (b) {
  const biasBox = el("section", { class: "fo-section" }, [el("h3", { text: t("rep.bias", L) })]);
  if (b.strongestCounterargument) {
    biasBox.appendChild(el("p", {}, [el("strong", { text: t("rep.strongest", L) }), document.createTextNode(b.strongestCounterargument)]));
  }
  const list = (title, items) => {
    if (!items || !items.length) return;
    biasBox.appendChild(el("p", { class: "fo-subhead", text: title }));
    const ul = el("ul", {});
    items.forEach((it) => ul.appendChild(el("li", { text: it })));
    biasBox.appendChild(ul);
  };
  list("Framing issues", b.framingIssues);
  list("Missing context", b.missingContext);
  list("Manipulation signals", b.manipulationSignals);
  if (!b.strongestCounterargument && !b.framingIssues.length && !b.missingContext.length && !b.manipulationSignals.length) {
    biasBox.appendChild(el("p", { class: "fo-dim", text: t("rep.noBias", L) }));
  }
  container.appendChild(biasBox);
  }

  // Second opinion (cross-model check)
  const so = sourcesOnly ? null : report.secondOpinion;
  if (so) {
    const soBox = el("section", { class: "fo-section" }, [
      el("h3", { text: `${t("rep.second", L)}${so.available ? ` — ${so.providerName}${so.model ? ` (${so.model})` : ""}` : ""}` })
    ]);
    if (!so.available) {
      soBox.appendChild(el("p", { class: "fo-dim", text: so.note || "—" }));
    } else {
      if (so.disagreements === 0) {
        soBox.appendChild(el("p", { class: "fo-agree", text: t("rep.secondAgree", L) }));
      } else {
        soBox.appendChild(el("p", { class: "fo-warn", text: t("rep.secondDisagree", L, { n: so.disagreements }) }));
      }
      for (const a of so.assessments) {
        const claim = (report.claims || []).find((x) => x.id === a.id);
        const card = el("div", { class: "fo-card" }, [
          el("div", { class: "fo-card-head" }, [
            chip(a.agrees === false ? "disagrees" : a.agrees === true ? "agrees" : "no match", a.agrees === false ? "bad" : a.agrees === true ? "good" : "neutral"),
            chip(t("verdict." + a.verdict, L), CLAIM_TONE[a.verdict] || "neutral"),
            chip(t("rep.confidence", L, { v: t("conf." + a.confidence, L) }), "neutral")
          ]),
          el("p", { class: "fo-claim-text", text: claim ? claim.text : `#${a.id}` })
        ]);
        if (a.note) card.appendChild(el("p", { class: "fo-notes", text: a.note }));
        soBox.appendChild(card);
      }
      if (so.missedContext && so.missedContext.length) {
        soBox.appendChild(el("p", { class: "fo-subhead", text: t("rep.missedCtx", L) }));
        const ul = el("ul", {});
        so.missedContext.forEach((x) => ul.appendChild(el("li", { text: x })));
        soBox.appendChild(ul);
      }
      if (so.overallNote) soBox.appendChild(el("p", { class: "fo-notes", text: so.overallNote }));
    }
    container.appendChild(soBox);
  }

  // Footer
  const foot = el("footer", { class: "fo-footer" }, [el("p", { class: "fo-dim", text: report.disclaimer })]);
  if (onExport) {
    foot.appendChild(el("button", { type: "button", class: "secondary", onclick: onExport }, [document.createTextNode(t("btn.export", L))]));
  }
  if (onCopy) {
    foot.appendChild(el("button", { type: "button", class: "secondary", onclick: onCopy }, [document.createTextNode(t("btn.copy", L))]));
  }
  container.appendChild(foot);
}

export function reportToMarkdown(report, lang = "en") {
  const L = resolveLocale(lang);
  const lines = [];
  const m = report.method || {};
  lines.push(`# Facts Only verification report`);
  lines.push(``);
  // Same plain-language headline as the on-screen report: an exported report is
  // usually read by someone who never opened the tool.
  const risk = summarizeRisk(report.sources || []);
  lines.push(`> **${risk.tone === "good" ? "✓" : "⚠"} ${t("explain." + risk.level + ".head", L)}**`);
  lines.push(`>`);
  lines.push(`> ${t("explain." + risk.level + ".body", L)}`);
  for (const o of risk.offenders) {
    lines.push(`>`);
    lines.push(`> - ${o.name} (${o.url})`);
    for (const key of o.reasonKeys) lines.push(`>   - ${t("flag." + key, L)}`);
  }
  lines.push(``);
  if (report.trustLabel) lines.push(`- **Trust signal:** ${report.trustLabel} (weighted support score ${report.trustScore != null ? Number(report.trustScore).toFixed(2) : "?"})`);
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
  for (const c of report.claims || []) {
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
    for (const f of s.flags) {
      if (f.severity === "info") continue;
      const plain = t("flag." + f.key, L);
      const hasPlain = plain !== "flag." + f.key;
      lines.push(`  - ⚠ ${hasPlain ? plain : f.label}${hasPlain ? ` (${f.label})` : ""}`);
    }
  }
  lines.push(``);
  lines.push(`## Bias & framing`);
  if (report.bias && report.bias.strongestCounterargument) lines.push(`**Strongest argument against:** ${report.bias.strongestCounterargument}`);
  const list = (title, items) => {
    if (!items || !items.length) return;
    lines.push(``);
    lines.push(`**${title}**`);
    items.forEach((i) => lines.push(`- ${i}`));
  };
  list("Framing issues", report.bias && report.bias.framingIssues);
  list("Missing context", report.bias && report.bias.missingContext);
  list("Manipulation signals", report.bias && report.bias.manipulationSignals);

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
