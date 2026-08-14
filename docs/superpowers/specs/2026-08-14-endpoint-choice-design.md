# Endpoint choice in create-kai - design

Date: 2026-08-14
Status: DESIGN, decisions ruled. Nothing implemented.
Verified against `origin/main` at `7ba376d` (`fix(create-kai): npm strips .npmrc, so
nextjs and tanstack-start cannot scaffold at all (#239)`).

Every claim below was read off that tree, and the results marked EMPIRICAL were
executed against it rather than reasoned about. Where a figure would rot, the command
that prints it is named instead.

Companion spec: `2026-08-14-kai-devtools-design.md`. The diagnostic event stream this
document introduces is the interface that one consumes; the seam is named in both.

## Summary

Replace create-kai's gateway question with one question about the chat endpoint, and
give it a third answer: **you already have a backend, point the UI at it**. That
answer emits no route, no env var and no server code, so it works on every framework
in `FRAMEWORKS` rather than the two that declare a route host. It asks exactly two
things, a URL and a wire format, because those are the two facts the kit needs and
auth is not one of them.

Ship the `reasoning_content` read-side gap with it. Pointing the UI at a provider
directly is what this option makes normal, and DeepSeek-direct currently returns text
and tool calls while dropping every reasoning token.

## The problem

**There is no answer for the most common adopter.** `WIRED_GATEWAYS` in
`packages/create-kai/src/catalog.ts` is `{ mock, openrouter, anthropic }`, and the
prompt in `src/index.ts` ("Wire a model gateway?") offers exactly those, with `mock`
relabelled `None` and hinted "local mock, no key, no backend". Someone dropping a UI
kit into an existing product has a backend already. It may be Python, Go, Elixir,
Rails, a local Ollama, a Mastra server or a Pi binary. The menu has nothing for them,
so they take `None` and then hand-edit the starter.

**It is the answer most clearly inside our own contract.** Root `CLAUDE.md`: "The kit
PARSES, the consumer FETCHES". A user who already fetches is the case the library was
designed around. `readOpenAIStream` accepts a `Response`, a `ReadableStream` or any
async iterable of bytes or strings, and that is the entire transport surface
(`src/wire/read.ts`). Scaffolding a provider route is the option that sits *outside*
the contract, and it is the only one we offer.

**On most frameworks the question is not even asked.** The gateway prompt filters to
gateways this framework can host, then skips the prompt entirely when one survives:

```ts
const wired = gateways.filter(
  (g) => g.wired && wirableGateway(g.integration.id, framework) === null,
);
const gatewayId = normalizeGateway(args.gateway) ?? (nonInteractive || wired.length === 1
  ? ZERO_CONFIG.gateway
  : await ask(p.select({ message: 'Wire a model gateway?', ... })));
```

`wirableGateway` refuses a keyed gateway for any framework whose row carries
`route: null`. Only `react` and `nextjs` declare a route host; run
`grep -n "route:" packages/create-kai/src/frameworks.ts` for the rows. So on every
other ready framework only `mock` survives the filter, `wired.length === 1`, and the
user is never asked anything about where their chat comes from. They get the mock
silently. The endpoint answer needs no route host, so it puts a real question back on
every framework.

## Options considered

**A. Add `endpoint` to the gateway list as-is.** Rejected. "Endpoint" is the absence
of a gateway, not one of them: it has no `Integration` entry, no `envVars`, no
`webRoute`, and `wirableGateway` would have to special-case it the way it already
special-cases `mock`. A menu whose entries are three providers and one non-provider
reads as a fourth provider the reader has not heard of.

**B. A separate "do you have a backend?" question.** Rejected. The flow already asks
framework, layout, features and gateway (`src/index.ts`, the numbered blocks). This
adds another axis whose most common answers delete a later question, which is the
shape that makes a wizard feel like a form.

**C. One question, reframed. RULED.** The gateway question was always about where the
reply comes from. Ask that.

## The design

One `p.select`, replacing block 4:

```
What answers your chat endpoint?
  You already have one      point the UI at your own URL
  Scaffold a provider       OpenRouter or Anthropic, with a server route and a key
  Nothing yet               local mock, no key, no backend
```

### 1. You already have one

Two follow-up questions, then a front-end-only emit.

