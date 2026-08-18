// @vitest-environment jsdom
//
// PAYLOAD CAPTURE IS ITS OWN SIGNAL, and the separation is the security
// property, not a preference.
//
// The panel is a pasted script tag on a live site and `?kai-devtools=1` is
// guessable. A stranger who guesses it gets the SHAPE of a conversation --
// counts, sizes, timings, variant names -- and not one word of its content.
// Content requires a second, deliberate switch that no URL can set.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function fresh() {
  vi.resetModules();
  const hook = await import('./hook');
  const diagnostics = await import('../wire/diagnostics');
  return { ...hook, ...diagnostics };
}

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('kai.wire.diagnostics.v1')];
  delete (window as any).__KAI_DEVTOOLS_HOOK__;
  delete (window as any).__KAI_DEVTOOLS__;
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the payload signal', () => {
  it('is OFF by default, and the hook says so', async () => {
    const { installKaiDevtoolsHook, wirePayloadActive } = await fresh();
    const hook = installKaiDevtoolsHook()!;
    expect(hook.payload).toBe(false);
    expect(wirePayloadActive()).toBe(false);
  });

  it('★ ACTIVATION ALONE NEVER ENABLES IT -- the guessable URL gets metadata only', async () => {
    window.history.replaceState({}, '', '/?kai-devtools=1');
    const { installKaiDevtoolsHook, wirePayloadActive } = await fresh();
    const hook = installKaiDevtoolsHook()!;
    expect(hook.recording).toBe(true);
    expect(hook.payload).toBe(false);
    expect(wirePayloadActive()).toBe(false);
  });

  it('localStorage alone never enables it either', async () => {
    window.localStorage.setItem('kai-devtools', '1');
    const { installKaiDevtoolsHook, wirePayloadActive } = await fresh();
    expect(installKaiDevtoolsHook()!.recording).toBe(true);
    expect(wirePayloadActive()).toBe(false);
  });

  it("localStorage['kai-devtools-payload'] turns it on", async () => {
    window.localStorage.setItem('kai-devtools', '1');
    window.localStorage.setItem('kai-devtools-payload', '1');
    const { installKaiDevtoolsHook, wirePayloadActive } = await fresh();
    const hook = installKaiDevtoolsHook()!;
    expect(hook.recording).toBe(true);
    expect(hook.payload).toBe(true);
    expect(wirePayloadActive()).toBe(true);
  });

  it("__KAI_DEVTOOLS__ = 'payload' activates AND captures", async () => {
    (window as any).__KAI_DEVTOOLS__ = 'payload';
    const { installKaiDevtoolsHook, wirePayloadActive } = await fresh();
    const hook = installKaiDevtoolsHook()!;
    expect(hook.recording).toBe(true);
    expect(hook.payload).toBe(true);
    expect(wirePayloadActive()).toBe(true);
  });

  it('__KAI_DEVTOOLS__ = { payload: true } does the same', async () => {
    (window as any).__KAI_DEVTOOLS__ = { payload: true };
    const { installKaiDevtoolsHook, wirePayloadActive } = await fresh();
    const hook = installKaiDevtoolsHook()!;
    expect(hook.recording).toBe(true);
    expect(hook.payload).toBe(true);
    expect(wirePayloadActive()).toBe(true);
  });

  it('__KAI_DEVTOOLS__ = { payload: false } activates and captures nothing', async () => {
    (window as any).__KAI_DEVTOOLS__ = { payload: false };
    const { installKaiDevtoolsHook, wirePayloadActive } = await fresh();
    const hook = installKaiDevtoolsHook()!;
    expect(hook.recording).toBe(true);
    expect(hook.payload).toBe(false);
    expect(wirePayloadActive()).toBe(false);
  });

  it('★ NO QUERY-STRING FORM: a URL cannot turn payload capture on', async () => {
    window.history.replaceState({}, '', '/?kai-devtools=payload&kai-devtools-payload=1');
    const { installKaiDevtoolsHook, wirePayloadActive } = await fresh();
    const hook = installKaiDevtoolsHook()!;
    expect(hook.payload).toBe(false);
    expect(wirePayloadActive()).toBe(false);
  });

  it('the payload key alone does not ACTIVATE, and it says so out loud', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.localStorage.setItem('kai-devtools-payload', '1');
    const { installKaiDevtoolsHook, wirePayloadActive, subscribeWireDiagnostics } = await fresh();
    const hook = installKaiDevtoolsHook()!;

    // The two switches are ORTHOGONAL, so the signal means exactly what it says:
    // payload capture is armed. It just has nothing to ride on, because nothing
    // is subscribed -- which is what `recording: false` reports.
    expect(hook.recording).toBe(false);
    expect(hook.payload).toBe(true);
    expect(wirePayloadActive()).toBe(true);

    // Deciding loudly: the developer asked for something that, on its own,
    // produces no events at all. Silence there is the trap.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('kai-devtools');

    // And it really is inert until someone subscribes.
    const seen: unknown[] = [];
    const off = subscribeWireDiagnostics((e) => seen.push(e));
    off();
    expect(seen).toHaveLength(0);
  });

  it('is idempotent: a second install does not re-read the signal', async () => {
    (window as any).__KAI_DEVTOOLS__ = 'payload';
    const { installKaiDevtoolsHook, wirePayloadActive } = await fresh();
    const first = installKaiDevtoolsHook()!;
    delete (window as any).__KAI_DEVTOOLS__;
    const second = installKaiDevtoolsHook()!;
    expect(second).toBe(first);
    expect(second.payload).toBe(true);
    expect(wirePayloadActive()).toBe(true);
  });

  it('installs nothing and throws nothing when localStorage is hostile', async () => {
    const boom = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    (window as any).__KAI_DEVTOOLS__ = 'payload';
    const { installKaiDevtoolsHook } = await fresh();
    const hook = installKaiDevtoolsHook()!;
    expect(hook.payload).toBe(true); // the global still answers
    boom.mockRestore();
  });
});
