/** Skills & entity-pill triggers demo — mounts <kai-chat> with a realistic
 *  `triggers` config (a `/` skill menu) and a <kai-skills> strip of the
 *  assistant's capabilities. Typing "/" in the composer opens the menu; picking
 *  a skill drops an atomic pill, and submitting drives a tailored scripted reply
 *  (keyed off the pill's prompt text). Set as JS PROPERTIES after kit load. */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { loadKit } from './example/kit';

interface Skill {
  id: string;
  name: string;
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
  height?: string;
}

// `/` skill items. `promptText` is what the pill flattens to in the submitted
// value — we key the scripted reply off it.
const SKILL_ITEMS = [
  { id: 'summarize', label: 'Summarize', description: 'Condense a thread or document into key points', promptText: 'Summarize this thread.' },
  { id: 'translate', label: 'Translate', description: 'Translate text into another language', promptText: 'Translate this text.' },
  { id: 'code-review', label: 'Code Review', description: 'Review a diff for bugs and style', promptText: 'Review this diff.' },
  { id: 'search-docs', label: 'Search Docs', description: 'Search the knowledge base and cite sources', promptText: 'Search the docs.' },
];

const TRIGGERS = [{ char: '/', kind: 'skill', items: SKILL_ITEMS }];

const SKILLS: Skill[] = [
  { id: 'summarize', name: 'Summarize' },
  { id: 'translate', name: 'Translate' },
  { id: 'code-review', name: 'Code Review' },
  { id: 'search-docs', name: 'Search Docs' },
];

// Tailored replies keyed by the skill id. The fallback covers free-form prompts.
const REPLIES: Record<string, string> = {
  summarize:
    'Here is the gist of the thread:\n\n' +
    '1. The deploy on **2026-06-14** introduced a memory leak in the worker pool.\n' +
    '2. Rolling back to `v2.3.1` restored steady-state memory within minutes.\n' +
    '3. The fix — disposing idle workers after 60s — is now in review on `fix/worker-pool-ttl`.\n\n' +
    'Net: incident resolved, root cause understood, durable fix pending merge.',
  translate:
    'Translated to Spanish:\n\n' +
    '> El nuevo panel de analiticas se publica el viernes. Avisame si necesitas acceso anticipado al entorno de pruebas.\n\n' +
    'I kept the tone semi-formal to match the original. Want a more casual register or a different target language?',
  'code-review':
    'Reviewed the diff in `auth/session.ts`. Three findings:\n\n' +
    '1. **Bug** — `refreshToken()` swallows the 401 from `/oauth/token`; a revoked session loops forever. Re-throw and bubble to the sign-out handler.\n' +
    '2. **Race** — two tabs can refresh concurrently; guard with a single in-flight promise.\n' +
    '3. **Nit** — `expiresAt` is compared as a string; parse to a number before the `<` check.\n\n' +
    'Lines 1 and 2 are blocking; line 3 is cosmetic.',
  'search-docs':
    'Found three relevant pages in the docs:\n\n' +
    '1. **Streaming replies** — driving the token loop from an SSE response.\n' +
    '2. **Theming** — overriding brand tokens via `kai-chat` CSS variables.\n' +
    '3. **Entity pills** — wiring `triggers` so `/` and `@` insert atomic pills.\n\n' +
    'Want me to open any of these, or narrow the search?',
};

const FALLBACK_REPLY =
  'I can help with that. I also expose a few capabilities as skills — ' +
  'type `/` in the composer to drop one in: **Summarize**, **Translate**, ' +
  '**Code Review**, or **Search Docs**.';

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'a0',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text:
          "I'm your workspace assistant. Type `/` to see what I can do — summarize a " +
          'thread, translate text, review a diff, or search the docs. Each pick drops ' +
          'an atomic pill into the composer.',
      },
    ],
    actions: ['copy'],
  },
];

let uid = 0;
const nextId = () => `sa${++uid}`;

/** Map a submitted prompt back to a skill id by matching its prompt text. */
function skillIdFor(text: string): string | undefined {
  const lower = text.toLowerCase();
  return SKILL_ITEMS.find((s) => lower.includes(s.promptText.toLowerCase()) || lower.includes(s.label.toLowerCase()))?.id;
}

export default function SkillsAssistantDemo(props: Props) {
  let host:
    | (HTMLElement & { messages?: ChatMessage[]; [k: string]: unknown })
    | undefined;
  let skillsEl: (HTMLElement & { skills?: Skill[] }) | undefined;
  const [, setReady] = createSignal(false);
  let timer: number | undefined;

  const theme = () => document.documentElement.dataset.theme || 'light';

  const streamReply = (aId: string, reply: string) => {
    const words = reply.split(/(\s+)/);
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
        timer = window.setTimeout(tick, 34);
      } else {
        (host as any).loading = false;
      }
    };
    timer = window.setTimeout(tick, 220);
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

    const id = skillIdFor(text);
    streamReply(aId, (id && REPLIES[id]) || FALLBACK_REPLY);
  };

  onMount(async () => {
    await loadKit();

    if (!host) return;
    customElements.upgrade(host);
    host.messages = SEED_MESSAGES;
    (host as any).triggers = TRIGGERS;
    if (props.chatTitle) (host as any).chatTitle = props.chatTitle;
    if (props.placeholder) (host as any).placeholder = props.placeholder;
    host.setAttribute('theme', theme());
    host.addEventListener('kai-submit', onSubmit);

    if (skillsEl) {
      customElements.upgrade(skillsEl);
      skillsEl.skills = SKILLS;
      skillsEl.setAttribute('theme', theme());
    }

    setReady(true);

    const obs = new MutationObserver(() => {
      host?.setAttribute('theme', theme());
      skillsEl?.setAttribute('theme', theme());
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
      <div
        style={{
          'border-bottom': '1px solid var(--color-line, #e5e7eb)',
          padding: '10px 16px',
          background: 'var(--color-surface, #fff)',
        }}
      >
        {/* @ts-expect-error custom element */}
        <kai-skills ref={(el: HTMLElement) => (skillsEl = el as any)} />
      </div>
      {/* @ts-expect-error custom element */}
      <kai-chat
        ref={(el: HTMLElement) => (host = el as any)}
        style={{ display: 'block', flex: '1', 'min-height': '0' }}
      />
    </div>
  );
}
