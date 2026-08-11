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
   * them at that moment. `::part(bar)` / `::part(bar highlighted)` (or
   * `cell`) handle restyling from outside; this render-prop is for replacing
   * the markup outright.
   *
   * In bar and grid, your returned element IS the drawn item. Radial is the
   * exception: it always wraps whatever you return in its own positioning
   * element, because each spoke must be absolutely placed around the ring.
   * You still control the markup inside that wrapper, just not its position.
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
        churns the DOM on the hottest path here and defeats the height/colour
        transition below right at the listening -> speaking boundary (a
        freshly created node has no prior value to transition from). <Index>
        maps by POSITION instead, so each bar's DOM node is created once and
        its `level` accessor updates in place.
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
              // The lit state is a SECOND part TOKEN (`part(bar highlighted)`),
              // not a `data-*` attribute selector on `::part(bar)`: a CSS
              // attribute selector cannot follow a pseudo-element, so
              // `::part(bar)[data-kai-highlighted="true"]` never matches
              // anything from outside the shadow root. `data-kai-highlighted`
              // stays on the element for the render-prop and for styling from
              // inside the shadow root; `part` is the external seam.
              <div
                part={item.highlighted() ? 'bar highlighted' : 'bar'}
                data-kai-index={item.index}
                data-kai-highlighted={item.highlighted()}
                class={cn(
                  'rounded-full bg-current/10',
                  'data-[kai-highlighted=true]:bg-current',
                )}
                style={{
                  width: `${BAR_WIDTH[props.size]}px`,
                  'min-height': `${BAR_WIDTH[props.size]}px`,
                  height: `${level() * 100}%`,
                  // Deliberate, approved divergence from upstream: LiveKit's
                  // source only transitions colour, never height. That is
                  // byte-faithful but reads as visibly stepped once the
                  // demo runs at the real ~32ms analyser cadence -- the
                  // audio measurement itself stays instantaneous (bands are
                  // applied with no smoothing upstream of this component),
                  // so the choppiness is purely the DOM snapping straight to
                  // each new frame's value. 100ms is short enough to stay
                  // well inside the "feels instant" range for a live control
                  // (it only interpolates BETWEEN frames, not behind them)
                  // while smoothing the inter-frame step. `frozen` (prefers-
                  // reduced-motion) disables the transition entirely rather
                  // than just skipping it for the sequencer, so a reduced-
                  // motion user gets an instant, static picture instead of a
                  // smoothed one. Anyone diffing this file against upstream:
                  // this is intentional, not a port slip.
                  transition: props.frozen
                    ? 'none'
                    : 'height 100ms ease-linear, background-color 250ms ease-linear',
                }}
              />
            )
          );
        }}
      </Index>
    </div>
  );
}
