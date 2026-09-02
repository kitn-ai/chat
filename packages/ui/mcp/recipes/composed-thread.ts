import type { CodeRecipe } from './types';

/**
 * composed-thread — a chat surface hand-composed from standalone elements,
 * with `<kai-chat>` deliberately absent (rung-6 finding F-49).
 *
 * PROVENANCE: derived from the rung-6 clean-room build
 * (docs/superpowers/research/2026-08-25-rung-6-front-door/app on main), which
 * was independently smoke-verified 22/22 — with its ONE recorded defect
 * corrected before it became a teaching artifact: the builder shipped
 * `AttachmentData.url = URL.createObjectURL(file)` (finding F-44, the exact
 * PR #186 defect), and this recipe stages every picked file as a `data:` URI
 * instead, the pattern `src/elements/default-input.tsx` uses and the wire
 * encoders require. `verify:scaffold` compiles the module below with a stock
 * consumer tsconfig AND asserts the object-URL line has not grown back.
 *
 * The catalog half of this recipe — ingredients, wiring edges, invariants —
 * lives in `../catalog/surfaces.ts` under the same id, where every edge is
 * EXECUTED by surfaces.test.ts. This module carries what a data record cannot:
 * the complete, compiling host code.
 */
export const composedThread: CodeRecipe = {
  id: 'composed-thread',
  title: 'Hand-composed thread (no kai-chat)',
  intent:
    'A full chat surface composed from standalone elements — kai-thread renders the ' +
    'transcript, kai-composer takes input, kai-attachments stages files, kai-toast-region ' +
    'notifies, kai-conversation-item rows form the rail — with a host module doing every ' +
    'bit of wiring (host-coordinates: the kit has no store). Streams through ' +
    'createAssistantStream + createMockResponder, so it runs with no backend and no key; ' +
    'swapping the mock for a real /api/chat changes one line.',
  ingredients: [
    'kai-thread',
    'kai-composer',
    'kai-attachments',
    'kai-toast-region',
    'kai-conversation-item',
    'kai-feedback-bar',
  ],
  notes: [
    '`<kai-composer>` is the BARE editing surface — no send button, no attachments. The ' +
      'paperclip, the hidden file input, the staging tray and the send button here are the ' +
      "host's. For the batteries-included composer row, use `<kai-prompt-input>` instead.",
    'Attachments are staged as `data:` URIs, NEVER as object URLs (`createObjectURL`). A ' +
      '`blob:` URL resolves only inside the tab that minted it; `toOpenAIMessages` / ' +
      '`toAnthropicMessages` refuse it with a written reason, and before they refused it an ' +
      'attachment-only turn reached the model as nothing at all.',
    'The HOST resolves tool calls. The mock (like a real provider) only ANNOUNCES one — ' +
      'walk `result.toolCalls` after the read and call `stream.upsertTool(id, { state: ' +
      "'output-available', output })`, or the panel sits at input-available forever.",
    'The toast region is driven as DATA (`toasts` property, `kai-dismiss` event) because ' +
      'this app places its own `<kai-toast-region>` and owns the array. Note: `toast()` ' +
      'ADOPTS a markup-placed region (it creates its own only when none exists) and binds ' +
      'its store over `toasts`, replacing a data-driven array — so per region, own the ' +
      'array or call `toast()`, not both.',
    'A standalone `<kai-conversation-item>` (outside `<kai-conversations>`) activates ' +
      'itself: its body is a tabbable button and click / Enter / Space fire `kai-select` ' +
      'on the item with `{ id }` (non-bubbling — listen on the item). What it does NOT ' +
      "carry is the container's list story — roving tabindex and arrow-key traversal " +
      'stay yours in a hand-rolled rail.',
    '`<kai-thread>` fills the height its parent gives it and scrolls internally, which is ' +
      'why `.pane` is a flex column and `.thread` is `flex: 1; min-height: 0`.',
  ],
  files: [
    {
      path: 'index.html',
      lang: 'html',
      code: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Composed thread</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <!-- The thread is composed by hand from standalone kai-* elements;
         the kai-chat drop-in is deliberately absent from this app. -->
    <div class="app">
      <aside class="rail">
        <div class="rail-head">
          <span class="rail-title">Conversations</span>
          <button id="new-chat" class="ghost-btn" type="button">New</button>
        </div>
        <!-- kai-conversation-item rows are created in src/main.ts -->
        <nav id="conversations" class="rail-list" aria-label="Conversations"></nav>
      </aside>

      <main class="pane">
        <header class="pane-head">
          <h1 id="pane-title">New chat</h1>
          <span class="badge">mock responder — no provider contacted</span>
        </header>

        <kai-thread id="thread" class="thread" prose-size="sm">
          <div slot="empty" class="empty">
            <strong>Compose a message</strong>
            <p>Attach a file with the paperclip and send it — it renders on your message.</p>
          </div>
        </kai-thread>

        <!-- Shown once an assistant turn settles. -->
        <kai-feedback-bar
          id="feedback"
          class="feedback"
          hidden
          bar-title="Was this reply helpful?"
          collect-detail
          detail-title="What went wrong?"
          detail-placeholder="Optional details…"
          submit-label="Send feedback"
          thanks-message="Thanks — logged locally."
        ></kai-feedback-bar>

        <div class="composer-bar">
          <!-- Staged (not yet sent) attachments. kai-composer has no attachment
               support of its own, so the tray + the picker below are ours. -->
          <kai-attachments
            id="staged"
            class="staged"
            variant="inline"
            removable
            hover-card
            show-media-type
            hidden
          ></kai-attachments>

          <div class="composer-row">
            <button id="attach" class="icon-btn" type="button" title="Attach a file" aria-label="Attach a file">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <input id="file-input" type="file" multiple hidden />
            <kai-composer
              id="composer"
              class="composer"
              placeholder="Ask anything…  (Enter to send)"
            ></kai-composer>
            <button id="send" class="send-btn" type="button">Send</button>
          </div>
        </div>
      </main>
    </div>

    <!-- Placed explicitly rather than letting toast() auto-mount one. -->
    <kai-toast-region id="toasts" position="bottom-right" appearance="card"></kai-toast-region>

    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    },
    {
      path: 'src/main.ts',
      lang: 'ts',
      code: `// The whole app: a chat surface composed by hand from standalone kai-*
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
    'Hey — this thread is composed from standalone \`kai-*\` elements: ' +
      '\`kai-thread\` for the transcript, \`kai-composer\` for input, and a host ' +
      'module wiring them together.\\n\\nAttach a file with the paperclip and send it.',
    'Got it. Anything you attach is staged in \`kai-attachments\` next to the ' +
      'composer, then rides along as a \`file\` part on the message you send.',
    {
      text: 'Let me look that up.',
      toolCalls: [
        { name: 'search_docs', arguments: { query: 'composing a kai thread', limit: 3 } },
      ],
    },
    'Streaming, tool calls, attachments and toasts all run through the same ' +
      'host wiring — swapping the mock for a real \`/api/chat\` changes one line.',
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

/** A picked File as a \`data:\` URI — the ONE form every consumer of
 *  \`AttachmentData.url\` accepts.
 *
 *  NOT an object URL: a \`blob:\` URL resolves only inside the tab that minted
 *  it, so it renders a perfect preview here and is meaningless to anything
 *  downstream — \`toOpenAIMessages\` / \`toAnthropicMessages\` refuse it with a
 *  written reason, and before they refused it an attachment-only turn reached
 *  the model as nothing at all. A data URI previews identically, survives a
 *  reload, needs no revocation bookkeeping, and is what both providers take. */
const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read ' + file.name));
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
  // places its own <kai-toast-region> and owns the list. Don't ALSO call
  // toast(): it would adopt this region and bind its own store over the
  // toasts property, replacing the array this module owns.
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
          ? conversation.messages.length + ' messages'
          : 'Empty';
        row.append(meta);

        // Standalone rows activate THEMSELVES: outside <kai-conversations>
        // the item's body is a tabbable button and click / Enter / Space fire
        // kai-select on the item (non-bubbling — listen on the row, and take
        // the id from detail rather than re-deriving it). What standalone rows
        // do not get is the container's LIST story: roving tabindex and
        // arrow-key traversal stay yours in a hand-rolled rail.
        row.addEventListener('kai-select', (e) => {
          select((e as CustomEvent<{ id: string }>).detail.id);
        });
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
        picked.length === 1 ? 'Attached ' + picked[0].name : 'Attached ' + picked.length + ' files',
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
      if (result.error) notify('Model error: ' + result.error.message, { variant: 'error' });

      // The mock announces tool calls but nothing executes them, so the panel
      // would sit in \`input-available\` forever. Resolve each one here — the
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
    notify(category ? 'Feedback filed: ' + category : 'Feedback filed', {
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
`,
    },
    {
      path: 'src/styles.css',
      lang: 'css',
      code: `:root {
  color-scheme: light;
  --rail-w: 15rem;
}

* { box-sizing: border-box; }

html, body { height: 100%; }

body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--color-background, #fff);
  color: var(--color-foreground, #111);
}

.app {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: var(--rail-w) 1fr;
  text-align: start;
  /* Stays below the toast region's z-index (var(--kai-toast-z, 100)). */
  z-index: 90;
}

/* ── sidebar ─────────────────────────────────────────────── */

.rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-muted, #fafafa);
}

.rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 0.75rem 0.5rem;
}

.rail-title {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;
}

.rail-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 0.5rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

kai-conversation-item { display: block; }
kai-conversation-item::part(row) { border-radius: 0.5rem; }

/* ── main pane ───────────────────────────────────────────── */

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.pane-head {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border, #e5e5e5);
}

.pane-head h1 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.badge {
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--color-border, #e5e5e5);
  opacity: 0.7;
}

/* kai-thread fills the height its parent gives it and scrolls internally,
   so the pane is a flex column and the thread is the flexing row. */
.thread {
  display: block;
  flex: 1;
  min-height: 0;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 3rem 1rem;
  text-align: center;
  font-size: 0.875rem;
  opacity: 0.75;
}

.empty p { margin: 0; }

.feedback {
  display: block;
  padding: 0 1rem 0.5rem;
}

.feedback[hidden] { display: none; }

/* ── composer ────────────────────────────────────────────── */

.composer-bar {
  border-top: 1px solid var(--color-border, #e5e5e5);
  padding: 0.625rem 1rem 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.staged { display: block; }
.staged[hidden] { display: none; }

.composer-row {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}

.composer {
  display: block;
  flex: 1;
  min-width: 0;
}

.icon-btn,
.send-btn,
.ghost-btn {
  font: inherit;
  cursor: pointer;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-background, #fff);
  color: inherit;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  flex: none;
}

.send-btn {
  height: 2.25rem;
  padding: 0 0.875rem;
  flex: none;
  font-weight: 600;
  background: var(--color-primary, #111);
  color: var(--color-primary-foreground, #fff);
  border-color: transparent;
}

.send-btn:disabled { opacity: 0.5; cursor: default; }

.ghost-btn {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.icon-btn:hover,
.ghost-btn:hover { background: var(--color-accent, #f0f0f0); }
`,
    },
  ],
};
