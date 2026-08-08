import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { installFakeClock } from '../../test-utils/fake-clock';
import { buildFragmentSource, hexToRgb, DEFAULT_SHADER_COLOR, ShaderCanvas } from './shader-canvas';

const MAIN = 'void mainImage(out vec4 c, in vec2 p) { c = vec4(1.0); }';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('hexToRgb', () => {
  it('maps a hex colour to three 0..1 floats', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1]);
  });
  it('tolerates surrounding whitespace', () => {
    expect(hexToRgb('  #00ff00  ')).toEqual([0, 1, 0]);
  });
  it('falls back to the default rather than throwing on bad input', () => {
    expect(hexToRgb('rebeccapurple')).toEqual(hexToRgb(DEFAULT_SHADER_COLOR));
    expect(hexToRgb('#fff')).toEqual(hexToRgb(DEFAULT_SHADER_COLOR));
    expect(hexToRgb('')).toEqual(hexToRgb(DEFAULT_SHADER_COLOR));
  });
});

describe('buildFragmentSource', () => {
  it('puts the precision qualifier first', () => {
    expect(buildFragmentSource(MAIN, {}, 'highp').startsWith('precision highp float;')).toBe(true);
  });

  it('declares the ShaderToy built-ins', () => {
    const src = buildFragmentSource(MAIN, {}, 'highp');
    expect(src).toContain('uniform float iTime;');
    expect(src).toContain('uniform vec2 iResolution;');
    expect(src).toContain('uniform vec4 iMouse;');
    expect(src).toContain('uniform int iFrame;');
    expect(src).toContain('uniform vec4 iDate;');
  });

  it('declares custom uniforms with their mapped GLSL types', () => {
    const src = buildFragmentSource(MAIN, {
      uSpeed: { type: '1f', value: 5 },
      uColor: { type: '3fv', value: [1, 0, 0] },
      uSteps: { type: '1i', value: 3 },
    }, 'highp');
    expect(src).toContain('uniform float uSpeed;');
    expect(src).toContain('uniform vec3 uColor;');
    expect(src).toContain('uniform int uSteps;');
  });

  it('declares an array uniform with its size', () => {
    const src = buildFragmentSource(MAIN, {
      uBands: { type: '1fv', value: [0, 0, 0], arraySize: 3 },
    }, 'highp');
    expect(src).toContain('uniform float uBands[3];');
  });

  it('maps every matrix type', () => {
    const src = buildFragmentSource(MAIN, {
      a: { type: 'Matrix2fv', value: [1, 0, 0, 1] },
      b: { type: 'Matrix3fv', value: new Array(9).fill(0) },
      c: { type: 'Matrix4fv', value: new Array(16).fill(0) },
    }, 'highp');
    expect(src).toContain('uniform mat2 a;');
    expect(src).toContain('uniform mat3 b;');
    expect(src).toContain('uniform mat4 c;');
  });

  it('declares a matrix array uniform with its size, same as a scalar array', () => {
    const src = buildFragmentSource(MAIN, {
      pose: { type: 'Matrix4fv', value: new Array(16).fill(0), arraySize: 2 },
    }, 'highp');
    expect(src).toContain('uniform mat4 pose[2];');
  });

  it('infers an array size from value.length when arraySize is omitted, so the declaration cannot disagree with the setter', () => {
    const src = buildFragmentSource(MAIN, {
      uBands: { type: '1fv', value: [0, 0, 0] },
    }, 'highp');
    expect(src).toContain('uniform float uBands[3];');
  });

  it('does NOT infer an array for a single vector/matrix instance passed as its natural-length array', () => {
    // A 3fv's value IS an array (that's how the WebGL *fv setters work) but
    // represents ONE vec3, not an array of 3 floats -- same for a single
    // mat4 passed as its natural 16-element array. Neither should grow an
    // unwanted `[N]`.
    const src = buildFragmentSource(MAIN, {
      uColor: { type: '3fv', value: [1, 0, 0] },
      uMat: { type: 'Matrix4fv', value: new Array(16).fill(0) },
    }, 'highp');
    expect(src).toContain('uniform vec3 uColor;');
    expect(src).not.toContain('uColor[');
    expect(src).toContain('uniform mat4 uMat;');
    expect(src).not.toContain('uMat[');
  });

  it('infers array size consistently for matrix types too: two mat4s with no arraySize declares [2]', () => {
    const src = buildFragmentSource(MAIN, {
      pose: { type: 'Matrix4fv', value: new Array(32).fill(0) },
    }, 'highp');
    expect(src).toContain('uniform mat4 pose[2];');
  });

  it('an explicit arraySize always wins over the inferred one', () => {
    const src = buildFragmentSource(MAIN, {
      uBands: { type: '1fv', value: [0, 0, 0], arraySize: 8 },
    }, 'highp');
    expect(src).toContain('uniform float uBands[8];');
    expect(src).not.toContain('uBands[3]');
  });

  it('keeps the caller shader body intact', () => {
    expect(buildFragmentSource(MAIN, {}, 'highp')).toContain(MAIN);
  });

  it('appends a main() that calls mainImage with gl_FragCoord', () => {
    const src = buildFragmentSource(MAIN, {}, 'highp');
    expect(src).toContain('void main()');
    expect(src).toContain('mainImage(gl_FragColor, gl_FragCoord.xy)');
  });

  it('declares each uniform exactly once so the shader compiles', () => {
    const src = buildFragmentSource(MAIN, { uSpeed: { type: '1f', value: 1 } }, 'highp');
    expect(src.split('uniform float uSpeed;')).toHaveLength(2);
  });

  it('honours a mediump precision request', () => {
    expect(buildFragmentSource(MAIN, {}, 'mediump')).toContain('precision mediump float;');
  });
});

