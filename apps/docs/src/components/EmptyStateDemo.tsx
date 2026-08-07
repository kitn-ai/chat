/** Empty / first-run state demo. Showcases a *composed* empty state:
 *  a <kai-empty> block (icon + headline + subtext) with <kai-suggestions>
 *  rendered INSIDE it (the default slot). Clicking a chip swaps the empty
 *  block for a live <kai-chat> and streams a canned assistant reply — the
 *  same streaming loop as the other Patterns/Examples islands. */
import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { loadKit } from './example/kit';
import IconSparkles from '~icons/lucide/sparkles';

interface MessagePart {
  type: 'text';
  text: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  actions?: string[];
}

const SUGGESTIONS = [
  'How do I add AI/UI to a React app?',
  'Theme the components to match my brand',
  'Stream tokens from my own backend',
  'Render tool calls and citations',
];

const REPLIES: Record<string, string> = {
  'How do I add AI/UI to a React app?':
    'Install the package, then import the React adapter:\n\n```bash\nnpm i @kitn.ai/ui\n```\n\n```tsx\nimport { Chat } from \'@kitn.ai/ui/react\';\n\nexport default function App() {\n  return <Chat messages={messages} onSubmit={send} />;\n}\n```\n\nThe adapter wraps the same `kai-*` web components, so every prop and event maps straight through.',
  'Theme the components to match my brand':
    'Every component reads from design tokens, so one block of CSS custom properties restyles the whole kit:\n\n```css\n:root {\n  --color-brand: oklch(0.62 0.21 13);\n  --color-surface: oklch(0.99 0 0);\n  --radius: 0.75rem;\n}\n```\n\nNo shadow-piercing and no per-component overrides — set the tokens once and every `kai-*` element follows.',
  'Stream tokens from my own backend':
    'Listen for `kai-submit`, append a placeholder assistant message, then patch its `parts` as chunks arrive:\n\n```js\nchat.addEventListener(\'kai-submit\', async (e) => {\n  const id = crypto.randomUUID();\n  chat.messages = [...chat.messages, { id, role: \'assistant\', parts: [] }];\n  let text = \'\';\n  for await (const token of stream(e.detail.value)) {\n    text += token;\n    chat.messages = chat.messages.map((m) =>\n      m.id === id ? { ...m, parts: [{ type: \'text\', text }] } : m,\n    );\n  }\n});\n```\n\nReassigning the `messages` array is what triggers the re-render — mutate-and-reassign, never mutate in place.',
  'Render tool calls and citations':
    'A message\'s `parts` array carries more than text. Add a `{ type: \'reasoning\', text }` part for chain-of-thought, a `{ type: \'tool\', tool }` part for tool invocations, and pair `<kai-chat>` with `<kai-sources>` for numbered citations:\n\n```js\nmsg.parts = [...msg.parts, { type: \'tool\', tool: { type: \'search\', state: \'output-available\', output: { … } } }];\nsources.numbered = true;\nsources.sources = [{ href, title }];\n```\n\nEach part renders in its own collapsible, theme-aware block, in the order it appears — no extra wiring.',
};

const DEFAULT_REPLY =
  "Here's the short version: AI/UI is a set of framework-agnostic web components, each isolated in its own Shadow DOM so styles never leak. You bring the model; the UI — streaming, markdown, tool calls — is handled for you.";

let uid = 0;
const nextId = () => `e${++uid}`;

export default function EmptyStateDemo() {
  let host: (HTMLElement & { messages?: ChatMessage[]; [k: string]: unknown }) | undefined;
  let suggestionsEl: (HTMLElement & { suggestions?: string[]; [k: string]: unknown }) | undefined;
  const [started, setStarted] = createSignal(false);
  let timer: number | undefined;

  const theme = () => document.documentElement.dataset.theme || 'light';

  const stream = (prompt: string) => {
    if (!host) return;
    const reply = REPLIES[prompt] ?? DEFAULT_REPLY;
    const aId = nextId();
    host.messages = [
      ...(host.messages ?? []),
      { id: nextId(), role: 'user', parts: [{ type: 'text', text: prompt }] },
      { id: aId, role: 'assistant', parts: [] },
    ];
    (host as any).loading = true;
    const words = reply.split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);
    const tick = () => {
      i += 2;
      const partial = words.slice(0, i).join('');
      const done = i >= words.length;
      host!.messages = (host!.messages ?? []).map((m) =>
        m.id === aId ? { ...m, parts: [{ type: 'text', text: partial }], ...(done ? { actions: ['copy', 'like', 'dislike'] } : {}) } : m,
      );
      if (!done) timer = window.setTimeout(tick, 38);
      else (host as any).loading = false;
    };
    timer = window.setTimeout(tick, 240);
  };

  // Start the conversation from a suggestion clicked inside the empty block.
  const start = (prompt: string) => {
    if (!prompt || started()) return;
    setStarted(true);
    // Wait for <kai-chat> to mount, then seed + stream.
    queueMicrotask(() => {
      if (!host) return;
      customElements.upgrade(host);
      host.messages = [];
      host.setAttribute('theme', theme());
      stream(prompt);
    });
  };

  const onSuggestionSelect = (e: Event) => start((e as CustomEvent).detail?.value?.trim());
  const onChatSubmit = (e: Event) => {
    const text = (e as CustomEvent).detail?.value?.trim();
    if (text) stream(text);
  };

  onMount(async () => {
    await loadKit();
    if (suggestionsEl) {
      customElements.upgrade(suggestionsEl);
      suggestionsEl.suggestions = SUGGESTIONS;
    }
    const obs = new MutationObserver(() => host?.setAttribute('theme', theme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    onCleanup(() => {
      clearTimeout(timer);
      suggestionsEl?.removeEventListener('kai-select', onSuggestionSelect);
      host?.removeEventListener('kai-submit', onChatSubmit);
      obs.disconnect();
    });
  });

  return (
    <div class="not-content my-5 overflow-hidden rounded-xl border border-line bg-surface" style={{ height: '560px' }}>
      <Show
        when={started()}
        fallback={
          <div style={{ height: '100%', display: 'flex', 'align-items': 'center', 'justify-content': 'center', padding: '24px' }}>
            {/* @ts-expect-error custom element */}
            <kai-empty
              empty-title="Hi, I'm your assistant"
              description="Ask me anything about AI/UI — or pick a starter below to begin."
              style={{ display: 'block', width: '100%', 'max-width': '34rem' }}
            >
              <IconSparkles slot="media" style={{ width: '1.5rem', height: '1.5rem' }} />
              {/* Suggestions live in the empty block's default slot (EmptyContent),
                  so the chips are part of the first-run composition itself. */}
              {/* @ts-expect-error custom element */}
              <kai-suggestions
                ref={(el: HTMLElement) => {
                  suggestionsEl = el as any;
                  el.addEventListener('kai-select', onSuggestionSelect);
                }}
                variant="outline"
                style={{ display: 'block', 'margin-top': '0.5rem' }}
              />
            </kai-empty>
          </div>
        }
      >
        {/* @ts-expect-error custom element */}
        <kai-chat
          ref={(el: HTMLElement) => {
            host = el as any;
            el.addEventListener('kai-submit', onChatSubmit);
          }}
          chat-title="Assistant"
          placeholder="Ask a follow-up…"
          style={{ display: 'block', height: '100%' }}
        />
      </Show>
    </div>
  );
}
