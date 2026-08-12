// src/primitives/card-validate-cards.ts
// Two-tier validation of a CardEnvelope's `data` against the card schema for its
// type, for the NATIVE dispatchers.
//
// "The card schema for its type" means one of the seven built-ins, OR a schema the
// app registered for a card type of its own. The second half arrived with
// `createCardRegistry` (src/schemas/registry.ts) and is the optional third argument
// to `validateCardData`. It exists because a developer's real generative UI is THEIR
// pricing table, not our confirm card, and a validator that covers only the built-ins
// leaves the one card the app actually cares about as the only unchecked one.
//
// THIS MIRRORS src/remote/provider-runtime.ts:139-147, DELIBERATELY.
// -----------------------------------------------------------------
// The remote (iframe) transport has validated every incoming envelope since the card
// contract landed: `validateAgainstSchema(renderer.schema, envelope.data)`, and on
// failure it renders a placeholder and emits `{ kind: 'error', cardId, message }`.
// The native path (the Solid `<CardRenderer>` and `<kai-cards>`) checked only that
// the TYPE was registered, so the same bad payload was caught in an iframe and
// rendered silently in-process. That asymmetry is what this file closes. The two
// transports are one behaviour; if you change the shape of the failure here, change
// it there too, and say so.
//
// WHY THIS IS ENFORCEMENT AND NOT A SAFETY NET
// --------------------------------------------
// The intended design was that `strict: true` tool definitions would constrain the
// model so envelopes arrived valid by construction. Measured against both providers'
// current strict subsets (see src/schemas/provider-subsets.ts), strict mode cannot
// express ANY of the seven card types today: `form`'s free-form `properties` object
// collapses to `{}` under the mandatory `additionalProperties: false`, and the other
// six trip `minLength`/`maxLength`/`format: "uri"`/`allOf`. So the schema guides the
// model and does not constrain it, and this check is the only thing standing between
// a wrong shape and the user's screen.
//
// WHY THE TIERING IS NOT POLITENESS
// ---------------------------------
// This library is pre-1.0 and already in use. Cards that render acceptably today
// must keep rendering, or turning validation on is a behaviour break dressed up as a
// fix. So a failure that means the card has NOTHING to render replaces the card with
// a diagnostic (hard), and a failure that means the card has content which is merely
// out of bounds renders the card and reports (soft). Both emit `{ kind: 'error' }`,
// because the developer needs to hear about both; only one changes what the user sees.
//
// THE SOFT TIER IS ON BY EVIDENCE, NOT BY CONFIDENCE
// --------------------------------------------------
// The plan (2026-08-11-emit-contract.md §9 risk 4) said validation is net-negative if
// it fires on cards that render fine today, and set the bar at ZERO before the soft
// tier could default on. That was measured, not assumed:
// docs/superpowers/specs/2026-08-12-soft-tier-corpus.md.
//
// 35 card envelopes recorded from five model configurations across both wires, six
// card types. ZERO trip the soft tier; zero trip the hard tier. The check was proven
// live on that same path by seven negative controls (real envelopes mutated into each
// tier's named failure, each required to trip), and a fifth of the envelopes were
// confirmed by replaying them through the real app and reading them back off
// `<kai-thread>.messages`. Margins were wide, not marginal: the worst `link.title`
// observed was 21 characters against a 300 limit.
//
// What that corpus does NOT cover, so it is not claimed: the structured-output path
// (model-authored envelope JSON, which nothing clamps), live `artifact` cards, and
// the soft constraints the spike's own tool projection clamps before they can be hit
// (`tone`/`provider` enums, the generated `id` fields, every `minItems`). If the soft
// tier ever does turn out to be noisy, that is where to look first, and the fix is the
// projection rather than the tier.
//
// WHAT IS ACTUALLY CHECKED
// ------------------------
// The keyword coverage is `validateAgainstSchema`'s, which is a lean subset: `type`,
// `const`, `enum`, `required`, `properties`, `items`, the numeric bounds,
// `minLength`/`maxLength`/`pattern`, `minItems`/`maxItems`/`uniqueItems`. It has no
// applicators and no `additionalProperties`. The consequences are written out per
// keyword in scripts/gen-card-validation-schemas.mjs's NOT_ENFORCED table, and the
// generated projection repeats them at the top of card-validate-schemas.ts. The
// short version, because it bears on what may be claimed: an `embed` missing both
// `id` and `url`, an `artifact` with neither `src` nor `files`, a `link.url` that is
// not a URL, and an undeclared extra property are all NOT caught here.

