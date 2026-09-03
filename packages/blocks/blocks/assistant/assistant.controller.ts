/**
 * assistant, the framework-neutral controller.
 *
 * The contract (spec 2026-09-02 section 3.2):
 *
 *   createController(deps) => { state(): State; actions: Actions; subscribe(fn): () => void }
 *
 * Everything the imperative `assistant.js` did to the DOM is now either a
 * field of `State` (bound onto an element with `.prop=` / `:attr=`) or an
 * `actions` entry (bound with `@kai-event=`). The ONLY DOM this file touches
 * is through `deps.refs()`, and only to call an element METHOD that has no
 * declarative equivalent: the composer's clear().
 *
 * WHAT THIS BLOCK ADDED TO THE CONTRACT'S EVIDENCE, over support-widget's
 * conversion:
 *
 * 1. The rail's search filter WAS a DOM query. `assistant.js` read
 *    `item.textContent` off every rendered row and set `item.hidden`, which
 *    the contract forbids for good reason: it reaches past the state the
 *    renderers agree about into whatever the browser happened to lay out. It
 *    is now `query` plus a `conversationRows` list that is already filtered,
 *    which is what "State is a view model" means in practice. The rows the
 *    filter drops are not rendered at all rather than rendered hidden, so the
 *    block's stylesheet no longer needs its `[hidden]` rule either.
 * 2. `.prop` on a LEAF element with no navigation. `models` and
 *    `currentModel` drive kai-model-switcher; there is no view stack on this
 *    page and no ref for one.
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
import type { KaiPromptInputElement } from '@kitn.ai/ui/elements';
import { MOCK_SCRIPT, MOCK_TOOL_OUTPUTS, SUGGESTIONS, MODELS, type ModelOption } from './mock';

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

/** One rendered row of the rail. Every field is already a string or a
 *  boolean, because `*for` bodies get bindings, not expressions. */
export interface ConversationRow {
  id: string;
  title: string;
  preview: string;
  previewHidden: boolean;
  time: string;
  unread: boolean;
}

export interface AssistantState {
  // thread
  messages: ChatMessage[];
  suggestions: string[] | undefined;
  loading: boolean;
  // the model switcher recipe
  models: ModelOption[];
  currentModel: string;
  // the rail
  activeId: string | undefined;
  /** The rail's search box, lowercased and trimmed. A FIELD rather than a
   *  read of the input, because the controller owns no DOM: the rows below
   *  are already filtered by it. */
  query: string;
  /** The rows the rail renders: the summaries, projected and then FILTERED
   *  by `query`. The old script rendered them all and hid the misses. */
  conversationRows: ConversationRow[];
}

/** The element handles the controller calls methods on. Nullable because no
 *  framework has them at construction: React's ref is null through the first
 *  render, Vue's until mount. */
export interface AssistantRefs {
  prompt: KaiPromptInputElement | null;
}

export interface AssistantDeps {
  refs: () => AssistantRefs;
  /** Storage key; the block's default is its own id. */
  storageKey?: string;
}

export interface AssistantActions {
  /** `@kai-model-change` on the switcher. */
  modelChange(event: CustomEvent<{ modelId: string }>): void;
  /** `@kai-conversation-select` on the rail. */
  openConversation(event: CustomEvent<{ id: string }>): Promise<void>;
  /** `@kai-new-chat` on the rail. */
  newChat(): void;
  /** `@kai-search` on the rail's built-in search box. */
  search(event: CustomEvent<{ query: string }>): void;
  /** `@kai-submit` on the prompt input. */
  submit(event: CustomEvent<{ value: string; attachments?: unknown[] }>): Promise<void>;
  /** Mount hook: hydrate from storage. Not a binding - the host calls it. */
  boot(): Promise<void>;
}

export interface AssistantController {
  state(): AssistantState;
  actions: AssistantActions;
  subscribe(listener: () => void): () => void;
}

export function createController(deps: AssistantDeps): AssistantController {
  const listeners = new Set<() => void>();

  let state: AssistantState = {
    messages: [],
    suggestions: SUGGESTIONS,
    loading: false,
    models: MODELS,
    currentModel: MODELS[0].id,
    activeId: undefined,
    query: '',
    conversationRows: [],
  };

  // A NEW state object every patch: the snapshot getter is compared by
  // identity by useSyncExternalStore, and the kai- reactivity contract wants a
  // new array reference for `messages` anyway.
  const patch = (next: Partial<AssistantState>): void => {
    state = { ...state, ...next };
    for (const l of listeners) l();
  };

  const setMessages = (messages: ChatMessage[]): void =>
    patch({ messages, suggestions: messages.length === 0 ? SUGGESTIONS : undefined });

  // The UNFILTERED projection, kept beside State rather than in it: nothing
  // binds it, and a field nothing binds is not part of the view model.
  let allRows: ConversationRow[] = [];

  /** The old script matched the row's whole `textContent`: the title, the
   *  preview line and the relative time, concatenated with NO separator. Same
   *  three fields here, read off the row model instead of off the DOM, and
   *  joined with spaces -- so a query is no longer able to match across a
   *  boundary the reader never sees ("just now" against a title ending in
   *  "ju"). That is a deliberate difference and the better behaviour. */
  const filterRows = (rows: ConversationRow[], query: string): ConversationRow[] =>
    query === ''
      ? rows
      : rows.filter((row) => `${row.title} ${row.preview} ${row.time}`.toLowerCase().includes(query));

  const store = localStorageStore(deps.storageKey ?? 'assistant');

  const controller = createConversationController(store, {
    onMessagesLoad: (msgs) => setMessages(msgs),
    onSummariesChange: (summaries) => patch(projectSummaries(summaries)),
  });

  function projectSummaries(summaries: ConversationSummary[]): Partial<AssistantState> {
    allRows = summaries.map((s) => {
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
    return { conversationRows: filterRows(allRows, state.query), activeId: controller.activeId() };
  }

  const respond = createMockResponder({ replies: MOCK_SCRIPT });

  const actions: AssistantActions = {
    modelChange(event) {
      // The mock ignores the selection (it is a script); a real backend reads
      // state.currentModel inside submit and routes on it.
      patch({ currentModel: event.detail.modelId });
    },

    async openConversation(event) {
      await controller.select(event.detail.id);
    },

    newChat() {
      controller.startNew();
    },

    search(event) {
      const query = event.detail.query.trim().toLowerCase();
      patch({ query, conversationRows: filterRows(allRows, query) });
    },

    async submit(event) {
      const text = event.detail.value.trim();
      if (!text || state.loading) return;
      // The composer does not clear itself on submit - clearing is the host's
      // call, made through the element's public clear() method. That call is
      // the one DOM leak this controller has, and it is why it declares a ref.
      deps.refs().prompt?.clear();

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
        // Mints the id on the first turn, saves, marks read while seen.
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
