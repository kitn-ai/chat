import { test, expect, vi, beforeEach } from 'vitest';
import { observeContentHeight, observeDocumentHeight } from '../../src/primitives/use-resize-observer';

beforeEach(() => {
  const cbs: Array<(e: { contentRect: { height: number } }[]) => void> = [];
  vi.stubGlobal('ResizeObserver', class {
    cb: (e: unknown[]) => void;
    constructor(cb: (e: unknown[]) => void) { this.cb = cb; cbs.push(cb as never); }
    observe() {} disconnect() {}
    static emit(h: number) { cbs.forEach((c) => c([{ contentRect: { height: h } } as never])); }
  });
});

test('observeContentHeight reports height changes above the threshold only', () => {
  const el = document.createElement('div');
  const heights: number[] = [];
  const dispose = observeContentHeight(el, (h) => heights.push(h));
  (globalThis.ResizeObserver as unknown as { emit(h: number): void }).emit(100);
  (globalThis.ResizeObserver as unknown as { emit(h: number): void }).emit(100.5);
  (globalThis.ResizeObserver as unknown as { emit(h: number): void }).emit(140);
  dispose();
  expect(heights).toEqual([100, 140]);
});

// D1 (rung 5 IVP task-10-report.md): observeContentHeight reports the ResizeObserver
// CONTENT-BOX height of the observed element, which drops the element's own
// padding/border AND any ancestor (e.g. body) padding above it. A remote-card provider
// page that sizes its iframe from that number under-reports the true needed height by
// exactly those lost offsets, clipping the bottom of the card (measured: 54px lost —
// .board padding 14×2 + border 1×2 + body padding 12×2, host-embed.ts:215 sizeIframe).
// observeDocumentHeight must report the FULL rendered document height instead, via
// document.body.scrollHeight, so it stays correct regardless of which ancestor element
// carries the padding/border (robust to provider page style changes — unlike reading
// contentRect off one specific element, or hand-summing computed padding/border off a
// fixed list of ancestors). NOTE: this reads `body.scrollHeight`, not
// `documentElement.scrollHeight` — see the N1 test below for why.
test('observeDocumentHeight reports the full document height (border-box + ancestor padding), not the content-box of the observed element', () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  try {
    // Fixture: the observed element's OWN content-box is 342.5px (what
    // observeContentHeight would report), but the full rendered document — including
    // the element's border/padding and the body's padding above it — is 397px, a 54.5px
    // gap consistent with D1's measured shape.
    Object.defineProperty(document.body, 'scrollHeight', {
      configurable: true,
      value: 397,
    });

    const heights: number[] = [];
    const dispose = observeDocumentHeight(el, (h) => heights.push(h));
    // The observer fires on the OBSERVED element's content-box resize (342.5px), but the
    // reported height must be the document's full height (397px), not 342.5.
    (globalThis.ResizeObserver as unknown as { emit(h: number): void }).emit(342.5);
    dispose();

    expect(heights).toEqual([397]);
  } finally {
    el.remove();
    delete (document.body as unknown as { scrollHeight?: number }).scrollHeight;
  }
});

// N1 (task-10-report.md "Fix-wave re-review"): `document.documentElement.scrollHeight`
// is spec-floored to the viewport height for the ROOT element specifically (CSSOM View
// §"scrollHeight": "If the element is the root element ... return max(viewport scrolling
// area height, viewport height)") — and the host sets that very viewport from the last
// reported height (host-embed.ts sizeIframe). So once the frame has grown, a shrinking
// card can never report a smaller number: documentElement.scrollHeight is clamped at the
// iframe's OWN current height for the life of the frame (a one-way ratchet). `<body>` is
// not the root element, so `body.scrollHeight` carries no such floor — it reflects the
// body's actual padding-box (content + own padding), which is exactly what shrinks when
// the card's content does. Fixture: the frame has grown to 613 (documentElement is
// stale/floored at 613), but the card has shrunk and the body's real content need is
// 396.5 — observeDocumentHeight must report the smaller, real number.
test('observeDocumentHeight reports a SHRINKING height (not floored at the stale, viewport-clamped documentElement.scrollHeight)', () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  try {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 613, // stale: floored at the iframe's current (grown) viewport height
    });
    Object.defineProperty(document.body, 'scrollHeight', {
      configurable: true,
      value: 396.5, // real: the board shrank after "Clear run"
    });

    const heights: number[] = [];
    const dispose = observeDocumentHeight(el, (h) => heights.push(h));
    (globalThis.ResizeObserver as unknown as { emit(h: number): void }).emit(200);
    dispose();

    expect(heights).toEqual([396.5]);
  } finally {
    el.remove();
    delete (document.documentElement as unknown as { scrollHeight?: number }).scrollHeight;
    delete (document.body as unknown as { scrollHeight?: number }).scrollHeight;
  }
});
