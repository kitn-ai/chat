// The block-driver harness app for the CURRENT kai-chat facade — the
// composition spike's facade app.js (cdn-widget-src/app.js), adopted
// unchanged so the recorded baseline is the exact page the spike measured.
// `/kit/` is serve.mjs's mount of the freshly built packages/ui/dist.

// state + wire ARE reachable raw from the CDN: dist/state.js and dist/wire.js
// are self-contained ESM with zero bare imports.
import { createAssistantStream, createMockResponder } from '/kit/state.js';
import { readOpenAIStream } from '/kit/wire.js';

// FINDING: `localStorageStore` is NOT reachable on this path. It lives only in
// dist/index.js / dist/solid.js, both of which open with bare `solid-js`
// imports that a raw CDN URL cannot resolve (see index-root-import.html for
// the live failure). So the CDN consumer hand-writes the ConversationStore
// contract (list/load/save[/markRead]) against localStorage themselves:
function handRolledLocalStore(name) {
  const indexKey = `${name}:index`;
  const convKey = (id) => `${name}:conv:${id}`;
  const readIndex = () => {
    try { return JSON.parse(localStorage.getItem(indexKey) ?? '[]'); } catch { return []; }
  };
  return {
    async list() { return readIndex(); },
    async load(id) {
      try { return JSON.parse(localStorage.getItem(convKey(id)) ?? '[]'); } catch { return []; }
    },
    async save(id, messages) {
      localStorage.setItem(convKey(id), JSON.stringify(messages));
      const rest = readIndex().filter((s) => s.id !== id);
      const textOf = (m) => (m?.parts ?? []).filter((p) => p.type === 'text').map((p) => p.text).join(' ');
      const firstUser = messages.find((m) => m.role === 'user');
      const last = messages[messages.length - 1];
      localStorage.setItem(indexKey, JSON.stringify([
        {
          id,
          title: (textOf(firstUser) || 'Conversation').slice(0, 60),
          messageCount: messages.length,
          updatedAt: new Date().toISOString(),
          lastMessage: textOf(last).slice(0, 80) || undefined,
        },
        ...rest,
      ]));
    },
    async markRead(id) {
      const idx = readIndex();
      const row = idx.find((s) => s.id === id);
      if (row) { row.lastReadAt = new Date().toISOString(); localStorage.setItem(indexKey, JSON.stringify(idx)); }
    },
  };
}

await customElements.whenDefined('kai-chat');
await customElements.whenDefined('kai-dock');

const dock = document.getElementById('dock');
const chat = document.getElementById('chat');
const closeButton = document.getElementById('close');

// --- Rich props: JS properties, never attributes (the kai- contract) --------

chat.suggestions = ["Where's my order?", 'Request a refund'];
chat.userActions = ['edit'];
chat.assistantActions = ['copy', 'like', 'dislike'];
// Store BEFORE conversations, both as properties (spike finding 2 holds here too).
chat.store = handRolledLocalStore('support-widget-cdn');
chat.conversations = true;
chat.home = {
  greeting: { title: 'How can we help? \u{1F44B}', subtitle: 'Orders, refunds, anything.' },
  recentConversation: true,
  links: [
    { label: 'Help center', href: 'https://ui.kitn.ai', description: 'Guides and FAQs', icon: 'book-open' },
  ],
};

// --- Conversations: the element lists/loads/saves; messages stay ours -------

chat.addEventListener('kai-conversation-load', (e) => {
  chat.messages = e.detail.messages;
});

// --- Widget chrome ----------------------------------------------------------

closeButton.addEventListener('click', () => dock.hide());
dock.addEventListener('kai-open-change', (e) => {
  if (e.detail.open) dock.unread = false;
});

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

chat.addEventListener('kai-submit', async (e) => {
  const text = e.detail.value.trim();
  if (!text || chat.loading) return;

  const userMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    parts: [
      { type: 'text', text },
      ...e.detail.attachments.map((attachment) => ({ type: 'file', attachment })),
    ],
  };
  chat.messages = [...(chat.messages ?? []), userMessage];
  chat.loading = true;

  const stream = createAssistantStream((update) => {
    chat.messages = update(chat.messages ?? []);
  });
  try {
    await readOpenAIStream(respond(text), stream);
    for (const part of (chat.messages ?? []).find((m) => m.id === stream.id)?.parts ?? []) {
      if (part.type !== 'tool' || part.tool.state !== 'input-available' || !part.tool.toolCallId) continue;
      const output = MOCK_TOOL_OUTPUTS[part.tool.type];
      if (output) stream.upsertTool(part.tool.toolCallId, { state: 'output-available', output });
    }
    stream.done();
    if (!dock.open) dock.unread = true;
  } catch (err) {
    stream.abort(err instanceof Error ? err.message : String(err));
  } finally {
    chat.loading = false;
  }
});

// Signal readiness for the Playwright driver.
window.__blockReady = true;
