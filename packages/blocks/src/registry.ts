/**
 * The blocks registry (Task 3.1, blocks-and-parts plan 2026-08-31; spec
 * "Registry mechanics"). Blocks live at `packages/blocks/blocks/<id>/`, each with
 * a `registry-item.json` manifest on the adopted shadcn registry-item
 * skeleton. This module is the ONE place that understands that layout:
 * validation, the derived `registry.json` index, the static per-block item
 * JSON (the public integration surface the CLI, gallery and MCP all
 * resolve), and the CDN-form generator that renders the authored `add` form
 * into a self-contained paste form.
 *
 * DISCIPLINE — pure functions over injected data, no `node:fs`. Two reasons:
 * (1) this file typechecks under the package's browser tsconfig (no node
 * types), and (2) create-kai imports registry logic at bundle time the way
 * `catalog.ts` imports `../../ui/mcp/registry` -- a pure module
 * works in both worlds. The directory WALK lives in the one place that has a
 * filesystem (`scripts/gen-blocks.mjs`, and later the CLI's own loader); what
 * it feeds in here is derived from the scan, never hand-listed.
 *
 * THE CDN ENTRY SET IS CLOSED ON PURPOSE. Phase 2 of the composition spike
 * (docs/superpowers/research/2026-08-31-composition-spike/phase2-cdn.md)
 * proved exactly which built entries are self-contained ESM loadable by raw
 * URL — and captured the ROOT export failing live on a bare `solid-js`
 * import. So `rewriteBareImport` maps ONLY the proven entries and hard-fails
 * on anything else, `@kitn.ai/ui` itself first among them. A new
 * self-contained entry earns its row here after `verify:cdn-entries` covers
 * it, not before.
 */

import { parseTemplate } from './contract/parse-template';

import { analyzeController, crossCheckBindings } from './contract/analyze-controller';

/** kebab-or-plain block name to its component name: support-widget -> SupportWidget.
 *  ONE definition; `componentName` in src/forms/index.ts re-exports it. */
export function pascal(blockName: string): string {
  return blockName.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}

// ---------------------------------------------------------------- manifest

/** One file a block ships, per the adopted registry-item skeleton. */
export interface BlockFileEntry {
  /** Path relative to the block's directory. */
  path: string;
  /** The registry file type. `registry:page` marks the block's HTML entry —
   *  exactly one per block; the CDN form is generated from it. */
  type: 'registry:page' | 'registry:file' | 'registry:component';
  /** Where `add` writes the file inside a consumer project. Defaults to the
   *  file's own name under the CLI's conventional block path. */
  target?: string;
}

/** The per-block manifest (`registry-item.json`) — the adopted shadcn
 *  registry-item vocabulary, adapted where our axes differ (see the spec's
 *  "Registry mechanics"): `registryDependencies` also carries backend-route
 *  deps (`route:<integration>` against the scaffolder catalog), and `cssVars`
 *  lands on `--kai-*` knobs, never a Tailwind config. */
export interface BlockManifest {
  /** Must equal the directory name — one identity, derived not typed. */
  name: string;
  title: string;
  description: string;
  type: 'registry:block';
  files: BlockFileEntry[];
  /** npm dependencies the `add` form needs (the CDN form needs none). */
  dependencies?: string[];
  /** Blocks this block composes (bare name), backend routes it streams
   *  through (`route:<integration>`), namespaced (`@ns/name`) or URL items. */
  registryDependencies?: string[];
  /** The block's theme in registry form: `--kai-*` knobs, the flat
   *  light/dark shape `ThemePayload` defines. */
  cssVars?: { light?: Record<string, string>; dark?: Record<string, string> };
  /** Environment variables the block's backend route needs, name → note. */
  envVars?: Record<string, string>;
  /** Printed by the CLI on install — where "needs an endpoint at /api/chat"
   *  lives. Plain prose: no em dashes, no emoji (house voice, enforced). */
  docs?: string;
  categories?: string[];
  meta?: { iframeHeight?: string; [key: string]: unknown };
}

