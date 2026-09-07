# Verification log

What has been verified, by which evidence, and what remains. This file is updated
with each release so contributors and users can trust claims instead of assertions.

Last updated: 2026-09-07 (v1.2.0 — held-out evaluation split + paid-disclosure fix)

## 1. Offline test suite — PASSING (165 checks)

Command: `node test/smoke.mjs` (no key, no network; CI runs it on every PR).

Covers: text/JSON utilities · URL extraction (markdown + bare + dedupe) · GEO
heuristics (English, Arabic, question-headlines, think-tank naming, cross-partisan
established list) · quote-vs-page verification statuses · HTTP retry (429 with
`Retry-After`, non-retryable 400, pre-aborted signal, mid-flight user abort not
retried) · deterministic trust-signal contract (weighting, decision order, basis
lines) · result cache (fingerprint, eviction) · provider response parsing
(Gemini parts/grounding, JSON-mime fallback retry, OpenRouter shape, missing-key
error quality) · the SSRF guard on model-supplied URLs (loopback, RFC1918, cloud
metadata, encoded IP literals, bare intranet names, non-http schemes) and the
high-risk flag raised for a refused citation · the plain-language risk summary
(level ranking worst-first, offender selection, reason ordering, empty input) and
complete plain wording for every flag and risk level in both locales · full pipeline on the mock provider (claims, verdicts, quote
statuses, source flags, bias, second-opinion degradation, method metadata) ·
cancellation · paid-disclosure shape (an investigation into paid placement, an
explainer defining the term, and a bare "Sponsored" ad-slot label must all stay
clean, while a leading disclosure label is still caught) · page-voice attribution
(an article quoting the AI tell-tale phrase to explain it is not flagged as AI
filler; the same phrase unquoted still is) · article extraction (nav, ad rails
and footers dropped before any detector reads the page; an in-article disclosure
still caught; fallback to the whole page when no article is identifiable) ·
the unread verdict (a recognised publisher whose page could not be opened is
reported as "we could not open the pages", never as an all-clear).

## 2. Real-browser E2E — PASSING (2026-09-06)

Executed in the ZCode in-app browser and in a real Chrome instance (temporary
profile), driving the actual UI rather than unit shims:

| Flow | Result |
| --- | --- |
| Web app: settings render (all providers, second-opinion select), demo run produces full report | PASS (screenshot `docs/screenshots/webapp-report.png`) |
| Panel page: demo + paste flow, history recording, cache bar with "Re-run fresh" | PASS (screenshot `docs/screenshots/panel-report.png`) |
| Cache: second identical run loads from cache with note; fresh run bypasses | PASS |
| Cancel: mid-run cancel stops the pipeline, shows "Verification cancelled", re-enables the button, saves nothing | PASS |
| **Real extension:** Developer mode → Load unpacked → card loads with icon, v0.3.0, no errors | PASS |
| **Real extension:** toolbar popup settings → provider switch → save | PASS |
| **Real extension:** select text on example.com → context menu "Facts Only: verify selected text" → side panel auto-opens with the selection queued → pipeline runs → report renders | PASS |
| **Real extension, real chatbot:** ask a question on chatgpt.com logged out → "🔍 Facts Only — verify this answer" button injects under the response → click → side panel opens with the real answer → report renders ("from chatgpt.com") | PASS |
| **Firefox (155):** build-firefox.py → Load Temporary Add-on → sidebar panel renders → demo run completes with full report ("Manipulated sources detected") | PASS |

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

## 3. Live network validation — PASSING (2026-09-06)

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

Last updated: 2026-09-06 (v1.0.0 + live pass, see section 3)

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

## 5. Detector accuracy — MEASURED (2026-09-06)

The claim "it detects manipulation" was, until this release, an assertion. It is
now a measurement that runs on every commit: `npm run eval`, offline and
deterministic against `eval/corpus.json` (111 real publishers, real Wayback
histories collected by `eval/collect.mjs`).

| | before | after |
| --- | --- | --- |
| Legitimate publishers accused, held-out half | 40 / 40 (100%) | **0 / 40 (0%)** |
| Legitimate publishers accused, whole corpus | 111 / 111 (100%) | **0 / 111 (0%)** |
| Adversary rungs detected below the ceiling | 1 / 8 (12.5%) | **8 / 8 (100%)** |

109 of the 111 publishers are **not** on any allowlist in this repository, and
each is scored as though it had published the exact headline shape the detector
hunts for — a harder test than reality. 22 of them are real research institutions
whose names deliberately trip the "self-described think tank" heuristic; all 22
score clean. One outlet (an alias hostname with no archive record at all) draws a
caution; it is documented rather than curated away.

Five thresholds gate CI, including "no legitimate publisher is accused of
placement". Full method, corpus criteria, adversary ladder and the documented
ceiling: [EVALUATION.md](EVALUATION.md).

**Not claimed:** recall against real influence campaigns. Naming real domains as
influence operations on the strength of a heuristic is precisely what this tool
refuses to do, so the negative class is synthetic and labelled as such.

## 6. Still verified only by hand

- **The extension origin.** Everything the automated E2E suite drives is served
  over HTTP. Extension pages run under the Manifest V3 content security policy,
  which is stricter. `test/e2e.mjs` contains the check and will run it wherever
  the browser cooperates. It cannot run on the development machine, and the
  reason is now specific rather than "some builds": **Chrome removed the
  `--load-extension` switch outright** (~M137). Chrome 152 here ignores it in
  headed and headless mode alike, and the
  `--disable-features=DisableLoadExtensionCommandLineSwitch` escape hatch is gone
  too — a CDP probe against a freshly launched Chrome 152 saw only the two
  built-in component extensions and no `chrome-extension://` origin of ours. The
  suite reports **SKIP** rather than passing, because a check that cannot run is
  not a check that passed.

  Two of the three claims below are nonetheless pinned without a browser:
  `manifest.json` declares **no** `host_permissions` and lists `<all_urls>` only
  under `optional_host_permissions`, so the install prompt cannot ask for all
  sites; and the offline suite asserts that a run with `fetchSources: false`
  reports "could not check" rather than clean. What genuinely needs a human is
  the middle claim — that the runtime `chrome.permissions.request()` prompt
  actually appears on the click that needs it.

  Until it runs somewhere, this is a manual step before any release:
  `chrome://extensions` → Developer mode → Load unpacked → `extension/`, then
  confirm (a) the install prompt does **not** request access to all sites,
  (b) the first check prompts for host access, and (c) denying it yields
  "we could not check who is behind these sources" rather than a crash or a
  false all-clear.

- **A live API run against the current code.** `scripts/live-check.mjs` exists
  and has passed against an earlier revision; it has not been re-run since the
  placement-scoring rewrite. It needs a key, which is the user's to supply.
