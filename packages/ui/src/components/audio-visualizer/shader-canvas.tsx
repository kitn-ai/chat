import { createEffect, createMemo, onCleanup, untrack, type JSX } from 'solid-js';
import { cn } from '../../utils/cn';

export type UniformType =
  | '1f' | '1i' | '1fv' | '2f' | '3f' | '3fv' | '4f' | '4fv'
  | 'Matrix2fv' | 'Matrix3fv' | 'Matrix4fv';

export interface UniformSpec {
  type: UniformType;
  value: number | number[];
  /** For array uniforms (`1fv`, or a matrix type repeated), the declared length. */
  arraySize?: number;
}

export interface ShaderCanvasProps {
  /** GLSL defining `mainImage(out vec4 fragColor, in vec2 fragCoord)`. */
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
 * Split out from the component because it is the only part testable without
 * a GPU (jsdom has no WebGL at all), and it is where a compile-breaking
 * duplicate declaration would show up.
 */
export function buildFragmentSource(
  fragment: string,
  uniforms: Record<string, UniformSpec>,
  precision: string,
): string {
  const declarations = Object.entries(uniforms)
    .map(([name, u]) => {
      const size = u.arraySize ? `[${u.arraySize}]` : '';
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
 * array size -- deliberately excluding `value`. Two calls with the same
 * names/types/sizes but different values return the same string.
 *
 * This is what lets the component recompile only when the shader itself
 * must change, not every time a uniform's value updates (which, for an
 * audio-reactive uniform, is every animation frame).
 */
function uniformShapeKey(uniforms: Record<string, UniformSpec>): string {
  return Object.keys(uniforms)
    .sort()
    .map((name) => {
      const u = uniforms[name]!;
      return `${name}:${u.type}:${u.arraySize ?? ''}`;
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
 * Renders with a fully transparent clear colour (`gl.clearColor(0,0,0,0)`)
 * plus premultiplied blending, so the shader composites over whatever page
 * background sits behind it instead of punching an opaque box.
 *
 * Reactivity note: only `fragment`, `precision`, and the STRUCTURE of
 * `uniforms` (which names exist, with which types/sizes) trigger a rebuild
 * of the GL program. A uniform's VALUE is read fresh every animation frame
 * without forcing a rebuild -- see `uniformShapeKey` above. This matters
 * because a caller typically re-creates the `uniforms` object every render
 * (e.g. `{ uVolume: { type: '1f', value: volume() } }`); tracking that
 * object directly would tear down and recompile the whole program on every
 * frame the volume changes.
 */
export function ShaderCanvas(props: ShaderCanvasProps): JSX.Element {
  let canvas!: HTMLCanvasElement;

  const shapeKey = createMemo(() => uniformShapeKey(props.uniforms ?? {}));

  createEffect(() => {
    const precision = props.precision ?? 'highp';
    const fragment = props.fragment;
    // Establishes the effect's dependency on uniform STRUCTURE only -- see
    // the reactivity note above. The actual uniforms map is read via
    // untrack() below so the effect does not also depend on the object
    // reference itself (which would defeat the point of depending on the
    // shape key instead).
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

    // Transparent clear plus premultiplied blending: alpha is zero everywhere
    // the shader does not draw, so it composites over any page background
    // instead of punching an opaque box (verified against light/dark/photo
    // backgrounds in the browser IVP, not here -- jsdom cannot render pixels).
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const loc = (name: string) => gl.getUniformLocation(program, name);
    const uTime = loc('iTime');
    const uResolution = loc('iResolution');
    const uMouse = loc('iMouse');
    const uFrame = loc('iFrame');
    const uDate = loc('iDate');
    const customLocations = Object.keys(uniforms).map((n) => [n, loc(n)] as const);

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

    const draw = (now: number) => {
      resize();
      const seconds = (now - start) / 1000;

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
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    });
  });

  return <canvas ref={canvas} part="canvas" class={cn('block h-full w-full', props.class)} />;
}
