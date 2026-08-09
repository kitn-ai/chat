import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, onCleanup, Show, For } from 'solid-js';
import { AudioVisualizer, type AudioVisualizerProps } from './index';
import { Button } from '../../ui/button';
import { Notice } from '../../ui/notice';
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
        '`wave`, `aurora`, and `custom` render through WebGL behind a dynamic import, and fall back to bars if that fails or WebGL is unavailable. See ShaderVariants, AuroraStates, and CustomShader below. See Microphone for the real thing, click-to-enable so nothing here auto-prompts for a permission Storybook cannot answer, and MicrophoneAll for all six looks on the same live voice at once.',
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

/**
 * Synthetic levels so `speaking` animates without a microphone.
 *
 * Matches the real analyser's cadence -- `useAudioAnalysis`'s
 * `updateInterval: 32` (about 31fps) -- with a `requestAnimationFrame` loop
 * throttled to the same 32ms, not `setInterval`, which the real analyser
 * never uses either. A NEW array reference every tick: mutating in place
 * would not re-render.
 *
 * Each band sums three sines at different rates with its own phase, mapped
 * into 0..1: smooth everywhere (no `Math.abs`, so no sharp corner at a zero
 * crossing) and a pure function of time, so it stays deterministic. Low
 * bands swing wider and slower, high bands move less and faster -- the shape
 * a voice's levels actually have.
 */
