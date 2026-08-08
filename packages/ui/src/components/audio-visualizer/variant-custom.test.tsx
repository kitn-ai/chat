import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { installFakeClock } from '../../test-utils/fake-clock';
import { buildFragmentSource, type UniformSpec } from './shader-canvas';
import type { ShaderVariantProps, ShaderSpec } from './index';

// jsdom has no WebGL at all, so a custom shader never compiles or draws in
// these tests -- see shader-canvas.test.tsx. What IS testable without a GPU:
// customUniforms as a pure function (including its validation of a
// consumer's declared uniforms), the state/volume -> uniform mapping
// CustomVisualizer computes before handing it to ShaderCanvas, that a bad
// consumer uniform is caught BEFORE it ever reaches ShaderCanvas rather than
// throwing inside its requestAnimationFrame loop, and that onError reaches
// onUnavailable with the right log severity. Whether a custom shader
// actually compiles, links, and paints correctly on screen -- including
// whether uBands genuinely drives the picture -- is a browser-only concern,
// called out in the task report.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.doUnmock('./shader-canvas');
  vi.resetModules();
});

const baseProps: ShaderVariantProps = {
  state: 'idle',
  size: 'md',
  bands: [],
  frozen: false,
  volume: 0,
  onUnavailable: () => {},
};

const FRAGMENT = 'void mainImage(out vec4 c, in vec2 p) { c = vec4(1.0); }';

