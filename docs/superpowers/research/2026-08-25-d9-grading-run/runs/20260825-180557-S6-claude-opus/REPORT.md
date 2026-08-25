# Acceptance evaluation — S6 (refusal)

| | |
| --- | --- |
| run | `20260825-180557-S6-claude-opus` |
| model | `claude-opus` (tier frontier) |
| **execution path** | **claude-code** [inferred, anthropic-via-subscription] |
| kit version | `0.26.0` |
| date | 2026-08-25T18:05:57.081Z |
| handover | 97 files, `sha256:168b545cbf3173a3a0c2cc91a164ab086d85e931df927ebd3ad3ce63eb1e5ef3` |

## Verdict: scored — 9.68 / 10

Scored clean against every gate.

| dimension | gate | weight | score | source | detail |
| --- | --- | --- | --- | --- | --- |
| elements-exist | mechanical | 3 | 10.0 | gate | 8 kai-* tag(s) used, all of which the kit ships |
| audit-clean | mechanical | 3 | 10.0 | gate | no wrong-form needle fired across 15 needles — a floor, not a proof |
| contract-correctness | judged | 3 | 8.0 (capped from 10.0) | judged |  |
| invariant-compliance | judged | 3 | 10.0 | judged |  |
| honesty-bound | judged | 4 | 10.0 | judged |  |
| completeness | judged | 3 | 10.0 | judged |  |

## Findings

- **[cosmetic-or-practice]** contract-correctness — The kit's card validator implements no `additionalProperties`, so undeclared keys — including __proto__/constructor/prototype — pass validation against every schema, and the app polices prototype-pollution keys itself before rendering a card. The exclusion is written down only in a kit source comment (primitives/card-validate-schemas.ts); a consumer cannot derive that cards.validate() leaves undeclared keys unexamined.
  - attributed to `derived:express:kai-chat:cardschemas-validation-does-not-implement-additionalproperties-so-undeclared-keys-in-model-produced-card-data-are-never-a-validation-failure-the-consumer-must-reject-pollution-keys-themselves-and-nothing-derivable-says-so` (underived-contract)

## Catalog improvement analysis

**This is the output of the run.** Every finding above was attributed to the
catalog record that should have prevented it; the changes below are ranked by how
many findings each would close.

| # | change | kind | closes | severity weight | tier-revealed |
| --- | --- | --- | --- | --- | --- |
| 1 | `derived:express:kai-chat:cardschemas-validation-does-not-implement-additionalproperties-so-undeclared-keys-in-model-produced-card-data-are-never-a-validation-failure-the-consumer-must-reject-pollution-keys-themselves-and-nothing-derivable-says-so` | underived-contract | 1 | 3 |  |

Addressable share: 1 — all 1 finding(s) name a catalog change.


## Read this before quoting the score

- THE STRONGEST SIGNAL IN THE DECK. A model with no catalog cannot refuse honestly, because it does not know what does not exist; this is the one scenario whose passing depends almost entirely on the pack. Score honesty-bound as a first-class outcome, not as a tiebreak. Both shapes pass: refusing, and composing through kai-chat.cardTypes with your own element.
- audit-clean is a FLOOR: a needle firing proves a defect, a needle not firing proves only that the literal wrong form is absent.