```
Endpoint URL   (/api/chat)
What does it stream?
  OpenAI chat completions SSE      readOpenAIStream
  Anthropic Messages SSE           readAnthropicStream
```

No route file, no `.env` entry, no dependency added, no config edit. That is what
makes it available on every ready framework: nothing in it needs a server, so the
`route: null` rows are as scaffoldable as `react`.

`kai.json` records the answer, because a v2 `add` reading `gateway: 'mock'` cannot
tell a project on the mock from a project on the user's own endpoint. Bump
`KAI_JSON_VERSION`, let `gateway` take the literal `'endpoint'` beside the catalog
ids, and add one block:

```jsonc
"gateway": "endpoint",
"endpoint": { "url": "/api/chat", "format": "openai-sse" },
"paths": { "route": null }   // no route was written, so there is none to name
```

`endpoint` is `null` for the other two answers. The version bump is what stops an
older reader from seeing an unfamiliar `gateway` value and guessing.

### 2. Scaffold a provider

Today's keyed path, unchanged in mechanics: a route file, an env var, the `.env`
entry, the dev-server plugin on a Vite SPA. Offered only for a (gateway, framework)
cell `wirableGateway` accepts, exactly as now.

Frame it as what it is. On a Vite SPA the route is a dev-server middleware and answers
`npm run dev` only (`viteSpaHost()` reports `production: false`); on Next it is a route
handler that also answers `next start` (`production: true`). It is a convenience and a
starting point the user owns from the moment it lands in their repo.

### 3. Nothing yet

The mock, unchanged. Still the default for `--yes` and for a non-TTY.

## Decisions

| Decision | Ruling | Rationale |
|---|---|---|
| One question or two | **One**, reframed as "what answers your chat endpoint?" | The gateway question was always this question. Option B's axis is deleted by its own answers. |
| Questions the endpoint answer asks | **URL and wire format. Nothing else.** | They are the two facts the kit needs. See below. |
| Auth | **Not prompted. A marked seam in the emitted fetch.** | Key header, bearer JWT, cookie session and none are four shapes, and picking one is a policy decision. `CLAUDE.md`: whether this request is allowed is the app's call. |
| A separate "no backend, leave me a TODO" option | **No.** | The mock is already a working call of the correct shape through the same reader. A TODO seam is strictly worse. |
| Where the emit lives | **A new context shape for `GATEWAY_PATCHES`**, not new emission logic | Same swap, minus the route file and the key. |
| Reader must match the chosen format | **A front-end wire table plus a build guard**, the mirror of `BROWSER_WIRE` | Getting it wrong is the quietest failure in the system. EMPIRICAL below. |
| `reasoning_content` | **In scope for this work** | This option makes direct-to-provider normal, and that is when the gap fires. |
| `kai.json` | **Bump `KAI_JSON_VERSION`; add `endpoint`** | A v2 `add` reading `gateway` alone cannot tell "user's own endpoint" from "mock". |
| Route hosts for the remaining frameworks | **A follow-on, not part of this** | The endpoint answer removes the urgency; `viteSpaHost()` covers most of what is left. |

## Why exactly two questions

**Format is asked because the kit does not guess.** `readModelStream` takes
`opts.format` and dispatches every frame through `opts.format.open().push(frame)`.
There is no sniffing anywhere in `src/wire/`. `readOpenAIStream` and
`readAnthropicStream` are three-line wrappers that pass `openaiChatFormat` and
`anthropicMessagesFormat`; all four are public exports of `@kitn.ai/ui/wire`
(`src/wire/index.ts`). So the emitted line is one of two, and only the user knows
which.

Offer the two the kit ships and nothing else. `WireFormat` is a value with
`id`, `open()` and a reader with `push()`, not a flag, so a third-party dialect is
already extensible without a PR; the prompt does not need a "custom" entry, the README
needs a paragraph. This matters more than it sounds: `vercel-ai-sdk` in the kit's own
catalog carries `streamFormat: 'ai-sdk'`, which neither shipped format reads, and
someone whose existing backend is built on that SDK is a plausible user of this
option. The README paragraph is where they land.

**Auth is not asked because we would be guessing at policy.** The emitted fetch
carries the seam and says so:

```ts
const res = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    // Your endpoint's auth goes here: an Authorization header, an API key
    // header, whatever your backend expects. For a cookie session add
    // `credentials: 'include'` below instead.
  },
  body: JSON.stringify({ messages: toOpenAIMessages(chat.messages) }),
});
```

