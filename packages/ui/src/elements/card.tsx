import { createSignal, onCleanup, onSettled } from 'solid-js';
import { defineWebComponent } from './define';
import { Card, type CardAppearance, type CardOrientation } from '../ui/card';

interface Props extends Record<string, unknown> {
  /** Surface treatment: `outlined` (default) | `filled` | `plain` | `accent`.
   *  Attribute: `appearance`. */
  appearance?: CardAppearance;
  /** `vertical` (default, media on top) | `horizontal` (media at the start) |
   *  `responsive` (horizontal when the card's container is wide enough, else vertical,
   *  via a container query on the card's own width). Attribute: `orientation`. */
  orientation?: CardOrientation;
  /** The card width below which a `responsive` card collapses to vertical and the
   *  footer actions stack. A CSS length; default `28rem`. Attribute: `collapse`. */
  collapse?: string;
  /** Tighter spacing for dense lists. Attribute: `dense`. */
  dense?: boolean;
  /** Show a close (×) that hides the card and emits `kai-dismiss`. Attribute:
   *  `dismissible`. Off by default. */
  dismissible?: boolean;
  /** Render the whole card as a link. Attribute: `href`. Wins over `clickable`. */
  href?: string;
  /** `target` for the `href` anchor. Attribute: `target`. */
  target?: string;
  /** `rel` for the `href` anchor. Attribute: `rel`. */
  rel?: string;
  /** Make the whole card a button (`role="button"`, Enter/Space, hover affordance)
   *  that emits `kai-card-click`. Attribute: `clickable`. Ignored when `href` is set. */
  clickable?: boolean;
}

/** Events fired by `<kai-card>`. */
interface Events {
  /** The card was dismissed via its × (it also hides itself). */
  'kai-dismiss': void;
  /** A `clickable`/`href` card was activated (click, or Enter/Space). */
  'kai-card-click': void;
}

/** The named slots whose occupancy gates a card region. An empty `<slot>` is
 *  always a truthy node, so the facade tracks which are actually filled and only
 *  passes those regions to the primitive. */
const SLOT_NAMES = ['media', 'header', 'header-actions', 'footer', 'footer-actions'] as const;
type SlotName = (typeof SLOT_NAMES)[number];

/**
 * `<kai-card>` — the kit's presentational card, modeled on the WebAwesome card:
 * ONE element whose flexibility comes from a few structural slots, `appearance`
 * and `orientation` variants, themeable `::part`s, and a single
 * `--kai-card-spacing` knob. The title/description are not slots — they are body
 * (default slot) or `slot="header"` content you mark up yourself.
 *
 * Slots: `media` (full-bleed image/video/illustration), `header` + `header-actions`,
 * the default slot (body), `footer` + `footer-actions`.
 *
 * Behaviors (all OFF by default): `dismissible` (× → `kai-dismiss`), and
 * `href`/`clickable` (whole card a link/button → `kai-card-click`). A
 * clickable/href card must NOT also contain action buttons.
 *
 * ```html
 * <kai-card appearance="filled" dismissible>
 *   <div slot="media"><img src="…" alt="…" /></div>
 *   <h3 slot="header">2× usage</h3>
 *   Do more with a higher session limit.
 *   <kai-button slot="footer-actions">Start task</kai-button>
 * </kai-card>
 * ```
 */
defineWebComponent<Props, Events>('kai-card', {
  appearance: 'outlined',
  orientation: 'vertical',
  collapse: '28rem',
  dense: false,
  dismissible: false,
  href: undefined,
  target: undefined,
  rel: undefined,
  clickable: false,
}, (props, { element, dispatch, flag }) => {
  // Track which named slots are filled, plus whether the default slot (body) has
  // any content. Re-read on child mutations so streamed/late content lights up
  // its region. An unfilled region is never rendered (no stray padding/divider).
  const [filled, setFilled] = createSignal<Record<SlotName, boolean>>({
    'media': false, 'header': false, 'header-actions': false, 'footer': false, 'footer-actions': false,
  });
  const [hasBody, setHasBody] = createSignal(false);

  onSettled(() => {
    const read = () => {
      const next = {} as Record<SlotName, boolean>;
      for (const name of SLOT_NAMES) next[name] = !!element.querySelector(`:scope > [slot="${name}"]`);
      setFilled(next);
      // Body = any direct child without a slot attribute (element, or non-blank text).
      setHasBody(
        Array.from(element.childNodes).some(
          (n) =>
            (n.nodeType === Node.ELEMENT_NODE && !(n as Element).hasAttribute('slot')) ||
            (n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''),
        ),
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, characterData: true, subtree: true });
    // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return () => observer.disconnect();
  });

  const region = (name: SlotName) => (filled()[name] ? <slot name={name} /> : undefined);

  return (
    <Card
      appearance={props.appearance as CardAppearance}
      orientation={props.orientation as CardOrientation}
      collapse={props.collapse as string}
      dense={flag('dense')}
      dismissible={flag('dismissible')}
      href={props.href}
      target={props.target}
      rel={props.rel}
      clickable={flag('clickable')}
      onDismiss={() => dispatch('kai-dismiss')}
      onCardClick={() => dispatch('kai-card-click')}
      media={region('media')}
      header={region('header')}
      headerActions={region('header-actions')}
      footer={region('footer')}
      footerActions={region('footer-actions')}
      hasBody={hasBody()}
    >
      <slot />
    </Card>
  );
});
