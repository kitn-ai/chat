import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessage } from '../../src/elements/chat-types';
// The whole content model, not just the envelope: a React consumer typing a
// `parts` array or an `addSource` argument needs these too, and re-exporting
// only `ChatMessage` is the same missing-annotation gap one layer up.
export type {
  ChatMessage, ChatMessageAction, CustomAction, AvatarData, FeedbackVote, MessagePart,
  MessageSource, RawOrigin,
} from '../../src/elements/chat-types';
export type { ToolPart } from '../../src/components/tool-types';
export type { ToolKind } from '../../src/components/tool-classify';
export type { CardEnvelope } from '../../src/primitives/card-contract';
export type { AttachmentData } from '../../src/components/attachment-types';
import type { AttachmentData } from '../../src/components/attachment-types';
import {
  appendMessage, updateMessage, removeMessage, addSuggestion, removeSuggestion,
  createAssistantStream, onStreamSettled, type AssistantStream, type SetMessages,
} from '../../src/state';

export interface UseKaiChatOptions {
  /** Seed messages, read once at mount and copied. Later changes are ignored — drive updates through the returned ops. */
  initialMessages?: ChatMessage[];
  /** Seed suggestions, read once at mount and copied. Later changes are ignored. */
  initialSuggestions?: string[];
  onSubmit?: (detail: { value: string; attachments: AttachmentData[] }) => void | Promise<void>;
}

/** Owns chat state in React and exposes ergonomic, fully-typed controlled operations. */
export interface KaiChatController {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  suggestions: string[];
  setSuggestions: Dispatch<SetStateAction<string[]>>;
  loading: boolean;
  append: (msg: ChatMessage) => void;
  update: (id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => ChatMessage)) => void;
  remove: (id: string) => void;
  addSuggestion: (s: string) => void;
  removeSuggestion: (s: string) => void;
  clearSuggestions: () => void;
  streamAssistant: (init?: Partial<ChatMessage>) => AssistantStream;
  /** Spread onto `<Chat {...chat.bind} />` — wires messages, loading, suggestions, and kai-submit. */
  bind: {
    messages: ChatMessage[];
    loading: boolean;
    suggestions: string[];
    onSubmit: (event: CustomEvent<{ value: string; attachments: AttachmentData[] }>) => void;
  };
}

export function useKaiChat(options: UseKaiChatOptions = {}): KaiChatController {
  // Copy the seed arrays so a caller mutating the array it passed in can't reach our state.
  const [messages, setMessages] = useState<ChatMessage[]>(() => [...(options.initialMessages ?? [])]);
  const [suggestions, setSuggestions] = useState<string[]>(() => [...(options.initialSuggestions ?? [])]);
  const [loading, setLoading] = useState(false);

  // Keep onSubmit current without re-binding the listener identity.
  const onSubmitRef = useRef(options.onSubmit);
  onSubmitRef.current = options.onSubmit;

  const set: SetMessages = useCallback((updater) => setMessages(updater), []);

  const append = useCallback((msg: ChatMessage) => set((prev) => appendMessage(prev, msg)), [set]);
  const update = useCallback(
    (id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => ChatMessage)) =>
      set((prev) => updateMessage(prev, id, patch)),
    [set],
  );
  const remove = useCallback((id: string) => set((prev) => removeMessage(prev, id)), [set]);
  const addSug = useCallback((s: string) => setSuggestions((prev) => addSuggestion(prev, s)), []);
  const removeSug = useCallback((s: string) => setSuggestions((prev) => removeSuggestion(prev, s)), []);
  const clearSuggestions = useCallback(() => setSuggestions([]), []);

  const streamAssistant = useCallback((init?: Partial<ChatMessage>): AssistantStream => {
    setLoading(true);
    return onStreamSettled(createAssistantStream(set, init), () => setLoading(false));
  }, [set]);

  const onSubmit = useCallback(
    (event: CustomEvent<{ value: string; attachments: AttachmentData[] }>) => {
      void onSubmitRef.current?.(event.detail);
    },
    [],
  );

  const bind = useMemo(
    () => ({ messages, loading, suggestions, onSubmit }),
    [messages, loading, suggestions, onSubmit],
  );

  return {
    messages, setMessages, suggestions, setSuggestions, loading,
    append, update, remove, addSuggestion: addSug, removeSuggestion: removeSug, clearSuggestions,
    streamAssistant, bind,
  };
}
