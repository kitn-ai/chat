import { type JSX, splitProps, createSignal, createEffect, createContext, useContext, For, Show, children as resolveChildren } from 'solid-js';
import { cn } from '../utils/cn';

// --- Types ---

type Orientation = 'horizontal' | 'vertical';

/** A size value: a number (percent), `"25%"` (percent), or `"280px"` (pixels). */
export type SizeValue = number | string;

interface ResizableContextValue {
  orientation: Orientation;
}

export const ResizableContext = createContext<ResizableContextValue>();

/**
 * Normalize a px-or-% size into a CSS length string usable as `flex-basis`.
 * - number → percent (`30` → `"30%"`)
 * - `"25%"` → percent passthrough
 * - `"280px"` → pixel passthrough
 * Returns `undefined` for unset values (caller falls back to flexible `flex: 1`).
 */
export function normalizeSize(value: SizeValue | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? `${value}%` : undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (trimmed.endsWith('%') || trimmed.endsWith('px')) return trimmed;
  // bare numeric string → percent
  const n = Number(trimmed);
  return Number.isFinite(n) ? `${n}%` : undefined;
}

/**
 * Resolve a px-or-% size to pixels, given the container's main-axis size.
 * Used to seed `data-min-size` / `data-max-size` (which the handle reads as px).
 * Returns `undefined` when the value is unset.
 */
