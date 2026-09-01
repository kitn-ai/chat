import { Show, splitProps, type JSX } from 'solid-js';
import { cn } from '../utils/cn';
import { renderIcon } from '../ui/icon';
import { isSafeUrl } from '../primitives/url-scheme-policy';

/**
 * The generic mobile list row (P-4, blocks-and-parts design 2026-08-31): a
 * leading region, a title with an optional subtitle, a trailing region, and an
 * optional chevron affordance. It is the one anatomy the widget home tab
 * hand-approximated three separate ways in the composition spike (the
 * recent-conversation row, the full-width CTA with a trailing arrow, and the
 * help link with a leading icon and chevron), and the same anatomy every
 * settings screen a block grows will need. General-purpose: nothing in it is
 * chat-specific.
 *
 * Interaction model, one of three, decided by the props:
 * - `href` set and safe: the row is a real anchor (new tab, rel hardened).
 * - `onActivate` set (no href): the row is a `<button>`. Real button element,
 *   so Enter/Space and focus come from the platform, not re-implemented.
 * - neither: a plain non-interactive `<div>` row.
 *
 * Unsafe-href rule (the HomePanel precedent, same policy, same sink): an
 * `href` that fails `isSafeUrl` (e.g. `javascript:`) is NOT downgraded into a
 * button that still fires a handler. The row renders as a plain,
 * non-interactive `<div>`: label visible, no anchor, no handler. Escaping into
 * visibility, never silent promotion.
 */
export interface RowProps {
  /** The title (the element's default slot). */
  children?: JSX.Element;
  /** Secondary line under the title. */
  subtitle?: JSX.Element;
  /** Leading region before the title (an icon or avatar). */
  leading?: JSX.Element;
  /** Right-aligned trailing region (a timestamp, value, or badge). */
  trailing?: JSX.Element;
  /** Show a trailing chevron affordance after the trailing region. */
  chevron?: boolean;
  /** Pressable row: renders button semantics and calls this on activation
   *  (click, Enter, Space via the native button). Ignored when `href` is set. */
  onActivate?: () => void;
  /** Navigate on press: the row renders as an anchor (new tab). An href that
   *  fails the kit's URL scheme policy renders a non-interactive row instead. */
  href?: string;
  class?: string;
}

export function Row(props: RowProps) {
  const [local] = splitProps(props, [
    'children', 'subtitle', 'leading', 'trailing', 'chevron', 'onActivate', 'href', 'class',
  ]);

  const safeHref = () => (local.href && isSafeUrl(local.href) ? local.href : undefined);
  // `href` present but unsafe forces the inert branch even if onActivate is
  // also set: a hostile href must not silently become an event-emitter.
  const interactive = () => (local.href ? !!safeHref() : !!local.onActivate);

  const rowClass = () =>
    cn(
      'flex w-full items-center gap-3 rounded-lg p-3 text-left text-foreground',
      interactive() &&
        'cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      local.class,
    );

  const inner = (
    <>
      <Show when={local.leading}>
        <span part="leading" class="flex shrink-0 items-center text-muted-foreground">
          {local.leading}
        </span>
      </Show>
      <span class="flex min-w-0 flex-1 flex-col">
        <span part="title" class="truncate text-sm font-medium text-foreground">
          {local.children}
        </span>
        <Show when={local.subtitle}>
          <span part="subtitle" class="truncate text-xs text-muted-foreground">
            {local.subtitle}
          </span>
        </Show>
      </span>
      <Show when={local.trailing}>
        <span part="trailing" class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {local.trailing}
        </span>
      </Show>
      <Show when={local.chevron}>
        <span part="chevron" class="flex shrink-0 items-center text-muted-foreground" aria-hidden="true">
          {renderIcon('chevron-right', { class: 'size-4 shrink-0' })}
        </span>
      </Show>
    </>
  );

  return (
    <Show
      when={safeHref()}
      fallback={
        <Show
          when={local.href == null && local.onActivate}
          fallback={
            // Non-interactive: a plain row (including the unsafe-href case,
            // where the label stays visible but nothing is clickable).
            <div part="row" class={rowClass()}>
              {inner}
            </div>
          }
        >
          <button type="button" part="row" onClick={() => local.onActivate?.()} class={rowClass()}>
            {inner}
          </button>
        </Show>
      }
    >
      <a
        part="row"
        href={safeHref()}
        target="_blank"
        rel="noreferrer noopener"
        class={cn(rowClass(), 'no-underline')}
      >
        {inner}
      </a>
    </Show>
  );
}
