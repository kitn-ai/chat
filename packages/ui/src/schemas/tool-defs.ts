// Card schemas -> provider tool definitions.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// A developer who wants a model to produce a `confirm` card today hand-writes a tool
// definition that approximates a schema they cannot import, then hand-writes a mapper
// from the model's arguments back to a CardEnvelope. This repo's own reference
// harness does exactly that and says so in a comment
// (examples/internal/openrouter-spike/src/tools.ts). That is the same shape written
// in five places. This file removes two of them: the tool definition is GENERATED
// from the schema the card already validates against, so it cannot drift.
//
// WHAT THIS FILE IS NOT
// ---------------------
// It is not a provider client and it never becomes one. No `openai`, no
// `@anthropic-ai/sdk`, no `fetch`. The provider envelope shapes below are declared
// here as plain structural types, which is what lets `@kitn.ai/ui` keep its rule that
// nothing under `src/` depends on a provider SDK. The kit PARSES and PROJECTS; the
// consumer FETCHES.
//
// THE HEADLINE, MEASURED, NOT RECALLED
// ------------------------------------
// `strict: true` currently throws for EVERY built-in card on BOTH providers. That is
// not a bug in this file, it is what the schemas say when you hold them against the
// two documented subsets (see provider-subsets.ts for the two source docs). The
// authored schemas use `minLength` (confirm/choice/tasks), `maxLength` +
// `format: "uri"` (link/embed/artifact), `minimum` (tasks/embed/artifact),
// `maxItems` (confirm/artifact), `pattern` (embed), `if`/`then` (embed), `oneOf`
// (artifact), a free-form object (form) and untyped `payload`/`allowOther` members
// (confirm/choice). Non-strict is therefore the default and the mode the
// five-configuration conformance spike actually proved cards in — but since F-20 it
// is no longer a raw pass-through either: a root combinator (`anyOf` on artifact,
// `allOf` on embed) gets HTTP 400 from OpenAI and Anthropic even non-strict, so the
// non-strict projection relaxes those root combinators LOUDLY (constraint restated in
// the description, console.warn names the relaxation, registry.validate still
// enforces at render time). The jsonschema projection stays byte-faithful to the
// authored schema.
//
// The alternative was to silently drop the offending keywords. That is rejected for
// the reason the plan gives: a dropped `maxItems: 4` means the model emits six
// actions and the card renders six buttons, with nothing anywhere saying the contract
// was quietly loosened. A throw that NAMES the card, the path and the keyword is a
// signal on the developer's own machine, which is the whole point.

import { toolNameForCardType } from './from-tool-call';
import { cardSchemas } from './index';
import type { CardSchema, CardSchemaName } from './index';
import {
  ANTHROPIC_STRICT,
  OPENAI_STRICT,
  checkProviderSubset,
  type ProviderSubset,
  type StrictProviderId,
  type SubsetViolation,
} from './provider-subsets';

// THE TOOL NAME IS NOT SPELLED HERE
// ---------------------------------
// `kai_confirm` is produced by `toolNameForCardType()` in ./from-tool-call, which
// also owns the inverse (`cardTypeFromToolName`). Both directions come off one
// string in one module on purpose. If this file wrote `'kai_' + type` instead, the
// two halves could drift, and the symptom would be a model dutifully calling
// `kai_confirm` while the loop's parser looks for something else and routes it to
// `runTool`, where it disappears with no error anywhere.
//
// A `toolPrefix` OVERRIDE IS NOT SHIPPED, AND THAT IS A DECISION.
// The plan reserves `createCardRegistry({ toolPrefix })` for Phase 2. It is
// deliberately NOT stubbed in here, because the inverse hard-codes the `kai_` prefix:
// a `toolPrefix` honoured on this side alone would generate tools the parser cannot
// recognise, which is a worse failure than not having the option. The seam is the
// `CardToolSource` interface below; the override lands in both directions in one
// change, or not at all.

// ---------------------------------------------------------------------------
// Provider envelope shapes, declared here rather than imported from an SDK
// ---------------------------------------------------------------------------

/** A projected schema. Deliberately loose: `type` may become `['string','null']`. */
export type ToolParameters = Readonly<Record<string, unknown>>;

/** `POST /v1/chat/completions` and `/v1/responses` tool entries. */
export interface OpenAIToolDef {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: ToolParameters;
    readonly strict?: true;
  };
}

