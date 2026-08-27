/**
 * The conversations data contract (C-3, C-5, C-7): a JS-property interface,
 * never REST/events baked into the format. The kit owns the interface, the
 * payload types (ConversationSummary/ConversationGroup from ../types,
 * ChatMessage from ../elements/chat-types — reused, never duplicated), and
 * the lifecycle (list() on mount + list-view open, load() on row select,
 * save() on message-array change). The dev owns invocation, retrieval,
 * transport, auth, retention.
 *
 * Two built-ins ship: localStorageStore (auto-wired for history: local) and
 * fetchStore (the recast of codegen.ts's emitHistorySetup endpoint behavior —
 * same key shapes, same x-kai-user-id header, same decide-loudly failure
 * mode, now reusable instead of inlined per-construct).
 */
import type { ConversationSummary } from '../types';
import type { ChatMessage } from '../elements/chat-types';

export interface ConversationStore {
  // `list()`/`load()` implementations MUST return a fresh array (and, for any
  // item whose content actually differs, a fresh object) on every call —
  // `ChatThread`'s conversation list and the message array it hands back
  // through `onConversationLoad` are both reference-keyed `<For>`s, and a
  // reused array/object reads as "nothing changed" (kai- contract).
  list(): Promise<ConversationSummary[]>;
  load(id: string): Promise<ChatMessage[]>;
  save(id: string, messages: ChatMessage[]): Promise<void>;
  /** OPTIONAL — unread indicators (owner round, 2026-08-26). Persist
   *  `ConversationSummary.lastReadAt` (that field's own doc has the exact
   *  shape) for `id`, called by `ChatThread` whenever that conversation
   *  counts as "seen": it's the active conversation, the chat view (not the
   *  list) is showing, and the host is open — on the select/restore
   *  transition into that state AND on every new message arriving while it
   *  holds (see `ChatThread`'s `hostOpen` prop doc for the third leg, which
   *  `ChatThread` cannot know on its own).
   *
   *  This is the concept's OPT-IN switch, not a nice-to-have: omit it and no
   *  summary this store returns ever gets a `lastReadAt`, so every unread
   *  computation reads "not unread" (that field's absent-means-not-unread
   *  default) for every conversation, always. That is a DELIBERATE decide-
   *  loudly default, not a gap — a store that never implements `markRead`
   *  is read as never supporting the concept at all, and the UI goes quiet
   *  about it rather than guessing "probably unread" from a comparison it
   *  has no real signal for. `localStorageStore` implements it below.
   *  `fetchStore` deliberately does NOT (see its own doc) — it passes
   *  through whatever `lastReadAt` the backend's own summaries carry, same
   *  as every other field on `ConversationSummary`, rather than assuming a
   *  mark-read endpoint the recast contract never defined. */
  markRead?(id: string): Promise<void>;
}

export const LEGACY_THREAD_MIGRATED_TITLE = 'Conversation 1';

/** Newest-first ordering over `updatedAt`; rows with a missing or unparsable
 *  timestamp sort last (stable, so ties keep declaration order). The ONE
 *  recency rule — the list panel, ChatThread's restore pick, and the home
 *  screen's recent card all sort with this (issue #335). */
export function byRecency(
  a: Pick<ConversationSummary, 'updatedAt'>,
  b: Pick<ConversationSummary, 'updatedAt'>,
): number {
  const at = Date.parse(a.updatedAt ?? '');
  const bt = Date.parse(b.updatedAt ?? '');
  return (Number.isNaN(bt) ? -Infinity : bt) - (Number.isNaN(at) ? -Infinity : at);
}

function threadKey(name: string, userId: string | undefined, id: string): string {
  return userId ? `kai:${name}:${userId}:thread:${id}` : `kai:${name}:thread:${id}`;
}

function indexKey(name: string, userId: string | undefined): string {
  return userId ? `kai:${name}:${userId}:threads` : `kai:${name}:threads`;
}

/** The legacy pre-conversations single-thread key (codegen.ts's emitHistorySetup). */
function legacyKey(name: string, userId: string | undefined): string {
  return userId ? `kai:${name}:${userId}:thread` : `kai:${name}:thread`;
}

/** ~80-char truncation for the row preview (`ConversationSummary.trailing`,
 *  widget-box list-view reading), an ellipsis appended only when text was
 *  actually cut. Mask nothing — the preview is the model/user's own text,
 *  same trust boundary as the rest of the thread. */
const PREVIEW_LENGTH = 80;
function truncatePreview(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PREVIEW_LENGTH) return trimmed;
  return `${trimmed.slice(0, PREVIEW_LENGTH).trimEnd()}…`;
}

