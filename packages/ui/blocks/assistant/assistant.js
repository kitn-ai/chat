// assistant: the full-page assistant block. The interior is entirely public
// kit surface - the rail is kai-conversations (built-in header, search, New
// chat), the model switcher is the standalone kai-model-switcher leaf, the
// conversation lifecycle is the headless controller from @kitn.ai/ui/stores,
// and the stream parses through the @kitn.ai/ui/wire readers. No shadow root
// is reached into.
//
// Two kai- contract points this file follows, and your edits must keep:
// 1. Array/object props (messages, suggestions, models) are set as JS
//    PROPERTIES, never HTML attributes - with a NEW array reference AND a new
//    object for each changed item, so re-renders actually happen.
// 2. kai-* events do not bubble: every listener below is on the element
//    itself, reading event.detail.
import '@kitn.ai/ui/autoloader';
import { createAssistantStream, createMockResponder } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';
import { localStorageStore, createConversationController, isConversationUnread } from '@kitn.ai/ui/stores';
import { MOCK_SCRIPT, MOCK_TOOL_OUTPUTS, SUGGESTIONS, MODELS } from './mock.js';

// KNOWN RESIDUAL (spike finding F-9, same as the support-widget block): the
// "2m ago" formatter is internal to the Solid layer and not exported from
// @kitn.ai/ui/stores, so the block restates it. Delete this when the kit
// ships it beside byRecency.
function relativeTimeShort(iso, now = Date.now()) {
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

const tags = ['kai-conversations', 'kai-thread', 'kai-prompt-input', 'kai-model-switcher'];
await Promise.all(tags.map((t) => customElements.whenDefined(t)));

const $ = (id) => document.getElementById(id);
const thread = $('thread');
const prompt = $('prompt');
const conversations = $('conversations');
const models = $('models');

const ASSISTANT_ACTIONS = ['copy', 'like', 'dislike'];
const USER_ACTIONS = ['edit'];

let messages = [];
function setMessages(next) {
  messages = next;
  thread.messages = messages; // new array reference notifies; new item objects make edits visible
  // Suggestions are conversation starters: empty thread only.
  prompt.suggestions = messages.length === 0 ? SUGGESTIONS : undefined;
}

// --- The model switcher recipe: models in as a property, selection out via
// the event. The mock ignores the selection (it is a script); a real backend
// reads selectedModel inside the submit handler and routes on it.
let selectedModel = MODELS[0].id;
models.models = MODELS;
models.currentModel = selectedModel;
models.addEventListener('kai-model-change', (e) => {
  selectedModel = e.detail.modelId;
  models.currentModel = selectedModel;
});

// --- Conversation lifecycle: the ONE shipped policy (mint-on-first-turn,
// save-per-turn, restore, the three-leg seen rule). A full-page assistant is
// always open on the chat view, so the controller's defaults (view 'chat',
// open true) already satisfy two seen legs; the active conversation is
// marked read as replies land.
const store = localStorageStore('assistant');
const controller = createConversationController(store, {
  onMessagesLoad: (msgs) => setMessages(msgs),
  onSummariesChange: renderSummaries,
});

function renderSummaries(summaries) {
  // ITEM mode (the documented consumer-owned loop): kai-conversation-item
  // rows at the rail's default density, with a preview line and a
  // right-aligned relative time.
  for (const stale of conversations.querySelectorAll('kai-conversation-item')) stale.remove();
  for (const s of summaries) {
    const item = document.createElement('kai-conversation-item');
    item.setAttribute('conversation-id', s.id);
    if (isConversationUnread(s)) item.setAttribute('unread', '');
    const title = document.createElement('span');
    title.textContent = s.title;
    item.append(title);
    // One truncated preview line under the title (the meta region), deduped
    // against the title the store derives from the same message text.
    const preview = s.trailing && s.trailing !== s.title ? s.trailing : '';
    if (preview) {
      const meta = document.createElement('span');
      meta.slot = 'meta';
      meta.textContent = preview;
      item.append(meta);
    }
    const time = document.createElement('span');
    time.slot = 'menu';
    time.className = 'row-time';
    time.textContent = relativeTimeShort(s.updatedAt ?? s.lastMessageAt);
    item.append(time);
    conversations.append(item);
  }
  conversations.activeId = controller.activeId();
}

// Rail wiring: select loads, New chat starts fresh. In item mode the rail's
// search box does not filter consumer-owned rows, so the block wires the
// kai-search event to its own rows - hiding a row is the block's call here,
// not the kit's.
conversations.addEventListener('kai-conversation-select', async (e) => {
  await controller.select(e.detail.id);
});
conversations.addEventListener('kai-new-chat', () => controller.startNew());
conversations.addEventListener('kai-search', (e) => {
  const q = e.detail.query.trim().toLowerCase();
  for (const item of conversations.querySelectorAll('kai-conversation-item')) {
    item.hidden = q !== '' && !item.textContent.toLowerCase().includes(q);
  }
});

// --- The provider seam: a scripted mock here; swap `respond` for a fetch to
// your endpoint (sending selectedModel with the request) and keep parsing
// with the wire readers.
const respond = createMockResponder({ replies: MOCK_SCRIPT });

prompt.addEventListener('kai-submit', async (e) => {
  const text = e.detail.value.trim();
  if (!text || thread.loading) return;
  // The composer does not clear itself on submit - clearing is the host's
  // call, made through the element's public clear() method.
  prompt.clear();

  const userMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    actions: USER_ACTIONS,
    parts: [
      { type: 'text', text },
      ...(e.detail.attachments ?? []).map((attachment) => ({ type: 'file', attachment })),
    ],
  };
  setMessages([...messages, userMessage]);
  thread.loading = true;
  prompt.loading = true;

  const stream = createAssistantStream((update) => setMessages(update(messages)));
  try {
    await readOpenAIStream(respond(text), stream);
    for (const part of messages.find((m) => m.id === stream.id)?.parts ?? []) {
      if (part.type !== 'tool' || part.tool.state !== 'input-available' || !part.tool.toolCallId) continue;
      const output = MOCK_TOOL_OUTPUTS[part.tool.type];
      if (output) stream.upsertTool(part.tool.toolCallId, { state: 'output-available', output });
    }
    stream.done();
    setMessages(messages.map((m) => (m.id === stream.id ? { ...m, actions: ASSISTANT_ACTIONS } : m)));
    await controller.saveTurn(messages); // mints the id on the first turn, saves, marks read while seen
  } catch (err) {
    stream.abort(err instanceof Error ? err.message : String(err));
  } finally {
    thread.loading = false;
    prompt.loading = false;
  }
});

// --- Boot: hydrate the thread from the most recent conversation.
setMessages([]);
await controller.refresh();
await controller.restore();

// Signal readiness for the block driver.
window.__blockReady = true;
