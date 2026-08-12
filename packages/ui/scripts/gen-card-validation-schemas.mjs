// Generate the LEAN client projection of the 7 card-data schemas, and refuse to
// generate anything whose keywords nobody can account for.
//
//   node scripts/gen-card-validation-schemas.mjs           # write the module
//   node scripts/gen-card-validation-schemas.mjs --check   # fail on drift, write nothing
//
// WHY A PROJECTION AND NOT THE AUTHORED SCHEMAS
// --------------------------------------------
// The native card dispatcher validates every envelope in the BROWSER, so the schema
// data is a client-bundle cost paid by every consumer of this library. The authored
// documents are mostly prose the browser never reads: descriptions written for a
// model, `$id`, `title`, `x-kai-*` UI hints. Stripping them and keeping only the
// keywords `validateAgainstSchema` actually acts on is a large win for zero
// behaviour change, because `walk()` reads a fixed set of keys and ignores every
// other one it is handed.
//
// Measured on this tree, the 7 card-data schemas as one JSON payload
// (`JSON.stringify`, then gzip -9):
//   authored   14,916 B / 4,588 B gzip
//   projected   3,780 B /   855 B gzip
// The plan estimated 4,973 / 1,005 for all ELEVEN documents including the four
// contract shapes, which is why these numbers are lower rather than the plan being
// wrong. The ratio holds: the projection is about 19% of the authored bytes.
//
// The number that actually matters is the BUNDLE delta, which is a different
// measurement and was taken separately: build the package, stub
// CARD_VALIDATION_SCHEMAS to `{}`, build again, diff. Real gzip cost of shipping the
// projection to a browser:
//   dist/index.js            140,919 -> 140,085   =  +834 B gzip
//   dist/register-impl-*.js  182,348 -> 181,573   =  +775 B gzip
//   dist/kai.es.js           unchanged (lazy loader shell, holds no card code)
// The payload figure above is a good proxy for it, which is why both are recorded.
//
// THE GUARD THIS SCRIPT IS
// ------------------------
// Every keyword at every keyword position in every card schema must be in exactly
// one of three tables:
//   ENFORCED       derived from the BODY of validateAgainstSchema, not from a list
//   STRIPPED       annotation/meta; carries no constraint, so dropping it is lossless
//   NOT_ENFORCED   a real constraint this validator does not implement, named here
//                  with a written reason
// Anything else is a hard failure naming the keyword, the file and the path. A
// silent skip list would defeat the point: the whole hazard is a keyword landing in
// a schema, looking like it constrains the model's output, and constraining nothing.
//
// `verify:schemas` and `verify:tool-schemas` are about the SERVER surface (what a
// provider will accept). This is about the CLIENT surface (what we can actually
// check at render time). They are different questions and neither subsumes the other.
//
// THE ENFORCED SET IS READ OUT OF THE VALIDATOR'S BODY, ON PURPOSE
// ---------------------------------------------------------------
// Not out of the `JsonSchema` interface. The interface is a declaration and can
// drift from the implementation in the one direction that matters: adding
// `multipleOf?: number` to the interface without adding a check to `walk()` would
// make a hand-list-based guard call `multipleOf` enforced while nothing enforces it.
// Reading `schema.<keyword>` accesses out of the function body means the guard's
// notion of "enforced" IS the code that enforces it.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // packages/ui
export const SCHEMA_DIR = join(ROOT, 'src/primitives/card-schemas');
export const VALIDATOR_FILE = join(ROOT, 'src/primitives/card-validate.ts');
export const OUT_FILE = join(ROOT, 'src/primitives/card-validate-schemas.ts');

/**
 * The card-DATA schemas, by `CardEnvelope.type`. The other four documents in that
 * directory (`card-envelope`, `card-event`, `form.result`, `tasks.result`) are
 * contract shapes, not card data: nothing dispatches on them, so projecting them
 * would ship bytes the dispatcher can never use.
 */
