# Aurora shader: clean-room provenance record

**Status:** record of what happened, compiled 2026-08-10. Not a legal opinion.
**Subject:** `packages/ui/src/components/audio-visualizer/aurora.glsl.ts` in `@kitn.ai/ui`.

This document exists so the separation described in it can be checked by someone
who was not here. Where a claim was verified first-hand while writing this, it
says so. Where it is relayed from the project ledger, it says that instead. The
difference matters, so it is marked throughout.

---

## 1. What the aurora is, and what it is not

`aurora.glsl.ts` is a WebGL fragment shader written for `@kitn.ai/ui`. It draws a
ring of drifting luminous veils that respond to microphone volume, and it ships
as the `aurora` variant of `<kai-audio-visualizer>`.

It is original work. It is **not** a copy, port, translation, or adaptation of
LiveKit's `agent-audio-visualizer-aura.tsx` or of the aura shader inlined inside
it. That component is licensed under the Polyform Non-Resale License 1.0.0,
copyright UNCRN LLC, which is incompatible with publishing this package. Its
sibling driving hook is Apache-2.0 and is a different matter entirely; section 7
separates the two, and the distinction is load-bearing.

The aurora is, however, **intended to look like** LiveKit's aura. That is the
whole point of the exercise and this document does not pretend otherwise. The
question a reader should be asking is how a deliberate look-alike was built
without copying, and that is what sections 3 through 6 answer.

Two things are true at once and both belong in the record:

- No one on this project has opened the restricted component or its shader.
- The shader's numeric constants trace to a functional specification that a
  separate agent produced *by* reading them.

Section 8 states the residual risk that follows from the second point.

## 2. What clean-room derivation is, and why it was used

Copyright protects expression, not function. In US law that line is codified at
17 U.S.C. section 102(b), which excludes any "idea, procedure, process, system,
method of operation" from copyright regardless of how it is described. Facts,
mathematics, and the behaviour of a program are on the unprotected side of it;
the particular source text that implements them is on the protected side.

Clean-room derivation (also "Chinese wall" derivation) turns that distinction
into a procedure. One team reads the protected work and writes a functional
description containing only unprotected material. A second team, which never
sees the protected work, implements from that description alone. If the wall
holds, the second team's output cannot be a copy of expression it never saw.

The canonical example is Phoenix Technologies' 1984 reimplementation of the IBM
PC BIOS, which used exactly this two-team structure and made the PC-compatible
industry possible. The technique is standard practice, not an exotic manoeuvre.

Its protection is only as good as the evidence that the wall was real. A
clean-room claim that cannot be substantiated later is worth nothing. That is
why this record exists and why section 10 pins the artifacts.

## 3. The two-team structure, as it actually happened

There were four hops, not two. Being precise about them matters, because the
implementer of the shipped file read the fact sheet directly rather than working
only from the prototype.

```
LiveKit's aura source (Polyform, restricted)
   |
   |  read by ONE analyst agent, authorized by the project owner
   v
lk-aura-factsheet.md          <-- THE WALL
   |
   +----------------------------+
   |                            |
   v                            v
aura-proto.html mode 3      aurora.glsl.ts
("veil" prototype)          (the shipped shader)
   |                            ^
   +----------------------------+
        adopted as reference implementation
                                |
                                |  measured against rendered output only
                                v
                     parity re-tune (commit 9020656)
```

**Hop 1 -- the analyst.** A separate agent read the restricted source and wrote
`lk-aura-factsheet.md`: facts, constants, and mathematics, with original
notation. That agent produced nothing else and touched no shipped file. The
arrangement is recorded in the prototype author's own words in
`aura-shader-handoff.md` section 8, written at the time rather than
reconstructed afterwards.

**Hop 2 -- the prototype.** A different author implemented mode 3 ("veil") of
`aura-proto.html` from the fact sheet alone, and never saw the restricted
source. That author had already built modes 1 ("braid") and 2 ("wind") purely
from measurements of rendered video, before the fact sheet existed. Those two
modes are unrelated to this record; they are noted because their existence shows
the author was working from observation, not source, from the start.

