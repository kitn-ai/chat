import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Toast, ToastRegion, type ToastPosition } from './toast';
import type { ToastItem } from '../primitives/toast-store';

afterEach(cleanup);

const base = (over: Partial<ToastItem> = {}): ToastItem => ({
  id: 't1', message: 'Hello', ...over,
});

describe('Toast — rendering', () => {
  it('renders a neutral toast message with no check icon', () => {
    const { getByText, container } = render(() => (
      <Toast item={base({ duration: 0 })} onDismiss={() => {}} />
    ));
    expect(getByText('Hello')).toBeInTheDocument();
    // lucide Check renders an <svg>; the emerald class is the success tell.
    expect(container.querySelector('.text-emerald-500')).toBeNull();
  });

  it('renders a success toast with the emerald check icon', () => {
    const { container } = render(() => (
      <Toast item={base({ variant: 'success', duration: 0 })} onDismiss={() => {}} />
    ));
    expect(container.querySelector('.text-emerald-500')).not.toBeNull();
  });

  it('has role=status for assistive tech', () => {
    const { getByRole } = render(() => (
      <Toast item={base({ duration: 0 })} onDismiss={() => {}} />
    ));
    expect(getByRole('status')).toBeInTheDocument();
  });

  it('renders the × close button when dismissible (default)', () => {
    const { getByLabelText } = render(() => (
      <Toast item={base({ duration: 0 })} onDismiss={() => {}} />
    ));
    expect(getByLabelText('Dismiss')).toBeInTheDocument();
  });

  it('hides the × close button when dismissible is false', () => {
    const { queryByLabelText } = render(() => (
      <Toast item={base({ duration: 0, dismissible: false })} onDismiss={() => {}} />
    ));
    expect(queryByLabelText('Dismiss')).toBeNull();
  });
});

describe('Toast — appearance + inverse', () => {
  const statusEl = (c: HTMLElement) => c.querySelector('[role="status"]') as HTMLElement;

  it('defaults to the pill appearance and ignores description', () => {
    const { container, queryByText } = render(() => (
      <Toast item={base({ duration: 0, description: 'should be hidden' })} onDismiss={() => {}} />
    ));
    expect(statusEl(container).dataset.appearance).toBe('pill');
    // the pill is single-line: the message stays, the description never renders
    expect(queryByText('should be hidden')).toBeNull();
  });

  it('renders the card appearance with a title + description line', () => {
    const { container, getByText } = render(() => (
      <Toast
        item={base({ duration: 0, appearance: 'card', message: 'Deployed', description: 'Live in 30s' })}
        onDismiss={() => {}}
      />
    ));
    const el = statusEl(container);
    expect(el.dataset.appearance).toBe('card');
    expect(el).toHaveClass('rounded-xl');
    expect(getByText('Deployed')).toBeInTheDocument();
    expect(getByText('Live in 30s')).toBeInTheDocument();
  });

  it('inverse swaps to the high-contrast surface (bg-foreground / text-background)', () => {
    const { container } = render(() => (
      <Toast item={base({ duration: 0, inverse: true })} onDismiss={() => {}} />
    ));
    const el = statusEl(container);
    expect(el.dataset.inverse).toBe('');
    expect(el).toHaveClass('bg-foreground', 'text-background');
    expect(el).not.toHaveClass('bg-popover');
  });

  it('a per-toast appearance wins over the region-level default', () => {
    // region default pill, item asks for card → card
    const { container } = render(() => (
      <Toast item={base({ duration: 0, appearance: 'card' })} appearance="pill" onDismiss={() => {}} />
    ));
    expect(statusEl(container).dataset.appearance).toBe('card');
  });

  it('falls back to the region-level appearance / inverse when the item omits them', () => {
    const { container } = render(() => (
      <Toast item={base({ duration: 0 })} appearance="card" inverse onDismiss={() => {}} />
    ));
    const el = statusEl(container);
    expect(el.dataset.appearance).toBe('card');
    expect(el.dataset.inverse).toBe('');
  });
});

