# Store listing pack

Everything a Chrome Web Store or Firefox Add-ons submission asks for, written
once so publishing is a form-filling exercise rather than a project.

Privacy policy URL (both stores require one):
`https://github.com/MohammadThabetHassan/facts-only/blob/main/docs/PRIVACY.md`

---

## Name

Facts Only — AI answer verifier

## Short description (132 characters max)

> Find out who paid to be in your AI answer. Checks the sources a chatbot cites
> for paid placement and planted "research".

(126 characters.)

## Detailed description

When you ask a chatbot a question, you assume the answer came from whatever the
evidence says. Increasingly it did not — it came from whoever spent the most
money making sure the chatbot would find their version first.

The technique has a name: Generative Engine Optimization, or SEO for AI answers.
You publish material with question-shaped headlines that match how people prompt
chatbots, so the model quotes you instead of the reporting. In August 2026 The
Guardian documented a fake "US think tank", funded by Israel, that published over
500,000 words of question-titled reports engineered to be the first thing ChatGPT
and Google AI cite on Gaza. The chatbot repeats it as neutral research, because
nothing in the answer tells you it was placed there.

Facts Only puts that missing label back.

WHAT IT DOES

• Adds a Verify button under answers on ChatGPT, Gemini, Claude and Perplexity —
  or right-click any selected text anywhere on the web.
• Tells you in one plain sentence, before any technical detail, whether a source
  looks paid or planted, and which one it is.
• Checks each source's byline, ownership signals, and how long it has genuinely
  been publishing.
• With an API key, also splits the answer into claims and searches independently
  for evidence both for and against each one, verifying quotes against the pages
  they came from.

NO ACCOUNT, NO KEY TO START

"Check sources only" needs no API key at all and costs nothing. Add a free
Google Gemini key if you also want claim-by-claim evidence checking.

IT NEVER TELLS YOU WHAT IS TRUE

Facts Only does not output "true" or "false", and it is not a fact-checking
authority. It shows you evidence, counter-evidence, and who is behind each
source — and the judgment stays with you. A tool that claimed to hand you the
truth would become the single point of manipulation most worth attacking.

MEASURED, NOT ASSERTED

The detector is evaluated on every code change against 50 real publishers
weighted toward the independent and non-Western press, and against an adversary
that makes each cheap change a real operator would: 0 of 50 legitimate
publishers are wrongly accused, and every adversary rung below a documented
ceiling is caught. The method, and the ceiling, are published in the repository.

PRIVACY

No analytics, no telemetry, no account, no server. Your API key and settings
never leave your device. Open source, MIT licensed.

## Category

Chrome Web Store: Productivity → Workflow & Planning
Firefox: Privacy & Security

## Single purpose (Chrome requires this)

> Facts Only has one purpose: to assess the sources cited in an AI chatbot
> answer, and where the user supplies an API key, to verify that answer's factual
> claims against independent evidence. Every permission serves that purpose.

## Permission justifications (Chrome requires one per permission)

| Permission | Justification |
| --- | --- |
| `storage` | Stores the user's own settings and optional API key locally on their device. Nothing is transmitted to us; there is no server. |
| `sidePanel` | The verification report is displayed in the browser side panel next to the page being read. |
| `contextMenus` | Provides the "Facts Only: verify selected text" right-click entry, the extension's primary manual entry point. |
| `scripting` | Injects the "Verify this answer" button beneath AI responses on the supported chatbot sites listed in the content-script matches. |
| `<all_urls>` (optional) | Fetches the web pages an AI answer cites, so quoted text can be checked against the actual page and the publisher's byline and about page can be read. Declared **optional**: it is requested only when the user first runs a check, and refusing it degrades the report rather than breaking the extension. |

## Data-use disclosures (Chrome)

- Does this item collect personally identifiable information? **No.**
- Health, financial, authentication, personal communications, location, web
  history, user activity, website content? **No** to all.
- Is data sold to third parties? **No.**
- Is data used for purposes unrelated to the single purpose? **No.**
- Is data used to determine creditworthiness or for lending? **No.**

Note for reviewers: the text a user explicitly submits for verification is sent
to the AI provider that user configured, using that user's own key. It is not
collected by this extension or its author, and no other data leaves the device.

## Assets checklist

- [x] Icons 16/32/48/128 — `extension/icons/` (`python scripts/generate_icons.py`)
- [x] Screenshots 1280×800 — regenerate with `python scripts/capture-screenshots.py`
- [x] Privacy policy — `docs/PRIVACY.md`
- [ ] Promotional tile 440×280 (Chrome, optional)
- [ ] Signed build (`web-ext sign`) for Firefox self-distribution

## Submission steps

1. `npm test && npm run test:e2e && npm run eval` — all gates green.
2. `python scripts/package-extension.py` → `dist/facts-only-extension-vX.Y.Z.zip`
3. Chrome: <https://chrome.google.com/webstore/devconsole> → new item → upload zip
   → paste the sections above → submit.
4. Firefox: `python scripts/build-firefox.py`, then
   <https://addons.mozilla.org/developers/> → submit `firefox-build/`.
5. Tag the release and attach the zip.
