import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal, flush as flushSync } from 'solid-js';
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
  /**
   * `WEBGL_lose_context` is not exposed, so the context cannot be handed back
   * at all -- the degraded path where visibility management can only pause.
   */
  noLoseContextExtension?: boolean;
}

function createFakeGL(failures: FakeGLFailures = {}) {
  const calls: string[] = [];
  const record = (name: string) => calls.push(name);
  const locations = new Map<string, object>();
  // Reverse of `locations`, so a recorded uniform write can be attributed to
  // the uniform NAME it was pushed to (`getUniformLocation` hands out opaque
  // objects). Only `uniform1f` is captured -- `iTime` is the one built-in
  // whose exact value a test needs to reason about.
  const locationNames = new Map<object, string>();
  const uniformWrites: Record<string, number[]> = {};
  // Simulated context loss/restore, driven through the real
  // `WEBGL_lose_context` extension the component uses in production.
  //
  // Both events are QUEUED, not dispatched inline: a browser fires
  // `webglcontextlost`/`webglcontextrestored` on a later task, never
  // synchronously inside `loseContext()`/`restoreContext()`. Tests call
  // `flushGLEvents()` to deliver them, which is what makes it possible to
  // exercise the window where a release or a restore is still IN FLIGHT (see
  // the rapid-toggle test).
  let contextLost = false;
  const queuedEvents: string[] = [];
  const loseContextExtension = {
    loseContext: () => {
      record('loseContext');
      contextLost = true;
      queuedEvents.push('webglcontextlost');
    },
    restoreContext: () => {
      record('restoreContext');
      contextLost = false;
      queuedEvents.push('webglcontextrestored');
    },
  };
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
      if (!locations.has(name)) {
        const location = {};
        locations.set(name, location);
        locationNames.set(location, name);
      }
      return locations.get(name)!;
    },
    uniform1f: (location: object, value: number) => {
      const name = locationNames.get(location);
      if (name) (uniformWrites[name] ??= []).push(value);
    },
    uniform1i: () => {}, uniform1fv: () => {}, uniform2fv: () => {},
    uniform3fv: () => {}, uniform4fv: () => {},
    uniformMatrix2fv: () => {}, uniformMatrix3fv: () => {}, uniformMatrix4fv: () => {},
    clearColor: () => {},
    // `clear` and `drawArrays` are RECORDED, not silent no-ops: they are the
    // only observable proof that the draw loop is (or is not) actually
    // running. Before this, the context-loss test's
    // `calls.filter(c => c === 'clear')).toHaveLength(0)` was vacuously true
    // -- `clear` was never recorded by anything, so the assertion could not
    // have failed even with the loop running flat out.
    clear: () => { record('clear'); },
    drawArrays: () => { record('drawArrays'); },
    viewport: () => {},
    // A lost context answers `getExtension` with null (Chromium bails out of
    // `getExtension` on `isContextLost()`), which is exactly why the
    // component has to cache the extension object WHILE THE CONTEXT IS ALIVE:
    // that cached handle is the only thing that can call `restoreContext()`
    // afterwards. Modelling the null here is what keeps that from silently
    // regressing into "re-`getExtension` on the way back and never restore".
    getExtension: (name: string) =>
      name === 'WEBGL_lose_context' && !contextLost && !failures.noLoseContextExtension
        ? loseContextExtension
        : null,
    isContextLost: () => contextLost,
  };

  /**
   * Deliver the context events `loseContext()`/`restoreContext()` queued, in
   * order, the way a browser's later task would. Tests that never call this
   * are deliberately sitting in the in-flight window.
   */
  const flushGLEvents = () => {
    const target = document.querySelector('canvas');
    for (const type of queuedEvents.splice(0)) {
      target?.dispatchEvent(new Event(type, { cancelable: true }));
    }
  };

  return { gl: gl as unknown as WebGLRenderingContext, calls, fragmentSources, uniformWrites, flushGLEvents };
}

/**
 * A controllable `IntersectionObserver`. jsdom does not implement one at all
 * (proven by the "no IntersectionObserver" block at the bottom of this file),
 * so every OTHER test in this file -- and the whole rest of the unit suite --
 * runs the component's no-observer path. Tests that want to drive visibility
 * install this first, then push entries with `setOnScreen`.
 */