**Hop 3 -- the shipped shader.** The Task 14 implementer wrote
`aurora.glsl.ts` from two inputs: the fact sheet, and the prototype's mode 3.
Both are named in the file's own header. This author likewise never saw the
restricted source.

**Hop 4 -- the parity re-tune.** A later campaign re-tuned the shipped shader to
targets measured off rendered pixels. Section 5 covers it.

The wall sits between hop 1 and hop 2. Everything downstream of it saw the fact
sheet; nothing downstream of it saw the source.

## 4. Was the wall clean? What the fact sheet actually contains

**Verified first-hand for this document.** `lk-aura-factsheet.md` (10,949 bytes,
SHA-256 `caa746d6...3670f15`) was read in full and scanned mechanically. The
finding, stated plainly:

**It contains no code.** No code fences. No GLSL statements, declarations,
function bodies, or expressions. No verbatim comments. No control flow. Grepping
for GLSL keywords returns nine hits and every one is English prose about the
program rather than program text -- "Fragment precision highp", "the resolution
uniform", "Uniform inventory", and similar. The mathematics is written in
original notation (`M_k`, `v_k`, `phi_j`, `tau`, `sigma`) with `<-` for
assignment, which is not the notation of any programming language.

**It does contain identifiers, and the shipped header is wrong to say it does
not.** Two sets crossed the wall:

- The shader's **uniform inventory**: `uColor`, `uColorShift`, `uSpeed`,
  `uBlur`, `uScale`, `uShape`, `uFrequency`, `uAmplitude`, `uBloom`, `uMix`,
  `uSpacing`, `uVariance`, `uSmoothing`, `uMode`. These are internal names, not
  observable without reading the source.
- The component's **public prop names**: `size`, `state`, `color`, `colorShift`,
  `volume`, `speed`, `amplitude`, `frequency`, `scale`, `blur`, `brightness`,
  `themeMode`, `shape`. These are documented public API, observable from
  LiveKit's own reference page without any source access.

The fact sheet is candid about this. Its second line declares those two sets as
"the only shared names", so the disclosure was deliberate and contemporaneous,
not something discovered later. The remaining camelCase tokens in the file are
standard Web APIs (`requestAnimationFrame`, `devicePixelRatio`, `fftSize`,
`smoothingTimeConstant`) and one term the fact sheet coins itself (`freqParam`).

**Where the existing record overclaims.** Both of these say "no identifiers":

- `aurora.glsl.ts` header, line 9: "facts and mathematics, no code, no
  identifiers"
- `aura-shader-handoff.md` section 8: "no code, no identifiers, no expression"

That is inaccurate. The accurate statement is "no code, no expression, and no
identifiers beyond the public prop names and the uniform inventory, both
disclosed in the fact sheet's own preamble". Correcting those two headers is
recommended and is listed in section 9.

**Does the leak reach the shipped file?** Largely no, and the overlap that
exists is independently sourced. `aurora.glsl.ts` declares eight uniforms:
`uColor`, `uIntensity`, `uSpeed`, `uComplexity`, `uAmplitude`, `uScale`,
`uRotation`, `uTheme`. Four of them (`uColor`, `uIntensity`, `uSpeed`,
`uComplexity`) are this project's own shader contract, fixed in the
implementation plan for every shader variant before the fact sheet existed
(`docs/superpowers/plans/2026-08-07-audio-visualizers.md`, line 3951). `uTheme`
and `uRotation` have no counterpart in the inventory. That leaves `uAmplitude`
and `uScale` as genuine overlaps, both of which are also the names of the fact
sheet's own state-table columns and are about as generic as GLSL uniform names
get. Nine of the fourteen inventory names appear nowhere in our tree.

## 5. Independent-derivation evidence

The strongest evidence that the shader was derived rather than transcribed is
arithmetic, and it is checkable by anyone.

