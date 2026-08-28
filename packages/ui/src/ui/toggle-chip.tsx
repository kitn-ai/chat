import { type JSX, createSignal, splitProps } from 'solid-js';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

// Owns its classes rather than delegating to `Button` (owner amendment, design
// round 4): Button's smallest size (`sm`, `h-8`) reads as a small BUTTON, not
// a pill, and pill proportions need finer control than that scale offers —
// closer to `Badge`'s `min-h-5` than to any Button size. `sm` here (h-7,
// tight px-3, text-xs) is the default pill; `md` (h-8, text-sm) is the one
// larger variant kept for a row that wants more presence, e.g. a filter bar
// with fewer, more prominent chips — see the story's size-comparison row.
const toggleChipVariants = cva(
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      pressed: {
        true: 'bg-primary text-primary-foreground hover:bg-primary/90',
        false: 'bg-muted/60 text-foreground hover:bg-muted',
      },
      size: {
        sm: 'h-7 px-3 text-xs',
        md: 'h-8 px-3.5 text-sm',
      },
    },
    defaultVariants: { pressed: false, size: 'sm' },
  },
);

export interface ToggleChipProps
  extends Omit<
      JSX.ButtonHTMLAttributes<HTMLButtonElement>,
      'type' | 'role' | 'aria-pressed' | 'onChange' | 'onclick' | 'onClick' | 'onKeyDown' | 'onkeydown' | 'children'
    >,
    VariantProps<typeof toggleChipVariants> {
  /** Controlled pressed state. When set, the component defers state to the
   *  parent; drive it from `onChange`. Omit for uncontrolled (internal)
   *  state — same controlled/uncontrolled shape as `Switch`'s
   *  `checked`/`defaultChecked`, renamed to `pressed` because that's the
   *  ARIA state a toggle BUTTON carries (`aria-pressed`, not
   *  `aria-checked` — this is a button, not a switch/checkbox/radio). */
  pressed?: boolean;
  /** Initial pressed state when uncontrolled. */
  defaultPressed?: boolean;
  /** Disable interaction. */
  disabled?: boolean;
  /** Fires with the next pressed state on toggle. */
  onChange?: (pressed: boolean) => void;
  class?: string;
  children?: JSX.Element;
}

/**
 * `ToggleChip`: a small pill button for a two-state, chip-shaped toggle
 * (`aria-pressed`) — the common-case selectors in `builder-panel.tsx`'s
 * attachments accept editor, promoted to a named primitive (owner design
 * round 4). Controlled via `pressed`, or uncontrolled from `defaultPressed`,
 * matching `Switch`'s controlled/uncontrolled convention.
 *
 * No `ChipGroup` wrapper: a row of chips is `<div class="flex flex-wrap
 * gap-1.5">` and nothing more — there is no shared selection state, roving
 * tabindex, or exclusivity to own (unlike `RadioGroup`/`Segmented`, which
 * DO have real grouping logic: one shared `name`, single-select, arrow-key
 * navigation between options). Wrapping a plain flex row in a component
 * would be a component with nothing to do — YAGNI; see the story for the
 * same "just a flex row" idiom used inline.
 */
export function ToggleChip(props: ToggleChipProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'pressed', 'defaultPressed', 'disabled', 'size', 'onChange', 'class', 'children',
  ]);
  const [internal, setInternal] = createSignal(local.defaultPressed ?? false);
  const isControlled = () => local.pressed !== undefined;
  const isPressed = () => (isControlled() ? !!local.pressed : internal());

  const toggle = (): void => {
    if (local.disabled) return;
    const next = !isPressed();
    if (!isControlled()) setInternal(next);
    local.onChange?.(next);
  };

  return (
    <button
      {...rest}
      type="button"
      aria-pressed={isPressed()}
      disabled={local.disabled}
      onClick={toggle}
      // Mirrors `Switch`'s own explicit Space/Enter handling byte for byte,
      // including the `preventDefault()` BEFORE `toggle()`: a real `<button>`
      // already gets native keyboard activation from the browser (Enter on
      // keydown, Space on keyup), so without the preventDefault this would
      // toggle TWICE per keypress in a real browser (once here, once from the
      // browser's own synthesized click) — jsdom has no such default action
      // to cancel, which is also why the keyboard-toggle test below needs
      // this handler at all to pass headlessly.
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
      }}
      class={cn(toggleChipVariants({ pressed: isPressed(), size: local.size }), local.class)}
    >
      {local.children}
    </button>
  );
}

export { toggleChipVariants };