import { validateAgainstSchema, type JsonSchema, type ValidationIssue } from './card-validate';
import { CARD_VALIDATION_SCHEMAS, type ValidatedCardType } from './card-validate-schemas';

export type { ValidatedCardType } from './card-validate-schemas';
export { CARD_VALIDATION_SCHEMAS } from './card-validate-schemas';

/** How badly a failed constraint hurts the rendered card. */
export type CardValidationTier = 'hard' | 'soft';

export interface CardValidationIssue extends ValidationIssue {
  tier: CardValidationTier;
}

export interface CardValidationReport {
  /** True when nothing failed. A SOFT-only report is not `ok`. */
  ok: boolean;
  /** `hard` if any issue is hard, else `soft` if any issue is soft, else `ok`. */
  tier: CardValidationTier | 'ok';
  /** Every failure, hard and soft, in the validator's order. */
  issues: CardValidationIssue[];
  /** The hard issues only. Non-empty exactly when `tier === 'hard'`. */
  hard: CardValidationIssue[];
  /** One line naming the failing field paths. Safe to render and to log. */
  summary: string;
}

/**
 * Keyword to tier.
 *
 * The line is PRESENCE versus BOUNDS, and it is drawn per keyword rather than per
 * card because the dispatcher does not know what any given card component does with
 * a field.
 *
 *   hard  the field the card is built around is absent, or is a different kind of
 *         thing entirely. There is nothing to draw.
 *   soft  the field is present and of the right kind; there is just too much of it,
 *         too little, or it is outside a declared range. Something renders.
 *
 * THE TWO ENTRIES THAT ARE JUDGEMENT CALLS, RECORDED BECAUSE THEY ARE ARGUABLE:
 *
 * `minItems` is HARD while `minLength` is SOFT, and they look like the same shape.
 * The difference is what is lost. `confirm.actions` has `minItems: 1`, so violating
 * it means a decision card with no decisions: the entire interactive surface is
 * gone, and what renders is empty chrome that looks like a bug in this library. The
 * plan names that case specifically as the one the diagnostic exists for. Violating
 * `minLength: 1` on `actions[].label` means ONE blank button label; the button is
 * still there, still focusable, and still emits the correct `id`. Replacing a whole
 * card with a diagnostic over one blank label is the worse outcome for the user.
 *
 * `type` is HARD everywhere, including on optional scalars where a truthy wrong type
 * would have rendered fine (`dismissible: "yes"`). That is deliberately blunt. A
 * per-field carve-out would need the dispatcher to know which fields each card
 * component treats loosely, which it cannot, and a wrong `type` is the single
 * strongest signal that the model produced something other than what was asked for.
 */
const TIER_BY_KEYWORD: Readonly<Record<string, CardValidationTier>> = Object.freeze({
  // hard: nothing to render
  type: 'hard',
  required: 'hard',
  const: 'hard', // pins a discriminator (`form.data.type` must be `"object"`)
  minItems: 'hard',
  // soft: content is present, bounds are not respected
  enum: 'soft', // cards fall back to their default variant for an unknown value
  maxItems: 'soft',
  minLength: 'soft',
  maxLength: 'soft',
  pattern: 'soft',
  minimum: 'soft',
  maximum: 'soft',
  exclusiveMinimum: 'soft',
  exclusiveMaximum: 'soft',
  uniqueItems: 'soft',
});

/**
 * The tier for a keyword the table does not list.
 *
 * SOFT, on purpose. An unlisted keyword can only appear by someone adding a check to
 * `validateAgainstSchema` and not tiering it, and the failure mode of guessing wrong
 * is asymmetric: guessing soft under-reacts on one new keyword until someone tiers
 * it, while guessing hard would start blanking cards that render fine today, which
 * is precisely the regression this design exists to prevent. `card-validate-cards.test.ts`
 * asserts the table covers every keyword the validator implements, so this default
 * is a fallback for a tree that is already failing its own test, not a resting state.
 */
