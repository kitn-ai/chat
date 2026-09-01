// Phase 3: the SAME support widget as index.html/app.js, composed at the
// finer grain — no <kai-chat>. The interior is kai-thread + kai-prompt-input +
// kai-conversations + kai-empty + kai-button + kai-icon inside the kai-dock
// shell, glued together by this file. Strictly public surface: documented
// props/events/methods/slots only; nothing reaches into a shadow root.
// FINDING tags refer to phase3-fine-grain.md.
//
// Navigation matches the facade's model exactly (H-2/H-3/H-5, from the
// ChatThread docs): home and list are tab-bar levels; a chat is always a
// DRILL (from the CTA, the recent card, a list row, or new-conversation) that
// hides the tab bar and shows a header back arrow returning to wherever the
// chat was entered from. The Messages tab routes to the list, so there is no
// header list toggle.

import { createAssistantStream, createMockResponder } from '/kit/state.js';
import { readOpenAIStream } from '/kit/wire.js';
// Phase 2's headline gap is CLOSED: /kit/stores.js is self-contained ESM, so
// the built-in store and the unread primitive are reachable with no bundler.
import { localStorageStore, isConversationUnread, byRecency } from '/kit/stores.js';

const tags = ['kai-dock', 'kai-thread', 'kai-prompt-input', 'kai-conversations', 'kai-button'];
await Promise.all(tags.map((t) => customElements.whenDefined(t)));

const $ = (id) => document.getElementById(id);
const dock = $('dock');
const thread = $('thread');
const prompt = $('prompt');
const conversations = $('conversations');

// --- App state the facade used to hold for us (F-3) -------------------------

const store = localStorageStore('support-widget-fine');
let messages = [];
let conversationId = null; // no id until the first message mints one (same C-6 rule)
let view = 'home'; // 'home' | 'list' | 'chat'
let chatEntry = null; // which level a drilled chat came from: 'home' | 'list'
let summaries = [];

const SUGGESTIONS = ["Where's my order?", 'Request a refund'];
const ASSISTANT_ACTIONS = ['copy', 'like', 'dislike']; // facade: assistantActions
const USER_ACTIONS = ['edit']; // facade: userActions — per-message at this grain (F-4)

// FINDING F-9: relativeTimeShort (the "2m ago" on the facade's recent card
// and list rows) is internal to the Solid layer — not exported from
// /kit/stores.js beside byRecency/isConversationUnread, so the fine-grain
// consumer restates it.
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

// --- Rendering the chrome the facade owned ----------------------------------

function render() {
  $('view-home').hidden = view !== 'home';
  $('view-list').hidden = view !== 'list';
  $('view-chat').hidden = view !== 'chat';
  // Facade rule: the tab bar hides on a drilled chat; the header back arrow
  // shows there instead (tabBarVisible / the H-5 back arrow in ChatThread).
  $('tabbar').hidden = view === 'chat';
  $('back').hidden = view !== 'chat';
  const activeTab = view === 'home' ? 'home' : 'messages';
  $('tab-home').setAttribute('aria-selected', String(activeTab === 'home'));
  $('tab-messages').setAttribute('aria-selected', String(activeTab === 'messages'));
  // Facade rule: suggestions are conversation starters — empty thread only
  // (ChatThread's persistSuggestions default). At this grain the policy is
  // the glue's job: kai-prompt-input renders whatever it is handed.
  prompt.suggestions = messages.length === 0 ? SUGGESTIONS : undefined;
}

function renderHome() {
  const recent = summaries[0];
  $('recent-card').hidden = !recent;
  if (recent) {
    $('recent-title').textContent = recent.title;
    $('recent-time').textContent = relativeTimeShort(recent.updatedAt ?? recent.lastMessageAt);
    $('recent-dot').hidden = !isConversationUnread(recent);
    // Display dedupe: localStorageStore titles a conversation from its last
    // message text at first save, so title and trailing preview can be the
    // same string — showing both reads as a duplicate (report, observation 10).
    const preview = recent.trailing && recent.trailing !== recent.title ? recent.trailing : '';
    $('recent-preview').textContent = preview;
    $('recent-preview').hidden = !preview;
  }
}

function setMessages(next) {
  messages = next;
  thread.messages = messages; // new array reference notifies; new item objects make edits visible
  render();
}

async function refreshSummaries() {
  summaries = (await store.list()).slice().sort(byRecency);
  // ITEM mode (the documented consumer-owned loop): kai-conversation-item
  // rows in light DOM, so the sidebar rail's group sections ("Ungrouped")
  // never render and the row shape approximates the facade's panel rows —
  // title + relative time, no "N messages" line, no near-duplicate preview.
  for (const stale of conversations.querySelectorAll('kai-conversation-item')) stale.remove();
  for (const s of summaries) {
    const item = document.createElement('kai-conversation-item');
    item.setAttribute('conversation-id', s.id);
    item.setAttribute('compact', ''); // round 2: the facade's list rows are the dense presentation
    item.append(document.createTextNode(s.title));
    // Right-aligned relative time, like the facade's rows: the `menu` slot is
    // the right-aligned region (`meta` renders UNDER the title).
    const time = document.createElement('span');
    time.slot = 'menu';
    time.className = 'row-time';
    time.textContent = relativeTimeShort(s.updatedAt ?? s.lastMessageAt);
    item.append(time);
    conversations.append(item);
  }
  conversations.activeId = conversationId ?? undefined;
  // The unread badge, derived where the facade's kai-unread-change event used
  // to hand it to us (F-6): the public isConversationUnread primitive over
  // store.list(). The dock renders it only while closed; the Messages tab
  // gets the same signal (the facade's WidgetTabBar dot).
  const anyUnread = summaries.some(isConversationUnread);
  dock.unread = anyUnread;
  $('tab-unread-dot').hidden = !anyUnread;
  $('tab-messages').setAttribute('aria-label', anyUnread ? 'Messages (unread)' : 'Messages');
  renderHome();
}

