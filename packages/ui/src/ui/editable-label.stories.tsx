import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { EditableLabel } from './editable-label';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Elements/EditableLabel',
  component: EditableLabel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener', 'onRename', 'onCancel'] },
      description: componentDescription([
        'Inline rename. Shows `value` as text; double-click (or the `editing` prop, or a host `edit()`) swaps in an autofocused field with the text pre-selected. Enter or blur commits (fires `onRename` only when the value changed); Esc cancels (fires `onCancel`, restores the text).',
      ]),
    },
  },
  argTypes: {
    value: { control: 'text', description: 'The label text.' },
    placeholder: { control: 'text', description: 'Placeholder while editing / when empty.' },
    editing: { control: 'boolean', description: 'Controlled edit state.' },
    disabled: { control: 'boolean', description: 'Disable entering edit mode.' },
  },
  args: { value: 'Project Alpha', placeholder: 'Untitled', editing: false, disabled: false },
  // The primitive shows the renamed value optimistically, so no wrapper signal is
  // needed to demo a commit.
  render: (args) => <EditableLabel {...args} onRename={(v) => console.log('rename', v)} />,
} satisfies Meta<typeof EditableLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { EditableLabel } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Double-click the text to rename. Enter or blur commits; Esc reverts. */
export const Playground: Story = {
  ...src(`const [name, setName] = createSignal('Project Alpha');
<EditableLabel value={name()} onRename={setName} />`),
};

/** Empty value falls back to the muted placeholder. */
export const WithPlaceholder: Story = {
  args: { value: '', placeholder: 'Untitled note' },
  ...src(`<EditableLabel value="" placeholder="Untitled note" onRename={save} />`),
};

/** Open in edit mode via the controlled `editing` prop. */
export const StartEditing: Story = {
  args: { value: 'Rename me', editing: true },
  ...src(`<EditableLabel value="Rename me" editing onRename={save} />`),
};

/** Disabled: the text never enters edit mode. */
export const Disabled: Story = {
  args: { value: 'Locked name', disabled: true },
  ...src(`<EditableLabel value="Locked name" disabled />`),
};

/** Inline next to other text, the usual list-row rename pattern. */
export const Inline: Story = {
  render: () => (
    <div class="flex items-center gap-2 text-sm text-foreground">
      <span class="text-muted-foreground">Workspace</span>
      <span aria-hidden="true">/</span>
      <EditableLabel value="Project Alpha" onRename={(v) => console.log(v)} />
    </div>
  ),
  ...src(`<div class="flex items-center gap-2 text-sm">
  <span class="text-muted-foreground">Workspace</span>
  <span>/</span>
  <EditableLabel value="Project Alpha" onRename={save} />
</div>`),
};
