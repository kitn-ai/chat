import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { For } from 'solid-js';
import { ScrollArea } from './scroll-area';
import { componentDescription } from '../stories/docs/element-controls';

/** Enough rows to overflow vertically, each wide enough to overflow horizontally,
 *  so switching `orientation` visibly changes which axis scrolls. */
const Rows = () => (
  <ul class="space-y-1">
    <For each={Array.from({ length: 24 }, (_, i) => i + 1)}>
      {(n) => (
        <li class="w-[32rem] whitespace-nowrap rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted">
          Conversation {n}: a title long enough to run past the right edge
        </li>
      )}
    </For>
  </ul>
);

const meta = {
  title: 'Components/Primitives/ScrollArea',
  component: ScrollArea,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    // `ScrollArea` extends the div HTML attributes, so docgen offers every one of
    // them (`inert`, `children`, …). Those are plain DOM attributes that say
    // nothing about this component, so the panel is pinned to the two props that
    // are actually its API. This has to sit at `parameters.controls`, NOT under
    // `parameters.docs.controls`: the latter filters only the autodocs table and
    // leaves the Controls panel showing every inferred row.
    controls: { include: ['orientation', 'class'] },
    docs: {
      description: componentDescription([
        'A bounded container with thin, themed scrollbars over native overflow (no scroll hijacking). Set a height via `class`; overflowing content scrolls.',
        '`orientation` picks the scrolling axis: `vertical` (default), `horizontal`, or `both`. The cross axis is clamped to `hidden` so content cannot overflow it.',
      ]),
    },
  },
  argTypes: {
    orientation: {
      control: 'inline-radio',
      options: ['vertical', 'horizontal', 'both'],
      description: 'Which axis scrolls. The cross axis is clamped to `hidden`.',
      table: { defaultValue: { summary: 'vertical' } },
    },
    class: {
      control: 'text',
      description: 'Classes for the box. Give it a height, this component has no size of its own.',
    },
  },
  args: {
    orientation: 'vertical',
    class: 'h-56 w-72 rounded-lg border border-border p-2',
  },
  render: (args) => (
    <ScrollArea {...args}>
      <Rows />
    </ScrollArea>
  ),
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { ScrollArea } from '@kitn.ai/ui';`;

/** A bounded list that scrolls. Switch `orientation` to watch the axis change.
 *  Note macOS hides overlay scrollbars until you scroll. */
export const Playground: Story = {
  parameters: {
    docs: {
      source: {
        code: `${IMPORT}
import { For } from 'solid-js';

const conversations = Array.from({ length: 24 }, (_, i) => \`Conversation \${i + 1}\`);

<ScrollArea orientation="vertical" class="h-56 w-72 rounded-lg border p-2">
  <ul class="space-y-1">
    <For each={conversations}>
      {(title) => (
        <li class="rounded-md px-3 py-2 text-sm hover:bg-muted">{title}</li>
      )}
    </For>
  </ul>
</ScrollArea>`,
        language: 'tsx',
      },
    },
  },
};

/** `orientation="both"` lets the box scroll on either axis. */
export const BothAxes: Story = {
  args: { orientation: 'both' },
  parameters: {
    docs: { source: { code: `${IMPORT}\n\n<ScrollArea orientation="both" class="h-56 w-72 rounded-lg border p-2">…</ScrollArea>`, language: 'tsx' } },
  },
};
