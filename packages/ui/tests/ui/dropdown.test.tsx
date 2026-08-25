import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem, DropdownRadioItem } from '../../src/ui/dropdown';

// jsdom (v24) does not implement the PointerEvent constructor. useDismiss
// listens for `pointerdown`; copy the shim from overlay.test.tsx.
if (typeof (globalThis as any).PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, params?: PointerEventInit) {
      super(type, params);
    }
  };
}

function setup(onSelect = vi.fn()) {
  const utils = render(() => (
    <Dropdown>
      <DropdownTrigger as={(p: any) => <button {...p} data-testid="trg">Menu</button>} />
      <DropdownContent>
        <DropdownItem onSelect={() => onSelect('a')}>Alpha</DropdownItem>
        <DropdownItem onSelect={() => onSelect('b')}>Beta</DropdownItem>
        <DropdownItem onSelect={() => onSelect('c')}>Gamma</DropdownItem>
      </DropdownContent>
    </Dropdown>
  ));
  return { ...utils, onSelect, trg: screen.getByTestId('trg') };
}

describe('Dropdown', () => {
  it('trigger exposes menu button semantics', () => {
    const { trg } = setup();
    expect(trg.getAttribute('aria-haspopup')).toBe('menu');
    expect(trg.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on click and renders role=menu with menuitems', () => {
    const { trg } = setup();
    fireEvent.click(trg);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(trg.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  it('ArrowDown from trigger opens and focuses first item; Arrow keys move roving focus', async () => {
    const { trg } = setup();
    fireEvent.keyDown(trg, { key: 'ArrowDown' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    // V2-SHAPE: the keyboard-open focus lands via queueMicrotask AFTER the menu
    // mounts at the flush above; yield one microtask so it runs.
    await Promise.resolve();
    const items = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'Home' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'End' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(document.activeElement).toBe(items[2]);
  });

  it('Enter on a focused item fires onSelect and closes, returning focus to trigger', async () => {
    const { trg, onSelect } = setup();
    fireEvent.keyDown(trg, { key: 'ArrowDown' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    const items = screen.getAllByRole('menuitem');
    fireEvent.keyDown(items[0], { key: 'Enter' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSelect).toHaveBeenCalledWith('a');
    await Promise.resolve();
    flush(); // V2-FLUSH: the presence microtask's write is itself staged
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trg);
  });

  it('Escape closes and returns focus to the trigger', async () => {
    const { trg } = setup();
    fireEvent.click(trg);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await Promise.resolve();
    flush(); // V2-FLUSH: the presence microtask's write is itself staged
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trg);
  });

  it('typeahead focuses the first item starting with the typed character', () => {
    const { trg } = setup();
    fireEvent.keyDown(trg, { key: 'ArrowDown' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    const items = screen.getAllByRole('menuitem');
    fireEvent.keyDown(items[0], { key: 'g' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(document.activeElement).toBe(items[2]); // Gamma
  });

  it('Tab closes the menu without forcing focus back to the trigger', async () => {
    const { trg } = setup();
    fireEvent.keyDown(trg, { key: 'ArrowDown' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await Promise.resolve(); // V2-SHAPE: let the keyboard-open focus microtask run
    const items = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'Tab' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await Promise.resolve(); // async unmount
    flush(); // V2-FLUSH: the presence microtask's write is itself staged
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).not.toBe(trg); // focus NOT yanked back to trigger
  });
});

describe('DropdownRadioItem (single-select group)', () => {
  function setupRadio(onSelect = vi.fn()) {
    const [selected, setSelected] = createSignal('all');
    const utils = render(() => (
      <Dropdown>
        <DropdownTrigger as={(p: any) => <button {...p} data-testid="trg">Menu</button>} />
        <DropdownContent>
          <DropdownRadioItem checked={selected() === 'all'} onSelect={() => { setSelected('all'); onSelect('all'); }}>All</DropdownRadioItem>
          <DropdownRadioItem checked={selected() === 'chat'} onSelect={() => { setSelected('chat'); onSelect('chat'); }}>Chat</DropdownRadioItem>
          <DropdownRadioItem checked={selected() === 'task'} onSelect={() => { setSelected('task'); onSelect('task'); }}>Task</DropdownRadioItem>
        </DropdownContent>
      </Dropdown>
    ));
    return { ...utils, onSelect, selected, trg: screen.getByTestId('trg') };
  }

  it('renders role=menuitemradio with aria-checked reflecting the selected one', () => {
    const { trg } = setupRadio();
    fireEvent.click(trg);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    const items = screen.getAllByRole('menuitemradio');
    expect(items).toHaveLength(3);
    expect(items[0].getAttribute('aria-checked')).toBe('true');
    expect(items[1].getAttribute('aria-checked')).toBe('false');
    expect(items[2].getAttribute('aria-checked')).toBe('false');
  });

  it('radio items participate in roving focus alongside menuitems', async () => {
    const { trg } = setupRadio();
    fireEvent.keyDown(trg, { key: 'ArrowDown' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await Promise.resolve(); // V2-SHAPE: let the keyboard-open focus microtask run
    const items = screen.getAllByRole('menuitemradio');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(document.activeElement).toBe(items[1]);
  });

  it('selecting moves the checkmark and KEEPS THE MENU OPEN (consumer owns the group)', () => {
    const { trg, onSelect } = setupRadio();
    fireEvent.click(trg);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    let items = screen.getAllByRole('menuitemradio');
    fireEvent.click(items[1]);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSelect).toHaveBeenCalledWith('chat');
    // menu stays open
    expect(screen.getByRole('menu')).toBeTruthy();
    // checkmark moved
    items = screen.getAllByRole('menuitemradio');
    expect(items[0].getAttribute('aria-checked')).toBe('false');
    expect(items[1].getAttribute('aria-checked')).toBe('true');
  });

  it('disabled radio item does not fire onSelect', () => {
    const onSelect = vi.fn();
    render(() => (
      <Dropdown defaultOpen>
        <DropdownTrigger as={(p: any) => <button {...p}>Menu</button>} />
        <DropdownContent>
          <DropdownRadioItem checked disabled onSelect={onSelect}>None</DropdownRadioItem>
        </DropdownContent>
      </Dropdown>
    ));
    const item = screen.getByRole('menuitemradio');
    fireEvent.click(item);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSelect).not.toHaveBeenCalled();
  });
});
