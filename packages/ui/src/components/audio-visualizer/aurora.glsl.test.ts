import { describe, it, expect } from 'vitest';
import auroraShader from './aurora.glsl';

// jsdom has no WebGL, so these are the structural checks available without
// a GPU: no self-declared uniform (a compile-breaking redeclaration against
// ShaderCanvas's injected declarations, see shader-canvas.tsx), the required
// entry point, the expected uniform names, and -- readable straight off the
// final assignment -- that the output is premultiplied.
describe('aurora.glsl', () => {
  it('declares no uniform itself', () => {
    // Matches an actual `uniform <type> <name>` declaration line, not the
    // word "uniforms" inside a comment.
    expect(auroraShader).not.toMatch(/^\s*uniform\s+\w+\s+\w+/m);
  });

  it('defines mainImage, the entry point ShaderCanvas calls from its injected main()', () => {
    expect(auroraShader).toContain('void mainImage(out vec4 fragColor, in vec2 fragCoord)');
  });

  it('does not declare its own main(), which ShaderCanvas injects', () => {
    expect(auroraShader).not.toMatch(/void\s+main\s*\(\s*\)/);
  });

  it('references every uniform Task 15 must supply, so the two files cannot silently drift apart', () => {
    for (const name of [
      'uColor', 'uIntensity', 'uSpeed', 'uComplexity', 'uAmplitude', 'uScale', 'uTheme',
    ]) {
      expect(auroraShader).toContain(name);
    }
  });

  it('reads the ShaderToy built-ins ShaderCanvas provides (iResolution, iTime), not any it declares itself', () => {
    expect(auroraShader).toContain('iResolution');
    expect(auroraShader).toContain('iTime');
  });

  it('outputs premultiplied colour: fragColor = vec4(rgb * alpha, alpha), never vec4(rgb, alpha)', () => {
    expect(auroraShader).toMatch(/fragColor\s*=\s*vec4\(\s*rgb\s*\*\s*alpha\s*,\s*alpha\s*\)\s*;/);
  });

  it('has exactly one fragColor assignment, so the premultiplied form above is the only output path', () => {
    const matches = auroraShader.match(/fragColor\s*=/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('builds 36 strands from one warp function, not per-strand duplicated logic', () => {
    expect(auroraShader).toContain('STRAND_COUNT = 36');
    expect(auroraShader).toContain('auroraWarp(');
  });

  it('runs a 4-octave warp cascade (fact sheet section 2)', () => {
    for (const m of ['WARP_M0', 'WARP_M1', 'WARP_M2', 'WARP_M3']) {
      expect(auroraShader).toContain(m);
    }
  });
});
