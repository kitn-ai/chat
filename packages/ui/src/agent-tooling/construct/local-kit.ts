/**
 * WHICH `@kitn.ai/ui` a generated project installs.
 *
 * THE DEFECT THIS EXISTS FOR. `generateProject` defaults the emitted
 * package.json's dependency to `^<this package's version>` and npm resolves
 * that from the REGISTRY. That is right for a consumer who installed the kit
 * — and wrong for the person running the CLI out of a source checkout, whose
 * whole reason for running it is source the registry has never seen. On
 * 2026-08-30 `node packages/ui/bin/mcp.js dev --builder` died in the preview
 * with `SyntaxError: … does not provide an export named 'WorkSurface'`:
 * the emitted project pinned `^0.30.0`, npm installed published 0.30.0, and
 * published 0.30.0 predates the component the checkout had just grown. The
 * captures that "worked" only worked because they were driven with an
 * explicit `--ui <local tarball>` — the flag hid the hole rather than
 * closing it.
 *
 * THE RULE. Running from a source CHECKOUT defaults `uiSpec` to that
 * checkout's own build. Running from an INSTALLED package changes nothing at
 * all: same published spec, same output, not one extra line of stdout. An
 * explicit `--ui` always wins over both.
 *
 * MECHANISM: `npm pack` OF THIS CHECKOUT, INSTALLED AS A TARBALL.
 * Three candidates, and the reasoning is recorded because "it copies" and
 * "it is slow" are both cheap to assert and were both wrong here.
 *
 *   file:<the packages/ui DIRECTORY>  — npm SYMLINKS a directory dependency.
 *     The preview's Vite dev server then treats the kit as linked source
 *     living outside its own root, which puts it on the wrong side of
 *     `server.fs.allow` and out of the optimizer's prebundle. Rejected: it
 *     swaps a clear "missing export" failure for an obscure serving one.
 *
 *   npm pack per run — "slow" is the received wisdom and it is FALSE here:
 *     measured at 0.94s for this package. Not the reason to cache.
 *
 *   npm pack, CONTENT-KEYED CACHE (chosen) — the same mechanism
 *     `verify:construct` already drives every cell through
 *     (`node bin/mcp.js eject … --ui <tarball>`), so the local default is the
 *     path with the most coverage in the repo rather than a second one. The
 *     cache is not about the 0.94s: the tarball path goes INTO the emitted
 *     package.json, and `ensureInstalled` re-runs `npm install` whenever that
 *     file's hash changes. A per-run path would re-install on every start
 *     (tens of seconds); a fixed path would leave a rebuilt dist/ silently
 *     un-reinstalled. Keying the filename on dist/'s content fingerprint gets
 *     both: unchanged build → identical path → no install, rebuilt dist →
 *     new path → package.json changes → npm install re-runs on its own.
 *
 * `npm pack` is byte-deterministic for a given tree (verified: two packs of
 * the same dist/ hash identically), so a content-keyed name is stable.
 *
 * NO `npm pack --json` PARSE HERE, deliberately. npm 12 moved that output's
 * top-level container from an array to an object keyed by package name and
 * took down a release; `lint:pack-parse` exists to route every reader through
 * one parser at <repo>/scripts/pack-listing.mjs. That module is a repo-root
 * dev script, not shippable from inside src/, so instead of adding a fifth
 * parse site this file packs into a FRESH EMPTY directory and reads back the
 * single .tgz that lands there. No JSON, no filename convention, nothing for
 * a future npm to move.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT_PACKAGE_NAME = '@kitn.ai/ui';

/** The gitignored cache the packed local build lands in, inside the checkout
 *  (never a consumer's tree — nothing below reaches here off a checkout). */
export const LOCAL_KIT_CACHE_DIRNAME = '.kai-local-kit';

/** The one command that produces the artifacts this file requires, named in
 *  every failure so a reader never has to guess which of the repo's builds
 *  is meant. */
export const BUILD_COMMAND = 'npx nx build ui (or: cd packages/ui && npm run build)';

/**
 * The kit's own package root, by bounded walk-up from `startDir`.
 *
 * Depth-independent ON PURPOSE, the same lesson `resolveBuilderPageDir` in
 * dev.ts is written from: this module is `src/agent-tooling/construct/` at
 * test time and lands wherever Rollup decides to put it at build time (the
 * dist root when inlined, `dist/assets/` when split out behind a dynamic
 * import). Anything that counts levels is right in one of those and silently
 * wrong in the other.
 */
export function resolveKitPackageRoot(startDir: string): { dir: string } | { tried: string[] } {
  const tried: string[] = [];
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const manifest = join(dir, 'package.json');
    tried.push(manifest);
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown };
        if (parsed.name === KIT_PACKAGE_NAME) return { dir };
      } catch {
        // An unreadable/!JSON package.json is not this package; keep climbing.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { tried };
}

/** Where this module actually sits at runtime — the only place
 *  `import.meta.url` is read, so every other function in here takes a plain
 *  directory and is drivable from a synthetic tree in a test. */
