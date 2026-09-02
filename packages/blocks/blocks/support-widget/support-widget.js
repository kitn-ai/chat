// support-widget: the reference block. The interior is entirely public kit
// surface - the widget chrome is elements (kai-panel / kai-panel-header /
// kai-view-stack / kai-tab-bar / kai-row), the conversation lifecycle is the
// headless controller from @kitn.ai/ui/stores, and the stream parses through
// the @kitn.ai/ui/wire readers. No shadow root is reached into.
//
// Two kai- contract points this file follows, and your edits must keep:
// 1. Array/object props (messages, suggestions, conversations) are set as JS
//    PROPERTIES, never HTML attributes - with a NEW array reference AND a new
//    object for each changed item, so re-renders actually happen.
// 2. kai-* events do not bubble: every listener below is on the element
//    itself, reading event.detail.
import '@kitn.ai/ui/autoloader';
import { createAssistantStream, createMockResponder } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';
import { localStorageStore, createConversationController, isConversationUnread } from '@kitn.ai/ui/stores';
import { MOCK_SCRIPT, MOCK_TOOL_OUTPUTS, SUGGESTIONS } from './mock.js';

// KNOWN RESIDUAL (spike finding F-9): the "2m ago" formatter is internal to
// the Solid layer and not exported from @kitn.ai/ui/stores, so the block
// restates it. Delete this when the kit ships it beside byRecency.
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

const tags = ['kai-dock', 'kai-panel', 'kai-view-stack', 'kai-tab-bar', 'kai-thread', 'kai-prompt-input', 'kai-conversations', 'kai-row', 'kai-button'];
await Promise.all(tags.map((t) => customElements.whenDefined(t)));

const $ = (id) => document.getElementById(id);
const dock = $('dock');
const stack = $('stack');
const tabbar = $('tabbar');
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

// --- Conversation lifecycle: the ONE shipped policy (mint-on-first-turn,
// save-per-turn, restore, the three-leg seen rule), not a hand-rolled copy.
const store = localStorageStore('support-widget');
const controller = createConversationController(store, {
  initialView: 'home',
  initialOpen: false,
  onMessagesLoad: (msgs) => setMessages(msgs),
  onSummariesChange: renderSummaries,
  onUnreadChange: (anyUnread) => {
    dock.unread = anyUnread; // renders only while closed; the dock never clears it itself
    $('tab-messages').dot = anyUnread;
  },
});

function renderSummaries(summaries) {
  // ITEM mode (the documented consumer-owned loop): kai-conversation-item
  // rows with the PUBLIC panel density (P-7) - the widget-box row the facade
  // renders, with no padding smuggled through slotted spans. Item mode also
  // skips the rail's group sections, matching the facade's headerless list.
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
    // Right-aligned relative time (the menu slot is the right-aligned region).
    const time = document.createElement('span');
    time.slot = 'menu';
    time.className = 'row-time';
    time.textContent = relativeTimeShort(s.updatedAt ?? s.lastMessageAt);
    item.append(time);
    conversations.append(item);
  }
  conversations.activeId = controller.activeId();
  const recent = summaries[0];
  $('recent').hidden = !recent;
  if (!recent) return;
  $('recent-title').textContent = recent.title;
  $('recent-time').textContent = relativeTimeShort(recent.updatedAt ?? recent.lastMessageAt);
  $('recent-dot').hidden = !isConversationUnread(recent);
  // Display dedupe: the store titles a conversation from message text, so the
  // title and the trailing preview can be the same string.
  const preview = recent.trailing && recent.trailing !== recent.title ? recent.trailing : '';
  $('recent-preview').textContent = preview;
  $('recent-preview').hidden = !preview;
}

// --- Navigation: the stack owns the model; chrome consumes its state. ------
stack.addEventListener('kai-view-change', (e) => {
  const { view, root, drilled } = e.detail;
  $('back').hidden = !drilled; // drilled shows the back arrow...
  tabbar.hidden = drilled; // ...and hides the tab bar (the stack's rule, consumed not restated)
  tabbar.value = root;
  controller.setView(view); // only 'chat' satisfies the seen rule's view leg
});
tabbar.addEventListener('kai-tab-change', (e) => stack.selectTab(e.detail.value));
$('back').addEventListener('click', () => stack.back());
$('close').addEventListener('click', () => dock.hide());
dock.addEventListener('kai-open-change', (e) => controller.setOpen(e.detail.open));

$('cta').addEventListener('click', () => { controller.startNew(); stack.push('chat'); });
$('new-conversation').addEventListener('click', () => { controller.startNew(); stack.push('chat'); });
$('recent').addEventListener('kai-click', async () => {
  const recent = controller.summaries()[0];
  if (recent) await controller.select(recent.id);
  stack.push('chat');
});
conversations.addEventListener('kai-conversation-select', async (e) => {
  await controller.select(e.detail.id);
  stack.push('chat');
});

// --- The provider seam: a scripted mock here; swap `respond` for a fetch to
// your endpoint and keep parsing with the wire readers.
const respond = createMockResponder({ replies: MOCK_SCRIPT });

prompt.addEventListener('kai-submit', async (e) => {
  const text = e.detail.value.trim();
  if (!text || thread.loading) return;

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

// --- Boot: hydrate the thread from the most recent conversation; the widget
// still lands on home (the restored conversation is one tap away).
setMessages([]);
await controller.refresh();
await controller.restore();

// Signal readiness for the block driver.
window.__widgetReady = true;
