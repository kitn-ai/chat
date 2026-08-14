/**
 * GUARD — `verify-dts-boundaries` still DETECTS, and both places that run it still do.
 *
 * The guard itself walks every emitted .d.ts and asserts each relative specifier
 * resolves to real DECLARATIONS under both `bundler` and `nodenext` (ESM). It runs
 * in `postbuild` via `verify:dts` — so `prepublishOnly` reaches it — and again as its
 * own required-CI step.
 *
 * This file exists because of HOW that guard would be lost. Its own header records
 * the precedent: a hand-rolled stat list answered "does something plausible exist near
 * that path?" and passed green for MONTHS over a real TS7016, because
 * `dist/state/index.d.ts` satisfied the list while tsc took the sibling `dist/state.js`
 * and found no declarations beside it. A guard that agrees with itself rather than with
 * tsc is the failure mode, and it looks identical to a clean package from outside.
 *
 * So nothing here trusts the script's self-report. Each case RUNS it as a subprocess,
 * with NO `--self-test` flag, against a synthesized package root, and requires a
 * non-zero exit plus the right reason.
 *
 * THE DISARMED-COPY CONTROL. A fixture can go red for reasons that have nothing to do
 * with the analyzer — a crash, a missing file, a bad JSON parse — and that would look
 * exactly like detection. So each planted defect is ALSO run against a copy of the
 * script with its three finding-collectors neutered, and that copy must exit 0. If the
 * fixture were doing the work, the disarmed copy would still be red.
 *
 * Watched failing, per assertion: neutering `dangling.push` turns the TS7016 and TS2834
 * cases red; changing the final `process.exit(1)` to `process.exit(0)` turns every
 * planted-defect case red while the output still names the defect; dropping
 * `--self-test` from `verify:dts` or the step from `postbuild` turns the wiring cases
 * red. Each was performed.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/verify-dts-boundaries.mjs';
const NPM_SCRIPT = 'verify:dts';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/** Same crude job extraction as tests/scripts/silent-drop-guard-wiring.test.ts. */
function jobBlock(yaml: string, job: string): string {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}[A-Za-z0-9_-]+:/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** A throwaway package root the guard can be pointed at with `--package-root`. */
function fixtureRoot(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'dts-boundaries-guard-'));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

function run(script: string, args: string[]): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', [script, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const runGuard = (args: string[]) => run(resolve(pkgRoot, SCRIPT), args);

/**
 * The same script with every finding-collector neutered — the analyzer can no longer
 * report anything, while the file walk, the package.json read and the TS resolver all
 * still run. A defective fixture must go GREEN through this, which is what proves the
 * red above came from the analyzer rather than from the fixture being broken in some
 * unrelated way.
 */
let disarmedPath: string | null = null;
function disarmedCopy(): string {
  if (disarmedPath) return disarmedPath;
  const src = readFileSync(resolve(pkgRoot, SCRIPT), 'utf-8');
  let out = src;
  for (const collector of ['escapes.push(', 'dangling.push(', 'badSelfRefs.push(']) {
    expect(
      out.includes(collector),
      `the disarm target \`${collector}\` is not in ${SCRIPT} any more — this control is ` +
        `silently testing nothing. Re-point it at whatever collects findings now.`,
    ).toBe(true);
    out = out.split(collector).join('void (');
  }
  // The copy runs from the OS temp dir, where `import ts from 'typescript'` has no
  // node_modules to resolve against. Point it at the same typescript this package
  // uses instead of relocating the copy into the source tree.
  const tsEntry = createRequire(join(pkgRoot, 'package.json')).resolve('typescript');
  expect(out, `${SCRIPT} no longer imports typescript by bare specifier`).toContain("from 'typescript'");
  out = out.replace("from 'typescript'", `from ${JSON.stringify(pathToFileURL(tsEntry).href)}`);
  const dir = mkdtempSync(join(tmpdir(), 'dts-boundaries-disarmed-'));
  disarmedPath = join(dir, 'disarmed.mjs');
  writeFileSync(disarmedPath, out);
  return disarmedPath;
}

const healthy = (over: Record<string, string | null> = {}) => ({
  'package.json': JSON.stringify({
    name: '@kitn.ai/ui',
    type: 'module',
    exports: {
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './state': { types: './dist/state.d.ts', default: './dist/state.js' },
    },
  }),
  'dist/index.d.ts': "export * from './state.js';\n",
  'dist/state.d.ts': 'export type S = { a: number };\n',
  'dist/state.js': 'export const s = 1;\n',
  ...over,
});

/** Run a defective fixture through both the real guard and the disarmed copy. */
function bothWays(files: Record<string, string | null>) {
  const root = fixtureRoot(files);
  return {
    armed: runGuard(['--package-root', root]),
    disarmed: run(disarmedCopy(), ['--package-root', root]),
  };
}

