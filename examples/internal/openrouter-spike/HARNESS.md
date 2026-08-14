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

A trailing `*` means the cell does **not** prove what the scenario generally
claims, and the footnotes under the table say what it proves instead. Only S05
carries one today: chat-completions announces both tool calls up front and
interleaves their argument fragments, Anthropic closes each content block before
opening the next and **cannot** produce that framing, so the Anthropic cell tests
a strictly weaker claim. Two identical `pass` glyphs would read the weaker one as
the stronger. A scenario declares the difference with `provesByWire`.

## Two backends, not one

`SPIKE_BACKEND=gateway` swaps the OpenRouter proxy for the **shipped
`vercel-ai-sdk` route** — the one `kai` scaffold hands a consumer — which calls
Vercel's AI Gateway through `streamText()` and re-frames `result.fullStream` onto
the OpenAI wire itself. The browser half of the app does not change: it still
POSTs `{ messages, tools }` and still parses the reply with `readOpenAIStream`.
The whole server hop in between does.

```bash
pnpm gateway:route                 # emit the route from the integration
pnpm conformance:gateway           # replay, from what the gateway column recorded
pnpm conformance:gateway:live      # hits the model through the shipped route
```

The route is **generated, never copied** (`harness/emit-gateway-route.mjs` calls
`scaffold.handler` and writes block (2) verbatim to `server/generated/`), and
every `conformance:gateway*` script regenerates it first. A hand-written copy
would keep passing after the shipped route broke, which is the one thing this
column exists to detect.

Nothing here configures the model: that route pins its own in one `const MODEL`,
and the proxy reads it back out of the generated source so `/api/config` reports
what is really being driven. `gptoss-gw` and `gptoss-or` in `harness/models.mjs`
are the pair — **same model id, same wire, different hop** — which is what makes
a difference between those two rows attributable to the integration. It is the
same argument that puts `haiku` and `haiku-oai` in the list one axis over.

Fixture directories carry the backend for the same reason they carry the wire:
the pair would otherwise share one directory and each run would overwrite the
other's evidence.

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

There are exactly **two** exceptions, and both exist for facts the rendered DOM
genuinely cannot express rather than for convenience.

`src/harness-state.ts` is the narrow one: it carries the run phase (so the
runner knows when to assert) and loop-level facts like how many round trips the
tool loop took. It does **not** carry the message parts.

`/api/replay-report` is the other, and only S17 reads it. Whether the in-flight
**fetch** was aborted is not a rendered fact and cannot be made into one — a
cancel that stops the fold without cancelling the request looks identical on
screen. See "What S17 can and cannot see" below. The rendered claims stay in the
scenario; this adds only the claim they cannot make.

### A position is not a speaker

`answer()` was `bubbles().last()` and was described as "the assistant's answer".
It is a **position**. Until the assistant emits its first text delta the last
bubble on screen is the user's own **echoed prompt**, so for the opening of every
turn that helper silently meant *the user* — which is how S17 spent its whole
existence comparing an 89-character prompt to itself and reporting `grew=0`.

The same locator sat under `seesProse`, which S01–S05 all call. Those were green
for a real reason: they assert after the stream finished, so the last bubble
genuinely was the assistant's. That is green **by when they happen to run**, not
green by construction, and the margin was thinner than it looks. Measured on this
fixture set, at the pre-delta moment:

| scenario | its own prose check | what the echoed prompt alone gives it |
|---|---|---|
| S02 | `seesProse(page, 20)` | 77 characters — **passes** |
| S04 | `seesProse(page, 60)` + names Paris, Tokyo, Berlin | 153 characters **and all three cities**, because the prompt asks for them — **passes entirely** |
| S01 | `seesProse(page, 60)` | 42 characters — fails, by luck of prompt length |

S04 is the one to look at twice: its whole final-answer assertion is satisfiable
by the user's own words.

S16 was worse than latent. Its check that a mid-stream error must not wipe the
partial message read `page.locator('[part~="content"]').last()` and failed if it
was empty — but wiping the message removes the assistant's bubble, so `.last()`
falls back to the never-empty user echo and the check **passes hardest in exactly
the case it exists to catch**.

