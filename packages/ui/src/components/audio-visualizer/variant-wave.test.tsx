import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal, flush } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { waveTargets } from '../../primitives/visualizer-sequences';
import { installFakeClock } from '../../test-utils/fake-clock';
import type { ShaderVariantProps } from './index';
import type { VisualizerState } from '../../primitives/visualizer-sequences';

// jsdom has no WebGL at all, so the shader itself never compiles or draws in
// these tests -- see shader-canvas.test.tsx. What IS testable without a GPU:
// the state/volume/frozen -> uniform mapping WaveVisualizer computes before
// handing it to ShaderCanvas, and that a failure reaches `onUnavailable`.
// Everything about whether the line actually renders correctly on screen is
// a browser-only concern, called out in the task report.

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

describe('WaveVisualizer: onError reaches onUnavailable', () => {
  // Deliberately the REAL, unmocked ShaderCanvas here, the same way
  // shader-canvas.test.tsx's own "WebGL unavailable" block relies on jsdom's
  // real (unmocked) `getContext('webgl')` returning null. Proving the wiring
  // against the real component, not a mock of it, is the point: a mock could
  // itself misrepresent the contract.
  it('calls onUnavailable, and still logs to the console, when the shader cannot get a WebGL context', async () => {
    const { default: WaveVisualizer } = await import('./variant-wave');
    const onUnavailable = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(() => <WaveVisualizer {...baseProps} onUnavailable={onUnavailable} />);

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('variant="wave"');
    expect(warn.mock.calls[0]?.[1]).toMatch(/webgl/i);
  });
});

