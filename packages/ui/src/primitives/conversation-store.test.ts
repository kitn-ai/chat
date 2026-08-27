import { describe, expect, it, beforeEach, vi } from 'vitest';
import { localStorageStore, fetchStore, byRecency } from './conversation-store';
import { isConversationUnread } from '../components/conversation-item';
import type { ChatMessage } from '../elements/chat-types';

const msg = (id: string, text: string): ChatMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});

beforeEach(() => {
  localStorage.clear();
});

describe('localStorageStore — C-7 migration', () => {
  it('promotes an existing legacy single-thread key into conversation #1 on first list()', async () => {
    // The legacy key shape from codegen.ts's emitHistorySetup: kai:{name}:{userId?}:thread
    localStorage.setItem(
      'kai:acme-support:thread',
      JSON.stringify([msg('u1', 'hello')]),
    );
    const store = localStorageStore('acme-support');
    const summaries = await store.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].messageCount).toBe(1);
    const migratedId = summaries[0].id;
    const loaded = await store.load(migratedId);
    expect(loaded).toEqual([msg('u1', 'hello')]);
    // One-way: the legacy key is gone, a second list() sees no second migration.
    expect(localStorage.getItem('kai:acme-support:thread')).toBeNull();
    const again = await store.list();
    expect(again).toHaveLength(1);
    expect(again[0].id).toBe(migratedId);
  });

  it('no legacy key: list() starts empty, nothing fabricated', async () => {
    const store = localStorageStore('acme-support');
    expect(await store.list()).toEqual([]);
  });
});

