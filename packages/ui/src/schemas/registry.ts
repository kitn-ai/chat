// createCardRegistry: the one place an app writes down which cards it renders.
//
// WHY THIS EXISTS, AND WHY IT IS NOT "A WAY TO REGISTER CUSTOM CARDS"
// ------------------------------------------------------------------
// Registering a custom card already worked: `chat.cardTypes = { 'pricing-table':
// 'my-pricing-table' }` goes through `mergeCardTags` and has since the card contract
// landed, and `cardTools({ 'pricing-table': schema }, { provider })` already emitted
// `kai_pricing-table` before this file existed. Measured on 4b33cd8, both halves of
// the custom round trip passed already. Nothing here unlocks them.
//
// Two things did not work, and they are what this file is for.
//
// 1. NOTHING TIED THE TWO ENDS TOGETHER. `cardTypes` is a per-element PROP, so there
//    is no ambient registry a backend route could consult. The developer wrote their
//    card types on the client, wrote them again in the tool definitions, and nothing
//    made the two agree. This is the fifth-copy problem the emit contract exists to
//    kill, one layer up from the schema itself.
//
// 2. THE MODEL WAS TOLD ABOUT ALL SEVEN BUILT-INS REGARDLESS. `cardTools({ provider })`
//    has no way to say "this app renders confirm and choice, do not offer the model an
//    artifact card". Every request paid for seven tool definitions, five of which the
//    app had no intention of using, and the model could pick one of them.
//
// So the goal is not the seam, which existed. It is to make the NORMAL path go through
// the seam, so it cannot rot the way it did once already: the only end-to-end user of
// `cardTypes` was a workaround in the conformance spike that registered `spike-artifact`
// because the kit had no artifact card, and when the kit grew one the workaround was
// correctly deleted and the coverage went with it. Coverage that exists only because
// something is missing is coverage on a timer.
//
// WHAT `use` DOES AND DOES NOT NARROW
// -----------------------------------
// `use` narrows what the MODEL IS TOLD ABOUT. It does not narrow what renders, and it
// must not be read as if it did. `mergeCardTags`/`mergeCardComponents` union the seven
// built-ins in unconditionally (consumer overrides win), so an app declaring
// `use: ['confirm']` still renders a `choice` envelope if one arrives. That is the
// right behaviour: an envelope that turns up from somewhere else should draw, not
// degrade to a fallback because it was left off a tool list. Narrowing rendering would
// be a `primitives/card-registry.tsx` change, and a worse product.
//
// Likewise `registry.validate()` covers all seven built-ins regardless of `use`.
// Validation is about what ARRIVED, not about what was offered.
//
// NO `toolPrefix`, DELIBERATELY
// -----------------------------
// The plan reserves `createCardRegistry({ toolPrefix })` and this file does not ship
// it, for the reason tool-defs.ts already gives: the inverse (`cardTypeFromToolName`)
// hard-codes `kai_`, so a prefix honoured on the emit side alone would generate tools
// the loop's parser cannot recognise, and the card would vanish into `runTool` with no
// error anywhere. Worse than not having the option. It lands in both directions in one
// change, or not at all.
//
// SERVER-SAFE
// -----------
// This module is imported by a backend route (it is half the point) so it stays free
// of DOM and of the Solid runtime. `CardComponent`/`CardComponentMap`/`CardTagMap` are
// TYPE imports from primitives/card-registry.tsx and erase completely; the values in
// `components` are passed through untouched and never called here. `verify:ssr`
// imports the built entry under the `node` condition and proves it.

import type { CardComponentMap, CardTagMap } from '../primitives/card-registry';
import type { JsonSchema } from '../primitives/card-validate';
import {
  validateCardData,
  type CardValidationReport,
} from '../primitives/card-validate-cards';
import { cardSchemas, isCardSchemaName, type CardSchema, type CardSchemaName } from './index';
import type { CardToolSource } from './tool-defs';

/**
 * One custom card type: what the model should be told, and what draws it.
 *
 * Every member is optional because the useful combinations genuinely differ. A
 * web-component consumer supplies `tag`; a Solid consumer supplies `component`; a
 * backend-only registry (a route that builds tool definitions and never renders)
 * supplies neither. Only `schema` carries a warning when absent, and the reason is on
 * {@link CardRegistrySpec.onIncomplete}.
 */
