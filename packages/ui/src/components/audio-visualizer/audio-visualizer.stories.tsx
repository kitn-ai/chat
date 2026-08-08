import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, onCleanup, For } from 'solid-js';
import { AudioVisualizer } from './index';
import { componentDescription } from '../../stories/docs/element-controls';
import { SIZES } from './sizes';

const STATES = ['idle', 'connecting', 'listening', 'thinking', 'speaking'] as const;
const VARIANTS = ['bar', 'grid', 'radial'] as const;

const meta = {
  title: 'Components/Elements/AudioVisualizer',
  component: AudioVisualizer,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      controls: {
        exclude: ['use:eventListener', 'stream', 'audioElement', 'shader', 'bands', 'spread', 'interval', 'complexity'],
      },
      description: componentDescription([
        'Renders live audio as bars, a grid, or a ring. Set `stream` or `audioElement` to tap real audio, or `bands` to drive it yourself.',
        'With no audio source at all it animates from `state` alone: idle, connecting, listening, thinking, speaking. That is what drives it when the audio cannot be tapped, like browser speech synthesis, which exposes no audio node.',
        '`wave`, `aurora`, and `custom` also exist on `variant` as WebGL shader looks; they are not covered by these stories.',
      ]),
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: [...VARIANTS],
      description: 'Which DOM look to render.',
      table: { defaultValue: { summary: 'bar' } },
    },
    state: {
      control: 'select',
      options: [...STATES],
      description: 'Drives the scripted animation. `speaking` reads `bands` instead.',
      table: { defaultValue: { summary: 'idle' } },
    },
    size: {
      control: 'select',
      options: [...SIZES],
      description: 'Size preset, icon through xl.',
      table: { defaultValue: { summary: 'md' } },
    },
    barCount: {
      control: { type: 'number', min: 1 },
      description: 'Bar and radial only.',
    },
    rowCount: {
      control: { type: 'number', min: 1 },
      description: 'Grid only.',
    },
    columnCount: {
      control: { type: 'number', min: 1 },
      description: 'Grid only.',
    },
    radius: {
      control: { type: 'number', min: 0 },
      description: 'Radial only: distance from center, in px.',
    },
    color: {
      control: 'color',
      description: 'Overrides the inherited `currentColor`.',
    },
    label: {
      control: 'text',
      description: 'Announces the element as `role="img"` with this text. Omit it and the element stays `aria-hidden`.',
    },
    class: {
      control: 'text',
      description: 'Extra classes on the wrapping element.',
    },
  },
  render: (args) => <AudioVisualizer {...args} />,
} satisfies Meta<typeof AudioVisualizer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bar variant, listening state: the scripted center-blink idle-conversation look. */
export const Default: Story = {
  args: { variant: 'bar', state: 'listening', size: 'md' },
};

/**
 * Synthetic levels so the speaking state animates without a microphone.
 * A NEW array reference every tick: mutating in place would not re-render.
 */
function useFakeBands(count: number) {
  const [bands, setBands] = createSignal<number[]>(new Array(count).fill(0));
  const id = setInterval(() => {
    setBands(Array.from({ length: count }, (_, i) => 0.25 + 0.7 * Math.abs(Math.sin(Date.now() / 400 + i))));
  }, 60);
  onCleanup(() => clearInterval(id));
  return bands;
}

export const Speaking: Story = {
  parameters: {
    docs: { description: { story: 'Driven by synthetic levels. Set `bands` to a new array reference per frame; mutating in place does not re-render.' } },
  },
  render: () => {
    const bands = useFakeBands(5);
    return <AudioVisualizer variant="bar" state="speaking" size="md" bands={bands()} />;
  },
};

export const Variants: Story = {
  parameters: {
    docs: { description: { story: 'The three DOM-rendered variants, same state and size.' } },
  },
  render: () => (
    <div style={{ display: 'flex', gap: '48px', 'align-items': 'center' }}>
      <For each={VARIANTS}>
        {(v) => (
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'align-items': 'center' }}>
            <AudioVisualizer variant={v} state="listening" size="md" />
            <code style={{ 'font-size': '11px', opacity: 0.6 }}>{v}</code>
          </div>
        )}
      </For>
    </div>
  ),
};

export const StateMatrix: Story = {
  parameters: {
    docs: { description: { story: 'Every DOM variant against every state. The scripted sequences are most of this component\'s behavior, and each state looks different. `speaking` uses synthetic levels.' } },
  },
  render: () => {
    const bands = useFakeBands(5);
    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '32px' }}>
        <For each={VARIANTS}>
          {(v) => (
            <div style={{ display: 'flex', 'align-items': 'center', gap: '24px' }}>
              <code style={{ width: '48px', 'font-size': '11px', opacity: 0.6 }}>{v}</code>
              <div style={{ display: 'flex', gap: '32px' }}>
                <For each={STATES}>
                  {(s) => (
                    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'align-items': 'center' }}>
                      <AudioVisualizer variant={v} state={s} size="sm" bands={bands()} />
                      <code style={{ 'font-size': '11px', opacity: 0.6 }}>{s}</code>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    );
  },
};

export const Sizes: Story = {
  parameters: {
    docs: { description: { story: 'The full size scale, icon through xl.' } },
  },
  render: () => (
    <div style={{ display: 'flex', gap: '32px', 'align-items': 'flex-end', 'flex-wrap': 'wrap' }}>
      <For each={SIZES}>
        {(size) => (
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'align-items': 'center' }}>
            <AudioVisualizer variant="bar" state="listening" size={size} />
            <code style={{ 'font-size': '11px', opacity: 0.6 }}>{size}</code>
          </div>
        )}
      </For>
    </div>
  ),
};
