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

  it('declares no precision qualifier itself', () => {
    // ShaderCanvas injects `precision <lowp|mediump|highp> float;` ahead of
    // the built-ins and this file's body (see buildFragmentSource in
    // shader-canvas.tsx); a second declaration here would be redundant with
    // -- and could silently disagree with -- the one ShaderCanvas controls.
    expect(auroraShader).not.toMatch(/precision\s+(lowp|mediump|highp)\s+float\s*;/);
  });

  it('clamps rgb to [0,1] before the premultiply in BOTH colour-pipeline branches, not just one', () => {
    // Only a clamped natural colour in [0,1], multiplied by alpha at the
    // single shared premultiply line below, guarantees rgb*alpha <= alpha
    // (componentwise) -- a valid premultiplied pixel. A branch that skips
    // the clamp can write rgb > alpha for achievable inputs: this is exactly
    // what an earlier review round caught in the dark branch (`tm *
    // brightness` exceeding 1 at the thinking/connecting pulse peaks,
    // uIntensity up to 2.5, with no clamp before the multiply) -- the
    // "hotter than premultiplied" state this file exists to eliminate, and
    // what the fact sheet's own "nothing is ever white" measured fact
    // forbids. This test guards both branches so that regression can't come
    // back in either one, and can't be satisfied by clamping only one side.
    const ifIndex = auroraShader.indexOf('if (uTheme < 0.5) {');
    const elseIndex = auroraShader.indexOf('} else {');
    const premultiplyIndex = auroraShader.indexOf('fragColor = vec4(rgb * alpha, alpha)');
    expect(ifIndex).toBeGreaterThan(-1);
    expect(elseIndex).toBeGreaterThan(ifIndex);
    expect(premultiplyIndex).toBeGreaterThan(elseIndex);

    const darkBranch = auroraShader.slice(ifIndex, elseIndex);
    const lightBranch = auroraShader.slice(elseIndex, premultiplyIndex);

    expect(darkBranch).toMatch(/rgb\s*=\s*clamp\(/);
    expect(lightBranch).toMatch(/rgb\s*=\s*clamp\(/);

    // Belt and braces: exactly two clamped rgb assignments in the whole
    // file, so this can't quietly pass because both matches landed in the
    // same branch.
    const matches = auroraShader.match(/rgb\s*=\s*clamp\(/g) ?? [];
    expect(matches).toHaveLength(2);
  });
});
