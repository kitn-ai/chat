# NOTES

What this is: a plain Vite + TypeScript chat client whose conversation UI is
composed by hand from standalone `@kitn.ai/ui` elements. **`<kai-chat>` is not
used anywhere.** The surface is `kai-thread` + `kai-message` (rendered by the
thread) + `kai-conversation-item` + `kai-composer` + `kai-attachments` +
`kai-toast-region` + `kai-feedback-bar`, with `src/main.ts` acting as the host
that wires element to element (the kit has no store — `host-coordinates`).

Streaming uses `createAssistantStream` (`@kitn.ai/ui/state`) +
`readOpenAIStream` (`@kitn.ai/ui/wire`); replies come from the package's
`createMockResponder`, scripted so the third turn emits a tool call.

Run: `npm run dev` · Build: `npm run build` (both verified).

Verified in a headless Chromium pass: picking a file stages it in
`kai-attachments`, sending produces a user message whose `parts` carry
`{ type: 'file', attachment: {...} }`, and the thread renders the filename via
`::part(attachment-name)`; the mock's `search_docs` call renders as a resolved
tool panel; no page errors.

---

## Questions the docs and the `kai` MCP did not answer — and what I guessed

Sources I was allowed to use: the package README, https://ui.kitn.ai, and the
`kai` MCP (`component_reference`, `scaffold`, `debug`, `theme`).

### 1. How does a user attach a file *in `kai-composer`*?
`component_reference` for `kai-composer` lists no attachment prop, no attach
button, no `kai-attachments-change` event, and no file affordance of any kind.
`kai-prompt-input` and `kai-chat` do have `attach` / `attachments` /
`kai-attachments-change`, and their `kai-submit` detail carries `attachments` —
`kai-composer`'s does not. `debug` matched no pattern for the question.

**Guess:** the picker is the host's. A paperclip button + hidden
`<input type="file">` sit in the composer row, and a `kai-attachments`
element (`variant="inline" removable`) is the staging tray above the composer.
On `kai-submit` the staged items become `file` parts on the user message.
If the kit intends `kai-prompt-input` to be the only composer with attachments,
this app diverges from that intent because the brief named `kai-composer`.

### 2. What belongs in `AttachmentData.url` for a locally-picked `File`?
The docs give the shape (`{ id, type, filename, mediaType, url, title }`) but
never say what `url` should be for a file the user just picked — a `blob:`
object URL, a data URL, or a URL you get back after uploading first.

**Guess:** `URL.createObjectURL(file)`.

### 3. What is the object-URL lifecycle policy?
The package's own `package.json` has a `lint:attachment-object-urls` script, so
there clearly *is* a policy, but no allowed doc states it — nothing says who
revokes, or when.

**Guess:** revoke when a staged attachment is removed before sending, and on
`beforeunload`; never revoke one the thread still renders, which would blank
the preview.

### 4. How is a `kai-conversation-item` selected?
`component_reference` documents `conversationId` / `active` / `compact` and
says the row "hands its identity to the container's selection contract" — but
lists **no events at all** on the element. `kai-conversation-select` is
documented on `kai-conversations` (the container), which this app does not use.

**Guess:** a plain `click` listener on each `<kai-conversation-item>` host, with
the host setting `active` on the rows. Consequence I could not resolve: the
roving-tabindex / arrow-key navigation the docs mention is presumably driven by
the container, so keyboard traversal across a hand-rolled list of items may not
behave the way `kai-conversations` would.

### 5. `createMockResponder` is essentially undocumented in the allowed docs.
It appears **only** in the MCP `scaffold` output (as
`const mockResponse = createMockResponder()`). It is absent from the README,
from `llms.txt` / `llms-full.txt`, and the MCP `debug` tool matched nothing for
a direct question about its signature, options, or tool-call support.