The fact sheet gives a base matrix `M_0`, a rotation `B` of 53.13 degrees, the
rule `M_{k+1} = B compose M_k`, and the four displacement directions `v_0..v_3`
rounded to three decimals. It does **not** give `M_1`, `M_2`, or `M_3`. Those
matrices appear only in our shader, which means they had to be computed.

**Verified first-hand for this document.** Composing `B` with `M_0` three times
reproduces all three unlisted matrices, and all four match the shipped
`mat2` constants exactly once GLSL's column-major argument order is accounted
for:

| | derived | shipped `mat2` | max delta |
|---|---|---|---|
| `M_0` | `[[0.6, -0.25], [0.25, 0.9]]` | `WARP_M0` | 0 |
| `M_1` | `[[0.16, -0.87], [0.63, 0.34]]` | `WARP_M1` | 1.1e-16 |
| `M_2` | `[[-0.408, -0.794], [0.506, -0.492]]` | `WARP_M2` | 1.7e-16 |
| `M_3` | `[[-0.6496, -0.0828], [-0.0228, -0.9304]]` | `WARP_M3` | 1.8e-16 |

The deltas are floating-point noise. This corroborates, by an independent route,
the ledger's record that the Task 14 reviewer performed the same re-derivation by
hand at the time (`progress.md`, Task 14 line).

One detail carries more weight than the match itself. `WARP_M3` is
`(-0.6496, -0.0228, -0.0828, -0.9304)` -- four decimal places. The only place
those numbers appear in the fact sheet is `v_3`, rounded to `(-0.650, -0.083)`.
An author copying from the fact sheet could not have produced `WARP_M3`, because
the precision needed is not in the document. They had to compose the rotation
themselves. That is affirmative evidence of derivation, not merely an absence of
evidence of copying.

The rest of the construction is stated openly in the shader's own header and can
be read against the fact sheet section by section: 36 phase-offset copies of one
ring, a 4-octave directional-sine warp cascade with lacunarity 1.4, and an
analytic neighbour-distance blur (`e^(2*spacing) - 1`) that fuses the strands
into veils.

## 6. What came from measuring rendered output

A large part of the shipped shader's final appearance was set by measuring
pixels, not by reading anything.

Measuring a rendered image is categorically different from copying code. A
screenshot of a running program is an observation of its behaviour. Behaviour is
function, and function is outside copyright's scope (section 2). Nothing in a
pixel measurement carries any of the source's expression: it cannot tell you how
a value was computed, what the variables were called, or how the program was
structured. It tells you only what appeared on screen. Reverse engineering by
observation of a lawfully accessible public demo is the same activity as
measuring a competitor's product with a ruler.

**Relayed from the ledger and campaign handoff** (not re-measured for this
document): the parity campaign (commit `9020656`) set these from measurement --
hue near 197 degrees with saturation near 0.95 rising with brightness; per-state
rotation rates and the clockwise direction of drift; brightness compression
ranges, so the thinking and connecting pulse renders inside roughly 0.53 to 0.65
mean brightness instead of blinking the ring out at pulse minima; idle
brightness; asymmetric edge rise distances, with the outer edge sharper than the
inner; and the radius-versus-volume fit, reported as 43.5/44.7 against the
reference's 43.9/44.8. Earlier measurement rounds established that the reference
never reaches white, that its motion flaps rather than rotates, and that radius
is the dominant audio axis.

The shader's own header documents four deliberate departures from the fact sheet
that came out of this work, including a true premultiplied-alpha output that the
described pipeline does not have.

Instruments, all tracked in git under `examples/internal/livekit-parity/scripts/`:

| Instrument | What it measures |
| --- | --- |
| `aurora-audit.mjs` | The main audit. Radius versus volume, rotation rate and direction per state, lobe count, deform rate, listening-entry spring overshoot, state pulses, saturation, white clipping, centre transparency, edge sharpness, reduced motion. Both sides cropped from one screenshot so the instants match. |
| `aurora-followup.mjs` | Second-round probes at full precision. |
| `lib/aura-metrics.mjs` | Shared radial metric extraction. |
| `parity-acceptance.mjs` | Four locked comparative assertions, recorded as proven red before alignment and green after. |
| `thinking-audit.mjs`, `their-disconnected-audit.mjs` | Per-state behaviour. |
| `verify.mjs` | Harness entry point. |

