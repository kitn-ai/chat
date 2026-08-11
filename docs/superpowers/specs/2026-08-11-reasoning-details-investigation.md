# `reasoning_details` on the OpenAI wire: is task #70 real?

**Date:** 2026-08-11
**Status:** investigation complete, nothing fixed, nothing to fix urgently
**Scope:** read-only. No source file was changed.

Task #70 as filed:

> `reasoning_details` is absent from `packages/ui/src/wire/` entirely, so it is
> dropped on the OpenAI/OpenRouter path. That is asymmetric with the Anthropic
> path... Nobody has tested whether OpenRouter accepts `reasoning_details` on the
> way back in, or whether dropping it degrades a multi-round tool loop.

Both halves of that are now settled. The first half is **wrong as written**. The
second half is answered: **OpenRouter accepts it, and omitting it is also
accepted.** There is no 400 and no broken loop.

---

## Verdict first

**#70 is a latent quality-and-cost gap, not a defect.** Nothing is broken today
on the OpenAI wire; what is lost is reasoning continuity between tool rounds, and
the fix is safe but must reassemble the block rather than echo `part.raw`.

---

## 1. What the premise got wrong (MEASURED)

The filing, and `2026-08-11-cross-model-conformance-results.md:166`, both assert:

> `grep -rn reasoning_details packages/ui/src/wire/` returns nothing.

It does not. Run in this worktree:

```
$ grep -rn reasoning_details packages/ui/src/wire/ --include="*.ts" -l
packages/ui/src/wire/formats/openai.test.ts
packages/ui/src/wire/openai-fixtures.test.ts
packages/ui/src/wire/formats/openai.ts
packages/ui/src/wire/encode.test.ts
```

The **read path handles `reasoning_details` deliberately and with tests.**
`packages/ui/src/wire/formats/openai.ts:96-115` is entirely about it, including
the doubling trap and the exact concern #70 raises:

```ts
function applyReasoning(delta: Record<string, unknown>, out: ModelStreamChunk): void {
  const details = Array.isArray(delta.reasoning_details) ? delta.reasoning_details : undefined;
  ...
  out.reasoningRaw = { source: 'openai.reasoning_details', payload: details };
  const index = num(detailField(details, 'index'));
  if (index !== undefined) out.reasoningIndex = index;
  const signature = str(detailField(details, 'signature'));
  if (signature !== undefined) out.reasoningSignature = signature;
}
```

Its own comment already names the risk:

```ts
 * `reasoning_details` is still read in BOTH cases, for `reasoningRaw`, the block
 * index and the signature. It is the provider's own block list, and dropping it
 * is exactly the Anthropic 400 this entry exists to avoid.
```

So the text, the signature and the raw payload all reach `MessagePart`.

**The drop is entirely on the ENCODE side.** `toOpenAIMessages`
(`packages/ui/src/wire/encode.ts:136`) never emits a reasoning channel, and says
so at `encode.ts:131-134`:

```ts
 * `reasoning`, `card`, `source` and `file` parts are not encoded. OpenAI chat
 * completions has no reasoning channel on the way back in, and the other three
 * are kit-side.
```

That premise ("has no reasoning channel on the way back in") is the actual bug in
the reasoning, and it is a comment, not code. OpenRouter does have one.

**Restated correctly:** *the OpenAI-wire encoder discards reasoning that the
reader already captured.* One function, not the whole directory.

---

## 2. What the recorded fixtures already showed (MEASURED)

`examples/internal/openrouter-spike/fixtures/live/`, five configurations.

```
$ grep -rlc reasoning_details fixtures/live/
```
returns files under **`deepseek-deepseek-v4-flash-latest/`** and
**`openai-gpt-5.4-mini/`** only.

| configuration | `reasoning_details` in fixtures | shape |
|---|---|---|
| `deepseek-v4-flash` | yes | `reasoning.text`, `format:"unknown"`, no signature |
| `openai/gpt-5.4-mini` | yes | `reasoning.encrypted` + `reasoning.summary`, `format:"openai-responses-v1"` |
| `anthropic/claude-haiku-4.5` (openai wire) | **none** | only `"reasoning_tokens":0` |
| `anthropic/claude-haiku-4.5` (anthropic wire) | n/a | native `thinking` blocks |
| `mistralai/ministral-3b` | none | no reasoning mode |

`openai-gpt-5.4-mini/S04-multi-round/`: round-1 carries 86 `reasoning.summary`
frames plus 1 `reasoning.encrypted`; round-3 78; round-4 87. The encrypted frame
sits at **line 177, after the last summary frame at line 175.**

The load-bearing observation: **that four-round loop ran to completion with the
reasoning dropped on every round.** Rounds 2, 3 and 4 exist as recorded 200
responses, each still producing reasoning of its own. So the drop was already
being exercised live, 28 requests per configuration, and never produced an error.

