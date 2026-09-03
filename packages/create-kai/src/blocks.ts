/**
 * `create-kai add <block>` - resolution, detection and write planning.
 *
 * THE REGISTRY IS THE KIT'S, NOT A COPY. Block logic (manifest validation,
 * discovery, the CDN-form generator) is imported from
 * `@kitn.ai/blocks` and bundled at build time,
 * exactly the way `catalog.ts` imports the scaffolder registry - one source,
 * a build failure as the drift failure mode. That module is a deliberate leaf
 * (pure, no zod, nothing under `mcp/`), so `bundleGraphProblem` stays green.
 * The block FILES ride the published CLI the way templates do:
 * `scripts/build.mjs` copies the resolved `@kitn.ai/blocks` package's
 * `blocks/` directory into `dist/blocks/`, and
 * the loader here walks whatever directory it is handed.
 *
 * THE PER-BLOCK JSON URL IS THE SAME PATH. `add https://host/r/name.json`
 * fetches the registry-item JSON (files carrying `content`) and feeds it
 * through the same validation and the same write planner the bundled registry
 * uses - the public integration surface from the spec's registry mechanics,
 * so a third-party static registry works from day one.
 *
 * WHAT RESOLUTION IS, IN FULL (spec Part 3, "what our resolution DELETES"):
 * item -> `registryDependencies` (blocks recurse; `route:<integration>` deps
 * resolve against the scaffolder catalog and emit the backend route the way
 * the scaffolder does) -> npm deps -> write files to targets -> print `docs`.
 * No components.json, no alias map, no import rewriting for the html targets;
 * the react form imports the published `@kitn.ai/ui/react` entry.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { discoverBlocks, unsafeFilePathReason, unsafeNameReason } from '@kitn.ai/blocks';
import type {
  Block,
  BlockManifest,
  RawBlockSource,
} from '@kitn.ai/blocks';
// The FORM RENDERING is the kit's shared pure module too (same bundle-import
// precedent as the registry line above): one renderer serves this planner AND
// the per-framework code view on the docs site's /blocks section, so what
// /blocks shows is byte-for-byte what `add` writes.
import {
  BLOCK_FORMS,
  FRAMEWORK_BLOCK_FORMS,
  adaptRegistrationForBundler,
  componentName,
  renderBlockForm,
  type BlockFormId,
  type FormFile,
} from '@kitn.ai/blocks/forms';
import { INSTALL_ROOTS, fileTarget, installRoot, isTargetFramework, type TargetFramework } from '@kitn.ai/blocks/targets';

import { getIntegration, listIntegrations } from './catalog';
import type { Integration } from './catalog';
import type { Axis } from './axes';
import { getFramework } from './frameworks';
import { emitRoute } from './routes';
import type { EmittedFile } from './routes';

export type { Block, BlockManifest };
export { adaptRegistrationForBundler };

// ---------------------------------------------------------------- discovery

/**
 * Load the bundled block registry from a directory of `blocks/<id>/` dirs.
 * Throws on validation errors rather than half-loading: a CLI that lists a
 * block its own registry rejects would fail later and less legibly.
 */
export async function loadBlocks(blocksRoot: string): Promise<Block[]> {
  const sources: RawBlockSource[] = [];
  const entries = await readdir(blocksRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(blocksRoot, entry.name);
    const names = (await readdir(dir, { withFileTypes: true }))
      .filter((f) => f.isFile())
      .map((f) => f.name);
    if (!names.includes('registry-item.json')) continue;
    const files = await Promise.all(
      names
        .filter((name) => name !== 'registry-item.json')
        .map(async (name) => ({ name, content: await readFile(path.join(dir, name), 'utf8') })),
    );
    sources.push({
      dirName: entry.name,
      manifestJson: await readFile(path.join(dir, 'registry-item.json'), 'utf8'),
      files,
    });
  }
  const { blocks, errors } = discoverBlocks(sources, listIntegrations().map((i) => i.id));
  if (errors.length) {
    throw new Error(`the bundled block registry does not validate:\n  ${errors.join('\n  ')}`);
  }
  return blocks;
}

