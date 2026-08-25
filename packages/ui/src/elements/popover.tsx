import { createSignal } from 'solid-js';
import { defineWebComponent } from './define';
import { Popover, type PopoverController } from '../ui/popover';
import { wireDisclosure } from './disclosure';
import type { Placement } from '@floating-ui/dom';

interface Props extends Record<string, unknown> {
  /** Floating placement relative to the trigger (floating-ui placement). */
  placement?: Placement;
  /** Gap in px between the trigger and the panel. */
  gutter?: number;
  /** Drive/observe open state (Shoelace-style: settable + reflected to the `open`
   *  attribute, the element still self-manages on click). Set `el.open = true`,
   *  or `<kai-popover open>`; listen for `kai-open-change`. */
  open?: boolean;
  /** Initial open state on mount (uncontrolled seed). */
  defaultOpen?: boolean;
  /** Turn the popover off while keeping the trigger mounted (clicks and `show()`
   *  no longer open it). */
  disabled?: boolean;
}

/** Events fired by `<kai-popover>`. */
interface Events {
  /** The popover opened or closed (click, Escape, outside-click, or a method). */
  'kai-open-change': { open: boolean };
}

/**
 * `<kai-popover>` — a button-and-popover primitive: a trigger that toggles a
 * floating panel of arbitrary content. The panel is a `role="dialog"` region
 * (not a menu), so it can hold model rows, toggle switches, nested groups, or
 * any markup — the building block for ChatGPT-style header menus and similar
 * "button + popover card" affordances.
 *
 * **How to use** — slot a trigger and the panel content:
 * ```html
 * <kai-popover placement="bottom-start">
 *   <button slot="trigger">ChatGPT ⌄</button>
 *   <div>
 *     <p><strong>GPT-5.5</strong> — Flagship model</p>
 *     <button>Legacy models</button>
 *   </div>
 * </kai-popover>
 * ```
 *
 * The default slot is the panel; the `trigger` slot is the control. Clicking the
 * trigger toggles the panel; Escape or an outside click closes it (clicks inside
 * the panel do not). It fires `kai-open-change` with `{ open }` on every change,
 * accepts an `open`/`defaultOpen` JS property, can be `disabled`, and exposes
 * `show()`/`hide()`/`toggle()` instance methods.
 */
defineWebComponent<Props, Events>('kai-popover', {
  placement: 'bottom-start',
  gutter: 6,
  open: undefined,
  defaultOpen: undefined,
  disabled: undefined,
}, (props, ctx) => {
  const { flag, element } = ctx;
  // V2-PORT: a reactive signal, not a plain `let` — the disclosure/controller
  // effects track it, and ownedWrite sanctions the synchronous hand-up from
  // the primitive's body (see elements/tool.tsx, the same fix).
  const [api, setApi] = createSignal<PopoverController | undefined>(undefined, { ownedWrite: true });

  // The standard overlay surface: settable+reflecting `open`, kai-open-change,
  // show/hide/toggle, disabled-gating. The sole source of kai-open-change — the
  // primitive's onOpenChange is intentionally NOT wired here to avoid a double
  // dispatch. See ./disclosure.
  wireDisclosure(ctx, api, () => props.open);

  return (
    <Popover
      trigger={<slot name="trigger" />}
      placement={props.placement as Placement}
      gutter={props.gutter}
      defaultOpen={flag('defaultOpen')}
      disabled={flag('disabled')}
      controllerRef={(a) => setApi(a)}
      boundary={() => element}
    >
      <slot />
    </Popover>
  );
});
