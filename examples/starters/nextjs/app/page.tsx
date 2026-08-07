// This page is a React Server Component (NO 'use client' here) — the App Router
// default.
//
// ★ KEY TEST: it imports a kai React wrapper and renders <Button> DIRECTLY from
// this Server Component, with no 'use client' directive of its own. That works
// because the wrappers ship their own `'use client'` banner — they are client
// components, so a Server Component can render them just like any other client
// component. The consumer does NOT need to add `'use client'` to render a wrapper.
//
// (You only need your OWN `'use client'` when YOUR component uses hooks, state,
// or event-handler props — see app/InteractiveIsland.tsx. That's a standard
// React Server Component rule, not a kit requirement.)
import { Button } from '@kitn.ai/ui/react';
import InteractiveIsland from './InteractiveIsland';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>@kitn.ai/ui in Next.js</h1>
      <p style={{ marginTop: 0, opacity: 0.7 }}>
        Next.js 15 App Router · React 19 · the kai-* web components via the typed{' '}
        <code>@kitn.ai/ui/react</code> wrappers.
      </p>

      {/* Rendered straight from this Server Component — no consumer 'use client'. */}
      <p style={{ marginBottom: '1.5rem' }}>
        <Button variant="outline">Rendered in a Server Component</Button>
      </p>

      <InteractiveIsland />
    </main>
  );
}
