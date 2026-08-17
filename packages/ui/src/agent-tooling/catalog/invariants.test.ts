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

  it('open status and enforcedBy none travel together, and partial is a live member', () => {
    const parsed = listInvariants();
    expect(parsed.length).toBeGreaterThan(0);
    for (const inv of parsed) {
      // Failure message names the record: without it this reads "expected true
      // to be false" over seven identical-looking iterations.
      expect(inv.status === 'open', `${inv.id}: status ${inv.status} vs enforcedBy ${inv.enforcedBy.kind}`).toBe(
        inv.enforcedBy.kind === 'none',
      );
    }
    // `partial` exists because two records were `enforced` while the half of
    // their statement a consumer acts on had no check. If nothing is partial,
    // either the enum member is dead or a record has been quietly promoted.
    expect(parsed.filter((i) => i.status === 'partial').length).toBeGreaterThan(0);
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
  it('every invariant carries at least one wrong/right pair', () => {
    // EVERY record, not just the enforced ones. An unenforced invariant needs
    // the concrete pair MORE, not less: it is the only thing standing between a
    // weak model and the mistake, since no guard will catch it afterwards.
    const parsed = listInvariants();
    expect(parsed.length).toBeGreaterThan(0);
    for (const inv of parsed) {
      expect(inv.examples.length, `${inv.id}: no wrong/right pair`).toBeGreaterThan(0);
      for (const ex of inv.examples) {
        // Both halves present and DIFFERENT: a pair whose wrong form equals its
        // right form teaches nothing and would make the checklist match correct
        // output.
        expect(ex.wrong.trim().length, `${inv.id}: empty wrong`).toBeGreaterThan(0);
        expect(ex.right.trim().length, `${inv.id}: empty right`).toBeGreaterThan(0);
        expect(ex.wrong, `${inv.id}: wrong and right are identical`).not.toBe(ex.right);
      }
    }
  });

  // Greppability was asserted in a doc comment and enforced nowhere, which is the
  // failure this repo already learned from lint-silent-drops' waivers: prose does
  // not hold. Task 9's self-audit is line-oriented, so these three properties are
  // what make "search the output for the wrong form, expect zero hits" sound.
  it('every wrong form is mechanically searchable', () => {
    const parsed = listInvariants();
    expect(parsed.length).toBeGreaterThan(0);
    let checked = 0;
    for (const inv of parsed) {
      for (const ex of inv.examples) {
        checked++;
        // 1. Single line: a line-oriented grep cannot match across a newline.
        expect(ex.wrong.includes('\n'), `${inv.id}: multi-line wrong: ${ex.wrong}`).toBe(false);
        // 2. No line comment. A `wrong` that only reads as wrong because of an
        //    explanatory comment can never appear in generated output, so it
        //    would be unfindable by construction.
        //    NOT a bare `includes('//')`: `https://api.example.com` contains one
        //    legitimately, and the naive check false-fires on a real URL in a
        //    fetch example. Match `//` only where it is NOT scheme punctuation.
        expect(/(^|[^:])\/\//.test(ex.wrong), `${inv.id}: wrong carries a comment: ${ex.wrong}`).toBe(false);
        // 3. No line of `wrong` may appear verbatim in `right`, or the audit
        //    fires on CORRECT output. This is what caught upgrade-race, whose
        //    wrong form was a line-subset of its own right form.
        for (const line of ex.wrong.split('\n')) {
          const needle = line.trim();
          expect(ex.right.includes(needle), `${inv.id}: wrong line appears verbatim in right: ${needle}`).toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(parsed.length - 1);
  });
});
