// @kitn.ai/ui/schemas: the card JSON Schemas, reachable.
//
// The 11 schema documents under src/primitives/card-schemas/ have been copied into
// dist/schemas/ on every build and shipped in every tarball since the card contract
// landed. Nothing could reach them: package.json "exports" is a CLOSED map with no
// `./schemas` key, so both `@kitn.ai/ui/schemas` and
// `@kitn.ai/ui/schemas/confirm.schema.json` resolved to TS2307 /
// ERR_PACKAGE_PATH_NOT_EXPORTED. This repo's own reference harness gave up and
// hand-derived the confirm schema in
// examples/internal/openrouter-spike/src/card-schema.ts, saying so in a comment.
//
// WHY THIS JS ENTRY IS THE PRIMARY SURFACE
// ----------------------------------------
// The raw JSON subpaths ship too (`@kitn.ai/ui/schemas/confirm.schema.json`), and
// they are the right answer for a Python or Go backend, or for `fetch`. They are
// the SECONDARY surface for JS/TS consumers because importing JSON breaks three
// different ways across the framework targets the scaffolder supports: Node ESM and
// TS `nodenext` need `with { type: 'json' }`, types need `resolveJsonModule` in any
// mode, and Workers need a `wrangler` rule. A JS entry has none of those problems
// anywhere, and it picks up `verify:ssr` coverage for free, since that guard derives
// its entry list from the exports map.
//
// SERVER-SAFE, DELIBERATELY
// -------------------------
// No DOM, no Solid, no `fetch`. Everything reached from here is data or plain
// functions; the imports that touch the component layer (`CardComponentMap`,
// `CardTagMap`, used by ./registry) are TYPE imports and erase. This entry is meant to
// be imported by a backend route that hands tool definitions to a model, so anything
// that touches a browser global would defeat its purpose. `verify:ssr` asserts it, by
// importing the BUILT entry under the `node` condition in its own child process.
//
// WHAT IT COSTS, AND WHERE
// ------------------------
// dist/schemas.js, measured on this tree, not recalled:
//
//   42,658 B min / 11,762 B gzip   before ./registry landed
//   53,656 B min / 14,667 B gzip   now  (+10,998 B / +2,905 B gzip)
//
// The `18,160 B / 5,800 B` this comment used to claim was measured at 0.20.1, before
// tool-defs and provider-subsets were added to the barrel, and had been stale ever
// since. Corrected here rather than left, because a size claim nobody re-measures is
// the same class of thing as a guard nobody watches fail.
//
// The delta is ./registry plus what it pulls: primitives/card-validate.ts (the
// validator) and primitives/card-validate-schemas.ts (the LEAN projection). That last
// one means the seven card schemas appear TWICE in this bundle, authored and lean.
// Deliberate, and the alternative is worse: validating built-ins against the authored
// documents here while the browser validates them against the projection would be two
// behaviours wearing one name. One function, one answer, 4 KB.
//
// All of it is a SERVER cost and does not touch a client bundle. Nothing in the
// component tree imports this entry, so no consumer pays it unless a route or a
// build script imports it on purpose. If you are here comparing it against the
// ~1 KB gzip figure in the emit-contract plan, those are different things: that one
// is the LEAN projection destined for the browser (descriptions and `$id` stripped,
// validation keywords only), which is a separate artifact and not this file.
//
// NOT RESTATED
// ------------
// Every value below is the JSON file itself, imported and inlined by the bundler.
// There is no hand-copied shape here and there must never be one: `verify:schemas`
// asserts each exported entry is byte-identical to its file on disk, and that the
// two maps between them account for every file in the directory and for nothing
// else. The whole point of this entry is to stop the same shape existing in five
// places.

import type { JsonSchema } from '../primitives/card-validate';

