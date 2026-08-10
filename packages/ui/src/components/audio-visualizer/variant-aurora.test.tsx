import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { installFakeClock } from '../../test-utils/fake-clock';
import type { ShaderVariantProps } from './index';

// jsdom has no WebGL at all, so the shader itself never compiles or draws in
// these tests -- see shader-canvas.test.tsx. What IS testable without a GPU:
// the state/volume/frozen -> uniform mapping AuroraVisualizer computes before
// handing it to ShaderCanvas (including that the volume-driven uScale growth
// is folded in exactly once, and reverts cleanly), that the uniform SET
// matches the shader's actual contract (no uVolume, no uBands), that the
// uniform SHAPE never varies (or ShaderCanvas recompiles every frame), that
// frozen genuinely skips every pulse, and that onError reaches onUnavailable
// with differentiated log severity. Whether the aura actually renders
// correctly on screen -- the warp cascade, the 36-strand veil, the premultiplied
// compositing -- is a browser-only concern, called out in the task report.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

/**
 * A minimal stand-in for WebGLRenderingContext, matching the one duplicated
 * in shader-canvas.test.tsx and variant-custom.test.tsx. Every call is a
 * recording no-op that reports success (or the requested failure).
 *
 * `uniformHistory` (an added property, not part of the real WebGL API) is
 * every `1f` value ever pushed to a given uniform NAME, in push order --
 * only what the recompile-guard test below needs to PROVE a value-bearing
 * uniform (`uIntensity`) genuinely changed across the fake clock's advance
 * loop, not just infer it from the absence of a second `createProgram` call.
 */
function fakeGL(failures: { failFragmentCompile?: boolean } = {}) {
  const locations = new Map<string, object>();
  const locationNames = new Map<object, string>();
  const uniformHistory: Record<string, number[]> = {};
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
      if (!locations.has(name)) {
        const loc = {};
        locations.set(name, loc);
        locationNames.set(loc, name);
      }
      return locations.get(name)!;
    },
    uniform1f: (loc: object, value: number) => {
      const name = locationNames.get(loc);
      if (name) (uniformHistory[name] ??= []).push(value);
    },
    uniform1i: () => {}, uniform1fv: () => {}, uniform2fv: () => {},
    uniform3fv: () => {}, uniform4fv: () => {},
    uniformMatrix2fv: () => {}, uniformMatrix3fv: () => {}, uniformMatrix4fv: () => {},
    clearColor: () => {}, clear: () => {}, drawArrays: () => {}, viewport: () => {},
    isContextLost: () => false,
    uniformHistory,
  };
  return gl as unknown as WebGLRenderingContext & { createProgram: () => object; uniformHistory: typeof uniformHistory };
}

