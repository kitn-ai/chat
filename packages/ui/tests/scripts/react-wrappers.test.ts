import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../../frameworks/react/index.tsx'), 'utf8');

describe('generated React wrappers', () => {
  it('exports bare friendly names, not Kc-prefixed', () => {
    expect(src).toContain('export const Artifact = /*#__PURE__*/ createWebComponent<ArtifactProps, KaiArtifactElement>(');
    expect(src).not.toContain('export const KaiArtifact ');
  });
  it('still binds to the kai- custom element tag', () => {
    expect(src).toMatch(/export const Artifact[\s\S]*?'kai-artifact'/);
  });
});
