/**
 * support-widget, the framework-neutral controller.
 *
 * The contract under test (spec 2026-09-02 §3.2, plus the two amendments):
 *
 *   createController(deps) => { state(): State; actions: Actions; subscribe(fn): () => void }
 *
 * Everything the imperative `support-widget.js` did to the DOM is now either
 * a field of `State` (bound onto an element with `.prop=` / `:attr=`) or an
 * `actions` entry (bound with `@kai-event=`). The ONLY DOM this file touches
 * is through `deps.refs()`, and only to call element METHODS that have no
 * declarative equivalent: the view stack's push/back/selectTab and the dock's
 * hide.
 *
 * AMENDMENT 1 (found by this conversion): `refs` is a GETTER, not a value.
 * No framework has its element handles at the moment the controller is
 * constructed - React's ref is null through the first render, Vue's template
 * ref is null until mount - so `deps.refs` has to be callable and every
 * handle has to be nullable.
 *
 * AMENDMENT 2 (found by this conversion): State is a VIEW MODEL, not domain
 * state. The binding syntax has no expressions, so every derivation the old
 * script did inline - `!drilled`, the relative-time string, the title/preview
 * dedupe, whether a preview line exists at all - is precomputed into its own
 * field here. That is the price of keeping bindings dumb enough for six
 * renderers to agree about, and it is worth paying, but it means the field
 * count is presentation-shaped rather than minimal.
 */
import { createAssistantStream, createMockResponder } from '@kitn.ai/ui/state';
import type { ChatMessage } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';
import {
  localStorageStore,
  createConversationController,
  isConversationUnread,
  type ConversationSummary,
} from '@kitn.ai/ui/stores';
import type { KaiDockElement, KaiViewStackElement } from '@kitn.ai/ui/elements';
import { MOCK_SCRIPT, MOCK_TOOL_OUTPUTS, SUGGESTIONS } from './mock';

