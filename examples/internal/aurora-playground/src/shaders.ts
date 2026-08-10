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
uniform float uTwistSpd;   // main speed: wind = pinch travel; veil = phase rate; orb = swirl
uniform float uWarpAmp;    // veil: warp displacement amplitude; orb: smoke turbulence
uniform float uTheme;      // veil: 0 = dark pipeline, 1 = light pipeline
uniform float uLens;       // orb: spherical lens distortion amount
uniform float uSpec;       // orb: window-highlight strength
uniform float uTint;       // smoke: how much accent color bleeds into the smoke body

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

// ---- orb mode: a glass sphere with luminous smoke inside. Fully original
// construction: sphere mask + fake ray depth, spherical lens distortion,
// domain-warped fbm smoke in three parallax layers, a wandering interior
// light, fresnel rim, and a window highlight.
float hash21(vec2 q) {
  return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 q) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm4(vec2 q) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * vnoise(q);
    q *= 2.03;               // non-integer so octaves do not align into grids
    amp *= 0.5;
  }
  return sum;
}

float orbGlow(vec2 p, float t) {
  // the orb is a stationary vessel: voice never changes its size, only what
  // happens inside it
  float R = uBaseR * 2.0;
  float d = length(p);
  float mask = 1.0 - smoothstep(R - 0.012, R + 0.004, d);
  // half chord length of the view ray through the sphere: the fake depth
  float zn = sqrt(max(R * R - d * d, 0.0)) / max(R, 1.0e-4);

  // spherical lens: texture compresses toward the rim, selling "inside"
  vec2 ps = p / (R * mix(1.0, 0.35 + 0.65 * zn, uLens));

  float tt = t * uTwistSpd;
  float sc = uF2 * 0.35;                       // smoke feature scale
  float turb = uWarpAmp * (0.5 + 0.8 * uLevel);

  float dens = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 o = vec2(fk * 7.31, fk * 3.77);
    // layers separate more where the ray is shallow: parallax
    vec2 pk = ps * (1.0 + fk * 0.18 * (1.0 - zn));
    vec2 q = vec2(
      fbm4(pk * sc * 0.6 + o + vec2(tt * uS1 * 0.55, 0.0)),
      fbm4(pk * sc * 0.6 + o + vec2(5.2, 1.3) - vec2(0.0, tt * uS2 * 0.45)));
    float n = fbm4(pk * sc + turb * 2.0 * (q - 0.5) + o + vec2(tt * 0.28, tt * 0.18));
    dens += (0.45 - fk * 0.1) * n;
  }
  dens = smoothstep(0.30, 0.78, dens);         // carve wisps out of the fog

  // a light wanders inside the ball; wisps near it glow from within
  vec2 lp = vec2(cos(tt * 0.23), sin(tt * 0.31)) * R * 0.35;
  vec2 dl = p - lp;
  float lite = exp(-dot(dl, dl) / (2.0 * R * R * 0.16));
  float smoke = dens * (0.5 + 0.9 * lite) * (0.55 + 0.65 * zn)
              + 0.05 * zn;                     // faint base fog so the glass reads

  // glass: fresnel rim + a fixed window highlight
  float rim = pow(smoothstep(R * 0.62, R, d), 3.0);
  vec2 hp = p - vec2(-0.38, 0.42) * R;
  float spec = exp(-dot(hp, hp) / (2.0 * R * R * 0.004)) * uSpec;

  return uGain * mask * (uFillGain * 1.6 * smoke + uEdgeGain * 0.8 * rim + spec);
}

