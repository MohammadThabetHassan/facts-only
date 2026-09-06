# Changelog

All notable changes to FactLens are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/) and the project
versions follow [SemVer](https://semver.org/).

## [0.3.0] — 2026-09-06

### Added
- **Quote verification**: evidence quotes are matched against the fetched page text
  and every quote gets a status chip — "quote verified on page", "quote partially
  found", "quote NOT found on page", or "page not fetched — quote unchecked".
- **Second-model cross-check**: optionally route the checked claims to a second,
  different AI provider and let it challenge the first review; agreements,
  disagreements, and missed context are reported. Disagreements never silently
  change the code-computed trust signal.
- **Weighted trust signal**: the deterministic trust computation now weights claims
  by confidence, and every report exposes the weighted support score, the verdict
  counts, and the decision basis lines ("how the trust signal was computed").
- **Coverage transparency**: reports disclose how many of the estimated checkable
  claims were examined ("3 of ~4") and whether live web search was used.
- **Cancellation**: long verification runs can be cancelled mid-flight from the
  panel or web app; user aborts are never retried by the retry layer.
- **Result cache**: identical answer + settings render instantly from cache with a
  "re-run fresh" escape hatch; cache is settings-fingerprinted and capped.
- **URL extraction for pasted text**: links pasted inside answers (markdown or bare
  URLs) are automatically picked up as sources in the panel and web app.
- **Copy report** to clipboard, alongside Markdown export.
- **Dark mode** following the system theme, plus a dedicated transparency ("Method:")
  line in every report.
- **Developer tooling**: `scripts/dev-server.py` (correct JS MIME on Windows,
  no-store caching) for manual testing of the webapp/panel.

### Fixed
- The web app's side-panel page failed to load entirely in the browser (a wrong
  relative import path broke the module graph since 0.1.0 — caught by real-browser
  E2E testing, not by offline tests).
- Report rendering crashed on string children in the DOM builder
  (`appendChild` type error), which made every report fail after the summary.
- The context-menu flow did not open the side panel on current Chrome: the
  `sidePanel.open()` call happened after an awaited storage write, expiring the
  user-gesture context. The panel now opens first and the job is queued after.
- Confidence weighting had normalized itself away (supported/low scored identically
  to supported/high); the weighted score now uses the claim count as denominator.

## [0.2.0] — 2026-09-06

### Added
- Multilingual manipulation heuristics: Arabic, French and Spanish question-shaped
  headlines, Arabic "think tank / observatory" naming patterns (معهد، مرصد، مؤسسة،
  منتدى), and Arabic sponsored-content markers.
- Automatic retry with exponential backoff (and `Retry-After` support) on
  rate-limit (429) and transient server errors from AI providers.
- Prompt-injection hardening: fetched page excerpts and analyzed answers are
  explicitly treated as untrusted data in every model prompt.
- Extension icons (16/32/48/128 px).
- Open-source scaffolding: MIT LICENSE, CI workflow (GitHub Actions),
  contributing guide, code of conduct, security policy, issue and PR templates.
- Docs: `docs/ARCHITECTURE.md` and `docs/THREAT-MODEL.md`.

### Changed
- Established-publisher list is now explicitly cross-partisan (wire services,
  UN bodies, courts, academic venues, and established newspapers from different
  regions and editorial lines).

## [0.1.0] — 2026-09-06

### Added
- Manifest V3 browser extension: verify selected text anywhere, one-click
  verification buttons on ChatGPT, Gemini, Claude and Perplexity, side-panel
  reports with history and Markdown export.
- Shared verification engine: claim extraction, independent search-grounded
  evidence hunt, GEO/content-farm source profiling, bias & framing analysis,
  deterministic trust signal.
- Providers: Gemini API (with Google Search grounding), OpenRouter,
  OpenAI-compatible endpoints, and an offline mock provider.
- Web app reusing the same engine (paste-text workflow).
- Offline smoke test suite (`node test/smoke.mjs`).
