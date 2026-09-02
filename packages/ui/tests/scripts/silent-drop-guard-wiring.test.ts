/**
 * GUARD — `lint:silent-drops` still DETECTS, and CI still runs it.
 *
 * The guard itself enforces CLAUDE.md's "decide loudly" corollary on `src/wire`,
 * where a dropped `MessagePart` variant is unrecoverable: the encoders turn parts
 * into a provider request, so a variant they do not encode is gone once the
 * request leaves the process. #186 shipped exactly that -- a user turn carrying
 * only an attachment encoded to nothing.
 *
 * This file exists because of HOW that guard would be lost. Not by someone
 * deleting it: by the `--self-test` half quietly dropping off the npm script, by
 * CI dropping the step, or by the analyzer degrading into a scan that matches
 * nothing and exits 0. All three make the suite faster and greener while covering
 * less, which is the exact shape of failure this repo keeps hitting, and a linter
 * that matches nothing looks identical to a clean tree from the outside.
 *
 * So the last two assertions do not trust the script's own self-report. They RUN
 * it against synthesized trees -- one that drops a variant, one where nothing
 * discriminates a part at all -- and require a non-zero exit from each.
 *
 * Watched failing, per assertion: deleting the `--self-test` half turns the
 * second red naming the script, deleting the CI step turns the third red naming
 * the job, and stubbing the analyzer's finding loop to `return []` turns the
 * fourth red while leaving every other test in this suite green.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredGateBlock } from './lib/required-gate-block';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/lint-silent-drops.mjs';
const NPM_SCRIPT = 'lint:silent-drops';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/** A throwaway package root the linter can be pointed at with `--package-root`. */
function fixtureRoot(wireSource: string): string {
  const root = mkdtempSync(join(tmpdir(), 'silent-drop-guard-'));
  mkdirSync(join(root, 'src/elements'), { recursive: true });
  mkdirSync(join(root, 'src/wire'), { recursive: true });
  writeFileSync(
    join(root, 'src/elements/chat-types.ts'),
    `export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool'; tool: unknown }
  | { type: 'card'; envelope: unknown }
  | { type: 'source'; source: unknown }
  | { type: 'file'; attachment: unknown };
`,
  );
  writeFileSync(join(root, 'src/wire/encode.ts'), wireSource);
  return root;
}

/** Runs the linter and returns its exit code plus combined output. */
function runLinter(args: string[]): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', [resolve(pkgRoot, SCRIPT), ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('the silent-drop guard detects, and CI runs it', () => {
  it('ships the linter', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it('`lint:silent-drops` runs the self-test half as well as the scan', () => {
    const script = pkg.scripts[NPM_SCRIPT];
    expect(script, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      script,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. That half is what proves the ` +
        `analyzer still DETECTS; without it a scan that silently matches nothing exits 0 ` +
        `and reads as a clean tree.`,
    ).toContain('--self-test');
    expect(script, `\`${NPM_SCRIPT}\` no longer runs the scan itself`).toContain(SCRIPT);
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
      `the \`test\` job does not run \`${NPM_SCRIPT}\`. It is the only check that a wire ` +
        `encoder accounts for every MessagePart variant; if CI stops invoking it, a turn ` +
        `can go back to encoding to nothing with nothing going red.`,
    ).toContain(NPM_SCRIPT);
  });

  it('actually fires on an encoder that drops a variant', () => {
    // The #186 shape: an exclusion guard that returns, dropping every variant it
    // did not name. Not a self-report -- the linter is run and must exit non-zero.
    const root = fixtureRoot(
      `import type { MessagePart } from '../elements/chat-types';
export function toWire(parts: MessagePart[]): string[] {
  const out: string[] = [];
  parts.forEach((part) => {
    if (part.type !== 'text') return;
    out.push(part.text);
  });
  return out;
}
`,
    );
    const { code, output } = runLinter(['--package-root', root]);
    expect(code, `the linter exited ${code} on an encoder that drops five variants`).not.toBe(0);
    expect(output).toContain('DROPS SILENTLY');
    expect(output).toContain('file');
  });

  it('treats a run that discriminates nothing as a failure, not a pass', () => {
    // A wire tree the analyzer finds no part dispatch in means the analyzer is
    // broken or the scope moved, NOT that the encoders are clean. Exiting 0 here
    // is this repo's most expensive recurring defect.
    const root = fixtureRoot(`export const bytes = (s: string): number => s.length;\n`);
    const { code, output } = runLinter(['--package-root', root]);
    expect(code, 'a zero-match run exited 0, which reads as "nothing was wrong"').not.toBe(0);
    expect(output).toContain('NO function that discriminates');
  });
});
