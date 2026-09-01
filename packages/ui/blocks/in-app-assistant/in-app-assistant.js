// in-app-assistant: the embedded side-panel assistant block. The interior is
// entirely public kit surface - the panel chrome is elements (kai-panel /
// kai-panel-header / kai-view-stack), the conversation lifecycle is the
// headless controller from @kitn.ai/ui/stores, and the stream parses through
// the @kitn.ai/ui/wire readers. No shadow root is reached into.
//
// Two kai- contract points this file follows, and your edits must keep:
// 1. Array/object props (messages, suggestions, triggers) are set as JS
//    PROPERTIES, never HTML attributes - with a NEW array reference AND a new
//    object for each changed item, so re-renders actually happen.
// 2. kai-* events do not bubble: every listener below is on the element
//    itself, reading event.detail.
import '@kitn.ai/ui/autoloader';
import { createAssistantStream, createMockResponder } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';
import { localStorageStore, createConversationController, isConversationUnread } from '@kitn.ai/ui/stores';
import { MOCK_SCRIPT, MOCK_TOOL_OUTPUTS, SUGGESTIONS, TRIGGERS } from './mock.js';

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

const tags = ['kai-panel', 'kai-view-stack', 'kai-thread', 'kai-prompt-input', 'kai-conversations', 'kai-button'];
await Promise.all(tags.map((t) => customElements.whenDefined(t)));

const $ = (id) => document.getElementById(id);
const stack = $('stack');
const thread = $('thread');
const prompt = $('prompt');
const conversations = $('conversations');

const ASSISTANT_ACTIONS = ['copy', 'like', 'dislike'];
const USER_ACTIONS = ['edit'];

let messages = [];
function setMessages(next) {
  messages = next;
  thread.messages = messages; // new array reference notifies; new item objects make edits visible
  // Suggestions are conversation starters: empty thread only.
  prompt.suggestions = messages.length === 0 ? SUGGESTIONS : undefined;
}

// Composer triggers (slash commands + mention targets): a JS property.
prompt.triggers = TRIGGERS;

// --- Conversation lifecycle: the ONE shipped policy (mint-on-first-turn,
// save-per-turn, restore, the three-leg seen rule). The aside is always open,
// so the seen legs left are the active id and the chat view - drilling into
// history counts as away.
const store = localStorageStore('in-app-assistant');
const controller = createConversationController(store, {
  onMessagesLoad: (msgs) => setMessages(msgs),
  onSummariesChange: renderSummaries,
  onUnreadChange: (anyUnread) => {
    // KNOWN RESIDUAL (finding): kai-button carries no dot/badge affordance
    // (kai-tab-bar-item does), so the unread signal beside the history button
    // is the block's own dot span.
    $('history-dot').hidden = !anyUnread;
  },
});

function renderSummaries(summaries) {
  // ITEM mode (the documented consumer-owned loop): kai-conversation-item
  // rows with the PUBLIC panel density - the widget-box row the facade
  // renders. Item mode also skips the rail's group sections, matching the
  // headerless list.
  for (const stale of conversations.querySelectorAll('kai-conversation-item')) stale.remove();
  for (const s of summaries) {
    const item = document.createElement('kai-conversation-item');
    item.setAttribute('conversation-id', s.id);
    item.setAttribute('density', 'panel');
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

// --- Navigation: the stack owns the model; chrome consumes its state. The
// history button drills; drilled shows the back arrow and hides the history
// button (the stack's rule, consumed not restated).
stack.addEventListener('kai-view-change', (e) => {
  const { view, drilled } = e.detail;
  $('back').hidden = !drilled;
  $('history').hidden = drilled;
  controller.setView(view); // only 'chat' satisfies the seen rule's view leg
});
$('history').addEventListener('click', () => stack.push('history'));
$('back').addEventListener('click', () => stack.back());
$('new-conversation').addEventListener('click', () => { controller.startNew(); stack.back(); });
conversations.addEventListener('kai-conversation-select', async (e) => {
  await controller.select(e.detail.id);
  stack.back();
});

// --- The provider seam: a scripted mock here; swap `respond` for a fetch to
// your endpoint and keep parsing with the wire readers.
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
