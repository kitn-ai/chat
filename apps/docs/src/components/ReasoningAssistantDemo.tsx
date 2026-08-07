/** Reasoning assistant demo — mounts a single <kai-chat> seeded with a
 *  multi-turn debugging dialogue. Every assistant turn carries a `reasoning`
 *  part (collapsible "thought" block) ahead of the final `text` part. On
 *  kai-submit the reply streams word-by-word, then a short reasoning part is
 *  attached once streaming finishes. Arrays are set as JS PROPERTIES on the
 *  host (never attributes); messages are reassigned to a new array each tick. */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { loadKit } from './example/kit';

interface Reasoning {
  text: string;
  label?: string;
}

interface MessagePart {
  type: 'text' | 'reasoning';
  text: string;
  label?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  actions?: string[];
}

interface Props {
  messages?: ChatMessage[];
  chatTitle?: string;
  placeholder?: string;
  suggestions?: string[];
  height?: string;
}

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'u1',
    role: 'user',
    parts: [
      {
        type: 'text',
        text: 'Our checkout p99 latency jumped from 180 ms to 920 ms after Tuesday’s deploy, but p50 barely moved. What’s going on?',
      },
    ],
  },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      {
        type: 'reasoning',
        label: 'Thought for 4s',
        text:
          'p50 flat + p99 spiked means the median request is fine, so this is not a global slowdown (e.g. a smaller pool or a slower dependency would lift p50 too).\n\nThe tail moved by ~5×. That magnitude usually comes from a *new* blocking operation on a conditional path — something that fires for a subset of requests. The deploy is the obvious trigger.\n\nFirst step is to narrow the slice: get traces for the slow requests and find the common attribute.',
      },
      {
        type: 'text',
        text: 'A clean p50 with a blown-out p99 points at a **tail problem**, not a broad regression — something is slow for a small slice of requests, not all of them.\n\nThe most likely culprit in a deploy that left p50 alone: a code path that only some requests hit, now doing extra synchronous work. Start by diffing the Tuesday release for new blocking calls (a DB query, a cache miss path, an N+1) gated behind a condition. Pull a trace for a few of the slow requests and look at what they share.',
      },
    ],
    actions: ['copy', 'like', 'dislike'],
  },
  {
    id: 'u2',
    role: 'user',
    parts: [
      {
        type: 'text',
        text: 'Traces show the slow ones all hit a new “apply promo code” branch that calls the pricing service. p50 requests skip it because most carts have no promo.',
      },
    ],
  },
  {
    id: 'a2',
    role: 'assistant',
    parts: [
      {
        type: 'reasoning',
        label: 'Thought for 5s',
        text:
          'Confirmed: promo branch = the conditional slice, pricing service = the new blocking call. The 700 ms tail is concentrated there.\n\nTwo shapes fit the data: (a) one slow synchronous call, or (b) an N+1 calling pricing per line item. The fix differs, so I need the span count before recommending one.\n\nFor either shape, a timeout + fallback protects checkout latency regardless of root cause — worth recommending now.',
      },
      {
        type: 'text',
        text: 'That fits the symptom exactly: the promo branch is the conditional path, so only promo carts pay the cost — which is why p50 stayed flat.\n\nNext, confirm whether the pricing call itself is slow or whether you’re making **too many** of them. Check the span: one call per request at ~700 ms means the pricing service is the bottleneck; many small calls means an N+1 inside the promo loop. If it’s a single slow call, cache the promo→discount lookup (it changes rarely) and set a tight timeout so a slow pricing response degrades to “no discount” instead of stalling checkout.',
      },
    ],
    actions: ['copy', 'like', 'dislike'],
  },
];

let uid = 0;
const nextId = () => `rm${++uid}`;

const REPLY =
  'Caching the promo lookup is the right call. Key it by promo code, not by cart, so every cart sharing a code reuses the result. Set the TTL to your promo edit cadence — minutes, not seconds — and invalidate on promo updates rather than expiry alone.\n\nPair it with a 150 ms timeout on the pricing call and a fallback that applies no discount and flags the cart for async reconciliation. That caps the tail near p50 even if pricing has a bad minute.';

const REPLY_REASONING: Reasoning = {
  label: 'Thought for 3s',
  text:
    'Cache key matters: keying by cart misses the win because promo codes repeat across carts. Key by code.\n\nTTL should track how often promos change, and an explicit invalidation beats waiting for expiry. Add the timeout + fallback so a cache miss during a pricing blip still bounds latency.',
};

export default function ReasoningAssistantDemo(props: Props) {
  let host: (HTMLElement & { messages?: ChatMessage[]; [k: string]: unknown }) | undefined;
  const [, setReady] = createSignal(false);
  let timer: number | undefined;

  const theme = () => document.documentElement.dataset.theme || 'light';
  const messages = () => props.messages ?? SEED_MESSAGES;

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

    const words = REPLY.split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);

    const tick = () => {
      i += 2;
      const partial = words.slice(0, i).join('');
      const done = i >= words.length;
      host!.messages = (host!.messages ?? []).map((m) =>
        m.id === aId
          ? {
              ...m,
              // reasoning is attached ahead of the text part only once the answer is complete
              parts: done
                ? [{ type: 'reasoning', ...REPLY_REASONING }, { type: 'text', text: partial }]
                : [{ type: 'text', text: partial }],
              ...(done ? { actions: ['copy', 'like', 'dislike'] } : {}),
            }
          : m,
      );
      if (!done) {
        timer = window.setTimeout(tick, 38);
      } else {
        (host as any).loading = false;
      }
    };
    // brief delay so the thinking indicator is visible before tokens arrive
    timer = window.setTimeout(tick, 280);
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
      style={{ height: props.height ?? '640px', display: 'flex', 'flex-direction': 'column' }}
    >
      {/* @ts-expect-error custom element */}
      <kai-chat
        ref={(el: HTMLElement) => (host = el as any)}
        style={{ display: 'block', flex: '1', 'min-height': '0' }}
      />
    </div>
  );
}
