// src/state/threads.ts — the thread-switching fold.
//
// The identity category from the workspace glue inventory (spec §1/§3b): an
// id-bound `SetMessages`, per-thread loading state, the abort map, and
// delete-under-stream safety. Pure folds + callbacks per the state charter —
// no fetch, no DOM, no storage; the only state a helper here owns is the
// irreducible kind (which turns are in flight), never the consumer's records.
import type { ChatMessage } from '../elements/chat-types';
import type { SetMessages } from './stream';

/** The minimal thread record the fold needs. The consumer's own record type
 *  (title, timestamps, whatever its storage keeps) extends this — those fields
 *  are policy and stay outside the kit. */
export interface ThreadLike {
  id: string;
  messages: ChatMessage[];
}

/** The functional-updater setter over the whole thread LIST — the same
 *  React-setState shape `SetMessages` is, one level up. */
export type SetThreads<T extends ThreadLike> = (updater: (prev: T[]) => T[]) => void;

export interface BindThreadOptions<T extends ThreadLike> {
  /** Stamp the changed record (e.g. `updatedAt`). Runs on a hit only. Kept a
   *  callback because WHAT gets stamped — and with whose clock — is the
   *  consumer's record shape, not ours. */
  touch?: (thread: T) => T;
  /** A delta arrived for a thread that is no longer in the list (deleted while
   *  its reply was streaming). The delta is dropped either way — dropping is
   *  the only correct fold — but the drop is reported, not silent. */
  onDrop?: (threadId: string) => void;
}

/**
 * Pure fold: apply `updater` to the messages of thread `id` within a list.
 *
 * reactivity-two-halves (CLAUDE.md): the hit gets a NEW containing array
 * (which notifies) and a NEW record object (which makes the change visible);
 * every other record keeps its reference. A MISS returns `threads` itself —
 * the same reference — so a late delta for a deleted thread re-renders
 * nothing and resurrects nothing.
 */
export function updateThreadMessages<T extends ThreadLike>(
  threads: T[],
  id: string,
  updater: (prev: ChatMessage[]) => ChatMessage[],
  opts: BindThreadOptions<T> = {},
): T[] {
  let hit = false;
  const next = threads.map((t) => {
    if (t.id !== id) return t;
    hit = true;
    const updated = { ...t, messages: updater(t.messages) };
    return opts.touch ? opts.touch(updated) : updated;
  });
  if (!hit) {
    opts.onDrop?.(id);
    return threads;
  }
  return next;
}

/**
 * A `SetMessages` bound to ONE thread. Capture the id when the user hits send
 * and hand the result to `createAssistantStream`: the reply then lands in the
 * thread that was open at send time, never whichever one is open when the
 * tokens arrive — which is what makes switching away mid-reply (and coming
 * back to a finished answer) safe.
 */
export function bindThreadMessages<T extends ThreadLike>(
  setThreads: SetThreads<T>,
  id: string,
  opts: BindThreadOptions<T> = {},
): SetMessages {
  return (updater) => {
    setThreads((prev) => updateThreadMessages(prev, id, updater, opts));
  };
}

/** The in-flight-turn bookkeeping for a multi-thread app: which threads are
 *  streaming, and the AbortController for each. See `createThreadSessions`. */
export interface ThreadSessions {
  /** Register a new in-flight turn. One turn per thread: a prior in-flight
   *  turn for the SAME thread is aborted first. Pass the returned controller's
   *  `signal` to your fetch — the fetch line itself stays yours. */
  begin(threadId: string): AbortController;
  /** The turn settled (done or failed) — call from your `finally`. `controller`
   *  is required so a slow old turn's cleanup cannot clear a newer turn that
   *  has since begun on the same thread: a stale controller is a no-op. */
  end(threadId: string, controller: AbortController): void;
  /** Cancel the in-flight turn (the delete-under-stream story): aborts the
   *  controller and clears the streaming state. Returns whether anything was
   *  actually in flight. Pair it with the id-bound sink above, which drops any
   *  deltas that were already past the abort. */
  abort(threadId: string): boolean;
  isStreaming(threadId: string): boolean;
  /** A fresh array snapshot each call — safe to hand straight to a setState. */
  streamingIds(): string[];
}

/**
 * Create the session tracker. `onChange` fires with a fresh `streamingIds()`
 * snapshot after every transition — mirror it into your framework's state to
 * derive `loading` (`sessions.isStreaming(activeId)` is the per-thread flag a
 * single boolean cannot be, because a stream keeps running when you switch
 * away).
 *
 * This is the one stateful object in the module, because an abort map is
 * irreducibly stateful; it still does no I/O and owns no timer.
 */
export function createThreadSessions(onChange?: (streamingIds: string[]) => void): ThreadSessions {
  const inFlight = new Map<string, AbortController>();
  const snapshot = () => Array.from(inFlight.keys());
  const notify = () => onChange?.(snapshot());

  return {
    begin(threadId) {
      inFlight.get(threadId)?.abort();
      const controller = new AbortController();
      inFlight.set(threadId, controller);
      notify();
      return controller;
    },
    end(threadId, controller) {
      if (inFlight.get(threadId) !== controller) return;
      inFlight.delete(threadId);
      notify();
    },
    abort(threadId) {
      const controller = inFlight.get(threadId);
      if (!controller) return false;
      controller.abort();
      inFlight.delete(threadId);
      notify();
      return true;
    },
    isStreaming(threadId) {
      return inFlight.has(threadId);
    },
    streamingIds: snapshot,
  };
}
