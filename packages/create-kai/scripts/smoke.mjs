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
 *
 * AND `npm run build` IS NOT ALWAYS A TYPECHECK. Six starters chain or embed a
 * checker in their build; TanStack Start's is a bare `vite build`, which strips
 * types with esbuild rather than checking them. Running only `build` there would
 * print a green tick over a project that does not compile — the same shape of
 * vacuous pass as the two above. `src/starter-scripts.ts` decides which scripts
 * to run from the emitted project's own package.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

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

/**
 * Load one of the CLI's own TypeScript modules, the way `scripts/build.mjs`
 * does, so the rule below is read from `src/` rather than restated here.
 */
async function loadTs(relative) {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, relative)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    external: ['zod'],
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  );
}

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

    const { scriptsToRun } = await loadTs('src/starter-scripts.ts');

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

      // WHICH SCRIPTS ACTUALLY PROVE IT COMPILES. `npm run build` alone is not
      // the answer for every framework: TanStack Start's build is a bare
      // `vite build`, and Vite strips types with esbuild rather than checking
      // them, so a project with type errors bundles green. `scriptsToRun` reads
      // the emitted project's own package.json and adds `typecheck` when the
      // build does not reach a checker — build FIRST, because TanStack's
      // `tsc --noEmit` reads a routeTree the build generates.
      const emittedScripts = JSON.parse(
        await readFile(path.join(appDir, 'package.json'), 'utf8'),
      ).scripts;
      const toRun = scriptsToRun(emittedScripts ?? {});

      for (const script of toRun) {
        step(`${script === 'build' ? 'building' : 'typechecking'} ${label} (its own \`${script}\` script, over the real installed kit)`);
        sh('npm', ['run', script], appDir);
      }

      console.log(`\n✓ ${label} installs and passes ${toRun.map((s) => `\`${s}\``).join(' + ')}`);
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
