import { omit, createSignal, createEffect, createMemo, onSettled, onCleanup, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { Skeleton } from '../ui/skeleton';
import { Link as LinkIcon } from 'lucide-solid';
import type { CardEvent } from '../primitives/card-contract';
import {
  type LinkPreviewData,
  deriveDomain,
  isRenderableLink,
  hasLinkPreviewFetcher,
  resolveLinkMetadata,
} from '../primitives/link-preview';

export interface LinkPreviewProps {
  /** The card id correlating every emitted event. */
  cardId: string;
  /** The link payload (data-down). */
  data: LinkPreviewData;
  /** Emit a contract CardEvent up (host routes it). */
  onEmit?: (event: CardEvent) => void;
  /** Extra classes for the card root. */
  class?: string;
}

/** True when the payload already carries renderable metadata (the pure path). */
function hasMetadata(data: LinkPreviewData): boolean {
  return Boolean(data.title || data.description || data.image);
}

/**
 * `LinkPreview` — a pure, themed, accessible rich link / OG preview. Renders from the
 * supplied metadata; it never fetches the network itself. When the payload is a
 * bare `{ url }` and an app has registered a `configureLinkPreview` fetcher, it
 * shows a skeleton, calls the hook, merges the result, and renders. Activating the
 * card (click / Enter / Space) emits the contract `open` verb (`target:'tab'`); the
 * host policy performs the navigation so it can veto/redirect.
 */
export function LinkPreview(props: LinkPreviewProps): JSX.Element {
  // V2-PORT: splitProps with no rest half -> plain alias.
  const local = props;

  const emit = (event: CardEvent) => local.onEmit?.(event);

  // Bare-URL resolution state (only used when the payload lacks metadata + a fetcher exists).
  const [fetched, setFetched] = createSignal<Partial<LinkPreviewData> | undefined>();
  const [loading, setLoading] = createSignal(false);
  const [imageBroken, setImageBroken] = createSignal(false);

  const url = () => local.data.url;
  const valid = createMemo(() => isRenderableLink(url()));

  // The effective payload = supplied data merged with any fetched metadata.
  const effective = createMemo<LinkPreviewData>(() => ({ ...local.data, ...fetched() }));

  // Lifecycle `ready` once on mount.
  onSettled(() => { emit({ kind: 'ready', cardId: local.cardId }); }); // V2-PORT (R2): braced — a non-function return crashes dev

  // Invalid URL → emit a single `error` (belt-and-suspenders; host also rejects bad schemes on open).
  createEffect(valid, (ok) => {
      if (!ok) emit({ kind: 'error', cardId: local.cardId, message: `Invalid link url: ${url()}` });
    });

  // Bare-URL path: when there's no metadata AND a fetcher is configured, resolve once.
  createEffect(() => [local.data, valid()] as const, ([data, ok]) => {
        setImageBroken(false);
        if (!ok || hasMetadata(data) || !hasLinkPreviewFetcher()) return;
        let cancelled = false;
        setLoading(true);
        resolveLinkMetadata(data.url)
          .then((meta) => {
            if (!cancelled) setFetched(meta);
          })
          .catch(() => {
            // Reject → fall back to the bare link chip; the URL itself is still usable.
            if (!cancelled) setFetched({});
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
        // V2-PORT: the in-effect onCleanup became the apply's returned cleanup —
        // cancels a stale in-flight fetch if `data` changes before it resolves.
        return () => {
          cancelled = true;
        };
      });

  const domain = createMemo(() => effective().domain ?? deriveDomain(url()) ?? url());
  const heading = createMemo(() => effective().siteName ?? domain());
  const titleText = createMemo(() => effective().title ?? domain());
  const showImage = createMemo(() => Boolean(effective().image) && !imageBroken());

  const activate = () => {
    if (!valid()) return;
    emit({ kind: 'open', cardId: local.cardId, url: url(), target: 'tab' });
  };

  const onClick = (e: MouseEvent) => {
    // Intercept the anchor's default navigation so it routes through host policy.
    // (Middle-click / cmd-click still open the real href in a new tab — acceptable + safe.)
    e.preventDefault();
    activate();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  };

  // --- Invalid-link error chip ------------------------------------------
  return (
    <Show
      when={valid()}
      fallback={
        <div
          role="img"
          aria-label="Invalid link"
          class={cn(
            'flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:border-red-400/50 dark:bg-destructive/20 dark:text-red-400',
            local.class,
          )}
        >
          <LinkIcon size={16} aria-hidden="true" />
          <span class="truncate">Invalid link</span>
        </div>
      }
    >
      <a
        href={url()}
        rel="noopener noreferrer"
        aria-label={`Open ${titleText()} on ${domain()}`}
        class={cn(
          'group block overflow-hidden rounded-xl border border-border bg-card text-card-foreground no-underline outline-none transition-shadow',
          'cursor-pointer hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring',
          local.class,
        )}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <Show when={loading()}>
          {/* Skeleton while the bare-URL fetcher resolves. */}
          <Skeleton class="aspect-[16/9] w-full rounded-none" />
          <div class="space-y-2 p-3">
            <Skeleton class="h-3 w-1/3" />
            <Skeleton class="h-4 w-2/3" />
            <Skeleton class="h-3 w-full" />
          </div>
        </Show>
        <Show when={!loading()}>
          <Show when={showImage()}>
            <img
              src={effective().image}
              alt={effective().imageAlt ?? ''}
              role="img"
              class="aspect-[16/9] w-full object-cover"
              onError={() => setImageBroken(true)}
            />
          </Show>
          <div class="space-y-1 p-3">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Show
                when={effective().favicon}
                fallback={<LinkIcon size={12} class="shrink-0 opacity-70" aria-hidden="true" />}
              >
                <img src={effective().favicon} alt="" class="h-3.5 w-3.5 shrink-0 rounded-sm" />
              </Show>
              <span class="truncate">{heading()}</span>
            </div>
            <div class="line-clamp-2 text-sm font-semibold text-foreground">{titleText()}</div>
            <Show when={effective().description}>
              <div class="line-clamp-3 text-xs text-muted-foreground">{effective().description}</div>
            </Show>
          </div>
        </Show>
      </a>
    </Show>
  );
}

export type { LinkPreviewData } from '../primitives/link-preview';