describe('AuroraVisualizer: onError reaches onUnavailable, with differentiated log severity', () => {
  // Deliberately the REAL, unmocked ShaderCanvas here for the "no context"
  // case, the same way shader-canvas.test.tsx's own "WebGL unavailable"
  // block relies on jsdom's real (unmocked) `getContext('webgl')` returning
  // null -- proving the wiring against the real component, not a mock of it.
  it('logs quietly (console.warn) and calls onUnavailable when there is no WebGL context -- an expected environment limitation', async () => {
    const { default: AuroraVisualizer } = await import('./variant-aurora');
    const onUnavailable = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(() => <AuroraVisualizer {...baseProps} onUnavailable={onUnavailable} />);

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('variant="aurora"');
    expect(warn.mock.calls[0]?.[1]).toMatch(/webgl/i);
    expect(error).not.toHaveBeenCalled();
  });

  it('logs loudly (console.error) and calls onUnavailable on a shader compile/link failure -- a bug in this shipped shader', async () => {
    const gl = fakeGL({ failFragmentCompile: true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      type === 'webgl' || type === 'experimental-webgl' ? gl : null) as never);

    const { default: AuroraVisualizer } = await import('./variant-aurora');
    const onUnavailable = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(() => <AuroraVisualizer {...baseProps} onUnavailable={onUnavailable} />);

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain('variant="aurora"');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('AuroraVisualizer: state -> uniform mapping', () => {
  type CapturedProps = {
    fragment: string;
    precision?: string;
    uniforms: Record<string, { type: string; value: number | number[] }>;
  };

  let captured: CapturedProps | undefined;

  beforeEach(() => {
    captured = undefined;
    // Real jsdom has no WebGL, so a test asserting on uniform VALUES needs a
    // stand-in that never reaches `getContext` at all. `hexToRgb` and
    // `DEFAULT_SHADER_COLOR` pass through real (importOriginal): the variant
    // imports them directly too, so mocking them would test nothing.
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

  async function renderAurora(props: Partial<ShaderVariantProps & { dark?: boolean }> = {}) {
    const { default: AuroraVisualizer } = await import('./variant-aurora');
    render(() => <AuroraVisualizer {...baseProps} {...props} />);
    return captured!;
  }

  it('passes the extracted aurora.glsl source through untouched', async () => {
    const { default: auroraShader } = await import('./aurora.glsl');
    const c = await renderAurora();
    expect(c.fragment).toBe(auroraShader);
  });

  it('supplies exactly the eight documented aurora uniforms -- no uVolume, no uBands', async () => {
    const c = await renderAurora();
    expect(Object.keys(c.uniforms).sort()).toEqual(
      ['uAmplitude', 'uColor', 'uComplexity', 'uIntensity', 'uRotation', 'uScale', 'uSpeed', 'uTheme'].sort(),
    );
  });

  it('matches fact sheet section 5 at idle: brightness 1.0, speed 0.5, freqParam 0.4, amplitude 1.2, scale 0.2', async () => {
    const c = await renderAurora({ state: 'idle' });
    expect(c.uniforms.uIntensity?.value).toBe(1.0);
    expect(c.uniforms.uSpeed?.value).toBe(0.5);
    expect(c.uniforms.uComplexity?.value).toBe(0.4);
    expect(c.uniforms.uAmplitude?.value).toBe(1.2);
    expect(c.uniforms.uScale?.value).toBe(0.2);
    // No matchMedia stub in this describe block: jsdom has none at all, so
    // this is also the "matchMedia unavailable" default -- light (1).
    expect(c.uniforms.uTheme?.value).toBe(1);
  });

  it('disconnected mirrors idle\'s targets for now (LiveKit measurement pending; their aura may dim differently)', async () => {
    const c = await renderAurora({ state: 'disconnected' });
    expect(c.uniforms.uIntensity?.value).toBe(1.0);
    expect(c.uniforms.uSpeed?.value).toBe(0.5);
    expect(c.uniforms.uComplexity?.value).toBe(0.4);
    expect(c.uniforms.uAmplitude?.value).toBe(1.2);
    expect(c.uniforms.uScale?.value).toBe(0.2);
  });

  it('uses mediump precision at icon and sm, highp otherwise -- shaders are expensive on phones', async () => {
    expect((await renderAurora({ size: 'icon' })).precision).toBe('mediump');
    cleanup();
    expect((await renderAurora({ size: 'sm' })).precision).toBe('mediump');
    cleanup();
    expect((await renderAurora({ size: 'md' })).precision).toBe('highp');
    cleanup();
    expect((await renderAurora({ size: 'lg' })).precision).toBe('highp');
  });

  it('maps a caller colour through hexToRgb, and falls back to the default when none is given', async () => {
    const custom = await renderAurora({ color: '#ff0000' });
    expect(custom.uniforms.uColor?.value).toEqual([1, 0, 0]);
    cleanup();
    const fallback = await renderAurora({ color: undefined });
    // #1FD5F9 -- DEFAULT_SHADER_COLOR.
    expect(fallback.uniforms.uColor?.value).toEqual([0x1f / 255, 0xd5 / 255, 0xf9 / 255]);
  });

  it('sets uTheme to 0 (dark pipeline) when the system prefers dark', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));
    const c = await renderAurora();
    expect(c.uniforms.uTheme?.value).toBe(0);
  });

  it('sets uTheme to 1 (light pipeline) when the system prefers light', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));
    const c = await renderAurora();
    expect(c.uniforms.uTheme?.value).toBe(1);
  });

  // This is the regression Rob's dispatcher agent caught: <kai-audio-visualizer
  // theme="light"> on a dark OS was rendering the DARK pipeline, because
  // nothing threaded the facade's already-resolved theme down and this
  // component sniffed the media query itself instead. `props.dark` is the
  // fix's seam -- an explicit value must win over the system preference in
  // BOTH directions, not just happen to agree with it.
  it('an explicit dark=false (light) wins over a system that prefers dark', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));
    const c = await renderAurora({ dark: false });
    expect(c.uniforms.uTheme?.value).toBe(1);
  });

  it('an explicit dark=true wins over a system that prefers light', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));
    const c = await renderAurora({ dark: true });
    expect(c.uniforms.uTheme?.value).toBe(0);
  });

  it('frozen lands listening\'s targets immediately, skipping the tween, and pins speed at 0', async () => {
    const { auroraTargets } = await import('./variant-aurora');
    const t = auroraTargets('listening');
    const c = await renderAurora({ state: 'listening', frozen: true });
    expect(c.uniforms.uIntensity?.value).toBe((t.intensity as [number, number])[0]);
    expect(c.uniforms.uComplexity?.value).toBeCloseTo(t.complexity, 6);
    expect(c.uniforms.uAmplitude?.value).toBeCloseTo(t.amplitude, 6);
    expect(c.uniforms.uScale?.value).toBeCloseTo(t.scale, 6);
    expect(c.uniforms.uSpeed?.value).toBe(0);
  });

  it('un-frozen leaves complexity/amplitude/scale at their pre-tween initial values synchronously (the control case), but speed still applies instantly', async () => {
    // The "frozen lands on target immediately" test above proves frozen
    // reaches auroraTargets('thinking')'s complexity/amplitude/scale with no
    // frame advanced. This is the control: without frozen, the same state
    // change goes through a real 0.5s tween instead of an instant duration:0
    // set, so nothing has moved yet at this same synchronous point -- except
    // speed, which is never tweened (fact sheet section 5) and always
    // applies instantly regardless of frozen.
    const c = await renderAurora({ state: 'thinking', frozen: false });
    expect(c.uniforms.uComplexity?.value).toBe(0.4); // createTween's initial value, untouched
    expect(c.uniforms.uAmplitude?.value).toBe(1.2);
    expect(c.uniforms.uScale?.value).toBe(0.2);
    expect(c.uniforms.uSpeed?.value).toBe(1.5); // thinking's target, applied instantly
  });

  it('folds live volume into uScale exactly once while speaking with volume > 0: 0.2 + 0.2 * volume', async () => {
    const quiet = await renderAurora({ state: 'speaking', frozen: true, volume: 0 });
    // volume is not > 0, so this is the state's pre-voice base (0.3), not the formula.
    expect(quiet.uniforms.uScale?.value).toBeCloseTo(0.3, 6);
    cleanup();

    const loud = await renderAurora({ state: 'speaking', frozen: true, volume: 0.9 });
    expect(loud.uniforms.uScale?.value).toBeCloseTo(0.2 + 0.2 * 0.9, 6);
  });

  it('does not let live volume leak into a non-speaking state', async () => {
    const c = await renderAurora({ state: 'idle', frozen: true, volume: 0.9 });
    // If the state guard were missing, this would read close to 0.2 + 0.2*0.9
    // (0.38) instead of idle's flat base target (0.2).
    expect(c.uniforms.uScale?.value).toBeCloseTo(0.2, 6);
  });

  it('HOLDS the last voice-driven uScale when volume drops back to 0 mid-speech (silence-hold), instead of relaxing to the state base', async () => {
    const { default: AuroraVisualizer } = await import('./variant-aurora');
    const [volume, setVolume] = createSignal(0.9);
    render(() => (
      <AuroraVisualizer {...baseProps} state="speaking" frozen={true} volume={volume()} onUnavailable={() => {}} />
    ));
    // Frozen speaking mount lands the pre-voice base (0.3) instantly, then
    // volume (0.9) > 0 overrides it via the formula.
    expect(captured!.uniforms.uScale?.value).toBeCloseTo(0.2 + 0.2 * 0.9, 6);

    setVolume(0);
    await Promise.resolve();
    // Upstream-parity (audit target 6 + the Apache hook's semantics): the
    // override drives the scale TWEEN, and silence simply stops driving it,
    // so a mid-speech pause leaves the radius wherever the voice last put
    // it. Only a STATE change re-targets it.
    expect(captured!.uniforms.uScale?.value).toBeCloseTo(0.2 + 0.2 * 0.9, 6);

    // And a later voice tick takes back over instantly.
    setVolume(0.25);
    await Promise.resolve();
    expect(captured!.uniforms.uScale?.value).toBeCloseTo(0.2 + 0.2 * 0.25, 6);
  });

  it('exposes calibrated per-state uRotation values (deg/s -> rad/s, + = clockwise on screen), every transitional state clockwise', async () => {
    const degToRad = (d: number) => (d * Math.PI) / 180;
    const expectRotation = async (state: ShaderVariantProps['state'], deg: number) => {
      const c = await renderAurora({ state, frozen: false });
      expect(c.uniforms.uRotation?.value).toBeCloseTo(degToRad(deg), 6);
      cleanup();
    };
    // Values are the offline-probe calibration against the aurora-audit
    // rotation targets (see auroraTargets's own doc): the WIND supplies most
    // of the apparent motion; these are solid-body trims on top of it.
    // Connecting used to pin -5.5 (CCW) from that probe; flipped to the
    // clockwise equivalent 2026-08-10 (supervisor call, Rob delegated) --
    // see the rationale in auroraTargets's doc.
    // Like uSpeed, uRotation is never tweened, so it reads synchronously.
    await expectRotation('idle', 0);
    await expectRotation('listening', 5.3);
    await expectRotation('thinking', 9.4);
    await expectRotation('connecting', 5.5);
    await expectRotation('speaking', -3.5);
  });

  it('pins uRotation to 0 when frozen -- reduced motion freezes the spin along with the wind', async () => {
    const c = await renderAurora({ state: 'speaking', frozen: true });
    expect(c.uniforms.uRotation?.value).toBe(0);
  });

  it('keeps the uniform SHAPE (names, types) identical across every state, frozen, colour, and volume combination, so ShaderCanvas never recompiles on a value-only change', async () => {
    const shapeOf = (c: CapturedProps) =>
      Object.entries(c.uniforms).map(([name, u]) => `${name}:${u.type}`).sort().join('|');

    const idle = await renderAurora({ state: 'idle' });
    const idleShape = shapeOf(idle);
    cleanup();

    const speaking = await renderAurora({ state: 'speaking', volume: 0.7 });
    expect(shapeOf(speaking)).toBe(idleShape);
    cleanup();

    const frozenListening = await renderAurora({ state: 'listening', frozen: true });
    expect(shapeOf(frozenListening)).toBe(idleShape);
    cleanup();

    const coloured = await renderAurora({ state: 'thinking', color: '#ff00ff' });
    expect(shapeOf(coloured)).toBe(idleShape);
  });
});

