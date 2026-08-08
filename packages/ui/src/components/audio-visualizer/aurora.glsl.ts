/**
 * Aurora ("veil") fragment shader.
 *
 * ORIGINAL WORK for @kitn.ai/ui. Written for Task 14 of
 * docs/superpowers/plans/2026-08-07-audio-visualizers.md, from two inputs
 * only:
 *   1. .superpowers/sdd/2026-08-07-audio-visualizers/reference/aura-prototype/
 *      lk-aura-factsheet.md -- a two-team clean-room functional spec (facts
 *      and mathematics, no code, no identifiers) covering LiveKit's public
 *      "aura" visualizer look.
 *   2. The adopted prototype's own `aura-proto.html` (mode 3, "veil"), which
 *      was itself implemented from that fact sheet by an author who never
 *      saw LiveKit's source.
 *
 * This file is NOT derived from, and was not written with reference to,
 * LiveKit's `agent-audio-visualizer-aura.tsx` or
 * `use-agent-audio-visualizer-aura.ts` -- neither was opened at any point.
 * Those are under a restrictive license incompatible with publishing this
 * package; the fact sheet's numbers and formulas (independently re-derived
 * and checked by hand below, not copied) are what stand in for them.
 *
 * The construction: 36 phase-offset copies of one ring, each pushed through
 * the same 4-octave directional-sine warp cascade, fused into soft veils by
 * an analytic neighbour-distance blur -- see `auroraWarp` and the strand
 * loop in `mainImage`.
 *
 * One deliberate deviation from the fact sheet: section 1 states the
 * shipped output is "hotter than premultiplied" (written RGB may exceed
 * written alpha), and section 4 confirms the light-mode branch never
 * multiplies RGB by alpha or brightness at all. That is exactly the pattern
 * that produces dark fringes on translucent edges once composited with a
 * `premultipliedAlpha: true` canvas context over a light page background --
 * see the doc on `ShaderCanvas`'s `fragment` prop. This port keeps every
 * other number and formula but replaces the final write with true
 * premultiplied output, `fragColor = vec4(rgb * alpha, alpha)`.
 *
 * Uniforms are declared by ShaderCanvas. Do not declare them here.
 *
 * Uniform contract (see the module doc in the Task 14 report for the full
 * per-state table):
 *   uColor       vec3  -- accent RGB, 0..1.
 *   uIntensity   float -- brightness/gain, fact sheet section 5's
 *                         "brightness" column directly (roughly 0.5..2.5,
 *                         NOT the 0..1 convention other variants use).
 *   uSpeed       float -- octave phase rate in rad/s, fact sheet section
 *                         5's `S / 20` directly (roughly 0.5..3.5).
 *   uComplexity  float -- warp spatial-frequency parameter, fact sheet
 *                         section 5's `freqParam` directly (roughly
 *                         0.4..1.25, default 0.5); mapped internally to
 *                         F = 2 + 13 * uComplexity.
 *   uAmplitude   float -- warp displacement amplitude, fact sheet section
 *                         5's `amplitude` column directly (roughly
 *                         0.5..1.2, default 1.0).
 *   uScale       float -- ring radius, fraction of half-canvas, fact sheet
 *                         section 5's `scale` column directly (0.2..0.3).
 *                         The caller is responsible for folding in the
 *                         instant voice-driven growth
 *                         (`0.2 + 0.2 * volume`, speaking state only,
 *                         fact sheet section 5) before setting this --
 *                         the shader does not read a separate volume
 *                         uniform to avoid double-applying it.
 *   uTheme       float -- < 0.5 selects the dark colour pipeline, >= 0.5
 *                         the light one (fact sheet section 4). This is a
 *                         genuine branch in the math, not just a
 *                         compositing background -- set it from the kit's
 *                         active theme, not a fixed constant.
 */