Earlier instruments from the prototype session, preserved in
`docs/provenance/evidence/`: `capture-livekit.mjs` (screenshots LiveKit's public
demo at 2x DPR), `analyze.mjs` (extracts radius, band width, peak luminance,
white fraction, saturation, sector thickness), `measure-travel.mjs` (angular
correlation over time).

`aurora-audit.mjs` states the rule in its own header comment: "BLACK-BOX on their
side: only rendered pixels are observed."

## 7. What we read, what we never read, and how that was enforced

### Read and relied on, Apache-2.0

LiveKit's `components-js` is Apache-2.0. Eight files in this package are ports or
verbatim copies of it, each enumerated in `packages/ui/NOTICE` with its upstream
path: `audio-bands.ts`, `visualizer-sequences.ts`, `sizes.ts`, the bar, grid,
radial, and wave variants, and `wave.glsl.ts` (verbatim). The ledger records that
a reviewer byte-diffed the extracted wave GLSL against upstream via the GitHub
API and found zero differences. None of these is an aurora input.

A ninth entry, `variant-aurora.tsx`, is listed separately: it borrows animation
values from the Apache-2.0 aura driving hook without porting any code. The two
subsections below explain why that file is a different case.

### The aura is two files under two different licenses

This distinction is the single most important fact in this section, and it is
what makes the behavioural parity work in section 6 legitimate. LiveKit's aura
is not one artifact:

| File | License | Basis | Status here |
| --- | --- | --- | --- |
| `agent-audio-visualizer-aura.tsx`, **including the aura GLSL inlined in it** | **Polyform Non-Resale 1.0.0, (c) 2026 UNCRN LLC (Unicorn Studio)** | its own file header; the only Polyform hit in the whole repository | **never opened** |
| `use-agent-audio-visualizer-aura.ts`, the **driving hook** | **Apache-2.0** | repo license, no Polyform header | read, legitimately |

The restriction attaches to the component and its shader internals. It does not
attach to the hook. The hook holds the per-state behaviour -- state targets,
pulse cadences, the volume-to-scale mapping, the listening spring, and the guard
conditions -- and it is ordinary Apache-2.0 code in an Apache-2.0 repository,
the same as the bar, grid, radial, and wave hooks this package already ports
under `NOTICE`.

Source for the license map: a full upstream read by a prior agent, which
establishes each file's license from its own header and from a repository-wide
search for Polyform headers. **Verified first-hand for this document** by
reading it; not verified against the upstream files themselves, since the
restricted one must not be opened.

That analysis was written to a temporary session scratchpad, which would have
made the citation behind the most important fact in this section unreachable
within weeks. It is preserved at
`docs/provenance/evidence/livekit-reground.md` (license map at section 7,
aura breakdown at section 5) and hash-pinned in the manifest.

An earlier draft of this document treated the two files as jointly restricted
and flagged the record as self-contradictory. That was wrong, and the error was
in the draft rather than in the project's record: the campaign handoff (line 88)
and the comment in `variant-aurora.tsx` (line 182) that refer to "the Apache
driving hook" were correct all along.

**What this narrows.** The per-state numbers in `auroraTargets` -- speed, scale,
amplitude, frequency, and the brightness pulses for every state, plus the
listening spring at 1.0 s and bounce 0.35, plus the analyser's fftSize 512 and
smoothing 0.55 -- are all available from the Apache-2.0 hook directly. They also
appear in fact sheet section 5, but they do not depend on it. What the fact
sheet uniquely supplied is the **shader interior**: the rendering architecture,
the warp cascade and strand family, the shader-side constants, the colour
pipeline, and the uniform inventory. The restricted-source-derived surface is
therefore the shader math, not the component's behaviour.

### Never read

