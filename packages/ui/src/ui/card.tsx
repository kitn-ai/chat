import { Show, omit, createSignal, createUniqueId } from 'solid-js';
import { mergeDefaults } from '../utils/merge-defaults'; // V2-PORT: 1.x mergeProps semantics (undefined does not override)
import type { JSX } from '@solidjs/web';
import { Dynamic } from '@solidjs/web';
import { cn } from '../utils/cn';
import { X } from 'lucide-solid';

export type CardAppearance = 'outlined' | 'filled' | 'plain' | 'accent';
/** `vertical` (media on top), `horizontal` (media at the start), or `responsive`
 *  (horizontal when the card's container is at least ~28rem wide, else vertical —
 *  a CSS container query on the card's own width, NOT the viewport). */
export type CardOrientation = 'vertical' | 'horizontal' | 'responsive';

/** Surface treatment. `outlined` (default) = bordered card; `filled` = a raised
 *  opaque surface; `plain` = no border/background (a padded region); `accent` =
 *  the bold primary fill (announcements). */
const APPEARANCE: Record<CardAppearance, string> = {
  outlined: 'border border-border bg-card text-card-foreground kai-elevation-sm',
  filled: 'border border-transparent bg-surface-strong text-card-foreground',
  plain: 'border border-transparent bg-transparent',
  accent: 'border border-transparent bg-primary text-primary-foreground',
};

export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Surface treatment: `outlined` | `filled` | `plain` | `accent`. */
  appearance?: CardAppearance;
  /** `vertical` (media on top) or `horizontal` (media at the start). */
  orientation?: CardOrientation;
  /** The card width below which a `responsive` card collapses to vertical and the
   *  footer action cluster stacks. A CSS length (e.g. `'24rem'`); default `'28rem'`.
   *  Container-query breakpoints can't be CSS variables, so this prop is baked into
   *  a per-card `@container` rule. */
  collapse?: string;
  /** Tighter spacing for dense lists (shrinks `--kai-card-spacing`). */
  dense?: boolean;

  /** Full-bleed media region (image/video/illustration) at the top (vertical) or
   *  start (horizontal). Clipped to the card's corners. */
  media?: JSX.Element;
  /** Header content (e.g. a title). Rendered above the body, padded. */
  header?: JSX.Element;
  /** An actions cluster pinned to the end of the header row. */
  headerActions?: JSX.Element;
  /** Footer content. Rendered below the body, padded. */
  footer?: JSX.Element;
  /** An actions cluster pinned to the end of the footer row. */
  footerActions?: JSX.Element;
  /** Whether the default slot (body) has content — the facade computes this so an
   *  empty body region isn't rendered (an empty `<slot>` is always truthy). */
  hasBody?: boolean;

  /** Render a dismiss (×) that hides the card and calls `onDismiss`. Off by default. */
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Render the whole card as a link (`<a>`). Wins over `clickable`. */
  href?: string;
  target?: string;
  rel?: string;
  /** Make the whole card a `role="button"` with Enter/Space activation. A
   *  clickable/href card must NOT also contain footer action buttons. */
  clickable?: boolean;
  onCardClick?: (event: MouseEvent | KeyboardEvent) => void;
}

/**
 * `Card` — the kit's presentational card surface (the `<kai-card>` primitive),
 * modeled on the WebAwesome card: ONE element whose flexibility comes from a few
 * structural slots (`media`, `header` + actions, `footer` + actions; body is the
 * default slot), `appearance` + `orientation` variants, `::part` styling, and a
 * single `--kai-card-spacing` knob. The title/description are NOT slots — they are
 * body/header content the consumer marks up, because a slot earns its place only
 * where the shadow boundary blocks the consumer (a pinned media/footer region),
 * not for a text node.
 *
 * Distinct from the generative-UI contract chrome in `../components/card.tsx`
 * (which the Card Contract cards compose); this one is purely presentational.
 *
 * a11y: a `clickable`/`href` card MUST NOT also contain action buttons — that
 * nests interactive controls inside a button/link.
 */
