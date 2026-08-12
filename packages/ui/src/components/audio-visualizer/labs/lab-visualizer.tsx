import { createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { ShaderCanvas, hexToRgb, type UniformSpec } from '../shader-canvas';
import { LAB_FRAGMENTS, type LabLook } from './lab-shaders';
import { createChoreography, LOOK_DEFAULTS, type LabParams, type LabState } from './lab-choreography';

export interface LabVisualizerProps {
  look: LabLook;
  state?: LabState;
  color?: string;
  /** Square canvas edge in px. */
  size?: number;
  /** Overrides on the look's tuned defaults. */
  params?: Partial<LabParams>;
}

/**
 * Runs one lab look through the same `ShaderCanvas` the shipped variants use,
 * with the playground's state choreography driving the uniforms per frame.
 * While `speaking`, a baked loudness loop stands in for a live voice.
 */
export function LabVisualizer(props: LabVisualizerProps): JSX.Element {
  const merged = (): LabParams => {
    const out: LabParams = { ...LOOK_DEFAULTS[props.look] };
    for (const [key, value] of Object.entries(props.params ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        (out as unknown as Record<string, number>)[key] = value;
      }
    }
    return out;
  };
  const chor = createChoreography(() => props.look, () => props.state ?? 'manual', merged);
  const [frame, setFrame] = createSignal(chor.step(0));

  onMount(() => {
    // Captured at SETUP and closed over, never re-resolved as a global inside
    // `onCleanup`: cleanup can run after the host removed the DOM globals (a
    // `kai-*` release is deferred one microtask past detachment, so an
    // environment teardown gets in between), and a bare `cancelAnimationFrame`
    // there throws -- from a promise nobody holds, so it lands as an unhandled
    // rejection that fails the run while every test passes.
    // See tests/components/teardown-without-dom-globals.test.tsx.
    //
    // The FUNCTION, not the view. The `const win = window` capture that fixes a
    // bare `document` does nothing here: `window === globalThis` -- measured, in
    // jsdom and in real Chromium/WebKit alike -- and the teardown deletes these
    // keys off that very object, so `win.cancelAnimationFrame` is undefined by
    // the time cleanup runs. It only trades the ReferenceError for a TypeError.
    // `.bind` pins the receiver the WebIDL operation is specified on; Chromium
    // and WebKit both accept a detached call (measured), so the bind is belt and
    // braces against an engine that does not, at zero cost.
    const cancelFrame = cancelAnimationFrame.bind(globalThis);

    let raf = 0;
    let last = performance.now();
    const loop = (): void => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      setFrame(chor.step(dt));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    onCleanup(() => cancelFrame(raf));
  });

  const uniforms = (): Record<string, UniformSpec> => {
    const f = frame();
    const v = f.values;
    const one = (value: number): UniformSpec => ({ type: '1f', value });
    return {
      uColor: { type: '3fv', value: hexToRgb(props.color ?? '#1fd5f9') },
      uT: one(f.t),
      uLvl: one(f.level),
      uBaseR: one(v.baseR), uAmpIdle: one(v.ampIdle), uAmpVoice: one(v.ampVoice),
      uRadVoice: one(v.radVoice), uSigma: one(v.sigma), uGain: one(v.gain),
      uF1: one(v.f1), uF2: one(v.f2), uS1: one(v.s1), uS2: one(v.s2),
      uEnvSpd: one(v.envSpd), uSepSpd: one(v.sepSpd),
      uWhiteLo: one(v.whiteLo), uWhiteHi: one(v.whiteHi),
      uBloomMul: one(v.bloomMul), uBloomGain: one(v.bloomGain),
      uDelta: one(v.delta), uOff: one(v.off),
      uWWidth: one(v.wWidth), uWMin: one(v.wMin),
      uFillGain: one(v.fillGain), uEdgeGain: one(v.edgeGain), uFlut: one(v.flut),
      uTwistSpd: one(v.twistSpd), uWarpAmp: one(v.warpAmp),
      uLens: one(v.lens), uSpec: one(v.spec), uTint: one(v.tint),
      uPresence: one(v.presence), uGather: one(v.gather), uCore: one(v.core),
      uNeural: one(v.neural), uBoltJag: one(v.boltJag),
      uBoltWidth: one(v.boltWidth), uBoltRate: one(v.boltRate),
    };
  };

  const edge = (): string => `${props.size ?? 320}px`;

  return (
    <div style={{ width: edge(), height: edge() }}>
      <ShaderCanvas
        fragment={LAB_FRAGMENTS[props.look]}
        uniforms={uniforms()}
        onError={(message) => console.warn(`lab visualizer (${props.look}):`, message)}
      />
    </div>
  );
}
