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
  'uWarpAmp','uTheme','uLens','uSpec','uTint'] as const;
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

function renderAt(t: number, level: number): void {
  const g = gl!;
  g.viewport(0, 0, canvas.width, canvas.height);
  g.clear(g.COLOR_BUFFER_BIT);
  g.uniform2f(U.uRes, canvas.width, canvas.height);
  g.uniform1f(U.uTime, t);
  g.uniform1f(U.uLevel, level);
  g.uniform3f(U.uColor, P.color[0], P.color[1], P.color[2]);
  g.uniform1f(U.uMode, P.mode);
  g.uniform1f(U.uBaseR, P.baseR);
  g.uniform1f(U.uAmpIdle, P.ampIdle);
  g.uniform1f(U.uAmpVoice, P.ampVoice);
  g.uniform1f(U.uRadVoice, P.radVoice);
  g.uniform1f(U.uSigma, P.sigma);
  g.uniform1f(U.uGain, P.gain);
  g.uniform1f(U.uF1, P.f1);
  g.uniform1f(U.uF2, P.f2);
  g.uniform1f(U.uS1, P.s1);
  g.uniform1f(U.uS2, P.s2);
  g.uniform1f(U.uEnvSpd, P.envSpd);
  g.uniform1f(U.uSepSpd, P.sepSpd);
  g.uniform1f(U.uWhiteLo, P.whiteLo);
  g.uniform1f(U.uWhiteHi, P.whiteHi);
  g.uniform1f(U.uBloomMul, P.bloomMul);
  g.uniform1f(U.uBloomGain, P.bloomGain);
  g.uniform1f(U.uDelta, P.delta);
  g.uniform1f(U.uOff, P.off);
  g.uniform1f(U.uWWidth, P.wWidth);
  g.uniform1f(U.uWMin, P.wMin);
  g.uniform1f(U.uFillGain, P.fillGain);
  g.uniform1f(U.uEdgeGain, P.edgeGain);
  g.uniform1f(U.uFlut, P.flut);
  g.uniform1f(U.uTwistSpd, P.twistSpd);
  g.uniform1f(U.uWarpAmp, P.warpAmp);
  g.uniform1f(U.uTheme, P.theme);
  g.uniform1f(U.uLens, P.lens);
  g.uniform1f(U.uSpec, P.spec);
  g.uniform1f(U.uTint, P.tint);
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
  const loop = (): void => {
    const now = performance.now();
    const el = (now - t0) / 1000;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const raw = rawLevel(el);
    const k = raw > smooth ? 0.25 : 0.06;  // fast attack, slow release
    smooth += (raw - smooth) * k;
    // ALL modes run on a warped activity clock: voice accelerates the motion
    // itself (no phase jumps). Aurora modes idle at their normal pace and
    // speed up with voice; orb modes idle slow and serene.
    const idleRate = P.mode >= 4 ? 0.35 : 1.0;
    tAnim += dt * (idleRate + P.vSpeed * smooth);
    renderAt(tAnim, smooth);
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
