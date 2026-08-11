# The conformance harness

The claim "a real model drives our UI" used to rest on one model, one tool, one
card type and two rounds. This replaces it with a table.

A **scenario** is one module under [`src/scenarios/`](./src/scenarios/) that owns
a whole round trip: the prompt that provokes a behaviour, the tools that make it
reachable, and an assertion that the behaviour actually **rendered**. A
Playwright runner drives the real app once per scenario, and every live stream is
recorded to `fixtures/live/` on the way past, so each live run leaves the offline
suite stronger than it found it.

```bash
pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance          # replay: no key, no network
pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance:live     # hits the model, records fixtures
pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance:control  # the negative-control pass
pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance:matrix   # every model, then a table
```

`SPIKE_ONLY=S03-single-tool,S07-confirm-card` narrows a run.

## Across models

One model is an anecdote. `harness/run-matrix.mjs` runs the whole catalog once per
model and prints a scenario x model table.

```bash
node harness/run-matrix.mjs                      # live, every model
node harness/run-matrix.mjs --mode replay        # offline, from what was recorded
node harness/run-matrix.mjs --only deepseek,haiku
node harness/run-matrix.mjs --scenarios S01-plain-text
```

`OPENROUTER_MODEL` is read **server-side, per request**, so switching models means
a new dev server. Playwright will start one — but `reuseExistingServer: true`
means a second model would silently reuse the first model's server, and every row
after the first would be wrong with no symptom. So each model gets its **own
port**, which makes reuse impossible, and `SPIKE_EXPECT_MODEL` makes the suite
assert what the page actually reports before it believes a single result.

Cells are `pass` / `FAIL` / `gap` / `skip`. `gap` is a `knownGap` scenario failing
as documented — worth its own glyph, because the runner reports a confirmed gap as
a *passing* test and only the annotation tells them apart. `skip` is a live
scenario with no recording yet: a missing measurement, not a failing one.

## Two wires, not one

OpenRouter's `/api/v1/chat/completions` normalises **every** model onto the OpenAI
shape — Anthropic's included. So pointing the spike at an Anthropic model does not
exercise `readAnthropicStream`; it exercises `readOpenAIStream` against an
Anthropic model, which is a different claim.

`OPENROUTER_WIRE` (`auto` | `openai` | `anthropic`) picks the dialect, and `auto`
routes `anthropic/*` through OpenRouter's **Anthropic Skin**
(`/api/v1/messages`), which speaks native `message_start` / `content_block_delta`
SSE. That is the only configuration in which the kit's Anthropic reader and
`toAnthropicMessages` run against a live provider.

The wire is chosen **server-side** from the model id and reported by
`/api/config`; the browser reads it to pick the matching encoder and reader, and
the proxy rejects a request whose shape disagrees rather than forwarding it. It is
also part of the fixture directory name (`<model>-anthropic-wire`), because the
two dialects are not interchangeable: a chat-completions stream fed to
`readAnthropicStream` does not throw, it parses to **nothing**.

Running the same model down both paths is the point. It is what separates a
model-behaviour difference from a wire bug.

### The canned streams exist in both dialects

`fixtures/canned/` is OpenAI-shaped and `fixtures/canned-anthropic/` is its
Anthropic twin; `pnpm fixtures` emits both from one description. This is not
symmetry for its own sake — the first Anthropic run failed all six replay-only
scenarios, and none of it was the UI: the Anthropic reader was being handed
chat-completions frames and correctly made nothing of them. Six red cells that
said nothing about the kit.

The two dialects index different things, which the generator makes explicit: on the
OpenAI wire the index is a position in the `tool_calls` array, on the Anthropic
wire it is a **content block** index, so a thinking block ahead of a call pushes
that call from 0 to 1.

## The assertion rule

**Every assertion pierces the shadow DOM and looks at what a user can see** — the
tool panel's `Completed` chip and its output, the card's buttons, the resolved
card's summary line. Asserting that a `part` exists in the data model proves the
wire adapter ran and says nothing about whether the UI works. This repo has
already shipped a `Completed` badge that rendered from seeded fixture data while
the live loop had never run once.

"Expanded" is defined the same way: as a **layout** fact, not an attribute. A
closed `<kai-tool>` keeps its panel in the DOM at `grid-rows-[0fr]`, so a
remounted-and-reset panel reports `data-state="closed"` perfectly happily. Only
the box height tells you what the user is looking at.

`src/harness-state.ts` is the one exception, and it is deliberately narrow: it
carries the run phase (so the runner knows when to assert) and loop-level facts
the DOM genuinely cannot express (how many round trips the tool loop took). It
does **not** carry the message parts.

## Watch it fail first

`conformance:control` points every assertion at a stream that **cannot** satisfy
it and fails any assertion that still passes.

It earns its keep. On its first run it caught S14, whose attachment check was a
bare `getByText('q3-summary.pdf')` — which passed against a stream with no
attachment at all, because the filename is in the user's own prompt three lines
up the thread.

