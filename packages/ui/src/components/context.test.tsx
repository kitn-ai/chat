import { flush } from 'solid-js';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent, screen } from '@solidjs/testing-library';
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextContentFooter,
  computeSeverity,
  DEFAULT_WARN_THRESHOLD,
  DEFAULT_DANGER_THRESHOLD,
} from './context';

// jsdom does not implement PointerEvent — shim it so fireEvent.pointerEnter works.
if (typeof (globalThis as unknown as Record<string, unknown>).PointerEvent === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, params?: PointerEventInit) { super(type, params); }
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

// ---------------------------------------------------------------------------
// computeSeverity — pure function unit tests
// ---------------------------------------------------------------------------

describe('computeSeverity', () => {
  it('returns ok below the warn threshold (defaults)', () => {
    expect(computeSeverity(0)).toBe('ok');
    expect(computeSeverity(0.5)).toBe('ok');
    expect(computeSeverity(DEFAULT_WARN_THRESHOLD)).toBe('ok'); // exactly at threshold → still ok
  });

  it('returns warn when usage exceeds the warn threshold but not the danger threshold', () => {
    expect(computeSeverity(0.71)).toBe('warn');
    expect(computeSeverity(DEFAULT_WARN_THRESHOLD + 0.001)).toBe('warn');
    expect(computeSeverity(DEFAULT_DANGER_THRESHOLD)).toBe('warn'); // exactly at danger threshold → still warn
  });

  it('returns danger when usage exceeds the danger threshold', () => {
    expect(computeSeverity(0.91)).toBe('danger');
    expect(computeSeverity(1.0)).toBe('danger');
  });

  it('respects custom warnThreshold', () => {
    expect(computeSeverity(0.49, 0.5, 0.9)).toBe('ok');
    expect(computeSeverity(0.51, 0.5, 0.9)).toBe('warn');
    expect(computeSeverity(0.91, 0.5, 0.9)).toBe('danger');
  });

  it('respects custom dangerThreshold', () => {
    expect(computeSeverity(0.49, 0.5, 0.75)).toBe('ok');
    expect(computeSeverity(0.6, 0.5, 0.75)).toBe('warn');
    expect(computeSeverity(0.76, 0.5, 0.75)).toBe('danger');
  });
});

// ---------------------------------------------------------------------------
// Context component — color class flips at configured thresholds
//
// HoverCardRoot uses openDelay={0} inside Context, so after a pointerEnter
// the card opens immediately; we advance fake timers by 0 to flush it.
// ---------------------------------------------------------------------------

function FullMeter(props: {
  usedTokens: number;
  maxTokens: number;
  warnThreshold?: number;
  dangerThreshold?: number;
}) {
  return (
    <Context {...props}>
      <ContextTrigger />
      <ContextContent>
        <ContextContentHeader />
        <ContextContentBody />
        <ContextContentFooter />
      </ContextContent>
    </Context>
  );
}

/** Open the hover card so ContextContentHeader is in the DOM. */
function openCard() {
  // ContextTrigger renders HoverCardTrigger; the host wrapper is the parent of the button.
  const btn = screen.getByRole('button');
  fireEvent.pointerEnter(btn.parentElement!);
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  vi.advanceTimersByTime(0); // openDelay=0 → card opens immediately
  flush(); // V2-FLUSH: the timer handler's open write is staged too
}

/**
 * The meter's fill, read off the shared ProgressBar primitive.
 *
 * The bar used to be two hand-rolled divs coloured `bg-primary` / `bg-yellow-400`
 * / `bg-red-400`. It now routes through `ui/progress-bar`, which supplies
 * `role="progressbar"` + aria values and colours its fill from a semantic `tone`
 * — so the hues are the kit's tool palette (`bg-tool-amber` / `bg-tool-red`),
 * matching kai-status and kai-notice. Scoped to `[part="fill"]` inside the
 * progressbar rather than a document-wide class query, so these cannot pass off
 * some unrelated element that happens to carry the class.
 */
const fillClass = () =>
  document.querySelector('[role="progressbar"] [part="fill"]')?.className ?? '';

describe('Context color thresholds', () => {
  it('renders a primary fill below default warn threshold (< 70%)', () => {
    render(() => <FullMeter usedTokens={69000} maxTokens={100000} />);
    openCard();
    expect(fillClass()).toContain('bg-primary');
  });

  it('renders a warning fill between default warn (70%) and danger (90%) thresholds', () => {
    render(() => <FullMeter usedTokens={80000} maxTokens={100000} />);
    openCard();
    expect(fillClass()).toContain('bg-tool-amber');
  });

  it('renders an error fill above default danger threshold (> 90%)', () => {
    render(() => <FullMeter usedTokens={91000} maxTokens={100000} />);
    openCard();
    expect(fillClass()).toContain('bg-tool-red');
  });

  it('flips to warn colour at a custom warnThreshold of 0.5', () => {
    render(() => <FullMeter usedTokens={51000} maxTokens={100000} warnThreshold={0.5} dangerThreshold={0.9} />);
    openCard();
    expect(fillClass()).toContain('bg-tool-amber');
  });

  it('flips to danger colour at custom thresholds (warn 0.5, danger 0.75)', () => {
    render(() => <FullMeter usedTokens={76000} maxTokens={100000} warnThreshold={0.5} dangerThreshold={0.75} />);
    openCard();
    expect(fillClass()).toContain('bg-tool-red');
  });

  it('stays green at 50% when custom warnThreshold is 0.6', () => {
    render(() => <FullMeter usedTokens={50000} maxTokens={100000} warnThreshold={0.6} />);
    openCard();
    expect(fillClass()).toContain('bg-primary');
  });

  it('exposes the token counts as progressbar aria values', () => {
    render(() => <FullMeter usedTokens={69000} maxTokens={100000} />);
    openCard();
    const bar = document.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('69000');
    expect(bar.getAttribute('aria-valuemax')).toBe('100000');
  });
});
