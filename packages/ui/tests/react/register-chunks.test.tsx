/**
 * Guards the ONE thing `registerAll()` exists to do: avoid the first-mount upgrade
 * delay WITHOUT paying for the element implementations twice.
 *
 * `registerAll()` dynamic-imports the coarse register-all bundle, which defines every
 * kai-* tag. A dynamic import settles no earlier than a microtask, but React runs
 * `useLayoutEffect` SYNCHRONOUSLY inside `render()` — so at first mount
 * `customElements.get(tag)` is still undefined and the wrapper used to fire its own
 * per-element chunk import as well. Measured in Chromium against a real Vite consumer
 * build, that made `<Chat/>` + `registerAll()` download BOTH implementations:
 * register-impl 811 kB + chat 553 kB = 1876 kB, against 1034 kB without `registerAll()`.
 * A consumer following our own documented advice paid 553 kB for a second copy of an
 * element the coarse bundle was already about to define.
 *
 * Run with `npm run test:react`.
 */
import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { createWebComponent, registerAll } from '../../frameworks/react/runtime';

afterEach(cleanup);

// Tags the prebuilt bundle in setup.ts does NOT define, so `customElements.get()`
// cannot short-circuit the check we are actually testing.
test('registerAll() suppresses the redundant per-element chunk import', () => {
  // A per-element register thunk that never settles — we only care THAT it was
  // invoked (i.e. that the chunk would have been requested), not what it loads.
  const pending = () => new Promise<unknown>(() => {});

  // 1. Baseline: with no registerAll() in flight, the per-element chunk is exactly
  //    how the tag gets registered. This must keep working.
  const soloRegister = vi.fn(pending);
  const Solo = createWebComponent('kai-probe-solo', [], {}, soloRegister);
  render(<Solo />);
  expect(soloRegister).toHaveBeenCalledTimes(1);

  // 2. The documented opt-in. Its import() is still pending when React mounts, which
  //    is the whole race. The coarse bundle defines this tag too, so fetching the
  //    per-element chunk downloads a second copy of the same implementation.
  registerAll();

  const dupRegister = vi.fn(pending);
  const Dup = createWebComponent('kai-probe-dup', [], {}, dupRegister);
  render(<Dup />);
  expect(dupRegister).not.toHaveBeenCalled();
});