## Why there is no "leave me a TODO" option

**The mock is already the right shape.** The starters call
`readOpenAIStream(mockResponse(text), stream)` where `mockResponse` comes from
`createMockResponder()` in `@kitn.ai/ui/state` (`examples/starters/react/src/App.tsx`,
`src/chat-data.ts`). The canned frames go through the same reader, the same part
folding and the same abort handling a real provider's response goes through. A user
who picks "nothing yet" already has a working program; a TODO seam would hand them a
broken one.

**The swap is already written.** `goLivePatches()` in `packages/create-kai/src/patches.ts`
is the whole edit, and every row is a `find` the build verifies against the template:

- widen the `@kitn.ai/ui/wire` import to bring in `toOpenAIMessages`
- drop `mockResponse` from the `./chat-data` import, because the starters compile under
  `noUnusedLocals` and a left-behind import is TS6133 and a hard build failure
- fix the docblock sentence that tells the reader to swap `mockResponse(text)` for a
  real fetch
- fix the line above the append that calls the reply "(mock)"
- replace the NO-BACKEND comment block together with the call itself

The endpoint answer reuses all of it. What changes is the context: `GatewayPatchContext`
today carries `thread`, `routeFile`, `gatewayTitle` and `model`. The endpoint answer
has no route file, no gateway title and no model to post, and it has a URL and a
format instead. So the ruling is a context shape, not a second emitter:

```ts
type EndpointTarget =
  | { kind: 'gateway'; routeFile: string; gatewayTitle: string; model: string | undefined }
  | { kind: 'endpoint'; url: string; reader: 'readOpenAIStream' | 'readAnthropicStream' };
```

The comment text differs by branch (a route file exists in one case and not the other),
the import line differs by reader, and the fetch body is the same expression quoted out
of the starter by `goLiveThread`, which is what already keeps `chat.messages` from
being emitted into Vue.

`GATEWAY_PATCHES` has rows for `react` and `nextjs` only, because those are the two
frameworks that can host a route. The endpoint answer needs a row per ready framework,
and `goLivePatchesFor(appFile)` is not enough for all of them. Every starter calls
`readOpenAIStream(mockResponse(text), stream)` under the same NO-BACKEND comment, but
the three that hold their send logic in a composable or a store keep the docblock
sentence somewhere else: `vue` in `src/composables/useChat.ts`, `svelte` in
`src/lib/chat.svelte.ts`, `angular` in `src/app/state/chat.store.ts`. Those rows patch
two files. `vanilla` words its second comment differently again
("Append the user turn, then stream the (mock) assistant reply."), so its row needs its
own `find`. None of that can go wrong quietly: `scripts/build.mjs` runs every patch
against the copied template at build time and fails naming the patch and its `why`
when one stops matching. Write the rows, run the build, read what it says.

## The hazard: the reader must match the format

**EMPIRICAL, executed against this tree.** Feed an Anthropic Messages SSE body to
`readOpenAIStream` and the turn comes back with no parts, no sink calls, `chunks: 0`,
and `error.code: 'empty-stream'`. Feed the same reader a body that is OpenAI-shaped but
carries its payload in a field this format does not read, and the turn comes back with
`chunks: 1`, `parts: []`, `finishReason: 'stop'` and **`error: undefined`**.

That second result is the one that matters, and it is narrower than the note this repo
repeats. `packages/create-kai/README.md`, `src/build-guards.ts` and the `anthropic`
integration note all say a foreign dialect "does not throw" and "parses to nothing and
the turn ends silently empty". Since the `empty-stream` guard landed in
`src/wire/consume.ts`, that is true of the throw and false of the silence: a turn that
consumed **zero** chunks now carries an error explaining itself in a paragraph. What is
still silent is a turn that consumed chunks and produced nothing from them, because the
guard is keyed on `chunkCount === 0`.

And the loudness that does exist reaches nobody, because the emitted app throws it
away. The starters write `await readOpenAIStream(mockResponse(text), stream);` and
discard the `ModelTurn`. The kit produces a diagnosis; the scaffold drops it on the
floor.

Three rulings follow, and all three are in scope:

