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

The sidebar is a scenario rail: each entry fires a prompt aimed at a different
component (tool panel / sources row / confirm card / all three / plain text).
The toggle top-right switches how cards are produced (see *Two paths* below).

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
src/tools.ts            The 3 tools + their local, deterministic implementations.
src/card-schema.ts      Path B: the response_format schema + its validator.
src/hooks/useSpikeChat  The multi-round tool loop. The reason to keep the spike.

server/openrouter-proxy.ts  The dev proxy. Adds the key, forwards raw upstream
                              SSE. The only place the key is used.

src/transport.test.ts   Four tests: no key, no network.
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

## The three tools

| Tool | Result | Lands in |
|---|---|---|
| `get_weather(city)` | structured JSON | `<kai-tool>` panel |
| `search_docs(query)` | ranked sources + snippets | `source` parts on the message (not rendered yet: see FINDINGS) |
| `propose_action(title, body, confirmLabel)` | a `CardEnvelope` | a `card` part, rendered inside the message |

All three execute locally with canned data. Results are fed back to the model in
a second turn, so the assistant writes a real final answer; this is a genuine
multi-turn loop, not a single shot.

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