/**
 * A minimal stand-in for WebGLRenderingContext. jsdom has no WebGL
 * implementation at all (`canvas.getContext('webgl')` genuinely returns
 * null, unmocked -- see the "onError" describe block below, which relies on
 * that real behaviour without any mocking).
 *
 * This stub exists only to answer one question jsdom cannot answer any other
 * way: does ShaderCanvas's *reactive control flow* recompile the GL program
 * when it should, and skip recompiling when it shouldn't? Every GL call
 * below is a recording no-op that reports success. None of this proves a
 * shader actually draws anything correct -- that remains a browser-only
 * concern, called out in the task report.
 */
interface FakeGLFailures {
  /** Fragment shader fails COMPILE_STATUS; the vertex shader still succeeds. */
  failFragmentCompile?: boolean;
  /** `gl.createProgram()` returns null, as some drivers do under resource pressure. */
  failProgramCreation?: boolean;
  /** Program LINK_STATUS is false. */
  failLink?: boolean;
}

function createFakeGL(failures: FakeGLFailures = {}) {
  const calls: string[] = [];
  const record = (name: string) => calls.push(name);
  const locations = new Map<string, object>();
  // Every fragment-shader source string ShaderCanvas has ever handed to
  // shaderSource(), in call order -- one entry per (re)compile. Lets a test
  // assert not just THAT a rebuild happened, but that the rebuilt
  // declaration actually reflects the new state (see the "declares the NEW
  // array size" test below), the end-to-end assertion that would have
  // caught the shapeKey/declaration mismatch.
  const fragmentSources: string[] = [];
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, BLEND: 8, ONE: 9,
    ONE_MINUS_SRC_ALPHA: 10, TRIANGLE_STRIP: 11, COLOR_BUFFER_BIT: 12,
    createShader: (type: number) => { record('createShader'); return { __type: type }; },
    shaderSource: (shader: { __type: number }, source: string) => {
      record('shaderSource');
      if (shader.__type === gl.FRAGMENT_SHADER) fragmentSources.push(source);
    },
    compileShader: () => { record('compileShader'); },
    getShaderParameter: (shader: { __type: number }) =>
      !(failures.failFragmentCompile && shader.__type === gl.FRAGMENT_SHADER),
    getShaderInfoLog: () => 'fake shader compile error',
    deleteShader: () => { record('deleteShader'); },
    createProgram: () => {
      record('createProgram');
      return failures.failProgramCreation ? null : {};
    },
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => !failures.failLink,
    getProgramInfoLog: () => 'fake link error',
    useProgram: () => {},
    deleteProgram: () => { record('deleteProgram'); },
    createBuffer: () => { record('createBuffer'); return {}; },
    bindBuffer: () => {},
    bufferData: () => {},
    deleteBuffer: () => { record('deleteBuffer'); },
    getAttribLocation: () => 0,
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    enable: () => {},
    blendFunc: () => {},
    getUniformLocation: (_program: unknown, name: string) => {
      if (!locations.has(name)) locations.set(name, {});
      return locations.get(name)!;
    },
    uniform1f: () => {}, uniform1i: () => {}, uniform1fv: () => {}, uniform2fv: () => {},
    uniform3fv: () => {}, uniform4fv: () => {},
    uniformMatrix2fv: () => {}, uniformMatrix3fv: () => {}, uniformMatrix4fv: () => {},
    clearColor: () => {}, clear: () => {}, drawArrays: () => {}, viewport: () => {},
  };
  return { gl: gl as unknown as WebGLRenderingContext, calls, fragmentSources };
}

