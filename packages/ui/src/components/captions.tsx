import { type JSX, Show, For, createMemo } from 'solid-js';
import { createPresence } from '../ui/overlay';
import { cn } from '../utils/cn';

/**
 * `Captions` — live closed-captioning: the text shown WHILE someone (the
 * user or the agent) is speaking, distinct from a scrollback transcript.
 * Built for the Voice template (`elements/builder-voice.stories.tsx`) but
 * kept generic — any voice surface that wants a caption line can use this
 * directly.
 *
 * - Driven by `segments`, oldest first — the LAST entry is the current
 *   line. Everything else is history, only rendered by `stacked`.
 * - `variant` picks the chrome: `'lower-third'` (a semi-opaque bar, the
 *   broadcast-caption look), `'floating'` (a card that floats above a
 *   visualizer, `kai-elevation`), `'minimal'` (bare text, no chrome — the
 *   original shape this component shipped with), `'stacked'` (the last two
 *   lines of history fade in behind the current line, which stays full
 *   strength). Default `'minimal'`.
 * - Speaker-aware via `data-speaker` + a small uppercase label ("You" /
 *   "Assistant") — NOT a color swap. Accent stays reserved for the
 *   visualizer per the owner's Voice-round instruction, so the distinction
 *   lives in the label and a subtle weight difference, both drawn from the
 *   muted/foreground tiers, never `text-primary`.
 * - Interim (`final: false`) text renders `text-muted-foreground` / a hair
 *   lighter than a finalized line's `text-foreground`, so a caption visibly
 *   "settles" the moment the model (or the ASR) commits it.
 * - Undefined/empty `segments`, or a current segment whose `text` is empty
 *   or whitespace-only, renders NOTHING — a real `<Show>` around a presence
 *   gate, not a hidden/zero-opacity node left in the DOM.
 * - One `role="status"`/`aria-live="polite"` region, wrapping ONLY the
 *   current line — `stacked`'s history lines sit outside it
 *   (`aria-hidden="true"`) so they don't get re-announced every time the
 *   region's content changes. This mirrors `toast.tsx`'s
 *   `role="region"`/`aria-live="polite"` pattern (the kit's other
 *   speech-adjacent live region) rather than inventing a second policy, and
 *   is the ONLY live region this component renders — it says nothing about
 *   history, so it can't double-announce anything a transcript component
 *   elsewhere on the page is already announcing.
 * - Appear/update reuses the kit's real exit-animation primitive,
 *   `createPresence` (`ui/overlay.tsx`), for the whole component's
 *   mount/unmount, and a keyed `<For>` around the current line so a NEW
 *   segment object (the same "new object per changed item" contract the
 *   rest of the kit's reactive props follow) retriggers its own
 *   `animate-in` rather than being silently patched in place. Both use the
 *   same already-compiled `animate-in ... data-[closed]:animate-out ...`
 *   Tailwind-animate classes `DropdownContent`/`DialogContent`/
 *   `HoverCardContent` use, and both carry `motion-reduce:animate-none` (the
 *   same pattern `screen.tsx`/`dialog.tsx` use) so `prefers-reduced-motion:
 *   reduce` turns the animation off entirely — the text still appears,
 *   updates and disappears, just without motion.
 */
export interface CaptionSegment {
  /** Whose speech this line represents. */
  speaker: 'user' | 'assistant';
  /** The line's text. Empty/whitespace on the CURRENT segment renders nothing. */
  text: string;
  /** Whether ASR/the model has committed this line. Default `true`. */
  final?: boolean;
}

export type CaptionsVariant = 'lower-third' | 'floating' | 'minimal' | 'stacked';

export interface CaptionsProps {
  /** Caption lines, oldest first. The last entry is the current line. */
  segments?: CaptionSegment[];
  /** Which visual treatment to render. Default `'minimal'`. */
  variant?: CaptionsVariant;
  class?: string;
}

const SPEAKER_LABEL: Record<CaptionSegment['speaker'], string> = {
  user: 'You',
  assistant: 'Assistant',
};

const VARIANT_CONTAINER: Record<CaptionsVariant, string> = {
  'lower-third':
    'w-full rounded-md border border-border bg-card/90 px-4 py-2.5 text-center backdrop-blur supports-[backdrop-filter]:bg-card/75',
  floating:
    'mx-auto w-fit max-w-xl rounded-2xl bg-card px-5 py-3 text-center kai-elevation',
  minimal: 'mx-auto max-w-xl px-4 py-2 text-center',
  stacked: 'mx-auto flex max-w-xl flex-col items-center gap-1 px-4 py-2 text-center',
};

function lineText(final: boolean | undefined): string {
  return final === false ? 'text-muted-foreground' : 'text-foreground';
}

export function Captions(props: CaptionsProps): JSX.Element {
  const variant = () => props.variant ?? 'minimal';

  const currentSegment = createMemo<CaptionSegment | undefined>(() => {
    const segs = props.segments;
    if (!segs || segs.length === 0) return undefined;
    const last = segs[segs.length - 1];
    return last?.text?.trim() ? last : undefined;
  });
  const hasContent = createMemo(() => !!currentSegment());
  const presence = createPresence(hasContent);

  // History for the `stacked` variant only: up to the two most recent
  // non-empty lines BEFORE the current one, oldest of the pair first.
  const historySegments = createMemo<CaptionSegment[]>(() => {
    const segs = props.segments;
    if (!segs || segs.length < 2) return [];
    return segs
      .slice(0, -1)
      .filter((s) => s.text?.trim())
      .slice(-2);
  });

  return (
    <Show when={presence.present()}>
      <div
        ref={presence.setRef}
        data-expanded={presence.state() === 'open' ? '' : undefined}
        data-closed={presence.state() === 'closed' ? '' : undefined}
        class={cn(
          'pointer-events-none',
          VARIANT_CONTAINER[variant()],
          'animate-in fade-in-0 data-[closed]:animate-out data-[closed]:fade-out-0 motion-reduce:animate-none',
          props.class,
        )}
      >
        <Show when={variant() === 'stacked'}>
          <div aria-hidden="true" class="flex flex-col items-center gap-0.5">
            <For each={historySegments()}>
              {(seg, i) => (
                <div
                  data-speaker={seg.speaker}
                  class={cn(
                    'text-sm leading-snug text-balance text-muted-foreground',
                    i() === historySegments().length - 1 ? 'opacity-70' : 'opacity-40',
                  )}
                >
                  {seg.text}
                </div>
              )}
            </For>
          </div>
        </Show>

        <For each={currentSegment() ? [currentSegment()!] : []}>
          {(seg) => (
            <div
              role="status"
              aria-live="polite"
              data-speaker={seg.speaker}
              data-final={seg.final === false ? undefined : ''}
              class={cn(
                'flex flex-col items-center gap-0.5',
                'animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none',
              )}
            >
              <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {SPEAKER_LABEL[seg.speaker]}
              </span>
              <span
                class={cn(
                  'text-xl leading-snug text-balance',
                  seg.speaker === 'assistant' ? 'font-medium' : 'font-normal',
                  lineText(seg.final),
                  seg.final === false && 'italic',
                )}
              >
                {seg.text}
              </span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
