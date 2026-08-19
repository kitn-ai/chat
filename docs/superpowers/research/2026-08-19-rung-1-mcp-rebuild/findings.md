# The MCP-only rebuild — comparer findings

Date: 2026-08-19. Comparer: an independent agent, read-only on both apps and on the kit.
Plan of record: [`docs/superpowers/plans/2026-08-19-rung-1-support-widget.md`](../../plans/2026-08-19-rung-1-support-widget.md)
§ "The MCP-only rebuild". Run metadata and the MCP call sequence: [`builder-run.md`](builder-run.md).
The builder's own record: [`NOTES.md`](NOTES.md). The app as delivered: [`app/`](app/).

Inputs compared:

- **REFERENCE** (insider) — `examples/apps/support-widget/`, plus its README's provenance section,
  which reproduces verbatim everything the insider implementer was told.
- **REBUILD** (clean room) — the sandbox app, built from the installed tarball and the `kai` MCP,
  with README/llms/src stripped from the install.
- **Shipped-docs check source** — the original `kitn.ai-ui-0.25.2.tgz`, extracted and read, so every
  candidate gap could be downgraded from "product gap" to "MCP-only gap" where README/llms cover it.

## Verdict in one paragraph

**Iteration 1 worked.** All four one-liner classes from the pre-iteration-1 demo are answered by the
current MCP, in output this run actually received — and the rebuild used all four correctly, on its
first pass, with no debugging cycle attributable to any of them. The rebuild is a working,
type-checking, streaming, multi-turn docked widget that a stranger to this repository produced in 830
seconds and 7 MCP calls. It is also, on several axes, better-reasoned than the reference. What the
diff exposes is a different and narrower class of gap: **the kit teaches its elements well and its
`@kitn.ai/ui/state` stream lifecycle badly.** One divergence is a shipped user-visible defect in the
rebuild — a failed request renders an empty assistant bubble and nothing else — and the emitted
scaffold code plus its own comment are what taught it. That, the `loading` read-back defect the
builder found the hard way, and the absence of any launcher affordance behind an archetype literally
named `widget, docked` are the three things worth an owner's attention.

---

## 1. The before/after verdict — the original demo's six failures

The pre-iteration-1 baseline is the evidence table in
`docs/superpowers/specs/2026-08-18-iteration-ladder-design.md`. This is iteration 1's acceptance
measurement, held open since the spec.

| # | Original failure | Recurred? | Evidence |
|---|---|---|---|
| 1 | Missing `import '@kitn.ai/ui/elements'` — blank page, ZERO console errors, `whenDefined` hangs forever | **NO — fixed** | `component_reference kai-chat` now OPENS with a "### Getting the element" block naming the import and describing the exact silent-failure mode ("nothing renders, **no error and no warning is logged**… `whenDefined` never resolves"). Counts in the output this run received: `@kitn.ai/ui/elements` ×3 in `component_reference`, ×9 in `scaffold`, ×3 in `kai-prompt-dock`. `app/src/main.ts:11` carries it as line 1 with the comment "required, must come first". |
| 2 | Hand-rolled a structural type; `KaiChatElement`/`KaiConversationsElement` named nowhere | **NO — fixed** | `component_reference kai-chat` line 11: "TypeScript: `import type { KaiChatElement } from '@kitn.ai/ui/elements';` — the element interface ships with the package; **do not hand-roll a structural type**." Also ×2 in the scaffold output. `app/src/main.ts:12` imports it. **The reference app still hand-rolls one** (`src/chat.ts:21`, `export type ChatElement = HTMLElement & {…}`) — the outsider now does this better than the insider. |
| 3 | No event payload shapes on any of 9 events | **NO — fixed** | `component_reference kai-chat` § Events lists all 9 with a full `detail:` type — `kai-submit` → `{ value: string; attachments: {…}[] }`, `kai-attachments-rejected` → `{ rejected: {…}[] }`, and so on. `app/src/main.ts:75` types the cast off it. |
| 4 | Guessed at the required `scope` field | **NOT EXERCISED** | `scope` belongs to `kai-conversations`/`kai-scope-picker`; rung 1 has no conversation list, so the builder never looked one up. No evidence either way from this run. The mechanism that fixed #3 (full `detail` types rendered from the derived layer) applies to every element uniformly, so it is *likely* fixed, but this run does not show it. **Carry forward to rung 3**, which is the first rung with a sidebar. |
| 5 | `scaffold` emitted a second component and wired nothing to it | **NO — but weak evidence** | The `support-widget × mock × docked-widget × html` combo emitted exactly one element (`<kai-chat>`), which is the recipe's whole ingredient list, and wired it fully. That is the correct output — but a one-ingredient recipe cannot fail this way, so the run does not test the fix. **Carry forward to rung 3.** |
| 6 | Sidebar slot vs sibling — unanswerable from the MCP | **NO — answered, unexercised** | Not needed for rung 1, but `component_reference recipes` now answers it unprompted and at length: "`<kai-conversations slot="sidebar">` goes INSIDE `<kai-chat>` — the rail is a light-DOM child of `<kai-chat>` carrying `slot="sidebar"`, **not a sibling**", then the fixed-width caveat, the collapse caveat, and the pointer to `<kai-workspace>`. Answered in the tool output; not exercised by a build. |

