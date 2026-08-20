import { splitProps, Show, For, createEffect, on } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { cn } from '../utils/cn';
import { useTextStream, defaultFadeDuration, defaultSegmentDelay } from '../primitives/use-text-stream';

export type Mode = 'typewriter' | 'fade';

export interface ResponseStreamProps {
  textStream: string | AsyncIterable<string>;
  mode?: Mode;
  speed?: number;
  class?: string;
  onComplete?: () => void;
  as?: string;
  fadeDuration?: number;
  segmentDelay?: number;
  characterChunkSize?: number;
}

function ResponseStream(props: ResponseStreamProps) {
  const [local] = splitProps(props, [
    'textStream', 'mode', 'speed', 'class', 'onComplete',
    'as', 'fadeDuration', 'segmentDelay', 'characterChunkSize',
  ]);

  const mode = () => local.mode ?? 'typewriter';
  const speed = () => local.speed ?? 20;

  const stream = useTextStream({
    mode: mode(),
    speed: speed(),
    characterChunkSize: local.characterChunkSize,
    fadeDuration: local.fadeDuration,
    segmentDelay: local.segmentDelay,
  });

  createEffect(on(
    () => local.textStream,
    (source) => {
      if (source) stream.startStreaming(source);
    }
  ));

  // Deferred: `isComplete` INITIALISES true (nothing has streamed yet), so an
  // undeferred first run would announce completion at mount — the same
  // no-event-on-mount contract kai-tool pins for kai-open-change. Only the
  // false -> true transition of a real stream may call onComplete.
  createEffect(on(
    () => stream.isComplete(),
    (complete) => {
      if (complete) local.onComplete?.();
    },
    { defer: true }
  ));

  const fadeStyle = () => {
    const dur = local.fadeDuration ?? defaultFadeDuration(speed());
    return `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .fade-segment {
        display: inline-block;
        opacity: 0;
        animation: fadeIn ${dur}ms ease-out forwards;
      }
      .fade-segment-space {
        white-space: pre;
      }
    `;
  };

  const segDelay = () => {
    if (typeof local.segmentDelay === 'number') return Math.max(0, local.segmentDelay);
    return defaultSegmentDelay(speed());
  };

  return (
    <Dynamic component={local.as ?? 'div'} class={local.class}>
      <Show
        when={mode() === 'fade'}
        fallback={<>{stream.displayedText()}</>}
      >
        <style>{fadeStyle()}</style>
        <div class="relative">
          <For each={stream.segments()}>
            {(segment, idx) => {
              const isWhitespace = () => /^\s+$/.test(segment.text);
              return (
                <span
                  class={cn(
                    'fade-segment',
                    isWhitespace() && 'fade-segment-space'
                  )}
                  style={{ 'animation-delay': `${idx() * segDelay()}ms` }}
                >
                  {segment.text}
                </span>
              );
            }}
          </For>
        </div>
      </Show>
    </Dynamic>
  );
}

export { ResponseStream };
