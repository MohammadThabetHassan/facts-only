# Contributing to FactLens

Thanks for helping build a tool that makes AI answers harder to manipulate.
This project is deliberately **dependency-free vanilla JavaScript** — no build
step, no bundler, no npm install. Please keep it that way unless a change truly
justifies it.

## Development setup

You need only a browser and (for tests) Node.js 18+:

```bash
git clone <your fork>
cd factlens
node test/smoke.mjs        # offline test suite — must pass before every PR
```

No Node installed? Any LTS version works; the suite uses no packages.
To try the extension: `chrome://extensions` → Developer mode → **Load unpacked**
→ select `extension/`. Use the **Demo mode** provider while developing — it
requires no API key.

## Ground rules

1. **FactLens reports evidence, never verdicts.** Do not add features that claim
   to output "the truth". This is a core design constraint, not a style choice.
2. **The trust signal is computed in code** (`engine/pipeline.js`), not written
   by the model. Keep it that way.
3. **Every heuristic needs a test.** New red-flag patterns in
   `extension/engine/sourceProfiler.js` must come with positive and negative
   cases in `test/smoke.mjs` (including an established-domain negative case).
4. **Fetched/pasted content is untrusted.** Anything that sends external text to
   a model must frame it as data and instruct the model to ignore instructions
   inside it (see existing prompts for the pattern).
5. **Heuristics must be cross-partisan.** The established-domain list, source
   profiling and bias prompts must treat publishers from all sides identically.
   PRs that bias the tool politically will be declined.
6. **No dependencies, no telemetry, no remote code.**

## Good first contributions

- Add heuristics for manipulation patterns in **your language** (with tests).
- Improve chatbot DOM selectors in `extension/content/detector.js` when sites
  redesign — this is the most common breakage, and a one-line fix.
- Improve prompt robustness and report wording.
- Add screenshots and translations of the docs.

## Adding an AI provider

Implement `create<Name>Provider(settings)` in `extension/engine/providers/`
following `openai-compat.js`, expose `{ name, supportsSearch, complete }`,
register it in `providers/index.js`, add it to `PROVIDER_INFO` in
`engine/ui/settings-ui.js`, and document its free tier and search capabilities
in the settings hint text.

## Pull requests

- One topic per PR; rebase before opening if you can.
- Run `node test/smoke.mjs` and include the result in the PR description.
- Explain *why*, not just *what*. Link the issue if there is one.
- New files: MIT license applies automatically — do not add other headers.