// Upstream-parity driving behavior (audit targets 6 + 7): the listening
// spring and the isAnimating guard on the volume override. Both need
// deterministic time, so they run on the fake clock.
describe('AuroraVisualizer: listening spring + volume-override guard', () => {
  const { advance } = installFakeClock();

  type CapturedProps = {
    uniforms: Record<string, { type: string; value: number | number[] }>;
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

  const uScale = () => captured!.uniforms.uScale?.value as number;

  it('idle -> listening lands uScale through a SPRING (1.0s, bounce 0.35): overshoots past 0.3, then settles on it', async () => {
    const { default: AuroraVisualizer } = await import('./variant-aurora');
    const [state, setState] = createSignal<ShaderVariantProps['state']>('idle');
    render(() => (
      <AuroraVisualizer {...baseProps} state={state()} frozen={false} onUnavailable={() => {}} />
    ));
    // Land idle's 0.2 first so the spring's start point is deterministic.
    for (let i = 0; i < 30; i++) advance(25);
    expect(uScale()).toBeCloseTo(0.2, 3);

    setState('listening');
    await Promise.resolve();
    let peak = 0;
    for (let i = 0; i < 50; i++) {
      advance(25);
      peak = Math.max(peak, uScale());
    }
    // A 0.5s easeOut landing (every other state's transition) can never
    // exceed its target; the spring's bounce 0.35 must.
    expect(peak).toBeGreaterThan(0.302);
    expect(uScale()).toBeCloseTo(0.3, 2);
  });

  it('ignores live volume while the speaking landing is still animating (the isAnimating guard), then applies it the moment the landing settles', async () => {
    const { default: AuroraVisualizer } = await import('./variant-aurora');
    const [state, setState] = createSignal<ShaderVariantProps['state']>('idle');
    render(() => (
      <AuroraVisualizer {...baseProps} state={state()} volume={0.9} frozen={false} onUnavailable={() => {}} />
    ));
    for (let i = 0; i < 30; i++) advance(25);
    expect(uScale()).toBeCloseTo(0.2, 3);

    setState('speaking');
    await Promise.resolve();
    // Mid-landing (0.5s easeOut, 0.2 -> 0.3): volume 0.9 must NOT have
    // snapped the scale to 0.38 -- the landing finishes first.
    advance(100);
    expect(uScale()).toBeLessThan(0.31);
    advance(100);
    expect(uScale()).toBeLessThan(0.31);

    // Landing completes; the guard opens and the CURRENT volume applies
    // immediately (the override effect also tracks scale.animating(), so a
    // volume that arrived during the landing is not lost until a next tick).
    for (let i = 0; i < 20; i++) advance(25);
    await Promise.resolve();
    expect(uScale()).toBeCloseTo(0.2 + 0.2 * 0.9, 6);
  });
});

// The value-based frozen assertions above prove WHERE the tweened uniforms
// land; this proves HOW they got there, which is the part a regression could
// silently break (e.g. collapsing a pulse to a scalar but forgetting to also
// pass `{ duration: 0 }`, which would still read correct at the instant of
// mount yet leave a stray animation ticking).
describe('AuroraVisualizer: frozen never arms a tween animation frame', () => {
  const { isFramePending } = installFakeClock();

  it('frozen: none of intensity, complexity, amplitude, or scale ever schedule a frame', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { default: AuroraVisualizer } = await import('./variant-aurora');
    render(() => (
      <AuroraVisualizer {...baseProps} state="listening" frozen={true} onUnavailable={() => {}} />
    ));
    expect(isFramePending()).toBe(false);
  });

  it('un-frozen: at least one of them does (the control case)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { default: AuroraVisualizer } = await import('./variant-aurora');
    render(() => (
      <AuroraVisualizer {...baseProps} state="listening" frozen={false} onUnavailable={() => {}} />
    ));
    expect(isFramePending()).toBe(true);
  });
});

