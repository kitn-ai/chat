import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Invariant } from './catalog-types';
import { invariants, listInvariants } from './invariants';

// Paths convention, fixed here: `test`/`structural` paths are REPO-relative (they
// may point outside packages/ui, e.g. at a root doc), `lint` scripts are script
// names in packages/ui/package.json.
const PKG = join(__dirname, '..', '..', '..');
const REPO = join(PKG, '..', '..');

describe('invariant records', () => {
  it('carries the seven seed invariants from spec §5', () => {
    expect(invariants.map((i) => i.id).sort()).toEqual([
      'events-non-bubbling',
      'host-coordinates',
      'kit-parses-consumer-fetches',
      'props-not-attributes',
      'reactivity-two-halves',
      'untrusted-model-output',
      'upgrade-race',
    ]);
  });

  it('every record parses; every enforcedBy pointer resolves against the tree', () => {
    // Non-vacuity guard, same reasoning as scenarios.test.ts: `listInvariants()`
    // has ALREADY parsed, so on an empty list the loop body never runs and every
    // expect() below is skipped. Pin the parsed count to the authored count.
    const parsed = listInvariants();
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.length).toBe(invariants.length);
    for (const inv of parsed) {
      expect(() => Invariant.parse(inv)).not.toThrow();
      const e = inv.enforcedBy;
      if (e.kind === 'test' || e.kind === 'structural') {
        for (const p of e.kind === 'test' ? e.paths : [e.path]) {
          expect(existsSync(join(REPO, p)), `${inv.id}: ${p} does not exist`).toBe(true);
        }
      }
      if (e.kind === 'lint') {
        const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
        expect(pkg.scripts[e.script], `${inv.id}: no script ${e.script}`).toBeDefined();
      }
    }
  });

  it('open status and enforcedBy none travel together', () => {
    const parsed = listInvariants();
    expect(parsed.length).toBeGreaterThan(0);
    for (const inv of parsed) {
      expect(inv.status === 'open').toBe(inv.enforcedBy.kind === 'none');
    }
  });

  it('upgrade-race stays open until #99 option B, and says so', () => {
    const race = listInvariants().find((i) => i.id === 'upgrade-race');
    expect(race?.status).toBe('open');
    expect(race?.enforcedBy).toEqual({ kind: 'none', until: 'issue #99 option B lands in defineWebComponent' });
  });

  // The wrong/right pairs are the part a weak model can actually use, and Task 9
  // builds a self-audit checklist out of them (search the emitted code for the
  // `wrong` form, expect zero hits). An enforced invariant with no pair silently
  // demotes itself to prose, so make that a failure.
  it('every enforced invariant carries at least one wrong/right pair', () => {
    const enforced = listInvariants().filter((i) => i.status === 'enforced');
    expect(enforced.length).toBeGreaterThan(0);
    for (const inv of enforced) {
      expect(inv.examples.length, `${inv.id}: no wrong/right pair`).toBeGreaterThan(0);
      for (const ex of inv.examples) {
        // Both halves must be present and DIFFERENT: a pair whose wrong form
        // equals its right form teaches nothing and would make the Task 9
        // checklist match correct output.
        expect(ex.wrong.trim().length, `${inv.id}: empty wrong`).toBeGreaterThan(0);
        expect(ex.right.trim().length, `${inv.id}: empty right`).toBeGreaterThan(0);
        expect(ex.wrong, `${inv.id}: wrong and right are identical`).not.toBe(ex.right);
      }
    }
  });
});
