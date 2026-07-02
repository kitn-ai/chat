import { signal, type WritableSignal } from '@angular/core';
import { THREADS, newId, type Conversation } from '../../chat-data';
import type { ChatStore } from './chat.store';

/**
 * Owns the conversation list + which one is active, plus the in-memory `THREADS`
 * stash: on select/new we swap the OPEN thread out to `THREADS` and swap the picked
 * one in. Takes the `createChat` store so it can read the live messages when
 * stashing and reset them when loading another thread. Mirrors the Vue/React
 * `useConversations`.
 */
export interface ConversationsStore {
  conversations: WritableSignal<Conversation[]>;
  activeId: WritableSignal<string>;
  selectConversation: (id: string) => void;
  newChat: () => void;
}

export function createConversations(chat: ChatStore, initial: Conversation[]): ConversationsStore {
  const conversations = signal<Conversation[]>([...initial]);
  const activeId = signal(initial[0].id);

  const selectConversation = (id: string) => {
    THREADS[activeId()] = chat.messages(); // stash the open thread
    activeId.set(id);
    chat.setMessages(THREADS[id] ?? []); // load the picked one
  };

  const newChat = () => {
    const id = newId();
    THREADS[activeId()] = chat.messages();
    THREADS[id] = [];
    conversations.set([
      { id, title: 'New conversation', scope: { type: 'collection' }, messageCount: 0, lastMessageAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ...conversations(),
    ]);
    activeId.set(id);
    chat.setMessages([]);
  };

  return { conversations, activeId, selectConversation, newChat };
}
