// src/state/persistence.ts — the mechanical halves of the persistence story.
//
// The boundary (spec §1, CLAUDE.md): persistence POLICY — what is stored,
// where, for how long, under what quota — is the app's. What lives here is
// only the mechanics every such app re-derives by hand: validating a stored
// thread back into `ChatMessage[]` (F-18), and the debounce/flush shape that
// keeps a per-token stream from hitting storage per token. No storage call,
// no fetch, no DOM; the save fn, the delay, and the reaction to a drop are
// all the consumer's.
import type { ChatMessage, FeedbackVote, MessagePart } from '../elements/chat-types';

/** One record the parse refused, and why. Deciding loudly is the caller's
 *  verb (warn, reject the whole record, count it); this is the information
 *  that a quiet version would withhold. */
export interface DroppedStored {
  at: 'thread' | 'message' | 'part';
  reason: string;
  value: unknown;
}

export interface ParsedThread {
  messages: ChatMessage[];
  /** Empty on a clean parse. Never silently shorter output than input. */
  dropped: DroppedStored[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * One payload check per `MessagePart` variant. The key set is DERIVED from the
 * union in `src/elements/chat-types.ts` at compile time: `satisfies
 * Record<MessagePart['type'], …>` makes a missing key (a 7th variant landed)
 * and a stale key (a variant renamed away) each a type error in THIS file —
 * the same union `lint:silent-drops` and `verify:scaffold` read, so the lists
 * cannot disagree. The behavioral cross-check lives in ./persistence.test.ts,
 * which re-reads the union by a deliberately different method.
 *
 * These are shape checks, not a trust boundary for rendering: a rehydrated
 * part is model output twice over (it was model output before it was
 * hand-editable storage), and it stays safe to draw because the elements are
 * what draw it. What this buys is that a truncated or half-written record
 * reaches the element as a well-formed thread minus the broken piece, instead
 * of as `parts: undefined` taking the whole app down on first render.
 */
const PART_VALIDATORS = {
  text: (v) => typeof v.text === 'string',
  reasoning: (v) => typeof v.text === 'string',
  tool: (v) => isRecord(v.tool),
  card: (v) => isRecord(v.envelope) && typeof v.envelope.type === 'string' && typeof v.envelope.id === 'string',
  source: (v) => isRecord(v.source),
  file: (v) => isRecord(v.attachment),
} satisfies Record<MessagePart['type'], (v: Record<string, unknown>) => boolean>;

function parsePart(v: unknown, dropped: DroppedStored[]): MessagePart | null {
  if (!isRecord(v) || typeof v.type !== 'string') {
    dropped.push({ at: 'part', reason: 'not a part record', value: v });
    return null;
  }
  const validate = (PART_VALIDATORS as Record<string, (v: Record<string, unknown>) => boolean>)[v.type];
  if (!validate) {
    // An unknown `type` is dropped rather than passed on: every renderer and
    // encoder switches on it and has no branch for a made-up one.
    dropped.push({ at: 'part', reason: `unknown part type "${v.type}"`, value: v });
    return null;
  }
  if (!validate(v)) {
    dropped.push({ at: 'part', reason: `missing or invalid payload for "${v.type}" part`, value: v });
    return null;
  }
  // Verbatim, not rebuilt: optional fields the variants carry (`raw`,
  // `signature`, `index`, …) are load-bearing on the wire re-encode, so the
  // validated record passes through whole.
  return v as unknown as MessagePart;
}

function parseMessage(v: unknown, dropped: DroppedStored[]): ChatMessage | null {
  if (!isRecord(v) || typeof v.id !== 'string' || (v.role !== 'user' && v.role !== 'assistant') || !Array.isArray(v.parts)) {
    dropped.push({ at: 'message', reason: 'not a message record (id/role/parts)', value: v });
    return null;
  }
  const parts = v.parts
    .map((p) => parsePart(p, dropped))
    .filter((p): p is MessagePart => p !== null);
  if (parts.length === 0) {
    // A message whose every part was unreadable is an empty bubble, and the
    // per-part entries above already say what was lost.
    dropped.push({ at: 'message', reason: 'no readable parts survived', value: v });
    return null;
  }
  const message: ChatMessage = { id: v.id, role: v.role, parts };
  if (v.feedback === 'like' || v.feedback === 'dislike') message.feedback = v.feedback as FeedbackVote;
  if (isRecord(v.avatar)) message.avatar = v.avatar;
  if (Array.isArray(v.actions)) message.actions = v.actions as ChatMessage['actions'];
  return message;
}

/**
 * Validate a stored thread — the JSON-parsed value of one thread's messages
 * array — back into `ChatMessage[]`. Never throws: unreadable records are
 * DROPPED and reported in `dropped`, so a truncated write loses one record,
 * not every conversation. What to DO about a drop (warn, discard the whole
 * record, telemetry) is the caller's policy.
 */
export function parseStoredThread(value: unknown): ParsedThread {
  const dropped: DroppedStored[] = [];
  if (!Array.isArray(value)) {
    return { messages: [], dropped: [{ at: 'thread', reason: 'stored thread is not an array', value }] };
  }
  const messages = value
    .map((m) => parseMessage(m, dropped))
    .filter((m): m is ChatMessage => m !== null);
  return { messages, dropped };
}

export interface SaveSchedulerOptions {
  /** The quiet period before a scheduled snapshot is written. This is policy
   *  and therefore REQUIRED — the kit ships no default debounce. */
  delayMs: number;
  /** The scheduler the seam runs on. Defaults to the global timers; inject
   *  your own for tests or a non-timer scheduler. */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface SaveScheduler<T> {
  /** Remember `snapshot` as the latest state and (re)start the quiet-period
   *  timer. Call it on every state change; only the last snapshot inside the
   *  quiet period is written. */
  schedule(snapshot: T): void;
  /** Write the pending snapshot NOW and disarm the timer — the
   *  `beforeunload`/`visibilitychange` story, so a tab closed mid-stream still
   *  persists. No-op when nothing is pending: the last write already happened. */
  flush(): void;
  /** Drop the pending write unsaved (e.g. unmount-without-persist). */
  cancel(): void;
  pending(): boolean;
}

/**
 * The debounce/flush seam: a streaming reply lands a state update per token,
 * and without this shape so would the consumer's storage backend. The kit owns
 * only the timer dance; `save` (WHAT and WHERE, including its own try/catch
 * policy for quota errors) and `delayMs` (HOW LONG) are the consumer's.
 */
export function createSaveScheduler<T>(save: (snapshot: T) => void, opts: SaveSchedulerOptions): SaveScheduler<T> {
  const setTimer = opts.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let latest: T | undefined;
  let armed = false;
  let handle: unknown;

  const disarm = () => {
    if (!armed) return;
    clearTimer(handle);
    armed = false;
  };
  const write = () => {
    armed = false;
    save(latest as T);
  };

  return {
    schedule(snapshot) {
      latest = snapshot;
      disarm();
      handle = setTimer(write, opts.delayMs);
      armed = true;
    },
    flush() {
      if (!armed) return;
      disarm();
      save(latest as T);
    },
    cancel: disarm,
    pending: () => armed,
  };
}
