import type { LabLook } from './lab-shaders';

/** The agent states the kit's visualizers respond to, plus manual free play. */
export type LabState = 'manual' | 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export const LAB_STATES: LabState[] = ['manual', 'idle', 'connecting', 'listening', 'thinking', 'speaking'];

/** Every tunable the lab shaders read. Flat on purpose: story args map 1:1. */
export interface LabParams {
  baseR: number; ampIdle: number; ampVoice: number; radVoice: number;
  sigma: number; gain: number; f1: number; f2: number; s1: number; s2: number;
  envSpd: number; sepSpd: number; whiteLo: number; whiteHi: number;
  bloomMul: number; bloomGain: number; delta: number; off: number;
  wWidth: number; wMin: number; fillGain: number; edgeGain: number;
  flut: number; twistSpd: number; warpAmp: number; lens: number; spec: number;
  tint: number; vSpeed: number; presence: number; gather: number;
  core: number; neural: number; boltJag: number; boltWidth: number; boltRate: number;
}

const SHARED: LabParams = {
  baseR: 0.33, ampIdle: 0.017, ampVoice: 0.043, radVoice: 0.24,
  sigma: 0.022, gain: 0.42, f1: 6, f2: 10, s1: 0.55, s2: 0.85,
  envSpd: 0.21, sepSpd: 0.38, whiteLo: 1.35, whiteHi: 2.3,
  bloomMul: 2.6, bloomGain: 0.18, delta: 0.35, off: 0.024,
  wWidth: 0.045, wMin: 0.006, fillGain: 0.38, edgeGain: 0.7,
  flut: 0.01, twistSpd: 0.55, warpAmp: 0.75, lens: 0.85, spec: 0.35,
  tint: 0.25, vSpeed: 2.2, presence: 1, gather: 0,
  core: 0, neural: 0, boltJag: 0.5, boltWidth: 3, boltRate: 0.25,
};

/** Hand-tuned in the aurora playground; per-look starting points. */
export const LOOK_DEFAULTS: Record<LabLook, LabParams> = {
  braid: { ...SHARED },
  ribbon: {
    ...SHARED,
    baseR: 0.315, ampIdle: 0.012, ampVoice: 0.032, radVoice: 0.09,
    sigma: 0.014, gain: 0.6, f1: 3, f2: 9, s1: 1.1, s2: 2.2,
    envSpd: 0.5, whiteLo: 1.0, whiteHi: 2.4, bloomMul: 2.5, bloomGain: 0.15,
    wWidth: 0.085, wMin: 0.009, fillGain: 0.85, edgeGain: 0.35, twistSpd: 1.9,
  },
  planet: {
    ...SHARED,
    radVoice: 0, gain: 1.0, fillGain: 0.75, edgeGain: 0.5,
    f2: 12, s1: 1, s2: 1, twistSpd: 1.0, warpAmp: 0.9,
    whiteLo: 1.2, whiteHi: 2.6,
  },
  orb: {
    ...SHARED,
    radVoice: 0, gain: 1.1, fillGain: 0.65, edgeGain: 0.45,
    f2: 10, s1: 1, s2: 1, twistSpd: 1.2, warpAmp: 1.0,
    lens: 0.8, spec: 0.3, vSpeed: 3.0,
  },
};

const ORB_LOOKS: LabLook[] = ['planet', 'orb'];

/** Loudness loop standing in for a live voice while `speaking` (dB per third-second). */
const ENV_DB = [-60.9, -49.0, -46.7, -54.1, -50.0, -47.8, -49.3, -53.3, -53.5, -50.4,
  -46.9, -53.0, -50.2, -52.5, -53.9, -50.6, -50.8, -49.2, -55.1, -48.7,
  -48.4, -47.4, -49.6, -50.7, -49.0, -46.9, -50.8, -52.9, -52.2, -46.6,
  -46.6, -46.2];

function envelopeAt(sec: number): number {
  const x = (sec % 10.6) * 3;
  const i = Math.max(0, Math.min(ENV_DB.length - 1, Math.floor(x)));
  const j = Math.min(ENV_DB.length - 1, i + 1);
  const f = x - i;
  const db = ENV_DB[i] * (1 - f) + ENV_DB[j] * f;
  return Math.max(0, Math.min(1, (db + 58) / 14));
}

interface Slow {
  presence: number; gather: number; tintAdd: number; warpMul: number;
  deltaAdd: number; f2Add: number; gainMul: number; neural: number;
}

export interface LabFrame {
  t: number;
  level: number;
  values: LabParams;
}

/**
 * The state choreography from the playground, per frame. Slow targets glide
 * over seconds (presence slowest, so smoke visibly forms and dissipates);
 * tempo runs on an accumulated warped clock, so state changes never jump the
 * animation phase; the ember beats and the bolts fire in real time.
 */
