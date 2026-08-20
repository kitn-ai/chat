# kitn-chat docs site

The public documentation + DX surface for [`@kitn.ai/ui`](https://www.npmjs.com/package/@kitn.ai/ui),
built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build).
Doc widgets are authored in **Solid** (the kit's own language); the real `kai-*` web
components are embedded live in MDX so every example is the actual component.

Deploys to GitHub Pages at `ui.kitn.ai` (static build, `base: '/chat'`,
Pagefind search). Storybook is demoted to an internal tool (the axe-gated story test
suite + a Solid/Advanced playground), not the public face.

## Wired to the live kit — no committed snapshot

The interactive examples import `@kitn.ai/ui` directly (Vite-resolved workspace
package — see `src/components/example/kit.ts`), and the Props/Events tables import
`@kitn.ai/ui/element-meta.json` the same way. There is no synced bundle mirror.

The one bounded copy is `scripts/copy-kit-assets.mjs` (run automatically on
`predev`/`prebuild`), which copies exactly 4 raw-served assets from the kit build:

| Source (`packages/ui/`)      | → Target (gitignored)              | Used by                          |
| :--------------------------- | :--------------------------------- | :------------------------------- |
| `dist/elements/autoloader.js`| `public/kitn/elements/autoloader.js` | `public/autoloader-demo.html` (zero-build CDN path) |
| `dist/theme.tokens.css`      | `public/kitn/theme.tokens.css`     | `public/autoloader-demo.html`    |
| `llms.txt` / `llms-full.txt` | `public/`                          | served at the site root for AI agents |

The kit must be built first (`nx build ui` at the repo root) so `packages/ui/dist/`
exists — the copy does not build it for you.

## Commands

Run from this directory (`apps/docs/`):

| Command           | Action                                                          |
| :---------------- | :------------------------------------------------------------- |
| `npm install`     | Install dependencies                                            |
| `npm run dev`     | Copy the 4 kit assets, then start the dev server (serves under `/chat`) |
| `npm run build`   | Copy the 4 kit assets, then build the static site to `./dist/`  |
| `npm run preview` | Preview the production build locally                            |

## Structure

```
apps/docs/
├── public/                 # static assets (kitn-logo, favicon); public/kitn/ holds the 4 copied kit assets (gitignored)
├── scripts/copy-kit-assets.mjs  # copies the 4 raw-served kit assets from packages/ui/
├── src/
│   ├── components/         # doc widgets (Solid islands + Astro)
│   │   ├── example/        # reusable: kit loader, Resizer, CodePanel
│   │   └── overrides/      # Starlight component overrides (Header, ThemeToggle, …)
│   ├── content/docs/       # the pages (.md/.mdx) — one route per file
│   ├── data/samples/       # hand-authored per-element sample data (tracked)
│   └── styles/             # tokens.css (one source) + app.css
└── astro.config.mjs
```

See `DESIGN.md` for the design system, and the component-page template in
`src/content/docs/components/attachments.mdx` (the approved pattern for every element).
