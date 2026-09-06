// Mock provider: returns canned results so the full pipeline and UI can be
// exercised offline (no API key). Also used by the "Try a demo" button.

import { sleep } from "../http.js";

const CANNED = {
  claims: {
    claims: [
      { id: 1, text: "Country X's parliament passed the emergency law on 12 March 2025.", type: "fact", importance: "high" },
      { id: 2, text: "The law allows detention without trial for up to 90 days.", type: "fact", importance: "high" },
      { id: 3, text: "Over 40,000 people were affected in the first month.", type: "statistic", importance: "medium" }
    ],
    additionalCheckable: 1
  },
  // Per-claim evidence. Keyed by a distinctive fragment of the claim text so the
  // demo shows three DIFFERENT outcomes — supported, contradicted, unverifiable —
  // rather than repeating one canned block under every claim. The three together
  // exercise every branch the report UI can render.
  evidence: {
    "12 march": {
      verdict: "supported",
      confidence: "high",
      evidence: [
        {
          url: "https://example.org/official-gazette-2025-14",
          title: "Official Gazette — Law 2025/14",
          publisher: "Government of Country X (primary source)",
          quote: "Law 2025/14 entered into force on 12 March 2025.",
          stance: "support"
        },
        {
          url: "https://example.org/wire-parliament-vote",
          title: "Parliament passes emergency law in late-night vote",
          publisher: "Wire service",
          quote: "The chamber approved the measure on 12 March by 211 votes to 96.",
          stance: "support"
        }
      ],
      notes: "Demo data: the date is confirmed by the official gazette and an independent wire report; the two agree."
    },
    "90 days": {
      verdict: "contradicted",
      confidence: "medium",
      evidence: [
        {
          url: "https://example.org/legal-analysis",
          title: "Analysis of Law 2025/14 provisions",
          publisher: "University Law Review",
          quote: "The 90-day figure appears only in early drafts; the enacted text caps detention at 30 days pending judicial review.",
          stance: "contradict"
        },
        {
          url: "https://example.org/official-gazette-2025-14",
          title: "Official Gazette — Law 2025/14, Article 7",
          publisher: "Government of Country X (primary source)",
          quote: "Detention under this Article shall not exceed thirty (30) days without review.",
          stance: "contradict"
        }
      ],
      notes: "Demo data: the enacted text says 30 days, not 90 — the answer appears to be quoting a superseded draft."
    },
    "40,000": {
      verdict: "unverifiable",
      confidence: "low",
      evidence: [
        {
          url: "https://global-security-observatory.org/is-x-a-threat",
          title: "Is the law a threat to human rights?",
          publisher: "Global Security Observatory",
          quote: "More than 40,000 people were affected in the first month alone.",
          stance: "support"
        }
      ],
      notes: "Demo data: the 40,000 figure traces back to a single flagged source and no independent statistics body publishes a comparable count."
    }
  },
  bias: {
    oneSided: true,
    framingIssues: [
      "Presents the contested detention figure as settled fact.",
      "Uses emotive framing ('crackdown') without attribution."
    ],
    missingContext: [
      "No mention of the parliamentary vote count or which parties supported the law.",
      "No alternative casualty/displacement estimates are acknowledged."
    ],
    strongestCounterargument: "Government sources state the law contains judicial review clauses that limit detention to 30 days pending review.",
    manipulationSignals: ["A cited source is an unregistered 'observatory' site with no named authors."]
  },
  sources: {
    profiles: [
      {
        url: "https://example.org/report",
        publisher: "Example Policy Observatory",
        likelyFunding: "Unclear — no funding disclosure found",
        stance: "Strongly aligned with one side of the dispute",
        credibility: "low",
        note: "No named authors; headline mimics a chatbot question."
      }
    ]
  },
  summary: {
    summary: "Demo report: the core event is supported by primary sources, but one key figure is disputed and the answer relies partly on an unregistered advocacy site.",
    readerAdvice: "Read the official gazette link first, then compare the two independent estimates of people affected."
  }
};

export function createMockProvider() {
  const name = "mock";
  const supportsSearch = false;

  // The evidence step asks about one claim at a time, so the mock reads the claim
  // out of the prompt and answers that claim specifically.
  function evidenceFor(user) {
    const claim = (String(user || "").match(/CLAIM TO VERIFY: "([^"]*)"/) || [])[1] || "";
    const key = Object.keys(CANNED.evidence).find((k) => claim.toLowerCase().includes(k));
    return key ? CANNED.evidence[key] : {
      verdict: "unverifiable",
      confidence: "low",
      evidence: [],
      notes: "Demo data: no canned evidence for this claim."
    };
  }

  async function complete({ task = "", user = "" }) {
    await sleep(250);
    const payload = task === "evidence" ? evidenceFor(user) : CANNED[task] || { error: `mock: unknown task "${task}"` };
    return { text: JSON.stringify(payload), meta: { model: "mock" } };
  }
  return { name, supportsSearch, complete };
}
