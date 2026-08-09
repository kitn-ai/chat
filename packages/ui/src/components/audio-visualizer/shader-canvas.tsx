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

  createEffect(() => {
    // Reads ONLY the three memos below -- never `props.fragment` /
    // `props.precision` / `props.uniforms` directly -- so this effect's
    // dependency set is exactly {fragmentMemo, precisionMemo, shapeKey}, and
    // nothing a caller's props chain does elsewhere (spread-derived or not)
    // can mark it stale without one of those three RESOLVED values actually
    // changing.
    const fragment = fragmentMemo();
    const precision = precisionMemo();
    shapeKey();
    const uniforms = untrack(() => props.uniforms ?? {});
    const source = buildFragmentSource(fragment, uniforms, precision);

    const gl = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;

    if (!gl) {
      props.onError?.('WebGL is not available in this browser.');
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    if (typeof vs === 'string') {
      props.onError?.(vs);
      return;
    }
    const fs = compile(gl, gl.FRAGMENT_SHADER, source);
    if (typeof fs === 'string') {
      gl.deleteShader(vs);
      props.onError?.(fs);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
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

    const start = performance.now();
    let frame = 0;
    let raf = 0;

    // A context can be lost AFTER a successful compile -- most commonly the
    // browser evicting this canvas because too many WebGL contexts are alive
    // on the page at once (Chrome caps concurrent contexts around 16 and
    // silently kills the oldest). Without this listener, `draw` below would
    // keep calling `gl.clear`/`gl.drawArrays` every frame forever -- all
    // no-ops on a lost context per the WebGL spec -- so the canvas would just
    // keep showing whatever was on screen the instant it died: a
    // live-looking shader that permanently freezes with no error and no
    // `onUnavailable`, since nothing here would ever learn it happened.
    // `preventDefault()` is required by spec to even ALLOW a future
    // `webglcontextrestored`; this component does not attempt to recover on
    // one, matching the "permanent for this mount" contract `onUnavailable`
    // already documents in index.tsx for every other failure path -- a
    // restored context still needs its program/shaders recompiled from
    // scratch, and the dispatcher's bar fallback is a fine landing spot.
    let lost = false;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
      props.onError?.('WebGL context was lost.');
    };
    canvas.addEventListener('webglcontextlost', onContextLost, false);

    const draw = (now: number) => {
      // Belt-and-braces alongside the listener above: if a context is lost
      // by some path that does not fire `webglcontextlost` synchronously
      // before the next frame, this still stops issuing GL calls against it.
      if (lost || gl.isContextLost()) return;
      resize();
      // Clamped at 0: a browser's rAF callback receives the timestamp for
      // when the current frame BEGAN, captured before this component's
      // synchronous setup finishes and stamps `start` -- so the very first
      // frame or two can compute a few milliseconds negative even with
      // nothing wrong. Harmless and self-correcting either way (confirmed:
      // the pathological, CONTINUOUSLY-recurring negative values reported in
      // production were `start` being re-stamped by a spuriously re-running
      // effect, not this), but there is no reason `iTime` should ever go
      // negative for a caller, so it does not.
      const seconds = Math.max(0, (now - start) / 1000);

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
    raf = requestAnimationFrame(draw);

    onCleanup(() => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    });
  });

  return <canvas ref={canvas} part="canvas" class={cn('block h-full w-full', props.class)} />;
}