Each scenario picks its control with `controlDir`. The default,
`canned/CONTROL-empty`, is three words of prose and nothing else. Scenarios whose
claim is an **absence** (S01: no tool panel on a tool-free turn) or a **failure**
(S16: an error must be surfaced) use `canned/CONTROL-noisy`, a clean successful
tool round, instead.

Scenarios marked `knownGap` are skipped by the control pass — they already fail
against their real stream. S12 gets a bespoke **positive** control instead
(in `harness/scenarios.spec.ts`): a citation-shaped anchor is injected into the
thread's shadow root and the locator must find it. A red S12 with a green control
is a missing feature; a red S12 with a red control would just be a bad selector.

## Live vs replay

| | live | replay |
|---|---|---|
| Talks to the provider | yes | **never** — the proxy checks `replay` before it even looks for the key |
| Needs a key | yes | no |
| Records | `fixtures/live/<model>/<id>/round-N.sse` | — |
| Reads | — | `fixtures/canned/<id>/` or `fixtures/live/<model>/<id>/` |

Some scenarios are **replay-only** (`mode: 'replay'`). Parallel tool calls,
arguments truncated by the token limit, a provider that dies mid-sentence, a
stream long enough to cancel: none of these can be provoked by a prompt, so a
"live" attempt would be a coin flip reporting on the model rather than on us.
Their streams are generated by `harness/make-canned-fixtures.mjs` (`pnpm fixtures`).

The runner asserts `state.source === mode`, so a misconfigured live run can never
be reported as an offline one.

A `live` scenario replayed before it has ever been recorded reports as
**skipped**, with the fixture path it wanted — a missing recording is not a
failing assertion, and reporting the two the same way is how a suite starts lying
about its coverage.

## The key

Unchanged, and the harness never touches it. `server/openrouter-proxy.ts` reads
it with Vite's `loadEnv`, server-side, and `/api/config` reports a boolean.

One addition for git worktrees: `OPENROUTER_ENV_DIR` points `loadEnv` at a
different directory, for when the checkout you are running has no `.env.local`
because the key lives in the primary checkout. It changes only **where loadEnv
looks**; nothing reads, copies or forwards the value.

```bash
OPENROUTER_ENV_DIR=/path/to/primary/examples/internal/openrouter-spike pnpm dev
```

`fixtures/` is committed. Recorded streams are the provider's response bytes;
they never contain the request headers and therefore never contain the key.
`server/replay-guard.test.ts` pins the path resolver against traversal, because
the replay directory is chosen by the page and `.env.local` is two levels above
`fixtures/`.

## Cost

**Measured**, not estimated: summing `usage.cost` out of the recorded fixtures of
one full live pass over the 13 live scenarios — 28 requests, 16,046 prompt tokens
and 2,939 completion tokens on `~deepseek/deepseek-v4-flash-latest` — comes to
**$0.0015**. The replay and control passes are free.

```bash
python3 - <<'PY'
import re, glob
print(sum(float(m) for f in glob.glob('fixtures/live/*/*/*.sse')
          for m in re.findall(r'"cost":([0-9.eE-]+)', open(f).read())))
PY
```

A different model's number differs by its own price per token, and the prompts and
the `max_tokens: 900` cap are fixed by the harness — but the token COUNT is not
fixed, and assuming it was is how a sweep gets mispriced. A five-configuration
matrix measured **$0.1019** in total, dominated by per-token price rather than by
volume:

| configuration | requests | prompt tok | completion tok | measured |
|---|---:|---:|---:|---:|
| `~deepseek/deepseek-v4-flash-latest` | 28 | 16,369 | 3,225 | $0.0017 |
| `anthropic/claude-haiku-4.5` (openai wire) | 28 | 24,039 | 2,610 | $0.0371 |
| `anthropic/claude-haiku-4.5` (anthropic wire) | 28 | 52,922 | 4,182 | $0.0468 |
| `openai/gpt-5.4-mini` | 27 | 7,418 | 2,200 | $0.0155 |
| `mistralai/ministral-3b-2512` | 27 | 9,825 | 1,561 | $0.0008 |

The row worth reading twice is the same model on two wires: **2.2x the prompt
tokens on the Anthropic wire**. That is the verbatim-thinking round-trip doing
exactly what it is supposed to — `toAnthropicMessages` echoes every thinking block
back unmodified, so a multi-round tool loop re-sends its own reasoning each round.
It is a correctness requirement, not waste, but it is a real cost multiplier and
worth knowing before pricing an agent loop on Anthropic.

Both wires report `usage.cost`, so the sum below is measured rather than derived:

```bash
python3 - <<'PY'
import re, glob
print(sum(float(m) for f in glob.glob('fixtures/live/*/*/*.sse')
          for m in re.findall(r'"cost":([0-9.eE-]+)', open(f).read())))
PY
```

## Adding a scenario

1. A module in `src/scenarios/` exporting `{ id, title, proves, prompt, tools, mode, assert }`.
2. Register it in `src/scenarios/index.ts`.
3. `pnpm conformance:control` — watch it go red.
4. `pnpm conformance:live` — watch it go green, and record its stream.

The id is a directory name and the sidebar rail is generated from the same
catalog, so a new scenario is also one click away in the browser.
