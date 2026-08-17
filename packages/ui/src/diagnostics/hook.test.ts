// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WireDiagnosticEvent } from '../wire/diagnostics';

/** A fresh module graph per case. The hook is a module-level singleton AND a
 *  window global, and `subscribeWireDiagnostics` keeps its own subscriber list,
 *  so both have to be reset together -- importing them after the SAME
 *  `resetModules` is what guarantees the hook and the test hold one instance. */
async function fresh() {
  vi.resetModules();
  const hook = await import('./hook');
  const diagnostics = await import('../wire/diagnostics');
  return { ...hook, ...diagnostics };
}

const ev = (over = {}): WireDiagnosticEvent =>
  ({ type: 'wire.open', t: 1, format: 'openai.chat-completions', source: 'response', ...over }) as
    WireDiagnosticEvent;

beforeEach(() => {
  delete (window as any).__KAI_DEVTOOLS_HOOK__;
  delete (window as any).__KAI_DEVTOOLS__;
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installKaiDevtoolsHook — the activation signal', () => {
  it('installs dormant when nothing asks for it', async () => {
    const { installKaiDevtoolsHook } = await fresh();
    const hook = installKaiDevtoolsHook();
    expect(hook).toBeDefined();
    expect(hook!.version).toBe(1);
    expect(hook!.recording).toBe(false);
    expect((window as any).__KAI_DEVTOOLS_HOOK__).toBe(hook);
  });

  it('localStorage alone activates it', async () => {
    window.localStorage.setItem('kai-devtools', '1');
    const { installKaiDevtoolsHook } = await fresh();
    expect(installKaiDevtoolsHook()!.recording).toBe(true);
  });

  it('the window global alone activates it', async () => {
    (window as any).__KAI_DEVTOOLS__ = true;
    const { installKaiDevtoolsHook } = await fresh();
    expect(installKaiDevtoolsHook()!.recording).toBe(true);
  });

  it('the query string alone activates it', async () => {
    window.history.replaceState({}, '', '/?kai-devtools=1');
    const { installKaiDevtoolsHook } = await fresh();
    expect(installKaiDevtoolsHook()!.recording).toBe(true);
  });

  it('a non-true window global does not activate it', async () => {
    // The spec says `=== true`, so a truthy string must not count.
    (window as any).__KAI_DEVTOOLS__ = 'yes';
    const { installKaiDevtoolsHook } = await fresh();
    expect(installKaiDevtoolsHook()!.recording).toBe(false);
  });

  it('survives localStorage throwing', async () => {
    // Safari private mode and a hostile CSP both make this throw on ACCESS.
    // Stubbed on Storage.prototype: jsdom's `window.localStorage` is a Proxy, so
    // an own-property spy on the instance never gets called.
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    window.history.replaceState({}, '', '/?kai-devtools=1');
    const { installKaiDevtoolsHook } = await fresh();
    // It must not throw, and must fall through to the later signals.
    expect(installKaiDevtoolsHook()!.recording).toBe(true);
    expect(spy).toHaveBeenCalled();
  });
});

describe('installKaiDevtoolsHook — the capture model', () => {
  it('wanted: buffers from the first event, and drain clears', async () => {
    window.localStorage.setItem('kai-devtools', '1');
    const { installKaiDevtoolsHook, emitWireDiagnostic } = await fresh();
    const hook = installKaiDevtoolsHook()!;

    emitWireDiagnostic(ev());
    emitWireDiagnostic(ev({ type: 'wire.close' }));

    const first = hook.drain();
    expect(first).toHaveLength(2);
    expect(first[0].type).toBe('wire.open');
    // History, and CLEARS it.
    expect(hook.drain()).toEqual([]);
  });

  it('not wanted: no buffer at all, but a live subscribe still works', async () => {
    const { installKaiDevtoolsHook, emitWireDiagnostic } = await fresh();
    const hook = installKaiDevtoolsHook()!;

    emitWireDiagnostic(ev());
    expect(hook.drain()).toEqual([]);

    const seen: WireDiagnosticEvent[] = [];
    const off = hook.subscribe((e) => seen.push(e));
    emitWireDiagnostic(ev({ type: 'wire.close' }));
    expect(seen).toHaveLength(1);
    off();
    emitWireDiagnostic(ev());
    expect(seen).toHaveLength(1);
    // Still nothing retained: the dormant branch never allocates a buffer.
    expect(hook.drain()).toEqual([]);
  });

  it('emission stays a no-op while dormant and nobody subscribes', async () => {
    const { installKaiDevtoolsHook, wireDiagnosticsActive } = await fresh();
    installKaiDevtoolsHook();
    expect(wireDiagnosticsActive()).toBe(false);
  });

  it('the wanted branch arms emission immediately', async () => {
    window.localStorage.setItem('kai-devtools', '1');
    const { installKaiDevtoolsHook, wireDiagnosticsActive } = await fresh();
    installKaiDevtoolsHook();
    expect(wireDiagnosticsActive()).toBe(true);
  });
});

describe('installKaiDevtoolsHook — installation rules', () => {
  it('importing the module installs nothing by itself', async () => {
    vi.resetModules();
    const mod = await import('./hook');
    expect((window as any).__KAI_DEVTOOLS_HOOK__).toBeUndefined();
    mod.installKaiDevtoolsHook();
    expect((window as any).__KAI_DEVTOOLS_HOOK__).toBeDefined();
  });

  it('a second install returns the first hook untouched', async () => {
    const { installKaiDevtoolsHook } = await fresh();
    const first = installKaiDevtoolsHook()!;
    // Even if the signal appears later, the installed hook is not re-made.
    window.localStorage.setItem('kai-devtools', '1');
    const second = installKaiDevtoolsHook()!;
    expect(second).toBe(first);
    expect(second.recording).toBe(false);
  });

  it('activate() writes the signal and reloads', async () => {
    const { installKaiDevtoolsHook } = await fresh();
    const hook = installKaiDevtoolsHook()!;
    // jsdom's reload throws "Not implemented" unless it is replaced outright.
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, search: '', reload },
    });
    hook.activate();
    expect(window.localStorage.getItem('kai-devtools')).toBe('1');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('activate() does not reload when the signal could not be stored', async () => {
    const { installKaiDevtoolsHook } = await fresh();
    const hook = installKaiDevtoolsHook()!;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, search: '', reload },
    });
    hook.activate();
    // Reloading would drop the session to land on the same dormant state.
    expect(reload).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
