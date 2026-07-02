// Root layout — a React Server Component (no 'use client' here).
//
// The kit's design tokens live in a plain stylesheet. Importing it in the
// root layout is enough; it works from a Server Component because a CSS
// import has no client-side runtime.
import '@kitn.ai/ui/theme.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: '@kitn.ai/ui — Next.js App Router example',
  description: 'Consuming the kai-* web components via the React wrappers in Next.js 15 / React 19.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: 'var(--kai-background, #fff)',
          color: 'var(--kai-foreground, #111)',
        }}
      >
        {children}
      </body>
    </html>
  );
}
