import { Index, type JSX } from 'solid-js';
import { cn } from '../../utils/cn';
import { normalizeVolumeBands } from '../../primitives/audio-bands';
import { useSequencer } from '../../primitives/use-sequencer';
import { gridSequence } from '../../primitives/visualizer-sequences';
import { GRID_CELL, GRID_GAP, defaultGridCount } from './sizes';
import type { VariantProps } from './variant-bar';

/*
 * NOTE: The speaking thresholds below DIVERGE from upstream's GridCell math,
 * deliberately (Rob, 2026-08-09). Upstream computes
 * `threshold = |mid - y| * 1/(mid + 1)`, spreading the row thresholds evenly
 * across 0..1 (5 rows: 0, 1/3, 2/3). Two blind spots our element actually
 * exposes:
 *
 * (1) Real speech through the aligned analysis pipeline peaks at 0.51-0.54
 *     (0.68 on the recorded fixture), so distance-2 rows (top/bottom of a
 *     5-row grid) NEVER light — measured zero times across 139 speech
 *     samples, on upstream's own grid as well as ours.
 * (2) The middle row's threshold is 0, so it stays lit in the speaking state
 *     even on a silent mic.
 *
 * Rob asked for both fixed: outer rows reachable by real speech (the grid
 * fills centre-outward as a cross) and an empty grid when the mic is silent.
 * So the ramp is scaled to the realistic speech ceiling, and the would-be-0
 * centre threshold becomes a small silence floor. 5 rows now: 0.02, ~0.217,
 * ~0.433 (3 rows: 0.02, 0.325; 7 rows: 0.02, ~0.163, 0.325, ~0.488).
 *
 * (3) A third divergence, also Rob's request (2026-08-09): at IDLE the grid
 *     highlights nothing. Upstream (and we, until now — audit-verified on
 *     both) rested one stationary centre cell there, gridSequence's default
 *     frame. Grid only: bar and radial already idle dark (their idle
 *     sequences are empty), so this also makes the family consistent.
 */
/** Realistic top of the aligned pipeline's speech range (measured 0.51-0.54 live, 0.68 fixture). */
const SPEECH_LEVEL_CEILING = 0.65;
/** Real speech bands sit at ~0.1 and up; true silence idles at ~0, so this splits them cleanly. */
const SILENCE_FLOOR = 0.02;

/**
 * A grid of dots that pulses with the audio.
 *
 * Ported from livekit/components-js
 * `packages/shadcn/components/agents-ui/agent-audio-visualizer-grid.tsx`
 * (Apache License 2.0), except the speaking threshold remap — see the
 * divergence note above.
 */
