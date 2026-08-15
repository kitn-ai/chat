# Vanilla example — chat workspace, composed by hand

A small chat **workspace assembled from `@kitn.ai/ui`'s individual elements** — a
`<kai-conversations>` sidebar, a `<kai-thread>` of messages, and a
`<kai-prompt-input>` composer — wired together with plain TypeScript. No
framework: the browser upgrades the `kai-*` custom elements natively and this
example composes them imperatively. It is the "pure web components, zero
framework" reference, and mirrors `examples/react` and `examples/vue`
feature-for-feature.

It runs with **no backend**: replies stream in from the kit's own mock responder,
`createMockResponder()` from `@kitn.ai/ui/state` (wired up in `src/chat-data.ts`),
so there's no API key and nothing to host. The mock yields SSE frames that
`readOpenAIStream` parses exactly as it parses a real provider's, so the preview
runs the real streaming path — and swapping `mockResponse(text)` for a real
`fetch` (Anthropic, OpenAI, your own endpoint) is the only change you make.

Nothing here can be mistaken for a real turn: the stream opens with a `: kai-mock`
SSE comment, every frame carries a `_kai_mock` field, `model` reports as
`kai-mock`, and usage is all zeros.

## The raw web-component rules

Consuming Shadow-DOM custom elements with no framework comes down to four things:

- **Register before you build.** `src/main.ts` does `import '@kitn.ai/ui/elements'`
  (registers the elements) and `import '@kitn.ai/ui/theme.tokens.css'` (the plain
  `--color-*` tokens the shell uses). Because registration is **async**, it then
  `await`s `customElements.whenDefined(...)` for every tag **before** creating the
  elements — a property set on an element before it upgrades is lost, and raw
  consumers get no upgrade-race guard.
- **Array/object props are DOM properties, not attributes.** `thread.messages`,
  `conversations.conversations`, `promptInput.triggers`, `promptInput.suggestions`
  are set as **properties**. Scalars (`theme`, `placeholder`, `active-id`) can be
  attributes. Boolean flags like `voice` must be truthy **properties**
  (`promptInput.voice = true`), never a bare `voice` attribute.
- **Updating a list needs a new array AND a new object for each item you changed.**
  The new array reference is what tells the element something changed — assigning the
  same array back is a no-op even if you swapped an item inside it. The new item object
  is what makes the change visible, because the lists key their rows by item identity.
  Adds, removes and reorders need only the fresh array; editing an existing item needs
  both. `state.ts` assigns a fresh `messages` array on every update, which is what
  re-renders `<kai-thread>`. To rename a conversation:
  ```ts
  // Stale: the title changed, but the item object did not, so the row never updates.
  list.find((c) => c.id === id)!.title = 'Renamed';
  conversationsEl.conversations = [...list];

  // Renders: a new array, and the one item that changed is a new object.
  conversationsEl.conversations = list.map((c) => (c.id === id ? { ...c, title: 'Renamed' } : c));
  ```
- **Events are non-bubbling `kai-*` CustomEvents.** Listen on the element itself
  with `addEventListener('kai-submit', …)`, `'kai-message-action'`,
  `'kai-conversation-select'`, … and read `(e as CustomEvent).detail`.
- **Keep the composer uncontrolled.** Never assign a plain string `value` — that
  flips `<kai-prompt-input>` into controlled mode and breaks the `/` (skills) and
  `@` (agents) caret-anchored menus. Clear-on-submit calls the element's `clear()`
  method; voice seeds a `ComposerDoc` (a non-string `value`) instead.

## How it works

- `src/main.ts` registers the elements, waits for them to upgrade, wires the send
  loop (append + stream), and boots the view.
- `src/view.ts` builds the `kai-*` workspace imperatively (`<kai-resizable>` for
  the split, `<kai-conversations>`, `<kai-thread>`, `<kai-prompt-input>`), wires
  every element's events, and exposes a `render(state)` that syncs app state onto
  element properties.
- `src/state.ts` is a tiny store holding `{ messages, conversations, activeId,
  theme, collapsed, loading }`. Its message ops build on the **same**
  framework-neutral state core (`@kitn.ai/ui/state`) the React `useKaiChat` hook
  and the Vue `useChat` composable use.
- `src/voice-input.ts` is the shared Web Speech mic helper (Chromium-only).
- A light/dark toggle (top-right) drives each element's `theme` and a `.dark` class
  on the shell, so the kit's `--color-*` tokens flip for your own chrome too.

The example consumes the kit from this monorepo via `workspace:*`, so it always
builds against the local `@kitn.ai/ui` (through the package `exports` map, exactly
like a published consumer — no aliases).

## Run it

From the repo root, build the kit once so its `dist/` exists (the example imports
the compiled `@kitn.ai/ui/elements` + `@kitn.ai/ui/theme.tokens.css`), then start
the example:

```bash
pnpm exec nx build ui
pnpm --filter @kitn.ai/ui-example-vanilla dev
```

Open the URL Vite prints (default <http://localhost:5173>).

## Build / typecheck

```bash
pnpm --filter @kitn.ai/ui-example-vanilla typecheck
pnpm --filter @kitn.ai/ui-example-vanilla build
```
