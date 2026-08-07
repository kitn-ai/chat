import { signal, type WritableSignal } from '@angular/core';
import type { ChatMessage } from '@kitn.ai/ui';
import {
  appendMessage,
  createAssistantStream,
  onStreamSettled,
  type SetMessages,
  type AssistantStream,
} from '@kitn.ai/ui/state';

/**
 * Angular port of the kit's `useKaiChat` (a React hook), built on the SAME
 * framework-neutral state core (`@kitn.ai/ui/state`) the React hook uses. It owns
 * the message array + the `loading` flag and exposes ergonomic ops. Swap
 * `streamFakeReply` for a real model call to ship a real app.
 *
 * `messages` is a plain Angular signal: every op assigns a BRAND-NEW array
 * reference (`messages.set(updater(prev))`), which is exactly what re-renders
 * `<kai-thread>` when the template re-binds `[messages]` — mutating the array in
 * place does not. Signals also keep the array plain (no proxy), so what reaches the
 * element's `messages` property is a clean `ChatMessage[]`.
 */
export interface ChatStore {
  messages: WritableSignal<ChatMessage[]>;
  loading: WritableSignal<boolean>;
  append: (msg: ChatMessage) => void;
  setMessages: (next: ChatMessage[]) => void;
  streamAssistant: (init?: Partial<ChatMessage>) => AssistantStream;
}

export function createChat(initialMessages: ChatMessage[] = []): ChatStore {
  const messages = signal<ChatMessage[]>([...initialMessages]);
  const loading = signal(false);

  // The one universal contract the state core drives: a functional-updater setter
  // (React setState shape) that assigns a fresh array each time.
  const set: SetMessages = (updater) => messages.set(updater(messages()));

  const append = (msg: ChatMessage) => set((prev) => appendMessage(prev, msg));
  const setMessages = (next: ChatMessage[]) => messages.set([...next]);
  const streamAssistant = (init?: Partial<ChatMessage>): AssistantStream => {
    loading.set(true);
    return onStreamSettled(createAssistantStream(set, init), () => loading.set(false));
  };

  return { messages, loading, append, setMessages, streamAssistant };
}
