# Verification log

What has been verified, by which evidence, and what remains. This file is updated
with each release so contributors and users can trust claims instead of assertions.

Last updated: 2026-09-06 (v0.3.0, commit `d18cc8e`)

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

Three real defects were found by these E2E passes and fixed (a broken webapp
module graph, a report-renderer crash on string children, and `sidePanel.open()`
losing the user-gesture context after awaited storage writes) — see CHANGELOG 0.3.0.

## 3. Live network validation — PARTIAL (by design, no credentials in CI)

- **Google API reachability + protocol:** verified with a real HTTPS call using an
  intentionally invalid key. Google's server accepted the request shape and
  returned the structured `API key not valid` (400/INVALID_ARGUMENT) error, which
  the provider surfaces cleanly in ~1.1 s without retrying. This proves endpoint,
  request shape, and error handling against the live API.
- **Successful grounded generation:** NOT yet verified — requires a real key.
  `node scripts/live-check.mjs` (key via environment variable) runs the full
  pipeline live with sanity gates: grounding must be used, evidence links must be
  returned, verdicts must not all be `unverifiable`. Cost: ~5 free-tier calls.

## 4. Explicitly not verified / known gaps

- One live successful Gemini generation (blocked on a user-provided free key —
  see section 3).
- Content-script Verify-button injection on the four chatbot sites was
  implemented against their DOM structure at time of writing but not exercised
  logged-in in this session; the right-click and paste flows cover the same
  pipeline without it. Selector drift on those sites is the most likely future
  breakage (one-line fixes — see CONTRIBUTING).
- Independent human review. All passing evidence to date was produced by the
  project author; the test suite is intentionally offline and deterministic so
  any reviewer can reproduce it in seconds.