/** A validated block: manifest plus the file contents the scan read. */
export interface Block {
  name: string;
  manifest: BlockManifest;
  /** file path (relative to the block dir) → content. Derived from the
   *  directory scan; the manifest's `files` must all resolve into it. */
  files: ReadonlyMap<string, string>;
}

/** What the filesystem walk hands in, one per `blocks/<dir>/`. */
export interface RawBlockSource {
  dirName: string;
  /** The raw text of `registry-item.json`. */
  manifestJson: string;
  files: { name: string; content: string }[];
}

export interface BlockValidationContext {
  /** Sibling block names, for bare-name `registryDependencies`. */
  blockNames: readonly string[];
  /** Integration ids from the scaffolder registry, for `route:<id>` deps —
   *  read from `mcp/registry` by the caller, never restated. */
  routeIntegrations: readonly string[];
}

const FILE_TYPES = new Set(['registry:page', 'registry:file', 'registry:component']);

/** House-voice guard for strings the gallery/CLI RENDER: no em dashes, no
 *  emoji (CLAUDE.md conventions; the plan's Task 3.1 brief names both). */
function proseErrors(field: string, value: string): string[] {
  const errors: string[] = [];
  if (value.includes('—')) errors.push(`${field}: contains an em dash; rendered block copy uses plain punctuation`);
  if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(value)) errors.push(`${field}: contains emoji; rendered block copy is emoji-free`);
  return errors;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate one parsed manifest against the skeleton and its directory.
 *  Returns human-readable errors; empty means valid. */
