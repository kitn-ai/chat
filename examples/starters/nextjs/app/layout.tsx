// Root layout — a React Server Component (no 'use client' here).
//
// The kit's design tokens, as PLAIN COMPILED CSS.
//
// IT MUST BE `theme.tokens.css`, NOT `theme.css`. They are not two spellings of
// one file: `@kitn.ai/ui/theme.css` is Tailwind v4 SOURCE — its light tokens live
// inside an `@theme { … }` block, which is a Tailwind at-rule, not CSS. This app
// runs no Tailwind (`postcss.config.mjs` declares no plugins), so that file would
// reach the browser verbatim, where an unknown at-rule is DISCARDED WHOLE, and
// `next build` would stay green throughout. That is what this starter shipped
// until it was measured on the emitted asset: `.next/static/css/*.css` carried
// one raw `@theme {`, and `--color-background` was defined nowhere else.
//
// WHAT THAT ACTUALLY BREAKS, stated at its real size, because "the app renders on
// fallbacks" is the easy version and it is wrong. Dark mode is fine — those tokens
// are a plain `.dark` rule. In light mode `:root` defines no `--color-*` at all,
// but anything nested inside a `kai-*` element still resolves — nothing re-scopes
// anything: Tailwind emits `@theme` to `:root, :host`, so the elements' own
// compiled CSS pins the tokens on every host and children inherit off it, slotted
// or not. What loses its colours is the chrome OUTSIDE every element — this app's
// `.app` shell and `html`/`body`, measured computing
// `background-color: rgba(0, 0, 0, 0)`. Theming host-page chrome is exactly what
// this stylesheet is for, and the narrowness is why the bug survived: the page
// looks nearly right.
//
// THE RULE IS "DOES TAILWIND PROCESS THIS FILE", NOT "NEVER IMPORT theme.css".
// The Solid starter imports the very same `theme.css` and is correct, because its
// stylesheet says `@import "tailwindcss"` above it and `@tailwindcss/vite` is in
// the pipeline, so `@theme` is COMPILED rather than discarded. Add Tailwind here
// and you would switch back.
//
// A CSS import works from a Server Component because it has no client runtime,
// and importing it HERE is what puts the stylesheet in the prerendered document,
// so there is no flash of unstyled custom elements.
import '@kitn.ai/ui/theme.tokens.css';
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: '@kitn.ai/ui — Next.js App Router example',
  description: 'A chat workspace composed by hand from the kai-* web components, on Next.js 15 / React 19.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
