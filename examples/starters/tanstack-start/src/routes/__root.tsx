import type { ReactNode } from 'react';
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router';

// The kit's design tokens, as PLAIN COMPILED CSS.
//
// IT MUST BE `theme.tokens.css`, NOT `theme.css`. They are not two spellings of
// one file: `@kitn.ai/ui/theme.css` is Tailwind v4 SOURCE — its tokens live inside
// an `@theme { … }` block, which is a Tailwind at-rule, not CSS. Without the
// Tailwind plugin in the pipeline it reaches the browser verbatim, where an
// unknown at-rule is DISCARDED WHOLE, so every `--color-*` token silently
// resolves to nothing and the app renders with the fallbacks. It builds green
// either way, which is what makes this worth a paragraph.
//
// Importing it from the root route is what puts it in the SERVER-rendered <head>:
// React 19 hoists the stylesheet link out of the module graph and emits it with
// `data-precedence`, so the SSR'd document already carries
// `<link rel="stylesheet">` and there is no flash of unstyled custom elements.
import '@kitn.ai/ui/theme.tokens.css';
import '../styles.css';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '@kitn.ai/ui — TanStack Start example' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
