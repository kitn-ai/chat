import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onSettled, onCleanup } from 'solid-js';
import './register'; // side effect: registers <kai-message>, <kai-source>, …
import { attachKaiActions } from '../stories/docs/story-actions';
import { textMessage } from '../state';
import type { ChatMessage } from './chat-types';

// The web components are custom DOM elements, so declare the tags for JSX.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-message': JSX.HTMLAttributes<HTMLElement>;
      'kai-source': JSX.HTMLAttributes<HTMLElement> & { href?: string; label?: string; headline?: string; description?: string; 'show-favicon'?: boolean | '' };
    }
  }
}

// --- Sample data ----------------------------------------------------------

const userMessage: ChatMessage = textMessage(
  'user',
  'Which model handled this, and what did it cost?',
  { id: 'm-u' },
);

const assistantMessage: ChatMessage = {
  id: 'm-a',
  role: 'assistant',
  parts: [
    { type: 'reasoning', text: 'Compare the two sources, reconcile the figures, then summarise.', label: 'Reasoning' },
    {
      type: 'text',
      text: 'Here is the summary you asked for. I cross-checked two sources before answering, and the citations are below.',
    },
  ],
  actions: ['copy', 'like', 'dislike', 'regenerate'],
};

// --- Slotted regions (consumer light-DOM markup) --------------------------

/** A model-name + timestamp header, the `before-body` slot. */
function ModelHeader(props: { model: string; at: string }) {
  return (
    <div slot="before-body" class="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
      <span class="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 font-medium text-foreground">
        <span class="size-1.5 rounded-full bg-emerald-500" />
        {props.model}
      </span>
      <span>{props.at}</span>
    </div>
  );
}

/** A citation/sources row + a token-cost line, the `after-body` slot. */
function SourcesFooter() {
  return (
    <div slot="after-body" class="mt-2 flex flex-col gap-1.5">
      <kai-source
        href="https://kitn.ai"
        label="kitn.ai"
        headline="kitn.ai, composable chat UI"
        description="Framework-agnostic web components for AI chat."
        show-favicon
      />
      <span class="text-[11px] text-muted-foreground">gpt-style-2 · 1,284 tokens · $0.012 · 1.9s</span>
    </div>
  );
}

/** A custom avatar that REPLACES the built-in rail, the `avatar` slot. */
function CustomAvatar() {
  return (
    <div
      slot="avatar"
      class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 text-xs font-semibold text-white shadow-sm"
    >
      AI
    </div>
  );
}

// --- The custom thread ----------------------------------------------------

/** A hand-built message thread that wires up all three `<kai-message>` seams. */
function ComposedThread() {
  let userEl: (HTMLElement & { message?: ChatMessage }) | undefined;
  let assistantEl: (HTMLElement & { message?: ChatMessage }) | undefined;
  // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
  // and register them once at the owner scope (same lifecycle as 1.x).
  const settledDisposers: (() => void)[] = [];
  onCleanup(() => { for (const d of settledDisposers) d(); });
  onSettled(() => {
    if (userEl) {
      userEl.setAttribute('avatar', 'none');
      userEl.message = userMessage;
      settledDisposers.push(attachKaiActions(userEl)); // log kai-message-action
    }
    if (assistantEl) {
      assistantEl.message = assistantMessage;
      // Log kai-message-action (copy / like / dislike / regenerate clicks).
      settledDisposers.push(attachKaiActions(assistantEl));
    }
  });
  return (
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      {/* A user turn: no avatar rail (predictable full-width body). */}
      <kai-message ref={(e) => (userEl = e as HTMLElement)} style={{ display: 'block' }} />

      {/* An assistant turn using every seam: a custom avatar (REPLACE), a
          before-body model header (INJECT, above the content), and an
          after-body sources + cost row (INJECT, below the action bar). */}
      <kai-message ref={(e) => (assistantEl = e as HTMLElement)} style={{ display: 'block' }}>
        <CustomAvatar />
        <ModelHeader model="gpt-style-2" at="just now" />
        <SourcesFooter />
      </kai-message>
    </div>
  );
}

const HTML_SNIPPET = `<!-- Compose your own message list: one <kai-message> per turn -->
<kai-message id="turn" style="display:block;">
  <!-- avatar (replace): your node stands in for the built-in rail -->
  <div slot="avatar" class="avatar">AI</div>

  <!-- before-body (inject): a per-message header above the content -->
  <div slot="before-body" class="model-label">gpt-style-2 · just now</div>

  <!-- after-body (inject): a citation row below the action bar -->
  <div slot="after-body">
    <kai-source href="https://kitn.ai" label="kitn.ai" show-favicon></kai-source>
  </div>
</kai-message>

<script type="module">
  import '@kitn.ai/ui/elements';   // registers the custom elements
  const turn = document.getElementById('turn');
  turn.message = {
    id: 'm-a', role: 'assistant',
    parts: [{ type: 'text', text: 'Here is the summary you asked for.' }],
    actions: ['copy', 'like', 'regenerate'],
  };
  // The action bar emits a non-bubbling CustomEvent on the element.
  turn.addEventListener('kai-message-action', (e) => console.log(e.detail));
</script>`;

const meta = {
  title: 'Labs/Message Thread',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          [
            'A **compose-your-own message list** built from standalone `<kai-message>` elements: the keystone of laying out a thread yourself while keeping the kit\'s rich message rendering. This Labs story exercises the three per-message composition seams.',
            '**Slots:** `before-body` (INJECT, a per-message header above the content: a model-name label, a role/timestamp line), `after-body` (INJECT, a row below the action bar: a citation/sources row, a token-cost line), and `avatar` (REPLACE, your node stands in for the built-in avatar rail; pair with `avatar="none"` to omit the rail entirely).',
            '**Parts:** `::part(row)`, `::part(bubble)`, `::part(content)`, `::part(actions)`, and `::part(avatar)` are exposed for outside-the-shadow styling.',
            'See the **Code** tab for the HTML.',
          ].join('\n\n'),
      },
      source: { code: HTML_SNIPPET, language: 'html' },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** A two-turn thread: a no-avatar user turn, then an assistant turn wiring up
 *  the `avatar`, `before-body`, and `after-body` seams. */
export const ComposedMessageThread: Story = {
  name: 'Per-message slots (header, sources, avatar)',
  render: () => <ComposedThread />,
};