function installFakeIntersectionObserver() {
  const observers: { callback: IntersectionObserverCallback; targets: Element[] }[] = [];

  class FakeIntersectionObserver {
    #entry: { callback: IntersectionObserverCallback; targets: Element[] };
    constructor(callback: IntersectionObserverCallback) {
      this.#entry = { callback, targets: [] };
      observers.push(this.#entry);
    }
    observe(target: Element) { this.#entry.targets.push(target); }
    unobserve(target: Element) {
      const i = this.#entry.targets.indexOf(target);
      if (i >= 0) this.#entry.targets.splice(i, 1);
    }
    disconnect() { this.#entry.targets.length = 0; }
    takeRecords() { return []; }
  }

  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

  return {
    /** Report every observed element as on/off screen, as a browser would. */
    setOnScreen(isIntersecting: boolean) {
      for (const observer of observers) {
        for (const target of observer.targets) {
          observer.callback(
            [{ target, isIntersecting } as IntersectionObserverEntry],
            undefined as unknown as IntersectionObserver,
          );
        }
      }
    },
  };
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
    flush(); // V2-FLUSH: commit the staged write
    await flush();
    setVolume(0.9);
    flush(); // V2-FLUSH: commit the staged write
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
    flush(); // V2-FLUSH: commit the staged write
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

/**
 * Regression coverage for the audio-visualizer regression investigation
 * (2026-08-09): Chrome caps concurrent WebGL contexts around 16 and silently
 * evicts the oldest once a page exceeds it -- confirmed directly in-browser
 * on the AudioVisualizer docs page (18 shader canvases mounted at once after
 * the one-story-per-variant stories restructure, 2 of them lost). Before
 * this fix, `draw`'s requestAnimationFrame loop had no way to learn a
 * context died mid-mount: it kept calling `gl.clear`/`gl.drawArrays` every
 * frame forever, all silent no-ops on a lost context, so the canvas just
 * kept showing whatever was on screen the instant it died -- a shader that
 * "moves for a second, then freezes like a static image," with no error and
 * no `onUnavailable` call to let the dispatcher fall back to bars.
 */
describe('ShaderCanvas: WebGL context lost after a successful compile', () => {
  const { advance, isFramePending } = installFakeClock();

  it('reports onError and stops the draw loop when the context is lost mid-mount', () => {
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);
    const onError = vi.fn();

    render(() => <ShaderCanvas fragment={MAIN} onError={onError} />);
    expect(onError).not.toHaveBeenCalled();
    expect(isFramePending()).toBe(true);

    calls.length = 0;
    const canvas = document.querySelector('canvas')!;
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toMatch(/context/i);
    // The pending frame that was driving the shader is cancelled outright,
    // not merely a no-op next time it fires -- this is the loop actually
    // stopping, not just the failure being reported.
    expect(isFramePending()).toBe(false);

    // Advancing the clock further must not resume drawing (nothing left to
    // call gl.clear/drawArrays against) and must not report a second time.
    advance(1000);
    expect(calls.filter((c) => c === 'clear')).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('calling preventDefault on the loss event is what the listener does, not left to the browser default', () => {
    const { gl } = createFakeGL();
    stubGetContext(gl);
    render(() => <ShaderCanvas fragment={MAIN} />);

    const canvas = document.querySelector('canvas')!;
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

    expect(event.defaultPrevented).toBe(true);
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
    flush(); // V2-FLUSH: commit the staged write
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
    flush(); // V2-FLUSH: commit the staged write
    await flush();

    expect(fragmentSources[1]).toContain('uniform float uBands[5];');
    expect(fragmentSources[1]).not.toContain('uBands[3]');
  });
});

/**
 * Regression coverage for the production recompile-storm investigation
 * (2026-08-09): the Aurora/Wave Storybook stories measured ~70 `createProgram`
 * calls in 4 seconds (should be at most 5, one per canvas, ever) and `iTime`
 * pinned under 0.33s with recurring negative values, from `start` being
 * re-stamped every time the compile effect spuriously re-ran.
 *
 * Root cause: `ShaderCanvas`'s compile effect read `props.precision` and
 * `props.fragment` DIRECTLY (the round-1/round-2 `shapeKey` fix only
 * insulated `uniforms`). `index.tsx`'s dispatcher builds a shader variant's
 * props with a PLAIN function (`shared()`, not a memo) bundling `state`/
 * `size`/`bands`/`frozen`/`color` together, spread onto the variant
 * (`<C {...shared()} .../>`). Solid's spread-prop merging re-invokes the
 * WHOLE source function on ANY property read from the merged result -- so
 * aurora/wave computing `precision` from `props.size` (`size === 'icon' ?
 * 'mediump' : 'highp'`) also transitively re-read `bands()`, every single
 * time, because both come out of the same `shared()` call. `precision`'s
 * OWN resolved value never changed, but the effect reran on every one of
 * ~31 band updates a second anyway. Same failure class as a bug just fixed
 * in `use-sequencer.ts` (an effect transitively subscribed to a signal
 * reached through unrelated prop plumbing, not the one it actually cares
 * about). Fixed by wrapping `fragment`/`precision` in their own memos,
 * exactly like `shapeKey` already does for `uniforms`.
 *
 * EVERY OTHER describe block in this file hand-builds a flat
 * `ShaderCanvasProps` object and therefore CANNOT reproduce this: the leak
 * lives in the SHAPE of how a variant's props arrive (a spread of a
 * non-memoized function that bundles an unrelated fast-changing signal),
 * not in any one prop's own value. This is why round 2's test suite was
 * green while the guard was actually broken in production -- proven here by
 * reverting the fix and confirming this specific test (and only this one)
 * fails; see the task report's TDD section for that RED/GREEN pair.
 */
describe('ShaderCanvas: immune to a spread-prop leak from an unrelated fast-changing signal', () => {
  installFakeClock();

  it('does not recompile when precision is derived through a spread that also carries a ticking signal (production regression reproduction)', async () => {
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);

    const [bands, setBands] = createSignal([0, 0, 0]);
    // Mirrors index.tsx's `shared()` exactly: one PLAIN function (not a
    // memo), several fields, spread onto the child below -- not passed as
    // individual JSX attributes, which is what makes this reproduce the
    // real bug rather than a synthetic shortcut.
    const shared = () => ({ size: 'md' as const, bands: bands() });

    function Variant(props: { size: 'md' | 'icon'; bands: number[] }) {
      return (
        <ShaderCanvas fragment={MAIN} precision={props.size === 'icon' ? 'mediump' : 'highp'} />
      );
    }

    render(() => <Variant {...shared()} />);
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);

    // ~32ms real analyser cadence, 10 ticks.
    for (let i = 0; i < 10; i++) {
      setBands([i, i, i]);
      flush(); // V2-FLUSH: commit the staged write
      await flush();
    }

    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);
  });
});

/**
 * Off-screen context management, the fix for the measured docs-page failure:
 * Chrome caps live WebGL contexts at ~16 PER RENDERER PROCESS (shared even
 * across same-origin iframes -- a prior session proved `docs.story.inline:
 * false` does not buy any headroom: 18 wanted, 16 live, 2 silently failing to
 * compile). Holding a context for a component's whole life meant the docs
 * page could not host the Wave, Aurora, and Custom stories at all, so they
 * carried `tags: ['!autodocs']`.
 *
 * Pausing the draw loop -- which is all upstream's runner does
 * (`react-shader-toy.tsx:917-935`) -- does NOT help: an idle context still
 * occupies a slot. The context has to actually go back, via
 * `WEBGL_lose_context`'s `loseContext()`, and come back via
 * `restoreContext()`.
 */
describe('ShaderCanvas: releases its WebGL context while off screen', () => {
  const { advance, isFramePending } = installFakeClock();

  it('builds nothing until the observer reports the canvas on screen', () => {
    const io = installFakeIntersectionObserver();
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);

    render(() => <ShaderCanvas fragment={MAIN} />);

    // The load-bearing half of the fix. Deferring to the observer is what
    // keeps a page that mounts 18 visualizers from creating 18 contexts in
    // the mount task and getting 2 of them evicted by the browser before any
    // observer callback could possibly have run.
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(0);
    expect(isFramePending()).toBe(false);

    io.setOnScreen(true);

    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);
    expect(isFramePending()).toBe(true);
  });

  it('stops the draw loop AND hands the context back when the canvas leaves the viewport', () => {
    const io = installFakeIntersectionObserver();
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);

    render(() => <ShaderCanvas fragment={MAIN} />);
    io.setOnScreen(true);
    // The control: there IS a live loop and a built program to tear down, so
    // the assertions below distinguish "released" from "never started".
    expect(isFramePending()).toBe(true);
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);
    calls.length = 0;

    io.setOnScreen(false);

    expect(isFramePending()).toBe(false);
    expect(calls).toContain('loseContext');
    // Every GPU object goes back BEFORE the context does. Deleting them after
    // the context is lost is a spec no-op -- i.e. a leak for as long as the
    // driver keeps the dead context around -- which is the same discipline
    // the partial-compile failure paths above already follow.
    expect(calls.filter((c) => c === 'deleteShader')).toHaveLength(2);
    expect(calls).toContain('deleteBuffer');
    expect(calls.indexOf('deleteProgram')).toBeLessThan(calls.indexOf('loseContext'));
    expect(calls.indexOf('deleteBuffer')).toBeLessThan(calls.indexOf('loseContext'));

    // ...and it stays stopped: no frames are burned off screen.
    calls.length = 0;
    advance(1000);
    expect(calls.filter((c) => c === 'drawArrays')).toHaveLength(0);
  });

  it('re-initialises and resumes drawing when the canvas comes back on screen', () => {
    const io = installFakeIntersectionObserver();
    const { gl, calls, flushGLEvents } = createFakeGL();
    stubGetContext(gl);

    render(() => <ShaderCanvas fragment={MAIN} />);
    io.setOnScreen(true);
    io.setOnScreen(false);
    flushGLEvents(); // the browser delivers `webglcontextlost`
    calls.length = 0;

    io.setOnScreen(true);

    // `restoreContext()` is asynchronous in practice: nothing can be rebuilt
    // until `webglcontextrestored` says the context is actually back. A
    // version that assumed synchronous availability would compile here,
    // against a still-lost context, and get null shaders.
    expect(calls).toContain('restoreContext');
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(0);
    expect(isFramePending()).toBe(false);

    flushGLEvents(); // `webglcontextrestored`

    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);
    expect(calls.filter((c) => c === 'createBuffer')).toHaveLength(1);
    expect(isFramePending()).toBe(true);

    calls.length = 0;
    advance(16);
    expect(calls.filter((c) => c === 'drawArrays')).toHaveLength(1);
  });

  it('resumes the iTime clock where it left off instead of restarting the shader', () => {
    const io = installFakeIntersectionObserver();
    const { gl, uniformWrites, flushGLEvents } = createFakeGL();
    stubGetContext(gl);

    render(() => <ShaderCanvas fragment={MAIN} />);
    io.setOnScreen(true);
    advance(1000);
    expect(uniformWrites.iTime?.at(-1)).toBeCloseTo(1, 5);

    io.setOnScreen(false);
    flushGLEvents();
    advance(5000); // five seconds off screen, nothing drawn
    io.setOnScreen(true);
    flushGLEvents();
    advance(16);

    // Time is FROZEN while off screen (see the clock comment in
    // shader-canvas.tsx): the timeline continues from the 1.0s it reached, so
    // this is neither ~0.016 (the clock restarting -- the defect that made
    // shaders loop a third of a second forever) nor ~6.016 (wall-clock time,
    // which would jump the shader five seconds forward on scroll-in).
    expect(uniformWrites.iTime?.at(-1)).toBeCloseTo(1.016, 5);
  });

  it('cannot end up with two draw loops after rapid off/on toggling mid-release', () => {
    const io = installFakeIntersectionObserver();
    const { gl, calls, flushGLEvents } = createFakeGL();
    stubGetContext(gl);

    render(() => <ShaderCanvas fragment={MAIN} />);
    io.setOnScreen(true);

    // Every one of these lands while the PREVIOUS transition is still in
    // flight (no `flushGLEvents` between them), which is the window where a
    // naive implementation either starts a second loop or compiles against a
    // context that is still lost.
    io.setOnScreen(false);
    io.setOnScreen(true);
    io.setOnScreen(false);
    io.setOnScreen(true);

    flushGLEvents(); // `webglcontextlost` -> a restore gets requested
    flushGLEvents(); // `webglcontextrestored` -> rebuild

    // Exactly one rebuild, not one per toggle.
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(2);

    calls.length = 0;
    advance(16);
    // ONE draw per frame. Two live loops would double both of these.
    expect(calls.filter((c) => c === 'drawArrays')).toHaveLength(1);
    expect(calls.filter((c) => c === 'clear')).toHaveLength(1);
  });

  it('does not start a second draw loop when a webglcontextrestored arrives while already drawing', () => {
    const io = installFakeIntersectionObserver();
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);

    render(() => <ShaderCanvas fragment={MAIN} />);
    io.setOnScreen(true);
    calls.length = 0;
    advance(16);
    expect(calls.filter((c) => c === 'drawArrays')).toHaveLength(1); // the control

    // A restore event this component never asked for. A browser can auto-
    // restore, and the event is dispatchable by anything on the page -- and
    // the handler's job is to reconcile, which routes into the setup path
    // while a loop is ALREADY armed. Nothing else in this file reaches
    // `startLoop` in that state, so without this the "exactly one loop"
    // guard is unverified: removing it leaves every other test green.
    document.querySelector('canvas')!
      .dispatchEvent(new Event('webglcontextrestored', { cancelable: true }));
      flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

    calls.length = 0;
    advance(16);
    expect(calls.filter((c) => c === 'drawArrays')).toHaveLength(1);
    // ...and it did not silently rebuild the program either.
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(0);
  });

  it('degrades to pausing the loop when WEBGL_lose_context is unavailable, and resumes without recompiling', () => {
    const io = installFakeIntersectionObserver();
    const { gl, calls } = createFakeGL({ noLoseContextExtension: true });
    stubGetContext(gl);

    render(() => <ShaderCanvas fragment={MAIN} />);
    io.setOnScreen(true);
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);

    calls.length = 0;
    io.setOnScreen(false);

    // Nothing to hand the context back WITH, so it stays -- keeping the
    // compiled program with it rather than throwing away work that cannot buy
    // a context slot back. The frames still stop, which is upstream's
    // behaviour: the floor here, not the ceiling.
    expect(calls).not.toContain('loseContext');
    expect(calls).not.toContain('deleteProgram');
    advance(1000);
    expect(calls.filter((c) => c === 'drawArrays')).toHaveLength(0);

    io.setOnScreen(true);
    advance(16);

    expect(calls.filter((c) => c === 'drawArrays')).toHaveLength(1);
    // Coming back is a re-arm of the existing program, not a rebuild.
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(0);
  });
});

