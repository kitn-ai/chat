/** Custom-theme SHOWCASE — the same <kai-chat> as every other demo, reskinned to
 *  a bold "Aurora" identity (electric magenta accent, cyan focus glow, deep-noir
 *  surfaces, sharp corners). It exists to prove how far the inherited --kai-*
 *  custom properties can push the look WITHOUT piercing the Shadow DOM.
 *
 *  Two things this island does that the plain ChatDemo can't:
 *   1. Swaps a FULL per-mode --kai-* token map when the page theme flips, so the
 *      theme is intentional in BOTH light and dark (not one set of values that
 *      only holds in one mode).
 *   2. Wraps the chat in host-side chrome — an aurora gradient backdrop + a
 *      labelled frame — to make "this is the SAME component, radically reskinned"
 *      read at a glance. All chrome is OUTSIDE the element; only tokens touch it. */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { loadKit } from './example/kit';

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

/** Full --kai-* override map for one mode. Every value is self-contained (no
 *  reliance on the kit's defaults) so the look is deliberate in both modes. */
type TokenMap = Record<string, string>;

/* Dark "Aurora": neon magenta on near-black indigo, cyan focus glow, code in
 *  cyan, sharp 0.25rem corners. */
const AURORA_DARK: TokenMap = {
  '--kai-color-background': 'hsl(252 40% 6%)',
  '--kai-color-foreground': 'hsl(250 30% 96%)',
  '--kai-color-card': 'hsl(250 36% 10%)',
  '--kai-color-card-foreground': 'hsl(250 30% 96%)',
  '--kai-color-popover': 'hsl(250 38% 9%)',
  '--kai-color-popover-foreground': 'hsl(250 30% 96%)',
  '--kai-color-primary': 'hsl(322 90% 58%)',
  '--kai-color-primary-foreground': 'hsl(250 40% 7%)',
  '--kai-color-secondary': 'hsl(250 30% 16%)',
  '--kai-color-secondary-foreground': 'hsl(250 25% 90%)',
  '--kai-color-muted': 'hsl(250 28% 14%)',
  '--kai-color-muted-foreground': 'hsl(250 18% 64%)',
  '--kai-color-accent': 'hsl(250 32% 18%)',
  '--kai-color-accent-foreground': 'hsl(186 90% 70%)',
  '--kai-color-border': 'hsl(250 30% 20%)',
  '--kai-color-input': 'hsl(250 30% 14%)',
  '--kai-color-ring': 'hsl(186 95% 56%)',
  '--kai-color-sidebar': 'hsl(252 42% 5%)',
  '--kai-color-code-foreground': 'hsl(186 90% 66%)',
  '--kai-color-scrollbar-thumb': 'hsl(322 40% 30%)',
  '--kai-color-scrollbar-thumb-hover': 'hsl(322 60% 45%)',
  '--kai-color-tool-blue': 'hsl(186 90% 66%)',
  '--kai-color-tool-green': 'hsl(160 84% 56%)',
  '--kai-color-tool-amber': 'hsl(322 90% 68%)',
  '--kai-color-tool-red': 'hsl(350 90% 68%)',
  '--kai-radius': '0.25rem',
  '--kai-text-title': '1.0625rem',
};

/* Light "Aurora": same neon identity, inverted onto a cool cyan-tinted studio
 *  white. Accent/ring darkened just enough to keep text + focus AA on light. */
const AURORA_LIGHT: TokenMap = {
  '--kai-color-background': 'hsl(240 40% 98%)',
  '--kai-color-foreground': 'hsl(252 45% 12%)',
  '--kai-color-card': 'hsl(0 0% 100%)',
  '--kai-color-card-foreground': 'hsl(252 45% 12%)',
  '--kai-color-popover': 'hsl(0 0% 100%)',
  '--kai-color-popover-foreground': 'hsl(252 45% 12%)',
  '--kai-color-primary': 'hsl(322 82% 46%)',
  '--kai-color-primary-foreground': 'hsl(0 0% 100%)',
  '--kai-color-secondary': 'hsl(250 60% 96%)',
  '--kai-color-secondary-foreground': 'hsl(252 45% 20%)',
  '--kai-color-muted': 'hsl(245 50% 96%)',
  '--kai-color-muted-foreground': 'hsl(250 14% 42%)',
  '--kai-color-accent': 'hsl(245 60% 95%)',
  '--kai-color-accent-foreground': 'hsl(192 90% 30%)',
  '--kai-color-border': 'hsl(248 40% 90%)',
  '--kai-color-input': 'hsl(248 40% 92%)',
  '--kai-color-ring': 'hsl(192 90% 38%)',
  '--kai-color-sidebar': 'hsl(245 50% 97%)',
  '--kai-color-code-foreground': 'hsl(192 90% 32%)',
  '--kai-color-scrollbar-thumb': 'hsl(322 50% 80%)',
  '--kai-color-scrollbar-thumb-hover': 'hsl(322 60% 62%)',
  '--kai-color-tool-blue': 'hsl(192 90% 32%)',
  '--kai-color-tool-green': 'hsl(160 84% 28%)',
  '--kai-color-tool-amber': 'hsl(322 82% 44%)',
  '--kai-color-tool-red': 'hsl(350 80% 46%)',
  '--kai-radius': '0.25rem',
  '--kai-text-title': '1.0625rem',
};

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'u1',
    role: 'user',
    parts: [{ type: 'text', text: "This is the exact same `<kai-chat>` from the other examples — how is it this different?" }],
  },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: "Pure tokens. Nothing here pierces the Shadow DOM — every surface, the magenta accent, the cyan focus ring, the sharp corners and the `inline code` tint all come from a `--kai-*` override map set on the host.\n\n```css\nkai-chat {\n  --kai-color-primary: hsl(322 90% 58%);   /* magenta accent  */\n  --kai-color-ring:    hsl(186 95% 56%);   /* cyan focus glow */\n  --kai-radius:        0.25rem;            /* sharp corners   */\n}\n```\n\nThe aurora glow and the framed shell around me are **host-side chrome** — plain CSS on a wrapper, sitting entirely outside the element. Flip the site's theme and a second, matched token map takes over so it stays intentional in both modes.",
      },
    ],
    actions: ['copy', 'like', 'dislike'],
  },
];