// --- Navigation wiring ------------------------------------------------------

function setLevel(next) { // a tab-bar level: 'home' | 'list'
  view = next;
  chatEntry = null;
  render();
}

async function drillIntoChat(entry, id) { // a drilled chat, back target = entry
  chatEntry = entry;
  conversationId = id;
  setMessages(id ? await store.load(id) : []);
  view = 'chat';
  render();
  await markReadIfSeen();
}

$('tab-home').addEventListener('click', () => setLevel('home'));
$('tab-messages').addEventListener('click', () => setLevel('list'));
$('back').addEventListener('click', () => setLevel(chatEntry ?? 'home'));
$('cta').addEventListener('click', () => drillIntoChat('home', null));
$('recent-card').addEventListener('click', () => drillIntoChat('home', summaries[0]?.id ?? null));
$('close').addEventListener('click', () => dock.hide());

conversations.addEventListener('kai-conversation-select', (e) => drillIntoChat('list', e.detail.id));
$('new-conversation').addEventListener('click', () => drillIntoChat('list', null));

// "Seen" = dock open + chat view showing the active conversation (the same
// three-leg rule ChatThread applies for the facade).
async function markReadIfSeen() {
  if (!conversationId || !dock.open || view !== 'chat' || !store.markRead) return;
  await store.markRead(conversationId);
  await refreshSummaries();
}

dock.addEventListener('kai-open-change', () => markReadIfSeen());

// --- Provider seam: the same scripted mock ----------------------------------

const MOCK_SCRIPT = [
  {
    reasoning:
      'An order question. Look the order up before answering — guessing a delivery date is worse than a short wait.',
    text: 'Let me pull up that order.',
    toolCalls: [{ name: 'lookup_order', arguments: { order: 'KAI-1042' } }],
  },
  {
    text: "Order KAI-1042 shipped with DHL and should arrive Thursday. (I'm a local mock — no provider was contacted — but a real model's tool call renders exactly like the row above.)",
  },
  {
    text: 'Anything else? Still the mock: swap the provider seam for your endpoint and this handler keeps its exact shape.',
  },
];

const MOCK_TOOL_OUTPUTS = {
  lookup_order: { order: 'KAI-1042', status: 'shipped', carrier: 'DHL', eta: 'Thursday' },
};

const respond = createMockResponder({ replies: MOCK_SCRIPT });

// --- The send round-trip: identical seam, more bookkeeping (F-3) ------------

prompt.addEventListener('kai-submit', async (e) => {
  const text = e.detail.value.trim();
  if (!text || thread.loading) return;

  const userMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    actions: USER_ACTIONS,
    parts: [
      { type: 'text', text },
      ...e.detail.attachments.map((attachment) => ({ type: 'file', attachment })),
    ],
  };
  setMessages([...messages, userMessage]);
  thread.loading = true;
  prompt.loading = true;

  const stream = createAssistantStream((update) => {
    setMessages(update(messages));
  });
  try {
    await readOpenAIStream(respond(text), stream);
    for (const part of messages.find((m) => m.id === stream.id)?.parts ?? []) {
      if (part.type !== 'tool' || part.tool.state !== 'input-available' || !part.tool.toolCallId) continue;
      const output = MOCK_TOOL_OUTPUTS[part.tool.type];
      if (output) stream.upsertTool(part.tool.toolCallId, { state: 'output-available', output });
    }
    stream.done();
    // F-4: per-message actions — stamp the finished assistant turn the way
    // the facade's assistantActions default did. New array AND a new object
    // for the changed item, per the contract.
    setMessages(messages.map((m) => (m.id === stream.id ? { ...m, actions: ASSISTANT_ACTIONS } : m)));
    // Persistence the facade did internally: mint the id on the first turn,
    // save, mark read if we're watching, refresh list/badge/recent card.
    conversationId ??= crypto.randomUUID();
    await store.save(conversationId, messages);
    await markReadIfSeen();
    await refreshSummaries();
  } catch (err) {
    stream.abort(err instanceof Error ? err.message : String(err));
  } finally {
    thread.loading = false;
    prompt.loading = false;
  }
});

// --- Boot: auto-restore the most recent conversation (facade did this) ------
// Like the facade, restore hydrates the thread but the widget still LANDS on
// home (H-5); the restored conversation is one tap away on the recent card.

{
  summaries = (await store.list()).slice().sort(byRecency);
  if (summaries[0]) {
    conversationId = summaries[0].id;
    setMessages(await store.load(conversationId));
  }
  await refreshSummaries();
  render();
}

// Signal readiness for the Playwright driver.
window.__widgetReady = true;
