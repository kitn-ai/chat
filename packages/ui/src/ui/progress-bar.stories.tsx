import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { ProgressBar } from './progress-bar';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'A thin determinate progress bar: a `value` out of `max` (default 100), clamped to the track. Add a `label` caption above the track. Restyle the track and fill via `::part(track)` / `::part(fill)`.',
      ]),
    },
  },
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      description: 'Current progress, 0 to `max`.',
    },
    max: {
      control: 'number',
      description: 'The value `value` runs to.',
      table: { defaultValue: { summary: '100' } },
    },
    label: {
      control: 'text',
      description: 'Optional caption above the track.',
    },
    tone: {
      control: 'select',
      options: ['primary', 'success', 'warning', 'error', 'info'],
      description: 'Fill color.',
      table: { defaultValue: { summary: 'primary' } },
    },
  },
  args: {
    value: 60,
    max: 100,
    label: '',
  },
  render: (args) => (
    <div class="w-80">
      <ProgressBar {...args} />
    </div>
  ),
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { ProgressBar } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: drag `value` and edit the label. */
export const Playground: Story = {
  ...src(`<ProgressBar value={60} />`),
};

export const Empty: Story = {
  args: { value: 0 },
  ...src(`<ProgressBar value={0} />`),
};

export const Half: Story = {
  args: { value: 50 },
  ...src(`<ProgressBar value={50} />`),
};

export const AlmostDone: Story = {
  name: 'Almost Done',
  args: { value: 90 },
  ...src(`<ProgressBar value={90} />`),
};

export const WithLabel: Story = {
  name: 'With Label',
  args: { value: 35, label: 'Uploading…' },
  ...src(`<ProgressBar value={35} label="Uploading…" />`),
};

/** A custom `max`: a value out of an arbitrary total. */
export const CustomMax: Story = {
  name: 'Custom Max',
  args: { value: 3, max: 5, label: 'Step 3 of 5' },
  ...src(`<ProgressBar value={3} max={5} label="Step 3 of 5" />`),
};

/** Semantic fill hues via `tone` (showcase, not driven by controls). */
export const Tones: Story = {
  render: () => (
    <div class="flex w-80 flex-col gap-4">
      <ProgressBar value={60} tone="primary" label="primary" />
      <ProgressBar value={60} tone="success" label="success" />
      <ProgressBar value={60} tone="warning" label="warning" />
      <ProgressBar value={60} tone="error" label="error" />
      <ProgressBar value={60} tone="info" label="info" />
    </div>
  ),
  ...src(`<div class="flex w-80 flex-col gap-4">
  <ProgressBar value={60} tone="primary" label="primary" />
  <ProgressBar value={60} tone="success" label="success" />
  <ProgressBar value={60} tone="warning" label="warning" />
  <ProgressBar value={60} tone="error" label="error" />
  <ProgressBar value={60} tone="info" label="info" />
</div>`),
};

/** A range of values side by side (showcase, not driven by controls). */
export const Steps: Story = {
  render: () => (
    <div class="flex w-80 flex-col gap-4">
      <ProgressBar value={0} label="0%" />
      <ProgressBar value={25} label="25%" />
      <ProgressBar value={50} label="50%" />
      <ProgressBar value={75} label="75%" />
      <ProgressBar value={100} label="100%" />
    </div>
  ),
  ...src(`<div class="flex w-80 flex-col gap-4">
  <ProgressBar value={0} label="0%" />
  <ProgressBar value={25} label="25%" />
  <ProgressBar value={50} label="50%" />
  <ProgressBar value={75} label="75%" />
  <ProgressBar value={100} label="100%" />
</div>`),
};
