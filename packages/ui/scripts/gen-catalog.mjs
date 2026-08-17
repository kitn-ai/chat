// Emits src/agent-tooling/catalog/derived.json: the catalog's derived
// ingredient layer. Runs inside build:api so verify:generated regenerates and
// diffs it (the element-manifest lesson: the guard must invoke the script that
// writes the artifact).
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as esbuild from 'esbuild';
import { readVariants, MIN_VARIANTS } from './lib/message-part-variants.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(ROOT, 'src/agent-tooling/catalog/derived.json');

// `--out <path>` redirects the write. The DEFAULT is the committed artifact, so
// build:api and a bare `node scripts/gen-catalog.mjs` behave identically to
// before. It exists for the staleness test, which must regenerate WITHOUT
// touching the tracked file: a test that repairs the artifact it is checking
// passes on its second run, so a re-run of a flaked CI job would turn a genuine
// staleness failure green and leave no evidence. Writing elsewhere also stops
// the test racing the other suites that read the committed path in parallel.
const outFlag = process.argv.indexOf('--out');
if (outFlag !== -1 && !process.argv[outFlag + 1]) {
  console.error('✗ gen-catalog: --out needs a path.');
  process.exit(1);
}
const OUT = outFlag === -1 ? DEFAULT_OUT : resolve(process.argv[outFlag + 1]);

function fail(msg) {
  console.error(`✗ gen-catalog: ${msg}`);
  process.exit(1);
}

async function importTs(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'gen-catalog-'));
  const bundle = join(tmp, 'bundle.mjs');
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'error',
  });
  const mod = await import(pathToFileURL(bundle).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

// Is this prop a callback the consumer must SUPPLY, as opposed to merely a
// non-attribute value? `scalar: false` does not answer that: it says "not an
// attribute", never "this is a function". Read off element-meta.json's printed
// type: strip a leading `undefined | `, then function-valued iff the remainder
// starts with `(` AND contains `=>`.
//
// Both conjuncts are load-bearing, and each has a counter-example measured on
// this tree -- do not simplify to either half alone:
//   - `includes('=>')` ALONE over-matches `kai-cards.policy` and
//     `kai-toast-region.toasts`, an object and an array that CONTAIN callbacks.
//   - `startsWith('(')` ALONE over-matches `kai-composer.highlights` and
//     `kai-suggestions.suggestions`, which are `undefined | (A | B)[]`.
// The whole result is pinned in tests/scripts/catalog-derived.test.ts, because
// this parses a FORMATTED type string and would change meaning silently if
// build:api's type printer changed its spacing or union order.
function isFunctionValued(type) {
  const bare = String(type ?? '').replace(/^undefined \| /, '');
  return bare.startsWith('(') && bare.includes('=>');
}

// 1. Elements, from the generated meta (build:api runs gen-element-api first).
const meta = JSON.parse(readFileSync(join(ROOT, 'src/elements/element-meta.json'), 'utf8'));
const elements = meta
  .map((e) => ({
    tag: e.tag,
    props: (e.props ?? []).map((p) => ({
      name: p.name,
      scalar: p.scalar === true,
      optional: p.optional === true,
      // Emitted on EVERY prop, not just the true ones: `fn` is non-optional in
      // DerivedCatalog by design, so absent and false can never be confused.
      fn: isFunctionValued(p.type),
    })),
    events: (e.events ?? []).map((v) => v.name),
    methods: (e.methods ?? []).map((m) => m.name),
    parts: (e.parts ?? []).map((p) => p.name),
    // composedFrom entries are objects ({ name, group, storyId }); tokens are
    // plain strings. Verified against element-meta.json; do not add defensive
    // coercion, a shape change should fail loudly here.
    composedFrom: (e.composedFrom ?? []).map((c) => c.name),
    tokens: e.tokens ?? [],
  }))
  .sort((a, b) => a.tag.localeCompare(b.tag));
if (elements.length === 0) fail('element-meta.json yielded zero elements.');

// 2. Part variants, from the union, via the ONE shared derivation.
const partVariants = readVariants(readFileSync(join(ROOT, 'src/elements/chat-types.ts'), 'utf8'));
if (partVariants.length < MIN_VARIANTS) fail(`union parse degraded: ${partVariants.length} variants.`);

// 3. Integrations and capability groups, esbuild-imported from the TS registries.
const registry = await importTs(join(ROOT, 'src/agent-tooling/registry.ts'));
const archetypes = await importTs(join(ROOT, 'src/agent-tooling/archetypes.ts'));
const integrations = registry.listIntegrations().map((i) => ({
  id: i.id,
  category: i.category,
  streamFormat: i.streamFormat,
  keyExposure: i.keyExposure,
}));
const capabilityGroups = archetypes.listCapabilityGroups();
if (integrations.length === 0) fail('registry lists no integrations.');
if (capabilityGroups.length === 0) fail('no capability groups derived.');

// 4. Theme tokens, resolved against the sheet.
const themeTokens = [...new Set(readFileSync(join(ROOT, 'theme.css'), 'utf8').match(/--kai-[a-z0-9-]+/g) ?? [])].sort();
if (themeTokens.length === 0) fail('no --kai-* tokens found in theme.css.');

// 5. Event exceptions: kai-* CustomEvents dispatched with bubbles/composed true
//    OUTSIDE define.tsx (the deliberate protocol events; everything else goes
//    through dispatch(), which hard-codes both false).
//
//    PARSED, NOT REGEXED, and the reason is measured rather than stylistic. The
//    obvious regex `new CustomEvent\(\s*'(kai-[a-z-]+)'\s*,\s*\{([^}]*)\}` emits
//    ZERO exceptions on this tree: `[^}]*` stops at the closing brace of the
//    NESTED `detail: { … }`, so the captured options text never contains
//    `bubbles`/`composed` at all. It does not throw and it does not warn; it
//    quietly reports that the kit has no protocol exceptions, which would gut
//    spec §5's exception list while parsing clean. The compiler API cannot be
//    defeated by formatting, and lint-silent-drops already sets the precedent.
//
//    TWO scoping bugs were found here in review, and both had to be fixed
//    together before the third exception appeared. `emitCardEvent` in
//    src/primitives/card-routing.ts dispatches the bubbling, composed `kai-card`
//    — its own comment calls it "deliberately different from
//    defineWebComponent's built-in non-bubbling dispatch", cards.tsx depends on
//    it crossing shadow boundaries and remote.tsx re-emits it — and it was
//    missed because (a) the scan only read src/elements, and (b) its first
//    argument is the IDENTIFIER `CARD_EVENT_NAME`, not a string literal. So the
//    scan now walks the whole source tree, and resolves a same-file `const` name
//    to its string. A partial loss here is worse than a total one: the floor
//    below only fires at ZERO, so two-of-three looked exactly like success.
function boolProp(objLit, key) {
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === key) {
      if (p.initializer.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (p.initializer.kind === ts.SyntaxKind.FalseKeyword) return false;
    }
  }
  return undefined;
}

