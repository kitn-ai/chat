// Which execution path an acceptance run is allowed to take, as a PURE function.
//
// There are two paths and they land on two different invoices:
//
//   claude-code  Anthropic models, executed through the owner's Claude Code
//                subscription. Already paid for; no per-token bill.
//   openrouter   ONLY the models the owner has explicitly named. Metered, and
//                billed to a card.
//
// So this module REFUSES rather than reroutes. If an Anthropic-looking model is
// pointed at the OpenRouter path, that is not a typo to be helpfully corrected —
// correcting it silently would move real money and, worse, would make the
// `executionPath` recorded in the run ledger a lie about what happened. By this
// repo's own scope boundary (the kit decides HOW, the app decides WHETHER),
// spend is the owner's decision, and the corollary — decide loudly — makes a
// quiet reroute the worst available option.
//
// Nothing here performs a run, opens a socket or reads an API key. The transport
// is a separate seam (see acceptance-run.mjs); this file only answers "is this
// combination allowed, and which path is it".

// FROZEN, both lists, and this is a spend control rather than tidiness.
// `scripts/` is in no tsconfig program and `checkJs` is off, so tsc cannot see a
// `push` here: a planted `OPENROUTER_ALLOWED.push('openai/gpt-5')` produced zero
// type errors, routed an unauthorised model to the metered path, and the CLI
// then printed the widened list inside its own refusal message as though it were
// the authorised one. Freezing makes that a TypeError in strict mode (every ESM
// module is strict) at the moment of the push, instead of a silent invoice.

/** The two paths. An unrecognised label is a hard refusal, never a default. */
export const EXECUTION_PATHS = Object.freeze(/** @type {const} */ (['claude-code', 'openrouter']));

/**
 * Models the owner has named for the metered path. THIS IS AN ALLOWLIST, not a
 * denylist: a model that is not on it and is not Anthropic has no path, because
 * neither "charge the card" nor "use the subscription" is ours to assume.
 *
 * Kept as a literal on purpose — it is an owner's spending decision, not a fact
 * about the tree, so there is nothing in the repo to derive it from. Adding an
 * entry is the act of authorising it.
 */
export const OPENROUTER_ALLOWED = Object.freeze(/** @type {const} */ (['~deepseek/deepseek-v4-flash-latest']));

/** `~` is OpenRouter's floor-price prefix; it is not part of the model identity. */
const bare = (model) => String(model ?? '').trim().replace(/^~/, '');

/**
 * THE FORM THE LEDGER RECORDS AND COMPARISONS KEY ON.
 *
 * The decision already normalises (trim, drop `~`, lowercase) but the record
 * used to keep whatever was typed, so `Claude-Opus-5`, `claude-opus-5 ` and
 * `~claude-opus-5` produced three different ledger strings for one model and a
 * cross-run comparison silently treated them as three models. The raw spelling
 * is still kept beside it — this is a canonical form for grouping, not a claim
 * about what the operator wrote.
 */
export const canonicalModel = (model) => bare(model).toLowerCase();

/**
 * Anthropic by IDENTITY, checked segment by segment rather than with a substring
 * match, because both of the shapes that matter here embed the vendor mid-string:
 * `openrouter/anthropic/claude-sonnet-4` and the Bedrock-style
 * `us.anthropic.claude-opus-4`. A bare `includes('claude')` would over-match
 * ("claude-code-guide" is not a model), and a bare `startsWith('anthropic/')`
 * misses both.
 */
export function looksAnthropic(model) {
  const id = bare(model).toLowerCase();
  if (!id) return false;
  const segments = id.split('/').flatMap((s) => s.split('.'));
  return segments.some((s) => s === 'anthropic' || s === 'claude' || s.startsWith('claude-'));
}

/**
 * Exactly the owner-named entries, `~` prefix optional on either side.
 *
 * @param {string} model
 * @param {readonly string[]} [allowed] test-only injection; see routeModel
 */
export function isOpenRouterAllowed(model, allowed = OPENROUTER_ALLOWED) {
  const id = bare(model).toLowerCase();
  return allowed.some((m) => bare(m).toLowerCase() === id);
}

/**
 * @typedef {{ ok: true, path: 'claude-code' | 'openrouter', pathSource: 'explicit' | 'inferred', model: string, modelCanonical: string, rule: string }} RouteAllowed
 * @typedef {{ ok: false, rule: string, error: string }} RouteRefused
 * @typedef {RouteAllowed | RouteRefused} RouteDecision
 */

