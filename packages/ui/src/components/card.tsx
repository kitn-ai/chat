import { type JSX, Show, splitProps, mergeProps, createSignal, createUniqueId } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { cn } from '../utils/cn';
import { AlertTriangle, X } from 'lucide-solid';

export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Heading rendered in the card chrome (the contract's CardEnvelope.title).
   *  NB: NOT `title` — `title` is a reserved IDL attr (see define.tsx RESERVED). */
  heading?: string;
  /** Optional supporting text under the heading. */
  description?: string;
  /** Media region (image/icon) rendered above the heading. */
  media?: JSX.Element;
  /** Footer action region (buttons). */
  actions?: JSX.Element;
  /** When set, the card renders its standard inline error state INSTEAD of body. */
  errorMessage?: string;
  /** Compact spacing for dense lists of cards. */
  dense?: boolean;
  /** Stable id for the heading (so composing cards can `aria-labelledby` it).
   *  Auto-generated when omitted. */
  headingId?: string;
  /** Stable id for the description (so composing cards can `aria-describedby` it
   *  — e.g. `kai-choice`'s radiogroup points at its prompt). Auto-generated when
   *  omitted, mirroring `headingId`. */
  descriptionId?: string;
  /** Render a dismiss (×) button that hides the card and calls `onDismiss`.
   *  Opt-in, OFF by default — the contract cards never set it, so they are
   *  unaffected. */
  dismissible?: boolean;
  /** Called after the card is dismissed via its ×. */
  onDismiss?: () => void;
  /** Render the whole card as a link (`<a>`). Wins over `clickable`. */
  href?: string;
  /** `target` for the `href` anchor. */
  target?: string;
  /** `rel` for the `href` anchor (default `noopener noreferrer` when `target="_blank"`). */
  rel?: string;
  /** Make the whole card behave like a button: `role="button"`, a tabindex, and
   *  Enter/Space activation, firing `onCardClick`. Ignored when `href` is set.
   *  A clickable/href card must NOT also contain footer action buttons — that
   *  nests interactive elements. Use `actions` OR clickable, never both. */
  clickable?: boolean;
  /** Called when a `clickable` (or `href`) card is activated (click, or Enter/Space). */
  onCardClick?: (event: MouseEvent | KeyboardEvent) => void;
}

/**
 * `Card` — the shared presentational chrome every native card composes from:
 * an optional media region, a heading + description, a body (default slot), an
 * actions footer, and one consistent inline **error** state (the contract's
 * "never a broken/partial card" rule). It is intentionally chrome-only: it reads
 * no `CardContext` and emits no `CardEvent` — the cards that compose it (e.g.
 * `kai-form`) own the contract interaction.
 *
 * The optional `dismissible` / `href` / `clickable` behaviors are all OFF by
 * default, so the contract cards (which set none of them) keep their original
 * presentational behavior unchanged.
 *
 * a11y: a `clickable` or `href` card MUST NOT also contain footer action buttons
 * — that nests interactive controls inside a button/link. Use `actions` OR
 * make the card clickable, never both.
 */
export function Card(props: CardProps): JSX.Element {
  const merged = mergeProps({ dense: false }, props);
  const [local, rest] = splitProps(merged, [
    'heading',
    'description',
    'media',
    'actions',
    'errorMessage',
    'dense',
    'headingId',
    'descriptionId',
    'dismissible',
    'onDismiss',
    'href',
    'target',
    'rel',
    'clickable',
    'onCardClick',
    'class',
    'children',
  ]);

  const autoId = createUniqueId();
  const headingId = () => local.headingId ?? `kai-card-heading-${autoId}`;
  const descriptionId = () => local.descriptionId ?? `kai-card-description-${autoId}`;
  const hasError = () => local.errorMessage !== undefined && local.errorMessage !== '';
  const hasHeader = () => Boolean(local.heading) || Boolean(local.description);

  const [open, setOpen] = createSignal(true);
  const dismiss = (event: MouseEvent) => {
    // Don't let the × activate a clickable/href card underneath it.
    event.stopPropagation();
    setOpen(false);
    local.onDismiss?.();
  };

  const isLink = () => Boolean(local.href);
  const isButton = () => !isLink() && Boolean(local.clickable);
  const isInteractive = () => isLink() || isButton();

  const activate = (event: MouseEvent | KeyboardEvent) => local.onCardClick?.(event);
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isButton()) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate(event);
    }
  };

  // The interactive elements (`<a>` / role="button") get keyboard + hover/focus
  // affordances; the plain card is a `<div>`. Anchors carry a safe default `rel`
  // when opening a new tab.
  const rel = () =>
    local.rel ?? (local.target === '_blank' ? 'noopener noreferrer' : undefined);

  // The card's heading + body + actions column.
  const inner = (
    <>
      <Show when={hasHeader()}>
        <div
          class={cn(
            'flex flex-col border-b border-border',
            local.dense ? 'gap-0.5 pb-2.5' : 'gap-1 pb-4',
          )}
        >
          <Show when={local.heading}>
            <h3
              id={headingId()}
              class="text-title font-semibold tracking-tight text-foreground"
            >
              {local.heading}
            </h3>
          </Show>
          <Show when={local.description}>
            <p id={descriptionId()} class="text-body text-muted-foreground">
              {local.description}
            </p>
          </Show>
        </div>
      </Show>

      <Show
        when={hasError()}
        fallback={
          <>
            <Show when={local.children}>
              <div class="text-sm text-foreground">{local.children}</div>
            </Show>
            <Show when={local.actions}>
              <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
                {local.actions}
              </div>
            </Show>
          </>
        }
      >
        <div
          role="alert"
          class="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/15 dark:text-red-400"
        >
          <AlertTriangle size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{local.errorMessage}</span>
        </div>
      </Show>
    </>
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
        class={cn(
          'relative flex flex-col rounded-xl border border-border bg-card text-card-foreground kai-elevation-sm',
          local.dense ? 'gap-2.5 p-3.5' : 'gap-4 p-5',
          isInteractive() &&
            'cursor-pointer no-underline transition-colors hover:border-ring hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
            class="absolute right-2.5 top-2.5 z-10 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X class="size-3.5" aria-hidden="true" />
          </button>
        </Show>

        <Show when={local.media}>
          <div class="overflow-hidden rounded-lg">{local.media}</div>
        </Show>

        {inner}
      </Dynamic>
    </Show>
  );
}
