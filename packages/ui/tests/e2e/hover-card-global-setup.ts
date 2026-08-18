import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * ★ REFUSE TO RUN AGAINST A STALE BUNDLE.
 *
 * The hover-card fixture imports `/dist/kai.es.js`, which is the entire point of
 * the suite: it drives the artifact a consumer installs rather than the tree CI
 * compiles. That same fact is its failure mode. Run it without rebuilding and
 * every test passes — against yesterday's code. Not hypothetical: a deliberately
 * broken fix produced a GREEN run during verification until the bundle was
 * rebuilt. A suite that silently measures the wrong artifact is worse than no
 * suite; it is a check that proves nothing while looking like proof.
 *
 * ── THE DEFECT THIS FILE HAS ALREADY SHIPPED TWICE ───────────────────────────
 *
 * Both versions before this one compared mtimes over the WRONG POPULATION, and
 * the second only narrowed the window rather than closing it:
 *
 *   v1  newest-under-`src/`  vs  `dist/kai.es.js`
 *       False-positived on a freshly built tree, because `element-types.d.ts` is
 *       generated into `src/` by `build:api` in POSTbuild — after the bundle.
 *
 *   v2  newest-under-`src/`  vs  newest-under-`dist/`
 *       Same bug, smaller window. It assumed `dist/` is always written last.
 *       That is not guaranteed, it merely held locally — and it broke a required
 *       CI job on an unrelated PR with
 *       `element-types.d.ts is 0s newer than dist/llms/llms-full.txt`.
 *       ZERO SECONDS: same-second writes, decided by scheduling.
 *
 * The mistake both times was counting build OUTPUTS that happen to live under
 * `src/` as if they were INPUTS. A regenerated output being newer than the
 * bundle says nothing about staleness. Timestamp ordering was never the fix;
 * the population was.
 *
 * ── THE EXCLUSION IS DERIVED, NOT TYPED ──────────────────────────────────────
 *
 * `scripts/verify-generated-sync.mjs` already owns the authoritative record of
 * "checked-in files DERIVED from src/elements" — that guard exists to prove each
 * one still matches its generator. Its `GENERATED` array is read here, so adding
 * a generator updates both guards at once. A private second list in this file is
 * the exact "derive it, don't type it" failure this repo keeps paying for, and
 * it would rot the day someone adds a generator.
 *
 * It is READ rather than imported because that script is a CLI: it runs the
 * guard and calls `process.exit` at module scope, so importing it would execute
 * it. The read is a real parse (the TypeScript AST, the same approach
 * `gen-element-api.mjs` uses on `slots.ts`) and not a regex, so a change to the
 * record's shape fails loudly here instead of silently matching nothing.
 *
 * ── WHAT IS DELIBERATELY *NOT* EXCLUDED ──────────────────────────────────────
 *
 * `src/elements/compiled.css` and `src/primitives/card-validate-schemas.ts` are
 * generated too, and they STAY in the population on purpose. Both are written by
 * `prebuild`, and both are compiled INTO the bundle — `compiled.css` is imported
 * as `./compiled.css?inline`. If either is newer than the bundle, the bundle
 * really is stale and firing is correct. "Generated" is not the test; "is it an
 * input to the artifact under test" is, and the `GENERATED` record happens to
 * name exactly the postbuild outputs that are not.
 *
 * One of those, `element-manifest.json`, is both generated AND imported (by
 * `autoloader.ts`), so excluding it does lose a theoretical signal: a HAND EDIT
 * to it would not be caught here. That is the right trade — it is a generated
 * file, hand-editing it is not a supported operation, and
 * `verify-generated-sync` catches exactly that case by comparing content.
 *
 * ── WHY MTIME AT ALL, GIVEN ORDERING IS NOT GUARANTEED ───────────────────────
 *
 * A content-derived check is better where the artifact's structure is derivable
 * from its source, which is why the CSS guard compares structure instead of
 * timestamps: tokens in, utilities out. `dist/kai.es.js` has no such cheap
 * correspondence — it is bundled, tree-shaken and minified, so proving it
 * matches `src/` means hashing the input set and recording that hash AT BUILD
 * TIME. Nothing records one, adding it means changing the build, and it would
 * create a second source of truth about what went into the bundle.
 *
 * With the population corrected, ordering is no longer load-bearing: every
 * remaining file is a build INPUT, and an input is by definition read before the
 * output is written. The comparison is back to `dist/kai.es.js` specifically —
 * the file the fixture actually loads — rather than the newest of `dist/`, which
 * was only ever a workaround for the population bug and would mask a bundle
 * written early in a build that a later edit invalidated.
 */

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const PKG = resolve(HERE, '../..');
const REPO = resolve(PKG, '../..');
const BUNDLE = join(PKG, 'dist/kai.es.js');
const SRC = join(PKG, 'src');
const RECORD = join(PKG, 'scripts/verify-generated-sync.mjs');
const BUILD = 'pnpm exec nx build ui';

