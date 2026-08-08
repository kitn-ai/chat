import { createEffect, createSignal, onCleanup, type Accessor, type JSX } from 'solid-js';
import { ShaderCanvas, hexToRgb, DEFAULT_SHADER_COLOR } from './shader-canvas';
import { createTween } from '../../primitives/create-tween';
import type { VisualizerState } from '../../primitives/visualizer-sequences';
import { CONTAINER_HEIGHT } from './sizes';
import type { ShaderVariantProps } from './index';
import auroraShader from './aurora.glsl';

/**
 * Per-state uniform targets, straight from fact sheet section 5's measured
 * table (`.superpowers/sdd/2026-08-07-audio-visualizers/reference/
 * aura-prototype/lk-aura-factsheet.md`) and reconciled against `aurora.glsl.ts`'s
 * own module doc / the Task 14 report's "Uniform list for Task 15" table.
 *
 * Deliberately NOT `shaderTargets()` (primitives/visualizer-sequences.ts):
 * that helper only carries two axes -- a 0..1 "energy" intensity and a 1..4
 * speed -- built for the OLD custom/aura convention. This shader's real table
 * is non-monotonic across those same two axes (thinking/connecting has LOWER
 * amplitude than idle despite HIGHER brightness) and every value below is a
 * direct fact-sheet pass-through, not a normalized knob, so reusing that
 * helper cannot reproduce it. The Task 14 report calls this out explicitly
 * and asks for this shader's own mapping, parallel to how `waveTargets()`
 * already exists alongside `shaderTargets()` for the wave shader.
 *
 * `speed` here is fact sheet section 5's `S / 20` (state speed 10..70,
 * divided by 20) -- NOT the raw 10..70 value. `complexity` is `freqParam`
 * directly.
 */
function auroraTargets(state: VisualizerState): {
  intensity: number | [number, number];
  speed: number;
  complexity: number;
  amplitude: number;
  scale: number;
} {
  switch (state) {
    case 'listening':
      return { intensity: [1.5, 2.0], speed: 1.0, complexity: 0.7, amplitude: 1.0, scale: 0.3 };
    case 'thinking':
    case 'connecting':
      return { intensity: [0.5, 2.5], speed: 1.5, complexity: 1.0, amplitude: 0.5, scale: 0.3 };
    case 'speaking':
      // The pre-voice base. While actually speaking with volume > 0, the
      // scale read by the shader comes from the live-volume override below
      // instead -- see `scaleValue`.
      return { intensity: 1.5, speed: 3.5, complexity: 1.25, amplitude: 0.75, scale: 0.3 };
    case 'idle':
    default:
      return { intensity: 1.0, speed: 0.5, complexity: 0.4, amplitude: 1.2, scale: 0.2 };
  }
}

/**
 * Live `prefers-color-scheme`, for `uTheme` (fact sheet section 4: a real
 * branch in the color math, not just a compositing background -- see
 * `aurora.glsl.ts`'s module doc). Defaults to light (matching
 * `usePrefersReducedMotion` and `createDarkMode`'s own `false`-until-resolved
 * default elsewhere in this package) until `matchMedia` resolves, and is a
 * no-op under SSR or in an environment without it (jsdom included: it does
 * not implement `matchMedia` at all).
 *
 * No `theme` prop reaches this component: neither `ShaderVariantProps` nor
 * the dispatcher above it (`index.tsx`) carries one, and both are out of
 * this task's file scope. This is the closest available signal without
 * touching either -- see the task report's concerns for the follow-up this
 * implies.
 */
function usePrefersDark(): Accessor<boolean> {
  const [dark, setDark] = createSignal(false);
  if (typeof matchMedia === 'function') {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    setDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener?.('change', onChange);
    onCleanup(() => mq.removeEventListener?.('change', onChange));
  }
  return dark;
}

/**
 * A glowing, drifting aura: 36 phase-offset rings folded through a warp
 * cascade into soft veils. See `aurora.glsl.ts`'s module doc for the shader
 * itself and its provenance.
 *
 * The uniform contract is a direct pass-through of fact sheet section 5's
 * measured per-state table (`auroraTargets` above), NOT the 0..1 convention
 * `wave` and `custom` use. There is deliberately no `uVolume` uniform: the
 * shader would double-apply voice-driven growth if it read one itself on top
 * of whatever this component also does at the state layer, so the live
 * volume is folded into `uScale` here, in exactly one place (`scaleValue`),
 * and nowhere else.
 */
