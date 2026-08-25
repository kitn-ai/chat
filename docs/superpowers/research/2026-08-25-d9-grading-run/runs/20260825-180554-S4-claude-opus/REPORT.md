# Acceptance evaluation — S4 (whole surface; expected to fail hardest first)

| | |
| --- | --- |
| run | `20260825-180554-S4-claude-opus` |
| model | `claude-opus` (tier frontier) |
| **execution path** | **claude-code** [inferred, anthropic-via-subscription] |
| kit version | `0.26.0` |
| date | 2026-08-25T18:05:54.855Z |
| handover | 97 files, `sha256:bf46542e09cec070e3c01a3c34f4cf67959ce5b13d74151c40f3222f4b3b8979` |

## Verdict: scored — 9.75 / 10

Scored clean against every gate.

| dimension | gate | weight | score | source | detail |
| --- | --- | --- | --- | --- | --- |
| elements-exist | mechanical | 3 | 10.0 | gate | 2 kai-* tag(s) used, all of which the kit ships |
| audit-clean | mechanical | 3 | 10.0 | gate | no wrong-form needle fired across 15 needles — a floor, not a proof |
| compiles | mechanical | 3 | 10.0 | gate | tsc --strict clean over 9 unit(s) under the default consumer project (framework react), resolving @kitn.ai/ui through the shipped exports map. |
| registers | mechanical | 2 | 10.0 | gate | Live browser probe 2026-08-25 (Chrome, vite dev :5181): kai-chat 650x1068, kai-resizable 1712x1068, 2x kai-resizable-item, kai-button, kai-segmented all defined and non-empty; kai-artifact is registered (customElements.get truthy) and mounts in the preview panel only once a version exists — zero instances at idle is the app design, not a failed upgrade. |
| contract-correctness | judged | 3 | 8.0 (capped from 10.0) | judged |  |
| invariant-compliance | judged | 3 | 10.0 | judged |  |
| honesty-bound | judged | 4 | 10.0 | judged |  |
| completeness | judged | 3 | 10.0 | judged |  |

## Findings

- **[cosmetic-or-practice]** contract-correctness — CardSchema's type describes only the subset the kit's validator implements, so the nested `description` properties every authored schema carries — the kit's own seven included — are an excess property against it, and the app's page-version schema needs an `as CardSchema` assertion to compile (recorded in the app's NOTES.md). The type the consumer is handed rejects the shape the kit itself authors.
  - attributed to `derived:express:kai-chat:cardschemas-accepts-schemas-whose-nested-property-description-fields-the-cardschema-type-rejects-the-accepted-vs-validated-schema-shape-is-stated-in-a-source-comment-but-not-derivable-by-a-consumer` (underived-contract)

## Catalog improvement analysis

**This is the output of the run.** Every finding above was attributed to the
catalog record that should have prevented it; the changes below are ranked by how
many findings each would close.

| # | change | kind | closes | severity weight | tier-revealed |
| --- | --- | --- | --- | --- | --- |
| 1 | `derived:express:kai-chat:cardschemas-accepts-schemas-whose-nested-property-description-fields-the-cardschema-type-rejects-the-accepted-vs-validated-schema-shape-is-stated-in-a-source-comment-but-not-derivable-by-a-consumer` | underived-contract | 1 | 3 |  |

Addressable share: 1 — all 1 finding(s) name a catalog change.


## Read this before quoting the score

- Expected to fail hardest, by design. A low score here is information about the recipe layer, not about the model.
- audit-clean is a FLOOR: a needle firing proves a defect, a needle not firing proves only that the literal wrong form is absent.
