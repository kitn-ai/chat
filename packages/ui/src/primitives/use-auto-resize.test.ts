/**
 * Owner-reported bug (design round 7, via the builder's Advanced accept-type
 * textarea, which mounts inside a collapsed `<details>`): three real gaps in
 * this hook. `jsdom` has no real layout engine — it never runs CSS cascade,
 * never actually collapses a `display:none` subtree, and ships no
 * `ResizeObserver` at all — so none of the "does opening a real `<details>`
 * actually resize the box" story is provable here. What IS provable, and
 * what these tests pin: the DECISION LOGIC each gap's fix is built from —
 * `offsetParent === null` skips the write rather than collapsing to 0,
 * `ResizeObserver`'s callback (stubbed, same pattern as
 * `tests/primitives/use-resize-observer.test.ts`) re-triggers `resize()`,
 * the floor computation reads computed style correctly, and the primitive
 * degrades to its old rAF-only behavior when `ResizeObserver` doesn't exist.
 * The real proof that a collapsed `<details>` now resizes correctly on
 * reveal is the owner's own live Storybook, not this file.
 */
import { describe, it, expect, vi, type Mock } from 'vitest';
import { createRoot } from 'solid-js';
import { useAutoResize } from './use-auto-resize';
import { installFakeClock } from '../test-utils/fake-clock';

// `installFakeClock()` registers its own beforeEach/afterEach (rAF stub set
// up before each test, EVERY stubbed global — including any `ResizeObserver`
// a test below adds via `stubResizeObserver()` — torn down after). No
// additional cleanup hooks needed here; adding one would run BETWEEN
// installFakeClock's per-test setup and this file's test bodies and wipe the
// fresh rAF stub out from under every test, not just the RO-specific ones.
const { advance } = installFakeClock();

/** A stubbed `ResizeObserver` with a manual `emit()`, same shape as
 *  `tests/primitives/use-resize-observer.test.ts`'s — jsdom ships no real
 *  implementation, so every RO-driven test here drives it by hand. */
function stubResizeObserver() {
  const observers: { cb: () => void; observe: Mock; disconnect: Mock }[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
        observers.push({ cb, observe: vi.fn(), disconnect: vi.fn() });
      }
      observe(el: Element) {
        observers[observers.length - 1]!.observe(el);
      }
      disconnect() {
        observers[observers.length - 1]!.disconnect();
      }
    },
  );
  return {
    emitAll: () => observers.forEach((o) => o.cb()),
    observers,
  };
}

/** A `<textarea>` with `scrollHeight`/`offsetParent` as configurable own
 *  properties (both are read-only getters on the real prototype in a
 *  browser; jsdom's `scrollHeight` is always 0 and its `offsetParent` is
 *  always `null` since it never lays anything out — so a test that wants a
 *  specific value for either has to override the property directly). */
function makeTextarea(opts: { scrollHeight?: number; offsetParent?: Element | null } = {}) {
  const el = document.createElement('textarea');
  Object.defineProperty(el, 'scrollHeight', { value: opts.scrollHeight ?? 40, configurable: true });
  Object.defineProperty(el, 'offsetParent', {
    value: opts.offsetParent === undefined ? document.body : opts.offsetParent,
    configurable: true,
  });
  return el;
}