/** `POST /v1/messages` tool entries. Note `input_schema`, NOT `function.parameters`. */
export interface AnthropicToolDef {
  readonly name: string;
  readonly description: string;
  readonly input_schema: ToolParameters;
  readonly strict?: true;
}

/**
 * The bare form, for the Vercel AI SDK and anything else that wants the schema
 * without a provider envelope: `tool({ inputSchema: jsonSchema(def.schema) })`.
 *
 * First-class, not a fallback. A developer on `ai@7` defines tools with Zod, and
 * handing them an OpenAI-shaped envelope they have to unwrap makes our JSON Schema an
 * awkward second source of truth instead of the one they use.
 */
export interface JsonSchemaToolDef {
  readonly name: string;
  readonly description: string;
  readonly schema: ToolParameters;
}

export type ToolProvider = 'openai' | 'anthropic' | 'jsonschema';

export type ToolDefFor<P extends ToolProvider> = P extends 'openai'
  ? OpenAIToolDef
  : P extends 'anthropic'
    ? AnthropicToolDef
    : JsonSchemaToolDef;

export type ToolDef = OpenAIToolDef | AnthropicToolDef | JsonSchemaToolDef;

export interface CardToolOptions<P extends ToolProvider = ToolProvider> {
  readonly provider: P;
  /**
   * Opt in to the provider's grammar-constrained mode.
   *
   * Default `false`, because that is the mode the conformance sweep proved cards in
   * and because, today, `true` throws for every built-in card on both providers.
   * When it throws it names the card, the path and the keyword.
   */
  readonly strict?: boolean;
  /**
   * Narrow the DERIVED tool schema per card type, after projection (F-23).
   *
   * A card's authored schema is deliberately permissive — `files` is optional on an
   * artifact, its items need only a `path` — because the card CONTRACT must accept
   * what a host may legitimately render. A model filling the tool in, though, is
   * often better served by a tighter tool: requiring `code` on every file, or at
   * least one file at all, moves a class of failures from render time (a card the
   * registry rejects) to generation time (the model literally cannot emit one).
   *
   * This narrows the WIRE projection only — the authored schema and
   * `registry.validate()` are untouched, so a hand-built envelope still validates.
   * Applied for every provider, `jsonschema` included, and merged loudly: an
   * unknown path or a required name the node has no property for is a TypeError
   * naming the card, the path and the field, because a tool that can never be
   * satisfied must not ship quietly.
   *
   * IT CANNOT REACH A FORM CARD'S FIELDS, and that is a known limitation rather
   * than an oversight (form-field-formats spec §7.3, open question O-1). The form
   * card's payload IS a JSON Schema, so `form.schema.json` describes `properties`
   * as a map of field definitions and there is no node at `properties.ticketId`
   * for a rule to land on — `require: { form: [{ path: 'properties.ticketId' }] }`
   * raises the TypeError above, correctly. So an app cannot pin
   * `x-kai-format: 'custom'` onto one field of a form the model authors. The
   * enum on that hint is what makes a small model pick a valid token; an app that
   * needs a guarantee checks the envelope when it arrives.
   */
  readonly require?: Readonly<Record<string, readonly CardRequireRule[]>>;
}

/**
 * One narrowing instruction for one node of one card's projected schema.
 *
 * `path` is a dot-path from the envelope-data root through `properties` keys
 * (`''` names the root node itself). On an ARRAY node, `required` narrows
 * `items.required` and `minItems` lands on the array; on an object node,
 * `required` lands on the node's own `required`. Existing requirements merge,
 * never replace.
 */
export interface CardRequireRule {
  /** Dot-path from the envelope-data root to a schema node, e.g. 'files'. */
  readonly path: string;
  /** Property names to require. On an ARRAY node this narrows `items.required`; on an object node, the node's own `required`. */
  readonly required?: readonly string[];
  /** Sets `minItems` (array nodes only). */
  readonly minItems?: number;
}

/**
 * Where the card types come from.
 *
 * Phase 1 hands this the built-in `cardSchemas` map directly. Phase 2's
 * `createCardRegistry()` returns an object that is structurally a `CardToolSource`,
 * so `cardTools(registry, opts)` starts working on custom card types without this
 * signature changing. That is the seam, left open on purpose and not built yet.
 */
export interface CardToolSource {
  readonly schemas: Readonly<Record<string, CardSchema>>;
  /** Tool descriptions by card type. Falls back to the built-in copy, then the schema's own. */
  readonly descriptions?: Readonly<Record<string, string>>;
}

