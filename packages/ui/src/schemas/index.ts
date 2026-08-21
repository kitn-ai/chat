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
// functions, and as of src/primitives/card-component-types.ts that is true of the
// TYPES too: nothing reachable from this entry resolves to a `.tsx` any more, so a
// Node/no-DOM project can read the whole graph from source. (`CardComponentMap` used
// to come from primitives/card-registry.tsx and was the last exception.) This entry
// is meant to be imported by a backend route that hands tool definitions to a model,
// so anything that touches a browser global would defeat its purpose. `verify:ssr`
// asserts the RUNTIME half, by importing the BUILT entry under the `node` condition
// in its own child process; the compile-time half is `tsc --noEmit -p
// tsconfig.mcp.json` on a tree with no dist/, and only that one sees a `.tsx` creep
// back in.
//
// WHAT `verify:ssr` DOES NOT CATCH, MEASURED
// ------------------------------------------
// It checks the BUILT bundle, so it only sees what survives tree-shaking — and
// rollup is good enough here that it does not see the mistake you would actually
// make. Measured, not assumed: pointing the `BUILTIN_CARD_TAGS` re-export below at
// src/primitives/card-registry.TSX instead of card-tags.ts produces a byte-identical
// dist/schemas.js with zero `solid-js` references, and imports clean under `node`.
// Rollup compiles the whole Solid component tree (build time 0.2s -> 3.9s) and then
// discards all of it, because only the tag map is reachable.
//
// So the `.ts` split is NOT holding a runtime guard up, and must not be described as
// if it were. What it buys is that this entry's server-safety stops depending on
// tree-shaking staying perfect: one module-scope side effect anywhere under
// components/ and the discarded tree stops being discardable. Removing the dependency
// beats relying on it being elided.
//
// WHAT IT COSTS, AND WHERE
// ------------------------
// dist/schemas.js, measured on this tree, not recalled:
//
//   42,658 B min / 11,762 B gzip   before ./registry landed
//   53,658 B min / 14,669 B gzip   after ./registry  (+11,000 B / +2,907 B gzip)
//   53,864 B min / 14,739 B gzip   now, with BUILTIN_CARD_TAGS  (+206 B / +70 B gzip)
//
// The middle row is this comment's previous "53,656 / 14,667", re-measured rather than
// carried forward; the 2-byte drift is what a claim costs when it is copied instead of
// taken again. The last row is the tag map below, measured by building this entry with
// and without that one export line.
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

// The card PAYLOAD types — `CardEnvelope.data`, one per built-in card type — so a
// TypeScript backend can NAME the shape it is building instead of assembling an
// `unknown` and hoping.
//
// This is the point of the whole entry, restated at the type level. We publish
// `./schemas/*.json` precisely so a Python or Go route can generate models for
// these payloads, and until this block existed TypeScript — the language the kit
// is authored in — was the one that could not: the types lived inside their
// components' `.tsx`, so naming one from a Node/no-DOM project was TS6142 and
// re-exporting one from here would have dragged the Solid tree into this entry's
// graph. They are authored in ../primitives/card-data-types.ts now, which has no
// DOM and no Solid below it, so this costs the entry nothing — see that file's
// header, and note that the check which can tell the difference is
// `tsc --noEmit -p tsconfig.mcp.json` on a tree with no dist/ present.
//
// Types only: they erase, so this adds nothing to dist/schemas.js.
export type {
  ArtifactCardData,
  ArtifactCardEnvelope,
  ArtifactCardFile,
  ArtifactCardTab,
  ChoiceAllowOther,
  ChoiceCardData,
  ChoiceCardEnvelope,
  ChoiceOption,
  ChoiceOptionMedia,
  ConfirmAction,
  ConfirmActionStyle,
  ConfirmCardData,
  ConfirmCardEnvelope,
  ConfirmTone,
  FormCardEnvelope,
  FormDefinition,
  FormField,
  TasksCardData,
  TasksCardEnvelope,
  TasksCardResult,
  TasksTask,
} from '../primitives/card-data-types';