/**
 * The `file` paths in `verify-generated-sync.mjs`'s `GENERATED` array, absolute.
 *
 * Throws rather than returning empty if the record cannot be found or read: an
 * exclusion set that silently collapses to nothing would restore the exact false
 * positive this file exists to fix, and it would do it quietly.
 */
export function generatedArtifacts(record: string = RECORD): Set<string> {
  const source = readFileSync(record, 'utf8');
  const sf = ts.createSourceFile(record, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

  let files: string[] | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'GENERATED'
    ) {
      const init = node.initializer;
      if (!init || !ts.isArrayLiteralExpression(init)) {
        throw new Error(
          `${relative(REPO, record)} declares \`GENERATED\` but not as an array literal, so the ` +
            'stale-bundle guard cannot read which files are build outputs.',
        );
      }
      files = init.elements.map((el) => {
        if (!ts.isObjectLiteralExpression(el)) {
          throw new Error(`\`GENERATED\` holds a non-object entry in ${relative(REPO, record)}.`);
        }
        const prop = el.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'file',
        );
        if (!prop || !ts.isStringLiteralLike(prop.initializer)) {
          throw new Error(
            `a \`GENERATED\` entry in ${relative(REPO, record)} has no string \`file\` property.`,
          );
        }
        return prop.initializer.text;
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (!files?.length) {
    throw new Error(
      `The stale-bundle guard could not find a non-empty \`GENERATED\` array in ` +
        `${relative(REPO, record)}. It reads that record so build outputs written into \`src/\` ` +
        'are not mistaken for source edits; without it every fresh build looks stale.',
    );
  }
  // Repo-relative in the record ("packages/ui/src/…"); absolute here.
  return new Set(files.map((f) => resolve(REPO, f)));
}

interface Newest {
  path: string;
  mtimeMs: number;
}

function newestUnder(dir: string, skip: Set<string>, found?: Newest): Newest | undefined {
  let best = found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      best = newestUnder(full, skip, best);
      continue;
    }
    if (!entry.isFile() || skip.has(full)) continue;
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

  const newestSrc = newestUnder(SRC, generatedArtifacts());
  if (!newestSrc) return;

  const bundle = statSync(BUNDLE).mtimeMs;
  if (newestSrc.mtimeMs > bundle) {
    const ageSeconds = Math.round((newestSrc.mtimeMs - bundle) / 1000);
    throw new Error(
      `STALE BUNDLE — refusing to run.\n\n` +
        `  ${relative(PKG, newestSrc.path)}\n` +
        `  is ${ageSeconds}s newer than ${relative(PKG, BUNDLE)}.\n\n` +
        `Every test here loads that bundle, so running now would measure code you ` +
        `have already changed and report a pass that means nothing.\n\n` +
        `If that file is a GENERATED artifact rather than something you authored, it belongs in ` +
        `the \`GENERATED\` record in scripts/verify-generated-sync.mjs, which is where this guard ` +
        `reads the exclusion set from — do not add it to a list here.\n\n` +
        `Run: ${BUILD}`,
    );
  }
}
