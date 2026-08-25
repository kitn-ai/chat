/**
 * @kitn.ai/ui/define — the facade seam, public.
 *
 * The construct engine's GENERATED projects (and any consumer who wants to wrap
 * a pure-Solid interior as one self-registering element) import from here. Its
 * own subpath rather than ./solid because define.tsx carries ELEMENT_CSS (the
 * full compiled kit CSS) and solid-element — weight ./solid consumers must not
 * pay. SSR-safe by construction: defineWebComponent no-ops without
 * customElements (see define.tsx).
 */
export { defineWebComponent } from './define';
export type { WebComponentContext } from './define';