**Where I had to go outside the allowed docs:** to learn its options
(`replies`, `delayMs`, `chunkSize`, `announce`) and that a reply may be a
`MockTurn` with `toolCalls`, I read the *shipped type declarations* in
`node_modules/@kitn.ai/ui/dist/state/mock.d.ts`. That is the installed
package's `.d.ts`, not npm/GitHub source, but it is still outside the three
sanctioned doc surfaces — flagging it explicitly.

Same applies to two more shapes no allowed doc covered:
- `AssistantStream`'s methods (`upsertTool`, `abort`, `done`) —
  `dist/state/stream.d.ts`.
- `ModelTurn` (what `readOpenAIStream` resolves with: `toolCalls[].id`,
  `.input`, `.argumentsText`, `.error`) — `dist/wire/chunk.d.ts`.

### 6. Do the *default* mock replies ever emit a tool call?
`DEFAULT_MOCK_REPLIES` is exported but its contents are not documented.

**Guess:** rather than depend on it, `src/main.ts` passes its own `replies`
array with an explicit `{ text, toolCalls: [...] }` turn, so a tool call is
guaranteed to appear on the third turn.

### 7. Who resolves a tool call the mock announces?
The mock frames a tool call the way a provider does — announce + streamed
arguments — which leaves the tool part in `input-available`. Nothing in the
docs says whether the kit, the mock, or the host is supposed to supply the
result, so an unanswered call would spin in the thread forever.

**Guess:** the host does it. After `readOpenAIStream` resolves, `main.ts` walks
`result.toolCalls` and calls `stream.upsertTool(id, { state: 'output-available',
output: {...} })` with a stub result — the same seam a real app would put its
tool result in.

### 8. How do you drive a hand-placed `<kai-toast-region>`?
`component_reference` documents the `toasts` property and the `kai-dismiss` /
`kai-action` events, and the scaffold's interaction patterns document the
*imperative* `toast()`, which auto-mounts its own region on `document.body`.
Nothing says how the two relate, or whether calling `toast()` while your own
region is on the page produces one region or two.

**Guess:** avoid `toast()` entirely. This app places one `<kai-toast-region>`,
owns the `toasts` array, appends to it, and prunes on `kai-dismiss`.

### 9. Where does the composer go relative to `kai-thread`?
`kai-thread`'s only slot is `empty`; there is no composer slot, and no recipe
covers a hand-composed thread (`recipes` returns only `workspace-chat` and
`support-widget-script-tag`, both built on `kai-chat`).

**Guess:** the composer is a flex sibling below the thread, with the thread
taking `flex: 1; min-height: 0` so its internal scroll area works.

### 10. `kai-composer` has no send button.
Only `kai-prompt-input` documents a `submit` prop and a `::part(send)`. The
composer exposes `send()` as a method and submits on Enter.

**Guess:** an app-owned "Send" button that calls `composer.send()`.

### 11. Placement / lifecycle of `kai-feedback-bar`.
Nothing documents whether it is meant to be per-message or per-thread, or when
it should appear and disappear.

**Guess:** one thread-level bar, hidden by default, revealed after each
assistant turn settles, re-hidden on the next submit or on `kai-close`.

### 12. `theme.css` vs `theme.tokens.css`.
The README says to import `@kitn.ai/ui/theme.css`; the MCP scaffold imports
`@kitn.ai/ui/theme.tokens.css` and comments "use `theme.css` only for
Tailwind-source apps". The two are not reconciled anywhere.

**Guess:** followed the scaffold — `theme.tokens.css`, since this app has no
Tailwind build.

### 13. Styling the shadow-DOM internals of a hand-composed surface.
`::part()` names are documented per element, but there is no guidance on the
host-side layout contract (does `kai-composer` size itself? does `kai-thread`
need an explicit height?).

**Guess:** `display: block` + explicit flex sizing on each element from
`src/styles.css`, and a wrapper `z-index: 90` so it stays under the toast
region's `var(--kai-toast-z, 100)` — that last number *is* documented, in the
scaffold's full-page comment block.