/** A fetched registry-item JSON (files carrying content) as a `Block`. */
export function blockFromItemJson(raw: unknown, sourceUrl: string): { block?: Block; errors: string[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { errors: [`${sourceUrl}: the item JSON is not an object`] };
  }
  const item = raw as BlockManifest & { files?: { path?: unknown; content?: unknown }[] };
  if (typeof item.name !== 'string' || item.name.length === 0) {
    return { errors: [`${sourceUrl}: the item JSON has no "name"`] };
  }
  const errors: string[] = [];
  // PATH TRAVERSAL. A fetched item's "name" and files[].path never pass
  // through `validateBlockManifest`'s dirName check (there is no directory
  // scan for a URL), so this is the one place they meet the shared rule in
  // `@kitn.ai/blocks` before `fileTarget`/`runAdd` join them onto the
  // install root with a raw string concatenation.
  const nameProblem = unsafeNameReason(item.name);
  if (nameProblem) {
    errors.push(`${sourceUrl}: name "${item.name}" ${nameProblem}`);
  }
  const files = new Map<string, string>();
  for (const entry of item.files ?? []) {
    if (typeof entry.path !== 'string' || typeof entry.content !== 'string') {
      errors.push(`${sourceUrl}: files["${String(entry.path)}"] carries no inline "content"; a per-block item JSON is self-contained`);
      continue;
    }
    const pathProblem = unsafeFilePathReason(entry.path);
    if (pathProblem) {
      errors.push(`${sourceUrl}: files["${entry.path}"] ${pathProblem}`);
      continue;
    }
    files.set(entry.path, entry.content);
  }
  if (!Array.isArray(item.files) || item.files.length === 0) {
    errors.push(`${sourceUrl}: the item JSON lists no files`);
  }
  if (!(item.files ?? []).some((f) => (f as { type?: unknown }).type === 'registry:page')) {
    errors.push(`${sourceUrl}: no files[] entry is type "registry:page"`);
  }
  if (errors.length) return { errors };
  const manifest = { ...(item as BlockManifest) };
  manifest.files = (item.files as BlockManifest['files']).map(({ ...entry }) => {
    delete (entry as { content?: unknown }).content;
    return entry;
  });
  return { block: { name: item.name, manifest, files }, errors: [] };
}

// --------------------------------------------------------------- resolution

export interface ResolvedAdd {
  /** dependency order: a block's registryDependencies land before it */
  blocks: Block[];
  /** the backend routes the composition streams through */
  routes: Integration[];
}

export interface BlockResolvers {
  /** the bundled registry, by name */
  local(name: string): Block | undefined;
  /** fetch + parse a per-block item JSON URL */
  fetchItem(url: string): Promise<Block>;
}

const isUrl = (spec: string) => /^https?:\/\//.test(spec);

/**
 * Resolve one requested item and its `registryDependencies`, recursively.
 * Bare names inside a URL-sourced item resolve as sibling `<name>.json` URLs
 * (the shadcn registry grammar); bare names inside a bundled block resolve
 * against the bundled registry. `route:<integration>` resolves against the
 * scaffolder catalog. Failures THROW with every known alternative named.
 */
export async function resolveAdd(spec: string, resolvers: BlockResolvers): Promise<ResolvedAdd> {
  const blocks: Block[] = [];
  const routes = new Map<string, Integration>();
  const visiting = new Set<string>();
  const done = new Set<string>();

  async function visit(item: string, fromUrl: string | null): Promise<void> {
    if (item.startsWith('route:')) {
      const id = item.slice('route:'.length);
      const integration = getIntegration(id);
      if (!integration) {
        throw new Error(
          `"${item}" names no scaffolder integration. Known: ${listIntegrations().map((i) => i.id).join(', ')}`,
        );
      }
      routes.set(id, integration);
      return;
    }
    if (item.startsWith('@')) {
      throw new Error(`"${item}": namespaced registry items are not resolvable by this release; use the block's item JSON URL`);
    }

    const url = isUrl(item) ? item : fromUrl ? new URL(`./${item}.json`, fromUrl).href : null;
    const key = url ?? item;
    if (done.has(key)) return;
    if (visiting.has(key)) {
      throw new Error(`registryDependencies cycle through "${item}"`);
    }
    visiting.add(key);

    let block: Block;
    if (url) {
      block = await resolvers.fetchItem(url);
    } else {
      const found = resolvers.local(item);
      if (!found) {
        throw new Error(`no block named "${item}". Run \`create-kai add --list\` for what this release ships.`);
      }
      block = found;
    }

    for (const dep of block.manifest.registryDependencies ?? []) {
      await visit(dep, url);
    }
    visiting.delete(key);
    done.add(key);
    blocks.push(block);
  }

  await visit(spec, null);
  return { blocks, routes: [...routes.values()] };
}

