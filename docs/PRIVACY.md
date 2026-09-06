# Privacy policy

**Facts Only does not collect, transmit, store, or sell any personal data.**

There is no analytics, no telemetry, no crash reporting, no account, and no
server operated by this project. The extension and the web app run entirely in
your browser.

Last updated: 2026-09-06.

## What stays on your device

- **Your API key**, if you choose to add one. Stored in browser-local storage
  (`chrome.storage.local` in the extension, `localStorage` in the web app). It is
  never sent anywhere except to the AI provider you selected, as part of your own
  request.
- **Your settings** — provider, model, language, how many claims to check.
- **Recent reports**, cached so an identical answer renders instantly. Capped and
  evicted oldest-first.

Clearing the extension's storage, or your browser's site data for the web app,
erases all of it. Nothing is retained anywhere else, because there is nowhere
else.

## What leaves your device, and where it goes

Only when you run a check, and only to these:

| Destination | What is sent | Why |
| --- | --- | --- |
| The AI provider you configured (Google Gemini, OpenRouter, or a custom OpenAI-compatible endpoint) | The text you asked to verify, and excerpts of the pages cited by it | Claim extraction, evidence search, bias analysis. Governed by that provider's own privacy policy. |
| The websites cited by the answer | An ordinary page request, with `credentials: "omit"` so no cookies are attached | To read the page's title, byline and text so quotes can be checked against it |
| `web.archive.org` | A domain name only | To ask how long that domain has been publishing |

**The keyless source check contacts no AI provider at all** — only the cited
sites and the Wayback Machine.

Requests to cited pages are throttled and carry no identifying information
beyond what any browser sends. Because a page fetch comes from your browser, the
site you are checking can see your IP address, exactly as it would if you clicked
the link yourself.

## Permissions, and why each is needed

| Permission | Why |
| --- | --- |
| `storage` | Save your settings and API key locally |
| `sidePanel` | Show the report next to the page |
| `contextMenus` | The "verify selected text" right-click entry |
| `scripting` | Add the Verify button under AI answers |
| `<all_urls>` (**optional**) | Fetch cited pages so quotes can be checked. Requested only when you first run a check, never at install, and refusing it degrades the report honestly rather than breaking it. |

Content scripts run only on `chatgpt.com`, `chat.openai.com`,
`gemini.google.com`, `claude.ai` and `perplexity.ai`, to place the Verify button.

## Children

Facts Only is not directed at children and collects no data from anyone.

## Changes

This policy is versioned in the repository; its history is the changelog.
Material changes will be noted in [CHANGELOG.md](../CHANGELOG.md).

## Contact

Open an issue: <https://github.com/MohammadThabetHassan/facts-only/issues>