// KNOWN RESIDUAL: the "2m ago" formatter is internal to the Solid layer and
// is not exported from @kitn.ai/ui/stores, so the block restates it. Delete
// this when the kit ships it beside byRecency.
function relativeTimeShort(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const ASSISTANT_ACTIONS = ['copy', 'like', 'dislike'] as const;
const USER_ACTIONS = ['edit'] as const;

/** One rendered row of the messages list. Every field is already a string or
 *  a boolean, because `*for` bodies get bindings, not expressions. */
export interface ConversationRow {
  id: string;
  title: string;
  preview: string;
  previewHidden: boolean;
  time: string;
  unread: boolean;
}

export interface SupportWidgetState {
  // thread
  messages: ChatMessage[];
  suggestions: string[] | undefined;
  loading: boolean;
  // chrome
  backHidden: boolean;
  tabBarHidden: boolean;
  tab: string;
  unread: boolean;
  // messages tab
  activeId: string | undefined;
  conversationRows: ConversationRow[];
  // home tab's recent card
  recentHidden: boolean;
  recentTitle: string;
  recentTime: string;
  recentPreview: string;
  recentPreviewHidden: boolean;
  recentDotHidden: boolean;
}

/** The element handles the controller calls methods on. Nullable because no
 *  framework has them at construction: React's ref is null through the first
 *  render, Vue's until mount. */
export interface SupportWidgetRefs {
  stack: KaiViewStackElement | null;
  dock: KaiDockElement | null;
}

export interface SupportWidgetDeps {
  refs: () => SupportWidgetRefs;
  /** Storage key; the block's default is its own id. */
  storageKey?: string;
}

export interface SupportWidgetActions {
  /** `@kai-view-change` on the view stack. */
  viewChange(event: CustomEvent<{ view?: string; root?: string; drilled: boolean }>): void;
  /** `@kai-tab-change` on the tab bar. */
  tabChange(event: CustomEvent<{ value: string }>): void;
  /** `@kai-open-change` on the dock. */
  openChange(event: CustomEvent<{ open: boolean }>): void;
  /** `@kai-click` on the header back button. */
  back(): void;
  /** `@kai-click` on the header close button. */
  close(): void;
  /** `@kai-click` on the home CTA and the "New conversation" pill. */
  startNew(): void;
  /** `@kai-click` on the home recent row. */
  openRecent(): Promise<void>;
  /** `@kai-conversation-select` on the list. */
  openConversation(event: CustomEvent<{ id: string }>): Promise<void>;
  /** `@kai-submit` on the prompt input. */
  submit(event: CustomEvent<{ value: string; attachments?: unknown[] }>): Promise<void>;
  /** Mount hook: hydrate from storage. Not a binding - the host calls it. */
  boot(): Promise<void>;
}

export interface SupportWidgetController {
  state(): SupportWidgetState;
  actions: SupportWidgetActions;
  subscribe(listener: () => void): () => void;
}

export function createController(deps: SupportWidgetDeps): SupportWidgetController {
  const listeners = new Set<() => void>();

  let state: SupportWidgetState = {
    messages: [],
    suggestions: SUGGESTIONS,
    loading: false,
    backHidden: true,
    tabBarHidden: false,
    tab: 'home',
    unread: false,
    activeId: undefined,
    conversationRows: [],
    recentHidden: true,
    recentTitle: '',
    recentTime: '',
    recentPreview: '',
    recentPreviewHidden: true,
    recentDotHidden: true,
  };

  // A NEW state object every patch: the snapshot getter is compared by
  // identity by useSyncExternalStore, and the kai- reactivity contract wants a
  // new array reference for `messages` anyway.
  const patch = (next: Partial<SupportWidgetState>): void => {
    state = { ...state, ...next };
    for (const l of listeners) l();
  };

  const setMessages = (messages: ChatMessage[]): void =>
    patch({ messages, suggestions: messages.length === 0 ? SUGGESTIONS : undefined });

  const store = localStorageStore(deps.storageKey ?? 'support-widget');

  const controller = createConversationController(store, {
    initialView: 'home',
    initialOpen: false,
    onMessagesLoad: (msgs) => setMessages(msgs),
    onSummariesChange: (summaries) => patch(projectSummaries(summaries)),
    onUnreadChange: (anyUnread) => patch({ unread: anyUnread }),
  });

  function projectSummaries(summaries: ConversationSummary[]): Partial<SupportWidgetState> {
    const rows: ConversationRow[] = summaries.map((s) => {
      // Display dedupe: the store titles a conversation from message text, so
      // the title and the trailing preview can be the same string.
      const preview = s.trailing && s.trailing !== s.title ? s.trailing : '';
      return {
        id: s.id,
        title: s.title,
        preview,
        previewHidden: preview === '',
        time: relativeTimeShort(s.updatedAt ?? s.lastMessageAt),
        unread: isConversationUnread(s),
      };
    });
    const recent = rows[0];
    return {
      conversationRows: rows,
      activeId: controller.activeId(),
      recentHidden: !recent,
      recentTitle: recent?.title ?? '',
      recentTime: recent?.time ?? '',
      recentPreview: recent?.preview ?? '',
      recentPreviewHidden: !recent || recent.previewHidden,
      recentDotHidden: !recent || !recent.unread,
    };
  }

  const respond = createMockResponder({ replies: MOCK_SCRIPT });

  const actions: SupportWidgetActions = {
    viewChange(event) {
      const { view, root, drilled } = event.detail;
      // The stack's one rule, CONSUMED not restated: drilled shows the back
      // arrow and hides the tab bar.
      patch({ backHidden: !drilled, tabBarHidden: drilled, tab: root ?? state.tab });
      // Only 'chat' satisfies the seen rule's view leg. An UNRESOLVED view is
      // deliberately skipped rather than defaulted: the old imperative code
      // passed `undefined` straight through, where the leg simply failed, and
      // defaulting to 'home' would ASSERT the home view is showing when the
      // stack resolved none.
      if (view) void controller.setView(view);
    },

    tabChange(event) {
      deps.refs().stack?.selectTab(event.detail.value);
    },

    openChange(event) {
      void controller.setOpen(event.detail.open);
    },

    back() {
      deps.refs().stack?.back();
    },

    close() {
      deps.refs().dock?.hide();
    },

    startNew() {
      controller.startNew();
      deps.refs().stack?.push('chat');
    },

    async openRecent() {
      const recent = controller.summaries()[0];
      if (recent) await controller.select(recent.id);
      deps.refs().stack?.push('chat');
    },

    async openConversation(event) {
      await controller.select(event.detail.id);
      deps.refs().stack?.push('chat');
    },

    async submit(event) {
      const text = event.detail.value.trim();
      if (!text || state.loading) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        actions: [...USER_ACTIONS],
        parts: [
          { type: 'text', text },
          ...((event.detail.attachments ?? []) as never[]).map((attachment) => ({
            type: 'file' as const,
            attachment,
          })),
        ],
      };
      setMessages([...state.messages, userMessage]);
      patch({ loading: true });

      const stream = createAssistantStream((update) => setMessages(update(state.messages)));
      try {
        await readOpenAIStream(respond(text), stream);
        for (const part of state.messages.find((m) => m.id === stream.id)?.parts ?? []) {
          if (part.type !== 'tool' || part.tool.state !== 'input-available' || !part.tool.toolCallId) continue;
          const output = MOCK_TOOL_OUTPUTS[part.tool.type];
          if (output) stream.upsertTool(part.tool.toolCallId, { state: 'output-available', output });
        }
        stream.done();
        setMessages(
          state.messages.map((m) => (m.id === stream.id ? { ...m, actions: [...ASSISTANT_ACTIONS] } : m)),
        );
        await controller.saveTurn(state.messages);
      } catch (err) {
        stream.abort(err instanceof Error ? err.message : String(err));
      } finally {
        patch({ loading: false });
      }
    },

    async boot() {
      setMessages([]);
      await controller.refresh();
      await controller.restore();
    },
  };

  return {
    state: () => state,
    actions,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
