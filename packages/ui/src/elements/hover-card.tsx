import { createSignal } from 'solid-js';
import { type Placement } from '@floating-ui/dom';
import { HoverCardRoot, HoverCardTrigger, HoverCardContent, type HoverCardController } from '../ui/hover-card';
import { defineWebComponent } from './define';
import { wireDisclosure } from './disclosure';

interface Props extends Record<string, unknown> {
  /** Delay (ms) before the card opens on hover. Defaults to 0 (focus opens it
   *  immediately too). */
  openDelay?: number;
  /** Delay (ms) before it closes after the pointer leaves. Defaults to 300. */
  closeDelay?: number;
  /** Preferred placement: `'top' | 'bottom' | 'left' | 'right'` (+ optional
   *  `-start`/`-end`). Defaults to `'bottom'`; flips to stay in view. */
  placement?: string;
  /** Drive/observe open state (Shoelace-style: settable + reflected to the `open`
   *  attribute, the element still self-manages on hover). Set `el.open = true`,
   *  or `<kai-hover-card open>`; listen for `kai-open-change`. */
  open?: boolean;
  /** Initial open state on mount (uncontrolled seed). */
  defaultOpen?: boolean;
  /** Suppress the hover behavior entirely without unmounting. */
  disabled?: boolean;
}

/** Events fired by `<kai-hover-card>`. */
interface Events {
  /** The card opened or closed (by hover/focus, outside-click, or a method). */
  'kai-open-change': { open: boolean };
}

/**
 * `<kai-hover-card>` — reveals RICH content on hover/focus of a trigger (the
 * markup-carrying sibling of the text-only `<kai-tooltip>`). Put the trigger as
 * default light-DOM content and the card body in `slot="card"`. The card is
 * portaled + positioned inside the shadow root, with a transparent hover bridge
 * so the pointer can travel into it.
 *
 * ```html
 * <kai-hover-card>
 *   <a href="#">@acme</a>
 *   <div slot="card">
 *     <strong>Acme Corp</strong>
 *     <p>Workspace · 24 members</p>
 *   </div>
 * </kai-hover-card>
 * ```
 */
defineWebComponent<Props, Events>('kai-hover-card', {
  openDelay: undefined,
  closeDelay: undefined,
  placement: undefined,
  open: undefined,
  defaultOpen: undefined,
  disabled: undefined,
}, (props, ctx) => {
  const { flag } = ctx;
  // V2-PORT: a reactive signal, not a plain `let` — the disclosure/controller
  // effects track it, and ownedWrite sanctions the synchronous hand-up from
  // the primitive's body (see elements/tool.tsx, the same fix).
  const [api, setApi] = createSignal<HoverCardController | undefined>(undefined, { ownedWrite: true });

  // The standard overlay surface: settable+reflecting `open`, kai-open-change,
  // show/hide/toggle, disabled-gating. See ./disclosure.
  wireDisclosure(ctx, api, () => props.open);

  return (
    <>
      <style>{':host{display:inline-block}'}</style>
      <HoverCardRoot
        openDelay={props.openDelay != null ? Number(props.openDelay) : undefined}
        closeDelay={props.closeDelay != null ? Number(props.closeDelay) : undefined}
        defaultOpen={flag('defaultOpen')}
        disabled={flag('disabled')}
        controllerRef={(a) => setApi(a)}
      >
        <HoverCardTrigger><slot /></HoverCardTrigger>
        <HoverCardContent placement={(props.placement as Placement | undefined) ?? undefined}>
          <slot name="card" />
        </HoverCardContent>
      </HoverCardRoot>
    </>
  );
});