The Anthropic-on-OpenAI-wire row is the one that looked dangerous, and it was
vacuous: that configuration emitted **no reasoning at all**, so there was nothing
to drop. The matrix runs it with `reasoning: { effort: 'medium' }`
(`server/openrouter-proxy.ts:426`). See finding 5 below.

---

## 3. What the docs say (READ)

Source: <https://openrouter.ai/docs/use-cases/reasoning-tokens>, fetched
2026-08-11.

- Three entry types: `reasoning.summary`, `reasoning.encrypted`,
  `reasoning.text`. Common fields `id`, `format`, `index`, `type`.
- On passing it back:
  > "When you post tool results, including the original reasoning ensures the
  > model can continue its reasoning from where it left off."
- The one hard constraint stated:
  > "When providing reasoning_details blocks, the entire sequence of consecutive
  > reasoning blocks must match the outputs generated by the model during the
  > original request; you cannot rearrange or modify the sequence of these
  > blocks."
- On tool calling:
  > "Preserving reasoning blocks is useful specifically for tool calling. When
  > models like Claude invoke tools, it is pausing its construction of a response
  > to await external information."

**The docs never mandate it and never describe a failure mode for omitting it.**
They describe a continuity benefit. The only stated hard rule applies to blocks
you *do* send.

---

## 4. The experiment, and what it measured (MEASURED)

Four probes against live OpenRouter, using the key in the primary checkout
(`/Users/home/Projects/kitn-ai/kitn-chat/examples/internal/openrouter-spike/.env.local`,
present; this worktree has none). Scripts were written to the session scratchpad,
not to the repo. Total spend across all probes: roughly **$0.02**, summed from
the `usage.cost` fields in the responses.

Shape of every probe: round 1 forces a tool call from a reasoning model and
captures `reasoning_details`; round 2 replays the loop with the assistant message
varied.

### 4a. `openai/gpt-5.4-mini`, `reasoning: {effort:"medium"}`

Round 1: 1 entry, `reasoning.encrypted`, keys `[data, format, id, index, type]`,
25 reasoning tokens, `finish_reason: tool_calls`.

| round-2 variant | HTTP | outcome | prompt tokens |
|---|---|---|---|
| A omit (**what the kit does today**) | **200** | loop continued, called Tokyo tool | 135 |
| B echo full array verbatim | **200** | loop continued | 162 |
| C echo last entry only | **200** | loop continued | 162 |

C is **not a real test here**: with one entry, `rd[-1:] == rd`. Recorded as
inconclusive rather than as a pass.

### 4b. `anthropic/claude-haiku-4.5` on the **OpenAI wire**, `reasoning: {max_tokens:2000}`

Round 1: 1 entry, `reasoning.text`, `format: "anthropic-claude-v1"`, **with a
`signature`**, 97 reasoning tokens.

| round-2 variant | HTTP | result |
|---|---|---|
| D verbatim | **200** | loop continued, prompt 869 |
| E text mutated, signature kept | **200** | loop continued, prompt 869 |
| F **signature stripped** | **400** | `messages.1.content.0: Invalid \`signature\` in \`thinking\` block` |
| G reconstructed (text only, no signature) | **400** | same error |
| H omit (**what the kit does today**) | **200** | loop continued, prompt 711 |

The 400s came back through OpenRouter as `Provider returned error` with the
upstream Anthropic body attached, and the same error from all four upstream
providers it tried (Azure, Bedrock, Google, Anthropic).

### 4c. Streaming shape (this is the implementation trap)

`anthropic/claude-haiku-4.5`, streamed: 150 frames, **85 carrying
`reasoning_details`**. Each of the first 84 carries a text delta and no
signature. The **final** one carries the signature and **no text**:

```
frame 83: reasoning=' leap year has 366 days.'
   details: [{"type":"reasoning.text","text":" leap year has 366 days.","format":"anthropic-claude-v1","index":0}]
frame 84: reasoning=None
   details: [{"type":"reasoning.text","signature":"EoAJCkgIEBABGAIqQPcZ...","format":"anthropic-claude-v1","index":0}]
frames whose details carry a `signature`: [84]
```

This matters because `appendReasoningPart`
(`packages/ui/src/state/parts.ts:96`) resolves raw last-write-wins:

```ts
raw: opts.raw ?? cur.raw,
```

So after a streamed Anthropic-family turn, **`part.raw.payload` is the final
fragment only: a signature with no text.** It is not the assembled block. (For
`gpt-5.4-mini` the ordering happens to favour us, because the encrypted entry
arrives last, so `part.raw` ends up holding the encrypted block.)

### 4d. The two candidate fixes, tested

Streamed round 1, folded exactly the way the kit folds it (544 chars of reasoning
text accumulated, signature captured separately), then round 2 three ways:

| variant | HTTP | prompt tokens |
|---|---|---|
| naive: echo `part.raw` verbatim (signature, no text) | **200** | 834 |
| correct: reassembled `{text, signature, format, index}` | **200** | 834 |
| baseline: omitted (today) | **200** | 665 |

