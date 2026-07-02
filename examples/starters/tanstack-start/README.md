# @kitn.ai/ui — TanStack Start example

A real **[TanStack Start](https://tanstack.com/start)** app (full-stack React:
SSR + streaming + hydration) consuming `@kitn.ai/ui` through the typed React
wrappers. It doubles as the compatibility test: *does the kit server-render,
hydrate, and register cleanly on TanStack Start?*

**Yes — verified end to end** (Playwright/Chromium, dev *and* production build):
`<kai-button>`, `<kai-chat>` and `<kai-conversations>` server-render as bare
tags, then on the client they register, hydrate, populate their shadow DOM, and
dispatch events — with **no console errors and no hydration-mismatch warnings**.
No consumer-side workarounds are needed; it's the standard TanStack Start setup.

## What it demonstrates

- **SSR-safe custom elements.** The React wrappers register elements
  *client-only* (in a layout effect) and assign array/object props as live DOM
  *properties* after hydration. So the server emits bare `<kai-*>` tags, the
  client registers + populates them, and there's nothing to mismatch between the
  two renders.
- **Data-driven elements.** `<Chat messages={…} />` and
  `<Conversations conversations={…} />` — the arrays are set as JS *properties*
  through the wrappers; the thread and the conversation list appear after
  hydration, proving array round-tripping survives SSR.
- **Events.** `<Button onClick={…}>` increments a counter (the element's
  `kai-click` CustomEvent wired to a React handler).
- **Per-element registration / tree-shaking.** Importing
  `{ Button, Chat, Conversations }` is enough to register just those — no
  `import '@kitn.ai/ui/elements'` side-effect, and the elements you don't render
  aren't downloaded at runtime.

## Run it

```bash
npm install        # resolves @kitn.ai/ui from the local repo + TanStack Start
npm run dev        # SSR dev server on http://localhost:3000
npm run build      # production client + server build → dist/
npm start          # serve the production build (node serve.mjs) on :3000
npm run typecheck
```

This example consumes the local `@kitn.ai/ui` via `file:../../..`. Build the kit
first from the repo root (`npm run build`), then `npm install` here.
(Post-monorepo this becomes `workspace:*`; once the register-all fix is
published you can pin the npm semver instead.)

`.npmrc` sets `install-links=true` so npm **packs** the kit into a real
`node_modules/@kitn.ai/ui` copy instead of symlinking the repo — the same layout
a real `npm install` from the registry yields.

## Consumer setup notes (the parts specific to SSR)

1. **Standard TanStack Start config.** `vite.config.ts` is the documented setup
   — `tanstackStart()` before `viteReact()`, nothing kit-specific. Routes live
   in `src/routes/`, and `theme.css` is imported once in `__root.tsx`.
2. **No `'use client'`-style directive** is needed — the wrappers self-guard
   with `typeof window`, so they're inert during SSR and only touch
   `customElements` in the browser.
3. **Leave `@kitn.ai/ui` external to the SSR build** (the Vite default — don't
   add it to `ssr.noExternal`). The per-element registration uses
   `import('@kitn.ai/ui/elements/<name>')`, which only runs in the browser, so
   the server just renders the bare tags. Forcing it into the SSR bundle makes
   the bundler eagerly resolve those browser-only imports for no benefit.

That's it — no `optimizeDeps` tweaks, no resolver shims, no per-element import
fixups.

## Production serving

Current TanStack Start `vite build` emits a portable Web-`fetch` handler at
`dist/server/server.js` (not a Node http listener) plus the static client assets
in `dist/client`. A real deploy picks a target (Node, Bun, a CDN/worker, …); for
this example, [`serve.mjs`](./serve.mjs) bridges Node's http to that fetch
handler and serves the static assets, so `npm start` runs the SSR build locally.

## Tree-shaking note

At **runtime** the win holds: loading this page fetches only the chunks for the
elements actually rendered (button, chat, conversations, and their transitive
deps) — the other ~70 elements are never downloaded. But the **build** still
*emits* a lazy chunk for every element, because the wrapper factory calls in the
published `dist/react.js` aren't annotated `/*@__PURE__*/`, so Rollup can't prove
the unused wrappers are side-effect-free and keeps all their `import()` split
points. Net: good for end users, but the build output carries dead chunks.
