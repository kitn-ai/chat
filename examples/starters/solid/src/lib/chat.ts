import { createSignal, type Accessor } from 'solid-js';
import type { ChatMessage } from '@kitn.ai/ui/solid';
import {
  appendMessage,
  createAssistantStream,
  onStreamSettled,
  type AssistantStream,
  type SetMessages,
} from '@kitn.ai/ui/state';

/**
 * Solid port of the kit's `useKaiChat` (a React hook), built on the SAME
 * framework-neutral state core (`@kitn.ai/ui/state`) the React hook and the
 * Svelte starter's `createChat` are built on. It owns the message array + the
 * `loading` flag and exposes ergonomic ops.
 *
 * WHY A `createSignal` AND NOT A STORE. A store's whole selling point is
 * fine-grained mutation of nested fields, and that is the one thing the state
 * core must not do: `createAssistantStream` drives everything through a
 * functional-updater setter that returns a BRAND-NEW array with a brand-new
 * message object inside it, because a fresh reference is what the thread reads
 * as "this changed". A store would either fight that (deep-diffing a whole array
 * we already know is new) or invite someone to reach in and mutate `parts` in
 * place, which does not re-render. Signals model "replace the value" exactly,
 * so the seam between the kit's core and Solid is one line — `set` below.
 *
 * `messages` and `loading` are returned as ACCESSORS, not values. Reading them
 * is what subscribes a component, so handing back `messages()` here would
 * snapshot the array once at call time and never update. Callers write
 * `chat.messages()`.
 */
export interface ChatController {
  messages: Accessor<ChatMessage[]>;
  loading: Accessor<boolean>;
  append: (msg: ChatMessage) => void;
  setMessages: (next: ChatMessage[]) => void;
  streamAssistant: (init?: Partial<ChatMessage>) => AssistantStream;
}

export function createChat(initialMessages: ChatMessage[] = []): ChatController {
  const [messages, setMessagesSignal] = createSignal<ChatMessage[]>([...initialMessages]);
  const [loading, setLoading] = createSignal(false);

  // The one universal contract the state core drives: a functional-updater
  // setter (React setState shape). Solid's setter already takes an updater, so
  // this is a straight pass-through — the arrow is kept rather than writing
  // `setMessagesSignal` bare because a signal setter's updater overload is only
  // selected for a FUNCTION argument, and being explicit about which overload we
  // mean costs nothing and reads unambiguously.
  const set: SetMessages = (updater) => setMessagesSignal((prev) => updater(prev));

  return {
    messages,
    loading,
    append: (msg) => set((prev) => appendMessage(prev, msg)),
    // A fresh array, so swapping conversations is a reference change like every
    // other update rather than a special case the thread has to detect.
    setMessages: (next) => setMessagesSignal([...next]),
    streamAssistant: (init) => {
      setLoading(true);
      return onStreamSettled(createAssistantStream(set, init), () => setLoading(false));
    },
  };
}