export interface CustomCardSpec {
  /**
   * The JSON Schema for this card type's `data` payload.
   *
   * Used for BOTH ends: `cardTools()` projects it into a tool definition, and
   * `registry.validate()` checks arriving data against it. Authored form is fine, with
   * the descriptions left in: the projection strips what a provider cannot take, and
   * the validator ignores keywords it does not implement.
   *
   * That last clause is a real limit, not a formality, and it is the same one the
   * built-ins carry. `validateAgainstSchema` has no applicators, so `allOf`, `anyOf`,
   * `oneOf`, `if`/`then`, `$ref` and `additionalProperties` in a custom schema are
   * carried faithfully to the model and NOT enforced on the way back. See the
   * NOT_ENFORCED table at the top of primitives/card-validate-schemas.ts.
   */
  readonly schema?: CardSchema | JsonSchema;
  /** The custom element that renders it, e.g. `'my-pricing-table'`. Feeds `mergeCardTags`. */
  readonly tag?: string;
  /** The Solid component that renders it. Feeds `mergeCardComponents`. */
  readonly component?: CardComponentMap[string];
  /**
   * One sentence of PURPOSE, addressed to the model: when should it reach for this
   * card? Not a restatement of the shape, which the schema already carries.
   *
   * Falls back to the schema's own `description`, then to a generated stub. See
   * `describe()` in tool-defs.ts.
   */
  readonly description?: string;
}

/** What to do about a custom card type registered with no schema. */
export type IncompletePolicy = 'warn' | 'throw' | 'silent';

export interface CardRegistrySpec {
  /**
   * Which BUILT-IN card types this app renders, and therefore which ones the model is
   * offered.
   *
   * Omitted means all seven, which is what `cardTools({ provider })` already does and
   * what `<kai-chat>` actually renders, so the default describes reality rather than
   * quietly shrinking it. `use: []` means none of ours: an app whose generative UI is
   * entirely its own.
   */
  readonly use?: readonly CardSchemaName[];
  /** This app's own card types, keyed by `CardEnvelope.type`. */
  readonly custom?: Readonly<Record<string, CustomCardSpec>>;
  /**
   * How a schema-less custom type is reported. Default `'warn'`.
   *
   * `'throw'` for a build or a CI check that wants the hole to be fatal; `'silent'` for
   * a card type your own code populates and a model never emits, where the warning is
   * noise. `'silent'` is deliberately a word you have to type, so the acknowledgement is
   * greppable instead of implied.
   */
  readonly onIncomplete?: IncompletePolicy;
}

/**
 * An app's card types, in the one shape both ends take.
 *
 * ```ts
 * // cards.ts, imported by the client AND the route
 * export const cards = createCardRegistry({
 *   use: ['confirm', 'choice'],
 *   custom: { 'pricing-table': { schema: pricingSchema, tag: 'my-pricing-table' } },
 * });
 *
 * // client
 * chat.cardTypes = cards.tags;
 * // server
 * const tools = cardTools(cards, { provider: 'anthropic' });
 * ```
 *
 * Extends {@link CardToolSource}, so `cardTools(registry, opts)` takes it with no
 * signature change on that side. That interface was left open for exactly this.
 */
