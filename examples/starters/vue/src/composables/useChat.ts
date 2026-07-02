import { ref, shallowRef, type Ref } from 'vue';
import type { ChatMessage } from '@kitn.ai/ui';
import {
  appendMessage,
  createAssistantStream,
  onStreamSettled,
  type SetMessages,
  type AssistantStream,
} from '@kitn.ai/ui/state';

/**
 * Vue port of the kit's `useKaiChat` (a React hook), built on the SAME
 * framework-neutral state core (`@kitn.ai/ui/state`) the React hook uses. It owns
 * the message array + the `loading` flag and exposes ergonomic ops. Swap
 * `streamFakeReply` for a real model call to ship a real app.
 *
 * `messages` is a `shallowRef` on purpose: every op assigns a BRAND-NEW array
 * reference (`messages.value = updater(prev)`), which is exactly what re-renders
 * `<kai-thread>` — mutating the array in place does not. A shallowRef also keeps
 * the array plain (no deep proxy), so what reaches the element's `messages`
 * property is a clean `ChatMessage[]`.
 */
export interface ChatController {
  messages: Ref<ChatMessage[]>;
  loading: Ref<boolean>;
  append: (msg: ChatMessage) => void;
  setMessages: (next: ChatMessage[]) => void;
  streamAssistant: (init?: Partial<ChatMessage>) => AssistantStream;
}

export function useChat(initialMessages: ChatMessage[] = []): ChatController {
  const messages = shallowRef<ChatMessage[]>([...initialMessages]);
  const loading = ref(false);

  // The one universal contract the state core drives: a functional-updater setter
  // (React setState shape) that assigns a fresh array each time.
  const set: SetMessages = (updater) => { messages.value = updater(messages.value); };

  const append = (msg: ChatMessage) => set((prev) => appendMessage(prev, msg));
  const setMessages = (next: ChatMessage[]) => { messages.value = [...next]; };
  const streamAssistant = (init?: Partial<ChatMessage>): AssistantStream => {
    loading.value = true;
    return onStreamSettled(createAssistantStream(set, init), () => { loading.value = false; });
  };

  return { messages, loading, append, setMessages, streamAssistant };
}
