# Notes

A chat workspace on `@kitn.ai/ui` 0.25.2 — React + TypeScript + Vite, history
entirely client-side.

```
npm run dev     # http://localhost:5173, mock /api/chat mounted on the dev server
npm run build   # tsc -b && vite build
```

## Shape of the thing

| File | What it is |
| --- | --- |
| `src/App.tsx` | The host. Owns all state and wires `<kai-conversations>` to `<kai-chat>`. |
| `src/conversations.ts` | The stored record, and its projection onto the rail's row shape. |
| `src/storage.ts` | localStorage load/save, with a shape check on rehydrate. |
| `server/chat.ts` | `/api/chat` — `createMockResponder()` frames, written out verbatim. |
| `vite-chat-api.ts` | Mounts that handler on the Vite dev server (dev only). |

Streaming goes `fetch('/api/chat')` → `readOpenAIStream` → `createAssistantStream`
→ `setMessages`. No hand-rolled SSE reader, per `kit-parses-consumer-fetches`.
The whole thread is encoded with `toOpenAIMessages(history)` on every turn, so a
conversation continued after a reload reaches the route with its full history
(the route logs the message count, so you can watch this happen).

## Verified

Driven in headless Chrome over CDP, 18/18: incremental streaming, one
conversation per first turn, new/switch/delete, thread intact on return,
survival across reload, full history on the wire after reload, search filtering,
collapse and reopen, delete + undo, and no console errors. `npm run build` and
`npm run dev` both clean.

---

# Questions the MCP could not answer, and what I guessed

Ordered roughly by how much they shaped the code. "The MCP" means the `kai`
server's `component_reference` / `scaffold` / `debug` / `theme` tools. Where I
say **read the bundle**, I got the answer by reading the compiled JS in
`node_modules` — installed, so in scope, but not something the MCP told me.

### 1. There is no way to delete a conversation from the rail

`<kai-conversations>` has no delete affordance of any kind: no per-row kebab or
menu, no `kai-conversation-delete` event, no `onDelete` prop, and rows are not
exposed as a `::part` (only `trailing` is, and it is a plain string). `debug`
returned *"No known failure pattern matched"* for the question.

