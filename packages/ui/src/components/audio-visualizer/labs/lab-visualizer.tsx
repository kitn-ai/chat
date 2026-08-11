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
    onCleanup(() => cancelAnimationFrame(raf));
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
