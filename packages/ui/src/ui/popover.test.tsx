import { flush } from 'solid-js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { Popover } from './popover';

afterEach(cleanup);

// createPresence unmounts on a microtask when there is no exit animation (jsdom),
// so flush the queue before asserting a closed popover has left the DOM.
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Popover', () => {
  it('renders the trigger and hides the content until opened', () => {
    const { getByText, queryByText } = render(() => (
      <Popover trigger={<button>Open menu</button>}>
        <div>Panel body</div>
      </Popover>
    ));
    expect(getByText('Open menu')).toBeInTheDocument();
    expect(queryByText('Panel body')).not.toBeInTheDocument();
  });

  it('opens on trigger click and calls onOpenChange(true)', () => {
    const onOpenChange = vi.fn();
    const { getByText, queryByText } = render(() => (
      <Popover trigger={<button>Open menu</button>} onOpenChange={onOpenChange}>
        <div>Panel body</div>
      </Popover>
    ));
    fireEvent.click(getByText('Open menu'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(queryByText('Panel body')).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('toggles closed on a second trigger click and calls onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    const { getByText, queryByText } = render(() => (
      <Popover trigger={<button>Open menu</button>} onOpenChange={onOpenChange}>
        <div>Panel body</div>
      </Popover>
    ));
    const trigger = getByText('Open menu');
    fireEvent.click(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(queryByText('Panel body')).toBeInTheDocument();
    fireEvent.click(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await tick();
    expect(queryByText('Panel body')).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('closes on Escape', async () => {
    const { getByText, queryByText } = render(() => (
      <Popover trigger={<button>Open menu</button>}>
        <div>Panel body</div>
      </Popover>
    ));
    fireEvent.click(getByText('Open menu'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(queryByText('Panel body')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await tick();
    expect(queryByText('Panel body')).not.toBeInTheDocument();
  });

  it('stays open when clicking inside the panel, closes on an outside pointerdown', async () => {
    const { getByText, queryByText } = render(() => (
      <Popover trigger={<button>Open menu</button>}>
        <div>Panel body</div>
      </Popover>
    ));
    fireEvent.click(getByText('Open menu'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    fireEvent.pointerDown(getByText('Panel body'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(queryByText('Panel body')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await tick();
    expect(queryByText('Panel body')).not.toBeInTheDocument();
  });

  it('respects the controlled open prop', () => {
    const { queryByText } = render(() => (
      <Popover open trigger={<button>Open menu</button>}>
        <div>Panel body</div>
      </Popover>
    ));
    expect(queryByText('Panel body')).toBeInTheDocument();
  });

  it('does not change its own state when controlled — defers to onOpenChange', () => {
    const onOpenChange = vi.fn();
    const { getByText, queryByText } = render(() => (
      <Popover open={false} trigger={<button>Open menu</button>} onOpenChange={onOpenChange}>
        <div>Panel body</div>
      </Popover>
    ));
    fireEvent.click(getByText('Open menu'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    // controlled: stays closed until the parent flips `open`
    expect(queryByText('Panel body')).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
