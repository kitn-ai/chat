/** RAG assistant demo — mounts <kai-chat> for the Q&A thread and a
 *  <kai-sources> strip below the last assistant message to show numbered
 *  inline citations. Sources are a separate element from the chat; they
 *  are set as a JS property after kit load. */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { loadKit } from './example/kit';

interface SourceItem {
  href: string;
  title?: string;
  description?: string;
}

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

interface Props {
  messages?: ChatMessage[];
  sources?: SourceItem[];
  chatTitle?: string;
  placeholder?: string;
  suggestions?: string[];
  height?: string;
}

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'u1',
    role: 'user',
    parts: [{ type: 'text', text: 'How does WebAssembly improve frontend performance compared to JavaScript?' }],
  },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text:
          'WebAssembly runs at near-native speed because browsers execute it as typed bytecode rather than parsing and JIT-compiling text. Three production examples show the gains:\n\n' +
          '1. **Figma** replaced their asm.js rendering pipeline with Wasm and cut load time by **3×** [1].\n' +
          '2. **Google Earth** ported its C++ engine to Wasm and dropped per-frame render time from 40 ms to 12 ms [2].\n' +
          '3. **Shopify** adopted Wasm for Liquid template parsing and saw consistent sub-millisecond parse times on large templates [3].\n\n' +
          'The pattern is the same in each case: move the hot path out of JS into a compiled module, keep the DOM/API calls in JS, and let each layer do what it does best.',
      },
    ],
    actions: ['copy', 'like', 'dislike'],
  },
];

const SEED_SOURCES: SourceItem[] = [
  {
    href: 'https://www.figma.com/blog/webassembly-cut-figmas-load-time-by-3x/',
    title: "WebAssembly cut Figma's load time by 3×",
    description: 'How Figma leveraged WebAssembly to speed up its design tool.',
  },
  {
    href: 'https://web.dev/case-studies/earth-webassembly',
    title: 'Google Earth and WebAssembly',
    description: "Porting Google Earth's C++ rendering engine to the browser via WebAssembly.",
  },
  {
    href: 'https://shopify.engineering/shopify-webassembly',
    title: 'How Shopify Uses WebAssembly',
    description: "Shopify's journey using WebAssembly for fast Liquid template parsing.",
  },
];

let uid = 0;
const nextId = () => `rm${++uid}`;

const REPLY =
  'WebAssembly runs at near-native speed because browsers execute it as typed bytecode rather than parsing and JIT-compiling text. Three production examples show the gains:\n\n' +
  '1. **Figma** replaced their asm.js rendering pipeline with Wasm and cut load time by **3×** [1].\n' +
  '2. **Google Earth** ported its C++ engine to Wasm and dropped per-frame render time from 40 ms to 12 ms [2].\n' +
  '3. **Shopify** adopted Wasm for Liquid template parsing and saw consistent sub-millisecond parse times on large templates [3].\n\n' +
  'The pattern is the same in each case: move the hot path out of JS into a compiled module, keep the DOM/API calls in JS, and let each layer do what it does best.';

export default function RagAssistantDemo(props: Props) {
  let host: (HTMLElement & { messages?: ChatMessage[]; [k: string]: unknown }) | undefined;
  let sourcesEl: (HTMLElement & { sources?: SourceItem[]; numbered?: boolean }) | undefined;
  const [, setReady] = createSignal(false);
  let timer: number | undefined;

  const theme = () => document.documentElement.dataset.theme || 'light';
  const messages = () => props.messages ?? SEED_MESSAGES;
  const sources = () => props.sources ?? SEED_SOURCES;

  const setSources = (el: typeof sourcesEl) => {
    if (!el) return;
    el.sources = sources();
    el.numbered = true;
  };

  const onSubmit = (e: Event) => {
    const text = (e as CustomEvent).detail?.value?.trim();
    if (!text || !host) return;

    // hide sources while the new reply streams in
    if (sourcesEl) sourcesEl.sources = [];

    const aId = nextId();
    host.messages = [
      ...(host.messages ?? []),
      { id: nextId(), role: 'user', parts: [{ type: 'text', text }] },
      { id: aId, role: 'assistant', parts: [] },
    ];
    (host as any).loading = true;

    const words = REPLY.split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);

    const tick = () => {
      i += 2;
      const partial = words.slice(0, i).join('');
      const done = i >= words.length;
      host!.messages = (host!.messages ?? []).map((m) =>
        m.id === aId
          ? { ...m, parts: [{ type: 'text', text: partial }], ...(done ? { actions: ['copy', 'like', 'dislike'] } : {}) }
          : m,
      );
      if (!done) {
        timer = window.setTimeout(tick, 38);
      } else {
        (host as any).loading = false;
        // reveal sources once streaming is done
        if (sourcesEl) setSources(sourcesEl);
      }
    };
    timer = window.setTimeout(tick, 240);
  };

  onMount(async () => {
    await loadKit();

    if (!host) return;
    customElements.upgrade(host);
    host.messages = messages();
    if (props.suggestions) (host as any).suggestions = props.suggestions;
    if (props.chatTitle) (host as any).chatTitle = props.chatTitle;
    if (props.placeholder) (host as any).placeholder = props.placeholder;
    host.setAttribute('theme', theme());
    host.addEventListener('kai-submit', onSubmit);

    if (sourcesEl) {
      customElements.upgrade(sourcesEl);
      setSources(sourcesEl);
    }

    setReady(true);

    const obs = new MutationObserver(() => {
      host?.setAttribute('theme', theme());
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    onCleanup(() => {
      clearTimeout(timer);
      host?.removeEventListener('kai-submit', onSubmit);
      obs.disconnect();
    });
  });

  return (
    <div
      class="not-content my-5 overflow-hidden rounded-xl border border-line bg-surface"
      style={{ height: props.height ?? '600px', display: 'flex', 'flex-direction': 'column' }}
    >
      {/* @ts-expect-error custom element */}
      <kai-chat
        ref={(el: HTMLElement) => (host = el as any)}
        style={{ display: 'block', flex: '1', 'min-height': '0' }}
      />
      <div
        style={{
          'border-top': '1px solid var(--color-line, #e5e7eb)',
          padding: '10px 16px',
          background: 'var(--color-surface, #fff)',
        }}
      >
        {/* @ts-expect-error custom element */}
        <kai-sources ref={(el: HTMLElement) => (sourcesEl = el as any)} />
      </div>
    </div>
  );
}
