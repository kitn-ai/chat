import { type JSX, createSignal, createEffect, on } from 'solid-js';
import { cn } from '../utils/cn';
import { Input } from './input';

/** A 3- or 6-digit CSS hex color, `#` included (`#e91e63`, `#fff`). */
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Whether `text` (trimmed) is a syntactically valid hex color. */
export function isValidHex(text: string): boolean {
  return HEX_RE.test(text.trim());
}

/** Expand a valid 3- or 6-digit hex to the strict 6-digit lowercase form
 *  `<input type="color">` requires for its `value` — the native control
 *  silently ignores (resets to black) anything else, so this is what keeps
 *  the swatch/picker in sync with a shorthand or differently-cased hex the
 *  text field accepts. Falls back to `#000000` (the platform's own default)
 *  for anything not a valid hex, matching what an empty color input already
 *  shows. */
function toNativeColorValue(hex: string | undefined): string {
  const s = hex?.trim();
  if (s === undefined) return '#000000';
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const [r, g, b] = s.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return '#000000';
}

export interface ColorFieldProps {
  /** Accessible name for the color control — the swatch/native picker's
   *  `aria-label`. The hex text field gets its own derived label so the two
   *  controls announce distinctly. */
  label: string;
  /** The committed color as a CSS hex string, or `undefined`/empty for
   *  unset. Controlled — this component holds no color state of its own,
   *  only the hex text field's in-progress draft (see `onChange`). */
  value?: string;
  /** Placeholder for the hex text field when `value` is unset. */
  placeholder?: string;
  disabled?: boolean;
  /**
   * Fires with the next value once it is syntactically valid: immediately
   * for the native color picker (which only ever emits a valid 6-digit hex),
   * or on blur/commit of the hex text field when what's typed matches
   * {@link isValidHex}. An invalid or partial hex in the text field never
   * fires this — the field just doesn't commit, and keeps whatever was
   * typed rather than snapping back (owner ruling, design round 3: "invalid
   * text doesn't nuke state, just doesn't commit").
   */
  onChange: (value: string) => void;
  class?: string;
}

/**
 * `ColorField`: a themed rounded-square swatch (the visible trigger for the
 * platform's own color picker) beside a hex text field, kept in sync in both
 * directions.
 *
 * The swatch is a `<label>` wrapping a real `<input type="color">` that is
 * `sr-only` (present, focusable, and labeled for assistive tech — never
 * `display:none` or `tabindex="-1"`) rather than rendered — the platform
 * color dialog is what does the actual picking; this component never draws
 * its own color rectangle. Clicking anywhere on the swatch forwards to the
 * native input via ordinary label/input association; keyboard focus lands on
 * that input, and the VISIBLE focus ring is painted on the wrapping label via
 * `has-[:focus-visible]:` — the same "real hidden control, ring on the
 * decorative wrapper" idiom `tasks-card.tsx` and `choice-card.tsx` already
 * use for their checkbox/radio rows. Enter/Space opening the native color
 * dialog on a focused `<input type="color">` is platform behavior, not
 * something this component implements.
 *
 * No `part=` attributes: not yet wired to a `kai-*` facade.
 */
export function ColorField(props: ColorFieldProps): JSX.Element {
  // The hex field's own draft — kept in sync with `value` (including a
  // native-picker pick, once the caller feeds it back through `value`) via
  // the effect below, but otherwise free to hold whatever's mid-typing
  // without a keystroke-by-keystroke fight. Same pattern as
  // `AcceptTypeEditor`'s Advanced field in builder-panel.tsx.
  const [draft, setDraft] = createSignal(props.value ?? '');
  createEffect(on(() => props.value, (value) => setDraft(value ?? ''), { defer: true }));

  const commitDraft = (text: string): void => {
    const trimmed = text.trim();
    if (isValidHex(trimmed)) props.onChange(trimmed);
  };

  return (
    <div class={cn('flex items-center gap-2', props.class)}>
      <label
        class={cn(
          'relative inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border',
          props.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          'has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
        )}
        style={{ background: props.value || 'var(--color-muted)' }}
      >
        <input
          type="color"
          class="sr-only"
          value={toNativeColorValue(props.value)}
          disabled={props.disabled}
          aria-label={props.label}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      </label>
      <Input
        size="sm"
        class="flex-1"
        value={draft()}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-label={`${props.label} hex value`}
        onValueInput={setDraft}
        onValueChange={commitDraft}
      />
    </div>
  );
}
