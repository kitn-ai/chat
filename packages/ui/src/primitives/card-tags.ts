// src/primitives/card-tags.ts
// `CardEnvelope.type` -> the `kai-*` element that renders it. The authoritative map,
// and the ONLY place it is written down.
//
// WHY IT IS ALONE IN A `.ts`
// --------------------------
// It used to live in card-registry.tsx beside `BUILTIN_CARD_COMPONENTS`, which is
// nothing but Solid. The map itself has no Solid in it — it is `Record<string, string>`
// — but sharing a module with the component map meant no Node/no-DOM project could
// import it AS SOURCE, and the `kai` MCP server is exactly that: tsconfig.mcp.json is
// Node-only, `lib: ["ESNext"]`, no `jsx`. So mcp/mcp/manifest.ts
// RE-DERIVED each tag by convention (`kai-<type>`, else the single `kai-<type>-*`) —
// a second copy of a fact this repo already held, one that happened to agree.
//
// Relaxing tsconfig.mcp.json instead is not an option and was measured, not guessed:
// giving that project a `jsx` setting drags the Solid component tree into a Node-only
// pass and takes it from 0 errors to 1364. The Node/no-DOM boundary is load-bearing.
// Splitting the data out is the fix; this file is that split.
//
// Because it is plain data with no DOM and no Solid runtime below it,
// `@kitn.ai/ui/schemas` — the server-safe entry a backend route imports — re-exports
// it, so the MCP and any consumer route read the same map instead of guessing at it.
// card-registry.tsx re-exports everything here in turn, so every existing importer of
// `BUILTIN_CARD_TAGS` / `mergeCardTags` / `CardTagMap` is unaffected.
//
// WHAT THIS SPLIT DOES NOT DO, MEASURED
// -------------------------------------
// It does not change dist/schemas.js. Routing that entry's re-export back through
// card-registry.tsx yields a byte-identical bundle with zero `solid-js` references
// that imports clean under `node`: rollup compiles the Solid tree and discards it,
// since only the tag map is reachable. So no runtime guard tells the two apart, and
// this file must not be sold as one. What it changes is the dependency GRAPH — the
// server-safe entry no longer reaches the component tree at all, instead of reaching
// it and counting on tree-shaking to undo that. See src/schemas/index.ts.
//
// Built-ins cover the 7 contract card types; consumers extend/override via a `types`
// prop (merged OVER the built-ins). kai-card (bare shell) is intentionally NOT a target.

/** Web-component layer: envelope type → kai-* tag name. */
export type CardTagMap = Record<string, string>;

/**
 * The seven built-in card types and the element that draws each one.
 *
 * Note `link` → `kai-link-preview`: the one entry that is NOT `kai-<type>`, and the
 * reason inferring these from the tag list is a guess rather than a lookup.
 */
export const BUILTIN_CARD_TAGS: CardTagMap = {
  form: 'kai-form',
  confirm: 'kai-confirm',
  'tasks': 'kai-tasks',
  choice: 'kai-choice',
  link: 'kai-link-preview',
  embed: 'kai-embed',
  artifact: 'kai-artifact',
};

/** Built-ins with the consumer's overrides merged on top (consumer wins). */
export function mergeCardTags(types?: CardTagMap): CardTagMap {
  return types ? { ...BUILTIN_CARD_TAGS, ...types } : { ...BUILTIN_CARD_TAGS };
}
