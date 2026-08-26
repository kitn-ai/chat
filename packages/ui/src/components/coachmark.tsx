import { createSignal, createUniqueId, createEffect, onCleanup, Show, type Accessor, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { X } from 'lucide-solid';
import type { Placement } from '@floating-ui/dom';
import { cn } from '../utils/cn';
import { useChatConfig } from '../primitives/chat-config';
import { createPresence, usePosition } from '../ui/overlay';

/** Imperative open controller, handed to the kai-coachmark facade via
 *  `controllerRef` so it can drive/observe open state with `wireDisclosure`. */
export interface CoachmarkController {
  open: Accessor<boolean>;
  setOpen: (v: boolean) => void;
}

export interface CoachmarkProps {
  /** The anchor/trigger (the default slot). The bubble is positioned against it. */
  children?: JSX.Element;
  /** The bubble body text (the `content` slot). */
  content?: JSX.Element;
  /** The bold title. NOT `title` — that is a reserved IDL attr (see define.tsx). */
  headline?: JSX.Element;
  /** A small badge pill (e.g. "New"). */
  badge?: JSX.Element;
  /** Floating placement relative to the anchor. Defaults to `'bottom'`. */
  placement?: Placement;
  /** Color tone: `primary` (default, theme accent), `info` (blue), `success`
   *  (green), `warning` (amber), or `error` (red) — reusing the kit's tool hues. */
  tone?: 'primary' | 'info' | 'success' | 'warning' | 'error';
  /** Controlled open state. When set, the component never changes it itself;
   *  drive it from `onOpenChange`. Omit for uncontrolled (internal) state. */
  open?: boolean;
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean;
  /** Fires whenever open wants to change (the × button / a method). */
  onOpenChange?: (open: boolean) => void;
  /** Dismiss intent: the × button. */
  onDismiss?: () => void;
  /** Render the arrow that points at the anchor. Defaults to `true`; set `false`
   *  for a plain bubble with no pointer. */
  arrow?: boolean;
  /** Receive the open controller once mounted. */
  controllerRef?: (api: CoachmarkController) => void;
}

/** Map a (post flip/shift) placement side to the bubble edge the arrow sits on. */
const STATIC_SIDE: Record<string, 'top' | 'bottom' | 'left' | 'right'> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/** DEFAULT bubble colors per `tone`. `info` is the blue onboarding look (white
 *  text). These seed the `--kai-coachmark-bg` / `--kai-coachmark-fg` custom
 *  properties. A consumer can override those in CSS (e.g. `kai-coachmark {
 *  --kai-coachmark-bg: var(--color-tool-blue) }`) to recolor the bubble, arrow,
 *  and text in one place, persistently, without touching `tone`. */
const TONE_DEFAULTS = {
  primary: { bg: 'var(--color-primary)', fg: 'var(--color-primary-foreground)' },
  info: { bg: 'var(--color-tool-blue)', fg: '#fff' },
  success: { bg: 'var(--color-tool-green)', fg: '#fff' },
  // Light amber surface + near-black foreground. --color-warning is a dark amber in
  // light mode (#935f06) and a bright amber in dark mode, both too saturated for
  // white/cream text at 85% opacity to hit 4.5:1. --color-warning-soft (14% warning
  // blended into the page background) gives a light tint in light mode and a dark
  // tint in dark mode; --color-foreground (near-black in light, near-white in dark)
  // provides >10:1 on the soft surface — still >>4.5:1 at text-current/85 opacity.
  warning: { bg: 'var(--color-warning-soft)', fg: 'var(--color-foreground)' },
  error: { bg: 'var(--color-tool-red)', fg: '#fff' },
} as const;

// The dismiss/badge/content sub-elements derive from the bubble's foreground via
// `currentColor` (which inherits the resolved `--kai-coachmark-fg`), so they
// follow the tone default OR any CSS override automatically (no per-tone class).
const DISMISS_CLS = 'text-current/70 hover:bg-current/15 hover:text-current';
const BADGE_CLS = 'bg-current/20';
const CONTENT_CLS = 'text-current/85';

/**
 * Coachmark is the presentational onboarding hint: a tinted bubble with an arrow,
 * anchored to a trigger. It wraps the anchor (the default slot) and positions the
 * bubble against it with `usePosition` (the shared Floating UI primitive) so the
 * arrow tracks the anchor on scroll/resize AND when a sibling reflows it,
 * flipping/shifting to stay on screen. The developer owns when it shows
 * (`open`/`default-open`); the ×, Escape, OR clicking the trigger fires
 * `onDismiss`. Color comes from `--kai-coachmark-bg` / `--kai-coachmark-fg` (each
 * defaulting to the `tone` palette), so a consumer can recolor purely in CSS; the
 * arrow reads the same bg var so it always continues the bubble.
 */
export function Coachmark(props: CoachmarkProps) {
  const config = useChatConfig();
  const tone = () => TONE_DEFAULTS[props.tone ?? 'primary'];
  const titleId = createUniqueId();
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false);
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  const [bubble, setBubble] = createSignal<HTMLElement>();
  const [arrowEl, setArrowEl] = createSignal<HTMLElement>();

  const isControlled = () => props.open !== undefined;
  const isOpen = () => (isControlled() ? !!props.open : internalOpen());
  const setOpen = (v: boolean) => {
    if (!isControlled()) setInternalOpen(v);
    props.onOpenChange?.(v);
  };

  props.controllerRef?.({ open: isOpen, setOpen });

  const presence = createPresence(isOpen);
  const position = usePosition(anchor, bubble, {
    placement: props.placement ?? 'bottom',
    gutter: 10,
    arrowEl,
    // Anchor removed from the DOM -> close so the bubble portal doesn't orphan.
    onDisconnect: () => setOpen(false),
  });

  // The bubble edge the arrow sits on, derived from the resolved (post flip/shift)
  // placement.
  const arrowSide = () => STATIC_SIDE[position.pos().placement.split('-')[0]] ?? 'top';

  const dismiss = () => {
    setOpen(false);
    props.onDismiss?.();
  };

  // Clicking the trigger dismisses the hint (alongside the × and Escape): the
  // consumer engaged with what the hint points at, so it has done its job. A
  // native listener (not preventing default or stopping propagation) so the
  // trigger's own click still fires, and so it works for a slotted trigger in the
  // web component. Only acts while open so it never re-fires onDismiss when shut.
  createEffect(() => {
    const el = anchor();
    if (!el) return;
    const onClick = () => { if (isOpen()) dismiss(); };
    el.addEventListener('click', onClick);
    onCleanup(() => el.removeEventListener('click', onClick));
  });

  return (
    <>
      {/* The anchor wrapper. inline-FLEX (not inline-block) so it hugs the trigger
          it positions against WITHOUT the baseline strut: an inline-block sits on
          the host line box's baseline, which reserves descender space below it
          (line-height 24px), making the host ~6px taller than the trigger and
          anchoring the trigger to the top, so in a flex toolbar (items-center) the
          trigger renders a few px above the other controls. inline-flex +
          vertical-align:middle decouples from that baseline so the wrapper hugs the
          trigger's true height and stays centered. The trigger-click dismissal is
          wired as a NATIVE listener on this element (see the effect below) rather
          than a Solid-delegated onClick, so it also fires for a trigger projected
          through the <slot/> in the web component (Solid's delegation walks
          parentNode, which for slotted content stays in the light DOM and never
          reaches this shadow ancestor). */}
      <span ref={setAnchor} style={{ display: 'inline-flex', 'vertical-align': 'middle' }}>
        {props.children}
      </span>
      <Show when={presence.present()}>
        <Portal mount={config.portalMount()}>
          <div
            ref={(el) => { setBubble(el); presence.setRef(el); }}
            part="bubble"
            role="dialog"
            aria-labelledby={titleId}
            data-expanded={presence.state() === 'open' ? '' : undefined}
            data-closed={presence.state() === 'closed' ? '' : undefined}
            style={{
              position: 'fixed',
              left: `${position.pos().x}px`,
              top: `${position.pos().y}px`,
              visibility: position.hidden() ? 'hidden' : 'visible',
              // Color via CSS vars: defaults to the `tone` palette, overridable in
              // CSS. The text color is inherited by every child (dismiss/badge/
              // content read it through currentColor).
              background: `var(--kai-coachmark-bg, ${tone().bg})`,
              color: `var(--kai-coachmark-fg, ${tone().fg})`,
            }}
            class={cn(
              'z-50 w-64 rounded-lg p-3 pr-8 text-sm kai-elevation',
              'animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
            )}
          >
            {/* The arrow: a rotated square inheriting the bubble bg. usePosition
                writes its offset-axis position (x for top/bottom placements, y for
                left/right); the static side (`-4px`) pins it to the bubble edge
                facing the anchor so it pokes out as a pointer.

                Each side is an EXPLICIT, static key. Do NOT collapse this to a
                computed `[arrowSide()]: '-4px'` key: Solid compiles `style={{…}}`
                object literals to per-property setStyleProperty calls at build time
                and silently DROPS dynamic/computed keys, so the offset never
                reaches the DOM and the arrow sinks into the bubble's padding box
                (invisible against the matching background). */}
            <Show when={props.arrow !== false}>
              <div
                ref={setArrowEl}
                part="arrow"
                aria-hidden="true"
                class="absolute size-2 rotate-45"
                style={{
                  left: arrowSide() === 'left' ? '-4px'
                    : position.arrowPos().x != null ? `${position.arrowPos().x}px` : '',
                  top: arrowSide() === 'top' ? '-4px'
                    : position.arrowPos().y != null ? `${position.arrowPos().y}px` : '',
                  right: arrowSide() === 'right' ? '-4px' : '',
                  bottom: arrowSide() === 'bottom' ? '-4px' : '',
                  // Same bg var as the bubble so the arrow always reads as part of it.
                  background: `var(--kai-coachmark-bg, ${tone().bg})`,
                }}
              />
            </Show>

            <button
              type="button"
              part="dismiss"
              aria-label="Dismiss"
              onClick={dismiss}
              class={cn('absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded transition-colors', DISMISS_CLS)}
            >
              <X class="size-3.5" aria-hidden="true" />
            </button>

            <Show when={props.headline}>
              <div class="flex items-center gap-2">
                <span id={titleId} part="title" class="font-semibold leading-tight">
                  {props.headline}
                </span>
                <Show when={props.badge}>
                  <span
                    part="badge"
                    class={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-micro font-medium uppercase leading-none tracking-wide', BADGE_CLS)}
                  >
                    {props.badge}
                  </span>
                </Show>
              </div>
            </Show>

            <Show when={props.content}>
              <div class={cn(CONTENT_CLS, props.headline ? 'mt-1.5' : '')}>
                {props.content}
              </div>
            </Show>
          </div>
        </Portal>
      </Show>
    </>
  );
}