**Score: 4 of 4 exercisable failures fixed and demonstrated. 2 of 6 not exercisable at rung 1**
(both need a conversations sidebar) — they are answered in the tool output but must be re-measured at
rung 3.

---

## 2. The divergence table

Every material difference between rebuild and reference. Class per the diff protocol, plus **kit
defect** where the divergence traces to the kit rather than to the teaching or to the builder.

| # | Axis | REFERENCE (insider) | REBUILD (MCP-only) | Class | Note |
|---|---|---|---|---|---|
| D-1 | Element composition | one `<kai-chat>` in a `<section>` panel | one `<kai-chat>` in a `<section>` panel | — | Identical. The recipe's ingredient list is one element and both landed on it. |
| D-2 | Registration | `import '@kitn.ai/ui/elements'` first line | same, first line, with a "must come first" comment | — | Identical. |
| D-3 | Upgrade race | `await customElements.whenDefined('kai-chat')` before any property | same | — | Identical. Both call it out in a comment; the rebuild names the invariant id (`upgrade-race`). |
| D-4 | Element typing | hand-rolled `type ChatElement = HTMLElement & {…}` | `import type { KaiChatElement } from '@kitn.ai/ui/elements'` | **rebuild is correct; reference is wrong** | The insider's own brief pointed at repo internals and never at the shipped interface. Worth a fix in the reference app. |
| D-5 | Event wiring | listener on the element, `event.detail.value` | same | — | Identical. |
| D-6 | Reactivity contract | `set` helper reassigns a new array; folds through `createAssistantStream` | `setMessages` helper, same shape, same folding | — | Both halves honoured in both. Rebuild's comment cites `reactivity-two-halves` by id. |
| D-7 | Who owns `messages` | host-side closure variable; element is write-only | host-side module variable; element is write-only | — | Same conclusion. The **scaffold** models the other pattern (`[...chat.messages, …]`, reading it back off the element), and the rebuild deliberately departed from the scaffold to reach the reference's answer. See G-06. |
| D-8 | Wire usage | `toOpenAIMessages` → `fetch` → `readOpenAIStream` | identical | — | No hand-rolled SSE reader in either. `kit-parses-consumer-fetches` held. |
| D-9 | Encode timing | encodes **before** `createAssistantStream` appends the empty assistant turn, with a comment saying why | creates the stream first (`main.ts:92`), encodes at `main.ts:103` | **builder error (latent, benign today)** | `createAssistantStream` appends an empty assistant message immediately, so `toOpenAIMessages(messages)` encodes a thread ending in an **empty assistant turn**. Harmless against the mock and tolerated by OpenAI/OpenRouter as a prefill, but it is a real difference the reference deliberately avoids. Nothing in the MCP states the ordering constraint. |
| D-10 | Error surface | `stream.appendText('**Sorry — that message did not go through.**\n\n' + msg)` then `done()` — the failure is IN the thread | `stream.abort(detail)` + `console.error` — **nothing reaches the user** | **teaching gap → shipped defect** (see G-14) | `abort(reason)` only stamps in-flight TOOL parts as `output-error`. A text-only turn has none, so the reason is discarded and the visitor is left with an empty assistant bubble. The rebuild's own comment claims the opposite. It copied the scaffold's pattern and the scaffold's comment. |
| D-11 | In-stream error (`turn.error`) | not handled | `stream.abort(turn.error.message)` + `console.error` | acceptable variation, same defect as D-10 | The rebuild handles a case the reference does not — but through the same invisible channel. |
| D-12 | `loading` | set true, cleared via `onStreamSettled(...)`; never read | set true, cleared in `finally`; **never read**, with a comment recording that reading is broken | **kit defect** (G-05) | Both arrived at "never read it", the reference by not trying, the rebuild by trying and losing a debugging cycle. |
| D-13 | Launcher / open-close | hand-rolled `<button id="launcher">` + `panel.hidden = !open` | hand-rolled `<button id="support-launcher">` + `.is-open` class + `inert` + unread dot | **product gap** (G-09) | Neither got any launcher affordance from the kit. Both were *asked* for one by their brief. The `docked-widget` placement emits a permanently visible fixed panel. |
| D-14 | Closed-panel technique | `hidden` attribute on the panel | `visibility`/`opacity` + `inert` + `aria-expanded` | acceptable variation — **rebuild is better** | `inert` keeps the composer out of the tab order without removing the element; the rebuild explicitly reasoned that unmounting `<kai-chat>` has undefined consequences and sidestepped it. `hidden` also works. Both preserve history across a toggle. |
| D-15 | Focus on open | none (only returns focus to the launcher on Escape) | `chat.focus()` (the exposed shadow-reaching method), after clearing `inert` | **rebuild is better** | The MCP's Methods section explains that native `focus()` on the host never reaches the composer; the rebuild used it, the reference did not. |
| D-16 | Mock seam | server-side, Vite plugin, `apply: 'serve'` | server-side, Vite plugin, on **dev and preview** | acceptable variation | Both moved the mock off the browser (the scaffold's shape). The rebuild also mounts on the preview server; the reference's `apply: 'serve'` deliberately 404s in preview to make the "this is not production" point. Both are defensible and both say so. |
| D-17 | Responder lifetime | **module scope**, cycles 4 canned replies one per turn | **per request**, one keyword-chosen reply, cycling unused | acceptable variation (G-04) | Both authors wrote a comment explaining their choice, which is the tell that the docs do not state one. Neither is wrong. |
| D-18 | Real-provider path | present — OpenRouter proxy behind an unprefixed `OPENROUTER_API_KEY`, `loadEnv(mode, root, '')`, key never in the bundle | absent — mock only | **out of scope, not a gap** | The rebuild's brief scoped it to a mock. It still independently arrived at "going live replaces the body of `server/mock-chat.ts` and nothing else", which is the same architecture. |
| D-19 | Request envelope | `POST { messages: OpenAIWireMessage[] }` | `POST { messages: toOpenAIMessages(messages) }` — byte-identical shape | — | The rebuild GUESSED this (G-07) and guessed right. |
| D-20 | Content shape handling | flattens `string \| parts[]` in `lastUserText` | flattens `string \| parts[]` in `latestUserText` | — | Both hedged the same undocumented question (G-08) the same way. |
| D-21 | Styling | 262-line hand-written `index.css` | hand-written `styles.css` **plus the `theme` tool's `--kai-*` brand block** | acceptable variation | The rebuild is the only one of the two that used the `theme` MCP tool. Both import `@kitn.ai/ui/theme.tokens.css` (the compiled tokens), neither imports `theme.css` raw — the documented trap held. |
| D-22 | Boolean attributes | none set as attributes | none set as attributes; every boolean assigned as a property after upgrade | acceptable variation (G-10) | The rebuild initially wrote `code-highlight="false"` in markup and then removed it rather than find out what it meant. The real rule (`resolveFlag`: present and not `="false"` ⇒ true) is undocumented on the surface that lists it. |
| D-23 | Bundle | register-all, Shiki shipped | register-all, Shiki shipped, `codeHighlight = false` at runtime, tradeoff recorded in NOTES | acceptable variation (G-11) | The MCP names the two lighter options; the rebuild read them and consciously declined. |
| D-24 | Landing page | 3 sections, ~120 lines | 5 sections + SVG lamp art + FAQ `<details>` | acceptable variation | Both are plausible product pages. Not a signal. |
| D-25 | Verification | independent agent's Playwright IVP, 10 acceptance points **including a forced-500** | builder's own CDP script, 33 checks, streaming sampled at 18 distinct lengths, multi-turn byte-identity, close/reopen — **no error-path check** | — | This is *why* D-10 shipped: the rebuild's own harness never exercised a failing request. The reference's did, and it is the check that would have caught it. |
| D-26 | Toolchain | Vite 6 / TS 5.7 | **Vite 8.2.1 / TS 7.0.2 / @types/node 26** | incidental finding | The kit resolves, typechecks and bundles two majors ahead of anything CI pins. Free evidence; consider a guard. |

---

## 3. The graded gap list

Every NOTES.md item, plus what the comparer found that the builder missed. Severity:
**S1** ships a user-visible defect · **S2** cost a debugging cycle · **S3** cost a round trip or forced
a guess · **S4** recorded, no cost.

Columns: **Class** · **Sev** · **Shipped docs teach it?** (checked against the tarball's
`README.md` / `llms.txt` / `llms-full.txt`) · **Reference hit it too?** (its provenance shows what the
insider was *told*, so a fact the insider needed telling and the outsider needed guessing is a strong
teaching-gap signal) · **Proposed fix**.

### From NOTES.md

| id | Gap | Class | Sev | Shipped docs? | Ref hit it? | Proposed fix |
|---|---|---|---|---|---|---|
| G-01 | Can `createMockResponder()` run in Node at all? `debug` returned "No known failure pattern matched" and pointed at a root `llms-full.txt` that "does not exist" | **stripping artifact (the path complaint) + MCP-only gap (the substance)** | S3 | **No.** `createMockResponder` appears **0 times** in README.md, llms.txt and llms-full.txt. So `debug`'s own fallback would not have answered it either. | Not applicable — the insider's mock was server-side by supervisor instruction | **Two fixes.** (a) Record the path complaint as an artifact of the strip: `llms-full.txt` ships in the tarball and IS at that path in a real install — verified in the extracted tarball. (b) The real gap: `createMockResponder` is absent from every shipped doc and its runtime-neutrality is stated nowhere. Add one line to `state/mock.ts`'s header and to the `mock` integration blurb: "I/O-free and DOM-free; runs in a browser, in Node, or in a worker." |
| G-02 | What exactly does the responder yield — is it already SSE-framed? Is `[DONE]` included? | MCP-only gap | S3 | No (0 mentions) | No — insider relayed frames the same way, and the reference's comment records the same facts, so it had to learn them too | State the contract on the type: `MockResponder` yields **complete, self-framed SSE text** including the banner comment and the `[DONE]` sentinel; a relay adds nothing. One sentence in `mock.d.ts`. |
| G-03 | `MockResponder` returns an iterable, not a `Response` — the `StreamSource` union is never stated | **teaching gap** | S3 | No. `StreamSource` = **0** in README/llms/llms-full, **0** in every MCP tool output this run. Learned only by reading `dist/wire/read.d.ts`. | Yes, implicitly — the reference passes both an async iterable and a `Response` to `readOpenAIStream` without ever naming the union | State it where the swap is promised. The scaffold already says "`res` becomes the POST to your route"; add "— `readOpenAIStream` takes a `StreamSource`: a `Response`, a `ReadableStream`, or an `AsyncIterable<Uint8Array \| string>`, which is what makes this a one-expression swap." Also surface it in `component_reference`'s wire section. **This is the single fact that makes the kit's central promise true, and nothing says it.** |
| G-04 | Is a responder per-process or per-request? | doc gap | S4 | No | Yes — the reference wrote a comment justifying module scope, which is the same gap surfacing | One line on `createMockResponder`: "The returned function owns a cursor into `replies`; keep ONE per process to cycle them, or build one per request and pass a single reply." |
| G-05 | **`loading` is effectively write-only** — `chat.loading = true` reads back `undefined` | **KIT DEFECT — confirmed independently** | **S2** | No | **Latent in the reference too** — `src/chat.ts:81` sets it and never reads it, so the reference is correct by luck, not by knowledge | See the mechanism and the fix below. |
| G-06 | Should the host keep its own `messages`, or read the element's? | **teaching gap — the MCP contradicts itself** | S3 | No | Yes — the insider was *told* the answer by CLAUDE.md's contract section | The `clear()` doc says "`messages` is the consumer's own state" and the `host-coordinates` invariant says data flows in via properties and out via events — but the **scaffold's own emitted code** does `[...chat.messages, …]` and `createAssistantStream((fn) => { chat.messages = fn(chat.messages) })`, i.e. it treats the element as the store. Make the scaffold hold a host-side array. It is a two-line change and it removes the contradiction at the exact place a consumer copies from. |
| G-07 | What does the endpoint envelope look like? `integration: 'mock'` emits no backend, so there is nothing to copy | teaching gap (taught by pointer) | S3 | No | No — the insider was pointed at the openrouter-spike | The scaffold explicitly declines to show it ("scaffold again with a provider"), which is a defensible anti-drift choice but costs a round trip on the most common first build. Emit the one-line body shape (`JSON.stringify({ messages: toOpenAIMessages(history) })`) in the mock scaffold as a comment, derived from the same template the provider scaffolds use so it cannot drift. |
| G-08 | Does `toOpenAIMessages` emit `content` as a string or as parts for text-only? | doc gap | S4 | Not pinned | Yes — the reference hedges identically | Pin it in the `toOpenAIMessages` doc comment: string for a text-only turn, `OpenAIContentPart[]` once an attachment is present. |
| G-09 | **There is no launcher, and `placement: 'docked-widget'` is not a widget** | **product gap** | **S2** | No — `launcher` and `docked` appear **0 times** in README/llms/llms-full | **Yes** — the reference hand-rolled the identical thing. Both briefs asked for a launcher; the kit supplied neither one | See below. |
| G-10 | Boolean HTML attributes — is `code-highlight="false"` false, or present-and-therefore-true? | doc gap | S3 | No | No — the insider set no boolean attributes either | `component_reference`'s "### Attributes (HTML-safe)" header should carry the `resolveFlag` rule in one sentence: "a boolean attribute is ON when present unless its value is exactly `false`; `foo`, `foo="true"` and `el.foo = true` are all on, `foo="false"` and absence are off." The rule already exists in `define.tsx`'s `WebComponentContext.flag` doc comment — it just never reaches the surface that lists the attributes. |
| G-11 | Bundle size — register-all ships Shiki even with `codeHighlight = false` | not a gap | S4 | Yes (README documents per-element imports) | n/a | None. The MCP names both lighter options and the builder made an informed choice. Recorded so the ratio is honest. |
| G-12 | Cards / generative UI documented in depth but unused | not a gap | S4 | — | n/a | None. Worth noting that a large share of the `component_reference kai-chat` payload is the card contract, for an app that needs none of it. If token budget ever matters, that is where it is. |
| G-13 | No persistence / session restore | not a gap (scope) | S4 | — | Same — reference has none | None for rung 1. Rung 3 is where this becomes real. |

### Found by the comparer, missed by the builder

| id | Gap | Class | Sev | Shipped docs? | Ref hit it? | Proposed fix |
|---|---|---|---|---|---|---|
| **G-14** | **`stream.abort(reason)` discards the reason on a text-only turn — the rebuild's error path is invisible to the user, and the scaffold's own comment says it is not** | **teaching gap + kit defect** | **S1** | No — `abort(` appears **0 times** in README/llms/llms-full | **No — the reference got it right**, because the insider had CLAUDE.md's "decide loudly" rule. This is the cleanest teaching-gap signal in the whole diff | See below. |
| G-15 | `toOpenAIMessages` called after `createAssistantStream` has appended the empty assistant turn (D-9) | builder error, enabled by a teaching gap | S4 | No | No — the reference comments the ordering explicitly | One sentence on `createAssistantStream`: "It appends the empty assistant message immediately, so encode the thread BEFORE creating the stream." |
| G-16 | The rebuild's verification never exercised a failing request — which is exactly why G-14 shipped | process, not product | — | — | The reference's IVP DID force a 500 | Not a kit fix. Carry into the ladder's own acceptance list: **every rung's verification must force one endpoint failure.** |

### G-05 in detail — the `loading` read-back defect (verified by the comparer)

The builder's claim is **correct**, and the mechanism is fully determined by code in this tree. No
browser was needed to confirm it:

1. `packages/ui/src/elements/chat.tsx:123` — `createEffect(() => { element.toggleAttribute('loading', flag('loading')); })`.
2. Setting `chat.loading = true` makes that effect call `toggleAttribute('loading', true)`, which sets
   the attribute to the empty string.
3. `component-register`'s `attributeChangedCallback` (`node_modules/component-register/lib/component-register.js:160-168`)
   sees a non-null `newVal` and writes the prop back: `this[name] = parseAttributeValue("")`.
4. `parseAttributeValue` (same file, line 63) is `if (!value) return;` — **it returns `undefined` for
   the empty string.** So `chat.loading` becomes `undefined`.
5. Setting `chat.loading = false` removes the attribute; the callback's guard
   `if (newVal == null && !this[name]) return;` fires because the prop is already falsy, so no
   write-back happens and the prop stays `false`.

That is exactly the asymmetry NOTES describes. The element still *behaves* correctly the whole time,
because `flag()` falls back to attribute presence — that fallback is why the bug is silent.

**This is a known pattern in the kit, fixed in one place and not the others.** `kai-switch` solves it
explicitly (`switch.tsx:84-89`, an `Object.defineProperty` accessor whose getter returns the live
signal, with a comment naming "the `undefined` write-back which `toggleAttribute` triggers").
`kai-chat.loading`, `kai-resizable-item.collapsed` and `kai-resizable-item.locked` all use the same
`toggleAttribute` reflection **without** the accessor, so all three are write-only in the same way.
`kai-disclosure`'s `open` goes through `wireDisclosure`, which has its own guard — check it separately.

**Proposed fix:** apply the `kai-switch` treatment generically. `defineWebComponent` already knows
which props are declared and already owns a pre-define seam (`defineWithNonReflectingProps`); the
cleanest fix is for any prop a facade reflects with `toggleAttribute` to get a live accessor from that
seam, rather than three per-element patches. Failing that, patch `kai-chat.loading` at minimum, since
it is the one on the busiest element. Watch it fail first: assert `el.loading === true` after
assignment and see the `undefined`.

### G-09 in detail — the launcher

`placement: 'docked-widget'` emits a `position: fixed; bottom: 1.5rem; inset-inline-end: 1.5rem;
width: 380px; height: 600px` panel with a `<kai-chat>` in it — **permanently visible, no launcher, no
collapsed state, no open/close**. The builder then checked the full 80-element index and confirmed
there is no `kai-launcher` / `kai-fab` / `kai-widget`, that `kai-chat` has no `open`/`collapsed`/
`minimized` prop, and spent an MCP call on `kai-prompt-dock` to rule out the closest-sounding name —
it is a composer tray, not a page dock.

Both apps therefore hand-rolled the launcher button, the dock layout, the open/close state and the
focus/`inert` choreography. Neither got any of it from the kit. The archetype is labelled
`widget, docked` and a docked widget without a launcher is not the thing anyone means by that word.

This is a **product gap, not a teaching gap** — there is nothing to teach. It is also the one gap
where the two independent builds produced the most divergent code (D-13, D-14, D-15), which is the
usual sign that a composition is missing rather than under-documented.

### G-14 in detail — the silent error path (the headline finding)

`createAssistantStream(...).abort(reason)` (`packages/ui/src/state/stream.ts:153-159`) does exactly
one thing: it maps over `parts`, flips any `tool` part not yet in `output-available` to
`output-error` with `errorText: reason`, and sets `settled = true`. **For a message with no tool parts
— every turn of a text-only support widget — it mutates nothing and the `reason` string is
discarded.**

The rebuild's `catch` (`app/src/main.ts:112-121`) builds a good human message
("Support is unavailable (HTTP 502)."), passes it to `abort()`, and logs to the console. The visitor
sees an empty assistant bubble and nothing else. The comment directly above it reads:

> Without this, a dead endpoint is a permanently blank assistant bubble plus an unhandled rejection.
> `abort()` settles the message; text that already streamed stays put.

Half of that is true (settling and the unhandled rejection) and the operative half is false.

**Where it came from.** The scaffold's emitted `src/main.ts` has the identical call and a comment with
the identical first sentence: *"Without this a bad key is a permanently blank assistant bubble plus an
unhandled rejection. abort() settles the message and flips any tool panel still waiting on a result to
output-error…"*. The scaffold's version is more precise about what it flips, but its first sentence
still promises that `abort()` prevents the blank bubble, and a reader building a text-only widget
takes the promise and not the qualifier. The builder did exactly that.

**The reference did not make this mistake**, because CLAUDE.md's *decide loudly* rule was in the
insider's context: `src/chat.ts:106` writes the failure into the thread with `appendText` and then
calls `done()`. That is the correct pattern, and it appears in no shipped doc and no MCP output.

Three fixes, in priority order:

1. **Fix the scaffold's emitted error branch** so it does what the reference does — `stream.appendText('**Sorry, that message did not go through.**\n\n' + msg)` then `done()` — and correct the comment. This is the code every consumer copies.
2. **Make `abort(reason)` decide loudly on its own surface.** A `reason` that lands nowhere is the kit's own decide-quietly violation. Either append the reason as a text part when there is no tool part to carry it, or rename/redocument it so the discard is impossible to miss. This wants an owner decision because it touches a shipped API.
3. **Teach the stream lifecycle at all.** `createAssistantStream` / `done` / `abort` / `onStreamSettled` appear in **no** shipped doc — README, llms.txt and llms-full.txt are all zero — and `component_reference` covers elements, not `@kitn.ai/ui/state`. The scaffold's inline comments are the *entire* documentation of the kit's stream lifecycle, and this run shows that is not enough.

### The four watched one-liner classes, checked explicitly

| Class | Status | Evidence |
|---|---|---|
| **Registration import** | **Answered** | `component_reference kai-chat` opens with it and names the silent-failure mode; ×9 in `scaffold`. Used correctly in `app/src/main.ts:11`. |
| **TS interface names** | **Answered** | "do not hand-roll a structural type" + `import type { KaiChatElement }`. Used in `app/src/main.ts:12`. The rebuild confirmed the name against `dist/elements.d.ts` at tool call 24 of 78 — *after* two MCP outputs had already supplied it, so this is verification, not the MCP being bypassed. |
| **Event payload shapes** | **Answered** | All 9 events carry a full `detail:` type in `component_reference kai-chat`. |
| **Discovery / index** | **Answered** | `component_reference { name: "list" }` was the builder's **second** action, returned the 80-element index, and its footer routed the builder to `invariants` and `recipes` — both of which it later called. The discovery path worked as designed. |

**A fifth class the rebuild exposes: the state/wire lifecycle.** `component_reference` is an *element*
reference. `StreamSource`, `abort()`'s real semantics, `createAssistantStream`'s ordering constraint
and `createMockResponder`'s runtime neutrality are all facts about `@kitn.ai/ui/state` and
`@kitn.ai/ui/wire`, and there is no tool that answers a question about them. Every gap in this run
that cost the builder something (G-01, G-02, G-03, G-14, G-15) is in that hole.

---

## 4. Candidate-iteration recommendations

Four bundles. The first is the one this run argues hardest for.

### Candidate D — the stream lifecycle is undocumented (bundles G-01, G-02, G-03, G-14, G-15)

Every gap that cost this builder anything is about `@kitn.ai/ui/state` or `@kitn.ai/ui/wire`, not about
elements. The MCP has an excellent element reference and **no answer surface at all** for the two
packages that carry the kit's central claim ("the kit parses, the consumer fetches"). The four
one-liner fixes of iteration 1 moved the element surface from bad to good; this is the same shape of
fix one layer down.

Concretely, and each one small:

- The scaffold's error branch writes the failure into the thread (fixes the S1).
- `StreamSource` is stated wherever the mock→live swap is promised (fixes the fact that makes the promise true).
- `createMockResponder`'s runtime neutrality and frame contract are stated once, at the type.
- `createAssistantStream`'s "encode before you create the stream" ordering is stated once.
- A `component_reference { name: "state" }` / `{ name: "wire" }` lookup, or a lifecycle section on the
  element lookups, so there is a place for the above to live.

Verify by: re-running the same MCP-only rebuild prompt and asserting the emitted error path is visible
in the DOM, and that NOTES.md no longer lists G-01/02/03. Watch the assertion fail against today's
scaffold output first.

### Candidate E — the `loading` write-only defect (G-05) — **owner decision**

The finding is confirmed and the mechanism is fully understood. The decision is scope:

- **Narrow:** patch `kai-chat.loading` with the `kai-switch` accessor. One element, fixes the one that
  costs people time.
- **Broad (recommended):** move the fix into `defineWebComponent`, so any prop a facade reflects with
  `toggleAttribute` gets a live accessor from the pre-define seam. That also covers
  `kai-resizable-item.collapsed` and `.locked`, which have the identical bug today, and prevents the
  next one. It is the "derive it, don't type it" version, and this repo already paid for the
  hand-patched version once — `kai-switch` is the patch nobody generalised.

Either way: watch it fail first, and check `kai-disclosure`'s `open` while you are in there.

### Candidate F — the launcher / docked-widget composition (G-09) — **owner decision**

Two independent builds, one insider and one outsider, both hand-rolled a launcher, a dock, an
open/close state and the focus choreography, because the archetype named `widget, docked` ships a
permanently open panel. The question is whether that is the kit's job.

The scope boundary applies cleanly and the answer is **yes, it is the kit's job**: a launcher is a
*how* (how a docked chat opens, how focus moves, how the panel leaves the tab order when closed), not
a *whether*. It lands on nobody's invoice and in nobody's policy document. Options, recommendation
first:

1. **Recommended — a `kai-dock` (or `kai-widget`) element**: launcher button, panel, open/close state,
   `inert` handling, focus return, unread affordance, `kai-open-change`. It is a real composition the
   corpus now has two independent reference implementations of, which is the ideal moment to extract
   one.
2. Cheaper — `docked-widget` placement emits the launcher markup + CSS + the open/close script as part
   of the scaffold. Fixes the copy path without adding surface area.
3. Cheapest — say so. The placement's own text states that it emits an always-visible panel and that
   the launcher is the consumer's, so nobody has to discover it by building one.

Do **not** do this before Candidate D. D fixes a shipped defect; F adds a component.

### Candidate G — re-measure the two unexercised baseline failures at rung 3

Original failures #4 (`scope`) and #5 (`scaffold` emits an unwired second component) are structurally
untestable at a one-element rung. Rung 3 (workspace, conversations sidebar, routing, history) is the
first that exercises both, and the `workspace-chat` recipe is exactly the multi-element combo #5 was
about. Carry them forward rather than calling them fixed on this run's evidence.

Also carry forward the process item G-16: **every rung's acceptance must force one endpoint failure.**
The rebuild's 33-check harness was thorough on the happy path and that is precisely how an invisible
error path shipped.

---

## Bias and residual-channel statement

Stated so the findings are read at the right strength.

- **The run was stricter than a real consumer's.** The installed copy had README.md, llms.txt,
  llms-full.txt and all TS/TSX/CSS source removed. A real `npm install` ships all of them. Every gap
  above was checked against the extracted tarball before being filed; where the shipped docs cover it,
  it is marked as such. In practice the check downgraded **one** item (G-01's "the file does not
  exist" complaint, which is a pure stripping artifact — `llms-full.txt` is at that exact path in a
  real install) and **confirmed** the rest: `createMockResponder`, `StreamSource`, `abort(`,
  `launcher` and `docked` are each **zero** occurrences across all three shipped docs.
- **The prompt told the builder a mock facility exists** ("the package ships facilities for mocking —
  discover them"). A real consumer might not know that, so G-01/G-02 would likely be *worse* in the
  wild, not better.
- **The builder model (opus) matches the reference builder**, so the seat is what is compared, not the
  model.
- **The residual-teaching baseline held.** The watched patterns survive in the stripped install almost
  entirely inside `dist/` (`@kitn.ai/ui/elements` 9 files, `KaiChatElement` 4, `kai-submit` 28,
  `detail.value` 3), which cannot be removed. The transcript audit in
  [`builder-run.md`](builder-run.md) shows the builder read `dist/` eleven times, but the only watched
  class it looked up there (`KaiChatElement`, tool call 24 of 78) had already been supplied by two MCP
  outputs at calls 5 and 6. No watched one-liner was learned from `dist/` instead of the MCP.
- **`additionalProperties: false` (candidate A) was not exercised.** The builder made no
  wrong-argument-key call, so this run adds no evidence either way.
