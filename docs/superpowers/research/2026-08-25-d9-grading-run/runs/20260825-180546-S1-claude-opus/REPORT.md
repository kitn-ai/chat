# Acceptance evaluation — S1 (surface recipe applied to an existing tree)

| | |
| --- | --- |
| run | `20260825-180546-S1-claude-opus` |
| model | `claude-opus` (tier frontier) |
| **execution path** | **claude-code** [inferred, anthropic-via-subscription] |
| kit version | `0.26.0` |
| date | 2026-08-25T18:05:46.710Z |
| handover | 97 files, `sha256:4828ca0af2c88046e25d902f581ea120eacdbfdf0e75fed117349e8e01873d6a` |

## Verdict: scored — 9.77 / 10

Scored clean against every gate.

| dimension | gate | weight | score | source | detail |
| --- | --- | --- | --- | --- | --- |
| elements-exist | mechanical | 3 | 10.0 | gate | 3 kai-* tag(s) used, all of which the kit ships |
| audit-clean | mechanical | 3 | 10.0 | gate | no wrong-form needle fired across 15 needles — a floor, not a proof |
| compiles | mechanical | 3 | 10.0 | gate | tsc --strict clean over 5 unit(s) under the default consumer project (framework react), resolving @kitn.ai/ui through the shipped exports map. |
| registers | mechanical | 2 | 10.0 | gate | Live browser probe 2026-08-25 (Chrome, vite dev :5180, keyless mock mode): kai-chat 1424x1074, kai-workspace 1712x1116, kai-conversations 280x1074 — every element the output uses is defined in customElements and renders non-empty (populated shadow roots). |
| contract-correctness | judged | 3 | 8.0 (capped from 10.0) | judged |  |
| invariant-compliance | judged | 3 | 10.0 | judged |  |
| wiring-topology | judged | 2 | 10.0 | judged |  |
| honesty-bound | judged | 4 | 10.0 | judged |  |
| completeness | judged | 3 | 10.0 | judged |  |

## Findings

- **[cosmetic-or-practice]** contract-correctness — kai-toast-region's stacking contract (z-index 100 in the host page) is documented nowhere a consumer can derive. The app's first cut buried the delete-Undo toast under its own fixed-position layout (rung-3 IVP point 4); the shipped CSS carries the fix plus a comment naming the contract by hand, which is the tell that the contract is underived.
  - attributed to `derived:express:kai-toast-region:the-element-renders-at-z-index-100-and-is-trivially-buried-by-consumer-fixed-position-stacking-contexts-nothing-in-the-derived-layer-or-element-page-states-the-stacking-contract-or-what-the-host-must-not-do` (underived-contract)

## Catalog improvement analysis

**This is the output of the run.** Every finding above was attributed to the
catalog record that should have prevented it; the changes below are ranked by how
many findings each would close.

| # | change | kind | closes | severity weight | tier-revealed |
| --- | --- | --- | --- | --- | --- |
| 1 | `derived:express:kai-toast-region:the-element-renders-at-z-index-100-and-is-trivially-buried-by-consumer-fixed-position-stacking-contexts-nothing-in-the-derived-layer-or-element-page-states-the-stacking-contract-or-what-the-host-must-not-do` | underived-contract | 1 | 3 |  |

Addressable share: 1 — all 1 finding(s) name a catalog change.


## Read this before quoting the score

- audit-clean is a FLOOR: a needle firing proves a defect, a needle not firing proves only that the literal wrong form is absent.