1. **A front-end wire table, mirroring `BROWSER_WIRE`.** `BROWSER_WIRE` exists because
   what the browser receives cannot be derived from `Integration.streamFormat`, and
   `routeWireProblem` requires an entry per wired gateway rather than defaulting one.
   The endpoint answer needs the same discipline pointed the other way: the chosen
   format decides the emitted reader, one mapping, asserted by a guard, so a third
   format cannot be added to the prompt without deciding what it emits.
   `EMITTED_READER_FORMAT` is the constant that has to stop being a constant.
2. **Widen the empty-turn guard to "consumed frames, produced no parts".** Today's
   condition is `chunkCount === 0 && !error`. The honest condition is that plus a turn
   whose recorder produced no parts at all. The kit is the only layer that can see
   both numbers.
3. **The emitted code keeps its `ModelTurn` and reports the error.** Not a TODO, a
   line:

```ts
const turn = await readOpenAIStream(res, stream);
stream.done();
// A reader pointed at the wrong dialect parses to nothing and the turn arrives
// empty. `turn.error` says which failure this was.
if (turn.error) console.error(`[kai] ${turn.error.message}`);
```

This also fixes the gateway path, which has the same hole today.

## The `reasoning_content` gap

"OpenAI-compatible" is reliable for `delta.content` and `delta.tool_calls`. Reasoning
is where it stops being reliable, and the field name is the reason.

- DeepSeek's own API streams the reasoning trace as `delta.reasoning_content`,
  alongside `delta.content`.
- OpenRouter normalizes the same models to `delta.reasoning`.
- `openaiChatFormat` reads `delta.reasoning`, with `delta.reasoning_details` as a text
  fallback and as the round-trip payload (`src/wire/formats/openai.ts`, `applyReasoning`).
  It does not read `reasoning_content`: `git grep -n "reasoning_content" -- packages/ui/src`
  returns nothing. The only occurrence in the repo is a row in
  `apps/docs/src/content/docs/integrations/langgraph.mdx` mapping
  `additional_kwargs.reasoning_content` onto a reasoning part, so the field name is
  already known to the project in a place the parser cannot see.

So an app pointed straight at DeepSeek gets text and tool calls and silently drops
every reasoning token. It has been invisible because everything went through
OpenRouter. This option is what makes direct-to-provider normal.

**Fix, read side only:** add `reasoning_content` as a fallback in `applyReasoning`,
below `reasoning` and beside the existing `reasoning_details` fallback, with the same
precedence rule that exists because OpenRouter sends the same text twice.

**The encode side stays as it is, deliberately.** `toOpenAIMessages` emits a
`reasoning_details` entry only when a part carries `raw.source === 'openai.reasoning_details'`
(`detailOf` in `src/wire/encode.ts`), so a part read from `reasoning_content` is not
echoed at all, which is the safe default: DeepSeek-direct wants `reasoning_content`
back and would reject OpenRouter's `reasoning_details` shape. Give the new fallback its
own `raw.source` (`openai.reasoning_content`) so it cannot be mistaken for the
OpenRouter shape by anything downstream, and leave the round trip out of scope.

## Route hosts are now a follow-on

With the endpoint answer shipped, a missing route host stops meaning "this framework
cannot answer the question" and starts meaning "this framework cannot scaffold a
provider for you". That is a smaller thing. The shapes, read off the starters' own
build scripts and dependencies:

- `vue`, `svelte` and `html` (template dir `vanilla`) are Vite SPAs of the same shape
  as `react`: `dev: vite`, `build: <typecheck> && vite build`, `vite` in
  devDependencies. The Svelte starter is `@sveltejs/vite-plugin-svelte`, **not**
  SvelteKit, so it has no server and needs the same dev-server middleware React does.
- `solid` is a Vite SPA too, with the caveat that it is the one target that imports the
  SolidJS components directly rather than registering `kai-*` (`registration: 'solid'`).
  That does not affect the route.
- `viteSpaHost()` in `src/routes.ts` is already a factory, and `REACT_ROUTE_HOST` is
  one call of it. Those four rows are mostly a call each plus their own config-edit
  patches, since the plugin has to be registered in each framework's `vite.config.ts`.
- `tanstack-start` has a real server (`@tanstack/react-start`, `vite dev`, and a
  `serve.mjs` for `start`), so it gets a production-capable host of its own.
- `angular` builds with the Angular CLI (`ng build`, `@angular/build`) and is its own
  case.

