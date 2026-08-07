/** Landing hero chat — a live <kai-chat> that AUTO-PLAYS a believable agent flow:
 *  reasoning → a tool call (lifecycle states) → a streamed markdown answer → an
 *  interactive generative-UI confirm card (a separate <kai-cards> composed into the
 *  frame, resolved back into the thread). So a visitor immediately sees a working
 *  component doing more than emit text — not a screenshot.
 *
 *  Plays once when the hero scrolls into view, replays on re-entry, then settles;
 *  prefers-reduced-motion renders the finished state. Arrays/objects are set as JS
 *  PROPERTIES on the host; messages are reassigned to a fresh array each tick. */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { loadKit } from '../example/kit';

interface ToolPart {
  type: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  toolCallId: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}
interface MessagePart {
  type: 'text' | 'reasoning' | 'tool';
  text?: string;
  label?: string;
  tool?: ToolPart;
}
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  actions?: string[];
}

const QUESTION =
  'Checkout p99 latency jumped from 180 ms to 920 ms after Tuesday’s deploy — but p50 barely moved. Where do I look?';

const REASONING =
  'p50 flat + p99 up ~5× rules out a global slowdown — a smaller pool or a slower dependency would lift p50 too. That points at a new blocking op on a conditional path, fired by a subset of requests. Pull traces for the slow ones and find what they share.';

const TOOL_INPUT = { service: 'checkout', window: '1h', sort_by: 'p99' };
const TOOL_OUTPUT = {
  slowest_spans: [
    { span: 'db.query checkout_items', ms: 680, calls: 47, note: 'N+1' },
    { span: 'auth.verify', ms: 40, calls: 1 },
    { span: 'serialize', ms: 22, calls: 1 },
  ],
};

const ANSWER =
  'There it is — `db.query checkout_items` ran **47 times** on the slow path: a classic **N+1** from Tuesday’s per-item lookup in the cart loop.';

const FIX_CARD = {
  type: 'confirm',
  id: 'fix-1',
  data: {
    heading: 'Ship the fix?',
    body: 'Batch the per-item lookups into one query, and wrap it in a 250 ms timeout with a cached fallback.',
    actions: [
      { id: 'apply', label: 'Apply & open PR', style: 'primary', default: true },
      { id: 'diff', label: 'Show the diff', style: 'default' },
    ],
  },
};

const FOLLOWUP =
  'Good instinct. The batched query collapses it to a single round-trip; the timeout just keeps one bad minute from stalling checkout while the cache warms.';

