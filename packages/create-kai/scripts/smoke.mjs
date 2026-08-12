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
 *   node scripts/smoke.mjs                 # pack the workspace kit, scaffold, install, build
 *   node scripts/smoke.mjs --kit <spec>    # check some other kit (e.g. a published range)
 *   node scripts/smoke.mjs --keep          # leave the project on disk to `npm run dev`
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
const kitFlagIndex = argv.indexOf('--kit');
const kitOverride = kitFlagIndex >= 0 ? argv[kitFlagIndex + 1] : null;

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

    step('scaffolding the zero-config project');
    // No flags beyond the target and --yes: this is literally "Enter through
    // every prompt", which is the path the spec's goal is stated in terms of.
    sh(
      'node',
      [path.join(pkgRoot, 'dist/index.js'), 'smoke-app', '--yes', '--no-install', '--kit', kitSpec],
      work,
    );

    const appDir = path.join(work, 'smoke-app');
    step('installing');
    sh('npm', ['install', '--no-audit', '--no-fund'], appDir);

    step('building the emitted project (tsc -b && vite build)');
    sh('npm', ['run', 'build'], appDir);

    console.log(`\n✓ zero-config scaffold installs and builds`);
    if (keep) console.log(`  kept at ${appDir} — \`cd\` there and \`npm run dev\``);
  } catch (error) {
    failed = true;
    console.error(`\n✗ smoke failed: ${error.message}`);
  } finally {
    if (!keep) await rm(work, { recursive: true, force: true });
  }

  process.exit(failed ? 1 : 0);
}

main();
