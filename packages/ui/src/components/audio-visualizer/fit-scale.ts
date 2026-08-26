import { createSignal, onCleanup, type Accessor } from 'solid-js';

/**
 * Fit-to-container scaling: the size tiers are fixed
 * px by design (`sizes.ts`), so a container narrower than a tier's natural
 * footprint used to CLIP the picture at its edges. The dispatcher now scales
 * the WHOLE visualization down proportionally to fit, and renders byte-equal
 * to the designed px metrics whenever the container is at least natural size.
 *
 * Why a transform-scale wrapper rather than relative units or reflow:
 * - The px tiers ARE the design (LiveKit parity); switching the geometry to
 *   relative units would change rendering at every container size, not just
 *   the overflowing ones.
 * - Reflowing (fewer bars, smaller gaps) changes what the animation MEANS;
 *   proportional scale keeps the exact picture, just smaller.
 * - A transform also covers the shader variants for free: their canvases size
 *   their backing store from layout size (`clientWidth`), which a transform
 *   does not change, so the bitmap stays at full natural resolution and only
 *   the composited output shrinks. No variant needs an exception.
 *
 * Both sizes are MEASURED (one ResizeObserver watching both wrappers), never
 * restated from `sizes.ts`: the natural footprint depends on variant, size
 * tier, barCount/count/radius and the consumer's own part styling, and a
 * hand-derived width table would rot the day any of those moved.
 *
 * Where ResizeObserver does not exist (SSR, jsdom) this is inert: scale stays
 * 1 and nothing is written, which is exactly the pre-fix rendering.
 */
export function computeFitScale(
  available: number | undefined,
  natural: number | undefined,
): number {
  if (
    available === undefined || natural === undefined ||
    !Number.isFinite(available) || !Number.isFinite(natural) ||
    available <= 0 || natural <= 0
  ) {
    return 1;
  }
  return Math.min(1, available / natural);
}

export interface FitScale {
  /** Ref for the outer wrapper (the host box, clamped by `max-width: 100%`). */
  observeOuter: (el: HTMLElement) => void;
  /** Ref for the inner wrapper (the natural-size content that gets scaled). */
  observeInner: (el: HTMLElement) => void;
  /** 1 when the content fits; the proportional shrink factor when it does not. */
  scale: Accessor<number>;
  /** The scaled content height in px while shrunk, else undefined: the outer
   *  wrapper adopts it so the page never reserves the unscaled height. */
  scaledHeight: Accessor<number | undefined>;
}

/**
 * One ResizeObserver over both wrappers. ResizeObserver reports layout
 * (border-box/content-box) sizes, which CSS transforms do not affect, so the
 * inner wrapper keeps reporting its NATURAL size even while scaled, and the
 * outer wrapper (whose `max-width: 100%` is what lets a narrow parent
 * actually constrain it) reports the width the container is offering. The
 * ratio of the two is the scale, with `computeFitScale` guarding the
 * unmeasured/degenerate cases to 1 so a bad reading can never blank the
 * element.
 */
export function createFitScale(): FitScale {
  const [availableWidth, setAvailableWidth] = createSignal<number>();
  const [naturalWidth, setNaturalWidth] = createSignal<number>();
  const [naturalHeight, setNaturalHeight] = createSignal<number>();

  let outerEl: HTMLElement | undefined;
  let innerEl: HTMLElement | undefined;
  let observer: ResizeObserver | undefined;

  const ensureObserver = (): ResizeObserver | undefined => {
    if (observer) return observer;
    if (typeof ResizeObserver === 'undefined') return undefined;
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // contentRect, not borderBoxSize: identical for these padding-less
        // wrappers and present everywhere this runs.
        if (entry.target === outerEl) setAvailableWidth(entry.contentRect.width);
        if (entry.target === innerEl) {
          setNaturalWidth(entry.contentRect.width);
          setNaturalHeight(entry.contentRect.height);
        }
      }
    });
    return observer;
  };

  onCleanup(() => observer?.disconnect());

  const scale = () => computeFitScale(availableWidth(), naturalWidth());
  const scaledHeight = () => {
    const k = scale();
    const h = naturalHeight();
    return k < 1 && h !== undefined && h > 0 ? h * k : undefined;
  };

  return {
    observeOuter: (el) => {
      outerEl = el;
      ensureObserver()?.observe(el);
    },
    observeInner: (el) => {
      innerEl = el;
      ensureObserver()?.observe(el);
    },
    scale,
    scaledHeight,
  };
}
