/** A placeholder "host site" (header · hero · scrolling content grid) with a
 *  support assistant DOCKED as a persistent full-height column on the right —
 *  always open, no FAB. The host's own light/dark toggle re-themes the docked
 *  <kai-chat>. The chat streams a canned reply on kai-submit (see ChatDemo for the
 *  same scripted-reply approach). */
import { createSignal, onMount, onCleanup, For } from 'solid-js';
import { loadKit } from './example/kit';
import type { ChatMessage } from './ChatDemo';
import IconMoon from '~icons/lucide/moon';
import IconSun from '~icons/lucide/sun';

interface Props {
  messages?: ChatMessage[];
  suggestions?: string[];
  chatTitle?: string;
  reply?: string | ((p: string) => string);
}

const DEFAULT_REPLY =
  "You can change your plan under **Billing → Plan**. Downgrades take effect at the end of the current cycle, so you keep paid features until then. Want the steps for adding seats instead?";

let uid = 0;
const nid = () => `d${++uid}`;

export default function DockedAssistantDemo(props: Props) {
  const [dark, setDark] = createSignal(true);
  let host: (HTMLElement & { messages?: ChatMessage[]; [k: string]: unknown }) | undefined;
  let timer: number | undefined;
  const reply = (p: string) => (typeof props.reply === 'function' ? props.reply(p) : props.reply ?? DEFAULT_REPLY);

  const onSubmit = (e: Event) => {
    const text = (e as CustomEvent).detail?.value?.trim();
    if (!text || !host) return;
    const aId = nid();
    host.messages = [
      ...(host.messages ?? []),
      { id: nid(), role: 'user', parts: [{ type: 'text', text }] },
      { id: aId, role: 'assistant', parts: [] },
    ];
    (host as any).loading = true;
    const words = reply(text).split(/(\s+)/);
    let i = 0;
    clearTimeout(timer);
    const tick = () => {
      i += 2;
      const done = i >= words.length;
      host!.messages = (host!.messages ?? []).map((m) =>
        m.id === aId
          ? { ...m, parts: [{ type: 'text', text: words.slice(0, i).join('') }], ...(done ? { actions: ['copy', 'like', 'dislike'] } : {}) }
          : m,
      );
      if (!done) timer = window.setTimeout(tick, 38);
      else (host as any).loading = false;
    };
    timer = window.setTimeout(tick, 240);
  };

  onMount(async () => {
    await loadKit();
    if (host) {
      customElements.upgrade(host);
      host.messages = props.messages ?? [];
      if (props.suggestions) (host as any).suggestions = props.suggestions;
      if (props.chatTitle) (host as any).chatTitle = props.chatTitle;
      (host as any).proseSize = 'sm';
      host.setAttribute('theme', dark() ? 'dark' : 'light');
      host.addEventListener('kai-submit', onSubmit);
    }
    onCleanup(() => { clearTimeout(timer); host?.removeEventListener('kai-submit', onSubmit); });
  });

  // re-theme the docked chat when the host site toggles
  const applyTheme = (d: boolean) => { setDark(d); host?.setAttribute('theme', d ? 'dark' : 'light'); };

  const ink = () => (dark() ? '#e7e7ea' : '#1b1b1f');
  const bg = () => (dark() ? '#0e0e11' : '#ffffff');
  const soft = () => (dark() ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)');
  const line = () => (dark() ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.09)');
  const bar = (w: string, h = '0.75rem') => <div style={{ width: w, height: h, 'border-radius': '6px', background: soft() }} />;

  return (
    <div class="not-content relative my-5 overflow-hidden rounded-xl border border-line" style={{ display: 'flex', height: '600px' }}>
      {/* scrolling host page (fills the remaining width) */}
      <div style={{ flex: '1', 'min-width': '0', 'overflow-y': 'auto', background: bg(), color: ink() }}>
        {/* header */}
        <header style={{ position: 'sticky', top: 0, display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '1rem', padding: '0.9rem 1.25rem', background: bg(), 'border-bottom': `1px solid ${line()}`, 'z-index': 2 }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '0.6rem' }}>
            <div style={{ width: '1.6rem', height: '1.6rem', 'border-radius': '7px', background: soft() }} />
            {bar('5rem', '0.9rem')}
          </div>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '1rem' }}>
            {bar('3rem')}{bar('3rem')}{bar('3rem')}
            <button type="button" onClick={() => applyTheme(!dark())} aria-label="Toggle theme"
              style={{ display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', width: '2rem', height: '2rem', 'border-radius': '8px', border: `1px solid ${line()}`, background: 'transparent', color: ink(), cursor: 'pointer' }}>
              {dark() ? <IconMoon style={{ width: '1rem', height: '1rem' }} /> : <IconSun style={{ width: '1rem', height: '1rem' }} />}
            </button>
          </div>
        </header>
        {/* hero */}
        <section style={{ padding: '3.5rem 1.25rem', display: 'flex', 'flex-direction': 'column', gap: '1rem', 'align-items': 'center', 'text-align': 'center' }}>
          <div style={{ width: '70%', height: '2.4rem', 'border-radius': '8px', background: soft() }} />
          <div style={{ width: '50%', height: '1rem', 'border-radius': '6px', background: soft() }} />
          <div style={{ display: 'flex', gap: '0.75rem', 'margin-top': '0.5rem' }}>
            <div style={{ width: '7rem', height: '2.4rem', 'border-radius': '10px', background: ink(), opacity: 0.85 }} />
            <div style={{ width: '7rem', height: '2.4rem', 'border-radius': '10px', border: `1px solid ${line()}` }} />
          </div>
        </section>
        {/* content blocks (tall enough to scroll beside the docked panel) */}
        <section style={{ padding: '0 1.25rem 4rem', display: 'grid', 'grid-template-columns': 'repeat(2, 1fr)', gap: '1rem' }}>
          <For each={Array.from({ length: 8 })}>
            {() => (
              <div style={{ border: `1px solid ${line()}`, 'border-radius': '12px', padding: '1.1rem', display: 'flex', 'flex-direction': 'column', gap: '0.6rem' }}>
                <div style={{ width: '40%', height: '1rem', 'border-radius': '6px', background: soft() }} />
                {bar('100%')}{bar('100%')}{bar('70%')}
              </div>
            )}
          </For>
        </section>
      </div>

      {/* docked chat — a fixed-width, full-height column on the right */}
      <div style={{ width: '360px', 'flex-shrink': 0, height: '100%', 'border-left': `1px solid ${line()}` }}>
        {/* @ts-expect-error custom element */}
        <kai-chat ref={(el: HTMLElement) => (host = el as any)} style={{ display: 'block', height: '100%' }} />
      </div>
    </div>
  );
}
