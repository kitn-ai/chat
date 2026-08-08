import { createEffect, type JSX } from 'solid-js';
import { ShaderCanvas, hexToRgb, DEFAULT_SHADER_COLOR } from './shader-canvas';
import { createTween } from '../../primitives/create-tween';
import { waveTargets } from '../../primitives/visualizer-sequences';
import { CONTAINER_HEIGHT } from './sizes';
import type { ShaderVariantProps } from './index';
import waveShader from './wave.glsl';

// Upstream defaults that aren't exposed as public props anywhere in this
// component's contract (`ShaderVariantProps` has no `blur`/`colorShift`
// field, and the dispatcher never forwards either) -- so they stay fixed
// rather than becoming half-wired knobs nothing can reach.
const BLUR = 0.5;
const COLOR_SHIFT = 0.05;

/**
 * A flowing oscilloscope line.
 *
 * Ported from livekit/components-js `agent-audio-visualizer-wave.tsx`
 * (Apache License 2.0). The shader itself (`wave.glsl.ts`) is copied
 * verbatim; this wrapper replaces upstream's React component and its
 * `motion` dependency with Solid signals and `createTween`.
 */
export default function WaveVisualizer(props: ShaderVariantProps): JSX.Element {
  const amplitude = createTween(0);
  const frequency = createTween(0);
  const opacity = createTween(1);

  const targets = () => waveTargets(props.state);

  // Reduced motion: land on the target immediately and skip every pulse.
  const transition = () =>
    props.frozen ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' as const };

  createEffect(() => {
    const t = targets();
    amplitude.to(t.amplitude, transition());
    frequency.to(t.frequency, transition());

    // A pulse is an array target ([from, to], see createTween's ping-pong).
    // Reduced motion collapses it to its first value so the line holds
    // still instead of breathing.
    const fade = Array.isArray(t.opacity) && props.frozen ? t.opacity[0] : t.opacity;
    opacity.to(fade, props.frozen ? { duration: 0 } : { duration: t.pulseDuration || 0.2 });
  });

  // Live volume overrides amplitude and frequency instantly while speaking,
  // so the line never lags the audio. Kept as its own effect rather than
  // folded into the one above: that effect only reads `state`/`frozen`, so a
  // volume tick (nearly every animation frame while speaking) does not also
  // restart the opacity pulse's tween for no reason.
  createEffect(() => {
    if (props.state !== 'speaking') return;
    const v = props.volume;
    amplitude.to(0.015 + 0.4 * v, { duration: 0 });
    frequency.to(20 + 60 * v, { duration: 0 });
  });

  const lineWidth = () => (props.size === 'icon' || props.size === 'sm' ? 2 : 1);

  return (
    <div
      data-kai-state={props.state}
      class={props.class}
      style={{
        height: `${CONTAINER_HEIGHT[props.size]}px`,
        'aspect-ratio': '1',
        'mask-image':
          'linear-gradient(90deg, transparent 0%, black 20%, black 80%, transparent 100%)',
      }}
    >
      <ShaderCanvas
        fragment={waveShader}
        // Shaders are expensive on phones; mediump halves the cost with no
        // visible difference on a line this thin.
        precision={props.size === 'icon' || props.size === 'sm' ? 'mediump' : 'highp'}
        uniforms={{
          // uSpeed drives the shader's own time-based phase animation, not a
          // tween -- so frozen (prefers-reduced-motion) must zero it directly
          // rather than relying on any tween's instant-landing logic. uAmplitude
          // and uFrequency stay as their frozen-collapsed values: they shape a
          // static wave, they do not move it, so the result is a still picture
          // of the wave rather than a flat line.
          uSpeed: { type: '1f', value: props.frozen ? 0 : targets().speed },
          uAmplitude: { type: '1f', value: amplitude.value() },
          uFrequency: { type: '1f', value: frequency.value() },
          uMix: { type: '1f', value: opacity.value() },
          uLineWidth: { type: '1f', value: lineWidth() },
          uSmoothing: { type: '1f', value: BLUR },
          uColor: { type: '3fv', value: hexToRgb(props.color ?? DEFAULT_SHADER_COLOR) },
          uColorShift: { type: '1f', value: COLOR_SHIFT },
        }}
        onError={(message) => {
          console.warn('<kai-audio-visualizer variant="wave">: shader error', message);
          // A missing WebGL context and a compile/link failure both mean
          // this shader cannot render at all -- no branching, both fall
          // back to the dispatcher's bar visualizer.
          props.onUnavailable();
        }}
      />
    </div>
  );
}
