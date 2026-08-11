import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { fn } from 'storybook/test';
import { CommandList, type CommandGroup } from './command';
import { componentDescription } from '../stories/docs/element-controls';

/** Two groups of rows. Icons are curated names from `NAMED_ICONS`. */
const SAMPLE_GROUPS: CommandGroup[] = [
  {
    group: 'Suggestions',
    items: [
      { id: 'summarize', label: 'Summarize', icon: 'sparkles', description: 'Condense the thread', shortcut: 'Mod+K' },
      { id: 'search', label: 'Search the web', icon: 'globe', description: 'Look something up', shortcut: 'Alt+1' },
      { id: 'code', label: 'Write code', icon: 'code' },
    ],
  },
  {
    group: 'Files',
    items: [
      { id: 'notes', label: 'notes.md', icon: 'file-text', description: '~/notes.md', shortcut: 'Mod+Shift+O' },
      { id: 'src', label: 'src', icon: 'folder' },
    ],
  },
];

const meta = {
  title: 'Components/Elements/Command',
  component: CommandList,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['groups', 'onSelect', 'id', 'use:eventListener'] },
      description: componentDescription([
        'A presentational grouped listbox for command / mention palettes. Each `groups` entry is an optional section header plus rows (`id`, `label`, optional `icon`, `description`, and a `shortcut` shown as right-aligned key caps). Rows are `role="option"` buttons; clicking one calls `onSelect(id)`. With no items it renders `emptyLabel`.',
      ]),
    },
  },
  argTypes: {
    activeId: {
      control: 'text',
      description: 'The id of the highlighted row.',
    },
    emptyLabel: {
      control: 'text',
      description: 'Shown when no group has items.',
      table: { defaultValue: { summary: 'No results' } },
    },
    ariaLabel: {
      control: 'text',
      description: 'Accessible name for the listbox.',
      table: { defaultValue: { summary: 'Command palette' } },
    },
  },
  args: {
    groups: SAMPLE_GROUPS,
    activeId: 'summarize',
    onSelect: fn(),
  },
  render: (args) => (
    <div class="max-w-xs overflow-hidden rounded-lg border border-border py-1">
      <CommandList {...args} />
    </div>
  ),
} satisfies Meta<typeof CommandList>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { CommandList } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: tweak the active row and labels. */
export const Playground: Story = {
  ...src(`<CommandList
  groups={[
    { group: 'Suggestions', items: [
      { id: 'summarize', label: 'Summarize', icon: 'sparkles', description: 'Condense the thread', shortcut: 'Mod+K' },
      { id: 'search', label: 'Search the web', icon: 'globe', shortcut: 'Alt+1' },
    ] },
    { group: 'Files', items: [
      { id: 'notes', label: 'notes.md', icon: 'file-text', description: '~/notes.md' },
    ] },
  ]}
  activeId="summarize"
  onSelect={(id) => console.log(id)}
/>`),
};

/** Track the selection in state so the active row follows clicks. */
function SelectableDemo() {
  const [active, setActive] = createSignal('summarize');
  return (
    <div class="max-w-xs overflow-hidden rounded-lg border border-border py-1">
      <CommandList groups={SAMPLE_GROUPS} activeId={active()} onSelect={setActive} />
    </div>
  );
}

export const Selectable: Story = {
  render: () => <SelectableDemo />,
  ...src(`const [active, setActive] = createSignal('summarize');

<CommandList groups={groups} activeId={active()} onSelect={setActive} />`),
};

/** Rows without descriptions read as a compact menu. */
export const LabelsOnly: Story = {
  render: () => (
    <div class="max-w-xs overflow-hidden rounded-lg border border-border py-1">
      <CommandList
        groups={[
          {
            items: [
              { id: 'new', label: 'New chat', icon: 'square-pen' },
              { id: 'search', label: 'Search', icon: 'search' },
              { id: 'settings', label: 'Settings', icon: 'settings' },
            ],
          },
        ]}
        activeId="new"
        onSelect={() => {}}
      />
    </div>
  ),
  ...src(`<CommandList
  groups={[{ items: [
    { id: 'new', label: 'New chat', icon: 'square-pen' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ] }]}
  onSelect={(id) => console.log(id)}
/>`),
};

/** No matching items falls back to `emptyLabel`. */
export const Empty: Story = {
  args: {
    groups: [{ group: 'Files', items: [] }],
    emptyLabel: 'No matches',
  },
  ...src(`<CommandList groups={[]} emptyLabel="No matches" onSelect={(id) => console.log(id)} />`),
};
