/**
 * GUARD — every per-file test-timeout exception must still point at a real file.
 *
 * The budgets in `test-timeout-budgets.ts` are matched by path suffix. That is
 * a string match, so renaming or moving one of the listed test files does not
 * break anything loudly: the entry simply stops matching, the file silently
 * drops back to the strict 5000ms default, and the timeout flake it was added
 * to fix comes back weeks later looking like a fresh mystery.
 *
 * This turns that into an immediate, obvious failure. It is deliberately the
 * cheapest possible check — an existence test — because its whole job is to
 * not go stale.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_TIMEOUT_BUDGETS, budgetFor } from '../test-timeout-budgets';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('per-file test-timeout budgets', () => {
  it('every entry points at a test file that still exists', () => {
    const missing = TEST_TIMEOUT_BUDGETS.filter(
      (budget) => !existsSync(resolve(pkgRoot, budget.file)),
    ).map((budget) => budget.file);

    expect(missing, `these budget entries no longer match a file (renamed? deleted?): ${missing.join(', ')}`)
      .toEqual([]);
  });

  it('every entry explains itself and asks for more than the default', () => {
    for (const budget of TEST_TIMEOUT_BUDGETS) {
      // A budget at or below the 5000ms default is dead weight pretending to
      // be an exception.
      expect(budget.timeout, `${budget.file} does not need an exception`).toBeGreaterThan(5_000);
      expect(budget.because.length, `${budget.file} must say why`).toBeGreaterThan(20);
    }
  });

  it('lists no duplicates, which would make the first entry silently win', () => {
    const files = TEST_TIMEOUT_BUDGETS.map((budget) => budget.file);
    expect(files).toEqual([...new Set(files)]);
  });

  // The suffix match must be anchored to a path segment: a bare `endsWith`
  // would let an entry for `variant-wave.test.tsx` also claim a hypothetical
  // `my-variant-wave.test.tsx`.
  it('matches the absolute paths vitest actually reports, and only those', () => {
    const entry = TEST_TIMEOUT_BUDGETS[0];
    expect(budgetFor(`${pkgRoot}/${entry.file}`)).toEqual(entry);
    expect(budgetFor(`${pkgRoot}/src/primitives/create-tween.test.ts`)).toBeUndefined();
  });
});
