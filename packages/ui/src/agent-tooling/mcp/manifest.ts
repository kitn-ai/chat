/**
 * manifest.ts — reads dist/custom-elements.json (a Custom Elements Manifest)
 * and exposes helpers for the component_reference tool.
 *
 * Resolution strategy (dual-context):
 *  1. Bundled bin: dist/mcp.es.js lives in dist/, so custom-elements.json is
 *     a sibling → try ./custom-elements.json relative to import.meta.url.
 *  2. Vitest (source): manifest.ts lives in src/agent-tooling/mcp/, so we walk
 *     up parent directories looking for <dir>/dist/custom-elements.json.
 *
 * It also answers "which of these 80 elements has anything to do with cards", for
 * the card contract component_reference serves. That question lives HERE rather than
 * in reference.ts because it is a question about the element manifest — it is
 * answered by crossing the card types against the tag list this module already owns
 * — and because both halves of the answer must come off one derivation. See
 * `cardTagForType` for the rule and for what happens when an eighth card type lands.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
// The package's own public entry, by the same specifier the scaffolder tells a
// consumer's route to use. Not a relative import of src/schemas/index.ts, and that
// is forced rather than chosen: that barrel re-exports src/schemas/registry.ts,
// which type-imports `CardTagMap` from src/primitives/card-registry.TSX. Pulling a
// .tsx into this pass means giving tsconfig.mcp.json `jsx` + `jsxImportSource` + the
// DOM lib, which drags the whole Solid component tree into a Node-only project —
// measured on this tree as 0 errors -> 1364. The built entry resolves to
// dist/schemas/index.d.ts, whose own reference to card-registry is a .d.ts that
// skipLibCheck skips, so the Node/no-DOM guarantee survives intact.
//
// This costs a build before typecheck and before the unit suite. That is not a new
// dependency: resolveManifestPath() below already requires dist/custom-elements.json,
// and CI already runs `nx build ui` ahead of both.
import { cardSchemaNames } from '@kitn.ai/ui/schemas';

// ── CEM types ────────────────────────────────────────────────────────────────

export interface CemType {
  text: string;
}

export interface CemMember {
  kind: 'field' | 'method';
  privacy?: 'public' | 'private' | 'protected';
  name: string;
  type?: CemType;
  description?: string;
}

export interface CemAttribute {
  name: string;
  fieldName?: string;
  type?: CemType;
  description?: string;
}

export interface CemEvent {
  name: string;
  type?: CemType;
  description?: string;
}

export interface CemCssProperty {
  name: string;
  description?: string;
  default?: string;
}

export interface CemSlot {
  name: string;
  description?: string;
}

export interface CemCssPart {
  name: string;
  description?: string;
  /** Our extension: a copy-paste styling example. */
  recipe?: string;
}

export interface Declaration {
  tagName?: string;
  name: string;
  kind: string;
  description?: string;
  members?: CemMember[];
  attributes?: CemAttribute[];
  events?: CemEvent[];
  cssProperties?: CemCssProperty[];
  slots?: CemSlot[];
  cssParts?: CemCssPart[];
}

interface CemModule {
  path?: string;
  declarations?: Declaration[];
}

interface CustomElementsManifest {
  modules: CemModule[];
}

// ── Manifest resolution ───────────────────────────────────────────────────────

function resolveManifestPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // 1. Bundled bin: sibling in the same directory
  const sibling = join(thisDir, 'custom-elements.json');
  if (existsSync(sibling)) {
    return sibling;
  }

  // 2. Source/Vitest: walk up parent directories looking for dist/custom-elements.json
  let dir = thisDir;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'dist', 'custom-elements.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  throw new Error(
    `Could not find custom-elements.json. Searched from: ${thisDir}`,
  );
}

// ── Parsed manifest (module-level cache) ─────────────────────────────────────

let _manifest: CustomElementsManifest | undefined;

function getManifest(): CustomElementsManifest {
  if (!_manifest) {
    const path = resolveManifestPath();
    const raw = readFileSync(path, 'utf-8');
    _manifest = JSON.parse(raw) as CustomElementsManifest;
  }
  return _manifest;
}

