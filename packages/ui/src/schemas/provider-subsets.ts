// What each provider's STRICT mode can actually compile, written down twice.
//
// WHY TWO TABLES AND NOT ONE WITH A FLAG
// --------------------------------------
// The tempting shape here is one keyword map with `{ openai: true, anthropic: false }`
// per entry. That is the same defect this repo shipped in the wire adapter: a check
// keyed on a field name that exists on only one of the two wires, which passed for
// months while covering one provider. A single table makes the two subsets look like
// one fact with a discriminator, and the next person to add a keyword fills in one
// column, guesses the other, and nothing catches it.
//
// So: two independent documents, each with its own source URL and its own reading
// date, each restating even the entries the other agrees on. `verify:tool-schemas`
// asserts they DIFFER, so a copy-paste that collapses one into the other fails
// loudly. `minItems` is the tell and it is not a hypothetical: OpenAI accepts any
// value, Anthropic accepts 0 or 1 and 400s on 2.
//
// WHAT "UNKNOWN" MEANS
// --------------------
// A keyword absent from a table is a VIOLATION, never a pass. That is deliberate and
// it is the whole reason the tables enumerate keywords they will never see (
// `unevaluatedItems`, `minContains`, ...). A silent skip list defeats the guard: the
// day someone writes a keyword neither provider documents, the build must say so
// rather than shipping a schema that 400s in production.

/** The providers whose strict subsets are documented here. */
export type StrictProviderId = 'openai' | 'anthropic';

/**
 * How a table classifies one keyword.
 *
 * `annotation` is not a synonym for `supported`. JSON Schema annotations (
 * `title`, `description`, `examples`, ...) do not constrain an instance, so a
 * grammar compiler has nothing to compile from them and cannot reject them. They are
 * separated from `supported` so that a table entry answers "the provider documents
 * this" distinctly from "this cannot affect the grammar either way".
 */
export type KeywordStatus = 'supported' | 'unsupported' | 'annotation';

export interface KeywordRule {
  readonly status: KeywordStatus;
  /** Why, in the words of the source doc where possible. Surfaced in the error. */
  readonly note: string;
  /**
   * A value-level constraint on an otherwise supported keyword. Returns a reason
   * string when the specific VALUE is out of subset, or null when it is fine.
   * This is where `minItems: 2` on Anthropic and `format: "uri"` on OpenAI live:
   * the keyword is supported, the value is not.
   */
  readonly value?: (value: unknown) => string | null;
}

export interface ProviderSubset {
  readonly id: StrictProviderId;
  readonly label: string;
  /** The page these rules were read off. Quoted in every violation message. */
  readonly source: string;
  /** ISO date the source was last read. Rules go stale; this says how stale. */
  readonly checkedOn: string;
  readonly keywords: Readonly<Record<string, KeywordRule>>;
  /** Every object subschema must carry `additionalProperties: false`. */
  readonly requireAdditionalPropertiesFalse: boolean;
  /** Every key of `properties` must appear in `required` (OpenAI's rule, not Anthropic's). */
  readonly requireAllPropertiesRequired: boolean;
  /** Whether the ROOT schema may carry `anyOf`. */
  readonly allowRootAnyOf: boolean;
  /** Whether `$ref` may point at an ancestor (recursion). */
  readonly allowRecursion: boolean;
}

/**
 * Freeze a keyword table under its contextual type.
 *
 * Not decoration: a bare `Object.freeze({ status: 'supported', ... })` infers
 * `status: string`, which is assignable to nothing and, worse, would let a typo like
 * `status: 'supproted'` compile. Going through this annotates each entry as a
 * `KeywordRule`, so the three statuses are checked and the `value` callback gets its
 * `unknown` parameter without a hand-written annotation on every one.
 */
const keywordTable = (t: Record<string, KeywordRule>): Readonly<Record<string, KeywordRule>> => Object.freeze(t);

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