export type CardToolInput = CardToolSource | Readonly<Record<string, CardSchema>>;

// ---------------------------------------------------------------------------
// Tool descriptions
// ---------------------------------------------------------------------------

/**
 * What each card is FOR, addressed to a model.
 *
 * This is not a sixth copy of a shape. The shape stays in the JSON Schema and is
 * never restated here; these are one sentence each of purpose, which exists nowhere
 * else, and which a schema's own `description` ("Data payload for a `confirm` card")
 * does not provide because it is written for a developer reading the contract.
 *
 * Typed as an exhaustive `Record<CardSchemaName, string>`, so adding an eighth card
 * type fails `tsc` here rather than silently shipping a tool with no description.
 */
export const CARD_TOOL_DESCRIPTIONS: Readonly<Record<CardSchemaName, string>> = Object.freeze({
  confirm:
    'Show the user an approval card and wait for their decision before you act. Use this whenever you are about to do something consequential, destructive or irreversible.',
  choice:
    'Ask the user to pick exactly one option from a list of rich choices. Use this instead of asking in prose when the options are known and finite.',
  tasks:
    'Show the user a checklist they can tick, either to select several items for you to act on or to track progress through a sequence of steps.',
  form: 'Ask the user for structured input by rendering a form. The data is itself a JSON Schema describing the fields to collect.',
  link: 'Show a rich preview of a web page: title, description, image and domain. The card renders what you supply and never fetches the page itself.',
  embed: 'Embed a video player (YouTube, Vimeo, or a direct player URL) inline in the conversation.',
  artifact:
    'Show something you built (a page, an app, a set of files) in a framed preview with its source alongside, so the user can look at both.',
});

// ---------------------------------------------------------------------------
// The error
// ---------------------------------------------------------------------------

export interface UnsupportedCardTool {
  readonly cardType: string;
  readonly toolName: string;
  readonly violations: readonly SubsetViolation[];
}

/**
 * Thrown by `cardTools(..., { strict: true })` when a card cannot be expressed in the
 * provider's strict subset.
 *
 * Carries the structured detail as well as the message, so a build script can render
 * it however it likes rather than parsing prose.
 */
export class UnsupportedCardToolSchemaError extends Error {
  override readonly name = 'UnsupportedCardToolSchemaError';
  readonly provider: StrictProviderId;
  readonly source: string;
  readonly cards: readonly UnsupportedCardTool[];

  constructor(subset: ProviderSubset, cards: readonly UnsupportedCardTool[]) {
    super(formatUnsupported(subset, cards));
    this.provider = subset.id;
    this.source = subset.source;
    this.cards = cards;
  }

  /** Every distinct keyword named across every failing card, deduped, in order. */
  get keywords(): string[] {
    const seen = new Set<string>();
    for (const card of this.cards) for (const v of card.violations) seen.add(v.keyword);
    return [...seen];
  }
}

