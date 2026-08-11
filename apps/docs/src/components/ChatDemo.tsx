/** Reusable live chat demo. Mounts <kai-chat>, seeds it, and scripts a canned
 *  STREAMING assistant reply on submit — so Examples/Patterns pages show a
 *  working chat with no backend. The same island powers the drop-in, docked,
 *  and custom-themed demos by varying props. */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { loadKit } from './example/kit';

interface ToolPart {
  type: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  toolCallId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string; label?: string }
  | { type: 'tool'; tool: ToolPart };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  actions?: string[];
}

interface Props {
  messages?: ChatMessage[];
  suggestions?: string[];
  models?: { id: string; name: string; provider?: string }[];
  currentModel?: string;
  context?: Record<string, number>;
  chatTitle?: string;
  placeholder?: string;
  proseSize?: 'xs' | 'sm' | 'base' | 'lg';
  /** Canned assistant reply — a string, or a fn of the user's prompt. */
  reply?: string | ((prompt: string) => string);
  /** Fixed height for the chat frame (it fills its container). */
  height?: string;
  /** CSS custom-property overrides applied to the host (a custom theme). */
  themeVars?: Record<string, string>;
}

const DEFAULT_REPLY =
  "Good question. The short version:\n\n- **AI/UI** is a set of framework-agnostic web components.\n- Each one is isolated in its own Shadow DOM, so styles never leak.\n- You bring the model; the UI — streaming, markdown, tool calls — is handled.\n\nEdit a message and send again to see it stream.";

let uid = 0;
const nextId = () => `m${++uid}`;

export default function ChatDemo(props: Props) {
  let host: (HTMLElement & { messages?: ChatMessage[]; [k: string]: unknown }) | undefined;
  const [, setReady] = createSignal(false);
  let timer: number | undefined;
  const theme = () => document.documentElement.dataset.theme || 'light';
  const replyFor = (p: string) => (typeof props.reply === 'function' ? props.reply(p) : props.reply ?? DEFAULT_REPLY);

  const onSubmit = (e: Event) => {
    const text = (e as CustomEvent).detail?.value?.trim();
    if (!text || !host) return;
    const aId = nextId();
    host.messages = [
      ...(host.messages ?? []),
      { id: nextId(), role: 'user', parts: [{ type: 'text', text }] },
      { id: aId, role: 'assistant', parts: [] },
    ];
    (host as any).loading = true;
    const words = replyFor(text).split(/(\s+)/);
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

  onMount(async () => {
    await loadKit();
    if (!host) return;
    customElements.upgrade(host);
    host.messages = props.messages ?? [];
    if (props.suggestions) (host as any).suggestions = props.suggestions;
    if (props.models) (host as any).models = props.models;
    if (props.context) (host as any).context = props.context;
    for (const k of ['currentModel', 'chatTitle', 'placeholder', 'proseSize'] as const) {
      if (props[k] != null) (host as any)[k] = props[k];
    }
    if (props.themeVars) for (const [k, v] of Object.entries(props.themeVars)) host.style.setProperty(k, v);
    host.setAttribute('theme', theme());
    host.addEventListener('kai-submit', onSubmit);
    setReady(true);
    const obs = new MutationObserver(() => host?.setAttribute('theme', theme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    onCleanup(() => { clearTimeout(timer); host?.removeEventListener('kai-submit', onSubmit); obs.disconnect(); });
  });

  return (
    <div class="not-content my-5 overflow-hidden rounded-xl border border-line bg-surface" style={{ height: props.height ?? '560px' }}>
      {/* @ts-expect-error custom element */}
      <kai-chat ref={(el: HTMLElement) => (host = el as any)} style={{ display: 'block', height: '100%' }} />
    </div>
  );
}
