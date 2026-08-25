import { createContext, useContext, createSignal, createUniqueId, Show, omit, onCleanup, type Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { Portal } from '@solidjs/web';
import { type Placement } from '@floating-ui/dom';
import { cn } from '../utils/cn';
import { useChatConfig } from '../primitives/chat-config';
import { createPresence, usePosition, useDismiss, As } from './overlay';

interface HoverCardCtx {
  open: Accessor<boolean>;
  enter: () => void;
  leave: () => void;
  close: () => void;
  setTrigger: (el: HTMLElement) => void;
  setContent: (el: HTMLElement) => void;
  trigger: Accessor<HTMLElement | undefined>;
  content: Accessor<HTMLElement | undefined>;
  /** Ties a focused trigger to the card it reveals. Without it a keyboard tab
   *  stop announces nothing, which is a focus stop that wastes the user's time. */
  contentId: string;
  /** Whether this card refuses to open. Read by the TRIGGER, not just by
   *  `enter()`: a card that cannot open must not be in the tab order either. */
  disabled: Accessor<boolean>;
}
// V2-PORT: v2's useContext THROWS when the resolved value is undefined; a `null`
// default restores the 1.x absent-provider behavior the consumers here handle.
const Ctx = createContext<HoverCardCtx | null>(null);
const useHoverCard = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('HoverCard parts must be used within <HoverCardRoot>');
  return c;
};

/** Imperative open controller, handed to a parent (e.g. the kai-hover-card facade)
 *  via `controllerRef` so it can drive/observe open state. */
export interface HoverCardController { open: Accessor<boolean>; setOpen: (v: boolean) => void; }

export interface HoverCardRootProps {
  children: JSX.Element;
  openDelay?: number;
  closeDelay?: number;
  /** Initial open state (uncontrolled seed). */
  defaultOpen?: boolean;
  /** When true, hover/focus never opens the card. */
  disabled?: boolean;
  /** Receive the open controller (open accessor + setOpen) once mounted. */
  controllerRef?: (api: HoverCardController) => void;
}

export function HoverCardRoot(props: HoverCardRootProps) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? false);
  const [trigger, setTrigger] = createSignal<HTMLElement>();
  const [content, setContent] = createSignal<HTMLElement>();
  const contentId = createUniqueId();
  let timer: number | undefined;
  props.controllerRef?.({ open, setOpen });

  // ONE shared timer drives both trigger and content. Entering either cancels
  // any pending close and schedules an open; leaving either cancels any pending
  // open and schedules a close. Because the pointer transit trigger -> content
  // fires leave() then enter() against the SAME timer, the close is cancelled
  // before it can run, so the card never flickers and there are no stale-timer
  // sporadics (the HC-1 fix).
  const enter = () => {
    if (props.disabled) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => setOpen(true), props.openDelay ?? 0);
  };
  const leave = () => {
    clearTimeout(timer);
    // closeDelay default is 300ms (Radix-style) as a belt-and-suspenders fallback
    // for diagonal pointer escapes that miss the transparent safe bridge.
    timer = window.setTimeout(() => setOpen(false), props.closeDelay ?? 300);
  };
  const close = () => { clearTimeout(timer); setOpen(false); };
  onCleanup(() => clearTimeout(timer));

  return (
    <Ctx value={{
      open, enter, leave, close,
      setTrigger, setContent,
      trigger, content,
      contentId,
      disabled: () => props.disabled ?? false,
    }}>
      {props.children}
    </Ctx>
  );
}

export interface HoverCardTriggerProps {
  children: JSX.Element;
  class?: string;
  /**
   * Whether the trigger is its own tab stop. Omit for the automatic behaviour,
   * which is right for every case in this repo: the trigger takes focus only
   * when nothing inside it already can.
   *
   * Pass `false` to keep a trigger out of the tab order entirely, or `true` to
   * force a stop. Both are escape hatches — reach for them when the automatic
   * answer is wrong, not to restate it.
   */
  focusable?: boolean;
}