export function GridVisualizer(
  props: VariantProps & {
    /** Rows AND columns of the (always square) grid. Default from the size
     *  preset. Replaced the former independent rowCount/columnCount pre-1.0:
     *  columns alone carry the audio signal, so a non-square grid only ever
     *  changed threshold-ring resolution — never expression (Rob, 2026-08-09;
     *  upstream is square-by-default via `rowCount ?? columnCount` too). */
    count?: number;
    /** Ring distance from center for the connecting animation, in cells. */
    spread?: number;
    /** Ms between scripted frames. Default 100. */
    interval?: number;
  },
): JSX.Element {
  const rows = () => props.count ?? defaultGridCount(props.size);
  const cols = () => rows();
  const interval = () => props.interval ?? 100;
  const items = () => Array.from({ length: rows() * cols() }, (_, i) => i);

  const tick = useSequencer(() =>
    // Speaking is driven by audio, not the clock; freezing also parks it.
    props.frozen || props.state === 'speaking' ? Infinity : interval(),
  );

  const sequence = () => gridSequence(props.state, rows(), cols(), props.spread);
  const active = () => sequence()[tick() % sequence().length] ?? { x: -1, y: -1 };

  // Bands only mean anything while speaking. Everywhere else the sequence is
  // the whole story, so a stale level never leaks into a scripted state (same
  // guard as BarVisualizer, so the render-prop's `value` means one thing
  // across every variant).
  const levels = () =>
    props.state === 'speaking' ? normalizeVolumeBands(props.bands, cols()) : new Array(cols()).fill(0);

  /**
   * While speaking, a cell lights when its column's level clears a threshold
   * that grows with distance from the middle row: the column fills
   * centre-outward, so the grid reads as a spectrum. A silent column shows
   * nothing (the floor), a loud one reaches the edges (the scaled ramp) —
   * both per the divergence note at the top of this file.
   */
  function isLit(index: number): boolean {
    if (props.state === 'speaking') {
      const y = Math.floor(index / cols());
      const mid = Math.floor(rows() / 2);
      const scaled = (Math.abs(mid - y) / (mid + 1)) * SPEECH_LEVEL_CEILING;
      // max() applies the floor exactly where the ramp would be 0 (the middle
      // row); every other threshold already clears it.
      const threshold = Math.max(scaled, SILENCE_FLOOR);
      return (levels()[index % cols()] ?? 0) >= threshold;
    }
    // Idle shows a fully dark grid (Rob, 2026-08-09) — divergence (3) above;
    // upstream rests one stationary centre cell here. 'disconnected' (first-
    // class 2026-08-10) mirrors idle's dark grid for now, pending the LiveKit
    // disconnected-state measurement.
    if (props.state === 'idle' || props.state === 'disconnected') return false;
    return active().x === index % cols() && active().y === Math.floor(index / cols());
  }

  /** Snap on, fade off: highlighted cells transition 10x faster than they decay. */
  function transition(index: number): string {
    if (props.state === 'speaking') return '150ms';
    return `${interval() / (isLit(index) ? 1000 : 100)}s`;
  }

  return (
    <div
      data-kai-state={props.state}
      class={cn('grid', props.class)}
      style={{
        'grid-template-columns': `repeat(${cols()}, 1fr)`,
        gap: `${GRID_GAP[props.size]}px`,
        ...(props.color ? { color: props.color } : {}),
      }}
    >
      {/*
        <Index>, not <For>, matching BarVisualizer: `items()` positions are
        stable, but mapping by POSITION (rather than by `===` on the array
        value) is the correct primitive here too, and it keeps the render-prop
        contract identical across variants. See the note in variant-bar.tsx.
      */}
      <Index each={items()}>
        {(_value, index) => {
          // Every column repeats down every row, so a cell's level comes from
          // its column band, not its flat position: index % cols(), not index.
          // `highlighted`/`value` are live accessors: the callback below runs
          // once per position, so a consumer's render-prop must call them
          // itself to stay current rather than close over a one-time snapshot.
          const item = {
            index,
            highlighted: () => isLit(index),
            value: () => levels()[index % cols()] ?? 0,
          };
          return (
            props.children?.(item) ?? (
              // The lit state is a SECOND part TOKEN (`part(cell highlighted)`),
              // not a `data-*` attribute selector on `::part(cell)`: a CSS
              // attribute selector cannot follow a pseudo-element, so
              // `::part(cell)[data-kai-highlighted="true"]` never matches
              // anything from outside the shadow root. `data-kai-highlighted`
              // stays on the element for the render-prop and for styling from
              // inside the shadow root; `part` is the external seam.
              <div
                part={item.highlighted() ? 'cell highlighted' : 'cell'}
                data-kai-index={item.index}
                data-kai-highlighted={item.highlighted()}
                class={cn(
                  'place-self-center rounded-full bg-current/10 transition-all ease-out',
                  'data-[kai-highlighted=true]:bg-current',
                )}
                style={{
                  width: `${GRID_CELL[props.size]}px`,
                  height: `${GRID_CELL[props.size]}px`,
                  'transition-duration': transition(index),
                }}
              />
            )
          );
        }}
      </Index>
    </div>
  );
}
