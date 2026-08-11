/**
 * The four lab looks, written for `ShaderCanvas` in the same `mainImage`
 * convention the `custom` variant documents. Every uniform is declared by
 * the canvas from the uniform map (`lab-visualizer.tsx`), never in the body.
 *
 * All four are original clean-room work from the aurora prototyping sessions
 * (see `examples/internal/aurora-playground`, the tuning playground these were
 * born in). Braid and ribbon read the accent through the shared ring pipeline;
 * planet and orb are stationary vessels whose CONTENTS react to state and
 * voice: presence materializes the smoke, gather settles or centers it, the
 * ember pulses while connecting, and thinking fires fractal lightning.
 */

/** Value-noise fbm. Non-integer lacunarity so octaves do not align into grids. */
const NOISE = `
float labHash(vec2 q) {
  return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453);
}
float labNoise(vec2 q) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = labHash(i);
  float b = labHash(i + vec2(1.0, 0.0));
  float c = labHash(i + vec2(0.0, 1.0));
  float d = labHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float labFbm(vec2 q) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * labNoise(q);
    q *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
`;

/**
 * Fractal lightning: five sites firing on independent rhythms; each firing
 * strikes a noise-displaced arc (re-seeded per strike, so no two bolts share
 * a shape) plus a fainter fork, from its previous site to its new one.
 */
const LIGHTNING = `
float labSegDist(vec2 q, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(q - a, ab) / max(dot(ab, ab), 1.0e-6), 0.0, 1.0);
  return length(q - a - ab * h);
}
vec2 labSparkPos(float k, float i, float R) {
  float h1 = labHash(vec2(k * 7.31 + 1.13, i * 3.71 + 0.17));
  float h2 = labHash(vec2(i * 9.13 + 2.29, k * 5.77 + 0.53));
  float av = 6.2831853 * h1;
  float rad = R * 0.85 * sqrt(h2);
  return vec2(cos(av), sin(av)) * rad;
}
float labBolt(vec2 q, vec2 A, vec2 B, float seed, float R, float life) {
  vec2 ab = B - A;
  float len = max(length(ab), 1.0e-4);
  vec2 dir = ab / len;
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 w = q - A;
  float u = dot(w, dir) / len;
  float v = dot(w, nrm);
  if (u < -0.05 || u > 1.05 || abs(v) > R * 0.30) return 0.0;
  float uu = clamp(u, 0.0, 1.0);
  float taper = sin(uu * 3.14159265);
  float off1 = (labFbm(vec2(uu * 9.0 + seed * 13.1, seed * 7.7)) - 0.5) * 0.55 * uBoltJag;
  float off2 = (labFbm(vec2(uu * 23.0 + seed * 5.3, seed * 3.9 + 4.2)) - 0.5) * 0.22 * uBoltJag;
  float mainArc = abs(v - (off1 + off2) * len * taper);
  float forkArc = abs(v - (off1 * 0.6 - off2 * 1.8) * len * taper);
  float wdt = R * (0.006 + 0.010 * life) * uBoltWidth;
  float bolt = exp(-pow(mainArc / wdt, 2.0))
             + 0.45 * exp(-pow(mainArc / (wdt * 3.0), 2.0))
             + 0.5 * exp(-pow(forkArc / (wdt * 0.8), 2.0))
             + 0.25 * exp(-pow(forkArc / (wdt * 2.5), 2.0));
  return bolt * taper;
}
float labNeural(vec2 q, float t, float R) {
  if (uNeural < 0.01) return 0.0;
  float acc = 0.0;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float period = (1.1 + 1.3 * labHash(vec2(fk, 3.3))) / max(uBoltRate, 0.05);
    float cyc = t / period + labHash(vec2(fk, 7.7)) * 7.0;
    float i = floor(cyc);
    float life = fract(cyc);
    float env = smoothstep(0.0, 0.04, life) * exp(-5.0 * life);
    if (env >= 0.004) {
      vec2 pos = labSparkPos(fk, i, R);
      vec2 prev = labSparkPos(fk, i - 1.0, R);
      float seed = labHash(vec2(fk * 3.1, i * 1.7));
      float bolt = labBolt(q, prev, pos, seed, R, life) * env;
      vec2 dp = q - pos;
      vec2 dq = q - prev;
      float tips = (exp(-dot(dp, dp) / (2.0 * R * R * 0.0016))
                  + 0.6 * exp(-dot(dq, dq) / (2.0 * R * R * 0.0012))) * env;
      acc += bolt * 1.2 + tips * 0.8;
    }
  }
  return acc * uNeural;
}
`;

