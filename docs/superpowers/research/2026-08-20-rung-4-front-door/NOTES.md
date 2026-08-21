# Pagesmith — build notes

An AI page builder: chat on the left, a live preview with version checkpoints on the right.
Built against `@kitn.ai/ui@0.25.2` using only the `kai` MCP server and what ships in
`node_modules` — no remote docs, no npm/GitHub sources.

```
npm run dev       # http://localhost:5173 — chat + mocked /api/chat on the Vite dev server
npm run build     # tsc -b && vite build
npm run preview   # serves the build, with the same mocked /api/chat mounted
```

---

## What the MCP answered cleanly

- Element APIs, props-vs-attributes, events and slots for `kai-chat`, `kai-artifact`,
  `kai-resizable`/`-item`, `kai-segmented`, `kai-checkpoint`, `kai-cards`, `kai-button`.
- The card loop: tool names are `kai_<type>`, `tool_call_id` → `CardEnvelope.id` (so a
  revision upserts), `cardFromToolCall` / `isCardTool` / `createCardRegistry`, and the
  `cardTypes` + `cardSchemas` pair on `<kai-chat>`.
- The `artifact` card's JSON Schema and its generated tool definition — this is the kit's
  own answer to "how does an assistant reply carry a generated page", and it is what the
  mock emits.
- The streaming contract: `createAssistantStream` + `readOpenAIStream`, never a hand-rolled
  SSE reader, and `abort(reason)` so a failure is not a blank bubble.
- `createMockResponder()` from `@kitn.ai/ui/state` (via the `scaffold` tool, `integration: "mock"`),
  and the dev-server-middleware shape of the local route.
- The invariants the app leans on: reactivity-two-halves, props-not-attributes,
  events-non-bubbling (and its three exceptions), host-coordinates.

Everything below is a question the MCP did **not** answer, and what I did instead.

---

## 1. `createMockResponder()` cannot carry a generated page

**Question:** the brief says the package's mocking facilities include a way for an assistant
reply to carry a generated page. `createMockResponder()` is the facility, but its options are
only `replies` / `delayMs` / `chunkSize` / `announce`, and it emits **content deltas only** —
there is no tool-call hook, so nothing it produces can become a card.

**Guess / what I did** (`server/mock-stream.ts`):

- the **text** half is the kit's responder, unchanged;
- the **page** half is a `kai_artifact` tool call I frame by hand, marked with the kit's own
  exported constants (`MOCK_BANNER`, `MOCK_MARKER`, `MOCK_MARKER_KEY`, `MOCK_MODEL_ID`) so a
  mock frame still cannot be mistaken for a real turn;
- the responder closes its own text-only turn, so its `finish_reason: "stop"` frame and its
  `[DONE]` are dropped and re-issued after the tool call as `finish_reason: "tool_calls"`.

The frame envelope (`{ _kai_mock, id, object: "chat.completion.chunk", model, ...}`) is copied
from what the kit's responder actually emits, not from any documentation. **If a future version
changes that shape, this file is what breaks.** A `mockResponder({ toolCalls })` option would
remove all of this.

## 2. What a CUSTOM card element receives, and how it talks back

**Question:** `cardTypes` maps an envelope type to *my* tag — but nothing in the MCP says what
the kit sets on that tag, or how the card emits back.

