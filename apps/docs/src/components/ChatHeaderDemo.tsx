/** Capstone proof for the header-composition kit: a <kai-chat> whose header is
 *  rebuilt to mirror the ChatGPT layout using the new primitives —
 *  `slot="header-start"` holds a sidebar toggle + a grouped <kai-model-switcher>,
 *  `slot="header-end"` holds a <kai-popover> settings menu containing a
 *  <kai-switch>. A simple conversations rail makes the toggle meaningful. */
import { createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import { loadKit } from './example/kit';
import IconPanelLeft from '~icons/lucide/panel-left';
import IconSettings from '~icons/lucide/settings-2';

interface MessagePart { type: 'text'; text: string }
interface ChatMessage { id: string; role: 'user' | 'assistant'; parts: MessagePart[]; actions?: string[] }

const SEED: ChatMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Summarise the Q3 launch retro in three bullets.' }] },
  {
    id: 'a1', role: 'assistant',
    parts: [
      {
        type: 'text',
        text: "Here's the retro in three:\n\n- **Shipped on time** — the staged rollout held; no Sev-1s.\n- **Onboarding lagged** — activation dropped 8% week one; the empty state was the culprit.\n- **Next** — invest in first-run guidance before the Q4 push.",
      },
    ],
    actions: ['copy', 'like'],
  },
];

const MODELS = [
  { id: 'gpt-5.5', name: 'GPT-5.5', description: 'Flagship model' },
  { id: 'gpt-5.5-mini', name: 'GPT-5.5 mini', description: 'Faster, lighter' },
  { id: 'gpt-4o', name: 'GPT-4o', group: 'Legacy models' },
  { id: 'gpt-4.1', name: 'GPT-4.1', group: 'Legacy models' },
];

const CONVERSATIONS = ['Q3 launch retro', 'Pricing page copy', 'Onboarding flow ideas', 'API error taxonomy'];

let uid = 0;
const nid = () => `c${++uid}`;

export default function ChatHeaderDemo() {
  const [railOpen, setRailOpen] = createSignal(true);
  let containerRef: HTMLDivElement | undefined;
  let chatEl: (HTMLElement & { messages?: ChatMessage[]; [k: string]: unknown }) | undefined;
  let msEl: (HTMLElement & { models?: unknown[]; currentModel?: string }) | undefined;
  let timer: number | undefined;
  const theme = () => document.documentElement.dataset.theme ?? 'light';

  const applyTheme = () => {
    containerRef?.querySelectorAll('kai-chat, kai-model-switcher, kai-popover, kai-switch')
      .forEach((el) => el.setAttribute('theme', theme()));
  };

  const onSubmit = (e: Event) => {
    const text = (e as CustomEvent).detail?.value?.trim();
    if (!text || !chatEl) return;
    const aId = nid();
    chatEl.messages = [
      ...(chatEl.messages ?? []),
      { id: nid(), role: 'user', parts: [{ type: 'text', text }] },
      { id: aId, role: 'assistant', parts: [] },
    ];
    (chatEl as any).loading = true;
    const reply = 'Noted. In a real app your backend streams the answer here — this demo just shows the composed header working: switch models on the left, open settings on the right, toggle the sidebar.';
    const words = reply.split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);
    const tick = () => {
      i += 2;
      const done = i >= words.length;
      chatEl!.messages = (chatEl!.messages ?? []).map((m) =>
        m.id === aId
          ? { ...m, parts: [{ type: 'text', text: words.slice(0, i).join('') }], ...(done ? { actions: ['copy', 'like'] } : {}) }
          : m,
      );
      if (!done) timer = window.setTimeout(tick, 36); else (chatEl as any).loading = false;
    };
    timer = window.setTimeout(tick, 220);
  };

  onMount(async () => {
    await loadKit();
    if (chatEl) {
      customElements.upgrade(chatEl);
      chatEl.messages = SEED;
      (chatEl as any).placeholder = 'Message the assistant…';
      chatEl.addEventListener('kai-submit', onSubmit);
    }
    if (msEl) {
      customElements.upgrade(msEl);
      msEl.models = MODELS;
      msEl.currentModel = 'gpt-5.5';
      msEl.addEventListener('kai-model-change', (e) => { msEl!.currentModel = (e as CustomEvent<{ modelId: string }>).detail.modelId; });
    }
    applyTheme();
    const obs = new MutationObserver(applyTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    onCleanup(() => { clearTimeout(timer); chatEl?.removeEventListener('kai-submit', onSubmit); obs.disconnect(); });
  });

  const railBtn = 'flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-ink/80 hover:bg-line/60';
  const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-ink/70 hover:bg-line/60 hover:text-ink';

  return (
    <div ref={(el) => (containerRef = el)} class="not-content my-5 flex overflow-hidden rounded-xl border border-line bg-surface" style={{ height: '560px' }}>
      {/* conversations rail (toggled by the header sidebar button) */}
      <Show when={railOpen()}>
        <aside class="flex w-56 shrink-0 flex-col gap-1 border-r border-line bg-surface p-2" style={{ overflow: 'hidden' }}>
          <div class="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">Chats</div>
          <For each={CONVERSATIONS}>{(c, i) => <button type="button" class={`${railBtn} ${i() === 0 ? 'bg-line/50 font-medium text-ink' : ''}`}>{c}</button>}</For>
        </aside>
      </Show>

      <div class="min-w-0 flex-1">
        {/* @ts-expect-error custom element */}
        <kai-chat ref={(el: HTMLElement) => (chatEl = el as any)} chat-title="" style={{ display: 'block', height: '100%' }}>
          {/* header-start: sidebar toggle + grouped model menu */}
          <div slot="header-start" style={{ display: 'flex', 'align-items': 'center', gap: '0.25rem' }}>
            <button type="button" class={iconBtn} aria-label="Toggle sidebar" onClick={() => setRailOpen(!railOpen())}>
              <IconPanelLeft style={{ width: '1.05rem', height: '1.05rem' }} />
            </button>
            {/* @ts-expect-error custom element */}
            <kai-model-switcher ref={(el: HTMLElement) => (msEl = el as any)} />
          </div>

          {/* header-end: settings popover with a switch */}
          <div slot="header-end">
            {/* @ts-expect-error custom element */}
            <kai-popover placement="bottom-end">
              <button slot="trigger" type="button" class={iconBtn} aria-label="Settings">
                <IconSettings style={{ width: '1.05rem', height: '1.05rem' }} />
              </button>
              <div class="w-60 text-ink">
                <div class="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">Settings</div>
                <div class="flex items-center justify-between rounded-md px-2 py-2 text-sm">
                  <span>Temporary chat</span>
                  {/* @ts-expect-error custom element */}
                  <kai-switch label="Temporary chat" />
                </div>
                <div class="flex items-center justify-between rounded-md px-2 py-2 text-sm">
                  <span>Show timestamps</span>
                  {/* @ts-expect-error custom element */}
                  <kai-switch checked label="Show timestamps" />
                </div>
              </div>
              {/* @ts-expect-error custom element */}
            </kai-popover>
          </div>
          {/* @ts-expect-error custom element */}
        </kai-chat>
      </div>
    </div>
  );
}
