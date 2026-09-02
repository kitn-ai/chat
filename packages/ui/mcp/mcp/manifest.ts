/**
 * manifest.ts — reads dist/custom-elements.json (a Custom Elements Manifest)
 * and exposes helpers for the component_reference tool.
 *
 * Resolution strategy (dual-context) — each context is an EXACT location, never a
 * search. See `resolveManifestPath` for why that distinction is the whole point:
 *  1. Bundled bin: dist/mcp.es.js lives in dist/, so custom-elements.json is
 *     a sibling → ./custom-elements.json relative to import.meta.url.
 *  2. Vitest (source): manifest.ts lives at <package>/src/agent-tooling/mcp/, so
 *     the manifest is <package>/dist/custom-elements.json and nowhere else.
 *
 * It also answers "which of these 80 elements has anything to do with cards", for
 * the card contract component_reference serves. That question lives HERE rather than
 * in reference.ts because half of it is a question about the element manifest — the
 * kit's own `type -> tag` map, crossed against the tag list this module already owns
 * — and because both halves of the answer must come off one place. See
 * `cardTagForType` for the rule and for what happens when an eighth card type lands.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
// The package's own public entry, by the same specifier the scaffolder tells a
// consumer's route to use. That is now a CHOICE, and this comment used to say the
// opposite: the barrel re-exports src/schemas/registry.ts, which type-IMPORTED
// `CardComponentMap` from src/primitives/card-registry.TSX, and pulling a .tsx into
// this pass would mean giving tsconfig.mcp.json `jsx` + `jsxImportSource` + the DOM
// lib, dragging the whole Solid component tree into a Node-only project — measured
// as 0 errors -> 1364. Those two types moved to the DOM-free
// src/primitives/card-component-types.ts, so a relative import of the barrel would
// typecheck here today. It stays on the public specifier anyway, because emitting
// and consuming the same string is the point of this module. The built entry
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
//
// THE MANIFEST IS THIS PACKAGE'S OWN BUILD ARTIFACT, SO IT IS ADDRESSED, NOT SEARCHED
// FOR. This used to walk up ten parent directories taking the first
// `<dir>/dist/custom-elements.json` it found, and that is a categorically weaker
// thing than it looks: "a custom-elements.json exists somewhere above me" and "THIS
// package's custom-elements.json exists" are different facts, and a walk-up cannot
// tell them apart. It reports success for both.
//
// It was not hypothetical. Measured from an agent git worktree at
// `<repo>/.claude/worktrees/<agent>/packages/ui/src/agent-tooling/mcp`, the loop
// climbed past the worktree's own (unbuilt) `packages/ui/dist`, out of the worktree
// entirely, and bound on iteration 8 to `<repo>/dist/custom-elements.json` — a
// leftover from the pre-monorepo layout, six weeks stale, 78 tags, and zero elements
// declaring `cardSchemas`. The consequence is this repo's dominant failure mode in
// its purest form: on an unbuilt tree the MCP manifest tests did not error, they
// PASSED, 16 of 17, against an artifact from a tree nobody was working in. Two
// checkouts could disagree about what they had tested and nothing said so.
//
// So the rule here is now: a missing manifest is a HARD FAILURE that names the path
// it expected. Never a fallback, never a wider search. If this throws, the answer is
// to build — not to let it find someone else's build.

const PACKAGE_NAME = '@kitn.ai/ui';
const MANIFEST_FILE = 'custom-elements.json';

/**
 * `<package>/src/agent-tooling/mcp` -> `<package>`. A fixed, exact hop, and it is
 * CHECKED below rather than trusted: if this module is ever moved to a different
 * depth the derived root stops being this package and resolution throws, instead of
 * silently addressing whatever directory happens to sit three levels up.
 */
const SOURCE_TO_PACKAGE_ROOT = ['..', '..', '..'] as const;

/** Is `root` the root of THIS package — not merely *a* directory holding a dist/? */
function isThisPackage(root: string): boolean {
  const manifest = join(root, 'package.json');
  if (!existsSync(manifest)) return false;
  try {
    return (JSON.parse(readFileSync(manifest, 'utf-8')) as { name?: string }).name === PACKAGE_NAME;
  } catch {
    return false;
  }
}

/**
 * Absolute path to this package's Custom Elements Manifest, or a throw naming what
 * it looked for.
 *
 * `fromDir` exists for the tests and defaults to this module's own directory. It is
 * the only way to write the check that matters: the guarantee is not "a manifest was
 * found", it is "THIS package's manifest was found", and the two only come apart
 * when there is a decoy above the origin. manifest.test.ts builds exactly that tree.
 */
