# Acceptance evaluation — S5 (platform embed)

| | |
| --- | --- |
| run | `20260825-180555-S5-claude-opus` |
| model | `claude-opus` (tier frontier) |
| **execution path** | **claude-code** [inferred, anthropic-via-subscription] |
| kit version | `0.26.0` |
| date | 2026-08-25T18:05:55.971Z |
| handover | 97 files, `sha256:7ed18d148366200f6578d4dc4a14ae5224e554a0d1c85dc803601c71f4d59101` |

## Verdict: scored — 9.71 / 10

Scored clean against every gate.

| dimension | gate | weight | score | source | detail |
| --- | --- | --- | --- | --- | --- |
| elements-exist | mechanical | 3 | 10.0 | gate | 2 kai-* tag(s) used, all of which the kit ships |
| audit-clean | mechanical | 3 | 10.0 | gate | no wrong-form needle fired across 15 needles — a floor, not a proof |
| registers | mechanical | 2 | 10.0 | gate | Live browser probe 2026-08-25 (Chrome, vite dev :5178, keyless mock mode): kai-dock defined (host box 0x0 by design — fixed-position launcher/panel render from its shadow root), kai-chat 378x598 non-empty; setting dock.open=true opens the panel. Props are set only after customElements.whenDefined per the upgrade-race handling in src/main.ts. |
| contract-correctness | judged | 3 | 10.0 | judged |  |
| invariant-compliance | judged | 3 | 8.0 (capped from 10.0) | judged |  |
| honesty-bound | judged | 4 | 10.0 | judged |  |
| completeness | judged | 3 | 10.0 | judged |  |

## Findings

- **[cosmetic-or-practice]** invariant-compliance — The shipped code carries a defensive comment for an ordering rule no invariant states: encode the thread BEFORE createAssistantStream appends its empty assistant placeholder. The rung-1 clean-room rebuild hit this as a real builder error (findings D-9/G-15: encoded after, sending a thread ending in an empty assistant turn), and only the reference's hand-written comment prevents it here.
  - attributed to `invariant:add:encode-before-stream` (missing-invariant)

## Catalog improvement analysis

**This is the output of the run.** Every finding above was attributed to the
catalog record that should have prevented it; the changes below are ranked by how
many findings each would close.

| # | change | kind | closes | severity weight | tier-revealed |
| --- | --- | --- | --- | --- | --- |
| 1 | `invariant:add:encode-before-stream` | missing-invariant | 1 | 3 |  |

Addressable share: 1 — all 1 finding(s) name a catalog change.


## Read this before quoting the score

- audit-clean is a FLOOR: a needle firing proves a defect, a needle not firing proves only that the literal wrong form is absent.