export const CARD_TYPES = ['artifact', 'choice', 'confirm', 'embed', 'form', 'link', 'tasks'];

// ---------------------------------------------------------------------------
// Table 1: ENFORCED, derived from the validator's body
// ---------------------------------------------------------------------------

/**
 * Every keyword `validateAgainstSchema` reads, recovered from the source of
 * src/primitives/card-validate.ts.
 *
 * Two spellings are matched because the validator uses both: `schema.minItems` for
 * ordinary reads and `'const' in schema` for the one keyword whose absence and whose
 * `undefined` value must be told apart.
 */
export function enforcedKeywords(source = readFileSync(VALIDATOR_FILE, 'utf8')) {
  const found = new Set();
  for (const m of source.matchAll(/\bschema\.([A-Za-z$_][A-Za-z0-9$_]*)\b/g)) found.add(m[1]);
  for (const m of source.matchAll(/['"]([A-Za-z$_][A-Za-z0-9$_]*)['"]\s+in\s+schema\b/g)) found.add(m[1]);
  // A regex that silently matches nothing would make every keyword look
  // NOT_ENFORCED, which fails loudly; a regex that matches everything would make
  // every keyword look enforced, which fails SILENTLY and is the dangerous
  // direction. So assert the shape of what came back, not just that it is non-empty.
  for (const required of ['type', 'required', 'properties', 'items', 'const', 'enum']) {
    if (!found.has(required)) {
      throw new Error(
        `gen-card-validation-schemas: could not recover \`${required}\` from ${VALIDATOR_FILE}. ` +
          'The extraction regex has drifted from the validator; fix it rather than hand-listing the keywords.',
      );
    }
  }
  if (found.has('items') === false || found.size > 40) {
    throw new Error(`gen-card-validation-schemas: implausible enforced set (${found.size} keywords); check the extraction regex.`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Table 2: STRIPPED, carries no constraint, so dropping it changes nothing
// ---------------------------------------------------------------------------

/**
 * Keywords the projection drops because they cannot constrain an instance. These
 * are annotations and meta-keywords: removing one from a schema cannot change
 * whether any value validates, under this validator or any other. This is the only
 * table where dropping is lossless by definition rather than by judgement.
 *
 * `x-*` (including every `x-kai-*`) is handled by prefix, below.
 */
export const STRIPPED = Object.freeze({
  $schema: 'meta-keyword: names the dialect, constrains nothing',
  $id: 'meta-keyword: names the document, constrains nothing',
  title: 'annotation: a human label for the subschema',
  description: 'annotation: written for the MODEL, which reads the server-side schema, not this projection',
  default: 'annotation: a suggested value; JSON Schema gives it no assertion behaviour',
  examples: 'annotation',
  deprecated: 'annotation',
  readOnly: 'annotation',
  writeOnly: 'annotation',
  $comment: 'annotation',
});

// ---------------------------------------------------------------------------
// Table 3: NOT_ENFORCED, a real constraint we do not check. Named, with a reason.
// ---------------------------------------------------------------------------

/**
 * Keywords that DO constrain an instance and that `validateAgainstSchema` does not
 * implement. Dropping these from the projection is a real loss of coverage, so each
 * one is written down with what is consequently unchecked.
 *
 * This table is the honest half of the claim "the kit validates cards". It does, for
 * the keywords in ENFORCED. For these, it does not, and saying otherwise would be
 * the exact defect this repo keeps shipping.
 */
export const NOT_ENFORCED = Object.freeze({
  additionalProperties:
    'unknown properties are NOT rejected. `artifact`, `embed` and `link` set `additionalProperties: false`; ' +
    'a model adding a field they do not declare renders exactly as it does today. Implementing it would make ' +
    'every extra field a validation failure on cards that render fine, which is the regression the tiering exists to avoid.',
  allOf:
    'conditional requirements are NOT checked. This is `embed`\'s entire provider/url rule ' +
    '(generic needs `url`; youtube/vimeo need `id` or `url`), so an embed card missing both validates here and ' +
    'renders an empty player. Fixing it means implementing applicators, not widening this table.',
  anyOf:
    'branch alternatives are NOT checked. This is `artifact`\'s root `[{required:["src"]},{required:["files"]}]` ' +
    'rule, so an artifact card carrying NEITHER a `src` nor a `files` list validates here and renders empty chrome. ' +
    'It is also half of `embed`\'s youtube/vimeo `id`-or-`url` rule.',
  oneOf:
    'exactly-one-of is NOT checked. `artifact.height` is `oneOf: [number, string]`, and because that subschema ' +
    'has no other keyword it drops out of the projection entirely: a `height` of `true` or `{}` is not caught.',
  if: 'the conditional applicator is NOT evaluated; see `allOf`.',
  then: 'the conditional consequent is NOT evaluated; see `allOf`.',
  else: 'the conditional alternative is NOT evaluated; see `allOf`.',
  not: 'negation is NOT evaluated; a value the schema explicitly forbids validates here. Unused by any card schema today.',
  format:
    'string formats are NOT checked. `link`, `embed` and `artifact` use `format: "uri"`; a non-URL string in ' +
    '`link.url` validates here. The cards themselves guard what they will actually navigate to or frame, which is ' +
    'where a URL check belongs (a validator that only warns cannot stop a bad origin loading).',
  $ref: 'references are NOT resolved; a `$ref`-ed subschema is not checked at all. No card schema uses one today.',
  $defs: 'definition blocks are NOT reachable without `$ref`, so their contents are never checked.',
  definitions:
    'the draft-07 spelling of `$defs`; its contents are NOT checked either, for the same reason. Listed separately ' +
    'so a schema written in the older dialect cannot slip past this table.',
});

const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStripped = (k) => k.startsWith('x-') || Object.hasOwn(STRIPPED, k);

// Keyword positions, spelled the same way src/schemas/provider-subsets.ts spells
// them. The distinction is the whole reason this cannot be a `delete obj[key]` pass:
// under `properties`, the KEYS are property names chosen by the schema author, not
// keywords. `link.schema.json` has properties literally named `title` and
// `description`; `choice.schema.json` has one named `description`; `form.schema.json`
// has ones named `type`, `properties`, `required` and `x-kai-order`. A naive strip
// would delete real card fields and the projection would validate the wrong shape.
const SUBSCHEMA_KEYS = ['items', 'if', 'then', 'else', 'not', 'contains', 'propertyNames', 'unevaluatedItems', 'additionalItems'];
const SUBSCHEMA_MAP_KEYS = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];
const SUBSCHEMA_LIST_KEYS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];

// ---------------------------------------------------------------------------
// The scan: classify every keyword, everywhere, and fail on anything unaccounted for
// ---------------------------------------------------------------------------

/**
 * Walk a schema document and return the unclassified keywords, with their paths.
 *
 * Scans the WHOLE document, including the subtrees the projection is about to throw
 * away. A `multipleOf` hidden inside `embed`'s `allOf` cannot affect validation, but
 * whoever wrote it believed it constrained the model, and the point of this guard is
 * to correct that belief at build time rather than in production.
 */
export function scanUnclassified(doc, enforced, path = '(root)', out = []) {
  if (typeof doc === 'boolean') return out;
  if (!isRecord(doc)) return out;

  for (const keyword of Object.keys(doc)) {
    if (enforced.has(keyword) || isStripped(keyword) || Object.hasOwn(NOT_ENFORCED, keyword)) continue;
    out.push({ path, keyword });
  }

  for (const key of SUBSCHEMA_MAP_KEYS) {
    if (!isRecord(doc[key])) continue;
    for (const [name, child] of Object.entries(doc[key])) {
      scanUnclassified(child, enforced, key === 'properties' ? `${path}.${name}` : `${path}/${key}[${name}]`, out);
    }
  }
  for (const key of SUBSCHEMA_KEYS) {
    if (!(key in doc)) continue;
    scanUnclassified(doc[key], enforced, key === 'items' ? `${path}[]` : `${path}/${key}`, out);
  }
  if (isRecord(doc.additionalProperties)) scanUnclassified(doc.additionalProperties, enforced, `${path}/additionalProperties`, out);
  for (const key of SUBSCHEMA_LIST_KEYS) {
    if (!Array.isArray(doc[key])) continue;
    doc[key].forEach((child, i) => scanUnclassified(child, enforced, `${path}/${key}[${i}]`, out));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

/**
 * Keep only what `validateAgainstSchema` acts on.
 *
 * Returns `undefined` for a subschema that projects to nothing, so the caller can
 * drop the entry entirely rather than ship `{}`. That is not cosmetic: `walk()`
 * descends into `properties` entries it is given, so `payload: {}` and
 * `allowOther: {}` would be pure bytes for a no-op traversal.
 */
export function projectSchema(doc, enforced) {
  if (!isRecord(doc)) return undefined;
  const out = {};
  for (const [keyword, value] of Object.entries(doc)) {
    if (!enforced.has(keyword)) continue; // stripped, not-enforced, or unclassified (already reported)

    if (SUBSCHEMA_MAP_KEYS.includes(keyword) && isRecord(value)) {
      const map = {};
      for (const [name, child] of Object.entries(value)) {
        const projected = projectSchema(child, enforced);
        if (projected !== undefined) map[name] = projected;
      }
      if (Object.keys(map).length > 0) out[keyword] = map;
      continue;
    }
    if (SUBSCHEMA_KEYS.includes(keyword)) {
      const projected = projectSchema(value, enforced);
      if (projected !== undefined) out[keyword] = projected;
      continue;
    }
    out[keyword] = value;
  }
  // A subschema that kept only `type: "object"` and lost all its properties still
  // constrains the type, so it survives. One that kept nothing at all does not.
  return Object.keys(out).length > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderModule(projections, enforced) {
  const enforcedList = [...enforced].sort().join(', ');
  const notEnforcedLines = Object.entries(NOT_ENFORCED).map(([k, why]) => `//   \`${k}\`: ${why}`);
  const body = CARD_TYPES.map((t) => `  ${JSON.stringify(t)}: ${JSON.stringify(projections[t])},`).join('\n');

  return `// GENERATED by scripts/gen-card-validation-schemas.mjs. Do not edit by hand.
//
// Run \`node scripts/gen-card-validation-schemas.mjs\` (or any build, which does it in
// \`prebuild\`) to regenerate. \`card-validate-schemas.sync.test.ts\` fails if this file
// and the authored schemas in src/primitives/card-schemas/ disagree.
//
// WHAT THIS IS
// ------------
// The 7 card-data schemas with everything the browser cannot act on removed:
// \`$schema\`, \`$id\`, \`title\`, \`description\`, \`default\`, every \`x-*\` hint, and every
// keyword \`validateAgainstSchema\` does not implement. The authored documents remain
// the source of truth and ship unchanged at \`@kitn.ai/ui/schemas\` for the server.
//
// ENFORCED here, read out of validateAgainstSchema's body by the generator:
//   ${enforcedList}
//
// NOT ENFORCED, and therefore NOT in this projection. Each is a real constraint the
// authored schema makes that nothing checks at render time:
${notEnforcedLines.join('\n')}
import type { JsonSchema } from './card-validate';

/** The built-in \`CardEnvelope.type\` values that have a schema to validate against. */
export type ValidatedCardType = ${CARD_TYPES.map((t) => JSON.stringify(t)).join(' | ')};

/**
 * One widening cast, at the module boundary, for the same reason
 * src/schemas/index.ts has one: TypeScript infers \`string\` for a \`"type"\` member
 * written as a literal in an object literal, while \`JsonSchema['type']\` is a union
 * of string literals, so these documents are not assignable without it. The
 * alternative (\`as const\` throughout) makes every \`required\` array \`readonly\`,
 * which \`JsonSchema\` does not accept either.
 *
 * The cast is not a claim about the contents. What it would otherwise hide is
 * checked by the sync test, which re-runs this generator and compares byte for byte.
 */
export const CARD_VALIDATION_SCHEMAS = {
${body}
} as unknown as Readonly<Record<ValidatedCardType, JsonSchema>>;

/** The card types this projection covers, in a stable order. */
export const VALIDATED_CARD_TYPES: readonly ValidatedCardType[] = ${JSON.stringify(CARD_TYPES)};
`;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/** Read, scan and project. Throws with every unclassified keyword named. */
export function build() {
  const enforced = enforcedKeywords();
  const present = new Set(readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json')));
  const projections = {};
  const failures = [];

  for (const type of CARD_TYPES) {
    const file = `${type}.schema.json`;
    if (!present.has(file)) throw new Error(`gen-card-validation-schemas: ${file} is missing from ${SCHEMA_DIR}`);
    const doc = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
    for (const { path, keyword } of scanUnclassified(doc, enforced)) failures.push({ file, path, keyword });
    const projected = projectSchema(doc, enforced);
    if (projected === undefined) throw new Error(`gen-card-validation-schemas: ${file} projected to nothing.`);
    projections[type] = projected;
  }

  if (failures.length > 0) {
    const lines = failures.map(({ file, path, keyword }) => `  ${file}  ${path}  \`${keyword}\``);
    throw new Error(
      `gen-card-validation-schemas: ${failures.length} keyword(s) in the card schemas are not accounted for:\n${lines.join('\n')}\n\n` +
        'Every keyword must be one of:\n' +
        `  ENFORCED     implemented in ${VALIDATOR_FILE.replace(ROOT + '/', '')} (add the check there)\n` +
        '  STRIPPED     an annotation that cannot constrain an instance (add it to STRIPPED)\n' +
        '  NOT_ENFORCED a real constraint we do not check (add it to NOT_ENFORCED with a written reason)\n\n' +
        'Do not add it to STRIPPED to make this pass. A constraint the model is shown and nothing checks is\n' +
        'the exact failure this guard exists to prevent.',
    );
  }
  return { enforced, projections, source: renderModule(projections, enforced) };
}

function main() {
  const check = process.argv.includes('--check');
  let built;
  try {
    built = build();
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
  const current = (() => {
    try {
      return readFileSync(OUT_FILE, 'utf8');
    } catch {
      return null;
    }
  })();

  if (check) {
    if (current === built.source) {
      console.log(`✓ card-validate-schemas.ts is in sync (${CARD_TYPES.length} card schemas)`);
      return;
    }
    console.error(
      `✗ src/primitives/card-validate-schemas.ts is stale.\n` +
        `  The authored schemas in src/primitives/card-schemas/ have changed and the projection was not regenerated.\n` +
        `  Fix: node scripts/gen-card-validation-schemas.mjs`,
    );
    process.exit(1);
  }

  if (current === built.source) {
    console.log(`✓ card-validate-schemas.ts unchanged (${CARD_TYPES.length} card schemas)`);
    return;
  }
  writeFileSync(OUT_FILE, built.source);
  console.log(`✓ card-validate-schemas.ts: ${CARD_TYPES.length} card schemas projected`);
}

// pathToFileURL, NOT `file://${process.argv[1]}`: import.meta.url percent-encodes and
// a path does not, so on a checkout under `/My Repo/` the hand-built string never
// matched and `main()` silently did not run — including under `npm run
// verify:card-validation`, which then exited 0 having checked nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