**Answer I had to dig out of the installed bundle** (`dist/elements/cards.js`), then confirm in
a browser. The kit assigns four **properties** — `data` (the envelope's `data`), `cardId`,
`heading` (only when `envelope.title` is set) and `resolution` — plus a `theme` attribute and
`data-card-id`. `src/page-version-card.ts` implements exactly that.

For the way back I did find real API, though only by reading `dist/index.d.ts`:
`CARD_EVENT_NAME`, `emitCardEvent`, `routeCardEvent` and `listenForCardEvents` are exported
from the package **root**, and `component_reference` never mentions them. The card calls
`emitCardEvent(this, { kind: 'action', … })`; the host routes it with `listenForCardEvents`.

**Still guessed:** that property assignment can arrive in any order and more than once (I made
every setter idempotent), and that ignoring `heading`/`resolution` is acceptable for a card
that is never resolved.

## 3. `<kai-chat>` has no `policy` prop

`CardPolicy` is the documented way to handle card events, but only `<kai-cards>` and
`<kai-remote>` carry a `policy` prop — `<kai-chat>`, which is where these cards actually live,
does not. I attach the policy myself with `listenForCardEvents(wrapper, { onAction })` on a
plain `<div>` around the chat; this works because `kai-card` is deliberately
`bubbles + composed` and escapes the chat's shadow root.

**Unanswered:** whether that is the intended pattern, or whether in-thread cards are meant to be
routed some other way.

## 4. Is a `data:` URL a legitimate `kai-artifact.src`?

The element reference does not say. Two indirect signals do: the artifact card schema describes
`displayUrl` as being for the case where "`src` is not consumer-facing (e.g. a `data:` blob)",
and `isScriptUrl`'s doc calls a `data:` blob artifact "a documented `<kai-artifact>` use".

**What I did:** the preview frames `data:text/html;charset=utf-8,<encoded>` with the kit's
default sandbox (`allow-scripts allow-forms`, no `allow-same-origin`) and shows a friendly
`displayUrl`. Verified in headless Chrome: the page renders, its `<script>` runs, and the frame
is in an opaque origin. A blob: URL would work too but needs revoking; a data: URL is one
string that survives selecting an old version later.

## 5. Suppressing the tool panel

`readOpenAIStream` always drives `upsertTool`, so the `kai_artifact` call would render a tool
panel in the thread *next to* the card built from it — the same fact twice. There is no
documented "skip tool parts" option.

**What I did:** passed my own `AssistantStreamSink` (a public, deliberately structural
interface) that forwards `appendText` / `appendReasoning` / `addSource` to the stream and makes
`upsertTool` a no-op. The kit's rule is "never hand-roll an SSE *reader*", which this respects.

## 6. Tool definitions on a route with no model

The kit's instruction is to build tool definitions once with `cardTools(registry, { provider })`
and send them to the provider. There is no provider here, so nothing is sent; the registry is
still declared once (`src/cards.ts`) and used for `cardTypes` / `cardSchemas`. **Guess:** that
is the right shape for a mock, and `cardTools(cards, …)` is the single line a real route adds.

## 7. TypeScript: an authored schema does not fit `CustomCardSpec.schema`

`CustomCardSpec.schema` is `CardSchema | JsonSchema`. `CardSchema` allows extra keys at the top
level only; the **nested** `properties.*` values are plain `JsonSchema`, which has no
`description` — so a schema written the way the kit's own seven are written is an excess-property
error. Asserted once (`as CardSchema` in `src/cards.ts`) with the reason written next to it.
Nothing in the MCP covers the authoring ergonomics here.

## 8. The device toggle constrains the whole artifact, not just the page

`<kai-artifact>` exposes no `::part` for its iframe, so a host cannot size the previewed page
independently of the artifact's own toolbar. Constraining the element's container is the only
lever, so at Tablet/Mobile the toolbar narrows with the page. It reads as a device mock and I
kept it, but it is a workaround, not a designed-for path.

## 9. Preview/Code — the artifact's toggle, driven as a controlled tab

I did not build a second toggle: the panel uses the artifact's own Preview|Code control, with
`tab` controlled from React and `kai-tab-change` feeding state back. The docs describe
controlled `tab` ("re-asserted on change") and the built-in toggle separately and never say the
two are meant to be combined. Verified working.

## 10. Maximize — two documented paths, picked one

The `workspace-chat` recipe says an artifact inside a `kai-resizable-item` maximizes the panel
by itself through the bubbling `kai-maximize-intent` (with `expandable`). The panel chrome here
is the app's, not the artifact's, so the button drives `kai-resizable.maximizedIndex` instead,
and `kai-maximize-change` keeps state in step. **Guessed:** that `maximizedIndex={null}` is the
restore value (`undefined` is documented as "unset"; `null` as "none maximized" — I used `null`).

## 11. What "restore a checkpoint" should DO

`<kai-checkpoint>` is only a button with a `kai-select` event; the kit has no opinion about
restore semantics, and no `selected`/`active` prop for the current one.

**Decided:** restoring is non-destructive — the chosen version is appended as the newest one
(labelled "restored from vN") and nothing is discarded. Selection is shown by swapping the
checkpoint's `variant` between `default` and `ghost`.

## 12. What context to send after a restore

Consequence of 11, and pure app design: the mock folds its page spec out of the user prompts, so
after restoring v2 the transcript would still replay every edit that came after it. Each version
therefore carries its own `basePrompts` lineage, and a turn sends `[...head.basePrompts, prompt]`
(encoded with the kit's `toOpenAIMessages`) rather than the literal transcript. So "restore v2,
then keep editing" branches off v2. Card and source parts are never encoded by the kit's encoder
anyway, so the route only ever sees the words.

## 13. Icons

`icon-names.json` ships 48 names; there is no tablet or phone glyph, and the `icon` prop takes
"a named icon, an image URL, **or plain text**" — so an unknown name renders as text rather than
failing. The device toggle is labels-only for that reason; every other icon used
(`globe`, `panel-left`, `rotate-cw`) was checked against that file.

## 14. Theme sync between the shell and the elements

Elements self-theme from `theme="auto"`, while the token stylesheet's dark scope is a `.dark`
class on the host page. Nothing says who is responsible for keeping them in step, so `main.tsx`
toggles `.dark` from `prefers-color-scheme` and leaves the elements on `auto`.

## 15. Production hosting of the route

`server/chat.ts` is mounted by a Vite plugin on both the dev server and `vite preview`
(`configurePreviewServer`, added beyond the scaffold so the built app also runs). A real
deployment would host that handler on a real server; `vite build` alone produces a static SPA
with no `/api/chat`.

---

## Verified, not assumed

Driven in headless Chrome (`puppeteer-core` against the local Chrome, installed with
`--no-save` and removed afterwards) against both `npm run dev` and `npm run preview`:

- chat submit → streamed text → one `page-version` card in the thread (`parts: ["text","card"]`,
  no tool panel) → the page in the preview panel;
- the artifact's iframe loads the `data:` page, its script runs, `sandbox` is
  `allow-scripts allow-forms`;
- an edit turn ("make the header dark and add pricing") produces v2 with a dark header and a
  pricing section, and both cards render with the right "in preview" state;
- clicking the v1 card moves the preview back to v1 (the `kai-card` → `listenForCardEvents` wire);
- Restore appends v3 "restored from v1", with a toast;
- the device toggle constrains the frame to exactly 390px on Mobile;
- the artifact's Code tab shows the source and the controlled `tab` follows it;
- maximize takes the panel from 885px to the full 1440px and back, `maximizedIndex` 1 → null;
- typing and pressing Enter clears the composer; the suggestion chips render on the zero-state;
- no console errors or warnings on any of the above.

## Known limits

- The "model" is a deterministic template (`server/page-spec.ts`, `server/render-page.ts`). It
  understands a fixed vocabulary — dark/light header, dark/light scheme, named colours and hex,
  serif/mono/sans, hero size, corner radius, add/remove pricing · testimonials · FAQ · contact ·
  gallery, "call it X", "headline to …" — and says so in the reply when it recognises nothing.
- Versions live in memory only; a reload starts an empty session.
- One page (`index.html`) per version, so the artifact's file tree always has a single entry.
