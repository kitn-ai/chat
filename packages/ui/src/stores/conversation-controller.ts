/**
 * The headless conversation controller (P-5, blocks-and-parts spec
 * 2026-08-31; spike finding F-3): the ~60 lines of drift-prone glue every
 * composed app rewired by hand around a `ConversationStore` - active-id
 * tracking, mint-id-on-first-turn (the C-6 lazy-id rule), save-per-turn,
 * auto-restore, and the three-leg "seen" rule for `markRead` - shipped ONCE,
 * framework-free, so the facade (Phase 2's `kai-chat` refactor) and every
 * block run the SAME policy instead of independently drifting copies. The
 * spike's fine-grain rebuild (research/2026-08-31-composition-spike/
 * cdn-widget-src/fine.js) is the reference glue this factory replaces.
 *
 * DISCIPLINE: plain JS closures over the `ConversationStore` contract. No
 * solid imports, no DOM, no framework - the same rule that made
 * `state.js`/`wire.js` loadable raw off a CDN in phase 2. This module ships
 * in `dist/stores.js` (the self-contained entry; `verify:cdn-entries` fails
 * the build on any bare import), so a no-bundler page reaches it by raw URL.
 *
 * THE POLICY, behavior by behavior (each pinned by its own unit test):
 *
 * - C-6 lazy id: no conversation id exists until the first message is saved.
 *   `saveTurn([])` is a no-op; the first non-empty `saveTurn` mints an id
 *   (crypto.randomUUID by default, `mintId` to override) and keeps it.
 * - Save per turn: the consumer calls `saveTurn(messages)` after each turn
 *   settles; the controller saves, refreshes the summary cache (so unread
 *   badges move even for conversations nobody is looking at), and marks the
 *   active conversation read when it is currently seen.
 * - Auto-restore: `restore()` loads the most recent conversation (byRecency,
 *   the ONE recency rule) and hands its messages to `onMessagesLoad`. Guarded:
 *   a no-op when something is already active or the store is empty. The
 *   caller decides WHEN (typically on mount, only while its own thread is
 *   still empty - the controller cannot see the caller's message array).
 * - The three-leg seen rule: a conversation counts as seen - and gets
 *   `store.markRead` called for it - only while ALL THREE legs hold: the
 *   host is open (`setOpen`), the chat view is showing (`setView('chat')`),
 *   and it is the active conversation. `seen()` exposes the derived value;
 *   each leg's transition into the seen state fires `markRead`, as does a
 *   turn arriving while seen holds. Any single missing leg suppresses it.
 * - Unread derivation: `anyUnread()` folds `isConversationUnread` (the one
 *   public read of `lastReadAt`) over the cached summaries, excluding the
 *   active conversation ONLY while it is seen - the exact rule ChatThread
 *   applies, so a message landing on the active conversation while the host
 *   is closed still raises the badge.
 * - Decide loudly: a failed `save`/`markRead`/`list` is console.error'd (or
 *   handed to `onError`) and degrades - never a silent no-op, never a throw
 *   that kills the caller's turn loop.
 */
import type { ConversationSummary } from '../types';
import type { ChatMessage } from '../elements/chat-types';
import { byRecency, isConversationUnread, type ConversationStore } from '../primitives/conversation-store';

/** The named store operations `onError` reports on. */
export type ConversationControllerOp = 'list' | 'load' | 'save' | 'markRead';

export interface ConversationControllerHooks {
  /** Receives loaded messages whenever the controller changes what the thread
   *  should show: `select` (row tap), `restore` (auto-restore), and
   *  `startNew` (an empty array with `id === undefined`). The array is a
   *  fresh reference every call (the kai- reactivity contract, satisfied at
   *  this boundary). */
  onMessagesLoad?: (messages: ChatMessage[], id: string | undefined) => void;
  /** Fires after every summary-cache refresh with the fresh, recency-sorted
   *  array - the list panel / recent-card render feed. */
  onSummariesChange?: (summaries: ConversationSummary[]) => void;
  /** Fires whenever the derived unread flag CHANGES (edge, not level) - the
   *  launcher-badge feed, mirroring ChatThread's `onUnreadChange`. */
  onUnreadChange?: (anyUnread: boolean) => void;
  /** Failure tap, replacing the default console reporting. The controller
   *  has already degraded safely by the time this fires; use it to surface
   *  the failure in-product. */
  onError?: (op: ConversationControllerOp, error: unknown) => void;
  /** Override the C-6 id mint (defaults to `crypto.randomUUID()`). */
  mintId?: () => string;
  /** The view the controller starts in (default `'chat'`). Only the value
   *  `'chat'` satisfies the chat-view leg of the seen rule; every other
   *  string (`'home'`, `'list'`, anything a block invents) does not. */
  initialView?: string;
  /** Whether the host starts open (default `true` - a full-page app has no
   *  closed state, matching ChatThread's `hostOpen !== false` default). */
  initialOpen?: boolean;
}

