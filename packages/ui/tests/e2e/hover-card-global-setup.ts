import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★ REFUSE TO RUN AGAINST A STALE BUNDLE.
 *
 * The hover-card fixture imports `/dist/kai.es.js`, which is the entire point of
 * the suite: it drives the artifact a consumer installs rather than the tree CI
 * compiles. That same fact is its failure mode. Run it without rebuilding and
 * every test passes — against yesterday's code. This is not hypothetical: during
 * verification of this suite, a deliberately broken fix produced a GREEN run
 * until the bundle was rebuilt.
 *
 * A comment in the config saying "needs `nx build ui` first" does not enforce
 * anything, and a suite that silently measures the wrong artifact is worse than
 * no suite — it is a check that proves nothing while looking like proof.
 *
 * So: hard-fail if the bundle is missing, or if the newest file under `src/` is
 * newer than the newest file under `dist/`.
 *
 * ★ NEWEST-OF-`dist`, NOT `dist/kai.es.js`, and that detail was measured rather
 * than reasoned. `nx build ui` writes several GENERATED files back into `src/`
 * — `elements/compiled.css`, `primitives/card-validate-schemas.ts`,
 * `elements/element-meta.json`, `elements/element-manifest.json`,
 * `elements/element-types.d.ts` — and they are not all written before the
 * bundle: `element-types.d.ts` lands after it, so comparing against
 * `dist/kai.es.js` alone false-positived on a tree that had just been built
 * cleanly. Hand-listing the generated files was the other option and it is the
 * worse one: the list would be a second copy of what the build knows, and it
 * would rot the day a generator is added.
 *
 * Comparing whole trees needs no such list. Every `src/` generator runs inside
 * the build, and the build keeps writing `dist/` afterwards, so a completed
 * build always leaves `dist/` newest — while a genuine source edit, which is
 * the only thing this guard is looking for, lands after the build finished.
 */

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const PKG = resolve(HERE, '../..');
const BUNDLE = join(PKG, 'dist/kai.es.js');
const DIST = join(PKG, 'dist');
const SRC = join(PKG, 'src');
const BUILD = 'pnpm exec nx build ui';

interface Newest {
  path: string;
  mtimeMs: number;
}

function newestUnder(dir: string, found: Newest | undefined = undefined): Newest | undefined {
  let best = found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      best = newestUnder(full, best);
      continue;
    }
    if (!entry.isFile()) continue;
    const { mtimeMs } = statSync(full);
    if (!best || mtimeMs > best.mtimeMs) best = { path: full, mtimeMs };
  }
  return best;
}

export default function requireFreshBundle(): void {
  if (!existsSync(BUNDLE)) {
    throw new Error(
      `This suite drives the BUILT bundle and ${relative(PKG, BUNDLE)} does not exist.\n` +
        `Run: ${BUILD}`,
    );
  }

  const newestSrc = newestUnder(SRC);
  const newestDist = newestUnder(DIST);
  if (!newestSrc || !newestDist) return;

  if (newestSrc.mtimeMs > newestDist.mtimeMs) {
    const ageSeconds = Math.round((newestSrc.mtimeMs - newestDist.mtimeMs) / 1000);
    throw new Error(
      `STALE BUNDLE — refusing to run.\n\n` +
        `  ${relative(PKG, newestSrc.path)}\n` +
        `  is ${ageSeconds}s newer than the most recent build output\n` +
        `  (${relative(PKG, newestDist.path)}).\n\n` +
        `Every test here loads dist/kai.es.js, so running now would measure code ` +
        `you have already changed and report a pass that means nothing.\n\n` +
        `Run: ${BUILD}`,
    );
  }
}
