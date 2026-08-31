// Hand-composed support widget: the same feature set the widget construct
// emits, authored the way the docs teach a consumer to do it — kai-* web
// components in the page, JS properties for rich data, kai-* events for the
// wiring, @kitn.ai/ui/state + /wire for streaming. No private imports.
import '@kitn.ai/ui/elements';
import { createAssistantStream, createMockResponder, type MockReply, type ChatMessage } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';
import type { AttachmentData } from '@kitn.ai/ui/elements';
import { localStorageStore } from '@kitn.ai/ui';

await customElements.whenDefined('kai-chat');
await customElements.whenDefined('kai-dock');

const dock = document.getElementById('dock') as HTMLElementTagNameMap['kai-dock'];
const chat = document.getElementById('chat') as HTMLElementTagNameMap['kai-chat'];
const closeButton = document.getElementById('close')!;

// --- Rich props: JS properties, never attributes (the kai- contract) --------

chat.suggestions = ["Where's my order?", 'Request a refund'];
chat.userActions = ['edit'];
chat.assistantActions = ['copy', 'like', 'dislike'];
// Set store BEFORE flipping conversations on: the attribute form races the
// property-set store (one mount pass without it logs the loud ChatThread guard).
chat.store = localStorageStore('support-widget');
chat.conversations = true;
chat.home = {
  greeting: { title: 'How can we help? \u{1F44B}', subtitle: 'Orders, refunds, anything.' },
  recentConversation: true,
  links: [
    { label: 'Help center', href: 'https://ui.kitn.ai', description: 'Guides and FAQs', icon: 'book-open' },
  ],
};

// --- Conversations: the element lists/loads/saves; messages stay ours -------

// Gap noted for the report: the shipped element types carry no typed
// addEventListener overloads, so vanilla TS casts each CustomEvent by hand.
chat.addEventListener('kai-conversation-load', (evt) => {
  const e = evt as CustomEvent<{ id: string | undefined; messages: ChatMessage[] }>;
  chat.messages = e.detail.messages;
});

// --- The widget chrome: close button in the header, unread dot on the dock --

closeButton.addEventListener('click', () => dock.hide());
dock.addEventListener('kai-open-change', (evt) => {
  const e = evt as CustomEvent<{ open: boolean }>;
  if (e.detail.open) dock.unread = false;
});

// --- Provider seam: mock — same script the construct template ships ---------

const MOCK_SCRIPT: MockReply[] = [
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

const MOCK_TOOL_OUTPUTS: Record<string, Record<string, unknown>> = {
  lookup_order: { order: 'KAI-1042', status: 'shipped', carrier: 'DHL', eta: 'Thursday' },
};

const respond = createMockResponder({ replies: MOCK_SCRIPT });

chat.addEventListener('kai-submit', async (evt) => {
  const e = evt as CustomEvent<{ value: string; attachments: AttachmentData[] }>;
  const text = e.detail.value.trim();
  if (!text || chat.loading) return;

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    parts: [
      { type: 'text', text },
      ...e.detail.attachments.map((attachment) => ({ type: 'file' as const, attachment })),
    ],
  };
  chat.messages = [...(chat.messages ?? []), userMessage];
  chat.loading = true;

  const stream = createAssistantStream((update) => {
    chat.messages = update(chat.messages ?? []);
  });
  try {
    await readOpenAIStream(respond(text), stream);
    // Settle the mock's announced tool calls — the host's side of the seam.
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