Both candidate fixes are accepted. Including reasoning costs **+169 prompt
tokens** on this turn, about 25%.

---

## 5. Findings

**1. Omitting `reasoning_details` on the OpenAI wire is accepted by every
configuration tested.** Two models, five omission trials across the probes plus
28 recorded live requests per configuration in the existing fixtures. Zero 400s.
`toOpenAIMessages` is not producing broken requests.

**2. OpenRouter accepts `reasoning_details` on the way back in.** This was the
explicitly untested question in the results doc. Answer: yes, HTTP 200, for both
an encrypted OpenAI block and a signed Anthropic block.

**3. The signature is the load-bearing field, not the text.** Stripping it is a
hard 400 from Anthropic upstream; keeping it while mutating the text was accepted.
*(INFERRED, not proven: identical prompt-token counts for the verbatim, mutated
and textless variants (869/869, then 834/834) suggest OpenRouter reconstructs the
thinking block server-side from the signature and ignores the text you send. I did
not confirm that with OpenRouter, and it should not be relied on.)*

**4. A naive fix is the one that would have been dangerous, and it is the obvious
one.** "Echo `part.raw` like the Anthropic encoder does" sends a textless
signature fragment after a streamed turn. It happened to return 200 here, but it
is precisely the "modified sequence" the docs warn about, and finding 3 says the
only reason it survives is the signature. The kit already stores everything a
correct reassembly needs: `part.text` (accumulated) and `part.signature`
(captured by `detailField(details,'signature')`). A fix should build
`{type:'reasoning.text', text: part.text, signature: part.signature, format,
index}`, not forward `part.raw`.

**5. Separate finding, and a correction to the conformance results.**
`anthropic/claude-haiku-4.5` **does** emit reasoning on OpenRouter's OpenAI-compat
endpoint. The results doc lists it as "nothing, only `content` and `role`" and
files "whether the OpenAI-compat layer can surface Haiku's thinking at all" as
unclassified. It can. The harness asks with `reasoning: {effort: 'medium'}`
(`openrouter-proxy.ts:426`); with `reasoning: {max_tokens: 2000}` the same model
returned 97 reasoning tokens and a signed `reasoning.text` block. **The recorded
zero is a harness parameter choice, not a provider limit.**

This also means the matrix has never actually exercised its most interesting
configuration: an Anthropic model, thinking enabled, tool loop, on the OpenAI
wire. That is worth more than fixing #70.

---

## 6. What was NOT measured

- **Whether omitting it degrades answer quality.** Every probe was a two-round
  weather loop where round 2 is trivial. Both variants produced the same next
  tool call. That shows no *breakage*; it says nothing about a hard multi-step
  task. Measuring this honestly needs a task with a checkable outcome, many
  trials, and a paired comparison. It is a benchmark, not a conformance cell, and
  it is the reason this doc stops short of recommending the fix on quality
  grounds.
- **Prompt-cache behaviour.** `cached_tokens` was 0 in every response, so nothing
  about cache reuse was observed either way.
- **Multi-entry sequence violations.** Every round-1 response returned exactly one
  entry, so "rearrange or modify the sequence" was never genuinely tested. Variant
  C was inconclusive for this reason.

---

## 7. If someone does act on this

The harness in `examples/internal/openrouter-spike/` can carry it, per
`HARNESS.md`. What is needed is **a new scenario, not an extension**: S02 is
single-round and S04 does not inspect the request. Sketch:

- `S17-reasoning-round-trip`, `mode: 'live'`, model pinned to a configuration that
  actually emits signed reasoning (`anthropic/claude-haiku-4.5` on the openai wire
  with `reasoning: {max_tokens: 2000}`, per finding 5).
- Two rounds, one tool. The assertion has to look at the **outgoing** request, not
  the DOM, which is a genuine departure from the harness's assertion rule
  (`HARNESS.md`, "Every assertion pierces the shadow DOM"). That rule exists for a
  good reason and this scenario would need an explicit, argued exemption rather
  than a quiet one.
- Its control: the same loop with a deliberately corrupted signature, which must
  produce the 400 in finding 4b. That is the "watch it fail" step, and it is the
  only thing that would keep the scenario from being another check that proves
  nothing.

Reproduce the measurements here without the harness:

```bash
OPENROUTER_ENV_DIR=/Users/home/Projects/kitn-ai/kitn-chat/examples/internal/openrouter-spike
```

is the documented way to reach the key from a worktree (`HARNESS.md`, "The key").
The probe scripts used for this document live in the session scratchpad and were
deliberately not committed; §4 records their inputs and outputs in full so they
can be rebuilt.

---

## Verdict

**#70 is a latent gap, not a real defect: the drop is real but its only proven
consequence is lost reasoning continuity and a missed round-trip capability,
since every configuration tested returns 200 with the reasoning omitted, so it
should be reprioritised below finding 5 (Haiku's thinking is reachable on the
OpenAI wire and the matrix has been measuring a parameter mistake as a provider
limit).**
