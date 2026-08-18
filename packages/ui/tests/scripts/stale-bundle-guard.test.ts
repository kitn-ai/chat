/**
 * The stale-bundle guard's EXCLUSION SET — the thing that has been wrong twice.
 *
 * `tests/e2e/hover-card-global-setup.ts` refuses to run the hover-card suite
 * against a bundle older than the source it claims to test. Twice it counted
 * build OUTPUTS written into `src/` as if they were source edits, and the second
 * version broke a required CI job on an unrelated PR:
 *
 *   STALE BUNDLE — refusing to run.
 *     src/elements/element-types.d.ts
 *     is 0s newer than the most recent build output (dist/llms/llms-full.txt).
 *
 * The exclusion is now DERIVED from `scripts/verify-generated-sync.mjs`, which
 * already owns the record of generated artifacts. These tests pin that
 * derivation: that it really reads the record, that it covers the file CI
 * tripped on, that it does NOT quietly widen to cover build INPUTS, and that a
 * record it cannot parse fails loudly instead of collapsing to an empty set —
 * an empty set restores the false positive silently, which is the worst
 * available outcome.
 *
 * The e2e setup is imported directly, which is only possible because it has no
 * top-level side effects. The script it READS (`verify-generated-sync.mjs`)
 * runs its guard and calls `process.exit` at module scope, which is exactly why
 * the setup parses that file instead of importing it.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedArtifacts } from '../e2e/hover-card-global-setup';

const PKG = resolve(fileURLToPath(import.meta.url), '../../..');

/** Write a throwaway record so a malformed shape can be exercised without
 *  touching the real one. */
function recordWith(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'stale-bundle-guard-'));
  const file = join(dir, 'verify-generated-sync.mjs');
  writeFileSync(file, body, 'utf8');
  return file;
}

describe('the stale-bundle guard derives its exclusions from the generated-artifact record', () => {
  it('reads real entries out of scripts/verify-generated-sync.mjs', () => {
    const excluded = generatedArtifacts();
    expect(excluded.size).toBeGreaterThan(0);
    // Absolute, repo-rooted — the record stores repo-relative paths.
    for (const p of excluded) expect(p.startsWith('/')).toBe(true);
  });

  it('excludes element-types.d.ts — the artifact that broke CI', () => {
    // The regression pin. This file is generated into `src/` by `build:api` in
    // POSTbuild, so it is always newer than the bundle on a clean build.
    expect(generatedArtifacts()).toContain(join(PKG, 'src/elements/element-types.d.ts'));
  });

  it('does NOT exclude build inputs that merely happen to be generated', () => {
    // Both are generated, and both are compiled INTO the bundle
    // (`compiled.css` as `?inline`). If either is newer than the bundle then the
    // bundle really is stale, so firing is correct and excluding them would
    // trade a false positive for a false negative.
    const excluded = generatedArtifacts();
    expect(excluded).not.toContain(join(PKG, 'src/elements/compiled.css'));
    expect(excluded).not.toContain(join(PKG, 'src/primitives/card-validate-schemas.ts'));
  });

  it('only ever excludes files the record names', () => {
    // Guards against the exclusion quietly widening: everything in the set must
    // be traceable to a `file:` entry, not to a rule invented here.
    const record = recordWith("const GENERATED = [{ file: 'packages/ui/src/only-this.json' }];\n");
    expect([...generatedArtifacts(record)]).toEqual([resolve(PKG, '../..', 'packages/ui/src/only-this.json')]);
  });
});

describe('an unreadable record fails loudly rather than excluding nothing', () => {
  // Each case would otherwise yield an empty exclusion set, which silently
  // restores the false positive that broke CI — the failure this whole file
  // exists to prevent has to be impossible to reach quietly.
  it('throws when the record has no GENERATED array', () => {
    expect(() => generatedArtifacts(recordWith('const OTHER = [];\n'))).toThrow(/GENERATED/);
  });

  it('throws when GENERATED is not an array literal', () => {
    expect(() => generatedArtifacts(recordWith('const GENERATED = buildList();\n'))).toThrow(
      /not as an array literal/,
    );
  });

  it('throws when GENERATED is empty', () => {
    expect(() => generatedArtifacts(recordWith('const GENERATED = [];\n'))).toThrow(/non-empty/);
  });

  it('throws when an entry has no string `file`', () => {
    expect(() => generatedArtifacts(recordWith('const GENERATED = [{ probe: 1 }];\n'))).toThrow(
      /no string `file`/,
    );
  });
});