describe('the dts-boundaries guard detects, and postbuild + CI run it', () => {
  it('ships the guard', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the check`, () => {
    const cmd = pkg.scripts[NPM_SCRIPT];
    expect(cmd, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      cmd,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. That half is what proves the resolver ` +
        `checks still DETECT; without it a walk that finds no files, or patterns that match no ` +
        `specifier, exits 0 and reads as a clean package.`,
    ).toContain('--self-test');
    expect(cmd, `\`${NPM_SCRIPT}\` no longer runs the check itself`).toContain(SCRIPT);
  });

  it('`postbuild` runs it, so `prepublishOnly` reaches it', () => {
    expect(
      pkg.scripts.postbuild,
      `\`postbuild\` no longer runs \`${NPM_SCRIPT}\`. That is the only thing standing between a ` +
        `dist/ whose declarations do not resolve and npm.`,
    ).toContain(`npm run ${NPM_SCRIPT}`);
  });

  it('is invoked by the REQUIRED `test` job in CI', () => {
    const block = jobBlock(readFileSync(WORKFLOW, 'utf-8'), 'test');
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(
      block,
      'the `test` job no longer runs the unit project either — read this guard',
    ).toContain('--project=unit');
    expect(
      block,
      `the \`test\` job does not run \`${NPM_SCRIPT}\`. postbuild alone would leave it running only ` +
        `where someone happens to build.`,
    ).toContain(NPM_SCRIPT);
  });

  it('passes on a healthy synthetic package, so the failures below mean something', () => {
    const { code, output } = runGuard(['--package-root', fixtureRoot(healthy())]);
    expect(code, `the guard failed a package with nothing wrong with it: ${output}`).toBe(0);
  });

  it('fires on a declaration that escapes dist/ into src/', () => {
    const { armed, disarmed } = bothWays(
      healthy({ 'dist/index.d.ts': "export type { M } from '../../src/elements/chat-types';\n" }),
    );
    expect(armed.code, `the guard exited ${armed.code} on a declaration reaching outside dist/`).not.toBe(0);
    expect(armed.output).toContain('ESCAPE dist/');
    expect(armed.output).toContain('../../src/elements/chat-types');
    expect(
      disarmed.code,
      'the DISARMED copy also failed, so this fixture is red for some reason other than the ' +
        'analyzer finding the planted defect',
    ).toBe(0);
  });

  it('fires on the directory-index TS7016 that shipped green for months', () => {
    // `dist/state.js` beside `dist/state/index.d.ts`: the old hand-rolled stat list
    // found the index and was satisfied; tsc takes the FILE and lands on JavaScript
    // with no declarations next to it.
    const { armed, disarmed } = bothWays(
      healthy({
        'dist/state.d.ts': null,
        'dist/state/index.d.ts': 'export type S = { a: number };\n',
        'dist/index.d.ts': "export * from './state';\n",
      }),
    );
    expect(armed.code, `the guard exited ${armed.code} on a specifier resolving to a .js`).not.toBe(0);
    expect(armed.output).toContain('TS7016');
    expect(armed.output).toContain('[bundler]');
    expect(disarmed.code, 'the DISARMED copy also failed — the fixture, not the analyzer, is red').toBe(0);
  });

  it('fires on an extensionless specifier that only nodenext rejects', () => {
    // The mode argument is what makes this visible at all: bundler resolves it fine,
    // and a consumer with skipLibCheck:true sees silence rather than an error.
    const { armed, disarmed } = bothWays(healthy({ 'dist/index.d.ts': "export * from './state';\n" }));
    expect(armed.code, `the guard exited ${armed.code} on an extensionless specifier`).not.toBe(0);
    expect(armed.output).toContain('[nodenext]');
    expect(armed.output).toContain('TS2834');
    expect(
      armed.output,
      'reported against bundler too — that mode resolves this fine, so the mode argument has ' +
        'stopped being applied',
    ).not.toContain('[bundler]');
    expect(disarmed.code, 'the DISARMED copy also failed — the fixture, not the analyzer, is red').toBe(0);
  });

  it('fires on a self-import of a subpath the exports map does not declare', () => {
    const { armed, disarmed } = bothWays(
      healthy({
        'dist/index.d.ts': "import type { X } from '@kitn.ai/ui/internal';\nexport * from './state.js';\nexport type { X2 } from './state.js';\n",
      }),
    );
    expect(armed.code, `the guard exited ${armed.code} on an undeclared self-import`).not.toBe(0);
    expect(armed.output).toContain('@kitn.ai/ui/internal');
    expect(disarmed.code, 'the DISARMED copy also failed — the fixture, not the analyzer, is red').toBe(0);
  });

  it('treats a dist/ with no .d.ts in it as a failure, not a pass', () => {
    // "0 emitted .d.ts files reference nothing outside dist/" is a true sentence
    // about any broken build, and it used to be the pass message.
    const root = fixtureRoot({
      'package.json': JSON.stringify({ name: '@kitn.ai/ui', type: 'module' }),
      'dist/index.js': 'export const x = 1;\n',
    });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, 'a zero-file run exited 0, which reads as "nothing is wrong"').not.toBe(0);
    expect(output).toContain('found NO .d.ts file');
  });

  it('treats a run that resolved no specifier at all as a failure, not a pass', () => {
    // Every resolution check is per relative specifier. None means the TS resolver
    // was never called, so the run proves nothing about resolution in either mode.
    const root = fixtureRoot(
      healthy({
        'dist/index.d.ts': 'export type A = 1;\n',
        'dist/state.d.ts': 'export type S = 2;\n',
      }),
    );
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, 'a run that called the resolver zero times exited 0').not.toBe(0);
    expect(output).toContain('NO relative specifier');
  });
});