/** Anything the platform puts in the tab order by default, plus anything a
 *  consumer opted in with `tabindex`. `tabindex="-1"` is deliberately excluded:
 *  it is programmatically focusable but the Tab key skips it, so a trigger
 *  containing only such an element still needs a stop of its own. */
const FOCUSABLE_CHILD =
  'a[href],button,input,select,textarea,summary,[contenteditable=""],[contenteditable="true"],[tabindex]:not([tabindex^="-"])';

/** Does this subtree already offer the keyboard a way in? Slotted content is
 *  checked through `assignedElements()`, because a `<slot>` in the shadow tree
 *  contains none of the light-DOM nodes it projects — the `kai-hover-card`
 *  facade wraps a bare `<slot />`, so without this branch every use of that
 *  element would be told its children are inert.
 *
 *  ★ WHEN this runs is as load-bearing as what it asks. At ref time the facade's
 *  trigger contains `<slot></slot>` with NOTHING assigned yet, so a single call
 *  from the ref answers "inert" for a slot that is about to receive a focusable
 *  `<a>` — and the trigger stamps a second tab stop on top of the child's. That
 *  is the very regression the `assignedElements()` branch was added to prevent,
 *  reintroduced by timing rather than by logic. Measured with a real Tab key:
 *  4 stops across a 3-widget fixture. So the caller re-runs this on
 *  `slotchange`; see `HoverCardTrigger`. */
const hasFocusableChild = (root: HTMLElement): boolean => {
  if (root.querySelector(FOCUSABLE_CHILD)) return true;
  return Array.from(root.querySelectorAll('slot')).some((slot) =>
    (slot as HTMLSlotElement).assignedElements().some(
      (el) => el.matches(FOCUSABLE_CHILD) || el.querySelector(FOCUSABLE_CHILD),
    ),
  );
};

/**
 * ★ THE TRIGGER IS A TAB STOP WHEN, AND ONLY WHEN, ITS CHILDREN ARE NOT.
 *
 * `onFocusIn`/`onFocusOut` were here from the start and the focus-open path was
 * plainly intended, but the span never set `tabindex`, so the Tab key could not
 * land on it and neither handler could fire on a keyboard. It went unnoticed for
 * as long as it did because `focusin` BUBBLES and every consumer at the time put
 * something focusable inside the trigger — `source.tsx` an `<a>`, `context.tsx`
 * a `<Button>` — so the card opened via the child and the span's own inertness
 * never showed. The first trigger with inert children (an attachment tile: a
 * div, an img, an svg) had no tab stop anywhere in it.
 *
 * Hence delegation rather than an unconditional `tabindex`: adding one always
 * would give every existing consumer TWO stops for one card, which is a worse
 * bug than the one being fixed. The check runs in the ref AND again on every
 * `slotchange`, because slot assignment happens after the ref and a one-shot
 * check calls a not-yet-filled `<slot>` inert (see `hasFocusableChild`).
 *
 * ★ THE FOCUS LISTENERS ARE NATIVE, NOT SOLID'S DELEGATED `onFocusIn`. Solid
 * delegates a fixed set of events from the document and retargets them into
 * component trees; inside these shadow roots that path runs for a PROGRAMMATIC
 * `.focus()` and, in the deeper trees, not for a real Tab. Measured: tabbing to
 * an attachment tile in a mounted `<kai-chat>` left the card shut and
 * `aria-describedby` null while `.focus()` on the same element opened it — so
 * every keyboard user got a tab stop that announced nothing and showed nothing,
 * which is worse than no stop at all. `addEventListener` in the ref does not
 * care how focus arrived. Anything in this kit relying on delegated focus
 * events inside a shadow root is suspect for the same reason.
 *
 * `aria-describedby` is what makes the stop worth arriving at: the card is
 * DESCRIPTIVE, not an action, so the trigger gets no `role="button"` — that
 * would promise an activation that does not exist — and instead points at the
 * content it reveals so a screen reader reads it out.
 */
