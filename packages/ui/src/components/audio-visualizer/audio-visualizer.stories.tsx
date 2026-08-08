import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, onCleanup, For } from 'solid-js';
import { AudioVisualizer } from './index';
import { componentDescription } from '../../stories/docs/element-controls';
import { SIZES } from './sizes';

const STATES = ['idle', 'connecting', 'listening', 'thinking', 'speaking'] as const;
const VARIANTS = ['bar', 'grid', 'radial'] as const;
/** Every look, including the WebGL ones, for the `variant` control. */
const ALL_VARIANTS = ['bar', 'grid', 'radial', 'wave', 'aurora', 'custom'] as const;

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
        'Renders live audio as bars, a grid, a ring, a wave, or a glowing aurora. Set `stream` or `audioElement` to tap real audio, or `bands` to drive it yourself.',
        'With no audio source at all it animates from `state` alone: idle, connecting, listening, thinking, speaking. That is what drives it when the audio cannot be tapped, like browser speech synthesis, which exposes no audio node.',
        '`wave`, `aurora`, and `custom` render through WebGL behind a dynamic import, and fall back to bars if that fails or WebGL is unavailable. See ShaderVariants, AuroraStates, and CustomShader below. A live-microphone story is deliberately excluded: it would prompt for a permission Storybook cannot answer.',
      ]),
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: [...ALL_VARIANTS],
      description: 'Which look to render. `wave`, `aurora`, and `custom` render through WebGL; `custom` needs a `shader` to draw anything.',
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

export const ShaderVariants: Story = {
  parameters: {
    docs: { description: { story: 'Wave and aurora render through WebGL. Both load on demand and fall back to bars where WebGL is unavailable.' } },
  },
  render: () => (
    <div style={{ display: 'flex', gap: '32px', 'align-items': 'center' }}>
      <AudioVisualizer variant="wave" state="listening" size="md" />
      <AudioVisualizer variant="aurora" state="listening" size="md" />
    </div>
  ),
};

export const AuroraStates: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The aurora across every state. Compare against the reference before locking the look. ' +
          '`speaking` shows its steady base radius: this canvas has no live microphone to drive the ' +
          'voice-reactive growth, since `bands`/`volume` here are never fed by real audio.',
      },
    },
  },
  render: () => (
    <div style={{ display: 'flex', gap: '24px', 'align-items': 'center', 'flex-wrap': 'wrap' }}>
      <For each={STATES}>
        {(s) => (
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'align-items': 'center' }}>
            <AudioVisualizer variant="aurora" state={s} size="md" />
            <code style={{ 'font-size': '11px', opacity: 0.6 }}>{s}</code>
          </div>
        )}
      </For>
    </div>
  ),
};

const SPECTRUM_SHADER = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  int idx = int(uv.x * float(BAND_COUNT));
  float level = 0.0;
  for (int i = 0; i < BAND_COUNT; i++) {
    if (i == idx) level = uBands[i];
  }
  float lit = step(uv.y, level);
  fragColor = vec4(uColor * lit, lit);
}`.replace(/BAND_COUNT/g, '5');

export const CustomShader: Story = {
  parameters: {
    docs: { description: { story: 'Set `variant="custom"` and a `shader` to render your own GLSL. It receives the ShaderToy built-ins plus `uColor`, `uIntensity`, `uSpeed`, `uComplexity`, `uVolume`, and `uBands[]`. Never declare those in your shader: the canvas declares them for you.' } },
  },
  render: () => {
    const bands = useFakeBands(5);
    return (
      <AudioVisualizer
        variant="custom"
        state="speaking"
        size="lg"
        bands={bands()}
        shader={{ fragment: SPECTRUM_SHADER }}
      />
    );
  },
};
