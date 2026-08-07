# Angular example — chat workspace, composed by hand

A small chat **workspace assembled from `@kitn.ai/ui`'s individual elements** — a
`<kai-conversations>` sidebar, a `<kai-thread>` of messages, and a
`<kai-prompt-input>` composer — wired together with plain Angular signals. Non-React
frameworks consume the **raw `kai-*` web components directly** (no wrappers), so this
is the reference for how that composition looks in Angular. It mirrors
`examples/react` and `examples/vue` feature-for-feature.

It runs with **no backend**: replies stream in from a local fake responder
(`src/chat-data.ts`), so there's no API key and nothing to host. Swap
`streamFakeReply` for a real model call (Anthropic, OpenAI, your own endpoint) and
you have a real app.

## The Angular web-component rules

Consuming Shadow-DOM custom elements from Angular comes down to five things:

- **Allow the tags with `CUSTOM_ELEMENTS_SCHEMA`.** Every standalone component that
  uses `kai-*` tags adds `schemas: [CUSTOM_ELEMENTS_SCHEMA]`, so Angular passes
  property/event bindings straight to the DOM instead of erroring on unknown
  elements.
- **Register before bootstrap.** `src/main.ts` does `import '@kitn.ai/ui/elements'`
  and then gates `bootstrapApplication` on `customElements.whenDefined(...)` for
  every tag used. The elements register **asynchronously**, and Angular sets
  array/object DOM properties the moment it stamps a tag — a write before upgrade is
  clobbered by the element's empty defaults on upgrade. The theme tokens
  (`@kitn.ai/ui/theme.tokens.css`) load as a global stylesheet via `angular.json`
  (Angular loads global CSS from the build config, not a TS import).
- **Array/object props are DOM properties.** Angular property binding (`[messages]`,
  `[conversations]`, `[groups]`, `[triggers]`, `[suggestions]`) sets the DOM property
  on a custom element. Scalars the element reads as attributes bind with
  `[attr.active-id]`; the rest (`[theme]`, `[loading]`, `[collapsed]`) bind as
  properties, and fixed strings like `size="280px"` are plain attributes. Streaming
  needs a **new array reference per chunk** — `createChat` keeps `messages` in a
  signal and assigns a fresh array on every update.
- **Boolean flags are truthy properties.** `[voice]="true"`, not a bare `voice`
  attribute (which the facade's `flag()` reads as false).
- **Events are non-bubbling `kai-*` CustomEvents.** Bind on the element with
  `(kai-submit)`, `(kai-message-action)`, `(kai-conversation-select)`, … and read
  `($event as CustomEvent).detail`.

## How it works

- `src/app/app.component.ts` composes the elements by hand: `<kai-resizable>` for the
  split, `<kai-conversations>` (via `sidebar.component.ts`), `<kai-thread>` (via
  `thread-view.component.ts`), and `<kai-prompt-input>` (via `composer.component.ts`).
- `src/app/state/chat.store.ts` owns the message array + streaming (`append`,
  `setMessages`, `streamAssistant`, `loading`). It's a thin Angular port of the kit's
  React `useKaiChat`, built on the **same** framework-neutral state core
  (`@kitn.ai/ui/state`).
- `conversations.store.ts` owns the active conversation + the in-memory thread stash;
  `state/voice-input.ts` is a framework-neutral port of the kit's mic hook.
- The composer stays **uncontrolled** so the `/` (skills) and `@` (agents) trigger
  menus keep a live caret — clear-on-submit calls the element's `clear()` method and
  voice seeds a `ComposerDoc` rather than assigning a plain string `value`.
- A light/dark toggle (top-right) drives each element's `theme` prop and a `.dark`
  class on the shell, so the kit's `--color-*` tokens flip for your own chrome too.

The example consumes the kit from this monorepo via `workspace:*`, so it always
builds against the local `@kitn.ai/ui` (through the package `exports` map, exactly
like a published consumer — no aliases).

## Build tooling

This example targets the latest Angular (v22) on the modern **`@angular/build:application`**
builder (esbuild under the hood) rather than a custom Vite setup — it's the
least-surprising, best-supported way to build an Angular SPA, and it consumes the
compiled `@kitn.ai/ui` package the same way a real Angular app would.

It's also **zoneless**: Angular 22 drops `zone.js` by default, so there's no polyfill
and `app.config.ts` provides `provideZonelessChangeDetection()`. The app is fully
signal-based (`createChat`/`createConversations` hold state in signals, streaming
assigns a fresh `messages` array per chunk) and the `(kai-*)` event bindings schedule
change detection, so streaming, theming, conversation switching, and sidebar collapse
all update without Zone.

## Run it

From the repo root, build the kit once so its `dist/` exists (the example imports the
compiled `@kitn.ai/ui/elements` + `@kitn.ai/ui/theme.tokens.css`), then start the
example:

```bash
pnpm exec nx build ui
pnpm --filter @kitn.ai/ui-example-angular dev
```

Open the URL the Angular CLI prints (default <http://localhost:4200>).

The Angular 22 CLI requires **Node >= 22.22.3** (or >= 24.15). If `pnpm example:angular`
fails with a Node-version error, upgrade Node; the other examples run on any Node 22.

## Build

```bash
pnpm --filter @kitn.ai/ui-example-angular build
```
