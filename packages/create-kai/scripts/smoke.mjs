#!/usr/bin/env node
/**
 * The end-to-end smoke test: scaffold, install, BUILD.
 *
 * WHY A BUILD AND NOT A FILE-EXISTENCE CHECK. A CLI test that asserts files were
 * written proves nothing about whether the project runs — this repo has shipped
 * a scaffold that looked right and did nothing. `npm run build` runs `tsc -b`
 * over the emitted sources against the real installed kit, which is what caught
 * that the published kit predates the parts[] migration: nine type errors on a
 * project that had installed perfectly.
 *
 * It packs the WORKSPACE kit and installs that tarball through the CLI's own
 * `--kit` flag, so the emitted project goes through the same rewrite a user's
 * does rather than around it.
 *
 *   node scripts/smoke.mjs                      # pack the workspace kit, scaffold, install, build
 *   node scripts/smoke.mjs --kit <spec>         # check some other kit (e.g. a published range)
 *   node scripts/smoke.mjs --keep               # leave the project on disk to `npm run dev`
 *   node scripts/smoke.mjs --framework vue      # one framework
 *   node scripts/smoke.mjs --framework all      # every ready framework, in order
 *
 * WHY `--framework` EXISTS. This script is documented as how you find out
 * whether a newly-`ready` framework runs, and it took `--yes` with no framework
 * flag — which is the zero-config path, which is React. So it answered "does
 * React still build" no matter which framework you had just turned on. Vue was
 * turned on and smoked green here without a single Vue file being compiled.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pkgRoot, '../..');
const kitRoot = path.join(repoRoot, 'packages/ui');

const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const kitOverride = flag('kit');
const frameworkArg = flag('framework');

const step = (message) => console.log(`\n• ${message}`);
const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', encoding: 'utf8' });

async function main() {
  const work = await mkdtemp(path.join(tmpdir(), 'create-kai-smoke-'));
  let failed = false;

  try {
    let kitSpec = kitOverride;
    if (!kitSpec) {
      step('packing the workspace kit');
      const tarball = execFileSync('npm', ['pack', '--pack-destination', work], {
        cwd: kitRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      })
        .trim()
        .split('\n')
        .pop();
      kitSpec = `file:${path.join(work, tarball)}`;
    }
    console.log(`  kit: ${kitSpec}`);

    step('building create-kai');
    sh('node', [path.join(pkgRoot, 'scripts/build.mjs')], pkgRoot);

    // `--framework all` asks the CLI we just built which frameworks are ready,
    // through its own `--list --json` introspection rather than a list restated
    // here. So it widens on its own the moment a framework flips to `ready`, and
    // it cannot disagree with what the CLI actually offers.
    const targets =
      frameworkArg === 'all'
        ? JSON.parse(
            execFileSync('node', [path.join(pkgRoot, 'dist/index.js'), '--list', '--json'], {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'inherit'],
            }),
          ).frameworks
            .filter((f) => f.status === 'ready')
            .map((f) => f.id)
        : frameworkArg
          ? [frameworkArg]
          : [null];

    for (const framework of targets) {
      const label = framework ?? 'zero-config (react)';
      const appName = `smoke-${framework ?? 'default'}`;

      step(`scaffolding ${label}`);
      // Beyond the target, --yes and (optionally) --framework, no flags: this is
      // "Enter through every prompt", which is the path the spec's goal is
      // stated in terms of.
      sh(
        'node',
        [
          path.join(pkgRoot, 'dist/index.js'),
          appName,
          '--yes',
          '--no-install',
          '--kit',
          kitSpec,
          ...(framework ? ['--framework', framework] : []),
        ],
        work,
      );

      const appDir = path.join(work, appName);
      step(`installing ${label}`);
      sh('npm', ['install', '--no-audit', '--no-fund'], appDir);

      step(`building ${label} (its own build script, over the real installed kit)`);
      sh('npm', ['run', 'build'], appDir);

      console.log(`\n✓ ${label} installs and builds`);
      if (keep) console.log(`  kept at ${appDir} — \`cd\` there and \`npm run dev\``);
    }
  } catch (error) {
    failed = true;
    console.error(`\n✗ smoke failed: ${error.message}`);
  } finally {
    if (!keep) await rm(work, { recursive: true, force: true });
  }

  process.exit(failed ? 1 : 0);
}

main();
