import {
  createEffect, createSignal, createUniqueId, Show, untrack, type Accessor, type JSX,
} from 'solid-js';
import { MessageCircle, X } from 'lucide-solid';

/** Which corner the dock sits in. LOGICAL, so `-end` follows the writing direction
 *  and an RTL page docks on the left with no extra work (both reference
 *  implementations reached for `inset-inline-end` independently). */
export type DockPosition = 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start';

/** Where focus goes when the panel opens.
 *  - `content` (default) — `focus()` the first element assigned to the panel, falling
 *    back to the panel itself when that element cannot take focus. Content-AGNOSTIC:
 *    the dock never learns what it is holding.
 *  - `panel` — focus the `tabindex="-1"` panel container (what `kai-dialog` does).
 *  - `none` — never move focus. */
export type DockFocusOnOpen = 'content' | 'panel' | 'none';

/** Imperative open controller, handed to a parent (the `kai-dock` facade) via
 *  `controllerRef` so it can drive/observe open state with `wireDisclosure`. */
export interface DockController { open: Accessor<boolean>; setOpen: (v: boolean) => void }

export interface DockProps {
  /** The panel body. ANY content — the dock never reads or types it. */
  children?: JSX.Element;
  /** Content inside the built-in button while CLOSED. Defaults to a chat glyph. */
  launcher?: JSX.Element;
  /** Content inside the button while OPEN. Defaults to a ✕; when only `launcher` is
   *  given, that content stays rather than morphing into a clashing built-in. */
  launcherOpen?: JSX.Element;
  /** The widget's NAME. Derives the panel's accessible name and both launcher names
   *  (`Open ${label}` / `Close ${label}`) — one string instead of three. */
  label?: string;
  /** i18n override for the launcher's name while closed. */
  openLabel?: string;
  /** i18n override for the launcher's name while open. */
  closeLabel?: string;
  /** Which corner. Logical, RTL-correct. Defaults to `bottom-end`. */
  position?: DockPosition;
  /** Render the unread dot. CONSUMER-OWNED: shown only while closed, and never
   *  written back by the dock (see the component doc). */
  unread?: boolean;
  /** Disable the launcher. */
  disabled?: boolean;
  /** Suppress the dock's own built-in mobile `[part="close"]` X. Off (rendered) by
   *  default — the built-in X is the FALLBACK close route for panel content with no
   *  header of its own, which is the general case the dock has to cover since it
   *  never reads what it holds. Set `true` when the slotted/composed content
   *  supplies its own close affordance in its own header row (e.g. `ChatThread`'s
   *  `headerEndContent`) — with both present the two X's stack, one floating over
   *  the other's row, which is exactly the "doesn't look intentional" feedback this
   *  prop exists to let a caller avoid. */
  hideClose?: boolean;
  /** Where focus lands on open. Defaults to `content`. */
  focusOnOpen?: DockFocusOnOpen;
  /** Controlled open state. When set, the component never changes it itself — drive it
   *  from `onOpenChange`. Omit for uncontrolled (internal) state. */
  open?: boolean;
  /** Initial open state when uncontrolled. Does NOT move focus (see the focus contract). */
  defaultOpen?: boolean;
  /** Fires whenever the dock wants to open or close (launcher / Escape / a method). */
  onOpenChange?: (open: boolean) => void;
  /** Receive the open controller once mounted. */
  controllerRef?: (api: DockController) => void;
  /** Receive the focusable panel node so a facade's `focus()` can target it. */
  panelRef?: (el: HTMLElement) => void;
  /** Receive the launcher button so a facade's `focus()` can target it. */
  launcherRef?: (el: HTMLButtonElement) => void;
  /**
   * Resolve the element `focusOnOpen: 'content'` should focus.
   *
   * A PROP, because the answer is "the first element assigned to the panel slot" and
   * only the web-component facade can see slot assignments — a Solid caller passes
   * its own ref instead. Returning nothing falls back to focusing the panel.
   */
  contentTarget?: () => HTMLElement | null | undefined;
}

/** The built-in closed glyph. Exported so the facade can use it as its `launcher`
 *  slot's FALLBACK content — one definition, two users, rather than a second copy
 *  of the same icon choice living in the element layer. */
export function DockLauncherGlyph(): JSX.Element {
  return <MessageCircle size={24} />;
}

