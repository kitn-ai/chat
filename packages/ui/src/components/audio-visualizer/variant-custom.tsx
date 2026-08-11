import { createEffect, createMemo, Show, type JSX } from 'solid-js';
import { ShaderCanvas, hexToRgb, DEFAULT_SHADER_COLOR, type UniformSpec, type UniformType } from './shader-canvas';
import { createTween } from '../../primitives/create-tween';
import { shaderTargets } from '../../primitives/visualizer-sequences';
import { CONTAINER_HEIGHT } from './sizes';
import type { ShaderVariantProps } from './index';

/**
 * Every `UniformType` shader-canvas.tsx knows how to declare and push to the
 * GPU, duplicated here because that module does not export its `GLSL_TYPE`
 * map. `ShaderSpec.uniforms` narrows `type` to `UniformType` at the TS level
 * (see `index.tsx`), but a consumer can still reach this component through
 * the `<kai-audio-visualizer>` custom element with a plain JS object cast
 * past that check (`el.shader = {...}`), or any attribute-driven wrapper
 * that never touches TypeScript at all -- so an unrecognized `type` string
 * is checked again here, at runtime, against genuinely untrusted input.
 *
 * A `Record<UniformType, true>` literal, not a `Set`: if `UniformType` ever
 * grows a member, this object literal fails to typecheck until a matching
 * key is added here too, so the two cannot silently drift apart. Same
 * compiler-enforced-completeness technique as `effectiveArraySize` in
 * shader-canvas.tsx. Membership is checked with a strict `=== true` value
 * comparison (`uniformProblem` below), not `in` or `.hasOwnProperty`: a
 * bracket lookup with an untrusted key can resolve to an INHERITED
 * `Object.prototype` member (e.g. `spec.type === 'toString'`), and `in`
 * would treat that as present. Comparing the looked-up VALUE to `true`
 * rejects that case too, since `Object.prototype.toString` is a function,
 * never `true`.
 */
const KNOWN_UNIFORM_TYPES: Record<UniformType, true> = {
  '1f': true, '1i': true, '1fv': true, '2f': true, '3f': true, '3fv': true,
  '4f': true, '4fv': true, Matrix2fv: true, Matrix3fv: true, Matrix4fv: true,
};

/** `1f` and `1i` take a plain number. Every other type takes an array. */
const SCALAR_UNIFORM_TYPES = new Set<UniformType>(['1f', '1i']);

/**
 * Exact element count for the uniform types whose arity is a fixed constant
 * of the type name -- `2f` a vec2 (2), `3f` a vec3 (3), `4f` a vec4 (4), and
 * `Matrix2fv`/`Matrix3fv`/`Matrix4fv` a 2x2/3x3/4x4 matrix (4/9/16) -- and
 * needs no import from shader-canvas.tsx's private unit-size table to know.
 *
 * Deliberately excludes `1fv`/`3fv`/`4fv`: shader-canvas.tsx's own
 * `inferArraySize` treats THOSE three as a legitimate multi-instance array
 * whenever `value.length` is a multiple of their unit greater than one, with
 * no explicit `arraySize` required to opt in -- `uBands` below is exactly
 * that pattern (`1fv`, an unbounded length). A fixed-length check on them
 * would reject a consumer's genuinely valid array uniform, not just a
 * mistake. A matrix ARRAY is technically eligible for the same inference in
 * shader-canvas.tsx, but has no legitimate use in this component's
 * single-pass ShaderToy-style shader model, and `ShaderSpec.uniforms`
 * exposes no `arraySize` a consumer could use to request one deliberately --
 * so treating a matrix uniform as always-one-instance here is a reasonable,
 * simpler default. A consumer who genuinely needs an array of matrices is
 * not served by this check; see the task report for that tradeoff.
 */
const FIXED_ARITY: Partial<Record<UniformType, number>> = {
  '2f': 2, '3f': 3, '4f': 4,
  Matrix2fv: 4, Matrix3fv: 9, Matrix4fv: 16,
};

