// Mock provider: returns canned results so the full pipeline and UI can be
// exercised offline (no API key). Also used by the "Try a demo" button.

import { sleep } from "../http.js";

const CANNED = {
  claims: {
    claims: [
      { id: 1, text: "Country X's parliament passed the emergency law on 12 March 2025.", type: "fact", importance: "high" },
      { id: 2, text: "The law allows detention without trial for up to 90 days.", type: "fact", importance: "high" },
      { id: 3, text: "Over 40,000 people were affected in the first month.", type: "statistic", importance: "medium" }
    ]
  },
  evidence: {
    verdict: "mixed",
    confidence: "medium",
    evidence: [
      {
        url: "https://example.org/official-gazette",
        title: "Official Gazette — Law 2025/14",
        publisher: "Government of Country X",
        quote: "The law entered into force on 12 March 2025.",
        stance: "support"
      },
      {
        url: "https://example.org/legal-analysis",
        title: "Analysis of Law 2025/14 provisions",
        publisher: "University Law Review",
        quote: "The 90-day detention figure appears only in early drafts.",
        stance: "contradict"
      }
    ],
    notes: "Demo data: the core event checks out; one supporting figure is disputed."
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

  async function complete({ task = "" }) {
    await sleep(250);
    const payload = CANNED[task] || { error: `mock: unknown task "${task}"` };
    return { text: JSON.stringify(payload), meta: { model: "mock" } };
  }

  return { name, supportsSearch, complete };
}
