#!/usr/bin/env node
/**
 * Build `create-kai` into a single bundled file plus its templates.
 *
 * Three jobs, in order:
 *   1. Copy `examples/starters/<dir>` for every READY framework into
 *      `dist/templates/`. The starters are the single source of truth for how a
 *      consumer wires the kit, and they are CI-built, so drift is caught there.
 *   2. Verify every template patch still matches the file it patches, and fail
 *      loudly if one does not. A patch that silently stops matching ships a
 *      `workspace:*` instruction into a user's project. Then check the PATCHED
 *      result against `src/template-guards.ts` — the patches you did not write
 *      are the ones that ship the defect, so the output is what gets graded.
 *   3. Bundle `src/index.ts` to one zero-dependency ESM file, so `npx` cold
 *      start is fast. `@clack/prompts` and `picocolors` are bundled in; so is
 *      the kit's `agent-tooling` catalog, which is why the CLI can hand out real
 *      `Integration` objects without depending on `@kitn.ai/ui` at runtime.
 *
 * THE RULES THEMSELVES ARE NOT IN THIS FILE, and that is deliberate. This module
 * ends in `main().catch(...)`, so importing it runs a build — nothing here can
 * be reached from a test, and a check nobody can watch fail is a check nobody
 * should trust. Every rule lives in `src/build-guards.ts` (structural) or
 * `src/template-guards.ts` (content), where `test/build-guards.test.ts` and
 * `test/template-guards.test.ts` drive each one directly. What is left here is
 * the filesystem: copy the tree, read the bytes, hand them to a rule, throw what
 * it returns.
 */
import { chmod, cp, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const repoRoot = path.resolve(pkgRoot, '../..');
const startersRoot = path.join(repoRoot, 'examples/starters');
const dist = path.join(pkgRoot, 'dist');
const templatesOut = path.join(dist, 'templates');

/**
 * Never copied into a template: build output, installed deps, editor cruft —
 * and lockfiles.
 *
 * A LOCKFILE IS STALE THE MOMENT IT IS COPIED, so shipping one is strictly worse
 * than shipping none. The emitted project's dependency set is not the starter's:
 * `rewritePackageJson` replaces the `@kitn.ai/ui` spec (a monorepo-local
 * `file:../../../packages/ui` or `workspace:*` becomes a real range) and adds
 * the chosen gateway's deps. A copied lockfile still pins the old one, so
 * `npm ci` refuses the package.json/lock mismatch outright and `npm install`
 * resolves the kit from a path that climbed out of the user's project.
 *
 * Only the two STANDALONE starters have one today (nextjs, tanstack-start), and
 * neither is `ready` — so this is a latent bug, caught by the `file:` pattern in
 * `REPO_INTERNAL` (src/template-guards.ts) rather than by review. create-vite
 * ships no lockfile for the same reason: the first `npm install` is what should
 * write it.
 */
const SKIP = new Set([
  'node_modules',
  'dist',
  '.next',
  '.vite',
  '.turbo',
  '.angular',
  'README.md',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
]);

async function loadTs(relative) {
  // The framework table and the patch table are TypeScript the CLI owns. The
  // build reads them rather than restating which templates to copy or which
  // patches to check — a second list is how a framework flips to `ready` with no
  // template behind it.
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, relative)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    // The catalog reaches into the kit's source; nothing in the two tables we
    // load here needs it at runtime, so keep the temp module small.
    external: ['zod'],
  });
  const code = built.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

/**
 * Copy one starter into `dist/templates/`. Filesystem only — the requirement
 * that it carry a `.gitignore` is a RULE, and lives in `src/build-guards.ts`
 * with the others where a test can drive it. `main()` checks it against the
 * copied tree and then does the rename.
 */
async function copyTemplate(templateDir) {
  const from = path.join(startersRoot, templateDir);
  const to = path.join(templatesOut, templateDir);
  if (!existsSync(from)) {
    throw new Error(`create-kai build: no starter at ${from}`);
  }
  await cp(from, to, {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)),
  });
  return to;
}

/** Every file under `dir`, absolute, ignoring nothing (templates are small). */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(abs)));
    else out.push(abs);
  }
  return out;
}