// ---------------------------------------------------------- framework detection

/**
 * The signals table (spec Part 3, detection ruling). DATA, so a new framework
 * variant is a row, not a branch.
 *
 * A row names the dependency and the FRAMEWORK it means. Where that framework
 * LANDS is not in the table: it is derived from the renderer list below, so
 * the day a renderer for it exists the row starts pointing at its own tree
 * with nothing here to edit. The previous version carried the landing form per
 * row, which made this file a second copy of "which renderers exist" living in
 * a package the renderer work has no reason to open.
 *
 * `preact` carries `null`: it is a real signal (a preact project is a project)
 * and it will never have an install root of its own, because a preact host
 * renders the custom elements like any other. `null` says that; `'html'` would
 * have read as "preact's own tree is the html one", which is a different and
 * false claim.
 */
export const FRAMEWORK_SIGNALS: readonly { dep: string; framework: TargetFramework | null }[] = [
  { dep: 'react', framework: 'react' },
  { dep: 'preact', framework: null },
  { dep: 'vue', framework: 'vue' },
  { dep: 'svelte', framework: 'svelte' },
  { dep: '@angular/core', framework: 'angular' },
  { dep: 'solid-js', framework: 'solid' },
];

export type BlockForm = BlockFormId;
/** Every form that is a project tree: the delivery forms minus the paste form. */
export type ProjectForm = Exclude<BlockForm, 'cdn'>;

/**
 * Does this release generate a tree for this framework?
 *
 * The narrowing is the coupling, spelled in the type system: a form id that is
 * also a target framework. Today that is `html` and `react`; PR B2 adds four
 * rows to `BLOCK_FORMS` and this predicate widens with them.
 */
function emitsOwnTree(framework: TargetFramework | null): framework is TargetFramework & ProjectForm {
  return framework !== null && FRAMEWORK_BLOCK_FORMS.some((form) => form.id === framework);
}

/** Where a signal's framework lands TODAY: its own tree when the generator
 *  emits one, the framework-neutral html form until then. */
export function landingForm(framework: TargetFramework | null): ProjectForm {
  return emitsOwnTree(framework) ? framework : 'html';
}

export type Detection =
  | { kind: 'none' }
  | {
      kind: 'detected';
      form: ProjectForm;
      found: string[];
      /** frameworks this project uses whose OWN tree this release does not
       *  generate yet, so the caller can say so instead of deciding quietly */
      fallback: TargetFramework[];
    }
  | { kind: 'ambiguous'; found: string[]; forms: ProjectForm[] };

/** Read the detection off a parsed package.json, or its absence. */
export function detectForm(packageJson: unknown | null): Detection {
  if (packageJson === null || typeof packageJson !== 'object') return { kind: 'none' };
  const pkg = packageJson as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const found = FRAMEWORK_SIGNALS.filter((signal) => signal.dep in deps);
  const forms = [...new Set(found.map((signal) => landingForm(signal.framework)))];

  // AMBIGUITY IS ABOUT THE ANSWER, NOT THE SIGNAL COUNT. Two signals landing
  // on the same tree is not a question: today vue and svelte both land on the
  // html form and asking which of two identical outcomes the user wants is
  // noise, not loudness. When PR B2 emits both trees they start deciding
  // different forms and this begins asking on its own.
  if (forms.length > 1) return { kind: 'ambiguous', found: found.map((s) => s.dep), forms };

  return {
    kind: 'detected',
    // Any project with no framework signal at all - or one whose only signal
    // has no tree of its own - gets the base web-component form: elements work
    // everywhere.
    form: forms[0] ?? 'html',
    found: found.map((s) => s.dep),
    fallback: found
      .map((s) => s.framework)
      .filter((f): f is TargetFramework => f !== null && !emitsOwnTree(f)),
  };
}

