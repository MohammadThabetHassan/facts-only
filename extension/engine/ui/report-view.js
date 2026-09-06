// Shared report renderer: builds the verification report DOM from a report object.
// Uses textContent everywhere (no innerHTML with model output) and only http(s) links.

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c) e.appendChild(c);
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

function chip(text, tone) {
  const t = TONE[tone] || TONE.neutral;
  return el("span", {
    class: "fl-chip",
    text,
    style: `background:${t.bg};color:${t.fg}`
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

export function renderReport(container, report, { onExport } = {}) {
  container.innerHTML = "";

  // Trust banner
  const tone = TONE[TRUST_TONE[report.trustKey] || "neutral"];
  container.appendChild(
    el("div", {
      class: "fl-banner",
      style: `background:${tone.bg};color:${tone.fg}`
    }, [
      el("strong", { text: report.trustLabel }),
      el("span", { class: "fl-banner-sub", text: ` — verified with ${report.providerName}${report.page && report.page !== "manual" ? ` · from ${report.page}` : ""}` })
    ])
  );

  if (report.summary) container.appendChild(el("p", { class: "fl-summary", text: report.summary }));
  if (report.readerAdvice) {
    container.appendChild(el("p", { class: "fl-advice" }, [el("strong", { text: "Next step: " }), document.createTextNode(report.readerAdvice)]));
  }

  // Claims
  const claimsBox = el("section", { class: "fl-section" }, [el("h3", { text: `Claims checked (${report.claims.length})` })]);
  for (const c of report.claims) {
    const card = el("div", { class: "fl-card" }, [
      el("div", { class: "fl-card-head" }, [
        chip(c.verdict, CLAIM_TONE[c.verdict] || "neutral"),
        chip(`${c.confidence} confidence`, "neutral"),
        chip(c.type, "neutral")
      ]),
      el("p", { class: "fl-claim-text", text: c.text })
    ]);
    if (c.notes) card.appendChild(el("p", { class: "fl-notes", text: c.notes }));
    if (c.evidence.length) {
      const ul = el("ul", { class: "fl-evidence" });
      for (const ev of c.evidence) {
        const li = el("li", {}, [
          chip(ev.stance, ev.stance === "support" ? "good" : ev.stance === "contradict" ? "bad" : "neutral"),
          " ",
          safeLink(ev.url, ev.title || ev.url)
        ]);
        if (ev.publisher) li.appendChild(el("span", { class: "fl-dim", text: ` — ${ev.publisher}` }));
        if (ev.quote) li.appendChild(el("blockquote", { class: "fl-quote", text: `“${ev.quote}”` }));
        ul.appendChild(li);
      }
      card.appendChild(ul);
    } else {
      card.appendChild(el("p", { class: "fl-dim", text: "No independent evidence links were found for this claim." }));
    }
    claimsBox.appendChild(card);
  }
  container.appendChild(claimsBox);

  // Sources
  const flagged = report.sources.filter((s) => s.flags.some((f) => f.severity !== "info"));
  const srcBox = el("section", { class: "fl-section" }, [el("h3", { text: `Sources (${report.sources.length})` })]);
  if (!report.sources.length) srcBox.appendChild(el("p", { class: "fl-dim", text: "No sources to profile (the answer cited no links and no evidence links were found)." }));
  for (const s of report.sources) {
    const card = el("div", { class: "fl-card" }, [
      el("div", { class: "fl-card-head" }, [
        safeLink(s.url, s.title || s.siteName || s.url),
        s.established ? chip("established", "good") : null,
        s.credibility && s.credibility !== "unknown" ? chip(`${s.credibility} credibility`, s.credibility === "high" ? "good" : s.credibility === "low" ? "bad" : "warn") : null
      ])
    ]);
    if (!s.fetched && s.fetchNote) card.appendChild(el("p", { class: "fl-dim", text: `Page not fetched (${s.fetchNote}); heuristics use the link text only.` }));
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
    srcBox.appendChild(el("p", { class: "fl-warn", text: `${flagged.length} source(s) raised flags. Treat their claims with extra caution and prefer the primary sources listed above.` }));
  }
  container.appendChild(srcBox);

  // Bias
  const b = report.bias;
  const biasBox = el("section", { class: "fl-section" }, [el("h3", { text: "Bias & framing" })]);
  if (b.strongestCounterargument) {
    biasBox.appendChild(el("p", {}, [el("strong", { text: "Strongest argument against this answer: " }), document.createTextNode(b.strongestCounterargument)]));
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
    biasBox.appendChild(el("p", { class: "fl-dim", text: "No major framing problems found by the analysis." }));
  }
  container.appendChild(biasBox);

  // Footer
  const foot = el("footer", { class: "fl-footer" }, [el("p", { class: "fl-dim", text: report.disclaimer })]);
  if (onExport) {
    foot.appendChild(el("button", { type: "button", class: "secondary", onclick: onExport }, [document.createTextNode("Export report (Markdown)")]));
  }
  container.appendChild(foot);
}

export function reportToMarkdown(report) {
  const lines = [];
  lines.push(`# FactLens verification report`);
  lines.push(``);
  lines.push(`- **Trust signal:** ${report.trustLabel}`);
  lines.push(`- **Verified with:** ${report.providerName}`);
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
      lines.push(`- (${ev.stance}) [${ev.title || ev.url}](${ev.url})${ev.publisher ? ` — ${ev.publisher}` : ""}${ev.quote ? ` — “${ev.quote}”` : ""}`);
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
  lines.push(``);
  lines.push(`---`);
  lines.push(`_${report.disclaimer}_`);
  return lines.join("\n");
}