// The remaining two payload types, `link` and `embed`.
//
// They are NOT in card-data-types.ts, and that is deliberate rather than an
// oversight to be tidied later: that file exists to rescue types that were
// trapped inside a `.tsx`, and these two never were. `LinkPreviewData` and
// `EmbedCardData` have always been authored beside the pure logic that consumes
// them — `resolveLinkMetadata`, `resolveEmbed`/`watchUrl` — in modules that carry
// no DOM and no Solid, so they were already importable from a Node/no-DOM
// project. Moving them would buy nothing and would split each type from the
// functions written against it.
//
// Which is precisely how they got missed. The extraction that created
// card-data-types.ts swept the `.tsx` files, exported what it found HERE, and
// the two types that needed no rescuing were never on its list — five of seven
// payload types landed on this entry and nobody noticed the other two, because
// both are exported from src/index.ts and every check asked only whether a
// consumer could reach them from SOME public barrel. A backend cannot import
// from src/index.ts; that is the Solid-bearing one. See the REACHABILITY note in
// card-type-parity.test.ts, which now enumerates the payload types from
// `cardSchemas` and requires each to be reachable from THIS entry specifically.
//
// `EmbedProvider` comes along because `EmbedCardData.provider` names it, and a
// member type a consumer cannot import leaves them writing `provider: 'youtube'
// as EmbedCardData['provider']`. `ResolvedEmbed` and `LinkMetadataFetcher` stay
// off this entry on purpose — they describe how a card RENDERS and how an app
// resolves metadata in the browser, neither of which a route builds.
export type { EmbedCardData, EmbedCardEnvelope, EmbedProvider } from '../primitives/embed-providers';
export type { LinkPreviewData, LinkPreviewEnvelope } from '../primitives/link-preview';

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
  CardRequireRule,
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

// `CardEnvelope.type` -> the `kai-*` element that renders it — exported because a
// server-side reader needed it and was inventing its own answer instead.
//
// src/agent-tooling/mcp/manifest.ts used to RE-DERIVE this map from the element
// manifest by convention (`kai-<type>`, else the single `kai-<type>-*`). The
// derivation was correct — it even got `link` -> `kai-link-preview` right, via the
// prefix branch — but it was a second copy of a fact the repo already held, kept
// honest only by a test. It re-derived because the authoritative map shared a module
// with `BUILTIN_CARD_COMPONENTS`, which is nothing but Solid, and the MCP is a
// Node/no-DOM project (tsconfig.mcp.json: `lib: ["ESNext"]`, no `jsx` — giving it one
// measures 0 errors -> 1364). src/primitives/card-tags.ts is that data on its own, so
// the map is now readable from source by anything, with or without a DOM.
//
// See "WHAT `verify:ssr` DOES NOT CATCH" above before describing the split as a
// bundle-safety fix: it is a dependency-graph fix, and the bundle is identical either
// way today.
//
// `mergeCardTags` is deliberately NOT re-exported here: merging a consumer's overrides
// is a rendering concern, it already ships from the main entry, and this one is for
// routes.
export { BUILTIN_CARD_TAGS } from '../primitives/card-tags';
export type { CardTagMap } from '../primitives/card-tags';

// The two provider subsets, exported rather than kept private, because a developer
// registering a CUSTOM card schema in Phase 2 needs the same check we run on ours,
// and because `verify:tool-schemas` reads them out of the BUILT entry rather than
// re-deriving them (a guard with its own copy of the table proves nothing).
export { ANTHROPIC_STRICT, OPENAI_STRICT, checkProviderSubset, providerSubsets } from './provider-subsets';
export type { KeywordRule, KeywordStatus, ProviderSubset, StrictProviderId, SubsetViolation } from './provider-subsets';
