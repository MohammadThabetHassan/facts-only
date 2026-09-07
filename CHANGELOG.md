# Changelog

All notable changes to Facts Only are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/) and the project
versions follow [SemVer](https://semver.org/).

## [1.3.0] - 2026-09-07

### Added - margin analysis, and an uncomfortable result

0/111 stays true right up until a weight change pushes a real publisher one
point over, and an outcome-only gate cannot see that coming. The eval now
reports the distance between the legitimate population and the accusation line.

Headroom is **5 points** including `thedailystar.com.bd` — the documented
unarchived alias that carries +30 for having no Wayback record — and **35**
without it. Both are printed: quoting only the first blames the model for a
known input, quoting only the second is curating until the number flatters. A
gate holds the archived figure at ≥ 20.

The uncomfortable part: **the two populations overlap.** The weakest *detected*
adversary rung scores 24, below the worst legitimate publisher at 40. There is
no score at which placement and publisher cleanly separate — detection of the
top rungs relies on the warning threshold at 22, not on distance, and the only
reason no real outlet is accused is that accusation sits at 45 above both.

Stated plainly in `docs/EVALUATION.md` rather than left for a reader to derive:
the model separates well at the accusation threshold and poorly at the warning
threshold, so *elevated* means "look closer" and never a soft accusation.

### Added - the extension is now actually tested, not skipped

The one check that mattered most had never run. `test/e2e.mjs` reported SKIP for
the unpacked extension because Chrome removed the `--load-extension` switch
(~M137) — accepted and silently ignored, headed and headless alike, with the
`DisableLoadExtensionCommandLineSwitch` escape hatch also gone.

CDP's `Extensions.loadUnpacked` is the supported replacement and works headless.
The suite now loads the real extension, drives its own pages under the
`chrome-extension://` origin, and asks the **running** extension what
permissions it holds — still over a raw WebSocket rather than adding Puppeteer.

Observed on Chrome 152, not inferred from the manifest:
`contains({origins:['<all_urls>']})` is **false** at install, `host_permissions`
is **empty**, and the only granted origins are the six named chatbot hosts.
"We only ask for host access when you click" is now measured.

E2E goes from 15 checks with 1 skip to **23 checks with no skips**, and the
"verified only by hand" entry for the extension origin comes off
`docs/VERIFICATION.md`. The lint gate caught the dead `unpackedExtensionId`
helper the rewrite orphaned.

### Fixed - a known publisher is no longer an all-clear for an unread page

Found by driving the deployed web app, not by reading code. Two allowlisted
sources whose pages could not be fetched (HTTP 401 and CORS) produced a green
tick reading *"No paid-placement or influence-campaign patterns were detected in
the sources checked"* — when nothing had been fetched at all. The identical run
with non-allowlisted domains correctly said *"this is not an all-clear — it is a
failed check"*, so the allowlist was short-circuiting established domains past
the unknown state.

This reopened the hole that making `sponsored` decisive was meant to close. A
paid disclosure lives in the page, so if the page is never read the signal can
never fire, and the allowlist alone rendered a green tick: **a Reuters
advertorial URL reported as clean.**

Knowing who publishes a site and having read the article are different claims. A
source whose page was never opened can no longer contribute to an all-clear,
however well known it is, and archive history cannot stand in for reading the
page either. There is a new `unread` verdict — *"We know these publishers, but
we could not open the pages"* — in both locales. In the web app CORS makes this
the common outcome, which is the honest reason to prefer the extension.

One existing test asserted the old behaviour outright and was inverted
deliberately, with the reasoning recorded beside it.

### Fixed - page-text detectors read the whole page, not the article

The root cause under both page-text false positives. `excerpt` was the entire
page, so navigation, ad rails and promo footers arrived as one flat string and a
"Sponsored" label on someone else's ad slot read exactly like the article's own
words. Pages are now narrowed to the article first (`extractArticle`) — furniture
dropped, `<article>`/`<main>` preferred, falling back to the whole page when
nothing is identifiable so content is never silently discarded. Regex-based and
DOM-free on purpose: the engine runs unchanged in the extension, the web app and
Node.

This does work the disclosure-wording fix could not. A realistic page whose ad
rail reads "Paid post: our partner clinic leads the region" still defeats that
check on its own — the text genuinely leads its segment, it just is not the
article.

### Changed - the evaluation now exercises the page-text detectors

Corpus rows were built with `excerpt: ""`, so `sponsored` and
`ai-generated-text` contributed nothing to 0/111 — the number covered less than
it appeared to, which is exactly why a decisive false-accusation bug survived in
it. Every outlet now gets a full HTML page routed through the real extraction
path, in the shapes that actually caused false positives: ad furniture around
clean reporting, an investigation into paid placement, and an explainer quoting
the AI phrase. 56 of 111 rows carry paid-content bait, 28 quote the AI phrase.

A CI gate fails if that coverage is ever removed again, negative-tested by
reverting the corpus to empty excerpts and confirming the gate blocks it.

Held-out numbers are unchanged under the harder corpus: 0/40 accused, 0/111
overall, 8/8 rungs. Offline checks 157 -> 165.

## [1.2.0] - 2026-09-07

### Changed - the evaluation now reports a held-out number

SIGNAL_WEIGHTS was hand-set while looking at the 111-publisher corpus, which
means a number measured on all of it was a fit, not a measurement. A reviewer
would have been right to say so.

The corpus is now split by a stable hash of the domain name - not by shuffling,
not by index, so the split cannot drift toward whichever half flatters the
result - and the **held-out half carries the headline**:

|                | publishers | accused |
| -------------- | ---------- | ------- |
| tuning         | 71         | 0       |
| **held out**   | **40**     | **0**   |
| whole corpus   | 111        | 0       |

No tuning/held-out gap. The tuning row stays printed in the output so a future
gap is visible rather than found by someone else, and the discipline is written
down: weights may be informed by the tuning half, and a worse held-out number
gets published worse.

### Added - reproducible packages and an SBOM

Releases now carry a Chrome package, a Firefox package and a CycloneDX 1.5 SBOM,
with `SHA256SUMS`, built by `.github/workflows/release.yml` on a `v*` tag.

Both archives are written with sorted entries and a fixed timestamp, so the same
source produces byte-identical files and a published checksum is something a
reader can reproduce rather than trust. The release workflow builds twice and
diffs the hashes before publishing, so that claim is enforced and not just
stated.

`sbom.cdx.json` is committed and gated in CI (`npm run sbom:check`), because a
stale integrity manifest is worse than none. Its most useful claim is negative -
**zero runtime dependencies** - with the dev toolchain listed at CycloneDX scope
`excluded`. It also records a SHA-256 for each of the 36 shipped files, so a
downloaded package can be checked file by file.

Getting to genuinely reproducible took three fixes, and only the release itself
exposed the last two. Comparing a Windows rebuild against the archive GitHub
built on Linux showed the file contents were already byte-identical while the
archives were not: `zipfile.ZipInfo` stamps `create_system` from the host OS
(0 on Windows, 3 on Unix), and `build-firefox.py` wrote the generated manifest
through `write_text`, which turns `\n` into `\r\n` on Windows. Both are pinned
now. All three published artifacts rebuild byte-for-byte on Windows against the
Linux-built release — verified against the real assets, not a second local build.

A `.gitattributes` enforcing `eol=lf` came out of this and is the reason the
above is true. CI rejected the first SBOM: with `core.autocrlf` the Windows
working tree held CRLF while Linux checked out LF, so every recorded hash — and
every archive — depended on which machine built it. The same commit produced
`541f0b93…` on Windows and `9986a4b6…` on Linux for the same source file. The
earlier "reproducible" check only ever proved *same-machine* reproducibility.
Line endings are now pinned in the working tree on every platform, and all 36
recorded hashes match the committed blobs exactly.

Also fixed: `scripts/build-firefox.py` crashed on Windows before packaging
anything - an em dash and an arrow in a `print()` raised `UnicodeEncodeError`
under the cp1252 console. The Firefox build had never completed on that
platform.

`package.json` and `extension/manifest.json` said `1.0.0` while this changelog
said `1.2.0`. Both now say `1.2.0`; a package stamped with the wrong version is
the kind of detail that makes everything else look unchecked.

### Fixed - a page could be branded paid content for merely mentioning it

`sponsored` is decisive, and it was a bare word match against `excerpt` - the
first 12,000 characters of whole-page text, so navigation, sidebars, ad-slot
labels and body prose all land in it. Any page containing the word was reported
as **"This is paid content"**, and decisive is exactly the property that stopped
evidence from arguing it back down.

A twelve-year-old outlet with a named byline, an about page and a 130-month
archive was convicted three ways: an investigation *into* paid placement, an
explainer defining "advertorial", and an ordinary rates story carrying a
"Sponsored" ad-slot label. The ad-slot case produced a signal set identical to a
genuine advertorial, so the detector could not tell them apart.

A disclosure now has to look like one - disclosure phrasing rather than the bare
word, leading its segment the way a real label does. All three pages score
clean, the advertorial control is still flagged, and the eval is unchanged
(0/40 held out, 0/111 overall, 8/8 rungs). Offline checks 149 -> 154.

The 0/111 headline could not have caught this: corpus rows are built with
`excerpt: ""`, so the page-text detectors are not exercised by it at all. That
coverage gap is now written into `docs/EVALUATION.md` rather than left implied.

### Security

- **Closed a redirect bypass in the SSRF guard.** The guard validated the URL
  requested, never the one reached; fetch follows redirects, so a public
  https://evil.example/r answering 302 -> http://127.0.0.1:8080/admin walked
  past it and its body was read into the next model prompt. res.url is now
  re-validated before the body is touched. Documented as a mitigation, not a
  fix: the request is issued before res.url can be seen, so a redirect remains
  a blind probe - it just no longer exfiltrates.

### Added

- The E2E suite loads the real unpacked extension and asserts on its pages under
  the MV3 content security policy - where the browser allows it. Several Chrome
  builds ignore --load-extension in headless mode, including the one on the
  development machine, so the suite reports SKIP there rather than passing. A
  check that cannot run is not a check that passed, and docs/VERIFICATION.md now
  carries it as a manual pre-release step.

## [1.1.0] — 2026-09-06

The detector stopped being a set of plausible heuristics and became a measured
one, and the tool stopped requiring an API key to answer the question most
readers actually have.

### Changed — placement scoring replaces binary flags

An audit measured two failure modes with a single root cause: one weak signal
could decide the outcome, and legitimacy could only be proven by allowlist
membership.

- **Evasion.** `geo-question-headline` was the only high-severity signal, so
  deleting one question mark took a campaign site from "high risk" to unflagged.
- **False accusation.** Conversely one question-shaped headline was enough to
  brand ProPublica, Bellingcat, Dawn or The Hindu as manipulated, and the
  plain-language card then announced it in the loudest box on the page.

`engine/sourceScore.js` gives every signal a weight and lets evidence
accumulate. Legitimacy is **earned**: a long, continuously archived publishing
history counts against suspicion the way a fresh domain counts for it, which is
what protects the independent and non-Western press no hand-written list will
ever cover. The allowlist survives only as a short-circuit for primary sources.

New signals close the evasions: prompt-shaped headlines without a question mark,
placeholder bylines ("Editorial Team"), and — from a Wayback request that now
returns coverage as well as first-seen — aged shells (old domain, almost nothing
published) and thin publishing history. Aged domains are sold specifically to
defeat age checks; continuous archiving cannot be bought retroactively.

### Added — accuracy is now a build gate

`eval/` measures both failure modes offline and deterministically, against 111
real publishers with real Wayback histories (109 not allowlisted, including 22
research institutions whose names deliberately trip the think-tank heuristic) and
a 9-rung adversary ladder. CI fails the build if the thresholds regress.

| | before | after |
| --- | --- | --- |
| Legitimate publishers accused | 111/111 (100%) | **0/111 (0%)** |
| Adversary rungs detected | 1/8 (12.5%) | **8/8 (100%)** |

Rung 8 — six years of continuous publishing — is **not** detected, is documented
as the accepted ceiling, and is excluded from the numerator rather than hidden
behind a friendlier denominator. See [docs/EVALUATION.md](docs/EVALUATION.md).

### Fixed — reputation could cancel out paid content

Found by the evaluation harness, not by reading the code. A thirty-year-old
newspaper running an advertorial scored **clean**: its archive history (−30),
byline (−10) and about page (−5) more than cancelled the paid-content signal
(+60). Exactly backwards — a trusted masthead makes a paid placement more
effective, not less. `sponsored` and `non-public-url` are now decisive: they set
the verdict regardless of score and regardless of the allowlist.

The harness also gained technique variants beyond the English ladder (Arabic
campaigns with and without a question mark, advertorials, raw AI filler,
injection payloads) and a **weight-sensitivity analysis** that perturbs every
weight ±20% and re-runs the whole measurement, so the headline numbers are
demonstrably an operating point rather than a fit to the corpus.

### Added — keyless source check

The plain-language warning was written for someone who has just read a chatbot
answer, and the install flow then asked them to mint an API key. But that half
of the pipeline never needed a model: page metadata, headline shape and archive
history are deterministic code against keyless services.

`engine/sourceCheck.js` runs it with no setup at all, in both surfaces, and the
report states plainly that the claims themselves were not verified.

### Fixed
- **Silence was reported as an all-clear.** A source that could be neither
  fetched nor found in the archive told us nothing; scoring that as "clean"
  turned a failed check into reassurance. There is now an `unknown` verdict, and
  unreachable sources no longer inflate the "N of M are established publishers"
  count either. In the web app this is the normal case, since CORS blocks both
  the page fetch and the archive lookup.
- The plain-language card keyed off signal presence rather than the score, so it
  could still accuse a source the detector had cleared.
- A sources-only report crashed the renderer on a null `report.bias`.
- The Arabic locale table held literal `\uXXXX` escape text that no translator
  could read or edit; it is real characters again.

### Security
- `<all_urls>` moved from a required to an **optional** host permission,
  requested from the click that needs it. The install prompt no longer asks to
  read all your data on every website; a refusal degrades to the honest
  "could not check" verdict rather than failing.
- Source fetching throttled to 3 concurrent requests. Twelve sources previously
  meant 24 simultaneous requests from the reader's own IP.

### Engineering
- The engine type-checks from its JSDoc (`npm run typecheck`, `jsconfig.json`),
  in CI, with no build step and no runtime dependency.
- Offline suite 113 → **147 checks**.

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