function formatUnsupported(subset: ProviderSubset, cards: readonly UnsupportedCardTool[]): string {
  const lines: string[] = [];
  const plural = cards.length === 1 ? 'card type' : 'card types';
  lines.push(`${cards.length} ${plural} cannot be a STRICT tool definition under ${subset.label}:`);
  for (const card of cards) {
    lines.push('');
    lines.push(`  ${card.toolName} (card type "${card.cardType}") — ${card.violations.length} problem(s):`);
    for (const v of card.violations) {
      lines.push(`    ${v.path}: \`${v.keyword}\` — ${v.reason}`);
    }
  }
  lines.push('');
  lines.push(`  subset source: ${subset.source} (read ${subset.checkedOn})`);
  lines.push(
    '  Fix: drop `strict: true`. Non-strict mode projects a provider-valid schema (root combinators are relaxed with the constraint restated in the description and still enforced by card validation). Rewriting a built-in card schema to fit a strict subset would change what a valid card IS, which is a card-contract change, not a projection setting.',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Root combinators the two largest providers refuse on a tool schema's root node
 * (measured: OpenAI and Anthropic 400 before the model runs — findings F-20;
 * DeepSeek's OpenAI-compatible route requires the same workaround). The AUTHORED
 * schemas keep them — card validation keeps every constraint. Only the WIRE
 * projection relaxes, loudly: the constraint is restated in the description the
 * model reads, a console.warn names the relaxation, and a violating envelope
 * still fails registry.validate() at render time with a hard diagnostic.
 */
const ROOT_RELAXATIONS: Readonly<Record<string, string>> = {
  artifact:
    'Provide `src` (a preview URL) or `files` — at least one. An envelope with neither is rejected.',
  embed:
    "For provider 'generic', include `url`. For 'youtube'/'vimeo', include `id` or `url`.",
};

/** Strip a banned combinator key from the projected ROOT node only (nested
 *  combinators are accepted by every provider measured and stay). Returns the
 *  relaxation note to restate in the TOOL description the model reads. Two
 *  distinct no-note return paths: `undefined` when NOTHING was banned (the wire
 *  projection is faithful, nothing was widened), and GENERIC_NOTE when something
 *  WAS banned but no curated copy exists (a custom card) — that path still
 *  restates the relaxation, because deleting a combinator without telling the
 *  model would be a silent widening. */
const GENERIC_RELAXATION_NOTE =
  'The root constraint of this schema was relaxed for this provider; consult the card registry for what a valid payload is.';

const BANNED_ROOT_KEYS = ['anyOf', 'allOf', 'oneOf', 'not', 'enum', 'const'] as const;

/**
 * The object shape a literal `enum` / `const` VALUE implies.
 *
 * `const: { op: 'ping' }` is a whole-instance constraint, which a provider refuses
 * at the root exactly like a combinator. The instance it admits is an object, so
 * the shape survives the relaxation as `properties: { op: { const: 'ping' } }` with
 * `op` required — nothing widened that the branch did not already allow.
 */
function branchFromLiteral(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const properties: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(value)) properties[key] = { const: member };
  return { type: 'object', properties, required: Object.keys(value) };
}

/** The branch schemas one banned root keyword contributes, or `[]` for one that has none. */
function branchesOfRootKeyword(keyword: string, value: unknown): Record<string, unknown>[] {
  if (keyword === 'anyOf' || keyword === 'oneOf' || keyword === 'allOf') {
    return Array.isArray(value) ? value.filter(isRecord) : [];
  }
  if (keyword === 'const') return [branchFromLiteral(value)].filter((b): b is Record<string, unknown> => b !== null);
  if (keyword === 'enum') {
    return Array.isArray(value)
      ? value.map(branchFromLiteral).filter((b): b is Record<string, unknown> => b !== null)
      : [];
  }
  // `not` is a NEGATIVE constraint: nothing it says is a property the instance may
  // carry, so there is nothing sound to merge back. It is dropped and restated in
  // the description like every other relaxation.
  return [];
}

/**
 * Fold a root combinator's branches back into the object root that replaces it.
 *
 * The two built-ins showed the shape of the rule and this generalises it rather
 * than special-casing them. `artifact`'s root `anyOf` is `[{required:['src']},
 * {required:['files']}]`: a DISJUNCTION guarantees only what EVERY branch
 * guarantees, so the intersection is empty and `required` stays absent — which is
 * exactly what the artifact projection already did. `embed`'s root `allOf` is two
 * `if`/`then` pairs: a CONJUNCTION guarantees every branch's own top-level
 * `required`, and an `if`/`then` branch declares none, so again nothing is added.
 * A consumer card whose branches carry real `properties` is the case neither
 * built-in reaches, and the one this exists for.
 *
 * Properties are UNIONed (each branch's shape must remain expressible — dropping
 * one is the silent narrowing the whole F-20 fix exists to avoid); a name already
 * on the root keeps the root's definition. `required` is the intersection for
 * `anyOf`/`oneOf`/`enum`/`const` and the union for `allOf`, unioned in turn with
 * whatever the root already required, and filtered to names the merged
 * `properties` actually carries so the tool can never be unsatisfiable.
 */
function mergeBranchesIntoRoot(parameters: Record<string, unknown>, banned: readonly string[]): void {
  const properties: Record<string, unknown> = isRecord(parameters.properties)
    ? { ...parameters.properties }
    : {};
  const guaranteed = new Set<string>(
    Array.isArray(parameters.required) ? parameters.required.map(String) : [],
  );

  for (const keyword of banned) {
    const branches = branchesOfRootKeyword(keyword, parameters[keyword]);
    if (branches.length === 0) continue;

    for (const branch of branches) {
      if (!isRecord(branch.properties)) continue;
      for (const [name, sub] of Object.entries(branch.properties)) {
        if (!(name in properties)) properties[name] = sub;
      }
    }

    const perBranch = branches.map(
      (branch) => new Set(Array.isArray(branch.required) ? branch.required.map(String) : []),
    );
    if (keyword === 'allOf') {
      for (const set of perBranch) for (const name of set) guaranteed.add(name);
    } else {
      // Disjunction: keep only what every branch requires.
      const [first, ...rest] = perBranch;
      for (const name of first) {
        if (rest.every((set) => set.has(name))) guaranteed.add(name);
      }
    }
  }

  if (Object.keys(properties).length > 0) parameters.properties = properties;
  const required = [...guaranteed].filter((name) => name in properties);
  if (required.length > 0) parameters.required = required;
}

/**
 * Make the projected ROOT the object shape every provider demands.
 *
 * Deleting a root combinator is only half of F-20. A schema whose root was NOTHING
 * BUT the combinator projects to `{"title":…,"description":…}` once it is gone —
 * accepted by no provider (measured: OpenAI 400, "schema must be a JSON Schema of
 * type \"object\"") and unfillable by any model. Every built-in declares
 * `type: "object"` at its root, so nothing in the suite reached this until a
 * consumer card did.
 *
 * A root that declares a NON-object type cannot be a tool schema at all, and
 * asserting `type: "object"` over it would be a lie about the card. That refuses,
 * naming the card.
 */
function ensureObjectRoot(parameters: Record<string, unknown>, cardType: string): void {
  const declared = parameters.type;
  if (declared !== undefined && declared !== 'object') {
    throw new TypeError(
      `cardTools: the '${cardType}' card schema declares root type '${String(declared)}', but a provider tool ` +
        `schema root must be an object (OpenAI and Anthropic reject anything else with HTTP 400). ` +
        `Wrap the payload in an object, or project this card with provider 'jsonschema'.`,
    );
  }
  parameters.type = 'object';
}

function relaxRootCombinators(parameters: Record<string, unknown>, cardType: string): string | undefined {
  const note = ROOT_RELAXATIONS[cardType];
  const banned = BANNED_ROOT_KEYS.filter((k) => k in parameters);
  // The object-root guarantee holds for EVERY provider projection, banned keys or
  // not: it is what the provider requires, not what the relaxation broke.
  ensureObjectRoot(parameters, cardType);
  if (banned.length === 0) return undefined;
  mergeBranchesIntoRoot(parameters, banned);
  for (const k of banned) delete parameters[k];
  // eslint-disable-next-line no-console
  console.warn(
    `[kai-card-tools] relaxed root ${banned.join('/')} on the projected '${toolNameForCardType(cardType)}' tool schema ` +
      `for this provider (it would be refused with HTTP 400); the constraint now lives in the ` +
      `description and is still enforced by card validation.`,
  );
  return note ?? GENERIC_RELAXATION_NOTE;
}

/**
 * Apply one card's `require` rules to its PROJECTED parameters (F-23).
 *
 * Runs after `project()` and `relaxRootCombinators()`, on the copy the projection
 * built — never on the authored schema, which `registry.validate()` keeps reading.
 * Merges into whatever `required` already exists rather than replacing it, so a
 * rule can only ever NARROW what the model may emit, never widen it.
 */
function applyRequire(
  parameters: Record<string, unknown>,
  cardType: string,
  rules: readonly CardRequireRule[],
): void {
  for (const rule of rules) {
    // Resolve the dot-path through `properties` keys. `''` names the root node;
    // every other segment must name a property of the node reached so far.
    let node: Record<string, unknown> = parameters;
    if (rule.path !== '') {
      for (const segment of rule.path.split('.')) {
        const props = isRecord(node.properties) ? node.properties : undefined;
        const next = props?.[segment];
        if (!isRecord(next)) {
          throw new TypeError(
            `cardTools: require on '${cardType}': path '${rule.path}' does not resolve in the schema`,
          );
        }
        node = next;
      }
    }

    const isArrayNode = node.type === 'array' || (node.type === undefined && 'items' in node);
    if (isArrayNode && rule.minItems !== undefined) node.minItems = rule.minItems;
    if (!isArrayNode && rule.minItems !== undefined) {
      throw new TypeError(
        `cardTools: minItems at require path '${rule.path}' applies to array nodes only, ` +
          `but '${rule.path}' in the '${cardType}' schema is not one`,
      );
    }

    if (rule.required !== undefined) {
      // On an array node the requirement lives on the ITEMS (each element must carry
      // the field), not on the array itself.
      const target = isArrayNode && isRecord(node.items) ? node.items : node;
      const props = isRecord(target.properties) ? target.properties : undefined;
      for (const field of rule.required) {
        if (!props || !(field in props)) {
          throw new TypeError(
            `cardTools: require on '${cardType}' at path '${rule.path}': '${field}' is not a property of that node — ` +
              `a required name with no property would make the tool unsatisfiable`,
          );
        }
      }
      const existing = Array.isArray(target.required) ? target.required.map(String) : [];
      target.required = [...new Set([...existing, ...rule.required])];
    }
  }
}

/**
 * Keywords stripped from every projection, strict or not.
 *
 * `$schema` and `$id` are meta: they address the document, they do not describe the
 * instance, and neither provider's subset lists them. `x-kai-*` are our own UI hints
 * (`x-kai-control: "tone"` tells a renderer to draw a tone picker); a model has no
 * use for them, they cost tokens in every request, and under strict they are an
 * unlisted keyword. Stripping them is not a downgrade of the contract, because they
 * never constrained an instance in the first place.
 */
function isStrippedKeyword(key: string): boolean {
  return key === '$schema' || key === '$id' || key.startsWith('x-');
}

const SUBSCHEMA_KEYS = ['items', 'if', 'then', 'else', 'not', 'contains', 'propertyNames', 'unevaluatedItems', 'additionalItems'];
const SUBSCHEMA_MAP_KEYS = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];
const SUBSCHEMA_LIST_KEYS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];