/** The built-in open glyph. Exported for the same reason as {@link DockLauncherGlyph}. */
export function DockCloseGlyph(): JSX.Element {
  return <X size={24} />;
}

/**
 * The dock's own stylesheet, scoped to its shadow root.
 *
 * IN A `<style>` RATHER THAN INLINE, and that is a decision. `kai-prompt-dock` puts
 * its tokenized chrome in an inline `style={{}}`, which resolves `var()` fallbacks
 * and lets an outside override win — but an inline declaration also beats every rule
 * in the cascade, and this element ships TWO rules that have to be able to win: the
 * narrow-viewport full-bleed default and the reduced-motion rule. Both are media
 * queries, which cannot be expressed inline at all. So the geometry lives here and
 * only the open/closed state (visibility / opacity / pointer-events) is inline, where
 * it belongs: that one must beat any consumer rule, and it is also the half a jsdom
 * test can actually read.
 *
 * EVERY RULE IS SCOPED UNDER `[data-kai-dock]`, including the `[part=...]` ones. Inside
 * a shadow root that scoping is redundant; in a plain Solid page it is the difference
 * between styling this dock and restyling every `[part="panel"]` on the document.
 *
 * DOCUMENTED CONSTRAINT, which the element cannot fix from inside: put `<kai-dock>`
 * as a body-level child. A `transform` / `filter` / `contain` ancestor makes
 * `position: fixed` resolve against that ancestor instead of the viewport.
 */
