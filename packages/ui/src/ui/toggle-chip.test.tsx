import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { ToggleChip } from './toggle-chip';

afterEach(cleanup);

describe('ToggleChip', () => {
  it('renders a button, unpressed by default', () => {
    const { getByRole } = render(() => <ToggleChip>Images</ToggleChip>);
    const chip = getByRole('button', { name: 'Images' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toHaveAttribute('type', 'button');
  });

  it('honours defaultPressed for the initial (uncontrolled) state', () => {
    const { getByRole } = render(() => <ToggleChip defaultPressed>Images</ToggleChip>);
    expect(getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles on click and reports the new state', () => {
    const onChange = vi.fn();
    const { getByRole } = render(() => <ToggleChip onChange={onChange}>Images</ToggleChip>);
    const chip = getByRole('button');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(onChange).toHaveBeenCalledWith(true);
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('toggles with the keyboard (Space / Enter)', () => {
    const onChange = vi.fn();
    const { getByRole } = render(() => <ToggleChip onChange={onChange}>Images</ToggleChip>);
    fireEvent.keyDown(getByRole('button'), { key: ' ' });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is controlled when `pressed` is set — defers state to the parent', () => {
    const onChange = vi.fn();
    const { getByRole } = render(() => <ToggleChip pressed={false} onChange={onChange}>Images</ToggleChip>);
    const chip = getByRole('button');
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith(true);
    // controlled: stays unpressed until the parent flips `pressed`
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not toggle when disabled', () => {
    const onChange = vi.fn();
    const { getByRole } = render(() => <ToggleChip disabled onChange={onChange}>Images</ToggleChip>);
    const chip = getByRole('button');
    fireEvent.click(chip);
    expect(onChange).not.toHaveBeenCalled();
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toBeDisabled();
  });

  it('defaults to the compact pill size (h-7)', () => {
    const { getByRole } = render(() => <ToggleChip>Images</ToggleChip>);
    expect(getByRole('button').className).toContain('h-7');
  });

  it('switches to the larger md size on request', () => {
    const { getByRole } = render(() => <ToggleChip size="md">Images</ToggleChip>);
    expect(getByRole('button').className).toContain('h-8');
  });
});
