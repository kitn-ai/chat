/**
 * The layout axis — "where does the chat live", the question a builder actually
 * starts from. It was previously buried inside each archetype as
 * `defaultPlacement`.
 *
 * `placement` is the value handed to `renderSurface`, so this table is the
 * translation between the CLI's question and the renderer's vocabulary and the
 * two never have to agree by convention.
 */
import type { Layout, WidgetStyle } from './types';

export interface LayoutDef {
  id: Layout;
  label: string;
  hint: string;
  /** `renderSurface`'s `placement` for this layout */
  placement: string;
  status: 'ready' | 'planned';
  note?: string;
}

export const LAYOUTS: readonly LayoutDef[] = [
  {
    id: 'full-screen',
    label: 'Full-screen app',
    hint: 'the chat is the page',
    placement: 'full-page',
    status: 'ready',
  },
  {
    id: 'widget',
    label: 'Embedded widget',
    hint: 'the chat sits on top of an existing page',
    placement: 'docked-widget',
    // A widget has no composed-workspace starter — it is a generated surface at
    // `docked-widget` placement — so it lands on the same unwired path the
    // generated features do. Offered once that path has been run.
    status: 'planned',
    note: 'needs the generated-surface path, not wired in this release',
  },
];

export const WIDGET_STYLES: readonly { id: WidgetStyle; label: string; hint: string }[] = [
  { id: 'fab', label: 'Floating bubble', hint: 'bottom-right launcher, opens a panel' },
  { id: 'side', label: 'Docked side panel', hint: 'a drawer pinned to one edge' },
];

export function getLayout(id: string): LayoutDef | undefined {
  return LAYOUTS.find((l) => l.id === id);
}

export function readyLayouts(): LayoutDef[] {
  return LAYOUTS.filter((l) => l.status === 'ready');
}
