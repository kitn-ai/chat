# Aurora clean-room evidence

Copies of the load-bearing artifacts from the audio-visualizer session workspace,
preserved here because the originals live in a gitignored directory
(`.superpowers/sdd/2026-08-07-audio-visualizers/reference/aura-prototype/`) that
no build depends on and that anyone could delete without noticing.

These are copies, not the working originals. They were copied on 2026-08-10 and
verified byte-identical to their sources; `MANIFEST.sha256` records the digests.
The narrative that explains what they prove is [`../aurora-clean-room.md`](../aurora-clean-room.md).

## What each file is

| File | What it is |
| --- | --- |
| `aura-shader-handoff.md` | The prototype author's own record: what they measured off rendered video, the constructions they tried and rejected, and (section 8) the two-team clean-room arrangement in their own words. The single best process document. |
| `aura-prototype-README.md` | The handoff package's index. States the binding rules the session ran under, including "never open" the restricted files, and the provenance tiers for the three prototype modes. |
| `aura-proto.html` | The prototype itself -- a self-contained WebGL page with three shader modes. Mode 3 ("veil") is the intermediate hop between the fact sheet and the shipped shader. Original work; contains no third-party source. |
| `analyze.mjs` | Metrics extractor. Reads PNG frames and prints ring radius, band width, peak luminance, white fraction, saturation, and per-sector thickness. |
| `capture-livekit.mjs` | Capture harness. Drives LiveKit's public demo page in Chromium and screenshots the rendered canvas at 2x DPR. Observes pixels only. |
| `measure-travel.mjs` | Angular thickness-profile correlation over time -- the measurement that showed the reference motion flaps rather than rotates. |
| `livekit-reground.md` | Upstream re-grounding analysis from a full read of `livekit/components-js`. Section 7 is the file-by-file **license map** that establishes which aura file is Polyform-restricted and which is Apache-2.0 -- the citation behind section 7 of the provenance doc. Preserved because the original lived in a temporary session scratchpad. |
| `MANIFEST.sha256` | Digests for everything above, plus the artifacts held off-repo. |

## What is deliberately not here

**`lk-aura-factsheet.md`** -- the functional spec. It is hash-pinned in the
manifest and held in the off-repo mirror, but not committed. This repository is
public, and publishing a complete functional specification of a third party's
commercially licensed shader is a decision for the owner and counsel, not a
side effect of an evidence-preservation task. Reasoning in
[`../aurora-clean-room.md`](../aurora-clean-room.md) section 9.

**The bulk media** -- `aura-compare.mp4`, `lk-compare.mp4`, and the five frame
directories (roughly 290 PNGs). Screenshots of rendered output, too large to
track, listed with counts in the manifest.

**Anything from the restricted source.** No file here contains, quotes, or
paraphrases `agent-audio-visualizer-aura.tsx` or
`use-agent-audio-visualizer-aura.ts`. Each file copied here was read in full
before copying and checked for third-party source; the two references to LiveKit
inside `aura-proto.html` are comments describing measured on-screen behaviour of
their public demo.

## Where the originals are

- Session workspace (gitignored):
  `.superpowers/sdd/2026-08-07-audio-visualizers/reference/aura-prototype/`
- Off-repo mirror (survives worktree deletion):
  `/Users/home/Projects/kitn-ai/aurora-prototype/`

Both were present on 2026-08-10 and the fact sheet was confirmed identical in
each. Neither is a backup in any durable sense -- both sit on one developer
machine. If this record matters, the off-repo mirror belongs somewhere with
retention guarantees.