export function localKitStartDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * The two markers that are true in a checkout and false in an install.
 *
 * `src/agent-tooling/construct/cli.ts` — the published tarball's `files`
 * carries `dist`, `bin`, `frameworks`, the stylesheets and exactly TWO json
 * files under src/elements. So `src/` alone is NOT a discriminator (an
 * install has one); a .ts under src/agent-tooling is, and this particular
 * one is the file the CLI itself is compiled from, so it cannot be deleted
 * without deleting the thing being detected.
 *
 * `../../pnpm-workspace.yaml` — the workspace root two levels above
 * `packages/ui`. In an install the package root is
 * `node_modules/@kitn.ai/ui` (or pnpm's `…/.pnpm/@kitn.ai+ui@x/node_modules/
 * @kitn.ai/ui`), whose grandparent is always a `node_modules` directory, and
 * a workspace manifest never lives inside one — so a consumer who is
 * themselves a pnpm workspace does not trip it. Pinned by a test that builds
 * exactly that shape.
 *
 * BOTH, not either: the src marker alone would fire inside a tarball someone
 * extracted by hand, and the workspace marker alone inside any pnpm repo that
 * happens to vendor the package at the wrong depth.
 */
export function isSourceCheckout(pkgRoot: string): boolean {
  return (
    existsSync(join(pkgRoot, 'src', 'agent-tooling', 'construct', 'cli.ts')) &&
    existsSync(join(pkgRoot, '..', '..', 'pnpm-workspace.yaml'))
  );
}

/** Every concrete `./dist/…` target in the exports map — DERIVED from the
 *  manifest rather than a hand-kept list of entry points, so a new subpath is
 *  covered the day it is added. Wildcard patterns are skipped: `./dist/
 *  elements/*.js` names no single file to stat. */
export function distExportTargets(pkg: unknown): string[] {
  const out = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.startsWith('./dist/') && !value.includes('*')) out.add(value);
      return;
    }
    if (value && typeof value === 'object') for (const nested of Object.values(value)) walk(nested);
  };
  walk((pkg as { exports?: unknown } | null)?.exports);
  return [...out];
}

/** Source extensions whose edit can change what the built kit EXPORTS. json
 *  is excluded on purpose: every json under src/ that moves during a build is
 *  build-GENERATED (element-meta, icon-names, construct.v1.schema.json, the
 *  template fixtures), several of them written by `postbuild` — i.e. AFTER
 *  the bundles — so counting them would report a freshly built tree as
 *  stale. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.css'];

/** Generated, despite the extension: build:css writes it (as `prebuild`, so
 *  normally older than the bundles — but `build:css` is runnable alone, and
 *  Storybook runs it). Paths are relative to `src/`, which is the root the
 *  walk below reports against. */
const GENERATED_SOURCES = new Set([join('elements', 'compiled.css')]);

function isSourceInput(rel: string): boolean {
  if (GENERATED_SOURCES.has(rel)) return false;
  const base = rel.split(sep).at(-1)!;
  if (base.includes('.test.') || base.includes('.stories.')) return false;
  return SOURCE_EXTENSIONS.some((ext) => base.endsWith(ext));
}

/** Newest file in a tree, by mtime. `null` for a tree with no files. */
function newestFile(root: string, accept: (rel: string) => boolean): { file: string; mtimeMs: number } | null {
  let newest: { file: string; mtimeMs: number } | null = null;
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = relative(root, full);
      if (!accept(rel)) continue;
      const { mtimeMs } = statSync(full);
      if (!newest || mtimeMs > newest.mtimeMs) newest = { file: full, mtimeMs };
    }
  };
  walk(root);
  return newest;
}

/**
 * Why this checkout's dist/ cannot be handed to a generated project, or null
 * when it can.
 *
 * NEVER a fallback to the published version. Falling back is precisely the
 * behaviour that produced the reported crash — a preview booting against a
 * kit that does not have the exports the checkout's source describes, failing
 * far from the cause. Missing and stale both stop here, naming the build.
 */
export function distProblem(pkgRoot: string): string | null {
  const distDir = join(pkgRoot, 'dist');
  if (!existsSync(distDir)) return `${distDir} does not exist — this checkout has never been built.`;

  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
  } catch (err) {
    return `cannot read ${join(pkgRoot, 'package.json')}: ${err instanceof Error ? err.message : String(err)}`;
  }
  const missing = distExportTargets(pkg).filter((target) => !existsSync(join(pkgRoot, target)));
  if (missing.length > 0) {
    return `${missing.length} entry point(s) named by the exports map are missing from dist/, starting with ${missing
      .slice(0, 3)
      .join(', ')} — the build is incomplete.`;
  }

  const newestSource = newestFile(join(pkgRoot, 'src'), isSourceInput);
  const newestBuilt = newestFile(distDir, () => true);
  if (newestSource && newestBuilt && newestSource.mtimeMs > newestBuilt.mtimeMs) {
    return (
      `${relative(pkgRoot, newestSource.file)} is newer than everything in dist/ ` +
      `(newest built file: ${relative(pkgRoot, newestBuilt.file)}) — the build is stale.`
    );
  }
  return null;
}