## Deliberately out of scope

- Retries, reconnect and abort. `src/wire/read.ts` lists them as deliberately absent
  and the reason has not changed.
- The `reasoning_content` round trip on encode. Named above, ruled out above.
- A "custom dialect" entry in the prompt. The `WireFormat` seam covers it in docs.
- Widening `WIRED_GATEWAYS`. Independent work with its own blockers, catalogued in
  `packages/create-kai/README.md`.

## Diagnosability, and where the line is

We are not responsible for the user's provider working. We are responsible for its
failure being diagnosable in seconds instead of an afternoon. `CLAUDE.md` states the
principle this falls under: a silent drop, a silent truncation, a swallowed error and a
silent fallback are each a decision made while withholding the information that it
happened. Deciding loudly is usually fine; deciding quietly almost never is.

**Already loud, keep it that way.** `WireError` throws before a single chunk is read on
any non-`ok` response, carrying `status`, `statusText`, `bodyText` (the raw body,
always) and `body` (the same parsed as JSON, `undefined` when it was not JSON, which
the code documents as the HTML-error-page-from-a-proxy case). It restores its own
prototype so `instanceof WireError` survives a consumer build that downlevels to ES5.
A missing body throws its own message naming `stream: true` and intermediate buffering.

**Silently broken, and this option is what makes it common.** A 200 that streams a
dialect the chosen reader cannot read. Zero chunks is covered by `empty-stream`;
chunks-with-no-parts is not, and that is the case measured above. An endpoint returning
plain JSON instead of SSE lands in the covered half.

**Theirs, not ours.** CORS. Their auth. Their model id. A proxy buffering SSE so the
whole stream arrives at once. We can often name these; we cannot fix them.

**Three responses.**

1. Make "consumed frames, produced no parts" loud, as ruled above. The kit is the only
   layer that can say it, because it is the only layer that sees both counts.
2. Give the `kai` MCP `debug` tool wire rules. Its rules today are component contract
   (array as attribute, in-place mutation, non-bubbling events, the `kitn-` prefix,
   unregistered elements) plus packaging and SSR, and exactly one transport rule:
   `vite-api-404`, which covers a 404, the case `WireError` already reports in words.
   Nothing covers a 200 that parses to nothing, a reader pointed at the wrong dialect,
   or reasoning tokens dropped by field name. Run
   `grep -n "id: '" packages/ui/src/agent-tooling/mcp/tools/debug.ts` for the current
   set.
3. Name the symptom in the emitted code, beside the format choice, where someone
   editing the URL will read it.

**The seam.** Each of those three wants the same underlying thing: the parse pipeline
saying what it saw. Frames in, chunks out, parts by variant, which format was chosen,
which fields were recognised. Emit that as a diagnostic event stream rather than a
console message, and the console line becomes one subscriber of it. The devtools spec
is the other, and the interface is the boundary between the two documents.

## How to check the claims in this spec

| Claim | Check |
|---|---|
| Wired gateways and the prompt copy | `grep -n "WIRED_GATEWAYS" packages/create-kai/src/catalog.ts`; block 4 of `src/index.ts` |
| The prompt is skipped when only mock survives | `wired.length === 1` in `src/index.ts` next to `wirableGateway` in `src/catalog.ts` |
| Which frameworks declare a route host | `grep -n "route:" packages/create-kai/src/frameworks.ts` |
| No format sniffing | `readModelStream` in `packages/ui/src/wire/read.ts` |
| Both formats are public | `packages/ui/src/wire/index.ts` |
| The mock goes through the real reader | `examples/starters/react/src/App.tsx` and `src/chat-data.ts` |
| The swap is already written, and verified at build time | `goLivePatches()` in `packages/create-kai/src/patches.ts`; `scripts/build.mjs` fails when a row stops matching |
| Wrong dialect, zero chunks | `chunkCount === 0` branch in `packages/ui/src/wire/consume.ts` |
| Wrong dialect, chunks but no parts | Drive `readOpenAIStream` with an OpenAI-shaped frame carrying an unread field; `turn.error` is `undefined` |
| `reasoning_content` unread | `git grep -n "reasoning_content" -- packages/ui/src` returns nothing |
| Starter shapes | the `scripts` and dependency blocks of each `examples/starters/*/package.json` |
