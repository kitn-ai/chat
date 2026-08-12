# Cross-model conformance: five configurations, 19 scenarios

**Date:** 2026-08-11 · **Harness:** [`examples/internal/openrouter-spike/HARNESS.md`](../../../examples/internal/openrouter-spike/HARNESS.md) · **Current sweep:** **$0.107054** · **Cumulative for the day:** ~$0.264 ($0.1019 original sweep + $0.052 root-causing and correcting the thinking budget + $0.107054 this re-run)

"A real model drives our UI" used to rest on one model. This is the table.

> ### CORRECTION, 2026-08-11 (later the same day)
>
> **One cell in this table was measuring our own bug and is now green.** The
> `haiku-4.5 (openai wire)` column reported S02 as `n/a` — "the model emits no
> reasoning on this wire" — and §2 below drew a conclusion from it about
> OpenRouter's normalisation layer. **That conclusion was wrong.**
>
> The harness asked for thinking with `reasoning: {effort: 'medium'}`. OpenRouter
> derives an Anthropic budget from `effort` as a percentage of `max_tokens`
> (medium ~= 50%), and this spike caps `max_tokens` at 900 for cost. That derives
> **450 tokens, under Anthropic's documented 1024 floor**, so the provider
> returned no thinking at all — silently, with a 200. Meanwhile the Anthropic-wire
> column asked the same model for a full 1024-token budget. **The two columns were
> never asking for the same thing, which is the one thing that configuration
> exists to guarantee.**
>
> Fixed in `openrouter-proxy.ts` (Anthropic-family models get an explicit budget on
> both wires); guarded by `server/thinking-budget.test.ts`, whose load-bearing
> assertion is cross-wire rather than per-wire. Re-measured live: **S02 on
> `haiku-4.5 (openai wire)` passes**, with 25–30 `reasoning_details` frames,
> `format: anthropic-claude-v1`, and `reasoning_tokens` 111 where it was 0.
>
> **The defect was the whole column, not the one red cell.** `max_tokens: 900` is
> harness-wide, so every Anthropic-family request was under the same derived floor.
> Counted across the re-recorded fixtures:
>
> | | scenario dirs carrying reasoning |
> |---|---|
> | pre-fix | **0 of 13** |
> | post-fix | **13 of 13** |
>
> S02 was merely the only scenario that *asserts* on reasoning, so the only one that
> could go red. The other 18 cells in that column were not wrong — they do not test
> reasoning — but the column as a whole was never exercising "Anthropic model,
> thinking enabled, on the OpenAI wire", which is the entire reason that
> configuration is in the matrix. **A silent 18-cell hole, held open by one green
> column.** The re-recorded fixtures are committed, so the offline suite now replays
> streams that match what live produces.
>
> Corrected numbers are below. The row is marked `pass†`. Everything else in this
> document stands as measured.

## The result

95 cells: **93 pass**, **2 model-behaviour differences**, **zero known gaps**, and **zero UI
failures**. Every cell has a live measurement.

**This supersedes an earlier hedge, in the direction the hedge was protecting against.** For
part of 2026-08-11 this table read "10 cells whose gap is now closed, 4 re-verified by replay,
6 not re-run", with S12 and S13 marked `fixed` rather than `pass` because the library fix
landed *after* the sweep and only a replay backed them. That was the right call on that
evidence. A full live re-run then measured all ten, so the hedge is retired **because the
measurement was taken, not because anyone decided it read as fussy** — the distinction being
the whole point of having hedged.

