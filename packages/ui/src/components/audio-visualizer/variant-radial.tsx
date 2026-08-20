import { Index, type JSX } from 'solid-js';
import { cn } from '../../utils/cn';
import { normalizeVolumeBands } from '../../primitives/audio-bands';
import { useSequencer } from '../../primitives/use-sequencer';
import { radialSequence, radialInterval } from '../../primitives/visualizer-sequences';
import { CONTAINER_HEIGHT, RADIAL_RADIUS, defaultRadialBarCount } from './sizes';
import { amplitudeRenderState, type VariantProps } from './variant-bar';

/**
 * Bars arranged around a circle, growing outward with the audio.
 *
 * Ported from livekit/components-js
 * `packages/shadcn/components/agents-ui/agent-audio-visualizer-radial.tsx`
 * (Apache License 2.0).
 */
export function RadialVisualizer(
  props: VariantProps & { barCount?: number; radius?: number },
): JSX.Element {
  // Floored at 1: at barCount 0, dotSize below divides by zero (Infinity),
  // and 0 % 4 === 0 slips past the divisibility warning silently. The
  // dispatcher only ever passes positive counts today, but the element
  // facade exposes `bar-count` as a consumer-facing attribute next.
  const count = () => Math.max(1, props.barCount ?? defaultRadialBarCount(props.size));
  const radius = () => props.radius ?? RADIAL_RADIUS[props.size];

  // Upstream warns when the ring cannot split into four even quadrants -- not
  // a hard requirement (any count still renders), just a symmetry hint. This
  // is a plain statement, not inside a `createEffect`: a Solid component body
  // runs once per mount (unlike React, there is no re-render to guard
  // against), so it already fires exactly once for this instance and never
  // again, including across unrelated reactive updates to other props.
  if (count() % 4 !== 0) {
    console.warn(
      `<kai-audio-visualizer variant="radial">: barCount ${count()} is not divisible by 4. ` +
        `The ring will look asymmetric.`,
    );
  }

  // Chord length at this radius: keeps neighbouring dots from touching however
  // many bars are on the ring.
  const dotSize = () => (radius() * Math.PI) / count();

  // The state the rendering follows: `listeningAmplitude` folds `listening`
  // into the speaking presentation. See amplitudeRenderState in variant-bar.
  const renderState = () => amplitudeRenderState(props.state, props.listeningAmplitude);

  // Frozen (reduced motion) parks the sequence on frame 0 rather than stopping
  // the component: the shape still reads, it just does not move.
  const tick = useSequencer(() => (props.frozen ? Infinity : radialInterval(renderState())));
  const sequence = () => radialSequence(renderState(), count());

  // `thinking` parks the sequencer itself (radialInterval returns Infinity)
  // and spins the whole ring in CSS instead, so every bar reads as lit rather
  // than following the scripted highlight groups meant for `listening`
  // (radialSequence's `thinking` case reuses those groups for a different
  // purpose: they interleave the ring so it still looks even while rotating,
  // not so a subset blinks).
  const highlighted = () =>
    renderState() === 'thinking'
      ? Array.from({ length: count() }, (_, i) => i)
      : (sequence()[tick() % sequence().length] ?? []);

  // Bands only mean anything while speaking (or listening under the
  // `listeningAmplitude` opt-in, folded in by renderState). Everywhere else
  // the sequence is the whole story, so a stale level never leaks into a
  // scripted state (same guard as the other two variants, so the
  // render-prop's `value` means one thing across every variant).
  const levels = () =>
    renderState() === 'speaking'
      ? normalizeVolumeBands(props.bands, count())
      : new Array(count()).fill(0);

  const spinning = () => renderState() === 'thinking' && !props.frozen;

  return (
    <div
      data-kai-state={props.state}
      class={cn('relative flex items-center justify-center', spinning() && 'animate-spin', props.class)}
      style={{
        height: `${CONTAINER_HEIGHT[props.size]}px`,
        'aspect-ratio': '1',
        ...(spinning() ? { 'animation-duration': '5s' } : {}),
        ...(props.color ? { color: props.color } : {}),
      }}
    >
      {/*
        <Index>, not <For>, matching the other two variants: Solid's <For>
        keys nodes by `===` on the array VALUE, and `levels()` is an array of
        plain numbers that changes on nearly every frame while speaking. That
        would tear down and recreate every spoke each frame instead of
        patching it in place, defeating the height/colour transition below
        right at the listening -> speaking boundary. <Index> maps by POSITION
        instead, so each spoke's DOM node is created once and its `level`
        accessor updates in place. See the note in variant-bar.tsx.
      */}
      <Index each={levels()}>
        {(level, i) => {
          // `i` is a plain number here (stable per position under <Index>),
          // not an accessor -- do not call it as `i()`. `highlighted`/`value`
          // ARE live accessors: this callback runs once per position, so
          // anything a consumer's render-prop wants to stay current must call
          // these itself rather than close over a one-time snapshot.
          const item = {
            index: i,
            highlighted: () => highlighted().includes(i),
            value: () => level(),
          };
          return (
            <div
              data-kai-spoke
              class="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2"
              style={{
                'transform-origin': 'center',
                transform: `rotate(${(i / count()) * Math.PI * 2}rad) translateY(${radius()}px)`,
              }}
            >
              {/*
                Unlike bar/grid, the render-prop's output does NOT become the
                positioned element itself: it renders INSIDE this wrapper's
                rotate+translateY placement, since something has to place the
                spoke on the ring even when the caller owns its markup. See
                the `children` doc on VariantProps in variant-bar.tsx.
              */}
              {props.children?.(item) ?? (
                // The lit state is a SECOND part TOKEN (`part(bar highlighted)`),
                // not a `data-*` attribute selector on `::part(bar)`: a CSS
                // attribute selector cannot follow a pseudo-element, so
                // `::part(bar)[data-kai-highlighted="true"]` never matches
                // anything from outside the shadow root. `data-kai-highlighted`
                // stays on the element for the render-prop and for styling
                // from inside the shadow root; `part` is the external seam.
                <div
                  part={item.highlighted() ? 'bar highlighted' : 'bar'}
                  data-kai-index={item.index}
                  data-kai-highlighted={item.highlighted()}
                  class={cn(
                    'origin-bottom rounded-full bg-current/10',
                    'data-[kai-highlighted=true]:bg-current',
                  )}
                  style={{
                    width: `${dotSize()}px`,
                    'min-height': `${dotSize()}px`,
                    // x10 so a mid-level band reaches a readable length; upstream's factor.
                    height: `${dotSize() * 10 * level()}px`,
                    // Deliberate, approved divergence from upstream: see the
                    // matching comment in variant-bar.tsx. `150ms` for
                    // colour is unchanged from upstream's constant; only the
                    // new `100ms` height transition is our addition, and
                    // `frozen` disables both together rather than leaving
                    // colour still animating for a reduced-motion user.
                    transition: props.frozen
                      ? 'none'
                      : 'height 100ms ease-linear, background-color 150ms ease-linear',
                  }}
                />
              )}
            </div>
          );
        }}
      </Index>
    </div>
  );
}