/**
 * The whole decision table, as data, so the refusals are as testable as the
 * approvals. `path` may be omitted ONLY where the model admits exactly one legal
 * path; the result then says `pathSource: 'inferred'` so the ledger records that
 * nobody typed it. An inference is still a decision, so callers print it.
 *
 * `allowed` exists ONLY so a test can supply a fixture list. It is not a
 * runtime affordance and no CLI passes it: the real list is frozen and widening
 * it is a commit. Why it is needed at all -- the ORDER of the two checks below
 * is a safety property (the Anthropic refusal is tested before the allow-list is
 * consulted), and with the real list that order is unobservable, because no
 * Anthropic model sits on it for a reordering to trip over. Hoisting an
 * allow-list success branch above the refusal left the whole suite green. A
 * fixture list that DOES contain one makes the ordering testable.
 *
 * @param {{ model?: string, path?: string, allowed?: readonly string[] }} input
 * @returns {RouteDecision}
 */
export function routeModel({ model, path, allowed: allowList = OPENROUTER_ALLOWED } = {}) {
  const id = String(model ?? '').trim();
  if (!id) {
    return {
      ok: false,
      rule: 'model-required',
      error: 'no model identifier was given. A run with no model recorded is not comparable to any other run, so there is nothing useful to do with it.',
    };
  }

  if (path !== undefined && !EXECUTION_PATHS.includes(/** @type {never} */ (path))) {
    return {
      ok: false,
      rule: 'unknown-path',
      error: `unknown execution path "${path}". The paths are ${EXECUTION_PATHS.join(' | ')}; an unrecognised label is refused rather than defaulted, because the default would be a spending decision made by a typo.`,
    };
  }

  // ORDER IS LOAD-BEARING BELOW, in a way that survived an adversarial review
  // and must not be "tidied":
  //
  //  1. The Anthropic refusal is tested BEFORE the allow-list is consulted, so
  //     widening OPENROUTER_ALLOWED can never open a metered path for an
  //     Anthropic model. The refusal does not depend on the list at all.
  //  2. The metered path additionally REQUIRES allow-list membership. So a
  //     model whose identity check is defeated -- a homoglyph, a zero-width
  //     joiner, a spelling nobody anticipated -- still cannot reach OpenRouter,
  //     because it will not be on the list either. An identity-check miss
  //     therefore cannot cause spend; it can only cause an over-refusal, which
  //     is the safe direction.
  const anthropic = looksAnthropic(id);
  const allowed = isOpenRouterAllowed(id, allowList);

  // THE HEADLINE RULE. Named explicitly in the error, because the whole point of
  // refusing is that the operator learns which rule stopped them.
  if (anthropic && path === 'openrouter') {
    return {
      ok: false,
      rule: 'anthropic-never-openrouter',
      error: `"${id}" is an Anthropic model and the openrouter path was selected. Anthropic models run through the owner's Claude Code subscription; OpenRouter is used only for the models the owner has named (${allowList.join(', ')}). This is REFUSED rather than rerouted: the two paths bill to different places, and quietly moving the run would also make the executionPath recorded in the ledger untrue. Re-run with --path claude-code, or name a different model.`,
    };
  }

  if (allowed && path === 'claude-code') {
    return {
      ok: false,
      rule: 'non-anthropic-never-claude-code',
      error: `"${id}" is not an Anthropic model, so it cannot run through the Claude Code subscription. Re-run with --path openrouter.`,
    };
  }

  if (anthropic) {
    return {
      ok: true,
      path: 'claude-code',
      pathSource: path === 'claude-code' ? 'explicit' : 'inferred',
      model: id,
      modelCanonical: canonicalModel(id),
      rule: 'anthropic-via-subscription',
    };
  }

  if (allowed) {
    return {
      ok: true,
      path: 'openrouter',
      pathSource: path === 'openrouter' ? 'explicit' : 'inferred',
      model: id,
      modelCanonical: canonicalModel(id),
      rule: 'owner-named-openrouter-model',
    };
  }

  if (path === 'openrouter') {
    return {
      ok: false,
      rule: 'openrouter-not-owner-named',
      error: `"${id}" is not one of the models the owner has named for OpenRouter (${allowList.join(', ')}). Metered spend is authorised by adding the model to OPENROUTER_ALLOWED in scripts/lib/run-routing.mjs, deliberately and in a commit — not by passing it on a command line.`,
    };
  }

  return {
    ok: false,
    rule: 'no-path-for-model',
    error: `"${id}" is neither an Anthropic model nor one of the owner-named OpenRouter models (${allowList.join(', ')}), so there is no path it may take. Neither "charge the card" nor "use the subscription" is this script's decision to make.`,
  };
}

/**
 * The imperative wrapper the CLIs use. Kept separate from `routeModel` so the
 * decision stays pure and the throw is the caller's, not the table's — a
 * refusal that a sloppy caller could ignore is exactly the silent-decision shape
 * this module exists to prevent, so the CLI path throws.
 *
 * @param {{ model?: string, path?: string }} input
 * @returns {RouteAllowed}
 */
export function assertRoute(input) {
  const decision = routeModel(input);
  if (!decision.ok) {
    const err = new Error(`routing refused [${decision.rule}]: ${decision.error}`);
    // @ts-expect-error -- a tag for callers that want the rule without parsing prose.
    err.rule = decision.rule;
    throw err;
  }
  return decision;
}