| scenario | deepseek-v4-flash | haiku-4.5 (anthropic wire) | haiku-4.5 (openai wire) | gpt-5.4-mini | ministral-3b |
|---|---|---|---|---|---|
| S01 plain text | pass | pass | pass | pass | pass |
| S02 reasoning | pass | pass | **pass†** | **pass¶** | **n/a** |
| S03 single tool | pass | pass | pass | pass | pass |
| S04 multi-round tool loop | pass | pass | pass | pass | **n/a** |
| S05 parallel tools | pass | pass\* | pass | pass | pass |
| S06 tool error | pass | pass | pass | pass | pass |
| S06b malformed args | pass | pass | pass | pass | pass |
| S07 confirm card | pass | pass | pass | pass | pass |
| S08 choice card | pass | pass | pass | pass | pass |
| S09 form card | pass | pass | pass | pass | pass |
| S10 tasks card | pass | pass | pass | pass | pass |
| S11 link + embed | pass | pass | pass | pass | pass |
| S12 citations | pass | pass | pass | pass | pass |
| S13 artifact over time | pass | pass | pass | pass | pass |
| S14 attachments | pass | pass | pass | pass | pass |
| S15 interleaving | pass | pass | pass | pass | pass |
| S16 mid-stream error | pass | pass | pass | pass | pass |
| S17 cancel ‡ | pass | pass | pass | pass | pass |
| S18 expand mid-stream | pass | pass | pass | pass | pass |

\* **S05 on the Anthropic wire proves less than the same cell on the OpenAI wire**, so
the two are not interchangeable despite both reading `pass`. The OpenAI fixture
announces both calls up front and INTERLEAVES their argument fragments, correlated
only by `index` — the adversarial shape the adapter exists to survive. Anthropic
cannot produce that: its content blocks stream strictly sequentially, so its cell
tests two complete tool_use blocks arriving one after another. The harness now
carries this per wire (`provesByWire` in `s05-parallel-tools.ts`) and prints it as a
footnote, rather than leaving a reader to infer equivalence from two green cells.

‡ **One of S17's three claims was never measured, in any of these five columns.**
Corrected 2026-08-12. The scenario's `proves` line reads "Stop aborts the stream,
keeps what rendered, and resolves the orphaned tool panel to Error". The third
clause was genuinely tested and the second weakly so. **The first was not tested at
all.**

`during()` located the answer with `bubbles().last()`, which is the **echoed user
prompt** until the assistant emits its first text delta at 176ms. The click landed
at ~50ms, so the check read the prompt's 89 characters, cleared its own
"nothing to cancel" floor of 40 with them, compared the prompt to itself
(`before=89 after=89`), and cancelled during the tool call. Every run. The
assistant's stream was never observed. The 40-character tolerance was also smaller
than a single frame (mean 62, largest 95), so the check would have failed the moment
it ever measured the real thing — **the two defects hid each other, and the first
kept the second from ever being exercised.**

**The behaviour was correct all along**, which is why this is a truth problem rather
than a regression: measured directly afterwards, round 1 totals 623 characters, the
cancelled stream stopped at 355 and held there for the remaining ~1.1s. Nothing in
`packages/ui/src/` was at fault or was changed.

So these five cells published a claim that happened to be true and had not been
tested. That is worth stating plainly rather than quietly re-running: a green cell
and an unmeasured one look identical, which is the whole reason this document
carries footnotes at all.

It surfaced only because the scenario was wired into CI, where different timing let
the locator resolve to the assistant bubble for the first time and the cell went red
on its first real run. **A vacuous pass survives until something changes the timing
it depended on.**

† **This cell read `n/a` until the harness stopped asking for a sub-floor thinking
budget.** See the correction at the top. It is the one cell in this table that was
measuring the harness rather than the model, and it is worth more than its single
green square: an `n/a` that means "the provider cannot do this" and an `n/a` that
means "we asked wrong" are indistinguishable from the table, and only running the
same model down a second wire made the difference visible at all.

¶ **This cell also moved from `n/a` to `pass`, and NOTHING WE DID EXPLAINS IT. Do not
record it as a fix.** The thinking-budget change is gated on `isAnthropicFamily()`, and
`gpt-5.4-mini` is not Anthropic; the provider is `OpenAI` in both recordings. What changed
is the response shape — previously `reasoning.encrypted` only, now `reasoning.summary`
with 153 streamed deltas and 2,111 chars of readable text. **That is provider-side
variance between two runs hours apart**, and attributing it to our work would be a free
win taken on someone else's change.