const REPLY =
  "Same answer, still all tokens: this reply, the send button, the focus ring you just tabbed through — every pixel is driven by the `--kai-*` map on the host. Swap that map and the component becomes a different product, with zero changes to the element itself.";

let uid = 0;
const nextId = () => `ct${++uid}`;

export default function CustomThemeShowcaseDemo() {
  let host: (HTMLElement & { messages?: ChatMessage[]; [k: string]: unknown }) | undefined;
  const [mode, setMode] = createSignal<'light' | 'dark'>('dark');
  let timer: number | undefined;

  const theme = (): 'light' | 'dark' =>
    (document.documentElement.dataset.theme as 'light' | 'dark') || 'light';

  /** Apply the full token map for the current mode onto the host. Idempotent. */
  const applyTheme = (m: 'light' | 'dark') => {
    if (!host) return;
    const map = m === 'dark' ? AURORA_DARK : AURORA_LIGHT;
    for (const [token, value] of Object.entries(map)) host.style.setProperty(token, value);
    host.setAttribute('theme', m);
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
    const words = REPLY.split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);
    const tick = () => {
      i += 2;
      const partial = words.slice(0, i).join('');
      const done = i >= words.length;
      host!.messages = (host!.messages ?? []).map((msg) =>
        msg.id === aId ? { ...msg, parts: [{ type: 'text', text: partial }], ...(done ? { actions: ['copy', 'like', 'dislike'] } : {}) } : msg,
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
    host.messages = SEED_MESSAGES;
    (host as any).chatTitle = 'Aurora';
    (host as any).placeholder = 'Ask how the reskin works…';
    (host as any).suggestions = ['Which tokens did this take?', 'Does it hold up in light mode?'];
    const m = theme();
    setMode(m);
    applyTheme(m);
    host.addEventListener('kai-submit', onSubmit);

    const obs = new MutationObserver(() => {
      const next = theme();
      setMode(next);
      applyTheme(next);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    onCleanup(() => {
      clearTimeout(timer);
      host?.removeEventListener('kai-submit', onSubmit);
      obs.disconnect();
    });
  });

  // Host-side chrome. None of this touches the element — it frames it.
  const shellBg = () =>
    mode() === 'dark'
      ? 'radial-gradient(120% 120% at 0% 0%, hsl(322 80% 22% / 0.55), transparent 45%),' +
        'radial-gradient(120% 120% at 100% 100%, hsl(186 80% 26% / 0.5), transparent 45%),' +
        'hsl(252 44% 4%)'
      : 'radial-gradient(120% 120% at 0% 0%, hsl(322 90% 70% / 0.28), transparent 45%),' +
        'radial-gradient(120% 120% at 100% 100%, hsl(186 90% 60% / 0.30), transparent 45%),' +
        'hsl(240 50% 96%)';

  const labelColor = () => (mode() === 'dark' ? 'hsl(186 90% 72%)' : 'hsl(192 90% 30%)');
  const labelMuted = () => (mode() === 'dark' ? 'hsl(250 18% 70%)' : 'hsl(250 14% 40%)');

  return (
    <div
      class="not-content my-5 overflow-hidden rounded-2xl"
      style={{
        padding: '20px',
        background: shellBg(),
        'box-shadow': mode() === 'dark' ? '0 0 0 1px hsl(250 40% 18%)' : '0 0 0 1px hsl(248 40% 88%)',
      }}
    >
      {/* Caption strip — names the identity so the reskin reads instantly. */}
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '8px',
          'margin-bottom': '12px',
          padding: '0 2px',
          'font-family': 'ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, monospace',
          'font-size': '11px',
          'letter-spacing': '0.08em',
          'text-transform': 'uppercase',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            'border-radius': '9999px',
            background: 'linear-gradient(135deg, hsl(322 90% 60%), hsl(186 95% 56%))',
            'box-shadow': '0 0 10px hsl(322 90% 60% / 0.8)',
          }}
        />
        <span style={{ color: labelColor(), 'font-weight': '700' }}>Aurora theme</span>
        <span style={{ color: labelMuted() }}>· same component, --kai-* tokens only</span>
      </div>

      {/* The chat. The glow frame is host-side; only --kai-* tokens reach inside. */}
      <div
        class="overflow-hidden rounded-xl"
        style={{
          height: '560px',
          background: mode() === 'dark' ? 'hsl(252 40% 6%)' : 'hsl(240 40% 98%)',
          'box-shadow':
            mode() === 'dark'
              ? '0 0 0 1px hsl(250 30% 22%), 0 24px 60px -20px hsl(322 90% 40% / 0.45)'
              : '0 0 0 1px hsl(248 40% 88%), 0 24px 60px -24px hsl(322 80% 50% / 0.35)',
        }}
      >
        {/* @ts-expect-error custom element */}
        <kai-chat ref={(el: HTMLElement) => (host = el as any)} style={{ display: 'block', height: '100%' }} />
      </div>
    </div>
  );
}