const DOCK_CSS = `
:host { display: contents; }

[data-kai-dock] {
  position: fixed;
  z-index: var(--kai-dock-z, 1000);
  display: flex;
  gap: var(--kai-dock-gap, 0.85rem);
  /* Only a positioning frame: it must not swallow clicks on the page it floats
     over. The launcher and the open panel opt back in. */
  pointer-events: none;
}

/* Logical insets throughout, so an RTL page docks on the other side for free.
   column-reverse for the bottom corners keeps the LAUNCHER FIRST IN DOM ORDER --
   Tab reaches the control before the panel content -- while painting it below. */
[data-kai-dock][data-position^="bottom"] {
  flex-direction: column-reverse;
  inset-block-end: var(--kai-dock-inset, 1.5rem);
}
[data-kai-dock][data-position^="top"] {
  flex-direction: column;
  inset-block-start: var(--kai-dock-inset, 1.5rem);
}
[data-kai-dock][data-position$="end"] {
  inset-inline-end: var(--kai-dock-inset, 1.5rem);
  align-items: flex-end;
}
[data-kai-dock][data-position$="start"] {
  inset-inline-start: var(--kai-dock-inset, 1.5rem);
  align-items: flex-start;
}

[data-kai-dock] [part="launcher"] {
  pointer-events: auto;
  position: relative;
  /* ABOVE the panel, always. At <=480px the panel goes fixed/inset:0 and it comes
     after the launcher in DOM order, so at z-index:auto it painted OVER the launcher
     and a touch user lost every pointer route to closing. Both reference
     implementations stacked the launcher over the panel for the same reason. The
     launcher itself is now HIDDEN while the panel is open at that width (see the
     <=480px block below) in favour of the in-panel [part="close"] X, but this
     z-index still matters for the moment between "open" landing and the panel's
     own transition finishing, and for any consumer CSS that reintroduces the
     launcher there. */
  z-index: 1;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  /* The size token is the BLOCK size and the inline MINIMUM, not a fixed square. An
     icon-only launcher is still a perfect disc (the icon plus padding is narrower
     than the minimum), but a slotted TEXT label — the reference app's "Support"
     pill — widens the button instead of overflowing it. */
  inline-size: auto;
  min-inline-size: var(--kai-dock-launcher-size, 56px);
  block-size: var(--kai-dock-launcher-size, 56px);
  padding-block: 0;
  padding-inline: 0.9rem;
  white-space: nowrap;
  border: 0;
  border-radius: 9999px;
  background: var(--color-primary);
  color: var(--color-primary-foreground);
  box-shadow: 0 10px 25px -6px rgb(0 0 0 / 0.35);
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
}
[data-kai-dock] [part="launcher"]:hover:not(:disabled) { transform: translateY(-1px); }
[data-kai-dock] [part="launcher"]:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
[data-kai-dock] [part="launcher"]:disabled { opacity: 0.55; cursor: not-allowed; }

/* The mobile-only close affordance rendered INSIDE the panel. Hidden by default and
   only switched on inside the <=480px media block below, alongside the rule that
   hides the launcher while the panel is open at that width — same query drives both,
   CSS-only, no JS viewport logic. Absolutely positioned against the panel, which is
   the panel's own containing block once the narrow-viewport rule below sets it to
   position: fixed.

   The inset is a CONSUMER-OVERRIDABLE TOKEN, same idiom as every other geometry
   value in this file (--kai-dock-width and friends). The dock is content-agnostic —
   it never reads what is slotted into the panel — so it cannot know whether that
   content renders its own trailing controls (a ChatThread header-end slot with
   share/settings icons, say) in the same top-right corner.

   An earlier version of this rule had the mobile block below reserve a BAND of the
   panel's own padding above whatever was slotted, sized to this button's own
   footprint, so nothing painted under the X. Owner feedback on the real widget: the
   band read as a dead empty strip with a lone X floating in it -- "that doesn't
   look like the empty component either, lets do better" -- worse than the
   collision it fixed. The actual fix composes instead of reserving space: ChatThread
   now has its own headerEndContent escape hatch (see its prop doc) so a caller puts
   the close control INSIDE the header row, sharing it with the title -- zero
   collision by construction. hideClose on this component (see its prop doc) then
   suppresses this built-in X for exactly that case. What remains here is the
   FALLBACK: a plain absolute overlay, top-right of the panel, for content with no
   header of its own to hold a close control -- and these tokens are there for the
   rare case it should deliberately sit in front of something (e.g. a single small
   badge). */
[data-kai-dock] [part="close"] {
  display: none;
  position: absolute;
  inset-block-start: var(--kai-dock-close-inset-block, 0.75rem);
  inset-inline-end: var(--kai-dock-close-inset-inline, 0.75rem);
  z-index: 1;
  align-items: center;
  justify-content: center;
  inline-size: 2.25rem;
  block-size: 2.25rem;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: var(--color-background);
  color: var(--color-foreground);
  box-shadow: 0 2px 8px -2px rgb(0 0 0 / 0.3);
  cursor: pointer;
}
[data-kai-dock] [part="close"]:hover { background: var(--color-muted, var(--color-background)); }
[data-kai-dock] [part="close"]:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }

[data-kai-dock] [part="badge"] {
  position: absolute;
  inset-block-start: 3px;
  inset-inline-end: 3px;
  inline-size: 0.75rem;
  block-size: 0.75rem;
  border-radius: 9999px;
  background: var(--color-destructive);
  box-shadow: 0 0 0 2px var(--color-primary);
}

[data-kai-dock] [part="panel"] {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  inline-size: var(--kai-dock-width, 380px);
  block-size: var(--kai-dock-height, 600px);
  max-inline-size: calc(100vw - 2 * var(--kai-dock-inset, 1.5rem));
  max-block-size: calc(
    100dvh - 2 * var(--kai-dock-inset, 1.5rem)
    - var(--kai-dock-launcher-size, 56px) - var(--kai-dock-gap, 0.85rem)
  );
  border: 1px solid var(--color-border);
  border-radius: var(--kai-dock-radius, 16px);
  background: var(--color-background);
  color: var(--color-foreground);
  box-shadow: 0 20px 45px -12px rgb(0 0 0 / 0.35);
  /* VISIBILITY IS SWITCHED, NEVER ANIMATED, and the zero duration is the whole point.
     visibility 180ms here meant the COMPUTED value stayed hidden for about two
     frames after opening while the inline style already said visible — and a
     focus() into a hidden subtree is dropped silently, so focusOnOpen never landed
     in a real browser (it worked under reduced motion, which is what made it look like
     a focus bug rather than a paint one).
     This rule is the CLOSING direction: hold visibility for the length of the fade so
     the panel does not vanish mid-transition, then switch. The opening direction sets
     the delay to 0s below, so opening is synchronous and focus has somewhere to go. */
  transition: opacity 180ms ease, transform 180ms ease, visibility 0s linear 180ms;
}
[data-kai-dock] [part="panel"][data-expanded] {
  transition: opacity 180ms ease, transform 180ms ease, visibility 0s linear 0s;
}
/* The panel is a flex column and the slotted surface fills it -- the one layout
   fact both reference implementations wrote by hand (flex:1; min-height:0). Both
   spellings are here on purpose: ::slotted covers the shadow-DOM facade, > *
   covers a plain Solid caller, and each is inert in the other's world (a <slot>
   is display:contents, so flex properties do nothing to it). */
[data-kai-dock] [part="panel"] ::slotted(*) { flex: 1 1 auto; min-block-size: 0; }
[data-kai-dock] [part="panel"] > * { flex: 1 1 auto; min-block-size: 0; }
[data-kai-dock] [part="panel"]:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
[data-kai-dock][data-position^="bottom"] [part="panel"][data-closed] { transform: translateY(0.5rem); }
[data-kai-dock][data-position^="top"] [part="panel"][data-closed] { transform: translateY(-0.5rem); }

/* Narrow viewports take the panel full-bleed. A SHIPPED DEFAULT, not a prop: both
   references wrote this rule independently, which makes it a HOW. While the panel is
   OPEN at this width the launcher hides and the panel's own [part="close"] X becomes
   the pointer close route instead — a FAB floating over a full-bleed panel read as
   wrong (owner feedback) and Escape alone strands a touch user with no visible
   affordance at all. Closed, the launcher is unaffected: it is the panel's own
   [data-expanded] state that gates both rules below, not the media query alone. */
@media (max-width: 480px) {
  [data-kai-dock] [part="panel"] {
    position: fixed;
    inset: 0;
    inline-size: auto;
    block-size: auto;
    max-inline-size: none;
    max-block-size: none;
    border: 0;
    border-radius: 0;
  }

  /* The full-bleed panel gets its own close affordance instead of relying on the
     launcher, which is hidden below while the panel is open at this width — a FAB
     floating over a full-bleed panel with no other visible close route is exactly
     what the owner flagged. Escape and the X both still work; the launcher comes
     back the instant the panel closes because data-expanded is gone by then.
     Absolutely positioned, so it overlays rather than shifting the panel's
     in-flow content — the FALLBACK route for content with no header of its own
     (see the [part="close"] comment above). Content that supplies its own close
     control passes hideClose, which drops the button from the render tree
     entirely (see the component body) rather than being gated here — so this
     rule stays a plain, unconditional width-query switch. */
  [data-kai-dock] [part="close"] { display: inline-flex; }
  [data-kai-dock]:has([part="panel"][data-expanded]) [part="launcher"] { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  /* [data-expanded] is listed explicitly because the open-direction rule above is
     MORE SPECIFIC than a bare [part="panel"], so without it an opening panel kept
     animating opacity and transform for exactly the users who asked it not to. */
  [data-kai-dock] [part="launcher"],
  [data-kai-dock] [part="panel"],
  [data-kai-dock] [part="panel"][data-expanded] { transition: none; }
  [data-kai-dock] [part="panel"][data-closed] { transform: none; }
}
`;

