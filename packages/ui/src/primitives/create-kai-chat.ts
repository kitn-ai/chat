// src/primitives/create-kai-chat.ts
import { createSignal } from 'solid-js';
import type { ChatMessage } from '../elements/chat-types';
import type { AttachmentData } from '../components/attachments';
import {
  appendMessage, updateMessage, removeMessage, addSuggestion, removeSuggestion,
  createAssistantStream, onStreamSettled, type AssistantStream, type SetMessages,
} from '../state';

export interface CreateKaiChatOptions {
  /** Seed messages, read once at creation and copied. Later changes are ignored — drive updates through the returned ops. */
  initialMessages?: ChatMessage[];
  /** Seed suggestions, read once at creation and copied. Later changes are ignored. */
  initialSuggestions?: string[];
  onSubmit?: (detail: { value: string; attachments: AttachmentData[] }) => void | Promise<void>;
}

/** Solid store: consumer-owned chat state + the same ergonomic ops as `useKaiChat`. */
export interface KaiChatStore {
  messages: () => ChatMessage[];
  setMessages: SetMessages;
  suggestions: () => string[];
  loading: () => boolean;
  append: (msg: ChatMessage) => void;
  update: (id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => ChatMessage)) => void;
  remove: (id: string) => void;
  addSuggestion: (s: string) => void;
  removeSuggestion: (s: string) => void;
  clearSuggestions: () => void;
  streamAssistant: (init?: Partial<ChatMessage>) => AssistantStream;
  handleSubmit: (event: CustomEvent<{ value: string; attachments: AttachmentData[] }>) => void;
  /** Spread onto `<kai-chat {...chat.bind} />` (reactive getters). Wire submit with a listener on the element: `el.addEventListener('kai-submit', chat.handleSubmit)` (kai-* events don't bubble). */
  bind: { readonly messages: ChatMessage[]; readonly loading: boolean; readonly suggestions: string[] };
}

export function createKaiChat(options: CreateKaiChatOptions = {}): KaiChatStore {
  // Copy the seed arrays so a caller mutating the array it passed in can't reach our state.
  const [messages, setMessagesSignal] = createSignal<ChatMessage[]>([...(options.initialMessages ?? [])]);
  const [suggestions, setSuggestions] = createSignal<string[]>([...(options.initialSuggestions ?? [])]);
  const [loading, setLoading] = createSignal(false);

  const setMessages: SetMessages = (updater) => setMessagesSignal((prev) => updater(prev));

  return {
    messages,
    setMessages,
    suggestions,
    loading,
    append: (msg) => setMessages((prev) => appendMessage(prev, msg)),
    update: (id, patch) => setMessages((prev) => updateMessage(prev, id, patch)),
    remove: (id) => setMessages((prev) => removeMessage(prev, id)),
    addSuggestion: (s) => setSuggestions((prev) => addSuggestion(prev, s)),
    removeSuggestion: (s) => setSuggestions((prev) => removeSuggestion(prev, s)),
    clearSuggestions: () => setSuggestions([]),
    streamAssistant: (init) => {
      setLoading(true);
      return onStreamSettled(createAssistantStream(setMessages, init), () => setLoading(false));
    },
    handleSubmit: (event) => { void options.onSubmit?.(event.detail); },
    bind: {
      get messages() { return messages(); },
      get loading() { return loading(); },
      get suggestions() { return suggestions(); },
    },
  };
}