describe('localStorageStore — save/load/list round trip', () => {
  it('save() creates an index entry with a real messageCount and updatedAt; load() round-trips messages', async () => {
    const store = localStorageStore('acme-support');
    await store.save('c1', [msg('u1', 'hi'), msg('a1', 'hello there')]);
    const [summary] = await store.list();
    expect(summary.id).toBe('c1');
    expect(summary.messageCount).toBe(2);
    expect(typeof summary.updatedAt).toBe('string');
    expect(await store.load('c1')).toEqual([msg('u1', 'hi'), msg('a1', 'hello there')]);
  });

  it('per-userId namespacing keeps two users\' stores disjoint', async () => {
    const alice = localStorageStore('acme-support', 'alice');
    const bob = localStorageStore('acme-support', 'bob');
    await alice.save('c1', [msg('u1', 'alice msg')]);
    expect(await bob.list()).toEqual([]);
  });

  it('decide loudly: a corrupt index entry does not throw — list() drops it and warns', async () => {
    localStorage.setItem('kai:acme-support:threads', '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = localStorageStore('acme-support');
    expect(await store.list()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('decide loudly: a thread record that parses but is not an array warns and returns []', async () => {
    const store = localStorageStore('acme-support');
    localStorage.setItem('kai:acme-support:thread:c1', JSON.stringify({ not: 'an array' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await store.load('c1')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('happy path load() stays warn-free', async () => {
    const store = localStorageStore('acme-support');
    await store.save('c1', [msg('u1', 'hi')]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await store.load('c1')).toEqual([msg('u1', 'hi')]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// Widget-box list view (owner rework, 2026-08-26): the row preview reuses
// ConversationSummary.trailing rather than widening the type — derived from
// the LAST message's text part on every save(), truncated to ~80 chars.
describe('localStorageStore — trailing (widget-box list-view last-message preview)', () => {
  it('save() sets trailing to the last message text when it fits within ~80 chars', async () => {
    const store = localStorageStore('acme-support');
    await store.save('c1', [msg('u1', 'hi there')]);
    const [summary] = await store.list();
    expect(summary.trailing).toBe('hi there');
  });

  it('trailing tracks the LATEST message, unlike title which is fixed from the first', async () => {
    const store = localStorageStore('acme-support');
    await store.save('c1', [msg('u1', 'first question')]);
    await store.save('c1', [msg('u1', 'first question'), msg('a1', 'first answer')]);
    const [summary] = await store.list();
    expect(summary.title).toBe('first question');
    expect(summary.trailing).toBe('first answer');
  });

  it('a last message longer than 80 chars is truncated with a trailing ellipsis', async () => {
    const store = localStorageStore('acme-support');
    const long = 'x'.repeat(120);
    await store.save('c1', [msg('u1', long)]);
    const [summary] = await store.list();
    expect(summary.trailing).toHaveLength(81); // 80 chars + the ellipsis char
    expect(summary.trailing?.endsWith('…')).toBe(true);
    expect(summary.trailing?.startsWith('x'.repeat(80))).toBe(true);
  });

  it('a save() with no text part (e.g. only a card/tool part) leaves the previous trailing untouched', async () => {
    const store = localStorageStore('acme-support');
    await store.save('c1', [msg('u1', 'hi there')]);
    const nonText: ChatMessage = { id: 'a1', role: 'assistant', parts: [{ type: 'tool', tool: { type: 'search', state: 'input-available' } }] };
    await store.save('c1', [msg('u1', 'hi there'), nonText]);
    const [summary] = await store.list();
    expect(summary.trailing).toBe('hi there');
  });
});

// Unread indicators (owner round, 2026-08-26). isConversationUnread
// (conversation-item.tsx) owns the pure "updatedAt > lastReadAt" comparison
// (its own test file pins that); this describes ONLY the adapter's
// persistence half — markRead() actually writing lastReadAt, and save() no
// longer wiping it out.
describe('localStorageStore — markRead (unread indicators persistence)', () => {
  it('markRead() sets lastReadAt on the index entry', async () => {
    const store = localStorageStore('acme-support');
    await store.save('c1', [msg('u1', 'hi there')]);
    await store.markRead!('c1');
    const [summary] = await store.list();
    expect(typeof summary.lastReadAt).toBe('string');
    expect(Number.isNaN(Date.parse(summary.lastReadAt!))).toBe(false);
  });

  it('a conversation with no lastReadAt yet (never marked read) has none — the decide-loudly default applies until markRead() runs', async () => {
    const store = localStorageStore('acme-support');
    await store.save('c1', [msg('u1', 'hi there')]);
    const [summary] = await store.list();
    expect(summary.lastReadAt).toBeUndefined();
  });

  it('markRead() on an id with no index entry yet is a harmless no-op (never throws, never creates a phantom entry)', async () => {
    const store = localStorageStore('acme-support');
    await expect(store.markRead!('never-saved')).resolves.toBeUndefined();
    expect(await store.list()).toEqual([]);
  });

  it('save() carries lastReadAt forward — a message arriving to a conversation nobody is looking at must not silently wipe its read state', async () => {
    const store = localStorageStore('acme-support');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
      await store.save('c1', [msg('u1', 'hi there')]);
      await store.markRead!('c1');
      const [{ lastReadAt: markedAt }] = await store.list();
      // A second save (as if a new message just landed LATER) — the exact
      // scenario unread indicators exist for: it must NOT reset lastReadAt
      // to undefined.
      vi.setSystemTime(new Date('2026-08-26T12:05:00.000Z'));
      await store.save('c1', [msg('u1', 'hi there'), msg('a1', 'a reply')]);
      const [summary] = await store.list();
      expect(summary.lastReadAt).toBe(markedAt);
      // And the derivation now correctly reads this as unread (a real message
      // arrived after the last time anyone saw it).
      expect(isConversationUnread(summary)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('markRead() after that later save() clears the unread state (updatedAt no longer newer than lastReadAt)', async () => {
    const store = localStorageStore('acme-support');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
      await store.save('c1', [msg('u1', 'hi there')]);
      await store.markRead!('c1');
      vi.setSystemTime(new Date('2026-08-26T12:05:00.000Z'));
      await store.save('c1', [msg('u1', 'hi there'), msg('a1', 'a reply')]);
      vi.setSystemTime(new Date('2026-08-26T12:06:00.000Z'));
      await store.markRead!('c1');
      const [summary] = await store.list();
      expect(isConversationUnread(summary)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchStore', () => {
  it('has no markRead of its own — it passes through whatever lastReadAt the backend already sends, never invents a write endpoint', () => {
    const store = fetchStore('/api/conversations');
    expect(store.markRead).toBeUndefined();
  });

  it('list() GETs the index endpoint with the x-kai-user-id header when userId is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'c1', title: 'Order help', messageCount: 3, updatedAt: '2026-08-26T00:00:00Z' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const store = fetchStore('/api/conversations', 'user_123');
    const out = await store.list();
    expect(out).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-kai-user-id': 'user_123' }) }),
    );
    vi.unstubAllGlobals();
  });

  it('decide loudly: a rejected list() fetch propagates (never swallowed to [])', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const store = fetchStore('/api/conversations');
    await expect(store.list()).rejects.toThrow('offline');
    vi.unstubAllGlobals();
  });

  it('save() PUTs to /:id with JSON.stringify\'d messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const store = fetchStore('/api/conversations');
    await store.save('c1', [msg('u1', 'hi')]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations/c1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ messages: [msg('u1', 'hi')] }) }),
    );
    vi.unstubAllGlobals();
  });
});

describe('byRecency (shared comparator, issue #335)', () => {
  it('sorts newest first and pushes invalid/missing updatedAt to the end', () => {
    const rows = [
      { id: 'a', updatedAt: '2026-08-01T00:00:00Z' },
      { id: 'b', updatedAt: 'not-a-date' },
      { id: 'c', updatedAt: '2026-08-27T00:00:00Z' },
      { id: 'd', updatedAt: undefined as unknown as string },
    ];
    expect([...rows].sort(byRecency).map((r) => r.id)).toEqual(['c', 'a', 'b', 'd']);
  });
});
