/**
 * Oscilloscope wave fragment shader.
 *
 * Copied verbatim from livekit/components-js
 * `packages/shadcn/components/agents-ui/agent-audio-visualizer-wave.tsx`
 * (Apache License 2.0). Unmodified apart from being extracted to its own
 * module: no GLSL lines were added, removed, or reformatted. The source
 * contained no `uniform ...;` declarations to strip -- `uFrequency`,
 * `uSpeed`, `uAmplitude`, `uLineWidth`, `uSmoothing`, `uColor`,
 * `uColorShift`, and `uMix` are all bound by the caller (see uses of
 * `ShaderCanvas` below), which is what declares them.
 *
 * Uniforms are declared by ShaderCanvas. Do not declare them here.
 */
export default `
const float TAU = 6.28318530718;

// Noise for dithering
vec2 randFibo(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.xx + p.yx) * p.xy);
}

// Luma for alpha
float luma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

// RGB to HSV
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// HSV to RGB
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Bell curve function for attenuation from center with rounded top
float bellCurve(float distanceFromCenter, float maxDistance) {
  float normalizedDistance = distanceFromCenter / maxDistance;
  // Use cosine with high power for smooth rounded top
  return pow(cos(normalizedDistance * (3.14159265359 / 4.0)), 16.0);
}

// Calculate the sine wave
float oscilloscopeWave(float x, float centerX, float time) {
  float relativeX = x - centerX;
  float maxDistance = centerX;
  float distanceFromCenter = abs(relativeX);

  // Apply bell curve for amplitude attenuation
  float bell = bellCurve(distanceFromCenter, maxDistance);

  // Calculate wave with uniforms and bell curve attenuation
  float wave = sin(relativeX * uFrequency + time * uSpeed) * uAmplitude * bell;

  return wave;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 pos = uv - 0.5;

  // Calculate center and positions
  float centerX = 0.5;
  float centerY = 0.5;
  float x = uv.x;
  float y = uv.y;

  // Convert line width from pixels to UV space
  // Use the average of width and height to handle aspect ratio
  float pixelSize = 2.0 / (iResolution.x + iResolution.y);
  float lineWidthUV = uLineWidth * pixelSize;
  float smoothingUV = uSmoothing * pixelSize;

  // Find minimum distance to the wave by sampling nearby points
  // This gives us consistent line width without high-frequency artifacts
  const int NUM_SAMPLES = 50; // Must be const for GLSL loop
  float minDist = 1000.0;
  float sampleRange = 0.02; // Range to search for closest point

  for(int i = 0; i < NUM_SAMPLES; i++) {
    float offset = (float(i) / float(NUM_SAMPLES - 1) - 0.5) * sampleRange;
    float sampleX = x + offset;
    float waveY = centerY + oscilloscopeWave(sampleX, centerX, iTime);

    // Calculate distance from current pixel to this point on the wave
    vec2 wavePoint = vec2(sampleX, waveY);
    vec2 currentPoint = vec2(x, y);
    float dist = distance(currentPoint, wavePoint);

    minDist = min(minDist, dist);
  }

  // Solid line with smooth edges using minimum distance
  float line = smoothstep(lineWidthUV + smoothingUV, lineWidthUV - smoothingUV, minDist);

  vec3 color = uColor;
  if(abs(uColorShift) > 0.01) {
    // Keep the center 50% at base color, then ramp shift across outer 25% on each side.
    float centerBandHalfWidth = 0.2;
    float edgeBandWidth = 0.5;
    float distanceFromCenter = abs(x - centerX);
    float edgeFactor = clamp((distanceFromCenter - centerBandHalfWidth) / edgeBandWidth, 0.0, 1.0);
    vec3 hsv = rgb2hsv(color);
    // Hue shift is zero in the center band and strongest at far edges.
    hsv.x = fract(hsv.x + edgeFactor * uColorShift * 0.3);
    color = hsv2rgb(hsv);
  }

  // Apply line intensity
  color *= line;

  // Add dithering for smoother gradients
  // color += (randFibo(fragCoord).x - 0.5) / 255.0;

  // Calculate alpha based on line intensity
  float alpha = line * uMix;

  fragColor = vec4(color * uMix, alpha);
}`;