/**
 * The deepest active element, drilling through nested shadow roots.
 *
 * A local copy of the helper `ui/dialog.tsx` already carries. Deliberately not
 * refactored into a shared module by this change: dialog is not this task's file, and
 * a four-line tree walk duplicated once is cheaper than a cross-file move nobody
 * asked for. If a third caller appears, hoist it then.
 */
function deepActiveElement(): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
  return el;
}

/**
 * Is `node` inside `root` in the FLATTENED tree?
 *
 * `root.contains(node)` is the wrong question here and would answer `false` for every
 * real case: the panel's content is light-DOM nodes ASSIGNED to a slot, so it lives in
 * the host's tree, not the panel's. This walks up through `assignedSlot` at each slot
 * and through `host` at each shadow boundary, which is the tree focus actually moves in.
 */
function isWithin(root: Node, node: Node | null): boolean {
  let cur: Node | null = node;
  while (cur) {
    if (cur === root) return true;
    const slot = cur instanceof Element ? cur.assignedSlot : null;
    if (slot) { cur = slot; continue; }
    if (cur.parentNode) { cur = cur.parentNode; continue; }
    cur = cur instanceof ShadowRoot ? cur.host : null;
  }
  return false;
}

/**
 * Dock — a corner-docked launcher button with a panel that opens above it.
 *
 * The affordance behind a support widget: a circular button pinned to a corner of the
 * viewport, and a floating panel holding whatever you slot into it. The panel is
 * content-agnostic on purpose — a chat, a form, your own component — and the dock
 * never reads, types or reaches into it.
 *
 * WHAT IT OWNS (all of it non-configurable, because these are facts about the medium
 * rather than preferences):
 *
 * - **Hide semantics.** Closed means `visibility: hidden` + `opacity: 0` + `inert`,
 *   and the panel is NEVER unmounted. `display: none` would leave the panel with no
 *   layout box while closed, so anything inside that measures itself — a thread
 *   scroller, a `ResizeObserver` — measures zero and re-measures on every open. The
 *   cost of keeping the box is that a stream keeps rendering into a closed panel,
 *   which is precisely what makes an unread dot honest.
 * - **Focus.** On open, focus moves per `focusOnOpen`; on close it returns to the
 *   launcher, always. `inert` is cleared and visibility restored BEFORE `focus()` runs
 *   — a `focus()` into an inert or hidden subtree is silently dropped, no error — via
 *   a `queueMicrotask`, the same shape `ui/dialog.tsx` uses. Mount moves no focus.
 * - **Escape.** Closes only while the dock CONTAINS focus, and never stops the event.
 *   A background widget that ate every Escape on the page would break the host page's
 *   own menus; swallowing a key from a page you are a guest on is a decide-quietly move.
 * - **No focus trap**, deliberately, unlike `kai-dialog`. The page staying usable is
 *   the whole point of "docked", which is also why the panel is `aria-modal="false"`.
 * - **Mobile close route.** At <=480px the panel goes full-bleed and the launcher
 *   hides while it is open — a floating launcher over a full-bleed panel is not an
 *   obvious close affordance. The panel gets its own `[part="close"]` X, top-right,
 *   CSS-gated by the SAME media query and `[data-expanded]`, so it needs no viewport
 *   JS. Desktop is unaffected: the launcher keeps toggling and no X ever renders.
 *   This is the FALLBACK route, for panel content with no header of its own to hold
 *   a close control — content that does (a `ChatThread` using `headerEndContent`,
 *   say) passes `hideClose` to drop this X instead of stacking a second one over
 *   its own header row.
 *
 * WHAT IT REFUSES: it never aborts a request, never persists its own open state, never
 * decides what "unread" means, and never clears `unread` on open — writing over a
 * consumer's prop is the trap `kai-chat.loading` fell into. Those are the app's calls;
 * `open` + `onOpenChange` is the seam.
 *
 * Geometry is CSS custom properties rather than props: `--kai-dock-width` ·
 * `--kai-dock-height` · `--kai-dock-inset` · `--kai-dock-gap` · `--kai-dock-radius` ·
 * `--kai-dock-z` · `--kai-dock-launcher-size`.
 *
 * @see `elements/dock.tsx` for the `<kai-dock>` web-component facade.
 */
