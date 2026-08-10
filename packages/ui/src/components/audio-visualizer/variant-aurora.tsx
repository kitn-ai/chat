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
 *
 * `rotation` (deg/s, positive = clockwise ON SCREEN) is NOT from the fact
 * sheet: it is this port's own solid-body trim on top of the wind's
 * emergent angular drift, calibrated offline (campaign task #6's probe,
 * replicating scripts/aurora-audit.mjs's estimator at its capture cadence)
 * so the audit-measured per-state rotation lands on the reference values:
 * speaking ~+17 (their +12.9, Rob's reference ~20 CW), listening ~+4.6,
 * thinking ~+9, connecting ~-4.7. The wind supplies most of the apparent
 * motion (post-flip it reads ~+22 CW at speaking, ~0 elsewhere); these
 * trims close the per-state gaps. Thinking and connecting share every
 * OTHER target but split here, matching the audit's measured baseline for
 * each. Like `speed`, rotation is never tweened.
 */
function auroraTargets(state: VisualizerState): {
  intensity: number | [number, number];
  speed: number;
  complexity: number;
  amplitude: number;
  scale: number;
  rotation: number;
} {
  switch (state) {
    case 'listening':
      return {
        intensity: [1.5, 2.0], speed: 1.0, complexity: 0.7, amplitude: 1.0, scale: 0.3,
        rotation: 5.3,
      };
    case 'thinking':
      return {
        intensity: [0.5, 2.5], speed: 1.5, complexity: 1.0, amplitude: 0.5, scale: 0.3,
        rotation: 9.4,
      };
    case 'connecting':
      return {
        intensity: [0.5, 2.5], speed: 1.5, complexity: 1.0, amplitude: 0.5, scale: 0.3,
        rotation: -5.5,
      };
    case 'speaking':
      // The pre-voice base. While actually speaking with volume > 0, the
      // scale is driven through the tween by the live-volume override
      // effect below.
      return {
        intensity: 1.5, speed: 3.5, complexity: 1.25, amplitude: 0.75, scale: 0.3,
        rotation: -3.5,
      };
    // Dead-connection look: mirrors idle's resting targets for now. A
    // dedicated arm so the pending LiveKit measurement (their aura may dim
    // differently at disconnected) can adjust it in one line.
    case 'disconnected':
      return {
        intensity: 1.0, speed: 0.5, complexity: 0.4, amplitude: 1.2, scale: 0.2,
        rotation: 0,
      };
    case 'idle':
    default:
      return {
        intensity: 1.0, speed: 0.5, complexity: 0.4, amplitude: 1.2, scale: 0.2,
        rotation: 0,
      };
  }
}

/**
 * Live `prefers-color-scheme`, used ONLY as the fallback when no caller
 * supplies `props.dark` -- see `AuroraVisualizer`'s `resolvedDark` below.
 * That is the standalone case (this component mounted directly, with no
 * facade resolving a `theme` attribute above it), and it is also why this
 * defaults to light (matching `usePrefersReducedMotion` and
 * `createDarkMode`'s own `false`-until-resolved default elsewhere in this
 * package) until `matchMedia` resolves, and is a no-op under SSR or in an
 * environment without it (jsdom included: it does not implement
 * `matchMedia` at all).
 *
 * `<kai-audio-visualizer theme="light">` on a dark OS needs to render the
 * LIGHT pipeline. This hook alone cannot know that (it only ever sees the
 * OS preference, never an explicit override) -- `define.tsx`'s
 * `createDarkMode` is what resolves `theme="light"|"dark"|"auto"` against
 * the media query correctly (explicit wins, `auto` follows the query), one
 * layer up. `props.dark` is meant to carry that ALREADY-RESOLVED boolean
 * down from there; this hook only fills the gap when nothing does.
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
 * volume drives the scale TWEEN here, in exactly one place (the
 * volume-override effect below), and nowhere else.
 *
 * `dark` is an extra field on top of `ShaderVariantProps`, not yet a member
 * of that shared type: it is meant to carry the FACADE's already-resolved
 * `theme="light"|"dark"|"auto"` decision (see `define.tsx`'s
 * `createDarkMode`), threaded down through the dispatcher, once that wiring
 * lands (see the task report for the exact shape requested). Optional, with
 * a live `prefers-color-scheme` fallback, so this component still works
 * correctly when mounted standalone (no facade above it resolving a
 * `theme` attribute at all).
 */
export default function AuroraVisualizer(props: ShaderVariantProps & { dark?: boolean }): JSX.Element {
  const intensity = createTween(1.0);
  const speed = createTween(0.5);
  const complexity = createTween(0.4);
  const amplitude = createTween(1.2);
  const scale = createTween(0.2);
  // Fallback only -- see usePrefersDark's and resolvedDark's own docs.
  const systemDark = usePrefersDark();
  // An explicit `props.dark` (the facade's already-resolved theme) always
  // wins; falling back to the system media query is only correct when
  // nothing upstream resolved a theme at all (the standalone case).
  const resolvedDark = () => props.dark ?? systemDark();

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

    // Listening's scale landing is the one springy target -- the Apache
    // driving hook's "perk up" (fact sheet section 5: spring 1.0 s, bounce
    // 0.35; audit target 7). Every other state keeps the plain 0.5 s
    // ease-out landing, and frozen collapses the spring like any tween.
    scale.to(
      t.scale,
      props.state === 'listening' && !props.frozen
        ? { type: 'spring', duration: 1.0, bounce: 0.35 }
        : landing,
    );

    // Fact sheet section 5: "Speed is NOT tweened and multiplies absolute
    // time -> every state change teleports the phase." Frozen pins it at 0
    // rather than merely snapping to the state's raw target: uSpeed is the
    // only thing driving the aura's continuous "wind" motion at all (there
    // is no separate amplitude/opacity axis to freeze it through, unlike
    // wave), so zeroing it is what actually holds the shape still.
    speed.to(props.frozen ? 0 : t.speed, { duration: 0 });
  });

  // Voice-driven radius: "0.2 + 0.2 x volume", speaking only, instant (fact
  // sheet section 5 -- measured lag in the reference capture is at or under
  // 33ms). This drives the scale TWEEN imperatively, deliberately NOT a
  // pure derivation, because upstream's two guard semantics live in what
  // this effect does NOT do (audit targets 6 + 7):
  //   - `scale.animating()`: while the 0.5 s state landing (or the
  //     listening spring) is in flight, volume ticks are ignored -- the
  //     landing finishes first. Because `animating` is a signal this effect
  //     tracks, it re-runs the moment the landing settles and applies the
  //     CURRENT volume immediately, so a volume that arrived mid-landing is
  //     not lost until the next tick.
  //   - `volume > 0`: silence stops DRIVING the scale rather than reverting
  //     it, so a mid-speech pause holds the last voice-driven radius
  //     (silence-hold) until the voice resumes or the state changes -- a
  //     state change re-targets the tween through the effect above.
  // Reads scale.animating() but never scale.value(): reading the tween's
  // own value here would wire the self-retriggering effect loop
  // create-tween's doc warns about.
  createEffect(() => {
    if (props.state !== 'speaking') return;
    const volume = props.volume;
    if (!(volume > 0)) return;
    if (scale.animating()) return;
    scale.to(0.2 + 0.2 * volume);
  });

  // Solid-body rotation trim (deg/s -> rad/s for the shader), never
  // tweened, pinned to 0 under frozen exactly like uSpeed -- it multiplies
  // absolute time in the shader, so a nonzero value would keep the figure
  // spinning through reduced motion.
  const rotationValue = () =>
    props.frozen ? 0 : (auroraTargets(props.state).rotation * Math.PI) / 180;

  // uTheme: 0 selects the shader's DARK colour pipeline, 1 selects LIGHT
  // (aurora.glsl.ts, fact sheet section 4 -- a real branch in the colour
  // math, not just a compositing background). Named and isolated here,
  // deliberately not inlined into the uniforms object below: inverting this
  // one line silently swaps the two pipelines, and both render something
  // plausible, so the mapping needs to stay obvious at a glance rather than
  // buried in a longer expression.
  const uThemeValue = () => (resolvedDark() ? 0 : 1);

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
          uScale: { type: '1f', value: scale.value() },
          uTheme: { type: '1f', value: uThemeValue() },
          uRotation: { type: '1f', value: rotationValue() },
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