describe('useAutoResize', () => {
  it('sets the height to scrollHeight when it exceeds the floor', () => {
    createRoot((dispose) => {
      const { ref } = useAutoResize({ minHeight: 20 });
      const el = makeTextarea({ scrollHeight: 80 });
      ref(el);
      advance(16);
      expect(el.style.height).toBe('80px');
      dispose();
    });
  });

  it('gap #2 (min-height floor): floors the height at an explicit minHeight even when scrollHeight is smaller', () => {
    createRoot((dispose) => {
      const { ref } = useAutoResize({ minHeight: 40 });
      const el = makeTextarea({ scrollHeight: 0 }); // an empty field
      ref(el);
      advance(16);
      expect(el.style.height).toBe('40px');
      dispose();
    });
  });

  it('floors at one computed line (line-height + vertical padding/border) when no minHeight is given', () => {
    createRoot((dispose) => {
      const { ref } = useAutoResize();
      const el = makeTextarea({ scrollHeight: 0 });
      // jsdom's getComputedStyle DOES reflect an element's own inline style
      // (it just never runs cascade/layout), so setting these directly is
      // an honest way to control what oneLineHeight() reads.
      el.style.lineHeight = '20px';
      el.style.paddingTop = '4px';
      el.style.paddingBottom = '4px';
      el.style.borderTopWidth = '1px';
      el.style.borderBottomWidth = '1px';
      el.style.borderStyle = 'solid'; // border-width only computes once a style is set
      ref(el);
      advance(16);
      expect(el.style.height).toBe('30px'); // 20 + 4 + 4 + 1 + 1
      dispose();
    });
  });

  it('caps at maxHeight and switches to a scrolling overflow', () => {
    createRoot((dispose) => {
      const { ref } = useAutoResize({ maxHeight: 100, minHeight: 20 });
      const el = makeTextarea({ scrollHeight: 400 });
      ref(el);
      advance(16);
      expect(el.style.height).toBe('100px');
      expect(el.style.overflowY).toBe('auto');
      dispose();
    });
  });

  it('gap #1 (hidden-mount collapse): skips the write entirely when offsetParent is null, instead of collapsing to a 0-height box', () => {
    createRoot((dispose) => {
      const { ref, resize } = useAutoResize({ minHeight: 40 });
      const el = makeTextarea({ scrollHeight: 0, offsetParent: null }); // display:none, e.g. inside a collapsed <details>
      ref(el);
      advance(16);
      expect(el.style.height).toBe(''); // never written — NOT "0px"
      resize(); // an explicit re-invoke while still hidden changes nothing either
      expect(el.style.height).toBe('');
      dispose();
    });
  });

  it('gap #1 (reveal): re-measures correctly once the element becomes visible again', () => {
    createRoot((dispose) => {
      const { ref, resize } = useAutoResize({ minHeight: 40 });
      const el = makeTextarea({ scrollHeight: 0, offsetParent: null });
      ref(el);
      advance(16);
      expect(el.style.height).toBe('');
      // "Reveal": offsetParent becomes real again (a <details> opening) and
      // scrollHeight now reports real content height.
      Object.defineProperty(el, 'offsetParent', { value: document.body, configurable: true });
      Object.defineProperty(el, 'scrollHeight', { value: 60, configurable: true });
      resize();
      expect(el.style.height).toBe('60px');
      dispose();
    });
  });

  it('gap #1 (generic re-measure): a ResizeObserver notification re-invokes resize(), covering any container reflow, not just <details>', () => {
    const ro = stubResizeObserver();
    createRoot((dispose) => {
      const { ref } = useAutoResize({ minHeight: 40 });
      const el = makeTextarea({ scrollHeight: 0, offsetParent: null });
      ref(el);
      advance(16);
      expect(el.style.height).toBe(''); // hidden at mount
      expect(ro.observers[0]?.observe).toHaveBeenCalledWith(el);

      // Reveal, then let the ResizeObserver (not an 'input' event, not a
      // second ref() call) do the re-measurement.
      Object.defineProperty(el, 'offsetParent', { value: document.body, configurable: true });
      Object.defineProperty(el, 'scrollHeight', { value: 72, configurable: true });
      ro.emitAll();
      expect(el.style.height).toBe('72px');
      dispose();
    });
  });

  it('disconnects the ResizeObserver on cleanup', () => {
    const ro = stubResizeObserver();
    createRoot((dispose) => {
      const { ref } = useAutoResize();
      ref(makeTextarea());
      dispose();
    });
    expect(ro.observers[0]?.disconnect).toHaveBeenCalledTimes(1);
  });

  it('re-measures on an input event (unchanged prior behavior)', () => {
    createRoot((dispose) => {
      const { ref } = useAutoResize({ minHeight: 20 });
      const el = makeTextarea({ scrollHeight: 20 });
      ref(el);
      advance(16);
      expect(el.style.height).toBe('20px');
      Object.defineProperty(el, 'scrollHeight', { value: 90, configurable: true });
      el.dispatchEvent(new Event('input'));
      expect(el.style.height).toBe('90px');
      dispose();
    });
  });

  it('degrades to the rAF-only measurement when ResizeObserver does not exist in the environment', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    createRoot((dispose) => {
      const { ref } = useAutoResize({ minHeight: 20 });
      const el = makeTextarea({ scrollHeight: 55 });
      expect(() => ref(el)).not.toThrow();
      advance(16);
      expect(el.style.height).toBe('55px');
      dispose();
    });
  });
});
