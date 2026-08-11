import type { MessagePart, RawOrigin } from '../elements/chat-types';
import type { ToolPart } from '../components/tool-types';
import type { CardEnvelope } from '../primitives/card-contract';
import { classifyTool } from '../components/tool-classify';

/** Stable structural fingerprint. Key order independent, so an identical snapshot
 *  arriving twice compares equal and can be skipped. */
export function fingerprint(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) return '[circular]';
    seen.add(v as object);
    const o = v as Record<string, unknown>;
    const out = Array.isArray(v)
      ? v.map(walk)
      : Object.fromEntries(Object.keys(o).sort().map((k) => [k, walk(o[k])]));
    seen.delete(v as object);
    return out;
  };
  return JSON.stringify(walk(value)) ?? '';
}

/** Appends to the trailing text part, or OPENS A NEW ONE if the last part is not
 *  text. This is what stops a post-tool answer being glued onto the pre-tool text. */
export function appendTextPart(parts: MessagePart[], delta: string): MessagePart[] {
  const last = parts[parts.length - 1];
  if (last?.type === 'text') {
    return [...parts.slice(0, -1), { ...last, text: last.text + delta }];
  }
  return [...parts, { type: 'text', text: delta }];
}

export interface ReasoningOpts {
  index?: number;
  /** Namespaces `index` to one provider response stream. Producers that read more
   *  than one stream into the SAME message must set it. See `appendReasoningPart`. */
  streamId?: string;
  label?: string;
  signature?: string;
  raw?: RawOrigin;
}

type ReasoningPart = Extract<MessagePart, { type: 'reasoning' }>;

/** Keyed by `(streamId, index)` so parallel reasoning blocks stay distinct.
 *
 *  WHY THE KEY IS A PAIR. A block index alone is NOT unique inside one `parts`
 *  array. Anthropic numbers content blocks per MESSAGE and restarts at 0 on the
 *  next one, while a tool loop folds every round into a single assistant turn.
 *  Keyed on index alone, round 2's thinking block (index 0) merges into round 1's
 *  part: the text concatenates and `raw: opts.raw ?? cur.raw` OVERWRITES round 1's
 *  verbatim provider payload with round 2's. `toAnthropicMessages` then emits one
 *  thinking block where two belong, carrying round 2's signature in round 1's
 *  position -- a modified-and-filtered thinking block, which is exactly the 400
 *  the verbatim `raw` channel exists to prevent.
 *
 *  `streamId` is the namespace: one value per provider response stream, attached
 *  by `consumeModelStream`. Two rounds are two streams, so their index 0s are two
 *  parts. Producers that drive a sink from a single stream can omit it; `undefined`
 *  is its own namespace and behaves exactly as before.
 *
 *  Returns the SAME array reference when the merge produces an identical part,
 *  for the same reason `upsertToolPart` does: a new `parts` array is the
 *  re-render signal, so handing one back for a delta that changed nothing is a
 *  spurious render.
 *
 *  An EMPTY delta is not a no-op and must still reach here: it is how a redacted
 *  reasoning block, a `signature_delta` and an assembled `content_block_stop`
 *  block arrive, and how a format opens a block at the right position so block
 *  ORDER survives into `parts`. Those carry a new `raw`/`signature`/index and so
 *  compare unequal and DO rebuild. What the check absorbs is the other empty
 *  frame: one carrying nothing new, which a provider is free to send repeatedly.
 *
 *  `signature` and `raw` resolve with `??`, so an explicit `undefined` from a
 *  later delta never blanks a value an earlier one established. Pass a DEFINED
 *  value to replace either; there is no way to clear them. */