/**
 * Checks one consumer-declared uniform's `value` against its `type`,
 * returning a problem description, or `undefined` if it is safe to hand to
 * WebGL.
 *
 * The scalar-vs-array check is what matters most for safety: a `1f` handed
 * an array, or a `3fv` handed a bare number, is what makes WebGL's
 * `uniform*` setters throw a `TypeError` -- the WebIDL binding fails to
 * convert the argument at all. The fixed-arity check below it is a
 * correctness improvement on top of that, not a safety one: an array of the
 * wrong length for a type WebGL treats as fixed-size is a GL-level
 * `INVALID_OPERATION` recorded on the context, not a JS exception -- it
 * degrades the picture rather than crashing the render loop -- but it is
 * cheap to catch here with a clear message instead of a silent blank patch
 * on screen.
 */
function uniformProblem(name: string, spec: UniformSpec): string | undefined {
  if (spec == null || typeof spec !== 'object') {
    return `uniform "${name}" is not a valid declaration (expected an object with "type" and "value").`;
  }
  if (KNOWN_UNIFORM_TYPES[spec.type] !== true) {
    return `uniform "${name}" has an unrecognized type "${String(spec.type)}".`;
  }
  if (SCALAR_UNIFORM_TYPES.has(spec.type)) {
    if (typeof spec.value !== 'number' || !Number.isFinite(spec.value)) {
      return `uniform "${name}" is declared "${spec.type}" (a number) but its value is not a finite number.`;
    }
    return undefined;
  }
  if (
    !Array.isArray(spec.value) ||
    spec.value.some((v) => typeof v !== 'number' || !Number.isFinite(v))
  ) {
    return `uniform "${name}" is declared "${spec.type}" (an array) but its value is not an array of finite numbers.`;
  }
  const arity = FIXED_ARITY[spec.type];
  if (arity !== undefined && spec.value.length !== arity) {
    return `uniform "${name}" is declared "${spec.type}", which takes exactly ${arity} numbers, but its value has ${spec.value.length}.`;
  }
  return undefined;
}

/**
 * Uniforms every custom shader receives without asking: the standard set
 * (`uColor`, `uIntensity`, `uSpeed`, `uComplexity`) plus the audio pair that
 * ONLY this variant gets. Upstream's shader path only ever hands a shader a
 * scalar volume; `uBands` -- a per-band `float` array -- has no equivalent
 * there, so a spectrum-reactive custom shader is possible here and not
 * there. `iTime`/`iResolution`/`iMouse`/`iFrame`/`iDate` are declared by
 * `ShaderCanvas` itself for every shader, custom or not, so they are not
 * repeated here.
 *
 * `extra` is a consumer's `ShaderSpec.uniforms` -- untrusted input. Every
 * entry is checked with `uniformProblem` before being merged in; a bad
 * `type`/`value` pairing throws rather than being handed to `ShaderCanvas`,
 * where the mismatch would otherwise throw a `TypeError` inside WebGL's
 * `uniform*` setters, called from `ShaderCanvas`'s OWN
 * `requestAnimationFrame` loop, where nothing catches it and the canvas
 * silently stops animating. `CustomVisualizer` below is what turns that
 * throw into the same `onUnavailable` seam every other shader failure uses
 * -- see its own doc for how.
 *
 * Pure and synchronous: reads no signals, schedules nothing. Task 15 reuses
 * it as-is.
 */
export function customUniforms(
  values: {
    color: string;
    intensity: number;
    speed: number;
    complexity: number;
    volume: number;
    bands: number[];
  },
  extra?: Record<string, UniformSpec>,
): Record<string, UniformSpec> {
  // GLSL has no zero-length arrays, so an empty band list still declares
  // one -- and the declared length always comes from THIS array's own
  // length (`arraySize: bands.length`), never a separately tracked count,
  // so the declaration and the value pushed to the GPU can never disagree.
  const bands = values.bands.length ? values.bands : [0];

  const standard: Record<string, UniformSpec> = {
    uColor: { type: '3fv', value: hexToRgb(values.color) },
    uIntensity: { type: '1f', value: values.intensity },
    uSpeed: { type: '1f', value: values.speed },
    uComplexity: { type: '1f', value: values.complexity },
    uVolume: { type: '1f', value: values.volume },
    uBands: { type: '1fv', value: bands, arraySize: bands.length },
  };

  if (!extra) return standard;

  for (const [name, spec] of Object.entries(extra)) {
    const problem = uniformProblem(name, spec);
    if (problem) throw new Error(problem);
  }

  return { ...standard, ...extra };
}

