import { THREADS, newId, type Conversation } from '../chat-data';
import type { ChatController } from './chat.svelte';

/**
 * Owns the conversation list + which one is active, plus the in-memory `THREADS`
 * stash: on select/new we swap the OPEN thread out to `THREADS` and swap the
 * picked one in. Takes the `createChat` controller so it can read the live messages
 * when stashing and reset them when loading another thread. Mirrors the React /
 * Vue `useConversations`.
 */
export interface ConversationsController {
  readonly conversations: Conversation[];
  readonly activeId: string;
  selectConversation: (id: string) => void;
  newChat: () => void;
}

export function createConversations(chat: ChatController, initial: Conversation[]): ConversationsController {
  let conversations = $state<Conversation[]>([...initial]);
  let activeId = $state(initial[0].id);

  const selectConversation = (id: string) => {
    THREADS[activeId] = chat.messages; // stash the open thread
    activeId = id;
    chat.setMessages(THREADS[id] ?? []); // load the picked one
  };

  const newChat = () => {
    const id = newId();
    THREADS[activeId] = chat.messages;
    THREADS[id] = [];
    conversations = [
      { id, title: 'New conversation', scope: { type: 'collection' }, messageCount: 0, lastMessageAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ...conversations,
    ];
    activeId = id;
    chat.setMessages([]);
  };

  return {
    get conversations() { return conversations; },
    get activeId() { return activeId; },
    selectConversation,
    newChat,
  };
}
