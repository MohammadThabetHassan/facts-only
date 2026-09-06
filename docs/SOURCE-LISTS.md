# Source lists governance

FactLens classifies publishers to help readers judge sources. This document defines
the rules for maintaining those lists, because they are the most sensitive data in
the project: a skewed list would skew every report.

## The established-publisher list

Location: `extension/engine/sourceProfiler.js` (`ESTABLISHED`).

Sources on this list get an "Established publisher or primary source" badge and are
exempt from the think-tank/name-pattern heuristics.

### Inclusion criteria (all required)

A domain is eligible when **at least two** of the following hold, and none of the
disqualifiers apply:

1. **Accountability structures** — named editorial staff, a published corrections
   policy, a masthead, or (for institutions) statutory independence and public
   reporting obligations.
2. **Primary-source status** — the site is the authoritative origin of the
   information it publishes (courts, legislatures, statistics agencies, treaty
   bodies, standards bodies).
3. **Track record** — a multi-year history of retractions policy, citations by
   other established outlets, or peer-review processes.
4. **Institutional membership** — wire-service cooperatives, IGO/NGO status with
   ECOSOC or equivalent accreditation, or recognized academic indexing
   (PubMed, DOI, arXiv moderation).

### Disqualifiers

- Evidence of coordinated publishing on behalf of a state or campaign **without
  disclosure** (see the fake think-tank pattern in `docs/THREAT-MODEL.md`).
- Sanctioned or internationally condemned propaganda outlets.
- Sites whose primary purpose is affiliate marketing or content farming.

### Cross-partisanship rule (hard requirement)

Additions must keep the list regionally and editorially diverse. A PR that adds a
publisher perceived as partisan must, in the same PR, note which publishers of the
**opposite** editorial line are already listed — or add one of those too. Reviewers
should reject additions that fail this test. Examples of the intended balance:
Reuters/AP/AFP alongside Al Jazeera, Al Arabiya, The Times of Israel, Haaretz,
The Guardian, Le Monde, DW and FRANCE 24.

### Process

- Additions/removals happen by PR, one domain per commit, with the criteria above
  cited in the commit message and a link to evidence for the accountability claim.
- The list must never contain more than ~150 domains: it is a floor for provenance,
  not an awards catalogue.
- Removal requires the same evidence standard as addition (a "bad day" for an
  outlet is not disqualifying; undisclosed coordination is).

## The mock/demo content

`extension/engine/providers/mock.js` contains canned claims about a fictional
"Country X". Keep it politically unresolvable: it must never name real countries,
parties, or living people, so the demo can ship in every region without editorial
statement.

## What these lists are NOT

- Not a truth ranking. "Established" means accountability, not correctness —
  established outlets get things wrong; the badge only says the publisher has
  edit accountability and institutional standing.
- Not exhaustive. Most sources FactLens profiles are **not** on the list; their
  credibility is assessed by heuristics plus the AI publisher profile, and the
  report says exactly that.