export default function AuroraVisualizer(props: ShaderVariantProps): JSX.Element {
  const intensity = createTween(1.0);
  const speed = createTween(0.5);
  const complexity = createTween(0.4);
  const amplitude = createTween(1.2);
  const scale = createTween(0.2);
  const isDark = usePrefersDark();

  createEffect(() => {
    const t = auroraTargets(props.state);
    // Fact sheet section 5: "0.5 s ease-out unless noted." Frozen (reduced
    // motion) settles on every target immediately instead.
    const landing = props.frozen ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' as const };
    // Pulses (an array target, see createTween's ping-pong) run at fact
    // sheet section 5's stated 0.35 s ease-out cadence -- faster than every
    // other target's 0.5 s landing tween, and distinct from wave/custom's
    // flat 0.5 s pulse. Frozen collapses a pulse to its first value instead
    // of animating it at all.
    const pulsing = props.frozen ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' as const };
    const intensityTarget = Array.isArray(t.intensity) && props.frozen ? t.intensity[0] : t.intensity;
    intensity.to(intensityTarget, Array.isArray(t.intensity) ? pulsing : landing);

    complexity.to(t.complexity, landing);
    amplitude.to(t.amplitude, landing);
    scale.to(t.scale, landing);

    // Fact sheet section 5: "Speed is NOT tweened and multiplies absolute
    // time -> every state change teleports the phase." Frozen pins it at 0
    // rather than merely snapping to the state's raw target: uSpeed is the
    // only thing driving the aura's continuous "wind" motion at all (there
    // is no separate amplitude/opacity axis to freeze it through, unlike
    // wave), so zeroing it is what actually holds the shape still.
    speed.to(props.frozen ? 0 : t.speed, { duration: 0 });
  });

  // Voice-driven radius, folded into uScale here and ONLY here (fact sheet
  // section 5: "0.2 + 0.2 x volume", speaking only, instant -- no tween, so
  // the aura tracks the voice exactly; measured lag in the reference capture
  // is at or under 33ms). A pure derivation, not an imperative effect like
  // wave's equivalent override: an effect that only fires `scale.to(...)`
  // while `volume > 0` would leave the radius stuck at its last
  // voice-driven value through a mid-speech pause (volume dropping back to
  // 0) instead of relaxing back to the state's base target, since nothing
  // would re-trigger it. Reading `scale.value()` as the fallback here means
  // the instant volume stops driving it, the current (already-tweening or
  // settled) base value takes back over on the very next reactive read, with
  // no separate revert step required.
  const scaleValue = () =>
    props.state === 'speaking' && props.volume > 0 ? 0.2 + 0.2 * props.volume : scale.value();

  return (
    <div
      data-kai-state={props.state}
      class={props.class}
      style={{ height: `${CONTAINER_HEIGHT[props.size]}px`, 'aspect-ratio': '1' }}
    >
      <ShaderCanvas
        fragment={auroraShader}
        // Shaders are expensive on phones; mediump halves the cost. Matches
        // wave/custom's identical size cutoff.
        precision={props.size === 'icon' || props.size === 'sm' ? 'mediump' : 'highp'}
        uniforms={{
          uColor: { type: '3fv', value: hexToRgb(props.color ?? DEFAULT_SHADER_COLOR) },
          uIntensity: { type: '1f', value: intensity.value() },
          uSpeed: { type: '1f', value: speed.value() },
          uComplexity: { type: '1f', value: complexity.value() },
          uAmplitude: { type: '1f', value: amplitude.value() },
          uScale: { type: '1f', value: scaleValue() },
          uTheme: { type: '1f', value: isDark() ? 0 : 1 },
        }}
        onError={(message) => {
          // "not available" is ShaderCanvas's literal wording for a missing
          // WebGL context (see its own doc) -- an expected environment
          // limitation, so it logs quietly. Anything else is a compile or
          // link failure in this SHIPPED shader, which is a kit bug, so it
          // logs loudly. `onUnavailable` fires unconditionally either way --
          // no branching on whether to call it, only on how loud to log.
          const missingContext = /not available/i.test(message);
          if (missingContext) {
            console.warn('<kai-audio-visualizer variant="aurora">: shader unavailable', message);
          } else {
            console.error('<kai-audio-visualizer variant="aurora">: shader error', message);
          }
          props.onUnavailable();
        }}
      />
    </div>
  );
}

export { auroraTargets };
