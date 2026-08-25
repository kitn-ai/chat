import { describe, it, expect } from 'vitest';
import { createRoot, createSignal, flush } from 'solid-js';
import { createControllableSignal } from './controllable';

describe('createControllableSignal', () => {
  it('uses the initial value when uncontrolled (controlled accessor is undefined)', () => {
    createRoot((dispose) => {
      const [value] = createControllableSignal(() => undefined, true);
      expect(value()).toBe(true);
      dispose();
    });
  });

  it('updates via the setter when uncontrolled', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it (owned-scope write guard);
    // V2-FLUSH after each write (v2 stages writes until the microtask).
    const [[value, setValue], dispose] = createRoot((d) =>
      [createControllableSignal(() => undefined, false), d] as const);
    setValue(true);
    flush();
    expect(value()).toBe(true);
    dispose();
  });

  it('reflects the controlled value and ignores the internal setter while controlled', () => {
    // V2-SHAPE + V2-FLUSH: as above.
    const [controlled, setControlled] = createSignal<boolean | undefined>(false);
    const [[value, setValue], dispose] = createRoot((d) =>
      [createControllableSignal(controlled, false), d] as const);
    expect(value()).toBe(false);
    setValue(true); // masked while controlled
    flush();
    expect(value()).toBe(false);
    setControlled(true); // the controlling value wins
    flush();
    expect(value()).toBe(true);
    dispose();
  });

  it('falls back to the internal value when control is released (becomes undefined)', () => {
    // V2-SHAPE + V2-FLUSH: as above.
    const [controlled, setControlled] = createSignal<boolean | undefined>(true);
    const [[value, setValue], dispose] = createRoot((d) =>
      [createControllableSignal(controlled, false), d] as const);
    expect(value()).toBe(true);
    setValue(true); // sets internal (masked now)
    setControlled(undefined); // uncontrolled -> internal shows
    flush();
    expect(value()).toBe(true);
    dispose();
  });
});
