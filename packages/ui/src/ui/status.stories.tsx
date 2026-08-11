import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Status } from './status';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/Status',
  component: Status,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'A presence dot. `status` picks the hue (`new`, `online`, `busy`, `away`, `offline`), `size` is `sm` or `md`, and `pulse` adds an animated ping ring. Pass `label` to announce it; without one the dot is decorative.',
      ]),
    },
  },
  argTypes: {
    status: {
      control: 'select',
      options: ['new', 'online', 'busy', 'away', 'offline'],
      description: 'Presence hue.',
      table: { defaultValue: { summary: 'new' } },
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'Dot size.',
      table: { defaultValue: { summary: 'sm' } },
    },
    pulse: {
      control: 'boolean',
      description: 'Animated ping ring (off under prefers-reduced-motion).',
    },
    label: {
      control: 'text',
      description: 'Accessible name. With it the dot is announced; without it it is decorative.',
    },
  },
  args: {
    status: 'online',
    size: 'sm',
    pulse: false,
    label: '',
  },
  render: (args) => <Status {...args} />,
} satisfies Meta<typeof Status>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Status } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: pick a hue, size, and toggle the pulse. */
export const Playground: Story = {
  ...src(`<Status status="online" size="sm" />`),
};

/** Every hue side by side, each with an accessible label. */
export const Hues: Story = {
  render: () => (
    <div class="flex items-center gap-5">
      <Status status="new" label="New" />
      <Status status="online" label="Online" />
      <Status status="busy" label="Busy" />
      <Status status="away" label="Away" />
      <Status status="offline" label="Offline" />
    </div>
  ),
  ...src(`<div class="flex items-center gap-5">
  <Status status="new" label="New" />
  <Status status="online" label="Online" />
  <Status status="busy" label="Busy" />
  <Status status="away" label="Away" />
  <Status status="offline" label="Offline" />
</div>`),
};

/** A live indicator with the animated ping ring. */
export const Pulse: Story = {
  args: { status: 'online', pulse: true, label: 'Live' },
  ...src(`<Status status="online" pulse label="Live" />`),
};

/** Both sizes for comparison. */
export const Sizes: Story = {
  render: () => (
    <div class="flex items-center gap-5">
      <Status status="online" size="sm" label="Small" />
      <Status status="online" size="md" label="Medium" />
    </div>
  ),
  ...src(`<div class="flex items-center gap-5">
  <Status status="online" size="sm" />
  <Status status="online" size="md" />
</div>`),
};

/** Inline next to a label, the usual presence pattern. */
export const Inline: Story = {
  render: () => (
    <div class="flex items-center gap-2 text-sm text-foreground">
      <Status status="online" pulse label="Online" />
      <span>Acme Assistant</span>
    </div>
  ),
  ...src(`<div class="flex items-center gap-2 text-sm">
  <Status status="online" pulse label="Online" />
  <span>Acme Assistant</span>
</div>`),
};
