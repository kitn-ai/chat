import { partsToText } from '@kitn.ai/ui/state';
import type { ChatMessage } from '@kitn.ai/ui/react';

/**
 * One stored conversation. The app's own shape, deliberately NOT the shape
 * `<kai-conversations>` renders: that one is a view model (it wants
 * `scope`/`messageCount`/`lastMessageAt` and no message bodies at all), and
 * this one is the record of truth that goes to localStorage. `toRow` below is
 * the one place the two meet.
 */
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** The full thread, exactly as `<kai-chat>` takes it. */
  messages: ChatMessage[];
}

/** The row shape `<kai-conversations conversations={...}>` renders. */
export interface ConversationRow {
  id: string;
  title: string;
  scope: { type: 'collection' };
  messageCount: number;
  lastMessageAt: string;
  updatedAt: string;
}

const UNTITLED = 'New conversation';

/** First line of the first user turn, clipped. Titles are what the sidebar's
 *  built-in search matches against, so this is also the search index. */
export function deriveTitle(text: string): string {
  const firstLine = text.trim().split('\n', 1)[0]?.trim() ?? '';
  if (!firstLine) return UNTITLED;
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
}

/** A title for a conversation rehydrated without one (e.g. hand-edited storage). */
export function titleFor(conversation: Conversation): string {
  if (conversation.title) return conversation.title;
  const firstUser = conversation.messages.find((m) => m.role === 'user');
  return firstUser ? deriveTitle(partsToText(firstUser.parts)) : UNTITLED;
}

export function newConversation(id: string, title: string, first: ChatMessage): Conversation {
  const now = new Date().toISOString();
  return { id, title, createdAt: now, updatedAt: now, messages: [first] };
}

/** Project storage records onto the element's row shape. Newest first: the
 *  element does no recency bucketing or sorting of its own, it renders the
 *  array in the order it is given. */
export function toRows(conversations: Conversation[]): ConversationRow[] {
  return conversations.map((c) => ({
    id: c.id,
    title: titleFor(c),
    scope: { type: 'collection' as const },
    messageCount: c.messages.length,
    lastMessageAt: c.updatedAt,
    updatedAt: c.updatedAt,
  }));
}

export function byRecency(a: Conversation, b: Conversation): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}
