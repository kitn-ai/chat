/**
 * `jsdom` cannot open a real `<input type="color">` picker dialog — there is
 * no OS color-chooser to drive in a headless DOM, so nothing here clicks the
 * swatch expecting a dialog to appear. What IS testable, and what these pin,
 * is the wiring the coordinator asked for: the swatch/hex-field/onChange
 * triangle staying in sync, an invalid hex not clobbering state, and the
 * hidden native input remaining a real, focusable, labeled control (the
 * `sr-only` idiom `tasks-card.tsx`/`choice-card.tsx` already use) rather than
 * `display:none` or `tabindex="-1"`, which is what AT and keyboard users
 * actually depend on.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { ColorField, isValidHex } from './color-field';

afterEach(cleanup);

function ControlledColorField(props: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = createSignal(props.initial);
  return (
    <ColorField
      label="Accent color"
      value={value()}
      placeholder="#e91e63"
      onChange={(v) => {
        setValue(v);
        props.onChange?.(v);
      }}
    />
  );
}

describe('isValidHex', () => {
  it('accepts 3- and 6-digit hex, rejects everything else', () => {
    expect(isValidHex('#fff')).toBe(true);
    expect(isValidHex('#e91e63')).toBe(true);
    expect(isValidHex('  #ABCDEF  ')).toBe(true);
    expect(isValidHex('e91e63')).toBe(false);
    expect(isValidHex('#ggg')).toBe(false);
    expect(isValidHex('red')).toBe(false);
    expect(isValidHex('')).toBe(false);
  });
});

describe('ColorField', () => {
  it('renders the swatch background from value and the hex text field with the same value', () => {
    render(() => <ControlledColorField initial="#e91e63" />);
    const swatch = document.querySelector('label');
    expect(swatch).toHaveStyle({ background: '#e91e63' });
    expect(screen.getByLabelText('Accent color hex value')).toHaveValue('#e91e63');
  });

  it('committing a valid hex in the text field fires onChange, which (once fed back) updates the swatch and the native color input', () => {
    const onChange = vi.fn();
    render(() => <ControlledColorField initial="#000000" onChange={onChange} />);
    const hexField = screen.getByLabelText('Accent color hex value');
    fireEvent.input(hexField, { target: { value: '#38bdf8' } });
    fireEvent.blur(hexField);
    expect(onChange).toHaveBeenCalledWith('#38bdf8');
    const swatch = document.querySelector('label');
    expect(swatch).toHaveStyle({ background: '#38bdf8' });
    const nativeInput = document.querySelector('input[type="color"]');
    expect(nativeInput).toHaveValue('#38bdf8');
  });

  it('an invalid hex does not commit — onChange is never called and the typed text stays in the field', () => {
    const onChange = vi.fn();
    render(() => <ControlledColorField initial="#e91e63" onChange={onChange} />);
    const hexField = screen.getByLabelText('Accent color hex value');
    fireEvent.input(hexField, { target: { value: 'not-a-color' } });
    fireEvent.blur(hexField);
    expect(onChange).not.toHaveBeenCalled();
    expect(hexField).toHaveValue('not-a-color');
    // The swatch/native input never saw the invalid text — they still reflect
    // the last COMMITTED value, not the abandoned draft.
    const swatch = document.querySelector('label');
    expect(swatch).toHaveStyle({ background: '#e91e63' });
  });

  it('a native-picker pick fires onChange immediately with the picked hex', () => {
    const onChange = vi.fn();
    render(() => <ControlledColorField initial="#000000" onChange={onChange} />);
    const nativeInput = document.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.input(nativeInput, { target: { value: '#123abc' } });
    expect(onChange).toHaveBeenCalledWith('#123abc');
    // Fed back through the controlled `value` prop, the hex field mirrors it.
    expect(screen.getByLabelText('Accent color hex value')).toHaveValue('#123abc');
  });

  it('expands a 3-digit hex to the strict 6-digit lowercase form the native color input requires', () => {
    render(() => <ControlledColorField initial="#Abc" />);
    const nativeInput = document.querySelector('input[type="color"]');
    expect(nativeInput).toHaveValue('#aabbcc');
  });

  it('the native color input is sr-only but stays a real, focusable, labeled control (not display:none / tabindex=-1)', () => {
    render(() => <ControlledColorField initial="#e91e63" />);
    const nativeInput = document.querySelector('input[type="color"]') as HTMLInputElement;
    expect(nativeInput).toHaveClass('sr-only');
    expect(nativeInput).toHaveAttribute('aria-label', 'Accent color');
    expect(nativeInput.tabIndex).not.toBe(-1);
    nativeInput.focus();
    expect(document.activeElement).toBe(nativeInput);
  });

  it('the swatch label carries the has-[:focus-visible] ring classes that light up when the hidden input is keyboard-focused', () => {
    render(() => <ControlledColorField initial="#e91e63" />);
    const swatch = document.querySelector('label')!;
    expect(swatch.className).toContain('has-[:focus-visible]:ring-2');
  });

  it('disabled disables both the native input and the hex text field', () => {
    render(() => (
      <ColorField label="Accent color" value="#e91e63" onChange={vi.fn()} disabled />
    ));
    expect(document.querySelector('input[type="color"]')).toBeDisabled();
    expect(screen.getByLabelText('Accent color hex value')).toBeDisabled();
  });
});
