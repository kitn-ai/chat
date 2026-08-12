import { createEffect, createMemo, onCleanup, untrack, type JSX } from 'solid-js';
import { cn } from '../../utils/cn';

export type UniformType =
  | '1f' | '1i' | '1fv' | '2f' | '3f' | '3fv' | '4f' | '4fv'
  | 'Matrix2fv' | 'Matrix3fv' | 'Matrix4fv';

export interface UniformSpec {
  type: UniformType;
  value: number | number[];
  /**
   * For array uniforms (`1fv`, `3fv`, `4fv`, or a matrix type repeated), the
   * declared length. Optional: when omitted, it is inferred from
   * `value.length` -- see `inferArraySize`. The inferred length is exactly
   * what the recompile check uses too (see `effectiveArraySize`), so a
   * length change recompiles the shader whether `arraySize` was passed
   * explicitly or left to be inferred -- e.g. a per-band uniform whose
   * length tracks a reactive `size`/`barCount` prop stays correct across a
   * band-count change with no extra care from the caller.
   */
  arraySize?: number;
}

export interface ShaderCanvasProps {
  /**
   * GLSL defining `mainImage(out vec4 fragColor, in vec2 fragCoord)`.
   *
   * MUST output PREMULTIPLIED colour: `fragColor = vec4(rgb * alpha, alpha);`,
   * not `vec4(rgb, alpha)`. The canvas context uses the browser default
   * `premultipliedAlpha: true` (see `ShaderCanvas`'s doc for why), so a
   * naturally written soft/anti-aliased edge that returns straight (not
   * premultiplied) colour composites with a dark fringe or halo -- most
   * visible on a light page background.
   */
  fragment: string;
  /**
   * Custom uniforms. THIS CANVAS DECLARES THEM FOR YOU by injecting
   * `uniform <type> <name>;` into the shader source. Declaring them yourself
   * in `fragment` too is a GLSL redefinition and fails to compile.
   */
  uniforms?: Record<string, UniformSpec>;
  precision?: 'lowp' | 'mediump' | 'highp';
  /**
   * Called when the shader cannot render at all: no WebGL context, or a
   * compile/link failure. Not called again for a later value-only uniform
   * update (see the reactivity note on `ShaderCanvas` below) -- only when
   * the shader itself is rebuilt and that rebuild fails.
   */
  onError?: (message: string) => void;
  /**
   * Keep animating while the canvas is off screen. Default `false`.
   *
   * By default an off-screen canvas stops drawing AND hands its WebGL context
   * back to the browser (see `ShaderCanvas`'s doc), because contexts are
   * rationed at roughly 16 per renderer process and a page of visualizers
   * blows through that. Set this when a canvas must keep running unseen --
   * capturing frames, or a shader whose state must not visibly jump when it
   * scrolls back in. The cost is one permanently-held context per canvas, so
   * it does not scale: a page that sets this on more than a handful of
   * visualizers is back to the eviction problem the default exists to avoid.
   *
   * Named to match upstream's prop of the same name, though ours opts out of
   * something stronger: theirs only pauses the draw loop, ours also releases
   * the context.
   *
   * This does NOT override `prefers-reduced-motion`. Reduced motion is applied
   * a layer up, by the variants zeroing their own speed uniforms, so a frozen
   * shader stays a still image whether or not this is set -- this only decides
   * whether frames keep being drawn, never what they contain.
   */
  animateWhenNotVisible?: boolean;
  class?: string;
}

/** Default accent for the shader variants, matching upstream's. */
export const DEFAULT_SHADER_COLOR = '#1FD5F9';

/**
 * `#rrggbb` to three 0..1 floats, for a `3fv` uniform. Falls back to the
 * default on malformed input (short forms like `#fff`, bare colour names,
 * empty strings) rather than throwing into a render loop.
 *
 * Lives here, not duplicated, because wave, aurora, and custom variants all
 * need it.
 */
export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (!m) return hexToRgb(DEFAULT_SHADER_COLOR);
  const [, r, g, b] = m;
  return [parseInt(r!, 16) / 255, parseInt(g!, 16) / 255, parseInt(b!, 16) / 255];
}

const GLSL_TYPE: Record<UniformType, string> = {
  '1f': 'float', '1i': 'int', '1fv': 'float',
  '2f': 'vec2', '3f': 'vec3', '3fv': 'vec3', '4f': 'vec4', '4fv': 'vec4',
  Matrix2fv: 'mat2', Matrix3fv: 'mat3', Matrix4fv: 'mat4',
};

