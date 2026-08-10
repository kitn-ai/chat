import './style.css';
import { VS, FS } from './shaders';

type Vec3 = [number, number, number];

interface Params {
  color: Vec3;
  mode: number;
  baseR: number; ampIdle: number; ampVoice: number; radVoice: number;
  sigma: number; gain: number; f1: number; f2: number; s1: number; s2: number;
  envSpd: number; sepSpd: number; whiteLo: number; whiteHi: number;
  bloomMul: number; bloomGain: number; delta: number; off: number;
  wWidth: number; wMin: number; fillGain: number; edgeGain: number;
  flut: number; twistSpd: number; warpAmp: number; theme: number;
  lens: number; spec: number; tint: number; vSpeed: number;
  presence: number; gather: number; core: number; neural: number;
  boltJag: number; boltWidth: number; boltRate: number;
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
// Render at native device pixels so Retina displays stay crisp. ?size=N scales
// the on-screen size. ?still renders one frame with no panel (for automation).
const QUERY = new URLSearchParams(location.search);
const PLAY = !QUERY.has('still');
{
  const CSS_W = 268, CSS_H = 286;
  const scale = parseFloat(QUERY.get('size') || (PLAY ? '2' : '1')) || 1;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = CSS_W * scale + 'px';
  canvas.style.height = CSS_H * scale + 'px';
  canvas.width = Math.round(CSS_W * scale * dpr);
  canvas.height = Math.round(CSS_H * scale * dpr);
}
const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
if (!gl) throw new Error('WebGL unavailable');

function compile(type: number, src: string): WebGLShader {
  const s = gl!.createShader(type)!;
  gl!.shaderSource(s, src);
  gl!.compileShader(s);
  if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) || 'shader compile failed');
  return s;
}
const prog = gl.createProgram()!;
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog, 'aPos');
gl.enableVertexAttribArray(loc);
gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

gl.enable(gl.BLEND);
gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
gl.clearColor(0, 0, 0, 0);

const UNIFORM_NAMES = ['uRes','uTime','uLevel','uColor','uMode','uBaseR','uAmpIdle','uAmpVoice',
  'uRadVoice','uSigma','uGain','uF1','uF2','uS1','uS2','uEnvSpd','uSepSpd','uWhiteLo','uWhiteHi',
  'uBloomMul','uBloomGain','uDelta','uOff','uWWidth','uWMin','uFillGain','uEdgeGain','uFlut','uTwistSpd',
  'uWarpAmp','uTheme','uLens','uSpec','uTint','uPresence','uGather','uCore','uNeural','uBoltJag','uBoltWidth','uBoltRate'] as const;
const U: Record<string, WebGLUniformLocation | null> = {};
for (const name of UNIFORM_NAMES) U[name] = gl.getUniformLocation(prog, name);