// Small inline tile icon for a plugin pill (Codex-style).
function tile(fill: string, glyph: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="10" fill="${fill}"/><text x="32" y="44" font-size="34" text-anchor="middle" fill="white">${glyph}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// Entity-pill triggers: `/` skills, `@` agents + plugins. Wired onto the input so
// a visitor can type `/` or `@` and drop atomic pills into the composer.
const TRIGGERS = [
  { char: '/', kind: 'skill', items: [
    { id: 'trace', label: 'trace-analysis', description: 'Analyze distributed traces', promptText: 'Analyze the traces.' },
    { id: 'summarize', label: 'summarize', description: 'Summarize the incident', promptText: 'Summarize the incident.' },
    { id: 'rollback', label: 'rollback', description: 'Draft a rollback plan' },
  ] },
  { char: '@', kind: 'agent', items: [
    { id: 'code-reviewer', label: 'code-reviewer', group: 'Agents', description: 'Reviews diffs for bugs' },
    { id: 'on-call', label: 'on-call', group: 'Agents', description: 'Pages the on-call engineer' },
    { id: 'datadog', label: 'Datadog', kind: 'plugin', group: 'Plugins', description: 'Query metrics & traces', icon: tile('#632ca6', 'D') },
  ] },
];

// An opening draft (skill + agent + plugin pills) seeded into the composer to
// show entity pills off before the conversation plays.
const PILL_DRAFT = [
  { type: 'text', text: 'Use ' },
  { type: 'entity', entity: { kind: 'skill', id: 'trace', label: 'trace-analysis', promptText: 'Analyze the traces.' } },
  { type: 'text', text: ', then ask ' },
  { type: 'entity', entity: { kind: 'agent', id: 'code-reviewer', label: 'code-reviewer' } },
  { type: 'text', text: ' to check it with ' },
  { type: 'entity', entity: { kind: 'plugin', id: 'datadog', label: 'Datadog', icon: tile('#632ca6', 'D') } },
];

let uid = 0;
const nextId = () => `h${++uid}`;

export default function HeroChat() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let host: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cardsEl: any;
  let frameEl: HTMLDivElement | undefined;
  const [cardOpen, setCardOpen] = createSignal(false);
  let runToken = 0;
  let playing = false;
  let timer: number | undefined;
  const theme = () => document.documentElement.dataset.theme || 'dark';

  const wait = (ms: number) => new Promise<void>((r) => { timer = window.setTimeout(r, ms); });

  const assistantFinal = (): ChatMessage => ({
    id: 'a1', role: 'assistant',
    parts: [
      { type: 'reasoning', label: 'Thought for 4s', text: REASONING },
      { type: 'tool', tool: { type: 'query_traces', state: 'output-available', toolCallId: 't1', input: TOOL_INPUT, output: TOOL_OUTPUT } },
      { type: 'text', text: ANSWER },
    ],
    actions: ['copy', 'like', 'dislike'],
  });

  function showCard() {
    if (!cardsEl) return;
    cardsEl.cards = [FIX_CARD];
    cardsEl.setAttribute('theme', theme());
    setCardOpen(true);
  }
  function clearCard() {
    setCardOpen(false);
    window.setTimeout(() => { if (cardsEl) cardsEl.cards = []; }, 360);
  }

  async function play() {
    if (!host) return;
    const my = ++runToken;
    const alive = () => my === runToken;
    const stop = () => { playing = false; };
    playing = true;
    clearCard();
    host.loading = false;
    host.messages = [];

    // Open by showing entity pills in the composer — a skill, an agent, a plugin
    // seeded as a draft — then clear it and play the real conversation.
    host.value = PILL_DRAFT;
    await wait(1700); if (!alive()) { host.value = ''; return stop(); }
    host.value = '';
    await wait(350); if (!alive()) return stop();

    const user: ChatMessage = { id: 'u1', role: 'user', parts: [{ type: 'text', text: QUESTION }] };
    host.messages = [user];

    // Thinking — the reasoning trigger reads "Thinking…", then resolves. Parts
    // stay in order (reasoning -> tool -> text) as each one arrives/updates.
    await wait(650); if (!alive()) return stop();
    host.loading = true;
    let a: ChatMessage = { id: 'a1', role: 'assistant', parts: [{ type: 'reasoning', label: 'Thinking…', text: REASONING }] };
    host.messages = [user, { ...a }];

    await wait(1500); if (!alive()) return stop();
    a = { ...a, parts: [{ type: 'reasoning', label: 'Thought for 4s', text: REASONING }] };
    host.messages = [user, { ...a }];

    // Tool call — running.
    await wait(520); if (!alive()) return stop();
    a = {
      ...a,
      parts: [
        { type: 'reasoning', label: 'Thought for 4s', text: REASONING },
        { type: 'tool', tool: { type: 'query_traces', state: 'input-available', toolCallId: 't1', input: TOOL_INPUT } },
      ],
    };
    host.messages = [user, { ...a }];

    // Tool call — structured result.
    await wait(1300); if (!alive()) return stop();
    a = {
      ...a,
      parts: [
        { type: 'reasoning', label: 'Thought for 4s', text: REASONING },
        { type: 'tool', tool: { type: 'query_traces', state: 'output-available', toolCallId: 't1', input: TOOL_INPUT, output: TOOL_OUTPUT } },
      ],
    };
    host.messages = [user, { ...a }];

    // Stream the answer — the text part is appended after reasoning + tool.
    await wait(560); if (!alive()) return stop();
    const words = ANSWER.split(/(\s+)/);
    for (let i = 2; i <= words.length; i += 2) {
      if (!alive()) return stop();
      a = { ...a, parts: [...a.parts.slice(0, 2), { type: 'text', text: words.slice(0, i).join('') }] };
      host.messages = [user, { ...a }];
      await wait(34);
    }
    if (!alive()) return stop();
    a = { ...a, parts: [...a.parts.slice(0, 2), { type: 'text', text: ANSWER }] }; // ensure the final word lands (odd word count)
    host.messages = [user, { ...a }];
    host.loading = false;

    await wait(160); if (!alive()) return stop();
    a = { ...a, actions: ['copy', 'like', 'dislike'] };
    host.messages = [user, { ...a }];

    // The generative-UI card rises.
    await wait(520); if (!alive()) return stop();
    showCard();
    playing = false;
  }

  function renderFinal() {
    host.messages = [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: QUESTION }] }, assistantFinal()];
    showCard();
  }

  function applyCardAction(action: string) {
    clearCard();
    const cont: ChatMessage = action === 'apply'
      ? { id: nextId(), role: 'assistant', parts: [{ type: 'text', text: 'Opened **PR #4827** — `fix(checkout): batch cart lookups + 250 ms timeout`. CI is green; p99 is back to **190 ms** in staging.' }], actions: ['copy', 'like', 'dislike'] }
      : { id: nextId(), role: 'assistant', parts: [{ type: 'text', text: 'Here’s the change:\n\n```diff\n- for (const item of cart) {\n-   item.detail = await db.query(itemSql, item.id);   // N+1\n- }\n+ const rows = await db.query(batchSql, cart.map((i) => i.id));\n+ hydrate(cart, rows);\n```' }], actions: ['copy', 'like', 'dislike'] };
    host.messages = [...(host.messages ?? []), cont];
  }

  const onSubmit = (e: Event) => {
    const text = (e as CustomEvent).detail?.value?.trim();
    if (!text || !host) return;
    runToken++; // stop any autoplay in flight
    clearCard();
    const aId = nextId();
    host.messages = [
      ...(host.messages ?? []),
      { id: nextId(), role: 'user', parts: [{ type: 'text', text }] },
      { id: aId, role: 'assistant', parts: [] },
    ];
    host.loading = true;
    const words = FOLLOWUP.split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);
    const tick = () => {
      i += 2;
      const partial = words.slice(0, i).join('');
      const done = i >= words.length;
      host.messages = (host.messages ?? []).map((m: ChatMessage) =>
        m.id === aId ? { ...m, parts: [{ type: 'text', text: partial }], ...(done ? { actions: ['copy', 'like', 'dislike'] } : {}) } : m,
      );
      if (!done) timer = window.setTimeout(tick, 36);
      else host.loading = false;
    };
    timer = window.setTimeout(tick, 280);
  };

  onMount(async () => {
    await loadKit();
    if (!host) return;
    customElements.upgrade(host);
    if (cardsEl) customElements.upgrade(cardsEl);

    host.chatTitle = 'Support Agent';
    host.placeholder = 'Ask a follow-up…';
    host.triggers = TRIGGERS; // `/` skills, `@` agents/plugins — try typing one
    host.suggestions = ['Show me the trace', 'Draft the migration', 'What’s the rollback?'];
    host.models = [
      { id: 'sonnet', name: 'Claude Sonnet', provider: 'Anthropic' },
      { id: 'gpt', name: 'GPT-4o', provider: 'OpenAI' },
      { id: 'llama', name: 'Llama 3.1', provider: 'Meta' },
    ];
    host.currentModel = 'sonnet';
    host.context = { usedTokens: 24500, maxTokens: 200000 };
    host.setAttribute('theme', theme());
    host.addEventListener('kai-submit', onSubmit);

    if (cardsEl) {
      cardsEl.setAttribute('theme', theme());
      cardsEl.policy = { onAction: (_cardId: string, action: string) => applyCardAction(action) };
    }

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduce) {
      renderFinal();
    } else if (frameEl) {
      // Play once per visibility session. Only reset (to a clean slate) once the
      // frame has FULLY left the viewport — so re-entry replays from scratch and we
      // never flash a stale card or an empty thread while the demo is on screen
      // (which a naive "replay on every re-entry" does when mobile layout shifts).
      let done = false;
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.4) {
            if (!playing && !done) { done = true; void play(); }
          } else if (!e.isIntersecting) {
            runToken++; // cancel any run in flight
            playing = false;
            done = false;
            clearCard();
            if (host) { host.messages = []; host.value = ''; }
          }
        }
      }, { threshold: [0, 0.4, 1] });
      io.observe(frameEl);
      onCleanup(() => io.disconnect());
    }

    const obs = new MutationObserver(() => {
      host?.setAttribute('theme', theme());
      cardsEl?.setAttribute('theme', theme());
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
      ref={(el) => (frameEl = el as HTMLDivElement)}
      class="not-content relative h-full overflow-hidden rounded-2xl border border-line bg-surface"
      style={{ display: 'flex', 'flex-direction': 'column' }}
    >
      {/* @ts-expect-error custom element */}
      <kai-chat ref={(el: HTMLElement) => (host = el)} style={{ display: 'block', flex: '1', 'min-height': '0' }} />
      {/* generative-UI card — floats at the bottom OVER the input at the climax (the
          answer is kept short so the conversation sits clear above it). The agent's
          proposed action replaces the input until it's resolved. */}
      <div
        style={{
          position: 'absolute', left: '10px', right: '10px', bottom: '10px', 'z-index': '5',
          opacity: cardOpen() ? '1' : '0',
          transform: cardOpen() ? 'translateY(0)' : 'translateY(14px)',
          transition: 'opacity .3s ease, transform .42s cubic-bezier(.22,1,.36,1)',
          'pointer-events': cardOpen() ? 'auto' : 'none',
          filter: 'drop-shadow(0 14px 32px rgb(0 0 0 / 0.20))',
        }}
      >
        {/* @ts-expect-error custom element */}
        <kai-cards ref={(el: HTMLElement) => (cardsEl = el)} />
      </div>
    </div>
  );
}
