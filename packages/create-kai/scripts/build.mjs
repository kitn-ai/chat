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
 *      `workspace:*` instruction into a user's project.
 *   3. Bundle `src/index.ts` to one zero-dependency ESM file, so `npx` cold
 *      start is fast. `@clack/prompts` and `picocolors` are bundled in; so is
 *      the kit's `agent-tooling` catalog, which is why the CLI can hand out real
 *      `Integration` objects without depending on `@kitn.ai/ui` at runtime.
 */
import { chmod, cp, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
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

/** Never copied into a template: build output, installed deps, editor cruft. */
const SKIP = new Set(['node_modules', 'dist', '.next', '.vite', '.turbo', '.angular', 'README.md']);

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

async function verifyPatches(templateDir, root, patchesFor) {
  const patches = patchesFor(templateDir);
  for (const patch of patches) {
    const file = path.join(root, patch.file);
    if (!existsSync(file)) {
      throw new Error(
        `create-kai build: patch targets ${patch.file}, which template '${templateDir}' does not have`,
      );
    }
    const source = await readFile(file, 'utf8');
    const matches = source.match(new RegExp(patch.find.source, `${patch.find.flags}g`));
    if (!matches) {
      throw new Error(
        `create-kai build: patch for ${templateDir}/${patch.file} no longer matches.\n` +
          `  why it exists: ${patch.why}\n` +
          '  the starter changed — update PATCHES in src/patches.ts',
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `create-kai build: patch for ${templateDir}/${patch.file} matches ${matches.length} times; ` +
          'it must be unambiguous',
      );
    }
  }
  return patches.length;
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
  const { patchesFor } = await loadTs('src/patches.ts');

  const ready = FRAMEWORKS.filter((f) => f.status === 'ready');
  if (ready.length === 0) throw new Error('create-kai build: no framework is marked ready');

  let patchCount = 0;
  for (const framework of ready) {
    const root = await copyTemplate(framework.templateDir);
    patchCount += await verifyPatches(framework.templateDir, root, patchesFor);
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