/** Super-gaussian stroke: flat solid core, fast but feathered falloff. */
const STROKE = `
float labStroke(float d, float sigma) {
  float q = d / sigma;
  float q2 = q * q;
  float core = exp(-q2 * q2);
  float bq = d / (sigma * uBloomMul);
  float bloom = exp(-bq * bq) * uBloomGain;
  return core + bloom;
}
`;

/** Shared ring color pipeline: accent brightness ramp with a capped white lift. */
const RING_COLOR = `
vec4 labRingColor(float glow, float bfloor, float bscale, float wcap, vec2 fragCoord) {
  float bright = bfloor + bscale * min(glow, 1.2);
  float white = smoothstep(uWhiteLo, uWhiteHi, glow) * wcap;
  vec3 col = mix(uColor * bright, vec3(1.0), white);
  float alpha = clamp(glow, 0.0, 1.0);
  float n = fract(sin(dot(fragCoord, vec2(12.9898, 78.233))) * 43758.5453);
  alpha = clamp(alpha + (n - 0.5) / 255.0, 0.0, 1.0);
  return vec4(col * alpha, alpha);
}
`;

/** Three woven strands sharing one wave family; pileups soft-compressed. */
export const BRAID_FRAGMENT = `${STROKE}${RING_COLOR}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 hres = iResolution.xy * 0.5;
  vec2 p = (fragCoord - hres) / hres.y;
  float r = length(p);
  float th = atan(p.y, p.x);
  float t = uT;

  float amp = uAmpIdle + uAmpVoice * uLvl;
  float baseR = uBaseR + uRadVoice * uLvl;
  float env = 0.62 + 0.38 * sin(th * 2.0 + t * uEnvSpd + 2.0);

  float glow = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float a = th + fi * uDelta;
    float tt = t + fi * 1.3;
    float wob = sin(a * uF1 + tt * uS1) * 0.55 + sin(a * uF2 - tt * uS2) * 0.45;
    float ampi = amp * (0.65 + 0.35 * fi);
    float sepMod = 0.5 + 0.5 * sin(th + t * uSepSpd + fi * 1.9);
    float ringR = baseR + (fi - 1.0) * uOff * (0.35 + 1.5 * sepMod) + wob * ampi * env;
    glow += uGain * (0.8 + 0.35 * env) * labStroke(abs(r - ringR), uSigma);
  }
  // three overlapping strands can sum past every threshold; compress so
  // crossings brighten without blowing out to a solid white tube
  glow = glow / (1.0 + 0.35 * glow);
  fragColor = labRingColor(glow, 0.55, 0.65, 0.45, fragCoord);
}
`;

/** One ribbon whose width pinches to zero at traveling twist points. */
export const RIBBON_FRAGMENT = `${STROKE}${RING_COLOR}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 hres = iResolution.xy * 0.5;
  vec2 p = (fragCoord - hres) / hres.y;
  float r = length(p);
  float th = atan(p.y, p.x);
  float t = uT;

  float amp = uAmpIdle + uAmpVoice * uLvl;
  float baseR = uBaseR + uRadVoice * uLvl;
  float env = 0.62 + 0.38 * sin(th * 2.0 + t * uEnvSpd + 2.0);

  float wRaw = sin(th * 2.0 + t * uTwistSpd) * 0.6
             + sin(th * 3.0 - t * uTwistSpd * 0.7 + 1.7) * 0.4;
  float w = (abs(wRaw) * uWWidth + uWMin) * (0.55 + 0.45 * env);

  float c = baseR
    + (sin(th * uF1 + t * uS1) * 0.6
     + sin(th * (uF1 + 2.0) - t * uS1 * 0.63 + 2.3) * 0.4) * amp;

  float fl = uFlut * (0.5 + 0.9 * uLvl);
  float e1 = c - w + sin(th * uF2 + t * uS2) * fl;
  float e2 = c + w + sin(th * uF2 * 1.3 - t * uS2 * 0.8 + 2.0) * fl;

  float lo = min(e1, e2), hi = max(e1, e2);
  float ww = max(hi - lo, 0.004);
  float dens = clamp(uWWidth * 1.2 / ww, 0.4, 2.0);

  float box = smoothstep(-uSigma, uSigma, r - lo)
            * (1.0 - smoothstep(-uSigma, uSigma, r - hi));
  float u = clamp((r - lo) / ww, 0.0, 1.0);
  float rim = smoothstep(0.5, 1.0, abs(u - 0.5) * 2.0);

  float outside = max(max(lo - r, r - hi), 0.0);
  float bs = uSigma * uBloomMul;
  float halo = exp(-(outside * outside) / (2.0 * bs * bs)) * uBloomGain * dens;

  float glow = uGain * uFillGain
             * (box * dens * (1.0 + uEdgeGain * rim) + halo * (1.0 - box));
  fragColor = labRingColor(glow, 0.75, 0.45, 0.55, fragCoord);
}
`;

