# Svelte example — chat workspace, composed by hand

A small chat **workspace assembled from `@kitn.ai/ui`'s individual elements** — a
`<kai-conversations>` sidebar, a `<kai-thread>` of messages, and a
`<kai-prompt-input>` composer — wired together with plain Svelte 5 runes. Non-React
frameworks consume the **raw `kai-*` web components directly** (no wrappers), so
this is the reference for how that composition looks in Svelte. It mirrors
`examples/react` and `examples/vue` feature-for-feature.

It runs with **no backend**: replies stream in from a local fake responder
(`src/chat-data.ts`), so there's no API key and nothing to host. Swap
`streamFakeReply` for a real model call (Anthropic, OpenAI, your own endpoint)
and you have a real app.

## The Svelte web-component rules

Consuming Shadow-DOM custom elements from Svelte comes down to four things:

- **No custom-element config needed.** Svelte already treats any hyphenated tag
  (`kai-*`) as a native custom element and passes props/events through to the DOM —
  there's no Svelte equivalent of Vue's `isCustomElement`.
- **Register before mount.** `src/main.ts` does `import '@kitn.ai/ui/elements'`
  (registers the elements) and `import '@kitn.ai/ui/theme.tokens.css'` (the plain
  `--color-*` tokens the shell uses), then waits on `customElements.whenDefined(...)`
  for every tag **before** `mount(App, { target })`. The elements register
  asynchronously; without that gate the initial property writes hit not-yet-upgraded
  elements and are lost.
- **Array/object props + boolean flags are DOM properties, not attributes.** Rich
  values (`messages`, `conversations`, `groups`, `triggers`, `suggestions`) and
  boolean flags (`voice`, `loading`, `collapsed`) are set imperatively with
  `bind:this` + `$effect` (`el.messages = value`), which guarantees they land on the
  upgraded element as properties. A bare `voice` attribute reads as off; the facade
  wants `el.voice === true`. Scalars (`theme`, `placeholder`, `size`, `active-id`)
  are plain attributes. Streaming needs a **new array reference per chunk** —
  `createChat` keeps `messages` in a `$state` rune and assigns a fresh array on every
  update.
- **Events are non-bubbling `kai-*` CustomEvents.** Listen on the element with the
  Svelte 5 event attributes `onkai-submit`, `onkai-message-action`,
  `onkai-conversation-select`, … and read `(e as CustomEvent).detail`. (`kai-button`
  fires the native bubbling `click`, so it uses `onclick`.)

## How it works

- `src/App.svelte` composes the elements by hand: `<kai-resizable>` for the split,
  `<kai-conversations>` (via `Sidebar.svelte`), `<kai-thread>` (via `ThreadView.svelte`),
  and `<kai-prompt-input>` (via `Composer.svelte`).
- `src/lib/chat.svelte.ts` owns the message array + streaming (`append`,
  `setMessages`, `streamAssistant`, `loading`). It's a thin Svelte port of the kit's
  React `useKaiChat`, built on the **same** framework-neutral state core
  (`@kitn.ai/ui/state`).
- `createConversations` owns the active conversation + the in-memory thread stash;
  `createVoiceInput` is a Svelte port of the kit's mic hook.
- The composer stays **uncontrolled** so the `/` (skills) and `@` (agents) trigger
  menus keep a live caret — clear-on-submit calls the element's `clear()` method and
  voice seeds a `ComposerDoc` rather than assigning a plain string `value`.
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
pnpm --filter @kitn.ai/ui-example-svelte dev
```

Open the URL Vite prints (default <http://localhost:5173>).

## Build / typecheck

```bash
pnpm --filter @kitn.ai/ui-example-svelte typecheck
pnpm --filter @kitn.ai/ui-example-svelte build
```
