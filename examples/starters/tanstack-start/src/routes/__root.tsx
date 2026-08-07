import type { ReactNode } from 'react';
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router';

// The kit's design tokens. Importing it in the root document means it's part of
// the SSR'd `<head>` so there's no flash of unstyled custom elements.
import '@kitn.ai/ui/theme.css';

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
        <style>{`
          body {
            margin: 0;
            font-family: system-ui, -apple-system, sans-serif;
            background: var(--kai-background, #fff);
            color: var(--kai-foreground, #111);
          }
          main { max-width: 56rem; margin: 0 auto; padding: 2rem 1.5rem; }
          h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
          .lede { color: var(--kai-muted-foreground, #666); margin: 0 0 1.5rem; }
          .row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 2rem; }
          .panes { display: grid; grid-template-columns: 16rem 1fr; height: 28rem; border: 1px solid var(--kai-border, #e5e5e5); border-radius: 0.75rem; overflow: hidden; }
          .panes > * { min-width: 0; min-height: 0; }
          .pane-rail { border-right: 1px solid var(--kai-border, #e5e5e5); }
        `}</style>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
