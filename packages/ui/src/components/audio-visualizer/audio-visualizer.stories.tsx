import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, onCleanup, Show, For, type JSX } from 'solid-js';
import { AudioVisualizer, type AudioVisualizerProps } from './index';
import { Button } from '../../ui/button';
import { Notice } from '../../ui/notice';
import { componentDescription } from '../../stories/docs/element-controls';
import { SIZES, CONTAINER_HEIGHT, type VisualizerSize } from './sizes';

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
        exclude: ['use:eventListener', 'stream', 'audioElement', 'shader', 'bands'],
      },
      description: componentDescription([
        'Renders live audio as bars, a grid, a ring, a wave, or a glowing aurora. Set `stream` or `audioElement` to tap real audio, or `bands` to drive it yourself.',
        'With no audio source at all it animates from `state` alone: idle, connecting, listening, thinking, speaking. That is what drives it when the audio cannot be tapped, like browser speech synthesis, which exposes no audio node.',
        '`wave`, `aurora`, and `custom` render through WebGL behind a dynamic import, and fall back to bars if that fails or WebGL is unavailable. Each look gets its own story below, across all five states. See StateMatrix for the three DOM variants side by side, Microphone for the real thing -- click-to-enable, since Storybook cannot answer a permission prompt -- and MicrophoneAll for all six looks on the same live voice at once.',
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
    theme: {
      control: 'select',
      options: ['auto', 'light', 'dark'],
      description: 'Explicit `light`/`dark` wins; `auto` follows `prefers-color-scheme`. Only aurora reads this today, for its color pipeline -- see its story. Bar, grid, and radial already adapt through CSS `currentColor` instead; wave and custom accept the prop but do not read it yet, always drawing the shader\'s fixed default color unless `color` overrides it.',
      table: { defaultValue: { summary: 'auto' } },
    },
    barCount: {
      control: { type: 'number', min: 1, max: 24 },
      description: 'Bar and radial only.',
    },
    rowCount: {
      control: { type: 'number', min: 1, max: 12 },
      description: 'Grid only.',
    },
    columnCount: {
      control: { type: 'number', min: 1, max: 12 },
      description: 'Grid only.',
    },
    spread: {
      control: { type: 'number', min: 0, max: 10 },
      description: 'Grid only: ring distance for the connecting animation, in cells.',
    },
    interval: {
      control: { type: 'number', min: 20, max: 500, step: 20 },
      description: 'Grid only: ms between scripted frames. Default 100.',
    },
    radius: {
      control: { type: 'number', min: 0, max: 200 },
      description: 'Radial only: distance from center, in px.',
    },
    color: {
      control: 'color',
      description: 'Overrides the inherited `currentColor`.',
    },
    complexity: {
      control: { type: 'number', min: 0, max: 1, step: 0.05 },
      description: 'Custom only here: pattern density, 0..1. Aurora accepts the prop but does not read it yet -- see the Aurora story note.',
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

const SPECTRUM_SHADER = `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  int idx = int(uv.x * float(BAND_COUNT));
  float level = 0.0;
  for (int i = 0; i < BAND_COUNT; i++) {
    if (i == idx) level = uBands[i];
  }
  // uComplexity slices each lit bar into horizontal segments -- one solid
  // block at 0, up to eight thin LED-style segments at 1 -- so the density
  // control in the Custom story actually shows something on a shader this
  // simple, instead of being declared and ignored.
  float segments = mix(1.0, 8.0, uComplexity);
  float lit = step(uv.y, level) * step(0.15, fract(uv.y * segments));
  fragColor = vec4(uColor * lit, lit);
}`.replace(/BAND_COUNT/g, '5');

// ---------------------------------------------------------------- layout

const TILE_GAP = 24;

/** Fixed cell side length for a size preset -- the variant's own container
 *  height plus breathing room, so every tile in a row is the same size no
 *  matter how wide (bar) or square (radial) that variant's actual content
 *  is. Used by every per-variant story and by StateMatrix and
 *  MicrophoneAll, so the whole file reads as one grid. */
function cellSize(size: VisualizerSize): number {
  return CONTAINER_HEIGHT[size] + 48;
}

/** A fixed-size, bordered cell with its content centered inside and an
 *  optional label underneath. `overflow: hidden` keeps an extreme control
 *  value (a huge `barCount`, say) from spilling into a neighbouring tile --
 *  the cell stays uniform even if that clips the content at the edges. */
function Tile(props: { size: VisualizerSize; label?: string; children: JSX.Element }): JSX.Element {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '10px' }}>
      <div
        style={{
          width: `${cellSize(props.size)}px`,
          height: `${cellSize(props.size)}px`,
          'box-sizing': 'border-box',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
          'border-radius': '12px',
        }}
      >
        {props.children}
      </div>
      <Show when={props.label}>
        <code style={{ 'font-size': '11px', opacity: 0.6 }}>{props.label}</code>
      </Show>
    </div>
  );
}