// ---- smoke orb: luminous smoke sealed in a glass sphere. Desaturated smoke
// body, accent-colored light and glass; ridged carve for tendrils; dual-phase
// advection so the smoke flows instead of boiling in place.
vec4 smokeOrb(vec2 p, float t) {
  // stationary vessel: the contents react, the glass does not
  float R = uBaseR * 2.0;
  float d = length(p);
  float mask = 1.0 - smoothstep(R - 0.010, R + 0.004, d);
  float zn = sqrt(max(R * R - d * d, 0.0)) / max(R, 1.0e-4);
  vec2 ps = p / (R * mix(1.0, 0.35 + 0.65 * zn, uLens));

  float tt = t * uTwistSpd;
  // slow rigid drift plus an OSCILLATING differential stir. The differential
  // part must be bounded: rotation shear that accumulates forever winds any
  // pattern into a spiral (the cream-in-coffee artifact)
  float inner = 1.0 - clamp(d / max(R, 1.0e-4), 0.0, 1.0);
  float ang = tt * 0.04
            + (sin(tt * 0.11) * 0.55 + sin(tt * 0.047 + 1.7) * 0.35) * inner;
  float ca = cos(ang), sa = sin(ang);
  ps = mat2(ca, -sa, sa, ca) * ps;

  // base features are a large fraction of the orb; fine grain reads as terrain
  float sc = uF2 * 0.18;
  // voice tears the smoke into shreds, but never erases it
  float tau0 = 0.50 + 0.06 * uLevel;
  float bw = mix(0.16, 0.12, uLevel);

  // a light wanders inside the ball
  vec2 lp = vec2(cos(tt * 0.21), sin(tt * 0.27)) * R * 0.42;
  vec2 L = normalize(lp - p + vec2(1.0e-4, 0.0));

  float dens = 0.0;
  float lit = 0.0;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 o = vec2(fk * 9.17, fk * 5.13);
    float scale = sc * (1.0 + 0.7 * fk);
    vec2 pk = ps * (1.0 + fk * 0.24 * (1.0 - zn)) + o;

    // coverage mask: genuinely empty glass between the tendrils
    // bounded orbit, not a straight scroll: the coverage pattern wanders
    // around home instead of migrating off one side of the vessel
    float cn = fbm4(pk * 0.9 + vec2(sin(tt * 0.041), -cos(tt * 0.033)) * 0.8);
    float covLo = 0.62 - 0.30 * uFillGain + 0.03 * uLevel;
    // center bias: the heart of the ball always holds some smoke
    float cov = smoothstep(covLo, covLo + 0.28, cn + 0.16 * inner);

    // swirl + rise transport; dual-phase reprojection with spatial phase
    // jitter (cn) so drift is continuous and resets never pulse globally
    vec2 flow = vec2(-pk.y, pk.x) * 0.5 + vec2(0.0, 0.4);
    float cyc = tt * 0.10 * uS1 * (1.0 + 0.6 * fk);
    float ph0 = fract(cyc + 0.35 * cn);
    float ph1 = fract(cyc + 0.35 * cn + 0.5);
    float w0 = 1.0 - abs(1.0 - 2.0 * ph0);

    // domain warp stretches blobs into filaments
    vec2 w2 = vec2(fbm4(pk * scale * 0.5 + vec2(sin(tt * 0.09 * uS2), cos(tt * 0.075 * uS2)) * 0.9),
                   fbm4(pk * scale * 0.5 + vec2(3.7, 8.1) + vec2(cos(tt * 0.065 * uS2), sin(tt * 0.083 * uS2)) * 0.9));
    vec2 qw = pk * scale + uWarpAmp * 3.0 * (w2 - 0.5);

    float n = mix(fbm4(qw - flow * 1.2 * ph1), fbm4(qw - flow * 1.2 * ph0), w0);
    float s = 2.0 * n - 1.0;
    float ridge = 1.0 - abs(s);
    ridge *= ridge;
    // band-pass carve: keep a thin iso-band of the noise, which renders as
    // curling tendrils with soft edges instead of filled blobs
    float band = smoothstep(tau0 - bw, tau0, n) * (1.0 - smoothstep(tau0, tau0 + bw, n));
    // carved wisps plus a soft fog floor so density never collapses to zero
    float dk = cov * (band * (0.6 + 0.5 * ridge) + 0.12 * n * cov);
    dens += (0.60 - 0.22 * fk) * dk;

    // lit flank: density derivative toward the light
    float nL = fbm4(qw + L * 0.5);
    lit += clamp((nL - n) * 3.0, 0.0, 1.0) * dk;
  }
  // the smoke floats inside the vessel: it thins before touching the glass
  dens *= 1.0 - smoothstep(0.72, 0.97, d / max(R, 1.0e-4));
  // fill amount scales the smoke mass; activity concentrates it, not deletes it
  dens *= (0.45 + 1.25 * uFillGain) * (1.0 + 0.25 * uLevel);
  float dEff = clamp(dens, 0.0, 1.5) * (0.5 + 0.5 * zn);
  float aSmoke = 1.0 - exp(-2.6 * dEff);   // fake Beer-Lambert buildup

  float rL = length(p - lp) / R;
  float G = 1.0 / (1.0 + 2.0 * rL + 8.0 * rL * rL);
  // activity: the presence burns brighter while there is voice
  float act = 0.7 + 0.8 * uLevel;

  vec3 accent = uColor;
  vec3 albedo = mix(vec3(0.84, 0.87, 0.92), accent, uTint);
  vec3 body = albedo * (0.30 + 0.55 * exp(-1.4 * dEff))
            + accent * (lit * 0.5 + dEff * G * 1.1) * act;
  vec3 bgIn = accent * 0.05 * zn;
  vec3 col = mix(bgIn, body, aSmoke)
           + accent * G * act * 0.18 * zn;   // in-scatter haze around the light

  float rim = pow(smoothstep(R * 0.66, R, d), 3.0);
  vec2 hp = p - vec2(-0.38, 0.42) * R;
  float spec = exp(-dot(hp, hp) / (2.0 * R * R * 0.004)) * uSpec;
  col += accent * rim * uEdgeGain * 0.7 + vec3(spec);

  col *= uGain * mask;
  float alpha = clamp((aSmoke * 0.9 + G * act * 0.15 * zn
                     + rim * uEdgeGain * 0.5 + spec + 0.03 * zn) * uGain, 0.0, 1.0) * mask;
  float nz = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  alpha = clamp(alpha + (nz - 0.5) / 255.0, 0.0, 1.0);
  return vec4(col, alpha);
}