/**
 * OpenAI strict function calling / structured outputs.
 *
 * SOURCE: https://developers.openai.com/api/docs/guides/structured-outputs
 * (sections "Supported schemas", "Supported properties", "Some type-specific
 * keywords are not yet supported"), read 2026-08-11. The older
 * platform.openai.com/docs/guides/structured-outputs URL 301s here.
 *
 * Quoted from that page:
 * - supported types: "String, Number, Boolean, Integer, Object, Array, Enum, anyOf"
 * - "Objects have `additionalProperties: false` must always be set"
 * - "All fields or function parameters must be specified as `required`" (an optional
 *   field is emulated with a union type including `null`)
 * - supported String properties: `pattern`, `format`
 * - supported Number properties: `multipleOf`, `maximum`, `exclusiveMaximum`,
 *   `minimum`, `exclusiveMinimum`
 * - supported Array properties: `minItems`, `maxItems`
 * - not supported, composition: "`allOf`, `not`, `dependentRequired`,
 *   `dependentSchemas`, `if`, `then`, `else`"
 * - "Root level object of a schema must be an object, and not use `anyOf`"
 *
 * ONE JUDGEMENT CALL, RECORDED BECAUSE IT IS A COIN FLIP.
 * `minLength` / `maxLength` are absent from "Supported properties", which lists only
 * `pattern` and `format` for strings. They appear once elsewhere, in the list of what
 * is "additionally" unsupported for FINE-TUNED models, which can be read as implying
 * base models do support them. The docs do not settle it. This table takes the
 * allowlist reading (unsupported) because the two ways of being wrong are not
 * symmetric: a wrong `supported` is a 400 at request time in the developer's
 * production app with nothing local to look at, while a wrong `unsupported` is a
 * throw on their own machine that names the keyword and the source, which they can
 * read and argue with. If OpenAI clarifies, change this entry and the guard's
 * expectations follow automatically.
 */