/** One tile per state, in a wrapping row, each state's name underneath.
 *  `children` is called once per state and receives it -- the standard
 *  render-prop shape already used throughout this component (see
 *  `VariantProps['children']` in variant-bar.tsx), not a coincidence. */
function StateRow(props: {
  size: VisualizerSize;
  children: (state: (typeof STATES)[number]) => JSX.Element;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: `${TILE_GAP}px`, 'flex-wrap': 'wrap' }}>
      <For each={STATES}>{(s) => <Tile size={props.size} label={s}>{props.children(s)}</Tile>}</For>
    </div>
  );
}

// ---------------------------------------------------------------- per-variant

/** Vertical bars, LiveKit's original look. Driven by synthetic levels while
 *  `speaking`; every other state runs its own scripted sequence with no
 *  audio involved -- `listening` blinks the center bar every 500ms. */
export const Bar: Story = {
  args: { size: 'md' },
  parameters: {
    controls: { include: ['size', 'color', 'barCount'] },
    docs: {
      description: {
        story:
          'Driven by synthetic levels while `speaking`. Every other state runs its own scripted sequence with ' +
          'no audio involved -- `listening` blinks the center bar every 500ms, carried from LiveKit. `theme` ' +
          'is not listed: bar already adapts through CSS `currentColor`, so the prop has nothing to do here.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    const bands = useFakeBands(5);
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => (
          <AudioVisualizer
            variant="bar"
            state={s}
            size={args.size}
            color={args.color}
            barCount={args.barCount}
            bands={bands()}
          />
        )}
      </StateRow>
    );
  },
};

export const Grid: Story = {
  args: { size: 'md' },
  parameters: {
    controls: { include: ['size', 'color', 'rowCount', 'columnCount', 'spread', 'interval'] },
    docs: {
      description: {
        story:
          'A grid of dots that pulses with the audio. `rowCount`/`columnCount` default to the size preset; ' +
          '`spread` and `interval` only shape the scripted `connecting` sequence, not `speaking`.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    const bands = useFakeBands(5);
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => (
          <AudioVisualizer
            variant="grid"
            state={s}
            size={args.size}
            color={args.color}
            rowCount={args.rowCount}
            columnCount={args.columnCount}
            spread={args.spread}
            interval={args.interval}
            bands={bands()}
          />
        )}
      </StateRow>
    );
  },
};

export const Radial: Story = {
  args: { size: 'md' },
  parameters: {
    controls: { include: ['size', 'color', 'barCount', 'radius'] },
    docs: {
      description: {
        story:
          'Bars around a ring, growing outward with the audio. `thinking` spins the whole ring in CSS instead ' +
          'of following the scripted highlight groups. A `barCount` not divisible by 4 warns in the console -- ' +
          'the ring still renders, just asymmetric.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    const bands = useFakeBands(5);
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => (
          <AudioVisualizer
            variant="radial"
            state={s}
            size={args.size}
            color={args.color}
            barCount={args.barCount}
            radius={args.radius}
            bands={bands()}
          />
        )}
      </StateRow>
    );
  },
};

export const Wave: Story = {
  args: { size: 'md' },
  parameters: {
    controls: { include: ['size', 'color'] },
    docs: {
      description: {
        story:
          '`idle`: flat line, amplitude and frequency both zero -- by design, not a bug. `listening`: the ' +
          'base wave with a slow mirrored opacity pulse, 750ms. `thinking`/`connecting`: quadruple the speed ' +
          'and frequency, quarter the amplitude, pulse faster at 400ms -- a tighter, jitterier line, and ' +
          'near-identical to each other since both share one return in `waveTargets`. `speaking`: doubles the ' +
          'base speed, holds full opacity, and reads amplitude and frequency straight from live volume with no ' +
          'easing -- driven by synthetic bands here so it moves. `theme` is not listed: this shader does not ' +
          'read it yet, and always draws the fixed default color unless `color` overrides it.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    const bands = useFakeBands(5);
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => <AudioVisualizer variant="wave" state={s} size={args.size} color={args.color} bands={bands()} />}
      </StateRow>
    );
  },
};

export const Aurora: Story = {
  args: { size: 'md' },
  parameters: {
    controls: { include: ['size', 'color', 'theme'] },
    docs: {
      description: {
        story:
          '`speaking` shows its steady base radius: this canvas has no live microphone to drive the ' +
          'voice-reactive growth here, since `bands`/`volume` are synthetic, not real audio. `complexity` is ' +
          'not listed as a control here: this variant\'s pattern density comes from `state` internally ' +
          '(`auroraTargets`) and does not read the `complexity` prop yet -- see Custom for a variant where it works.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    const bands = useFakeBands(5);
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => (
          <AudioVisualizer variant="aurora" state={s} size={args.size} color={args.color} theme={args.theme} bands={bands()} />
        )}
      </StateRow>
    );
  },
};