export default `
const float PI = 3.14159265359;
// Strand phase span: 0.5 + pi (fact sheet section 2's "sigma", the
// midpoint of the interval [1, 2*pi] with the interpolation knob fixed
// at 0.5).
const float STRAND_SIGMA = 0.5 + PI;
const int STRAND_COUNT = 36;

// 4-octave directional-sine warp cascade. M0 and the per-octave rotation B
// (cos 0.6, sin 0.8, an exact ~53.13 degree rotation) are fact sheet
// section 2's stated matrices; M1/M2/M3 = B composed with the previous
// octave's matrix, and each v_k is the first row of M_k. Hand-derived and
// checked against the fact sheet's own listed v_0..v_3 below, not copied
// from any source.
const mat2 WARP_M0 = mat2(0.6, 0.25, -0.25, 0.9);
const mat2 WARP_M1 = mat2(0.16, 0.63, -0.87, 0.34);
const mat2 WARP_M2 = mat2(-0.408, 0.506, -0.794, -0.492);
const mat2 WARP_M3 = mat2(-0.6496, -0.0228, -0.0828, -0.9304);
const vec2 WARP_V0 = vec2(0.600, -0.250);
const vec2 WARP_V1 = vec2(0.160, -0.870);
const vec2 WARP_V2 = vec2(-0.408, -0.794);
const vec2 WARP_V3 = vec2(-0.650, -0.083);

// Displaces p through all 4 octaves. Octave k's phase carries k*tau, so
// octave 0 is static in time and octave 3 moves fastest -- fine
// corrugation slides across coarse folds, which reads as flowing wind
// (fact sheet section 2, "Mechanism of the fold / wind").
vec2 auroraWarp(vec2 p, float phi, float tau, float freq, float amp) {
  vec2 x = p;
  float f = freq;
  float a = amp;

  vec2 q = WARP_M0 * x;
  vec2 w = sin(f * q + vec2(phi));
  x += (a / f) * WARP_V0 * w;
  f *= 1.4;
  a *= 1.0 + 0.1 * (max(w.x, w.y) - 1.0);

  q = WARP_M1 * x;
  w = sin(f * q + vec2(tau + phi));
  x += (a / f) * WARP_V1 * w;
  f *= 1.4;
  a *= 1.0 + 0.1 * (max(w.x, w.y) - 1.0);

  q = WARP_M2 * x;
  w = sin(f * q + vec2(2.0 * tau + phi));
  x += (a / f) * WARP_V2 * w;
  f *= 1.4;
  a *= 1.0 + 0.1 * (max(w.x, w.y) - 1.0);

  q = WARP_M3 * x;
  w = sin(f * q + vec2(3.0 * tau + phi));
  x += (a / f) * WARP_V3 * w;

  return x;
}

vec3 auroraRgb2Hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1.0e-10)), d / (q.x + 1.0e-10), q.x);
}

vec3 auroraHsv2Rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // Fact sheet section 2: u in [0,1]^2, centered point p = u - 0.5, no
  // aspect correction -- the element is forced square by CSS, so this is
  // only correct on a square canvas (true for every audio-visualizer size).
  vec2 uv = fragCoord / iResolution.xy;
  vec2 p = uv - 0.5;

  float tau = iTime * uSpeed;
  float freq = max(2.0 + 13.0 * uComplexity, 1.0);
  float amp = uAmplitude;
  float ringRadius = uScale;

  vec3 hsv = auroraRgb2Hsv(uColor);
  // Chain-seed strand, phase -1/36 NOT scaled by STRAND_SIGMA (fact sheet
  // section 2), so inter-strand spacing is defined for strand 1 too.
  vec2 prevStrand = auroraWarp(p, -1.0 / float(STRAND_COUNT), tau, freq, amp);

  vec3 accum = vec3(0.0);
  for (int j = 1; j <= STRAND_COUNT; j++) {
    float frac = float(j) / float(STRAND_COUNT);
    float phi = frac * STRAND_SIGMA;
    vec2 strand = auroraWarp(p, phi, tau, freq, amp);

    // Distance to the (warped) ring, per strand.
    float dist = abs(length(strand) - ringRadius);
    // Inter-strand spacing through the chain: an analytic blur exactly
    // proportional to how far this strand's warp has drifted from its
    // neighbour's. Fanned regions (large spacing) fuse into soft veils;
    // bunched regions (small spacing) stay crisp -- this is what turns 36
    // discrete rings into an aurora (fact sheet section 2).
    float spacing = length(strand - prevStrand);
    float edgeWidth = 0.01 + max(exp(2.0 * spacing) - 1.0, 0.001);
    float coverage = 1.0 - smoothstep(0.0, 1.0, dist / edgeWidth);

    // Fixed hue drift across the strand fan, matching the fact sheet's
    // documented colorShift default (0.05 turns at weight 0.3, i.e. 0.015
    // turns end to end); earliest strand shifts most.
    vec3 strandColor = auroraHsv2Rgb(vec3(fract(hsv.x + (1.0 - frac) * 0.015), hsv.y, hsv.z));
    accum += coverage * strandColor;
    prevStrand = strand;
  }

  // Mean soft coverage across all 36 strands (fact sheet section 2's image
  // accumulator I). The inverse-distance glow accumulator G is omitted: the
  // fact sheet states its gain ships as 0, so it contributes nothing.
  vec3 image = accum / float(STRAND_COUNT);

  // Deterministic per-pixel dither, +/- 1/510, identical on all channels
  // (fact sheet section 3). Kept as a plain vec3 offset, not pre-mixed into
  // the image accumulator, so each branch can add it at the point the fact
  // sheet actually specifies (see the dark branch below).
  float n = fract(sin(dot(fragCoord, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 dither = vec3((n - 0.5) / 255.0);

  float brightness = uIntensity;
  vec3 rgb;
  float alpha;

  if (uTheme < 0.5) {
    // Dark pipeline (fact sheet section 4): RGB1 = 1.2 * I, THEN add
    // dither, THEN tonemap -- dither is added after the pre-gain, not
    // before, so its written amplitude stays +/- 1/510 rather than being
    // scaled up by the 1.2 pre-gain too.
    vec3 x1 = 1.2 * image + dither;
    vec3 tm = 4.0 * x1 / (1.0 + 4.0 * x1);
    float luma = dot(tm, vec3(0.299, 0.587, 0.114));
    // Clamped to [0,1] before the premultiply below, mirroring the light
    // branch. tm approaches but is not strictly bounded under 1/brightness,
    // and uIntensity reaches 2.5 at the thinking/connecting pulse peaks, so
    // tm * brightness can exceed 1 for achievable inputs. Unclamped, that
    // would write rgb > alpha once premultiplied -- exactly the "hotter
    // than premultiplied" state this port exists to eliminate, and what
    // the fact sheet's own "nothing is ever white" measured fact forbids.
    rgb = clamp(tm * brightness, 0.0, 1.0);
    alpha = clamp(luma * brightness, 0.0, 1.0);
  } else {
    // Light pipeline (fact sheet section 4): RGB1 = I, then add dither;
    // brightness curve on vector length, hue direction kept, saturation
    // extrapolated 3x about gray.
    vec3 x1 = image + dither;
    float mag = length(x1);
    vec3 dir = x1 / max(mag, 1.0e-5);
    float mag2 = 2.0 * mag / (1.0 + 2.0 * mag);
    vec3 x2 = dir * mag2;
    float gray = dot(x2, vec3(0.2, 0.5, 0.1));
    rgb = clamp(vec3(gray) + 3.0 * (x2 - vec3(gray)), 0.0, 1.0);
    alpha = clamp(mag2 * clamp(brightness, 1.0, 2.0), 0.0, 1.0);
  }

  // PREMULTIPLIED output. Both branches above clamp their natural rgb to
  // [0,1] before this line, which is what makes rgb * alpha <= alpha
  // (componentwise) a property the code enforces unconditionally, not one
  // that happens to hold for the inputs this was tested against. See the
  // module doc above for why this departs from the fact sheet's own
  // (deliberately non-premultiplied) pipeline.
  fragColor = vec4(rgb * alpha, alpha);
}
`;
