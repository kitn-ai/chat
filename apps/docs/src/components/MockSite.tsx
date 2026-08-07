/** A placeholder "host site" (header · hero · scrolling content) used to show
 *  embedded chat — a FAB that toggles a chat window in the corner. Self-contained:
 *  the only interactive chrome is its own light/dark toggle, so the embed can be
 *  seen over a real, scrolling page in both modes. The chat streams a canned
 *  reply (see ChatDemo for the same scripted-reply approach). */
import { createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import { loadKit } from './example/kit';
import type { ChatMessage } from './ChatDemo';
import IconMoon from '~icons/lucide/moon';
import IconSun from '~icons/lucide/sun';
import IconMessageCircle from '~icons/lucide/message-circle';
import IconX from '~icons/lucide/x';

interface Props {
  messages?: ChatMessage[];
  suggestions?: string[];
  chatTitle?: string;
  reply?: string | ((p: string) => string);
}

const DEFAULT_REPLY =
  "Happy to help! This widget is a `<kai-chat>` embedded in the corner of a host page. Its Shadow DOM keeps the host's styles out and its own styles in — so it looks right on any site. Try scrolling the page behind it.";

let uid = 0;
const nid = () => `w${++uid}`;
const block = (cls: string) => <div class={cls} />;

export default function MockSite(props: Props) {
  const [dark, setDark] = createSignal(true);
  const [open, setOpen] = createSignal(true);
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
        m.id === aId ? { ...m, parts: [{ type: 'text', text: words.slice(0, i).join('') }] } : m,
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

  // re-theme the embedded chat when the mock site toggles
  const applyTheme = (d: boolean) => { setDark(d); host?.setAttribute('theme', d ? 'dark' : 'light'); };

  const ink = () => (dark() ? '#e7e7ea' : '#1b1b1f');
  const bg = () => (dark() ? '#0e0e11' : '#ffffff');
  const soft = () => (dark() ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)');
  const line = () => (dark() ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.09)');
  const bar = (w: string, h = '0.75rem') => <div style={{ width: w, height: h, 'border-radius': '6px', background: soft() }} />;

  return (
    <div class="not-content relative my-5 overflow-hidden rounded-xl border border-line">
      {/* scrolling host page */}
      <div style={{ height: '600px', 'overflow-y': 'auto', background: bg(), color: ink() }}>
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
        {/* content blocks (tall enough to scroll behind the widget) */}
        <section style={{ padding: '0 1.25rem 4rem', display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '1rem' }}>
          <For each={Array.from({ length: 9 })}>
            {() => (
              <div style={{ border: `1px solid ${line()}`, 'border-radius': '12px', padding: '1.1rem', display: 'flex', 'flex-direction': 'column', gap: '0.6rem' }}>
                <div style={{ width: '40%', height: '1rem', 'border-radius': '6px', background: soft() }} />
                {bar('100%')}{bar('100%')}{bar('70%')}
              </div>
            )}
          </For>
        </section>
      </div>

      {/* embedded chat window (bottom-right) */}
      <Show when={open()}>
        <div style={{ position: 'absolute', right: '1.25rem', bottom: '5rem', width: 'min(380px, calc(100% - 2.5rem))', height: '460px', 'border-radius': '14px', overflow: 'hidden', border: '1px solid var(--kai-line)', 'box-shadow': '0 12px 40px rgba(0,0,0,0.35)', 'z-index': 3 }}>
          {/* @ts-expect-error custom element */}
          <kai-chat ref={(el: HTMLElement) => (host = el as any)} style={{ display: 'block', height: '100%' }} />
        </div>
      </Show>

      {/* FAB */}
      <button type="button" onClick={() => setOpen(!open())} aria-label={open() ? 'Close chat' : 'Open chat'}
        style={{ position: 'absolute', right: '1.25rem', bottom: '1.25rem', width: '3.25rem', height: '3.25rem', 'border-radius': '999px', border: 'none', background: 'var(--kai-brand)', color: '#fff', cursor: 'pointer', 'box-shadow': '0 8px 24px rgba(214,32,127,0.4)', 'font-size': '1.4rem', 'z-index': 4, display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center' }}>
        {open() ? <IconX style={{ width: '1.4rem', height: '1.4rem' }} /> : <IconMessageCircle style={{ width: '1.4rem', height: '1.4rem' }} />}
      </button>
    </div>
  );
}