It also retroactively earns the earlier suspicion. This document previously stated that
GPT "reasons but returns it **encrypted** — the raw chain of thought is never exposed, so
there is no text any UI could render", in the same confident register as the Haiku claim
that turned out to be our own bug. It was not a stable property of the model. **Two of
this table's three "the provider cannot do this" claims did not survive contact with a
second measurement** — one because we asked wrong, one because the provider changed.

`pass` = the behaviour rendered · **`n/a`** = the model did not produce the input the
scenario needs. Not a failure of ours, and the distinction is argued below rather than
asserted.

Every cell was produced twice: once live, once by replaying the recording offline.
The two agree exactly, including the failures. **The corrected S02 cell holds to the
same standard**: live pass recorded in `harness/matrix-reports/haiku-oai.live.json`,
fixture committed, offline replay re-confirmed green against a settled build.

**S12 and S13 now hold to it too.** For part of 2026-08-11 they did not — their fix landed
after the sweep, so only a replay stood behind them and they were marked `fixed` rather
than `pass`. A full live re-run has since measured all ten cells. Why the replay was
*already* evidence rather than a tautology is still worth the section below, because that
argument is what justified trusting the fix before anyone paid to re-measure it.

That replay took two attempts, and the first one is worth recording rather than
quietly dropping: it failed against a `packages/ui/dist/` that a concurrent session
was rebuilding mid-run, with a symptom (`data-kai-phase="running"` never appearing)
that looks nothing like a build race. It reproduced as a pass five minutes later
with no code change. **A conformance failure that cannot be reproduced against a
settled tree is a report about the tree, not about the kit** — the standing repo
rule, met here for the third time.

## The three things that look alike

The brief asked for these to be kept apart. They were, and all three occurred.

### 1. UI failures — none

No scenario failed because something did not render. Where the parts arrived, the
components drew them, on every model and both wires.

### 2. Model-behaviour differences — 2 cells

**Both remaining ones are ministral-3b: S02 and S04.** It started as four. Two were not
model behaviour at all, and neither correction came from re-reading the code:

| configuration | reasoning on the wire | chars |
|---|---|---|
| deepseek-v4-flash | `delta.reasoning` + `reasoning_details` | 494–708 |
| haiku-4.5, anthropic wire | `thinking` block + `thinking_delta` | 519 |
| ~~haiku-4.5, openai wire~~ | ~~**nothing** — only `content` and `role`~~ | ~~0~~ |
| **haiku-4.5, openai wire (corrected)** | `delta.reasoning` + `reasoning_details`, `format: anthropic-claude-v1`, signed | 421–535 |
| ~~gpt-5.4-mini~~ | ~~`reasoning: null` + `reasoning_details: [{type: "reasoning.encrypted"}]`~~ | ~~0~~ |
| **gpt-5.4-mini (re-measured)** | `reasoning.summary`, 153 streamed deltas | 2,111 |
| ministral-3b | **nothing** — the model has no reasoning mode | 0 |

Ministral has no reasoning at all, and that is the only claim in this table of the form
"the provider cannot do this" that has survived being measured twice.

**The two struck rows failed for DIFFERENT reasons, and that is the useful part.** One was
our bug; one was the provider changing under a claim we had written down as a property.
Neither was discovered by inspection — the first needed the same model run down a second
wire, the second needed the same request run again hours later. **A single measurement
cannot distinguish "the provider cannot" from "we asked wrong" from "not today it
didn't".**

**The struck row is the correction, and the original conclusion drawn from it was
exactly backwards.** It read:

> That last row is the useful one, and it is only available because the same model was
> run down both paths: it isolates the loss to the normalisation layer, not to the
> model and not to the kit.

