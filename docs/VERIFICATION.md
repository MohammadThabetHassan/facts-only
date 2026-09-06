# Verification log

What has been verified, by which evidence, and what remains. This file is updated
with each release so contributors and users can trust claims instead of assertions.

Last updated: 2026-09-06 (v0.4.0, commit `69cf59d` + detector drift fix)

## 1. Offline test suite — PASSING (73 checks)

Command: `node test/smoke.mjs` (no key, no network; CI runs it on every PR).

Covers: text/JSON utilities · URL extraction (markdown + bare + dedupe) · GEO
heuristics (English, Arabic, question-headlines, think-tank naming, cross-partisan
established list) · quote-vs-page verification statuses · HTTP retry (429 with
`Retry-After`, non-retryable 400, pre-aborted signal, mid-flight user abort not
retried) · deterministic trust-signal contract (weighting, decision order, basis
lines) · result cache (fingerprint, eviction) · provider response parsing
(Gemini parts/grounding, JSON-mime fallback retry, OpenRouter shape, missing-key
error quality) · full pipeline on the mock provider (claims, verdicts, quote
statuses, source flags, bias, second-opinion degradation, method metadata) ·
cancellation.

## 2. Real-browser E2E — PASSING (2026-09-06)

Executed in the ZCode in-app browser and in a real Chrome instance (temporary
profile), driving the actual UI rather than unit shims:

| Flow | Result |
| --- | --- |
| Web app: settings render (all providers, second-opinion select), demo run produces full report | PASS (screenshot `docs/screenshots/webapp-demo-report.png`) |
| Panel page: demo + paste flow, history recording, cache bar with "Re-run fresh" | PASS (screenshot `docs/screenshots/panel-demo-report.png`) |
| Cache: second identical run loads from cache with note; fresh run bypasses | PASS |
| Cancel: mid-run cancel stops the pipeline, shows "Verification cancelled", re-enables the button, saves nothing | PASS |
| **Real extension:** Developer mode → Load unpacked → card loads with icon, v0.3.0, no errors | PASS |
| **Real extension:** toolbar popup settings → provider switch → save | PASS |
| **Real extension:** select text on example.com → context menu "FactLens: verify selected text" → side panel auto-opens with the selection queued → pipeline runs → report renders | PASS |
| **Real extension, real chatbot:** ask a question on chatgpt.com logged out → "🔍 FactLens — verify this answer" button injects under the response → click → side panel opens with the real answer → report renders ("from chatgpt.com") | PASS |

### Selector drift caught and fixed (2026-09-06)

The logged-out ChatGPT DOM (2026 redesign) no longer uses
`data-message-author-role="assistant"`; it uses hashed CSS-module classes
(`wUdOQ_assistantMessage`). The detector now matches the stable suffix —
`[class*="assistantMessage"]:not([class*="Actions"])` — alongside the original
logged-in selector. Found during live E2E, fixed, and re-verified in the same
session. This is exactly the drift class CONTRIBUTING.md asks contributors to
watch: one selector line, fixed within minutes of detection.

Three real defects were found by these E2E passes and fixed (a broken webapp
module graph, a report-renderer crash on string children, and `sidePanel.open()`
losing the user-gesture context after awaited storage writes) — see CHANGELOG 0.3.0.

## 3. Live network validation — PASSING (2026-09-06, v0.4.0)

- **Live generation pass:** executed with a real free-tier Gemini key
  (`scripts/live-check.mjs`, key via environment variable, never stored).
  `gemini-2.5-flash` with Google Search grounding ran the full pipeline on a
  test answer: 2 claims extracted and checked, both **supported/high** with
  evidence from primary sources (science.nasa.gov, stsci.edu, esa.int — all
  badged "Established publisher"), trust signal **Well supported** (score 1.00),
  39 s elapsed. Sanity gates passed: grounding used, evidence links returned,
  not all unverifiable.
- **Quote statuses on the live run:** 0 verified / 4 not-found / rest
  page-not-fetched — honest reporting of the known limitation (many official
  pages are JS-heavy or block automated fetching); the chips surface this to
  the reader instead of silently trusting the quotes.

Last updated: 2026-09-06 (v0.4.0 + live pass, see section 3)

## 4. Explicitly not verified / known gaps

- ~~One live successful Gemini generation~~ — **done 2026-09-06** (see section 3).
- Content-script Verify-button injection was exercised live only on
  **logged-out chatgpt.com** (where selector drift was caught and fixed).
  Gemini/Claude/Perplexity require login and were not exercised end-to-end;
  the right-click and paste flows cover the same pipeline without the detector.
  Selector drift on those sites remains the most likely future breakage
  (one-line fixes — see CONTRIBUTING).
- Independent human review. All passing evidence to date was produced by the
  project author; the test suite is intentionally offline and deterministic so
  any reviewer can reproduce it in seconds.
