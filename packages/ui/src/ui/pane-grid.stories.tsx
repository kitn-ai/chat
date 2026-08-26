import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, For, Show, type JSX } from 'solid-js';
import { PaneGrid } from './pane-grid';
import { Button } from './button';
import { componentDescription } from '../stories/docs/element-controls';

// --- Story helpers -------------------------------------------------------

/** A simple placeholder pane: a bordered card with a header and filler body, kept
 *  min-w-0/min-h-0 + overflow-hidden so it behaves like a real tile. Tokens only. */
const Pane = (props: { n: number; children?: JSX.Element }) => (
  <section class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-foreground">
    <header class="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
      <span class="grid size-5 place-items-center rounded bg-primary/10 text-caption font-semibold text-primary">
        {props.n}
      </span>
      <span class="truncate text-xs font-semibold">Pane {props.n}</span>
    </header>
    <div class="min-h-0 flex-1 overflow-auto p-3 text-xs text-muted-foreground">
      {props.children ?? 'Content floors at the min size, then scrolls instead of squishing.'}
    </div>
  </section>
);

/** A draggable container so you can narrow the grid and watch columns drop / it
 *  scroll. Native `resize: both` gives a corner handle; `overflow:hidden` here lets
 *  the PaneGrid own its own scroll. */
const Resizer = (props: { children: JSX.Element; width?: number; height?: number }) => (
  <div
    style={{
      resize: 'both',
      overflow: 'hidden',
      width: `${props.width ?? 880}px`,
      height: `${props.height ?? 520}px`,
      'min-width': '260px',
      'max-width': '100%',
      'min-height': '240px',
    }}
    class="rounded-xl border border-border bg-surface p-2 shadow-sm"
  >
    {props.children}
  </div>
);

const Note = (props: { children: JSX.Element }) => (
  <p class="mb-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">{props.children}</p>
);

const PANES = [1, 2, 3, 4, 5, 6];

const meta = {
  title: 'Components/Elements/Pane Grid',
  component: PaneGrid,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['children', 'maximizedIndex'] },
      description: componentDescription([
        'An N-pane responsive tiling grid with a min-size + scroll floor. Fills up to `maxColumns` columns when wide, then drops columns (3 -> 2 -> 1) as the container narrows so panes never squish below their minimums; once a pane can no longer fit at its minimum, the grid scrolls (vertically first) instead of shrinking. Generalizes the hand-rolled center grid from the Split Workspace demo - `kai-resizable` caps at 3 panes, this takes arbitrary N.',
        'Set `maximizedIndex` to render a single pane full-bleed; clear it to restore the grid.',
      ]),
    },
  },
  argTypes: {
    minPaneWidth: { control: { type: 'number', min: 120, step: 20 }, description: 'Min pane width in px before columns drop / the grid scrolls (default 280).' },
    minPaneHeight: { control: { type: 'number', min: 80, step: 20 }, description: 'Min pane height in px before the grid scrolls vertically (default 200).' },
    maxColumns: { control: { type: 'number', min: 1, max: 6, step: 1 }, description: 'Column cap when wide; columns drop to fewer as it narrows (default 3).' },
    gap: { control: 'text', description: 'Gap between panes (any CSS length). Defaults to the kit gap.' },
    maximizedIndex: { control: false, description: 'Index of the pane to render full-bleed, or null for the full grid.' },
    children: { control: false, description: 'The panes - arbitrary N.' },
    class: { control: 'text', description: 'Extra classes for the grid container.' },
  },
  render: (args) => (
    <Resizer>
      <PaneGrid {...args}>
        <For each={PANES}>{(n) => <Pane n={n} />}</For>
      </PaneGrid>
    </Resizer>
  ),
} satisfies Meta<typeof PaneGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { PaneGrid } from '@kitn.ai/ui/solid';`;

/** Six panes in a draggable container. Wide = 3 columns; drag the corner handle in
 *  to narrow it and watch columns drop to 2 then 1, then the grid scroll - the panes
 *  hold their min size the whole way. */
export const Default: Story = {
  name: 'Default (resize me)',
  render: () => (
    <div>
      <Note>
        Drag the corner handle to narrow the container. Columns drop from 3 to 2 to 1 as
        it narrows; once a pane can't fit at its min width (280px) the grid scrolls instead
        of squishing. Panes also keep a min height (200px), so the grid grows downward
        (vertical scroll) before anything horizontal.
      </Note>
      <Resizer>
        <PaneGrid>
          <For each={PANES}>{(n) => <Pane n={n} />}</For>
        </PaneGrid>
      </Resizer>
    </div>
  ),
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        code: `${IMPORT}

// Fills up to maxColumns (default 3) when wide, drops columns then scrolls as it
// narrows - panes never go below minPaneWidth (280) / minPaneHeight (200).
<PaneGrid>
  <For each={panes}>{(n) => <Pane n={n} />}</For>
</PaneGrid>`,
      },
    },
  },
};

/** Forced narrow so the dropped-columns + scroll behavior is visible without dragging
 *  (this is roughly what the wide story looks like once you pull the handle in). */
export const Narrow: Story = {
  name: 'Narrow (columns drop + scroll)',
  render: () => (
    <div>
      <Note>
        A 360px-wide container: the 3-column cap has collapsed to a single column and the
        six panes stack, so the grid scrolls vertically. The panes stay at their min size
        rather than squishing to fit.
      </Note>
      <div
        style={{ width: '360px', height: '460px', overflow: 'hidden' }}
        class="rounded-xl border border-border bg-surface p-2 shadow-sm"
      >
        <PaneGrid>
          <For each={PANES}>{(n) => <Pane n={n} />}</For>
        </PaneGrid>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        code: `${IMPORT}

// In a 360px-wide box the 3-col cap drops to 1 and the grid scrolls vertically.
<div style={{ width: '360px', height: '460px', overflow: 'hidden' }}>
  <PaneGrid>
    <For each={panes}>{(n) => <Pane n={n} />}</For>
  </PaneGrid>
</div>`,
      },
    },
  },
};

/** The maximize hook: a control toggles `maximizedIndex` so one pane fills the grid;
 *  clearing it restores the tile layout. */
export const Maximized: Story = {
  render: () => {
    const [max, setMax] = createSignal<number | null>(2);
    return (
      <div>
        <Note>
          `maximizedIndex` renders a single pane full-bleed. Pick one, or restore the grid.
        </Note>
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <For each={PANES}>
            {(n) => (
              <Button
                size="sm"
                variant={max() === n - 1 ? 'default' : 'outline'}
                onClick={() => setMax(n - 1)}
              >
                Pane {n}
              </Button>
            )}
          </For>
          <Button size="sm" variant="ghost" onClick={() => setMax(null)}>
            Restore grid
          </Button>
        </div>
        <Resizer height={460}>
          <PaneGrid maximizedIndex={max()}>
            <For each={PANES}>{(n) => <Pane n={n} />}</For>
          </PaneGrid>
        </Resizer>
      </div>
    );
  },
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        code: `${IMPORT}

const [max, setMax] = createSignal<number | null>(2);

// Set maximizedIndex to a child index to render only that pane full-bleed;
// pass null (or an out-of-range index) for the full tiled grid.
<PaneGrid maximizedIndex={max()}>
  <For each={panes}>{(n) => <Pane n={n} />}</For>
</PaneGrid>`,
      },
    },
  },
};