function getDeclarations(): Declaration[] {
  return getManifest().modules.flatMap((m) => m.declarations ?? []);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the Declaration for a given custom-element tag, or undefined. */
export function getElement(tag: string): Declaration | undefined {
  return getDeclarations().find((d) => d.tagName === tag);
}

/** Returns all custom-element tagNames, sorted alphabetically. */
export function listElements(): string[] {
  return getDeclarations()
    .filter((d) => d.tagName)
    .map((d) => d.tagName!)
    .sort();
}

// ── Which elements have anything to do with cards ────────────────────────────
//
// Two different populations, and conflating them would be the "attaches card
// material to everything" failure:
//
//   CARD-BACKED   kai-confirm, kai-choice, …  — one element per CardEnvelope.type.
//                 These get a schema and a generated tool definition.
//   CARD HOST     kai-chat, kai-message, …    — the elements that RENDER a thread of
//                 cards and therefore carry the `cardTypes` / `cardSchemas` props.
//                 These get the wiring note, not a schema.
//
// Neither list is written down here. Both are derived, so an eighth card type is
// covered the day it lands rather than the day someone remembers this file.

/** Cached derivations. Same lifetime as the parsed manifest above. */
let _cardTags: Map<string, string> | undefined;
let _cardHosts: string[] | undefined;

/**
 * `CardEnvelope.type` -> the `kai-*` element that renders it.
 *
 * WHY THIS IS DERIVED AND NOT IMPORTED. The authoritative map is
 * `BUILTIN_CARD_TAGS` in src/primitives/card-registry.tsx, and it is pure data —
 * `Record<string, string>`, no Solid in it. It is unreachable from here anyway,
 * because it shares a module with `BUILTIN_CARD_COMPONENTS`, which is nothing but
 * Solid components, and this is a Node process with no DOM. Splitting the tag map
 * out so it could be exported from `@kitn.ai/ui/schemas` is the real fix and it is
 * a change to files this task does not own; until then, this derives.
 *
 * THE RULE. For card type `t`, the tag is `kai-<t>` when that element exists, else
 * the single element whose tag starts `kai-<t>-`. Measured against all 80 tags on
 * this tree, that resolves all seven built-ins with no collisions and no misses,
 * including the one that is not a plain concatenation: `link` -> `kai-link-preview`.
 *
 * WHEN IT BREAKS, IT BREAKS LOUDLY. A card type with no tag, or an ambiguous one
 * (a future `kai-form-field` would give `form` two prefix candidates), returns
 * undefined rather than guessing — and reference.test.ts asserts every member of
 * `cardSchemaNames` resolves, so the eighth card type fails a test instead of
 * silently losing its schema in the reference.
 */
export function cardTagForType(type: string): string | undefined {
  if (!_cardTags) {
    const tags = listElements();
    const present = new Set(tags);
    _cardTags = new Map<string, string>();
    for (const name of cardSchemaNames) {
      const exact = `kai-${name}`;
      if (present.has(exact)) {
        _cardTags.set(name, exact);
        continue;
      }
      const prefixed = tags.filter((t) => t.startsWith(`${exact}-`));
      if (prefixed.length === 1) _cardTags.set(name, prefixed[0]);
    }
  }
  return _cardTags.get(type);
}

/** The inverse: which card type does this element render, if any. */
export function cardTypeForTag(tag: string): string | undefined {
  for (const name of cardSchemaNames) {
    if (cardTagForType(name) === tag) return name;
  }
  return undefined;
}

/**
 * The elements that host a thread of cards, derived from the manifest: an element is
 * a card host exactly when it declares the `cardSchemas` prop.
 *
 * That prop is the one that carries a developer's own card schemas into the browser
 * validator, so "declares it" and "hosts cards" are the same fact rather than two
 * facts that can disagree. Today it selects kai-chat / kai-message / kai-thread /
 * kai-workspace; an element that grows the prop tomorrow joins without an edit here.
 */
export function cardHostTags(): string[] {
  if (!_cardHosts) {
    _cardHosts = getDeclarations()
      .filter(
        (d) =>
          d.tagName !== undefined &&
          (d.members ?? []).some(
            (m) => m.kind === 'field' && m.privacy === 'public' && m.name === 'cardSchemas',
          ),
      )
      .map((d) => d.tagName!)
      .sort();
  }
  return _cardHosts;
}
