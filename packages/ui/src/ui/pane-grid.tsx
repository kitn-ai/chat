import { For, children as resolveChildren } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';

export interface PaneGridProps {
  /** The panes - arbitrary N. Each top-level child is one tile in the grid. */
  children: JSX.Element;
  /** Minimum width of every pane, in px, before columns drop / the grid scrolls.
   *  Defaults to `280`. */
  minPaneWidth?: number;
  /** Minimum height of every pane, in px, before the grid scrolls vertically.
   *  Defaults to `200`. */
  minPaneHeight?: number;
  /** Column cap when the container is wide. Columns fill up to this many, then drop
   *  to fewer as the container narrows. Defaults to `3`. */
  maxColumns?: number;
  /** Gap between panes - any CSS length. Defaults to the kit gap
   *  (`var(--kai-pane-grid-gap, 0.5rem)`). */
  gap?: string;
  /** When set to a valid child index, render ONLY that pane full-bleed (a single
   *  filling cell) - a simple maximize hook the consumer drives. `null`/`undefined`
   *  (or an out-of-range index) shows the full tiled grid. */
  maximizedIndex?: number | null;
  /** Extra classes for the grid container. */
  class?: string;
}

/**
 * PaneGrid - an N-pane responsive tiling grid with a min-size + scroll floor.
 *
 * Lays an arbitrary number of panes out in a CSS grid that fills up to
 * `maxColumns` columns when wide, then DROPS columns (maxColumns -> ... -> 1) as
 * the container narrows - so panes never squish below their minimums. Once even one
 * column can't hold a pane at `minPaneWidth`, the grid SCROLLS instead of shrinking
 * the panes; rows are kept at least `minPaneHeight` tall the same way. Because new
 * rows stack downward, the overflow is preferentially VERTICAL - horizontal scroll
 * only appears when the container is narrower than a single pane's minimum.
 *
 * This generalizes the hand-rolled center grid from the Split Workspace demo, where
 * `kai-resizable` (capped at 3 panes) couldn't express an arbitrary-N tiled grid.
 *
 * Column track (computed from the props):
 *
 *   repeat(auto-fit, minmax(max(<minPaneWidth>px, (100% - <gaps>) / <maxColumns>), 1fr))
 *
 * where `<gaps>` is the total inter-column gap at the cap, `(maxColumns - 1) * gap`.
 * The inner `max()` is the floor: each track is at least `minPaneWidth`, and at most
 * `1fr`; the `(100% - gaps) / maxColumns` term is the per-column width WHEN the cap is
 * filled, so `auto-fit` never packs in more than `maxColumns` columns. As the
 * container shrinks past the point where a column can be `minPaneWidth` wide, a column
 * drops; below one pane's minimum, the `overflow:auto` + `min-w-0`/`min-h-0` container
 * scrolls.
 *
 * Maximize: when `maximizedIndex` points at a child, only that pane renders, in a
 * single `1fr` x `1fr` cell that fills the grid. Restore by clearing the prop.
 *
 * The gap default reads `--kai-pane-grid-gap` (fallback `0.5rem`), so a consumer can
 * retune spacing from outside without passing the prop. Everything is tokenized
 * (surface/border come from whatever the panes use) - no hardcoded colors, so it
 * reads correctly in light and dark.
 */
export function PaneGrid(props: PaneGridProps) {
  const minPaneWidth = () => props.minPaneWidth ?? 280;
  const minPaneHeight = () => props.minPaneHeight ?? 200;
  const maxColumns = () => Math.max(1, props.maxColumns ?? 3);
  const gap = () => props.gap ?? 'var(--kai-pane-grid-gap, 0.5rem)';

  // Resolve children to their rendered nodes so a single pane can be picked out for
  // the maximize hook (mirrors how Resizable reads its panels).
  const resolved = resolveChildren(() => props.children);
  const items = (): JSX.Element[] => resolved.toArray() as JSX.Element[];

  // A valid maximize target, or null for the full grid.
  const maxIndex = (): number | null => {
    const m = props.maximizedIndex;
    if (m == null) return null;
    return m >= 0 && m < items().length ? m : null;
  };

  const shown = (): JSX.Element[] => {
    const m = maxIndex();
    return m == null ? items() : [items()[m]];
  };

  const gridStyle = (): JSX.CSSProperties => {
    const g = gap();
    if (maxIndex() != null) {
      // One filling cell.
      return {
        'grid-template-columns': '1fr',
        'grid-auto-rows': '1fr',
        gap: g,
      };
    }
    const cols = maxColumns();
    // The per-column width when the cap is filled: (container - all gaps) / cols.
    // Inside max() this is a math sub-expression, so the var/number arithmetic is valid.
    const capped = `(100% - ${cols - 1} * ${g}) / ${cols}`;
    return {
      'grid-template-columns': `repeat(auto-fit, minmax(max(${minPaneWidth()}px, ${capped}), 1fr))`,
      'grid-auto-rows': `minmax(${minPaneHeight()}px, 1fr)`,
      gap: g,
    };
  };

  return (
    <div
      data-pane-grid
      // min-w-0 / min-h-0 let the grid shrink inside a flex/grid parent so its own
      // overflow:auto (not the parent) takes over once panes hit their minimums.
      class={cn('grid h-full w-full min-h-0 min-w-0 overflow-auto', props.class)}
      tabindex={0}
      style={gridStyle()}
    >
      <For each={shown()}>{(pane) => pane}</For>
    </div>
  );
}