const DEFAULT_TIER: CardValidationTier = 'soft';

/** True when this envelope type has a BUILT-IN projected schema to validate against. */
export function isValidatedCardType(type: string): type is ValidatedCardType {
  return Object.prototype.hasOwnProperty.call(CARD_VALIDATION_SCHEMAS, type);
}

/**
 * The schema to check `type` against, consumer-supplied first.
 *
 * A consumer schema WINS over a built-in of the same name, matching
 * `mergeCardTags`/`mergeCardComponents`, where the consumer's entry is spread over
 * ours. Anything else would mean a developer who replaced our confirm card with their
 * own still had their data checked against our shape.
 */
function schemaFor(
  type: string,
  extra: Readonly<Record<string, JsonSchema>> | undefined,
): JsonSchema | null {
  if (extra && Object.prototype.hasOwnProperty.call(extra, type)) {
    const custom = extra[type];
    if (custom && typeof custom === 'object') return custom;
  }
  return isValidatedCardType(type) ? CARD_VALIDATION_SCHEMAS[type] : null;
}

function summarize(issues: CardValidationIssue[]): string {
  // Name the FIELD PATHS. "invalid card data" on its own sends a developer to a
  // debugger; "(root).actions: fewer than minItems 1" sends them to the line.
  const shown = issues.slice(0, 3).map((i) => i.message);
  const rest = issues.length - shown.length;
  return shown.join('; ') + (rest > 0 ? `; and ${rest} more` : '');
}

/**
 * Validate a card envelope's `data` against the schema for `type`.
 *
 * Returns `null` when there is no schema for the type at all. Returning `null` rather
 * than an empty pass keeps "we checked and it was fine" distinguishable from "there
 * was nothing to check", so a caller cannot report the second as the first.
 *
 * @param schemas consumer-registered schemas by card type, normally
 * `registry.validationSchemas` from `createCardRegistry`. Without it this function
 * knows only the seven built-ins, which would mean a developer's own pricing-table
 * card, registered perfectly legally through `cardTypes`, is the one card in the app
 * nothing checks. The custom entry wins over a built-in of the same name; see
 * {@link schemaFor}.
 *
 * A consumer schema is used AS AUTHORED rather than through the build-time lean
 * projection the built-ins get, because that projection is a bundle-size measure and
 * cannot run over a schema this package has never seen. The practical difference is
 * only weight: `validateAgainstSchema` ignores every keyword it does not implement, so
 * a custom schema is checked to exactly the same depth as a built-in, with the same
 * NOT_ENFORCED gaps (no `allOf`/`anyOf`/`oneOf`/`if`, no `$ref`, no
 * `additionalProperties`, no `format`).
 */
export function validateCardData(
  type: string,
  data: unknown,
  schemas?: Readonly<Record<string, JsonSchema>>,
): CardValidationReport | null {
  const schema = schemaFor(type, schemas);
  if (schema === null) return null;
  const result = validateAgainstSchema(schema, data);
  if (result.valid) return { ok: true, tier: 'ok', issues: [], hard: [], summary: '' };

  const issues: CardValidationIssue[] = result.issues.map((issue) => ({
    ...issue,
    tier: TIER_BY_KEYWORD[issue.keyword] ?? DEFAULT_TIER,
  }));
  const hard = issues.filter((i) => i.tier === 'hard');
  return {
    ok: false,
    tier: hard.length > 0 ? 'hard' : 'soft',
    issues,
    hard,
    summary: summarize(hard.length > 0 ? hard : issues),
  };
}

/**
 * The message both native dispatchers put on the `error` CardEvent.
 *
 * Spelled once, here, and prefixed `invalid card data:` to match what
 * provider-runtime.ts already emits for the remote transport, so a consumer's
 * `policy.onError` sees the same string shape regardless of which transport the card
 * arrived through.
 */
export function cardValidationMessage(report: CardValidationReport): string {
  return `invalid card data (${report.tier}): ${report.summary}`;
}

/** Exposed for the tier-coverage test, which asserts it against the validator. */
export const TIERS_BY_KEYWORD = TIER_BY_KEYWORD;
