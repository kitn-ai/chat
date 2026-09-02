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
 *      the kit's `mcp` catalog, which is why the CLI can hand out real
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
 *
 * SO THIS FILE STATES NO RULE TEXT OF ITS OWN. Every message a failing build
 * prints was written by a rule and arrived here as a return value; `failIf` is
 * the only thing that throws. `test/build-guards.test.ts` parses this file and
 * holds it to that — a guard-shaped function at any depth, or a message literal
 * authored here, fails the suite and points at `src/build-guards.ts`.
 */
import { chmod, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

// The workspace kit, imported in THIS SCRIPT'S OWN node process — a
// devDependency-only import that never reaches the bundle esbuild produces
// below. `CONSTRUCT_SCHEMA_URL` is substituted as `__CONSTRUCT_SCHEMA_URL__`
// the same way `derivePin`'s output is substituted as `__KIT_RANGE__`; see
// `types/globals.d.ts`'s docblock on that constant for why this indirection
// exists (the module it lives in also builds a zod schema at load time, which
// `src/build-guards.ts`'s `bundleGraphProblem` bans from the CLI bundle).
import { CONSTRUCT_SCHEMA_URL } from '@kitn.ai/ui/construct';

import { loadTs as loadTsFrom, loadedTsCacheDir } from './load-ts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const repoRoot = path.resolve(pkgRoot, '../..');
const startersRoot = path.join(repoRoot, 'examples/starters');
const dist = path.join(pkgRoot, 'dist');
const templatesOut = path.join(dist, 'templates');

/**
 * The framework table, the patch table and the dotfile list are TypeScript the
 * CLI owns. The build reads them rather than restating which templates to copy,
 * which patches to check or which files travel renamed — a second list is how a
 * framework flips to `ready` with no template behind it.
 *
 * The loader itself is `scripts/load-ts.mjs`, shared with
 * `scripts/verify-pack.mjs`, which reads the same patch table to decide what the
 * packed tarball must carry.
 */
const loadedTsDir = loadedTsCacheDir(pkgRoot);
const loadTs = (relative) => loadTsFrom(pkgRoot, relative);

/** Where a framework's starter lives. Both the rule and the copy ask for it. */
const starterPath = (templateDir) => path.join(startersRoot, templateDir);

/**
 * Copy one starter into `dist/templates/`. Filesystem only — the requirements
 * that the starter EXIST and that it carry a `.gitignore` are both RULES, and
 * live in `src/build-guards.ts` with the others where a test can drive them.
 * `main()` runs both before calling this, then does the rename.
 *
 * `skip` is `templateSkips(…)` from that module, derived from the starter's own
 * `.gitignore`. It takes a path RELATIVE to the starter root rather than a
 * basename, which is the whole point: `src/routeTree.gen.ts` is a path, and a
 * basename set could not express it — see the note on that function.
 */
async function copyTemplate(templateDir, skip) {
  const from = starterPath(templateDir);
  const to = path.join(templatesOut, templateDir);
  await cp(from, to, {
    recursive: true,
    filter: (src) => !skip(path.relative(from, src)),
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
  // Cleared per run: the files below are named by pid, so without this the cache
  // directory grows by one module per build forever.
  await rm(loadedTsDir, { recursive: true, force: true });

  const guards = await loadTs('src/build-guards.ts');

  failIf(
    guards.sharedDevDepsProblem(
      JSON.parse(await readFile(path.join(pkgRoot, 'package.json'), 'utf8')),
      JSON.parse(await readFile(path.join(repoRoot, 'packages/ui/package.json'), 'utf8')),
    ),
  );

  await rm(dist, { recursive: true, force: true });
  await mkdir(templatesOut, { recursive: true });

  // The block gallery rides the CLI the way the templates do: a plain copy of
  // the kit's authored blocks into dist/, which `add` walks at runtime. The
  // rules over its contents live where a test can drive them - the registry
  // module validates every manifest and `test/add.test.ts` drives every block
  // through the real add path against this very copy.
  await cp(path.join(repoRoot, 'packages/ui/blocks'), path.join(dist, 'blocks'), { recursive: true });
  const blockCount = (await readdir(path.join(dist, 'blocks'), { withFileTypes: true })).filter((d) => d.isDirectory()).length;
  console.log(`  blocks    ${blockCount} copied from packages/ui/blocks`);

  const { FRAMEWORKS } = await loadTs('src/frameworks.ts');
  const { patchesFor, gatewayPatchesFor } = await loadTs('src/patches.ts');
  const { emitRoute, emittedPreambleSymbols } = await loadTs('src/routes.ts');
  // The catalog reaches into the kit, so this is the one loaded module that
  // needs its `zod` left resolvable — `loadTs` keeps it external and the import
  // below resolves it out of the package's own node_modules.
  const { WIRED_GATEWAYS, BROWSER_WIRE, EMITTED_READER_FORMAT, getIntegration } =
    await loadTs('src/catalog.ts');
  // The dotfile list is read from `src/template-dotfiles.ts` rather than
  // restated here. `generate()` renames these back off the same list, so a local
  // copy that drifted would have this build write a name the CLI never looks for
  // — and nothing would fail at build time: the emitted project would simply be
  // missing the file. For `.gitignore` that is the API-key-staging bug; for
  // `.npmrc` it was an ENOENT on `npx create-kai --framework nextjs`. Both are
  // visible only in the published package.
  const { STRIPPED_DOTFILES, travellingName } = await loadTs('src/template-dotfiles.ts');
  const { goLiveThread } = await loadTs('src/generate.ts');

  const ready = FRAMEWORKS.filter((f) => f.status === 'ready');
  failIf(guards.readyFrameworksProblem(ready));

  // Every wired gateway must emit a route that compiles and a stream the emitted
  // front end can read. Both are properties of the (gateway, framework) pair
  // rather than of a template, so they run over the real route this build would
  // write — for every framework that declares somewhere to put one.
  //
  // There is no model check here any more. `defaultModelFor` throws for an
  // integration that forwards `model` with no id registered, so the failure
  // already happens at this moment, from the one place that owns the table.
  for (const gatewayId of WIRED_GATEWAYS) {
    if (gatewayId === 'mock') continue;
    const integration = getIntegration(gatewayId);
    failIf(guards.routeWireProblem(gatewayId, BROWSER_WIRE, EMITTED_READER_FORMAT));
    for (const framework of ready.filter((f) => f.route)) {
      const [route] = integration ? emitRoute(integration, framework) : [];
      failIf(
        guards.routeSymbolsProblem(
          gatewayId,
          integration?.webRoute,
          route?.contents ?? '',
          emittedPreambleSymbols(integration ?? {}),
        ),
      );
    }
  }

  let patchCount = 0;
  let gatewayPatchCount = 0;
  for (const framework of ready) {
    failIf(guards.missingStarterProblem(starterPath(framework.templateDir), existsSync));

    // The `.gitignore` is read from the STARTER, before the copy, because it is
    // what decides which files the copy makes. It is still the name the starter
    // uses at this point; the rename below is what changes that.
    const starterExists = (relative) => existsSync(path.join(starterPath(framework.templateDir), relative));
    failIf(guards.gitignoreProblem(framework.templateDir, starterExists));
    const gitignore = await readFile(
      path.join(starterPath(framework.templateDir), guards.GITIGNORE_SOURCE_NAME),
      'utf8',
    );
    failIf(guards.templateIgnoreProblem(framework.templateDir, gitignore));

    const root = await copyTemplate(framework.templateDir, guards.templateSkips(gitignore));
    const read = templateReader(root);
    const exists = (relative) => existsSync(path.join(root, relative));
    const patches = patchesFor(framework.templateDir);

    // Order matters: `emittedContentProblem` applies the patches, and `applyPatch`
    // throws on one that does not match, so the specific "this patch went stale"
    // message has to come first or it is replaced by a generic one.
    failIf(guards.patchMatchProblem(framework.templateDir, patches, read));
    // The gateway patches go through the SAME match rule, so one that stops
    // matching fails the build rather than failing in the terminal of whoever
    // first scaffolds with a gateway. They are not run through
    // `emittedContentProblem`: that rule grades the bytes EVERY emitted project
    // carries, and these bytes only exist on the gateway path.
    failIf(
      guards.patchMatchProblem(
        framework.templateDir,
        gatewayPatchesFor(framework.templateDir),
        read,
        'GATEWAY_PATCHES',
      ),
    );
    failIf(
      guards.emittedContentProblem(framework.templateDir, patches, await readTemplateFiles(root)),
    );
    failIf(guards.appPathProblem(framework, read, goLiveThread));
    failIf(guards.declaredPathsProblem(framework, exists));

    // AFTER every rule above, not before. npm strips these names out of a
    // published tarball, so a template carries them underscored and `generate()`
    // renames them back — but a patch row names the REAL name (`PATCHES` opens
    // `.npmrc` for both standalone starters), so renaming first would take
    // `patchMatchProblem` from "this patch went stale" to "this template has no
    // such file" for a file that is right there.
    for (const dotfile of STRIPPED_DOTFILES) {
      const from = path.join(root, dotfile);
      if (existsSync(from)) await rename(from, path.join(root, travellingName(dotfile)));
    }

    patchCount += patches.length;
    gatewayPatchCount += gatewayPatchesFor(framework.templateDir).length;
    console.log(`  template  ${framework.id.padEnd(16)} <- examples/starters/${framework.templateDir}`);
  }

  const kitVersion = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/ui/package.json'), 'utf8'),
  ).version;
  const cliVersion = JSON.parse(await readFile(path.join(pkgRoot, 'package.json'), 'utf8')).version;

  // The RANGE is derived here and substituted as a finished string, rather than
  // the bare version being substituted for the CLI to build a range out of.
  // Two reasons, and the second is the load-bearing one:
  //
  //   · One derivation site. `src/kit-pin.ts` is also what `src/pin-guards.ts`
  //     imports, so the rule that grades a published pin and the code that
  //     produces it cannot disagree about the shape.
  //   · The pin lands in `dist/index.js` as a plain string literal. That is the
  //     only form of it that exists inside a published tarball, and
  //     `verify-pin.mjs` has to read it back out of one. Substituting the
  //     version instead left the bundle carrying a CALL — first
  //     `` `^${"0.24.0"}` ``, then `derivePin("0.25.0")` — so the guard's reader
  //     had to track whatever expression esbuild happened to leave behind.
  const { derivePin } = await loadTs('src/kit-pin.ts');
  const kitRange = derivePin(kitVersion);

  // `metafile` is asked for so the bundle's real module graph can be graded —
  // see `bundleGraphProblem`. Reading the output text instead would grade a
  // grep, which is not the same question.
  const bundled = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/index.ts')],
    outfile: path.join(dist, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node20.19',
    format: 'esm',
    minify: false,
    metafile: true,
    banner: { js: '#!/usr/bin/env node' },
    define: {
      __KIT_RANGE__: JSON.stringify(kitRange),
      // The exact version the range was derived from, recorded into every
      // emitted kai.json. Both are substituted rather than one being computed
      // from the other in the CLI, so the pair cannot disagree.
      __KIT_VERSION__: JSON.stringify(kitVersion),
      __CLI_VERSION__: JSON.stringify(cliVersion),
      __CONSTRUCT_SCHEMA_URL__: JSON.stringify(CONSTRUCT_SCHEMA_URL),
    },
  });
  failIf(guards.bundleGraphProblem(Object.keys(bundled.metafile.inputs)));
  await stat(path.join(dist, 'index.js')).then((s) =>
    console.log(`  bundle    dist/index.js    ${(s.size / 1024).toFixed(1)} kB`),
  );

  // The bin has to be executable when it lands in a user's node_modules/.bin.
  await chmod(path.join(dist, 'index.js'), 0o755);

  console.log(`  patches   ${patchCount} verified against their templates`);
  console.log(`  gateway   ${gatewayPatchCount} go-live patches verified, ${[...WIRED_GATEWAYS].filter((g) => g !== 'mock').length} gateway(s) wired`);
  console.log(`  kit pin   ${kitRange}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