/**
 * How many raw scalars make up ONE instance of an "*fv"/matrix uniform's
 * GLSL type -- e.g. one `3fv` (a single vec3) is 3 floats, one `Matrix4fv`
 * (a single mat4) is 16. Only these six types take an array `value` where
 * "array" is ambiguous between "one instance, passed as an array because
 * that is how the `*fv` GPU setters work" and "a genuine GLSL array of N
 * instances the caller forgot to size." `inferArraySize` below uses this to
 * tell the two apart: `value.length` equal to one unit's size is a single
 * instance (no `[N]`); a whole-number multiple greater than one is an
 * unsized array, so its size gets inferred.
 */
const UNIFORM_UNIT_SIZE: Partial<Record<UniformType, number>> = {
  '1fv': 1, '3fv': 3, '4fv': 4,
  Matrix2fv: 4, Matrix3fv: 9, Matrix4fv: 16,
};

/**
 * When a caller omits `arraySize` on an array-capable uniform (`1fv`, `3fv`,
 * `4fv`, or a matrix type) but `value` is longer than one instance of that
 * type, infer the array length from `value.length` instead of silently
 * declaring a scalar.
 *
 * This closes a real internal inconsistency: without it, `{ type: '1fv',
 * value: [a, b, c] }` declared `uniform float name;` (scalar) while
 * `setUniform` unconditionally called `gl.uniform1fv(location, [a, b, c])`
 * -- a mismatch WebGL reports as `INVALID_OPERATION` with no JS exception
 * and no `onError`, just a stale or zero value on screen. This function is
 * what keeps the declaration and the setter from ever being able to
 * disagree.
 */
function inferArraySize(u: UniformSpec): number | undefined {
  const unit = UNIFORM_UNIT_SIZE[u.type];
  if (!unit || !Array.isArray(u.value)) return undefined;
  const instances = u.value.length / unit;
  return instances > 1 && Number.isInteger(instances) ? instances : undefined;
}

/**
 * The array length a uniform will actually be declared and compiled with:
 * the caller's explicit `arraySize` if given, otherwise `inferArraySize`'s
 * guess from `value.length`.
 *
 * `buildFragmentSource` (the declaration) and `uniformShapeKey` (the
 * recompile trigger) both call this SAME function, on purpose -- it is the
 * one source of truth for "how big is this array," so the two can never
 * disagree. Before this existed, an uninferred array uniform's declaration
 * came from `value.length` but the recompile check only looked at the
 * explicit `arraySize` field: a reactive `value.length` change (e.g. a
 * `uBands` uniform whose length tracks a `size`/`barCount` prop, which does
 * change while a shader variant stays mounted) would silently NOT recompile,
 * reintroducing the exact declaration/setter mismatch this file exists to
 * prevent, just one door over. Routing both call sites through the same
 * function makes that impossible rather than merely documented.
 */
function effectiveArraySize(u: UniformSpec): number | undefined {
  return u.arraySize ?? inferArraySize(u);
}

/** Every ShaderToy built-in we support, declared for every shader. */
const BUILTINS = [
  'uniform float iTime;',
  'uniform vec2 iResolution;',
  'uniform vec4 iMouse;',
  'uniform int iFrame;',
  'uniform vec4 iDate;',
].join('\n');

const VERTEX_SOURCE = `
attribute vec3 aVertexPosition;
void main() { gl_Position = vec4(aVertexPosition, 1.0); }
`;

/**
 * Assemble the full fragment shader: precision, built-ins, auto-declared
 * custom uniforms, the caller's body, and a `main()` that forwards to
 * `mainImage`.
 *
 * Declares every entry in `uniforms` for the caller (`uniform <type>
 * <name>;`, injected right after the precision qualifier). Declaring the
 * SAME uniform name inside `fragment` too is a GLSL redefinition and fails
 * to compile -- that is the contract this function exists to protect.
 *
 * Split out from the component because it is the only part testable without
 * a GPU (jsdom has no WebGL at all), and it is where both a compile-breaking
 * duplicate declaration and an array-size mismatch would show up.
 */
export function buildFragmentSource(
  fragment: string,
  uniforms: Record<string, UniformSpec>,
  precision: string,
): string {
  const declarations = Object.entries(uniforms)
    .map(([name, u]) => {
      const arraySize = effectiveArraySize(u);
      const size = arraySize ? `[${arraySize}]` : '';
      return `uniform ${GLSL_TYPE[u.type]} ${name}${size};`;
    })
    .join('\n');

  return [
    `precision ${precision} float;`,
    BUILTINS,
    declarations,
    fragment,
    'void main() { mainImage(gl_FragColor, gl_FragCoord.xy); }',
  ].join('\n');
}

