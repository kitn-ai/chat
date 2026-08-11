import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { Reasoning, ReasoningTrigger, ReasoningContent } from './reasoning';

// jsdom has no ResizeObserver; ReasoningContent wires one when it mounts (same
// stub as message.test.tsx / thread.test.tsx).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

afterEach(cleanup);

const trigger = (c: HTMLElement) => c.querySelector('button') as HTMLButtonElement;
/** The panel the trigger says it controls — resolved THROUGH aria-controls, so a
 *  broken/absent wire cannot be papered over by grabbing the node some other way. */
const panel = (c: HTMLElement) => {
  const id = trigger(c).getAttribute('aria-controls');
  return id ? (c.querySelector(`[id="${CSS.escape(id)}"]`) as HTMLElement | null) : null;
};

function renderReasoning(props: { open?: boolean; disabled?: boolean } = {}) {
  return render(() => (
    <Reasoning open={props.open} disabled={props.disabled}>
      <ReasoningTrigger>Thinking</ReasoningTrigger>
      <ReasoningContent>Weighing the options.</ReasoningContent>
    </Reasoning>
  ));
}

describe('Reasoning disclosure aria wiring', () => {
  it('renders an explicit type="button" trigger', () => {
    const { container } = renderReasoning();
    expect(trigger(container)).toHaveAttribute('type', 'button');
  });

  it('points aria-controls at the content panel it actually toggles', () => {
    const { container } = renderReasoning();
    const id = trigger(container).getAttribute('aria-controls');
    expect(id).toBeTruthy();

    const target = panel(container);
    expect(target).not.toBeNull();
    // …and it is the CONTENT, not some other node that happens to carry the id.
    expect(target!.textContent).toContain('Weighing the options.');
  });

  it('reports the collapsed state through aria-expanded and the data-* handles', () => {
    const { container } = renderReasoning();
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    expect(trigger(container)).toHaveAttribute('data-state', 'closed');
    expect(trigger(container)).toHaveAttribute('data-closed', '');
    expect(trigger(container)).not.toHaveAttribute('data-expanded');
    expect(panel(container)).toHaveAttribute('data-state', 'closed');
  });

  it('flips every state handle when the trigger is clicked open', () => {
    const { container } = renderReasoning();
    fireEvent.click(trigger(container));

    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(trigger(container)).toHaveAttribute('data-state', 'open');
    expect(trigger(container)).toHaveAttribute('data-expanded', '');
    expect(trigger(container)).not.toHaveAttribute('data-closed');
    expect(panel(container)).toHaveAttribute('data-state', 'open');
  });

  it('flips back on a second click', () => {
    const { container } = renderReasoning();
    fireEvent.click(trigger(container));
    fireEvent.click(trigger(container));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    expect(panel(container)).toHaveAttribute('data-state', 'closed');
  });

  it('tracks a CONTROLLED open prop without a click', () => {
    const [open, setOpen] = createSignal(false);
    const { container } = render(() => (
      <Reasoning open={open()}>
        <ReasoningTrigger>Thinking</ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');

    setOpen(true);
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(panel(container)).toHaveAttribute('data-state', 'open');
  });

  it('gives two sibling disclosures DISTINCT content ids', () => {
    // A message renders several reasoning blocks; a shared id would make
    // aria-controls point at the wrong panel for every one after the first.
    const { container } = render(() => (
      <div>
        <Reasoning>
          <ReasoningTrigger>First</ReasoningTrigger>
          <ReasoningContent>One.</ReasoningContent>
        </Reasoning>
        <Reasoning>
          <ReasoningTrigger>Second</ReasoningTrigger>
          <ReasoningContent>Two.</ReasoningContent>
        </Reasoning>
      </div>
    ));
    const ids = [...container.querySelectorAll('button')].map((b) => b.getAttribute('aria-controls'));
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('still lets a consumer override a generated attribute (rest spreads LAST)', () => {
    const { container } = render(() => (
      <Reasoning>
        <ReasoningTrigger aria-label="Show the chain of thought" data-state="custom">
          Thinking
        </ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(trigger(container)).toHaveAttribute('aria-label', 'Show the chain of thought');
    expect(trigger(container)).toHaveAttribute('data-state', 'custom');
    // …while the attributes the consumer did NOT override are still generated.
    // Without this the assertions above would pass just as happily with the
    // whole aria wiring deleted.
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
    expect(trigger(container)).toHaveAttribute('aria-controls');
  });

  it('keeps the disabled trigger from changing aria-expanded', () => {
    const { container } = renderReasoning({ disabled: true });
    expect(trigger(container)).toBeDisabled();
    fireEvent.click(trigger(container));
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
  });
});
