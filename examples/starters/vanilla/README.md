# Vanilla example — chat workspace, composed by hand

A small chat **workspace assembled from `@kitn.ai/ui`'s individual elements** — a
`<kai-conversations>` sidebar, a `<kai-thread>` of messages, and a
`<kai-prompt-input>` composer — wired together with plain TypeScript. No
framework: the browser upgrades the `kai-*` custom elements natively and this
example composes them imperatively. It is the "pure web components, zero
framework" reference, and mirrors `examples/react` and `examples/vue`
feature-for-feature.

It runs with **no backend**: replies stream in from a local fake responder
(`src/chat-data.ts`), so there's no API key and nothing to host. Swap
`streamFakeReply` for a real model call (Anthropic, OpenAI, your own endpoint)
and you have a real app.

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
  (`promptInput.voice = true`), never a bare `voice` attribute. Streaming needs a
  **new array reference per chunk** — `state.ts` assigns a fresh `messages` array
  on every update, which is what re-renders `<kai-thread>`.
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
