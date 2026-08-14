/**
 * Load one of this package's TypeScript modules from a plain `.mjs` script.
 *
 * The CLI's tables — which frameworks are ready, which files each template gets
 * patched — are TypeScript the CLI owns. `scripts/build.mjs` and
 * `scripts/verify-pack.mjs` both have to READ those tables rather than restate
 * which templates to copy or which files must survive a pack, because a second
 * list is how a table and its guard drift apart. Neither script can `import` a
 * `.ts` file, so both come through here.
 *
 * EXTRACTED FROM `build.mjs`, which is where this lived. `verify-pack.mjs` needed
 * the same loader to read `src/patches.ts`, and `build.mjs` ends in
 * `main().catch(...)` — importing it runs a build — so there was no way to reuse
 * it in place. One copy, because two copies is how one of them gets the fix the
 * other does not.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

/**
 * Where `loadTs` puts the module it just bundled.
 *
 * ON DISK, AND UNDER `node_modules/`, for one reason: a module has to be
 * SOMEWHERE to resolve a bare specifier. This used to import a
 * `data:text/javascript;base64,…` URL, which has no directory, so anything left
 * external threw `ERR_UNSUPPORTED_RESOLVE_REQUEST` at import and `createRequire`
 * could not be constructed against it at all.
 *
 * That was a live trap rather than a tidy-up. `external: ['zod']` below has
 * always been one reachable import away from the same failure — it works today
 * only because nothing in the loaded tables calls into the catalog at runtime.
 * And it is what stopped `src/template-guards.ts` reading a JS-declared document
 * title: bundling `typescript` inlines 9.5MB of CJS whose dynamic `require("fs")`
 * throws on first call, and leaving it external could not resolve. From a real
 * file both work, because `node_modules/.cache/` resolves up into the package's
 * own `node_modules/`.
 *
 * Not `dist/`: `build.mjs`'s `main()` deletes that after the first `loadTs` call.
 */
export function loadedTsCacheDir(pkgRoot) {
  return path.join(pkgRoot, 'node_modules/.cache/create-kai-build');
}

/**
 * Bundle `<pkgRoot>/<relative>` and import it.
 *
 * `zod` and `typescript` are left external: the catalog reaches into the kit and
 * one guard parses a file with the TypeScript compiler, and neither is needed at
 * runtime by anything a script loads here. Inlining `typescript` would be 9.5MB
 * of CJS per call.
 */
export async function loadTs(pkgRoot, relative) {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, relative)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    external: ['zod', 'typescript'],
  });
  const dir = loadedTsCacheDir(pkgRoot);
  await mkdir(dir, { recursive: true });
  // Named after the entry point so two loaded modules cannot collide, and
  // cache-busted so a rebuild in the same process never re-imports stale bytes.
  const out = path.join(dir, `${path.basename(relative, '.ts')}-${process.pid}.mjs`);
  await writeFile(out, built.outputFiles[0].text);
  return import(`${pathToFileURL(out).href}?v=${Date.now()}`);
}