There was no loss to isolate. The normalisation layer surfaces Haiku's thinking
fine; the harness had asked for a budget below the provider's floor and read the
resulting silence as a property of the provider. The reasoning was sound and the
premise was ours.

The row is still the useful one, for the opposite reason: **running the same model
down two wires is what made our own bug visible.** With only the OpenAI column, "no
reasoning" would have looked like a settled fact about OpenRouter. The second column
is what turned it into a discrepancy worth chasing. That is the argument for the
configuration, and it survives the correction intact.

**S04 (multi-round tool loop) on ministral-3b.** The scenario wants three sequential
rounds; ministral emitted all three calls in one batch and settled in two. The tool
panels rendered correctly. The scenario's own failure text says so —
`this is a MODEL behaviour note, not a UI failure` — which is the harness working as
designed.

### 3. Harness failures — 6 cells, found and fixed

The first Anthropic-wire run failed **all six** replay-only scenarios (S05, S06b,
S13, S16, S17, S18). None of it was the UI.

`fixtures/canned/` existed only in OpenAI shape. Under the Anthropic wire those
streams were handed to `readAnthropicStream`, which **does not throw on the wrong
dialect — it parses to nothing**. The app reported "the model stream produced no
chunks" and six assertions timed out waiting for panels that were never going to
appear.

Had the matrix been run without reading the failure text, this would have been
published as "the Anthropic path fails 6 of 19 scenarios." It fails none.

Fixed by teaching `harness/make-canned-fixtures.mjs` to emit both dialects from one
description, and `replayDirFor` to pick by wire. The OpenAI output is
**byte-identical** to what was committed before the refactor (verified by an empty
`git diff`), so the fix cannot have moved the baseline. The negative-control pass
reads the wire from `/api/config` for the same reason.

## What this proves that was not proven before

**The Anthropic wire has now run live.** It never had. `readAnthropicStream`,
`toAnthropicMessages` and the verbatim-thinking round-trip existed only against
hand-written fixtures, and the two Criticals the original review caught were both
Anthropic-shaped. All 13 promptable scenarios pass on it, including S04's
multi-round tool loop — which means thinking blocks were echoed back unmodified
across rounds and the provider accepted them.

Getting there took a real addition, not a config flag: OpenRouter's
`/chat/completions` normalises **every** model onto the OpenAI shape, Anthropic's
included, so pointing `OPENROUTER_MODEL` at an Anthropic model would have exercised
`readOpenAIStream` and proven nothing about the Anthropic path. The spike now
speaks both wires and routes `anthropic/*` through OpenRouter's Anthropic Skin
(`/api/v1/messages`) by default.

**The OpenAI reader is not DeepSeek-shaped.** `openai/gpt-5.4-mini` and
`mistralai/ministral-3b-2512` pass every scenario their capabilities support.

**The floor is low.** A 3B model with no reasoning mode passes 17 of 19. Tool calls,
all six card types, attachments, interleaving, error states — a consumer can build
the full UI on a model costing $0.10 per million tokens.

## Anthropic-specific differences

1. **The tool-choice shape.** Anthropic requires `tool_choice: {type: 'auto'}`, an
   object; the OpenAI wire takes the string `'auto'`. Sending the string is a 400.

2. **`system` is not a message.** It is a top-level field, so the system prompt is
   held as *text* and placed by the wire, not baked into `messages[0]`.

3. **Extended thinking needs headroom, not a share.** `budget_tokens` has a floor of
   1024 and `max_tokens` must strictly exceed it. Reusing the harness's
   `max_tokens: 900` fails outright, and naively passing `max_tokens: 1024` would
   leave the answer zero tokens. The cap is raised *by* the budget.

4. **Content blocks are sequential, and indexed differently.** Anthropic streams
   block 0 to completion before block 1 opens — it does not interleave parallel tool
   calls the way chat-completions does — and its index is a **content block**
   position, so a thinking block ahead of a call pushes that call from 0 to 1. The
   canned parallel-tools fixture is written in the realistic form for each wire
   rather than one form forced onto both.

