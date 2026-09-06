# Security Policy

## Reporting a vulnerability

Do **not** open a public issue for security problems.

Use GitHub's **"Report a vulnerability"** button on the Security tab of this
repository (private security advisory). If you cannot use GitHub advisories,
contact a maintainer directly and ask for a private channel first.

You will get an acknowledgement within 7 days and a fix timeline within 30 days
for confirmed issues.

## Scope: what matters in this project

Touchstone is a security-adjacent tool, so these classes of issues are in scope:

1. **Prompt injection through analyzed content.** Fetched web pages, cited links
   and pasted answers are untrusted input that reaches the verification model.
   Reports showing that attacker-controlled text can flip verdicts, forge
   evidence, or exfiltrate the user's API key are critical.
2. **API key handling.** Keys must never leave the device except to the
   configured AI provider. Any leak path (logs, exports, telemetry) is critical.
3. **Heuristic evasion that is cheap and systematic.** If a trivial change to a
   page (e.g. a fake author meta tag) defeats a detector in a way users would
   reasonably consider deceptive-by-design, report it — we will document or fix.
4. **Cross-origin abuse** in the extension (content script injection scope,
   message handlers accepting commands from web pages).

## Out of scope

- The accuracy of individual AI verdicts (Touchstone is explicitly evidence, not
  truth — see `docs/THREAT-MODEL.md`).
- Rate limits or outages of third-party AI providers.
- Vulnerabilities in browsers themselves.

## Design commitments

- No telemetry, no analytics, no remote code. All logic ships with the extension.
- API keys are stored only in the browser's local extension storage
  (`chrome.storage.local`) and sent only to the provider the user configured.
- Fetches use `credentials: "omit"` — no cookies leave the device.
