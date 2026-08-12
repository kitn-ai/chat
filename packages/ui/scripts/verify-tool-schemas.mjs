// Tool-definition guard: a projected card schema must be something the provider
// would actually accept, and the two provider subsets must stay two documents.
//
// WHY IT EXISTS
// -------------
// `cardTools()` hands a model a tool definition built from a card's JSON Schema. If
// that projection emits a keyword the provider's strict mode cannot compile, the
// developer gets a 400 from an API call in production with nothing local to look at.
// Unit tests check the projection's behaviour; this checks the SHIPPED artifact, by
// importing the built `dist/schemas.js` the way a consumer would.
//
// THE BLIND SPOT IT MUST NOT HAVE
// -------------------------------
// The failure mode this repo keeps shipping is a check keyed on something that
// exists on only one of two wires: it passes forever while covering one. The
// equivalent here would be ONE supported-keyword table with a provider flag. So:
//
//   1. TWO tables, each with its own source-doc URL, asserted to DIFFER. A
//      copy-paste that collapses them fails at check A.
//   2. `minItems` is the tell, checked by VALUE, not by presence: legal at any value
//      on OpenAI, legal only at 0 or 1 on Anthropic (check B).
//   3. Every keyword occurring in any authored card schema must be CLASSIFIED by
//      BOTH tables. An unclassified keyword is a hard failure, never a silent pass
//      (check C). This is the `TOOL_KEYS` pattern: the day someone writes a keyword
//      neither provider documents, the build says so.
//
// The schema walker below is written INDEPENDENTLY of the one in
// src/schemas/provider-subsets.ts, on purpose. A guard that reuses the code it is
// checking proves that the code agrees with itself.
//
// Needs a build first (it imports dist/schemas.js).
//   node scripts/verify-tool-schemas.mjs [--verbose]

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const SCHEMA_DIR = join(ROOT, 'src', 'primitives', 'card-schemas');
const BUILT = join(ROOT, 'dist', 'schemas.js');

const problems = [];
const fail = (msg) => problems.push(msg);

if (!existsSync(BUILT)) {
  console.error(`✗ verify-tool-schemas: ${BUILT} is missing. Run \`npm run build\` (or \`nx build ui\`) first.`);
  process.exit(1);
}

const mod = await import(pathToFileURL(BUILT).href);
const {
  cardSchemas,
  cardSchemaNames,
  cardTools,
  cardTypeFromToolName,
  checkProviderSubset,
  providerSubsets,
  OPENAI_STRICT,
  ANTHROPIC_STRICT,
  UnsupportedCardToolSchemaError,
} = mod;

for (const [name, value] of Object.entries({
  cardSchemas, cardSchemaNames, cardTools, cardTypeFromToolName, checkProviderSubset,
  providerSubsets, OPENAI_STRICT, ANTHROPIC_STRICT, UnsupportedCardToolSchemaError,
})) {
  if (value === undefined) fail(`the built entry does not export \`${name}\`; @kitn.ai/ui/schemas is missing part of the tool-definition surface`);
}
if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// A. the two subsets are two documents
// ---------------------------------------------------------------------------

const stable = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'function' ? '[fn]' : x));

