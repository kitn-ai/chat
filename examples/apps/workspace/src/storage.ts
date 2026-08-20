import { parseStoredThread } from '@kitn.ai/ui/state';
import type { Conversation } from './conversations';

const STORAGE_KEY = 'kai-chat-workspace/v1';
const ACTIVE_KEY = 'kai-chat-workspace/v1:active';

/**
 * Everything below is a shape check, not a trust boundary for rendering.
 *
 * localStorage is hand-editable and every `parts` entry in it started life as
 * model output, so a rehydrated thread is untrusted input twice over. Rendering
 * it stays safe because `<kai-chat>` is the only thing that draws it and the kit
 * escapes model text — this app never puts a stored string into innerHTML, an
 * href or a src. What validation buys here is different and still worth having:
 * a truncated or half-written record would otherwise reach the element as
 * `parts: undefined` and take the whole app down on first render, losing every
 * OTHER conversation with it. So an unreadable record is DROPPED, loudly, and
 * the readable ones survive.
 *
 * The MESSAGE half of that check is the kit's now: `parseStoredThread`
 * validates each stored message back into `ChatMessage[]` with the MessagePart
 * variant list DERIVED from the union (this file used to hand-type it, which is
 * exactly how a seventh variant would have silently stopped rehydrating), and
 * REPORTS what it dropped. The verb — warn, discard the record, telemetry — and
 * every conversation-level field below stay this app's own.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parseConversation(v: unknown): Conversation | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== 'string' || !v.id) return null;
  // A record whose messages are not even an array is unreadable wholesale —
  // dropping it (rather than keeping an empty shell) is this app's policy.
  if (!Array.isArray(v.messages)) return null;
  const { messages, dropped } = parseStoredThread(v.messages);
  if (dropped.length > 0) {
    console.warn(`[storage] dropped ${dropped.length} unreadable stored entr${dropped.length === 1 ? 'y' : 'ies'}`, dropped);
  }
  const now = new Date().toISOString();
  return {
    id: v.id,
    title: typeof v.title === 'string' ? v.title : '',
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : now,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : now,
    messages,
  };
}

export function loadConversations(): Conversation[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private-mode Safari and a blocked third-party context both throw on
    // access, not on write. No storage is a working app with no history.
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const conversations = parsed.map(parseConversation).filter((c): c is Conversation => c !== null);
    const droppedRecords = parsed.length - conversations.length;
    if (droppedRecords > 0) console.warn(`[storage] dropped ${droppedRecords} unreadable conversation record(s)`);
    return conversations;
  } catch (err) {
    console.warn('[storage] history could not be parsed and was ignored', err);
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (err) {
    // QuotaExceededError is the realistic one. Say so once rather than throwing
    // out of a render-time effect and taking the thread down mid-stream.
    console.warn('[storage] history could not be saved', err);
  }
}

export function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* see saveConversations */
  }
}