/** Dense churning cloud cover on a stationary glass sphere. */
export const PLANET_FRAGMENT = `${NOISE}${LIGHTNING}${RING_COLOR}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 hres = iResolution.xy * 0.5;
  vec2 p = (fragCoord - hres) / hres.y;
  float t = uT;
  float R = uBaseR * 2.0;
  float d = length(p);
  float mask = 1.0 - smoothstep(R - 0.012, R + 0.004, d);
  float zn = sqrt(max(R * R - d * d, 0.0)) / max(R, 1.0e-4);
  vec2 ps = p / (R * mix(1.0, 0.35 + 0.65 * zn, uLens));

  float tt = t * uTwistSpd;
  float sc = uF2 * 0.35;
  float turb = uWarpAmp * (0.5 + 0.8 * uLvl);

  float dens = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 o = vec2(fk * 7.31, fk * 3.77);
    vec2 pk = ps * (1.0 + fk * 0.18 * (1.0 - zn));
    vec2 q = vec2(
      labFbm(pk * sc * 0.6 + o + vec2(tt * uS1 * 0.55, 0.0)),
      labFbm(pk * sc * 0.6 + o + vec2(5.2, 1.3) - vec2(0.0, tt * uS2 * 0.45)));
    float n = labFbm(pk * sc + turb * 2.0 * (q - 0.5) + o + vec2(tt * 0.28, tt * 0.18));
    dens += (0.45 - fk * 0.1) * n;
  }
  dens = smoothstep(0.30 + (1.0 - uPresence) * 0.40, 0.78, dens);
  dens *= 0.12 + 0.88 * uPresence;

  vec2 lp = vec2(cos(tt * 0.23), sin(tt * 0.31)) * R * 0.35;
  vec2 dl = p - lp;
  float smoke = dens * (0.5 + 0.9 * exp(-dot(dl, dl) / (2.0 * R * R * 0.16))) * (0.55 + 0.65 * zn)
              + 0.05 * zn;

  float rim = pow(smoothstep(R * 0.62, R, d), 3.0);
  vec2 hp = p - vec2(-0.38, 0.42) * R;
  float spec = exp(-dot(hp, hp) / (2.0 * R * R * 0.004)) * uSpec;
  float core = uCore * exp(-(d * d) / (2.0 * R * R * 0.026));
  float nrl = labNeural(p, tt * 0.6, R);

  float glow = uGain * mask
             * (uFillGain * 1.6 * smoke + uEdgeGain * 0.8 * rim + spec + core * 1.3 + nrl * 1.2);
  fragColor = labRingColor(glow, 0.75, 0.45, 0.55, fragCoord);
}
`;

