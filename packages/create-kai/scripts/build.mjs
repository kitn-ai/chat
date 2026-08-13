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
 */
import { chmod, cp, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

/**
 * npm strips `.gitignore` out of a published tarball, so it travels as
 * `_gitignore` and `generate()` renames it back. See the comment on
 * `GITIGNORE_TEMPLATE_NAME`.
 */
const GITIGNORE_TEMPLATE_NAME = '_gitignore';

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

  const gitignore = path.join(to, '.gitignore');
  if (existsSync(gitignore)) {
    await rename(gitignore, path.join(to, GITIGNORE_TEMPLATE_NAME));
  } else {
    // Not cosmetic. Without a `.gitignore` the emitted project does not ignore
    // `node_modules/` or `.env.local`, and the second one means a keyed
    // scaffold's first `git add .` stages an API key.
    throw new Error(
      `create-kai build: starter '${templateDir}' has no .gitignore — an emitted project needs one`,
    );
  }
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
 * Every patch matches its file, and matches it the number of times it claims to.
 *
 * Zero matches is fatal for every patch, opted-in or not. More than one is fatal
 * only WITHOUT `multiple`, which is the entirety of the opt-in; why that hole is
 * the right shape lives on the flag in src/patches.ts rather than being
 * half-stated in both places.
 */
async function verifyPatches(templateDir, root, patchesFor, countMatches) {
  const patches = patchesFor(templateDir);
  for (const patch of patches) {
    const file = path.join(root, patch.file);
    if (!existsSync(file)) {
      throw new Error(
        `create-kai build: patch targets ${patch.file}, which template '${templateDir}' does not have`,
      );
    }
    const count = countMatches(patch, await readFile(file, 'utf8'));
    if (count === 0) {
      throw new Error(
        `create-kai build: patch for ${templateDir}/${patch.file} no longer matches.\n` +
          `  why it exists: ${patch.why}\n` +
          (patch.multiple
            ? '  it is a `multiple` patch, so this is a rename that would now rename nothing\n'
            : '') +
          '  the starter changed — update PATCHES in src/patches.ts',
      );
    }
    if (count > 1 && !patch.multiple) {
      throw new Error(
        `create-kai build: patch for ${templateDir}/${patch.file} matches ${count} times; ` +
          'it must be unambiguous.\n' +
          '  A non-global replace rewrites only the first, so the rest would ship unpatched.\n' +
          '  Narrow the `find`, or set `multiple: true` if every occurrence should change.',
      );
    }
  }
  return patches.length;
}

/**
 * Apply this template's patches in memory and check what survives them.
 *
 * The patches go through the CLI's own `applyPatch` rather than a
 * reimplementation of it. This function used to rebuild the regex by hand, which
 * meant it could not see a `multiple` patch: it would check a half-patched file
 * no user would ever receive, and report on bytes that do not exist.
 *
 * Two families of rule run over the result, kept apart because their fixes
 * differ — a repo-internal instruction wants a new patch, a wrong title wants
 * that patch to name the project. Both live in `src/template-guards.ts`, where a
 * test can watch each one fail.
 */
async function verifyEmittedContent(templateDir, root, patchesFor, guards, applyPatch) {
  const patches = patchesFor(templateDir);
  const internals = [];
  const titles = [];

  for (const file of await walk(root)) {
    const rel = path.relative(root, file);

    let source;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (source.includes('\u0000')) continue; // binary; nothing to instruct a user with

    for (const patch of patches) {
      // PROBE_NAME, not a plausible stand-in: the title rule asserts a patched
      // title EQUALS it, which only proves anything if the string could not have
      // arrived by any route other than this substitution.
      if (patch.file === rel) source = applyPatch(patch, source, guards.PROBE_NAME);
    }

    internals.push(...guards.repoInternalProblems(rel, source));
    titles.push(...guards.titleProblems(rel, source, guards.PROBE_NAME));
  }

  const render = (problems) =>
    problems.map((p) => `  · ${templateDir}/${p.file}: ${p.detail}\n      ${p.why}`).join('\n');

  if (internals.length > 0) {
    throw new Error(
      `create-kai build: template '${templateDir}' would ship repo-internal instructions ` +
        `to a user.\nAdd a patch in src/patches.ts for each of these:\n${render(internals)}`,
    );
  }
  if (titles.length > 0) {
    throw new Error(
      `create-kai build: template '${templateDir}' would ship a browser tab that does not name ` +
        `the user's project.\n${render(titles)}`,
    );
  }
}

/**
 * Assert the template's app file is where `paths.app` says and carries the
 * expression the emitted README quotes.
 *
 * `paths.app` is written into `kai.json` for a v2 `add` to read, and the README
 * tells the user "one expression in <paths.app> changes" — so a wrong path is
 * two lies at once, and nothing else in the build would notice, because the path
 * is never opened at build time. Vue's is `src/App.vue` where React's is
 * `src/App.tsx`, which is exactly the kind of per-framework value that gets
 * copied from the row above.
 */
async function verifyAppPath(framework, root, goLiveThread) {
  const app = path.join(root, framework.paths.app);
  if (!existsSync(app)) {
    throw new Error(
      `create-kai build: framework '${framework.id}' declares paths.app='${framework.paths.app}', ` +
        `which template '${framework.templateDir}' does not have.\n` +
        '  kai.json records that path and the emitted README points the user at it.',
    );
  }
  // Throws with its own explanation if the go-live expression is missing.
  goLiveThread(await readFile(app, 'utf8'), framework);
}

/**
 * Assert every OTHER path the framework declares exists in its template too.
 *
 * `verifyAppPath` covers `paths.app` because the README quotes it. The rest of
 * the block is written verbatim into the emitted `kai.json`, where a v2 `add`
 * reads it to decide where to put a generated component or which stylesheet to
 * append an `@import` to — so a wrong entry here is a v2 command that writes to
 * a file that is not there, reported against the user's project rather than
 * against this table.
 *
 * Nothing else in the build opens these. They are strings that get copied down
 * from the row above and then diverge silently: `solid` declares
 * `css: 'src/index.css'` while its starter's stylesheet has always been
 * `src/styles.css`, and it has been wrong for as long as the row has existed
 * because a `planned` framework is never checked against its template at all.
 *
 * `env` is exempt — `.env.local` is the file the user is told to CREATE for a
 * keyed gateway, so a template carrying one would be the bug.
 */
async function verifyDeclaredPaths(framework, root) {
  const missing = Object.entries(framework.paths)
    .filter(([key]) => key !== 'env' && key !== 'app')
    .filter(([, rel]) => !existsSync(path.join(root, rel)))
    .map(([key, rel]) => `  · paths.${key} = '${rel}'`);

  if (missing.length > 0) {
    throw new Error(
      `create-kai build: framework '${framework.id}' declares paths that template ` +
        `'${framework.templateDir}' does not have:\n${missing.join('\n')}\n` +
        '  These are copied verbatim into the emitted kai.json for a v2 `add` to read.',
    );
  }
}

/**
 * Refuse to build if this package's shared devDependency ranges disagree with
 * the kit's.
 *
 * `.npmrc` sets `node-linker=hoisted`, so ONE version of each package wins for
 * the whole workspace. Declaring `@types/node: ^22` here — copied thoughtlessly
 * out of a starter's package.json — silently downgraded the hoisted
 * `@types/node` from 26 to 22 for `packages/ui` too, and its emitted-code suite
 * started timing out. Nothing in that failure pointed back here.
 *
 * So the ranges are checked rather than commented. Anything both packages
 * declare has to agree.
 */
async function verifySharedDevDeps() {
  const mine = JSON.parse(await readFile(path.join(pkgRoot, 'package.json'), 'utf8'));
  const kit = JSON.parse(await readFile(path.join(repoRoot, 'packages/ui/package.json'), 'utf8'));
  const kitDev = { ...kit.dependencies, ...kit.devDependencies };
  const clashes = [];
  for (const [name, range] of Object.entries(mine.devDependencies ?? {})) {
    if (kitDev[name] && kitDev[name] !== range) {
      clashes.push(`  · ${name}: create-kai wants ${range}, packages/ui wants ${kitDev[name]}`);
    }
  }
  if (clashes.length > 0) {
    throw new Error(
      'create-kai build: devDependency ranges disagree with packages/ui.\n' +
        'node-linker=hoisted means one version wins for the whole workspace, so a\n' +
        'mismatch here changes what the KIT compiles against.\n' +
        clashes.join('\n'),
    );
  }
}

async function main() {
  await verifySharedDevDeps();
  await rm(dist, { recursive: true, force: true });
  await mkdir(templatesOut, { recursive: true });

  const { FRAMEWORKS } = await loadTs('src/frameworks.ts');
  const { patchesFor, applyPatch, countMatches } = await loadTs('src/patches.ts');
  const guards = await loadTs('src/template-guards.ts');
  const { goLiveThread } = await loadTs('src/generate.ts');

  const ready = FRAMEWORKS.filter((f) => f.status === 'ready');
  if (ready.length === 0) throw new Error('create-kai build: no framework is marked ready');

  let patchCount = 0;
  for (const framework of ready) {
    const root = await copyTemplate(framework.templateDir);
    // Order matters: `verifyEmittedContent` applies the patches, and `applyPatch`
    // throws on one that does not match, so the specific "this patch went stale"
    // message has to come first or it is replaced by a generic one.
    patchCount += await verifyPatches(framework.templateDir, root, patchesFor, countMatches);
    await verifyEmittedContent(framework.templateDir, root, patchesFor, guards, applyPatch);
    await verifyAppPath(framework, root, goLiveThread);
    await verifyDeclaredPaths(framework, root);
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