/** `const X = 'literal'` declarations in one file, so a dispatch naming its
 *  event through a constant resolves to the same record a literal would. */
function stringConsts(sf) {
  const consts = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      // `const NAME = 'kai-card' as const` parses as an AsExpression; unwrap it.
      const init = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isStringLiteral(init)) consts.set(node.name.text, init.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return consts;
}

const SRC = join(ROOT, 'src');
// Test and story files dispatch synthetic events; they are not the contract.
const NOT_SOURCE = /\.(test|stories)\.[cm]?tsx?$/;
// define.tsx IS the built-in dispatch (both flags hard-coded false); it is the
// rule these records are exceptions to, not one of them.
const NOT_A_SOURCE_OF_EXCEPTIONS = join(SRC, 'elements/define.tsx');

/** Every .ts/.tsx under src/, relative to the package root, POSIX-separated. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(abs));
    else if (/\.tsx?$/.test(entry.name) && !NOT_SOURCE.test(entry.name) && abs !== NOT_A_SOURCE_OF_EXCEPTIONS)
      out.push(abs);
  }
  return out;
}

const exceptionsByKey = new Map();
for (const abs of sourceFiles(SRC)) {
  const rel = relative(ROOT, abs).split(sep).join('/');
  const sf = ts.createSourceFile(rel, readFileSync(abs, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let consts;
  const visit = (node) => {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'CustomEvent' &&
      node.arguments?.length >= 1
    ) {
      const nameArg = node.arguments[0];
      consts ??= stringConsts(sf);
      const event = ts.isStringLiteral(nameArg)
        ? nameArg.text
        : ts.isIdentifier(nameArg)
          ? consts.get(nameArg.text)
          : undefined;
      const opts = node.arguments[1];
      if (opts && ts.isObjectLiteralExpression(opts)) {
        const bubbles = boolProp(opts, 'bubbles') === true;
        const composed = boolProp(opts, 'composed') === true;
        if (bubbles || composed) {
          // Decide loudly: an event name this cannot resolve, dispatched with a
          // protocol flag set, is precisely the silent partial loss that hid
          // kai-card. We cannot tell whether it is kai-*, so we refuse to guess.
          if (event === undefined) {
            fail(
              `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} dispatches a CustomEvent with ` +
                `bubbles/composed set under a name this cannot resolve to a string. Resolve it or the exception list ` +
                `silently loses a protocol event.`,
            );
          }
          if (event.startsWith('kai-')) {
            // Deduped: resizable.tsx dispatches kai-maximize-state from three
            // sites with identical options. One event, one record.
            const rec = { file: rel, event, bubbles, composed };
            exceptionsByKey.set(`${rec.file}|${rec.event}|${rec.bubbles}|${rec.composed}`, rec);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
const eventExceptions = [...exceptionsByKey.values()].sort((a, b) => (a.file + a.event).localeCompare(b.file + b.event));
if (eventExceptions.length === 0)
  fail('zero event exceptions: the tree has protocol exceptions, so the extractor is broken.');

writeFileSync(
  OUT,
  JSON.stringify({ elements, partVariants, integrations, capabilityGroups, themeTokens, eventExceptions }, null, 2) +
    '\n',
);
console.log(
  `gen-catalog: wrote ${OUT} (${elements.length} elements, ${partVariants.length} part variants, ${integrations.length} integrations, ${eventExceptions.length} event exceptions)`,
);