export function HoverCardTrigger(props: HoverCardTriggerProps) {
  const ctx = useHoverCard();
  const [detectedInert, setDetectedInert] = createSignal(false);
  // `&& !disabled` last, and it beats an explicit `focusable` — a disabled card
  // early-returns out of `enter()`, so a stop here could never open anything.
  // Landing on it would announce nothing and reveal nothing, which is the dead
  // stop the note above argues against; forcing one is not an escape hatch
  // anybody should get.
  const isFocusable = () => (props.focusable ?? detectedInert()) && !ctx.disabled();

  // V2-PORT: ref callbacks are UNOWNED in v2, so `onCleanup` inside the ref below
  // silently no-ops (spike Q-D). Listener teardown registered from the ref lands in
  // this component-scoped list instead, drained at component disposal — the same
  // moment the old in-ref onCleanup ran (the trigger node is created once).
  const refDisposers: (() => void)[] = [];
  onCleanup(() => { for (const dispose of refDisposers) dispose(); refDisposers.length = 0; });

  return (
    <As
      as="span"
      class={cn(
        'inline-block',
        // A tab stop nobody can SEE is barely an improvement on no tab stop —
        // WCAG 2.4.7. Only when this element is the stop; a delegating trigger
        // must not draw a ring around its child's own focus state.
        //
        // AN OUTLINE, NOT A RING, and both halves of that were measured rather
        // than assumed:
        //
        //  1. ★ A TAILWIND v4 UTILITY THAT ROUTES THROUGH `@property` IS INERT
        //     INSIDE THESE SHADOW ROOTS, and that is a trap far wider than this
        //     line. v4 gives `--tw-*` custom properties their defaults with
        //     `@property`, and an `@property` rule delivered through a shadow
        //     root's `adoptedStyleSheets` never registers — so the var resolves
        //     to nothing, the declaration is invalid, and the property falls
        //     back to its initial value. Measured in Chrome, twice:
        //     `ring-2 ring-offset-1` set `--tw-ring-shadow` correctly and
        //     computed `box-shadow: none`; `inset-ring-2` did the same; and
        //     `outline-2` alone computed `outline-style: none` while width,
        //     colour and offset all landed, because only the style goes
        //     through `var(--tw-outline-style)`. Hence the literal
        //     `[outline-style:solid]` — the one part that cannot be a var.
        //  2. The offset is NEGATIVE so the outline lands inside the border
        //     box. A trigger that fills its container (`block size-full` inside
        //     the attachment tile's `overflow-hidden rounded-lg`) would
        //     otherwise have its focus indicator painted straight into the
        //     clip, and a trigger cannot know whether its container clips.
        isFocusable() &&
          'rounded-sm focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        props.class,
      )}
      ref={(el: HTMLElement) => {
        ctx.setTrigger(el);

        // Native listeners, deliberately — see the note above. `focusin` /
        // `focusout` rather than `focus` / `blur` because these have to fire
        // for a focusable CHILD too, and only the -in/-out pair bubbles.
        const enter = () => ctx.enter();
        const leave = () => ctx.leave();
        el.addEventListener('focusin', enter);
        el.addEventListener('focusout', leave);
        refDisposers.push(() => {
          el.removeEventListener('focusin', enter);
          el.removeEventListener('focusout', leave);
        });

        // Ask now for the direct-children case, and again whenever a slot is
        // filled or emptied. Both are needed: `slotchange` never fires for a
        // trigger with no slot in it, and the ref-time answer is wrong for one
        // that has.
        const evaluate = () => setDetectedInert(!hasFocusableChild(el));
        evaluate();
        for (const slot of Array.from(el.querySelectorAll('slot'))) {
          slot.addEventListener('slotchange', evaluate);
          refDisposers.push(() => slot.removeEventListener('slotchange', evaluate));
        }
      }}
      tabindex={isFocusable() ? 0 : undefined}
      aria-describedby={isFocusable() && ctx.open() ? ctx.contentId : undefined}
      onPointerEnter={ctx.enter}
      onPointerLeave={ctx.leave}
    >
      {props.children}
    </As>
  );
}