/**
 * `animateWhenNotVisible`: the escape hatch from the release-on-hidden
 * default above. Named to match upstream's prop on the same components, though
 * ours opts out of something more aggressive -- they only pause draws, we hand
 * the context back entirely.
 */
describe('ShaderCanvas: animateWhenNotVisible', () => {
  const { advance, isFramePending } = installFakeClock();

  it('builds immediately instead of waiting for an observer verdict it will never act on', () => {
    installFakeIntersectionObserver();
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);

    render(() => <ShaderCanvas fragment={MAIN} animateWhenNotVisible />);

    // NOTHING has been reported by the observer at this point. The default
    // path deliberately waits for that first callback; this one must not, or
    // an opted-out canvas that never intersects -- a background tab, a
    // zero-size ancestor, a detached-then-reattached subtree -- would sit
    // there never having drawn a single frame.
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);
    expect(isFramePending()).toBe(true);
  });

  it('keeps drawing and never releases the context when the canvas goes off screen', () => {
    const io = installFakeIntersectionObserver();
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);

    render(() => <ShaderCanvas fragment={MAIN} animateWhenNotVisible />);
    io.setOnScreen(true);
    calls.length = 0;

    io.setOnScreen(false);

    expect(calls).not.toContain('loseContext');
    expect(calls).not.toContain('deleteProgram');
    expect(isFramePending()).toBe(true);
    advance(16);
    expect(calls.filter((c) => c === 'drawArrays')).toHaveLength(1);
  });

  it('keeps iTime accumulating off screen, because the loop never stopped', () => {
    const io = installFakeIntersectionObserver();
    const { gl, uniformWrites } = createFakeGL();
    stubGetContext(gl);

    render(() => <ShaderCanvas fragment={MAIN} animateWhenNotVisible />);
    io.setOnScreen(true);
    advance(1000);
    io.setOnScreen(false);
    advance(5000);

    // The mirror image of the default path's frozen clock: nothing paused, so
    // the five off-screen seconds are real elapsed shader time.
    expect(uniformWrites.iTime?.at(-1)).toBeCloseTo(6, 5);
  });

  it('releases once it is flipped off at runtime while the canvas is hidden', async () => {
    installFakeIntersectionObserver();
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);
    const [always, setAlways] = createSignal(true);

    render(() => <ShaderCanvas fragment={MAIN} animateWhenNotVisible={always()} />);
    // Drawing despite the observer never having reported it visible.
    expect(isFramePending()).toBe(true);
    calls.length = 0;

    setAlways(false);
    // V2-SHAPE: the flag flows through a lazy memo; its effect lands on the
    // natural microtask commit rather than a synchronous flush() drain.
    await Promise.resolve();
    flush(); // V2-FLUSH

    // The observer's standing verdict applies the moment the opt-out drops,
    // with no re-wiring and no waiting for another callback.
    expect(isFramePending()).toBe(false);
    expect(calls).toContain('loseContext');
    expect(calls.indexOf('deleteProgram')).toBeLessThan(calls.indexOf('loseContext'));
  });

  it('takes the context back when it is flipped on at runtime while the canvas is hidden', async () => {
    const io = installFakeIntersectionObserver();
    const { gl, calls, flushGLEvents } = createFakeGL();
    stubGetContext(gl);
    const [always, setAlways] = createSignal(false);

    render(() => <ShaderCanvas fragment={MAIN} animateWhenNotVisible={always()} />);
    io.setOnScreen(true);
    io.setOnScreen(false);
    flushGLEvents(); // the release completes
    calls.length = 0;

    setAlways(true);
    // V2-SHAPE: the flag flows through a lazy memo; its effect lands on the
    // natural microtask commit rather than a synchronous flush() drain.
    await Promise.resolve();
    flush(); // V2-FLUSH

    expect(calls).toContain('restoreContext');
    flushGLEvents();
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);
    expect(isFramePending()).toBe(true);
  });

  it('does not recompile the shader when the flag flips -- it is a visibility policy, not a source change', () => {
    const io = installFakeIntersectionObserver();
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);
    const [always, setAlways] = createSignal(true);

    render(() => <ShaderCanvas fragment={MAIN} animateWhenNotVisible={always()} />);
    io.setOnScreen(true); // genuinely visible, so neither flip below changes
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);

    // While on screen the flag decides nothing, so both flips must be inert.
    // Reading the prop inside the compile effect would subscribe that effect
    // to this flag and rebuild the whole GL program on a toggle -- the same
    // leak class the fragment/precision memos above exist to prevent.
    setAlways(false);
    flush(); // V2-FLUSH: commit the staged write
    setAlways(true);
    flush(); // V2-FLUSH: commit the staged write

    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);
    expect(calls).not.toContain('loseContext');
    expect(isFramePending()).toBe(true);
  });
});

/**
 * The fallback path, and the one the ENTIRE rest of the unit suite runs on:
 * jsdom has no `IntersectionObserver`, and neither does an SSR render. This
 * cannot go red by deleting the visibility feature -- that is the point of it.
 * It is a regression guard that adding the observer did not quietly change
 * behaviour for every environment that has no observer to consult.
 */
describe('ShaderCanvas: no IntersectionObserver (SSR, jsdom, older browsers)', () => {
  const { advance, isFramePending } = installFakeClock();

  it('compiles immediately and never releases the context -- exactly the pre-observer behaviour', () => {
    expect(typeof IntersectionObserver).toBe('undefined'); // the precondition
    const { gl, calls } = createFakeGL();
    stubGetContext(gl);

    render(() => <ShaderCanvas fragment={MAIN} />);

    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);
    expect(isFramePending()).toBe(true);

    calls.length = 0;
    advance(16);
    expect(calls.filter((c) => c === 'drawArrays')).toHaveLength(1);
    expect(calls).not.toContain('loseContext');
  });
});
