import { omit, createSignal, createEffect, createMemo, onSettled, Show } from 'solid-js';
import { deferApply } from '../utils/defer-apply'; // V2-PORT: on(...,{defer:true}) replacement
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { Play, Video, ExternalLink, TriangleAlert } from 'lucide-solid';
import type { CardEvent } from '../primitives/card-contract';
import {
  type EmbedCardData,
  type ResolvedEmbed,
  resolveEmbed,
  watchUrl,
  providerLabel,
  aspectRatioValue,
} from '../primitives/embed-providers';

export interface EmbedProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onError'> {
  /** The card id correlating every emitted event. */
  cardId: string;
  /** The embed payload (data-down). */
  data: EmbedCardData;
  /** Emit a contract CardEvent up (host routes it). */
  onEmit?: (event: CardEvent) => void;
}

/**
 * `Embed` — a privacy-first lazy media facade. Initial render is a poster + a play
 * button: NO provider iframe, NO provider JS, NO cookies until the user opts in.
 * On play it swaps in the provider `<iframe>` (youtube-nocookie / vimeo dnt /
 * allowlisted generic). A persistent "Open on {provider}" affordance routes the
 * contract `open` verb so a blocked embed is never a dead end. The only verbs it
 * emits are lifecycle `ready`, `open`, and failure `error`.
 */
export function Embed(props: EmbedProps): JSX.Element {
  // V2-PORT: splitProps -> alias + omit.
  const local = props;
  const rest = omit(props, 'cardId', 'data', 'onEmit', 'class');

  const emit = (event: CardEvent) => local.onEmit?.(event);

  const [playing, setPlaying] = createSignal(false);
  const [posterBroken, setPosterBroken] = createSignal(false);
  let playerRegion: HTMLDivElement | undefined;

  // Resolve the provider URL/poster/sandbox; capture a resolution error to render inline.
  const resolved = createMemo<{ ok: true; value: ResolvedEmbed } | { ok: false; error: string }>(
    () => {
      try {
        return { ok: true, value: resolveEmbed(local.data) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  const ratio = createMemo(() => aspectRatioValue(local.data.aspectRatio));
  const titleText = () => local.data.title ?? 'Embedded video';
  const poster = createMemo(() =>
    resolved().ok && !posterBroken() ? (resolved() as { value: ResolvedEmbed }).value.posterUrl : undefined,
  );
  const watch = createMemo(() => watchUrl(local.data));
  const label = () => providerLabel(local.data.provider);

  onSettled(() => { emit({ kind: 'ready', cardId: local.cardId }); }); // V2-PORT (R2): braced — a non-function return crashes dev

  // Resolution failure → a single `error` event (defense in depth; the schema allOf
  // and the origin allowlist should catch most of these earlier).
  createEffect(resolved, (r) => {
      if (!r.ok) emit({ kind: 'error', cardId: local.cardId, message: r.error });
    });

  // Reset facade state when the payload changes.
  createEffect(() => local.data, deferApply(() => {
        setPlaying(false);
        setPosterBroken(false);
      }));

  const play = () => {
    if (!resolved().ok) return;
    setPlaying(true);
    // Move focus into the player region for SR/keyboard continuity.
    queueMicrotask(() => playerRegion?.focus());
  };
  const onPlayKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      play();
    }
  };
  const openOnProvider = () => {
    const w = watch();
    if (w) emit({ kind: 'open', cardId: local.cardId, url: w, target: 'tab' });
  };

  return (
    <div
      class={cn('overflow-hidden rounded-xl border border-border bg-card text-card-foreground', local.class)}
      {...rest}
    >
      <div class="relative w-full bg-black" style={{ 'aspect-ratio': ratio() }}>
        <Show
          when={resolved().ok}
          fallback={
            <div
              role="img"
              aria-label="Can't load this video"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-4 text-center text-sm text-muted-foreground"
            >
              <TriangleAlert size={28} aria-hidden="true" />
              <span>Can't load this video</span>
            </div>
          }
        >
          <Show
            when={playing()}
            fallback={
              <button
                type="button"
                aria-label={`Play ${local.data.title ?? 'video'}`}
                class="group absolute inset-0 flex h-full w-full items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                onClick={() => play()}
                onKeyDown={onPlayKeyDown}
              >
                {/* Poster (or a neutral placeholder when absent/broken). */}
                <Show
                  when={poster()}
                  fallback={
                    <div
                      class="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950"
                      aria-hidden="true"
                    />
                  }
                >
                  <img
                    src={poster()}
                    alt={local.data.title ?? ''}
                    class="absolute inset-0 h-full w-full object-cover"
                    onError={() => setPosterBroken(true)}
                  />
                </Show>
                <span
                  class="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition-transform motion-safe:group-hover:scale-110"
                  aria-hidden="true"
                >
                  <Play size={26} fill="currentColor" />
                </span>
              </button>
            }
          >
            {/* `outline-none` is DELIBERATE here and must stay: a `tabindex="-1"`
                wrapper focused programmatically after the user activates the
                player, so keyboard context lands on the embed. Not a tab stop —
                the iframe inside it takes focus from there. */}
            <div ref={(el) => (playerRegion = el)} tabindex="-1" class="absolute inset-0 outline-none">
              <iframe
                src={(resolved() as { value: ResolvedEmbed }).value.embedUrl}
                title={titleText()}
                sandbox={(resolved() as { value: ResolvedEmbed }).value.sandbox}
                allow={(resolved() as { value: ResolvedEmbed }).value.allow}
                allowfullscreen
                class="absolute inset-0 h-full w-full border-0"
              />
            </div>
          </Show>
        </Show>
      </div>
      {/* Footer: title + the always-available "Open on {provider}" fallback affordance. */}
      <div class="flex items-center justify-between gap-2 px-3 py-2">
        <span class="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
          <Video size={14} class="shrink-0 opacity-70" aria-hidden="true" />
          <span class="truncate">{local.data.title ?? label()}</span>
        </span>
        <Show when={watch()}>
          <button
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => openOnProvider()}
          >
            Open on {label()}
            <ExternalLink size={12} aria-hidden="true" />
          </button>
        </Show>
      </div>
    </div>
  );
}

export type { EmbedCardData } from '../primitives/embed-providers';