function useFakeBands(count: number) {
  const [bands, setBands] = createSignal<number[]>(new Array(count).fill(0));
  if (typeof requestAnimationFrame === 'undefined') return bands;

  let raf = 0;
  let last = 0;
  const step = (now: number) => {
    if (now - last >= 32) {
      const t = now / 1000;
      setBands(
        Array.from({ length: count }, (_, i) => {
          const depth = 1 - i / Math.max(1, count - 1); // 1 for the lowest band, 0 for the highest
          const amplitude = 0.18 + 0.24 * depth;
          const rate = 0.6 + i * 0.15;
          const phase = i * 1.9;
          const wave =
            0.55 * Math.sin(2 * Math.PI * rate * t + phase) +
            0.3 * Math.sin(2 * Math.PI * rate * 2.7 * t + phase * 1.4) +
            0.15 * Math.sin(2 * Math.PI * rate * 0.45 * t + phase * 0.7);
          return 0.5 + amplitude * wave;
        }),
      );
      last = now;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  onCleanup(() => cancelAnimationFrame(raf));

  return bands;
}

/** Bar variant, speaking state, synthetic bands: the visualizer doing its
 *  actual job. See Listening below for the scripted, no-audio behavior every
 *  other state runs, and Microphone for the real thing. */
export const Default: Story = {
  args: { variant: 'bar', state: 'speaking', size: 'md' },
  parameters: {
    docs: {
      description: {
        story: 'Driven by synthetic levels standing in for a microphone. Switch `state` in Controls to see the scripted, no-audio look every other state runs.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    const bands = useFakeBands(5);
    return <AudioVisualizer {...args} bands={bands()} />;
  },
};

/** Bar variant, listening state: the scripted center-blink idle-conversation
 *  look, carried from LiveKit. Not the default here: without live audio it
 *  reads as a slow blink rather than a working visualizer. */
export const Listening: Story = {
  args: { variant: 'bar', state: 'listening', size: 'md' },
  parameters: {
    docs: {
      description: {
        story: 'The scripted `listening` sequence: blink the center bar every 500ms, no audio involved. See StateMatrix below for `connecting` and `thinking` too, across every variant.',
      },
    },
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
    docs: {
      description: {
        story:
          'Every DOM variant against every state. The scripted sequences are most of this component\'s ' +
          'behavior, and each state looks different. `speaking` uses synthetic levels. Shader variants are ' +
          'deliberately excluded here -- six variants x five states x two WebGL contexts per row is heavy for ' +
          'one story; see WaveStates, AuroraStates, and ShaderVariants for those.',
      },
    },
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
    docs: {
      description: {
        story:
          'Wave and aurora side by side, one state, for a quick at-a-glance comparison of the two WebGL ' +
          'looks -- both load on demand and fall back to bars where WebGL is unavailable. See WaveStates ' +
          'and AuroraStates below for how each actually runs through every state.',
      },
    },
  },
  render: () => (
    <div style={{ display: 'flex', gap: '32px', 'align-items': 'center' }}>
      <AudioVisualizer variant="wave" state="listening" size="md" />
      <AudioVisualizer variant="aurora" state="listening" size="md" />
    </div>
  ),
};

/**
 * The wave across every state. Mirrors AuroraStates below: same layout,
 * same labelling, so the two read as a pair.
 *
 * `idle` flattens the line to zero amplitude and zero frequency by design
 * (`waveTargets` in `primitives/visualizer-sequences.ts`) -- it is meant to
 * look inert, not broken. `speaking` differs from the other four in KIND,
 * not degree: its amplitude and frequency come straight from live volume
 * with `{ duration: 0 }`, no easing toward a fixed target the way
 * `listening`/`thinking`/`connecting` do -- driven here by synthetic bands
 * so it is not static like AuroraStates' `speaking` tile.
 */
export const WaveStates: Story = {
  parameters: {
    docs: {
      description: {
        story:
          '`idle`: flat line, amplitude and frequency both zero -- by design, not a bug. `listening`: the ' +
          'base wave with a slow mirrored opacity pulse, 750ms. `thinking`/`connecting`: quadruple the speed ' +
          'and frequency, quarter the amplitude, pulse faster at 400ms -- a tighter, jitterier line. ' +
          '`speaking`: doubles the base speed, holds full opacity, and reads amplitude and frequency straight ' +
          'from live volume with no easing -- driven by synthetic bands here so it moves.',
      },
    },
  },
  render: () => {
    const bands = useFakeBands(5);
    return (
      <div style={{ display: 'flex', gap: '24px', 'align-items': 'center', 'flex-wrap': 'wrap' }}>
        <For each={STATES}>
          {(s) => (
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'align-items': 'center' }}>
              <AudioVisualizer variant="wave" state={s} size="md" bands={bands()} />
              <code style={{ 'font-size': '11px', opacity: 0.6 }}>{s}</code>
            </div>
          )}
        </For>
      </div>
    );
  },
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

/**
 * A real microphone, click-to-enable.
 *
 * Nothing here calls `getUserMedia` on mount -- it renders an idle
 * visualizer and a button, so there is no permission prompt for Storybook's
 * automated a11y run to hang on. Only the click handler asks for the
 * microphone; a second click stops the tracks and returns to idle.
 *
 * `state` is forced to `speaking` while the stream is live: every other
 * state deliberately ignores audio and runs its own scripted sequence
 * instead (see Listening above), so a mic story left on `listening` would
 * just blink and look exactly as broken as the bug this fixes.
 */
export const Microphone: Story = {
  args: { variant: 'bar' },
  parameters: {
    docs: {
      description: {
        story:
          'Click to grant the microphone, click again to release it. Switch `variant` in Controls to hear the same stream drive any of the six looks -- `wave` and `aurora` read `volume`, which the dispatcher derives from the live stream, so they react too. Denied or unavailable permission shows the reason instead of failing silently.',
      },
    },
    controls: { include: ['variant'] },
  },
  render: (args: AudioVisualizerProps) => {
    const [stream, setStream] = createSignal<MediaStream | undefined>();
    const [error, setError] = createSignal<string | null>(null);
    const [requesting, setRequesting] = createSignal(false);

    const stopTracks = (s: MediaStream | undefined) => s?.getTracks().forEach((t) => t.stop());

    const toggle = async () => {
      const live = stream();
      if (live) {
        stopTracks(live);
        setStream(undefined);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('getUserMedia is not available in this browser context.');
        return;
      }
      setError(null);
      setRequesting(true);
      try {
        setStream(await navigator.mediaDevices.getUserMedia({ audio: true }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Microphone access failed.');
      } finally {
        setRequesting(false);
      }
    };

    // A leaked mic is worse than a broken story: stop the tracks on
    // cleanup (navigating away) even if a click never released them.
    onCleanup(() => stopTracks(stream()));

    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px', 'align-items': 'center' }}>
        <AudioVisualizer
          variant={args.variant}
          state={stream() ? 'speaking' : 'idle'}
          size="md"
          stream={stream()}
          shader={args.variant === 'custom' ? { fragment: SPECTRUM_SHADER } : undefined}
        />
        <Button onClick={() => void toggle()} disabled={requesting()} aria-pressed={!!stream()}>
          {stream() ? 'Stop microphone' : requesting() ? 'Requesting...' : 'Enable microphone'}
        </Button>
        <Show when={error()}>{(message) => <Notice severity="error">{message()}</Notice>}</Show>
      </div>
    );
  },
};

/**
 * All six variants, one live microphone, side by side.
 *
 * Same click-to-enable pattern as Microphone above -- one button, one
 * `getUserMedia` call, one `MediaStream` -- but that single stream is set on
 * all six `<AudioVisualizer>` instances at once instead of switching one
 * through a control. Six `useAudioAnalysis` instances end up tapping the
 * same stream simultaneously: each calls its own `ctx.createMediaStreamSource
 * (stream)`, which -- unlike `createMediaElementSource` -- has no
 * once-per-element restriction, so this is expected to just work, but it had
 * never actually been exercised with six concurrent consumers before this
 * story. Verified in the browser: all six react independently to the same
 * stream, not just the first.
 */
export const MicrophoneAll: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'One microphone, all six looks at once, so they can be compared on the same live voice instead of one at a time through a control. `custom` reuses the spectrum shader from CustomShader below so it visibly responds to `uBands` too.',
      },
    },
    controls: { include: [] },
  },
  render: () => {
    const [stream, setStream] = createSignal<MediaStream | undefined>();
    const [error, setError] = createSignal<string | null>(null);
    const [requesting, setRequesting] = createSignal(false);

    const stopTracks = (s: MediaStream | undefined) => s?.getTracks().forEach((t) => t.stop());

    const toggle = async () => {
      const live = stream();
      if (live) {
        stopTracks(live);
        setStream(undefined);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('getUserMedia is not available in this browser context.');
        return;
      }
      setError(null);
      setRequesting(true);
      try {
        setStream(await navigator.mediaDevices.getUserMedia({ audio: true }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Microphone access failed.');
      } finally {
        setRequesting(false);
      }
    };

    // Six tiles share this one stream: stop every track once here, not per
    // tile -- there is exactly one MediaStream to release, no matter how
    // many visualizers are tapping it.
    onCleanup(() => stopTracks(stream()));

    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px', 'align-items': 'center' }}>
        <Button onClick={() => void toggle()} disabled={requesting()} aria-pressed={!!stream()}>
          {stream() ? 'Stop microphone' : requesting() ? 'Requesting...' : 'Enable microphone'}
        </Button>
        <Show when={error()}>{(message) => <Notice severity="error">{message()}</Notice>}</Show>
        <div
          style={{
            display: 'grid',
            'grid-template-columns': 'repeat(3, minmax(0, 1fr))',
            'column-gap': '40px',
            'row-gap': '24px',
            'justify-items': 'center',
          }}
        >
          <For each={ALL_VARIANTS}>
            {(v) => (
              <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'align-items': 'center' }}>
                <AudioVisualizer
                  variant={v}
                  state={stream() ? 'speaking' : 'idle'}
                  size="sm"
                  stream={stream()}
                  // SPECTRUM_SHADER is hardcoded for 5 bands. `sm` defaults
                  // bar/custom to 3, which would declare `uBands` at length 3
                  // while the shader body still indexes up to uBands[4] --
                  // force 5 here so the shader's band count and the analyser's
                  // actually match.
                  barCount={v === 'custom' ? 5 : undefined}
                  shader={v === 'custom' ? { fragment: SPECTRUM_SHADER } : undefined}
                />
                <code style={{ 'font-size': '11px', opacity: 0.6 }}>{v}</code>
              </div>
            )}
          </For>
        </div>
      </div>
    );
  },
};
