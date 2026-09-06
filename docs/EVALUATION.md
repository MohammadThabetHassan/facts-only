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

| | result | previous rule |
| --- | --- | --- |
| Legitimate publishers accused of placement | **0 / 111 (0%)** | 111 / 111 (100%) |
| Legitimate publishers given any warning | **1 / 111 (0.9%)** | — |
| Adversary rungs detected (below the ceiling) | **8 / 8 (100%)** | 1 / 8 (12.5%) |
| First rung that slips past | **none below the ceiling** | rung 1 |

"Previous rule" is the binary rule this replaced: *any high-severity flag ⇒ high
risk*, where a question-mark headline was high severity. It is kept in
`eval/run.mjs` and scored on every run, so the improvement is measured rather
than asserted.

## The legitimate corpus

`eval/outlets.json` — 111 publishers, with **real Wayback archive histories**
collected by `eval/collect.mjs` into `eval/corpus.json`.

The list is deliberately hostile to this tool's known weakness. The old detector
could only recognise legitimacy through a 63-domain allowlist that was
overwhelmingly Anglo-American and European; anything outside it was presumed
suspect. That is a structural bias against exactly the independent and
non-Western press that most needs not to be dismissed. So the corpus is weighted
toward outlets that allowlist does **not** contain:

| Group | Outlets | Accused |
| --- | --- | --- |
| South Asia | 8 | 0 |
| Africa | 10 | 0 |
| Middle East | 6 | 0 |
| East Asia | 6 | 0 |
| South-East Asia | 6 | 0 |
| Latin America | 9 | 0 |
| Europe | 18 | 0 |
| Investigative | 11 | 0 |
| Academic | 4 | 0 |
| Policy | 5 | 0 |
| **Research institute** | **22** | **0** |
| Media watch | 6 | 0 |

The **Research institute** group exists to catch a specific way this tool could
defame real organisations. `think-tank-unverified` fires on names containing
*institute*, *observatory*, *foundation*, *forum*, *watch* or *monitor* — and
that is exactly how RAND, Pew, SIPRI, Chatham House, Bruegel, the Lowy Institute
and the Reuters Institute are named. All 22 score clean, because a name is worth
20 points and three decades of continuous archiving is worth −30.

**109 of the 111 are not on the allowlist.** They score clean because a long,
continuously archived publishing history is itself evidence of an ordinary
publisher — legitimacy is earned from the record, not from being on a list
someone maintained by hand.

### The one warning, and why it is left in

`thedailystar.com.bd` scores 40 (*elevated* — a caution, not an accusation). The
Wayback Machine has **no record of that hostname at all**: it is an alias of
`thedailystar.net`, which is separately in the corpus and scores clean.

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
  operation will do something not on the ladder. Rungs should be added as new
  techniques are published.
- **The corpus measures the archive signal most strongly**, because that is what
  the collector gathers. Page-level signals (byline, about page) are supplied as
  worst-case assumptions rather than crawled.
- **111 outlets is still small.** It is more than enough to have caught the 100%
  false-positive rate of the previous rule, and enough to say the current rate is
  under a couple of percent. It is not enough to distinguish 0.5% from 0.05%.
- **No recall measurement against real campaigns**, for the reason given above.
  If a public, documented dataset of AI-targeted influence domains becomes
  available with permission to redistribute, it belongs here.