/**
 * A stable fingerprint of the uniforms' STRUCTURE -- name, GLSL type, and
 * EFFECTIVE array size (`effectiveArraySize`, explicit or inferred, never
 * raw `u.arraySize` alone) -- deliberately excluding `value` itself. Two
 * calls with the same names/types/sizes but different values return the
 * same string; two calls where an array's `value.length` differs, even with
 * no explicit `arraySize` on either side, return DIFFERENT strings, because
 * that length difference is exactly what `buildFragmentSource` would
 * declare differently.
 *
 * This is what lets the component recompile only when the shader itself
 * must change, not every time a uniform's value updates (which, for an
 * audio-reactive uniform, is every animation frame) -- while still
 * recompiling on every change that actually changes the declared source,
 * including a length-only change to an inferred-size array.
 */
function uniformShapeKey(uniforms: Record<string, UniformSpec>): string {
  return Object.keys(uniforms)
    .sort()
    .map((name) => {
      const u = uniforms[name]!;
      return `${name}:${u.type}:${effectiveArraySize(u) ?? ''}`;
    })
    .join('|');
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | string {
  const shader = gl.createShader(type);
  if (!shader) return 'Could not create a WebGL shader.';
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error.';
    gl.deleteShader(shader);
    return log;
  }
  return shader;
}

/** Push one uniform value to the GPU, dispatching on its declared type. */
function setUniform(
  gl: WebGLRenderingContext,
  location: WebGLUniformLocation,
  spec: UniformSpec,
): void {
  const v = spec.value;
  switch (spec.type) {
    case '1f': gl.uniform1f(location, v as number); break;
    case '1i': gl.uniform1i(location, v as number); break;
    case '1fv': gl.uniform1fv(location, v as number[]); break;
    case '2f': gl.uniform2fv(location, v as number[]); break;
    case '3f': case '3fv': gl.uniform3fv(location, v as number[]); break;
    case '4f': case '4fv': gl.uniform4fv(location, v as number[]); break;
    case 'Matrix2fv': gl.uniformMatrix2fv(location, false, v as number[]); break;
    case 'Matrix3fv': gl.uniformMatrix3fv(location, false, v as number[]); break;
    case 'Matrix4fv': gl.uniformMatrix4fv(location, false, v as number[]); break;
  }
}

/**
 * A full-screen fragment shader on a canvas, ShaderToy-compatible.
 *
 * Deliberately does NOT support textures, `iChannel` inputs, video,
 * multipass, or device orientation. Those are what make upstream's runner
 * 988 lines, and an audio visualizer needs none of them.
 *
 * Renders with a fully transparent clear colour (`gl.clearColor(0,0,0,0)`).
 * Compositing over the page comes from the canvas context's default
 * `premultipliedAlpha: true`, NOT from `gl.blendFunc` (see the comment at
 * the blend call site for why that call has no effect on today's
 * single-pass output). Because of that default, `fragment` MUST output
 * premultiplied colour -- see the doc on the `fragment` prop for the exact
 * contract.
 *
 * Reactivity note: only `fragment`, `precision`, and the STRUCTURE of
 * `uniforms` (which names exist, with which types/sizes) trigger a rebuild
 * of the GL program. A uniform's VALUE is read fresh every animation frame
 * without forcing a rebuild -- see `uniformShapeKey` above. This matters
 * because a caller typically re-creates the `uniforms` object every render
 * (e.g. `{ uVolume: { type: '1f', value: volume() } }`); tracking that
 * object directly would tear down and recompile the whole program on every
 * frame the volume changes. `fragment` and `precision` are ALSO read through
 * their own memos, not directly, for the same reason: a variant's `precision`
 * is commonly computed from a prop (`size`) that arrives via a dispatcher
 * spread bundling unrelated fast-changing signals (`bands`), so an unmemoized
 * read can mark this effect stale on every one of those, even though
 * `precision`'s resolved value never changes. See the comment above
 * `fragmentMemo`/`precisionMemo` below for the measured failure this caused.
 *
 * Visibility: while the canvas is off screen this canvas RELEASES its WebGL
 * context outright, and takes it back when the canvas returns -- see the
 * `ContextState` block inside the component for the whole mechanism and the
 * context-budget measurement that forced it. There is no prop for this; it is
 * always on.
 */
