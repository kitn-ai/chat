import type { ChatMessage } from '@kitn.ai/ui';
import {
  appendMessage,
  createAssistantStream,
  onStreamSettled,
  type SetMessages,
  type AssistantStream,
} from '@kitn.ai/ui/state';

/**
 * Svelte port of the kit's `useKaiChat` (a React hook), built on the SAME
 * framework-neutral state core (`@kitn.ai/ui/state`) the React hook uses. It owns
 * the message array + the `loading` flag and exposes ergonomic ops. Swap
 * `streamFakeReply` for a real model call to ship a real app.
 *
 * `messages` is a `$state` rune (this file is `.svelte.ts` so runes work): every op
 * assigns a BRAND-NEW array reference (`messages = updater(prev)`), which is exactly
 * what re-renders `<kai-thread>` — mutating the array in place does not. Consumers
 * read `chat.messages` / `chat.loading` through the getters so Svelte tracks them
 * across the module boundary; destructuring would break reactivity.
 */
export interface ChatController {
  readonly messages: ChatMessage[];
  readonly loading: boolean;
  append: (msg: ChatMessage) => void;
  setMessages: (next: ChatMessage[]) => void;
  streamAssistant: (init?: Partial<ChatMessage>) => AssistantStream;
}

export function createChat(initialMessages: ChatMessage[] = []): ChatController {
  let messages = $state<ChatMessage[]>([...initialMessages]);
  let loading = $state(false);

  // The one universal contract the state core drives: a functional-updater setter
  // (React setState shape) that assigns a fresh array each time.
  const set: SetMessages = (updater) => { messages = updater(messages); };

  const append = (msg: ChatMessage) => set((prev) => appendMessage(prev, msg));
  const setMessages = (next: ChatMessage[]) => { messages = [...next]; };
  const streamAssistant = (init?: Partial<ChatMessage>): AssistantStream => {
    loading = true;
    return onStreamSettled(createAssistantStream(set, init), () => { loading = false; });
  };

  return {
    get messages() { return messages; },
    get loading() { return loading; },
    append,
    setMessages,
    streamAssistant,
  };
}
