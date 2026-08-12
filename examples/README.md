# Examples

Runnable starters that consume `@kitn.ai/ui` the way a real app does. The five in
the starter set are the canonical reference; a few older demos live below them.

## Starter set: hand-composed chat workspaces

Five parallel examples, one per framework, each building the **same** small chat
workspace by composing the kit's individual `kai-*` elements by hand: a
resizable sidebar split, a `kai-conversations` rail, a streaming `kai-thread`, a
`kai-prompt-input` composer, a light/dark toggle, and voice input. The point is
to show how the pieces fit together, not to drop in one batteries-included
`<kai-chat>` tag.

They run with no backend. Replies come from the kit's own `createMockResponder()`
(`@kitn.ai/ui/state`, wired up in each starter's `src/chat-data.ts`), so there's
no API key and nothing to host. It yields canned SSE frames that
`readOpenAIStream` parses exactly as it parses a real provider's, so the preview
runs the real streaming path rather than a lookalike. Swap `mockResponse(text)`
for a real `fetch` and you have a real app.

Nothing there can be mistaken for a real turn: the stream opens with a
`: kai-mock` SSE comment, every frame carries a `_kai_mock` field, `model`
reports as `kai-mock`, and usage is all zeros.

| Directory | Framework | Kit API used |
|---|---|---|
| `starters/react/` | React 19 | Generated React wrappers from `@kitn.ai/ui/react` (`<Conversations>`, `<Message>`, `<PromptInput>`) |
| `starters/vue/` | Vue 3 | Raw `kai-*` web components via `:prop.prop` bindings + `@kai-*` handlers |
| `starters/svelte/` | Svelte 5 (runes) | Raw `kai-*` web components via `bind:this` + `$effect` + `onkai-*` handlers |
| `starters/vanilla/` | Plain TypeScript (Vite) | Raw `kai-*` web components, composed imperatively; no framework |
| `starters/angular/` | Angular 22 (standalone, zoneless) | Raw `kai-*` web components via `[prop]` / `(kai-*)` + `CUSTOM_ELEMENTS_SCHEMA` |

All five are pnpm-workspace members that depend on the kit with
`"@kitn.ai/ui": "workspace:*"`, so they build against the local source through
the package `exports` map, exactly like a published consumer. No aliases, no
pointing at a raw bundle.

### Run

Build the kit once first, then start any example with its shortcut script:

```bash
pnpm install       # once
pnpm build:ui      # build the kit into packages/ui/dist/ (or: pnpm exec nx build ui)
pnpm example:react # start the React example on http://localhost:5173
```

`build:ui` produces `packages/ui/dist/`, a gitignored artifact the examples
import. Build it once before starting a dev server, and rebuild after you change
the kit.

Each example has a shortcut script and a fixed dev port:

| Script | URL |
|---|---|
| `pnpm example:react` | <http://localhost:5173> |
| `pnpm example:vue` | <http://localhost:5174> |
| `pnpm example:svelte` | <http://localhost:5175> |
| `pnpm example:vanilla` | <http://localhost:5176> |
| `pnpm example:angular` | <http://localhost:4200> |

Longhand still works: `pnpm --filter @kitn.ai/ui-example-<dir> dev`, or run it in
place with `cd examples/starters/<dir> && pnpm dev`.

Each example's own `README.md` documents the per-framework web-component rules
(registering `kai-*` before mount, setting array/object data as DOM properties,
listening for non-bubbling `kai-*` events, keeping the composer uncontrolled).
`starters/react/` is the reference the others mirror.

## Other examples

These predate the starter-set refresh and consume the kit their own way.

### Static ES-module demos

- **`demos/composable/`**: the full roster of individual elements plus the
  batteries-included `<kai-chat>`, as a plain HTML page.
- **`demos/widget/`**: a floating chat widget.

Both are ES-module web-component pages: they must be **served over HTTP** (opening
them as a `file://` page fails, because browsers block ES-module loading from a
`null` origin, so nothing registers and you get empty boxes). Serve the **repo
root**:

```bash
pnpm build:ui                            # once, to produce packages/ui/dist/
pnpm --filter @kitn.ai/ui run examples   # serves the repo root on http://localhost:8000
```

Then open `http://localhost:8000/examples/demos/composable/index.html` or
`.../examples/demos/widget/index.html`.

`demos/composable/` loads the local build at `packages/ui/dist/kai.es.js`, so
build the kit first and rebuild after you change it. `demos/widget/` pulls the
published package from unpkg instead, so it needs a network connection but no
build. Any static server rooted at the repo works as well (`npx serve .`); adjust
the port to whatever it prints.

### Framework and meta-framework apps

- **`starters/solid/`**: SolidJS Vite app that uses the raw SolidJS component API
  (the `.` entry). A pnpm-workspace member on `"@kitn.ai/ui": "workspace:*"`, like
  the other SPA starters.
- **`starters/nextjs/`**: Next.js 15 App Router, SSR + RSC `'use client'`, on the
  generated React wrappers (`@kitn.ai/ui/react`).
- **`starters/tanstack-start/`**: TanStack Start, SSR + hydration, also on the
  generated React wrappers.

`starters/nextjs/` and `starters/tanstack-start/` install the kit from the local
repo via `file:../../..` (not aliased), the way a real consumer would. Build the
kit at the repo root first, then `cd` in, `npm install`, and `npm run build`.

### Support fixtures

`internal/remote-host/`, `internal/remote-provider/`, `internal/shared/`, and
`internal/artifact-fixtures/` are not standalone demos. They hold shared sample
data and assets, the remote generative-UI host/provider harness, and artifact
render fixtures used by the other examples.