export function Card(props: CardProps): JSX.Element {
  const merged = mergeDefaults(
    { appearance: 'outlined' as CardAppearance, orientation: 'vertical' as CardOrientation, collapse: '28rem', dense: false },
    props,
  );
  // V2-PORT: splitProps -> alias + omit.
  const local = merged;
  const rest = omit(merged, 
    'appearance',
    'orientation',
    'collapse',
    'dense',
    'media',
    'header',
    'headerActions',
    'footer',
    'footerActions',
    'hasBody',
    'dismissible',
    'onDismiss',
    'href',
    'target',
    'rel',
    'clickable',
    'onCardClick',
    'class',
    'children');

  const [open, setOpen] = createSignal(true);
  const dismiss = (event: MouseEvent) => {
    event.stopPropagation();
    setOpen(false);
    local.onDismiss?.();
  };

  const isLink = () => Boolean(local.href);
  const isButton = () => !isLink() && Boolean(local.clickable);
  const isInteractive = () => isLink() || isButton();

  // The responsive layout is driven by a per-instance @container rule (a query on
  // the card's OWN width, not the viewport) rather than fixed Tailwind classes, so
  // the breakpoint is the configurable `collapse` prop. Base + query rules share a
  // selector; the query (later) wins above the breakpoint. The card collapses to
  // vertical (responsive orientation) and stacks its footer actions below `collapse`.
  const COLLAPSE_RE = /^[\d.]+(px|rem|em|ch|vw|vh|%)$/;
  const collapseAt = () => (COLLAPSE_RE.test(local.collapse) ? local.collapse : '28rem');
  // Scope the injected <style> to THIS instance. The SolidJS Card renders in light
  // DOM (the primitive story + autodocs page), where unscoped selectors are global
  // and collide across instances (a horizontal card's `.kc-layout{flex-direction:row}`
  // overrides a vertical one's, etc.). Prefixing every rule with a per-card class
  // isolates each instance. Harmless inside the kai-card shadow root, where the
  // boundary already scopes styles.
  const scope = `kc-i-${createUniqueId()}`;
  const styleText = () => {
    const bp = collapseAt();
    const horizontal = local.orientation === 'horizontal';
    const responsive = local.orientation === 'responsive';
    const s = `.${scope}`;
    const base =
      `${s} .kc-layout{display:flex;flex-direction:${horizontal ? 'row' : 'column'}}` +
      `${s} .kc-media{overflow:hidden;${horizontal ? 'flex-shrink:0;align-self:stretch' : 'width:100%'}}` +
      `${s} [part="footer"]{display:flex;flex-direction:column;gap:0.75rem}` +
      `${s} .kc-actions{display:flex;flex-direction:column-reverse;align-items:stretch;gap:0.5rem}`;
    const query =
      `${s} [part="footer"]{flex-direction:row;align-items:center}` +
      `${s} .kc-actions{flex-direction:row;align-items:center;margin-left:auto}` +
      (responsive ? `${s} .kc-layout{flex-direction:row}${s} .kc-media{width:auto;flex-shrink:0;align-self:stretch}` : '');
    return `${base}@container (min-width:${bp}){${query}}`;
  };

  const activate = (event: MouseEvent | KeyboardEvent) => local.onCardClick?.(event);
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isButton()) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate(event);
    }
  };
  const rel = () => local.rel ?? (local.target === '_blank' ? 'noopener noreferrer' : undefined);

  const hasHeaderRow = () => Boolean(local.header) || Boolean(local.headerActions);
  const hasFooterRow = () => Boolean(local.footer) || Boolean(local.footerActions);
  const hasSections = () => hasHeaderRow() || local.hasBody || hasFooterRow();

  // The padded header/body/footer column. Media sits outside it so it stays
  // full-bleed (clipped to the card's corners by the root's overflow-hidden).
  const sections = (
    <div class="flex min-w-0 flex-1 flex-col" style={{ padding: 'var(--kai-card-spacing)', gap: 'var(--kai-card-spacing)' }}>
      <Show when={hasHeaderRow()}>
        <div part="header" class="flex items-start justify-between gap-3">
          <Show when={local.header}>
            <div class="min-w-0 flex-1">{local.header}</div>
          </Show>
          <Show when={local.headerActions}>
            <div class="-mt-1 shrink-0">{local.headerActions}</div>
          </Show>
        </div>
      </Show>
      <Show when={local.hasBody}>
        <div part="body" class="min-w-0 text-sm">{local.children}</div>
      </Show>
      <Show when={hasFooterRow()}>
        {/* Footer + action cluster collapse to a stack below `collapse` (the injected
            @container rule). The cluster is flex-col-REVERSE when stacked, so the
            primary action (authored last → the row's right) rises to the TOP, and
            items-stretch makes the buttons fill the width. No consumer work either way. */}
        <div part="footer">
          <Show when={local.footer}>
            <div class="min-w-0 flex-1">{local.footer}</div>
          </Show>
          <Show when={local.footerActions}>
            <div class="kc-actions">{local.footerActions}</div>
          </Show>
        </div>
      </Show>
    </div>
  );

  return (
    <Show when={open()}>
      <Dynamic
        component={isLink() ? 'a' : 'div'}
        part="card"
        href={isLink() ? local.href : undefined}
        target={isLink() ? local.target : undefined}
        rel={isLink() ? rel() : undefined}
        role={isButton() ? 'button' : undefined}
        tabindex={isButton() ? 0 : undefined}
        onClick={isInteractive() ? activate : undefined}
        onKeyDown={isButton() ? onKeyDown : undefined}
        style={{ '--kai-card-spacing': local.dense ? '0.875rem' : '1.25rem' }}
        class={cn(
          // @container: the card is a query container for its sections (responsive
          // orientation + the footer action cluster collapse) keyed to its own width.
          'relative block overflow-hidden rounded-xl no-underline @container',
          // Per-instance scope so the injected <style> can't bleed across cards.
          scope,
          APPEARANCE[local.appearance],
          isInteractive() &&
            'cursor-pointer transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          local.class,
        )}
        {...rest}
      >
        <Show when={local.dismissible}>
          <button
            type="button"
            part="dismiss"
            aria-label="Dismiss"
            onClick={dismiss}
            class="absolute right-2 top-2 z-10 shrink-0 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
          >
            <X class="size-3.5" aria-hidden="true" />
          </button>
        </Show>

        {/* Per-instance responsive rules; the breakpoint is the `collapse` prop. */}
        <style>{styleText()}</style>
        <div class="kc-layout">
          <Show when={local.media}>
            <div part="media" class="kc-media">{local.media}</div>
          </Show>
          <Show when={hasSections()}>{sections}</Show>
        </div>
      </Dynamic>
    </Show>
  );
}
