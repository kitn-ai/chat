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
    if (Array.isArray(v)) return v.map(walk);
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, walk(o[k])]));
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
 *  produces an identical tool, so repeated snapshots do not trigger a re-render. */
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
  merged.kind = patch.kind ?? classifyTool(merged.type);
  if (fingerprint(merged) === fingerprint(cur)) return parts;
  return [...parts.slice(0, i), { type: 'tool', tool: merged }, ...parts.slice(i + 1)];
}