interface ProjectOptions {
  /** Force `additionalProperties: false` on every object. Both strict subsets demand it. */
  readonly closeObjects: boolean;
  /** Put every property in `required`, widening the newly-required ones with `null`. OpenAI only. */
  readonly requireEveryProperty: boolean;
}

/**
 * Rewrite a schema for the wire.
 *
 * Only ever REMOVES metadata or ADDS what a provider mandates. It never drops a
 * constraint, which is the invariant that keeps a projected tool definition and the
 * card's own validator describing the same set of valid cards.
 */
function project(node: unknown, opts: ProjectOptions): unknown {
  if (!isRecord(node)) return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (isStrippedKeyword(key)) continue;
    out[key] = value;
  }

  // Recurse. `properties` KEYS are arbitrary names, not keywords: form.schema.json
  // has properties literally called `properties` and `x-kai-order`, and stripping
  // those would delete real fields rather than metadata.
  for (const key of SUBSCHEMA_MAP_KEYS) {
    const map = out[key];
    if (!isRecord(map)) continue;
    const next: Record<string, unknown> = {};
    for (const [name, child] of Object.entries(map)) next[name] = project(child, opts);
    out[key] = next;
  }
  for (const key of SUBSCHEMA_KEYS) {
    if (!(key in out) || typeof out[key] === 'boolean') continue;
    out[key] = project(out[key], opts);
  }
  if (isRecord(out.additionalProperties)) out.additionalProperties = project(out.additionalProperties, opts);
  for (const key of SUBSCHEMA_LIST_KEYS) {
    const list = out[key];
    if (!Array.isArray(list)) continue;
    out[key] = list.map((child) => project(child, opts));
  }

  const props = isRecord(out.properties) ? out.properties : undefined;
  const looksLikeObject = out.type === 'object' || props !== undefined;

  if (looksLikeObject && opts.closeObjects && !('additionalProperties' in out)) {
    out.additionalProperties = false;
  }

  if (looksLikeObject && opts.requireEveryProperty && props) {
    const originallyRequired = Array.isArray(out.required) ? out.required.map(String) : [];
    const all = Object.keys(props);
    for (const name of all) {
      if (originallyRequired.includes(name)) continue;
      props[name] = widenWithNull(props[name]);
    }
    out.required = all;
  }

  return out;
}

