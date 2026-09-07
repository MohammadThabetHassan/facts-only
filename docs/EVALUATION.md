# Evaluation

A tool that flags sources as manipulated has two ways to fail, and the dangerous
one is not the obvious one:

1. **It misses placement** — an operation slips through and the reader is told
   the answer is fine.
2. **It accuses real journalism** — a legitimate outlet is labelled "planted",
   in the loudest box on the page, to a reader who has no way to check.

The second failure is worse. It is also the one a project like this drifts into
by default, because heuristics are written by looking at bad actors and never at
good ones. So both are measured, on every commit.

```bash
npm run eval          # human-readable report
npm run eval:json     # machine-readable, same numbers
```

The measurement is offline and deterministic. Anyone can reproduce it in seconds
without a key, a network, or trusting this file.

## Current results

Headline numbers are from the **held-out half** of the corpus — see
[Tuning and held-out](#tuning-and-held-out) for why that distinction is the
difference between a measurement and a fit.

| | held-out result | previous rule |
| --- | --- | --- |
| Legitimate publishers accused of placement | **0 / 79 (0%)** | 79 / 79 (100%) |
| Legitimate publishers given any warning | **1 / 79 (1.3%)** | — |
| Adversary rungs detected (below the ceiling) | **8 / 8 (100%)** | 1 / 8 (12.5%) |
| First rung that slips past | **none below the ceiling** | rung 1 |

Across the whole 209-publisher corpus: **0 accused**, 2 given a lesser caution
(documented below). The tuning half also scores 0 accused, so there is no
tuning/held-out gap — which is the result you want, and the one you are only
entitled to report if you looked.

"Previous rule" is the binary rule this replaced: *any high-severity flag ⇒ high
risk*, where a question-mark headline was high severity. It is kept in
`eval/run.mjs` and scored on every run, so the improvement is measured rather
than asserted.

## Tuning and held-out

`SIGNAL_WEIGHTS` was hand-set while looking at this corpus. A number measured on
all of it would therefore be a **fit, not a measurement**, and a reviewer would
be right to say so.

So the corpus is split and the held-out half carries the headline:

| | publishers | accused |
| --- | --- | --- |
| Tuning (weights may be informed by these) | 130 | 0 |
| **Held out (the reported number)** | **79** | **0** |
| Whole corpus | 209 | 0 |

The split is by a **stable hash of the domain name** — not by shuffling, not by
index. It must not move when outlets are added, reordered, or when the corpus is
regenerated, otherwise "held out" quietly becomes whichever half flatters the
result this week. Adding an outlet lands it in a bucket decided by its name alone.

This only means anything with the discipline attached: weights may be informed by
the tuning half; **if a held-out number comes back worse, it is published worse.**
Tuning against the held-out half would make the whole exercise theatre.

A large gap between the two rows would be the overfitting signal. There is none
here — both are zero — but the tuning row stays printed in the output precisely so
a future gap is visible rather than discovered by someone else.

## The legitimate corpus

`eval/outlets.json` — 209 publishers, with **real Wayback archive histories**
collected by `eval/collect.mjs` into `eval/corpus.json`.

The list is deliberately hostile to this tool's known weakness. The old detector
could only recognise legitimacy through a 63-domain allowlist that was
overwhelmingly Anglo-American and European; anything outside it was presumed
suspect. That is a structural bias against exactly the independent and
non-Western press that most needs not to be dismissed. So the corpus is weighted
toward outlets that allowlist does **not** contain:

| Group | Outlets | Accused |
| --- | --- | --- |
| South Asia | 18 | 0 |
| Africa | 20 | 0 |
| Middle East | 16 | 0 |
| East Asia | 13 | 0 |
| South-East Asia | 14 | 0 |
| Latin America | 19 | 0 |
| Europe | 31 | 0 |
| North America | 8 | 0 |
| Investigative | 17 | 0 |
| Academic | 9 | 0 |
| Policy | 11 | 0 |
| **Research institute** | **22** | **0** |
| Media watch | 11 | 0 |

The **Research institute** group exists to catch a specific way this tool could
defame real organisations. `think-tank-unverified` fires on names containing
*institute*, *observatory*, *foundation*, *forum*, *watch* or *monitor* — and
that is exactly how RAND, Pew, SIPRI, Chatham House, Bruegel, the Lowy Institute
and the Reuters Institute are named. All 22 score clean, because a name is worth
20 points and three decades of continuous archiving is worth −30.

**195 of the 209 are not on the allowlist.** They score clean because a long,
continuously archived publishing history is itself evidence of an ordinary
publisher — legitimacy is earned from the record, not from being on a list
someone maintained by hand.

### The two warnings, and why they are left in

`thedailystar.com.bd` scores 40 and `follow-the-money.eu` scores 35 — both
*elevated*, a caution rather than an accusation. Both are the same failure in
different clothing: **the archive does not have enough history for the
hostname.** Wayback has no record of `thedailystar.com.bd` at all (it is an
alias of `thedailystar.net`, separately in the corpus and clean), and it has
only 5 archived months for `follow-the-money.eu` against 4.8 years of age.

`follow-the-money.eu` arrived with the corpus expansion to 209 and was
originally **accused**, not cautioned, at 50 points — see
[Margin](#margin-and-what-0209-does-not-tell-you). It exposed a real
double-count: `domain-shell` and `domain-thin-history` both describe *too little
archive for the domain's age*, and in the 3–5 year band both fired, charging one
observation twice. They are mutually exclusive now. That fix was found by
growing the corpus, which is the argument for growing it.

The detector is behaving as designed — a hostname with no publishing history
cannot be vouched for, and saying so is the honest output. It is left in the
corpus rather than quietly removed, because a corpus curated until the number
reads 0.0% measures the curator, not the detector. It is also a fair sample of
the residual false-positive mode: **legitimate sites that the archive does not
know about**, which in practice means new outlets and alias hostnames.

Inclusion criterion is narrow and checkable: a masthead, named editorial staff,
and a multi-year publishing record. It is **not** a claim that any of these
outlets is unbiased or accurate. See [SOURCE-LISTS.md](SOURCE-LISTS.md).

### Why the false-positive test is harder than reality

Every outlet in the corpus is scored as though it had published a
question-shaped headline — the exact pattern the detector hunts for
("Is the economy finally recovering?", "Who is really paying for the pipeline?").
Real outlets publish these sometimes; the test assumes they always do. If the
detector holds up under that, it holds up in the field.

## The adversary ladder

Naming real domains as influence operations is a factual claim about real
organisations that this repository will not make on the strength of a heuristic
— which is the entire principle the tool is built on. So the negative class is
**synthetic and explicit**: a campaign site, then the same site after each cheap
change a real operator would make.

**Rung 0 is not invented.** It is assembled from the characteristics the public
reporting attributes to the case this project exists because of — a
self-described think tank with no verifiable organisation behind it, publishing
question-titled reports at volume, on a domain with no history, without named
authors:

> The Guardian, 26 Aug 2026 — ["Fake US thinktank set up and funded by Israel
> sought to influence AI chatbots"](https://www.theguardian.com/world/2026/aug/26/fake-thinktank-israel-ai-propaganda)
> Politico, 14 Aug 2026 — ["Israeli PR wants to answer your ChatGPT questions"](https://www.politico.com/newsletters/politico-influence/2026/08/14/israeli-pr-wants-to-answer-your-chatgpt-questions-01038138)

The profile is modelled from those descriptions; **no real domain is named,
scored, or shipped in this repository**. Every rung above 0 is then a documented
evasion technique applied to that profile.

The question is not *can this be evaded* — anything can. It is **how far up the
ladder an operation has to climb**, because every rung costs money or time.

| Rung | Change | Score | Verdict | Previous rule |
| --- | --- | --- | --- | --- |
| 0 | naive content farm | 100 | HIGH | HIGH |
| 1 | drops the question mark | 89 | HIGH | *clean* |
| 2 | + fills the author tag with "Editorial Team" | 82 | HIGH | *clean* |
| 3 | + invents a plausible byline | 64 | HIGH | *clean* |
| 4 | + adds an about page | 49 | HIGH | *clean* |
| 5 | + drops think-tank vocabulary from the name | 29 | warn | *clean* |
| 6 | + buys an aged domain (11y, barely archived) | 24 | warn | *clean* |
| 7 | + runs the site quietly for 18 months first | 24 | warn | *clean* |
| 8 | + six years of continuous publishing | −31 | clean | clean |

Rung 1 is the one that mattered. Under the old rule, deleting a single question
mark took a campaign site from "high risk" to unflagged. **One character.**

Rung 6 is the standard answer to any domain-age check — aged domains are sold
for exactly this purpose. It is caught because age alone was never the signal:
what counts is *continuous archived publishing*, which cannot be bought
retroactively.

## Other techniques

A campaign is not obliged to be English, and paid content does not have to look
like a content farm. These are scored on their own rather than as rungs:

| Technique | Score | Verdict |
| --- | --- | --- |
| Arabic-language campaign, question headline | 100 | HIGH |
| Arabic campaign, no question mark | 82 | HIGH |
| Advertorial on an otherwise reputable site | 15 | **HIGH** (decisive) |
| Raw AI-generated filler on a shell domain | 30 | warn |
| Citation to an internal address (injection payload) | 100 | HIGH |
| Campaign on a hostname the archive has never seen | 100 | HIGH |

The last row exists because `domain-unarchived` is worth 30 points and, until it
was added, **no adversary case exercised it**. A weight that heavy with no test
on the detection side is one nobody can defend. It scores 100, which is the
evidence that the weight earns its place — and the reason it was kept rather
than reduced when the margin analysis showed it dominating the worst case on the
legitimate side.

### Pages that must NOT be flagged

Every row above tests **under**-detection. That is the wrong half to test
exclusively, because every defect actually found in this detector has been the
other kind. These rows carry an upper bound instead, and fail by being flagged:

| Page | Score | Must not exceed |
| --- | --- | --- |
| Reporting *on* paid placement, by an established outlet | −31 | clean |
| Ordinary article carrying a "Sponsored" ad-slot label | −45 | clean |
| Media-literacy explainer quoting the AI tell-tale phrase | 9 | elevated |

All three were real false positives before the page-text work. They are pinned
here as well as in `test/smoke.mjs` so the corpus number and the unit suite would
both have to be defeated for the bug to come back.

### The bug this found

The advertorial row failed when it was first added, and it is the most useful
thing the harness has produced.

A thirty-year-old newspaper running sponsored content scored **clean**: three
decades of archive history (−30), a byline (−10) and an about page (−5) more
than cancelled the paid-content signal (+60). That is exactly backwards. *Who
paid to be in this answer* is the question the tool exists to answer, and a
trusted masthead makes a paid placement **more** effective, not less.

So `sponsored` and `non-public-url` are now **decisive**: they set the verdict
regardless of score, and regardless of the allowlist. Reputation cannot buy off
disclosure. No amount of reading the weights table would have surfaced that; the
test case did.

### And the bug that fix created

Making `sponsored` decisive removed the only thing that had been holding a very
crude detector in check. It was a bare word match against `excerpt`, which is
the first 12,000 characters of *whole-page* text — navigation, sidebars,
ad-slot labels and body prose all land in it. So any page that merely contained
the word was branded **"This is paid content"**, and *decisive* is exactly the
property that stopped evidence from arguing it back down.

Probed against a twelve-year-old outlet with a named byline, an about page and a
130-month archive, it convicted three separate legitimate pages:

| Page | Verdict before |
| --- | --- |
| An investigation *into* paid placement | HIGH — "This is paid content" |
| An explainer defining "advertorial" | HIGH — "This is paid content" |
| A rates story with a "Sponsored" ad-slot label in the furniture | HIGH — "This is paid content" |

The last one produced a signal set **identical** to the genuine advertorial
control, so the detector could not tell an ad slot from a disclosure at all. The
first is the worse failure: reporting on paid placement is this project's own
subject matter, and the tool accused the outlets that cover it.

A disclosure now has to look like one — disclosure phrasing rather than the bare
word, leading its segment the way a real label does. Reporting embeds the term
mid-sentence; ad furniture is the bare word standing alone. The cost is a
genuine advertorial that discloses only mid-sentence, which is the rarer and far
less damaging miss. All three pages now score clean, the control is still
flagged, and the cases are pinned in `test/smoke.mjs`.

**The headline number could not have caught this**, which is the part worth
sitting with. The corpus was built with empty page bodies, so the detector that
produced the accusation was never under test. That is now fixed — every row
carries a real page body through the real extraction path, and a CI gate keeps
it that way — but the lesson generalises past this bug: *a number only covers
what it actually exercised*, and 0/111 sounded like it covered everything.

### And the root cause under both of them

Two page-text detectors, two false-positive bugs, one shared cause: `excerpt`
was the whole page. Navigation, ad rails, promo footers and body prose all
arrived as one flat string, so a "Sponsored" label on someone else's ad slot
read exactly like the article's own words.

Pages are now narrowed to the article before any detector reads them
(`extractArticle` in `engine/text.js`) — furniture elements dropped, `<article>`
or `<main>` preferred, with a fallback to the whole page when nothing is
identifiable so content is never silently discarded. It is a regex heuristic
rather than a parser, deliberately: the engine runs unchanged in the extension,
the web app and Node, and reaching for `DOMParser` would end that.

This does work the wording fix could not. A realistic page whose ad rail reads
"Paid post: our partner clinic leads the region" still defeats the
disclosure-shape check on its own, because that text genuinely does lead its
segment — it is just not the article. Both fixes are pinned in `test/smoke.mjs`.

## Margin, and what 0/209 does not tell you

A clean sweep is not self-evidently reassuring. "Nobody was accused" and "nobody
came close to being accused" are different claims, and only the second suggests
the result would survive a corpus slightly unlike this one. So the eval now
prints the distance between the legitimate population and the line.

| | Score |
| --- | --- |
| Accusation threshold | 45 |
| Warning threshold | 22 |
| Median legitimate publisher | −20 |
| Worst legitimate publisher | 40 (`thedailystar.com.bd`, the unarchived alias) |
| Worst **archived** publisher | 10 |
| Weakest **detected** adversary rung | 24 |

Two things fall out of this, and the second is uncomfortable.

**Headroom is 5 points including the alias, 35 without it.** Both are printed.
Quoting only the first would blame the scoring model for a documented input
problem; quoting only the second would be curating the corpus until the number
flatters. A CI gate holds the archived figure at ≥ 20, so a future weight change
that quietly erodes separation fails the build instead of being noticed later.

**Separation depends on whether the archive knows the hostname**, and the eval
prints both figures. The weakest *detected* adversary rung scores 24:

| Compared against | Separation |
| --- | --- |
| Archived publishers (worst 10) | **+14 points** |
| Including the unarchived alias (worst 40) | **−16 points** — they overlap |

So the model does separate placement from publishing, but only on outlets with
an archive record. Where the archive knows nothing, an adversary rung and a
legitimate site occupy the same band, and both are held apart from an accusation
only by the threshold sitting at 45 above them.

That is one weakness seen from two directions, and it is the same one named in
*The one warning*: **hostnames the Wayback Machine has no record of** — new
outlets and alias domains. The archive signal carries most of the model's
discriminating power, so where it is absent, discrimination is absent too.

Two consequences worth stating rather than leaving to be derived. *Elevated*
must be read as "look closer", never as a soft accusation — which is what the
plain-language wording already does, now for a measured reason. And the obvious
improvement is not a better weight but a second independent legitimacy signal
that does not depend on Wayback coverage.

## Weight sensitivity

The weights are hand-set, which invites a fair objection: are the headline
numbers real, or are they a fit to this corpus at exactly these values? So every
weight is perturbed and the whole measurement re-run.

| Perturbation | Publishers accused (of 79 held out) | Adversary rungs missed (of 8) |
| --- | --- | --- |
| all weights −20% | 0 | 2 |
| all weights +20% | 1 | 0 |
| suspicion −25%, legitimacy unchanged | 0 | 3 |
| legitimacy −25%, suspicion unchanged | 0 | 0 |

Read honestly: the model is **not** knife-edge — the harmful failure, accusing a
real publisher, stays at 0 or 1 across every perturbation — but it is **not
insensitive either**. Weakening the suspicion signals by a quarter loses three
rungs. The numbers are a real operating point, not the only one that works, and
not a plateau.

The gates reflect that asymmetry. False accusations must stay rare under
re-tuning; detection is allowed to degrade, because a missed campaign leaves the
reader where they already were, while a false accusation lands on a newsroom.

## The ceiling, stated plainly

**Rung 8 is not detected, and this is not a bug to be quietly excluded from the
denominator.**

An operation that registers a domain, publishes real content continuously for
six years, names its authors, and maintains an about page is not distinguishable
from a publisher *by these signals* — because on these signals it is not
different from one. Detecting it needs evidence this tool does not have: funding
records, ownership registries, cross-domain coordination analysis.

The honest claim is therefore bounded: **Facts Only raises the cost of placement
from one character to a six-year operation.** It does not make placement
impossible, and it never says a source is fake — it says what it observed and
shows the reader where to look.

## Changing the weights

`SIGNAL_WEIGHTS` in `extension/engine/sourceScore.js` is the model. Change a
number and `npm run eval` immediately tells you what it cost:

```
PASS  no legitimate publisher is accused of placement
PASS  at most 10% of legitimate publishers get any warning
PASS  every adversary rung below the ceiling is detected
PASS  detection beats the rule it replaced
PASS  false positives beat the rule they replaced
```

These gates run in CI and fail the build. Loosening one should be a visible,
argued commit — particularly the first, because a false accusation lands on a
real newsroom.

## Known limits of this evaluation

- **The adversary is synthetic.** It models documented techniques, but a real
  operation will do something not on the ladder. Rungs and technique variants
  should be added as new methods are published — that is the maintenance this
  file asks for.
- **The corpus measures the archive signal most strongly**, because that is what
  the collector gathers. Page-level signals (byline, about page) are supplied as
  worst-case assumptions rather than crawled.
- **Page bodies are synthetic, though they are now measured.** This used to read
  as a gap rather than a limit: rows were built with `excerpt: ""`, so
  `sponsored` and `ai-generated-text` — the two signals that read page *text* —
  contributed nothing to the 0/111. That blind spot is why a bare word match on
  `sponsored` survived in shipped code until it was found by hand.

  Every outlet now gets a full HTML page run through the same extraction path
  the profiler uses, and the shapes are the ones that actually caused false
  positives: ad-slot furniture around clean reporting, an investigation *into*
  paid placement, and an explainer quoting the AI tell-tale phrase. 104 of 209
  rows carry paid-content bait and 52 quote the AI phrase, and a CI gate fails
  if that coverage is ever removed again. The remaining limit is real but
  narrower: the bodies are written, not crawled, so they test the shapes that
  are known to break the detector rather than the full variety of the web.
- **209 outlets is still small.** It is more than enough to have caught the 100%
  false-positive rate of the previous rule, and enough to say the current rate is
  under a couple of percent. It is not enough to distinguish 0.5% from 0.05%.
- **No recall measurement against real campaigns.** Rung 0 is modelled on a
  documented case, but modelling a case is not the same as measuring against a
  labelled corpus of real ones. No such corpus exists publicly with permission to
  redistribute, and this repository will not assemble one by accusing domains on
  the strength of its own heuristics — that is circular, and it is the exact
  harm the false-positive half of this evaluation exists to prevent. If a
  peer-reviewed or press-verified dataset becomes available, it belongs here and
  the recall number should be published beside the rest.
