import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { Tabs, type KaiTabItem } from './tabs';
import { componentDescription } from '../stories/docs/element-controls';

const ITEMS: KaiTabItem[] = [
  { id: 'chat', label: 'Chat', icon: 'message-circle' },
  { id: 'cowork', label: 'Cowork' },
  { id: 'code', label: 'Code', icon: 'code' },
];

const meta = {
  title: 'Components/Primitives/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'A selection-only tab strip (you render each tab\'s content). Pass `items` (`id`, `label`, optional `icon` / `disabled`); `value` is the selected id and `onChange` fires with the new id. `variant` is `segmented` or `underline`; `block` stretches it full width. Roving tabindex with Arrow/Home/End keys.',
      ]),
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['segmented', 'underline'],
      description: 'Visual style of the strip.',
      table: { defaultValue: { summary: 'segmented' } },
    },
    block: {
      control: 'boolean',
      description: 'Stretch full width, tabs sharing the space equally.',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the whole strip.',
    },
    value: {
      control: 'select',
      options: ITEMS.map((i) => i.id),
      description: 'Selected item id.',
    },
    onChange: {
      action: 'change',
      description: 'Fired with the newly selected item id.',
      table: { category: 'Events' },
    },
  },
  args: {
    variant: 'segmented',
    block: false,
    disabled: false,
    value: 'chat',
  },
  render: (args) => {
    const [value, setValue] = createSignal(args.value ?? 'chat');
    return (
      <Tabs
        items={ITEMS}
        variant={args.variant}
        block={args.block}
        disabled={args.disabled}
        value={value()}
        onChange={(v) => { setValue(v); args.onChange?.(v); }}
      />
    );
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Tabs } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: switch tabs, flip the variant, toggle block. */
export const Playground: Story = {
  ...src(`const [tab, setTab] = createSignal('chat');

<Tabs
  items={[
    { id: 'chat', label: 'Chat', icon: 'message-circle' },
    { id: 'cowork', label: 'Cowork' },
    { id: 'code', label: 'Code', icon: 'code' },
  ]}
  value={tab()}
  onChange={setTab}
/>`),
};

/** The segmented (pill) variant. */
export const Segmented: Story = {
  args: { variant: 'segmented', value: 'chat' },
  ...src(`<Tabs variant="segmented" items={items} value={tab()} onChange={setTab} />`),
};

/** The underline variant. */
export const Underline: Story = {
  args: { variant: 'underline', value: 'code' },
  ...src(`<Tabs variant="underline" items={items} value={tab()} onChange={setTab} />`),
};

/** Full width, tabs sharing the space equally. */
export const Block: Story = {
  args: { variant: 'underline', block: true, value: 'cowork' },
  ...src(`<Tabs variant="underline" block items={items} value={tab()} onChange={setTab} />`),
};

/** The whole strip disabled. */
export const Disabled: Story = {
  args: { disabled: true, value: 'chat' },
  ...src(`<Tabs disabled items={items} value={tab()} onChange={setTab} />`),
};
