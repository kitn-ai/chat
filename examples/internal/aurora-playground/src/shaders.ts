export const VS = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FS = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uLevel;      // 0..1 smoothed voice level
uniform vec3  uColor;
uniform float uMode;       // 1 = braid, 2 = wind, 3 = veil
uniform float uBaseR;      // ring radius, fraction of half-height
uniform float uAmpIdle;    // wobble amplitude at level 0
uniform float uAmpVoice;   // extra wobble amplitude at level 1
uniform float uRadVoice;   // extra base radius at level 1
uniform float uSigma;      // stroke / edge half-width
uniform float uGain;       // master gain
uniform float uF1;         // lobe frequency 1 (braid waves / ribbon centerline)
uniform float uF2;         // lobe frequency 2 (braid flutter / veil warp frequency)
uniform float uS1;         // speed 1
uniform float uS2;         // speed 2
uniform float uEnvSpd;     // heavy-side precession speed
uniform float uSepSpd;     // braid fold travel speed
uniform float uWhiteLo;
uniform float uWhiteHi;
uniform float uBloomMul;
uniform float uBloomGain;
uniform float uDelta;      // braid: per-strand angular offset
uniform float uOff;        // braid: per-strand radial offset
uniform float uWWidth;     // wind: max ribbon half-width
uniform float uWMin;       // wind: half-width at a pinch (edge-on)
uniform float uFillGain;   // wind: translucent fill strength
uniform float uEdgeGain;   // wind: edge stroke strength
uniform float uFlut;       // wind: independent edge flutter amplitude
uniform float uTwistSpd;   // main speed: wind = pinch travel; veil = phase rate (rad/s)
uniform float uWarpAmp;    // veil: warp displacement amplitude
uniform float uTheme;      // veil: 0 = dark pipeline, 1 = light pipeline

float strandGlow(float d, float sigma) {
  // super-gaussian: flat solid core, fast but feathered falloff
  float q = d / sigma;
  float q2 = q * q;
  float core = exp(-q2 * q2);
  float bq = d / (sigma * uBloomMul);
  float bloom = exp(-bq * bq) * uBloomGain;
  return core + bloom;
}

float braidGlow(float r, float th, float t, float amp, float baseR, float env) {
  float glow = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float a  = th + fi * uDelta;
    float tt = t + fi * 1.3;
    float wob =
        sin(a * uF1 + tt * uS1) * 0.55
      + sin(a * uF2 - tt * uS2) * 0.45;
    float ampi = amp * (0.65 + 0.35 * fi);
    float sepMod = 0.5 + 0.5 * sin(th * 1.0 + t * uSepSpd + fi * 1.9);
    float ringR = baseR + (fi - 1.0) * uOff * (0.35 + 1.5 * sepMod) + wob * ampi * env;
    glow += uGain * (0.8 + 0.35 * env) * strandGlow(abs(r - ringR), uSigma);
  }
  return glow;
}

float ribbonGlow(float r, float th, float t, float amp, float baseR, float env) {
  // ONE ribbon whose half-width pinches to ~zero at twist points. The pattern
  // FLAPS like a flag (thickness profile inverts every ~0.95s, recurs ~1.9s).
  float wRaw = sin(th * 2.0 + t * uTwistSpd) * 0.6
             + sin(th * 3.0 - t * uTwistSpd * 0.7 + 1.7) * 0.4;
  float w = (abs(wRaw) * uWWidth + uWMin) * (0.55 + 0.45 * env);

  float c = baseR
    + (sin(th * uF1 + t * uS1) * 0.6
     + sin(th * (uF1 + 2.0) - t * uS1 * 0.63 + 2.3) * 0.4) * amp;

  float fl = uFlut * (0.5 + 0.9 * uLevel);
  float e1 = c - w + sin(th * uF2 + t * uS2) * fl;
  float e2 = c + w + sin(th * uF2 * 1.3 - t * uS2 * 0.8 + 2.0) * fl;

  float lo = min(e1, e2), hi = max(e1, e2);
  float ww = max(hi - lo, 0.004);
  float dens = clamp(uWWidth * 1.2 / ww, 0.4, 2.0);

  // CONTINUOUS sheet between the two edges (discrete sub-strands always band)
  float box = smoothstep(-uSigma, uSigma, r - lo)
            * (1.0 - smoothstep(-uSigma, uSigma, r - hi));
  float u = clamp((r - lo) / ww, 0.0, 1.0);
  float rim = smoothstep(0.5, 1.0, abs(u - 0.5) * 2.0);

  float outside = max(max(lo - r, r - hi), 0.0);
  float bs = uSigma * uBloomMul;
  float halo = exp(-(outside * outside) / (2.0 * bs * bs)) * uBloomGain * dens;

  return uGain * uFillGain
       * (box * dens * (1.0 + uEdgeGain * rim) + halo * (1.0 - box));
}

// ---- veil mode: 36 phase-offset warped copies of one ring, fused by an
// analytic neighbor-distance blur. Implemented from the clean-room fact sheet
// (facts and math only; the upstream source was never seen by this author).
const mat2 VM0 = mat2(0.6, 0.25, -0.25, 0.9);
const mat2 VM1 = mat2(0.16, 0.63, -0.87, 0.34);
const mat2 VM2 = mat2(-0.408, 0.506, -0.794, -0.492);
const mat2 VM3 = mat2(-0.6496, -0.0228, -0.0828, -0.9304);
const vec2 VV0 = vec2(0.600, -0.250);
const vec2 VV1 = vec2(0.160, -0.870);
const vec2 VV2 = vec2(-0.408, -0.794);
const vec2 VV3 = vec2(-0.650, -0.083);