/**
 * Renders a consumer-supplied fragment shader.
 *
 * The shader must define `mainImage(out vec4 fragColor, in vec2 fragCoord)`
 * and gets the five ShaderToy built-ins (`iTime`, `iResolution`, `iMouse`,
 * `iFrame`, `iDate`) plus every uniform `customUniforms` above declares.
 * `ShaderCanvas` DECLARES all of them for you -- declaring the SAME name
 * again inside the shader body is a GLSL redefinition and fails to compile.
 *
 * `fragColor` MUST be premultiplied: `vec4(rgb * alpha, alpha)`, never
 * `vec4(rgb, alpha)`. The canvas composites using the browser's default
 * `premultipliedAlpha: true`; a translucent edge written the natural
 * (straight-alpha) way gets a dark fringe where it meets a light page. For
 * example, a shader painting a soft circle that fades to transparent at its
 * edge:
 *
 * ```glsl
 * void mainImage(out vec4 fragColor, in vec2 fragCoord) {
 *   vec2 uv = fragCoord / iResolution.xy;
 *   float alpha = smoothstep(1.0, 0.0, length(uv - 0.5) * 2.0) * uIntensity;
 *   fragColor = vec4(uColor * alpha, alpha); // premultiplied -- NOT vec4(uColor, alpha)
 * }
 * ```
 *
 * `uVolume` (scalar) and `uBands` (a `float[N]` array, `N` tracking the
 * visualizer's actual band count) are this task's differentiating feature:
 * upstream's shader path only ever hands a shader a scalar, so a
 * spectrum-reactive custom shader is only possible here.
 *
 * A bad `props.shader.uniforms` entry (an unrecognized `type`, or a `value`
 * that does not match it) is logged loudly via `console.error` -- it is a
 * bug in the consumer's shader spec they need to see -- and routed through
 * `props.onUnavailable`, same as a shader compile or link failure. A
 * missing WebGL context logs quietly via `console.warn`: that is an
 * expected environment limitation, not a bug. `props.shader` being absent
 * entirely is neither: it renders an empty placeholder and does not call
 * `onUnavailable` at all, since nothing was ever asked to render.
 */