void main() {
  vec2 hres = uRes * 0.5;
  vec2 p = (gl_FragCoord.xy - hres) / hres.y;

  float r  = length(p);
  float th = atan(p.y, p.x);
  float t  = uTime;

  if (uMode > 4.5) {
    gl_FragColor = smokeOrb(p, t);
    return;
  }
  if (uMode > 2.5 && uMode < 3.5) {
    // veil coordinates run -0.5..0.5 across the frame, matching its constants
    gl_FragColor = veilImage(p * 0.5, t);
    return;
  }

  float amp   = uAmpIdle + uAmpVoice * uLevel;
  float baseR = uBaseR + uRadVoice * uLevel;
  float env = 0.62 + 0.38 * sin(th * 2.0 + t * uEnvSpd + 2.0);

  float glow = uMode < 1.5
    ? braidGlow(r, th, t, amp, baseR, env)
    : (uMode < 2.5 ? ribbonGlow(r, th, t, amp, baseR, env) : orbGlow(p, t));

  // braid keeps its darker floor so strand structure reads; the wind sheet
  // needs the lifted floor to stay sheer (raising the floor for ALL modes was
  // what washed the braid out to solid white)
  float bfloor = uMode < 1.5 ? 0.55 : 0.75;
  float bscale = uMode < 1.5 ? 0.65 : 0.45;
  float bright = bfloor + bscale * min(glow, 1.2);
  float wcap = uMode < 1.5 ? 0.45 : 0.55;
  float white = smoothstep(uWhiteLo, uWhiteHi, glow) * wcap;
  vec3 col = mix(uColor * bright, vec3(1.0), white);

  float alpha = clamp(glow, 0.0, 1.0);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  alpha = clamp(alpha + (n - 0.5) / 255.0, 0.0, 1.0);

  gl_FragColor = vec4(col * alpha, alpha);  // premultiplied
}
`;
