import { describe, expect, it, vi } from 'vitest';
import type { KaiDiagnosticEvent, WireDiagnosticEvent } from './diagnostics';

/**
 * TWO COPIES OF THIS MODULE MUST SHARE ONE EMITTER.
 *
 * Not a hypothetical. The published package shipped `./wire` and `./diagnostics`
 * as separate rollup bundles that each inlined their own copy of this module, so
 * a subscriber registered through one never saw an event emitted by the other --
 * which made the devtools hook inert for every consumer.
 *
 * And it is not only our build config, which is why the fix is a shared global
 * rather than a chunking change: a consumer who bundles the kit and ALSO loads
 * the elements bundle from a CDN duplicates the module identically, and nothing
 * we do to our own build prevents that.
 *
 * `vi.resetModules()` between two imports is the honest simulation -- the first
 * reference stays alive while the second import evaluates the module afresh, so
 * these really are two independent copies in one process.
 */
async function twoCopies() {
  vi.resetModules();
  const a = await import('./diagnostics');
  vi.resetModules();
  const b = await import('./diagnostics');
  return { a, b };
}

const ev = (over = {}) =>
  ({ type: 'wire.open', t: 1, format: 'openai.chat-completions', source: 'response', ...over }) as
    unknown as WireDiagnosticEvent;

describe('the emitter state is shared across module copies', () => {
  it('really produces two distinct copies (or this file proves nothing)', async () => {
    const { a, b } = await twoCopies();
    expect(a.subscribeWireDiagnostics).not.toBe(b.subscribeWireDiagnostics);
  });

  it('a subscriber on copy A receives an event emitted through copy B', async () => {
    const { a, b } = await twoCopies();
    const seen: KaiDiagnosticEvent[] = [];
    const off = a.subscribeWireDiagnostics((e) => seen.push(e));

    // Copy B must see that someone is listening, or its emission sites stay
    // gated off and the event is never even constructed.
    expect(b.wireDiagnosticsActive()).toBe(true);

    b.emitWireDiagnostic(ev({ t: 2 }));
    expect(seen).toHaveLength(1);
    expect(seen[0].t).toBe(2);

    off();
    // Unsubscribing through A must also be visible to B.
    expect(b.wireDiagnosticsActive()).toBe(false);
  });

  it('stream ids never collide across copies', async () => {
    const { a, b } = await twoCopies();
    // Interleaved on purpose: a per-copy counter makes these repeat rather than
    // continue, and the id NAMESPACES REASONING PARTS -- a collision silently
    // merges one stream's reasoning blocks into another's and overwrites their
    // verbatim provider payload.
    const ids = [a.nextStreamId(), b.nextStreamId(), a.nextStreamId(), b.nextStreamId()];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^wire-\d+$/);
  });

  it('importing the module allocates no shared state by itself', async () => {
    // Zero-cost idle: merely importing must not create the singleton. It is
    // built lazily, on the first subscribe or the first active check.
    vi.resetModules();
    const KEY = Symbol.for('kai.wire.diagnostics.v1');
    delete (globalThis as Record<symbol, unknown>)[KEY];
    await import('./diagnostics');
    expect((globalThis as Record<symbol, unknown>)[KEY]).toBeUndefined();
  });
});
