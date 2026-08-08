import { describe, it, expect } from 'vitest';
import waveShader from './wave.glsl';

// Guards the one contract most likely to break silently if this file is ever
// hand-edited: `ShaderCanvas` injects every `uniform ...;` declaration itself
// (see shader-canvas.tsx), so a shader that also declares one fails to
// compile in the browser -- a failure jsdom cannot surface, since it has no
// WebGL at all. These tests are the only regression guard for that.
describe('wave.glsl', () => {
  it('declares no uniform itself', () => {
    // Matches an actual `uniform <type> <name>` declaration line, not the
    // word "uniforms" inside a comment -- the upstream source has exactly
    // one of those ("Calculate wave with uniforms and bell curve
    // attenuation"), which must NOT trip this check.
    expect(waveShader).not.toMatch(/^\s*uniform\s+\w+\s+\w+/m);
  });

  it('starts at the first definition and ends after mainImage\'s closing brace, per the upstream extraction', () => {
    expect(waveShader.trim().startsWith('const float TAU')).toBe(true);
    expect(waveShader.trim().endsWith('}')).toBe(true);
  });

  it('defines mainImage, the entry point ShaderCanvas calls from its injected main()', () => {
    expect(waveShader).toContain('void mainImage(out vec4 fragColor, in vec2 fragCoord)');
  });

  it('references every uniform the variant supplies, so the two files cannot silently drift apart', () => {
    for (const name of [
      'uSpeed', 'uAmplitude', 'uFrequency', 'uMix',
      'uLineWidth', 'uSmoothing', 'uColor', 'uColorShift',
    ]) {
      expect(waveShader).toContain(name);
    }
  });

  it('reads the ShaderToy built-ins ShaderCanvas provides (iResolution, iTime), not any it declares itself', () => {
    expect(waveShader).toContain('iResolution');
    expect(waveShader).toContain('iTime');
  });
});
