// tests/primitives/card-recovery.test.ts
// dismissRecovery: dismiss writes a `dismissed` resolution immutably (new array ref),
// the injected toast's Undo restores the prior resolution, reopen clears (live) or
// expires per isReopenable, and the default truth table (terminal / staleAfterMs).
import { describe, expect, test, vi } from 'vitest';
import {
  dismissRecovery,
  defaultIsReopenable,
  type RecoveryToast,
} from '../../src/primitives/card-recovery';
import type { CardEnvelope, CardResolution } from '../../src/primitives/card-contract';

function env(id: string, resolution?: CardResolution): CardEnvelope {
  return { type: 'confirm', id, data: {}, ...(resolution ? { resolution } : {}) };
}

/** A tiny store harness over a cards array. */
function makeStore(initial: CardEnvelope[]) {
  let cards = initial;
  return {
    get: () => cards,
    set: (next: CardEnvelope[]) => { cards = next; },
    cards: () => cards,
    find: (id: string) => cards.find((c) => c.id === id),
  };
}

/** A capturing fake toast: records the last show() opts so the test can fire Undo. */
function makeToast(): RecoveryToast & { last?: Parameters<RecoveryToast['show']>[0]; dismiss: ReturnType<typeof vi.fn> } {
  const dismiss = vi.fn();
  const t = {
    last: undefined as Parameters<RecoveryToast['show']>[0] | undefined,
    dismiss,
    show(opts: Parameters<RecoveryToast['show']>[0]) {
      t.last = opts;
      return { dismiss };
    },
  };
  return t;
}

describe('the returned shape', () => {
  // The declared return type is `Required<Pick<CardPolicy,'onDismiss'|'onReopen'>>`,
  // which is only honest if the implementation really does hand back both handlers
  // for EVERY option shape. `Pick` alone kept CardPolicy's `?`, and a consumer who
  // destructured and invoked hit TS2722 — this asserts the runtime fact the stronger
  // type now claims, over the full cross-product of the optional options, so the type
  // cannot quietly out-run the implementation later.
  const OPTIONALS: Array<[string, Partial<Parameters<typeof dismissRecovery>[0]>]> = [
    ['toast', { toast: makeToast() }],
    ['isReopenable', { isReopenable: () => false }],
    ['staleAfterMs', { staleAfterMs: 5000 }],
    ['undoMs', { undoMs: 1 }],
    ['now', { now: () => 0 }],
  ];

  for (let mask = 0; mask < 1 << OPTIONALS.length; mask++) {
    const chosen = OPTIONALS.filter((_, i) => mask & (1 << i));
    const label = chosen.length ? chosen.map(([n]) => n).join('+') : 'get/set only';
    test(`returns both handlers with ${label}`, () => {
      const store = makeStore([env('a')]);
      const policy = dismissRecovery(
        Object.assign({ get: store.get, set: store.set }, ...chosen.map(([, o]) => o)),
      );
      // `in` + typeof, not truthiness: an explicit `onDismiss: undefined` key would
      // satisfy a destructure and still be exactly the value the old type warned about.
      expect(Object.keys(policy).sort()).toEqual(['onDismiss', 'onReopen']);
      expect(typeof policy.onDismiss).toBe('function');
      expect(typeof policy.onReopen).toBe('function');
      // Destructure-and-invoke — the consumer/scaffolder shape that produced TS2722.
      const { onDismiss, onReopen } = policy;
      expect(() => { onDismiss('a'); onReopen('a'); }).not.toThrow();
    });
  }
});

describe('onDismiss', () => {
  test('writes a `dismissed` resolution immutably (NEW array + envelope ref)', () => {
    const before = [env('a'), env('b')];
    const store = makeStore(before);
    const { onDismiss } = dismissRecovery({ get: store.get, set: store.set, now: () => 1000 });

    onDismiss('a');

    const after = store.cards();
    expect(after).not.toBe(before); // new array reference
    expect(after[0]).not.toBe(before[0]); // new envelope reference for the changed card
    expect(after[1]).toBe(before[1]); // untouched card keeps its identity
    expect(after[0].resolution).toEqual({ kind: 'dismissed', at: new Date(1000).toISOString() });
    expect(before[0].resolution).toBeUndefined(); // input never mutated
  });

  test('shows the injected "Dismissed · Undo" toast; Undo restores the prior resolution', () => {
    const prior: CardResolution = { kind: 'action', action: 'approve' };
    const store = makeStore([env('a', prior)]);
    const toast = makeToast();
    const { onDismiss } = dismissRecovery({ get: store.get, set: store.set, toast, undoMs: 5000 });

    onDismiss('a');
    expect(store.find('a')!.resolution).toEqual({ kind: 'dismissed', at: expect.any(String) });
    expect(toast.last?.message).toBe('Dismissed');
    expect(toast.last?.durationMs).toBe(5000);
    expect(toast.last?.action?.label).toBe('Undo');

    // Fire Undo → prior resolution restored.
    toast.last!.action!.onClick();
    expect(store.find('a')!.resolution).toEqual(prior);
  });

  test('Undo on a card that had NO prior resolution restores it to live (undefined)', () => {
    const store = makeStore([env('a')]);
    const toast = makeToast();
    const { onDismiss } = dismissRecovery({ get: store.get, set: store.set, toast });

    onDismiss('a');
    expect(store.find('a')!.resolution?.kind).toBe('dismissed');
    toast.last!.action!.onClick();
    expect(store.find('a')!.resolution).toBeUndefined();
    expect('resolution' in store.find('a')!).toBe(false); // key dropped, not set to undefined
  });

  test('no toast injected → still writes dismissed, no throw', () => {
    const store = makeStore([env('a')]);
    const { onDismiss } = dismissRecovery({ get: store.get, set: store.set });
    expect(() => onDismiss('a')).not.toThrow();
    expect(store.find('a')!.resolution?.kind).toBe('dismissed');
  });
});