export interface CardRegistry extends CardToolSource {
  /**
   * The card types the model is offered, keyed by type. `use`d built-ins plus every
   * custom type that HAS a schema. What `cardTools()` reads.
   */
  readonly schemas: Readonly<Record<string, CardSchema>>;
  /** Purpose sentences for custom types (and for any built-in a custom entry overrode). */
  readonly descriptions: Readonly<Record<string, string>>;
  /**
   * Custom `type -> tag`, for `chat.cardTypes` / `mergeCardTags`.
   *
   * Custom entries ONLY. The built-in tags are not restated here because
   * `mergeCardTags` adds all seven itself; listing the `use`d ones would read as if the
   * others had been excluded, which is not what happens.
   */
  readonly tags: CardTagMap;
  /** Custom `type -> Solid component`, for `<CardRenderer types>` / `mergeCardComponents`. */
  readonly components: CardComponentMap;
  /** Every type this registry declares, schema-less ones included. Built-ins first. */
  readonly types: readonly string[];
  /** The built-in types in `use`, in `cardSchemas` order. */
  readonly builtIn: readonly CardSchemaName[];
  /** The custom types, in declaration order, schema-less ones included. */
  readonly custom: readonly string[];
  /** Custom types with no schema: registered, renderable, invisible to the model. */
  readonly incomplete: readonly string[];
  /**
   * Custom schemas in the shape `validateCardData`'s third argument takes, so a caller
   * that already has a `validateCardData` call can widen it without going through
   * {@link CardRegistry.validate}.
   */
  readonly validationSchemas: Readonly<Record<string, JsonSchema>>;
  /**
   * Validate an envelope's `data` against this registry's schema for `type`.
   *
   * Custom schemas win over a built-in of the same name, matching `mergeCardTags`'s
   * consumer-wins rule. `null` means there was nothing to check (a type with no
   * schema anywhere), which is kept distinguishable from a clean pass so a caller
   * cannot report the second as the first.
   *
   * Covers all seven built-ins regardless of `use`: see the module header.
   */
  validate(type: string, data: unknown): CardValidationReport | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function warnIncomplete(incomplete: readonly string[]): string {
  const names = incomplete.map((t) => `"${t}"`).join(', ');
  const plural = incomplete.length === 1 ? 'type' : 'types';
  return [
    `createCardRegistry: ${incomplete.length} custom card ${plural} registered with no \`schema\`: ${names}.`,
    '  They will still RENDER (their tag/component is registered), but:',
    '    - cardTools() skips them, so the model is never told the type exists and will never emit one;',
    '    - registry.validate() returns null for them, so nothing checks what does arrive.',
    '  A card type the model is never told about and that nothing validates is a silent hole.',
    '  Fix: give each one a `schema`. If the type is populated by your own code and never by a',
    "  model, say so with `onIncomplete: 'silent'`; use `onIncomplete: 'throw'` to make it fatal.",
  ].join('\n');
}

/**
 * Declare the card types this app renders, once, for both ends.
 *
 * @throws {TypeError} if `use` names something that is not a built-in card type (a
 * typo, or a custom type that belongs in `custom`), if a custom key is empty, or if
 * `onIncomplete: 'throw'` and a custom type has no schema.
 */
export function createCardRegistry(spec: CardRegistrySpec = {}): CardRegistry {
  // A plain typeof check rather than the `isRecord` predicate used everywhere else in
  // this file. `isRecord` narrows to `Record<string, unknown>`, and intersecting that
  // with `CardRegistrySpec` makes the INDEX SIGNATURE win over the declared members:
  // `spec.use` becomes `unknown`, `spec.use ?? […]` becomes `{}`, and the rest of the
  // function loses its types while still compiling in places. Measured, not guessed —
  // it produced seven `tsc` errors on the first pass of this file.
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    throw new TypeError('createCardRegistry: expected a spec object, e.g. createCardRegistry({ use: ["confirm"] })');
  }

  // `cardSchemas` is read HERE, inside the function, for the reason `builtInSchemas()`
  // in tool-defs.ts spells out: ./index re-exports this module and this module imports
  // back out of it, a real ESM cycle that is safe only while the read happens after
  // both module bodies have evaluated. Do not hoist it to a module-scope const.
  const builtInSource = cardSchemas;

  const useList = spec.use ?? (Object.keys(builtInSource) as CardSchemaName[]);
  const unknownUse = useList.filter((t) => !isCardSchemaName(t));
  if (unknownUse.length > 0) {
    throw new TypeError(
      `createCardRegistry: \`use\` names ${unknownUse.length} type(s) that are not built in: ` +
        `${unknownUse.map((t) => `"${t}"`).join(', ')}. ` +
        `The built-in types are ${Object.keys(builtInSource).join(', ')}. ` +
        'A card type of your own goes in `custom`, with its schema, not in `use`.',
    );
  }

  // Deduped and put back into cardSchemas order, so two registries listing the same
  // types in a different order produce byte-identical tool arrays.
  const used = new Set(useList);
  const builtIn = (Object.keys(builtInSource) as CardSchemaName[]).filter((t) => used.has(t));

  const customSpecs = spec.custom ?? {};
  const customNames = Object.keys(customSpecs);
  const emptyKey = customNames.find((n) => n.trim().length === 0);
  if (emptyKey !== undefined) {
    throw new TypeError('createCardRegistry: a custom card type name must be a non-empty string; it becomes `CardEnvelope.type` and the `kai_<type>` tool name.');
  }