function stubGetContext(gl: WebGLRenderingContext) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
    type === 'webgl' || type === 'experimental-webgl' ? gl : null) as never);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ShaderCanvas: WebGL unavailable', () => {
  installFakeClock();

  it('calls onError, unmocked, on the real jsdom canvas -- jsdom has no WebGL and getContext genuinely returns null', () => {
    const onError = vi.fn();
    render(() => <ShaderCanvas fragment={MAIN} onError={onError} />);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toMatch(/webgl/i);
  });

  it('does not throw when no onError is supplied', () => {
    expect(() => render(() => <ShaderCanvas fragment={MAIN} />)).not.toThrow();
  });
});

describe('ShaderCanvas: recompiles on shader structure, not per-frame uniform values', () => {
  installFakeClock();

  it('compiles exactly once across a value-only uniform update (e.g. a volume-driven uniform)', async () => {
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);
    const [volume, setVolume] = createSignal(0);

    render(() => (
      <ShaderCanvas
        fragment={MAIN}
        uniforms={{ uVolume: { type: '1f', value: volume() } }}
      />
    ));
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);

    setVolume(0.3);
    await flush();
    setVolume(0.9);
    await flush();

    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);
  });

  it('recompiles when the set of declared uniforms actually changes', async () => {
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);
    const [wide, setWide] = createSignal(false);

    render(() => (
      <ShaderCanvas
        fragment={MAIN}
        uniforms={
          wide()
            ? { uColor: { type: '3fv', value: [1, 0, 0] } }
            : { uSpeed: { type: '1f', value: 1 } }
        }
      />
    ));
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);

    setWide(true);
    await flush();

    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(2);
  });
});

describe('ShaderCanvas: cleanup', () => {
  const { isFramePending } = installFakeClock();

  it('cancels the pending animation frame and deletes the program, shaders, and buffer on unmount', () => {
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);

    const { unmount } = render(() => <ShaderCanvas fragment={MAIN} />);
    expect(calls).toContain('createProgram');
    // The control: draw() is registered (via its own requestAnimationFrame
    // call at the end of the compile effect) before anything is torn down,
    // so there IS something for cancelAnimationFrame to cancel -- without
    // this, isFramePending() reading false after unmount below would not
    // distinguish "cancelled" from "there was never anything pending in the
    // first place."
    expect(isFramePending()).toBe(true);
    calls.length = 0;

    unmount();

    expect(calls).toContain('deleteProgram');
    expect(calls.filter((c) => c === 'deleteShader')).toHaveLength(2);
    expect(calls).toContain('deleteBuffer');
    // The claim the title makes: unmount actually cancels draw's pending
    // frame, not just deletes the GL objects it would have kept driving.
    // Without this, an unmounted canvas would still fire `draw` against a
    // deleted program on the next animation frame.
    expect(isFramePending()).toBe(false);
  });
});

