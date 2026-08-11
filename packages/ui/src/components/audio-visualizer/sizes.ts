/**
 * Size scales for the audio visualizer variants.
 *
 * Values carried from livekit/components-js `packages/shadcn/components/agents-ui/`
 * (Apache License 2.0). Kept as numbers rather than Tailwind classes so bar
 * counts and radii can be interpolated: upstream hardcodes arbitrary values
 * (`w-[4px]`) in cva variants, which cannot vary with a runtime count.
 */

export type VisualizerSize = 'icon' | 'sm' | 'md' | 'lg' | 'xl';

export const SIZES: readonly VisualizerSize[] = ['icon', 'sm', 'md', 'lg', 'xl'];

/** Overall height of the bar and radial containers, in px. */
export const CONTAINER_HEIGHT: Record<VisualizerSize, number> = {
  icon: 24, sm: 56, md: 112, lg: 224, xl: 448,
};

/** Gap between bars, in px. */
export const GAP: Record<VisualizerSize, number> = {
  icon: 2, sm: 4, md: 8, lg: 16, xl: 32,
};

/** Bar width, in px. Doubles as the bar's min-height so a dot shows at zero. */
export const BAR_WIDTH: Record<VisualizerSize, number> = {
  icon: 4, sm: 8, md: 16, lg: 32, xl: 64,
};

/** Grid cell diameter, in px. */
export const GRID_CELL: Record<VisualizerSize, number> = {
  icon: 2, sm: 4, md: 8, lg: 12, xl: 16,
};

/** Grid gap, in px. Note this diverges from GAP above at lg and xl. */
export const GRID_GAP: Record<VisualizerSize, number> = {
  icon: 2, sm: 4, md: 8, lg: 12, xl: 16,
};

/** Distance from center to the radial ring, in px. */
export const RADIAL_RADIUS: Record<VisualizerSize, number> = {
  icon: 6, sm: 16, md: 32, lg: 64, xl: 128,
};

export function defaultBarCount(size: VisualizerSize): number {
  return size === 'icon' || size === 'sm' ? 3 : 5;
}

export function defaultRadialBarCount(size: VisualizerSize): number {
  return size === 'icon' || size === 'sm' ? 12 : 24;
}

export function defaultGridCount(size: VisualizerSize): number {
  return size === 'icon' ? 3 : 5;
}
