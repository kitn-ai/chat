# @kitn.ai/ui — TanStack Start example

A real **[TanStack Start](https://tanstack.com/start)** app (full-stack React:
SSR + streaming + hydration) consuming `@kitn.ai/ui` through the typed React
wrappers.

It is a **chat workspace composed by hand** — `<Resizable>` for the split,
`<Conversations>` in the rail, `<Thread>` for the message list, `<PromptInput>`
for the composer, with `useKaiChat` owning the messages and the stream. It is
*not* a drop-in `<kai-chat>`, because a drop-in does not show a developer how the
pieces fit together.

It also doubles as the SSR compatibility test: *does the kit server-render,
hydrate, and register cleanly on TanStack Start?*

**Yes — verified end to end** (Playwright/Chromium, dev *and* production build):
the `kai-*` elements server-render as bare tags, then on the client they
register, hydrate, populate their shadow DOM and stream — with **no console
errors and no hydration-mismatch warnings**. No consumer-side workarounds are
needed; it's the standard TanStack Start setup.

## What it demonstrates

- **SSR-safe custom elements.** The React wrappers register elements
  *client-only* (in a layout effect) and assign array/object props as live DOM
  *properties* after hydration. So the server emits bare `<kai-*>` tags, the
  client registers + populates them, and there is nothing to mismatch between the
  two renders. `curl` this app and you will find
  `<kai-thread class="thread"></kai-thread>` — empty, with **no `messages`
  attribute anywhere**. That is correct.
- **Streaming, which is the stronger proof.** A static array proves the property
  channel worked *once, at mount*. Every streamed chunk assigns a **new**
  `messages` array to the same element the server rendered empty, so the reply
  arriving is proof the channel keeps working after hydration. A page that
  hydrated badly can still look right; it cannot stream.
- **A visible hydration check.** The badge in the top bar reads
  "server-rendered" in the SSR'd HTML and only flips to "hydrated · 5/5" once
  client JavaScript has defined the elements. Hydration failure otherwise looks
  exactly like success.
- **Per-element registration / tree-shaking.** Importing the wrappers you use is
  enough to register just those — no `import '@kitn.ai/ui/elements'` side effect,
  and the elements you don't render aren't downloaded at runtime.

## Run it

```bash
npm install        # resolves @kitn.ai/ui from the local repo + TanStack Start
npm run dev        # SSR dev server on http://localhost:3000
npm run build      # production client + server build → dist/
npm start          # serve the production build (node serve.mjs) on :3000
npm run typecheck  # NOT covered by `build` — see below
```

`npm run build` is a bare `vite build`, and Vite strips TypeScript with esbuild
rather than checking it, so **this project bundles green with type errors in it**.
`npm run typecheck` is the check, and it has to run *after* a build because
`tsc` reads the `src/routeTree.gen.ts` the Start plugin generates. Both
`packages/ui/scripts/verify-starters.mjs` and `create-kai`'s smoke run know this
and run the two in that order.

This example consumes the local `@kitn.ai/ui` via `file:../../../packages/ui`.
Build the kit first from the repo root (`nx build ui`), then `npm install` here.

`.npmrc` sets `install-links=true` so npm **packs** the kit into a real
`node_modules/@kitn.ai/ui` copy instead of symlinking the repo — the same layout
a real `npm install` from the registry yields.

## Consumer setup notes (the parts specific to SSR)

1. **Standard TanStack Start config.** `vite.config.ts` is the documented setup
   — `tanstackStart()` before `viteReact()`, nothing kit-specific. Routes live in
   `src/routes/`; shared components live *outside* it, in `src/components/`,
   because the router plugin compiles `routes/` to build the route tree.
2. **Import `@kitn.ai/ui/theme.tokens.css`, not `@kitn.ai/ui/theme.css`.** The
   latter is Tailwind v4 *source*: its tokens live in an `@theme { … }` block,
   which is a Tailwind at-rule rather than CSS. Without the Tailwind plugin it
   reaches the browser verbatim, an unknown at-rule is discarded whole, and every
   `--color-*` token silently resolves to nothing. It builds green either way,
   which is what makes it worth knowing. Importing the tokens from `__root.tsx`
   is what puts the `<link rel="stylesheet">` in the **server-rendered** `<head>`,
   so there is no flash of unstyled custom elements.
3. **No `'use client'`-style directive** is needed — the wrappers self-guard with
   `typeof window`, so they're inert during SSR and only touch `customElements`
   in the browser.
4. **Leave `@kitn.ai/ui` external to the SSR build** (the Vite default — don't
   add it to `ssr.noExternal`). The per-element registration uses
   `import('@kitn.ai/ui/elements/<name>')`, which only runs in the browser, so
   the server just renders the bare tags. Forcing it into the SSR bundle makes
   the bundler eagerly resolve those browser-only imports for no benefit.
5. **Keep browser-only values out of render.** `useVoiceInput` reports
   `supported: false` on the server and `true` in Chromium; `src/components/
   Composer.tsx` reads it only inside the click handler. Branch *render output*
   on a value like that and the server builds a different tree than the client
   does — the textbook hydration mismatch.

That's it — no `optimizeDeps` tweaks, no resolver shims, no per-element import
fixups.

## Production serving

Current TanStack Start `vite build` emits a portable Web-`fetch` handler at
`dist/server/server.js` (not a Node http listener) plus the static client assets
in `dist/client`. A real deploy picks a target (Node, Bun, a CDN/worker, …); for
this example, [`serve.mjs`](./serve.mjs) bridges Node's http to that fetch
handler and serves the static assets, so `npm start` runs the SSR build locally.

## Going live

The reply comes from the kit's own mock responder — canned SSE frames in the
OpenAI chat-completions shape, parsed by the same `readOpenAIStream` a real
provider's response goes through. No key, no backend, no provider is contacted.
One expression in `src/routes/index.tsx` changes to ship for real:

```diff
- await readOpenAIStream(mockResponse(text), stream);
+ const res = await fetch('/api/chat', {
+   method: 'POST',
+   headers: { 'content-type': 'application/json' },
+   body: JSON.stringify({ messages: toOpenAIMessages(chat.messages) }),
+ });
+ await readOpenAIStream(res, stream);
```

## Tree-shaking note

At **runtime** the win holds: loading this page fetches only the chunks for the
elements actually rendered — the other ~70 elements are never downloaded. But the
**build** still *emits* a lazy chunk for every element, because the wrapper
factory calls in the published `dist/react.js` aren't annotated
`/*@__PURE__*/`, so Rollup can't prove the unused wrappers are side-effect-free
and keeps all their `import()` split points. Net: good for end users, but the
build output carries dead chunks.