export function createChoreography(getLook: () => LabLook, getState: () => LabState, getParams: () => LabParams) {
  let tAnim = 0;
  let rateSm = 1;
  let smooth = 0;
  let elapsed = 0;
  const slow: Slow = { presence: 1, gather: 0, tintAdd: 0, warpMul: 1, deltaAdd: 0, f2Add: 0, gainMul: 1, neural: 0 };

  const step = (dt: number): LabFrame => {
    elapsed += dt;
    const P = getParams();
    const state = getState();
    const orb = ORB_LOOKS.includes(getLook());
    const base = orb ? 0.35 : 1.0;

    const drive = envelopeAt(elapsed);
    const k = drive > smooth ? 0.25 : 0.06;
    smooth += (drive - smooth) * k;

    const beat = Math.pow(0.5 + 0.5 * Math.sin((elapsed / 1.2) * Math.PI * 2), 3.0);
    const flick = 0.5 + 0.5 * Math.sin((elapsed / 0.35) * Math.PI * 2);

    let target: Slow;
    let rate: number;
    let level: number;
    let core: number;
    let gpulse = 0;
    switch (state) {
      case 'idle':
        target = orb
          ? { presence: 0.12, gather: -0.8, tintAdd: 0, warpMul: 1, deltaAdd: 0, f2Add: 0, gainMul: 0.85, neural: 0 }
          : { presence: P.presence, gather: P.gather, tintAdd: 0, warpMul: 1, deltaAdd: 0, f2Add: 0, gainMul: 0.8, neural: 0 };
        rate = base; level = 0; core = orb ? 0.06 : 0;
        break;
      case 'connecting':
        target = orb
          ? { presence: 0.22, gather: -0.25, tintAdd: 0, warpMul: 1, deltaAdd: 0, f2Add: 0, gainMul: 0.9, neural: 0 }
          : { presence: P.presence, gather: P.gather, tintAdd: 0, warpMul: 1, deltaAdd: 0, f2Add: 0, gainMul: 0.85, neural: 0 };
        rate = base * 1.4; level = 0.04; core = orb ? 0.18 + 0.55 * beat : 0;
        if (!orb) gpulse = 0.2 * beat;
        break;
      case 'listening':
        target = orb
          ? { presence: 0.8, gather: 0.5, tintAdd: 0.05, warpMul: 1, deltaAdd: 0, f2Add: 0, gainMul: 1, neural: 0 }
          : { presence: P.presence, gather: P.gather, tintAdd: 0, warpMul: 1, deltaAdd: 0, f2Add: 0, gainMul: 1, neural: 0 };
        rate = base * 1.7; level = 0.2; core = orb ? 0.12 : 0;
        break;
      case 'thinking':
        target = orb
          ? { presence: 1, gather: 0.6, tintAdd: 0.5, warpMul: 1.3, deltaAdd: 0, f2Add: 0, gainMul: 1, neural: 1 }
          : { presence: P.presence, gather: P.gather, tintAdd: 0, warpMul: 1, deltaAdd: 0.5, f2Add: 3, gainMul: 1, neural: 0 };
        rate = orb ? 2.2 : 2.5; level = 0.12 + 0.2 * flick; core = orb ? 0.05 : 0;
        if (!orb) gpulse = 0.1 * flick;
        break;
      case 'speaking':
        target = orb
          ? { presence: 1, gather: 0, tintAdd: 0, warpMul: 1.25, deltaAdd: 0, f2Add: 0, gainMul: 1.05, neural: 0 }
          : { presence: P.presence, gather: P.gather, tintAdd: 0, warpMul: 1, deltaAdd: 0, f2Add: 0, gainMul: 1, neural: 0 };
        rate = base * 1.5 + 5.5 * smooth; level = Math.min(1, smooth * 1.35);
        core = orb ? 0.08 + 0.6 * smooth : 0;
        break;
      default:
        target = { presence: P.presence, gather: P.gather, tintAdd: 0, warpMul: 1, deltaAdd: 0, f2Add: 0, gainMul: 1, neural: P.neural };
        rate = base + P.vSpeed * smooth; level = smooth; core = P.core;
    }

    const mixTo = (cur: number, tgt: number, tc: number): number =>
      cur + (tgt - cur) * (1 - Math.exp(-dt / tc));
    slow.presence = mixTo(slow.presence, target.presence, 1.4);
    slow.gather = mixTo(slow.gather, target.gather, 1.0);
    slow.tintAdd = mixTo(slow.tintAdd, target.tintAdd, 0.6);
    slow.warpMul = mixTo(slow.warpMul, target.warpMul, 0.6);
    slow.deltaAdd = mixTo(slow.deltaAdd, target.deltaAdd, 0.6);
    slow.f2Add = mixTo(slow.f2Add, target.f2Add, 0.6);
    slow.gainMul = mixTo(slow.gainMul, target.gainMul, 0.6);
    slow.neural = mixTo(slow.neural, target.neural, 0.6);

    rateSm += (rate - rateSm) * (1 - Math.exp(-dt / 0.4));
    tAnim += dt * rateSm;

    return {
      t: tAnim,
      level,
      values: {
        ...P,
        presence: slow.presence,
        gather: slow.gather,
        core,
        neural: slow.neural,
        tint: Math.min(1, P.tint + slow.tintAdd),
        warpAmp: P.warpAmp * slow.warpMul,
        delta: P.delta + slow.deltaAdd,
        f2: P.f2 + slow.f2Add,
        gain: P.gain * slow.gainMul * (1 + gpulse),
      },
    };
  };

  return { step };
}
