/**
 * The construct ↔ form translation layer (B-21) plus the schema walk the
 * derived panel builds on (B-19) and the rule-id-keyed visibility registry
 * (B-20). The construct itself IS the form state — the panel is controlled
 * (value/onChange over a whole Construct, the same shape BuilderPanel
 * already uses), and this module supplies the path-based edits:
 *
 *  - presence-as-boolean: section on = object present, off = key DELETED —
 *    never `false`, never `{}` left behind;
 *  - delete-on-empty: an empty array/string deletes its key (the schema's
 *    own min(1) demands it), and an object emptied BY THAT DELETION is
 *    pruned too — but deleting an absent key is identity, so a no-op edit
 *    round-trips byte-identical (the test corpus is every registry starter);
 *  - default-anchored booleans: `capabilities.sources.strip` reads ON when
 *    absent (the kit default IS the on state, B-4); writes stay explicit —
 *    stating the default is legal and Research does it on purpose.
 *
 * Zod 4 notes: `.superRefine()` returns the schema class itself (no
 * ZodEffects wrapper), so `ConstructSchema.shape` is directly walkable;
 * optional/default wrappers unwrap via `def.innerType`.
 */
import { z } from 'zod';
import { ConstructSchema, type Construct } from '../agent-tooling/construct/schema';

// ── path get/set/delete ─────────────────────────────────────────────────────