// ---- presets ----
const BASE: Omit<Params, 'color'> = {
  mode: 1,
  baseR: 0.33, ampIdle: 0.017, ampVoice: 0.043, radVoice: 0.24,
  sigma: 0.022, gain: 0.42, f1: 6, f2: 10, s1: 0.55, s2: 0.85,
  envSpd: 0.21, sepSpd: 0.38, whiteLo: 1.35, whiteHi: 2.30,
  bloomMul: 2.6, bloomGain: 0.18, delta: 0.35, off: 0.024,
  wWidth: 0.045, wMin: 0.006, fillGain: 0.38, edgeGain: 0.7, flut: 0.010, twistSpd: 0.55,
  warpAmp: 0.75, theme: 0, lens: 0.85, spec: 0.35, tint: 0.25, vSpeed: 2.2,
  presence: 1, gather: 0, core: 0, neural: 0,
  // bolt feel hand-tuned by Rob 2026-08-10: soft, wide, deliberate
  boltJag: 0.5, boltWidth: 3, boltRate: 0.25,
};
export const PRESET_SOFT = { ...BASE };
export const PRESET_BOLD = { ...BASE, sigma: 0.026, gain: 0.48, s1: 1.15, s2: 1.8, envSpd: 0.5, sepSpd: 0.85, bloomMul: 2.2, bloomGain: 0.14 };
// Rob's hand-tuned braid, 2026-08-07
export const PRESET_ROB = { ...BASE,
  baseR: 0.315, ampIdle: 0.017, ampVoice: 0.063, radVoice: 0.09,
  sigma: 0.028, gain: 0.48, f1: 6, f2: 11, s1: 1.95, s2: 2.35,
  envSpd: 1.45, sepSpd: 1.25, whiteLo: 0.5, whiteHi: 2.3,
  bloomMul: 4.3, bloomGain: 0.25, delta: 0.96, off: 0.02,
};
// single ribbon with wind through it; speeds + width measured off the live demo
export const PRESET_WIND = { ...BASE, mode: 2,
  baseR: 0.315, ampIdle: 0.012, ampVoice: 0.032, radVoice: 0.09,
  sigma: 0.014, gain: 0.60, f1: 3, f2: 9, s1: 1.1, s2: 2.2,
  envSpd: 0.5, whiteLo: 1.0, whiteHi: 2.4, bloomMul: 2.5, bloomGain: 0.15,
  wWidth: 0.085, wMin: 0.009, fillGain: 0.85, edgeGain: 0.35, flut: 0.010, twistSpd: 1.9,
};
// veil: the fact-sheet reconstruction, "connecting" state defaults
export const PRESET_VEIL = { ...BASE, mode: 3,
  baseR: 0.3, radVoice: 0.1, gain: 1.5, f2: 15, twistSpd: 1.5, warpAmp: 0.5,
};
// veil in the speaking state: faster phase rate, finer warp, voice-driven radius
export const PRESET_VEIL_TALK = { ...BASE, mode: 3,
  baseR: 0.2, radVoice: 0.2, gain: 1.5, f2: 18.25, twistSpd: 3.5, warpAmp: 0.75,
};
// stormy planet: the dense churning-surface look (a keeper in its own right)
export const PRESET_STORMY = { ...BASE, mode: 4,
  baseR: 0.33, radVoice: 0, gain: 1.0, fillGain: 0.75, edgeGain: 0.5,
  f2: 12, s1: 1.0, s2: 1.0, twistSpd: 1.0, warpAmp: 0.9,
  whiteLo: 1.2, whiteHi: 2.6, lens: 0.85, spec: 0.35,
};
// crystal orb: wispy luminous smoke sealed in a stationary glass sphere
export const PRESET_SMOKE = { ...BASE, mode: 5,
  baseR: 0.33, radVoice: 0, gain: 1.1, fillGain: 0.65, edgeGain: 0.45,
  f2: 10, s1: 1.0, s2: 1.0, twistSpd: 1.2, warpAmp: 1.0,
  lens: 0.8, spec: 0.3, tint: 0.25, vSpeed: 3.0,
};

const P: Params = { color: [0x1f / 255, 0xd5 / 255, 0xf9 / 255], ...PRESET_VEIL };
// numeric view of P for the slider panel's dynamic key access
const PN = P as unknown as Record<string, number>;

function setParams(obj: Partial<Params>): void {
  Object.assign(P, obj);
  syncUI();
}

