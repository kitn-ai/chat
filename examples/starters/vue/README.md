# Vue example — chat workspace, composed by hand

A small chat **workspace assembled from `@kitn.ai/ui`'s individual elements** — a
`<kai-conversations>` sidebar, a `<kai-thread>` of messages, and a
`<kai-prompt-input>` composer — wired together with plain Vue refs. Non-React
frameworks consume the **raw `kai-*` web components directly** (no wrappers), so
this is the reference for how that composition looks in Vue. It mirrors
`examples/react` feature-for-feature.

It runs with **no backend**: replies stream in from a local fake responder
(`src/chat-data.ts`), so there's no API key and nothing to host. Swap
`streamFakeReply` for a real model call (Anthropic, OpenAI, your own endpoint)
and you have a real app.

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
  `placeholder`, `size`, `activeId`) bind normally. Streaming needs a **new array
  reference per chunk** — `useChat` keeps `messages` in a `shallowRef` and assigns
  a fresh array on every update.
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
