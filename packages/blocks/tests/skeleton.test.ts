import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('the package skeleton', () => {
  it('exports "." at a real source path read out of the exports map', () => {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), 'utf8')) as {
      exports: Record<string, { default: string }>;
    };
    expect(pkg.exports['.'].default).toBe('./src/registry.ts');
    expect(pkg.exports['./forms'].default).toBe('./src/forms.ts');
  });
});