export function appendReasoningPart(
  parts: MessagePart[],
  delta: string,
  opts: ReasoningOpts = {},
): MessagePart[] {
  const index = opts.index ?? 0;
  const streamId = opts.streamId;
  const i = parts.findIndex(
    (p) => p.type === 'reasoning' && (p.index ?? 0) === index && p.streamId === streamId,
  );
  if (i < 0) {
    return [...parts, { type: 'reasoning', text: delta, index, streamId, label: opts.label, signature: opts.signature, raw: opts.raw }];
  }
  const cur = parts[i] as ReasoningPart;
  const next: ReasoningPart = {
    ...cur,
    text: cur.text + delta,
    label: opts.label ?? cur.label,
    signature: opts.signature ?? cur.signature,
    raw: opts.raw ?? cur.raw,
  };
  if (reasoningEqual(cur, next)) return parts;
  return [...parts.slice(0, i), next, ...parts.slice(i + 1)];
}

/** Every `ReasoningPart` key, in the order `reasoningEqual` checks them. Same
 *  exhaustive-by-construction contract as `TOOL_KEYS` below: adding a field to
 *  the `reasoning` variant of `MessagePart` fails the build until it is listed
 *  here AND given a comparator, so a new field can never be silently ignored by
 *  the dedupe check and strand a stale array reference. */
const REASONING_KEYS = [
  'type', 'text', 'index', 'streamId', 'label', 'signature', 'raw',
] as const satisfies readonly (keyof ReasoningPart)[];

type _ReasoningKeysExhaustive = Exclude<
  keyof ReasoningPart,
  (typeof REASONING_KEYS)[number]
> extends never
  ? true
  : ['MessagePart reasoning variant has a key missing from REASONING_KEYS', Exclude<keyof ReasoningPart, (typeof REASONING_KEYS)[number]>];
const _reasoningKeysExhaustive: _ReasoningKeysExhaustive = true;
void _reasoningKeysExhaustive;

/** One comparator per key in `REASONING_KEYS`. The mapped type means a key added
 *  to that list with no comparator here is ALSO a compile error.
 *
 *  `raw` compares by REFERENCE, exactly as `TOOL_COMPARATORS.raw` does: it is the
 *  untranslated provider payload, a producer attaches it once, and
 *  `appendReasoningPart` itself carries it forward when a delta omits it, so
 *  reference equality holds on every real path. Hashing it would walk the whole
 *  payload on every empty keep-alive frame, which is the cost this check exists
 *  to avoid. Worst case is a producer handing over a fresh-but-equal `raw`: one
 *  extra re-render, never a wrong render. */
const REASONING_COMPARATORS: {
  [K in (typeof REASONING_KEYS)[number]]: (a: ReasoningPart, b: ReasoningPart) => boolean;
} = {
  type: (a, b) => a.type === b.type,
  text: (a, b) => a.text === b.text,
  index: (a, b) => a.index === b.index,
  streamId: (a, b) => a.streamId === b.streamId,
  label: (a, b) => a.label === b.label,
  signature: (a, b) => a.signature === b.signature,
  raw: (a, b) => a.raw === b.raw,
};

function reasoningEqual(a: ReasoningPart, b: ReasoningPart): boolean {
  return REASONING_KEYS.every((key) => REASONING_COMPARATORS[key](a, b));
}

type CardPart = Extract<MessagePart, { type: 'card' }>;

/** Creates or REPLACES a card part, keyed on `envelope.id`. Returns the SAME array
 *  reference when the incoming envelope is structurally identical to the current
 *  one, for the same reason `upsertToolPart` does: a new `parts` array is the
 *  re-render signal, so handing one back for a revision that changed nothing is a
 *  spurious render.
 *
 *  WHY THIS REPLACES WHERE `upsertToolPart` MERGES. A tool part is patched
 *  fragment-by-fragment as its arguments stream in, which is why that function
 *  needs carry-forward rules for `raw` and `kind` — a later patch that omits a
 *  field is not asserting the field is gone. A card envelope is the opposite: it
 *  arrives WHOLE, as one complete tool result, so an omitted field IS an
 *  assertion. Last-write-wins is both simpler and the only semantics under which
 *  a host can CLEAR `resolution` to re-open a dismissed card — a field-by-field
 *  merge can only ever set that field, never unset it, so `CardPolicy.onReopen`
 *  (see `primitives/card-contract.ts`) would have no way to express its result.
 *
 *  The PART-level `raw` is preserved across a revision. It is a different field
 *  from anything inside the envelope: the untranslated provider payload the part
 *  was built from, attached once by the producer, which a fresh envelope carries
 *  no opinion about.
 *
 *  Position is preserved: a revised card stays where it first appeared in the
 *  thread rather than jumping past the text that followed it. */
