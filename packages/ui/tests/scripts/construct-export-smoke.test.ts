/**
 * Smoke test for the public `@kitn.ai/ui/construct` entry (dist/construct.js).
 *
 * Task 2 (create-kai's construct wizard) imports this at BUILD time to bundle
 * `ConstructSchema` — so the guarantee this test pins is narrow but load-bearing:
 * the built JS module actually exports the names the exports-map contract
 * promises, and a valid construct really does parse through it. This is a
 * dynamic import of the real built artifact (needs `nx build ui` first), not a
 * source-level import — the schemas-exported guard's whole point (see
 * schemas-exported-guard-wiring.test.ts) is that "present in src" and
 * "reachable from the built package" are different claims.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distEntry = resolve(pkgRoot, 'dist/construct.js');

describe('dist/construct.js (built ./construct export)', () => {
  it('exists — run `nx build ui` first if this fails', () => {
    expect(existsSync(distEntry), `${distEntry} is missing; run \`nx build ui\` first`).toBe(true);
  });

  it('exports ConstructSchema, validateConstruct, CONSTRUCT_SCHEMA_URL, and parses a valid construct', async () => {
    const mod = await import(pathToFileURL(distEntry).href);
    expect(typeof mod.validateConstruct).toBe('function');
    expect(typeof mod.CONSTRUCT_SCHEMA_URL).toBe('string');
    expect(mod.ConstructSchema).toBeTruthy();

    const result = mod.ConstructSchema.safeParse({
      name: 'acme-support',
      layout: 'widget',
      provider: { mode: 'mock' },
    });
    expect(result.success, result.success ? '' : JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('is declared in package.json exports as "./construct" (types + default)', () => {
    const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8'));
    expect(pkg.exports['./construct']).toBeTruthy();
    expect(pkg.exports['./construct'].default).toBe('./dist/construct.js');
    expect(pkg.exports['./construct'].types).toBe('./dist/agent-tooling/construct/public.d.ts');
  });
});