/**
 * OpenAI's documented emulation of an optional field: keep it in `required` and let
 * its type admit `null`.
 *
 * The `enum` half matters. `{ type: ['string','null'], enum: ['a','b'] }` admits
 * nothing new, because the enum still excludes null, so the field would be required
 * AND unsatisfiable-as-absent. `null` therefore joins the enum too.
 *
 * A subschema with nothing to widen (no `type`, no `anyOf`) is returned untouched.
 * That is not a silent pass: `checkProviderSubset` reports it as an untyped
 * subschema, which is the real problem and a truer message than "could not widen".
 */
function widenWithNull(sub: unknown): unknown {
  if (!isRecord(sub)) return sub;
  const out: Record<string, unknown> = { ...sub };

  if ('type' in out) {
    const declared = Array.isArray(out.type) ? out.type.map(String) : [String(out.type)];
    if (!declared.includes('null')) out.type = [...declared, 'null'];
  } else if (Array.isArray(out.anyOf)) {
    if (!out.anyOf.some((b) => isRecord(b) && b.type === 'null')) out.anyOf = [...out.anyOf, { type: 'null' }];
  } else {
    return out;
  }

  if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
  return out;
}

// ---------------------------------------------------------------------------
// cardTools
// ---------------------------------------------------------------------------

