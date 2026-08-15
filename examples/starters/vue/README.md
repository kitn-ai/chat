# Vue example — chat workspace, composed by hand

A small chat **workspace assembled from `@kitn.ai/ui`'s individual elements** — a
`<kai-conversations>` sidebar, a `<kai-thread>` of messages, and a
`<kai-prompt-input>` composer — wired together with plain Vue refs. Non-React
frameworks consume the **raw `kai-*` web components directly** (no wrappers), so
this is the reference for how that composition looks in Vue. It mirrors
`examples/react` feature-for-feature.

It runs with **no backend**: replies stream in from the kit's own mock responder,
`createMockResponder()` from `@kitn.ai/ui/state` (wired up in `src/chat-data.ts`),
so there's no API key and nothing to host. The mock yields SSE frames that
`readOpenAIStream` parses exactly as it parses a real provider's, so the preview
runs the real streaming path — and swapping `mockResponse(text)` for a real
`fetch` (Anthropic, OpenAI, your own endpoint) is the only change you make.

Nothing here can be mistaken for a real turn: the stream opens with a `: kai-mock`
SSE comment, every frame carries a `_kai_mock` field, `model` reports as
`kai-mock`, and usage is all zeros.

## The Vue web-component rules

Consuming Shadow-DOM custom elements from Vue comes down to four things:

- **Tell Vue the tags are custom elements.** `vite.config.ts` sets
  `isCustomElement: (tag) => tag.startsWith('kai-')` so Vue passes props/events
  straight to the DOM instead of trying to resolve `kai-*` as Vue components.
- **Register before mount.** `src/main.ts` does `import '@kitn.ai/ui/elements'`
  (registers the elements) and `import '@kitn.ai/ui/theme.tokens.css'` (the plain
  `--color-*` tokens the shell uses) **before** `createApp(App).mount(...)`.
- **Array/object props are DOM properties, not attributes.** Use the `.prop`
  modifier for rich values: `:messages.prop`, `:conversations.prop`,
  `:groups.prop`, `:triggers.prop`, `:suggestions.prop`. Scalars (`theme`,
  `placeholder`, `size`, `activeId`) bind normally.
- **Updating a list needs a new array AND a new object for each item you changed.**
  The new array reference is what tells the element something changed — assigning the
  same array back is a no-op even if you swapped an item inside it. The new item object
  is what makes the change visible, because the lists key their rows by item identity.
  Adds, removes and reorders need only the fresh array; editing an existing item needs
  both. `useChat` and `useConversations` keep their arrays in a `shallowRef` and assign
  a fresh one on every update. To rename a conversation:
  ```ts
  // Stale: the title changed, but the item object did not, so the row never updates.
  conversations.value.find((c) => c.id === id)!.title = 'Renamed';
  conversations.value = [...conversations.value];

  // Renders: a new array, and the one item that changed is a new object.
  conversations.value = conversations.value.map((c) => (c.id === id ? { ...c, title: 'Renamed' } : c));
  ```
  A plain `ref` makes this worse, not better: deep reactivity re-renders *your* template
  off the in-place mutation while the element keeps the old title, so the state looks
  correct in Vue DevTools and wrong on screen.
- **Events are non-bubbling `kai-*` CustomEvents.** Listen on the element with
  `@kai-submit`, `@kai-message-action`, `@kai-conversation-select`, … and read
  `(e as CustomEvent).detail`.

## How it works

- `src/App.vue` composes the elements by hand: `<kai-resizable>` for the split,
  `<kai-conversations>` (via `Sidebar.vue`), `<kai-thread>` (via `ThreadView.vue`),
  and `<kai-prompt-input>` (via `Composer.vue`).
- `src/composables/useChat.ts` owns the message array + streaming (`append`,
  `setMessages`, `streamAssistant`, `loading`). It's a thin Vue port of the kit's
  React `useKaiChat`, built on the **same** framework-neutral state core
  (`@kitn.ai/ui/state`).
- `useConversations` owns the active conversation + the in-memory thread stash;
  `useVoiceInput` is a Vue port of the kit's mic hook.
- The composer stays **uncontrolled** so the `/` (skills) and `@` (agents) trigger
  menus keep a live caret — clear-on-submit calls the element's `clear()` method
  and voice seeds a `ComposerDoc` rather than assigning a plain string `value`.
- A light/dark toggle (top-right) drives each element's `theme` prop and a `.dark`
  class on the shell, so the kit's `--color-*` tokens flip for your own chrome too.

The example consumes the kit from this monorepo via `workspace:*`, so it always
builds against the local `@kitn.ai/ui` (through the package `exports` map, exactly
like a published consumer — no aliases).

## Run it

From the repo root, build the kit once so its `dist/` exists (the example imports
the compiled `@kitn.ai/ui/elements` + `@kitn.ai/ui/theme.tokens.css`), then start
the example:

```bash
pnpm exec nx build ui
pnpm --filter @kitn.ai/ui-example-vue dev
```

Open the URL Vite prints (default <http://localhost:5173>).

## Build / typecheck

```bash
pnpm --filter @kitn.ai/ui-example-vue typecheck
pnpm --filter @kitn.ai/ui-example-vue build
```
