/**
 * GUARD — the `emitted` project exists, is not empty, and something actually runs it.
 *
 * Moving the run-the-emitted-code guards out of `unit` makes the fast inner loop
 * fast. It also creates the one failure mode that is strictly worse than the 60s
 * budget it replaced: the emitted-code tests quietly stop running, `unit` gets
 * faster and greener, and a broken emit ships. A project nobody invokes looks
 * exactly like coverage from the outside.
 *
 * So this asserts the three ways that can happen, and it deliberately runs in the
 * `unit` project — not in `emitted` — because a check that lives inside the project
 * it is guarding is skipped by the very mistake it exists to catch.
 *
 *   1. The project has files. `include` is a glob; a rename empties it silently and
 *      an empty project EXITS ZERO. `vitest run --project=emitted` passing means
 *      nothing on its own.
 *   2. No `*.live.test.ts` lives outside the project's directory. Such a file is
 *      collected by `unit` instead, on the strict 5000ms default, where it flakes
 *      under load — which is how this whole entry started.
 *   3. The REQUIRED CI job runs the project. Not the storybook job, not a comment,
 *      not an npm script nobody calls: the `test` job in .github/workflows/test.yml,
 *      which is the context branch protection requires.
 *
 * Watched failing, per check, rather than assumed to fail — deleting the CI step
 * turns (3) red naming the project; see the commit that introduced this file.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMITTED_CODE_TEST_DIR,
  EMITTED_CODE_TEST_SUFFIX,
  EMITTED_PROJECT,
} from '../../emitted-code-tests';
import { requiredGateBlock } from '../../tests/scripts/lib/required-gate-block';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');

/** Every `.ts`/`.tsx` file under `dir`, package-relative, recursively. */
function filesUnder(dir: string): string[] {
  return readdirSync(resolve(pkgRoot, dir), { recursive: true, encoding: 'utf-8' })
    .map((entry) => entry.replaceAll('\\', '/'))
    .map((entry) => `${dir}/${entry}`);
}

describe('the `emitted` vitest project is wired up', () => {
  it('owns at least one test file, so the project cannot pass by being empty', () => {
    const owned = filesUnder(EMITTED_CODE_TEST_DIR).filter((f) =>
      f.endsWith(EMITTED_CODE_TEST_SUFFIX),
    );
    expect(
      owned,
      `no ${EMITTED_CODE_TEST_SUFFIX} files under ${EMITTED_CODE_TEST_DIR}/ — ` +
        `\`vitest run --project=${EMITTED_PROJECT}\` would exit 0 having run nothing`,
    ).not.toEqual([]);
  });

  it('is the only home for them — a stray one would fall back into `unit`', () => {
    // `mcp` is scanned as well as `tests` and `src` because the guards now LIVE
    // under `mcp/`: scanning only the two directories they used to sit beside
    // would leave the whole of their own tree unwatched, which is the half of
    // this check that a reader would assume was covered.
    const stray = [...filesUnder('tests'), ...filesUnder('src'), ...filesUnder('mcp')]
      .filter((f) => f.endsWith(EMITTED_CODE_TEST_SUFFIX))
      .filter((f) => !f.startsWith(`${EMITTED_CODE_TEST_DIR}/`));

    expect(
      stray,
      `these run-the-emitted-code tests are outside ${EMITTED_CODE_TEST_DIR}/, so the ` +
        `\`unit\` project collects them on its strict 5000ms budget: ${stray.join(', ')}`,
    ).toEqual([]);
  });

  it('is invoked by the REQUIRED `test` job in CI', () => {
    const block = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));

    // Two vacuity guards, and they answer different questions now that the gate
    // is a GRAPH. The empty check catches a renamed root job; the `--project=unit`
    // canary catches a graph that stopped reaching the leg that runs the suite,
    // which is what a dropped `needs:` edge looks like from in here.
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(
      block,
      'the required gate graph no longer runs the unit project either -- read this guard',
    ).toContain('--project=unit');

    expect(
      block,
      `the \`test\` job does not run \`--project=${EMITTED_PROJECT}\`. The emitted-code ` +
        `guards are the only check that the scaffolder's output RUNS; if CI stops ` +
        `invoking them the suite gets faster and greener while covering less.`,
    ).toContain(`--project=${EMITTED_PROJECT}`);
  });
});