So a bubble is now selected by **speaker**, not position: `assistantBubble()` and
`bubblesOf(page, who)`, with `lastBubble()` kept for the rare "whatever is at the
bottom of the thread" and named so nobody mistakes it for the answer. An
assertion made too early now fails as *"expected at least N characters of visible
ASSISTANT prose, saw 0; 1 bubble(s) are on screen: [the prompt]"* instead of
passing off the prompt. `harness/scenarios.spec.ts` carries the control for it:
it removes every row that is not the echo — reproducing both the opening of a
turn and a stream error that discards the message — proves the trap is armed by
checking the last bubble on the page IS the prompt, and requires the locator to
refuse it.

#### The thread renders no role

None of this should need styling. `<Message role>` already emits `data-role`,
`role="article"` and an `aria-label` naming the speaker — but neither `Thread`
nor `ChatThread` passes `role` when it renders the message list, so every row in
a real `<kai-thread>` is an **unlabelled generic div**. That is a kit gap in its
own right (a screen reader gets no speaker either), and it is why the speaker has
to be inferred here at all.

Until it is closed, two independent signals stand in:

| signal | user | assistant | set by |
|---|---|---|---|
| row alignment | `items-end` | `items-start` | `Thread`'s row class |
| bubble skin | `bg-muted rounded-2xl` | `chat-markdown` (markdown-rendered) | `MessageContent` / `Markdown` |

Alignment **selects**; the skin **cross-checks**. `assertBubbleRolesAreLegible`
runs on the pass path of every prose read and fails if the two disagree or if any
bubble classifies as neither speaker. Drop `items-start` and the locator matches
nothing, so a scenario goes red on a timeout it can explain. Add `items-start` to
user rows — the regression that would quietly restore the original defect — and
the signals disagree and every read fails naming the drift. The middle case, a
locator that still resolves but to the wrong speaker, is the one thing that must
never come back.

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

A `knownGap` scenario's assertion is not put through this pass — it already fails
against its real stream. Its **precondition** is, and S12 also gets a bespoke
**positive** control (in `harness/scenarios.spec.ts`): a citation-shaped anchor is
injected into the thread's shadow root and the locator must find it. A red S12
with a green control is a missing feature; a red S12 with a red control would just
be a bad selector.

## Confirming a gap takes more than a red cell

`knownGap` used to be one string, and any failure at all counted as the gap. That
is a hole the size of the harness. It has already swallowed a real failure: on the
run where the canned fixtures still existed only in OpenAI shape, S13 was replayed
into `readAnthropicStream`, the stream parsed to **nothing**, the assertion spent
20 seconds waiting for an artifact that was never going to exist — and the report
said `KNOWN GAP CONFIRMED` and printed a tidy `gap` cell.

So a gap is confirmable only when all three hold:

1. **`knownGap.reached` passes.** Everything upstream of the gap worked, so the
   run got far enough for the gap to be observable. S12 requires the `search_docs`
   panel to have completed *and to show its doc URLs* — those results are what the
   app turns into `source` parts, and no parts means nothing to fail to render.
   S13 requires an artifact element on screen showing the `v2` revision.
2. **The assertion still fails.** A gap that quietly closed is a gap nobody
   documented.
3. **It fails with the documented message** (`knownGap.signature`). A timeout, a
   page error or a second unrelated bug is not this gap, and filing it as one
   buries a real failure under a known one.

Anything else is a loud red with the reason spelled out. The precondition is held
to the same standard as every other assertion here: `conformance:control` points
it at a stream that cannot reach the gap and fails it if it still passes.

## The consumer card seam rides a normal path

`cardTypes` is how a consumer substitutes their own design-system component for a
card type. It had exactly one end-to-end user: S13 registered `<spike-artifact>`,
because the kit shipped no `artifact` card. When `artifact` landed as the 7th
built-in the workaround was correctly deleted — and the seam's only coverage went
with it, in a green suite.

**Coverage that exists only because something is MISSING is coverage on a timer.**
The day the gap closes, someone deletes the workaround, and they are right to.

So the replacement is not a scenario that reaches for the seam. `get_weather` —
the spike's most-used tool, in the default interactive tool set and offered by
**seven** catalog scenarios — now returns a `weather` card, a type the kit does
not ship, drawn by this app's own `<spike-weather-card>`. A consumer card is what
the app ORDINARILY renders when the model checks the weather, so breaking
`cardTypes` breaks the normal path rather than one bespoke test. It is the same
reasoning as the kit's `isCardTool`, which tests the `kai_` prefix rather than
membership in the built-ins so a consumer type travels the ordinary path.

Adding the card costs nothing on the wire: `card` parts are never encoded
(`wire/encode.ts`), so every recorded fixture stayed valid and a live run sends
exactly the bytes it sent before.

