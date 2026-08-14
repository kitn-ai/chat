# @kitn.ai/ui — Next.js App Router example

A real **Next.js 15 (App Router) + React 19** app consuming `@kitn.ai/ui` through
the typed React wrappers.

It is a **chat workspace composed by hand** — `<Resizable>` for the split,
`<Conversations>` in the rail, `<Thread>` for the message list, `<PromptInput>`
for the composer, with `useKaiChat` owning the messages and the stream. It is
*not* a drop-in `<kai-chat>`, because a drop-in does not show a developer how the
pieces fit together.

It also doubles as the RSC/SSR compatibility test: *does the kit prerender,
hydrate and register cleanly on the App Router, and where does `'use client'`
go?*

**Yes — verified end to end** (Playwright/Chromium, `next dev` *and* the
production build): the `kai-*` elements prerender as bare tags, then on the client
they register, hydrate, populate their shadow DOM and stream — with **no console
errors and no hydration mismatches**. No consumer-side workarounds; it is the
standard App Router setup.

## What it demonstrates

- **Where `'use client'` goes.** `app/layout.tsx` and `app/page.tsx` are Server
  Components with no directive. `app/workspace.tsx` has one because *it* uses
  hooks and event-handler props — the standard RSC rule, not a kit requirement.
  You never need a directive just to render a wrapper: the wrappers carry their
  own `'use client'` banner, so a Server Component can render one directly.
- **SSR-safe custom elements.** The wrappers register elements *client-only* (in
  a layout effect) and assign array/object props as live DOM *properties* after
  hydration. So the prerender emits bare `<kai-*>` tags and there is nothing to
  mismatch between the two renders. `curl` this app and you will find
  `<kai-thread class="thread"></kai-thread>` — empty, with **no `messages`
  attribute anywhere**. That is correct.
- **Streaming, which is the stronger proof.** A static array proves the property
  channel worked *once, at mount*. Every streamed chunk assigns a **new**
  `messages` array to the same element the server rendered empty, so the reply
  arriving is proof the channel keeps working after hydration. A page that
  hydrated badly can still look right; it cannot stream.
- **A visible hydration check.** The badge in the top bar reads
  "server-rendered" in the prerendered HTML and only flips to "hydrated · 5/5"
  once client JavaScript has defined the elements. This matters more on Next than
  anywhere else: a **production** React build minifies hydration errors into a
  numbered link, so `next start` shows you a silently dead page. Run `next dev`
  when you want the mismatch in words.
- **Per-element registration / tree-shaking.** Importing the wrappers you use is
  enough to register just those — no `import '@kitn.ai/ui/elements'` side effect,
  and the elements you don't render aren't downloaded at runtime.

## Run it

```bash
npm install        # resolves @kitn.ai/ui from the local repo
npm run dev        # dev server on http://localhost:3000 — logs hydration errors
npm run build      # production build (this is also the typecheck: `next build` runs tsc)
npm start          # serve the production build on :3000
```

`npm run build` typechecks on its own, which is why `verify:starters` and
`create-kai`'s smoke run do not run `typecheck` separately for this project the
way they do for TanStack Start.

This example consumes the local `@kitn.ai/ui` via `file:../../../packages/ui`.
Build the kit first from the repo root (`nx build ui`), then `npm install` here.

`.npmrc` sets `install-links=true` so npm **packs** the kit into a real
`node_modules/@kitn.ai/ui` copy instead of symlinking the repo. Next/webpack
follows symlinks to their realpath, which would put the kit's prebuilt `dist/`
*outside* `node_modules` — Next would then try to transpile it and choke on the
minified Shiki chunk. A packed copy is also what a real `npm install` from the
registry yields.

## Consumer setup notes (the parts specific to Next)

1. **No `transpilePackages`, no webpack config.** The kit ships pre-compiled ESM,
   and `@kitn.ai/ui/elements` is SSR-safe: it touches no `window` /
   `customElements` at import time. (`outputFileTracingRoot` in
   `next.config.mjs` and the local `postcss.config.mjs` are here only because
   this example is nested inside the library's monorepo.)
2. **Import `@kitn.ai/ui/theme.tokens.css`, not `@kitn.ai/ui/theme.css`.** The
   latter is Tailwind v4 *source*: its light tokens live in an `@theme { … }`
   block, which is a Tailwind at-rule rather than CSS. With no Tailwind in the
   pipeline it reaches the browser verbatim and an unknown at-rule is discarded
   whole. It builds green either way, which is what makes it worth a paragraph —
   and it is checkable: after `next build`, `.next/static/css/*.css` must contain
   **zero** raw `@theme {` at-rules.

   What it costs you is narrower than "nothing is styled", and worth knowing so
   you can recognise it: dark mode is unaffected (those tokens are a plain
   `.dark` rule), and anything nested inside a `kai-*` element still resolves.
   Nothing re-scopes anything — Tailwind emits `@theme` to `:root, :host`, so
   the elements' own compiled CSS pins the tokens on every host and children
   inherit off it. The casualty is your own chrome *outside* the elements —
   here `.app` computes `background-color: rgba(0, 0, 0, 0)` in light mode. The
   page looks nearly right, which is why this is worth checking rather than
   eyeballing.

   The rule is "does Tailwind process this file", not "never import `theme.css`":
   an app that *does* run Tailwind should import `theme.css`, which is then
   compiled.
3. **Keep browser-only values out of render.** `useVoiceInput` reports
   `supported: false` on the server and `true` in Chromium;
   `app/components/Composer.tsx` reads it only inside the click handler. Branch
   *render output* on a value like that and the server builds a different tree
   than the client does — the textbook hydration mismatch.
4. **Keep the theme off `<html>`.** `.dark` is toggled on the shell `div` inside
   the client island, so the prerendered document does not have to guess a colour
   scheme the server cannot know.

## Going live

The reply comes from the kit's own mock responder — canned SSE frames in the
OpenAI chat-completions shape, parsed by the same `readOpenAIStream` a real
provider's response goes through. No key, no backend, no provider is contacted.
One expression in `app/workspace.tsx` changes to ship for real:

```diff
- await readOpenAIStream(mockResponse(text), stream);
+ const res = await fetch('/api/chat', {
+   method: 'POST',
+   headers: { 'content-type': 'application/json' },
+   body: JSON.stringify({ messages: toOpenAIMessages(chat.messages) }),
+ });
+ await readOpenAIStream(res, stream);
```

`/api/chat` is an App Router route handler (`app/api/chat/route.ts`) that talks to
your provider and streams the response back.

## Tree-shaking note

At **runtime** the win holds: loading this page fetches only the chunks for the
elements actually rendered — the other ~70 elements are never downloaded. But the
**build** still *emits* a lazy chunk for every element, because the wrapper
factory calls in the published `dist/react.js` aren't annotated
`/*@__PURE__*/`, so the bundler can't prove the unused wrappers are
side-effect-free and keeps all their `import()` split points. Net: good for end
users, but the build output carries dead chunks. For the smallest output, import
elements directly: `import '@kitn.ai/ui/elements/button'` and render the
`<kai-button>` tag yourself.
