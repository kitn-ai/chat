import type { ChatMessage, MessagePart } from '../elements/chat-types';
import { appendTextPart } from './parts';

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'kai-' + Math.random().toString(36).slice(2);
}

/** Convenience for the common single-text-part message. */
export function textMessage(role: ChatMessage['role'], text: string, init: Partial<ChatMessage> = {}): ChatMessage {
  return { id: init.id ?? newId(), role, parts: [{ type: 'text', text }], ...init };
}

/** Concatenates every text part. Use where a plain string is genuinely needed
 *  (copy-to-clipboard, TTS, a length check). Do NOT use it for rendering. */
export function partsToText(parts: MessagePart[]): string {
  return parts.filter((p) => p.type === 'text').map((p) => p.text).join('');
}

/** Append a message; returns a new array. */
export function appendMessage(messages: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  return [...messages, msg];
}

/** Replace a same-id message, or append when absent. */
export function upsertMessage(messages: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const i = messages.findIndex((x) => x.id === msg.id);
  if (i === -1) return [...messages, msg];
  const next = messages.slice();
  next[i] = msg;
  return next;
}

/** Patch the matched message (object patch or updater). Untouched items keep their reference. */
export function updateMessage(
  messages: ChatMessage[],
  id: string,
  patch: Partial<ChatMessage> | ((m: ChatMessage) => ChatMessage),
): ChatMessage[] {
  return messages.map((x) =>
    x.id === id ? (typeof patch === 'function' ? patch(x) : { ...x, ...patch }) : x,
  );
}

/** Remove the matched message. */
export function removeMessage(messages: ChatMessage[], id: string): ChatMessage[] {
  return messages.filter((x) => x.id !== id);
}

/** Streaming primitive: append `delta` onto the matched message's trailing text part. */
export function appendText(messages: ChatMessage[], id: string, delta: string): ChatMessage[] {
  return messages.map((x) => (x.id === id ? { ...x, parts: appendTextPart(x.parts, delta) } : x));
}