if (stable(OPENAI_STRICT.keywords) === stable(ANTHROPIC_STRICT.keywords)) {
  fail(
    'OPENAI_STRICT.keywords and ANTHROPIC_STRICT.keywords are IDENTICAL.\n' +
      '      The two providers document different subsets, so one table copy-pasted over the\n' +
      '      other means every rule for one of them is now a guess. This is the single-table-\n' +
      '      with-a-provider-flag defect, and it is why they are written out twice.',
  );
}
for (const subset of Object.values(providerSubsets)) {
  if (!/^https:\/\//.test(subset.source ?? '')) {
    fail(`${subset.id}: the subset carries no source URL, so its rules cannot be argued against a document`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(subset.checkedOn ?? '')) {
    fail(`${subset.id}: the subset carries no \`checkedOn\` date, so nobody can tell how stale it is`);
  }
}

// ---------------------------------------------------------------------------
// B. minItems is the tell, and it is checked by VALUE
// ---------------------------------------------------------------------------

const arrayOf = (n) => ({ type: 'array', minItems: n, items: { type: 'string' } });
const namesFrom = (vs) => vs.map((v) => v.keyword);

if (namesFrom(checkProviderSubset(arrayOf(5), OPENAI_STRICT)).includes('minItems')) {
  fail('OPENAI_STRICT rejects `minItems: 5`, but OpenAI documents minItems at any value');
}
if (!namesFrom(checkProviderSubset(arrayOf(2), ANTHROPIC_STRICT)).includes('minItems')) {
  fail(
    'ANTHROPIC_STRICT accepts `minItems: 2`, but Anthropic documents "Array minItems (only values 0 and 1 supported)".\n' +
      '      This is the tell: if the two tables ever collapse into one, this is the rule that\n' +
      '      silently becomes wrong and 400s at request time.',
  );
}
if (namesFrom(checkProviderSubset(arrayOf(1), ANTHROPIC_STRICT)).includes('minItems')) {
  fail('ANTHROPIC_STRICT rejects `minItems: 1`, but 0 and 1 are the two documented legal values');
}

// ---------------------------------------------------------------------------
// C. every keyword in every authored schema is classified by BOTH tables
// ---------------------------------------------------------------------------

// An INDEPENDENT walker. Knows which positions hold keywords and which hold
// arbitrary names: `properties`' keys are field names, and form.schema.json has
// fields genuinely called `properties` and `x-kai-order`.
const SUB = ['items', 'if', 'then', 'else', 'not', 'contains', 'propertyNames', 'unevaluatedItems', 'additionalItems'];
const SUB_MAP = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];
const SUB_LIST = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];

function collectKeywords(node, into) {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return into;
  for (const [k, v] of Object.entries(node)) {
    into.add(k);
    if (SUB_MAP.includes(k) && typeof v === 'object' && v !== null) {
      for (const child of Object.values(v)) collectKeywords(child, into);
    } else if (SUB.includes(k) || k === 'additionalProperties') {
      collectKeywords(v, into);
    } else if (SUB_LIST.includes(k) && Array.isArray(v)) {
      for (const child of v) collectKeywords(child, into);
    }
  }
  return into;
}

const schemaFiles = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.json')).sort();
if (schemaFiles.length === 0) fail(`no schema documents found in ${SCHEMA_DIR}`);

const unclassified = [];
for (const file of schemaFiles) {
  const doc = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
  for (const keyword of collectKeywords(doc, new Set())) {
    if (keyword.startsWith('x-')) continue; // vendor extensions are recognised as such
    for (const subset of Object.values(providerSubsets)) {
      if (!subset.keywords[keyword]) unclassified.push(`${file}: \`${keyword}\` is not classified by ${subset.label}`);
    }
  }
}
if (unclassified.length) {
  fail(
    `${unclassified.length} keyword/table pair(s) are unclassified. A keyword neither table knows about\n` +
      '      is a keyword whose provider support is a guess:\n' +
      unclassified.map((u) => `        ${u}`).join('\n'),
  );
}

// ---------------------------------------------------------------------------
// D. the non-strict projection: shape, naming, and nothing internal on the wire
// ---------------------------------------------------------------------------

const ENVELOPE = {
  openai: (d) => d?.function?.parameters,
  anthropic: (d) => d?.input_schema,
  jsonschema: (d) => d?.schema,
};
const NAME_OF = {
  openai: (d) => d?.function?.name,
  anthropic: (d) => d?.name,
  jsonschema: (d) => d?.name,
};