// 4-octave directional-sine cascade; octave k advances phase at k*tau, so the
// coarse folds stand still while fine corrugation flows across them (the wind)
vec2 veilWarp(vec2 p, float phi, float tau, float F, float A) {
  vec2 x = p;
  float f = F;
  float a = A;
  vec2 q = VM0 * x;
  vec2 w = sin(f * q + vec2(phi));
  x += (a / f) * VV0 * w;
  f *= 1.4; a *= 1.0 + 0.1 * (max(w.x, w.y) - 1.0);
  q = VM1 * x; w = sin(f * q + vec2(tau + phi));
  x += (a / f) * VV1 * w;
  f *= 1.4; a *= 1.0 + 0.1 * (max(w.x, w.y) - 1.0);
  q = VM2 * x; w = sin(f * q + vec2(2.0 * tau + phi));
  x += (a / f) * VV2 * w;
  f *= 1.4; a *= 1.0 + 0.1 * (max(w.x, w.y) - 1.0);
  q = VM3 * x; w = sin(f * q + vec2(3.0 * tau + phi));
  x += (a / f) * VV3 * w;
  return x;
}

vec3 vrgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 pp = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(pp.xyw, c.r), vec4(c.r, pp.yzx), step(pp.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1.0e-10)), d / (q.x + 1.0e-10), q.x);
}
vec3 vhsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 pp = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(pp - K.xxx, 0.0, 1.0), c.y);
}

vec4 veilImage(vec2 p, float t) {
  float tau = t * uTwistSpd;              // net phase rate, rad/s
  float F = uF2;                          // warp spatial frequency, direct
  float A = uWarpAmp;
  float rr = uBaseR + uRadVoice * uLevel;

  vec3 hsv = vrgb2hsv(uColor);
  vec2 sPrev = veilWarp(p, -1.0 / 36.0, tau, F, A);
  vec3 acc = vec3(0.0);
  for (int j = 1; j <= 36; j++) {
    float fj = float(j) / 36.0;
    float phi = fj * 3.6415927;           // strand phase span 0.5 + pi
    vec2 s = veilWarp(p, phi, tau, F, A);
    float D = abs(length(s) - rr);
    float beta = exp(2.0 * length(s - sPrev)) - 1.0;
    float E = 0.01 + max(beta, 0.001);    // analytic blur: fans fuse, bunches stay crisp
    float c = 1.0 - smoothstep(0.0, 1.0, D / E);
    vec3 C = vhsv2rgb(vec3(fract(hsv.x + (1.0 - fj) * 0.015), hsv.y, hsv.z));
    acc += c * C;
    sPrev = s;
  }
  vec3 I = acc / 36.0;
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float dith = (n - 0.5) / 255.0;
  float brightness = uGain;
  if (uTheme < 0.5) {
    // dark pipeline: pre-gain, Reinhard-4 tonemap, luma alpha; RGB can exceed
    // alpha on purpose (additive-looking glow)
    vec3 x1 = 1.2 * I + vec3(dith);
    vec3 tm = 4.0 * x1 / (1.0 + 4.0 * x1);
    float luma = dot(tm, vec3(0.299, 0.587, 0.114));
    return vec4(tm * brightness, clamp(luma * brightness, 0.0, 1.0));
  }
  // light pipeline: brightness curve on vector length, 3x saturation about gray
  vec3 x1 = I + vec3(dith);
  float bb = length(x1);
  vec3 dir = x1 / max(bb, 1.0e-5);
  float b2 = 2.0 * bb / (1.0 + 2.0 * bb);
  vec3 x2 = dir * b2;
  float g = dot(x2, vec3(0.2, 0.5, 0.1));
  vec3 x3 = clamp(vec3(g) + 3.0 * (x2 - vec3(g)), 0.0, 1.0);
  return vec4(x3, clamp(b2 * clamp(brightness, 1.0, 2.0), 0.0, 1.0));
}

void main() {
  vec2 hres = uRes * 0.5;
  vec2 p = (gl_FragCoord.xy - hres) / hres.y;

  float r  = length(p);
  float th = atan(p.y, p.x);
  float t  = uTime;

  if (uMode > 2.5) {
    // veil coordinates run -0.5..0.5 across the frame, matching its constants
    gl_FragColor = veilImage(p * 0.5, t);
    return;
  }

  float amp   = uAmpIdle + uAmpVoice * uLevel;
  float baseR = uBaseR + uRadVoice * uLevel;
  float env = 0.62 + 0.38 * sin(th * 2.0 + t * uEnvSpd + 2.0);

  float glow = uMode < 1.5
    ? braidGlow(r, th, t, amp, baseR, env)
    : ribbonGlow(r, th, t, amp, baseR, env);

  float bright = 0.75 + 0.45 * min(glow, 1.2);
  float white = smoothstep(uWhiteLo, uWhiteHi, glow) * 0.55;
  vec3 col = mix(uColor * bright, vec3(1.0), white);

  float alpha = clamp(glow, 0.0, 1.0);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  alpha = clamp(alpha + (n - 0.5) / 255.0, 0.0, 1.0);

  gl_FragColor = vec4(col * alpha, alpha);  // premultiplied
}
`;
