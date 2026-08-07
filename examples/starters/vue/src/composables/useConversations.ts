import { shallowRef, type Ref } from 'vue';
import { THREADS, newId, type Conversation } from '../chat-data';
import type { ChatController } from './useChat';

/**
 * Owns the conversation list + which one is active, plus the in-memory `THREADS`
 * stash: on select/new we swap the OPEN thread out to `THREADS` and swap the
 * picked one in. Takes the `useChat` controller so it can read the live messages
 * when stashing and reset them when loading another thread. Mirrors the React
 * `useConversations` hook.
 */
export interface ConversationsController {
  conversations: Ref<Conversation[]>;
  activeId: Ref<string>;
  selectConversation: (id: string) => void;
  newChat: () => void;
}

export function useConversations(chat: ChatController, initial: Conversation[]): ConversationsController {
  const conversations = shallowRef<Conversation[]>([...initial]);
  const activeId = shallowRef(initial[0].id);

  const selectConversation = (id: string) => {
    THREADS[activeId.value] = chat.messages.value; // stash the open thread
    activeId.value = id;
    chat.setMessages(THREADS[id] ?? []); // load the picked one
  };

  const newChat = () => {
    const id = newId();
    THREADS[activeId.value] = chat.messages.value;
    THREADS[id] = [];
    conversations.value = [
      { id, title: 'New conversation', scope: { type: 'collection' }, messageCount: 0, lastMessageAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ...conversations.value,
    ];
    activeId.value = id;
    chat.setMessages([]);
  };

  return { conversations, activeId, selectConversation, newChat };
}
