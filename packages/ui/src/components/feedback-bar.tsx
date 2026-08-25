import { Switch, Match, For, Show, createSignal } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { ThumbsUp, ThumbsDown, X, Check } from 'lucide-solid';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

export type FeedbackValue = 'helpful' | 'not-helpful';

/** Payload of the optional detail form (phase 2). */
export interface FeedbackDetail {
  value: FeedbackValue;
  /** The selected category chip, if any. */
  category?: string;
  /** The free-text comment, if entered. */
  comment?: string;
}

export interface FeedbackBarProps {
  class?: string;
  /** Prompt shown in the initial "ask" state. */
  title?: string;
  /** Optional leading icon shown before the title. */
  icon?: JSX.Element;
  /** When set, a not-helpful vote opens an optional detail form before the
   *  thank-you confirmation. Off → a vote goes straight to thanks. */
  collectDetail?: boolean;
  /** Optional category chips offered in the detail form. */
  categories?: string[];
  /** Heading for the detail form. */
  detailTitle?: string;
  /** Placeholder for the detail comment box. */
  detailPlaceholder?: string;
  /** Submit button label in the detail form. */
  submitLabel?: string;
  /** Confirmation copy shown after a vote/submit. */
  thanksMessage?: string;
  /** Fired immediately when a rating button is clicked (the vote is recorded
   *  even if the user never fills in the detail form). */
  onFeedback?: (value: FeedbackValue) => void;
  /** Fired when the optional detail form is submitted. */
  onSubmitDetail?: (detail: FeedbackDetail) => void;
  /** Fired when the bar is dismissed via the close (X) button. */
  onClose?: () => void;
}

type Phase = 'ask' | 'detail' | 'thanks';

/**
 * An inline thumbs up/down feedback bar that owns its own flow: it asks, then
 * (optionally, on a not-helpful vote) collects a category + comment, then
 * confirms with a thank-you — all in place, the way ChatGPT/Claude do it. The
 * vote fires `onFeedback` immediately; the optional detail fires
 * `onSubmitDetail`; `onClose` dismisses the bar.
 */
export function FeedbackBar(props: FeedbackBarProps) {
  const [phase, setPhase] = createSignal<Phase>('ask');
  const [vote, setVote] = createSignal<FeedbackValue>();
  const [category, setCategory] = createSignal<string>();
  const [comment, setComment] = createSignal('');

  const rate = (value: FeedbackValue) => {
    setVote(value);
    props.onFeedback?.(value);
    setPhase(value === 'not-helpful' && props.collectDetail ? 'detail' : 'thanks');
  };

  const submitDetail = () => {
    props.onSubmitDetail?.({ value: vote()!, category: category(), comment: comment() || undefined });
    setPhase('thanks');
  };

  const iconBtn =
    'text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-md transition-colors';

  return (
    <div
      class={cn('bg-background border-border inline-flex rounded-[12px] border text-sm', props.class)}
    >
      <Switch>
        {/* ── Ask ── */}
        <Match when={phase() === 'ask'}>
          <div class="flex w-full items-center justify-between">
            <div class="flex flex-1 items-center justify-start gap-4 py-3 pl-4">
              <Show when={props.icon}>{props.icon}</Show>
              <span class="text-foreground font-medium">{props.title}</span>
            </div>
            <div class="flex items-center justify-center gap-0.5 px-3 py-0">
              <button type="button" class={iconBtn} aria-label="Helpful" onClick={() => rate('helpful')}>
                <ThumbsUp class="size-4" />
              </button>
              <button type="button" class={iconBtn} aria-label="Not helpful" onClick={() => rate('not-helpful')}>
                <ThumbsDown class="size-4" />
              </button>
            </div>
            <div class="border-border flex items-center justify-center border-l">
              <button
                type="button"
                onClick={() => props.onClose?.()}
                class="text-muted-foreground hover:text-foreground flex items-center justify-center rounded-md p-3"
                aria-label="Close"
              >
                <X class="size-5" />
              </button>
            </div>
          </div>
        </Match>

        {/* ── Detail (phase 2, not-helpful only) ── */}
        <Match when={phase() === 'detail'}>
          <div class="flex w-[min(22rem,80vw)] flex-col gap-2.5 p-3">
            <div class="flex items-center justify-between">
              <span class="text-foreground font-medium">{props.detailTitle ?? 'What went wrong?'}</span>
              <button
                type="button"
                aria-label="Skip"
                onClick={() => setPhase('thanks')}
                class="text-muted-foreground hover:text-foreground"
              >
                <X class="size-4" />
              </button>
            </div>
            <Show when={props.categories?.length}>
              <div class="flex flex-wrap gap-1.5">
                <For each={props.categories}>
                  {(c) => (
                    <button
                      type="button"
                      aria-pressed={category() === c ? 'true' : 'false'}
                      onClick={() => setCategory(category() === c ? undefined : c)}
                      class={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        category() === c
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {c}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Textarea
              value={comment()}
              onInput={(e) => setComment(e.currentTarget.value)}
              placeholder={props.detailPlaceholder ?? 'Tell us more (optional)'}
              class="border-border min-h-[3rem] rounded-md border px-2 py-1.5"
            />
            <div class="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPhase('thanks')}>Skip</Button>
              <Button variant="default" size="sm" onClick={submitDetail}>{props.submitLabel ?? 'Submit'}</Button>
            </div>
          </div>
        </Match>

        {/* ── Thanks ── */}
        <Match when={phase() === 'thanks'}>
          <div class="flex items-center gap-2 px-4 py-3" role="status">
            <Check class="size-4 text-emerald-500" />
            <span class="text-foreground font-medium">{props.thanksMessage ?? 'Thanks for your feedback'}</span>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
