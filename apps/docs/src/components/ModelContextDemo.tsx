/** Models & context demo — mounts a single <kai-chat> wired through its built-in
 *  header controls: the `models` + `currentModel` props render the model
 *  switcher dropdown, and the `context` property renders a live token-usage
 *  meter. Switching models swaps the active label (and the window size, since
 *  each model has a different max). Sending a message streams a reply and
 *  bumps `usedTokens` so the meter visibly fills. Everything is set as JS
 *  PROPERTIES after kit load — never attributes. */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { loadKit } from './example/kit';

interface ModelOption {
  id: string;
  name: string;
  provider?: string;
}

interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
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
  chatTitle?: string;
  placeholder?: string;
  suggestions?: string[];
  height?: string;
  /** Override the switcher list — e.g. to span providers. Defaults to the Anthropic set. */
  models?: ModelOption[];
}

const MODELS: ModelOption[] = [
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', provider: 'Anthropic' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'Anthropic' },
];

// Each model exposes a different context window — switching models rescales
// the meter, so the same conversation reads as a different fraction full.
const MAX_TOKENS: Record<string, number> = {
  'claude-opus-4-8': 200_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-haiku-4-5': 200_000,
};

// Dollars per 1M output tokens, used to grow the running cost estimate.
const COST_PER_MTOK: Record<string, number> = {
  'claude-opus-4-8': 15,
  'claude-sonnet-4-6': 3,
  'claude-haiku-4-5': 0.8,
};

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'u1',
    role: 'user',
    parts: [{ type: 'text', text: 'Summarize the quarterly board deck and flag anything that needs a decision.' }],
  },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text:
          "Here's the gist of the deck:\n\n" +
          '- **Revenue** is up 18% QoQ, driven mostly by the enterprise tier.\n' +
          '- **Net retention** held at 112% — healthy, but down two points from last quarter.\n' +
          '- **Cash runway** is 14 months at the current burn.\n\n' +
          'One slide needs a decision: the proposed pricing change on slide 22 would lift ARPU but the model assumes flat churn, which the retention dip contradicts. Worth pressure-testing before the vote.',
      },
    ],
    actions: ['copy', 'like', 'dislike'],
  },
];

const SEED_USED = 12_400;

const REPLY =
  "Good question. I pulled the three load-bearing assumptions behind that pricing slide:\n\n" +
  '1. **Churn stays flat** at 1.8% monthly — the retention dip suggests modeling 2.1% instead.\n' +
  '2. **No discount cannibalization** from the existing annual plans, which is optimistic given the overlap.\n' +
  '3. **Seat expansion continues at trend**, even though the last two cohorts expanded slower.\n\n' +
  'Re-running with the more conservative churn drops the ARPU lift from 14% to about 9% — still positive, but no longer a slam dunk. I would bring both scenarios to the vote rather than the single headline number.';

let uid = 0;
const nextId = () => `mc${++uid}`;

export default function ModelContextDemo(props: Props) {
  let host:
    | (HTMLElement & {
        messages?: ChatMessage[];
        models?: ModelOption[];
        currentModel?: string;
        context?: ContextUsage;
        [k: string]: unknown;
      })
    | undefined;
  const [, setReady] = createSignal(false);
  let timer: number | undefined;

  // Track usage in a closure so each turn grows from the last total.
  const modelList = props.models ?? MODELS;
  let modelId = modelList[0].id;
  let usedTokens = SEED_USED;

  const theme = () => document.documentElement.dataset.theme || 'light';

  const pushContext = () => {
    if (!host) return;
    const maxTokens = MAX_TOKENS[modelId] ?? 200_000;
    const inputTokens = Math.round(usedTokens * 0.62);
    const outputTokens = usedTokens - inputTokens;
    const estimatedCost = +((outputTokens / 1_000_000) * (COST_PER_MTOK[modelId] ?? 3)).toFixed(2);
    // Reassign a fresh object so the property setter re-renders the meter.
    host.context = { usedTokens, maxTokens, inputTokens, outputTokens, estimatedCost };
  };

  const onModelChange = (e: Event) => {
    const next = (e as CustomEvent<{ modelId: string }>).detail?.modelId;
    if (!next || !host) return;
    modelId = next;
    host.currentModel = next;
    // Rescaling the window against the new max repaints the meter fraction.
    pushContext();
  };

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

    // The prompt itself consumes context immediately.
    usedTokens += Math.round(text.length / 3.5) + 60;
    pushContext();

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
      // Each streamed chunk adds output tokens — the meter fills as we go.
      usedTokens += 70;
      pushContext();
      if (!done) {
        timer = window.setTimeout(tick, 40);
      } else {
        (host as any).loading = false;
      }
    };
    timer = window.setTimeout(tick, 240);
  };

  onMount(async () => {
    await loadKit();

    if (!host) return;
    customElements.upgrade(host);
    host.messages = SEED_MESSAGES;
    host.models = modelList;
    host.currentModel = modelId;
    pushContext();
    if (props.suggestions) (host as any).suggestions = props.suggestions;
    if (props.chatTitle) (host as any).chatTitle = props.chatTitle;
    if (props.placeholder) (host as any).placeholder = props.placeholder;
    host.setAttribute('theme', theme());
    host.addEventListener('kai-submit', onSubmit);
    host.addEventListener('kai-model-change', onModelChange);

    setReady(true);

    const obs = new MutationObserver(() => {
      host?.setAttribute('theme', theme());
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    onCleanup(() => {
      clearTimeout(timer);
      host?.removeEventListener('kai-submit', onSubmit);
      host?.removeEventListener('kai-model-change', onModelChange);
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
    </div>
  );
}