export const OPENAI_STRICT: ProviderSubset = Object.freeze({
  id: 'openai',
  label: 'OpenAI strict',
  source: 'https://developers.openai.com/api/docs/guides/structured-outputs',
  checkedOn: '2026-08-11',
  requireAdditionalPropertiesFalse: true,
  requireAllPropertiesRequired: true,
  allowRootAnyOf: false,
  allowRecursion: true,
  keywords: keywordTable({
    // core
    type: { status: 'supported', note: 'String, Number, Boolean, Integer, Object, Array are the supported types' },
    properties: { status: 'supported', note: 'objects are a supported type' },
    items: { status: 'supported', note: 'arrays are a supported type' },
    required: { status: 'supported', note: 'required; every property must appear in it' },
    additionalProperties: {
      status: 'supported',
      note: 'must always be set to false on objects',
      value: (v) => (v === false ? null : 'must be exactly `false` on every object'),
    },
    enum: { status: 'supported', note: 'Enum is a supported type; up to 1000 values across the schema' },
    const: { status: 'supported', note: 'const values are counted by the documented 120,000-char name/value budget' },
    $ref: { status: 'supported', note: 'internal $ref and $defs are supported, including recursive schemas' },
    $defs: { status: 'supported', note: 'definition names are counted by the documented char budget' },
    definitions: { status: 'supported', note: 'draft-07 spelling of $defs' },
    $anchor: { status: 'unsupported', note: 'not documented in the supported subset' },
    $schema: { status: 'unsupported', note: 'meta keyword, not part of the documented subset (the projection strips it)' },
    $id: { status: 'unsupported', note: 'meta keyword, not part of the documented subset (the projection strips it)' },

    // annotations: cannot constrain an instance, so cannot change the grammar
    title: { status: 'annotation', note: 'annotation only; cannot constrain an instance' },
    description: { status: 'annotation', note: 'annotation only; this is how the model learns the field, keep it' },
    default: {
      status: 'annotation',
      note: 'not in the supported list, but an annotation under the JSON Schema spec, so it cannot change the compiled grammar',
    },
    examples: { status: 'annotation', note: 'annotation only' },
    deprecated: { status: 'annotation', note: 'annotation only' },
    readOnly: { status: 'annotation', note: 'annotation only' },
    writeOnly: { status: 'annotation', note: 'annotation only' },
    $comment: { status: 'annotation', note: 'annotation only' },

    // strings
    pattern: { status: 'supported', note: 'listed under supported String properties' },
    format: {
      status: 'supported',
      note: 'listed under supported String properties, for a CLOSED list of format values',
      // Note the absence of `uri`. Anthropic's list has it; OpenAI's does not, and
      // the kit's link/embed/artifact schemas all use `format: "uri"`.
      value: (v) => {
        const allowed = ['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'ipv4', 'ipv6', 'uuid'];
        return typeof v === 'string' && allowed.includes(v)
          ? null
          : `format ${JSON.stringify(v)} is outside the supported list (${allowed.join(', ')})`;
      },
    },
    minLength: { status: 'unsupported', note: 'absent from "Supported properties" for strings; see the coin-flip note above this table' },
    maxLength: { status: 'unsupported', note: 'absent from "Supported properties" for strings; see the coin-flip note above this table' },

    // numbers
    minimum: { status: 'supported', note: 'listed under supported Number properties' },
    maximum: { status: 'supported', note: 'listed under supported Number properties' },
    exclusiveMinimum: { status: 'supported', note: 'listed under supported Number properties' },
    exclusiveMaximum: { status: 'supported', note: 'listed under supported Number properties' },
    multipleOf: { status: 'supported', note: 'listed under supported Number properties' },

    // arrays
    // THE TELL. Any value is fine here; Anthropic accepts only 0 and 1.
    minItems: { status: 'supported', note: 'listed under supported Array properties, at any value' },
    maxItems: { status: 'supported', note: 'listed under supported Array properties' },
    uniqueItems: { status: 'unsupported', note: 'not listed under supported Array properties' },
    contains: { status: 'unsupported', note: 'not listed under supported Array properties' },
    minContains: { status: 'unsupported', note: 'not listed under supported Array properties' },
    maxContains: { status: 'unsupported', note: 'not listed under supported Array properties' },
    prefixItems: { status: 'unsupported', note: 'not listed under supported Array properties' },
    unevaluatedItems: { status: 'unsupported', note: 'not listed under supported Array properties' },
    additionalItems: { status: 'unsupported', note: 'not listed under supported Array properties' },

    // objects
    patternProperties: { status: 'unsupported', note: 'explicitly listed as not yet supported' },
    propertyNames: { status: 'unsupported', note: 'not listed under supported Object properties' },
    minProperties: { status: 'unsupported', note: 'not listed under supported Object properties' },
    maxProperties: { status: 'unsupported', note: 'not listed under supported Object properties' },
    unevaluatedProperties: { status: 'unsupported', note: 'not listed under supported Object properties' },

    // composition
    anyOf: { status: 'supported', note: 'a supported type; every nested schema must itself stay in subset, and it may not be at the root' },
    allOf: { status: 'unsupported', note: 'explicitly listed as not supported under Composition' },
    oneOf: { status: 'unsupported', note: 'not among the supported types (only `anyOf` is)' },
    not: { status: 'unsupported', note: 'explicitly listed as not supported under Composition' },
    if: { status: 'unsupported', note: 'explicitly listed as not supported under Composition' },
    then: { status: 'unsupported', note: 'explicitly listed as not supported under Composition' },
    else: { status: 'unsupported', note: 'explicitly listed as not supported under Composition' },
    dependentRequired: { status: 'unsupported', note: 'explicitly listed as not supported under Composition' },
    dependentSchemas: { status: 'unsupported', note: 'explicitly listed as not supported under Composition' },
  }),
});

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

/**
 * Anthropic strict tool use (`strict: true` on a tool definition).
 *
 * SOURCE: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 * ("JSON Schema limitations"), read 2026-08-11. The strict-tool-use page
 * (https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use)
 * carries the envelope shape and defers the keyword list to that section verbatim:
 * "For the supported JSON Schema subset, see JSON Schema limitations".
 *
 * Quoted supported list:
 * - "All basic types: object, array, string, integer, number, boolean, null"
 * - "`enum` (strings, numbers, bools, or nulls only - no complex types)"
 * - "`const`"
 * - "`anyOf` and `allOf` (with limitations - `allOf` with `$ref` not supported)"
 * - "`$ref`, `$def`, and `definitions` (external `$ref` not supported)"
 * - "`default` property for all supported types"
 * - "`required` and `additionalProperties` (must be set to `false` for objects)"
 * - "String formats: `date-time`, `time`, `date`, `duration`, `email`, `hostname`,
 *   `uri`, `ipv4`, `ipv6`, `uuid`"
 * - "Array `minItems` (only values 0 and 1 supported)"
 *
 * Quoted NOT supported list:
 * - "Recursive schemas"
 * - "Complex types within enums"
 * - "External `$ref`"
 * - "Numerical constraints (such as `minimum`, `maximum`, `multipleOf`)"
 * - "String constraints (`minLength`, `maxLength`)"
 * - "Array constraints beyond `minItems` of 0 or 1"
 * - "`additionalProperties` set to anything other than `false`"
 *
 * TWO PLACES THIS DIVERGES FROM WHAT THE PLAN ASSUMED, both checked twice:
 * 1. `allOf` IS supported here (it is unsupported on OpenAI). What the kit's `embed`
 *    schema actually trips on under Anthropic is the `if`/`then` INSIDE its `allOf`,
 *    which the supported list does not mention and which is therefore unsupported.
 * 2. `pattern` is NOT in the supported list here, though it is on OpenAI. The
 *    supported string surface on Anthropic is `format` and nothing else.
 * Optional properties are fine here: the doc's own quick-start example ships
 * `required: ["location"]` with a second, unlisted `unit` property.
 */
export const ANTHROPIC_STRICT: ProviderSubset = Object.freeze({
  id: 'anthropic',
  label: 'Anthropic strict',
  source: 'https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations',
  checkedOn: '2026-08-11',
  requireAdditionalPropertiesFalse: true,
  // Anthropic's own example leaves `unit` out of `required`. Optional is legal.
  requireAllPropertiesRequired: false,
  allowRootAnyOf: true,
  allowRecursion: false,
  keywords: keywordTable({
    // core
    type: { status: 'supported', note: 'all basic types: object, array, string, integer, number, boolean, null' },
    properties: { status: 'supported', note: 'objects are a supported type' },
    items: { status: 'supported', note: 'arrays are a supported type' },
    required: { status: 'supported', note: 'explicitly supported; leaving a property out of it is legal' },
    additionalProperties: {
      status: 'supported',
      note: 'must be set to false for objects; anything else is explicitly unsupported',
      value: (v) => (v === false ? null : 'must be exactly `false` ("additionalProperties set to anything other than false" is unsupported)'),
    },
    enum: { status: 'supported', note: 'strings, numbers, bools or nulls only; complex types within enums are unsupported' },
    const: { status: 'supported', note: 'explicitly supported' },
    $ref: { status: 'supported', note: 'internal only; external $ref and recursive schemas are unsupported' },
    $defs: { status: 'supported', note: '"$ref, $def, and definitions" are supported' },
    definitions: { status: 'supported', note: '"$ref, $def, and definitions" are supported' },
    $anchor: { status: 'unsupported', note: 'not in the supported list' },
    $schema: { status: 'unsupported', note: 'meta keyword, not in the supported list (the projection strips it)' },
    $id: { status: 'unsupported', note: 'meta keyword, not in the supported list (the projection strips it)' },

    // annotations
    title: { status: 'annotation', note: 'annotation only; cannot constrain an instance' },
    description: { status: 'annotation', note: 'annotation only; this is how the model learns the field, keep it' },
    default: { status: 'supported', note: 'explicitly supported: "default property for all supported types"' },
    examples: { status: 'annotation', note: 'annotation only' },
    deprecated: { status: 'annotation', note: 'annotation only' },
    readOnly: { status: 'annotation', note: 'annotation only' },
    writeOnly: { status: 'annotation', note: 'annotation only' },
    $comment: { status: 'annotation', note: 'annotation only' },

    // strings
    // OpenAI supports `pattern`. This subset does not list it at all.
    pattern: { status: 'unsupported', note: 'not in the supported list; `format` is the only supported string constraint' },
    format: {
      status: 'supported',
      note: 'supported for a CLOSED list of format values',
      // Note `uri` IS here. It is absent from OpenAI's list.
      value: (v) => {
        const allowed = ['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid'];
        return typeof v === 'string' && allowed.includes(v)
          ? null
          : `format ${JSON.stringify(v)} is outside the supported list (${allowed.join(', ')})`;
      },
    },
    minLength: { status: 'unsupported', note: 'explicitly unsupported: "String constraints (minLength, maxLength)"' },
    maxLength: { status: 'unsupported', note: 'explicitly unsupported: "String constraints (minLength, maxLength)"' },

    // numbers: all explicitly unsupported here, all supported on OpenAI
    minimum: { status: 'unsupported', note: 'explicitly unsupported: "Numerical constraints (such as minimum, maximum, multipleOf)"' },
    maximum: { status: 'unsupported', note: 'explicitly unsupported: "Numerical constraints (such as minimum, maximum, multipleOf)"' },
    exclusiveMinimum: { status: 'unsupported', note: 'a numerical constraint; explicitly unsupported' },
    exclusiveMaximum: { status: 'unsupported', note: 'a numerical constraint; explicitly unsupported' },
    multipleOf: { status: 'unsupported', note: 'explicitly unsupported: "Numerical constraints (such as minimum, maximum, multipleOf)"' },

    // arrays
    // THE TELL. OpenAI takes any value; this takes 0 or 1 and 400s on 2.
    minItems: {
      status: 'supported',
      note: 'supported for values 0 and 1 ONLY: "Array minItems (only values 0 and 1 supported)"',
      value: (v) => (v === 0 || v === 1 ? null : `minItems ${JSON.stringify(v)} is unsupported; only 0 and 1 are`),
    },
    maxItems: { status: 'unsupported', note: 'explicitly unsupported: "Array constraints beyond minItems of 0 or 1"' },
    uniqueItems: { status: 'unsupported', note: 'an array constraint beyond minItems 0 or 1; explicitly unsupported' },
    contains: { status: 'unsupported', note: 'an array constraint beyond minItems 0 or 1; explicitly unsupported' },
    minContains: { status: 'unsupported', note: 'an array constraint beyond minItems 0 or 1; explicitly unsupported' },
    maxContains: { status: 'unsupported', note: 'an array constraint beyond minItems 0 or 1; explicitly unsupported' },
    prefixItems: { status: 'unsupported', note: 'not in the supported list' },
    unevaluatedItems: { status: 'unsupported', note: 'not in the supported list' },
    additionalItems: { status: 'unsupported', note: 'not in the supported list' },

    // objects
    patternProperties: { status: 'unsupported', note: 'not in the supported list' },
    propertyNames: { status: 'unsupported', note: 'not in the supported list' },
    minProperties: { status: 'unsupported', note: 'not in the supported list' },
    maxProperties: { status: 'unsupported', note: 'not in the supported list' },
    unevaluatedProperties: { status: 'unsupported', note: 'not in the supported list' },

    // composition
    anyOf: { status: 'supported', note: 'explicitly supported, including at the root' },
    allOf: { status: 'supported', note: 'explicitly supported, EXCEPT in combination with $ref' },
    oneOf: { status: 'unsupported', note: 'not in the supported list (only anyOf and allOf are)' },
    not: { status: 'unsupported', note: 'not in the supported list' },
    if: { status: 'unsupported', note: 'not in the supported list; conditional application has no supported spelling' },
    then: { status: 'unsupported', note: 'not in the supported list; conditional application has no supported spelling' },
    else: { status: 'unsupported', note: 'not in the supported list; conditional application has no supported spelling' },
    dependentRequired: { status: 'unsupported', note: 'not in the supported list' },
    dependentSchemas: { status: 'unsupported', note: 'not in the supported list' },
  }),
});

/** The two subsets, by provider id. */
export const providerSubsets: Readonly<Record<StrictProviderId, ProviderSubset>> = Object.freeze({
  openai: OPENAI_STRICT,
  anthropic: ANTHROPIC_STRICT,
});

// ---------------------------------------------------------------------------
// The checker
// ---------------------------------------------------------------------------

export interface SubsetViolation {
  /** Where in the schema, in readable form: `(root)`, `actions`, `actions[].id`. */
  readonly path: string;
  /** The offending keyword, NAMED. Never a generic "unsupported schema". */
  readonly keyword: string;
  readonly reason: string;
}

/**
 * Keywords whose value is a single subschema.
 * `additionalProperties` is handled separately because its value may be a boolean.
 */
const SUBSCHEMA_KEYS = ['items', 'if', 'then', 'else', 'not', 'contains', 'propertyNames', 'unevaluatedItems', 'additionalItems'] as const;
/** Keywords whose value is a map of NAME to subschema. The names are arbitrary. */
const SUBSCHEMA_MAP_KEYS = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'] as const;
/** Keywords whose value is an array of subschemas. */
const SUBSCHEMA_LIST_KEYS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function childPath(path: string, key: string): string {
  return path === '(root)' ? key : `${path}.${key}`;
}

/**
 * Check a schema document against a provider's strict subset.
 *
 * Returns EVERY violation, not the first, and names the keyword and the path for
 * each. A caller that only wants to know "can this be strict" checks `.length`.
 *
 * This runs against whatever it is handed. Point it at an authored card schema and
 * it reports what the projection has to deal with; point it at a projected one and
 * a non-empty result means the projection emitted something the provider would 400
 * on, which is the self-consistency property `verify:tool-schemas` asserts.
 */
export function checkProviderSubset(schema: unknown, subset: ProviderSubset): SubsetViolation[] {
  const violations: SubsetViolation[] = [];
  walkSchema(schema, subset, '(root)', true, violations);
  return violations;
}

function walkSchema(
  node: unknown,
  subset: ProviderSubset,
  path: string,
  isRoot: boolean,
  out: SubsetViolation[],
): void {
  if (typeof node === 'boolean') return; // `true`/`false` schemas carry no keywords
  if (!isRecord(node)) {
    out.push({ path, keyword: '(schema)', reason: `expected a schema object, got ${node === null ? 'null' : typeof node}` });
    return;
  }

  for (const [keyword, value] of Object.entries(node)) {
    const rule = subset.keywords[keyword];
    if (!rule) {
      // Unknown is a FAILURE, never a pass. See the header.
      out.push({
        path,
        keyword,
        reason: keyword.startsWith('x-')
          ? `vendor extension keyword, not in the ${subset.label} subset`
          : `unknown keyword, not classified by the ${subset.label} subset`,
      });
      continue;
    }
    if (rule.status === 'unsupported') {
      out.push({ path, keyword, reason: `not supported (${rule.note})` });
      continue;
    }
    if (rule.status === 'supported' && rule.value) {
      const reason = rule.value(value);
      if (reason) out.push({ path, keyword, reason });
    }
  }

  // Structural rules. These are not keyword presence, they are shape.
  const hasProperties = isRecord(node.properties);
  const looksLikeObject = node.type === 'object' || hasProperties;

  if (looksLikeObject && subset.requireAdditionalPropertiesFalse && node.additionalProperties !== false) {
    out.push({
      path,
      keyword: 'additionalProperties',
      reason: `missing; ${subset.label} requires \`additionalProperties: false\` on every object`,
    });
  }

  if (looksLikeObject && !hasProperties) {
    out.push({
      path,
      keyword: 'properties',
      reason:
        `a free-form object (\`type: "object"\` with no \`properties\`) has no grammar under ${subset.label}; ` +
        'with the mandatory `additionalProperties: false` it can only ever be `{}`, which is not what the schema means',
    });
  }

  if (looksLikeObject && subset.requireAllPropertiesRequired && hasProperties) {
    const required = Array.isArray(node.required) ? node.required.map(String) : [];
    const missing = Object.keys(node.properties as Record<string, unknown>).filter((k) => !required.includes(k));
    if (missing.length > 0) {
      out.push({
        path,
        keyword: 'required',
        reason: `${subset.label} requires every property in \`required\`; missing ${missing.map((m) => `\`${m}\``).join(', ')} (emulate optional with a \`null\` union)`,
      });
    }
  }

  if (isRoot && !subset.allowRootAnyOf && 'anyOf' in node) {
    out.push({
      path,
      keyword: 'anyOf',
      reason: `${subset.label} forbids \`anyOf\` at the ROOT ("Root level object of a schema must be an object, and not use anyOf")`,
    });
  }

  // A subschema whose every keyword is an annotation constrains nothing, so it means
  // "any JSON". Neither provider can compile that to a grammar. `confirm`'s
  // `actions[].payload` (a bare `{ description }`) and `choice`'s `allowOther` are
  // exactly this. The test is "carries no constraining keyword", NOT "carries no
  // `type`": `{ required: ['url'] }` and `{ properties: {...} }` constrain plenty
  // without a `type`, and flagging those would bury the real signal under noise from
  // every applicator branch in `embed`.
  const constrains = Object.keys(node).filter((k) => subset.keywords[k]?.status !== 'annotation');
  if (constrains.length === 0) {
    out.push({
      path,
      keyword: 'type',
      reason: `unconstrained subschema (annotations only); ${subset.label} compiles the schema to a grammar and has no way to express "any JSON". Give it a \`type\``,
    });
  }

  // Recurse. Two rules here, both load-bearing:
  //
  // 1. `properties` KEYS are arbitrary names, never keywords. form.schema.json has
  //    properties literally called `properties` and `x-kai-order`, and treating those
  //    as keywords would report fields that are perfectly legal card data.
  // 2. Do NOT descend through a keyword the subset has already rejected. Once
  //    `allOf` is reported unsupported on OpenAI, walking into its branches only
  //    produces sub-violations of a construct that is already gone, and the one
  //    line that matters gets lost in fifteen that do not.
  const rejected = (key: string) => subset.keywords[key]?.status === 'unsupported';

  for (const key of SUBSCHEMA_MAP_KEYS) {
    const map = node[key];
    if (!isRecord(map) || rejected(key)) continue;
    for (const [name, child] of Object.entries(map)) {
      walkSchema(child, subset, key === 'properties' ? childPath(path, name) : `${path}/${key}[${name}]`, false, out);
    }
  }
  for (const key of SUBSCHEMA_KEYS) {
    if (!(key in node) || rejected(key)) continue;
    const child = node[key];
    if (typeof child === 'boolean') continue;
    walkSchema(child, subset, key === 'items' ? `${path === '(root)' ? '(root)' : path}[]` : `${path}/${key}`, false, out);
  }
  if (isRecord(node.additionalProperties)) {
    walkSchema(node.additionalProperties, subset, `${path}/additionalProperties`, false, out);
  }
  for (const key of SUBSCHEMA_LIST_KEYS) {
    const list = node[key];
    if (!Array.isArray(list) || rejected(key)) continue;
    list.forEach((child, i) => walkSchema(child, subset, `${path}/${key}[${i}]`, false, out));
  }
}