describe('WaveVisualizer: state -> uniform mapping', () => {
  // Two tests below need animation frames to actually elapse. They used to get
  // them from jsdom's real requestAnimationFrame plus a fixed wall-clock
  // `setTimeout` wait, which made them flaky under full-suite load: jsdom's
  // frame timestamp runs a constant offset BEHIND `performance.now()` (they
  // share an origin only in a real browser), and that offset is however old
  // the worker process was when this file's jsdom window was built -- ~475ms
  // for a fresh worker, 900-1500ms for a file scheduled late into a reused
  // one. `createTween` measures elapsed time as `rafTimestamp -
  // performance.now()`, so it burns that entire offset going BACKWARDS before
  // any real progress starts, and a fixed 1500ms wait stops covering it once
  // the machine is busy. See create-tween.test.ts for the measured numbers.
  //
  // The fake clock drives requestAnimationFrame and performance.now() off one
  // shared fake `now`, so there is no offset and no wall-clock dependency.
  // The synchronous tests in this block are unaffected: nothing advances the
  // clock for them, exactly as no real frame had fired for them before.
  const { advance } = installFakeClock();

  type CapturedProps = {
    fragment: string;
    precision?: string;
    uniforms: Record<string, { type: string; value: number | number[] }>;
    animateWhenNotVisible?: boolean;
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

  async function renderWave(props: Partial<ShaderVariantProps> = {}) {
    const { default: WaveVisualizer } = await import('./variant-wave');
    render(() => <WaveVisualizer {...baseProps} {...props} />);
    return captured!;
  }

  it('passes the extracted wave.glsl source through untouched', async () => {
    const { default: waveShader } = await import('./wave.glsl');
    const c = await renderWave();
    expect(c.fragment).toBe(waveShader);
  });

  it('relays animateWhenNotVisible to the canvas, which owns the behaviour', async () => {
    expect((await renderWave({ animateWhenNotVisible: true })).animateWhenNotVisible).toBe(true);
  });

  it('reduced motion still wins over animateWhenNotVisible: a still wave, not a moving one', async () => {
    // The two settings answer different questions -- `frozen` decides what a
    // frame CONTAINS, `animateWhenNotVisible` only decides whether frames keep
    // being drawn while off screen -- so opting out of the visibility pause
    // must not smuggle motion back in for a reduced-motion user. uSpeed is the
    // uniform that actually moves this shader (it drives the GLSL phase
    // directly, not through a tween), so zero here IS the still image.
    const c = await renderWave({ state: 'listening', frozen: true, animateWhenNotVisible: true });
    expect(c.uniforms.uSpeed?.value).toBe(0);
    expect(c.animateWhenNotVisible).toBe(true);
  });

  // This test used to pin a FLAT idle (amplitude/frequency 0). Upstream's
  // idle falls through to their speaking arm and gently undulates; flat is
  // their 'disconnected'. See the wave section note in
  // visualizer-sequences.ts (Rob, 2026-08-09). uSpeed is pinned literally
  // (not via waveTargets('idle').speed) so the assertion cannot follow the
  // table by accident.
  it('gently undulates at idle: uSpeed 10 at full opacity', async () => {
    const c = await renderWave({ state: 'idle' });
    expect(c.uniforms.uSpeed?.value).toBe(10);
    expect(c.uniforms.uMix?.value).toBe(1);
  });

  it('frozen + idle: amplitude and frequency land on the gentle-wave targets while uSpeed zeroes -- a still wave, not a flat line', async () => {
    // The frozen check on uSpeed is state-independent, but every other
    // frozen test uses `listening`; this covers the idle path explicitly so
    // reduced motion provably freezes the new idle undulation too.
    const c = await renderWave({ state: 'idle', frozen: true });
    expect(c.uniforms.uAmplitude?.value).toBeCloseTo(0.025, 6);
    expect(c.uniforms.uFrequency?.value).toBe(10);
    expect(c.uniforms.uSpeed?.value).toBe(0);
    expect(c.uniforms.uMix?.value).toBe(1);
  });

  it('uses mediump precision at icon and sm, highp otherwise -- shaders are expensive on phones', async () => {
    expect((await renderWave({ size: 'icon' })).precision).toBe('mediump');
    cleanup();
    expect((await renderWave({ size: 'sm' })).precision).toBe('mediump');
    cleanup();
    expect((await renderWave({ size: 'md' })).precision).toBe('highp');
    cleanup();
    expect((await renderWave({ size: 'lg' })).precision).toBe('highp');
  });

  it('defaults lineWidth to 2 at icon and sm, 1 otherwise', async () => {
    expect((await renderWave({ size: 'icon' })).uniforms.uLineWidth?.value).toBe(2);
    cleanup();
    expect((await renderWave({ size: 'sm' })).uniforms.uLineWidth?.value).toBe(2);
    cleanup();
    expect((await renderWave({ size: 'md' })).uniforms.uLineWidth?.value).toBe(1);
    cleanup();
    expect((await renderWave({ size: 'xl' })).uniforms.uLineWidth?.value).toBe(1);
  });

  it('maps a caller colour through hexToRgb, and falls back to the default when none is given', async () => {
    const custom = await renderWave({ color: '#ff0000' });
    expect(custom.uniforms.uColor?.value).toEqual([1, 0, 0]);
    cleanup();
    const fallback = await renderWave({ color: undefined });
    // #1FD5F9 -- DEFAULT_SHADER_COLOR.
    expect(fallback.uniforms.uColor?.value).toEqual([
      0x1f / 255, 0xd5 / 255, 0xf9 / 255,
    ]);
  });

  it('overrides amplitude and frequency instantly from live volume while speaking, per the documented formulas', async () => {
    const quiet = await renderWave({ state: 'speaking', volume: 0 });
    expect(quiet.uniforms.uAmplitude?.value).toBeCloseTo(0.015 + 0.4 * 0, 6);
    expect(quiet.uniforms.uFrequency?.value).toBeCloseTo(20 + 60 * 0, 6);
    cleanup();

    const loud = await renderWave({ state: 'speaking', volume: 0.7 });
    expect(loud.uniforms.uAmplitude?.value).toBeCloseTo(0.015 + 0.4 * 0.7, 6);
    expect(loud.uniforms.uFrequency?.value).toBeCloseTo(20 + 60 * 0.7, 6);
  });

  it('disconnected is the flat line: zero amplitude and frequency landed frozen, base uSpeed 5 un-frozen', async () => {
    // Upstream's explicit flat state, first-class here since 2026-08-10
    // (Rob) -- the look idle had before it adopted the gentle wave.
    const frozen = await renderWave({ state: 'disconnected', frozen: true });
    expect(frozen.uniforms.uAmplitude?.value).toBe(0);
    expect(frozen.uniforms.uFrequency?.value).toBe(0);
    cleanup();
    const live = await renderWave({ state: 'disconnected' });
    expect(live.uniforms.uSpeed?.value).toBe(5);
    expect(live.uniforms.uMix?.value).toBe(1);
  });

  it('renders live volume while listening when listeningAmplitude is set (opt-in), per the speaking formulas', async () => {
    const c = await renderWave({ state: 'listening', volume: 0.7, listeningAmplitude: true });
    expect(c.uniforms.uAmplitude?.value).toBeCloseTo(0.015 + 0.4 * 0.7, 6);
    expect(c.uniforms.uFrequency?.value).toBeCloseTo(20 + 60 * 0.7, 6);
  });

  it('keeps listening on its own base targets without listeningAmplitude (LiveKit parity control)', async () => {
    const c = await renderWave({ state: 'listening', frozen: true, volume: 0.9 });
    expect(c.uniforms.uAmplitude?.value).toBeCloseTo(waveTargets('listening').amplitude, 6);
  });

  it('does not let live volume leak into a non-speaking state', async () => {
    // frozen lands idle's own targets instantly, so a missing
    // `state === 'speaking'` guard is unmistakable: amplitude would read
    // 0.015 + 0.4 * 0.9 = 0.375 instead of idle's 0.025, and frequency
    // 20 + 60 * 0.9 = 74 instead of 10. (Un-frozen, both tweens start at 0
    // regardless of target, which is what this test used to lean on when
    // idle's targets were flat.)
    const c = await renderWave({ state: 'idle', frozen: true, volume: 0.9 });
    expect(c.uniforms.uAmplitude?.value).toBeCloseTo(0.025, 6);
    expect(c.uniforms.uFrequency?.value).toBe(10);
  });

  it('frozen lands listening\'s amplitude and frequency on target immediately, skipping the tween', async () => {
    const c = await renderWave({ state: 'listening', frozen: true });
    const t = waveTargets('listening');
    expect(c.uniforms.uAmplitude?.value).toBeCloseTo(t.amplitude, 6);
    expect(c.uniforms.uFrequency?.value).toBe(t.frequency);
  });

  it('frozen zeroes uSpeed so the shader\'s own time-based phase animation stops, while amplitude and frequency keep shaping a static (not flat) wave', async () => {
    // uSpeed is read straight from waveTargets(state), not a tween, so
    // frozen's instant-landing transitions do nothing to it on their own --
    // it needs its own explicit frozen check. Without one, the line keeps
    // travelling at full rate for a user who asked the OS to reduce motion
    // (the defect this test guards against).
    const frozen = await renderWave({ state: 'listening', frozen: true });
    expect(frozen.uniforms.uSpeed?.value).toBe(0);

    cleanup();

    const notFrozen = await renderWave({ state: 'listening', frozen: false });
    expect(notFrozen.uniforms.uSpeed?.value).toBe(waveTargets('listening').speed);
    expect(notFrozen.uniforms.uSpeed?.value).not.toBe(0);

    // The still picture is a static WAVE, not a blank line: amplitude and
    // frequency (shape, not travel) still land on listening's non-zero
    // target while frozen.
    const t = waveTargets('listening');
    expect(frozen.uniforms.uAmplitude?.value).toBeCloseTo(t.amplitude, 6);
    expect(frozen.uniforms.uAmplitude?.value).not.toBe(0);
    expect(frozen.uniforms.uFrequency?.value).toBe(t.frequency);
    expect(frozen.uniforms.uFrequency?.value).not.toBe(0);
  });

  // Regression for a real browser bug the epic's end-to-end verification
  // caught: uFrequency read 0 in every state, forever -- an oscilloscope
  // that never oscillated -- while uAmplitude, built the very same way one
  // line above it, worked. The root cause was in createTween, not here: see
  // create-tween.test.ts's "does not depend on its own value merely by
  // being .to()'d" tests for the actual, RELIABLE regression guard (verified
  // by revert-and-rerun to fail against the pre-fix code and pass against
  // the fix). Calling `.to()` on amplitude and then frequency from inside
  // the SAME effect made that effect implicitly depend on amplitude's own
  // signal (an untracked `value()` read gone missing), so writes from
  // amplitude's own step() kept re-triggering the effect.
  //
  // This test asserts the state this component is SUPPOSED to reach after
  // animation frames elapse -- the coordinator's specific ask, and a gap the
  // earlier synchronous assertions in this file genuinely cannot see (they
  // check the props object at the instant of mount, before any
  // requestAnimationFrame has fired, which reads identically whether
  // frequency merely "hasn't started yet" or "can never start"). It drives
  // the shared `installFakeClock` stub, which holds a real per-registration
  // queue and so fires both the amplitude and the frequency tween on every
  // `advance()` -- the precondition this test needs. (It used to hold a
  // single pending callback, which is why this test originally reached for
  // real requestAnimationFrame instead; see that stub's own doc.)
  //
  // But be honest about what it proves: re-checked empirically after the
  // move to the stub (revert create-tween.ts's `untrack`, keep this test,
  // rerun) and this test still PASSES against the pre-fix code. Neither
  // driver reproduces the original browser race, for the same reason:
  // `advance()` SNAPSHOTS the pending callbacks before invoking any of them,
  // so a callback that synchronously cancels an already-queued sibling
  // cannot stop that sibling from running -- and jsdom, separately
  // confirmed, does not process a frame's callbacks as one atomic batch
  // either. The exact browser race (one callback's synchronous side effect
  // cancelling an already-queued sibling before it gets its turn) genuinely
  // cannot be reproduced in jsdom at all. This test is real coverage of the
  // CORRECT behavior and would catch a plain regression to the old code, but
  // the create-tween.test.ts tests are the ones that actually discriminate
  // the original defect -- and on the fake clock they now discriminate it
  // harder than they did on real requestAnimationFrame: both of them fail
  // against the pre-fix code, where previously only the first did.
  it('frequency actually reaches a non-zero value over animation frames while listening, not just amplitude', async () => {
    const c = await renderWave({ state: 'listening', frozen: false });

    // 300ms of frames against a 200ms tween: enough to land it, with no
    // wall-clock wait and no dependence on how busy the machine is.
    for (let i = 0; i < 30; i++) { advance(10); flush(); } // V2-FLUSH per frame

    const t = waveTargets('listening');
    expect(c.uniforms.uAmplitude?.value).toBeCloseTo(t.amplitude, 2);
    expect(c.uniforms.uFrequency?.value).toBeCloseTo(t.frequency, 0);
    expect(c.uniforms.uFrequency?.value).toBeGreaterThan(1);
  });

  it('frequency tracks 20 + 60 * volume while speaking with a non-zero volume, and keeps tracking it after animation frames elapse', async () => {
    const c = await renderWave({ state: 'speaking', volume: 0.6 });

    // The instant (duration: 0) live-volume write happens synchronously at
    // mount, so this much is already covered above without waiting -- but
    // asserting it again AFTER frames elapse proves the base-target effect's
    // non-instant tween (which also fires for `speaking`, see
    // variant-wave.tsx) never clobbers the live-volume value once the
    // requestAnimationFrame machinery actually starts running.
    expect(c.uniforms.uFrequency?.value).toBeCloseTo(20 + 60 * 0.6, 6);

    for (let i = 0; i < 30; i++) { advance(10); flush(); } // V2-FLUSH per frame

    expect(c.uniforms.uFrequency?.value).toBeCloseTo(20 + 60 * 0.6, 6);
    expect(c.uniforms.uAmplitude?.value).toBeCloseTo(0.015 + 0.4 * 0.6, 6);
  });

  it('frozen collapses an array (pulse) opacity target to its first value instead of ping-ponging', async () => {
    const t = waveTargets('listening');
    expect(Array.isArray(t.opacity)).toBe(true);
    const first = (t.opacity as [number, number])[0];

    const c = await renderWave({ state: 'listening', frozen: true });
    expect(c.uniforms.uMix?.value).toBe(first);
  });

  it('un-frozen leaves amplitude and frequency at their pre-tween initial values synchronously (the control case)', async () => {
    // The "frozen lands on target immediately" test above proves frozen
    // reaches waveTargets('listening')'s amplitude (~0.025) and frequency
    // (10) with no frame advanced. This is the control: without frozen, the
    // same state change goes through a real (0.2s) tween instead of an
    // instant `duration: 0` set, so nothing has moved yet at this same
    // synchronous point -- proving the two code paths actually differ,
    // rather than both coincidentally landing on the same value.
    const c = await renderWave({ state: 'listening', frozen: false });
    expect(c.uniforms.uAmplitude?.value).toBe(0);
    expect(c.uniforms.uFrequency?.value).toBe(0);
  });

  it('keeps the uniform SHAPE (names, types, sizes) identical across different states, so ShaderCanvas never recompiles on a value-only change', async () => {
    const shapeOf = (c: CapturedProps) =>
      Object.entries(c.uniforms)
        .map(([name, u]) => `${name}:${u.type}`)
        .sort()
        .join('|');

    const idle = await renderWave({ state: 'idle' });
    const idleShape = shapeOf(idle);
    cleanup();

    const speaking = await renderWave({ state: 'speaking', volume: 0.5 });
    expect(shapeOf(speaking)).toBe(idleShape);
    cleanup();

    const frozenListening = await renderWave({ state: 'listening', frozen: true });
    expect(shapeOf(frozenListening)).toBe(idleShape);
  });
});

// Regression for the speaking re-entry stall the wave parity audit measured
// on the harness: after listening -> speaking with a PINNED volume (static
// bands/volume-override drive, upstream's #1399-style prop mode -- the
// volume signal never ticks again), the line landed at the 0.025 base
// amplitude instead of 0.015 + 0.4v and stayed there until the next volume
// change. Root cause: amplitude/frequency had TWO writers in TWO effects
// sharing the `state` dependency -- the state effect tweening toward the
// base over 0.2s, the volume effect applying the override instantly -- and
// Solid re-runs sibling effects in the order they sit in the signal's
// observer list, which REORDERS as effects re-subscribe over their
// lifetimes. Whichever re-subscribed last ran last and won. Reproduced on
// the harness 2/2 with a loaded main thread during the transition, 0/7
// calm -- history-dependent, so this test FORCES the adverse history
// deterministically instead of relying on load: flipping `frozen` re-runs
// ONLY the state-target effect (the volume effect does not read frozen),
// which re-subscribes it to `state` AFTER the volume effect -- exactly the
// ordering the race resolves to when it bites. Verified RED against the
// pre-fix two-effect code with that history, GREEN after the single-writer
// merge.
describe('WaveVisualizer: speaking re-entry override survives adverse effect ordering (static drive)', () => {
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

  it('lands amplitude and frequency on the volume override after listening -> speaking with a pinned volume, regardless of effect re-subscription order', async () => {
    const { default: WaveVisualizer } = await import('./variant-wave');
    const [state, setState] = createSignal<VisualizerState>('listening');
    const [frozen, setFrozen] = createSignal(false);

    render(() => (
      <WaveVisualizer
        {...baseProps}
        state={state()}
        frozen={frozen()}
        volume={0.8}
        onUnavailable={() => {}}
      />
    ));

    // The adverse subscription history (see the describe comment): re-run
    // only the state-target effect so it re-subscribes to `state` after the
    // volume-override effect.
    setFrozen(true);
    flush(); // V2-FLUSH: commit the staged write
    setFrozen(false);
    flush(); // V2-FLUSH: commit the staged write

    // The static-drive re-entry itself. Volume is pinned at 0.8 and never
    // ticks again -- nothing self-heals this if the base tween wins.
    setState('speaking');
    flush(); // V2-FLUSH: commit the staged write

    // Run any 0.2s base tween to completion; if it stole amplitude, it has
    // fully landed on 0.025 by now.
    for (let i = 0; i < 10; i++) { advance(50); flush(); } // V2-FLUSH per frame

    expect(captured!.uniforms.uAmplitude?.value).toBeCloseTo(0.015 + 0.4 * 0.8, 6);
    expect(captured!.uniforms.uFrequency?.value).toBeCloseTo(20 + 60 * 0.8, 6);
  });
});

// The value-based frozen assertions above prove WHERE amplitude/frequency
// land; this proves HOW they got there, which is the part a regression could
// silently break (e.g. collapsing the opacity array to a scalar but forgetting
// to also pass `{ duration: 0 }`, which would still read correct at the
// instant of mount yet leave a stray animation ticking). `isFramePending`
// reports whether ANYTHING is pending, not which of the three tweens it is,
// but "none at all" vs "at least one" is exactly what these need. The real
// (unmocked) ShaderCanvas is fine here: jsdom's `getContext('webgl')` returns
// null before it ever reaches its own `requestAnimationFrame` call, so it
// contributes zero frame registrations either way.
describe('WaveVisualizer: frozen never arms a tween animation frame', () => {
  const { isFramePending } = installFakeClock();

  afterEach(() => vi.restoreAllMocks());

  it('frozen: none of amplitude, frequency, or opacity ever schedule a frame', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { default: WaveVisualizer } = await import('./variant-wave');
    render(() => (
      <WaveVisualizer {...baseProps} state="listening" frozen={true} onUnavailable={() => {}} />
    ));
    expect(isFramePending()).toBe(false);
  });

  it('un-frozen: at least one of them does (the control case)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { default: WaveVisualizer } = await import('./variant-wave');
    render(() => (
      <WaveVisualizer {...baseProps} state="listening" frozen={false} onUnavailable={() => {}} />
    ));
    expect(isFramePending()).toBe(true);
  });
});