for (const provider of ['openai', 'anthropic', 'jsonschema']) {
  let defs;
  try {
    defs = cardTools({ provider });
  } catch (e) {
    fail(`cardTools({ provider: '${provider}' }) threw in NON-strict mode: ${e.message}`);
    continue;
  }
  if (defs.length !== cardSchemaNames.length) {
    fail(`cardTools({ provider: '${provider}' }) emitted ${defs.length} tools for ${cardSchemaNames.length} card types`);
  }
  for (const def of defs) {
    const name = NAME_OF[provider](def);
    const params = ENVELOPE[provider](def);
    if (params === undefined) {
      fail(`${provider}: a tool definition has no schema in the documented place (${provider === 'openai' ? 'function.parameters' : provider === 'anthropic' ? 'input_schema' : 'schema'})`);
      continue;
    }
    // the forward name must survive the inverse, or the model calls a tool the loop
    // does not recognise and the call silently goes to the app's own runTool
    const type = cardTypeFromToolName(name);
    if (type === null || !(type in cardSchemas)) {
      fail(`${provider}: tool name "${name}" does not map back to a card type through cardTypeFromToolName`);
    }
    if (!def.description && !def.function?.description) {
      fail(`${provider}: ${name} has no description; a model choosing between tools has nothing to go on`);
    }
    const leaked = [...collectKeywords(params, new Set())].filter((k) => k === '$schema' || k === '$id' || k.startsWith('x-'));
    // form's card data is itself a JSON Schema, so it has FIELDS named x-kai-*.
    // Those live under `properties` and are not keyword positions, so they never
    // reach here; anything that does is genuine metadata that should have been
    // stripped before it cost tokens in every request.
    if (leaked.length) fail(`${provider}: ${name} ships internal keyword(s) on the wire: ${leaked.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// E. strict: emit-or-throw, and the throw must be grounded in the real document
// ---------------------------------------------------------------------------

const STRUCTURAL = new Set(['type', 'required', 'additionalProperties', 'properties']);

for (const [provider, subset] of [['openai', OPENAI_STRICT], ['anthropic', ANTHROPIC_STRICT]]) {
  for (const type of cardSchemaNames) {
    const doc = JSON.stringify(cardSchemas[type]);
    let defs = null;
    try {
      defs = cardTools({ [type]: cardSchemas[type] }, { provider, strict: true });
    } catch (e) {
      if (!(e instanceof UnsupportedCardToolSchemaError)) {
        fail(`${provider}/${type}: strict projection threw a ${e?.name ?? typeof e} instead of UnsupportedCardToolSchemaError: ${e?.message}`);
        continue;
      }
      if (e.cards.length === 0 || e.cards.some((c) => c.violations.length === 0)) {
        fail(`${provider}/${type}: threw without naming a single violation, which is a generic rejection`);
      }
      for (const card of e.cards) {
        for (const v of card.violations) {
          if (STRUCTURAL.has(v.keyword)) continue; // reported for what is MISSING
          if (!doc.includes(`"${v.keyword}"`)) {
            fail(
              `${provider}/${type}: the error names \`${v.keyword}\`, which does not occur in the authored schema.\n` +
                '      A phantom keyword is worse than no error: it sends the developer looking for a line that is not there.',
            );
          }
        }
      }
      if (VERBOSE) console.log(`  · ${provider}/${type}: strict rejected, naming ${[...new Set(e.cards.flatMap((c) => c.violations.map((v) => v.keyword)))].join(', ')}`);
      continue;
    }
    // It emitted. Then our own table must be happy with what we emitted, or we are
    // the ones producing the 400.
    for (const def of defs) {
      const params = ENVELOPE[provider](def);
      const left = checkProviderSubset(params, subset);
      if (left.length) {
        fail(
          `${provider}/${type}: strict projection EMITTED a schema that ${subset.label} rejects:\n` +
            left.map((v) => `        ${v.path}: \`${v.keyword}\` — ${v.reason}`).join('\n'),
        );
      }
    }
    if (VERBOSE) console.log(`  ✓ ${provider}/${type}: strict projection is inside the subset`);
  }
}

