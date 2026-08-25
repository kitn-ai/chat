import { flush } from 'solid-js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { Switch } from './switch';

afterEach(cleanup);

describe('Switch', () => {
  it('renders a switch role, off by default', () => {
    const { getByRole } = render(() => <Switch label="Temporary chat" />);
    const sw = getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toHaveAttribute('aria-label', 'Temporary chat');
  });

  it('honours defaultChecked for the initial (uncontrolled) state', () => {
    const { getByRole } = render(() => <Switch defaultChecked />);
    expect(getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('toggles on click and reports the new state', () => {
    const onChange = vi.fn();
    const { getByRole } = render(() => <Switch onChange={onChange} />);
    const sw = getByRole('switch');
    fireEvent.click(sw);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(onChange).toHaveBeenCalledWith(true);
    fireEvent.click(sw);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('toggles with the keyboard (Space / Enter)', () => {
    const onChange = vi.fn();
    const { getByRole } = render(() => <Switch onChange={onChange} />);
    fireEvent.keyDown(getByRole('switch'), { key: ' ' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is controlled when `checked` is set — defers state to the parent', () => {
    const onChange = vi.fn();
    const { getByRole } = render(() => <Switch checked={false} onChange={onChange} />);
    const sw = getByRole('switch');
    fireEvent.click(sw);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onChange).toHaveBeenCalledWith(true);
    // controlled: stays off until the parent flips `checked`
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('does not toggle when disabled', () => {
    const onChange = vi.fn();
    const { getByRole } = render(() => <Switch disabled onChange={onChange} />);
    const sw = getByRole('switch');
    fireEvent.click(sw);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onChange).not.toHaveBeenCalled();
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toBeDisabled();
  });
});
