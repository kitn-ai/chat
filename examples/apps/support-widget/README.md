# Support widget

Rung 1 of the iteration ladder: the smallest real application you can build with
`@kitn.ai/ui`. A docked support chat on a product page — floating launcher,
panel with `<kai-chat>`, submit, streaming replies. **No conversation history, no
sidebar.** Vanilla TypeScript and Vite, no framework.

Plan of record:
[`docs/superpowers/plans/2026-08-19-rung-1-support-widget.md`](../../../docs/superpowers/plans/2026-08-19-rung-1-support-widget.md).

## Run it

The kit resolves through `workspace:*`, so build it first:

```bash
pnpm install          # from the repo root
pnpm exec nx build ui
pnpm --filter @kitn.ai/ui-app-support-widget dev
```

Then open <http://localhost:5178> and click **Support** in the bottom-right corner.

### Mock mode (the default)

With no key set, `POST /api/chat` streams frames from `createMockResponder()` in
`@kitn.ai/ui/state`. They are canned, they are OpenAI-shaped, and they are
impossible to mistake for a model: the stream opens with a `: kai-mock` comment,
every frame carries `_kai_mock`, and `model` reports as `kai-mock`. The response
also carries an `X-Kai-Mock: 1` header for whoever is reading a curl.

### Real mode

```bash
cp .env.example .env.local   # paste an OpenRouter key, restart the dev server
```

The key is **unprefixed** (`OPENROUTER_API_KEY`, never `VITE_…`): Vite only
inlines `VITE_`-prefixed vars into client code, so an unprefixed name cannot
reach the browser bundle. It is read inside `server/chat-api.ts` and nowhere
else. The model defaults to `anthropic/claude-haiku-4.5` and is configurable with
`OPENROUTER_MODEL`.

**The browser code does not change between the two modes.** Same `fetch`, same
`readOpenAIStream`. That is deliberate: it means the path the mock exercises is
the path that ships, so the mock cannot be green over a broken wire.

## How the turn works

`src/chat.ts` is the whole of it, about ninety lines:

1. `kai-submit` fires on the element (non-bubbling — the listener is on
   `<kai-chat>` itself) with the text on `event.detail.value`.
2. The user turn is appended, then the thread is encoded with `toOpenAIMessages`
   from `@kitn.ai/ui/wire` — before the assistant placeholder exists.
3. `POST /api/chat`, and the response goes straight into `readOpenAIStream` with
   an `AssistantStream` from `@kitn.ai/ui/state` as the sink. No hand-rolled SSE
   reader; the kit ships the parser.
4. Every fold assigns a **new array** (what notifies `<kai-chat>`) containing a
   **new object for the message that changed** (what makes the change visible in
   a reference-keyed list). Both halves, on every update.

## Not production

`server/chat-api.ts` is a Vite plugin with `apply: 'serve'`. It does not exist in
a production build: `npm run build` emits a static site whose `/api/chat` 404s.
Shipping this means writing the same endpoint on your own host — the kit's `kai`
MCP scaffolder emits one per framework (`npx @kitn.ai/ui mcp`).
