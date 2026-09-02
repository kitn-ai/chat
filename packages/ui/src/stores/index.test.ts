/**
 * The `@kitn.ai/ui/stores` entry, imported STANDALONE — the exact usage the
 * entry exists for (a no-bundler page that cannot load the solid-importing
 * root bundle; see this entry's own header for the spike that found it).
 * Behavioral depth for the stores lives in
 * src/primitives/conversation-store.test.ts; this file pins the ENTRY: that
 * it resolves on its own, that it carries every store export the root does
 * (so the two surfaces cannot drift apart), and that what it hands out
 * actually works. The bare-import-free-ARTIFACT half of the contract is
 * scripts/verify-cdn-entries.mjs (postbuild), which this jsdom test cannot
 * see.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import * as stores from './index';
import type { ChatMessage } from '../elements/chat-types';
import type { ConversationSummary } from './index';

beforeEach(() => {
  localStorage.clear();
});

describe('@kitn.ai/ui/stores entry', () => {
  it('exports the full store surface', () => {
    expect(typeof stores.localStorageStore).toBe('function');
    expect(typeof stores.fetchStore).toBe('function');
    expect(typeof stores.byRecency).toBe('function');
    expect(typeof stores.isConversationUnread).toBe('function');
    expect(typeof stores.LEGACY_THREAD_MIGRATED_TITLE).toBe('string');
  });

  it('cannot drift from the root export: every store value the root barrel re-exports is here', async () => {
    // The root re-exports these same names from primitives/conversation-store
    // (src/index.ts). Compare against that module directly — same source both
    // surfaces re-export — so adding an export there without surfacing it
    // here fails this test by name.
    const source = await import('../primitives/conversation-store');
    for (const name of Object.keys(source)) {
      expect(stores, `"${name}" exported by conversation-store but missing from @kitn.ai/ui/stores`).toHaveProperty(name);
    }
  });

  it('a store constructed from this entry round-trips save/list/load', async () => {
    const store = stores.localStorageStore('cdn-entry-test');
    const messages: ChatMessage[] = [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hello from the CDN path' }] }];
    await store.save('c1', messages);
    const summaries = await store.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].id).toBe('c1');
    expect(await store.load('c1')).toEqual(messages);
  });

  it('exports the ConversationSummary type its own controller hands back', () => {
    // A TYPE assertion, so the red lives in `tsc --noEmit`, not in vitest:
    // vitest strips types without checking them and this body would pass
    // against a missing export. `ConversationSummary` is what list() returns
    // and what onSummariesChange is called with, and it shipped only through
    // the root entry -- whose bundle bare-imports solid-js -- so a controller on
    // this entry had to import @kitn.ai/ui for a type its own dependency
    // already hands it (blocks contract spike, F-10).
    const summary: ConversationSummary = {
      id: 'c1',
      title: 'Hello',
      messageCount: 1,
      updatedAt: '2026-09-02T00:00:00Z',
    };
    expect(summary.id).toBe('c1');
  });
});