function renderAt(t: number, level: number, ov?: Partial<Params>): void {
  const g = gl!;
  const Q = ov ? ({ ...P, ...ov } as Params) : P;
  g.viewport(0, 0, canvas.width, canvas.height);
  g.clear(g.COLOR_BUFFER_BIT);
  g.uniform2f(U.uRes, canvas.width, canvas.height);
  g.uniform1f(U.uTime, t);
  g.uniform1f(U.uLevel, level);
  g.uniform3f(U.uColor, Q.color[0], Q.color[1], Q.color[2]);
  g.uniform1f(U.uMode, Q.mode);
  g.uniform1f(U.uBaseR, Q.baseR);
  g.uniform1f(U.uAmpIdle, Q.ampIdle);
  g.uniform1f(U.uAmpVoice, Q.ampVoice);
  g.uniform1f(U.uRadVoice, Q.radVoice);
  g.uniform1f(U.uSigma, Q.sigma);
  g.uniform1f(U.uGain, Q.gain);
  g.uniform1f(U.uF1, Q.f1);
  g.uniform1f(U.uF2, Q.f2);
  g.uniform1f(U.uS1, Q.s1);
  g.uniform1f(U.uS2, Q.s2);
  g.uniform1f(U.uEnvSpd, Q.envSpd);
  g.uniform1f(U.uSepSpd, Q.sepSpd);
  g.uniform1f(U.uWhiteLo, Q.whiteLo);
  g.uniform1f(U.uWhiteHi, Q.whiteHi);
  g.uniform1f(U.uBloomMul, Q.bloomMul);
  g.uniform1f(U.uBloomGain, Q.bloomGain);
  g.uniform1f(U.uDelta, Q.delta);
  g.uniform1f(U.uOff, Q.off);
  g.uniform1f(U.uWWidth, Q.wWidth);
  g.uniform1f(U.uWMin, Q.wMin);
  g.uniform1f(U.uFillGain, Q.fillGain);
  g.uniform1f(U.uEdgeGain, Q.edgeGain);
  g.uniform1f(U.uFlut, Q.flut);
  g.uniform1f(U.uTwistSpd, Q.twistSpd);
  g.uniform1f(U.uWarpAmp, Q.warpAmp);
  g.uniform1f(U.uTheme, Q.theme);
  g.uniform1f(U.uLens, Q.lens);
  g.uniform1f(U.uSpec, Q.spec);
  g.uniform1f(U.uTint, Q.tint);
  g.uniform1f(U.uPresence, Q.presence);
  g.uniform1f(U.uGather, Q.gather);
  g.uniform1f(U.uCore, Q.core);
  g.uniform1f(U.uNeural, Q.neural);
  g.uniform1f(U.uBoltJag, Q.boltJag);
  g.uniform1f(U.uBoltWidth, Q.boltWidth);
  g.uniform1f(U.uBoltRate, Q.boltRate);
  g.drawArrays(g.TRIANGLES, 0, 3);
  g.finish();
}

// RMS envelope measured from the original reference recording (dB per 1/3s)
const ENV_DB = [-60.9,-49.0,-46.7,-54.1,-50.0,-47.8,-49.3,-53.3,-53.5,-50.4,
                -46.9,-53.0,-50.2,-52.5,-53.9,-50.6,-50.8,-49.2,-55.1,-48.7,
                -48.4,-47.4,-49.6,-50.7,-49.0,-46.9,-50.8,-52.9,-52.2,-46.6,
                -46.6,-46.2];
function levelAt(sec: number): number {
  const x = sec * 3;
  const i = Math.max(0, Math.min(ENV_DB.length - 1, Math.floor(x)));
  const j = Math.min(ENV_DB.length - 1, i + 1);
  const f = x - i;
  const db = ENV_DB[i] * (1 - f) + ENV_DB[j] * f;
  return Math.max(0, Math.min(1, (db + 58) / 14));
}

