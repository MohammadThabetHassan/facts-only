# Changelog

All notable changes to Facts Only are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/) and the project
versions follow [SemVer](https://semver.org/).

## [1.0.0] — 2026-09-06

Renamed from **FactLens** to **Facts Only**, and re-pointed at the question the project
was always really about: not "is this true?" but **"is this in my answer because someone
paid for it to be?"**

### Added — plain-language risk card

The source flags were accurate and unreadable. "Headline mimics a chatbot question (GEO
pattern)" is precise, sits at the bottom of the report, and tells a normal reader
nothing. A reader who has just been handed a planted source should not need to know what
GEO stands for to find that out.

- New `engine/explain.js`: `summarizeRisk()` turns the flag set into one sentence, ranked
  worst-first — **paid** > **planted** > **opaque** > **clean** — so explicit paid
  content is never softened into "an unnamed publisher". Pure, no DOM, no i18n, fully
  tested.
- The result renders as the **first thing in the report**, above the trust banner: a
  headline, one paragraph of explanation, the flagged site named and linked, and its
  reasons underneath it. Computed in code from the same flags shown further down, so —
  like the trust signal — the model under review cannot soften its own verdict.
- Every source flag now renders as a plain sentence ("This is paid content", "Written to
  be quoted by an AI", "Nobody put their name on it"), with the precise engine wording
  moved into a collapsed "Technical detail". Flags are translatable for the first time;
  full English and Arabic wording, enforced by a test that fails if any flag or risk
  level is missing plain wording in either locale.
- The Markdown export leads with the same warning, because an exported report is usually
  read by someone who never opened the tool.
- Plainer trust labels: "Manipulated sources detected" is now "Sources look planted or
  paid"; "Largely unverifiable" is now "Could not be checked".

### Security
- **SSRF guard on model-supplied URLs.** Evidence URLs come from an LLM whose input
  includes untrusted web pages, and the extension fetches them from a privileged
  `<all_urls>` context with no CORS — i.e. from inside the user's network, with the
  response body then fed back into the next prompt. Every URL now passes
  `isPublicHttpUrl()` first: `http(s)` with a dotted DNS hostname only. Loopback,
  `.local`/`.internal`/`.lan`, bare intranet names, credentials-in-URL and all IP
  literals (including decimal/hex/IPv4-mapped encodings) are refused, never fetched,
  and never sent to the Wayback API or the model. A refused citation is surfaced as a
  **high-risk** source flag rather than dropped. See THREAT-MODEL.md §6.
- **API key moved out of the request URL.** The Gemini key travelled as a `?key=`
  query parameter, which lands in browser history, devtools, and proxy logs; it is
  now sent in the `x-goog-api-key` header.

### Fixed
- **Second-model cross-check failed on chatty models.** It was the one step parsing
  the model's JSON with a raw `JSON.parse` over a `indexOf("{")`…`lastIndexOf("}")`
  slice instead of the shared `extractJson()`. That slice breaks whenever the model
  adds prose containing a brace after the JSON, or emits a second object — and the
  whole cross-check was then reported as "failed" rather than rendered. Now uses
  `extractJson()` like every other step. (Code fences alone were already handled by
  both, so this was chatty-model output, not fenced output.)
- **Web app cache was disabled after its first hit.** The `lastRunWasCached` latch
  was set on a cache hit and never cleared, so every subsequent Verify press forced
  a fresh run for the rest of the session.
- **Cached reports rendered with fewer features than fresh ones** — they lost the
  language setting and the Copy button.
- **Page direction depended on a storage-read race.** `renderSettings()` is an async
  component that set `dir` on `<html>` from its own reading of the stored language when
  it finished. The host page sets direction too, from its own resolved language, so
  whichever finished last won — an Arabic panel could silently render left-to-right.
  Direction now belongs to the page; the settings form only applies it when the user
  actually changes the language dropdown.
- The accent bar on the risk card used `border-left`, which sat on the wrong edge in
  Arabic. Now `border-inline-start`.
- **Arabic reports reordered the verdict counts.** "1 supported · 0 mixed" was built
  as one string, so bidi reordering detached each Latin digit from its Arabic label.
  Each count is now a bidi-isolated `<bdi>` node.
- **Confidence and claim-type chips were never translated** — an Arabic report showed
  "ثقة HIGH" and "FACT". Both now have `conf.*` and `type.*` locale keys.
- OpenRouter's free-model catalog lookup used a bare `fetch()` with no timeout and
  no abort signal, so it could hang a run and ignored Cancel.
- Removed a dead `postJson` import and de-duplicated the domain-age flag logic,
  which existed both inside `computeFlags` and in the exported `domainAgeFlags`.

### Added
- `scripts/capture-screenshots.py` — regenerates `docs/screenshots/` from the live
  UI with headless Chrome at 2x, cropping to card boundaries. Documentation images
  are now a build artifact instead of a manual chore that silently goes stale.
- Web app URL parameters: `?demo=1` runs the sample report on load, `?lang=ar`
  overrides the UI language, `?shot=1` is the capture view.
- `docs/logo.svg` — vector twin of the shipped extension icon.
- npm scripts (`test`, `dev`, `build:firefox`, `package`, `live`) and full package
  metadata.

### Changed
- The demo now produces **three distinct outcomes** — supported, contradicted and
  unverifiable, with different evidence for each — instead of repeating one canned
  block under every claim, which made the sample report look broken.
- Offline suite grown from 91 to **113 checks** (SSRF guard and refused-citation
  behaviour).
- CSS custom properties and class names, storage keys, and message types moved from
  the `fl-`/`fl_` prefix to `fo-`/`fo_`.

## [0.5.0] — 2026-09-06

### Added
- **Firefox support**: `scripts/build-firefox.py` generates a Firefox-ready
  add-on (event-page background, `sidebar_action`, gecko id) from the same
  shared sources — verified end-to-end in Firefox 155 (load → sidebar panel →
  demo run → full report).
- **OpenRouter auto-free model selection**: set the model to `auto-free` and the
  provider discovers currently-available free models from the OpenRouter catalog,
  ranks them (generalist families first, specialized code/music/safety models
  skipped, larger context preferred), and falls back down the list when a model
  is unavailable or rate-limited. Verified live: picked `minimax/minimax-m3:free`
  and completed a full verification.
- **Domain-age detection via the Wayback Machine CDX API** (keyless): every
  non-established source domain is checked for its earliest archive snapshot.
  Domains first archived <90 days ago get a "domain-fresh" flag; domains with
  **no Wayback history at all** get an even stronger "domain-unarchived" flag —
  the fake-think-tank fingerprint. The first-archived month is shown in reports.
- **Live cross-model verification**: second-model cross-check verified end-to-end
  with two different AI families — Gemini 2.5 Flash (grounded primary) and an
  OpenRouter free model (independent reviewer) agreeing on all claims.
- `scripts/live-check.mjs` is now multi-provider (Gemini / OpenRouter / demo) and
  prints the second-opinion results.

### Improved
- Quote verification: larger page excerpts (12k chars) and an
  alphanumerics-only fallback match, reducing false "quote not found" flags.
- Report source cards now show the domain's first Wayback archive month.

## [0.4.0] — 2026-09-06

### Added
- **Arabic UI (RTL)**: the full interface — settings, panel, web app, report
  labels, verdict/stance/quote/trust chips — is now available in Arabic with
  proper right-to-left layout. Language setting: Auto (follows system), English,
  or العربية; `auto` follows the browser locale. Static UI strings are fully
  translated; model-generated report text and heuristic flag details remain
  English by design (documented in ARCHITECTURE.md).
- **Store-ready packaging**: `scripts/package-extension.py` zips the extension
  (31 files) into `dist/` for Chrome Web Store upload or manual distribution.
- 9 new i18n tests (locale parity, fallback, parameter formatting, RTL flags) —
  offline suite now at 82 checks.

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
  no-store caching) for manual testing of the webapp/panel, and
  `scripts/live-check.mjs` — a one-command real-API verification pass
  (key via environment variable, sanity-gated) to complement the offline suite.

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
