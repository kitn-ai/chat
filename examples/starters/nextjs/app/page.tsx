// This page is a React Server Component (NO 'use client' here) — the App Router
// default, and the shape the kit is meant to be consumed in.
//
// The chat workspace itself is the client island next door, `app/workspace.tsx`.
// It carries the directive because IT uses hooks and event-handler props — the
// standard RSC rule. Rendering a kai wrapper does NOT need one: the wrappers in
// `@kitn.ai/ui/react` ship their own `'use client'` banner, so they are already
// client components and a Server Component can render them like any other.
//
// So the whole page still prerenders on the server: this component runs there,
// the island is prerendered to HTML there too, and the browser gets a document
// with bare `<kai-*>` tags in it. `app/workspace.tsx` explains what that proves.
import { Workspace } from './workspace';

export default function HomePage() {
  return <Workspace />;
}
