import { For, type JSX } from 'solid-js';
import { cn } from '../../utils/cn';
import { normalizeVolumeBands } from '../../primitives/audio-bands';
import { useSequencer } from '../../primitives/use-sequencer';
import { gridSequence } from '../../primitives/visualizer-sequences';
import { GRID_CELL, GRID_GAP, defaultGridCount } from './sizes';
import type { VariantProps } from './variant-bar';

/**
 * A grid of dots that pulses with the audio.
 *
 * Ported from livekit/components-js `agent-audio-visualizer-grid.tsx`
 * (Apache License 2.0).
 */
export function GridVisualizer(
  props: VariantProps & {
    rowCount?: number;
    columnCount?: number;
    /** Ring distance from center for the connecting animation, in cells. */
    spread?: number;
    /** Ms between scripted frames. Default 100. */
    interval?: number;
  },
): JSX.Element {
  const rows = () => props.rowCount ?? defaultGridCount(props.size);
  const cols = () => props.columnCount ?? defaultGridCount(props.size);
  const interval = () => props.interval ?? 100;
  const items = () => Array.from({ length: rows() * cols() }, (_, i) => i);

  const tick = useSequencer(() =>
    // Speaking is driven by audio, not the clock; freezing also parks it.
    props.frozen || props.state === 'speaking' ? Infinity : interval(),
  );

  const sequence = () => gridSequence(props.state, rows(), cols(), props.spread);
  const active = () => sequence()[tick() % sequence().length] ?? { x: -1, y: -1 };

  const levels = () => normalizeVolumeBands(props.bands, cols());

  /**
   * While speaking, a cell lights when its column's level clears a threshold
   * that grows with distance from the middle row. Middle cells light at any
   * level, edges need a loud signal, so the grid reads as a spectrum.
   */
  function isLit(index: number): boolean {
    if (props.state === 'speaking') {
      const y = Math.floor(index / cols());
      const mid = Math.floor(rows() / 2);
      const chunk = 1 / (mid + 1);
      const threshold = Math.abs(mid - y) * chunk;
      return (levels()[index % cols()] ?? 0) >= threshold;
    }
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
      <For each={items()}>
        {(index) => {
          // Every column repeats down every row, so a cell's level comes from
          // its column band, not its flat position: index % cols(), not index.
          const item = () => ({
            index,
            highlighted: isLit(index),
            value: levels()[index % cols()] ?? 0,
          });
          return (
            props.children?.(item()) ?? (
              <div
                part="cell"
                data-kai-index={index}
                data-kai-highlighted={isLit(index)}
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
      </For>
    </div>
  );
}