export interface HoverCardContentProps { children: JSX.Element; class?: string; placement?: Placement; }

// Visual gap between trigger and the visible card. Also the depth of the
// transparent safe bridge so the pointer never crosses "empty" space.
const GUTTER = 8;

/**
 * Returns the CSS padding property that, set to `gutter`px on the OUTER floating
 * shell, recreates the visual gap as a transparent safe area on the
 * trigger-facing side. The outer shell is placed flush (gutter: 0) so the
 * padding bridges the gap while keeping the inner card the same distance away.
 *
 * Placement strings from @floating-ui/dom (post flip/shift) may carry a
 * '-start'/'-end' alignment suffix; we split on '-' and key on the side.
 *   bottom* -> padding-top, top* -> padding-bottom,
 *   left*   -> padding-right, right* -> padding-left
 */
function gapPaddingStyle(placement: string, gutter: number): JSX.CSSProperties {
  const side = placement.split('-')[0];
  const prop: Record<string, keyof JSX.CSSProperties> = {
    bottom: 'padding-top',
    top: 'padding-bottom',
    left: 'padding-right',
    right: 'padding-left',
  };
  return { [prop[side] ?? 'padding-top']: `${gutter}px` };
}

export function HoverCardContent(props: HoverCardContentProps) {
  const ctx = useHoverCard();
  const config = useChatConfig();
  const presence = createPresence(ctx.open);
  // gutter: 0 places the outer shell flush with the trigger; the visual gap is
  // recreated by transparent padding (gapPaddingStyle) so the hit area bridges
  // it and a straight trigger->content transit never leaves a hot zone.
  const position = usePosition(ctx.trigger, ctx.content, {
    placement: props.placement ?? 'bottom',
    gutter: 0,
    // Trigger removed from the DOM -> close so the card portal doesn't orphan.
    onDisconnect: () => ctx.close(),
  });
  // Escape OR an outside click closes immediately — an outside click is a
  // deliberate dismiss, not a hover-out (which uses leave()'s grace delay).
  useDismiss({ enabled: ctx.open, onDismiss: () => ctx.close(), refs: () => [ctx.trigger(), ctx.content()] });

  return (
    <Show when={presence.present()}>
      <Portal mount={config.portalMount()}>
        {/* Outer shell: positioning + the transparent safe bridge + hot zone. */}
        <div
          ref={(el) => { ctx.setContent(el); presence.setRef(el); }}
          data-hovercard-content
          onPointerEnter={ctx.enter}
          onPointerLeave={ctx.leave}
          onFocusIn={ctx.enter}
          onFocusOut={ctx.leave}
          style={{
            position: 'fixed',
            left: `${position.pos().x}px`,
            top: `${position.pos().y}px`,
            background: 'transparent',
            visibility: position.hidden() ? 'hidden' : 'visible',
            ...gapPaddingStyle(position.pos().placement, GUTTER),
          }}
          class="z-50"
        >
          {/* Inner card: all visual + animation classes and the presence state. */}
          <div
            id={ctx.contentId}
            data-expanded={presence.state() === 'open' ? '' : undefined}
            data-closed={presence.state() === 'closed' ? '' : undefined}
            class={cn(
              'rounded-lg bg-card kai-elevation',
              'animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
              props.class,
            )}
          >
            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  );
}

export interface HoverCardProps { trigger: JSX.Element; children: JSX.Element; class?: string; openDelay?: number; closeDelay?: number; placement?: Placement; }

export function HoverCard(props: HoverCardProps) {
  // V2-PORT: splitProps with no rest half -> plain alias.
  const local = props;
  return (
    <HoverCardRoot openDelay={local.openDelay} closeDelay={local.closeDelay}>
      <HoverCardTrigger>{local.trigger}</HoverCardTrigger>
      <HoverCardContent class={cn('w-64 p-4', local.class)} placement={local.placement}>{local.children}</HoverCardContent>
    </HoverCardRoot>
  );
}
