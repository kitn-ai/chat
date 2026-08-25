// The whole app: a chat surface composed by hand from standalone kai-*
// elements. <kai-chat> is deliberately not used — kai-thread renders the
// transcript, kai-composer takes input, and this module is the host that
// wires one to the other (the kit has no store: host-coordinates).
import '@kitn.ai/ui/elements'; // registers every <kai-*>; must come first
import '@kitn.ai/ui/theme.tokens.css';

import type {
  AttachmentData,
  ChatMessage,
  KaiAttachmentsElement,
  KaiComposerElement,
  KaiConversationItemElement,
  KaiFeedbackBarElement,
  KaiThreadElement,
  KaiToastRegionElement,
  MessagePart,
  ToastItem,
} from '@kitn.ai/ui/elements';
import { createAssistantStream, createMockResponder } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';

// ── the fake model ──────────────────────────────────────────────────────────
// No key, no network, no provider. createMockResponder yields real OpenAI
// chat-completions SSE frames that readOpenAIStream parses on exactly the path
// a live route would take. Replies cycle one per turn; the third scripts a
// tool call so the thread's tool panel gets exercised too.
const mockResponse = createMockResponder({
  replies: [
    'Hey — this thread is composed from standalone `kai-*` elements: ' +
      '`kai-thread` for the transcript, `kai-composer` for input, and a host ' +
      'module wiring them together.\n\nAttach a file with the paperclip and send it.',
    'Got it. Anything you attach is staged in `kai-attachments` next to the ' +
      'composer, then rides along as a `file` part on the message you send.',
    {
      text: 'Let me look that up.',
      toolCalls: [
        { name: 'search_docs', arguments: { query: 'composing a kai thread', limit: 3 } },
      ],
    },
    'Streaming, tool calls, attachments and toasts all run through the same ' +
      'host wiring — swapping the mock for a real `/api/chat` changes one line.',
  ],
  chunkSize: 2,
});

// ── conversations ───────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
}

const conversations: Conversation[] = [
  { id: crypto.randomUUID(), title: 'New chat', messages: [] },
];
let activeId = conversations[0].id;

const active = (): Conversation =>
  conversations.find((c) => c.id === activeId) ?? conversations[0];

// ── element handles (typed once, after upgrade) ─────────────────────────────

const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

/** A picked File as a `data:` URI — the ONE form every consumer of
 *  `AttachmentData.url` accepts.
 *
 *  NOT an object URL: a `blob:` URL resolves only inside the tab that minted
 *  it, so it renders a perfect preview here and is meaningless to anything
 *  downstream — `toOpenAIMessages` / `toAnthropicMessages` refuse it with a
 *  written reason, and before they refused it an attachment-only turn reached
 *  the model as nothing at all. A data URI previews identically, survives a
 *  reload, needs no revocation bookkeeping, and is what both providers take. */
const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

let staged: AttachmentData[] = [];
let sending = false;

