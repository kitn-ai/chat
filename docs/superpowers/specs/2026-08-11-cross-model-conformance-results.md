# Cross-model conformance: five configurations, 19 scenarios

**Date:** 2026-08-11 · **Harness:** [`examples/internal/openrouter-spike/HARNESS.md`](../../../examples/internal/openrouter-spike/HARNESS.md) · **Total measured spend:** $0.1019 for the original sweep, **+$0.052** for the correction below ($0.0054 of root-cause probes, $0.0452 for a corrected `haiku-oai` pass, ~$0.0015 to re-record S02)

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

95 cells: **82 pass, 10 confirmed known gaps** (S12 and S13 in all five columns, both
already documented), **3 model-behaviour differences**, and **zero UI failures**.

| scenario | deepseek-v4-flash | haiku-4.5 (anthropic wire) | haiku-4.5 (openai wire) | gpt-5.4-mini | ministral-3b |
|---|---|---|---|---|---|
| S01 plain text | pass | pass | pass | pass | pass |
| S02 reasoning | pass | pass | **pass†** | **n/a** | **n/a** |
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
| S12 citations | gap | gap | gap | gap | gap |
| S13 artifact over time | gap | gap | gap | gap | gap |
| S14 attachments | pass | pass | pass | pass | pass |
| S15 interleaving | pass | pass | pass | pass | pass |
| S16 mid-stream error | pass | pass | pass | pass | pass |
| S17 cancel | pass | pass | pass | pass | pass |
| S18 expand mid-stream | pass | pass | pass | pass | pass |

\* **S05 on the Anthropic wire proves less than the same cell on the OpenAI wire**, so
the two are not interchangeable despite both reading `pass`. The OpenAI fixture
announces both calls up front and INTERLEAVES their argument fragments, correlated
only by `index` — the adversarial shape the adapter exists to survive. Anthropic
cannot produce that: its content blocks stream strictly sequentially, so its cell
tests two complete tool_use blocks arriving one after another. The harness now
carries this per wire (`provesByWire` in `s05-parallel-tools.ts`) and prints it as a
footnote, rather than leaving a reader to infer equivalence from two green cells.

† **This cell read `n/a` until the harness stopped asking for a sub-floor thinking
budget.** See the correction at the top. It is the one cell in this table that was
measuring the harness rather than the model, and it is worth more than its single
green square: an `n/a` that means "the provider cannot do this" and an `n/a` that
means "we asked wrong" are indistinguishable from the table, and only running the
same model down a second wire made the difference visible at all.

`pass` = the behaviour rendered · `gap` = a documented known gap, failing as
documented · **`n/a`** = the model did not produce the input the scenario needs.
Not a failure of ours, and the distinction is argued below rather than asserted.

Every cell was produced twice: once live, once by replaying the recording offline.
The two agree exactly, including the failures. **The corrected S02 cell holds to the
same standard**: live pass recorded in `harness/matrix-reports/haiku-oai.live.json`,
fixture committed, offline replay re-confirmed green against a settled build.

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

### 2. Model-behaviour differences — 4 cells

**S02 (reasoning) on three configurations.** The claim was checked against the
recorded bytes rather than inferred from the red cell:

| configuration | reasoning on the wire | chars |
|---|---|---|
| deepseek-v4-flash | `delta.reasoning` + `reasoning_details` | 708 |
| haiku-4.5, anthropic wire | `thinking` block + `thinking_delta` | 519 |
| ~~haiku-4.5, openai wire~~ | ~~**nothing** — only `content` and `role`~~ | ~~0~~ |
| **haiku-4.5, openai wire (corrected)** | `delta.reasoning` + `reasoning_details`, `format: anthropic-claude-v1`, signed | 421–535 |
| gpt-5.4-mini | `reasoning: null` + `reasoning_details: [{type: "reasoning.encrypted"}]` | 0 |
| ministral-3b | **nothing** — the model has no reasoning mode | 0 |

Ministral has no reasoning at all. GPT-5.4-mini reasons but returns it **encrypted** —
the raw chain of thought is never exposed, so there is no text any UI could render.
Haiku reasons, and its thinking is visible over **both** wires.

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

5. **Verbatim thinking costs 2.2x the prompt tokens.** Same model, same scenarios:
   24,039 prompt tokens over the OpenAI wire, 52,922 over the Anthropic wire. The
   encoder echoes every thinking block back unmodified because Anthropic 400s
   otherwise. Correct, required, and a real multiplier on any agent loop.

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

## Confirmed, not re-diagnosed

**S12 (citations)** and **S13 (artifact over time)** fail on all five configurations,
exactly as documented, with identical messages everywhere. S12's positive control
stays green throughout, so the locator is looking in the right place and the feature
is genuinely absent rather than the selector being wrong. Both are model-independent,
which is itself the useful new information: five models, one shape of failure.

## Cost

**$0.1019** measured from `usage.cost` in the recorded fixtures across 138 requests.
Both wires report it, so this is measured rather than derived.

That is ~68x the single-model baseline of $0.0015, and the brief's "well under a
cent for four models" does not hold — not because of volume but because of price per
token. DeepSeek costs $0.07/$0.14 per Mtok; Haiku 4.5 costs $1/$5, roughly 14x and
35x. Two of the five configurations account for 82% of the total. Still trivially
cheap in absolute terms, and worth stating rather than rounding away.

`anthropic/claude-opus-*` would be another 5x on top of Haiku. Not run.

### What thinking actually costs, measured

The correction at the top has a price attached, and it is smaller than the existing
2.2x figure would lead you to guess. The identical 28 requests of the `haiku-oai`
column, before and after the thinking budget was fixed:

| | cost | reasoning |
|---|---|---|
| pre-fix (derived budget 450, under the floor) | $0.037089 | none, in any scenario |
| post-fix (explicit budget 1024) | $0.045223 | all 13 scenario dirs |

**+$0.008134, or +21.9%**, to make that column actually test what it exists to test.

**Do not conflate this with the 2.2x prompt-token figure** recorded for the Anthropic
wire. They measure different things: 2.2x is verbatim thinking inflating PROMPT tokens
as it is echoed back across rounds of a loop; +21.9% is OUTPUT tokens on a single
pass. Both are real, they compound rather than substitute, and collapsing them into
one number would be a plausible-looking error that nothing downstream would catch.

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
