import { defineWebComponent } from './define';
import { Coachmark, type CoachmarkController } from '../components/coachmark';
import { wireDisclosure } from './disclosure';

interface Props extends Record<string, unknown> {
  /** Drive/observe open state (Shoelace-style: settable + reflected to the `open`
   *  attribute; the element still self-manages). Set `el.open = true`, or
   *  `<kai-coachmark open>`; listen for `kai-open-change`. */
  open?: boolean;
  /** Initial open state on mount (uncontrolled seed). */
  defaultOpen?: boolean;
  /** The bold title. Named `headline` because `title` collides with the global
   *  `HTMLElement.title` attribute (it throws at registration). */
  headline?: string;
  /** A small badge pill beside the headline (e.g. "New"). */
  badge?: string;
  /** Floating placement relative to the anchor (default `bottom`). */
  placement?: string;
  /** Color tone: `primary` (default, theme accent), `info` (blue), `success`
   *  (green), `warning` (amber), or `error` (red), reusing the kit's tool hues. */
  tone?: 'primary' | 'info' | 'success' | 'warning' | 'error';
  /** Render the arrow that points at the anchor (default `true`). Set
   *  `arrow="false"` for a plain bubble with no pointer. */
  arrow?: boolean;
}

/** Events fired by `<kai-coachmark>`. */
interface Events {
  /** The × dismiss button was pressed. The consumer records that this hint was
   *  seen so it won't show again. */
  'kai-dismiss': Record<string, never>;
  /** The coachmark opened or closed (a method, the ×, or a driven `open`). */
  'kai-open-change': { open: boolean };
}

/**
 * `<kai-coachmark>` — an anchored onboarding hint bubble with an arrow. It WRAPS
 * a trigger (the default slot) and points a primary-colored bubble at it: a small
 * `badge` pill, a bold `headline`, the `content` slot body, and a dismiss ×.
 *
 * ```html
 * <kai-coachmark default-open headline="Cowork has a new home" badge="New">
 *   <button>Cowork</button>
 *   <span slot="content">Chat with Claude or switch to Cowork from here.</span>
 * </kai-coachmark>
 * <script type="module">
 *   document.querySelector('kai-coachmark')
 *     .addEventListener('kai-dismiss', () => localStorage.setItem('cowork-hint', 'seen'));
 * </script>
 * ```
 *
 * Open state is the standard disclosure surface: settable+reflecting `open`,
 * `kai-open-change`, and `show()`/`hide()`/`toggle()`; seed with `default-open`.
 * Parts: `bubble` · `arrow` · `badge` · `title` · `dismiss`.
 */
defineWebComponent<Props, Events>('kai-coachmark', {
  open: undefined,
  defaultOpen: undefined,
  headline: undefined,
  badge: undefined,
  placement: undefined,
  tone: undefined,
  arrow: true,
}, (props, ctx) => {
  const { flag, dispatch } = ctx;
  let api: CoachmarkController | undefined;

  // The standard disclosure surface: settable+reflecting `open`, kai-open-change,
  // show/hide/toggle. See ./disclosure. This is the SOLE emitter of kai-open-change.
  wireDisclosure(ctx, () => api, () => props.open);

  // headline/badge are scalar string props (NOT slots) — pass through directly so
  // the component's own `Show when={…}` gating drives whether each region renders.
  // The body is the `content` slot; an empty `<slot>` renders nothing.
  return (
    <Coachmark
      defaultOpen={flag('defaultOpen')}
      arrow={flag('arrow')}
      placement={props.placement as never}
      tone={props.tone as 'primary' | 'info' | 'success' | 'warning' | 'error' | undefined}
      headline={props.headline as string | undefined}
      badge={props.badge as string | undefined}
      content={<slot name="content" />}
      controllerRef={(a) => (api = a)}
      onDismiss={() => dispatch('kai-dismiss', {})}
    >
      <slot />
    </Coachmark>
  );
});
