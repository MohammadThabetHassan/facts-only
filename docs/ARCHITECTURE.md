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
verifyAnswer({text, sources, page}, settings, {provider, onProgress})
  1. extractClaims()      → N ≤ maxClaims discrete claims
  2. verifyClaim() ×N     → per-claim verdict + evidence links
                            (2 workers, 400 ms spacing: free-tier friendly)
  3. profileSources()     → fetch each unique URL (10 s timeout),
                            heuristic flags, batched LLM publisher profile
  4. analyzeBias()        → framing/missing-context/counterargument
  5. writeSummary()       → 2–3 sentence neutral summary
  ⇒ report {trustKey ← computed in code, claims, sources, bias, summary}
```

## Design decisions

### The trust signal is computed in code
`computeTrustSignal()` in `pipeline.js` derives the headline verdict
(*well-supported / mixed / one-sided / contradicted / manipulated-sources /
unverifiable*) deterministically from per-claim verdicts and source flags. The
model only writes the prose around it. Rationale: an influenced model must not
be able to award itself a friendly verdict.

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

### Untrusted input discipline
Anything that reached the model from outside (the answer, cited page excerpts)
is framed as data with an explicit SECURITY instruction to ignore embedded
directives. See `docs/THREAT-MODEL.md` for the reasoning and residual risks.

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
