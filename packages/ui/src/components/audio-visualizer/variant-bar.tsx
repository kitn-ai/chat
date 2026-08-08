import { Index, type JSX } from 'solid-js';
import { cn } from '../../utils/cn';
import { normalizeVolumeBands } from '../../primitives/audio-bands';
import { useSequencer } from '../../primitives/use-sequencer';
import { barSequence, barInterval, type VisualizerState } from '../../primitives/visualizer-sequences';
import { CONTAINER_HEIGHT, GAP, BAR_WIDTH, defaultBarCount, type VisualizerSize } from './sizes';

/** Props every DOM variant takes. The dispatcher supplies all of them. */
export interface VariantProps {
  state: VisualizerState;
  size: VisualizerSize;
  /** Multiband levels, 0..1. Only read while `state === 'speaking'`. */
  bands: number[];
  /** `prefers-reduced-motion`: pin the sequencer at its first frame. */
  frozen: boolean;
  /** Overrides the inherited `currentColor` the bars are painted with. */
  color?: string;
  class?: string;
  /**
   * Render each element yourself. Receives the element's static index plus
   * `highlighted` and `value` as live accessors, not plain values: the
   * markup is only mapped once per position (see the `<Index>` note below),
   * so you must CALL `highlighted()` and `value()` from inside your own JSX
   * for them to stay live. Destructuring them into a plain variable freezes
   * them at that moment. `::part(bar)` handles restyling; this is for
   * replacing the markup outright.
   */
  children?: (item: { index: number; highlighted: () => boolean; value: () => number }) => JSX.Element;
}

/**
 * Vertical bars that rise with the audio while speaking, and run a scripted
 * pattern in every other state.
 *
 * Ported from livekit/components-js
 * `packages/shadcn/components/agents-ui/agent-audio-visualizer-bar.tsx`
 * (Apache License 2.0).
 */
export function BarVisualizer(props: VariantProps & { barCount?: number }): JSX.Element {
  const count = () => props.barCount ?? defaultBarCount(props.size);

  // Frozen (reduced motion) parks the sequence on frame 0 rather than stopping
  // the component: the shape still reads, it just does not move.
  const tick = useSequencer(() => (props.frozen ? Infinity : barInterval(props.state, count())));

  const sequence = () => barSequence(props.state, count());
  const highlighted = () => sequence()[tick() % sequence().length] ?? [];

  // Bands only mean anything while speaking. Everywhere else the sequence is
  // the whole story, so a stale level never leaks into a scripted state.
  const levels = () =>
    props.state === 'speaking'
      ? normalizeVolumeBands(props.bands, count())
      : new Array(count()).fill(0);

  return (
    <div
      data-kai-state={props.state}
      class={cn('relative flex items-center justify-center', props.class)}
      style={{
        height: `${CONTAINER_HEIGHT[props.size]}px`,
        gap: `${GAP[props.size]}px`,
        ...(props.color ? { color: props.color } : {}),
      }}
    >
      {/*
        <Index>, not <For>: Solid's <For> keys nodes by `===` on the array
        VALUE, and `levels()` is an array of plain numbers that changes on
        nearly every frame while speaking. That would tear down and recreate
        every bar node each frame instead of patching it in place, which both
        churns the DOM on the hottest path here and defeats
        `transition-colors duration-250` right at the listening -> speaking
        boundary (a freshly created node has no prior value to transition
        from). <Index> maps by POSITION instead, so each bar's DOM node is
        created once and its `level` accessor updates in place.
      */}
      <Index each={levels()}>
        {(level, i) => {
          // `index` is a plain number (stable per position under <Index>).
          // `highlighted`/`value` are live accessors, not plain values: the
          // callback below runs once per position, so anything a consumer's
          // render-prop wants to stay current must call these itself rather
          // than close over a one-time snapshot.
          const item = {
            index: i,
            highlighted: () => highlighted().includes(i),
            value: () => level(),
          };
          return (
            props.children?.(item) ?? (
              <div
                part="bar"
                data-kai-index={item.index}
                data-kai-highlighted={item.highlighted()}
                class={cn(
                  'rounded-full bg-current/10 transition-colors duration-250 ease-linear',
                  'data-[kai-highlighted=true]:bg-current',
                )}
                style={{
                  width: `${BAR_WIDTH[props.size]}px`,
                  'min-height': `${BAR_WIDTH[props.size]}px`,
                  height: `${level() * 100}%`,
                }}
              />
            )
          );
        }}
      </Index>
    </div>
  );
}