async function main() {
  // kai-* register through an async dynamic import (SSR-safety), so a property
  // set before the upgrade is dropped. Wait for every element this host drives.
  await Promise.all(
    [
      'kai-thread',
      'kai-composer',
      'kai-attachments',
      'kai-conversation-item',
      'kai-feedback-bar',
      'kai-toast-region',
    ].map((tag) => customElements.whenDefined(tag)),
  );

  const thread = el<KaiThreadElement>('thread');
  const composer = el<KaiComposerElement>('composer');
  const stagedEl = el<KaiAttachmentsElement>('staged');
  const feedback = el<KaiFeedbackBarElement>('feedback');
  const toastRegion = el<KaiToastRegionElement>('toasts');
  const rail = el<HTMLElement>('conversations');
  const title = el<HTMLElement>('pane-title');
  const sendBtn = el<HTMLButtonElement>('send');
  const attachBtn = el<HTMLButtonElement>('attach');
  const fileInput = el<HTMLInputElement>('file-input');

  // ── toasts ────────────────────────────────────────────────────────────────
  // Driven as data rather than through the imperative toast(), because this app
  // places its own <kai-toast-region> and owns the list.
  let toasts: ToastItem[] = [];
  const setToasts = (next: ToastItem[]) => {
    toasts = next;
    toastRegion.toasts = toasts; // new array reference every time
  };
  const notify = (message: string, item: Partial<ToastItem> = {}) =>
    setToasts([...toasts, { id: crypto.randomUUID(), message, duration: 4000, ...item }]);

  toastRegion.addEventListener('kai-dismiss', (event) => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    setToasts(toasts.filter((t) => t.id !== id));
  });

  // ── rendering ─────────────────────────────────────────────────────────────

  // Reassign, never mutate: the array reference is what tells the element
  // something changed, and the row keys are the message objects themselves.
  const setMessages = (next: ChatMessage[]) => {
    active().messages = next;
    thread.messages = next;
  };

  function renderRail() {
    rail.replaceChildren(
      ...conversations.map((conversation) => {
        const row = document.createElement(
          'kai-conversation-item',
        ) as KaiConversationItemElement;
        row.conversationId = conversation.id;
        row.active = conversation.id === activeId;
        row.compact = true;
        row.textContent = conversation.title;

        const meta = document.createElement('span');
        meta.slot = 'meta';
        meta.textContent = conversation.messages.length
          ? `${conversation.messages.length} messages`
          : 'Empty';
        row.append(meta);

        // kai-conversation-item has no selection event of its own — it renders
        // a button row and leaves activation to the host, so a plain click
        // listener is the wiring.
        row.addEventListener('click', () => select(conversation.id));
        return row;
      }),
    );
  }

  function select(id: string) {
    activeId = id;
    const conversation = active();
    title.textContent = conversation.title;
    thread.messages = conversation.messages;
    feedback.hidden = true;
    renderRail();
    composer.focus();
  }

  function renderStaged() {
    stagedEl.items = staged; // JS property, new array each time
    stagedEl.hidden = staged.length === 0;
  }

  // ── attaching a file ──────────────────────────────────────────────────────
  // kai-composer has no attachment affordance of its own (unlike
  // kai-prompt-input), so the picker and the staging tray are the host's.

  attachBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const picked = [...(fileInput.files ?? [])];
    fileInput.value = ''; // so the same file can be picked twice
    if (!picked.length) return;
    void (async () => {
      const added = await Promise.all(
        picked.map(
          async (file): Promise<AttachmentData> => ({
            id: crypto.randomUUID(),
            type: 'file',
            filename: file.name,
            mediaType: file.type || 'application/octet-stream',
            url: await readAsDataUrl(file), // data: URI — see readAsDataUrl
          }),
        ),
      );
      staged = [...staged, ...added];
      renderStaged();
      notify(
        picked.length === 1
          ? `Attached ${picked[0].name}`
          : `Attached ${picked.length} files`,
        { variant: 'success' },
      );
    })();
    composer.focus();
  });

  stagedEl.addEventListener('kai-remove', (event) => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    // A data: URI needs no revocation — dropping the item is the whole cleanup.
    staged = staged.filter((item) => item.id !== id);
    renderStaged();
  });

  // ── sending ───────────────────────────────────────────────────────────────

  sendBtn.addEventListener('click', () => composer.send());

  composer.addEventListener('kai-submit', (event) => {
    const { text } = (event as CustomEvent<{ text: string }>).detail;
    void send(text);
  });

  async function send(rawText: string) {
    const text = rawText.trim();
    // An attachment on its own is a legitimate message; empty + empty is not.
    if (sending || (!text && !staged.length)) return;

    const attachments = staged;
    staged = [];
    renderStaged();
    composer.clear();

    // A message's content is an ordered parts array — the file parts sit after
    // the text, which is how kai-message renders them under the bubble.
    const parts: MessagePart[] = [
      ...(text ? [{ type: 'text', text } as const] : []),
      ...attachments.map((attachment) => ({ type: 'file', attachment }) as const),
    ];

    const history: ChatMessage[] = [
      ...active().messages,
      { id: crypto.randomUUID(), role: 'user', parts },
    ];
    setMessages(history);

    // First real message names the conversation.
    if (active().title === 'New chat') {
      active().title = text
        ? text.slice(0, 40)
        : (attachments[0]?.filename ?? 'Attachment');
      title.textContent = active().title;
    }
    renderRail();

    setBusy(true);
    feedback.hidden = true;

    // createAssistantStream appends the in-flight assistant message and folds
    // every delta onto the right part, handing back a fresh array each time.
    const stream = createAssistantStream((update) => setMessages(update(active().messages)));

    try {
      const prompt = text || (attachments[0]?.filename ?? '');
      const result = await readOpenAIStream(mockResponse(prompt), stream);
      if (result.error) notify(`Model error: ${result.error.message}`, { variant: 'error' });

      // The mock announces tool calls but nothing executes them, so the panel
      // would sit in `input-available` forever. Resolve each one here — the
      // same place a real app would put its tool result.
      for (const call of result.toolCalls) {
        stream.upsertTool(call.id, {
          state: 'output-available',
          output: {
            note: 'Local stub result — the mock responder announces the call, this app answers it.',
            query: call.input?.query ?? call.argumentsText,
          },
        });
      }
    } catch (error) {
      // abort() settles the message AND puts the reason where the user can see
      // it, instead of leaving a permanently blank bubble.
      stream.abort(
        error instanceof Error && error.message ? error.message : 'Request failed',
      );
      notify('The reply failed.', { variant: 'error' });
      console.error(error);
    } finally {
      stream.done(); // settles the turn; sink calls after this are dropped
      setBusy(false);
      feedback.hidden = false;
      renderRail();
    }
  }

  function setBusy(busy: boolean) {
    sending = busy;
    thread.loading = busy;
    composer.loading = busy;
    sendBtn.disabled = busy;
  }

  // ── message actions & feedback ────────────────────────────────────────────

  thread.addEventListener('kai-message-action', (event) => {
    const { action, state } = (event as CustomEvent<{
      messageId: string;
      action: string;
      state?: 'on' | 'off';
    }>).detail;
    if (action === 'copy') notify('Copied to clipboard');
    else if (state === 'on') notify(action === 'like' ? 'Marked helpful' : 'Marked unhelpful');
  });

  feedback.categories = ['Wrong answer', 'Too slow', 'Missed my attachment', 'Other'];

  feedback.addEventListener('kai-feedback', (event) => {
    const { value } = (event as CustomEvent<{ value: 'helpful' | 'not-helpful' }>).detail;
    if (value === 'helpful') notify('Thanks for the feedback', { variant: 'success' });
  });

  feedback.addEventListener('kai-feedback-detail', (event) => {
    const { category } = (event as CustomEvent<{ category?: string }>).detail;
    notify(category ? `Feedback filed: ${category}` : 'Feedback filed', {
      variant: 'success',
    });
  });

  feedback.addEventListener('kai-close', () => {
    feedback.hidden = true;
  });

  // ── new chat ──────────────────────────────────────────────────────────────

  el<HTMLButtonElement>('new-chat').addEventListener('click', () => {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: 'New chat',
      messages: [],
    };
    conversations.unshift(conversation);
    select(conversation.id);
  });

  // ── boot ──────────────────────────────────────────────────────────────────

  renderRail();
  renderStaged();
  select(activeId);
}

void main();
