// Emits src/agent-tooling/catalog/derived.json: the catalog's derived
// ingredient layer. Runs inside build:api so verify:generated regenerates and
// diffs it (the element-manifest lesson: the guard must invoke the script that
// writes the artifact).
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as esbuild from 'esbuild';
import { readVariants, MIN_VARIANTS } from './lib/message-part-variants.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/agent-tooling/catalog/derived.json');

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
function boolProp(objLit, key) {
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === key) {
      if (p.initializer.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (p.initializer.kind === ts.SyntaxKind.FalseKeyword) return false;
    }
  }
  return undefined;
}

const elDir = join(ROOT, 'src/elements');
// Test and story files dispatch synthetic events; they are not the contract.
const NOT_SOURCE = /\.(test|stories)\.tsx$/;
const exceptionsByKey = new Map();
for (const f of readdirSync(elDir).filter((n) => n.endsWith('.tsx') && n !== 'define.tsx' && !NOT_SOURCE.test(n))) {
  const sf = ts.createSourceFile(f, readFileSync(join(elDir, f), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'CustomEvent' &&
      node.arguments?.length >= 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text.startsWith('kai-')
    ) {
      const opts = node.arguments[1];
      if (opts && ts.isObjectLiteralExpression(opts)) {
        const bubbles = boolProp(opts, 'bubbles') === true;
        const composed = boolProp(opts, 'composed') === true;
        if (bubbles || composed) {
          // Deduped: resizable.tsx dispatches kai-maximize-state from three
          // sites with identical options. One event, one record.
          const rec = { file: `src/elements/${f}`, event: node.arguments[0].text, bubbles, composed };
          exceptionsByKey.set(`${rec.file}|${rec.event}|${rec.bubbles}|${rec.composed}`, rec);
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