export const Custom: Story = {
  args: { size: 'md', complexity: 0.5 },
  parameters: {
    controls: { include: ['size', 'color', 'complexity'] },
    docs: {
      description: {
        story:
          'Set `variant="custom"` and a `shader` to render your own GLSL. It receives the ShaderToy built-ins ' +
          'plus `uColor`, `uIntensity`, `uSpeed`, `uComplexity`, `uVolume`, and `uBands[]` -- never declare ' +
          'those yourself, the canvas declares them for you. This story\'s shader is hardcoded for 5 bands, so ' +
          'every tile forces `barCount={5}` to match, and slices each lit bar by `complexity` to give that ' +
          'control something to show. `theme` is not listed: this shader does not read it yet either.',
      },
    },
  },
  render: (args: AudioVisualizerProps) => {
    const bands = useFakeBands(5);
    return (
      <StateRow size={args.size ?? 'md'}>
        {(s) => (
          <AudioVisualizer
            variant="custom"
            state={s}
            size={args.size}
            color={args.color}
            complexity={args.complexity}
            barCount={5}
            bands={bands()}
            shader={{ fragment: SPECTRUM_SHADER }}
          />
        )}
      </StateRow>
    );
  },
};

// ---------------------------------------------------------------- overview

/**
 * Every DOM variant against every state, one overview. States are column
 * headers ONCE across the top rather than repeated under every tile, and
 * each row is labelled with its variant on the left -- the same
 * information as thirty individual labels, without repeating any of them.
 *
 * Shader variants are deliberately excluded: six variants x five states x
 * two WebGL contexts per row is heavy for one story; see the Wave, Aurora,
 * and Custom stories above for those.
 */
export const StateMatrix: Story = {
  parameters: {
    // `include: []` does NOT hide the panel in this Storybook version -- it
    // falls back to showing every arg, which is exactly the "control that
    // does nothing" problem this file is fixing everywhere else. `disable`
    // is the mechanism that actually removes the Controls tab's content.
    controls: { disable: true },
    docs: {
      description: {
        story:
          'Every DOM variant against every state. The scripted sequences are most of this component\'s ' +
          'behavior, and each state looks different. `speaking` uses synthetic levels. Shader variants are ' +
          'excluded here -- see the Wave, Aurora, and Custom stories above for those, each across every state.',
      },
    },
  },
  render: () => {
    const bands = useFakeBands(5);
    const LABEL_COL = 64;
    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '16px', 'align-items': 'center' }}>
          <div style={{ width: `${LABEL_COL}px`, 'flex-shrink': 0 }} />
          <For each={STATES}>
            {(s) => (
              <code style={{ width: `${cellSize('sm')}px`, 'text-align': 'center', 'font-size': '11px', opacity: 0.6 }}>
                {s}
              </code>
            )}
          </For>
        </div>
        <For each={VARIANTS}>
          {(v) => (
            <div style={{ display: 'flex', gap: '16px', 'align-items': 'center' }}>
              <code style={{ width: `${LABEL_COL}px`, 'flex-shrink': 0, 'font-size': '11px', opacity: 0.6 }}>{v}</code>
              <For each={STATES}>
                {(s) => (
                  <Tile size="sm">
                    <AudioVisualizer variant={v} state={s} size="sm" bands={bands()} />
                  </Tile>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
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
 * instead (see Bar above), so a mic story left on `listening` would just
 * blink and look exactly as broken as the bug this fixes.
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
        <Tile size="md">
          <AudioVisualizer
            variant={args.variant}
            state={stream() ? 'speaking' : 'idle'}
            size="md"
            stream={stream()}
            shader={args.variant === 'custom' ? { fragment: SPECTRUM_SHADER } : undefined}
          />
        </Tile>
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
          'One microphone, all six looks at once, so they can be compared on the same live voice instead of one at a time through a control. `custom` reuses the spectrum shader from the Custom story above so it visibly responds to `uBands` too.',
      },
    },
    // See StateMatrix's comment: `include: []` does not hide the panel in
    // this Storybook version, `disable` does.
    controls: { disable: true },
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
            'column-gap': '32px',
            'row-gap': '24px',
            'justify-items': 'center',
          }}
        >
          <For each={ALL_VARIANTS}>
            {(v) => (
              <Tile size="sm" label={v}>
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
              </Tile>
            )}
          </For>
        </div>
      </div>
    );
  },
};