export function upsertCardPart(parts: MessagePart[], envelope: CardEnvelope): MessagePart[] {
  const i = parts.findIndex((p) => p.type === 'card' && p.envelope.id === envelope.id);
  if (i < 0) return [...parts, { type: 'card', envelope }];
  const cur = parts[i] as CardPart;
  if (fingerprint(cur.envelope) === fingerprint(envelope)) return parts;
  return [...parts.slice(0, i), { ...cur, envelope }, ...parts.slice(i + 1)];
}

/** Creates or merges a tool part. Returns the SAME array reference when the merge
 *  produces an identical tool, so repeated snapshots do not trigger a re-render.
 *
 *  Two fields do NOT follow plain spread semantics, because a streaming provider
 *  hands them over on one fragment and then keeps patching the rest:
 *  - `kind`: a value the consumer set is preserved across later patches instead
 *    of being reverted to `classifyTool(type)` (see `resolveKind`).
 *  - `raw`: an explicit `raw: undefined` never blanks a `raw` an earlier patch
 *    established. Pass a DEFINED `raw` to replace it; there is no way to clear it. */
export function upsertToolPart(
  parts: MessagePart[],
  toolCallId: string,
  patch: Partial<ToolPart>,
): MessagePart[] {
  const i = parts.findIndex((p) => p.type === 'tool' && p.tool.toolCallId === toolCallId);
  if (i < 0) {
    const tool: ToolPart = {
      type: patch.type ?? 'unknown',
      state: patch.state ?? 'input-streaming',
      ...patch,
      toolCallId,
    };
    tool.kind = tool.kind ?? classifyTool(tool.type);
    return [...parts, { type: 'tool', tool }];
  }
  const cur = (parts[i] as Extract<MessagePart, { type: 'tool' }>).tool;
  const merged: ToolPart = { ...cur, ...patch, toolCallId };
  merged.kind = resolveKind(cur, patch, merged.type);
  if (merged.raw === undefined && cur.raw !== undefined) merged.raw = cur.raw;
  if (toolsEqual(cur, merged)) return parts;
  return [...parts.slice(0, i), { type: 'tool', tool: merged }, ...parts.slice(i + 1)];
}

/** `kind` precedence on an update, in order:
 *  1. an explicit `patch.kind` always wins;
 *  2. a `kind` the consumer set that is NOT merely the auto-derivation of the
 *     current `type` is preserved. Create honors `patch.kind`, so an update must
 *     not silently revert a custom classification mid-stream (a tool created as
 *     `{ type: 'my_widget_tool', kind: 'mcp' }` stays `mcp` after a plain
 *     `{ state: 'output-available' }` patch);
 *  3. otherwise re-derive from the merged `type`, so a tool whose real name only
 *     arrives in a later fragment still classifies (the streaming path: created
 *     as `unknown`/`generic`, patched to `web_search` -> `search`).
 *
 *  A consumer `kind` that happens to equal `classifyTool(type)` is
 *  indistinguishable from the derived one, which is harmless: they agree until
 *  the `type` changes, and then re-deriving is the better answer anyway. */
function resolveKind(cur: ToolPart, patch: Partial<ToolPart>, nextType: string): ToolPart['kind'] {
  if (patch.kind !== undefined) return patch.kind;
  const derived = cur.kind === undefined || cur.kind === classifyTool(cur.type);
  return derived ? classifyTool(nextType) : cur.kind;
}