export default function CustomVisualizer(props: ShaderVariantProps): JSX.Element {
  const intensity = createTween(0.3);
  const speed = createTween(1);

  // Intensity has exactly ONE writer -- this effect -- on purpose. The
  // volume override used to live in a second effect ("if speaking,
  // intensity.to(0.3 + 0.7v, instant)") alongside this one's 0.5s tween
  // toward the state base; both re-ran on a state flip, and Solid re-runs
  // sibling effects in the order they sit in the signal's observer list,
  // which reorders as effects re-subscribe over their lifetimes. Under the
  // adverse ordering the base tween landed AFTER the override and parked a
  // speaking shader at the 0.3 base until the next volume change -- which
  // never comes under static `bands`/`volume` prop drive. The same
  // two-writer race variant-wave.tsx carried (measured there on the parity
  // harness; latent here). NOT the benign disjoint-writer two-effect shape
  // the Task 12 review accepted -- these two wrote the SAME tween. See the
  // wave variant's twin comment; same effect-race class as b5795ac.
  createEffect(() => {
    const t = shaderTargets(props.state);
    if (props.state === 'speaking') {
      // Live volume takes over intensity while speaking, with no easing so
      // the picture tracks the audio exactly -- and lands immediately on
      // re-entry regardless of effect ordering. `volume` is only tracked
      // in this branch, so volume ticks skip the base-target path below.
      intensity.to(0.3 + 0.7 * props.volume, { duration: 0 });
    } else {
      const transition = props.frozen ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' as const };
      intensity.to(Array.isArray(t.intensity) && props.frozen ? t.intensity[0] : t.intensity, transition);
    }
    // `iTime` is never frozen by ShaderCanvas itself -- it is the raw clock,
    // always advancing. A custom shader written the conventional way
    // (`iTime * uSpeed`) is the ONLY thing that can honour reduced motion,
    // and only if `uSpeed` is actually pinned at 0 here. Matches
    // variant-aurora.tsx's `speed.to(props.frozen ? 0 : t.speed, ...)`.
    speed.to(props.frozen ? 0 : t.speed, { duration: 0 });
  });

  // Recomputed whenever a dependency changes -- same as every other shader
  // variant's uniforms object; see ShaderCanvas's reactivity note on why
  // that is fine (only STRUCTURE triggers a recompile, not a value change).
  // The try/catch is what keeps a bad `props.shader.uniforms` entry from
  // ever reaching ShaderCanvas: without it, `customUniforms`'s throw (see
  // its own doc) would happen wherever THIS expression gets evaluated,
  // which includes ShaderCanvas's own requestAnimationFrame loop -- a raw
  // browser callback nothing else catches.
  //
  // Deliberately kept a PURE derivation (no console/onUnavailable calls
  // here): those are side effects, and belong in the createEffect below,
  // not in a memo whose body should be safe to (re)run purely for its
  // return value.
  const result = createMemo<{ uniforms?: Record<string, UniformSpec>; error?: string }>(() => {
    try {
      const uniforms = customUniforms(
        {
          color: props.color ?? DEFAULT_SHADER_COLOR,
          intensity: intensity.value(),
          speed: speed.value(),
          complexity: props.complexity ?? 0.5,
          volume: props.volume,
          bands: props.bands,
        },
        props.shader?.uniforms,
      );
      return { uniforms };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Guards against reporting the SAME failure more than once: ShaderCanvas
  // reads `uniforms` fresh every animation frame (see its own reactivity
  // note), so `result` above can keep re-evaluating to the same error more
  // than once before the `Show` below actually unmounts it. Reset on a
  // successful `result` (not left permanently `true` once tripped): the
  // dispatcher's own `unavailable` flag is permanent for a mount, but this
  // component is a public default export usable standalone (e.g. a shader
  // editor or a Storybook control surface) where `props.shader` can change
  // after mount -- a consumer who fixes one bad uniform and then introduces
  // a DIFFERENT one in the same mount must still see and hear about the
  // second mistake, not silence because the first one already fired.
  let reported = false;
  createEffect(() => {
    const { error } = result();
    if (!error) {
      reported = false;
      return;
    }
    if (reported) return;
    reported = true;
    console.error(`<kai-audio-visualizer variant="custom">: ${error}`);
    props.onUnavailable();
  });

  const containerStyle = (): JSX.CSSProperties => ({
    height: `${CONTAINER_HEIGHT[props.size]}px`,
    'aspect-ratio': '1',
  });

  return (
    <Show
      when={props.shader?.fragment}
      fallback={<div data-kai-state={props.state} class={props.class} style={containerStyle()} />}
    >
      {(fragment) => (
        <Show
          when={result().uniforms}
          fallback={<div data-kai-state={props.state} class={props.class} style={containerStyle()} />}
        >
          {(u) => (
            <div data-kai-state={props.state} class={props.class} style={containerStyle()}>
              <ShaderCanvas
                fragment={fragment()}
                precision={props.size === 'icon' || props.size === 'sm' ? 'mediump' : 'highp'}
                uniforms={u()}
                animateWhenNotVisible={props.animateWhenNotVisible}
                onError={(message) => {
                  // "not available" is ShaderCanvas's literal wording for a
                  // missing WebGL context (see its own doc) -- an expected
                  // environment limitation, not a bug, so it logs quietly.
                  // Anything else is a compile or link failure IN THE
                  // CONSUMER'S SHADER, which they need to see, so it is loud.
                  const missingContext = /not available/i.test(message);
                  if (missingContext) {
                    console.warn('<kai-audio-visualizer variant="custom">: shader unavailable', message);
                  } else {
                    console.error('<kai-audio-visualizer variant="custom">: shader error', message);
                  }
                  props.onUnavailable();
                }}
              />
            </div>
          )}
        </Show>
      )}
    </Show>
  );
}