// ---- control panel ----
type SliderRow = [string] | [string, string, number, number, number];
const SLIDERS: SliderRow[] = [
  ['motion speed'],
  ['twistSpd', 'main speed',   0.0, 8.0, 0.05],
  ['vSpeed',   'voice speed',  0.0, 4.0, 0.05],
  ['shape (all modes)'],
  ['baseR',    'ring size',    0.02, 0.50, 0.005],
  ['sigma',    'stroke width', 0.006, 0.060, 0.001],
  ['gain',     'brightness',   0.10, 2.50, 0.01],
  ['radVoice', 'voice growth', 0.00, 0.40, 0.005],
  ['fillGain', 'fill amount',  0.0, 1.0, 0.01],
  ['ampIdle',  'idle wobble',  0.00, 0.05, 0.001],
  ['ampVoice', 'voice wobble', 0.00, 0.12, 0.001],
  ['f1',       'wave freq A',  2, 10, 1],
  ['f2',       'wave freq B',  4, 20, 0.25],
  ['s1',       'wave spd A',   0.0, 3.0, 0.05],
  ['s2',       'wave spd B',   0.0, 3.0, 0.05],
  ['envSpd',   'heavy-side spd', 0.0, 2.0, 0.05],
  ['ribbon wind (mode 2)'],
  ['wWidth',   'fold width',   0.010, 0.090, 0.001],
  ['wMin',     'pinch width',  0.001, 0.020, 0.001],
  ['orb (modes 4 + 5)'],
  ['presence', 'presence',     0.0, 1.0, 0.01],
  ['neural',   'neurons',      0.0, 1.0, 0.01],
  ['boltJag',  'bolt jag',     0.0, 2.5, 0.05],
  ['boltWidth','bolt width',   0.3, 4.0, 0.05],
  ['boltRate', 'bolt rate',    0.1, 2.0, 0.05],
  ['gather',   'gather',       -1.0, 1.0, 0.02],
  ['lens',     'lens amount',  0.0, 1.0, 0.01],
  ['spec',     'highlight',    0.0, 1.0, 0.01],
  ['tint',     'smoke tint',   0.0, 1.0, 0.01],
  ['veil (mode 3)'],
  ['warpAmp',  'warp amp',     0.0, 2.0, 0.05],
  ['edgeGain', 'edge strength',0.0, 1.5, 0.01],
  ['flut',     'wind flutter', 0.0, 0.03, 0.001],
  ['braid (mode 1)'],
  ['delta',    'strand twist', 0.00, 1.50, 0.01],
  ['off',      'strand gap',   0.00, 0.06, 0.001],
  ['sepSpd',   'fold spd',     0.0, 2.0, 0.05],
  ['glow'],
  ['whiteLo',  'white start',  0.5, 2.5, 0.05],
  ['whiteHi',  'white end',    1.0, 3.5, 0.05],
  ['bloomMul', 'halo width',   1.5, 5.0, 0.1],
  ['bloomGain','halo strength',0.00, 0.60, 0.01],
];
const inputs: Record<string, HTMLInputElement> = {};