import artifactSchema from '../primitives/card-schemas/artifact.schema.json';
import cardEnvelopeSchema from '../primitives/card-schemas/card-envelope.schema.json';
import cardEventSchema from '../primitives/card-schemas/card-event.schema.json';
import choiceSchema from '../primitives/card-schemas/choice.schema.json';
import confirmSchema from '../primitives/card-schemas/confirm.schema.json';
import embedSchema from '../primitives/card-schemas/embed.schema.json';
import formResultSchema from '../primitives/card-schemas/form.result.schema.json';
import formSchema from '../primitives/card-schemas/form.schema.json';
import linkSchema from '../primitives/card-schemas/link.schema.json';
import tasksResultSchema from '../primitives/card-schemas/tasks.result.schema.json';
import tasksSchema from '../primitives/card-schemas/tasks.schema.json';

/**
 * A card schema document, as authored.
 *
 * Wider than {@link JsonSchema} on purpose. `JsonSchema` describes the LEAN subset
 * `validateAgainstSchema` implements; the files also carry `$schema`, `$id`,
 * `title`, `description`, `default`, `additionalProperties`, `x-kai-*`, and (in
 * `embed` and `artifact`) `allOf`/`if`/`then`/`oneOf`. Reading a document as
 * `JsonSchema` alone would quietly imply the validator understands all of it.
 */
export type CardSchema = JsonSchema & Readonly<Record<string, unknown>>;

/**
 * DO NOT "TIGHTEN" THIS TO `doc as JsonSchema`, OR DELETE THE CAST.
 *
 * It reads like laziness and is not. `JsonSchema` (src/primitives/card-validate.ts)
 * pins `type` to a literal union — `'string' | 'number' | ... | 'null'` — while
 * TypeScript infers plain `string` for the `"type"` member of an imported JSON
 * literal, so a schema document is NOT assignable to `JsonSchema` and no narrowing
 * short of a per-file `as const` would make it so. On top of that the documents
 * legitimately carry `$schema`, `$id`, `title`, `description`, `default`,
 * `additionalProperties`, `x-kai-*` and (in `embed` and `artifact`)
 * `allOf`/`if`/`then`/`oneOf`, which `JsonSchema` does not describe at all.
 *
 * So this widens once, at the module boundary, deliberately. It is not a claim
 * about the contents, and the claim it does NOT make is checked elsewhere:
 * `verify:schemas` imports the BUILT entry from a temp package outside the repo and
 * asserts every exported value is byte-identical to its file on disk. A tighter
 * type here would buy nothing that check does not already prove, and would cost the
 * ability to represent the schemas we actually ship.
 */
const asSchema = (doc: unknown): CardSchema => doc as CardSchema;

/**
 * The card-DATA schemas: one per built-in `CardEnvelope.type`, describing the
 * `data` payload for that type. These are the tool candidates. The key IS the
 * envelope type.
 */
export type CardSchemaName = 'artifact' | 'choice' | 'confirm' | 'embed' | 'form' | 'link' | 'tasks';

/**
 * The contract shapes: the envelope itself, the event a card emits back up, and the
 * two result payloads. Not card data and NOT tool candidates — a model is never
 * asked to emit one of these, so keeping them out of `cardSchemas` is what stops
 * `cardTools()` offering the model an envelope-shaped tool.
 */
export type ContractSchemaName = 'card-envelope' | 'card-event' | 'form.result' | 'tasks.result';

/** The 7 card-data schemas, keyed by `CardEnvelope.type`. */
export const cardSchemas: Readonly<Record<CardSchemaName, CardSchema>> = Object.freeze({
  artifact: asSchema(artifactSchema),
  choice: asSchema(choiceSchema),
  confirm: asSchema(confirmSchema),
  embed: asSchema(embedSchema),
  form: asSchema(formSchema),
  link: asSchema(linkSchema),
  tasks: asSchema(tasksSchema),
});

/** The 4 contract shapes, keyed by file stem. */
export const contractSchemas: Readonly<Record<ContractSchemaName, CardSchema>> = Object.freeze({
  'card-envelope': asSchema(cardEnvelopeSchema),
  'card-event': asSchema(cardEventSchema),
  'form.result': asSchema(formResultSchema),
  'tasks.result': asSchema(tasksResultSchema),
});