describe('ShaderCanvas: cleans up whatever already compiled when a later stage fails', () => {
  installFakeClock();

  it('deletes the vertex shader too when the fragment shader fails to compile', () => {
    const { gl, calls } = createFakeGL({ failFragmentCompile: true });
    stubGetContext(gl);
    const onError = vi.fn();

    render(() => <ShaderCanvas fragment={MAIN} onError={onError} />);

    expect(onError).toHaveBeenCalledTimes(1);
    // One delete from compile()'s own cleanup of the failed fragment shader,
    // one from ShaderCanvas explicitly deleting the vertex shader that DID
    // compile -- nothing to leak a shader object into the GL context.
    expect(calls.filter((c) => c === 'deleteShader')).toHaveLength(2);
    expect(calls).not.toContain('deleteProgram');
  });

  it('deletes both shaders when program creation fails', () => {
    const { gl, calls } = createFakeGL({ failProgramCreation: true });
    stubGetContext(gl);
    const onError = vi.fn();

    render(() => <ShaderCanvas fragment={MAIN} onError={onError} />);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c === 'deleteShader')).toHaveLength(2);
    expect(calls).not.toContain('deleteProgram');
  });

  it('deletes the program and both shaders when linking fails', () => {
    const { gl, calls } = createFakeGL({ failLink: true });
    stubGetContext(gl);
    const onError = vi.fn();

    render(() => <ShaderCanvas fragment={MAIN} onError={onError} />);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c === 'deleteShader')).toHaveLength(2);
    expect(calls.filter((c) => c === 'deleteProgram')).toHaveLength(1);
  });
});

describe('ShaderCanvas: an array uniform relying on inferred arraySize still recompiles when its length changes', () => {
  installFakeClock();

  // Pins the fix for a residual the coordinator caught in review round 1:
  // the band count is REACTIVE (derived from `variant`/`size` elsewhere in
  // the dispatcher), so a `uBands`-style uniform's `value.length` genuinely
  // changes while a shader variant stays mounted -- e.g. switching from
  // `bar` (5 bands) to `radial` (24 bands). Before this fix, `shapeKey` read
  // only the explicit `arraySize` field, so a length-only change on an
  // inferred-size array left the shape key unchanged, the effect never
  // re-ran, and the compiled declaration stayed at the OLD size while the
  // setter pushed the NEW (longer) array -- the exact
  // declaration/setter mismatch this whole file exists to prevent,
  // reachable through inference instead of an explicit mismatch.

  it('rebuilds the program when value.length changes with no explicit arraySize on either side', async () => {
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);
    const [bands, setBands] = createSignal([0, 0, 0]);

    render(() => (
      <ShaderCanvas fragment={MAIN} uniforms={{ uBands: { type: '1fv', value: bands() } }} />
    ));
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);

    setBands([0, 0, 0, 0, 0]);
    await flush();

    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(2);
  });

  it('declares the NEW array size in the rebuilt source, not the stale one', async () => {
    const { gl, fragmentSources } = createFakeGL();
    stubGetContext(gl);
    const [bands, setBands] = createSignal([0, 0, 0]);

    render(() => (
      <ShaderCanvas fragment={MAIN} uniforms={{ uBands: { type: '1fv', value: bands() } }} />
    ));
    expect(fragmentSources[0]).toContain('uniform float uBands[3];');

    setBands([0, 0, 0, 0, 0]);
    await flush();

    expect(fragmentSources[1]).toContain('uniform float uBands[5];');
    expect(fragmentSources[1]).not.toContain('uBands[3]');
  });
});
