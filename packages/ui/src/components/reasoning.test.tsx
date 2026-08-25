import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal, flush } from 'solid-js';
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
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting

    expect(trigger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(trigger(container)).toHaveAttribute('data-state', 'open');
    expect(trigger(container)).toHaveAttribute('data-expanded', '');
    expect(trigger(container)).not.toHaveAttribute('data-closed');
    expect(panel(container)).toHaveAttribute('data-state', 'open');
  });

  it('flips back on a second click', () => {
    const { container } = renderReasoning();
    fireEvent.click(trigger(container));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    fireEvent.click(trigger(container));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
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
    flush(); // V2-FLUSH: commit the staged write
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
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(trigger(container)).toHaveAttribute('aria-expanded', 'false');
  });
});

/** A Reasoning whose panel holds a focusable child, plus a sibling control
 *  OUTSIDE the disclosure — so a test can tell "focus was handed back to the
 *  trigger" from "focus never moved" and from "focus was stolen". */
function renderFocusable() {
  const [open, setOpen] = createSignal(true);
  const result = render(() => (
    <div>
      <Reasoning open={open()}>
        <ReasoningTrigger>Thinking</ReasoningTrigger>
        <ReasoningContent>
          <button type="button" data-testid="inside">Copy</button>
        </ReasoningContent>
      </Reasoning>
      <button type="button" data-testid="outside">After</button>
    </div>
  ));
  return { ...result, setOpen };
}

describe('Reasoning collapsed content leaves the tab order', () => {
  // NOTE ON WHAT THESE PROVE: jsdom parses `inert` as an attribute but does NOT
  // enforce it — nothing inside an inert subtree actually becomes unfocusable
  // there. So these assert the ATTRIBUTE (the instruction to the engine) and the
  // focus hand-off we drive ourselves. The engine honouring it — focus() refused
  // inside a collapsed panel, Tab skipping it — is proved in a real browser by
  // the `KeyboardReachability` story's play function.
  it('marks the collapsed panel inert, so it is neither focusable nor announced', () => {
    const { container } = renderReasoning();
    expect(panel(container)).toHaveAttribute('inert');
  });

  it('drops inert when the panel opens', () => {
    const { container } = renderReasoning();
    fireEvent.click(trigger(container));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(panel(container)).not.toHaveAttribute('inert');
  });

  it('re-applies inert when the panel collapses again', () => {
    const { container } = renderReasoning();
    fireEvent.click(trigger(container));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    fireEvent.click(trigger(container));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(panel(container)).toHaveAttribute('inert');
  });

  it('follows a CONTROLLED open prop, not just the trigger', () => {
    const [open, setOpen] = createSignal(false);
    const { container } = render(() => (
      <Reasoning open={open()}>
        <ReasoningTrigger>Thinking</ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(panel(container)).toHaveAttribute('inert');
    setOpen(true);
    flush(); // V2-FLUSH: commit the staged write
    expect(panel(container)).not.toHaveAttribute('inert');
  });

  it('hands focus back to the trigger when a panel holding focus collapses', () => {
    // Without this, `inert` drops the focused node and the browser resets focus
    // to <body> — the user's tab position silently jumps to the top of the page.
    const { container, getByTestId, setOpen } = renderFocusable();
    const inside = getByTestId('inside');
    inside.focus();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(document.activeElement).toBe(inside);

    setOpen(false);
    flush(); // V2-FLUSH: commit the staged write
    expect(document.activeElement).toBe(trigger(container));
  });

  it('does NOT steal focus when the collapsing panel never held it', () => {
    const { getByTestId, setOpen } = renderFocusable();
    const outside = getByTestId('outside');
    outside.focus();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting

    setOpen(false);
    flush(); // V2-FLUSH: commit the staged write
    expect(document.activeElement).toBe(outside);
  });

  it('leaves focus alone when an already-collapsed panel re-renders', () => {
    const { getByTestId, setOpen } = renderFocusable();
    setOpen(false);
    flush(); // V2-FLUSH: commit the staged write
    const outside = getByTestId('outside');
    outside.focus();
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    setOpen(true);
    flush(); // V2-FLUSH: commit the staged write
    setOpen(false);
    flush(); // V2-FLUSH: commit the staged write
    expect(document.activeElement).toBe(outside);
  });

  it('still hands a consumer ref the trigger button', () => {
    // The trigger now takes its own ref to register itself as the focus target;
    // a consumer's ref must survive that.
    let seen: HTMLButtonElement | undefined;
    const { container } = render(() => (
      <Reasoning>
        <ReasoningTrigger ref={(el) => { seen = el; }}>Thinking</ReasoningTrigger>
        <ReasoningContent>Weighing the options.</ReasoningContent>
      </Reasoning>
    ));
    expect(seen).toBe(trigger(container));
  });

  it('still animates max-height 0 → measured → 0 across a toggle', () => {
    // The regression this change was deferred over: `inert` must not disturb the
    // max-height transition the panel drives from its own effect.
    const { container } = renderReasoning();
    const p = panel(container)!;
    const inner = p.firstElementChild as HTMLElement;
    // jsdom has no layout — scrollHeight is always 0, which would make the
    // "measured" step vacuously equal to the collapsed one.
    Object.defineProperty(inner, 'scrollHeight', { configurable: true, value: 120 });

    expect(p.style.maxHeight).toBe('0px');
    fireEvent.click(trigger(container));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(p.style.maxHeight).toBe('120px');
    fireEvent.click(trigger(container));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(p.style.maxHeight).toBe('0px');
  });
});
