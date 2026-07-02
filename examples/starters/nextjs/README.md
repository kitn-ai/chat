# @kitn.ai/ui — Next.js App Router example

A minimal **Next.js 15 (App Router) + React 19** app that consumes the kai-\*
web components via the typed React wrappers (`@kitn.ai/ui/react`). It doubles as
the compatibility test for "does this work with Next.js / RSC / SSR, and is
`'use client'` needed?"

## TL;DR

- **Yes, it works end-to-end on the App Router**: `next build` + SSR + hydrate +
  register + populate + interact, with zero console errors. (Verified with
  Playwright/Chromium against `next start`.)
- **You do NOT need to add `'use client'` to render a wrapper** — the wrappers
  ship their own `'use client'` banner, so a Server Component can render them
  directly. You only add your own `'use client'` when *your* component uses
  hooks/state/event handlers (a standard RSC rule, not a kit requirement).
- A standalone app needs **no `transpilePackages`** and no special webpack config.
  (The `postcss.config.mjs` + `outputFileTracingRoot` here exist only because this
  example is nested inside the library's monorepo.)

## Run it

```bash
npm install
npm run build && npm run start   # production (what the verification used)
# or
npm run dev                      # Turbopack dev
```

Open <http://localhost:3000>. You'll see a Button rendered straight from a Server
Component, an interactive Button counter, and a populated `kai-conversations`
rail; clicking a conversation updates the React state below.

## The `'use client'` answer

App Router files are **Server Components** by default. The kai wrappers are
client components (they use hooks + register their element on mount), and they
**carry their own `'use client'` banner**. So:

- **Rendering a wrapper from a Server Component: no consumer directive needed.**
  `app/page.tsx` has **no** `'use client'` and renders `<Button>` directly — it
  builds, registers, and upgrades. (Server → client component is the normal RSC
  composition; the banner makes the wrapper the boundary.)
- **You need your own `'use client'`** only when *your* file uses hooks, local
  state, or passes event-handler props — because functions can't cross the RSC
  boundary and hooks don't run on the server. `app/InteractiveIsland.tsx` is that
  file: it holds `useState` and an `onConversationSelect` handler. Without a
  directive it would fail with the standard error:

  ```
  You're importing a component that needs `useState`. This React Hook only works
  in a Client Component. To fix, mark the file (or its parent) with the
  "use client" directive.
  ```

**Pattern:** keep pages/layouts as Server Components (this `app/page.tsx` is one,
and `app/layout.tsx` imports `@kitn.ai/ui/theme.css` from the server fine). Pull
interactive state into a small client island.

## Using the wrappers

The wrappers are real React components — no refs, no manual event wiring:

```tsx
import { Button, Conversations } from '@kitn.ai/ui/react';

<Button variant="default" onClick={() => ...}>Click me</Button>

<Conversations
  groups={GROUPS}
  conversations={CONVERSATIONS}   // array/object props, typed
  activeId={activeId}
  onConversationSelect={(e) => setActiveId(e.detail.id)}  // typed CustomEvent
/>
```

Array/object props are assigned as live DOM *properties* under the hood; `on<Event>`
handlers are wired to the underlying non-bubbling `kai-*` CustomEvents. Each
wrapper registers its own element on mount (browser-only) — no separate
`import '@kitn.ai/ui/elements'` needed.

## Tree-shaking

- **First Load JS ≈ 109 kB** for this page.
- Each wrapper lazy-loads its element's chunk on mount, so the browser only
  *fetches* the element chunks you actually render.
- Caveat: because the wrapper barrel (`@kitn.ai/ui/react`) is a single
  `'use client'` module that references every element, `next build` still *emits*
  chunks for all elements even when you import only one or two (they're just never
  fetched at runtime). For the smallest build output, import elements directly:
  `import '@kitn.ai/ui/elements/button'` and render the `<kai-button>` tag
  yourself.

## Consuming the local kit

This example consumes the local `@kitn.ai/ui` via `file:../../..`. Build the kit
first from the repo root (`npm run build`), then `npm install` here.
(Post-monorepo this becomes `workspace:*`; once the register-all fix is
published you can pin the npm semver instead.)

`.npmrc` sets `install-links=true` so npm **packs** the kit into a real
`node_modules/@kitn.ai/ui` copy instead of symlinking the repo. Next.js/webpack
follows symlinks to their realpath, which would put the kit's prebuilt `dist/`
*outside* `node_modules` — Next would then try to transpile it and choke on the
minified Shiki chunk. A packed copy is also what a real `npm install` from the
registry yields, so the example stays faithful to real consumption.
