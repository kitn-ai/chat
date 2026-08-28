import { onCleanup } from 'solid-js';

interface UseAutoResizeOptions {
  /** Cap the grown height; past it the box stops growing and scrolls
   *  internally instead. */
  maxHeight?: number;
  /**
   * Floor the resized height at this many pixels, even when the field is
   * empty. Omit to fall back to ONE visible line, derived from the
   * textarea's own computed line-height plus its vertical padding/border
   * (`oneLineHeight` below) — an empty autosizing field should never
   * collapse to a sliver shorter than a line of text, which is what
   * `scrollHeight` on an empty `<textarea>` can report.
   */
  minHeight?: number;
}

/**
 * One visible line's rendered height, in px: computed `line-height` (falling
 * back to a `normal`-keyword-safe `1.2× font-size` — `getComputedStyle`
 * resolves `line-height: normal` to the literal string `"normal"`, which
 * `parseFloat` reads as `NaN`, not a length) plus the element's own vertical
 * padding and border. The border-box height this hook writes (`scrollHeight`,
 * and what it's floored against) includes padding+border, so a floor of the
 * bare line-height alone would still let a heavily-padded field collapse
 * tighter than it visually needs to.
 */
function oneLineHeight(el: HTMLTextAreaElement): number {
  const cs = getComputedStyle(el);
  let lineHeight = parseFloat(cs.lineHeight);
  if (Number.isNaN(lineHeight)) {
    const fontSize = parseFloat(cs.fontSize) || 14;
    lineHeight = fontSize * 1.2;
  }
  const paddingY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const borderY = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
  return lineHeight + paddingY + borderY;
}

export function useAutoResize(options: UseAutoResizeOptions = {}) {
  let textareaEl: HTMLTextAreaElement | undefined;
  let ro: ResizeObserver | undefined;

  function resize() {
    if (!textareaEl) return;
    // Hidden / not laid out (`display:none`, most commonly a textarea
    // mounted inside a collapsed <details> — exactly the builder's Advanced
    // disclosure): `offsetParent` is `null` for a display:none element, the
    // one cheap, reliable "am I actually in the layout" signal (no real
    // layout engine needed to read it, which matters because jsdom doesn't
    // have one). `scrollHeight` on a hidden element reads 0, and WRITING
    // that as the height is gap #1 this hook used to have — the box
    // collapsed to nothing and nothing ever re-measured it on reveal,
    // because opening a <details> fires no 'input' event. So: skip the
    // write here and let it stay whatever it last was; the ResizeObserver
    // below re-invokes this once the element's box actually changes (0×0 ->
    // real dimensions on reveal), and THAT call does the real measurement.
    if (textareaEl.offsetParent === null) return;
    textareaEl.style.height = 'auto';
    const scrollHeight = textareaEl.scrollHeight;
    const floor = options.minHeight ?? oneLineHeight(textareaEl);
    const target = Math.max(scrollHeight, floor);
    if (options.maxHeight && target > options.maxHeight) {
      textareaEl.style.height = `${options.maxHeight}px`;
      textareaEl.style.overflowY = 'auto';
    } else {
      textareaEl.style.height = `${target}px`;
      textareaEl.style.overflowY = 'hidden';
    }
  }

  function ref(el: HTMLTextAreaElement) {
    textareaEl = el;
    el.addEventListener('input', resize);
    // Initial measurement: the same rAF-deferred call this hook always did
    // (deferred past the first paint so `getComputedStyle` sees final
    // layout). Kept even though the ResizeObserver below ALSO fires once on
    // `observe()` with the element's starting box — the two are redundant
    // exactly when the field starts visible (harmless: `resize()` is
    // idempotent) and the rAF path is what covers an environment with no
    // `ResizeObserver` at all (see the fallback branch below).
    requestAnimationFrame(resize);
    // Re-measure on ANY size/visibility change to the element itself — this
    // is what covers "revealed inside a collapsed <details>" GENERICALLY
    // (gap #2), rather than as a one-off fix for that single call site: any
    // container reflow that changes the textarea's box (a parent's display
    // toggling, a sidebar resizing, a responsive layout breakpoint) re-runs
    // `resize()` the same way. A `ResizeObserver` fires once immediately
    // after `observe()` (with the box at observe-time — 0×0 while hidden,
    // which `resize()`'s own guard above turns into a no-op) and again on
    // every subsequent real size change, INCLUDING display:none -> block,
    // which is exactly the transition a `<details>` toggle produces.
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => resize());
      ro.observe(el);
    }
    onCleanup(() => {
      el.removeEventListener('input', resize);
      ro?.disconnect();
    });
  }

  return { ref, resize };
}
