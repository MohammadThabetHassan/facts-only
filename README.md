<div align="center">

<img src="docs/logo.svg" width="88" height="88" alt="">

# Facts Only

**Find out who paid to be in your AI answer.**

Independent evidence search · claim-by-claim verdicts · manipulation-pattern source profiling

[![CI](https://github.com/MohammadThabetHassan/facts-only/actions/workflows/ci.yml/badge.svg)](https://github.com/MohammadThabetHassan/facts-only/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Dependencies: none](https://img.shields.io/badge/dependencies-0-brightgreen)
![Telemetry: none](https://img.shields.io/badge/telemetry-none-brightgreen)
![Tests: 113 offline checks](https://img.shields.io/badge/tests-113%20offline%20checks-brightgreen)

</div>

---

When you ask a chatbot a question, you assume the answer came from whatever the
evidence says. Increasingly it did not: it came from whoever spent the most money
making sure the chatbot would find their version first.

The technique has a name — **Generative Engine Optimization (GEO)**, SEO for AI
answers. You publish material with **question-shaped headlines** that match the way
people prompt chatbots, so the model quotes you instead of the reporting. A documented
example (The Guardian, Aug 2026): a fake "US think tank", set up and funded by Israel,
published 500,000+ words of question-titled reports engineered to be the first thing
ChatGPT and Google AI cite on Gaza. The chatbot then repeats it as neutral research,
because nothing in the answer tells you it was placed there.

Facts Only puts that missing label back. It takes the answer apart, goes and finds
evidence for itself, and — first, before any of the technical detail — tells you in one
sentence whether someone appears to have paid or planted their way into what you just
read, and which source it was.

> **What "Facts Only" means here.** It is not a promise to hand you the truth — a tool
> that claimed that would become the single point of manipulation worth attacking. It
> means stripping out what is there because it was *bought*: paid placement, planted
> "research", publishers who will not say who funds them. What survives is closer to
> fact. Facts Only never outputs "true" or "false"; it shows you the evidence, the
> counter-evidence, and who is behind each source, and you decide.

## What a report looks like

<div align="center">
  <img src="docs/screenshots/report.png" width="740" alt="A Facts Only report. It opens with a red plain-language box reading 'One of these sources looks planted, not reported', followed by why: the site global-security-observatory.org was written to be quoted by an AI and calls itself a research institute that could not be confirmed. Below that, the trust banner with claim counts, a method line, and per-claim cards with evidence links, quotes and quote-verification chips.">
</div>

**The plain-language warning comes first, on purpose.** Most people will read that box
and nothing else, so it has to answer the only question that matters — *is someone paying
to be in this answer, and which source is it?* — in a sentence, with the site named and
linked. Its wording is ranked worst-first, so paid content is never softened into
"an unnamed publisher". Like the trust signal, it is computed in code from the source
flags, so the model being checked cannot tone it down.

Below it, for readers who want the mechanism: the trust banner **with the counts behind
it**, a transparency line stating exactly what the verification did (live search? how many
of the checkable claims? quotes verified?), per-claim verdicts with evidence links and
**quote-verification chips** ("quote verified on page" vs "quote NOT found on page"),
per-source warnings — each in plain words, with the technical heuristic one click away —
the bias and framing analysis, and an optional **second-model opinion** asked to challenge
the first review.

<details>
<summary>The full web app, and the Arabic RTL layout</summary>

<div align="center">
  <img src="docs/screenshots/webapp-full.png" width="700" alt="The Facts Only web app with the paste box and a rendered report below it.">
  <br><br>
  <img src="docs/screenshots/report-arabic-rtl.png" width="700" alt="The same report rendered in Arabic with a right-to-left layout.">
</div>

Screenshots are generated, not hand-cropped: `python scripts/capture-screenshots.py`.

</details>

## How it works

```
 AI answer (+ cited links)
        │
        ▼
 ① CLAIM SPLIT      break the answer into separate checkable claims
        │
        ▼
 ② EVIDENCE HUNT    per claim: independent search for sources that
        │           SUPPORT and CONTRADICT it — never reusing the
        │           answer's own sources (Gemini search grounding)
        ▼
 ③ SOURCE PROFILER  every source gets:
        │           • code heuristics: question-shaped headlines (GEO),
        │             no named author, unregistered "think tank",
        │             sponsored content, raw AI-generated text,
        │             domain first archived <90 days ago
        │           • AI publisher profile: funding, stance, credibility
        ▼
 ④ BIAS ANALYSIS    framing issues, missing context, strongest argument
        │           AGAINST the answer
        ▼
 ⑤ REPORT           trust signal (computed in code, not by the model),
                    per-claim verdicts, source warnings, Markdown export
```

The headline verdict is **computed by code** from the check results — a gamed or biased
model cannot award itself a friendly rating. The decision order and thresholds are part of
a documented contract ([ARCHITECTURE.md](docs/ARCHITECTURE.md)) and are covered by tests.

## Features

- 💰 **Says who paid, in plain words** — the report opens with one sentence a
  non-technical reader understands ("One of these sources looks planted, not reported"),
  names the site, and lists why. Ranked worst-first so paid placement outranks every
  softer signal, and computed in code so it cannot be talked down.
- 🔎 **Verify anywhere** — one click under AI answers on ChatGPT, Gemini, Claude and
  Perplexity; right-click on any selected text; or paste into the side panel or web app.
- 🧾 **Quote verification** — evidence quotes are checked against the fetched page text;
  "not found" is flagged instead of silently trusted.
- 🧭 **Second-model cross-check** — optionally send the checked claims to a second,
  different provider and let it challenge the first review; disagreements are shown in the
  report. This mitigates single-model bias, including in the checker itself.
- 🏛️ **Domain-age detection** — every non-established source domain is checked against the
  Wayback Machine (keyless): domains first archived under 90 days ago, or never archived
  at all, are flagged as influence-campaign signals.
- 🌍 **Multilingual heuristics** — GEO headline detection and think-tank naming patterns in
  English **and Arabic** (هل/ماذا/لماذا…, معهد/مرصد/مؤسسة), sponsored-content markers in both.
- ⚖️ **Cross-partisan by design** — the established-publisher list spans wire services,
  courts and UN bodies, academic venues, and newspapers from different editorial lines,
  with documented inclusion criteria ([SOURCE-LISTS.md](docs/SOURCE-LISTS.md)).
- 🛡️ **Hardened against the attack it studies** — fetched pages and analyzed answers are
  treated as untrusted data in every model prompt, and model-supplied URLs are refused
  unless they are public web addresses, so a page cannot steer the extension into the
  user's own network ([threat model](docs/THREAT-MODEL.md)).
- 🧮 **Auto-free OpenRouter models** — set the model to `auto-free` and the provider
  discovers currently-available free models, ranks them for fact-checking, and falls back
  down the list on failures or rate limits.
- 🚫 **Zero dependencies, zero telemetry, no build step** — plain ES modules.
- 🔁 **Resilient** — automatic retry with backoff on rate limits (user cancellation is
  never retried); a failed step degrades the report, it never crashes it.
- 💾 **Cached and cancellable** — identical answers render instantly from cache (with a
  "re-run fresh" escape), and long runs can be cancelled mid-flight.
- 🌗 **Light and dark**, following the system theme.
- 🌍 **English and Arabic UI**, RTL layout included.

## Install

**Chrome / Edge / Brave**

1. Clone or download this repository.
2. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the
   `extension/` folder.

**Firefox 128+**

1. `npm run build:firefox` (or `python scripts/build-firefox.py`).
2. Open `about:debugging` → **Load Temporary Add-on…** → select
   `firefox-build/manifest.json`. This is a temporary install; see the roadmap for signed
   builds.

**Then, in either browser**

3. Click the Facts Only icon → paste a free Gemini API key
   ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) → **Save** →
   **Test connection**.
4. No key yet? Click **Try a demo** for a full sample report built from canned data.

OpenRouter and OpenAI-compatible endpoints also work, but free models there cannot search
the web, so evidence quality is lower.

## Usage

- **On ChatGPT, Gemini, Claude, or Perplexity:** a blue "🔍 Facts Only — verify this
  answer" button appears under each AI response. Click it and the report opens in the side
  panel.
- **Anywhere on the web:** select the text → right-click → **Facts Only: verify selected
  text**. The side panel opens automatically and runs.
- **Manual:** open the side panel and paste any answer. Links in the pasted text (markdown
  or bare URLs) are picked up as sources automatically.
- Results are cached per answer and settings; press **Verify** again for a fresh run, or
  **Cancel** mid-run to abort. Every report can be copied to the clipboard or exported as
  Markdown.

The web app also takes URL parameters: `?demo=1` runs the sample report on load, and
`?lang=ar` renders it in Arabic.

## Development

There is no build step and there are no dependencies — load `extension/` unpacked and edit
the files.

```bash
npm test                  # 113-check offline suite: no key, no network
npm run dev               # serve webapp + panel at localhost:8123
npm run build:firefox     # build the Firefox add-on directory
npm run package           # store-ready zip of the Chrome extension
```

Each script is a plain `node` or `python` invocation if you would rather not use npm — see
`package.json`.

For a real end-to-end pass against the live API:

```bash
FACTS_ONLY_GEMINI_KEY=... node scripts/live-check.mjs
```

That runs one small answer with two checkable claims through Gemini with Google Search
grounding, prints the report with quote statuses, and applies sanity gates (grounding was
used, evidence was returned, not everything came back unverifiable). It costs roughly five
free-tier calls. The key is read from the environment only and is never stored.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the ground rules: evidence not verdicts, a
code-computed trust signal, tested heuristics, and cross-partisanship.

## Repository layout

```
extension/          Manifest V3 extension (no build step)
  engine/           Shared verification engine (also used by the web app)
    providers/      gemini · openrouter · openai-compat · mock
    steps/          claims · evidence · bias · summary
    explain.js      plain-language risk summary (computed in code)
    ui/             storage · settings · report renderer · cache (shared with webapp)
  content/          chatbot answer detection + Verify buttons
  panel/  popup/    side panel & settings UI
webapp/             paste-text web app reusing the same engine
docs/               ARCHITECTURE.md · THREAT-MODEL.md · SOURCE-LISTS.md · VERIFICATION.md
scripts/            icon generator · dev server · packaging · screenshot capture
test/smoke.mjs      offline pipeline test suite
```

## Roadmap

- [x] Domain-age / Wayback-first-seen checks for source profiling
- [x] UI translations (Arabic first)
- [x] Firefox port
- [ ] Signed Firefox add-on and a Chrome Web Store listing
- [ ] Credibility notes from Wikipedia and Wayback instead of model memory
- [ ] Optional local-model provider (e.g. via Ollama)
- [ ] Narrow `<all_urls>` to an optional permission requested on first fetch

## Known limitations

- Free-tier daily limits apply to Gemini's search-grounded requests.
- Some sites block fetching; those sources are profiled from link text and model knowledge
  only, and marked as such. Quote chips then read "page not fetched — quote unchecked".
- Quote verification matches the quote against the extracted page text, so a "not found"
  flag can also mean the quote sits behind JavaScript or a paywall.
- Model-generated report text (summaries, publisher profiles) stays in the language the
  verification ran in; only the UI chrome is translated.
- The verification model is itself an AI with blind spots. Every claim in a report carries
  links so readers can check the primary evidence, and the optional second-model
  cross-check reduces — but does not remove — this risk.

## Privacy

API keys and settings never leave your device (browser-local storage). Text is sent only
to the AI provider you configure. Page fetches use `credentials: "omit"`, and the API key
travels in a request header rather than a URL, so it stays out of browser history and
proxy logs.

## Governance

- [Contributing](CONTRIBUTING.md) — ground rules, and how to add heuristics or providers
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md) — prompt injection, key handling, evasion reports
- [Threat model](docs/THREAT-MODEL.md) — what Facts Only defends against, and what it does not
- [Verification log](docs/VERIFICATION.md) — what is tested, how, and what remains
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE) © 2026 Mohammad Thabet Hassan

## Acknowledgements

- The Guardian, ["Fake US thinktank set up and funded by Israel sought to influence AI chatbots"](https://www.theguardian.com/world/2026/aug/26/fake-thinktank-israel-ai-propaganda)
- Politico, ["Israeli PR wants to answer your ChatGPT questions"](https://www.politico.com/newsletters/politico-influence/2026/08/14/israeli-pr-wants-to-answer-your-chatgpt-questions-01038138)
- GEO manipulation research: [arXiv 2311.09735](https://arxiv.org/pdf/2311.09735)