// ---------------------------------------------------------------------------
// F. no silent downgrade, and the emit path is exercised for real
// ---------------------------------------------------------------------------
//
// Check E is honest but, today, one-sided: all seven built-in cards are rejected
// under strict on both providers, so E's "it emitted, is the emission clean?" branch
// never runs, and E cannot tell a THROW from a projection that quietly deleted the
// offending keyword and emitted a looser schema. Both would look identical to it.
//
// So this check builds two schemas of its own. One is inside both subsets and must
// emit. The other is the first plus a single out-of-subset keyword, and must THROW
// naming that keyword. If it emits instead, someone has made the projection drop
// constraints, which means a `maxItems: 4` silently becomes unbounded and the model
// renders six buttons in a card designed for four, with no signal anywhere.

const INSIDE_BOTH = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'tags'],
  description: 'A schema deliberately inside both documented strict subsets.',
  properties: {
    label: { type: 'string', description: 'Any text.' },
    tags: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'At least one tag.' },
  },
};

// `maxItems` is supported on OpenAI and unsupported on Anthropic, so the same added
// keyword must be accepted by one and rejected by the other. That doubles as a
// second, independent proof that the two tables are not the same table.
const DOWNGRADE_PROBES = [
  { provider: 'anthropic', keyword: 'maxItems', mutate: (s) => { s.properties.tags.maxItems = 4; } },
  { provider: 'openai', keyword: 'minLength', mutate: (s) => { s.properties.label.minLength = 1; } },
];

for (const provider of ['openai', 'anthropic']) {
  try {
    const [def] = cardTools({ schemas: { probe: INSIDE_BOTH }, descriptions: { probe: 'A probe tool.' } }, { provider, strict: true });
    const params = ENVELOPE[provider](def);
    const left = checkProviderSubset(params, providerSubsets[provider]);
    if (left.length) fail(`${provider}: a schema built to be inside the subset came back with violations: ${namesFrom(left).join(', ')}`);
    const flag = provider === 'openai' ? def.function.strict : def.strict;
    if (flag !== true) fail(`${provider}: a successful strict projection did not mark the tool \`strict: true\` on the wire`);
  } catch (e) {
    fail(
      `${provider}: a schema written to be INSIDE the documented subset was rejected: ${e.message}\n` +
        '      Either the table is wrong or the projection is; strict mode is unusable for anyone either way.',
    );
  }
}

for (const { provider, keyword, mutate } of DOWNGRADE_PROBES) {
  const mutated = JSON.parse(JSON.stringify(INSIDE_BOTH));
  mutate(mutated);
  let emitted = null;
  try {
    emitted = cardTools({ schemas: { probe: mutated }, descriptions: { probe: 'A probe tool.' } }, { provider, strict: true });
  } catch (e) {
    if (!(e instanceof UnsupportedCardToolSchemaError) || !e.keywords.includes(keyword)) {
      fail(`${provider}: adding \`${keyword}\` threw, but did not name it (named: ${e.keywords?.join(', ') ?? e.message})`);
    } else if (VERBOSE) {
      console.log(`  ✓ ${provider}: \`${keyword}\` is refused by name rather than dropped`);
    }
  }
  if (emitted) {
    const params = ENVELOPE[provider](emitted[0]);
    const kept = JSON.stringify(params).includes(`"${keyword}"`);
    fail(
      `${provider}: adding \`${keyword}\` did NOT throw. The projection ${kept ? 'emitted it anyway, which the provider would 400 on' : 'silently DROPPED it'}.\n` +
        '      A dropped constraint loosens the contract with no local signal: the model emits\n' +
        '      data the card was never designed to render and nothing anywhere says so.',
    );
  }
}

// ---------------------------------------------------------------------------

if (problems.length) {
  console.error(`\n✗ verify-tool-schemas: ${problems.length} problem(s).\n`);
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  process.exit(1);
}

console.log(
  `✓ verify-tool-schemas: ${cardSchemaNames.length} card types project cleanly for 3 providers; ` +
    `the 2 strict subsets differ and classify every keyword in ${schemaFiles.length} schema documents.`,
);