function normalizeSource(input: CardToolInput): {
  schemas: Readonly<Record<string, CardSchema>>;
  descriptions: Readonly<Record<string, string>>;
} {
  // A `CardToolSource` is recognised by carrying a `schemas` map. A bare
  // `Record<type, CardSchema>` cannot collide with that unless someone names a card
  // type "schemas" AND its schema document is itself a map of schema documents,
  // which is not a shape the card contract can produce.
  const maybe = input as Partial<CardToolSource>;
  if (isRecord(maybe.schemas)) {
    return { schemas: maybe.schemas, descriptions: maybe.descriptions ?? {} };
  }
  return { schemas: input as Readonly<Record<string, CardSchema>>, descriptions: {} };
}

function describe(cardType: string, schema: CardSchema, overrides: Readonly<Record<string, string>>): string {
  const custom = overrides[cardType];
  if (typeof custom === 'string' && custom.length > 0) return custom;
  const builtIn = (CARD_TOOL_DESCRIPTIONS as Readonly<Record<string, string>>)[cardType];
  if (typeof builtIn === 'string' && builtIn.length > 0) return builtIn;
  // Last resort for a custom card type registered without a description. The schema's
  // own prose is worse guidance than a purpose sentence, but it beats an empty string,
  // and Phase 2's registry warns when a type arrives with neither.
  const own = schema.description;
  return typeof own === 'string' && own.length > 0 ? own : `Render a \`${cardType}\` card.`;
}

/**
 * Project the card schemas into tool definitions for one provider.
 *
 * ```ts
 * const tools = [...myTools, ...cardTools({ provider: 'openai' })];
 * const tools = cardTools(cards, { provider: 'anthropic' });
 * const tools = cardTools({ provider: 'jsonschema' }).map((t) =>
 *   tool({ description: t.description, inputSchema: jsonSchema(t.schema) }));
 * ```
 *
 * @throws {UnsupportedCardToolSchemaError} with `strict: true`, naming every card,
 * path and keyword the provider cannot express. See the file header: today that is
 * every built-in card on both providers.
 */
