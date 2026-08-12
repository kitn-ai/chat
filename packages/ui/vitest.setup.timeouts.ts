/**
 * Applies the per-file budgets in `test-timeout-budgets.ts`.
 *
 * A setup file runs once per test file, inside that file's worker, before the
 * file itself is imported — so `vi.setConfig` here scopes the new budget to
 * exactly that file and nothing else. That is what lets the `unit` project
 * keep ONE strict default (5000ms) while a named handful of genuinely
 * expensive files get a declared, justified exception.
 *
 * Registered as `setupFiles` on the `unit` project in `vitest.config.ts`.
 */
import { expect, vi } from 'vitest';
import { budgetFor } from './test-timeout-budgets';

const testPath = expect.getState().testPath ?? '';
const budget = budgetFor(testPath);

if (budget) {
  // hookTimeout too: these files do the same expensive work in beforeEach /
  // beforeAll (the shader files import their module graph there), and a hook
  // that blows its own budget fails the file just as hard as a test that does.
  vi.setConfig({ testTimeout: budget.timeout, hookTimeout: budget.timeout });
}
