import { createSignal, type Accessor } from 'solid-js';
import type { ConversationSummary } from '@kitn.ai/ui/solid';
import { THREADS, newId } from '../chat-data';
import type { ChatController } from './chat';

/**
 * Owns the conversation list + which one is active, plus the in-memory `THREADS`
 * stash: on select/new we swap the OPEN thread out to `THREADS` and swap the
 * picked one in. Takes the `createChat` controller so it can read the live
 * messages when stashing and reset them when loading another thread. Mirrors the
 * React/Vue `useConversations` and the Svelte `createConversations`.
 */
export interface ConversationsController {
  conversations: Accessor<ConversationSummary[]>;
  activeId: Accessor<string>;
  selectConversation: (id: string) => void;
  newChat: () => void;
}

export function createConversations(
  chat: ChatController,
  initial: ConversationSummary[],
): ConversationsController {
  const [conversations, setConversations] = createSignal<ConversationSummary[]>([...initial]);
  const [activeId, setActiveId] = createSignal(initial[0].id);

  const selectConversation = (id: string) => {
    THREADS[activeId()] = chat.messages(); // stash the open thread
    setActiveId(id);
    chat.setMessages(THREADS[id] ?? []); // load the picked one
  };

  const newChat = () => {
    const id = newId();
    THREADS[activeId()] = chat.messages();
    THREADS[id] = [];
    setConversations((prev) => [
      {
        id,
        title: 'New conversation',
        groupId: 'today',
        scope: { type: 'document' },
        messageCount: 0,
        lastMessageAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setActiveId(id);
    chat.setMessages([]);
  };

  return { conversations, activeId, selectConversation, newChat };
}
