import type { ChatMessage, MessagePart } from '@kitn.ai/ui/react';
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
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** A part is kept only if it is one of the closed union's variants and carries
 *  that variant's payload. An unknown `type` is dropped rather than passed on:
 *  the element switches on it and has no branch for a made-up one. */
function isMessagePart(v: unknown): v is MessagePart {
  if (!isRecord(v) || typeof v.type !== 'string') return false;
  switch (v.type) {
    case 'text':
    case 'reasoning':
      return typeof v.text === 'string';
    case 'tool':
      return isRecord(v.tool);
    case 'card':
      return isRecord(v.envelope) && typeof v.envelope.type === 'string' && typeof v.envelope.id === 'string';
    case 'source':
      return isRecord(v.source);
    case 'file':
      return isRecord(v.attachment);
    default:
      return false;
  }
}

function parseMessage(v: unknown): ChatMessage | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== 'string' || (v.role !== 'user' && v.role !== 'assistant')) return null;
  if (!Array.isArray(v.parts)) return null;
  const parts = v.parts.filter(isMessagePart);
  // A message whose every part was unreadable is an empty bubble; drop it.
  if (parts.length === 0) return null;
  const message: ChatMessage = { id: v.id, role: v.role, parts };
  if (v.feedback === 'like' || v.feedback === 'dislike') message.feedback = v.feedback;
  return message;
}

function parseConversation(v: unknown): Conversation | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== 'string' || !v.id) return null;
  if (!Array.isArray(v.messages)) return null;
  const messages = v.messages.map(parseMessage).filter((m): m is ChatMessage => m !== null);
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
    const dropped = parsed.length - conversations.length;
    if (dropped > 0) console.warn(`[storage] dropped ${dropped} unreadable conversation record(s)`);
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