/** The built-in card types, in the order `cardSchemas` declares them. */
export const cardSchemaNames: readonly CardSchemaName[] = Object.freeze(
  Object.keys(cardSchemas) as CardSchemaName[],
);

/** Narrow an arbitrary string to a built-in card type. */
export function isCardSchemaName(name: string): name is CardSchemaName {
  return Object.prototype.hasOwnProperty.call(cardSchemas, name);
}

// Re-exported so a consumer reading a schema out of these maps can annotate what
// they hand to the kit's validator without a second import.
export type { JsonSchema, ValidationResult } from '../primitives/card-validate';
export type { CardEnvelope } from '../primitives/card-contract';

// The loop, both directions.
//
// `cardTools` projects a card schema INTO a provider tool definition;
// `cardFromToolCall` turns the model's call back into a renderable envelope. They
// are the two halves of one contract and the tool-name convention that joins them
// lives in ./from-tool-call, spelled once. Exporting `from-tool-call` here is not
// bookkeeping: `verify:schemas` and `verify:ssr` both read the BUILT entry, so a
// module missing from this barrel is a module no guard covers.
export { cardFromToolCall, isCardTool, cardTypeFromToolName, toolNameForCardType, KAI_TOOL_PREFIX } from './from-tool-call';

// `tool-defs` imports `cardSchemas` back out of this module so that
// `cardTools({ provider })` can default to the built-ins. That cycle is deliberate
// and safe (the read happens inside a function, never at module init); the comment
// on `builtInSchemas()` over there explains why, and why it must not be hoisted.
export {
  CARD_TOOL_DESCRIPTIONS,
  UnsupportedCardToolSchemaError,
  cardTools,
  toAnthropicTools,
  toJsonSchemaTools,
  toOpenAITools,
} from './tool-defs';
export type {
  AnthropicToolDef,
  CardToolInput,
  CardToolOptions,
  CardToolSource,
  JsonSchemaToolDef,
  OpenAIToolDef,
  ToolDef,
  ToolDefFor,
  ToolParameters,
  ToolProvider,
  UnsupportedCardTool,
} from './tool-defs';

// The registry: "these are the card types THIS app renders", written once and threaded
// to both ends (`chat.cardTypes = cards.tags` on the client, `cardTools(cards, …)` on
// the route). It is what turns the `cardTypes` seam from something a developer CAN use
// into the path they normally take, which is the only thing that stops it rotting again
// the way it did when the conformance spike's `spike-artifact` workaround was deleted.
//
// `registry.ts` imports `cardSchemas` back out of this module, the same deliberate
// cycle `tool-defs` has and for the same reason; the read happens inside
// `createCardRegistry`, never at module init.
export { createCardRegistry } from './registry';
export type { CardRegistry, CardRegistrySpec, CustomCardSpec, IncompletePolicy } from './registry';

// Re-exported so a route can check a custom card's data server-side, in the tool loop,
// with the same tiering the browser dispatchers use, rather than a second validator.
// `registry.validate()` is the ergonomic form; this is the same function underneath.
export { cardValidationMessage, validateCardData } from '../primitives/card-validate-cards';
export type { CardValidationIssue, CardValidationReport, CardValidationTier } from '../primitives/card-validate-cards';

// The two provider subsets, exported rather than kept private, because a developer
// registering a CUSTOM card schema in Phase 2 needs the same check we run on ours,
// and because `verify:tool-schemas` reads them out of the BUILT entry rather than
// re-deriving them (a guard with its own copy of the table proves nothing).
export { ANTHROPIC_STRICT, OPENAI_STRICT, checkProviderSubset, providerSubsets } from './provider-subsets';
export type { KeywordRule, KeywordStatus, ProviderSubset, StrictProviderId, SubsetViolation } from './provider-subsets';