export function resolveToPx(value: SizeValue | undefined, containerPx: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? (value / 100) * containerPx : undefined;
  const trimmed = value.trim();
  if (trimmed.endsWith('px')) {
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  if (trimmed.endsWith('%')) {
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? (n / 100) * containerPx : undefined;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? (n / 100) * containerPx : undefined;
}

/** Parse a CSS length we can statically clamp (`px` or `%` only). */
function parseStaticLen(v: string): { n: number; unit: 'px' | '%' } | null {
  const m = /^\s*(-?\d*\.?\d+)(px|%)\s*$/.exec(v);
  return m ? { n: parseFloat(m[1]), unit: m[2] as 'px' | '%' } : null;
}

/**
 * Build a panel's INITIAL `flex-basis`, clamped into its `[min, max]` bounds so
 * it never PAINTS past its max (or below its min). The drag handler already
 * clamps, but only once a drag begins — without this, a percentage default on a
 * wide container (e.g. `40%` against a `480px` max) renders wider than max and
 * then SNAPS to max on the first resize. Uses CSS `clamp()`/`min()`/`max()` so
 * the bound is enforced at layout time against the live container size, with
 * MIXED units (a `%` default vs a `px` max) resolving correctly — no JS measure.
 * `basis`/`min`/`max` are already-normalized CSS lengths (see `normalizeSize`);
 * an undefined `basis` stays undefined → the caller falls back to flexible.
 */
export function clampBasis(
  basis: string | undefined,
  min: string | undefined,
  max: string | undefined,
): string | undefined {
  if (basis === undefined) return undefined;
  // Static fast-path: when the basis and every present bound share ONE unit
  // (all px or all %), the clamp is computable at author time, so emit a bare
  // value. This avoids a needless clamp()/min()/max() wrapper (and keeps jsdom
  // from reducing an all-px clamp() to calc()). MIXED units (e.g. a `%` basis
  // against a `px` max) can only resolve against the live container, so they
  // keep the CSS function and clamp at layout time.
  const b = parseStaticLen(basis);
  const lo = min === undefined ? undefined : parseStaticLen(min);
  const hi = max === undefined ? undefined : parseStaticLen(max);
  if (b && (min === undefined || lo?.unit === b.unit) && (max === undefined || hi?.unit === b.unit)) {
    // CSS clamp(MIN, VAL, MAX) === max(MIN, min(VAL, MAX)).
    let n = b.n;
    if (hi) n = Math.min(n, hi.n);
    if (lo) n = Math.max(n, lo.n);
    return `${n}${b.unit}`;
  }
  if (min !== undefined && max !== undefined) return `clamp(${min}, ${basis}, ${max})`;
  if (max !== undefined) return `min(${basis}, ${max})`;
  if (min !== undefined) return `max(${min}, ${basis})`;
  return basis;
}

// --- ResizablePanelGroup ---

export interface ResizablePanelGroupProps extends JSX.HTMLAttributes<HTMLDivElement> {
  orientation?: Orientation;
  children: JSX.Element;
}

function ResizablePanelGroup(props: ResizablePanelGroupProps) {
  const [local, rest] = splitProps(props, ['orientation', 'children', 'class']);
  const orientation = () => local.orientation ?? 'horizontal';

  return (
    <ResizableContext.Provider value={{ orientation: orientation() }}>
      <div
        class={cn(
          'flex h-full w-full',
          orientation() === 'vertical' ? 'flex-col' : 'flex-row',
          local.class
        )}
        data-orientation={orientation()}
        {...rest}
      >
        {local.children}
      </div>
    </ResizableContext.Provider>
  );
}

// --- ResizablePanel ---

export interface ResizablePanelProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Initial main-axis size: number/`"25%"` (percent) or `"280px"` (pixels). Omitted → flexible. */
  defaultSize?: SizeValue;
  /** Minimum size during resize (px or %). */
  minSize?: SizeValue;
  /** Maximum size during resize (px or %). */
  maxSize?: SizeValue;
  /** When true, the panel's size is fixed and adjacent handles are non-draggable. */
  locked?: boolean;
  /** When true, the panel is not visible (used by the `Resizable` convenience to drop dividers). */
  hidden?: boolean;
  children: JSX.Element;
}

function ResizablePanel(props: ResizablePanelProps) {
  const [local, rest] = splitProps(props, [
    'defaultSize', 'minSize', 'maxSize', 'locked', 'hidden', 'children', 'class', 'style',
  ]);
  // GRID-FILL model: the panel sizes itself on the MAIN axis via flex-basis (or
  // flex:1 when flexible) as a flex item of the group — the handle rewrites that
  // basis, so the drag math is plain flex. For the FILL it is itself a
  // `display:grid` with a single `minmax(0,1fr)` cell on BOTH axes: a grid item
  // (the child) stretches to fill its cell on both axes by default, and `1fr` of
  // a definite-sized grid is a *definite* length — so arbitrary child content
  // fills the panel on width AND height without needing `height:100%`, in both
  // orientations. (A flex panel only stretches the CROSS axis, collapsing the
  // main axis to content size — the bug this replaces.) Mirrors the
  // `<kai-resizable>` web-component panel and the Shoelace/Web Awesome grid layout.
  // min:0 on BOTH axes enables shrink-to-scroll; overflow hidden.
  // Effective min/max as CSS lengths, sourced from the typed `minSize`/`maxSize`
  // props OR — when absent — from the `data-min-size`/`-pct` (and `-max-`)
  // attributes a consumer may pass directly. The `kai-workspace` rail does the
  // latter (`<ResizablePanel data-min-size="240" data-max-size="420">`). A bare
  // `data-*-size` is pixels, `data-*-size-pct` is percent — the same convention
  // the handle reads at drag time, so the initial clamp matches the drag clamp.
  const effectiveBound = (
    localVal: SizeValue | undefined,
    pxAttr: unknown,
    pctAttr: unknown,
  ): string | undefined => {
    const fromProp = normalizeSize(localVal);
    if (fromProp !== undefined) return fromProp;
    const px = pxAttr == null ? '' : String(pxAttr).trim();
    if (px !== '') { const n = parseFloat(px); if (Number.isFinite(n)) return `${n}px`; }
    const pct = pctAttr == null ? '' : String(pctAttr).trim();
    if (pct !== '') { const n = parseFloat(pct); if (Number.isFinite(n)) return `${n}%`; }
    return undefined;
  };

  const sizeStyle = (): Record<string, string> => {
    const r = rest as Record<string, unknown>;
    const minB = effectiveBound(local.minSize, r['data-min-size'], r['data-min-size-pct']);
    const maxB = effectiveBound(local.maxSize, r['data-max-size'], r['data-max-size-pct']);
    const basis = clampBasis(normalizeSize(local.defaultSize), minB, maxB);
    const base: Record<string, string> = basis !== undefined
      ? { 'flex-basis': basis, 'flex-grow': '0', 'flex-shrink': '0' }
      : { flex: '1 1 0%' };
    return {
      ...base,
      display: 'grid',
      'grid-template-rows': 'minmax(0, 1fr)',
      'grid-template-columns': 'minmax(0, 1fr)',
      'min-width': '0',
      'min-height': '0',
    };
  };

  // Reflect min/max to data-* in pixels where statically resolvable. The handle
  // reads `data-min-size`/`data-max-size` (as px) at drag time. Percent values
  // are resolved against the container by the handle at drag time when expressed
  // as `data-min-size-pct` / `data-max-size-pct`; pixel values go straight to
  // `data-min-size` / `data-max-size`.
  const dataAttrs = () => {
    const out: Record<string, string | undefined> = {};
    const setBound = (val: SizeValue | undefined, pxKey: string, pctKey: string) => {
      if (val === undefined || val === null || val === '') return;
      if (typeof val === 'number') { out[pctKey] = String(val); return; }
      const t = val.trim();
      if (t.endsWith('px')) out[pxKey] = String(parseFloat(t));
      else if (t.endsWith('%')) out[pctKey] = String(parseFloat(t));
      else if (Number.isFinite(Number(t))) out[pctKey] = t;
    };
    setBound(local.minSize, 'data-min-size', 'data-min-size-pct');
    setBound(local.maxSize, 'data-max-size', 'data-max-size-pct');
    // Reflect the DEFAULT size too, so a double-click on an adjacent handle can
    // restore this panel to it after a drag has rewritten its inline flex-basis.
    // A panel with no defaultSize records nothing → the handle resets it to the
    // flexible `flex:1` state instead.
    setBound(local.defaultSize, 'data-default-size', 'data-default-size-pct');
    return out;
  };

  return (
    <div
      class={cn('overflow-hidden', local.class)}
      style={{ ...sizeStyle(), ...(typeof local.style === 'object' ? local.style : {}) }}
      data-locked={local.locked ? '' : undefined}
      hidden={local.hidden || undefined}
      {...dataAttrs()}
      {...rest}
    >
      {local.children}
    </div>
  );
}

// --- ResizableHandle ---

export interface ResizableHandleProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /**
   * Divider affordance drawn inside the 8px grab zone:
   * - `line` (default) — a 1px hairline, transparent at rest, tinting on hover/drag.
   * - `grip` — a dotted grip handle.
   * - `none` — no visible divider (invisible hit-area only).
   */
  handle?: 'line' | 'grip' | 'none';
  onPanelResize?: (delta: number) => void;
  /** Keyboard nudge step in pixels (default 16). Home/End jump to min/max. */
  keyboardStep?: number;
  /** Render as a static, non-interactive divider (e.g. between locked panels). */
  static?: boolean;
  /** Explicit axis; overrides `ResizableContext`. Needed by facades that render
   * handles outside a context provider (e.g. `<kai-resizable>`). */
  orientation?: Orientation;
}

