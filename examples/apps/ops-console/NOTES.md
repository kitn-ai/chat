# NOTES

Everything below is a question I could **not** answer from the `kai` MCP server, and
what I did instead. Sources are marked:

- **MCP** — `component_reference` / `scaffold` / `debug` / `theme`.
- **Installed types** — `.d.ts` files under `node_modules/@kitn.ai/ui/dist`. Shipped
  with the package, so fair game, but not something the MCP told me.
- **Installed JS** — I read the built bundle in `node_modules` to settle a behaviour
  question the types could not. Always a last resort, and always confirmed in a browser.
- **Measured** — I ran it in headless Chromium and looked.

No remote docs were fetched; `llms-full.txt` / `ui.kitn.ai` (which the `debug` tool
repeatedly suggested) were **not** consulted, and the package's source on npm/GitHub
was not read.

---

## 1. Blocking gap: `<kai-chat>` draws cards but emits nothing for them

**The question the MCP could not answer.** `kai-chat`'s reference calls it a card
HOST — "it draws whatever envelopes arrive" — and documents `cardTypes` / `cardSchemas`.
It documents no `policy` prop and no card event, and its event list has none. Asking
`debug` twice ("where do I attach the CardPolicy for cards inside kai-chat", "clicking
Approve fires no kai-card event") returned no matching pattern both times; the second
answer was about non-bubbling events, which is the opposite of the `kai-card` protocol
exception the invariants describe.

**Measured.** A `confirm` card emitted as the built-in `confirm` type renders correctly
inside `<kai-chat>` and clicking Approve dispatches **no** event anywhere — not on the
card, not on `<kai-chat>`, not on `document` (capture-phase listener). The kit's own
`listenForCardEvents(chatEl, policy)` never fires. `<kai-chat>` renders built-ins with
internal Solid components; the `policy` prop and `kai-card-resolved` live on
`<kai-cards>`, a different surface. Overriding `cardTypes` with the built-in tag map
(`{ confirm: 'kai-confirm', … }`) does **not** change this — for a type the kit knows,
the component map wins over the tag map.

**Guess I had to make.** Declare the four card types as this app's **own** custom types
(`approval`, `parameters`, `options`, `checklist`) with `use: []`, each pointing at the
kit's element for that card (`kai-confirm`, `kai-form`, `kai-choice`, `kai-tasks`) and
carrying the kit's own authored schema from `cardSchemas`. For an unknown type the
renderer *does* dispatch to the tag, the element *does* emit `kai-card` (bubbling and
composed), and `listenForCardEvents` on `<kai-chat>` picks it up. Verified end to end.

The cost of the guess: tool names are `kai_approval` / `kai_parameters` / … rather than
`kai_confirm` / `kai_form`. Still card tools (`isCardTool`, `cardFromToolCall` and
`toolNameForCardType` all work on the `kai_` prefix), but a model prompted with the
kit's canonical names would need the registry, not the convention.

**Open question for the kit:** is a `policy` prop (or a re-emitted `kai-card`) on
`<kai-chat>` intended and missing, or is "cards in `<kai-chat>` are display-only, use
`<kai-cards>` for interactive ones" the design? If the latter, the `kai-chat` reference
saying it is a HOST is misleading — it draws, but nothing can answer.

## 2. `<Remote>` from `@kitn.ai/ui/react` cannot mount `<kai-remote>`

**Not covered by the MCP.** Neither the `kai-remote` reference nor the React scaffold
mentions how the generated wrappers assign props.

**Installed JS + measured.** Every generated React wrapper renders the bare tag with
only `ref`/`className`/`style`/`id` and assigns real props from a `useLayoutEffect` —
i.e. after the element is in the document, so after `connectedCallback`. Harmless for
elements that re-render reactively. `<kai-remote>` reads `providerOrigin`, `src` and
`envelope` **once** at mount and renders a permanent error if any is missing, so
through the wrapper it always painted:

```
[kai-remote] Invalid provider-origin "". Must be an absolute https: origin, …
```

while `el.providerOrigin` read back correctly a tick later. That is the `upgrade-race`
invariant with the halves swapped: the element is defined in time, the *props* are late.

**Guess:** `src/RunBoardFrame.tsx` creates the element, sets every prop, and only then
appends it. Plus a static `import '@kitn.ai/ui/elements/remote'` in `main.tsx` — the MCP
*does* say this element is opt-in and excluded from register-all, and `createElement`
only upgrades an already-defined tag.

## 3. Un-resolving a card needs a new `data` reference

**Not covered by the MCP.** `debug` explains `dismissRecovery` and that `onReopen`
"clears the resolution back to live". It does not say that clearing it is not enough.

**Installed JS + measured.** A card element keeps its own optimistic resolution from the
moment it is clicked and reads `props.resolution ?? thatLocalOne`. Clearing the envelope's
`resolution` therefore leaves the card looking answered while the thread says it is live —
which broke both undo paths. The local copy is reset by an effect on `data`, so a new
`data` **reference** (content untouched) is what actually re-arms the card.

**Guess:** `revive()` in `src/card-store.ts`, applied wherever a resolution goes from
set to unset — our reject-Undo and everything `dismissRecovery` writes through `set`.
I could not tell from the MCP whether relying on this is intended API or an internal
detail; it is the only lever the element exposes.

## 4. `createMockResponder()` cannot emit tool calls

**From installed types** (`state/mock.d.ts`): the responder takes `replies?: string[]` and
cycles canned **text**. The scaffold's mock integration is text-only. An ops console is
nothing but tool calls, so the MCP's mock path could not carry the cards.

**Guess:** `server/script.ts` hand-builds OpenAI chat-completions SSE frames (the shape
the scaffold says every non-mock integration re-frames to), and uses the kit's responder
verbatim for the fallback turn. Every frame carries the kit's own mock tells, imported
rather than restated: `MOCK_BANNER`, `MOCK_MARKER_KEY`, `MOCK_MARKER`, `MOCK_MODEL_ID`,
all-zero usage. Frame shape (`choices[0].delta.tool_calls[].function.arguments` as
fragments, `finish_reason: "tool_calls"`, `data: [DONE]`) was read off the OpenAI format
reader in the installed bundle and confirmed by the reader parsing it.

## 5. Card tool calls also render a tool panel

**Not covered by the MCP.** `kai-chat`'s "wiring the loop" section says to use
`cardFromToolCall` + `isCardTool`, but not that the same call has already been turned
into a `<kai-tool>` panel by the stream accumulator — so a proposal renders twice, once
as a collapsed `kai_approval` panel and once as the card.

**Guess:** `cardAwareSink` in `src/assistant.ts` wraps the `AssistantStream` and drops
`upsertTool` for tool-call ids whose announce patch carries a `kai_`-prefixed name.
`ConsumeOptions.onToolCallReady` (from the installed types) is the hook that turns the
call into the card. Tools the app really runs are deliberately *not* suppressed.

## 6. `<kai-remote>` never re-sends a changed `envelope`

**Installed JS.** The element reads `envelope` in `onMount`; its `createEffect` only
pushes theme changes. `mountRemoteCard`'s handle has `update(envelope)`, but the element
never calls it. So a host cannot push updates into a framed card, and remounting to force
one would redo the handshake on every tick.

**Guess:** the board owns its own liveness. `<kai-remote>` gets one stable envelope, and
the board page subscribes to the run feed on **its own** origin. This also makes the
console and the board two renderings of one state rather than two simulations.

Related, same source: the host's inbound allow-list for card verbs is
`ready, submit, action, send-prompt, open, resize, state, dismiss, error` — **`reopen`
is not in it**, so a remote card cannot ask to be reopened. Not documented anywhere I
could find; it does not affect this app (the board card is never dismissed).

## 7. Smaller things the MCP did not cover

- **`CardValidationReport` field is `ok`, not `valid`** — from `card-validate-cards.d.ts`.
  The MCP describes `registry.validate()` but not its return shape.
- **`RemoteCardRenderer` / `CardBridge` / `CardHost`** — the `kai-remote` reference covers
  the HOST half only. The whole provider side (`createCardBridge({ root, renderers })`,
  `renderer.mount(root, envelope, host)` returning a disposer, `host.emit(CardEvent)`,
  auto-resize via a `ResizeObserver` on `root`, remount-on-theme-change, the
  `__proto__`/`constructor`/`prototype` payload rejection) came from `remote/*.d.ts` and
  the provider bundle. `debug` had no pattern for "how does a remote card talk back".
- **`tasks` card `mode: 'progress'`** is a checklist, but its rows stay user-toggleable —
  `readonly` is an element prop, not part of card data, so a card rendered through the
  registry cannot set it. The checklist here is app-driven and rewritten from the run feed
  on every tick, so a stray toggle is corrected within ~2s. I could not find a way to make
  a progress checklist genuinely display-only.
- **Vite 8 + `@vitejs/plugin-react`** — plugin 6.1.0 peers on `vite@^8`, so `vite@^7`
  fails to resolve. Nothing to do with the kit; noted because it shapes the toolchain.

---

## Deliberate limitations (not guesses — decisions)

- **`/api/chat` and `/api/run/*` are Vite dev-server middleware.** `npm run build`
  produces static bundles in `dist/console` and `dist/board`; served from a plain static
  host they have no API. That matches the scaffold's own "DEV ONLY" note. `server/chat.ts`
  and `server/run-engine.ts` are plain modules over WHATWG `Request`/`Response` so they
  drop onto a real server unchanged.
- **Run state is in memory in the board server.** Restarting `npm run dev` clears it.
- **CORS on the board API allows any http loopback origin.** Dev convenience; a real
  deployment would pin the console's origin.
- **The assistant is scripted, not a model.** Routing is keyword matching plus an
  explicit `intent` the app sets for follow-up turns. Swapping in a provider means
  replacing `scriptFrames(...)` in `server/chat.ts` and handing it
  `cardTools(cards, { provider })` from the same registry the client renders.

## Verified

Driven in headless Chromium as a user (real clicks, real form fills), 34 checks plus 8
follow-ups, all passing: the cross-origin handshake and board mount; a deploy request
producing a parameters form; the form producing an approval carrying its parameters;
reject → Undo → live again; approve → run starts, the in-thread checklist ticks from the
live feed and the framed board shows the same run; rollback clicked on **:5175** arriving
in the chat as a proposal, the board not rolling itself back, and approving in the chat
actually rolling it back; multiple choice escalating to its own approval; dismiss →
deferred stub + Undo toast → reopen; the unmatched prompt falling through to
`createMockResponder`; and no console errors anywhere in the flow.