export function localStorageStore(name: string, userId?: string): ConversationStore {
  const idxKey = indexKey(name, userId);

  function readIndex(): ConversationSummary[] {
    const raw = localStorage.getItem(idxKey);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('index was not an array');
      return parsed as ConversationSummary[];
    } catch {
      console.warn(`[${idxKey}] stored conversation index was corrupt; ignoring and starting fresh`);
      return [];
    }
  }

  function writeIndex(entries: ConversationSummary[]): void {
    try {
      localStorage.setItem(idxKey, JSON.stringify(entries));
    } catch {
      /* storage unavailable: this browser session runs without persistence */
    }
  }

  /** C-7, one-way: an existing legacy single-thread key becomes conversation
   *  #1 in the index. Runs at most once — the legacy key is deleted after a
   *  successful migration, so nobody's thread disappears on upgrade and no
   *  second migration can ever fire. */
  function migrateLegacyThread(): void {
    const legacy = legacyKey(name, userId);
    const raw = localStorage.getItem(legacy);
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('legacy thread was not an array');
      const messages = parsed as ChatMessage[];
      const id = crypto.randomUUID();
      localStorage.setItem(threadKey(name, userId, id), raw);
      writeIndex([
        ...readIndex(),
        {
          id,
          title: LEGACY_THREAD_MIGRATED_TITLE,
          messageCount: messages.length,
          updatedAt: new Date().toISOString(),
        },
      ]);
      localStorage.removeItem(legacy);
    } catch {
      console.warn(`[${legacy}] legacy thread was corrupt; leaving it in place, unmigrated`);
    }
  }

  return {
    async list() {
      migrateLegacyThread();
      return readIndex();
    },
    async load(id) {
      const raw = localStorage.getItem(threadKey(name, userId, id));
      if (!raw) return [];
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('stored thread was not an array');
        return parsed as ChatMessage[];
      } catch {
        console.warn(`[${threadKey(name, userId, id)}] stored thread was corrupt; starting empty`);
        return [];
      }
    },
    async save(id, messages) {
      try {
        localStorage.setItem(threadKey(name, userId, id), JSON.stringify(messages));
        const entries = readIndex();
        const now = new Date().toISOString();
        const existing = entries.find((e) => e.id === id);
        const lastText = messages.length
          ? (messages[messages.length - 1].parts.find((p) => p.type === 'text') as { text?: string } | undefined)?.text
          : undefined;
        const next: ConversationSummary = {
          id,
          title: existing?.title ?? lastText?.slice(0, 60) ?? 'New conversation',
          messageCount: messages.length,
          updatedAt: now,
          // The widget-box list view's one-line preview (Task rework,
          // 2026-08-26): unlike `title`, re-derived on EVERY save from the
          // latest message so the preview always reflects where the
          // conversation actually is, not just where it started.
          trailing: lastText ? truncatePreview(lastText) : existing?.trailing,
          // Carried forward unconditionally — save() is a CONTENT event, not
          // a viewing event, so it must never touch lastReadAt itself. Without
          // this, every save() (including one for a conversation the visitor
          // isn't even looking at) would silently wipe its lastReadAt back to
          // undefined, which reads as "not unread" (see that field's own
          // doc) — permanently hiding the exact case unread indicators exist
          // for: a message landing in a conversation nobody is currently
          // seeing. markRead() below is the only writer of this field.
          lastReadAt: existing?.lastReadAt,
        };
        writeIndex([...entries.filter((e) => e.id !== id), next]);
      } catch {
        /* storage unavailable: run in-memory for this tab's lifetime */
      }
    },
    async markRead(id) {
      try {
        const entries = readIndex();
        const idx = entries.findIndex((e) => e.id === id);
        if (idx === -1) return; // nothing to mark yet (e.g. raced ahead of save()'s first write)
        const next = [...entries];
        next[idx] = { ...next[idx], lastReadAt: new Date().toISOString() };
        writeIndex(next);
      } catch {
        /* storage unavailable: run in-memory for this tab's lifetime */
      }
    },
  };
}

/** The recast of codegen.ts's emitHistorySetup endpoint behavior: the
 *  consumer's own conversation routes. GET {url} -> ConversationSummary[];
 *  GET {url}/:id -> ChatMessage[]; PUT {url}/:id with { messages } -> stored.
 *  x-kai-user-id carries userId on every request, matching the header
 *  codegen.ts already emits for the endpoint provider and the endpoint
 *  history persistence mode. Decide loudly: no request here catches its own
 *  rejection — a caller (ChatThread's lifecycle, Task 2) decides how to
 *  degrade, exactly as the spec's degradation section requires.
 *
 *  No `markRead` (unread indicators, 2026-08-26): the recast contract above
 *  has no mark-read endpoint, and inventing a fourth request shape here
 *  would be this adapter deciding a backend behavior rather than passing one
 *  through. `list()`/`load()` already forward whatever `lastReadAt` the
 *  backend's own summaries carry, same as any other `ConversationSummary`
 *  field — a consumer who wants writes needs their own store (or their own
 *  endpoint plus a thin wrapper), same as any other capability this recast
 *  doesn't cover. */
export function fetchStore(url: string, userId?: string): ConversationStore {
  const headers: Record<string, string> = userId ? { 'x-kai-user-id': userId } : {};
  return {
    async list() {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`GET ${url} responded ${res.status}`);
      return (await res.json()) as ConversationSummary[];
    },
    async load(id) {
      const res = await fetch(`${url}/${id}`, { headers });
      if (!res.ok) throw new Error(`GET ${url}/${id} responded ${res.status}`);
      return (await res.json()) as ChatMessage[];
    },
    async save(id, messages) {
      const res = await fetch(`${url}/${id}`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) throw new Error(`PUT ${url}/${id} responded ${res.status}`);
    },
  };
}