/** Luminous smoke sealed in a stationary glass sphere, lit from within. */
export const ORB_FRAGMENT = `${NOISE}${LIGHTNING}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 hres = iResolution.xy * 0.5;
  vec2 p = (fragCoord - hres) / hres.y;
  float t = uT;
  float R = uBaseR * 2.0;
  float d = length(p);
  float mask = 1.0 - smoothstep(R - 0.010, R + 0.004, d);
  float zn = sqrt(max(R * R - d * d, 0.0)) / max(R, 1.0e-4);
  float inner = 1.0 - clamp(d / max(R, 1.0e-4), 0.0, 1.0);
  vec2 ps = p / (R * mix(1.0, 0.35 + 0.65 * zn, uLens));

  float tt = t * uTwistSpd;
  // rigid drift plus a BOUNDED oscillating stir: shear that accumulates
  // forever winds any pattern into a spiral
  float ang = tt * 0.04
            + (sin(tt * 0.11) * 0.55 + sin(tt * 0.047 + 1.7) * 0.35) * inner;
  float ca = cos(ang), sa = sin(ang);
  ps = mat2(ca, -sa, sa, ca) * ps;

  float sc = uF2 * 0.18;
  float tau0 = 0.50 + 0.06 * uLvl;
  float bw = mix(0.16, 0.12, uLvl);

  vec2 lp = vec2(cos(tt * 0.21), sin(tt * 0.27)) * R * 0.42;
  vec2 L = normalize(lp - p + vec2(1.0e-4, 0.0));

  float dens = 0.0;
  float lit = 0.0;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 o = vec2(fk * 9.17, fk * 5.13);
    float scale = sc * (1.0 + 0.7 * fk);
    vec2 pk = ps * (1.0 + fk * 0.24 * (1.0 - zn)) + o;

    // bounded orbit, never a straight scroll: the coverage pattern wanders
    // around home instead of migrating off one side of the vessel
    float cn = labFbm(pk * 0.9 + vec2(sin(tt * 0.041), -cos(tt * 0.033)) * 0.8);
    float covLo = 0.62 - 0.30 * uFillGain + 0.03 * uLvl
                + (1.0 - uPresence) * 0.45;
    float bottomness = clamp(-p.y / max(R, 1.0e-4) * 1.3 - 0.1, 0.0, 1.0);
    float gBias = 0.16 * inner * uPresence
                + max(uGather, 0.0) * 0.30 * inner
                + max(-uGather, 0.0) * 0.38 * bottomness;
    float cov = smoothstep(covLo, covLo + 0.28, cn + gBias);

    vec2 flow = vec2(-pk.y, pk.x) * 0.5 + vec2(0.0, 0.4);
    float cyc = tt * 0.10 * uS1 * (1.0 + 0.6 * fk);
    float ph0 = fract(cyc + 0.35 * cn);
    float ph1 = fract(cyc + 0.35 * cn + 0.5);
    float w0 = 1.0 - abs(1.0 - 2.0 * ph0);

    vec2 w2 = vec2(labFbm(pk * scale * 0.5 + vec2(sin(tt * 0.09 * uS2), cos(tt * 0.075 * uS2)) * 0.9),
                   labFbm(pk * scale * 0.5 + vec2(3.7, 8.1) + vec2(cos(tt * 0.065 * uS2), sin(tt * 0.083 * uS2)) * 0.9));
    vec2 qw = pk * scale + uWarpAmp * 3.0 * (w2 - 0.5);

    float n = mix(labFbm(qw - flow * 1.2 * ph1), labFbm(qw - flow * 1.2 * ph0), w0);
    float sgn = 2.0 * n - 1.0;
    float ridge = 1.0 - abs(sgn);
    ridge *= ridge;
    float band = smoothstep(tau0 - bw, tau0, n) * (1.0 - smoothstep(tau0, tau0 + bw, n));
    float dk = cov * (band * (0.6 + 0.5 * ridge) + 0.12 * n * cov);
    dens += (0.60 - 0.22 * fk) * dk;

    float nL = labFbm(qw + L * 0.5);
    lit += clamp((nL - n) * 3.0, 0.0, 1.0) * dk;
  }
  dens *= 1.0 - smoothstep(0.72, 0.97, d / max(R, 1.0e-4));
  dens *= (0.45 + 1.25 * uFillGain) * (1.0 + 0.25 * uLvl);
  dens *= 0.08 + 0.92 * uPresence;
  float dEff = clamp(dens, 0.0, 1.5) * (0.5 + 0.5 * zn);
  float aSmoke = 1.0 - exp(-2.6 * dEff);

  float rL = length(p - lp) / R;
  float G = 1.0 / (1.0 + 2.0 * rL + 8.0 * rL * rL);
  float act = 0.7 + 0.8 * uLvl;

  vec3 albedo = mix(vec3(0.84, 0.87, 0.92), uColor, uTint);
  vec3 body = albedo * (0.30 + 0.55 * exp(-1.4 * dEff))
            + uColor * (lit * 0.5 + dEff * G * 1.1) * act;
  vec3 bgIn = uColor * 0.05 * zn;
  vec3 col = mix(bgIn, body, aSmoke)
           + uColor * G * act * 0.18 * zn;

  float rim = pow(smoothstep(R * 0.66, R, d), 3.0);
  vec2 hp = p - vec2(-0.38, 0.42) * R;
  float spec = exp(-dot(hp, hp) / (2.0 * R * R * 0.004)) * uSpec;
  float core = uCore * exp(-(d * d) / (2.0 * R * R * 0.022));
  float nrl = labNeural(p, tt * 0.6, R);
  col += uColor * rim * uEdgeGain * 0.7 + vec3(spec) + uColor * core * 1.5
       + uColor * nrl * (0.7 + 0.6 * aSmoke);

  col *= uGain * mask;
  float alpha = clamp((aSmoke * 0.9 + G * act * 0.15 * zn + core + nrl * 0.55
                     + rim * uEdgeGain * 0.5 + spec + 0.03 * zn) * uGain, 0.0, 1.0) * mask;
  float nz = fract(sin(dot(fragCoord, vec2(12.9898, 78.233))) * 43758.5453);
  alpha = clamp(alpha + (nz - 0.5) / 255.0, 0.0, 1.0);
  fragColor = vec4(col, alpha);
}
`;

export type LabLook = 'braid' | 'ribbon' | 'planet' | 'orb';

export const LAB_FRAGMENTS: Record<LabLook, string> = {
  braid: BRAID_FRAGMENT,
  ribbon: RIBBON_FRAGMENT,
  planet: PLANET_FRAGMENT,
  orb: ORB_FRAGMENT,
};