/**
 * Content fingerprint of dist/ — every file's relative path, byte size and
 * mtime folded into one hash, the same "hash what actually changed" shape as
 * `installKey()` in dev.ts.
 *
 * The VERSION is not enough on its own and this is the normal case, not an
 * edge one: release-please only bumps package.json at merge, so mid-branch
 * every rebuild carries the same version. Keying on version alone would pin
 * the emitted package.json to a path holding a tarball packed from a PRIOR
 * dist/ — a cached artifact that looks exactly like a current one, which is
 * the trap this repo pays for most often.
 */
export function distFingerprint(distDir: string): string {
  const hash = createHash('sha256');
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of [...readdirSync(dir, { withFileTypes: true })].sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else out.push(full);
    }
    return out;
  };
  for (const file of walk(distDir)) {
    const stat = statSync(file);
    hash.update(file.slice(distDir.length));
    hash.update(String(stat.size));
    hash.update(String(stat.mtimeMs));
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * This checkout's own build, packed and content-keyed, as an npm dependency
 * spec. Cheap on repeat runs: an unchanged dist/ hits the cached tarball and
 * never spawns npm at all.
 */
export function packLocalKit(pkgRoot: string): { tarball: string; packed: boolean } {
  const distDir = join(pkgRoot, 'dist');
  const version = (JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as { version: string }).version;
  const cacheDir = join(pkgRoot, LOCAL_KIT_CACHE_DIRNAME);
  const tarball = join(cacheDir, `kitn.ai-ui-${version}-${distFingerprint(distDir)}.tgz`);
  if (existsSync(tarball)) return { tarball, packed: false };

  // Pack into a fresh EMPTY directory and read back the one tarball that
  // lands there — see this file's header on why not `npm pack --json`.
  const stage = join(cacheDir, `.pack-${process.pid}`);
  mkdirSync(stage, { recursive: true });
  try {
    execFileSync('npm', ['pack', '--silent', '--pack-destination', stage], {
      cwd: pkgRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const produced = readdirSync(stage).filter((f) => f.endsWith('.tgz'));
    if (produced.length !== 1) {
      throw new Error(`npm pack wrote ${produced.length} tarball(s) into ${stage} — expected exactly one`);
    }
    renameSync(join(stage, produced[0]!), tarball);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  // One tarball per checkout, not one per rebuild: each is the whole packed
  // package, so an uncapped cache grows by that much every time dist/ moves.
  for (const file of readdirSync(cacheDir)) {
    if (file.endsWith('.tgz') && join(cacheDir, file) !== tarball) rmSync(join(cacheDir, file), { force: true });
  }
  return { tarball, packed: true };
}

export type KitOrigin =
  /** `--ui` was passed. It wins everywhere, checkout or install. */
  | { kind: 'explicit'; uiSpec: string }
  /** Not a checkout (or we cannot tell): the published spec, silently. */
  | { kind: 'published'; why: string }
  /** A checkout with a usable build: pack it and install that. */
  | { kind: 'checkout'; pkgRoot: string }
  /** A checkout whose build cannot be used. Fatal — see `distProblem`. */
  | { kind: 'unbuilt'; pkgRoot: string; problem: string };

/**
 * The decision, with no side effects — no packing, no logging, no exiting —
 * so both directions are testable against synthetic trees rather than only
 * against whichever tree the test happens to run in.
 */
export function classifyKit(explicit: string | undefined, startDir: string): KitOrigin {
  if (explicit !== undefined) return { kind: 'explicit', uiSpec: explicit };
  const root = resolveKitPackageRoot(startDir);
  if (!('dir' in root)) return { kind: 'published', why: `no ${KIT_PACKAGE_NAME} package.json above ${startDir}` };
  if (!isSourceCheckout(root.dir)) return { kind: 'published', why: `${root.dir} is an installed package, not a checkout` };
  const problem = distProblem(root.dir);
  return problem ? { kind: 'unbuilt', pkgRoot: root.dir, problem } : { kind: 'checkout', pkgRoot: root.dir };
}

/** The fatal message for `unbuilt`, in one place so the CLI's three
 *  subcommands cannot drift apart on it. */
export function unbuiltMessage(origin: { pkgRoot: string; problem: string }): string {
  return (
    `cannot use this checkout's @kitn.ai/ui build: ${origin.problem}\n` +
    `  Running the CLI from a source checkout (${origin.pkgRoot}) installs THAT build into the\n` +
    `  generated project, because the published version does not have the exports your source adds.\n` +
    `  Build it:  ${BUILD_COMMAND}\n` +
    `  Or choose a kit explicitly:  --ui <version|tarball|path>`
  );
}

/** The startup line for `checkout`. Loud by design: silently swapping which
 *  kit a preview runs is the quiet decision this repo forbids. */
export function localKitNotice(pkgRoot: string, tarball: string, packed: boolean): string {
  return (
    `using this checkout's own @kitn.ai/ui build — ${join(pkgRoot, 'dist')} ` +
    `${packed ? 'packed to' : 'cached at'} ${tarball}. ` +
    `Generated projects install THAT, not the published version. Pass --ui <spec> to override.`
  );
}