export function validateBlockManifest(
  raw: unknown,
  dirName: string,
  fileNames: readonly string[],
  ctx: BlockValidationContext,
): string[] {
  const errors: string[] = [];
  if (!isRecord(raw)) return [`${dirName}: registry-item.json is not an object`];
  const m = raw;

  for (const field of ['name', 'title', 'description'] as const) {
    if (typeof m[field] !== 'string' || (m[field] as string).length === 0) {
      errors.push(`${dirName}: "${field}" must be a non-empty string`);
    }
  }
  if (typeof m.name === 'string' && m.name !== dirName) {
    errors.push(`${dirName}: manifest name "${m.name}" must equal the directory name (one identity, derived)`);
  }
  if (m.type !== 'registry:block') {
    errors.push(`${dirName}: "type" must be "registry:block", got ${JSON.stringify(m.type)}`);
  }
  for (const field of ['title', 'description', 'docs'] as const) {
    if (typeof m[field] === 'string') errors.push(...proseErrors(`${dirName}: ${field}`, m[field] as string));
  }

  // files[] — nonempty, each present on disk, exactly one registry:page.
  if (!Array.isArray(m.files) || m.files.length === 0) {
    errors.push(`${dirName}: "files" must be a non-empty array`);
  } else {
    const seen = new Set<string>();
    let pages = 0;
    for (const f of m.files) {
      if (!isRecord(f) || typeof f.path !== 'string' || typeof f.type !== 'string') {
        errors.push(`${dirName}: each files[] entry needs string "path" and "type"`);
        continue;
      }
      if (!FILE_TYPES.has(f.type)) errors.push(`${dirName}: files["${f.path}"] has unknown type "${f.type}"`);
      if (f.type === 'registry:page') pages += 1;
      if (seen.has(f.path)) errors.push(`${dirName}: files[] lists "${f.path}" twice`);
      seen.add(f.path);
      if (!fileNames.includes(f.path)) {
        errors.push(`${dirName}: files[] lists "${f.path}" but the directory scan found no such file`);
      }
      if ('target' in f) {
        if (typeof f.target !== 'string') {
          errors.push(`${dirName}: files["${f.path}"].target must be a string when present`);
        } else if (f.target !== f.path.split('/').pop()) {
          errors.push(
            `${dirName}: files["${f.path}"].target is "${f.target}", but "target" is derived: the file name comes from the path and the DIRECTORY comes from src/targets.ts (one table, read by the renderers, the CLI and the site). Delete the line, or write "${f.path.split('/').pop()}".`,
          );
        }
      }
    }
    if (pages !== 1) errors.push(`${dirName}: exactly one files[] entry must be type "registry:page" (the CDN form's source), found ${pages}`);
  }

  // registryDependencies — bare block names, route:<integration>, @ns/name, URL.
  if (m.registryDependencies !== undefined) {
    if (!Array.isArray(m.registryDependencies)) {
      errors.push(`${dirName}: "registryDependencies" must be an array`);
    } else {
      for (const dep of m.registryDependencies) {
        if (typeof dep !== 'string') { errors.push(`${dirName}: registryDependencies entries must be strings`); continue; }
        if (dep.startsWith('route:')) {
          const id = dep.slice('route:'.length);
          if (!ctx.routeIntegrations.includes(id)) {
            errors.push(`${dirName}: registryDependencies route "${id}" is not a scaffolder integration (known: ${ctx.routeIntegrations.join(', ')})`);
          }
        } else if (!dep.startsWith('@') && !/^https?:\/\//.test(dep)) {
          if (!ctx.blockNames.includes(dep)) {
            errors.push(`${dirName}: registryDependencies block "${dep}" is not a known block`);
          }
        }
      }
    }
  }

  if (m.dependencies !== undefined && (!Array.isArray(m.dependencies) || m.dependencies.some((d) => typeof d !== 'string'))) {
    errors.push(`${dirName}: "dependencies" must be an array of npm package names`);
  }

  // cssVars — the ThemePayload shape: light/dark maps of --kai-* knobs.
  if (m.cssVars !== undefined) {
    if (!isRecord(m.cssVars)) {
      errors.push(`${dirName}: "cssVars" must be an object with optional "light"/"dark" maps`);
    } else {
      for (const scheme of Object.keys(m.cssVars)) {
        if (scheme !== 'light' && scheme !== 'dark') {
          errors.push(`${dirName}: cssVars has unknown scheme "${scheme}" (only "light"/"dark")`);
          continue;
        }
        const vars = (m.cssVars as Record<string, unknown>)[scheme];
        if (!isRecord(vars)) { errors.push(`${dirName}: cssVars.${scheme} must be a map`); continue; }
        for (const knob of Object.keys(vars)) {
          if (!knob.startsWith('--kai-')) {
            errors.push(`${dirName}: cssVars.${scheme} knob "${knob}" must be a --kai-* custom property (our token system, never a Tailwind config)`);
          }
        }
      }
    }
  }

  if (m.envVars !== undefined && (!isRecord(m.envVars) || Object.values(m.envVars).some((v) => typeof v !== 'string'))) {
    errors.push(`${dirName}: "envVars" must be a map of name to note`);
  }
  if (m.meta !== undefined) {
    if (!isRecord(m.meta)) errors.push(`${dirName}: "meta" must be an object`);
    else if (m.meta.iframeHeight !== undefined && !/^\d+(\.\d+)?(px|rem|em|vh|%)$/.test(String(m.meta.iframeHeight))) {
      errors.push(`${dirName}: meta.iframeHeight "${String(m.meta.iframeHeight)}" is not a CSS length`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------- discovery

/** Parse + validate every scanned block directory. Cross-checks bare
 *  `registryDependencies` against the sibling set, so the whole scan is the
 *  unit of validity. Errors carry the block name; a block with errors is
 *  excluded from the result rather than half-loaded. */
export function discoverBlocks(
  sources: readonly RawBlockSource[],
  routeIntegrations: readonly string[],
): { blocks: Block[]; errors: string[] } {
  const blockNames = sources.map((s) => s.dirName);
  const blocks: Block[] = [];
  const errors: string[] = [];
  for (const src of [...sources].sort((a, b) => a.dirName.localeCompare(b.dirName))) {
    let raw: unknown;
    try {
      raw = JSON.parse(src.manifestJson);
    } catch (err) {
      errors.push(`${src.dirName}: registry-item.json does not parse (${String(err)})`);
      continue;
    }
    const fileNames = src.files.map((f) => f.name);
    const errs = validateBlockManifest(raw, src.dirName, fileNames, { blockNames, routeIntegrations });
    if (errs.length) { errors.push(...errs); continue; }
    blocks.push({
      name: src.dirName,
      manifest: raw as BlockManifest,
      files: new Map(src.files.map((f) => [f.name, f.content])),
    });
  }
  return { blocks, errors };
}

// ----------------------------------------------------------- emitted JSONs

/** The `registry.json` index: every block's manifest, file contents omitted —
 *  the browse surface. The shadcn index shape (name/homepage/items). */
export function buildRegistryIndex(blocks: readonly Block[]): {
  name: string;
  homepage: string;
  items: BlockManifest[];
} {
  return {
    name: 'kai-blocks',
    homepage: 'https://ui.kitn.ai/blocks',
    items: blocks.map((b) => b.manifest),
  };
}

/** The static per-block item JSON (`r/<name>.json` shape): the manifest with
 *  each files[] entry carrying its `content`. THE integration surface — the
 *  CLI, the gallery, the MCP and any third-party tool resolve this URL. */
export function buildRegistryItem(block: Block): BlockManifest & {
  files: (BlockFileEntry & { content: string })[];
} {
  return {
    ...block.manifest,
    files: block.manifest.files.map((entry) => ({
      ...entry,
      content: block.files.get(entry.path) as string,
    })),
  };
}

// ------------------------------------------------------- the CDN-form pass

/** Bare specifier → dist path, ONLY for the entries phase 2 of the
 *  composition spike proved self-contained over a raw URL (state.js /
 *  wire.js / stores.js / the elements autoloader / the register-all bundle).
 *  The root export is deliberately absent: phase 2 captured it failing live
 *  on a bare `solid-js` import (`index-root-import.html`). */
export const CDN_IMPORT_ENTRIES: Readonly<Record<string, string>> = {
  '@kitn.ai/ui/autoloader': 'elements/autoloader.js',
  '@kitn.ai/ui/elements': 'kai.es.js',
  '@kitn.ai/ui/state': 'state.js',
  '@kitn.ai/ui/wire': 'wire.js',
  '@kitn.ai/ui/stores': 'stores.js',
};

/** Resolve one bare import for the CDN form, or explain why it cannot be. */
export function rewriteBareImport(spec: string, base: string): { url?: string; error?: string } {
  const dist = CDN_IMPORT_ENTRIES[spec];
  if (dist) return { url: `${base}${dist}` };
  if (spec === '@kitn.ai/ui') {
    return { error: `the root "@kitn.ai/ui" export is not loadable over a raw CDN URL (bare solid-js imports; composition-spike phase 2). Import one of: ${Object.keys(CDN_IMPORT_ENTRIES).join(', ')}` };
  }
  if (spec.startsWith('@kitn.ai/ui/')) {
    return { error: `"${spec}" is not in the proven self-contained CDN entry set (${Object.keys(CDN_IMPORT_ENTRIES).join(', ')}). Add it only after verify:cdn-entries covers it.` };
  }
  return { error: `"${spec}" is a bare import the CDN form cannot resolve; blocks may import only @kitn.ai/ui entries and their own relative files` };
}

export interface CdnFormOptions {
  /** The kit version to pin (read from packages/ui/package.json by the
   *  caller at generation time — the lint:cdn-pins invariant; never typed). */
  version: string;
  /**
   * Import base override. Default: the pinned jsDelivr URL derived from
   * `version`, with each pinned line annotated `x-release-please-version` so
   * the release bump rewrites it (the file must also be in release-please
   * `extra-files`). Pass `/kit/` for the block driver's local stand-in —
   * no pins, no annotations.
   */
  base?: string;
}

const IMPORT_RE =
  /^import\s+(?:([\w${},*\s]+)\s+from\s+)?['"]([^'"]+)['"];?\s*$/;

/**
 * Walk a module's lines, handing each IMPORT STATEMENT to `onImport` and every
 * other line to `onLine`.
 *
 * MULTI-LINE IMPORTS ARE WHY THIS EXISTS. `IMPORT_RE` is anchored to a whole
 * line, and esbuild emits a wide import list across several of them:
 *
 *   import {
 *     localStorageStore,
 *     isConversationUnread
 *   } from "@kitn.ai/ui/stores";
 *
 * A line-by-line scan matched none of that, copied all four lines through
 * verbatim, and shipped a bare specifier no browser resolves -- silently,
 * because nothing downstream looked. So a line that OPENS an import
 * accumulates following lines until the statement parses. A run that never
 * parses is handed to `onLine` unchanged and caught by `unresolvedImports`
 * below, which is the loud half of the same fix.
 */
function scanImports(
  source: string,
  onImport: (clause: string | undefined, spec: string) => void,
  onLine: (line: string) => void,
): void {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!/^import\s|^import\{/.test(trimmed)) { onLine(lines[i]); continue; }
    let text = trimmed;
    let end = i;
    let m = IMPORT_RE.exec(text);
    // Bounded: an unterminated `import {` must not swallow the whole module.
    while (!m && end + 1 < lines.length && end - i < 40) {
      end += 1;
      text = `${text} ${lines[end].trim()}`;
      m = IMPORT_RE.exec(text);
    }
    if (!m) { onLine(lines[i]); continue; }
    i = end;
    onImport(m[1], m[2]);
  }
}

/**
 * Every import specifier left in the emitted code that a browser could not
 * resolve: anything that is not an absolute URL or a root-relative path.
 *
 * The rewrite handles the shapes it models and copies through the ones it
 * does not, and "copies through" is exactly how a bare specifier reached a
 * generated form with nothing said. The form's whole claim is that it is
 * self-contained, so this is the claim being checked on the output rather
 * than assumed from the transformation.
 */
function unresolvedImports(code: string): string[] {
  const bad: string[] = [];
  scanImports(
    code,
    (_clause, spec) => {
      if (/^https?:\/\//.test(spec) || spec.startsWith('/')) return;
      bad.push(spec);
    },
    () => {},
  );
  // The shapes `scanImports` cannot parse at all reach `onLine`, so they are
  // caught here by their text rather than by their specifier.
  for (const line of code.split('\n')) {
    const m = /^\s*import\b.*?['"]([^'"]+)['"]/.exec(line);
    if (m && !/^https?:\/\//.test(m[1]) && !m[1].startsWith('/') && !bad.includes(m[1])) bad.push(m[1]);
  }
  return bad;
}

/**
 * Inline a relative module into the entry script.
 *
 * ONE LEVEL DEEP, deliberately. The generated binder imports the controller,
 * and the controller imports its mock plus the `@kitn.ai/ui` entries it
 * parses through: that is the shape the authored contract produces, and it is
 * exactly two levels. A third is a module graph, and a single pasted file that
 * reconstructs a module graph by concatenation is a thing that works until it
 * does not (order, cycles, name collisions). So the third level is a loud
 * refusal naming the file, not a deeper inliner.
 *
 * Bare `@kitn.ai/ui/*` imports inside an inlined module are rewritten onto the
 * pinned CDN entries and hoisted exactly like the entry's own, through the
 * same closed `CDN_IMPORT_ENTRIES` set.
 *
 * ORDER is load-bearing and the caller depends on it: a child's text is pushed
 * into `hoistedBodies` BEFORE its importer's, so the deepest module reads
 * first in the pasted file.
 */
function inlineRelativeModule(
  name: string,
  content: string,
  files: ReadonlyMap<string, string>,
  base: string,
  depth: number,
  hoistedBodies: string[],
  hoistedImports: string[],
  errors: string[],
): string {
  const body: string[] = [];
  scanImports(content, (clause, spec) => {
    if (spec.startsWith('./') || spec.startsWith('../')) {
      if (depth >= 1) {
        errors.push(`"${name}" imports "${spec}": the single-file paste form inlines two levels (the entry and what it imports), not a module graph. Flatten the block, or use \`create-kai add\` inside a project.`);
        return;
      }
      const child = resolveRelative(spec, files);
      if (child === undefined) { errors.push(`import "${spec}" does not resolve to a file in the block directory`); return; }
      hoistedBodies.push(
        inlineRelativeModule(child.name, child.content, files, base, depth + 1, hoistedBodies, hoistedImports, errors),
      );
      return;
    }
    const resolved = rewriteBareImport(spec, base);
    if (resolved.error) { errors.push(resolved.error); return; }
    const importOf = clause ? `import ${clause} from` : 'import';
    const annotate = base.includes('@kitn.ai/ui@');
    hoistedImports.push(`${importOf} '${resolved.url}';${annotate ? ' // x-release-please-version' : ''}`);
  }, (line) => body.push(line));
  return `// ---- inlined from ./${name} ----\n${body.join('\n').replace(/^export\s+/gm, '')}`;
}

/** A relative specifier to the block file it names. The extensionless form
 *  (`./mock`, which is what a TypeScript source writes so both the `.ts` and
 *  its emitted `.js` twin resolve) falls back to the `.js` twin, and the
 *  RESOLVED name is what travels, so the inlined-from comment names a real
 *  file rather than the specifier. */
function resolveRelative(
  spec: string,
  files: ReadonlyMap<string, string>,
): { name: string; content: string } | undefined {
  const asked = spec.replace(/^\.\//, '');
  for (const name of [asked, `${asked}.js`]) {
    const content = files.get(name);
    if (content !== undefined) return { name, content };
  }
  return undefined;
}

/** Rewrite one authored block script for the CDN form: bare `@kitn.ai/ui/*`
 *  imports onto the pinned entry URLs, relative imports inlined. */
export function rewriteBlockScript(
  js: string,
  files: ReadonlyMap<string, string>,
  opts: CdnFormOptions,
): { code?: string; errors: string[] } {
  const base = opts.base ?? `https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${opts.version}/dist/`;
  // The annotate predicate sits beside the base so the entry's own imports and
  // an inlined module's agree about it: `inlineRelativeModule` computes the
  // same test from the same string.
  const annotate = base.includes('@kitn.ai/ui@');
  const errors: string[] = [];
  const hoisted: string[] = [];
  const out: string[] = [];
  scanImports(js, (clause, spec) => {
    if (spec.startsWith('./') || spec.startsWith('../')) {
      const child = resolveRelative(spec, files);
      if (child === undefined) { errors.push(`import "${spec}" does not resolve to a file in the block directory`); return; }
      hoisted.push(inlineRelativeModule(child.name, child.content, files, base, 0, hoisted, out, errors));
      return;
    }
    const resolved = rewriteBareImport(spec, base);
    if (resolved.error) { errors.push(resolved.error); return; }
    const importOf = clause ? `import ${clause} from` : 'import';
    // The pin's semver is the FIRST version token on the line, and the inline
    // annotation makes release-please's generic updater rewrite it on a bump
    // (lint:cdn-pins --check-release-wiring pins both facts).
    out.push(`${importOf} '${resolved.url}';${annotate ? ' // x-release-please-version' : ''}`);
  }, (line) => out.push(line));
  if (errors.length) return { errors };
  // Deduped in order: two inlined modules importing the same kit entry would
  // otherwise emit the identical line twice.
  const seen = new Set<string>();
  const lines = [...hoisted, ...out].filter((line) => {
    if (!line.startsWith('import ')) return true;
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  });
  const code = lines.join('\n');
  const leftovers = unresolvedImports(code);
  if (leftovers.length) {
    return {
      errors: leftovers.map(
        (spec) =>
          `the emitted script still imports "${spec}", which no browser can resolve: the CDN form must be self-contained. Blocks import only @kitn.ai/ui entries (${Object.keys(CDN_IMPORT_ENTRIES).join(', ')}) and their own relative files, in a form the rewrite recognises.`,
      ),
    };
  }
  return { code, errors };
}

/** The two `kai-` contract points every emitted CDN snippet bakes in, stated
 *  once and stamped into the generated form as a comment for the person who
 *  pastes it. */
const CONTRACT_BANNER = `<!--
  GENERATED by packages/ui/scripts/gen-blocks.mjs. Do not edit; edit the
  block's source in packages/blocks/blocks/ and regenerate (node scripts/gen-blocks.mjs).

  Two kai- contract points this form already follows, and your edits must keep:
  1. Array/object props (messages, suggestions, conversations, ...) are set as
     JS PROPERTIES (el.messages = [...]), never as HTML attributes.
  2. kai-* events do not bubble: add listeners on the element itself and read
     event.detail. Streaming parses through the @kitn.ai/ui/wire readers.
-->`;

/**
 * Render a block's authored `add` form into the self-contained CDN-paste
 * form: the registry:page HTML with its relative stylesheet links inlined as
 * `<style>` and its relative module scripts inlined with imports rewritten
 * onto the pinned CDN entries.
 */
export function generateCdnForm(block: Block, opts: CdnFormOptions): { html?: string; errors: string[] } {
  const errors: string[] = [];
  const pageEntry = block.manifest.files.find((f) => f.type === 'registry:page') as BlockFileEntry;
  let html = block.files.get(pageEntry.path) as string;

  // Inline relative stylesheets.
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="\.\/([^"]+)"\s*\/?>/g,
    (whole, name: string) => {
      const css = block.files.get(name);
      if (css === undefined) { errors.push(`stylesheet "./${name}" does not resolve to a block file`); return whole; }
      return `<style>\n/* ---- inlined from ./${name} ---- */\n${css.trimEnd()}\n</style>`;
    },
  );

  // Inline relative module scripts with the import rewrite.
  html = html.replace(
    /<script\s+type="module"\s+src="\.\/([^"]+)"\s*><\/script>/g,
    (whole, name: string) => {
      const js = block.files.get(name);
      if (js === undefined) { errors.push(`script "./${name}" does not resolve to a block file`); return whole; }
      const rewritten = rewriteBlockScript(js, block.files, opts);
      if (rewritten.errors.length) { errors.push(...rewritten.errors); return whole; }
      return `<script type="module">\n${(rewritten.code as string).trimEnd()}\n</script>`;
    },
  );

  if (/(<link\s+rel="stylesheet"\s+href="\.\/)|(<script[^>]*src="\.\/)/.test(html)) {
    errors.push('the generated form still references a relative file; the CDN form must be self-contained');
  }
  if (errors.length) return { errors };
  return { html: html.replace('<!doctype html>', `<!doctype html>\n${CONTRACT_BANNER}`), errors };
}

// ------------------------------------------------ structural contract check

/**
 * Structural checks over a block's AUTHORED source — the generator refuses to
 * emit a form that breaks the kai- contract or hand-rolls the wire:
 * - a non-scalar prop appearing as an HTML attribute (list DERIVED from
 *   `element-nonscalar.json`, the same one-definition-of-scalar the runtime
 *   check uses — injected by the caller, never restated);
 * - the legacy `kitn-` prefix;
 * - `kai-*` listeners on document/window (the events do not bubble);
 * - a hand-rolled SSE path (`EventSource`, `text/event-stream`,
 *   `.getReader(`) instead of the `@kitn.ai/ui/wire` readers.
 */
export function checkBlockContracts(
  block: Block,
  nonscalarByTag: Readonly<Record<string, readonly string[]>>,
): string[] {
  const errors: string[] = [];
  const kebab = (p: string) => p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

  for (const entry of block.manifest.files) {
    const content = block.files.get(entry.path);
    if (content === undefined) continue;
    const where = `${block.name}/${entry.path}`;

    if (/<\/?kitn-/.test(content) || /['"`]kitn-/.test(content)) {
      errors.push(`${where}: uses the legacy "kitn-" prefix; elements are kai-*`);
    }
    if (/(document|window)\.addEventListener\(\s*['"`]kai-/.test(content)) {
      errors.push(`${where}: listens for a kai-* event on document/window; kai-* events do not bubble, listen on the element`);
    }
    if (/new\s+EventSource\(|text\/event-stream|\.getReader\(/.test(content)) {
      errors.push(`${where}: hand-rolls a stream reader; use the @kitn.ai/ui/wire readers (readOpenAIStream / readAnthropicStream / readModelStream)`);
    }

    if (entry.path.endsWith('.html')) {
      // Rich props as attributes: scan each kai-* open tag for its tag's
      // non-scalar prop names in attribute position (camelCase or kebab-case).
      for (const tagMatch of content.matchAll(/<(kai-[\w-]+)([^>]*)>/g)) {
        const [, tag, attrs] = tagMatch;
        for (const prop of nonscalarByTag[tag] ?? []) {
          // The prefix is part of the match, not skipped by it. `:messages=`
          // and `seed:messages=` are a non-scalar in ATTRIBUTE position
          // exactly as a bare `messages=` is; only `.prop=` and `*for=`
          // legitimately carry a non-scalar (spec 3.1, amendment 8a.2). The
          // old form required whitespace immediately before the name, so
          // every prefixed spelling slipped past it.
          const attrRe = new RegExp(`(?:^|\\s)(?::|seed:)?(?:${prop}|${kebab(prop)})\\s*=`, 'i');
          if (attrRe.test(attrs)) {
            errors.push(`${where}: <${tag}> sets non-scalar prop "${prop}" as an HTML attribute; array/object props are JS properties only`);
          }
        }
      }
    }
  }

  // The GRAMMAR has one owner. Rather than restating the binding rules here,
  // parse the page and surface what the parser says.
  //
  // Every block is an authored-contract block now (PR B). A page with no
  // bindings and no controller is not a simpler block, it is an unconverted
  // one, and the forms cannot be generated from it.
  const pageEntry = block.manifest.files.find((f) => f.type === 'registry:page');
  const pageHtml = pageEntry ? block.files.get(pageEntry.path) : undefined;
  if (pageEntry && pageHtml !== undefined) {
    const where = `${block.name}/${pageEntry.path}`;
    const parsed = parseTemplate(pageHtml, where);
    errors.push(...parsed.errors);

    const name = pascal(block.name);
    const controllerPath = `${block.name}.controller.ts`;
    const controllerSource = block.files.get(controllerPath);
    if (controllerSource === undefined) {
      errors.push(`${block.name}: every block needs ${controllerPath} (spec 3.2). The wiring belongs on the markup and the logic in the controller; a page with neither is an unconverted block, not a simpler one.`);
    } else if (parsed.template) {
      const shape = analyzeController(controllerSource, name, `${block.name}/${controllerPath}`);
      errors.push(...shape.errors);
      if (shape.shape) errors.push(...crossCheckBindings(parsed.template, shape.shape, where));
    }
  }

  return errors;
}
