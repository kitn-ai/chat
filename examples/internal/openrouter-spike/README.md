# OpenRouter spike

> ## ⚠ THIS IS A SPIKE, NOT A STARTER
>
> It is research code that lives in `examples/internal/` on purpose. It is **not**
> part of the supported starter set (`examples/starters/*`), it is not referenced
> from the docs, and nothing here is a pattern to copy wholesale into a consumer
> app. It exists to answer questions about `@kitn.ai/ui`'s data model by driving
> the kit's tool / reasoning / card components from a **real model**, and to
> record where that hurt.
>
> The findings this produced are the deliverable, and they are written up in
> **[FINDINGS.md](./FINDINGS.md)**. The app is the instrument.

A copy of `examples/starters/react/` with the fake responder replaced by
[OpenRouter](https://openrouter.ai). Same hand-composed workspace
(`<kai-conversations>` rail, `<kai-thread>`, `<kai-prompt-input>`), but the
replies, the reasoning, the tool calls and the cards all come from a live model.

## Run it

```bash
pnpm install                    # once, from the repo root
pnpm build:ui                   # the example imports the kit's built dist/

cd examples/internal/openrouter-spike
cp .env.example .env.local      # then paste your key after OPENROUTER_API_KEY=
pnpm --filter @kitn.ai/ui-example-openrouter-spike dev   # http://localhost:5177
```

The sidebar is a scenario rail, generated from the **conformance catalog** in
`src/scenarios/`: each entry fires the same prompt, with the same tools, that the
Playwright harness runs, so "it works when I click it" and "the suite is green"
cannot drift apart. Entries marked `(replay)` cost nothing and need no key.
The toggle top-right switches how cards are produced (see *Two paths* below).

## The conformance harness

The reason the spike is still here. 19 scenarios covering text, reasoning, tool
loops, every card type, attachments, interleaving, cancellation and provider
failure — each one asserting **rendered** state through the shadow DOM, each one
watched failing before it was trusted. See **[HARNESS.md](./HARNESS.md)**.

```bash
pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance          # free: replay only
pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance:live     # $0.0015 measured, records fixtures
pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance:control  # prove the assertions can fail
```

Costs are trivial: the default model is `$0.09 / $0.18` per million tokens and
`max_tokens` is capped at 900, so a full three-round tool conversation costs
about **$0.0003**.

## The API key never reaches the browser

| | |
|---|---|
| Env var | `OPENROUTER_API_KEY` (**unprefixed**). Vite only inlines `VITE_`-prefixed vars into client code. There is no `VITE_OPENROUTER_API_KEY` and there must never be one. |
| Where it is read | `server/openrouter-proxy.ts`, via `loadEnv(mode, root, '')`. The empty prefix is what makes an unprefixed var readable. |
| Where it is used | One `Authorization` header, server-side. Never logged, never echoed in an error body, never returned by `/api/config` (which reports `hasKey: boolean`). |
| Where the provider lives | `server/` only. Nothing under `src/` names the provider at all, and `src/transport.test.ts` reads `transport.ts` back to assert it. |
| Gitignore | `.env`, `.env.local`, `.env.*.local` are all ignored by this directory's `.gitignore`. |
| Worktrees | `OPENROUTER_ENV_DIR` points `loadEnv` at a different directory when the key lives in the primary checkout. It changes only WHERE loadEnv looks; nothing reads or forwards the value. |

There is no provider SDK. The proxy calls the HTTP endpoint directly and forwards
the upstream SSE bytes untouched, which is what every integration template in the
kit's catalog tells a consumer to do.

Verified by grepping the production bundle: the key's value, the string
`OPENROUTER_API_KEY` and the host `openrouter.ai` are all absent from `dist/`.

**Not production.** The proxy is `apply: 'serve'`: it does not exist in a
build. `vite build` produces a static site with no `/api/chat` at all. A real
deployment needs its own server route or serverless proxy.

## Layout

```
src/transport.ts        Browser → POST /api/chat, and nothing else. Returns the
                          Response; the kit parses it.
src/tools.ts            The 11 tools + their local, deterministic implementations.
src/card-schema.ts      Path B: the response_format schema + its validator.
src/hooks/useSpikeChat  The multi-round tool loop. The reason to keep the spike.
src/scenarios/          The conformance catalog: one module per scenario, each
                          owning its prompt, its tools and its DOM assertion.
src/useHarnessRun.ts    ?scenario=&mode= — the browser half of the harness.

server/openrouter-proxy.ts  The dev proxy. Adds the key, forwards raw upstream
                              SSE, records it, and replays it. The only place the
                              key is used.

harness/                Playwright config + the runner + the canned-SSE generator.
fixtures/               canned/ (hand-generated) + live/ (captured). Committed.

src/transport.test.ts       Four tests: no key, no network.
server/replay-guard.test.ts Eight tests pinning the replay path resolver.
```

The adapter this spike was built to prototype has SHIPPED. `src/model-stream.ts`
and `src/sse-frames.ts` are now `packages/ui/src/wire/`, published as
`@kitn.ai/ui/wire`, and `server/sdk-bridge.ts` is gone with the SDK it wrapped.
What is left is a thin app over the shipped adapter, which is exactly what makes
it a useful smoke test against a real model.

## Tests

```bash
pnpm --filter @kitn.ai/ui-example-openrouter-spike test
```

Four tests over `openChatStream`: it hands back the Response unwrapped, a proxy
failure reaches the caller as a `WireError` carrying the provider's own error
body, `transport.ts` never names the provider host, and the POST body carries the
fields the proxy reads. **No API key and no network required.**

The 40 tests that used to live here moved into `packages/ui/src/wire/`, where
they run against captured provider fixtures instead of handcrafted ones.

## The tools

Each one is chosen to land in a DIFFERENT part type or component, so a scenario
can reach that component from a prompt.

| Tool | Result | Lands in |
|---|---|---|
| `get_weather(city)` | structured JSON | `<kai-tool>` panel |
| `search_docs(query)` | ranked sources + snippets | `source` parts (render nothing yet: see FINDINGS) |
| `propose_action(...)` | a confirm `CardEnvelope` | a `card` part |
| `ask_choice(...)` | a choice card | a `card` part |
| `request_form(...)` | a JSON-Schema form card | a `card` part |
| `plan_tasks(...)` | a tasks card | a `card` part |
| `preview_link(url)` | a link card | a `card` part |
| `embed_video(...)` | an embed card | a `card` part |
| `open_artifact(...)` | a consumer-registered artifact card | a `card` part |
| `attach_file(name)` | an attachment | a `file` part |
| `fail_deploy(target)` | a deterministic FAILURE | `<kai-tool>` in `output-error` |

They all execute locally with canned data. Results are fed back to the model in a
later turn, so the assistant writes a real final answer; this is a genuine
multi-turn loop, not a single shot.

A scenario picks the subset it needs with `pickTools(...)` and the system prompt
is built from that same list, so it can never advertise a tool the request omits.
`fail_deploy` exists because no prompt can make a tool fail on cue, and the tool
panel's `output-error` branch is otherwise unreachable from a model.

## Two paths to a card

The toggle in the header switches between the two ways generative UI could work:

- **Card via tool**: `propose_action` is a normal tool; the app turns its
  arguments into a `CardEnvelope`.
- **Card via schema**: `response_format: json_schema` makes the model emit
  `{ reply, card }` directly, with the confirm envelope inline.

Both were run live. The comparison, with numbers, is in
[FINDINGS.md](./FINDINGS.md#cards-tool-call-beats-structured-output). The short
version is that **Path A wins**, because `response_format` suppresses tool
calling entirely and forces the whole assistant message to be JSON.

## Model

Default `~deepseek/deepseek-v4-flash-latest` (override with `OPENROUTER_MODEL`).
The leading `~` is real: it is OpenRouter's floating-latest alias, and it is
*cheaper* than the pinned `deepseek/deepseek-v4-flash`. Confirmed via
`GET /api/v1/models` to support `tools`, `tool_choice`, `reasoning`,
`reasoning_effort` and `structured_outputs`.