export function getAtPath(construct: Construct, path: string): unknown {
  let cur: unknown = construct;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function setAtPath(construct: Construct, path: string, value: unknown): Construct {
  if (isEmptyValue(value)) return deleteAtPath(construct, path);
  const keys = path.split('.');
  const set = (node: Record<string, unknown>, i: number): Record<string, unknown> => {
    const key = keys[i];
    if (i === keys.length - 1) return { ...node, [key]: value };
    const child = node[key];
    const childObj =
      child !== null && typeof child === 'object' && !Array.isArray(child)
        ? (child as Record<string, unknown>)
        : {};
    return { ...node, [key]: set(childObj, i + 1) };
  };
  return set(construct as unknown as Record<string, unknown>, 0) as unknown as Construct;
}

export function deleteAtPath(construct: Construct, path: string): Construct {
  const keys = path.split('.');
  // Returns the SAME node when nothing changed (absent key: identity, no
  // phantom prune), undefined when the node emptied and should be pruned.
  const del = (node: Record<string, unknown>, i: number): Record<string, unknown> | undefined => {
    const key = keys[i];
    if (!(key in node)) return node;
    if (i === keys.length - 1) {
      const { [key]: _gone, ...rest } = node;
      return Object.keys(rest).length === 0 ? undefined : rest;
    }
    const child = node[key];
    if (child === null || typeof child !== 'object' || Array.isArray(child)) return node;
    const nextChild = del(child as Record<string, unknown>, i + 1);
    if (nextChild === child) return node;
    if (nextChild === undefined) {
      const { [key]: _empty, ...rest } = node;
      return Object.keys(rest).length === 0 ? undefined : rest;
    }
    return { ...node, [key]: nextChild };
  };
  const out = del(construct as unknown as Record<string, unknown>, 0);
  // The root can never empty: name/layout/provider are required and never
  // addressed by a form path's delete.
  return (out ?? construct) as unknown as Construct;
}

// ── presence-as-boolean ─────────────────────────────────────────────────────

/** Registered copy of the schema's z.literal(true) leaves; the drift check
 *  (derivePresenceBooleanPaths) fails a new presence-style key until it is
 *  translated here. */
export const PRESENCE_BOOLEAN_PATHS = [
  'capabilities.conversations',
  'home.recentConversation',
  'shell.commandPalette',
] as const;

export function readPresenceBoolean(c: Construct, path: string): boolean {
  return getAtPath(c, path) === true;
}

export function writePresenceBoolean(c: Construct, path: string, on: boolean): Construct {
  return on ? setAtPath(c, path, true) : deleteAtPath(c, path);
}

export function derivePresenceBooleanPaths(): string[] {
  const out: string[] = [];
  const visit = (node: z.ZodType, path: string[]): void => {
    const bare = unwrapSchema(node);
    if (bare instanceof z.ZodObject) {
      for (const [key, child] of Object.entries(bare.shape)) visit(child as z.ZodType, [...path, key]);
      return;
    }
    // Zod 4: ZodLiteral exposes its value set as `values` (a Set, not an array).
    if (bare instanceof z.ZodLiteral && (bare as z.ZodLiteral<boolean>).values?.has(true as never)) {
      out.push(path.join('.'));
    }
  };
  visit(ConstructSchema as unknown as z.ZodType, []);
  return out;
}

// ── default-anchored booleans (B-4) ─────────────────────────────────────────

export const ANCHORED_BOOLEAN_DEFAULTS: Record<string, boolean> = {
  // Absent = the strip renders (the kit default IS the on state).
  'capabilities.sources.strip': true,
};

export function readAnchoredBoolean(c: Construct, path: string): boolean {
  const v = getAtPath(c, path);
  return typeof v === 'boolean' ? v : (ANCHORED_BOOLEAN_DEFAULTS[path] ?? false);
}

export function writeAnchoredBoolean(c: Construct, path: string, next: boolean): Construct {
  return setAtPath(c, path, next);
}

// ── schema walk (B-19) ──────────────────────────────────────────────────────

export function unwrapSchema(node: z.ZodType): z.ZodType {
  let cur: z.ZodType = node;
  while (cur instanceof z.ZodOptional || cur instanceof z.ZodDefault) {
    cur = (cur.def as unknown as { innerType: z.ZodType }).innerType;
  }
  return cur;
}

export function schemaNodeAt(path: string): z.ZodType | undefined {
  let cur: z.ZodType | undefined = ConstructSchema as unknown as z.ZodType;
  for (const key of path.split('.')) {
    if (!cur) return undefined;
    const bare = unwrapSchema(cur);
    if (!(bare instanceof z.ZodObject)) return undefined;
    cur = (bare.shape as Record<string, z.ZodType | undefined>)[key];
  }
  return cur;
}

export type ControlKind =
  | { kind: 'enum'; options: readonly string[] }
  | { kind: 'boolean' }
  | { kind: 'presence' }
  | { kind: 'string' }
  | { kind: 'string-list' }
  | { kind: 'section'; keys: readonly string[] }
  | { kind: 'complex' };

export function controlKindFor(node: z.ZodType): ControlKind {
  const bare = unwrapSchema(node);
  if (bare instanceof z.ZodEnum) return { kind: 'enum', options: bare.options as readonly string[] };
  if (bare instanceof z.ZodBoolean) return { kind: 'boolean' };
  if (bare instanceof z.ZodLiteral) return { kind: 'presence' };
  if (bare instanceof z.ZodString) return { kind: 'string' };
  if (bare instanceof z.ZodArray) {
    const el = unwrapSchema((bare.def as unknown as { element: z.ZodType }).element);
    return el instanceof z.ZodString ? { kind: 'string-list' } : { kind: 'complex' };
  }
  if (bare instanceof z.ZodObject) return { kind: 'section', keys: Object.keys(bare.shape) };
  return { kind: 'complex' }; // discriminated unions (provider), records — override territory
}

// ── visibility registry (B-20) ──────────────────────────────────────────────

export type RuleVisibility =
  // `layout` is EXPLICIT and not inferred from `section`. The panel used to
  // compare the section id against the construct's layout name, which worked
  // only because the `widget` and `aside` sections happen to be NAMED after
  // their layouts. A `workSurface` section scoped to layout `split` breaks
  // that coincidence, so the scope is stated.
  | { treatment: 'hide-section'; section: string; layout: string }
  | { treatment: 'disable-with-reason'; path: string; reason: string }
  | { treatment: 'show-requires'; path: string }
  | { treatment: 'reject-only' };

/** Keyed by CROSS_FIELD_RULES ids — the key-set-equality test in
 *  construct-form-paths.test.ts fails a new superRefine rule until the
 *  builder classifies it here (B-20's drift guard). `reject-only` means the
 *  panel surfaces the rule only through validation problems (duplicates,
 *  URL-scheme rejections — states the panel's own editors cannot produce). */
export const RULE_VISIBILITY: Record<string, RuleVisibility> = {
  'slots-unique': { treatment: 'reject-only' },
  'custom-layout-needs-slots': { treatment: 'reject-only' },
  'split-pane-slot-collision': { treatment: 'reject-only' },
  'widget-layout-scope': { treatment: 'hide-section', section: 'widget', layout: 'widget' },
  'aside-layout-scope': { treatment: 'hide-section', section: 'aside', layout: 'aside' },
  'message-actions-unique': { treatment: 'reject-only' },
  'launcher-icon-url': { treatment: 'reject-only' },
  'empty-icon-url': { treatment: 'reject-only' },
  'reasoning-open-scope': {
    treatment: 'disable-with-reason',
    path: 'capabilities.reasoningOpen',
    reason: 'Only applies while Reasoning is Full — Compact and Off have no disclosure to open.',
  },
  'conversations-need-history': {
    treatment: 'disable-with-reason',
    path: 'capabilities.conversations',
    reason: 'Needs History set to Local or Endpoint — a conversation list needs somewhere to persist conversations.',
  },
  'home-link-urls': { treatment: 'reject-only' },
  'history-endpoint-url': { treatment: 'show-requires', path: 'capabilities.history.url' },
  'work-surface-layout-scope': { treatment: 'hide-section', section: 'workSurface', layout: 'split' },
  'work-surface-url': { treatment: 'reject-only' },
  'work-surface-code-url': { treatment: 'reject-only' },
  // Still `show-requires` on the SAME path after the 2026-08-30 ruling made
  // the coupling one-way: `workSurface.codeUrl` is the field with the
  // precondition (it needs `chrome.codeView` on). What changed is the reverse
  // — the toggle no longer requires the URL — so the panel can switch
  // `codeView` on with the URL blank and the Code tab renders its empty state.
  'work-surface-code-view': { treatment: 'show-requires', path: 'workSurface.codeUrl' },
};