S03 asserts **one** card, S05 asserts **two** — one per observation. The count is
the assertion. "A card-producing scenario ran" and "the seam rendered a card per
tool call" are different facts, and only the second one says the seam works:
pinning the envelope id so the second card upserts over the first leaves S03 green
and a presence check on S05 green too. Only the count goes red. The text check is
scoped INSIDE the card for S13's reason — the `<kai-tool>` panel echoes the tool's
own output a few inches up the thread, so an unscoped `Light rain` passes while the
card renders as empty chrome.

`src/cards.seam.test.ts` guards the half a browser cannot see, in node, with no
key and no network: that the registered type is **still** not a kit built-in (read
off `BUILTIN_CARD_TAGS`, never restated), that a real `runTool` still produces one,
and that scenarios still **assert** it. Delete `seesConsumerCards` from a scenario
and that test goes red immediately — which is the thing that did not happen last
time.

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

### What S17 can and cannot see

S17 makes three claims, and the third one is not a DOM claim — deliberately.

The first two are what the screen shows: the answer **stops growing**, and it
stops **short of the fixture's closing sentence**, which a stream that ran to
the end would have rendered whatever the timings were on the day.

Neither of them can prove the in-flight **fetch** was aborted, and for a while
nothing did. `AssistantStream.abort` makes the fold ignore later deltas, so a
build that dropped `abort.abort()` and kept `stream.abort()` looks **identical**
on screen while the socket stays open and the bytes keep arriving. Confirmed by
disabling each half in turn: only disabling BOTH turned the scenario red. A
cancel that leaks a live request passed. Text going quiet is consistent with the
working implementation and the broken one alike, which is what makes a DOM-only
cancel assertion unable to fail for the reason it exists.

So the abort is now observed where it is actually visible: on the **server**,
the peer whose socket the abort closes. The replay handler records what it wrote
and whether the client hung up mid-stream, and publishes it at
`/api/replay-report`:

| field | what it says |
|---|---|
| `framesWritten` / `framesTotal` | how far the replay got |
| `clientAborted` | the client went away **with frames still owed** — the fetch was aborted |
| `finished` | the handler has stopped writing, so the two above are final |

`clientAborted` is the whole distinction. A close *after* the last frame is the
ordinary end of a completed stream and does not set it, so a build that never
aborts is served every frame and fails. The scenario pins the streaming replay
by id **before** it clicks Stop, so a later replay — a second round, the next
scenario on the same dev server — can never be read as the one under test, and
"nothing was streaming" fails as itself rather than reporting on the wrong
stream.

Waiting for `finished` is the half that keeps it honest: mid-flight, an aborted
stream and a healthy one are indistinguishable, because both have written fewer
frames than they will. A reading taken at the moment of the click would be a
coin flip.

**Watched red, both directions.** With `abort.abort()` commented out of
`stop()`, claims 1 and 2 still pass — the text stops, the closing sentence never
renders — and claim 3 fails with *"the server replayed canned/S17-cancel round 1
to the END: all 16 frames written, client never hung up"*. Restored, 23/23.
`server/replay-abort.test.ts` pins the ledger itself in node, in both
directions, including the false-positive twin: `res.end()` fires `close` too,
and a ledger that counted that as an abort would call every completed stream
cancelled.

What this still does **not** do is bound how PROMPTLY the stream stopped. A
character budget on post-click growth was tried and removed: under a 6x
CPU-throttled renderer it failed 1 run in 5 on working code, growing 355 → 572,
because what it measures is how long the *click* took to dispatch on a loaded
box, not how long the stream kept flowing. A frame budget would inherit exactly
the same problem from exactly the same source — the frames written before the
click lands are a function of renderer speed, and no server-side counter can
subtract that. `clientAborted` is a fact about WHETHER, not about when, and it
is stated that way on purpose.

## A 200 is not proof of reasoning

Every cell in the matrix can be green while a whole column recorded no reasoning
at all. No scenario asserts that the model **thought**, only that what it produced
rendered. So a configuration declared reasoning-capable must have produced
reasoning in its **recorded fixtures**, and `harness/reasoning-coverage.mjs`
asserts that per column, over the committed streams: no key, no network, no
browser.

```bash
node harness/reasoning-coverage.mjs                 # the spike's own fixtures
node harness/reasoning-coverage.mjs /path/fixtures  # any recorded set
```

