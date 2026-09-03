/**
 * The `add` subcommand: `create-kai add <block | item-json-url>`.
 *
 * The wizard is the from-scratch door; this is the into-an-existing-project
 * door. The flow is the spec's simplified shadcn flow and nothing more:
 * resolve the item and its registryDependencies (blocks recurse, routes come
 * from the scaffolder catalog), merge npm deps, write files to targets, print
 * the manifest's `docs`. Detection reads the host project instead of asking
 * what it can see; the one question it may ask is the ambiguous case, and it
 * goes through the same `AxisIo` seam as every other create-kai question so
 * the menu-honesty tests can drive it with spies.
 *
 * Importable by tests on purpose (`index.ts` is not): everything effectful is
 * injected through `AddEnv`, and `index.ts` passes the real terminal, the real
 * bundle constants and the bundled `dist/blocks` directory.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { BLOCK_FORMS, README_FILE } from '@kitn.ai/blocks/forms';

import type { AxisIo } from './axes';
import {
  blockFormAxis,
  blockFromItemJson,
  detectForm,
  loadBlocks,
  planAdd,
  resolveAdd,
} from './blocks';
import type { AddPlan, Block, BlockForm } from './blocks';

export interface AddEnv {
  cwd: string;
  /** the bundled blocks directory (dist/blocks for the real CLI) */
  blocksRoot: string;
  /** the @kitn.ai/ui range the CLI pins (__KIT_RANGE__ for the real CLI) */
  kitRange: string;
  /** the exact kit version the CLI was built against (__KIT_VERSION__) */
  kitVersion: string;
  /** false under --yes or with no TTY: the ambiguous ask REFUSES instead */
  interactive: boolean;
  io: AxisIo;
  out(line: string): void;
  error(line: string): void;
  /** fetch a per-block item JSON URL; injectable so tests never hit a network */
  fetchJson?(url: string): Promise<unknown>;
}

interface AddArgs {
  item?: string;
  list: boolean;
  json: boolean;
  yes: boolean;
  dir?: string;
  form?: string;
  errors: string[];
}

// THE form axis, read from `@kitn.ai/blocks/forms` and not restated: a fourth
// delivery form joins `BLOCK_FORMS` and this flag accepts it, help text and
// refusal message included, with nothing here to update.
const FORM_IDS: readonly string[] = BLOCK_FORMS.map((form) => form.id);
/** `html, react or cdn` -- the refusal message's list, in the axis's order. */
const FORM_PROSE = `${FORM_IDS.slice(0, -1).join(', ')} or ${FORM_IDS[FORM_IDS.length - 1]}`;

export const ADD_HELP = `
create-kai add <block>       write a block from the registry into this project
create-kai add <url>         resolve a per-block item JSON URL the same way

  --list [--json]            print the blocks this release ships and exit
  --form <${FORM_IDS.join('|')}>    override framework detection
  --dir <path>               target project directory (default: cwd)
  -y, --yes                  non-interactive; an ambiguous detection fails instead of asking
`;

export function parseAddArgs(argv: readonly string[]): AddArgs {
  const out: AddArgs = { list: false, json: false, yes: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--list': out.list = true; break;
      case '--json': out.json = true; break;
      case '-y': case '--yes': out.yes = true; break;
      case '--dir':
      case '--form': {
        const value = argv[++i];
        if (value === undefined) out.errors.push(`${arg} needs a value`);
        else if (arg === '--dir') out.dir = value;
        else out.form = value;
        break;
      }
      case '-h': case '--help': break; // the caller prints ADD_HELP on no item
      default:
        if (arg.startsWith('-')) out.errors.push(`unknown flag ${arg}`);
        else if (out.item === undefined) out.item = arg;
        else out.errors.push(`unexpected argument ${arg}`);
    }
  }
  if (out.form !== undefined && !FORM_IDS.includes(out.form)) {
    out.errors.push(`--form must be ${FORM_PROSE}, got '${out.form}'`);
  }
  return out;
}

