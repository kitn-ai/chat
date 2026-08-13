import { Show } from 'solid-js';
import { Button } from '../ui/button';
import { renderIcon } from '../ui/icon';
import { defineWebComponent } from './define';
import { createSlotText } from './slot-text';

interface Props extends Record<string, unknown> {
  /** Visual style. `default` (filled), `subtle` (muted text, hover tint, the
   *  toolbar icon look), `ghost` (transparent, hover fill), `outline`, or
   *  `destructive`. Defaults to `default`. */
  variant?: 'default' | 'subtle' | 'ghost' | 'outline' | 'destructive';
  /** Size token. `icon` / `icon-sm` are square (for icon-only buttons); `sm` /
   *  `md` / `lg` size text buttons. Defaults to `md`. */
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';
  /** Leading icon: a named icon (e.g. `"mic"`, `"plus"`), an image URL/data-URI,
   *  or plain text. Renders before any slotted label. */
  icon?: string;
  /** Trailing icon, after the label (e.g. `"chevron-down"` for a menu affordance). */
  iconTrailing?: string;
  /** Accessible name. REQUIRED for icon-only buttons (no visible text); ignored
   *  when you slot visible text, which already names the button. An `aria-label`
   *  on top of visible text REPLACES that name rather than adding to it, so a
   *  button reading "Save" that answers to "Submit" is unusable by speech input
   *  (WCAG 2.5.3, Label in Name). The visible text wins. An `icon` / `icon-sm`
   *  size hides the slot, which makes the button icon-only whatever you slotted,
   *  so `label` is what names it there. */
  label?: string;
  /** Disable the button (non-interactive, dimmed). */
  disabled?: boolean;
  /** Stretch the button to the full width of its container (a block button),
   *  e.g. a card CTA or a stacked action. Attribute: `full`. */
  full?: boolean;
  /** Justify the button's content: `start`, `center` (default), or `end`.
   *  Combine with `full` for a full-width, left-aligned button. */
  align?: 'start' | 'center' | 'end';
  /** Native button `type`. Defaults to `button` (so it never submits a form). */
  type?: 'button' | 'submit' | 'reset';
}

/** Events fired by `<kai-button>`. */
interface Events {
  /** The button was activated (pointer or keyboard). Carries no detail. The
   *  native `click` also bubbles (composed) for consumers who prefer it. */
  'kai-click': void;
}

/**
 * `<kai-button>` — the kit's button as a drop-in element, so consumers compose
 * polished, theme-aware controls instead of hand-rolling `<button>` + inline
 * hover styles. Put the label as light-DOM text; use `icon` for a leading glyph
 * and `label` to name an icon-only button.
 *
 * ```html
 * <kai-button variant="subtle" size="icon" icon="mic" label="Voice input"></kai-button>
 * <kai-button variant="ghost" icon-trailing="chevron-down">High</kai-button>
 * <kai-button>Send</kai-button>
 * <kai-button label="Ship"><svg slot="icon" viewBox="0 0 24 24">…</svg></kai-button>
 * ```
 *
 * The `icon` prop renders a curated/URL icon; for anything else, slot your own
 * inline SVG via `slot="icon"` (it wins over `icon`). Restyle via `::part(button)`.
 * Emits `kai-click`.
 */
defineWebComponent<Props, Events>('kai-button', {
  variant: 'default',
  size: 'md',
  icon: undefined,
  iconTrailing: undefined,
  label: undefined,
  disabled: false,
  full: false,
  align: 'center',
  type: 'button',
}, (props, { dispatch, flag, element, expose }) => {
  // `icon` / `icon-sm` are square, icon-ONLY sizes: suppress the text label and
  // trailing icon so a stray label doesn't get cramped into the square (the
  // `label` prop still names it for assistive tech).
  const iconOnly = () => props.size === 'icon' || props.size === 'icon-sm';

  // Slotted text names the button by itself (name-from-contents reaches through
  // the slot), so `label` must NOT be emitted on top of it: aria-label REPLACES
  // the computed name, and a name that disagrees with the visible text locks
  // speech-input users out of the control (WCAG 2.5.3). This is what the `label`
  // doc has always promised, and what `kai-checkpoint` already does.
  //
  // `flatten` so a consumer who wraps <kai-button> in their own component and
  // forwards a <slot> still counts as having visible text. Safe here because the
  // default slot has no fallback content — see createSlotText.
  const slotted = createSlotText({ flatten: true });

  // The name to emit, or nothing. An `icon`/`icon-sm` size does not render the
  // default slot at all, so whatever was slotted is INVISIBLE and `label` is the
  // only name available — dropping it there would leave icon buttons nameless,
  // which is the worse bug.
  const ariaLabel = () => (!iconOnly() && slotted.hasText() ? undefined : props.label);

  // ── Imperative API (instance methods on the host) ──────────────────────────
  // The real <button> lives in the shadow root, so native focus()/blur()/click()
  // on the host hit the wrapper, not the control. Forward to the inner button.
  // These shadow the inherited HTMLElement methods — intended; expose() uses
  // defineProperty so the override sticks. No collision with the props above.
  expose({
    /** Focus the inner `<button>` (host.focus() would focus the wrapper). */
    focus: (options?: FocusOptions) =>
      element.shadowRoot?.querySelector('button')?.focus(options),
    /** Blur the inner `<button>`. */
    blur: () => element.shadowRoot?.querySelector('button')?.blur(),
    /** Programmatically activate the button. Runs the same path as a user
     *  click and fires kai-click. Forwarding to the inner button means
     *  `disabled` is respected automatically. */
    click: () => element.shadowRoot?.querySelector('button')?.click(),
  });
  return (
    <>
      {/* The host shrinks to the label by default (inline-flex), so a text button
          is only as wide as its content — until a parent stretches it. A text
          button's inner control is w-full, so when the host IS stretched (a flex
          column with items-stretch, e.g. a card's collapsed footer, or an explicit
          `full`) the button fills it. `full` forces that standalone (a block CTA).
          Icon buttons stay square (no w-full). */}
      <style>{':host{display:inline-flex}:host([full]){display:block}'}</style>
    <Button
      part="button"
      variant={props.variant ?? 'default'}
      size={props.size ?? 'md'}
      align={props.align ?? 'center'}
      full={flag('full') || !iconOnly()}
      type={props.type ?? 'button'}
      disabled={flag('disabled')}
      aria-label={ariaLabel()}
      onClick={() => dispatch('kai-click')}
    >
      {/* Leading icon: a slotted SVG (slot="icon") wins — drop in any icon
          library or your own; otherwise the `icon` prop renders a curated/URL one. */}
      <slot name="icon">
        <Show when={props.icon}>
          {renderIcon(props.icon, { class: 'size-4 shrink-0', imgClass: 'size-4 shrink-0', spanClass: 'inline-flex size-4 shrink-0 items-center justify-center', ariaHidden: true })}
        </Show>
      </slot>
      <Show when={!iconOnly()}>
        <slot ref={slotted.ref} />
      </Show>
      <Show when={props.iconTrailing && !iconOnly()}>
        {renderIcon(props.iconTrailing, { class: 'size-4 shrink-0 opacity-60', imgClass: 'size-4 shrink-0', spanClass: 'inline-flex size-4 shrink-0 items-center justify-center', ariaHidden: true })}
      </Show>
    </Button>
    </>
  );
});