// Through the REAL ShaderCanvas, with a stand-in WebGL context standing in
// only for the GPU calls jsdom cannot make, this proves that a value-only
// change across several animation frames genuinely does not trigger a second
// `createProgram` call -- the exact defect class Task 11 fixed inside
// ShaderCanvas itself, guarded here from this component's side.
//
// `installFakeClock`'s stub used to hold a single pending callback, not a
// queue: ShaderCanvas's own `draw` loop always re-registers itself last (see
// its own `raf = requestAnimationFrame(draw)` at the end of every call), so
// it permanently "won" the single slot and the intensity/complexity/
// amplitude/scale tweens -- separate requestAnimationFrame consumers --
// never got to fire. That made `createProgram` staying at 1 trivially true
// regardless of whether the recompile guard worked at all: nothing was ever
// actually ticking. `uIntensity` (the pulse, which ping-pongs forever at
// `listening`) is captured below specifically to prove the precondition
// this test claims to exercise -- a uniform VALUE genuinely changing every
// frame -- not just infer it from the advance loop running.
describe('AuroraVisualizer: does not defeat ShaderCanvas\'s recompile guard', () => {
  const { advance, isFramePending } = installFakeClock();

  it('compiles exactly once while intensity/complexity/amplitude/scale tween through several frames at listening (a forever-pulsing state)', async () => {
    const gl = fakeGL();
    const calls: string[] = [];
    const originalCreateProgram = gl.createProgram.bind(gl);
    gl.createProgram = () => { calls.push('createProgram'); return originalCreateProgram(); };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      type === 'webgl' || type === 'experimental-webgl' ? gl : null) as never);

    const { default: AuroraVisualizer } = await import('./variant-aurora');
    render(() => (
      <AuroraVisualizer {...baseProps} state="listening" frozen={false} onUnavailable={() => {}} />
    ));
    expect(calls).toHaveLength(1);

    // listening's intensity pulse ping-pongs forever, so this keeps a frame
    // pending indefinitely -- the loop bound is just a safety net.
    for (let i = 0; i < 10 && isFramePending(); i++) advance(50);

    // The precondition: uIntensity's pushed value genuinely varied across
    // the loop, proof the pulse tween's OWN requestAnimationFrame loop
    // actually ran concurrently with ShaderCanvas's draw loop, not just
    // that ten advance() calls happened.
    const intensityHistory = gl.uniformHistory.uIntensity ?? [];
    expect(intensityHistory.length).toBeGreaterThan(1);
    expect(new Set(intensityHistory).size).toBeGreaterThan(1);

    expect(calls).toHaveLength(1);
  });
});
