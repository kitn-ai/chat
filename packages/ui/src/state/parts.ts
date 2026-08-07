import type { MessagePart, RawOrigin } from '../elements/chat-types';
import type { ToolPart } from '../components/tool-types';
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
  label?: string;
  signature?: string;
  raw?: RawOrigin;
}

/** Keyed by block index so parallel reasoning blocks stay distinct. */
export function appendReasoningPart(
  parts: MessagePart[],
  delta: string,
  opts: ReasoningOpts = {},
): MessagePart[] {
  const index = opts.index ?? 0;
  const i = parts.findIndex((p) => p.type === 'reasoning' && (p.index ?? 0) === index);
  if (i < 0) {
    return [...parts, { type: 'reasoning', text: delta, index, label: opts.label, signature: opts.signature, raw: opts.raw }];
  }
  const cur = parts[i] as Extract<MessagePart, { type: 'reasoning' }>;
  const next: MessagePart = {
    ...cur,
    text: cur.text + delta,
    label: opts.label ?? cur.label,
    signature: opts.signature ?? cur.signature,
    raw: opts.raw ?? cur.raw,
  };
  return [...parts.slice(0, i), next, ...parts.slice(i + 1)];
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
  if (fingerprint(merged) === fingerprint(cur)) return parts;
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