**Guessed:** a "Delete chat" button slotted into `<kai-chat slot="header-end">`,
acting on the **active** conversation, with `toast(..., { action: { label: 'Undo' }})`
instead of a confirm dialog (the toast-undo pattern *is* documented, in the
scaffold's interaction patterns).

**Consequence, and it is a real one:** you can only delete the conversation you
are currently looking at. Deleting an arbitrary row from the list is not
reachable without replacing the built-in list entirely.

### 2. Where to put the rail, given that it has to collapse

The `workspace-chat` recipe says `<kai-conversations slot="sidebar">` goes
*inside* `<kai-chat>`. The same recipe then says `<kai-chat>`'s sidebar column is
fixed-width (`w-64`), that collapse is the rail's own business, and that
"`<kai-chat>` does not react to it" — so a collapsed rail inside the slot leaves
a dead 16rem gutter. The recipe points at `<kai-workspace>` instead.

But `<kai-workspace>` has **no conversation search**: its `kai-search` event is
the composer's Globe button (`detail: Record<string, never>`), not the rail's
`{ query }` search. Search is a requirement here, so `<kai-workspace>` was out.

**Guessed:** deviate from the recipe. `<kai-conversations>` is a **sibling** of
`<kai-chat>` inside a flex layout I own, and I drive `collapsed` myself and
animate the column. Not documented as a supported arrangement, but consistent
with `host-coordinates` and with the recipe's own line that being slotted
"changes where it renders, never how it is wired."

### 3. Whether the built-in search actually filters, and on what

The MCP says `kai-search` "lets a consumer mirror or server-side the filter" and
that `clear()` "resets the list filter" — implying a local filter without saying
so. **Read the bundle:** it filters `title.toLowerCase().includes(query)`.

So: **titles only, never message bodies**, and as far as I can tell the built-in
filter cannot be turned off if you wanted to search server-side — a pre-filtered
`conversations` array would simply be filtered a second time. Neither fact is in
the MCP. Titles are derived from the first user turn (`src/conversations.ts`),
which makes that derivation the de-facto search index.

### 4. When the search box renders, and what a no-match search looks like

Not documented. **Read the bundle:** the search input renders only when
`conversations.length > 0`, and the built-in empty state keys off the
**unfiltered** count — so a search matching nothing renders a silently blank
list with no explanation and no `empty` slot invocation.

**Guessed:** mirror the query through `onSearch` and render my own
"No conversations match …" line outside the element.

### 5. `Button`'s `label` is not visible text

`ButtonProps` types `label?: string` and the React `.d.ts` gives no hint that it
is accessible-name-only. `<Button label="Delete chat" />` compiles, renders, and
produces a **24px-wide empty ghost button** — no error, no warning. I only
caught it by screenshotting.

The `kai-button` element reference does say it ("ignored when you slot visible
text"), so it is documented — but only if you think to look up that one element,
and the type system actively suggests otherwise. **Fixed:** slot the text as
children.

### 6. No trash icon exists

`icon-names.json` is 48 curated names; nothing delete-ish is among them
(`x`, `plus`, `search`, `box`, `external-link`, `file-text`, …). The MCP does not
expose the registry contents. **Guessed:** a text button rather than `icon="x"`,
which reads as "close", not "delete".

### 7. How to cancel an in-flight read

`ConsumeOptions` has no `signal`, and nothing in the MCP describes cancelling a
`readOpenAIStream` — which matters as soon as a conversation can be deleted
while its reply is still arriving.

**Guessed:** abort the underlying `fetch` with an `AbortController`. The reader
then throws, and I distinguish a deliberate abort (`controller.signal.aborted`)
from a genuine failure so that `stream.abort(reason)` does not append an error
sentence nobody asked for.

### 8. Whether concurrent streams are allowed

Nothing says whether several `createAssistantStream`s may be in flight at once
against different threads. The closest hint is `streamId`'s "Two reads into the
SAME sink must not share a value", which implies separate sinks are fine.

**Guessed:** yes. Each conversation gets its own id-bound `SetMessages`, so you
can switch away mid-reply and come back to a finished answer, and start a second
conversation while the first is still streaming. `loading` is therefore per
conversation, not global.

### 9. What happens to a stream whose target conversation is gone

Not documented. **Guessed:** my id-bound setter returns the previous array
unchanged when the id is not found, so late deltas are dropped rather than
resurrecting a deleted thread. Paired with (7), the fetch is aborted too.

### 10. The scaffold's dev-server route needs `@types/node`, unmentioned

Block (2) of the `mock` scaffold uses `req.setEncoding` and
`for await (const chunk of req)`. Under the `tsconfig.node.json` it tells you to
use, that is `TS2339` and `TS2504` and `npm run build` **fails**. The run note
lists no dev dependencies and the "Install" line is just `npm install @kitn.ai/ui`.
`@types/node` is now in `devDependencies`.

### 11. Nobody says who owns page-level dark mode

Each element resolves `prefers-color-scheme` itself, inside its own shadow root,
and `theme.tokens.css` ships its dark values under a `.dark` class — but nothing
says who is supposed to put that class on `<html>`. Left alone, the elements go
dark and the app chrome around them stays light.

**Guessed:** a `matchMedia` listener in `src/main.tsx` toggling `.dark` on
`documentElement`, mirroring what the elements do internally.

### 12. The row shape has required fields with no stated meaning

`ConversationRow.scope` is **required** (`{ type: 'document' | 'collection', documentId?, filters? }`)
and nothing explains what it does for a plain chat list; nothing in the rendered
row appears to use it. **Guessed:** `{ type: 'collection' }` for every row.

Likewise `lastMessageAt` *and* `updatedAt` are both required, and only
`updatedAt` is documented as driving the auto relative time. **Guessed:** set
both to the same timestamp.

### 13. Ordering is the host's job, but that is never said

"There is no recency bucketing" — the element renders the array in the order
given. Whether the host is expected to sort is not stated. **Guessed:** yes, and
rather than re-sorting on every token (which would make rows jump mid-stream) I
move a conversation to the front when it receives a turn.

### 14. `<kai-conversation>` is documented but does not exist

The `conversations` prop says "Omit to supply them as `<kai-conversation>`
light-DOM children instead". That tag is **not** in the 81-element index, ships
no element file, and `custom-elements.json` documents it anyway. **Read the
bundle:** it is a marker tag read via `querySelectorAll` (its `id` / `group-id`
attributes and `textContent`), never registered as a custom element. Not used
here; recording the inconsistency.

### 15. Persistence and round-tripping are entirely undocumented

The kit has no persistence facility, which is fine and expected — but nothing
states that `ChatMessage` is safe to JSON round-trip, or that re-feeding a
rehydrated `ChatMessage[]` into `messages` is supported. **Guessed:** both, on
the strength of `MessagePart` being a closed union of plain data. It works.

`src/storage.ts` validates on the way in and **drops** unreadable records. Not
as a rendering trust boundary — `<kai-chat>` escapes model text and this app
never puts a stored string into `innerHTML`, an `href` or a `src` — but because
one truncated record reaching the element as `parts: undefined` would take down
the render and every *other* conversation with it.

### 16. Derived-array cost under `reactivity-two-halves`

The invariant covers the array you assign. It does not say whether rebuilding a
derived row array on every render — new object per row, per streaming token — is
merely wasteful or actually harmful. **Guessed:** merely wasteful. Memoized on
`conversations` and accepted the per-token rebuild; the list is small.

### 17. `debug` pointed at files that are not installed

`debug` suggested `node_modules/@kitn.ai/ui/llms-full.txt` and
`https://ui.kitn.ai/llms-full.txt`. The former does not exist in the installed
package and the latter is a remote fetch, which was out of scope here. So the
debug tool had nothing to offer for the one question I brought it.

---

## Known limitation, not a guess

`/api/chat` is Vite **dev-server middleware**. `npm run build` emits a static
SPA with nothing behind that path — deploy `server/chat.ts` to a real runtime
(or re-scaffold with a provider) to make the built app talk to anything. This
matches the brief's "local dev endpoint", and it is why `npm run dev` is the way
to see the app work.