/** Every `ToolPart` key, in the order `toolsEqual` checks them (cheap identity
 *  checks first, the two fingerprint-based checks last). See `ToolPart` in
 *  `components/tool-types.ts`, which points back here.
 *
 *  This is not just documentation: `_toolKeysExhaustive` below fails to compile
 *  if `ToolPart` gains a key that is not listed here, and `TOOL_COMPARATORS`
 *  fails to compile if this list gains a key with no comparator. Adding a field
 *  to `ToolPart` without wiring it into both is a BUILD failure, not a silently
 *  stale array reference. */
const TOOL_KEYS = [
  'type', 'state', 'kind', 'toolCallId', 'errorText', 'rawInput', 'raw', 'input', 'output',
] as const satisfies readonly (keyof ToolPart)[];

// If `ToolPart` gains a key absent from `TOOL_KEYS`, `Exclude<...>` stops being
// `never`, the assigned literal type no longer matches `true`, and `tsc` reports
// the offending key name right here.
type _ToolKeysExhaustive = Exclude<keyof ToolPart, (typeof TOOL_KEYS)[number]> extends never
  ? true
  : ['ToolPart has a key missing from TOOL_KEYS', Exclude<keyof ToolPart, (typeof TOOL_KEYS)[number]>];
const _toolKeysExhaustive: _ToolKeysExhaustive = true;
void _toolKeysExhaustive;

/** One comparator per key in `TOOL_KEYS`. The mapped type over
 *  `(typeof TOOL_KEYS)[number]` means a key added to `TOOL_KEYS` with no
 *  comparator here is ALSO a compile error ("Property 'x' is missing"), so the
 *  guard reaches the actual comparison, not just the key list.
 *
 *  Semantics are unchanged from before this table existed:
 *  - `raw` compares by REFERENCE on purpose. It is the untranslated provider
 *    payload; a producer attaches it once and never rebuilds it (upsertToolPart
 *    itself carries `cur.raw` forward when a patch omits it), so reference
 *    equality holds on every real path. Hashing it would walk the accumulated
 *    argument string a second time, which is the cost this table exists to
 *    remove. The worst case is a producer handing over a fresh-but-equal `raw`,
 *    which costs one extra re-render and never a wrong render.
 *  - `input` and `output` are the two fields that are genuinely object-shaped:
 *    reference equality first, then `fingerprint()` as a structural fallback so
 *    a fresh-but-identical object still dedupes.
 *  - everything else, including `rawInput`, compares with `===`. `rawInput`
 *    against `!==` is exactly the test we want (did the accumulated text
 *    change?) and it is cheap: two strings of different lengths are unequal
 *    after the length check, so it never walks the full string.
 *
 *  This replaces `fingerprint(merged) === fingerprint(cur)`, which serialized
 *  the ENTIRE ToolPart on every patch. A streaming tool call is patched once
 *  per argument fragment while `rawInput` grows toward the full argument JSON,
 *  so hashing the whole part per fragment is quadratic in the argument size:
 *  fine at 4 KB, not at 200 KB. */
const TOOL_COMPARATORS: { [K in (typeof TOOL_KEYS)[number]]: (a: ToolPart, b: ToolPart) => boolean } = {
  type: (a, b) => a.type === b.type,
  state: (a, b) => a.state === b.state,
  kind: (a, b) => a.kind === b.kind,
  toolCallId: (a, b) => a.toolCallId === b.toolCallId,
  errorText: (a, b) => a.errorText === b.errorText,
  rawInput: (a, b) => a.rawInput === b.rawInput,
  raw: (a, b) => a.raw === b.raw,
  input: (a, b) => a.input === b.input || fingerprint(a.input) === fingerprint(b.input),
  output: (a, b) => a.output === b.output || fingerprint(a.output) === fingerprint(b.output),
};

function toolsEqual(a: ToolPart, b: ToolPart): boolean {
  return TOOL_KEYS.every((key) => TOOL_COMPARATORS[key](a, b));
}