`agent-audio-visualizer-aura.tsx` and the aura shader inlined in it. Nothing
else.

### Controls that enforced it

- The parity harness vendors upstream sources at setup time into
  `examples/internal/livekit-parity/src/vendor/`, which is **gitignored**. The
  ignore rule carries its reason inline: "agent-audio-visualizer-aura.tsx is
  Polyform Non-Resale (c) UNCRN LLC and must not enter this Apache-2.0 repo's
  history."
- `scripts/setup.sh` repeats the rule in its header and again in its closing
  output: run locally for black-box visual comparison only, never commit, never
  copy from it.
- The prohibition was restated in every agent dispatch, and is recorded as a
  standing rule in the prototype README ("Never open ... Unchanged"), the
  campaign handoff ("License rule, non-negotiable"), and the ledger.
- **Verified first-hand:** `git log --all` over both aura filenames, the
  restricted component and the Apache-2.0 hook, returns nothing. Neither has
  ever existed in this repository's history. The only
  `aura`-named file ever added is
  `examples/internal/livekit-parity/scripts/lib/aura-metrics.mjs`, which is our
  own measurement code.

### The limit of this evidence

That no one opened a file is not provable from artifacts. Controls and git
history show the files never entered the repository and that the rule was stated
everywhere it needed to be; they cannot show what a person or agent did or did
not read on a local machine. The claim rests on the contemporaneous written
record plus the affirmative derivation evidence in section 5. A reader should
weigh it as such.

### The driving hook is attributed in NOTICE (resolved 2026-08-10)

An earlier draft of this document left open whether `NOTICE` should mention the
Apache-2.0 aura driving hook. It now does. `variant-aurora.tsx` is listed with
`use-agent-audio-visualizer-aura.ts` as its source, in a block separate from the
ports list and explicitly described as taking values rather than code.

The reasoning, recorded because the decision is the kind a reader may want to
audit:

- The values are upstream's. Verified line by line for this document: all four
  state rows in `auroraTargets` (speed, scale, amplitude, frequency, brightness),
  the listening spring at 1.0 s and bounce 0.35, the tween and pulse cadences,
  and the analyser settings (fftSize 512, smoothingTimeConstant 0.55) match the
  hook exactly. Only the per-state `rotation` trims are ours, and those came
  from measurement (section 6).
- Apache-2.0 section 4 asks that attribution travel with derivative works.
  Whether a table of animation constants is a "derivative work" is arguable;
  attributing it costs nothing and resolves the argument in the direction of
  more disclosure.
- `NOTICE` already enumerates the bar, grid, radial, and wave hooks for exactly
  this reason. Omitting the aura hook would have left the one file whose
  provenance is most scrutinised looking less carefully handled than its
  siblings, which is the opposite of what this record is for.

The entry is deliberately worded as an attribution, not a port. No code was
copied from the hook, and `NOTICE`'s existing "ports or verbatim copies" list is
left untouched so that its precision is not blunted. `NOTICE` also now states
that this attribution does not extend to `aurora.glsl.ts`: the shader interior
remains original work and owes the hook nothing.

## 8. The open question, stated plainly

The fact sheet describes LiveKit's aura. It was written by reading LiveKit's
restricted aura component. Our shader's interior constants -- 36 strands, the
53.13 degree rotation, lacunarity 1.4, the strand phase span, the colour
pipeline -- come from that description. (The per-state table does not; section 7
shows it is independently available from the Apache-2.0 driving hook. That
narrows the exposure but does not remove it.) So:

- The protection here rests entirely on the integrity of the separation. If the
  wall held, the shader is an independent implementation of unprotected facts and
  mathematics, which is what clean-room derivation is for. If the wall did not
  hold, no amount of documentation fixes that.
- This is a narrower margin than the prototype's other two modes ("braid" and
  "wind"), which were built purely from watching rendered video and never touched
  the fact sheet. The project has treated those as unconditionally shippable and
  the aurora as a decision requiring sign-off. That distinction is deliberate and
  was surfaced rather than resolved by the implementing agents.
