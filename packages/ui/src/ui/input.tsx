import { type JSX, Show, splitProps, createUniqueId } from 'solid-js';
import { cn } from '../utils/cn';

export interface InputProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'onInput' | 'onChange' | 'size'> {
  /** Field label rendered above the control and linked via `for`/`id`. */
  label?: string;
  /** Helper text rendered below the control. */
  hint?: string;
  /** Error text; rendered below the control and flips the field invalid. */
  error?: string;
  /** Control density. Defaults to `md`. */
  size?: 'sm' | 'md';
  /** Force the invalid (destructive-border) state without an `error` string. */
  invalid?: boolean;
  /** Leading affix (icon, unit). Rendered inside the field row, before the input. */
  leading?: JSX.Element;
  /** Trailing affix (icon, inline button). Rendered inside the field row, after the input. */
  trailing?: JSX.Element;
  /** Fires per keystroke with the current value. */
  onValueInput?: (value: string) => void;
  /** Fires on commit (blur) with the current value. */
  onValueChange?: (value: string) => void;
}

// The single source of the field shell styling — lifted verbatim from the
// `inputBase` constant that used to live in `src/components/form-widgets.tsx`.
// `Input` now owns it; the form widgets render `Input` rather than re-pasting it.
export const FIELD_BASE =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none';

// When a leading/trailing affix is present the border + padding wrap the whole
// row and the focus ring is driven off the row (`focus-within`), so the input
// itself sits borderless and transparent inside it.
const FIELD_ROW =
  'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-ring';
const ROW_INPUT =
  'min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed';

const SIZE_SM = 'px-2.5 py-1';
const INVALID = 'border-destructive dark:border-red-400/70';

// Suppress the native search affordances Chrome/WebKit render for `type="search"`.
// Without this the browser's `::-webkit-search-cancel-button` (×) stacks on top of
// a custom clear control (e.g. kai-search's `part="clear"`) — a double ×. Applied
// to the inner `<input>` in BOTH layouts (the field can be `type="search"` either
// way; kai-search uses the affix layout for its leading icon).
const SEARCH_RESET =
  '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-cancel-button]:hidden';

/**
 * `Input`: the token-themed single-line text field shell. A label/hint/error
 * stack around a field row that holds an optional `leading` affix, the
 * `<input>`, and an optional `trailing` affix. The shared border/background/ring
 * styling lives here (the single field source the form widgets build on).
 *
 * Parts: `field` (the bordered control), `input`, `label`, `hint`.
 * a11y: a generated id links `<label for>`; `invalid`/`error` set `aria-invalid`;
 * the hint/error text is linked via `aria-describedby`.
 */
export function Input(props: InputProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'class', 'label', 'hint', 'error', 'size', 'invalid',
    'leading', 'trailing', 'onValueInput', 'onValueChange', 'onBlur', 'id', 'disabled',
  ]);

  const id = local.id ?? createUniqueId();
  const hintId = `${id}-hint`;
  const isInvalid = () => !!local.invalid || !!local.error;
  const hasHint = () => !!local.error || !!local.hint;
  const hasAffix = () => local.leading != null || local.trailing != null;

  // The class arrives as an ACCESSOR, not a string, and this is load-bearing.
  //
  // Solid evaluates a `<Show>` `fallback` inside the Show's own memo. When the
  // class was computed at the call site — `inputEl(cn(FIELD_BASE, …,
  // isInvalid() && INVALID, local.class), …)` — those reads happened in that
  // memo, so any of them changing re-ran the memo and BUILT A NEW `<input>`
  // NODE: focus, caret and IME composition state all died with the old one. A
  // consumer whose `invalid` is derived from the value (`kai-form` did exactly
  // that) lost focus after every character.
  //
  // Passing a function moves every reactive read inside the element, where
  // Solid compiles it into a nested effect that sets the attribute on the
  // EXISTING node. Same reason the affix branch was always fine: it inserts the
  // input through a function. Pinned by `tests/ui/input-node-identity.test.tsx`.
  const inputEl = (cls: () => string, part: string): JSX.Element => (
    <input
      {...rest}
      id={id}
      part={part}
      disabled={local.disabled}
      aria-invalid={isInvalid() ? 'true' : undefined}
      aria-describedby={hasHint() ? hintId : undefined}
      class={cn(SEARCH_RESET, cls())}
      onInput={(e) => local.onValueInput?.(e.currentTarget.value)}
      onBlur={(e) => {
        const handler = local.onBlur;
        if (typeof handler === 'function') handler(e);
        local.onValueChange?.(e.currentTarget.value);
      }}
    />
  );

  const fieldClass = () =>
    cn(FIELD_BASE, local.size === 'sm' && SIZE_SM, isInvalid() && INVALID, local.class);

  // Created on first use and then REUSED, so toggling an affix on or off does
  // not discard a focused input either. The lazy cache also keeps the unused
  // branch's node (and its effects) from being built at all.
  let plainNode: JSX.Element;
  const plainInput = () => (plainNode ??= inputEl(fieldClass, 'field input'));
  let rowNode: JSX.Element;
  const rowInput = () => (rowNode ??= inputEl(() => ROW_INPUT, 'input'));

  return (
    <div class="flex w-full flex-col gap-1.5">
      <Show when={local.label}>
        <label part="label" for={id} class="text-sm font-medium text-foreground">
          {local.label}
        </label>
      </Show>

      <Show when={hasAffix()} fallback={plainInput()}>
        <div
          part="field"
          class={cn(
            FIELD_ROW,
            local.size === 'sm' && SIZE_SM,
            isInvalid() && INVALID,
            local.disabled && 'opacity-50 pointer-events-none',
            local.class,
          )}
        >
          <Show when={local.leading}>
            <span class="flex shrink-0 items-center text-muted-foreground">{local.leading}</span>
          </Show>
          {rowInput()}
          <Show when={local.trailing}>
            <span class="flex shrink-0 items-center text-muted-foreground">{local.trailing}</span>
          </Show>
        </div>
      </Show>

      <Show when={hasHint()}>
        <p part="hint" id={hintId} class={cn('text-xs', local.error ? 'text-destructive' : 'text-muted-foreground')}>
          {local.error ?? local.hint}
        </p>
      </Show>
    </div>
  );
}