export function resolveManifestPath(
  fromDir: string = dirname(fileURLToPath(import.meta.url)),
): string {
  // 1. Bundled bin: dist/mcp.es.js and dist/custom-elements.json are siblings.
  //    Unambiguous by construction — a sibling cannot be another checkout's artifact.
  const sibling = join(fromDir, MANIFEST_FILE);
  if (existsSync(sibling)) return sibling;

  // 2. Source (vitest, tsx): one exact location, derived and then verified.
  const packageRoot = resolve(fromDir, ...SOURCE_TO_PACKAGE_ROOT);
  const expected = join(packageRoot, 'dist', MANIFEST_FILE);

  if (!isThisPackage(packageRoot)) {
    throw new Error(
      `[${PACKAGE_NAME}] Cannot locate the Custom Elements Manifest: ${packageRoot} is not ` +
        `the ${PACKAGE_NAME} package root, so ${expected} would not be this package's ` +
        `manifest even if it existed.\n` +
        `Resolved from: ${fromDir}\n` +
        `This module must live at <package>/src/agent-tooling/mcp/ (or be bundled beside ` +
        `${MANIFEST_FILE} in dist/). Resolution deliberately does NOT search parent ` +
        `directories — finding some other checkout's manifest is worse than failing.`,
    );
  }

  if (!existsSync(expected)) {
    throw new Error(
      `[${PACKAGE_NAME}] Missing build artifact: ${expected}\n` +
        `Resolved from: ${fromDir}\n` +
        `The Custom Elements Manifest is generated by the build. Run \`nx build ui\` ` +
        `(or \`npm run build:api\` in packages/ui) and try again.\n` +
        `Resolution deliberately does NOT search parent directories: binding to a ` +
        `neighbouring checkout's manifest would make this succeed against stale data.`,
    );
  }

  return expected;
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

// ── Per-element entry map ─────────────────────────────────────────────────────
//
// A STATIC import, not an fs read off resolveManifestPath's dual-context pattern:
// element-manifest.json (unlike custom-elements.json) is never copied into dist/,
// so an fs read relative to this module's own URL would resolve in the vitest/source
// context and 404 in the bundled dist/mcp.es.js. A static import sidesteps the gap
// entirely — Rollup inlines the JSON at build time, so the bundled bin carries the
// data with no runtime file dependency. NAMED import (not the whole module), matching
// the same tradeoff element-diagnostics.ts already made for this file: a default
// import would pull `files` in too for 0 benefit here.
import { tags as ELEMENT_ENTRY_TAGS } from '../../src/elements/element-manifest.json';

/**
 * The per-element entry basename for a tag, e.g. 'kai-chat' -> 'chat'.
 *
 * Read from element-manifest.json's `tags` map rather than derived by stripping
 * the `kai-` prefix: TEN of the eighty elements do not match that derivation
 * (`kai-conversations` -> `conversation-list`), so a derived path would emit a
 * broken import for them.
 */
export function entryForTag(tag: string): string | undefined {
  return (ELEMENT_ENTRY_TAGS as Record<string, string>)[tag];
}

/**
 * The per-element entry basename for a tag the register-all bundle does NOT
 * carry, e.g. 'kai-remote' -> 'remote'. `undefined` for every tag `entryForTag`
 * already answers, and for a tag no built module registers.
 *
 * WHY THIS EXISTS. `entryForTag` reads element-manifest.json, which is generated
 * from the import list in register-impl.ts — so an opt-in element is absent from
 * it by construction, and the reference had nothing to name. It said "find the
 * entry point in the package's published exports", which is the one place in the
 * reference where "how to make this element exist" does not answer itself.
 *
 * WHY IT IS READ AND NOT DERIVED. Stripping `kai-` is wrong for ten of the eighty
 * elements, so guessing here risks exactly the broken import this tool exists to
 * catch. The fact is stated in config/vite/elements.ts, which adds an explicit
 * entry for each opt-in element precisely "so `@kitn.ai/ui/elements/remote`
 * resolves to a real dist file" — but a vite config is not shipped in the
 * package, so the runtime reads that intent where it LANDS: dist/elements/. A
 * candidate is a built module that element-manifest.json does not already claim
 * (plus the two non-element entries the same build emits), and it is matched to a
 * tag by the tag literal it registers. So the answer is the built artifact's,
 * confirmed against the tag rather than assumed from a filename.
 *
 * dist/elements/ is a sibling of the manifest in both contexts — the bundled bin
 * (dist/mcp.es.js) and vitest-over-source, which resolveManifestPath already
 * normalises — so this needs no second resolution strategy. A missing or
 * unreadable directory yields `undefined` rather than throwing: the caller's
 * fallback is the honest "this is opt-in" paragraph it already prints.
 */
export function optInEntryForTag(tag: string): string | undefined {
  if (entryForTag(tag)) return undefined;
  return optInEntries().get(tag);
}

/** Not element entries: the register-all barrel and the DOM autoloader, both
 *  emitted into dist/elements/ by the same per-element build. */
const NON_ELEMENT_ENTRIES = new Set(['index', 'autoloader']);

let _optInEntries: Map<string, string> | undefined;

function optInEntries(): Map<string, string> {
  if (_optInEntries) return _optInEntries;
  _optInEntries = new Map();

  const dir = join(dirname(resolveManifestPath()), 'elements');
  let candidates: string[];
  try {
    const registered = new Set(Object.values(ELEMENT_ENTRY_TAGS as Record<string, string>));
    candidates = readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => f.slice(0, -'.js'.length))
      .filter((base) => !registered.has(base) && !NON_ELEMENT_ENTRIES.has(base));
  } catch {
    return _optInEntries;
  }

  // Only the tags element-manifest.json does not already answer for. Narrow on
  // purpose: an element module may mention a tag it merely renders, and matching
  // against the whole tag list would let that be read as a registration.
  const unclaimed = listElements().filter((t) => !entryForTag(t));

  for (const base of candidates) {
    let code: string;
    try {
      code = readFileSync(join(dir, `${base}.js`), 'utf-8');
    } catch {
      continue;
    }
    for (const tag of unclaimed) {
      if (!_optInEntries.has(tag) && code.includes(`"${tag}"`)) _optInEntries.set(tag, base);
    }
  }

  return _optInEntries;
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