// The uniform-mapping tests above prove the SHAPE stays constant across
// props by inspecting the object WaveVisualizer builds. This proves the
// consequence that actually matters -- through the REAL ShaderCanvas, with a
// stand-in WebGL context standing in only for the GPU calls jsdom cannot
// make -- that a value-only change across several animation frames genuinely
// does not trigger a second `createProgram` call. This is the exact defect
// class Task 11 fixed inside ShaderCanvas itself; this test is the guard
// against reintroducing it from THIS component's side, e.g. by reading a
// tween's value somewhere that ends up widening what ShaderCanvas tracks.
describe('WaveVisualizer: does not defeat ShaderCanvas\'s recompile guard', () => {
  const { advance, isFramePending } = installFakeClock();

  afterEach(() => vi.restoreAllMocks());

  // `uniformHistory` (added, not part of the real WebGL API) records every
  // `1f` value ever pushed to a given uniform NAME, in push order -- only
  // what the test below needs to PROVE a value-bearing uniform (`uMix`, the
  // opacity pulse) genuinely changed across the fake clock's advance loop,
  // not just infer it from the absence of a second `createProgram` call.
  function stubFakeGL() {
    const calls: string[] = [];
    const locations = new Map<string, object>();
    const locationNames = new Map<object, string>();
    const uniformHistory: Record<string, number[]> = {};
    const gl = {
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
      ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, BLEND: 8, ONE: 9,
      ONE_MINUS_SRC_ALPHA: 10, TRIANGLE_STRIP: 11, COLOR_BUFFER_BIT: 12,
      createShader: () => ({}),
      shaderSource: () => {},
      compileShader: () => {},
      getShaderParameter: () => true,
      getShaderInfoLog: () => '',
      deleteShader: () => {},
      createProgram: () => { calls.push('createProgram'); return {}; },
      attachShader: () => {},
      linkProgram: () => {},
      getProgramParameter: () => true,
      getProgramInfoLog: () => '',
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
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      type === 'webgl' || type === 'experimental-webgl' ? gl : null) as never);
    return { calls, uniformHistory };
  }

  // `installFakeClock`'s stub used to hold a single pending callback, not a
  // queue: ShaderCanvas's own `draw` loop always re-registers itself last
  // (see its own `raf = requestAnimationFrame(draw)` at the end of every
  // call), so it permanently "won" the single slot and the amplitude/
  // frequency/opacity tweens -- separate requestAnimationFrame consumers --
  // never got to fire. That made `createProgram` staying at 1 trivially true
  // regardless of whether the recompile guard worked at all: nothing was
  // ever actually ticking. `uMix` (the opacity pulse, which ping-pongs
  // forever at `listening`) is captured below specifically to prove the
  // precondition this test claims to exercise -- a uniform VALUE genuinely
  // changing every frame -- not just infer it from the advance loop running.
  it('compiles exactly once while the amplitude/frequency/opacity tweens progress through several frames', async () => {
    const { calls, uniformHistory } = stubFakeGL();
    const { default: WaveVisualizer } = await import('./variant-wave');

    render(() => (
      <WaveVisualizer {...baseProps} state="listening" frozen={false} onUnavailable={() => {}} />
    ));
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);

    // `listening`'s opacity pulse ping-pongs forever, so this keeps a frame
    // pending indefinitely -- the loop bound is just a safety net, not a
    // reflection of the tween ever finishing.
    for (let i = 0; i < 10 && isFramePending(); i++) { advance(50); flush(); } // V2-FLUSH per frame

    // The precondition: uMix's pushed value genuinely varied across the
    // loop, proof the opacity tween's OWN requestAnimationFrame loop
    // actually ran concurrently with ShaderCanvas's draw loop, not just
    // that ten advance() calls happened.
    const mixHistory = uniformHistory.uMix ?? [];
    expect(mixHistory.length).toBeGreaterThan(1);
    expect(new Set(mixHistory).size).toBeGreaterThan(1);

    // The actual claim: even with that genuine per-frame churn, the GL
    // program was never recompiled a second time.
    expect(calls.filter((c) => c === 'createProgram')).toHaveLength(1);
  });
});
