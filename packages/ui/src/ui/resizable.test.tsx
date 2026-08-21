import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { ResizableHandle } from './resizable';

afterEach(cleanup);

const grip = (c: HTMLElement) => c.querySelector('svg');
const line = (c: HTMLElement) => c.querySelector('[data-handle-line]');

describe('ResizableHandle (handle affordance)', () => {
  it('renders the dotted grip svg for handle="grip" (and no hairline)', () => {
    const { container } = render(() => <ResizableHandle handle="grip" />);
    expect(grip(container)).toBeInTheDocument();
    expect(grip(container)!.querySelectorAll('circle').length).toBe(6);
    expect(line(container)).toBeNull();
  });

  it('renders the hairline strip for handle="line" (and no grip svg)', () => {
    const { container } = render(() => <ResizableHandle handle="line" />);
    expect(line(container)).toBeInTheDocument();
    expect(grip(container)).toBeNull();
  });

  it('defaults to the hairline strip when handle is omitted', () => {
    const { container } = render(() => <ResizableHandle />);
    expect(line(container)).toBeInTheDocument();
    expect(grip(container)).toBeNull();
  });

  it('renders neither for handle="none"', () => {
    const { container } = render(() => <ResizableHandle handle="none" />);
    expect(line(container)).toBeNull();
    expect(grip(container)).toBeNull();
  });
});

describe('ResizableHandle (never-shrink contract)', () => {
  // Regression pin for the maximize/restore defect: after a round trip, the two
  // neighboring `ResizablePanel`s can carry explicit percentage `flex-basis`
  // values that sum to 100% of the container's main axis, leaving nothing for
  // the handle's own 8px. Flexbox's default `flex-shrink: 1` on the handle then
  // squeezes it to a computed width of 0 — invisible and undraggable until
  // reload. jsdom cannot compute flex layout (no real box model), so this pins
  // the STYLE CONTRACT instead: the handle's own inline style must declare
  // `flex-shrink: 0`, matching the `flex-shrink: 0` its neighbors get from
  // `ResizablePanel`/`applyDelta`/`resetPanelToDefault`, so flexbox has nowhere
  // to reclaim the handle's space from regardless of what the neighbors sum to.
  it('declares flex-shrink: 0 so siblings summing to 100% cannot collapse it', () => {
    const { container } = render(() => <ResizableHandle />);
    const handle = container.querySelector('[role="separator"]') as HTMLElement;
    expect(handle).toBeInTheDocument();
    expect(handle.style.flexShrink).toBe('0');
  });

  it('keeps flex-shrink: 0 for the "grip" and "none" affordances too', () => {
    for (const mode of ['grip', 'none'] as const) {
      const { container } = render(() => <ResizableHandle handle={mode} />);
      const handle = container.querySelector('[role="separator"]') as HTMLElement;
      expect(handle.style.flexShrink).toBe('0');
    }
  });
});
