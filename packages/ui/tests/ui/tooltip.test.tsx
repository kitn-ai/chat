import { flush } from 'solid-js';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library';
import { Tooltip } from '../../src/ui/tooltip';

// jsdom (v24) does not implement the PointerEvent constructor. fireEvent.pointerEnter/Leave
// need it. Real browsers implement PointerEvent, so this is a jsdom-only shim.
// We extend MouseEvent so .target / bubbling behave like a real pointer event.
if (typeof (globalThis as any).PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, params?: PointerEventInit) {
      super(type, params);
    }
  };
}

describe('Tooltip', () => {
  it('shows on focus and wires aria-describedby', async () => {
    render(() => <Tooltip content="Hello"><button data-testid="b">x</button></Tooltip>);
    const trigger = screen.getByTestId('b').parentElement!; // As span wraps the button
    fireEvent.focusIn(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toBe('Hello');
    expect(trigger.getAttribute('aria-describedby')).toBe(tip.id);
  });

  it('hides on Escape', async () => {
    render(() => <Tooltip content="Hello"><button>x</button></Tooltip>);
    const trigger = screen.getByText('x').parentElement!;
    fireEvent.focusIn(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await screen.findByRole('tooltip');
    fireEvent.keyDown(document, { key: 'Escape' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('applies data-closed (exit animation state) before unmounting', async () => {
    render(() => <Tooltip content="Hello"><button>x</button></Tooltip>);
    const trigger = screen.getByText('x').parentElement!;
    fireEvent.focusIn(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    const tip = await screen.findByRole('tooltip');
    expect(tip.getAttribute('data-expanded')).toBe('');
    fireEvent.keyDown(document, { key: 'Escape' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    // still mounted this tick, now in closing state
    expect(tip.getAttribute('data-closed')).toBe('');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('stays open on pointerleave while still focused (WCAG 1.4.13 persistent)', async () => {
    render(() => <Tooltip content="Hello"><button data-testid="b">x</button></Tooltip>);
    const trigger = screen.getByTestId('b').parentElement!;
    fireEvent.focusIn(trigger);          // opens via focus
    await screen.findByRole('tooltip');
    fireEvent.pointerEnter(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    fireEvent.pointerLeave(trigger);     // pointer leaves but focus remains
    expect(screen.queryByRole('tooltip')).not.toBeNull(); // still open
  });

  it('closes only when both pointer and focus have left', async () => {
    render(() => <Tooltip content="Hello"><button data-testid="b">x</button></Tooltip>);
    const trigger = screen.getByTestId('b').parentElement!;
    fireEvent.focusIn(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await screen.findByRole('tooltip');
    fireEvent.focusOut(trigger, { relatedTarget: document.body });  // focus leaves; no pointer ever entered
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });
});
