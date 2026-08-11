# Cross-model conformance: five configurations, 19 scenarios

**Date:** 2026-08-11 · **Harness:** [`examples/internal/openrouter-spike/HARNESS.md`](../../../examples/internal/openrouter-spike/HARNESS.md) · **Total measured spend:** $0.1019

"A real model drives our UI" used to rest on one model. This is the table.

## The result

95 cells: **81 pass, 10 confirmed known gaps** (S12 and S13 in all five columns, both
already documented), **4 model-behaviour differences**, and **zero UI failures**.

| scenario | deepseek-v4-flash | haiku-4.5 (anthropic wire) | haiku-4.5 (openai wire) | gpt-5.4-mini | ministral-3b |
|---|---|---|---|---|---|
| S01 plain text | pass | pass | pass | pass | pass |
| S02 reasoning | pass | pass | **n/a** | **n/a** | **n/a** |
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

`pass` = the behaviour rendered · `gap` = a documented known gap, failing as
documented · **`n/a`** = the model did not produce the input the scenario needs.
Not a failure of ours, and the distinction is argued below rather than asserted.

Every cell was produced twice: once live, once by replaying the recording offline.
The two agree exactly, including the failures.

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
| haiku-4.5, openai wire | **nothing** — only `content` and `role` | 0 |
| gpt-5.4-mini | `reasoning: null` + `reasoning_details: [{type: "reasoning.encrypted"}]` | 0 |
| ministral-3b | **nothing** — the model has no reasoning mode | 0 |

Three different causes, one symptom. Ministral has no reasoning at all. GPT-5.4-mini
reasons but returns it **encrypted** — the raw chain of thought is never exposed, so
there is no text any UI could render. Haiku reasons, and its thinking is visible over
the Anthropic wire and *absent* over OpenRouter's OpenAI-compat normalisation of the
same request.

That last row is the useful one, and it is only available because the same model was
run down both paths: it isolates the loss to the normalisation layer, not to the
model and not to the kit.

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

**1. `reasoning_details` is dropped on the OpenAI wire.** `grep -rn reasoning_details
packages/ui/src/wire/` returns nothing. OpenRouter sends
`reasoning_details: [{type: "reasoning.encrypted", data: "..."}]` for OpenAI
reasoning models, and the kit ignores it.

This is an asymmetry with the Anthropic path, which deliberately preserves opaque
`redacted_thinking` blocks in `part.raw` precisely so they round-trip verbatim. The
OpenAI-format equivalent has no such home, so encrypted reasoning cannot be echoed
back on a later round.

*Confidence: the drop is certain. The consequence is not.* Whether OpenRouter's
`/chat/completions` accepts `reasoning_details` on the way back in, and whether
omitting it measurably degrades a multi-turn loop, was **not tested** — S02 is a
single-round scenario. Worth a deliberate experiment before anyone acts on it.

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

## What I could not classify confidently

- **Whether the dropped `reasoning_details` actually matters.** Certain that it is
  dropped; untested whether the round-trip needs it. Flagged above rather than
  fixed or dismissed.
- **Whether OpenRouter's OpenAI-compat layer can surface Haiku's thinking at all.**
  Observed that it did not with `reasoning: {effort: 'medium'}`. Whether a different
  parameter would, or whether it is a hard limit of the normalisation, was not
  explored — one request shape was tested, not the space.
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