- `packages/ui/NOTICE` records the shader's provenance as an unresolved decision
  in the shipped package itself: "This file's own provenance ... is a separate,
  pending decision and is not resolved by this NOTICE." That wording is accurate
  and should not be quietly upgraded to a cleaner claim. The `variant-aurora.tsx`
  attribution added on 2026-08-10 covers the behaviour layer only and leaves this
  question exactly where it was.
- There is a factual overlap that has to be acknowledged rather than argued
  away: our shader reproduces specific numeric constants from a commercial
  product. The clean-room position is that those are facts about how a program
  behaves. That position is well founded and standard, and it is still a
  position rather than a settled outcome.

**This document is a record, not a legal opinion, and its author is not a
lawyer.** If the aurora variant matters commercially -- if it is a selling point,
if it ships in a paid tier, or if it comes up in diligence -- counsel should
review this record and the artifacts in section 10 before that happens.

## 9. Open items

### The fact sheet is not published, by decision

**Ruling, 2026-08-10: `lk-aura-factsheet.md` is not committed to this
repository.** `kitn-ai/ui` is public. Committing the fact sheet would publish a
complete functional specification of a third party's commercially licensed
shader -- constants, colour pipeline, internal uniform names -- in a form that
hands any reader a reimplementation recipe. Publishing it is irreversible once
it is in git history, and it plausibly increases exposure rather than reducing
it.

A clean-room record does not require publication to be valid. It requires the
artifact to **exist and be producible on demand**. Those are different
obligations, and only the second one is binding here.

### Retention: a standing action, not a solved problem

The fact sheet currently exists as a single directory on one developer machine,
in two copies that share one disk:

- `.superpowers/sdd/2026-08-07-audio-visualizers/reference/aura-prototype/` (gitignored)
- `/Users/home/Projects/kitn-ai/aurora-prototype/` (off-repo mirror)

That is not retention. One disk failure, one `rm -rf` of a stale worktree, or
one machine replacement destroys the primary evidence for the clean-room claim
while leaving the shader shipped and the claim unsupportable.

What needs to happen, and it belongs to the repository owner:

1. Put the fact sheet, the prototype package, and `progress.md` somewhere with
   real retention -- an encrypted backup, a private repository, or counsel's
   files. Anywhere that is not this laptop.
2. Record where that is, in a place that survives the person who set it up.

The integrity mechanism is already in place regardless of where the bytes go.
`docs/provenance/evidence/MANIFEST.sha256` pins the fact sheet at SHA-256
`caa746d6...3670f15`. Anyone producing a copy later -- from a backup, from
counsel, from a mirror nobody remembers making -- can hash it and confirm it is
the same document that this record describes. That is what makes a
"producible on demand" artifact worth anything: without the hash, a copy
produced in three years proves nothing about what was actually read in 2026.

### Remaining items

1. **`aura-shader-handoff.md` section 8 still says "no identifiers".** Left as
   found. It is a historical artifact, preserved verbatim as evidence of what
   was written at the time, and rewriting evidence after the fact is exactly the
   wrong instinct. Section 4 of this document records the discrepancy instead.
   The same overclaim in `aurora.glsl.ts` -- a live source file, not evidence --
   **was corrected** on 2026-08-10.
2. ~~`NOTICE` does not mention the Apache-2.0 aura driving hook.~~ **Resolved
   2026-08-10:** it now does. `variant-aurora.tsx` is attributed to
   `use-agent-audio-visualizer-aura.ts` as a values-not-code borrowing, in a
   block separate from the ports list, with an explicit statement that the
   attribution does not reach `aurora.glsl.ts`. Reasoning in section 7.

## 10. Evidence index

Paths are relative to the repository root. "Tracked" means committed to git.

### Primary artifacts