function buildPanel(): void {
  const panel = document.getElementById('panel')!;
  panel.classList.add('on');
  let html = '<h3>mode</h3><div id="modes">'
    + '<button data-mode="3">veil (LK spec)</button>'
    + '<button data-mode="5">smoke orb</button>'
    + '<button data-mode="4">stormy planet</button>'
    + '<button data-mode="2">single ribbon (wind)</button>'
    + '<button data-mode="1">3-strand braid</button></div>'
    + '<h3>state</h3><div id="states">'
    + '<button data-state="manual" class="active">manual</button>'
    + '<button data-state="idle">idle</button>'
    + '<button data-state="connecting">connecting</button>'
    + '<button data-state="listening">listening</button>'
    + '<button data-state="thinking">thinking</button>'
    + '<button data-state="speaking">speaking</button></div>'
    + '<h3>drive</h3><div id="drive">'
    + '<button data-src="env" class="active">envelope loop</button>'
    + '<button data-src="slider">slider</button>'
    + '<button data-src="mic">microphone</button></div>'
    + '<div class="row"><label>level</label><input id="lvl" type="range" min="0" max="1" step="0.01" value="0.5" disabled><output id="lvlOut">auto</output></div>'
    + '<div id="msg"></div>';
  for (const s of SLIDERS) {
    if (s.length === 1) { html += `<h3>${s[0]}</h3>`; continue; }
    const [key, label, min, max, step] = s;
    html += `<div class="row"><label>${label}</label>`
      + `<input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${PN[key]}">`
      + `<output id="out_${key}">${PN[key]}</output></div>`;
  }
  html += '<h3>color</h3>'
    + '<div class="row"><label>accent</label><input type="color" id="accent" value="#1fd5f9"><output></output></div>'
    + '<div class="row"><label>background</label><input type="color" id="bg" value="#050505"><output></output></div>'
    + '<div><button data-bg="#050505">dark</button><button data-bg="#808080">mid</button><button data-bg="#ffffff">white</button></div>'
    + '<h3>presets</h3>'
    + '<button id="pveil">veil (LK)</button>'
    + '<button id="pveilt">veil speaking</button>'
    + '<button id="psmoke">smoke orb</button>'
    + '<button id="porb">stormy planet</button>'
    + '<button id="pwind">wind</button>'
    + '<button id="prob">braid (Rob)</button>'
    + '<button id="pbold">braid bold</button>'
    + '<button id="psoft">braid soft</button>'
    + '<br><button id="copy">copy params</button>';
  panel.innerHTML = html;

  const hexToRgb01 = (hex: string): Vec3 =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Vec3;
  const setBg = (hex: string): void => {
    document.body.style.background = hex;
    document.getElementById('stage')!.style.background = hex;
    (document.getElementById('bg') as HTMLInputElement).value = hex;
    // veil mode has separate dark/light pipelines; pick by background luminance
    const [rr, gg, bb] = hexToRgb01(hex);
    P.theme = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) > 0.5 ? 1 : 0;
  };
  document.getElementById('accent')!.addEventListener('input', (e) => {
    P.color = hexToRgb01((e.target as HTMLInputElement).value);
  });
  document.getElementById('bg')!.addEventListener('input', (e) => {
    setBg((e.target as HTMLInputElement).value);
  });
  panel.querySelectorAll<HTMLButtonElement>('button[data-bg]').forEach((b) => {
    b.addEventListener('click', () => setBg(b.dataset.bg!));
  });

  panel.querySelectorAll<HTMLInputElement>('input[data-key]').forEach((el) => {
    inputs[el.dataset.key!] = el;
    el.addEventListener('input', () => {
      PN[el.dataset.key!] = parseFloat(el.value);
      document.getElementById('out_' + el.dataset.key)!.textContent = el.value;
    });
  });
  panel.querySelectorAll<HTMLButtonElement>('#modes button').forEach((b) => {
    b.addEventListener('click', () => { P.mode = parseInt(b.dataset.mode!, 10); syncUI(); });
  });
  panel.querySelectorAll<HTMLButtonElement>('#states button').forEach((b) => {
    b.addEventListener('click', () => {
      agentState = b.dataset.state as AgentState;
      panel.querySelectorAll('#states button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    });
  });
  panel.querySelectorAll<HTMLButtonElement>('#drive button').forEach((b) => {
    b.addEventListener('click', () => {
      panel.querySelectorAll('#drive button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      void setSource(b.dataset.src!);
    });
  });
  document.getElementById('pveil')!.addEventListener('click', () => setParams(PRESET_VEIL));
  document.getElementById('pveilt')!.addEventListener('click', () => setParams(PRESET_VEIL_TALK));
  document.getElementById('psmoke')!.addEventListener('click', () => setParams(PRESET_SMOKE));
  document.getElementById('porb')!.addEventListener('click', () => setParams(PRESET_STORMY));
  document.getElementById('pwind')!.addEventListener('click', () => setParams(PRESET_WIND));
  document.getElementById('prob')!.addEventListener('click', () => setParams(PRESET_ROB));
  document.getElementById('pbold')!.addEventListener('click', () => setParams(PRESET_BOLD));
  document.getElementById('psoft')!.addEventListener('click', () => setParams(PRESET_SOFT));
  document.getElementById('copy')!.addEventListener('click', () => {
    const { color, ...rest } = P;
    const out: Record<string, number | string | Vec3> = { ...rest };
    out.accent = (document.getElementById('accent') as HTMLInputElement).value;
    void navigator.clipboard.writeText(JSON.stringify(out, null, 2));
    flash('params copied to clipboard');
  });
  syncUI();
}

function syncUI(): void {
  for (const [key, el] of Object.entries(inputs)) {
    el.value = String(PN[key]);
    const out = document.getElementById('out_' + key);
    if (out) out.textContent = String(PN[key]);
  }
  document.querySelectorAll<HTMLButtonElement>('#modes button').forEach((b) => {
    b.classList.toggle('active', parseInt(b.dataset.mode!, 10) === P.mode);
  });
}

function flash(text: string): void {
  const m = document.getElementById('msg');
  if (!m) return;
  m.textContent = text;
  setTimeout(() => { m.textContent = ''; }, 2500);
}

// ---- agent-state preview ----
type AgentState = 'manual' | 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';
let agentState: AgentState = 'manual';

interface StateTargets {
  presence: number; gather: number; tintAdd: number; warpMul: number;
  deltaAdd: number; f2Add: number; gainMul: number; neural: number;
}
interface StateFast { rate: number; level: number; core: number; gpulse: number; usesDrive: boolean }

// slow-tweened choreography: these values glide over seconds, so the smoke
// visibly materializes, gathers, settles, and dissipates between states
function stateTargets(): StateTargets {
  const orb = P.mode >= 4;
  const DEF: StateTargets = { presence: P.presence, gather: P.gather, tintAdd: 0, warpMul: 1, deltaAdd: 0, f2Add: 0, gainMul: 1, neural: P.neural };
  switch (agentState) {
    case 'idle':        // near-empty vessel, a settled wisp of floor mist
      return orb ? { ...DEF, presence: 0.12, gather: -0.8, gainMul: 0.85 }
                 : { ...DEF, gainMul: 0.8 };
    case 'connecting':  // still nearly empty; the ember does the talking
      return orb ? { ...DEF, presence: 0.22, gather: -0.25, gainMul: 0.9 }
                 : { ...DEF, gainMul: 0.85 };
    case 'listening':   // smoke materializes and leans in
      return orb ? { ...DEF, presence: 0.8, gather: 0.5, tintAdd: 0.05 }
                 : DEF;
    case 'thinking':    // full presence, coiling hard, taking on the accent color
      return orb ? { ...DEF, presence: 1, gather: 0.6, tintAdd: 0.5, warpMul: 1.3, neural: 1 }
                 : { ...DEF, deltaAdd: 0.5, f2Add: 3 };  // braid weaves tighter and finer
    case 'speaking':    // full presence handed to the live voice
      return orb ? { ...DEF, presence: 1, gather: 0, warpMul: 1.25, gainMul: 1.05 } : DEF;
    default:
      return DEF;
  }
}

// fast per-frame layer: tempo, scripted level, ember heartbeat
function stateFast(el: number, drive: number): StateFast {
  const orb = P.mode >= 4;
  const base = orb ? 0.35 : 1.0;
  const beat = Math.pow(0.5 + 0.5 * Math.sin((el / 1.2) * Math.PI * 2), 3.0);
  const flick = 0.5 + 0.5 * Math.sin((el / 0.35) * Math.PI * 2);
  switch (agentState) {
    case 'idle':       return { rate: base, level: 0, core: orb ? 0.06 : 0, gpulse: 0, usesDrive: false };
    case 'connecting': return { rate: base * 1.4, level: 0.04, core: orb ? 0.18 + 0.55 * beat : 0,
                                gpulse: orb ? 0 : 0.2 * beat, usesDrive: false };
    case 'listening':  return { rate: base * 1.7, level: 0.2, core: orb ? 0.12 : 0, gpulse: 0, usesDrive: false };
    case 'thinking':   return { rate: orb ? 2.2 : 2.5, level: 0.12 + 0.2 * flick,
                                core: orb ? 0.05 : 0,
                                gpulse: orb ? 0 : 0.1 * flick, usesDrive: false };
    case 'speaking':   return { rate: base * 1.5 + 5.5 * drive, level: Math.min(1, drive * 1.35),
                                core: orb ? 0.08 + 0.6 * drive : 0, gpulse: 0, usesDrive: true };
    default:           return { rate: base + P.vSpeed * drive, level: drive, core: 0, gpulse: 0, usesDrive: true };
  }
}

// ---- level sources + run loop ----
let source = 'env';
let micAnalyser: AnalyserNode | null = null;
let micBuf = new Float32Array(0);

async function setSource(s: string): Promise<void> {
  const lvl = document.getElementById('lvl') as HTMLInputElement;
  const lvlOut = document.getElementById('lvlOut')!;
  if (s === 'mic' && !micAnalyser) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 2048;
      micBuf = new Float32Array(micAnalyser.fftSize);
      src.connect(micAnalyser);   // terminal side-tap, nothing to destination
      flash('mic live: talk to it');
    } catch (e) {
      flash('mic blocked: ' + (e as Error).message);
      return;
    }
  }
  source = s;
  lvl.disabled = s !== 'slider';
  lvlOut.textContent = s === 'slider' ? lvl.value : 'auto';
}

function rawLevel(elapsed: number): number {
  if (source === 'slider') {
    const lvl = document.getElementById('lvl') as HTMLInputElement;
    const v = parseFloat(lvl.value);
    document.getElementById('lvlOut')!.textContent = v.toFixed(2);
    return v;
  }
  if (source === 'mic' && micAnalyser) {
    micAnalyser.getFloatTimeDomainData(micBuf);
    let sum = 0;
    for (let i = 0; i < micBuf.length; i++) sum += micBuf[i] * micBuf[i];
    const db = 20 * Math.log10(Math.sqrt(sum / micBuf.length) + 1e-8);
    return Math.max(0, Math.min(1, (db + 50) / 25));
  }
  return levelAt(elapsed % 10.6);
}

if (PLAY) {
  buildPanel();
  const t0 = performance.now();
  let last = t0;
  let smooth = 0;
  let tAnim = 0;
  let rateSm = 1.0;
  const st = { presence: 1, gather: 0, tintAdd: 0, warpMul: 1, deltaAdd: 0, f2Add: 0, gainMul: 1, neural: 0 };
  const loop = (): void => {
    const now = performance.now();
    const el = (now - t0) / 1000;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const raw = rawLevel(el);
    const k = raw > smooth ? 0.25 : 0.06;  // fast attack, slow release
    smooth += (raw - smooth) * k;
    // choreography: slow targets glide (presence slowest, so smoke visibly
    // forms and fades); tempo tweens; the ember beats in real time
    const tg = stateTargets();
    const mix = (cur: number, target: number, tc: number): number =>
      cur + (target - cur) * (1 - Math.exp(-dt / tc));
    st.presence = mix(st.presence, tg.presence, 1.4);
    st.gather   = mix(st.gather, tg.gather, 1.0);
    st.tintAdd  = mix(st.tintAdd, tg.tintAdd, 0.6);
    st.warpMul  = mix(st.warpMul, tg.warpMul, 0.6);
    st.deltaAdd = mix(st.deltaAdd, tg.deltaAdd, 0.6);
    st.f2Add    = mix(st.f2Add, tg.f2Add, 0.6);
    st.gainMul  = mix(st.gainMul, tg.gainMul, 0.6);
    st.neural   = mix(st.neural, tg.neural, 0.6);
    const fr = stateFast(el, smooth);
    rateSm += (fr.rate - rateSm) * (1 - Math.exp(-dt / 0.4));
    tAnim += dt * rateSm;
    renderAt(tAnim, fr.level, {
      presence: st.presence, gather: st.gather, core: fr.core, neural: st.neural,
      tint: Math.min(1, P.tint + st.tintAdd),
      warpAmp: P.warpAmp * st.warpMul,
      delta: P.delta + st.deltaAdd,
      f2: P.f2 + st.f2Add,
      gain: P.gain * st.gainMul * (1 + fr.gpulse),
    });
    requestAnimationFrame(loop);
  };
  loop();
}

declare global {
  interface Window {
    renderAt: typeof renderAt;
    setParams: typeof setParams;
    levelAt: typeof levelAt;
    __ready: boolean;
  }
}
window.renderAt = renderAt;
window.setParams = setParams;
window.levelAt = levelAt;
window.__ready = true;