/**
 * Every file under `root`, as a `[relative path, contents]` pair.
 *
 * Templates are small, so nothing is skipped and everything is read up front.
 * The rules in `src/build-guards.ts` take bytes rather than paths, which is what
 * lets a test drive them without a template tree on disk. A file that cannot be
 * read is dropped HERE rather than there: it carries no instruction for a user
 * either way, and being unable to open it is a filesystem fact, not a rule.
 */
async function readTemplateFiles(root) {
  const files = [];
  for (const abs of await walk(root)) {
    try {
      files.push([path.relative(root, abs), await readFile(abs, 'utf8')]);
    } catch {
      continue;
    }
  }
  return files;
}

/** Read one file out of a copied template by its relative path; null if absent. */
function templateReader(root) {
  return (relative) => {
    const abs = path.join(root, relative);
    return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  };
}

/** Throw what a guard returned, or carry on when it returned nothing. */
function failIf(problem) {
  if (problem !== null) throw new Error(problem);
}

async function main() {
  const guards = await loadTs('src/build-guards.ts');

  failIf(
    guards.sharedDevDepsProblem(
      JSON.parse(await readFile(path.join(pkgRoot, 'package.json'), 'utf8')),
      JSON.parse(await readFile(path.join(repoRoot, 'packages/ui/package.json'), 'utf8')),
    ),
  );

  await rm(dist, { recursive: true, force: true });
  await mkdir(templatesOut, { recursive: true });

  const { FRAMEWORKS } = await loadTs('src/frameworks.ts');
  const { patchesFor } = await loadTs('src/patches.ts');
  // `GITIGNORE_TEMPLATE_NAME` is read from `generate.ts` rather than restated
  // here. `generate()` is what renames it back, so a local copy that drifted
  // would have this build write a name the CLI never looks for — and nothing
  // would fail: the emitted project would simply have no `.gitignore`, which is
  // the API-key-staging bug, visible only in the published package.
  const { GITIGNORE_TEMPLATE_NAME, goLiveThread } = await loadTs('src/generate.ts');

  const ready = FRAMEWORKS.filter((f) => f.status === 'ready');
  if (ready.length === 0) throw new Error('create-kai build: no framework is marked ready');

  let patchCount = 0;
  for (const framework of ready) {
    const root = await copyTemplate(framework.templateDir);
    const read = templateReader(root);
    const exists = (relative) => existsSync(path.join(root, relative));
    const patches = patchesFor(framework.templateDir);

    // Before the rename, because the rule asks about the name the starter uses.
    failIf(guards.gitignoreProblem(framework.templateDir, exists));
    await rename(
      path.join(root, guards.GITIGNORE_SOURCE_NAME),
      path.join(root, GITIGNORE_TEMPLATE_NAME),
    );

    // Order matters: `emittedContentProblem` applies the patches, and `applyPatch`
    // throws on one that does not match, so the specific "this patch went stale"
    // message has to come first or it is replaced by a generic one.
    failIf(guards.patchMatchProblem(framework.templateDir, patches, read));
    failIf(
      guards.emittedContentProblem(framework.templateDir, patches, await readTemplateFiles(root)),
    );
    failIf(guards.appPathProblem(framework, read, goLiveThread));
    failIf(guards.declaredPathsProblem(framework, exists));

    patchCount += patches.length;
    console.log(`  template  ${framework.id.padEnd(16)} <- examples/starters/${framework.templateDir}`);
  }

  const kitVersion = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/ui/package.json'), 'utf8'),
  ).version;
  const cliVersion = JSON.parse(await readFile(path.join(pkgRoot, 'package.json'), 'utf8')).version;

  await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/index.ts')],
    outfile: path.join(dist, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node20.19',
    format: 'esm',
    minify: false,
    banner: { js: '#!/usr/bin/env node' },
    define: {
      __KIT_VERSION__: JSON.stringify(kitVersion),
      __CLI_VERSION__: JSON.stringify(cliVersion),
    },
  });
  await stat(path.join(dist, 'index.js')).then((s) =>
    console.log(`  bundle    dist/index.js    ${(s.size / 1024).toFixed(1)} kB`),
  );

  // The bin has to be executable when it lands in a user's node_modules/.bin.
  await chmod(path.join(dist, 'index.js'), 0o755);

  console.log(`  patches   ${patchCount} verified against their templates`);
  console.log(`  kit pin   ^${kitVersion}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
