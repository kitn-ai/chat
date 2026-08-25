import { createEffect } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { ShaderCanvas, hexToRgb, DEFAULT_SHADER_COLOR } from './shader-canvas';
import { createTween } from '../../primitives/create-tween';
import { waveTargets } from '../../primitives/visualizer-sequences';
import { CONTAINER_HEIGHT } from './sizes';
import { amplitudeRenderState } from './variant-bar';
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

  // The state the rendering follows: `listeningAmplitude` folds `listening`
  // into the speaking presentation (live-volume amplitude/frequency). See
  // amplitudeRenderState in variant-bar. `data-kai-state` keeps the real state.
  const renderState = () => amplitudeRenderState(props.state, props.listeningAmplitude);
  const targets = () => waveTargets(renderState());

  // Reduced motion: land on the target immediately and skip every pulse.
  const transition = () =>
    props.frozen ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' as const };

  // Opacity alone: it only follows state/frozen, so a volume tick (nearly
  // every animation frame while speaking) never restarts the pulse's tween.
  // V2-PORT: tracked reads in the compute; the tween drive in the apply.
  createEffect(
    () => ({ t: targets(), frozen: props.frozen }),
    ({ t, frozen }) => {
      // A pulse is an array target ([from, to], see createTween's ping-pong).
      // Reduced motion collapses it to its first value so the line holds
      // still instead of breathing.
      const fade = Array.isArray(t.opacity) && frozen ? t.opacity[0] : t.opacity;
      opacity.to(fade, frozen ? { duration: 0 } : { duration: t.pulseDuration || 0.2 });
    },
  );

  // Amplitude and frequency share ONE effect -- a single writer -- on
  // purpose. They used to be split like opacity above: a state effect
  // tweening toward the base target over 0.2s, plus a separate effect
  // applying the live-volume override instantly while speaking. Both re-run
  // on a state flip, and Solid re-runs sibling effects in the order they sit
  // in the signal's observer list, which REORDERS as effects re-subscribe
  // over their lifetimes -- so whichever happened to run last won. Under a
  // loaded main thread the base tween could land AFTER the override,
  // parking a speaking line at the 0.025 baseline until the next volume
  // change; with live audio that self-heals within one ~33ms tick, but
  // static drive (a pinned `bands`/`volume` override, upstream's #1399 prop
  // mode) never ticks again, so it stalled visibly (measured on the parity
  // harness, 2/2 under load). This is NOT the benign two-effect shape the
  // Task 12 review ruled acceptable elsewhere -- that ruling covered
  // effects with DISJOINT writers; these two wrote the same tweens. One
  // effect, one writer, ordering can no longer matter. Same effect-race
  // class as b5795ac's shared() finding.
  // V2-PORT: the branch-conditional tracking moves whole into the COMPUTE (it
  // re-tracks per run, so `volume` is still only a dependency while speaking);
  // the tween drives are the apply. Still one effect, one writer — the ordering
  // rationale above is unchanged.
  createEffect(
    () => {
      if (renderState() === 'speaking') {
        // Live volume drives amplitude and frequency instantly while
        // speaking, so the line never lags the audio -- and lands at the
        // override immediately on re-entry, matching upstream's same-commit
        // effect ordering. `volume` is only tracked in this branch, so
        // volume ticks do not re-run the state-target path below.
        return { speaking: true as const, v: props.volume };
      }
      return { speaking: false as const, t: targets(), tr: transition() };
    },
    (r) => {
      if (r.speaking) {
        amplitude.to(0.015 + 0.4 * r.v, { duration: 0 });
        frequency.to(20 + 60 * r.v, { duration: 0 });
        return;
      }
      amplitude.to(r.t.amplitude, r.tr);
      frequency.to(r.t.frequency, r.tr);
    },
  );

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
        animateWhenNotVisible={props.animateWhenNotVisible}
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