export function Dock(props: DockProps) {
  const panelId = `kai-dock-panel-${createUniqueId()}`;
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false);

  const isControlled = () => props.open !== undefined;
  const isOpen = () => (isControlled() ? !!props.open : internalOpen());
  const setOpen = (v: boolean) => {
    if (!isControlled()) setInternalOpen(v);
    props.onOpenChange?.(v);
  };

  props.controllerRef?.({ open: isOpen, setOpen });

  let panel: HTMLElement | undefined;
  let launcher: HTMLButtonElement | undefined;

  const label = () => props.label ?? 'Chat';
  const launcherName = () => (isOpen()
    ? props.closeLabel ?? `Close ${label()}`
    : props.openLabel ?? `Open ${label()}`);

  /** The focus half of an open, deferred so the state flip above has already landed. */
  const focusOnOpen = () => {
    const mode = props.focusOnOpen ?? 'content';
    if (mode === 'none') return;
    if (mode === 'content') {
      const target = props.contentTarget?.();
      target?.focus();
      // Content-agnostic fallback: a plain <div> is not focusable, so `focus()` was a
      // silent no-op and the panel takes it instead. Asking where focus ACTUALLY
      // landed is the only way to tell, since the dock is not allowed to inspect what
      // it is holding.
      if (target && isWithin(panel!, deepActiveElement())) return;
    }
    panel?.focus();
  };

  // The focus choreography, and the ONE ordering that is a hard invariant.
  //
  // SEEDED WITH THE INITIAL OPEN VALUE, not `false`. `kai-dialog` seeds `false` on
  // purpose so a `defaultOpen` modal DOES take focus at mount; a docked widget is the
  // opposite — it is a guest on someone's page and must not steal focus on load, from
  // `default-open` OR from `open`. Same mechanism, opposite default, and the
  // difference is exactly the modal/non-modal split.
  createEffect((wasOpen: boolean) => {
    const open = isOpen();
    if (open !== wasOpen) {
      // The attributes and inline styles below are written by render effects, which
      // Solid runs before this one; the microtask is belt-and-braces for a state
      // change driven from outside a Solid batch, and gives a freshly-slotted element
      // a turn to upgrade before we call focus() on it.
      if (open) queueMicrotask(focusOnOpen);
      else queueMicrotask(() => launcher?.focus());
    }
    return open;
  }, untrack(() => props.open ?? props.defaultOpen ?? false));

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    // D-C. This listener is ON the dock rather than on `document`, so the only
    // keydowns it can ever see are ones whose target is inside it — which IS the
    // condition "the dock contains focus", with no ambiguity and no second check. It
    // also composes: an overlay inside the panel that handles its own Escape and
    // stops the event correctly prevents the dock from closing underneath it.
    // No stopPropagation, no preventDefault: the host page keeps its key.
    setOpen(false);
  };

  return (
    <>
      <style>{DOCK_CSS}</style>
      <div data-kai-dock data-position={props.position ?? 'bottom-end'} onKeyDown={onKeyDown}>
        <button
          ref={(el) => { launcher = el; props.launcherRef?.(el); }}
          part="launcher"
          type="button"
          aria-expanded={isOpen() ? 'true' : 'false'}
          aria-controls={panelId}
          // The NAME is what changes for assistive tech; the glyph morph is decorative.
          aria-label={launcherName()}
          disabled={props.disabled || undefined}
          onClick={() => setOpen(!isOpen())}
        >
          <Show when={props.unread && !isOpen()}>
            <span part="badge" aria-hidden="true" />
          </Show>
          <span aria-hidden="true" style={{ display: 'inline-flex' }}>
            <Show when={isOpen()} fallback={props.launcher ?? <DockLauncherGlyph />}>
              {props.launcherOpen ?? props.launcher ?? <DockCloseGlyph />}
            </Show>
          </span>
        </button>
        <div
          ref={(el) => { panel = el; props.panelRef?.(el); }}
          part="panel"
          id={panelId}
          role="dialog"
          // Non-modal, and saying so is load-bearing given there is no focus trap:
          // claiming modality without trapping is worse than claiming neither.
          aria-modal="false"
          aria-label={label()}
          tabindex={-1}
          data-expanded={isOpen() ? '' : undefined}
          data-closed={isOpen() ? undefined : ''}
          // `inert` is the half that actually stops Tab: a visibility:hidden panel is
          // already skipped by most AT, but a focusable control inside it is not.
          bool:inert={!isOpen()}
          // INLINE, unlike the geometry: the closed state must beat any consumer rule,
          // and it is the half a test can read without a layout engine.
          style={{
            visibility: isOpen() ? 'visible' : 'hidden',
            opacity: isOpen() ? '1' : '0',
            'pointer-events': isOpen() ? 'auto' : 'none',
          }}
        >
          {/* Mobile-only (see the <=480px rule in DOCK_CSS): the full-bleed panel's
              own close affordance, since the launcher is hidden by the same query
              while the panel is open. Reuses the launcher's derived close name
              rather than a new prop — same string, same i18n override. Dropped
              from the render tree entirely (not just hidden) when `hideClose` is
              set — the panel content supplies its own, in its own header, and a
              second X floating over that row is the exact "doesn't look
              intentional" feedback `hideClose` exists to avoid. */}
          <Show when={!props.hideClose}>
            <button type="button" part="close" aria-label={launcherName()} onClick={() => setOpen(false)}>
              <DockCloseGlyph />
            </button>
          </Show>
          {props.children}
        </div>
      </div>
    </>
  );
}
