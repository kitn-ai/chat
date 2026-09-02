/**
 * `create-kai add <block>` - resolution, detection and write planning.
 *
 * THE REGISTRY IS THE KIT'S, NOT A COPY. Block logic (manifest validation,
 * discovery, the CDN-form generator) is imported from
 * `../../ui/mcp/blocks/registry` and bundled at build time,
 * exactly the way `catalog.ts` imports the scaffolder registry - one source,
 * a build failure as the drift failure mode. That module is a deliberate leaf
 * (pure, no zod, nothing under `mcp/`), so `bundleGraphProblem` stays green.
 * The block FILES ride the published CLI the way templates do:
 * `scripts/build.mjs` copies `packages/ui/blocks/` into `dist/blocks/`, and
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

import { discoverBlocks } from '../../ui/mcp/blocks/registry';
import type {
  Block,
  BlockManifest,
  RawBlockSource,
} from '../../ui/mcp/blocks/registry';
// The FORM RENDERING is the kit's shared pure module too (same bundle-import
// precedent as the registry line above): one renderer serves this planner AND
// the `kai dev` gallery's per-framework code view, so what the gallery shows
// is byte-for-byte what `add` writes.
import {
  adaptRegistrationForBundler,
  componentName,
  renderCdnFormFiles,
  renderReactForm,
  renderWcForm,
  type BlockFormId,
} from '../../ui/mcp/blocks/forms';

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
  const files = new Map<string, string>();
  for (const entry of item.files ?? []) {
    if (typeof entry.path !== 'string' || typeof entry.content !== 'string') {
      errors.push(`${sourceUrl}: files["${String(entry.path)}"] carries no inline "content"; a per-block item JSON is self-contained`);
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

// ---------------------------------------------------- framework detection

/**
 * The signals table (spec Part 3, detection ruling). DATA, so a new framework
 * variant is a row, not a branch: `lands` names the delivery form a project
 * with this dependency gets. Only react has its own form today; everything
 * else lands on the plain web-component files, which is the base form every
 * block is authored in.
 */
export const FRAMEWORK_SIGNALS: readonly { dep: string; lands: 'react' | 'wc' }[] = [
  { dep: 'react', lands: 'react' },
  { dep: 'preact', lands: 'wc' },
  { dep: 'vue', lands: 'wc' },
  { dep: 'svelte', lands: 'wc' },
  { dep: '@angular/core', lands: 'wc' },
  { dep: 'solid-js', lands: 'wc' },
];

export type BlockForm = BlockFormId;

export type Detection =
  | { kind: 'none' }
  | { kind: 'detected'; form: Exclude<BlockForm, 'cdn'>; found: string[] }
  | { kind: 'ambiguous'; found: string[] };

/** Read the detection off a parsed package.json, or its absence. */
export function detectForm(packageJson: unknown | null): Detection {
  if (packageJson === null || typeof packageJson !== 'object') return { kind: 'none' };
  const pkg = packageJson as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const found = FRAMEWORK_SIGNALS.filter((signal) => signal.dep in deps);
  const lands = new Set(found.map((signal) => signal.lands));
  if (lands.size > 1) return { kind: 'ambiguous', found: found.map((signal) => signal.dep) };
  if (lands.has('react')) return { kind: 'detected', form: 'react', found: found.map((s) => s.dep) };
  
  // Any other project - one non-react framework, several, or none at all -
  // gets the base web-component form: elements work everywhere.
  return { kind: 'detected', form: 'wc', found: found.map((s) => s.dep) };
}

/**
 * The ambiguous case as an axis, so the ask goes through the same `AxisIo`
 * seam every other create-kai question does and the menu-honesty discipline
 * (spy-driven tests over what was CALLED) applies to it.
 */
export function blockFormAxis(found: readonly string[]): Axis {
  return {
    id: 'block-form',
    label: 'Block form',
    question: `This project depends on ${found.join(' AND ')}; which form does the block land in?`,
    options: [
      { id: 'react', label: 'React', hint: 'a .tsx component plus the block files, registered via @kitn.ai/ui/react' },
      { id: 'wc', label: 'Web components', hint: 'the framework-neutral html + script + css form' },
    ],
    because: '',
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

const blockDir = (form: BlockForm, name: string) =>
  form === 'react' ? path.posix.join('src/blocks', name) : path.posix.join('blocks', name);

/**
 * Plan every write for a resolved add. Pure: the caller owns collision
 * checking and the filesystem. Throws when a block cannot be rendered in the
 * requested form - a refusal that names the reason, never a partial block.
 */
export function planAdd(resolved: ResolvedAdd, opts: PlanOptions): AddPlan {
  const plan: AddPlan = { files: [], dependencies: {}, docs: [], notes: [] };

  for (const block of resolved.blocks) {
    if (opts.form === 'cdn') {
      planCdnBlock(block, opts, plan);
    } else if (opts.form === 'react') {
      planReactBlock(block, plan);
    } else {
      planWcBlock(block, plan);
    }
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

// The three per-form file sets come from the ONE shared renderer
// (`agent-tooling/blocks/forms.ts` — the gallery serves the identical output);
// what stays here is what only the CLI knows: where the files land in the
// consumer's project, and the note printed about them.

function planWcBlock(block: Block, plan: AddPlan): void {
  const dir = blockDir('wc', block.name);
  for (const file of renderWcForm(block)) {
    plan.files.push({ path: path.posix.join(dir, file.path), contents: file.content });
  }
  const page = block.manifest.files.find((f) => f.type === 'registry:page');
  plan.notes.push(`${block.name}: web-component form under ${dir}/ (open ${path.posix.join(dir, page?.target ?? '')} through your dev server)`);
}

function planReactBlock(block: Block, plan: AddPlan): void {
  const dir = blockDir('react', block.name);
  for (const file of renderReactForm(block)) {
    plan.files.push({ path: path.posix.join(dir, file.path), contents: file.content });
  }
  plan.notes.push(`${block.name}: react form under ${dir}/ (render <${componentName(block.name)} /> from ${dir}/${componentName(block.name)}.tsx)`);
}

function planCdnBlock(block: Block, opts: PlanOptions, plan: AddPlan): void {
  for (const file of renderCdnFormFiles(block, { version: opts.kitVersion })) {
    plan.files.push({ path: file.path, contents: file.content });
  }
  plan.notes.push(
    `${block.name}: no project here, so this is the self-contained CDN paste form - open ${block.name}.html directly, or paste it into any page. To scaffold a project around it, run \`npm create kai@latest\`.`,
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
