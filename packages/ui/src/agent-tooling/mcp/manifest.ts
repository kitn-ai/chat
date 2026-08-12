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
 * in reference.ts because half of it is a question about the element manifest — the
 * kit's own `type -> tag` map, crossed against the tag list this module already owns
 * — and because both halves of the answer must come off one place. See
 * `cardTagForType` for the rule and for what happens when an eighth card type lands.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
// The package's own public entry, by the same specifier the scaffolder tells a
// consumer's route to use. Not a relative import of src/schemas/index.ts, and that
// is forced rather than chosen: that barrel re-exports src/schemas/registry.ts,
// which type-imports `CardComponentMap` from src/primitives/card-registry.TSX.
// Pulling a .tsx into this pass means giving tsconfig.mcp.json `jsx` +
// `jsxImportSource` + the DOM lib, which drags the whole Solid component tree into a
// Node-only project — measured on this tree as 0 errors -> 1364. The built entry
// resolves to dist/schemas/index.d.ts, whose own reference to card-registry is a
// .d.ts that skipLibCheck skips, so the Node/no-DOM guarantee survives intact.
//
// `BUILTIN_CARD_TAGS` is the authoritative `CardEnvelope.type -> kai-* tag` map and
// arrives here as DATA, not a type. It is authored in src/primitives/card-tags.ts,
// which holds that map ALONE — no Solid below it — so it is readable from source by a
// Node/no-DOM project rather than only through this built entry. Before that split it
// shared a module with `BUILTIN_CARD_COMPONENTS` and this module re-derived it by
// convention instead; see `cardTagForType`.
//
// This costs a build before typecheck and before the unit suite. That is not a new
// dependency: resolveManifestPath() below already requires dist/custom-elements.json,
// and CI already runs `nx build ui` ahead of both.
import { BUILTIN_CARD_TAGS, cardSchemaNames } from '@kitn.ai/ui/schemas';

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
// Neither list is written down here. The host list is derived from the manifest; the
// card-backed one is the kit's own map, read rather than guessed at. Either way an
// eighth card type is covered the day it lands rather than the day someone remembers
// this file.

/** Cached derivations. Same lifetime as the parsed manifest above. */
let _cardTags: Map<string, string> | undefined;
let _cardHosts: string[] | undefined;

/**
 * `CardEnvelope.type` -> the `kai-*` element that renders it.
 *
 * THE MAP IS IMPORTED, NOT INFERRED. `BUILTIN_CARD_TAGS` is the same object
 * `<kai-cards>` dispatches on in the browser, reached here through
 * `@kitn.ai/ui/schemas`. This function used to RE-DERIVE it by convention — the tag
 * is `kai-<t>` when that element exists, else the single element whose tag starts
 * `kai-<t>-` — which was correct against all 80 tags on this tree, `link` ->
 * `kai-link-preview` included, and was still a second copy of a fact the repo already
 * held. The eighth card type is the one that would have broken it: any type whose tag
 * is neither `kai-<t>` nor the sole `kai-<t>-*` had to be noticed by a human, and a
 * future `kai-form-field` would have made `form` ambiguous on its own. A lookup has
 * neither failure mode.
 *
 * WHY IT IS STILL CROSSED AGAINST THE MANIFEST. The map is authoritative for the
 * ASSOCIATION; only the manifest knows what actually got registered. A tag in the map
 * with no element behind it (a rename that missed this file) would otherwise have
 * `component_reference` send a harness to an element that does not exist. Entries with
 * no registered element are dropped, so the answer is a real tag or nothing.
 *
 * WHEN IT BREAKS, IT BREAKS LOUDLY. reference.test.ts asserts every member of
 * `cardSchemaNames` resolves AND that what it resolves to is in `listElements()`, so a
 * card type missing from the map, or pointed at a tag nobody registered, fails a test
 * instead of silently losing its schema in the reference.
 */
export function cardTagForType(type: string): string | undefined {
  if (!_cardTags) {
    const present = new Set(listElements());
    _cardTags = new Map(Object.entries(BUILTIN_CARD_TAGS).filter(([, tag]) => present.has(tag)));
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
