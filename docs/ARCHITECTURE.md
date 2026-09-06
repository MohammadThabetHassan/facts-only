# Architecture

FactLens is deliberately simple: **vanilla ES modules, zero dependencies, no build
step**. One engine, three frontends.

## Module map

```
                    ┌────────────────────────────────────────────┐
                    │                 engine/                    │
                    │                                            │
  extension/panel ──┤  pipeline.js ─── orchestration, progress,  │── webapp/
  (side panel)      │                  trust-signal computation  │   (paste text)
                    │     │                                      │
  extension/popup ──┤     ├─ steps/claims.js      claim split    │
  (settings)        │     ├─ steps/evidence.js     evidence hunt  │
                    │     ├─ sourceProfiler.js     flags+profiles │
                    │     ├─ steps/bias.js         framing        │
                    │     ├─ steps/report.js       summary text   │
                    │     └─ providers/            gemini ·       │
                    │       openrouter · openai-compat · mock     │
                    │  ui/  storage · settings-ui · report-view   │
                    └────────────────────────────────────────────┘
```

- **Engine** (`extension/engine/`) is DOM-free and dependency-free, so it runs
  unchanged in the extension side panel, the extension popup, the web app, and
  Node (tests). It never touches `chrome.*`.
- **UI layers** own persistence (via `ui/storage.js`, which adapts
  `chrome.storage.local` vs `localStorage`) and rendering (`ui/report-view.js`
  is shared by panel and webapp).
- **Chrome glue** (`background.js`, `content/detector.js`) only routes jobs and
  extracts answers; all verification logic lives in the engine.

## Data flow

```
verifyAnswer({text, sources, page}, settings, {provider, onProgress, signal})
  1. extractClaims()      → N ≤ maxClaims discrete claims (+ "additionalCheckable"
                            estimate so reports can disclose coverage)
  2. verifyClaim() ×N     → per-claim verdict + evidence links
                            (2 workers, 400 ms spacing: free-tier friendly)
  3. profileSources()     → fetch each unique URL (10 s timeout),
                            heuristic flags, batched LLM publisher profile,
                            page excerpts retained for quote verification
  3b. verifyQuoteInPage() → per evidence quote: verified / partial /
                            not-found / page-not-fetched
  4. analyzeBias()        → framing/missing-context/counterargument
  5. runSecondOpinion()   → optional second-model cross-check (disagreements
                            displayed, never folded into the trust signal)
  6. writeSummary()       → 2–3 sentence neutral summary
  ⇒ report {trustKey ← computeTrustSignal(), trustScore, trustCounts,
            trustBasis, claims, sources, bias, secondOpinion,
            method {searchUsed, quotesVerified, coverage…}}
```

Cancellation: an external `AbortSignal` is threaded through every provider call
and fetch; the pipeline re-checks it at each step boundary (`guard()`). Aborts are
never retried by the HTTP layer.

## Design decisions

### The trust signal is computed in code
`computeTrustSignal()` in `pipeline.js` derives the headline verdict
(*well-supported / mixed / one-sided / contradicted / manipulated-sources /
unverifiable*) deterministically from per-claim verdicts, confidence-weighted into
a support score (denominator = claim count, so low confidence drags a claim toward
neutral instead of being normalized away), plus source manipulation flags and the
bias step. The decision order is a documented contract:

1. contradicted with no/weak support → **contradicted**
2. manipulation flags with score < 0.85 → **manipulated-sources**
3. remaining contradiction with score < 0.6 → **contradicted**
4. manipulation flags → **manipulated-sources**
5. remaining contradiction → **mixed**
6. one-sided framing with score < 0.7 → **one-sided**
7. everything unverifiable → **unverifiable**
8. score ≥ 0.75 → **well-supported**, else **mixed**

The model only writes the prose around this. Every report ships the inputs
(`trustScore`, `trustCounts`, `trustBasis`) so readers can audit the decision.

### Quote verification closes the citation loop
Evidence quotes are checked against the fetched page text (`verifyQuoteInPage`,
normalized: case/quote-marks/whitespace). Statuses: `verified`, `partial`
(first 12 words found), `not-found`, `page-not-fetched`, `none`. "not-found" is
displayed as a warning chip, never as proof of fabrication — the quote may sit
below the extracted excerpt or behind JS/paywall. The method line aggregates the
counts so a report whose evidence is mostly "not found" visibly hangs by a thread.

### Independent evidence, not the answer's own sources
The evidence step is prompted to search for **both** supporting and contradicting
primary sources and to ignore the answer's citations. Reusing the answer's
sources would make the check inherit exactly the bias it is supposed to detect.

### Heuristics in code, profiles in AI
Source red flags (question-shaped headlines, missing authors, think-tank naming,
sponsored markers) are deterministic regex heuristics with tests — cheap,
auditable, and impossible to gaslight. The AI layer adds context (funding,
stance) that regexes cannot, and is allowed to fail without breaking the report.

### Graceful degradation everywhere
Every step catches its own failures: a claim whose evidence call fails becomes
`unverifiable`, an unfetchable page is profiled from link text, a failed bias
step yields an empty section — the report always completes.

### Providers are interchangeable
A provider is `{ name, supportsSearch, complete({system, user, json, search,
task, temperature}) }`. `supportsSearch=false` providers (OpenRouter free
models) automatically get reduced prompts and clearly lower evidence quality —
stated in the settings UI, never hidden. `task` lets the mock provider and
future local providers route per-step behavior.

### Cross-model second opinion (anti-monoculture)
A single model verifying itself is a structural weakness, so the pipeline can send
the first review's claim verdicts to a **second, different provider** and instruct
it to find what the first review missed (`runSecondOpinion`). Agreements and
disagreements are displayed per claim. The second opinion **never** modifies the
trust signal — that stays deterministic from the primary evidence — and a failing
second provider degrades to a note in the report.

### Untrusted input discipline
Anything that reached the model from outside (the answer, cited page excerpts)
is framed as data with an explicit SECURITY instruction to ignore embedded
directives. See `docs/THREAT-MODEL.md` for the reasoning and residual risks.

### Caching lives above the engine
`engine/ui/cache.js` keys reports by answer hash + settings fingerprint (provider,
models, grounding, maxClaims, second provider), so changed settings re-run. The
panel/webapp own cache reads/writes; the engine stays pure and the cache module
accepts an injected storage for tests.

## Testing strategy

`test/smoke.mjs` runs fully offline: unit checks (text/JSON/flags), multilingual
heuristic checks (positive + negative), a fetch-mock retry test, and the entire
pipeline against the mock provider. CI runs it plus syntax checks on every PR.
Live-model behavior is intentionally out of CI scope (needs keys).

## Extending

- **New heuristic** → `sourceProfiler.js` + positive/negative test. Required.
- **New provider** → follow `providers/openai-compat.js`; register in
  `providers/index.js` and `ui/settings-ui.js`.
- **New frontend** → import the engine; you get the whole pipeline.