It runs on every `pnpm test` (`server/reasoning-coverage.test.ts`, the copy that
cannot be skipped) and again at the end of a sweep, so a live run fails at the
moment of recording rather than at the next CI run.

The failure that motivated it was **HTTP 200 with silence**. OpenRouter derives an
Anthropic thinking budget as a percentage of `max_tokens`; the harness caps
`max_tokens` at 900 for cost, so the derived budget landed under Anthropic's
1024-token floor and the provider answered 200 with no thinking at all. Nothing
errored, so every check that asked "did the request fail?" said no.
`anthropic/claude-haiku-4.5` on the OpenAI wire recorded zero reasoning across all
13 scenarios for an entire sweep, and the results doc published that silence as a
provider limitation. `server/thinking-budget.test.ts` pins the request SHAPE; this
pins the OUTCOME, which is the half that survives the next provider's floor.

### Every column declares

`harness/models.mjs` is the catalog, and each entry declares its `wire` and its
`reasons`. Neither is inferred, and neither has a default: a column missing either
is a hard failure (`UNDECLARED`), not a silent skip, so a new model cannot join the
matrix and quietly opt out of coverage. `reasons: false` is held to account in the
other direction too, because a wrong `false` is how a real regression hides behind
an exemption.

The claim is per **column**, not per scenario. Models legitimately decline to think
on a given turn (DeepSeek does, on two of its thirteen), so a per-scenario
requirement would be flaky, and a flaky guard gets deleted. The bug this catches
was a column at exactly zero. The per-scenario breakdown is printed anyway, so a
partial regression is still visible to a reader.

### The verdicts

| verdict | what it says |
|---|---|
| `OK` | the column matches its declaration, in both directions |
| `SILENT` | declared `reasons: true`, recorded zero thinking tokens anywhere |
| `MISLABELLED` | declared `reasons: false` and thought anyway |
| `WRONG-FIELD` | usage frames present, this wire's thinking field absent |
| `TRUNCATED` | a recording does not end with `data: [DONE]` |
| `UNREADABLE` | recordings carry no usage frame at all |
| `UNDECLARED` | the catalog entry is missing `wire` or `reasons` |
| *(no fixtures)* | `UNRECORDED`: a missing measurement, never a pass and never a failure |

They are separate verdicts because they send a reader to different places, and two
of the distinctions are the whole point.

**`TRUNCATED` is checked before `SILENT`.** Usage is the last thing in a stream, so
a stream cut mid-flight carries no usage frame and reads as zero reasoning.
`recordFixture` writes from a `finally` block, so that stream still lands on disk:
short, well-formed, and saying nothing about having failed. Filed as `SILENT` it
would send a reader hunting a thinking budget that was never the problem. A dead
connection must not be reported as a quiet model.

**`WRONG-FIELD` is not `SILENT`,** because the two wires spell the field
differently:

| wire | thinking-token count |
|---|---|
| openai | `usage.completion_tokens_details.reasoning_tokens` |
| anthropic | `usage.output_tokens_details.thinking_tokens` |

A guard keyed only on `reasoning_tokens` reads zero for the entire
`-anthropic-wire` column, whose thinking has worked the whole time, and reports a
**wire** difference as a model failure. `usageFieldFor` therefore switches
exhaustively on the declared wire and throws on anything else: a third dialect has
to be a hard failure, never a silent zero.

`UNRECORDED` is the same line the matrix draws between `skip` and `FAIL`. A column
with nothing recorded is a missing measurement, so it is never reported as a pass
and never counted as a failure.

### Only `live/` carries usage

Every usage assertion is scoped to `fixtures/live/**`. The canned streams under
`fixtures/canned/` and `fixtures/canned-anthropic/` are hand-generated for
behaviours no prompt can provoke, and they carry **no usage frame by design**. A
glob over `fixtures/` would weigh every canned file against the recorded usage
frames and scream truncation at a set that was never recorded, which is this
guard's own defect class one directory over.

### The audit is wider than the run, deliberately

`node harness/run-matrix.mjs --scenarios S01-plain-text` narrows the sweep, but the
audit still reads **every recording on disk** for that column. Its subject is the
committed fixture set the results doc is written from, not the subset that happened
to run. Scoping it to the run would let a one-scenario sweep report a green column
on evidence it never looked at.

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

A scenario that is expected to FAIL needs `knownGap: { what, reached, signature }`
rather than a note, and step 3 covers the precondition too.

The id is a directory name and the sidebar rail is generated from the same
catalog, so a new scenario is also one click away in the browser.