describe('customUniforms', () => {
  it('supplies the standard shader uniforms', async () => {
    const { customUniforms } = await import('./variant-custom');
    const u = customUniforms({
      color: '#1FD5F9', intensity: 0.5, speed: 2, complexity: 0.5, volume: 0.3, bands: [0, 0],
    });
    expect(u.uColor?.type).toBe('3fv');
    expect(u.uIntensity).toEqual({ type: '1f', value: 0.5 });
    expect(u.uSpeed).toEqual({ type: '1f', value: 2 });
    expect(u.uComplexity).toEqual({ type: '1f', value: 0.5 });
  });

  it('supplies the audio uniforms, including the band array upstream lacks', async () => {
    const { customUniforms } = await import('./variant-custom');
    const u = customUniforms({
      color: '#000000', intensity: 1, speed: 1, complexity: 0.5, volume: 0.7, bands: [0.1, 0.2, 0.3],
    });
    expect(u.uVolume).toEqual({ type: '1f', value: 0.7 });
    expect(u.uBands).toEqual({ type: '1fv', value: [0.1, 0.2, 0.3], arraySize: 3 });
  });

  it('declares uBands with its real length so the shader compiles', async () => {
    const { customUniforms } = await import('./variant-custom');
    const u = customUniforms({
      color: '#000000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0, 0, 0, 0, 0],
    });
    const src = buildFragmentSource(FRAGMENT, u, 'highp');
    expect(src).toContain('uniform float uBands[5];');
  });

  it('never declares a zero-length array, which is invalid GLSL', async () => {
    const { customUniforms } = await import('./variant-custom');
    const u = customUniforms({
      color: '#000000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [],
    });
    expect(u.uBands?.arraySize).toBe(1);
    expect(u.uBands?.value).toEqual([0]);
    const src = buildFragmentSource(FRAGMENT, u, 'highp');
    expect(src).toContain('uniform float uBands[1];');
    expect(src).not.toContain('uBands[0]');
  });

  it('merges caller uniforms over the defaults', async () => {
    const { customUniforms } = await import('./variant-custom');
    const u = customUniforms(
      { color: '#000000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
      { uWarp: { type: '1f', value: 0.7 } },
    );
    expect(u.uWarp).toEqual({ type: '1f', value: 0.7 });
    expect(u.uIntensity).toBeDefined();
  });

  it('falls back to the default colour on a malformed hex', async () => {
    const { customUniforms } = await import('./variant-custom');
    const bad = customUniforms({
      color: 'not-a-color', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0],
    });
    expect((bad.uColor?.value as number[]).every((c) => c >= 0 && c <= 1)).toBe(true);
  });

  it('keeps the uniform SHAPE identical across different band lengths only when the length is the same', async () => {
    const { customUniforms } = await import('./variant-custom');
    const a = customUniforms({ color: '#000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0.1, 0.2] });
    const b = customUniforms({ color: '#000', intensity: 0.9, speed: 1.2, complexity: 0.3, volume: 0.5, bands: [0.9, 0.9] });
    expect(a.uBands?.arraySize).toBe(b.uBands?.arraySize);
  });

  describe('validation of a consumer-declared uniform', () => {
    it('throws a descriptive error for an unrecognized type', async () => {
      const { customUniforms } = await import('./variant-custom');
      expect(() =>
        customUniforms(
          { color: '#000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
          { uMystery: { type: 'not-a-real-type' as never, value: 1 } },
        ),
      ).toThrow(/uMystery/);
    });

    it('throws when a scalar type ("1f") is given an array value', async () => {
      const { customUniforms } = await import('./variant-custom');
      expect(() =>
        customUniforms(
          { color: '#000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
          { uBroken: { type: '1f', value: [1, 2, 3] } },
        ),
      ).toThrow(/uBroken/);
    });

    it('throws when an array type ("3fv") is given a scalar value', async () => {
      const { customUniforms } = await import('./variant-custom');
      expect(() =>
        customUniforms(
          { color: '#000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
          { uBroken: { type: '3fv', value: 5 as unknown as number[] } },
        ),
      ).toThrow(/uBroken/);
    });

    it('throws when a declared value contains a non-finite number', async () => {
      const { customUniforms } = await import('./variant-custom');
      expect(() =>
        customUniforms(
          { color: '#000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
          { uBroken: { type: '1f', value: NaN } },
        ),
      ).toThrow(/uBroken/);
    });

    it('throws a descriptive error, not a raw TypeError, when a declaration entry is not an object', async () => {
      const { customUniforms } = await import('./variant-custom');
      expect(() =>
        customUniforms(
          { color: '#000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
          { uBroken: null as unknown as UniformSpec },
        ),
      ).toThrow(/uBroken/);
    });

    it('does not throw for a well-formed uniform of every scalar and array type', async () => {
      const { customUniforms } = await import('./variant-custom');
      expect(() =>
        customUniforms(
          { color: '#000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
          {
            a: { type: '1f', value: 1 },
            b: { type: '1i', value: 1 },
            c: { type: '1fv', value: [1, 2] },
            d: { type: '2f', value: [1, 2] },
            e: { type: '3f', value: [1, 2, 3] },
            f: { type: '3fv', value: [1, 2, 3] },
            g: { type: '4f', value: [1, 2, 3, 4] },
            h: { type: '4fv', value: [1, 2, 3, 4] },
            i: { type: 'Matrix2fv', value: [1, 0, 0, 1] },
            j: { type: 'Matrix3fv', value: new Array(9).fill(0) },
            k: { type: 'Matrix4fv', value: new Array(16).fill(0) },
          },
        ),
      ).not.toThrow();
    });

    describe('fixed-arity types: 2f, 3f, 4f, Matrix2fv, Matrix3fv, Matrix4fv', () => {
      // Tuple order [type, arity, correctValue] on purpose: it.each's
      // printf-style title consumes format specifiers positionally against
      // the row, so keeping `arity` second lets both titles below reference
      // it with a plain `%i` without also having to spell out `value`.
      const cases: Array<[UniformSpec['type'], number, number[]]> = [
        ['2f', 2, [1, 2]],
        ['3f', 3, [1, 2, 3]],
        ['4f', 4, [1, 2, 3, 4]],
        ['Matrix2fv', 4, [1, 0, 0, 1]],
        ['Matrix3fv', 9, new Array(9).fill(0)],
        ['Matrix4fv', 16, new Array(16).fill(0)],
      ];

      it.each(cases)('accepts %s at its correct arity (%i)', async (type, _arity, value) => {
        const { customUniforms } = await import('./variant-custom');
        expect(() =>
          customUniforms(
            { color: '#000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
            { uBroken: { type, value } },
          ),
        ).not.toThrow();
      });

      it.each(cases)('rejects %s given the wrong length (correct arity is %i)', async (type, arity) => {
        const { customUniforms } = await import('./variant-custom');
        const wrongLength = new Array(arity + 1).fill(0);
        expect(() =>
          customUniforms(
            { color: '#000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
            { uBroken: { type, value: wrongLength } },
          ),
        ).toThrow(/uBroken/);
      });
    });

    describe('ambiguous repeated-array types (1fv, 3fv, 4fv) are deliberately NOT arity-checked', () => {
      // These support a legitimate multi-instance array via shader-canvas's
      // own inference (see FIXED_ARITY's doc) -- a "wrong" length for a
      // single instance is a VALID array of N instances, so nothing here
      // should ever throw purely on length.
      it('accepts a 3fv given a length that is not a multiple of 3 (or of anything) without throwing', async () => {
        const { customUniforms } = await import('./variant-custom');
        expect(() =>
          customUniforms(
            { color: '#000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
            { uOdd: { type: '3fv', value: [1, 2, 3, 4, 5] } },
          ),
        ).not.toThrow();
      });

      it('accepts a 1fv of any length, including a single element', async () => {
        const { customUniforms } = await import('./variant-custom');
        expect(() =>
          customUniforms(
            { color: '#000', intensity: 1, speed: 1, complexity: 0.5, volume: 0, bands: [0] },
            { uOdd: { type: '1fv', value: [1, 2, 3, 4, 5, 6, 7] } },
          ),
        ).not.toThrow();
      });
    });
  });
});

describe('CustomVisualizer: onError reaches onUnavailable, with differentiated log severity', () => {
  installFakeClock();

  it('logs quietly (console.warn) and calls onUnavailable when there is no WebGL context -- an expected environment limitation', async () => {
    const { default: CustomVisualizer } = await import('./variant-custom');
    const onUnavailable = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(() => (
      <CustomVisualizer {...baseProps} shader={{ fragment: FRAGMENT }} onUnavailable={onUnavailable} />
    ));

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('variant="custom"');
    expect(error).not.toHaveBeenCalled();
  });

  it('logs loudly (console.error) and calls onUnavailable on a shader compile failure -- a bug in the consumer\'s GLSL they need to see', async () => {
    const gl = fakeGL({ failFragmentCompile: true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      type === 'webgl' || type === 'experimental-webgl' ? gl : null) as never);

    const { default: CustomVisualizer } = await import('./variant-custom');
    const onUnavailable = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(() => (
      <CustomVisualizer {...baseProps} shader={{ fragment: FRAGMENT }} onUnavailable={onUnavailable} />
    ));

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain('variant="custom"');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('CustomVisualizer: no shader supplied', () => {
  it('renders an empty placeholder and does not call onUnavailable -- not configuring a shader is not a failure', async () => {
    const { default: CustomVisualizer } = await import('./variant-custom');
    const onUnavailable = vi.fn();

    const { container } = render(() => <CustomVisualizer {...baseProps} onUnavailable={onUnavailable} />);

    expect(container.querySelector('canvas')).toBeNull();
    expect(onUnavailable).not.toHaveBeenCalled();
  });
});

describe('CustomVisualizer: an invalid consumer uniform never throws, and routes to onUnavailable instead', () => {
  it('does not throw during render, never mounts ShaderCanvas, logs loudly, and calls onUnavailable', async () => {
    let shaderCanvasCalled = false;
    vi.doMock('./shader-canvas', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./shader-canvas')>();
      return {
        ...actual,
        ShaderCanvas: (props: unknown) => {
          shaderCanvasCalled = true;
          return null;
        },
      };
    });
    const { default: CustomVisualizer } = await import('./variant-custom');
    const onUnavailable = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      render(() => (
        <CustomVisualizer
          {...baseProps}
          shader={{ fragment: FRAGMENT, uniforms: { uBroken: { type: '1f', value: [1, 2, 3] as unknown as number } } }}
          onUnavailable={onUnavailable}
        />
      )),
    ).not.toThrow();

    expect(shaderCanvasCalled).toBe(false);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain('variant="custom"');
    expect(String(error.mock.calls[0]?.[1] ?? error.mock.calls[0]?.[0])).toContain('uBroken');
  });

  it('reports the failure only once even though ShaderCanvas would otherwise read uniforms every frame', async () => {
    vi.doMock('./shader-canvas', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./shader-canvas')>();
      return { ...actual, ShaderCanvas: () => null };
    });
    const { default: CustomVisualizer } = await import('./variant-custom');
    const onUnavailable = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(() => (
      <CustomVisualizer
        {...baseProps}
        shader={{ fragment: FRAGMENT, uniforms: { uBroken: { type: '3fv', value: 5 as unknown as number[] } } }}
        onUnavailable={onUnavailable}
      />
    ));

    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  // CustomVisualizer is a public default export usable standalone (a shader
  // editor, a Storybook control surface), where `props.shader` can change
  // after mount unlike the shipped dispatcher path (which tears the
  // component down on the first onUnavailable and never gives it a second
  // shader to react to). This is the scenario the dispatcher's own
  // permanent-`unavailable` flag masks.
  it('reports a SECOND, DIFFERENT bad uniform after an intervening valid render -- the `reported` guard must reset, not latch permanently', async () => {
    vi.doMock('./shader-canvas', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./shader-canvas')>();
      return { ...actual, ShaderCanvas: () => null };
    });
    const { default: CustomVisualizer } = await import('./variant-custom');
    const onUnavailable = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const [shader, setShader] = createSignal<ShaderSpec>({
      fragment: FRAGMENT,
      uniforms: { uBroken: { type: '1f', value: [1, 2, 3] as unknown as number } },
    });

    render(() => <CustomVisualizer {...baseProps} shader={shader()} onUnavailable={onUnavailable} />);

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('uBroken');

    // Fixed -- a valid render in between. No new failure to report.
    setShader({ fragment: FRAGMENT });
    await Promise.resolve();
    expect(onUnavailable).toHaveBeenCalledTimes(1);

    // A DIFFERENT bad uniform. Without the reset, `reported` would still be
    // `true` from the first failure and this would go silent.
    setShader({ fragment: FRAGMENT, uniforms: { uOther: { type: '3fv', value: 5 as unknown as number[] } } });
    await Promise.resolve();

    expect(onUnavailable).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(2);
    expect(String(error.mock.calls[1]?.[0])).toContain('uOther');
  });
});

describe('CustomVisualizer: state/volume -> uniform mapping', () => {
  type CapturedProps = {
    fragment: string;
    precision?: string;
    uniforms: Record<string, { type: string; value: number | number[]; arraySize?: number }>;
  };

  let captured: CapturedProps | undefined;

  beforeEach(() => {
    captured = undefined;
    vi.doMock('./shader-canvas', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./shader-canvas')>();
      return {
        ...actual,
        ShaderCanvas: (props: CapturedProps) => {
          captured = props;
          return null;
        },
      };
    });
  });

  async function renderCustom(props: Partial<ShaderVariantProps> = {}) {
    const { default: CustomVisualizer } = await import('./variant-custom');
    render(() => (
      <CustomVisualizer {...baseProps} shader={{ fragment: FRAGMENT }} {...props} />
    ));
    return captured!;
  }

  it('passes the caller fragment through untouched', async () => {
    const c = await renderCustom();
    expect(c.fragment).toBe(FRAGMENT);
  });

  it('uses mediump precision at icon and sm, highp otherwise', async () => {
    expect((await renderCustom({ size: 'icon' })).precision).toBe('mediump');
    cleanup();
    expect((await renderCustom({ size: 'sm' })).precision).toBe('mediump');
    cleanup();
    expect((await renderCustom({ size: 'md' })).precision).toBe('highp');
    cleanup();
    expect((await renderCustom({ size: 'lg' })).precision).toBe('highp');
  });

  it('maps a caller colour through hexToRgb, and falls back to the default when none is given', async () => {
    const custom = await renderCustom({ color: '#ff0000' });
    expect(custom.uniforms.uColor?.value).toEqual([1, 0, 0]);
    cleanup();
    const fallback = await renderCustom({ color: undefined });
    expect(fallback.uniforms.uColor?.value).toEqual([0x1f / 255, 0xd5 / 255, 0xf9 / 255]);
  });

  it('maps complexity straight through, defaulting to 0.5', async () => {
    expect((await renderCustom({ complexity: 0.9 })).uniforms.uComplexity?.value).toBe(0.9);
    cleanup();
    expect((await renderCustom({ complexity: undefined })).uniforms.uComplexity?.value).toBe(0.5);
  });

  it('maps live volume straight through as uVolume', async () => {
    expect((await renderCustom({ volume: 0.42 })).uniforms.uVolume?.value).toBe(0.42);
  });

  it('declares uBands with the actual band count, including padding an empty array to one element', async () => {
    const withBands = await renderCustom({ bands: [0.1, 0.2, 0.3, 0.4] });
    expect(withBands.uniforms.uBands?.value).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(withBands.uniforms.uBands?.arraySize).toBe(4);
    cleanup();
    const empty = await renderCustom({ bands: [] });
    expect(empty.uniforms.uBands?.value).toEqual([0]);
    expect(empty.uniforms.uBands?.arraySize).toBe(1);
  });

  it('merges a consumer-declared uniform through to ShaderCanvas', async () => {
    const c = await renderCustom({
      shader: { fragment: FRAGMENT, uniforms: { uWarp: { type: '1f', value: 0.25 } } },
    });
    expect(c.uniforms.uWarp).toEqual({ type: '1f', value: 0.25 });
    // The standard set is still present alongside it.
    expect(c.uniforms.uIntensity).toBeDefined();
  });

  it('overrides intensity from live volume while speaking, per the documented formula', async () => {
    const quiet = await renderCustom({ state: 'speaking', volume: 0 });
    expect(quiet.uniforms.uIntensity?.value).toBeCloseTo(0.3 + 0.7 * 0, 6);
    cleanup();
    const loud = await renderCustom({ state: 'speaking', volume: 0.6 });
    expect(loud.uniforms.uIntensity?.value).toBeCloseTo(0.3 + 0.7 * 0.6, 6);
  });

  it('does not let live volume leak into a non-speaking state', async () => {
    const c = await renderCustom({ state: 'idle', volume: 0.9 });
    expect(c.uniforms.uIntensity?.value).toBe(0.3);
  });

  it('frozen lands listening\'s intensity target immediately, skipping the tween', async () => {
    const c = await renderCustom({ state: 'listening', frozen: true });
    // shaderTargets('listening').intensity is the pulse pair [0.5, 0.8];
    // frozen collapses it to its first value.
    expect(c.uniforms.uIntensity?.value).toBeCloseTo(0.5, 6);
  });

  it('keeps the uniform SHAPE (names, types, sizes) identical across different states, so ShaderCanvas never recompiles on a value-only change', async () => {
    const shapeOf = (c: CapturedProps) =>
      Object.entries(c.uniforms)
        .map(([name, u]) => `${name}:${u.type}:${u.arraySize ?? ''}`)
        .sort()
        .join('|');

    const idle = await renderCustom({ state: 'idle', bands: [0.1, 0.2, 0.3] });
    const idleShape = shapeOf(idle);
    cleanup();

    const speaking = await renderCustom({ state: 'speaking', volume: 0.5, bands: [0.9, 0.1, 0.4] });
    expect(shapeOf(speaking)).toBe(idleShape);
    cleanup();

    const frozenListening = await renderCustom({ state: 'listening', frozen: true, bands: [0.2, 0.2, 0.2] });
    expect(shapeOf(frozenListening)).toBe(idleShape);
  });

  it('changes the uBands shape when the band COUNT changes, which is exactly when ShaderCanvas must recompile', async () => {
    const shapeOf = (c: CapturedProps) => `${c.uniforms.uBands?.type}:${c.uniforms.uBands?.arraySize}`;
    const three = await renderCustom({ bands: [0.1, 0.2, 0.3] });
    const threeShape = shapeOf(three);
    cleanup();
    const five = await renderCustom({ bands: [0.1, 0.2, 0.3, 0.4, 0.5] });
    expect(shapeOf(five)).not.toBe(threeShape);
  });
});

describe('CustomVisualizer: does not defeat ShaderCanvas\'s recompile guard', () => {
  const { advance, isFramePending } = installFakeClock();

  afterEach(() => vi.restoreAllMocks());

  it('compiles exactly once while intensity/speed/volume tick through several frames with a consumer uniform present', async () => {
    const gl = fakeGL();
    const calls: string[] = [];
    const originalCreateProgram = gl.createProgram.bind(gl);
    gl.createProgram = () => { calls.push('createProgram'); return originalCreateProgram(); };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      type === 'webgl' || type === 'experimental-webgl' ? gl : null) as never);

    const { default: CustomVisualizer } = await import('./variant-custom');
    render(() => (
      <CustomVisualizer
        {...baseProps}
        state="listening"
        frozen={false}
        bands={[0.1, 0.2, 0.3]}
        shader={{ fragment: FRAGMENT, uniforms: { uWarp: { type: '1f', value: 0.5 } } }}
      />
    ));
    expect(calls).toHaveLength(1);

    for (let i = 0; i < 10 && isFramePending(); i++) advance(50);

    expect(calls).toHaveLength(1);
  });
});

/**
 * A minimal stand-in for WebGLRenderingContext, matching the one in
 * shader-canvas.test.tsx. Every call is a recording no-op that reports
 * success (or the requested failure). None of this proves a shader actually
 * draws anything correct on screen -- that remains a browser-only concern.
 */
function fakeGL(failures: { failFragmentCompile?: boolean } = {}) {
  const locations = new Map<string, object>();
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, BLEND: 8, ONE: 9,
    ONE_MINUS_SRC_ALPHA: 10, TRIANGLE_STRIP: 11, COLOR_BUFFER_BIT: 12,
    createShader: (type: number) => ({ __type: type }),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: (shader: { __type: number }) =>
      !(failures.failFragmentCompile && shader.__type === gl.FRAGMENT_SHADER),
    getShaderInfoLog: () => 'fake shader compile error',
    deleteShader: () => {},
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => 'fake link error',
    useProgram: () => {},
    deleteProgram: () => {},
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    deleteBuffer: () => {},
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
  return gl as unknown as WebGLRenderingContext & { createProgram: () => object };
}