export function cardTools<P extends ToolProvider>(opts: CardToolOptions<P>): ToolDefFor<P>[];
export function cardTools<P extends ToolProvider>(registry: CardToolInput, opts: CardToolOptions<P>): ToolDefFor<P>[];
export function cardTools(a: CardToolInput | CardToolOptions, b?: CardToolOptions): ToolDef[] {
  // Single-argument form: `cardTools({ provider: 'openai' })` defaults the registry
  // to the built-ins, which is the shape the developer-facing docs lead with.
  const optionsOnly = b === undefined;
  const opts = (optionsOnly ? (a as CardToolOptions) : (b as CardToolOptions));
  if (!isRecord(opts) || typeof opts.provider !== 'string') {
    throw new TypeError('cardTools: an options object with a `provider` is required, e.g. cardTools({ provider: "openai" })');
  }
  const { schemas, descriptions } = normalizeSource(
    optionsOnly ? (builtInSchemas() as CardToolInput) : (a as CardToolInput),
  );
  const strict = opts.strict === true;

  if (opts.provider === 'jsonschema' && strict) {
    throw new TypeError(
      'cardTools: `strict: true` is provider-specific and cannot be checked for `provider: "jsonschema"`, ' +
        'because the two documented strict subsets differ (see @kitn.ai/ui/schemas provider-subsets). ' +
        'Pass provider "openai" or "anthropic" to project and check strictly, or drop `strict`.',
    );
  }

  const subset: ProviderSubset | null = strict
    ? opts.provider === 'openai'
      ? OPENAI_STRICT
      : ANTHROPIC_STRICT
    : null;

  const projectOptions: ProjectOptions = {
    closeObjects: subset !== null,
    requireEveryProperty: subset !== null && subset.requireAllPropertiesRequired,
  };

  const defs: ToolDef[] = [];
  const failures: UnsupportedCardTool[] = [];

  // A `require` key naming a card the call does not carry is a typo, and a typo here
  // would otherwise narrow NOTHING while looking like it narrowed something — the
  // same decide-loudly class as an unknown dot-path below.
  if (opts.require !== undefined) {
    for (const key of Object.keys(opts.require)) {
      if (!(key in schemas)) {
        throw new TypeError(
          `cardTools: require names card type '${key}', which this call does not carry ` +
            `(carries: ${Object.keys(schemas).join(', ') || 'none'})`,
        );
      }
    }
  }

  for (const [cardType, schema] of Object.entries(schemas)) {
    const name = toolNameForCardType(cardType);
    const description = describe(cardType, schema, descriptions);
    const parameters = project(schema, projectOptions) as ToolParameters;

    // F-20: non-strict only. Strict mode already refuses these cards with the full
    // subset check, so the relaxation must never mask it. The note is restated in the
    // TOOL description — the envelope field the model reads when choosing the tool.
    const relaxedNote =
      subset === null && opts.provider !== 'jsonschema'
        ? relaxRootCombinators(parameters as Record<string, unknown>, cardType)
        : undefined;
    const wireDescription = relaxedNote ? `${description} ${relaxedNote}` : description;

    // F-23: every provider, jsonschema included — a consumer handing the bare schema
    // to the Vercel AI SDK narrows their tool the same way. Runs BEFORE the strict
    // subset check so that check judges the schema that actually ships.
    const requireRules = opts.require?.[cardType];
    if (requireRules !== undefined) applyRequire(parameters as Record<string, unknown>, cardType, requireRules);

    if (subset) {
      const violations = checkProviderSubset(parameters, subset);
      if (violations.length > 0) {
        failures.push({ cardType, toolName: name, violations });
        continue;
      }
    }

    if (opts.provider === 'openai') {
      defs.push({ type: 'function', function: { name, description: wireDescription, parameters, ...(strict ? { strict: true as const } : {}) } });
    } else if (opts.provider === 'anthropic') {
      defs.push({ name, description: wireDescription, input_schema: parameters, ...(strict ? { strict: true as const } : {}) });
    } else {
      defs.push({ name, description, schema: parameters });
    }
  }

  if (subset && failures.length > 0) throw new UnsupportedCardToolSchemaError(subset, failures);
  return defs;
}

/**
 * The built-in map, read at CALL time.
 *
 * `./index` re-exports this module, and this module imports `cardSchemas` back out
 * of it, which is a genuine ESM import cycle. It is safe because the value is only
 * ever read inside a function body: by the time anyone calls `cardTools()`, both
 * module bodies have finished evaluating and the live binding is populated. Reading
 * it at TOP level here would be a temporal-dead-zone crash, so do not hoist it into
 * a `const`.
 */
function builtInSchemas(): Readonly<Record<string, CardSchema>> {
  return cardSchemas;
}

/** `cardTools(registry, { provider: 'openai' })`, spelled out. */
export function toOpenAITools(registry?: CardToolInput, opts?: { strict?: boolean }): OpenAIToolDef[] {
  return registry === undefined
    ? cardTools({ provider: 'openai', strict: opts?.strict })
    : cardTools(registry, { provider: 'openai', strict: opts?.strict });
}

/** `cardTools(registry, { provider: 'anthropic' })`, spelled out. */
export function toAnthropicTools(registry?: CardToolInput, opts?: { strict?: boolean }): AnthropicToolDef[] {
  return registry === undefined
    ? cardTools({ provider: 'anthropic', strict: opts?.strict })
    : cardTools(registry, { provider: 'anthropic', strict: opts?.strict });
}

/** `cardTools(registry, { provider: 'jsonschema' })`, spelled out. */
export function toJsonSchemaTools(registry?: CardToolInput): JsonSchemaToolDef[] {
  return registry === undefined
    ? cardTools({ provider: 'jsonschema' })
    : cardTools(registry, { provider: 'jsonschema' });
}