  const schemas: Record<string, CardSchema> = {};
  for (const type of builtIn) schemas[type] = builtInSource[type];

  const descriptions: Record<string, string> = {};
  const tags: CardTagMap = {};
  const components: CardComponentMap = {};
  const validationSchemas: Record<string, JsonSchema> = {};
  const incomplete: string[] = [];

  for (const type of customNames) {
    const entry: CustomCardSpec = customSpecs[type];
    // Same reason as the `spec` check above: narrowing with `isRecord` here would swap
    // `CustomCardSpec`'s members for an index signature and lose `component`'s type.
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new TypeError(`createCardRegistry: custom card type "${type}" must be an object, e.g. { schema, tag }.`);
    }
    // A custom entry OVERRIDES a built-in of the same name rather than colliding with
    // it, matching mergeCardTags/mergeCardComponents where the consumer wins. That is
    // how you replace our confirm card with yours and still get one tool definition.
    if (isRecord(entry.schema)) {
      schemas[type] = entry.schema as CardSchema;
      validationSchemas[type] = entry.schema as JsonSchema;
    } else {
      // No schema: keep it out of `schemas` so `cardTools` skips it with no special
      // case over there, and record it so the policy below can speak up.
      //
      // The `delete` is not dead code. It fires when a custom entry SHADOWS a `use`d
      // built-in without supplying a schema (`use: ['confirm']` plus
      // `custom: { confirm: { tag: 'my-confirm' } }`). Keeping our confirm schema there
      // would hand the model a shape describing OUR card while the developer's card
      // renders it, which is the drift this whole contract exists to prevent. Dropping
      // it instead puts the type in `incomplete`, where it gets said out loud.
      delete schemas[type];
      incomplete.push(type);
    }
    if (typeof entry.tag === 'string' && entry.tag.length > 0) tags[type] = entry.tag;
    if (typeof entry.component === 'function') components[type] = entry.component;
    if (typeof entry.description === 'string' && entry.description.length > 0) {
      descriptions[type] = entry.description;
    }
  }

  if (incomplete.length > 0) {
    const policy: IncompletePolicy = spec.onIncomplete ?? 'warn';
    const message = warnIncomplete(incomplete);
    if (policy === 'throw') throw new TypeError(message);
    // WHY THIS WARNS UNCONDITIONALLY RATHER THAN ONLY IN DEV.
    // ------------------------------------------------------
    // There is no `process.env.NODE_ENV` / `import.meta.env` convention anywhere in
    // this package's src/, and the emit-contract plan rejected introducing one for
    // exactly this shape of thing: a stripping contract has to hold across seven
    // consumer bundlers on a PRE-BUILT dist, where substitution into node_modules is
    // not guaranteed, and getting it wrong means the developer's laptop looks fine
    // while production is silently the broken one. The same argument applies here,
    // and the cost side is far smaller than it was there: a registry is built ONCE at
    // module load, not per render, so this is one line per process and not a hot path.
    // `onIncomplete: 'silent'` is the escape hatch, and it is a word you have to type.
    //
    // `!== 'silent'` rather than `=== 'warn'`, so an unrecognised policy is LOUD.
    // TypeScript rejects one, but this is shipped JS a consumer can call untyped, and
    // `onIncomplete: 'quiet'` reaching the silent branch would be a typo that disables
    // the warning about a silent hole. Defaulting the unknown case to noise is the only
    // direction that fails safe.
    if (policy !== 'silent') console.warn(message);
  }

  const frozenValidationSchemas = Object.freeze({ ...validationSchemas });

  return Object.freeze({
    schemas: Object.freeze(schemas),
    descriptions: Object.freeze(descriptions),
    tags: Object.freeze(tags),
    components: Object.freeze(components),
    types: Object.freeze([...builtIn, ...customNames]),
    builtIn: Object.freeze(builtIn),
    custom: Object.freeze([...customNames]),
    incomplete: Object.freeze([...incomplete]),
    validationSchemas: frozenValidationSchemas,
    validate: (type: string, data: unknown) => validateCardData(type, data, frozenValidationSchemas),
  });
}
