// The inverse of `cardTools()`: a model's tool call back into a renderable card.
//
// This is the one line a developer adds to their tool loop:
//
//   for (const call of pending) {
//     const card = cardFromToolCall(call.name, call.input ?? {}, { id: call.id });
//     if (card) {
//       stream.addCard(card);
//       applyToolOutput(stream, call.id, { status: 'awaiting_user' });
//       continue;
//     }
//     applyToolOutput(stream, call.id, await runTool(call.name, call.input ?? {}));
//   }
//
// It replaces the hand-written mapper this repo's own reference harness carries
// (examples/internal/openrouter-spike/src/tools.ts:471-500), whose comment says the
// model cannot emit a CardEnvelope directly because the schemas are unreachable.
// They are reachable now (./index.ts), so the mapper does not need to exist.
//
// RUNTIME-FREE, DELIBERATELY
// --------------------------
// One type import, which erases. No DOM, no Solid, no validator, no schema data.
// This is imported by a backend route inside a tool loop, so it must weigh nothing
// and must not drag `cardSchemas` in behind it.
//
//
// THE TWO DESIGN CALLS, AND WHY
// =============================
//
// 1. THE TOOL NAME CARRIES `type`; THE `tool_call_id` CARRIES `id`.
//
// `kai_confirm` produces `{ type: 'confirm' }`, and the provider's `tool_call_id`
// becomes `CardEnvelope.id` unchanged. The id is not a detail: it is already unique
// per call, and it is already the key `upsertCardPart` (src/state/parts.ts:172)
// matches on. So a model that revises a card re-sends the same tool call id, and
// `AssistantStream.addCard` replaces that card in place instead of rendering a
// second copy of it. Generating an id here would break that for free, which is what
// the spike's `card-${++cardSeq}` does today.
//
// 2. `kai_` DECIDES "CARD TOOL". IT DOES NOT DECIDE "RENDERABLE".
//
// Two questions get asked about a `kai_*` call, and they are answered in two places
// on purpose:
//
//   "is this a card tool at all?"   -> here, from the prefix. Returns null if not,
//                                      so the loop's `if (card)` falls through to
//                                      the app's own tools. Never throws: an unknown
//                                      tool name is ordinary, not exceptional.
//
//   "can this card render / is the  -> the DISPATCHER. An unregistered type already
//    data well-formed?"                renders `CardFallback` and emits
//                                      `{ kind: 'error', cardId }`
//                                      (components/card-renderer.tsx:33-42), and
//                                      T1.5 adds the same treatment for data that
//                                      does not match its schema, mirroring
//                                      remote/provider-runtime.ts:142.
//
// So this module has no validator and must not grow one. Two consequences, both
// intentional:
//
//   - A type the kit does not know (`kai_pricing-table`) still produces an envelope.
//     Gating on the 7 built-ins instead would send a custom card type, registered
//     perfectly legally through `cardTypes`/`mergeCardTags`, to
//     `runTool('kai_pricing-table')` which no app implements, and the card would
//     vanish with no diagnostic anywhere. The permissive read costs nothing, because
//     a genuinely unknown type is named on screen by the fallback.
//
//   - Malformed `data` still produces an envelope. Returning null would be
//     indistinguishable from "not a card tool" and would misroute the call to
//     `runTool`; throwing would kill the whole turn, including the sibling tool calls
//     in the same batch, for what the plan explicitly treats as a PRODUCTION failure
//     mode. Keeping the envelope keeps the bad data attributable to the tool call
//     that produced it, which is what lets the app hand the diagnostic back to the
//     model, and the model's corrected retry then upserts over the broken card
//     because it reuses the same tool call id. That healing only works if the
//     malformed call produced an envelope in the first place.
//
// `isCardTool` and `cardFromToolCall` are derived from ONE decision function below,
// rather than each testing the prefix, so they cannot drift into disagreeing about
// the same question.

import type { CardEnvelope } from '../primitives/card-contract';

/**
 * The tool-name prefix that marks a card tool.
 *
 * Prefixed so a developer's own `confirm` tool cannot collide with ours, and
 * exported as a value so `cardTools()` names its tools from here instead of
 * restating the literal. A prefix written in two places is a prefix that can drift.
 */
export const KAI_TOOL_PREFIX = 'kai_';

/**
 * The card type a tool name denotes, or `null` if the name is not a card tool.
 *
 * The single decision both public predicates below are derived from. The remainder
 * after the prefix is used verbatim: card types may contain hyphens
 * (`kai_pricing-table` -> `pricing-table`), and both providers accept
 * `[a-zA-Z0-9_-]` in a tool name, so there is nothing to translate. Matching is
 * case-sensitive, because tool names are.
 */
export function cardTypeFromToolName(name: string): string | null {
  if (!name.startsWith(KAI_TOOL_PREFIX)) return null;
  const type = name.slice(KAI_TOOL_PREFIX.length);
  return type.length > 0 ? type : null;
}

/** The tool name for a card type. The exact inverse of {@link cardTypeFromToolName}. */
export function toolNameForCardType(type: string): string {
  return `${KAI_TOOL_PREFIX}${type}`;
}

/**
 * Is this tool call a card, rather than one of the app's own tools?
 *
 * True for any `kai_`-prefixed name with a non-empty remainder. It does NOT claim
 * the type is registered or the data is valid; see the module header for why those
 * are the dispatcher's questions.
 */
export function isCardTool(name: string): boolean {
  return cardTypeFromToolName(name) !== null;
}

/**
 * Turn a model's tool call into a `CardEnvelope`, or `null` if it is not a card tool.
 *
 * @param name  the tool name the model called, e.g. `kai_confirm`
 * @param input the tool arguments, used verbatim as `CardEnvelope.data`
 * @param opts.id the provider's `tool_call_id`, used verbatim as `CardEnvelope.id`
 *
 * `data` is the input as given: the tool's input schema IS the card-data schema that
 * `cardTools()` handed the model, so the mapping is identity and nothing is peeled,
 * renamed or defaulted. In particular no `title` is set. `CardEnvelope.title` is
 * chrome the host owns and no card-data schema offers the model one (`confirm`
 * deliberately calls its in-body heading `heading` and says so in its description),
 * so a caller who wants a title writes `{ ...card, title }`.
 *
 * Never throws.
 */
export function cardFromToolCall(
  name: string,
  input: unknown,
  opts: { id: string },
): CardEnvelope | null {
  const type = cardTypeFromToolName(name);
  if (type === null) return null;
  // `undefined` is the only value here that cannot have come off the wire (a model
  // calling a tool with no arguments), so it is the only one normalised. `null` is
  // real JSON and is passed through for the validator to complain about.
  return { type, id: opts.id, data: input === undefined ? {} : input };
}