describe('Toast — auto-dismiss', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('auto-dismisses after the duration with reason "timeout"', async () => {
    const onDismiss = vi.fn();
    render(() => <Toast item={base({ duration: 2000 })} onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    // presence then unmounts on a microtask (no real animation in jsdom)
    await vi.waitFor(() => expect(onDismiss).toHaveBeenCalledWith('timeout'));
  });

  it('does NOT auto-dismiss when duration is 0 (sticky)', () => {
    const onDismiss = vi.fn();
    render(() => <Toast item={base({ duration: 0 })} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(60_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('pauses the timer while hovered and resumes on leave', async () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(() => (
      <Toast item={base({ duration: 2000 })} onDismiss={onDismiss} />
    ));
    const pill = getByRole('status');
    vi.advanceTimersByTime(1000);
    fireEvent.pointerEnter(pill);          // pause with ~1000ms left
    vi.advanceTimersByTime(5000);          // time passes, paused → no dismiss
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(pill);          // resume
    vi.advanceTimersByTime(999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);             // remaining ~1000ms elapses
    await vi.waitFor(() => expect(onDismiss).toHaveBeenCalledWith('timeout'));
  });

  it('holds the timer while `paused` (the whole stack is hovered) and resumes when unpaused', async () => {
    const onDismiss = vi.fn();
    const [paused, setPaused] = createSignal(true);
    render(() => <Toast item={base({ duration: 2000 })} paused={paused()} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(5000);          // paused from mount → never starts
    expect(onDismiss).not.toHaveBeenCalled();
    setPaused(false);                      // stack un-hovered → resume from full remaining
    vi.advanceTimersByTime(1999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(onDismiss).toHaveBeenCalledWith('timeout'));
  });
});

describe('Toast — close + action', () => {
  it('× → onDismiss("close")', async () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(() => (
      <Toast item={base({ duration: 0 })} onDismiss={onDismiss} />
    ));
    fireEvent.click(getByLabelText('Dismiss'));
    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('close'));
  });

  it('action button → onAction + onDismiss("action") and runs the handler', async () => {
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    const handler = vi.fn(() => undefined);
    const { getByText } = render(() => (
      <Toast
        item={base({ duration: 0, action: { label: 'Undo', onAction: handler } })}
        onDismiss={onDismiss}
        onAction={onAction}
      />
    ));
    fireEvent.click(getByText('Undo'));
    expect(handler).toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith('Undo');
    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('action'));
  });

  it('action handler returning false keeps the toast open', async () => {
    const onDismiss = vi.fn();
    const handler = vi.fn(() => false as const);
    const { getByText } = render(() => (
      <Toast
        item={base({ duration: 0, action: { label: 'Keep', onAction: handler } })}
        onDismiss={onDismiss}
      />
    ));
    fireEvent.click(getByText('Keep'));
    expect(handler).toHaveBeenCalled();
    // give the microtask queue a chance — it must NOT dismiss
    await Promise.resolve();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(getByText('Keep')).toBeInTheDocument();
  });
});

describe('ToastRegion — stacking + queue + a11y', () => {
  it('exposes role=region with aria-live=polite', () => {
    const { getByRole } = render(() => <ToastRegion toasts={[]} />);
    const region = getByRole('region');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('renders at most `max` toasts and queues the overflow', () => {
    const toasts: ToastItem[] = [
      base({ id: 'a', message: 'A', duration: 0 }),
      base({ id: 'b', message: 'B', duration: 0 }),
      base({ id: 'c', message: 'C', duration: 0 }),
      base({ id: 'd', message: 'D', duration: 0 }),
    ];
    const { queryByText } = render(() => <ToastRegion toasts={toasts} max={2} />);
    // newest-on-top → D and C visible, A and B queued (not rendered)
    expect(queryByText('D')).toBeInTheDocument();
    expect(queryByText('C')).toBeInTheDocument();
    expect(queryByText('B')).toBeNull();
    expect(queryByText('A')).toBeNull();
  });

  it('promotes a queued toast when a visible one is removed', async () => {
    const [items, setItems] = createSignal<ToastItem[]>([
      base({ id: 'a', message: 'A', duration: 0 }),
      base({ id: 'b', message: 'B', duration: 0 }),
      base({ id: 'c', message: 'C', duration: 0 }),
    ]);
    const { queryByText } = render(() => (
      <ToastRegion toasts={items()} max={2} onDismiss={(id) => setItems((l) => l.filter((t) => t.id !== id))} />
    ));
    // visible: C, B ; queued: A
    expect(queryByText('A')).toBeNull();
    // remove C → A promotes
    setItems((l) => l.filter((t) => t.id !== 'c'));
    await waitFor(() => expect(queryByText('A')).toBeInTheDocument());
  });

  it('wires onDismiss through with the toast id', async () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(() => (
      <ToastRegion toasts={[base({ id: 'x', message: 'X', duration: 0 })]} onDismiss={onDismiss} />
    ));
    fireEvent.click(getByLabelText('Dismiss'));
    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('x', 'close'));
  });

  it('applies the region-level appearance / inverse defaults to its toasts', () => {
    const { container } = render(() => (
      <ToastRegion toasts={[base({ id: 'x', message: 'X', duration: 0 })]} appearance="card" inverse />
    ));
    const el = container.querySelector('[role="status"]') as HTMLElement;
    expect(el.dataset.appearance).toBe('card');
    expect(el.dataset.inverse).toBe('');
  });
});

describe('ToastRegion — target anchoring honors position', () => {
  // The anchor branch wires a ResizeObserver; jsdom lacks one, so stub a no-op.
  let RealRO: typeof ResizeObserver | undefined;
  beforeEach(() => {
    RealRO = (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  afterEach(() => {
    (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = RealRO;
  });

  // A fixed target rect: top 100, left 200, right 600, bottom 400, width 400.
  const RECT = { top: 100, left: 200, right: 600, bottom: 400, width: 400, height: 300, x: 200, y: 100, toJSON() {} } as DOMRect;

  function renderAnchored(position?: ToastPosition) {
    const target = document.createElement('div');
    target.getBoundingClientRect = () => RECT;
    document.body.appendChild(target);
    const { getByRole } = render(() => (
      <ToastRegion toasts={[base({ id: 'x', message: 'X', duration: 0, target })]} target={target} position={position} />
    ));
    return getByRole('region') as HTMLElement;
  }

  it('anchors top-right to the target’s right edge, growing inward', async () => {
    const region = renderAnchored('top-right');
    await waitFor(() => expect(region.style.top).toBe('112px')); // top + 12
    expect(region.style.left).toBe('588px'); // right - 12
    expect(region.style.transform).toBe('translateX(-100%)');
    expect(region.style.maxWidth).toBe('376px'); // width - 24
  });

  it('anchors bottom-center to the target’s bottom edge', async () => {
    const region = renderAnchored('bottom-center');
    await waitFor(() => expect(region.style.top).toBe('388px')); // bottom - 12
    expect(region.style.left).toBe('400px'); // center x
    expect(region.style.transform).toBe('translate(-50%, -100%)');
  });

  it('defaults to top-center over the target when no position is set', async () => {
    const region = renderAnchored();
    await waitFor(() => expect(region.style.top).toBe('112px'));
    expect(region.style.left).toBe('400px'); // center x
    expect(region.style.transform).toBe('translateX(-50%)');
  });
});

describe('ToastRegion — the --kai-toast-z layer token (F-20)', () => {
  // jsdom resolves no var(), so the assertion is structural: the region's
  // z-index DECLARATION must be the token with the current default (100) as its
  // fallback. Setting --kai-toast-z on the host then changes the effective
  // z-index in a real browser; unset falls back to 100. Red against the old
  // hardcoded `z-[100]` class: the inline declaration was empty.
  const TOKEN = 'var(--kai-toast-z, 100)';

  it('expanded region carries z-index: var(--kai-toast-z, 100)', () => {
    const { getByRole } = render(() => <ToastRegion toasts={[base({ duration: 0 })]} />);
    expect(getByRole('region').style.zIndex).toBe(TOKEN);
  });

  it('collapsed region carries the same token', () => {
    const { getByRole } = render(() => (
      <ToastRegion toasts={[base({ duration: 0 })]} stack="collapsed" />
    ));
    expect(getByRole('region').style.zIndex).toBe(TOKEN);
  });

  it('an anchored region keeps the token alongside its position styles', async () => {
    // The anchor branch wires a ResizeObserver; stub it like the anchoring suite.
    const RealRO = (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    const target = document.createElement('div');
    target.getBoundingClientRect = () =>
      ({ top: 100, left: 200, right: 600, bottom: 400, width: 400, height: 300, x: 200, y: 100, toJSON() {} }) as DOMRect;
    document.body.appendChild(target);
    try {
      const { getByRole } = render(() => (
        <ToastRegion toasts={[base({ duration: 0, target })]} target={target} />
      ));
      const region = getByRole('region');
      expect(region.style.zIndex).toBe(TOKEN);
      // the anchor positioning still landed (the merge did not clobber it)
      await waitFor(() => expect(region.style.top).not.toBe(''));
    } finally {
      target.remove();
      (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = RealRO;
    }
  });
});

describe('ToastRegion — collapsed stacking', () => {
  const items = (n: number) =>
    Array.from({ length: n }, (_, i) => base({ id: `s${i}`, message: `S${i}`, duration: 0 }));

  it('default (no stack prop) renders the expanded column — unchanged', () => {
    const { getByRole } = render(() => <ToastRegion toasts={items(3)} />);
    const region = getByRole('region');
    expect(region.dataset.stack).toBe('expanded');
    // expanded column = the existing flex layout, no per-pill depth wrappers
    expect(region.querySelector('[data-depth]')).toBeNull();
  });

  it('collapsed: front pill (newest) has the highest z-index and zero depth', () => {
    const { getByRole } = render(() => <ToastRegion toasts={items(3)} stack="collapsed" />);
    const region = getByRole('region');
    expect(region.dataset.stack).toBe('collapsed');
    const depths = [...region.querySelectorAll('[data-depth]')] as HTMLElement[];
    expect(depths.length).toBe(3);
    // newest-first: depth 0 is the front
    expect(depths[0].dataset.depth).toBe('0');
    const z = (el: HTMLElement) => Number(el.style.zIndex);
    expect(z(depths[0])).toBeGreaterThan(z(depths[1]));
    expect(z(depths[1])).toBeGreaterThan(z(depths[2]));
    // resting front pill is not translated/scaled
    expect(depths[0].style.transform).toMatch(/translateY\(0px\)|scale\(1\)/);
  });

  it('collapsed: deeper pills are offset + scaled down while resting', () => {
    const { getByRole } = render(() => <ToastRegion toasts={items(3)} stack="collapsed" />);
    const d2 = getByRole('region').querySelectorAll('[data-depth]')[2] as HTMLElement;
    expect(d2.style.transform).toMatch(/scale\(0\.9\)/); // 1 - 0.05*2
    expect(d2.style.transform).toMatch(/translateY\(/);
  });

  it('expands on pointerenter and collapses on pointerleave', async () => {
    const { getByRole } = render(() => <ToastRegion toasts={items(3)} stack="collapsed" />);
    const region = getByRole('region');
    expect(region.dataset.expanded).toBeUndefined();
    fireEvent.pointerEnter(region);
    await waitFor(() => expect(region.dataset.expanded).toBe(''));
    fireEvent.pointerLeave(region);
    await waitFor(() => expect(region.dataset.expanded).toBeUndefined());
  });

  it('expands on focusin (keyboard) too', async () => {
    const { getByRole } = render(() => <ToastRegion toasts={items(3)} stack="collapsed" />);
    const region = getByRole('region');
    fireEvent.focusIn(region);
    await waitFor(() => expect(region.dataset.expanded).toBe(''));
  });

  it('prefers-reduced-motion → renders the expanded column even when stack=collapsed', () => {
    // jsdom has no window.matchMedia, so stub it (rather than spyOn, which needs
    // the property to pre-exist) returning matches=true for the reduced-motion query.
    const prev = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduced-motion'), media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    const { getByRole } = render(() => <ToastRegion toasts={items(3)} stack="collapsed" />);
    expect(getByRole('region').querySelector('[data-depth]')).toBeNull();
    window.matchMedia = prev;
  });
});
