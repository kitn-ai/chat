import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen } from '@solidjs/testing-library';
import {
  BuildWait,
  BUILD_WAIT_STEPS,
  BLUEPRINTS,
  drawLength,
  drawDelays,
  drawDuration,
  stepStatuses,
} from './build-wait';

afterEach(cleanup);

const TEMPLATE_IDS = Object.keys(BLUEPRINTS) as (keyof typeof BLUEPRINTS)[];

/** Every shape node the component drew, in document order. */
const shapes = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-bw-shape]'));

const step = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-step="${id}"]`)!;

describe('BuildWait — steps', () => {
  it('renders the real boot phases by default, first one active', () => {
    render(() => <BuildWait templateId="assistant" />);
    for (const s of BUILD_WAIT_STEPS) expect(screen.getByText(s.label)).toBeInTheDocument();
    expect(step('install')).toHaveAttribute('data-status', 'active');
    expect(step('generate')).toHaveAttribute('data-status', 'pending');
    expect(step('preview')).toHaveAttribute('data-status', 'pending');
  });

  it('advancing `current` moves the indicator and marks the ones behind it done', () => {
    // A signal-free advance: re-render at each phase. The derivation is what is
    // under test, and it is a pure function of (steps, current, error) — the
    // same function the component calls, asserted through the rendered DOM
    // rather than only in isolation below.
    render(() => <BuildWait templateId="widget" current="generate" />);
    expect(step('install')).toHaveAttribute('data-status', 'done');
    expect(step('generate')).toHaveAttribute('data-status', 'active');
    expect(step('preview')).toHaveAttribute('data-status', 'pending');
    cleanup();

    render(() => <BuildWait templateId="widget" current="preview" />);
    expect(step('install')).toHaveAttribute('data-status', 'done');
    expect(step('generate')).toHaveAttribute('data-status', 'done');
    expect(step('preview')).toHaveAttribute('data-status', 'active');
  });

  it('the active step is the one marked aria-current, and it is the only one', () => {
    render(() => <BuildWait templateId="research" current="generate" />);
    const marked = document.querySelectorAll('[aria-current="step"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveAttribute('data-step', 'generate');
  });

  it('an unknown `current` falls back to the first step rather than marking none', () => {
    render(() => <BuildWait templateId="voice" current="not-a-phase" />);
    expect(step('install')).toHaveAttribute('data-status', 'active');
  });

  it('a caller can supply its own phases', () => {
    render(() => (
      <BuildWait
        templateId="workspace"
        steps={[
          { id: 'a', label: 'Checking the plan' },
          { id: 'b', label: 'Pouring the slab' },
        ]}
        current="b"
      />
    ));
    expect(screen.getByText('Checking the plan')).toBeInTheDocument();
    expect(step('a')).toHaveAttribute('data-status', 'done');
    expect(step('b')).toHaveAttribute('data-status', 'active');
  });

  it('the step list sits inside one polite live region, and the list stays a list', () => {
    render(() => <BuildWait templateId="assistant" />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region.querySelector('ol')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-build-wait-steps] li')).toHaveLength(BUILD_WAIT_STEPS.length);
  });
});

describe('BuildWait — error', () => {
  it('surfaces the failure as an alert and marks the current phase failed', () => {
    render(() => <BuildWait templateId="assistant" current="generate" error="npm install exited with 1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('npm install exited with 1');
    expect(step('install')).toHaveAttribute('data-status', 'done');
    expect(step('generate')).toHaveAttribute('data-status', 'failed');
    expect(step('preview')).toHaveAttribute('data-status', 'pending');
    // No step is still claimed to be in flight once the boot has stopped.
    expect(document.querySelectorAll('[data-status="active"]')).toHaveLength(0);
  });

  it('a failure stops the drawing instead of animating forever', () => {
    render(() => <BuildWait templateId="widget" error="preview server never came up" />);
    for (const node of shapes()) expect(node.style.animation).toBe('none');
  });

  it('with no error, nothing claims the alert role', () => {
    render(() => <BuildWait templateId="widget" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('BuildWait — reduced motion', () => {
  it('renders the finished blueprint with no animation, and the steps still report', () => {
    render(() => <BuildWait templateId="workspace" current="preview" reduceMotion />);
    const drawn = shapes();
    expect(drawn.length).toBe(BLUEPRINTS.workspace.length);
    for (const node of drawn) {
      expect(node.style.animation).toBe('none');
      // Finished, not hidden: nothing is left holding a dash offset or a
      // zeroed opacity that would keep the shape off the drawing. The base
      // dash offset is zero, which IS the completed outline.
      expect(node.style.strokeDashoffset === '' || node.style.strokeDashoffset === '0').toBe(true);
      expect(node.style.opacity === '' || node.style.opacity === '1').toBe(true);
    }
    expect(step('preview')).toHaveAttribute('data-status', 'active');
  });

  it('the active step dot stops pulsing too', () => {
    render(() => <BuildWait templateId="workspace" reduceMotion />);
    const dot = document.querySelector<HTMLElement>('[data-bw-pulse]')!;
    expect(dot.style.animation).toBe('none');
  });

  it('without the override, shapes carry a real animation', () => {
    render(() => <BuildWait templateId="workspace" />);
    // jsdom reports no reduced-motion preference, so this is the moving path.
    expect(shapes()[0]!.style.animation).toContain('kai-bw-draw');
  });

  it('ships a reduced-motion media rule so the preference is honored without the prop', () => {
    render(() => <BuildWait templateId="widget" />);
    const sheet = document.querySelector('[data-build-wait] style')!.textContent!;
    expect(sheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(sheet).toContain('animation: none !important');
  });
});

describe('BuildWait — blueprints', () => {
  it('every template has a blueprint, and every one draws something', () => {
    for (const id of TEMPLATE_IDS) {
      expect(BLUEPRINTS[id].length).toBeGreaterThan(0);
      cleanup();
      render(() => <BuildWait templateId={id} />);
      expect(shapes()).toHaveLength(BLUEPRINTS[id].length);
    }
  });

  it('every blueprint has exactly one breathing hero, and it is an accented one', () => {
    for (const id of TEMPLATE_IDS) {
      const heroes = BLUEPRINTS[id].filter((s) => s.hero);
      expect(heroes).toHaveLength(1);
      expect(heroes[0]!.ink.stroke).toBe('var(--color-primary)');
    }
  });

  it('the hero picks up the heartbeat after its own draw has landed', () => {
    render(() => <BuildWait templateId="assistant" />);
    const heroIndex = BLUEPRINTS.assistant.findIndex((s) => s.hero);
    const hero = shapes()[heroIndex]!;
    expect(hero.style.animation).toContain('kai-bw-draw');
    expect(hero.style.animation).toContain('kai-bw-breathe');
    expect(hero.style.animation).toContain('infinite');
    // Exactly one shape breathes: a chorus is not a heartbeat.
    expect(shapes().filter((n) => n.style.animation.includes('kai-bw-breathe'))).toHaveLength(1);
  });

  it('the whole draw settles in a few seconds, not minutes — the wait is carried by the steps', () => {
    for (const id of TEMPLATE_IDS) {
      const ms = drawDuration(BLUEPRINTS[id]);
      expect(ms).toBeGreaterThan(1000);
      expect(ms).toBeLessThan(4000);
    }
  });

  it('build order runs frame, rail, surface, detail — no shape lands before an earlier group starts', () => {
    for (const id of TEMPLATE_IDS) {
      const blueprint = BLUEPRINTS[id];
      const delays = drawDelays(blueprint);
      const order = ['frame', 'rail', 'surface', 'detail'];
      const startOf = (g: string) =>
        Math.min(...blueprint.map((s, i) => (s.group === g ? delays[i]! : Infinity)));
      const starts = order.map(startOf).filter((n) => Number.isFinite(n));
      for (let i = 1; i < starts.length; i += 1) expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
    }
  });

  it('an unused group costs no dead air — Voice has no rail and still starts at zero', () => {
    const delays = drawDelays(BLUEPRINTS.voice);
    expect(BLUEPRINTS.voice.some((s) => s.group === 'rail')).toBe(false);
    expect(Math.min(...delays)).toBe(0);
    // The bars (the surface group) follow the anchor ring immediately, not a
    // group-gap later for a group that isn't there.
    const firstBar = BLUEPRINTS.voice.findIndex((s) => s.group === 'surface');
    expect(delays[firstBar]).toBeLessThanOrEqual(500);
  });
});

describe('drawLength', () => {
  it('measures a line as its own length', () => {
    expect(drawLength({ kind: 'line', group: 'rail', ink: { stroke: 'x', fill: 'none' }, x1: 0, y1: 0, x2: 3, y2: 4 })).toBe(5);
  });

  it('measures a circle as its circumference', () => {
    expect(
      drawLength({ kind: 'circle', group: 'detail', ink: { stroke: 'x', fill: 'none' }, cx: 0, cy: 0, r: 10 }),
    ).toBeCloseTo(2 * Math.PI * 10);
  });

  it('measures a rounded rect as its real rounded perimeter, not the square one', () => {
    const square = drawLength({ kind: 'rect', group: 'frame', ink: { stroke: 'x', fill: 'none' }, x: 0, y: 0, w: 40, h: 20, r: 0 });
    const rounded = drawLength({ kind: 'rect', group: 'frame', ink: { stroke: 'x', fill: 'none' }, x: 0, y: 0, w: 40, h: 20, r: 6 });
    expect(square).toBe(120);
    expect(rounded).toBeLessThan(square);
    // A radius the box cannot hold is clamped, not allowed to go negative.
    const clamped = drawLength({ kind: 'rect', group: 'frame', ink: { stroke: 'x', fill: 'none' }, x: 0, y: 0, w: 10, h: 10, r: 40 });
    expect(clamped).toBeCloseTo(2 * Math.PI * 5);
  });
});

describe('stepStatuses', () => {
  it('is the derivation the component renders — done before, active at, pending after', () => {
    expect(stepStatuses(BUILD_WAIT_STEPS, 'generate', false)).toEqual(['done', 'active', 'pending']);
  });

  it('turns the current step failed, and nothing else, when the boot failed', () => {
    expect(stepStatuses(BUILD_WAIT_STEPS, 'generate', true)).toEqual(['done', 'failed', 'pending']);
  });
});
