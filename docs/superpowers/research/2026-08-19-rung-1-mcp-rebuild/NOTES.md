# NOTES

A docked customer-support chat widget on a fake product landing page ("Aurora Lamp 2"),
built with vanilla TypeScript + Vite and `@kitn.ai/ui` 0.25.2. Everything below the
"Running it" section is the required record of **what I could not answer from the `kai`
MCP and where I had to guess**.

## Running it

```
npm run dev      # http://localhost:5173 (falls forward if the port is taken)
npm run build    # tsc --noEmit && vite build  → dist/
npm run preview  # serves dist/ with the same /api/chat route
```

`vite` and `typescript` were **not** installed in this directory — only `@kitn.ai/ui` was —
so I added `vite`, `typescript` and `@types/node` as dev dependencies and wrote the scripts.

## Layout

| File | What it is |
| --- | --- |
| `index.html` | Landing page + the dock (launcher button + panel holding `<kai-chat>`) |
| `src/main.ts` | Host code: owns `messages`, wires `kai-submit`, fetches and streams the reply |
| `src/styles.css` | Page styles + the `--kai-*` brand block from the MCP `theme` tool |
| `server/mock-chat.ts` | `POST /api/chat` — relays `createMockResponder()` frames as SSE |
| `vite.config.ts` | Mounts that route on the dev **and** preview servers |

## How the pieces fit

The MCP's `support-widget-script-tag` recipe is the shape: one `<kai-chat>`, the host owns
`messages`, `kai-submit` goes out and a new `messages` array comes back in. Two deliberate
deviations, both because the brief asked for them:

1. **The mock runs server-side.** The scaffold calls `createMockResponder()` *in the
   browser*. The brief asked for a local dev endpoint, so the responder moved into a Vite
   middleware and `src/main.ts` does a real `fetch('/api/chat')`. This is strictly closer to
   production: the client code is now identical to what a live deployment would run, and
   going live means replacing the body of `server/mock-chat.ts` and nothing else.
2. **A launcher.** The kit has no open/close affordance (see gap 9).

The kit still does all the parsing: `toOpenAIMessages` encodes the thread, `readOpenAIStream`
reads the SSE, `createAssistantStream` folds deltas onto parts. No hand-rolled SSE reader
anywhere, per the `kit-parses-consumer-fetches` invariant.

## Verification

