/**
 * `@kitn.ai/ui/stores` — the built-in `ConversationStore` implementations
 * (`localStorageStore`, `fetchStore`) plus the contract and the headless
 * helpers that read its fields, as a SELF-CONTAINED entry (dist/stores.js,
 * zero bare imports).
 *
 * WHY THIS ENTRY EXISTS (2026-08-31 composition spike, phase 2 —
 * docs/superpowers/research/2026-08-31-composition-spike/phase2-cdn.md):
 * the stores are plain solid-free glue, but they shipped only through the
 * package root, whose bundle bare-imports `solid-js`. A no-bundler CDN page
 * loading dist/index.js by raw URL therefore failed with "Failed to resolve
 * module specifier 'solid-js'", and the one thing the `<kai-chat>` `store`
 * prop's JSDoc promises — "Two built-ins ship" — was unreachable on exactly
 * the no-build path; the spike had to hand-roll a ~45-line store.
 *
 * WHY NOT `@kitn.ai/ui/state`: that entry is the I/O-free pure-fold layer
 * (functions over ChatMessage[], no side effects). Stores are I/O by
 * definition — localStorage and fetch — so they get their own subpath,
 * built exactly the way state/wire are (vite.config.stores.ts, solid-js
 * external and absent, verified solid-free by verify:cdn-entries).
 *
 * The package root re-exports everything here unchanged (src/index.ts), so
 * bundler consumers importing from '@kitn.ai/ui' are untouched; this entry
 * is the same module surfaced where a raw-URL consumer can reach it:
 *
 *   import { localStorageStore } from 'https://cdn.jsdelivr.net/npm/@kitn.ai/ui/dist/stores.js';
 */
export {
  localStorageStore,
  fetchStore,
  byRecency,
  isConversationUnread,
  LEGACY_THREAD_MIGRATED_TITLE,
} from '../primitives/conversation-store';
export type { ConversationStore } from '../primitives/conversation-store';