| Artifact | Location | Tracked |
| --- | --- | --- |
| The shipped shader, with its 30-line provenance header | `packages/ui/src/components/audio-visualizer/aurora.glsl.ts` | yes |
| The variant that drives it, with per-state targets sourced in comments | `packages/ui/src/components/audio-visualizer/variant-aurora.tsx` | yes |
| Attribution notice, ships to npm | `packages/ui/NOTICE` | yes |
| Package licence, points at NOTICE | `LICENSE`, `packages/ui/LICENSE` | yes |
| This document | `docs/provenance/aurora-clean-room.md` | yes |

### The wall and the prototype

| Artifact | Location | Tracked |
| --- | --- | --- |
| **`lk-aura-factsheet.md`** -- the functional spec | session workspace + off-repo mirror; hash-pinned only | **no**, see section 9 |
| `aura-shader-handoff.md` -- the prototype author's contemporaneous process record; section 8 describes the two-team arrangement | `docs/provenance/evidence/` | yes (copy) |
| `aura-prototype-README.md` -- binding rules and provenance tiers | `docs/provenance/evidence/` | yes (copy) |
| `aura-proto.html` -- the prototype, mode 3 is the intermediate hop | `docs/provenance/evidence/` | yes (copy) |
| `livekit-reground.md` -- upstream license map, section 7; establishes which aura file is restricted | `docs/provenance/evidence/` | yes (copy) |
| Originals of all of the above | `.superpowers/sdd/2026-08-07-audio-visualizers/reference/aura-prototype/` | no, gitignored |
| Off-repo mirror | `/Users/home/Projects/kitn-ai/aurora-prototype/` | n/a |

### Measurement instruments and captures

| Artifact | Location | Tracked |
| --- | --- | --- |
| Parity audits (`aurora-audit.mjs`, `aurora-followup.mjs`, `parity-acceptance.mjs`, `verify.mjs`, others) | `examples/internal/livekit-parity/scripts/` | yes |
| Prototype-era instruments (`analyze.mjs`, `capture-livekit.mjs`, `measure-travel.mjs`) | `docs/provenance/evidence/` | yes (copies) |
| Reference and comparison frames, roughly 290 PNGs | prototype dir, `lk-frames/`, `aura-frames/`, `aura-burst/`, `my-lk/`, `renders/` | no, counts in manifest |
| Comparison videos `aura-compare.mp4`, `lk-compare.mp4` | prototype dir | no, hash-pinned |
| The owner's reference recording that drove the dark-mode metrics | `/Users/home/Movies/Record It Pro/Video/20260807123245593.mp4` | no |

### Controls

| Artifact | Location | Tracked |
| --- | --- | --- |
| Vendor ignore rule, states the licence reason inline | `examples/internal/livekit-parity/.gitignore` | yes |
| Vendoring script, repeats the rule twice | `examples/internal/livekit-parity/scripts/setup.sh` | yes |
| Vendored upstream sources, including the restricted file | `examples/internal/livekit-parity/src/vendor/` | **no, gitignored by design** |

### Ledger and narrative

| Artifact | Location | Tracked |
| --- | --- | --- |
| SDD ledger: Task 13.5 measurements, Task 14 completion and the reviewer's re-derivation, the clean-room rulings, the open question for the owner | `.superpowers/sdd/2026-08-07-audio-visualizers/progress.md` | no, gitignored |
| Campaign handoff: parity work, licence rule, decisions left open | `docs/superpowers/HANDOFF-audio-visualizers.md` | yes |
| Implementation plan, including the shader uniform contract that predates the fact sheet | `docs/superpowers/plans/2026-08-07-audio-visualizers.md` | yes |
| Integrity manifest for the artifacts above | `docs/provenance/evidence/MANIFEST.sha256` | yes |

### Key commits

| Commit | What |
| --- | --- |
| `b2da9f7..e2b26ff` | Task 14: the aurora shader written and reviewed |
| `9020656` | Parity re-tune from pixel measurements |
| `4c91763` | Connecting-state rotation direction |

The ledger at `progress.md` is gitignored and is the most detailed
contemporaneous account of the derivation. Its Task 14 entries and clean-room
rulings are quoted in substance throughout this document. If this record is ever
needed in earnest, that file should be preserved alongside the fact sheet.
