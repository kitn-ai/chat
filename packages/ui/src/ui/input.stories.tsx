import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Search } from 'lucide-solid';
import { Input } from './input';
import { Button } from './button';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: {
        exclude: ['leading', 'trailing', 'onValueInput', 'onValueChange', 'class', 'children'],
      },
      description: componentDescription([
        'The token-themed single-line text field. A `label`, `hint`, and `error` stack around a field row that holds an optional `leading` affix, the `<input>`, and an optional `trailing` affix. Pick density with `size`. Set `invalid` (or a non-empty `error`) for the destructive state.',
      ]),
    },
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'Control density.',
      table: { defaultValue: { summary: 'md' } },
    },
    label: { control: 'text', description: 'Field label, linked to the input.' },
    hint: { control: 'text', description: 'Helper text below the control.' },
    error: { control: 'text', description: 'Error text; flips the field invalid.' },
    placeholder: { control: 'text' },
    disabled: { control: 'boolean' },
    invalid: { control: 'boolean', description: 'Force the invalid state without an error string.' },
  },
  args: {
    size: 'md',
    placeholder: 'Acme Inc.',
    disabled: false,
    invalid: false,
  },
  render: (args) => (
    <div class="max-w-sm">
      <Input {...args} />
    </div>
  ),
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Input } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: toggle the controls to explore the field. */
export const Default: Story = {
  ...src(`<Input placeholder="Acme Inc." onValueInput={setName} />`),
};

/** A labelled field with helper text below it. */
export const WithLabelHint: Story = {
  args: { label: 'Workspace name', hint: 'Shown to everyone you invite.' },
  ...src(`<Input
  label="Workspace name"
  hint="Shown to everyone you invite."
  placeholder="Acme Inc."
/>`),
};

/** The invalid state: a destructive border with the error text linked for a11y. */
export const Error: Story = {
  args: { label: 'Workspace name', value: 'a', error: 'Use at least 3 characters.' },
  ...src(`<Input
  label="Workspace name"
  value="a"
  error="Use at least 3 characters."
/>`),
};

/** Both densities, side by side. */
export const Sizes: Story = {
  render: () => (
    <div class="flex max-w-sm flex-col gap-3">
      <Input size="sm" placeholder="Small" />
      <Input size="md" placeholder="Medium (default)" />
    </div>
  ),
  ...src(`<Input size="sm" placeholder="Small" />
<Input size="md" placeholder="Medium (default)" />`),
};

/** Affixes: a leading search icon and a trailing inline button, wrapped by the field border. */
export const WithLeadingIconAndTrailingButton: Story = {
  render: () => (
    <div class="max-w-sm">
      <Input
        placeholder="Search projects"
        leading={<Search class="size-4" aria-hidden="true" />}
        trailing={<Button size="sm">Go</Button>}
      />
    </div>
  ),
  parameters: {
    docs: {
      source: {
        language: 'tsx',
        code: `import { Input, Button } from '@kitn.ai/ui/solid';
import { Search } from 'lucide-solid';

<Input
  placeholder="Search projects"
  leading={<Search class="size-4" aria-hidden="true" />}
  trailing={<Button size="sm">Go</Button>}
/>`,
      },
    },
  },
};
