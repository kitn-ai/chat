import { omit, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { TextShimmer } from './text-shimmer';
import { ChevronRight } from 'lucide-solid';

export interface ThinkingBarProps {
  class?: string;
  text?: string;
  onStop?: () => void;
  stopLabel?: string;
  onClick?: () => void;
}

function ThinkingBar(props: ThinkingBarProps) {
  // V2-PORT: splitProps with no rest half -> plain alias.
  const local = props;

  const text = () => local.text ?? 'Thinking';
  const stopLabel = () => local.stopLabel ?? 'Answer now';

  return (
    <div class={cn('flex w-full items-center justify-between', local.class)}>
      <Show
        when={local.onClick}
        fallback={
          <TextShimmer class="cursor-default text-sm font-medium">{text()}</TextShimmer>
        }
      >
        <button
          type="button"
          onClick={local.onClick}
          class="flex items-center gap-1 text-sm transition-opacity hover:opacity-80"
        >
          <TextShimmer class="text-sm font-medium">{text()}</TextShimmer>
          <ChevronRight class="text-muted-foreground size-4" />
        </button>
      </Show>
      <Show when={local.onStop}>
        <button
          onClick={local.onStop}
          type="button"
          class="text-muted-foreground hover:text-foreground border-muted-foreground/50 hover:border-foreground border-b border-dotted text-sm transition-colors"
        >
          {stopLabel()}
        </button>
      </Show>
    </div>
  );
}

export { ThinkingBar };
