import type { ChatMessage } from '@kitn.ai/ui';
import {
  appendMessage,
  createAssistantStream,
  onStreamSettled,
  type SetMessages,
  type AssistantStream,
} from '@kitn.ai/ui/state';
import { CONVERSATIONS, THREADS, newId, type Conversation } from './chat-data';

export type Theme = 'light' | 'dark';

/**
 * The whole app's state in one plain object. `view.ts` reads it in `render()` and
 * syncs it onto the `kai-*` element properties; the ops below mutate it and then
 * `notify()` so a single subscriber (the render) re-runs. No framework, no proxies.
 */
export interface AppState {
  messages: ChatMessage[];
  conversations: Conversation[];
  activeId: string;
  theme: Theme;
  collapsed: boolean;
  loading: boolean;
}

export interface Store {
  readonly state: AppState;
  /** Register a listener; it fires after every state change. */
  subscribe(fn: () => void): void;
  append(msg: ChatMessage): void;
  /** Start streaming an assistant turn (flips `loading`, clears it on settle). */
  streamAssistant(init?: Partial<ChatMessage>): AssistantStream;
  selectConversation(id: string): void;
  newChat(): void;
  toggleTheme(): void;
  toggleCollapsed(): void;
  setCollapsed(value: boolean): void;
}

/**
 * Owns the message array + conversation stash + UI flags, built on the kit's
 * framework-neutral state core (`@kitn.ai/ui/state`) the React `useKaiChat` hook
 * and the Vue `useChat` composable also use. Every message op assigns a BRAND-NEW
 * array reference (`state.messages = updater(prev)`); that fresh reference is
 * exactly what re-renders `<kai-thread>` when the render re-sets its `messages`
 * property. Swap `streamFakeReply` (in main.ts) for a real model call to ship.
 */
export function createStore(): Store {
  const state: AppState = {
    messages: [...(THREADS[CONVERSATIONS[0].id] ?? [])],
    conversations: [...CONVERSATIONS],
    activeId: CONVERSATIONS[0].id,
    theme: 'dark',
    collapsed: false,
    loading: false,
  };

  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());

  // The one contract the state core drives: a functional-updater setter (React
  // setState shape) that assigns a fresh array each call, then notifies.
  const set: SetMessages = (updater) => {
    state.messages = updater(state.messages);
    notify();
  };
  const setMessages = (next: ChatMessage[]) => {
    state.messages = [...next];
    notify();
  };

  return {
    state,
    subscribe(fn) {
      listeners.add(fn);
    },
    append(msg) {
      set((prev) => appendMessage(prev, msg));
    },
    streamAssistant(init) {
      state.loading = true;
      notify();
      return onStreamSettled(createAssistantStream(set, init), () => {
        state.loading = false;
        notify();
      });
    },
    selectConversation(id) {
      THREADS[state.activeId] = state.messages; // stash the open thread
      state.activeId = id;
      setMessages(THREADS[id] ?? []); // load the picked one (notifies)
    },
    newChat() {
      const id = newId();
      THREADS[state.activeId] = state.messages;
      THREADS[id] = [];
      const now = new Date().toISOString();
      state.conversations = [
        { id, title: 'New conversation', scope: { type: 'collection' }, messageCount: 0, lastMessageAt: now, updatedAt: now },
        ...state.conversations,
      ];
      state.activeId = id;
      setMessages([]); // notifies
    },
    toggleTheme() {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      notify();
    },
    toggleCollapsed() {
      state.collapsed = !state.collapsed;
      notify();
    },
    setCollapsed(value) {
      state.collapsed = value;
      notify();
    },
  };
}
