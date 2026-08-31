// Phase 3: the SAME support widget as index.html/app.js, composed at the
// finer grain — no <kai-chat>. The interior is kai-thread + kai-prompt-input +
// kai-conversations + kai-tabs + kai-empty + kai-button inside the kai-dock
// shell, glued together by this file. Strictly public surface: documented
// props/events/methods/slots only; nothing reaches into a shadow root.
// FINDING tags refer to phase3-fine-grain.md.

import { createAssistantStream, createMockResponder } from '/kit/state.js';
import { readOpenAIStream } from '/kit/wire.js';
// Phase 2's headline gap is CLOSED: /kit/stores.js is self-contained ESM, so
// the built-in store and the unread primitive are reachable with no bundler.
import { localStorageStore, isConversationUnread, byRecency } from '/kit/stores.js';

const tags = ['kai-dock', 'kai-thread', 'kai-prompt-input', 'kai-conversations', 'kai-tabs', 'kai-button'];
await Promise.all(tags.map((t) => customElements.whenDefined(t)));

const $ = (id) => document.getElementById(id);
const dock = $('dock');
const thread = $('thread');
const prompt = $('prompt');
const conversations = $('conversations');
const tabs = $('tabs');

// --- App state the facade used to hold for us (F-3) -------------------------
// <kai-chat> owned the view router (home/chat/list), the active conversation
// id, and the store lifecycle (auto-restore, save-on-turn, markRead). At the
// fine grain all of that is this file's job.

const store = localStorageStore('support-widget-fine');
let messages = [];
let conversationId = null; // no id until the first message mints one (same C-6 rule)
let view = 'home';

const ASSISTANT_ACTIONS = ['copy', 'like', 'dislike']; // facade: assistantActions
const USER_ACTIONS = ['edit']; // facade: userActions — per-message at this grain (F-4)

// --- Rich props: JS properties, never attributes (the kai- contract) --------

prompt.suggestions = ["Where's my order?", 'Request a refund'];
// FINDING F-5: kai-prompt-input has no `accept` — the facade's
// accept="image/*,application/pdf" media-type filter (and its
// kai-attachment-rejected reporting) is facade-only. Attachments still stage
// and submit; they just can't be narrowed here.
tabs.items = [
  { id: 'home', label: 'Home' },
  { id: 'chat', label: 'Messages' },
];

// --- View routing (mine — kai-tabs is selection only, "not a content router") -

function render() {
  $('view-home').hidden = view !== 'home';
  $('view-chat').hidden = view !== 'chat';
  $('view-list').hidden = view !== 'list';
  $('tabbar').hidden = view === 'list';
  if (view === 'home' || view === 'chat') tabs.value = view;
  $('list-toggle').style.visibility = view === 'list' ? 'hidden' : 'visible';
}

function setView(next) {
  view = next;
  render();
  if (next === 'chat') markReadIfSeen();
  if (next === 'list') refreshSummaries();
}

tabs.addEventListener('kai-tab-change', (e) => setView(e.detail.value));
$('cta').addEventListener('click', () => setView('chat'));
$('list-toggle').addEventListener('click', () => setView('list'));
$('close').addEventListener('click', () => dock.hide());

// --- Conversations: list/select/new against the public store ----------------

async function refreshSummaries() {
  const summaries = (await store.list()).slice().sort(byRecency);
  // New array from list(), new prop assignment: the contract is satisfied.
  conversations.conversations = summaries.map((s) => ({
    ...s,
    trailing: s.trailing, // preview text the store derives on save
  }));
  conversations.activeId = conversationId ?? undefined;
  // The unread badge, derived where the facade's kai-unread-change event used
  // to hand it to us (F-6): the public isConversationUnread primitive over
  // store.list(), exactly the "consumer-composed launcher deriving its own
  // badge" case its JSDoc names. Renders only while the dock is closed.
  dock.unread = summaries.some(isConversationUnread);
  // Home tab's recent-conversation card (facade: home.recentConversation).
  const recent = summaries[0];
  $('recent-card').hidden = !recent;
  if (recent) {
    $('recent-title').textContent = recent.title;
    $('recent-sub').textContent = recent.trailing ?? `${recent.messageCount} messages`;
  }
}

function setMessages(next) {
  messages = next;
  thread.messages = messages; // new array reference notifies; new item objects make edits visible
}

conversations.addEventListener('kai-conversation-select', async (e) => {
  conversationId = e.detail.id;
  setMessages(await store.load(conversationId));
  setView('chat');
});

conversations.addEventListener('kai-new-chat', () => {
  conversationId = null;
  setMessages([]);
  setView('chat');
});

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

{
  const summaries = (await store.list()).slice().sort(byRecency);
  if (summaries[0]) {
    conversationId = summaries[0].id;
    setMessages(await store.load(conversationId));
  }
  await refreshSummaries();
  render();
}

// Signal readiness for the Playwright driver.
window.__widgetReady = true;