/**
 * The ambiguous case as an axis, so the ask goes through the same `AxisIo`
 * seam every other create-kai question does and the menu-honesty discipline
 * (spy-driven tests over what was CALLED) applies to it.
 *
 * The options are the forms actually IN CONTENTION, derived from the
 * detection, with labels read off `BLOCK_FORMS`. Hand-listing two of them here
 * was a menu with a hand list in it, inside the one function whose reason for
 * existing is the menu-honesty seam.
 */
export function blockFormAxis(found: readonly string[], forms: readonly (ProjectForm & TargetFramework)[]): Axis {
  const label = (id: string): string => BLOCK_FORMS.find((form) => form.id === id)?.label ?? id;
  return {
    id: 'block-form',
    label: 'Block form',
    question: `This project depends on ${found.join(' AND ')}; which form does the block land in?`,
    options: forms.map((id) => ({
      id,
      label: label(id),
      hint: `files under ${INSTALL_ROOTS[id]}/<block>/`,
    })),
    because: 'the frameworks this project uses land in different forms, so which one you want is a real choice',
  };
}

// ------------------------------------------------------------ write planning

export interface AddPlan {
  /** relative to the project root (or the cwd for the cdn form) */
  files: EmittedFile[];
  /** npm dependencies to merge into the project's package.json */
  dependencies: Record<string, string>;
  /** each resolved block's `docs` string, printed after the writes */
  docs: string[];
  /** decided-loudly lines: what was chosen or skipped, and why */
  notes: string[];
}

export interface PlanOptions {
  form: BlockForm;
  /** the @kitn.ai/ui range the CLI pins (`kit-pin.ts` owns the shape) */
  kitRange: string;
  /** the exact kit version, for the cdn form's pinned URLs */
  kitVersion: string;
}

/**
 * Plan every write for a resolved add. Pure: the caller owns collision
 * checking and the filesystem. Throws when a block cannot be rendered in the
 * requested form - a refusal that names the reason, never a partial block.
 */
export function planAdd(resolved: ResolvedAdd, opts: PlanOptions): AddPlan {
  const plan: AddPlan = { files: [], dependencies: {}, docs: [], notes: [] };

  for (const block of resolved.blocks) {
    planFormBlock(block, opts, plan);
    for (const dep of block.manifest.dependencies ?? []) {
      // The kit rides the CLI's own pin; anything else a block declares is
      // installed at latest, and the note says so out loud.
      if (dep === '@kitn.ai/ui') plan.dependencies[dep] = opts.kitRange;
      else if (!(dep in plan.dependencies)) {
        plan.dependencies[dep] = 'latest';
        plan.notes.push(`${block.name} depends on ${dep}, added at "latest" (the block manifest names no version)`);
      }
    }
    if (block.manifest.docs) plan.docs.push(`${block.name}: ${block.manifest.docs}`);
    const envVars = Object.entries(block.manifest.envVars ?? {});
    for (const [name, note] of envVars) plan.notes.push(`${block.name} needs ${name}: ${note}`);
  }

  planRoutes(resolved, opts, plan);
  return plan;
}

// The rendered files come from the ONE shared dispatch, `renderBlockForm`
// (`@kitn.ai/blocks/forms`, which is what /blocks shows too) - never a
// specific renderer called by hand. What stays here is what only the CLI
// knows: where the files land (through `target`, already computed) and the
// note printed about them.

/**
 * The ONE place a rendered file becomes a planned write.
 *
 * `target` is the project-relative path the renderer already derived from
 * `@kitn.ai/blocks/targets`, and it is the same string the /blocks page
 * displays and the compile cells check. Joining a directory on here again is
 * what `blockDir()` did, and the two joins disagreed about react for a whole
 * release cycle: the table said `src/components/<id>/`, the CLI wrote
 * `src/blocks/<id>/`, and only a test asserting the mismatch knew.
 */