5. **Verbatim thinking costs ~7% more prompt tokens, NOT 2.2x.** ~~24,039 prompt tokens
   over the OpenAI wire, 52,922 over the Anthropic wire.~~ **That 52,922 was a
   double-count and the 2.2x was never real.** The Anthropic Skin emits `input_tokens`
   TWICE per request — once in `message_start`, once in the final billed usage frame —
   while the OpenAI wire emits it once. Counting every occurrence doubles one column and
   not the other. Measured both ways on the same fixtures:

   | | anthropic wire | openai wire | ratio |
   |---|---|---|---|
   | previous sweep, every occurrence | 52,922 | 24,039 | **2.20x ← the published figure** |
   | previous sweep, billed frame only | 26,461 | 24,039 | **1.10x** |
   | this sweep, billed frame only | 26,185 | 24,560 | **1.07x** |

   The encoder does echo every thinking block back unmodified, because Anthropic 400s
   otherwise. That part was right. Its price is roughly **7%**, not 120%.

   **The independent corroboration is what makes it certain**, because it does not go
   through token counting at all. The two columns' billed costs differ by **7.5%**
   ($0.046465 vs $0.043233), which is what a **6.6%** prompt-token difference
   (26,185 vs 24,560) should produce. **2.2x the input tokens could not.** Two
   measurements that share no arithmetic — one derived from token counts, one from what
   OpenRouter charged — land within a point of each other, and both contradict the
   published figure.

   Why it matters past tidiness: "the Anthropic wire costs 2.2x in prompt tokens" is a
   number someone makes an architecture decision on. It reads as *do not use verbatim
   thinking, it is too expensive* — and that would be the wrong call by a factor of
   seventeen.

   This is the SAME defect as the usage-frame 2:1 ratio documented for the reasoning
   guard, arriving from the other end. Both were found on 2026-08-11; nobody connected
   the ratio to the published figure it had already corrupted until the numbers were
   re-derived from the fixtures. **A wire that reports a field twice corrupts every naive
   sum over that field, not just the one you were looking at.**

6. **A truncated thinking block is unencodable by design.** `toAnthropicMessages`
   throws when a reasoning part has no `raw`, and `raw` is only attached at
   `content_block_stop`. A turn cut off mid-thinking therefore cannot be encoded
   into the next round. This is the correct behaviour — the alternative is a
   guaranteed provider 400 — but it is a failure mode a consumer will meet, and it
   is not currently documented anywhere a consumer reads. **Not observed in this
   run**; identified by reading the encoder.

## Findings for the library (reported, not fixed — outside this surface)

**1. `reasoning_details` is dropped on the OpenAI wire — but only on ENCODE, and the
claim below overstated it.**