/** The nearest package.json walking up from `dir`, parsed, or null. */
export async function nearestPackageJson(dir: string): Promise<{ path: string; pkg: unknown } | null> {
  let current = path.resolve(dir);
  for (;;) {
    const candidate = path.join(current, 'package.json');
    if (existsSync(candidate)) {
      try {
        return { path: candidate, pkg: JSON.parse(await readFile(candidate, 'utf8')) };
      } catch {
        return { path: candidate, pkg: null };
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Decide the delivery form: flag > detection, with the ambiguous case asked
 * loudly (interactive) or refused with what was found named (non-interactive).
 * Returns the form, or an error string.
 */
export async function decideForm(
  override: string | undefined,
  packageJson: unknown | null,
  hasProject: boolean,
  interactive: boolean,
  io: AxisIo,
): Promise<{ form?: BlockForm; error?: string; note?: string }> {
  if (override !== undefined) return { form: override as BlockForm };
  if (!hasProject) return { form: 'cdn' };
  const detection = detectForm(packageJson);
  if (detection.kind === 'ambiguous') {
    if (!interactive) {
      return {
        error:
          `this project depends on ${detection.found.join(' AND ')}, so the block form is ambiguous. ` +
          `Pass ${detection.forms.map((form) => `--form ${form}`).join(' or ')}.`,
      };
    }
    const axis = blockFormAxis(detection.found, detection.forms);
    const answer = await io.ask(axis, axis.options[0].id);
    return { form: answer as BlockForm };
  }
  if (detection.kind === 'none') return { form: 'html' };
  return {
    form: detection.form,
    // DECIDED LOUDLY. Landing a vue project on the framework-neutral form is a
    // decision, and a decision made without saying so is the failure mode this
    // repo names most often. The sentence states the framework, the form and
    // the reason; the trees for the remaining frameworks arrive with the rest
    // of the renderers (spec 3.5).
    // COUPLED: scripts/verify-add.mjs's otherFrameworkLeg matches on the
    // literal fragment "generates no vue tree yet" below. Change that check
    // too if you reword this sentence.
    note:
      detection.fallback.length === 0
        ? undefined
        : `this project uses ${detection.fallback.join(' and ')}, and this release generates no ${detection.fallback.join('/')} tree yet, ` +
          `so the block lands in the framework-neutral html form (the kai- elements work in every framework). ` +
          `The generated ${detection.fallback.join(' and ')} trees arrive with the remaining renderers.`,
  };
}

/** Merge the plan's dependencies into package.json text; existing entries win. */
export function mergeDependencies(
  pkgText: string,
  dependencies: Record<string, string>,
): { text: string; added: string[]; kept: string[] } {
  const pkg = JSON.parse(pkgText) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const added: string[] = [];
  const kept: string[] = [];
  for (const [name, version] of Object.entries(dependencies)) {
    if (pkg.dependencies?.[name] !== undefined || pkg.devDependencies?.[name] !== undefined) {
      kept.push(name);
      continue;
    }
    pkg.dependencies = { ...pkg.dependencies, [name]: version };
    added.push(name);
  }
  // Preserve the file's own indentation style where detectable; two spaces is
  // what every template in this repo writes.
  return { text: `${JSON.stringify(pkg, null, 2)}\n`, added, kept };
}

/** The paths in `plan` that already exist under `root` - the refusal list. */
export function collisions(plan: AddPlan, root: string): string[] {
  return plan.files.filter((file) => existsSync(path.join(root, file.path))).map((file) => file.path);
}

export async function runAdd(argv: readonly string[], env: AddEnv): Promise<number> {
  const args = parseAddArgs(argv);
  if (args.errors.length) {
    for (const error of args.errors) env.error(`create-kai add: ${error}`);
    env.error(ADD_HELP);
    return 1;
  }

  let blocks: Block[];
  try {
    blocks = await loadBlocks(env.blocksRoot);
  } catch (error) {
    env.error(`create-kai add: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  if (args.list) {
    if (args.json) {
      env.out(JSON.stringify({ blocks: blocks.map((b) => b.manifest) }, null, 2));
    } else {
      for (const block of blocks) {
        env.out(`  ${block.name.padEnd(20)}${block.manifest.title} - ${block.manifest.description}`);
      }
      env.out(`${blocks.length} block${blocks.length === 1 ? '' : 's'} in this release`);
    }
    return 0;
  }

  if (!args.item) {
    env.error(ADD_HELP);
    return 1;
  }

  const targetDir = path.resolve(env.cwd, args.dir ?? '.');
  const near = await nearestPackageJson(targetDir);
  const interactive = env.interactive && !args.yes;

  const decided = await decideForm(args.form, near?.pkg ?? null, near !== null, interactive, env.io);
  if (decided.error || !decided.form) {
    env.error(`create-kai add: ${decided.error ?? 'no delivery form decided'}`);
    return 1;
  }
  const form = decided.form;
  if (decided.note) env.out(`create-kai add: ${decided.note}`);
  // Where files land: the project root that owns the detected package.json,
  // so `add` from a subdirectory does not scatter blocks/ trees; the cdn form
  // lands where the command ran.
  const root = form === 'cdn' || !near ? targetDir : path.dirname(near.path);

  if (form === 'cdn' && !near) {
    env.out('No project here (no package.json up from this directory), so you get the self-contained CDN paste form.');
    env.out('For a scaffolded project, run `npm create kai@latest` (the wizard).');
  }

  let plan: AddPlan;
  try {
    const resolved = await resolveAdd(args.item, {
      local: (name) => blocks.find((b) => b.name === name),
      fetchItem: async (url) => {
        const json = env.fetchJson
          ? await env.fetchJson(url)
          : await (await fetch(url)).json();
        const parsed = blockFromItemJson(json, url);
        if (!parsed.block) throw new Error(parsed.errors.join('; '));
        return parsed.block;
      },
    });
    plan = planAdd(resolved, { form, kitRange: env.kitRange, kitVersion: env.kitVersion });
  } catch (error) {
    env.error(`create-kai add: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  // COLLISION REFUSAL, whole-plan and loud: existing files are never
  // overwritten, and a partial block is worse than none, so one collision
  // refuses every write and lists them all.
  const existing = collisions(plan, root);
  if (existing.length) {
    env.error(
      `create-kai add: refusing to overwrite ${existing.length} existing file${existing.length === 1 ? '' : 's'}:`,
    );
    for (const file of existing) env.error(`  ${file}`);
    env.error('Move or delete them first; add never overwrites.');
    return 1;
  }

  for (const file of plan.files) {
    const absolute = path.join(root, file.path);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, file.contents, 'utf8');
    env.out(`  write ${file.path}`);
  }

  if (near && form !== 'cdn' && Object.keys(plan.dependencies).length) {
    const merged = mergeDependencies(await readFile(near.path, 'utf8'), plan.dependencies);
    if (merged.added.length) {
      await writeFile(near.path, merged.text, 'utf8');
      env.out(`  deps  ${merged.added.map((name) => `${name}@${plan.dependencies[name]}`).join(', ')} added to package.json; run your package manager's install`);
    }
    for (const name of merged.kept) {
      env.out(`  deps  ${name} already in package.json; kept as is`);
    }
  }

  for (const note of plan.notes) env.out(note);

  // THE README, VERBATIM. Every project-shaped form ships one (spec 3.5): what
  // the block needs, and the one framework-config line where there is one.
  // Writing it without printing it ends the command on a file list and leaves
  // the consumer to go find the thing that explains the files.
  //
  // Matched on the renderer's OWN constant rather than the string "README.md",
  // and on the basename because the path is the project-relative target.
  const readmes = plan.files.filter((file) => path.posix.basename(file.path) === README_FILE);
  for (const readme of readmes) {
    env.out('');
    for (const line of readme.contents.trimEnd().split('\n')) env.out(line);
  }

  // `docs` is the LAST line of every README, so printing it again under a form
  // that shipped one puts the same paragraph on the terminal twice. The cdn
  // paste form has no README, and this is the only way its docs are seen.
  if (readmes.length === 0) for (const docs of plan.docs) env.out(docs);
  return 0;
}