function planFiles(files: readonly FormFile[], plan: AddPlan): void {
  for (const file of files) plan.files.push({ path: file.target, contents: file.content });
}

/**
 * Render one block into `opts.form` and plan its files and its note.
 *
 * THE FILES ROUTE THROUGH `renderBlockForm`, NEVER A SPECIFIC RENDERER
 * (ruling R13). `@kitn.ai/blocks` keeps that dispatch's `switch` exhaustive
 * over every id in `BLOCK_FORMS` on its own side (no `default`, so a form
 * added there with no case fails ITS OWN `tsc --noEmit`); at runtime under a
 * partially-patched tree it returns `undefined`, and `planFiles`'s `for`
 * throws immediately - before a note is printed, before a file is written.
 * That is what stands between "a --form value BLOCK_FORMS accepts" and "add
 * silently writes the html tree for it", the failure a form id with no
 * renderer produces if the caller decides by hand instead of asking
 * `@kitn.ai/blocks`.
 */
function planFormBlock(block: Block, opts: PlanOptions, plan: AddPlan): void {
  const files = renderBlockForm(block, opts.form, { cdn: { version: opts.kitVersion } });
  planFiles(files, plan);

  if (opts.form === 'cdn') {
    plan.notes.push(
      `${block.name}: no project here, so this is the self-contained CDN paste form - open ${block.name}.html directly, or paste it into any page. To scaffold a project around it, run \`npm create kai@latest\`.`,
    );
    return;
  }
  if (opts.form === 'react') {
    const dir = installRoot('react', block.name);
    plan.notes.push(
      `${block.name}: react form under ${dir}/ (render <${componentName(block.name)} /> from ${fileTarget('react', block.name, `${componentName(block.name)}.tsx`)})`,
    );
    return;
  }
  // Every other project-shaped form, html included: the html-shaped note,
  // naming its own install root. `isTargetFramework` gates the cast the same
  // way it does everywhere else in this file; for 'html' this reproduces the
  // note byte for byte, and for a future framework with no bespoke note of
  // its own (PR B2's business, not this one) it is still a true sentence
  // rather than a missing one.
  const framework = isTargetFramework(opts.form) ? opts.form : 'html';
  const dir = installRoot(framework, block.name);
  const page = block.manifest.files.find((f) => f.type === 'registry:page');
  // `.pop()` is `string | undefined` to tsc even on a non-empty split, so the
  // fallback is spelled out rather than asserted away.
  const pageFile = page ? (page.target ?? page.path.split('/').pop() ?? page.path) : '';
  plan.notes.push(
    `${block.name}: web-component form under ${dir}/ (open ${fileTarget(framework, block.name, pageFile)} through your dev server)`,
  );
}

function planRoutes(resolved: ResolvedAdd, opts: PlanOptions, plan: AddPlan): void {
  for (const integration of resolved.routes) {
    if (opts.form === 'react') {
      // The same emission the scaffolder uses: the catalog's webRoute fragment
      // under the react framework's declared route host.
      const framework = getFramework('react');
      const files = framework ? emitRoute(integration, framework) : [];
      if (files.length === 0) {
        plan.notes.push(`route ${integration.id}: the react starter declares no route host in this build, so no route was written`);
        continue;
      }
      plan.files.push(...files);
      plan.notes.push(
        `route ${integration.id}: ${files.map((f) => f.path).join(', ')} written; wire the plugin from vite-chat-api.ts into vite.config.ts plugins, and see https://ui.kitn.ai/${integration.docsSlug}`,
      );
    } else {
      plan.notes.push(
        `route ${integration.id}: this block streams through a ${integration.title} backend, and only the react form emits one today. ` +
          `Add a server route yourself (env: ${integration.envVars.join(', ') || 'none'}); see https://ui.kitn.ai/${integration.docsSlug}`,
      );
    }
    for (const envVar of integration.envVars) {
      plan.notes.push(`route ${integration.id} needs ${envVar} set where the route runs`);
    }
  }
}