~~`grep -rn reasoning_details packages/ui/src/wire/` returns nothing.~~ **That is
false.** It returns four files; the READ path handles `reasoning_details`
deliberately and with tests (`wire/formats/openai.ts:96-115`), including the
text-doubling trap, the block index and the signature. The drop is one function on
the way OUT — `toOpenAIMessages` never emits a reasoning channel — and the comment
justifying it (`encode.ts:131-134`, "OpenAI chat completions has no reasoning
channel on the way back in") is the actual error. OpenRouter has one.

The experiment this section asked for was run the same day. Settled, with
measurements: **OpenRouter accepts `reasoning_details` on the way back in (200), and
omitting it is accepted too (200)** — zero 400s across two models and 28 recorded
requests per configuration. The signature, not the text, is load-bearing: stripping
it is a hard 400 from Anthropic upstream. And the obvious fix is the dangerous one,
because after a streamed turn `part.raw` holds the final fragment only — a signature
with no text — so echoing it is not a reassembly.

Full write-up, including what was NOT measured (answer quality, prompt-cache
behaviour, multi-entry sequences): [`2026-08-11-reasoning-details-investigation.md`](2026-08-11-reasoning-details-investigation.md).
**Verdict: a latent quality-and-cost gap, not a defect.**

**2. `knownGap` swallows unrelated failures.** A `knownGap` scenario that fails for
*any* reason is recorded as "gap confirmed". During the broken-dialect run, S13
failed because the stream parsed to nothing — and was reported as its known gap,
which it was not. The gap-confirmation should match the documented failure rather
than accept any failure.

**FIXED.** `knownGap` now requires three things — the run reached the gap, the
assertion still fails, and it fails with the DOCUMENTED message — typed as
`{ what, reached, signature }` so a bare gap note cannot be written. No scenario uses
it today, S12 and S13 having been its only users. Keep the mechanism: the next gap
should be forced through it rather than left as a comment.

## S12 and S13: closed, and exactly how far that is proven

Both were model-independent — five models, one shape of failure — which is what made
them library defects rather than conformance results. Two scenarios, three underlying
defects, all now fixed:

- **`AssistantStream.addCard` upserts on `envelope.id`** (`upsertCardPart`,
  `packages/ui/src/state/parts.ts`) instead of appending, so a revised artifact replaces
  the draft rather than stacking a second copy. It replaces the envelope **wholesale**:
  a card arrives whole as one tool result, and a field-by-field merge could never CLEAR
  `resolution`, which `CardPolicy.onReopen` needs.
- **`artifact` is the 7th built-in card type**, through
  `packages/ui/src/components/artifact-card.tsx`. S13 no longer needs the spike's own
  `<spike-artifact>` registered through the `cardTypes` seam.
- **`source` parts render as a grouped citation row** (`part="citations"`), outside the
  message bubble. `message.tsx` used to match them to `null` on purpose.

Neither scenario carries a `knownGap` any more. They are ordinary assertions.

### What was measured

- **Live, all ten cells, every configuration.** A full five-column sweep re-ran after the
  fix. S12 and S13 pass everywhere, live, with zero `gap` cells anywhere in the matrix.
- **Offline replay, green, against the current build**, agreeing with the live run.
- **Negative control, red, twice.** S12 and S13 both fail under `conformance:control`
  across two independent full runs, so the assertions are load-bearing rather than
  vacuously satisfiable.

### On the hedge this section used to carry

Until the live re-run, six of these ten cells had never been executed and were marked `§`,
with the other four resting on replay. That hedge is now retired, and the reason matters:
**it was retired by a measurement, not by a judgement that it read as over-cautious.**

Keeping it would have been its own overclaim in the opposite direction, but so would
dropping it an hour earlier on the argument that the fix was obviously correct and the
replay obviously sufficient. Both were available; only one of them was checkable.

### Why an offline replay is evidence here, and not a tautology

The weak version of this claim would be "we changed the renderer and our own recording now
passes", which proves nothing. Three arguments rule that out. They are given strongest
first, and the ordering is deliberate — two earlier attempts to make this point led with a
weaker one and both had to be corrected.

**1. Structural, and it cannot fail.** A fixture is the **provider's SSE bytes**, captured
in the proxy, upstream of everything the fix touched. It records what OpenRouter sent. Our
rendering code cannot influence what a provider sent — at any point, in any ordering. **The
renderer is not in the recording path at all.** This holds for every fixture in the repo
regardless of when it was made, and no later discovery about dates can undo it.

**2. Corroborating, and checkable from git.** The two fixtures the DEFAULT replay runs
predate the code they now exercise by hours:

| fixture | last touched | the fix it now passes |
|---|---|---|
| `fixtures/live/deepseek-.../S12-citations` | `18e7dd8`, 13:58 | citation row, `216beeb`, **15:43** |
| `fixtures/canned/S13-artifact` | `3acec1f`, the harness's first commit | `upsertCardPart` 15:25 · `artifact-card.tsx` 15:37 |

This does not prove anything (1) does not already prove. It makes it concrete, and it is
verifiable by someone who does not accept (1).

**3. A wrinkle, recorded so nobody rediscovers it and distrusts the section.** The
`haiku-oai` S12 fixture is **not** one of the pre-dating ones — it was re-recorded at ~15:52
in the thinking-budget pass (`c62c53c`), *after* the citation row landed at 15:43. It is
untainted, because that re-recording was driven by the thinking fix and has nothing to do
with citations, and because (1) applies to it like everything else. But establishing that
takes a `dist`-mtime argument, so it carries no weight here and nothing should be built on
it.

**Why the ordering is the point.** This claim was first argued from a wall clock ("recorded
before the citation row existed") — wrong as stated, since the commit was 15:43 and the
recording 15:52. The correction was argued from commit timestamps, which survived one more
round of checking and then also needed qualifying. **A timestamp feels like proof: it has a
number in it and you can go and look. The structural argument has no number and reads like
an assertion, so two people in sequence reached past the only version that could not be
wrong.** When an argument is available in both structural and contingent form, the
contingent one is the one that will need correcting later.

### The caveat that came out of closing S13

**S13 passed in 2.0s while the artifact card rendered as empty chrome** — heading, toolbar,
no content. The assertion was `seesText(page, 'v2')`, unscoped, and it was satisfied by the
`<kai-tool>` panel echoing the model's own `open_artifact` arguments a few inches up the
thread.

**The negative control could not have caught it.** `CONTROL-empty` produces no tool panel
either, so the control goes red for a plausible-looking reason while the real run proves
nothing. It was caught by DOM-probing a GREEN run.

Both assertions are now scoped to the element that has to do the rendering —
`kai-thread [data-card-type="artifact"]` for S13, and "a `ui.kitn.ai` anchor outside
`[part~="content"]`" for S12, which learned the same lesson independently when a bare
`a[href*="ui.kitn.ai"]` passed off a markdown link the model had typed in its prose.

## Cost

**$0.107054** for the current five-configuration sweep, measured from `usage.cost` in the
recorded fixtures. Per column, with the count that backs each figure:

| configuration | requests | prompt | completion | cost |
|---|---|---|---|---|
| deepseek-v4-flash | 28 | 16,303 | 3,145 | $0.001602 |
| haiku-4.5 (anthropic wire) | 28 | 26,185 | 4,056 | $0.046465 |
| haiku-4.5 (openai wire) | 28 | 24,560 | 4,200 | $0.043233 |
| gpt-5.4-mini | 27 | 7,433 | 2,085 | $0.014957 |
| ministral-3b | 27 | 9,847 | 1,692 | $0.000797 |

Two columns legitimately have 27 rather than 28 — ministral settles S04 in two rounds and
gpt's S12 in two — which is why the completeness check below derives its expected count
rather than asserting a constant.

Price per token, not volume, dominates: DeepSeek is $0.07/$0.14 per Mtok against Haiku
4.5's $1/$5. The two Haiku columns are **84%** of the total while being 41% of the
requests. `anthropic/claude-opus-*` would be another 5x on top. Not run.

**How to know this total is complete rather than merely plausible.** `cost` is
OpenRouter's own annotation and it rides only the **terminal** usage frame — once per
response, on both wires. So one recorded round is one file is one cost field, and the
assertion is `cost_fields == count(*.sse)` per column, scoped to `fixtures/live/`. It
holds 138/138 here. This is a truncation check reached from the opposite end to the
`[DONE]` terminator check, since a stream cut anywhere before the end keeps its file and
loses its cost field.

Three things about that assertion, because getting any of them wrong inverts it:

- **It counts COST fields, not usage frames.** Those differ by wire — the Anthropic Skin
  emits usage twice per round and cost once. Generalising this check from `cost` to
  `usage` is precisely what breaks it, and is the same double-count that produced the
  fictional 2.2x above.
- **It must exclude `fixtures/canned/`.** Those 16 streams are hand-written and carry no
  usage frame by design; a glob one directory too high reports 170 files against 138 cost
  fields and screams truncation at a set that was never recorded.
- **It does NOT catch stale data.** This sweep left two orphaned `S12-citations/round-3.sse`
  files (`haiku-oai`, `deepseek`) from a previous run, because S12 settled in two rounds
  this time and the recorder does not clear a scenario directory. They are complete files
  with valid cost fields, so the count assertion passes and the naive total reads
  **$0.109491** — $0.002437 too high. **A completeness check cannot tell you the data is
  current.** The figures above exclude them.

### What thinking actually costs, measured

The correction at the top has a price attached. The identical 28 requests of the
`haiku-oai` column, before and after the thinking budget was fixed — these two figures
are anchored to commits (`ff355fa` pre-fix, `c62c53c` post-fix) because a before/after
can never be re-derived from a tree that only holds the "after":

| | cost | reasoning |
|---|---|---|
| pre-fix (derived budget 450, under the floor) | $0.037089 | none, in any scenario |
| post-fix (explicit budget 1024) | $0.045223 | all 13 scenario dirs |

**+$0.008134, or +21.9%**, to make that column actually test what it exists to test.

**This is the only one of the two thinking-cost figures that was ever real.** An earlier
version of this section warned against conflating +21.9% with "the 2.2x prompt-token
figure", on the grounds that they measure different things — output tokens on one pass
versus prompt tokens echoed across rounds. The distinction was correct and the second
number was fiction: 2.2x was a double-count, and the real prompt-token cost of verbatim
thinking is ~7% (see Anthropic-specific differences, item 5).

Worth keeping as a record of how the error survived. **Fencing two numbers off from each
other is not the same as checking either of them.** The warning was careful, it was
right about the mechanism, and it made the fictional number more durable by giving it a
defined scope and a reason to sit undisturbed next to a real one.

## What I could not classify confidently

- ~~**Whether the dropped `reasoning_details` actually matters.**~~ **RESOLVED** —
  see finding 1. It round-trips; omitting it is accepted. What remains genuinely
  unmeasured is whether omitting it degrades *answer quality* on a hard multi-step
  task, which is a benchmark rather than a conformance cell.
- ~~**Whether OpenRouter's OpenAI-compat layer can surface Haiku's thinking at
  all.**~~ **RESOLVED, and it was our bug** — see the correction at the top. It can.
  This bullet was the honest one in the original document ("one request shape was
  tested, not the space"), and testing the second shape is what found it. **The
  lesson is that the hedge was correct and the table was not**: the table printed a
  confident `n/a` for the same measurement this bullet flagged as unexplored. When a
  caveat and a cell disagree, the cell is what people read.
- **Whether `gpt-5.4-mini` exposes reasoning text is not a stable property.** Two runs
  hours apart, same request shape, same provider: `reasoning.encrypted` only in one,
  `reasoning.summary` with 2,111 chars in the other. Nothing on our side changed. This is
  unclassifiable in the specific sense that **a conformance cell measures one moment**, and
  a provider is free to change between them. It is not a defect and it is not a fix; it is
  the reason "the provider cannot do this" should be written as "did not, on this date".
- **S05 on the Anthropic wire tests a weaker claim than on the OpenAI wire.** The
  OpenAI fixture interleaves two calls' argument fragments round-robin, which is the
  adversarial case. Anthropic cannot produce that framing, so its fixture is two
  sequential blocks. Both are realistic; they are not equally demanding, and the
  green cells are not equivalent.

## Reproducing

```bash
cd examples/internal/openrouter-spike
node harness/run-matrix.mjs --mode replay     # offline, no key, no network
node harness/run-matrix.mjs                   # live, ~$0.10, records fixtures
```
