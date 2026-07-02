import { useCallback, useState } from 'react';
import type { KaiChatController } from '@kitn.ai/ui/react';
import { THREADS, newId, type Conversation } from '../chat-data';

/**
 * Owns the conversation list + which one is active, plus the in-memory `THREADS`
 * stash: on select/new we swap the OPEN thread out to `THREADS` and swap the picked
 * one in. Takes the `useKaiChat` controller so it can read the live messages when
 * stashing and reset them when loading another thread.
 */
export function useConversations(chat: KaiChatController, initial: Conversation[]) {
  const [conversations, setConversations] = useState<Conversation[]>(initial);
  const [activeId, setActiveId] = useState(initial[0].id);

  const selectConversation = useCallback(
    (id: string) => {
      THREADS[activeId] = chat.messages; // stash the open thread
      setActiveId(id);
      chat.setMessages(THREADS[id] ?? []); // load the picked one
    },
    [activeId, chat],
  );

  const newChat = useCallback(() => {
    const id = newId();
    THREADS[activeId] = chat.messages;
    THREADS[id] = [];
    setConversations((cs) => [
      { id, title: 'New conversation', scope: { type: 'collection' }, messageCount: 0, lastMessageAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ...cs,
    ]);
    setActiveId(id);
    chat.setMessages([]);
  }, [activeId, chat]);

  return { conversations, activeId, selectConversation, newChat };
}