export interface ConversationController {
  /** The active conversation id, or `undefined` before the first turn of a
   *  new conversation mints one (C-6). */
  activeId(): string | undefined;
  /** The current view name (seen rule leg: only `'chat'` counts). */
  view(): string;
  /** Whether the host is open (seen rule leg). */
  open(): boolean;
  /** The cached summaries from the last refresh, recency-sorted. */
  summaries(): readonly ConversationSummary[];
  /** All three seen legs hold right now. */
  seen(): boolean;
  /** Any cached conversation is unread, excluding the active one only while
   *  it is seen. */
  anyUnread(): boolean;
  /** Flip the host-open leg; entering the seen state marks the active
   *  conversation read. */
  setOpen(open: boolean): Promise<void>;
  /** Set the current view; entering `'chat'` while open with an active
   *  conversation marks it read. */
  setView(view: string): Promise<void>;
  /** Load a conversation and make it active, delivering its messages through
   *  `onMessagesLoad`, then mark it read if now seen. A failed load reports
   *  and leaves the current state untouched. */
  select(id: string): Promise<void>;
  /** Start a fresh conversation: clears the active id and delivers `[]`
   *  through `onMessagesLoad`. No id exists until the first `saveTurn`. */
  startNew(): void;
  /** Auto-restore the most recent conversation. No-op when something is
   *  already active or the store is empty. Returns `true` when a
   *  conversation was restored. */
  restore(): Promise<boolean>;
  /** Persist the thread after a turn: no-op on an empty array (C-6), mints
   *  the id on the first non-empty save, saves, marks read while seen, and
   *  refreshes the summary cache. Returns the active id (or `undefined` for
   *  the empty no-op). */
  saveTurn(messages: ChatMessage[]): Promise<string | undefined>;
  /** Re-fetch `store.list()` into the summary cache (recency-sorted) and
   *  re-derive the unread flag. A failure reports and keeps the old cache. */
  refresh(): Promise<void>;
}

export function createConversationController(
  store: ConversationStore,
  hooks: ConversationControllerHooks = {},
): ConversationController {
  let activeId: string | undefined;
  let view = hooks.initialView ?? 'chat';
  let open = hooks.initialOpen ?? true;
  let summaries: ConversationSummary[] = [];
  let lastUnread: boolean | undefined;

  const report = (op: ConversationControllerOp, error: unknown): void => {
    if (hooks.onError) hooks.onError(op, error);
    else console.error(`[conversation-controller] ${op} failed.`, error);
  };

  const mintId = hooks.mintId ?? (() => crypto.randomUUID());

  const seen = (): boolean => activeId !== undefined && view === 'chat' && open;

  const anyUnread = (): boolean =>
    summaries.some((c) => c.id !== (seen() ? activeId : undefined) && isConversationUnread(c));

  /** Edge-fire the unread hook. Called after every state change that can move
   *  the derivation (summaries, the seen legs, the active id). */
  const notifyUnread = (): void => {
    const next = anyUnread();
    if (next !== lastUnread) {
      lastUnread = next;
      hooks.onUnreadChange?.(next);
    }
  };

  const refresh = async (): Promise<void> => {
    try {
      summaries = (await store.list()).slice().sort(byRecency);
      hooks.onSummariesChange?.(summaries);
    } catch (err) {
      report('list', err);
      // Degrade: keep the previous cache rather than blanking the list.
    }
    notifyUnread();
  };

  /** Fire `markRead` when (and only when) all three legs hold, then refresh
   *  so the cached `lastReadAt` moves with the persisted one. */
  const markReadIfSeen = async (): Promise<void> => {
    if (!seen() || !store.markRead) {
      notifyUnread();
      return;
    }
    const id = activeId as string;
    try {
      await store.markRead(id);
      await refresh();
    } catch (err) {
      // Degrades to "unread never clears for this conversation", not a crash.
      report('markRead', err);
      notifyUnread();
    }
  };

  const select = async (id: string): Promise<void> => {
    let messages: ChatMessage[];
    try {
      messages = await store.load(id);
    } catch (err) {
      report('load', err);
      return;
    }
    activeId = id;
    // Fresh array at the boundary (reactivity contract) - never the
    // store's own reference handed through.
    hooks.onMessagesLoad?.([...messages], id);
    await markReadIfSeen();
  };

  return {
    activeId: () => activeId,
    view: () => view,
    open: () => open,
    summaries: () => summaries,
    seen,
    anyUnread,
    select,

    async setOpen(next) {
      open = next;
      await markReadIfSeen();
    },

    async setView(next) {
      view = next;
      await markReadIfSeen();
    },

    startNew() {
      // C-6: clearing the id and the thread is enough; the id itself is
      // minted by the first non-empty saveTurn.
      activeId = undefined;
      hooks.onMessagesLoad?.([], undefined);
      notifyUnread();
    },

    async restore() {
      if (activeId !== undefined) return false;
      await refresh();
      if (summaries.length === 0) return false;
      const newest = summaries[0]; // refresh() already sorted byRecency
      await select(newest.id);
      return activeId === newest.id;
    },

    async saveTurn(messages) {
      if (messages.length === 0) return undefined; // C-6: nothing persists before the first message
      if (activeId === undefined) activeId = mintId();
      const id = activeId;
      try {
        await store.save(id, messages);
      } catch (err) {
        // The thread stays usable; this change is simply not persisted.
        report('save', err);
        notifyUnread();
        return id;
      }
      await markReadIfSeen();
      await refresh();
      return id;
    },

    refresh,
  };
}
