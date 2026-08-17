import { describe, expect, it } from 'vitest';
import {
  emitWireDiagnostic,
  nextStreamId,
  subscribeWireDiagnostics,
  wireDiagnosticsActive,
} from './diagnostics';

const ev = (over = {}) =>
  ({
    type: 'wire.open',
    t: 1,
    format: 'openai.chat-completions',
    source: 'response',
    ...over,
  }) as any;

describe('wire diagnostics emitter', () => {
  it('is inactive with no subscribers and emit is a safe no-op', () => {
    expect(wireDiagnosticsActive()).toBe(false);
    expect(() => emitWireDiagnostic(ev())).not.toThrow();
  });

  it('delivers to every subscriber and unsubscribe stops delivery', () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = subscribeWireDiagnostics((e) => a.push(e));
    const offB = subscribeWireDiagnostics((e) => b.push(e));
    expect(wireDiagnosticsActive()).toBe(true);
    emitWireDiagnostic(ev());
    offA();
    emitWireDiagnostic(ev({ format: 'anthropic.messages' }));
    offB();
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
    expect(wireDiagnosticsActive()).toBe(false);
  });

  it('a throwing subscriber does not starve the others', () => {
    const got: unknown[] = [];
    const offBad = subscribeWireDiagnostics(() => {
      throw new Error('boom');
    });
    const offGood = subscribeWireDiagnostics((e) => got.push(e));
    expect(() => emitWireDiagnostic(ev())).not.toThrow();
    expect(got).toHaveLength(1);
    offBad();
    offGood();
  });

  it('nextStreamId is monotonic and wire-prefixed', () => {
    const a = nextStreamId();
    const b = nextStreamId();
    expect(a).toMatch(/^wire-\d+$/);
    expect(a).not.toBe(b);
  });
});