export function ShaderCanvas(props: ShaderCanvasProps): JSX.Element {
  let canvas!: HTMLCanvasElement;

  const shapeKey = createMemo(() => uniformShapeKey(props.uniforms ?? {}));
  // `fragment` and `precision` get the SAME insulation as `shapeKey` above,
  // and for the same underlying reason. A variant's props are commonly built
  // with `{...shared()}` (see index.tsx's dispatcher: `shared()` returns
  // `state`/`size`/`bands`/`frozen`/`color` together). Solid's spread-prop
  // merging re-invokes the WHOLE source function on ANY property read from
  // the merged result -- so a variant computing `precision` from `props.size`
  // (e.g. aurora/wave's `props.size === 'icon' || ... ? 'mediump' :
  // 'highp'`) transitively re-runs `shared()`, and thus re-reads `bands()`,
  // on every read of `precision`, even though `size` itself never changes.
  // Reading `props.precision` directly inside the compile effect below
  // subscribed it to THAT transitive `bands()` read -- at ~31 band updates a
  // second, `precision`'s own resolved value never changed, but the effect
  // reran on every single one anyway, tearing down and recompiling the whole
  // GL program 15-20 times a second in production (measured on the Aurora
  // story: ~70 recompiles in 4s, `iTime` pinned under 0.33s and periodically
  // NEGATIVE from `start` being re-stamped mid-flight). `shapeKey` already
  // proved this class of leak is real for `uniforms`; `fragment`/`precision`
  // needed the identical fix, matching the one just applied to
  // `use-sequencer.ts` for the same root cause (an effect transitively
  // subscribed to a signal it should not be, via a prop getter chain) --
  // wrap in a memo so only the RESOLVED value, never the act of reading it,
  // can mark the effect stale.
  const fragmentMemo = createMemo(() => props.fragment);
  const precisionMemo = createMemo(() => props.precision ?? 'highp');

  // ------------------------------------------------------------------------
  // Context lifecycle.
  //
  // Chrome caps LIVE WebGL contexts at about 16 per renderer process and
  // silently evicts the oldest past that -- a budget shared across
  // same-origin iframes too, so splitting the page up buys nothing (measured:
  // the AudioVisualizer docs page wanted 18, got 16, and 2 canvases failed to
  // compile with no error anywhere). Holding a context for the component's
  // whole life is what made that page unable to host the shader stories at
  // all.
  //
  // Merely pausing the draw loop off screen -- which is all upstream's
  // runner does -- does NOT return a slot: an idle context still occupies
  // one. So an off-screen canvas gives the context BACK, via
  // `WEBGL_lose_context`'s `loseContext()`, and asks for it again with
  // `restoreContext()` on the way in. Consequence worth stating plainly: N
  // off-screen visualizers now hold ZERO contexts between them, and a page
  // holds one per canvas actually in the viewport.
  //
  // All of this state is COMPONENT-scoped rather than living inside the
  // compile effect, because a context belongs to the CANVAS, which outlives
  // any one run of that effect. A shader released while off screen must still
  // be restorable after a recompile (a `size`/band-count change genuinely
  // rebuilds the shader while a tile is scrolled away).
  // ------------------------------------------------------------------------

  /**
   * Where the canvas's context is, independent of whether a program is
   * currently compiled against it (that is `teardown`).
   *
   * `losing` and `restoring` are the IN-FLIGHT states, and they are the whole
   * reason this is a state machine rather than a boolean:
   * `loseContext()`/`restoreContext()` do not take effect synchronously --
   * the browser answers later with `webglcontextlost`/`webglcontextrestored`.
   * A canvas that scrolls out and back in before the answer arrives must sit
   * in the in-flight state and re-decide when the event lands, never start a
   * second draw loop or compile against a context that is still gone.
   */
  type ContextState = 'none' | 'live' | 'losing' | 'lost' | 'restoring';
  let contextState: ContextState = 'none';
  let context: WebGLRenderingContext | null = null;
  /**
   * Cached WHILE THE CONTEXT IS ALIVE, deliberately: a lost context answers
   * `getExtension` with null, so re-fetching it on the way back in is a dead
   * end. This handle is the only thing that can restore what we released.
   */
  let loseExtension: WEBGL_lose_context | null = null;

  /** Undoes everything the current activation built. Null when nothing is built. */
  let teardown: (() => void) | null = null;
  /** The current frame callback. Null when nothing is built. */
  let drawFrame: ((now: number) => void) | null = null;
  /** The pending animation frame id, or 0 when the loop is stopped. */
  let raf = 0;
  /**
   * `cancelAnimationFrame`, captured at SETUP.
   *
   * `stopLoop()` below runs at dispose (via `release()`), and dispose is not
   * guaranteed to happen while the page that mounted this canvas is still
   * standing -- `component-register`'s `disconnectedCallback` defers a
   * microtask, and a test environment tears its DOM globals down in between.
   * A bare `cancelAnimationFrame` there throws from a promise nobody holds, so
   * it surfaces as an unhandled rejection that fails a run in which every test
   * passed. See tests/components/teardown-without-dom-globals.test.tsx.
   *
   * The FUNCTION, not the view. The `const win = window` capture that fixes a
   * bare `document` does nothing here: `window === globalThis` -- measured, in
   * jsdom and in real Chromium/WebKit alike -- and the teardown deletes these
   * keys off that very object, so `win.cancelAnimationFrame` is undefined by
   * the time cleanup runs. It only trades the ReferenceError for a TypeError.
   * `.bind` pins the receiver the WebIDL operation is specified on; Chromium
   * and WebKit both accept a detached call (measured), so the bind is belt and
   * braces against an engine that does not, at zero cost.
   *
   * GUARDED because "setup" for this component is its body, and a server render
   * executes component bodies. Node has no `cancelAnimationFrame` at all, so an
   * unguarded capture here would trade the disposal crash for an SSR crash --
   * measured, not hypothesised. Nothing can be scheduled without
   * `requestAnimationFrame` either, so the no-op fallback is exactly right.
   */
  const cancelFrame = typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame.bind(globalThis)
    : () => {};

  /** The assembled source and the uniform snapshot it was assembled from. */
  let build: { source: string; uniforms: Record<string, UniformSpec> } | null = null;
  /** THIS build cannot compile; reset whenever the effect produces a new one. */
  let buildFailed = false;
  /** No WebGL at all. Permanent for this mount, matching `onError`'s contract. */
  let noWebGL = false;
  /** The BROWSER took the context away (not us). Permanent for this mount. */
  let hardLost = false;
  let disposed = false;

  let visibility: IntersectionObserver | undefined;
  let wired = false;
  /**
   * Whether the canvas is on screen. Starts true and STAYS true when there is
   * no `IntersectionObserver` to consult (SSR, jsdom, older browsers), which
   * is what keeps that environment on exactly the pre-observer behaviour:
   * compile on mount, draw forever.
   */
  let onScreen = true;
  /**
   * The resolved `animateWhenNotVisible`, cached rather than read from props
   * inside `sync`. `sync` runs inside the compile effect, and a props read
   * there would subscribe that effect to this flag -- rebuilding the entire GL
   * program every time a caller toggled it, the exact leak the fragment /
   * precision / shapeKey memos above exist to prevent. Its own effect below is
   * the single writer.
   */
  let alwaysAnimate = false;

  /**
   * The shader clock, deliberately outliving both a release and a recompile.
   *
   * `iTime` is ON-SCREEN time: it accumulates only while the loop runs, so a
   * canvas that comes back after a minute off screen picks up exactly where
   * the viewer last saw it rather than jumping a minute forward. Freezing
   * rather than tracking wall-clock is a choice -- nothing here is
   * synchronised to real time, so the only observable difference is a
   * discontinuity on scroll-in, and there is no reason to have one.
   *
   * What it must never do is RESTART. A previous round shipped a defect where
   * a spuriously re-running compile effect re-stamped the clock's origin every
   * few frames, pinning `iTime` under 0.33s forever (shaders looked like they
   * were looping a third of a second). The memos above are the fix for that
   * cause; keeping the clock out here means even a legitimate recompile -- a
   * band-count change, say -- no longer snaps the animation back to zero, so
   * the whole class of "the shader restarted" bugs has one fewer door.
   * `frame` (`iFrame`) is kept monotonic for the same reason.
   */
  let elapsedMs = 0;
  let runStartedAt = 0;
  let frame = 0;

  const acquireContext = (): WebGLRenderingContext | null => {
    if (context) return context;
    context = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (context) {
      contextState = 'live';
      // Optional call: every real context implements `getExtension`, but a
      // context stub that does not should degrade to "cannot release" rather
      // than throwing out of the compile path.
      loseExtension = context.getExtension?.('WEBGL_lose_context') ?? null;
    }
    return context;
  };

  const startLoop = () => {
    // The one gate that makes a second concurrent loop impossible, however
    // fast visibility toggles: a loop is running iff `raf !== 0` (a real
    // animation-frame id is never 0).
    if (raf !== 0 || !drawFrame || disposed) return;
    runStartedAt = performance.now();
    raf = requestAnimationFrame(drawFrame);
  };

  const stopLoop = () => {
    if (raf === 0) return;
    // Captured at setup -- see `cancelFrame`. This line runs at dispose.
    cancelFrame(raf);
    raf = 0;
    // Bank what was drawn so `iTime` resumes from here, not from zero.
    elapsedMs += Math.max(0, performance.now() - runStartedAt);
  };

  /** Drop the compiled program/shaders/buffer, leaving the context itself alone. */
  const release = () => {
    stopLoop();
    const run = teardown;
    teardown = null;
    run?.();
  };

  const requestLoss = () => {
    if (!loseExtension || contextState !== 'live') return;
    contextState = 'losing';
    loseExtension.loseContext();
  };

  const requestRestore = () => {
    if (!loseExtension) return;
    contextState = 'restoring';
    loseExtension.restoreContext();
  };

  /**
   * Reconcile what is built against where the canvas is. Every input --
   * a visibility change, a context event, a new compiled source -- routes
   * through here rather than acting directly, which is what keeps the
   * in-flight windows from producing two loops or a half-initialised context.
   */
  const sync = () => {
    if (disposed || noWebGL || hardLost) return;
    // The ONE place visibility policy is decided. `animateWhenNotVisible`
    // overrides the observer's verdict here rather than anywhere upstream of
    // it, so there is still exactly one writer deciding whether this canvas
    // should be drawing -- a runtime flip of the flag is just another call
    // into this same reconciler, like a scroll or a context event.
    if (onScreen || alwaysAnimate) {
      // Mid-flight: the `webglcontextlost`/`webglcontextrestored` handler
      // re-enters here once the browser answers.
      if (contextState === 'losing' || contextState === 'restoring') return;
      if (contextState === 'lost') { requestRestore(); return; }
      activate();
    } else if (loseExtension && contextState === 'live') {
      // Resources first, THEN the context: deleting GPU objects after the
      // context is gone is a spec no-op, which leaks them for as long as the
      // driver keeps the dead context around.
      release();
      requestLoss();
    } else {
      // No way to hand the context back (no extension), or it is already
      // gone. Stop burning frames either way -- upstream's pause, as the
      // floor rather than the ceiling.
      stopLoop();
    }
  };

  const setOnScreen = (next: boolean) => {
    if (next === onScreen || disposed) return;
    onScreen = next;
    sync();
  };

  const onContextLost = (e: Event) => {
    // Required by spec to even ALLOW a later `webglcontextrestored` --
    // including for the losses this component asks for itself.
    e.preventDefault();
    const deliberate = contextState === 'losing';
    contextState = 'lost';
    release();
    if (deliberate) {
      // Ours, to free the budget while off screen. If the canvas scrolled
      // back in while the event was in flight, this is where it gets restored.
      sync();
      return;
    }
    // The browser evicted us -- most commonly because the page blew past the
    // context cap. Permanent for this mount: `onError` is what lets the
    // dispatcher fall back to bars. Without this the draw loop would keep
    // issuing GL calls that are all silent no-ops on a lost context, leaving a
    // shader frozen mid-frame with nothing reported anywhere.
    hardLost = true;
    props.onError?.('WebGL context was lost.');
  };

  const onContextRestored = () => {
    contextState = 'live';
    // Rebuild if the canvas is still on screen, or hand the context straight
    // back if it scrolled away again while the restore was in flight.
    sync();
  };

  const wireCanvas = () => {
    if (wired) return;
    wired = true;
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);

    if (typeof IntersectionObserver === 'undefined') return;

    // The observer is installed even when `animateWhenNotVisible` is set, and
    // its verdict is ignored in `sync` instead. Skipping the observer in that
    // mode would be marginally cheaper, but it would leave `onScreen` frozen
    // at a stale default, so flipping the flag OFF at runtime would need the
    // observer wired up right then and would keep drawing until its first
    // callback landed -- a second control path, and a wrong answer in the
    // meantime. Keeping it always-on means `onScreen` is continuously
    // accurate and a flip in either direction is a single `sync()` call.
    // An IntersectionObserver that never fires costs essentially nothing.
    //
    // With an observer, NOTHING is built until it reports the canvas on
    // screen -- unless `animateWhenNotVisible` says otherwise, which `sync`
    // resolves below. That is the load-bearing half of the fix: a page
    // mounting 18 visualizers otherwise creates 18 contexts in the mount task
    // and has 2 evicted by the browser before the first observer callback
    // could possibly run -- and an evicted context is a permanent failure,
    // not a recoverable one.
    onScreen = false;
    visibility = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setOnScreen(entry.isIntersecting);
    }, { threshold: 0 });
    visibility.observe(canvas);
  };

  const activate = () => {
    if (disposed || noWebGL || hardLost || buildFailed) return;
    const current = build;
    if (!current) return;

    // Already built and only the loop was stopped (the no-extension path
    // above): re-arm it rather than recompiling.
    if (teardown) { startLoop(); return; }

    const gl = acquireContext();
    if (!gl) {
      noWebGL = true;
      props.onError?.('WebGL is not available in this browser.');
      return;
    }
    if (gl.isContextLost()) {
      // Released earlier -- possibly by a PREVIOUS run of the compile effect,
      // which is why `loseExtension` is cached at component scope. Ask for it
      // back and let `webglcontextrestored` re-enter here.
      requestRestore();
      return;
    }

    const { source, uniforms } = current;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    if (typeof vs === 'string') {
      buildFailed = true;
      props.onError?.(vs);
      return;
    }
    const fs = compile(gl, gl.FRAGMENT_SHADER, source);
    if (typeof fs === 'string') {
      gl.deleteShader(vs);
      buildFailed = true;
      props.onError?.(fs);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      buildFailed = true;
      props.onError?.('Could not create a WebGL program.');
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'Shader program failed to link.';
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      buildFailed = true;
      props.onError?.(log);
      return;
    }
    gl.useProgram(program);

    // Two triangles covering clip space. The fragment shader does the rest.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]),
      gl.STATIC_DRAW,
    );
    const attr = gl.getAttribLocation(program, 'aVertexPosition');
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 3, gl.FLOAT, false, 0, 0);

    // This blendFunc has NO effect on today's output: `gl.clear` runs
    // immediately before the single `gl.drawArrays` every frame (see draw()
    // below), so the framebuffer is always transparent-black at draw time --
    // there is nothing behind the draw call to blend against. The actual
    // transparency mechanism is the canvas context's default
    // `premultipliedAlpha: true` combined with `clearColor(0,0,0,0)` below:
    // the browser composites the canvas's own premultiplied RGBA buffer over
    // the page. That default is also why `fragment` must output premultiplied
    // colour (see the `fragment` prop's doc) -- an unpremultiplied translucent
    // edge produces a dark fringe on a light page.
    //
    // The call stays enabled anyway: it is exactly what a future multipass or
    // non-clearing render path would need, and silently dropping it now would
    // be a behavioural change for that later path, not a cleanup.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const loc = (name: string) => gl.getUniformLocation(program, name);
    const uTime = loc('iTime');
    const uResolution = loc('iResolution');
    const uMouse = loc('iMouse');
    const uFrame = loc('iFrame');
    const uDate = loc('iDate');
    const customLocations = Object.keys(uniforms).map((n) => [n, loc(n)] as const);

    // Only .xy (pointer position) is implemented. ShaderToy's iMouse.zw
    // carries click-down position; this canvas has no pointerdown tracking,
    // so .zw stays permanently zero.
    const mouse = [0, 0, 0, 0];
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse[0] = e.clientX - r.left;
      mouse[1] = r.height - (e.clientY - r.top);
    };
    canvas.addEventListener('pointermove', onMove, { passive: true });

    // Match the backing store to the displayed size so the shader is not blurry.
    const resize = () => {
      const dpr = globalThis.devicePixelRatio ?? 1;
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : undefined;
    ro?.observe(canvas);
    resize();

    const draw = (now: number) => {
      // Belt-and-braces alongside the `webglcontextlost` listener: if a
      // context goes away by some path that does not fire the event
      // synchronously before the next frame, this still stops issuing GL
      // calls against it.
      if (hardLost || gl.isContextLost()) return;
      resize();
      // Clamped at 0: a browser's rAF callback receives the timestamp for
      // when the current frame BEGAN, captured before this component's
      // synchronous setup finishes and stamps `runStartedAt` -- so the very
      // first frame or two can compute a few milliseconds negative even with
      // nothing wrong. Harmless and self-correcting either way (confirmed:
      // the pathological, CONTINUOUSLY-recurring negative values reported in
      // production were the clock origin being re-stamped by a spuriously
      // re-running effect, not this), but there is no reason `iTime` should
      // ever go negative for a caller, so it does not.
      const seconds = Math.max(0, (elapsedMs + (now - runStartedAt)) / 1000);

      if (uTime) gl.uniform1f(uTime, seconds);
      if (uResolution) gl.uniform2fv(uResolution, [canvas.width, canvas.height]);
      if (uMouse) gl.uniform4fv(uMouse, mouse);
      if (uFrame) gl.uniform1i(uFrame, frame);
      if (uDate) {
        const d = new Date();
        gl.uniform4fv(uDate, [
          d.getFullYear(), d.getMonth(), d.getDate(),
          d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(),
        ]);
      }

      // Read straight off props, not the closed-over `uniforms` snapshot, so
      // a value change (e.g. volume ticking every frame) takes effect
      // immediately without going through the compile effect above at all.
      for (const [name, location] of customLocations) {
        const spec = props.uniforms?.[name];
        if (spec && location) setUniform(gl, location, spec);
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      frame++;
      raf = requestAnimationFrame(draw);
    };

    teardown = () => {
      drawFrame = null;
      ro?.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
    drawFrame = draw;
    startLoop();
  };

  onCleanup(() => {
    disposed = true;
    visibility?.disconnect();
    if (wired) {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
    }
    release();
    // Hand the budget back NOW rather than waiting for the detached canvas to
    // be collected: switching variants, or navigating a page full of tiles,
    // otherwise leaves dead contexts holding slots for a while.
    if (loseExtension && contextState === 'live') loseExtension.loseContext();
  });

  // Registered before the compile effect so `alwaysAnimate` already holds the
  // caller's policy the first time `sync()` runs, avoiding one reconcile pass
  // that could only ever decide to do nothing. Measured, not assumed: putting
  // this effect AFTER the compile effect passes every test in this file
  // unchanged, because both run in the same synchronous flush either way and
  // the canvas is built before anything can observe it. So this is tidiness,
  // NOT a correctness requirement -- what actually guarantees an opted-out
  // canvas builds without waiting on an observer callback is `sync`'s
  // `onScreen || alwaysAnimate`, which is the thing under test.
  //
  // Wrapped in its own memo for the same reason `fragment`/`precision` are:
  // a variant's props arrive through a dispatcher spread that bundles
  // fast-changing signals, so an unmemoized read would re-run this effect at
  // band cadence even though the resolved boolean never changed.
  const animateWhenNotVisibleMemo = createMemo(() => props.animateWhenNotVisible ?? false);
  createEffect(() => {
    alwaysAnimate = animateWhenNotVisibleMemo();
    // Route the change through the reconciler rather than acting on it here:
    // whether this means "build now", "release now", or "nothing changes"
    // depends on state `sync` already owns.
    sync();
  });

  createEffect(() => {
    // Reads ONLY the three memos below -- never `props.fragment` /
    // `props.precision` / `props.uniforms` directly -- so this effect's
    // dependency set is exactly {fragmentMemo, precisionMemo, shapeKey}, and
    // nothing a caller's props chain does elsewhere (spread-derived or not)
    // can mark it stale without one of those three RESOLVED values actually
    // changing.
    //
    // Note what this effect does NOT do any more: touch the GPU. It resolves
    // the source and hands it to `sync`, which owns every decision about
    // whether a context should exist right now. That split is what lets the
    // SAME setup path serve a first mount, a recompile, and a scroll-back-in
    // restore, instead of one path per trigger.
    const fragment = fragmentMemo();
    const precision = precisionMemo();
    shapeKey();
    const uniforms = untrack(() => props.uniforms ?? {});

    build = { source: buildFragmentSource(fragment, uniforms, precision), uniforms };
    // A new source gets a fresh attempt: a shader that failed to compile must
    // not poison the next one the caller supplies.
    buildFailed = false;

    wireCanvas();
    sync();

    // Runs before the NEXT execution of this effect as well as on unmount, so
    // a source change always drops the program compiled from the old source
    // before `sync` builds the new one. The context itself deliberately
    // survives -- it is the expensive, rationed thing, and the new source
    // needs it immediately.
    onCleanup(release);
  });

  return <canvas ref={canvas} part="canvas" class={cn('block h-full w-full', props.class)} />;
}