describe('onReopen', () => {
  test('reopenable dismissed card → resolution cleared (live again)', () => {
    const store = makeStore([env('a', { kind: 'dismissed', at: new Date(1000).toISOString() })]);
    const { onReopen } = dismissRecovery({ get: store.get, set: store.set, now: () => 2000 });
    onReopen('a');
    expect(store.find('a')!.resolution).toBeUndefined();
  });

  test('non-reopenable card → stamped `expired`', () => {
    const store = makeStore([env('a', { kind: 'dismissed', at: new Date(0).toISOString() })]);
    const { onReopen } = dismissRecovery({
      get: store.get,
      set: store.set,
      isReopenable: () => false,
      now: () => 9000,
    });
    onReopen('a');
    expect(store.find('a')!.resolution).toEqual({ kind: 'expired', at: new Date(9000).toISOString() });
  });

  test('staleAfterMs: a dismissed card older than the window expires on reopen', () => {
    const dismissedAt = new Date(1000).toISOString();
    const store = makeStore([env('a', { kind: 'dismissed', at: dismissedAt })]);
    const { onReopen } = dismissRecovery({
      get: store.get,
      set: store.set,
      staleAfterMs: 5000,
      now: () => 7000, // 6000ms elapsed > 5000 window → stale
    });
    onReopen('a');
    expect(store.find('a')!.resolution?.kind).toBe('expired');
  });

  test('staleAfterMs: a fresh dismissed card reopens live', () => {
    const dismissedAt = new Date(1000).toISOString();
    const store = makeStore([env('a', { kind: 'dismissed', at: dismissedAt })]);
    const { onReopen } = dismissRecovery({
      get: store.get,
      set: store.set,
      staleAfterMs: 5000,
      now: () => 3000, // 2000ms elapsed < 5000 window → fresh
    });
    onReopen('a');
    expect(store.find('a')!.resolution).toBeUndefined();
  });

  test('custom isReopenable receives the reopen env (cardId, resolution, now)', () => {
    const seen: unknown[] = [];
    const store = makeStore([env('a', { kind: 'dismissed', at: new Date(1000).toISOString() })]);
    const { onReopen } = dismissRecovery({
      get: store.get,
      set: store.set,
      isReopenable: (e) => { seen.push(e); return true; },
      now: () => 4242,
    });
    onReopen('a');
    expect(seen[0]).toMatchObject({ cardId: 'a', now: 4242 });
    expect((seen[0] as { resolution: CardResolution }).resolution.kind).toBe('dismissed');
  });
});

describe('defaultIsReopenable truth table', () => {
  const NOW = 10_000;
  const base = { cardId: 'a', now: NOW };

  test('a fresh `dismissed` (no staleAfterMs) → reopenable', () => {
    expect(defaultIsReopenable({ ...base, resolution: { kind: 'dismissed' } })).toBe(true);
  });

  test('a `dismissed` with no `at` is always reopenable even with staleAfterMs', () => {
    expect(defaultIsReopenable({ ...base, resolution: { kind: 'dismissed' } }, 1)).toBe(true);
  });

  test('a terminal `action` resolution → NOT reopenable', () => {
    expect(defaultIsReopenable({ ...base, resolution: { kind: 'action', action: 'x' } })).toBe(false);
  });

  test('a terminal `submit` resolution → NOT reopenable', () => {
    expect(defaultIsReopenable({ ...base, resolution: { kind: 'submit', data: {} } })).toBe(false);
  });

  test('an `expired` resolution → NOT reopenable', () => {
    expect(defaultIsReopenable({ ...base, resolution: { kind: 'expired' } })).toBe(false);
  });

  test('a stale `dismissed` (older than staleAfterMs) → NOT reopenable', () => {
    const at = new Date(NOW - 6000).toISOString();
    expect(defaultIsReopenable({ ...base, resolution: { kind: 'dismissed', at } }, 5000)).toBe(false);
  });

  test('a fresh `dismissed` within staleAfterMs → reopenable', () => {
    const at = new Date(NOW - 1000).toISOString();
    expect(defaultIsReopenable({ ...base, resolution: { kind: 'dismissed', at } }, 5000)).toBe(true);
  });

  test('Infinity staleAfterMs never expires by staleness', () => {
    const at = new Date(0).toISOString();
    expect(defaultIsReopenable({ ...base, resolution: { kind: 'dismissed', at } }, Infinity)).toBe(true);
  });

  test('no resolution at all → reopenable (vacuously)', () => {
    expect(defaultIsReopenable({ ...base, resolution: undefined })).toBe(true);
  });
});