`npm run build` passes (`tsc --noEmit` clean; only Vite's generic >500 kB chunk advisory).
I also drove headless Chrome over CDP against both `npm run dev` and `npm run preview` —
33/33 checks, no console errors. It confirms, among other things, that the reply **paints**
incrementally (18 distinct rendered-text lengths sampled across one reply, not one lump),
that three turns accumulate to six messages with turn 1 byte-identical throughout, and that
history survives a close/reopen cycle. The script is `../e2e-check.mjs` (outside the app on
purpose — it is not a dependency of the build).

---

# Questions the MCP did not answer, and what I guessed

## 1. Can `createMockResponder()` run in Node at all?

**Unanswered.** The `mock` integration is documented only as a browser-side call, and the
scaffold's backend section says "No backend or API key needed". Nothing states whether
`@kitn.ai/ui/state` is server-safe. `debug` returned *"No known failure pattern matched"* for
this exact question and pointed me at `llms-full.txt`, which **is not in the installed
tarball** (`node_modules/@kitn.ai/ui/llms-full.txt` does not exist; there is a `dist/llms/`
directory, but the debug tool names the root path). I did not fetch the URL it also offered.

**Guessed:** that it is safe, then verified by running it under Node. It is —
`dist/state.js` has no imports at all and touches no DOM globals. Supporting signal: the
export map gives `./state` a single `"default"` condition with no `node`/`browser` split, so
there is no server variant I could be missing.

## 2. What exactly does the responder yield?

**Unanswered.** The type is `AsyncIterable<string>` and the prose says "canned SSE frames".
It does not say whether the strings are already `data: …\n\n` framed, whether the `: kai-mock`
banner comment is included, or whether the caller must append the `[DONE]` sentinel.

**Guessed:** relay each yielded string to the socket verbatim and add no framing of my own.
Verified by dumping the frames: they arrive fully formed — banner comment, role delta,
content deltas, a `finish_reason: "stop"` frame with zeroed usage, then `data: [DONE]`. The
handler is a pure relay, which is why it is so short.

## 3. `MockResponder` returns an iterable, not a `Response`

The scaffold names the variable `res` and comments that "`res` becomes the POST to your
route", which implies the two are interchangeable without ever saying so. They are, but I
had to read `StreamSource = Response | ReadableStream | AsyncIterable<Uint8Array | string>`
out of the installed `wire/read.d.ts` to know it. **The MCP never states the `StreamSource`
union**, and it is the single fact that makes the mock→live swap actually a one-line change.

## 4. Is a responder meant to be per-process or per-request?

**Unanswered.** `replies` are documented as "cycled one per turn", which implies a
long-lived instance, but nothing says whether that is a requirement.

**Guessed:** one responder per request, with a single keyword-chosen reply, so the built-in
cycling is unused. A support widget reads much better answering the question asked than
cycling three fixed lines. Only reply *selection* is mine — framing, chunking, pacing and
every mock tell are still the kit's. If the intent was one shared instance, this is the
thing I would revisit.

## 5. `loading` is effectively write-only (found the hard way)

**Unanswered, and it cost me a debugging cycle.** `loading` is documented as both a prop and
an attribute. Nothing says whether `kai-*` properties read back after assignment. They are
inconsistent:

- `chat.messages` and `chat.suggestions` — assign, read back fine.
- `chat.loading = true` → the `loading` attribute reflects, submit disables, the element
  behaves correctly — but **`chat.loading` reads back `undefined`**. Setting it to `false`
  reads back `false`.

So `!chat.loading` is truthy the whole time a reply is streaming. My first end-to-end test
polled on it and settled instantly, which looked exactly like "streaming is broken" when it
was not.

**Guessed the rule:** never branch on a `kai-*` boolean property. The app never reads
`loading`; the comment in `src/main.ts` records why. If you must observe it externally,
`chat.hasAttribute('loading')` is honest.

## 6. Should the host keep its own `messages`, or read the element's?

**Ambiguous.** The scaffold reads it back off the element (`[...chat.messages, …]`); the
`clear()` docs say "`messages` is the consumer's own state". Both work.

**Guessed:** keep a host-side array and treat the element as write-only for `messages`. That
is the only reading consistent with the `host-coordinates` invariant, and it is what makes
history survive a panel toggle without depending on element internals.

## 7. What does the endpoint envelope look like?

**Unanswered by construction** — `integration: 'mock'` emits no backend at all, so there is
no route to copy the request shape from. The scaffold names `toOpenAIMessages(history)` as
"the body" without showing the wrapper.

**Guessed:** `POST { messages: toOpenAIMessages(messages) }`. A real provider route would
also want `model` and `stream: true`; scaffolding with `integration: 'openrouter'` would
presumably show the exact shape, but the brief scoped this to the mock.

## 8. Does `toOpenAIMessages` emit `content` as a string or as parts?

**Unanswered** for the text-only case. `OpenAIWireMessage.content` is typed
`string | OpenAIContentPart[] | null`, and the `accept` docs imply parts appear once
attachments are involved, but the plain-text case is not pinned.

**Guessed:** handle both. `latestUserText()` in `server/mock-chat.ts` flattens either shape.

## 9. There is no launcher, and the docked placement is not a widget

**The largest gap relative to the brief.** `placement: 'docked-widget'` emits a
*permanently visible* fixed panel — no launcher, no open/close, no collapsed state. I checked
the full 80-element index: there is no `kai-launcher`/`kai-fab`/`kai-widget`, `kai-chat` has
no `open`/`collapsed`/`minimized` prop, and `kai-prompt-dock` (the closest-sounding name) is
a composer tray that frames an input, not a page dock. So the launcher button, the dock
layout, the open/close state and the unread dot are all mine.

**Guessed the interaction contract:** keep the panel mounted always and hide it with CSS
(`visibility` + `opacity`) plus `inert`, rather than removing it from the DOM. Nothing in the
MCP says whether unmounting a `<kai-chat>` loses anything, or whether re-mounting would
re-run the upgrade race — hiding sidesteps both questions. Verified that a close/reopen
cycle preserves all messages and their rendering.

Related and also unanswered: what `focus()` and `scrollToBottom()` do when the element is
hidden or inside an `inert` subtree. I guessed at ordering — clear `inert` first, then focus —
and it works.

## 10. Booleans as HTML attributes

**Unanswered.** `code-highlight` is listed as an HTML-safe attribute, but nothing says how a
string is coerced — whether `code-highlight="false"` means false or is simply *present* and
therefore true.

**Guessed:** don't find out. Every boolean is set as a JS property after upgrade
(`chat.codeHighlight = false`), and only genuinely string-valued attributes
(`chat-title`, `placeholder`, `suggestion-mode`, `prose-size`, `theme`) stay in the HTML.

## 11. Bundle size — documented tradeoff, left at the default

Not a gap, but worth recording. `import '@kitn.ai/ui/elements'` is documented as "the right
default", so I kept it. It registers all 80 elements, and the build ships Shiki's grammars
and themes (a 680 kB main chunk, plus per-language chunks) even though the widget sets
`codeHighlight = false`. The MCP names two lighter options — per-element
`import '@kitn.ai/ui/elements/chat'`, or the CDN autoloader — and suggests running `debug`
with "reduce bundle size" for the breakdown. I did not switch, because it is outside what was
asked and the register-all path is the documented default; the per-element import is the
one-line change if size matters.

## 12. Things I did not need, so did not verify

Cards / generative UI (`cardTypes`, `cardSchemas`, `createCardRegistry`, `cardFromToolCall`)
are documented in depth but unused here — a support widget streaming text needs none of it.
The `untrusted-model-output` invariant is likewise not exercised in any meaningful way: the
only "model" output is canned text I wrote myself in `server/mock-chat.ts`, and it reaches the
DOM solely through `<kai-chat>`'s own markdown renderer, which the kit's XSS suites cover.
Point this at a real provider and that invariant becomes live — but nothing in this app
renders model text through a sink of its own.

## 13. Not persisted

`<kai-chat>` has no documented persistence or session-restore facility, and I did not add
one. History is in-memory: it survives opening and closing the panel, and is lost on reload.
Not requested, but it is the first thing a real support widget would need.