/** Read a panel's min/max bound (px), resolving percent against the container. */
function readBound(el: HTMLElement, kind: 'min' | 'max', containerPx: number, fallback: number): number {
  const px = el.dataset[kind === 'min' ? 'minSize' : 'maxSize'];
  if (px !== undefined && px !== '') {
    const n = parseFloat(px);
    if (Number.isFinite(n)) return n;
  }
  const pct = el.dataset[kind === 'min' ? 'minSizePct' : 'maxSizePct'];
  if (pct !== undefined && pct !== '') {
    const n = parseFloat(pct);
    if (Number.isFinite(n)) return (n / 100) * containerPx;
  }
  return fallback;
}

function ResizableHandle(props: ResizableHandleProps) {
  const [local, rest] = splitProps(props, [
    'handle', 'onPanelResize', 'class', 'keyboardStep', 'static', 'orientation',
  ]);
  const ctx = useContext(ResizableContext);
  const orientation = () => local.orientation ?? ctx?.orientation ?? 'horizontal';
  const [isDragging, setIsDragging] = createSignal(false);
  const [hovering, setHovering] = createSignal(false);
  const isStatic = () => !!local.static;
  // Divider affordance; `line` (hairline) is the default.
  const mode = () => local.handle ?? 'line';

  let startPos = 0;
  let prevEl: HTMLElement | null = null;
  let nextEl: HTMLElement | null = null;
  let prevSize = 0;
  let nextSize = 0;

  const isHoriz = () => orientation() === 'horizontal';
  const dim = (): 'width' | 'height' => (isHoriz() ? 'width' : 'height');

  const handlePointerDown = (e: PointerEvent) => {
    if (isStatic()) return;
    const handle = e.currentTarget as HTMLElement;
    prevEl = handle.previousElementSibling as HTMLElement;
    nextEl = handle.nextElementSibling as HTMLElement;

    if (!prevEl || !nextEl) return;

    e.preventDefault();
    setIsDragging(true);
    handle.setPointerCapture(e.pointerId);

    startPos = isHoriz() ? e.clientX : e.clientY;
    prevSize = prevEl.getBoundingClientRect()[dim()];
    nextSize = nextEl.getBoundingClientRect()[dim()];
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDragging() || !prevEl || !nextEl) return;

    const currentPos = isHoriz() ? e.clientX : e.clientY;
    const delta = currentPos - startPos;
    applyDelta(delta);
  };

  /**
   * Apply a pixel delta to the adjacent panels. The delta is CLAMPED (not
   * rejected) so the dragged panel lands exactly on the nearest min/max bound
   * — this avoids the stair-step where a step that would cross a bound was
   * dropped wholesale, leaving the panel short of its limit.
   */
  function applyDelta(delta: number): boolean {
    if (!prevEl || !nextEl) return false;
    const container = prevEl.parentElement;
    const containerPx = container ? container.getBoundingClientRect()[dim()] : 0;

    const prevMin = readBound(prevEl, 'min', containerPx, 0);
    const prevMax = readBound(prevEl, 'max', containerPx, 999999);
    const nextMin = readBound(nextEl, 'min', containerPx, 0);
    const nextMax = readBound(nextEl, 'max', containerPx, 999999);

    // Clamp the delta to the tightest bound across both panels. prev grows by
    // +delta, next shrinks by -delta (and vice versa), so each bound maps to a
    // limit on delta. Intersect them all, then clamp the requested delta.
    let lo = -Infinity; // most-negative allowed delta
    let hi = Infinity;  // most-positive allowed delta
    // prev: prevSize + delta in [prevMin, prevMax]
    lo = Math.max(lo, prevMin - prevSize);
    hi = Math.min(hi, prevMax - prevSize);
    // next: nextSize - delta in [nextMin, nextMax] → delta in [nextSize-nextMax, nextSize-nextMin]
    lo = Math.max(lo, nextSize - nextMax);
    hi = Math.min(hi, nextSize - nextMin);

    if (lo > hi) return false; // no feasible delta (contradictory bounds)
    const clamped = Math.max(lo, Math.min(hi, delta));

    const newPrevSize = prevSize + clamped;
    const newNextSize = nextSize - clamped;

    prevEl.style.flexBasis = `${newPrevSize}px`;
    prevEl.style.flexGrow = '0';
    prevEl.style.flexShrink = '0';
    nextEl.style.flexBasis = `${newNextSize}px`;
    nextEl.style.flexGrow = '0';
    nextEl.style.flexShrink = '0';

    local.onPanelResize?.(clamped);
    return true;
  }

  /**
   * Convert the pixel flex-basis on the TWO adjacent panels to percentages of
   * the container, INDEPENDENTLY of one another. With >2 panels, `nextPct` is
   * NOT `100 - prevPct` (that would steal the other panels' space and overflow
   * the container) — each panel's percent is its own pixel size over the total.
   * All other panels are left untouched.
   */
  function settleToPercent() {
    if (!prevEl || !nextEl) return;
    const container = prevEl.parentElement;
    if (!container) return;
    const total = container.getBoundingClientRect()[dim()];
    if (total <= 0) return;
    const prevPct = (prevEl.getBoundingClientRect()[dim()] / total) * 100;
    const nextPct = (nextEl.getBoundingClientRect()[dim()] / total) * 100;
    prevEl.style.flexBasis = `${prevPct}%`;
    nextEl.style.flexBasis = `${nextPct}%`;
  }

  const handlePointerUp = () => {
    settleToPercent();
    setIsDragging(false);
    prevEl = null;
    nextEl = null;
  };

  /**
   * Restore one adjacent panel to its DEFAULT size. Reads the panel's reflected
   * `data-default-size` (px) / `data-default-size-pct` (percent); if neither is
   * present the panel had no explicit default → return it to the flexible
   * `flex: 1 1 0%` state (clear inline basis, grow:1) so it reclaims free space.
   */
  function resetPanelToDefault(el: HTMLElement) {
    const px = el.dataset.defaultSize;
    const pct = el.dataset.defaultSizePct;
    if (px !== undefined && px !== '') {
      el.style.flexBasis = `${px}px`;
      el.style.flexGrow = '0';
      el.style.flexShrink = '0';
    } else if (pct !== undefined && pct !== '') {
      el.style.flexBasis = `${pct}%`;
      el.style.flexGrow = '0';
      el.style.flexShrink = '0';
    } else {
      // No declared default → flexible panel: clear the dragged basis and grow.
      el.style.flexBasis = '';
      el.style.flexGrow = '1';
      el.style.flexShrink = '1';
    }
  }

  /**
   * Double-clicking the divider restores BOTH adjacent panels to their default
   * sizes — a fast "snap back" after a drag. No-op on a static (locked) handle.
   */
  const handleDblClick = (e: MouseEvent) => {
    if (isStatic()) return;
    const handle = e.currentTarget as HTMLElement;
    const prev = handle.previousElementSibling as HTMLElement | null;
    const next = handle.nextElementSibling as HTMLElement | null;
    if (!prev || !next) return;
    e.preventDefault();
    resetPanelToDefault(prev);
    resetPanelToDefault(next);
    // Re-emit so consumers (and the element facade) observe the new sizes.
    local.onPanelResize?.(0);
  };

  // --- Keyboard resize ---
  const aria = createSignal(50);
  const [valueNow, setValueNow] = aria;

  /** Seed prev/next refs + sizes for a keyboard nudge starting from a key event. */
  function beginKeyboard(handle: HTMLElement) {
    prevEl = handle.previousElementSibling as HTMLElement;
    nextEl = handle.nextElementSibling as HTMLElement;
    if (!prevEl || !nextEl) return false;
    prevSize = prevEl.getBoundingClientRect()[dim()];
    nextSize = nextEl.getBoundingClientRect()[dim()];
    return true;
  }

  function updateAria() {
    if (!prevEl) return;
    const container = prevEl.parentElement;
    if (!container) return;
    const total = container.getBoundingClientRect()[dim()];
    if (total <= 0) return;
    const pct = (prevEl.getBoundingClientRect()[dim()] / total) * 100;
    setValueNow(Math.round(pct));
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isStatic()) return;
    const handle = e.currentTarget as HTMLElement;
    const step = local.keyboardStep ?? 16;
    const horiz = isHoriz();
    const decKey = horiz ? 'ArrowLeft' : 'ArrowUp';
    const incKey = horiz ? 'ArrowRight' : 'ArrowDown';

    let delta: number | 'min' | 'max' | null = null;
    if (e.key === decKey) delta = -step;
    else if (e.key === incKey) delta = step;
    else if (e.key === 'Home') delta = 'min';
    else if (e.key === 'End') delta = 'max';
    else return;

    e.preventDefault();
    if (!beginKeyboard(handle)) return;

    if (delta === 'min') {
      // Shrink prev to its minimum.
      const container = prevEl!.parentElement;
      const containerPx = container ? container.getBoundingClientRect()[dim()] : 0;
      const prevMin = readBound(prevEl!, 'min', containerPx, 0);
      applyDelta(prevMin - prevSize);
    } else if (delta === 'max') {
      const container = prevEl!.parentElement;
      const containerPx = container ? container.getBoundingClientRect()[dim()] : 0;
      const prevMax = readBound(prevEl!, 'max', containerPx, 999999);
      applyDelta(prevMax - prevSize);
    } else {
      applyDelta(delta);
    }
    updateAria();
    settleToPercent();
    prevEl = null;
    nextEl = null;
  };

  // The full-strip drag highlight is only for `grip`/`none`; `line` shows its tint
  // on the hairline alone (below), so the whole 8px zone must stay transparent.
  const showStripHighlight = () => isDragging() && mode() !== 'line';
  // Hairline tint (priority: dragging > hovering > rest). Inline CSS-var values
  // with literal-hex fallbacks — this renders in a shadow root AND in light-DOM
  // stories, where Tailwind arbitrary-value classes aren't reliably present.
  const lineColor = () =>
    isDragging()
      ? 'var(--color-muted, #f4f4f5)'
      : hovering()
        ? 'var(--color-border, #e4e4e7)'
        : 'transparent';

  return (
    <div
      class={cn('relative flex items-center justify-center', local.class)}
      style={{
        cursor: isStatic() ? 'default' : isHoriz() ? 'col-resize' : 'row-resize',
        [isHoriz() ? 'width' : 'height']: '8px',
        // The panels on either side are given explicit `flex-shrink: 0` (see
        // `applyDelta`/`resetPanelToDefault`/`ResizablePanel.sizeStyle`) so THEY
        // never yield space back to the handle. Without an equally explicit
        // shrink here the handle keeps the flexbox default (`flex-shrink: 1`),
        // so the moment its neighbors' sizes sum to (or exceed) the container's
        // main axis — e.g. two percentage sizes that add to 100% after a
        // maximize/restore round trip — flexbox has nowhere else to reclaim the
        // 8px shortfall from and squeezes the handle itself to a computed width
        // of 0. That makes the divider invisible AND undraggable (no hit area)
        // until reload. Pin it to never shrink, matching its neighbors.
        'flex-shrink': '0',
        'background': showStripHighlight() ? 'var(--color-muted-foreground, #98989f)' : 'transparent',
        'opacity': showStripHighlight() ? '0.3' : '1',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onDblClick={handleDblClick}
      onKeyDown={handleKeyDown}
      role="separator"
      tabIndex={isStatic() ? undefined : 0}
      data-orientation={orientation()}
      data-static={isStatic() ? '' : undefined}
      aria-orientation={isHoriz() ? 'vertical' : 'horizontal'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valueNow()}
      {...rest}
    >
      <Show when={mode() === 'grip'}>
        <div
          class={cn(
            'z-10 flex items-center justify-center',
            isHoriz() ? 'h-6 w-3 flex-col' : 'h-3 w-6 flex-row',
          )}
        >
          <svg
            class={cn(
              'text-muted-foreground/40',
              isHoriz() ? 'h-3 w-2' : 'h-2 w-3 rotate-90'
            )}
            viewBox="0 0 4 8"
            fill="currentColor"
          >
            <circle cx="1" cy="1.5" r="0.6" />
            <circle cx="3" cy="1.5" r="0.6" />
            <circle cx="1" cy="4" r="0.6" />
            <circle cx="3" cy="4" r="0.6" />
            <circle cx="1" cy="6.5" r="0.6" />
            <circle cx="3" cy="6.5" r="0.6" />
          </svg>
        </div>
      </Show>
      <Show when={mode() === 'line'}>
        {/* 1px hairline centered in the 8px grab zone; never eats the drag. */}
        <div
          class="pointer-events-none"
          data-handle-line
          style={{
            position: 'absolute',
            background: lineColor(),
            ...(isHoriz()
              ? { top: '0', bottom: '0', left: '50%', width: '1px', transform: 'translateX(-0.5px)' }
              : { left: '0', right: '0', top: '50%', height: '1px', transform: 'translateY(-0.5px)' }),
          }}
        />
      </Show>
    </div>
  );
}

// --- Resizable (convenience: auto-inserts handles between visible panels) ---

export interface ResizableProps {
  orientation?: Orientation;
  /** Fired on drag-end / keyboard resize / visibility change with the current panel sizes (percent). */
  onChange?: (sizes: number[]) => void;
  /** Divider affordance on each interactive handle: `line` (default), `grip`, or `none`. */
  handle?: 'line' | 'grip' | 'none';
  class?: string;
  /** Which panel index is maximized (null = none). Hides the others. */
  maximizedIndex?: number | null;
  /** Fired when the maximized panel changes (index, or null on restore). */
  onMaximizeChange?: (index: number | null) => void;
  /** `ResizablePanel` children. */
  children: JSX.Element;
}

/**
 * Convenience group that takes `ResizablePanel` children and AUTO-INSERTS a
 * `ResizableHandle` between each pair of visible (non-`hidden`) panels. A handle
 * is interactive only between two unlocked neighbors; otherwise it renders as a
 * static divider. Power users who need manual control can keep using
 * `ResizablePanelGroup` + explicit `ResizableHandle`s.
 */
function Resizable(props: ResizableProps) {
  const [local] = splitProps(props, [
    'orientation', 'onChange', 'handle', 'class', 'children', 'maximizedIndex', 'onMaximizeChange',
  ]);
  const orientation = () => local.orientation ?? 'horizontal';

  // Resolve children to the actual panel elements so we can read their props.
  const resolved = resolveChildren(() => local.children);

  const panels = (): { el: Element; locked: boolean; hidden: boolean }[] => {
    const arr = resolved.toArray().filter((c): c is Element => c instanceof Element);
    return arr.map((el) => ({
      el,
      locked: el.hasAttribute('data-locked'),
      hidden: (el as HTMLElement).hidden || el.hasAttribute('hidden'),
    }));
  };

  const visible = () => panels().filter((p) => !p.hidden);

  const maxIdx = () => local.maximizedIndex ?? null;
  // When maximized, only the maximized panel is "visible" for layout; siblings drop
  // (mirrors the web-component facade hiding siblings). Indices are over all panels.
  // Note: stash/restore of sizes is handled by the panels' own defaultSize/flex —
  // since the convenience re-renders from the unchanged ResizablePanel children on
  // restore, sizes return to their declared values. The post-drag-live-size stash
  // fidelity is a web-component-only concern; the Solid story uses declarative sizes.
  const renderPanels = () => {
    const all = panels();
    const m = maxIdx();
    if (m == null) return all.filter((p) => !p.hidden);
    const target = all[m];
    return target && !target.hidden ? [target] : all.filter((p) => !p.hidden);
  };

  // Notify on change of the maximized index (defer the initial null run).
  let prevMax: number | null | undefined;
  createEffect(() => {
    const m = maxIdx();
    if (prevMax === undefined) { prevMax = m; return; }
    if (m !== prevMax) { prevMax = m; local.onMaximizeChange?.(m); }
  });

  function emitChange() {
    if (!local.onChange) return;
    const sizes = visible().map((p) => {
      const r = (p.el as HTMLElement).getBoundingClientRect();
      const parent = (p.el as HTMLElement).parentElement;
      const total = parent ? parent.getBoundingClientRect()[orientation() === 'horizontal' ? 'width' : 'height'] : 0;
      const dimVal = r[orientation() === 'horizontal' ? 'width' : 'height'];
      return total > 0 ? Math.round((dimVal / total) * 100) : 0;
    });
    local.onChange(sizes);
  }

  return (
    <ResizableContext.Provider value={{ orientation: orientation() }}>
      <div
        class={cn(
          'flex h-full w-full',
          orientation() === 'vertical' ? 'flex-col' : 'flex-row',
          local.class,
        )}
        data-orientation={orientation()}
      >
        <For each={renderPanels()}>
          {(panel, i) => (
            <>
              <Show when={i() > 0}>
                <ResizableHandle
                  handle={local.handle ?? 'line'}
                  static={panel.locked || renderPanels()[i() - 1]?.locked}
                  onPanelResize={() => emitChange()}
                />
              </Show>
              {panel.el as unknown as JSX.Element}
            </>
          )}
        </For>
      </div>
    </ResizableContext.Provider>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle, Resizable };
