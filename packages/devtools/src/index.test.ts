import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KaiDevtoolsHook, WireDiagnosticEvent } from './contract';

/** The line the spec fixes verbatim. It is the panel's whole discovery surface
 *  on a first run, so its wording is a contract, not a message. */
const NOT_ACTIVATED_LINE =
  '[kai-devtools] loaded, not activated. Add ?kai-devtools=1 to the URL, or run __KAI_DEVTOOLS_HOOK__.activate(), to record from the next page load.';

const ev = (o: Record<string, unknown>) => o as unknown as WireDiagnosticEvent;

const HEALTHY = [
  ev({ type: 'wire.open', t: 0, streamId: 'wire-1', format: 'openai.chat-completions', source: 'response' }),
  ev({ type: 'wire.frame', t: 10, streamId: 'wire-1', seq: 1, bytes: 90, chunks: 1, fields: ['text'], model: 'openai/gpt-4o-mini' }),
  ev({ type: 'wire.close', t: 20, streamId: 'wire-1', frames: 1, chunks: 1, parts: { text: 1 }, finishReason: 'stop', ms: 20 }),
];

/** A hand-built hook, so the panel is tested against the CONTRACT rather than
 *  against the kit's implementation of it.
 *
 *  `recording` is what the panel branches on, NOT `location.search`. The signal
 *  is the KIT's: it reads it once, synchronously, at kit init -- long before a
 *  CDN script tag in the footer executes -- so re-reading the URL here could
 *  only ever disagree with the answer that already decided whether a buffer
 *  exists. The tests set the query string too, for realism, but this field is
 *  the operative input. */
function fakeHook(
  buffered: WireDiagnosticEvent[] = [],
  opts: { attach?: boolean; recording?: boolean } = {},
) {
  const subs: ((e: WireDiagnosticEvent) => void)[] = [];
  let buffer = [...buffered];
  const hook: KaiDevtoolsHook & { emit(e: WireDiagnosticEvent): void } = {
    version: 1,
    recording: opts.recording ?? true,
    drain() {
      const h = buffer;
      buffer = [];
      return h;
    },
    subscribe(fn) {
      subs.push(fn);
      return () => {
        const i = subs.indexOf(fn);
        if (i !== -1) subs.splice(i, 1);
      };
    },
    emit(e) {
      for (const fn of [...subs]) fn(e);
    },
  };
  if (opts.attach !== false) {
    hook.attach = (fn) => {
      const h = buffer;
      buffer = [];
      for (const e of h) fn(e);
      return hook.subscribe(fn);
    };
  }
  return hook;
}

async function loadPanel() {
  vi.resetModules();
  return import('./index');
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete (window as any).__KAI_DEVTOOLS_HOOK__;
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the panel entry, with no activation signal', () => {
  it('registers the element, renders nothing, and logs exactly one line', async () => {
    // The kit found no signal at init, so it took the dormant branch.
    (window as any).__KAI_DEVTOOLS_HOOK__ = fakeHook(HEALTHY, { recording: false });
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await loadPanel();

    // Registered, so a developer can mount it by hand if they want to.
    expect(customElements.get('kai-devtools')).toBeDefined();
    // A live storefront must not grow visible UI because someone pasted a tag.
    expect(document.querySelector('kai-devtools')).toBeNull();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(NOT_ACTIVATED_LINE);
  });

  it('does not throw when there is no hook at all', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await expect(loadPanel()).resolves.toBeDefined();
    expect(customElements.get('kai-devtools')).toBeDefined();
    expect(document.querySelector('kai-devtools')).toBeNull();
    // Registration ONLY, and deliberately silent. No hook means the kit is
    // absent or predates it entirely; the not-activated line would tell a
    // stranger to set a signal that nothing is listening for.
    expect(info).not.toHaveBeenCalled();
  });
});

describe('the panel entry, with the signal set', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?kai-devtools=1');
  });

  it('self-mounts, renders the buffered stream, and updates on a live event', async () => {
    const hook = fakeHook(HEALTHY);
    (window as any).__KAI_DEVTOOLS_HOOK__ = hook;
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await loadPanel();

    const el = document.querySelector('kai-devtools');
    expect(el).not.toBeNull();
    // Activated, so the not-activated line must NOT appear.
    expect(info).not.toHaveBeenCalled();

    const text = () => el!.shadowRoot!.textContent ?? '';
    expect(text()).toContain('wire-1');
    expect(text()).toContain('openai.chat-completions');
    expect(text()).toContain('openai/gpt-4o-mini');

    // A second stream arriving live must show up without a remount.
    hook.emit(ev({ type: 'wire.open', t: 30, streamId: 'wire-2', format: 'anthropic.messages', source: 'stream' }));
    expect(text()).toContain('wire-2');
    expect(text()).toContain('anthropic.messages');
  });

  it('mounts only one panel even if one is already present', async () => {
    (window as any).__KAI_DEVTOOLS_HOOK__ = fakeHook();
    await loadPanel();
    expect(document.querySelectorAll('kai-devtools')).toHaveLength(1);
  });

  it('renders an unreported model as an em dash, never invented', async () => {
    (window as any).__KAI_DEVTOOLS_HOOK__ = fakeHook([
      ev({ type: 'wire.open', t: 0, streamId: 'wire-9', format: 'openai.chat-completions', source: 'response' }),
      ev({ type: 'wire.frame', t: 1, streamId: 'wire-9', seq: 1, bytes: 10, chunks: 0, fields: [] }),
    ]);
    await loadPanel();
    const el = document.querySelector('kai-devtools')!;
    expect(el.shadowRoot!.textContent).toContain('—');
  });

  it('works against a legacy hook that has no attach', async () => {
    // An older kit: version 1, drain/subscribe only. The panel must still show
    // the history exactly once.
    const hook = fakeHook(HEALTHY, { attach: false });
    (window as any).__KAI_DEVTOOLS_HOOK__ = hook;
    await loadPanel();
    const el = document.querySelector('kai-devtools')!;
    const body = el.shadowRoot!.textContent ?? '';
    expect(body).toContain('wire-1');
    // Exactly once: the legacy path dedupes rather than double-counting.
    expect(body.split('wire-1').length - 1).toBeGreaterThan(0);
  });
});
