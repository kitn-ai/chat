/**
 * The construct wizard — a small guided prompt sequence that composes a
 * `Construct` (Task 1's `@kitn.ai/ui/construct`) rather than the old
 * generate()/framework/feature-list flow this package already has.
 *
 * TESTS import the real `ConstructSchema`/`CONSTRUCT_SCHEMA_URL` from
 * `@kitn.ai/ui/construct` (see `test/wizard.test.ts`) — that part of Task 2's
 * design holds. What does NOT hold, discovered wiring this module into
 * `index.ts` for the first time in Task 3, is a *runtime* import of that
 * module from here: Task 2's header used to claim "esbuild bundles it (zod
 * included) ... this package stays a zero-runtime-dependency CLI either way,"
 * but `src/build-guards.ts`'s `bundleGraphProblem` bans `node_modules/zod`
 * from the CLI bundle outright (`scripts/build.mjs` — 505 kB no `npx
 * create-kai` run executes). Nothing caught the conflict at review time
 * because nothing imported this module yet, so the bundle graph never
 * actually included it — the exact "invisible at every seam being watched"
 * shape `bundleGraphProblem`'s own docstring warns about.
 *
 * `dist/construct.js` keeps `zod` external but is one bundled file with a
 * top-level `z.discriminatedUnion(...)` side effect building `ConstructSchema`
 * — esbuild cannot tree-shake past that to pull only `CONSTRUCT_SCHEMA_URL`,
 * so importing either one drags all of it (and zod) into `dist/index.js`.
 *
 * THE FIX: the codebase's OWN established mechanism for exactly this shape —
 * a build-time-only fact baked into the bundle as a string literal, the same
 * way `__KIT_RANGE__`/`__KIT_VERSION__`/`__CLI_VERSION__` already are (see
 * `types/globals.d.ts` and `scripts/build.mjs`'s `esbuild.build({ define })`).
 * `scripts/build.mjs` imports `CONSTRUCT_SCHEMA_URL` from the WORKSPACE
 * `@kitn.ai/ui/construct` in the build script's own node process — zod loads
 * there, never in the bundle — and substitutes it as `__CONSTRUCT_SCHEMA_URL__`.
 * This file references only the global; no import of `@kitn.ai/ui/construct`
 * survives here, so `bundleGraphProblem` never sees it. A hand-copied literal
 * was the first fix attempted and was correctly rejected: this repo's "derive
 * it, don't type it" rule applies even with a drift test watching it.
 *
 * W-2's REGISTRY-DRIFT GUARANTEE (a new `ConstructSchema` key goes red until
 * classified) now lives ENTIRELY IN THE TEST LAYER, not in the bundle:
 * `test/wizard.test.ts` imports the real `ConstructSchema` and drives the
 * registry/matrix checks against it directly — this file and the shipped
 * bundle never see the schema object at all, only the one string constant the
 * build substitutes. That is a narrower guarantee than an earlier sketch of
 * this feature assumed (validating a full schema object inside the CLI
 * itself), and it is the correct one given the bundle-size constraint: the
 * tests are still driven off the real, current schema on every run, so drift
 * is still caught — just never at `npx create-kai` runtime, which was never
 * going to re-validate its own output against a schema it cannot afford to
 * ship anyway.
 *
 * WHY A SEPARATE MODULE FROM `axes.ts`. `shapeAxis` IS a real `Axis` and
 * follows the same "ask or state" law `decideAxis`/`answerAxis` already
 * enforce — reused here, not reimplemented — but the rest of this file
 * (`WizardAnswers`, `composeConstruct`, `WIZARD_REGISTRY`, `runWizard`) has no
 * equivalent anywhere else in the package: it is the first thing in
 * `create-kai` that emits a *construct* rather than a scaffolded project.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildableTemplates, type BuildableTemplateId } from '@kitn.ai/ui/construct/templates';

import type { Axis, AxisOption } from './axes';

/**
 * The real schema URL, substituted at build (and test) time from the
 * workspace `@kitn.ai/ui/construct` — see this file's header. Aliased to a
 * local name rather than used inline, the same way `index.ts`'s
 * `DEFAULT_KIT_RANGE = __KIT_RANGE__` reads.
 */
const SCHEMA_URL = __CONSTRUCT_SCHEMA_URL__;

export type ShapeId = BuildableTemplateId | 'scratch' | 'app';

/**
 * "What are you building?" — the buildable-template list from the registry
 * (`@kitn.ai/ui/construct/templates`) plus 'scratch' and 'app', always asked
 * (never decided for the user): every template and 'scratch' compose a
 * construct via this wizard, seeded from the template's own starter, while a
 * full app needs the OLDER `generate()` scaffold (routing, a project shell)
 * that a bare construct cannot express — so this axis exists to route the
 * user to the right tool, not to narrow a single mechanism. `runWizard` only
 * accepts `Exclude<ShapeId, 'app'>`: the caller answers this axis first and
 * only reaches `runWizard` on the non-'app' branches, dispatching `'app'` to
 * the existing scaffold flow instead.
 */
export function shapeAxis(): Axis {
  const options: AxisOption[] = [
    // Derived from the registry (B-17a): labels/hints are the templates'
    // own names/one-liners, never restated. Only buildable templates are
    // offered — menu-honesty (voice stays a Labs story card).
    ...buildableTemplates().map((t) => ({ id: t.id, label: t.name, hint: t.description })),
    {
      id: 'scratch',
      label: 'Start from scratch',
      hint: 'a bare chat construct, everything off — you can switch to a template later',
    },
    {
      id: 'app',
      label: 'Full app',
      hint: 'a scaffolded project with routing and a shell, not just a chat construct',
    },
  ];
  return {
    id: 'shape',
    label: 'Shape',
    question: 'What are you building?',
    options,
    because:
      'each shape needs a different tool: the templates and "scratch" compose a construct ' +
      '(this wizard, seeded from the template registry), while "app" needs the project ' +
      'scaffold this wizard does not build',
  };
}

export interface WizardAnswers {
  name: string;
  shape: Exclude<ShapeId, 'app'>;
  /** undefined = keep the starter's header untouched; '' = no header title. */
  headerTitle?: string;
  /** undefined = keep the starter's home untouched; false removes it; true (re)writes the greeting. */
  home?: boolean;
  homeGreeting?: string;
  /** [] = keep the starter's list (the wizard cannot clear a list it did not write — stated). */
  starters: string[];
  attachments: boolean;
  history: boolean;
  /** undefined = keep the starter's accent untouched; '' = no accent. */
  accent?: string;
}

/** The stated default accept-list for `capabilities.attachments`. */
const DEFAULT_ATTACHMENTS_ACCEPT = ['image/*', 'application/pdf'];

/** The stated default greeting title, used when `home` is on and no title was given. */
const DEFAULT_HOME_GREETING_TITLE = 'How can we help?';

/**
 * The starter construct a shape seeds the wizard with. Templates come from
 * the registry (deep-cloned — answers must never mutate registry data);
 * 'scratch' is the bare fullscreen construct. The BASE Workspace starter is
 * used, never a variant: the CLI asks no variant question — the variants
 * are the builder's second screen (B-23), stated out loud in runWizard.
 */
function wizardStarter(shape: Exclude<ShapeId, 'app'>): Record<string, unknown> {
  if (shape === 'scratch') {
    return { $schema: SCHEMA_URL, name: '', layout: 'fullscreen', provider: { mode: 'mock' } };
  }
  const template = buildableTemplates().find((t) => t.id === shape);
  if (!template) throw new Error(`no buildable template '${shape}' in the registry`);
  return structuredClone(template.starter) as unknown as Record<string, unknown>;
}

/**
 * The real schema's rule for `Construct.name`, mirrored here — NOT imported,
 * for the same `bundleGraphProblem`/zod reason `SCHEMA_URL` above is a
 * substituted constant rather than a live import (see this file's header).
 * Unlike `SCHEMA_URL` this one isn't a single fact esbuild can hand over as a
 * finished string; it is a `RegExp` used to DECIDE, not just restate, so the
 * correctness bar is different: `test/wizard.test.ts` doesn't just compare
 * this pattern's source text against the real one, it runs `constructTagName`
 * over a representative sample of every character class
 * `validateProjectName` accepts and safeParses the RESULT against the real,
 * live `ConstructSchema` — proof the derivation is right regardless of
 * whether this mirror is byte-identical to the private regex in
 * `packages/ui/mcp/construct/schema.ts` (that regex is not
 * exported; even a test cannot import it directly).
 */
const CONSTRUCT_TAG_RE = /^[a-z][a-z0-9]*-[a-z0-9-]+$/;

/**
 * Map any project name `validateProjectName` accepts (directory-naming rules:
 * lowercase, digits, `- . _ ~`, optionally scoped, may start with a digit or
 * symbol) onto a name the construct schema accepts for `Construct.name` — a
 * custom-element tag: lowercase letters/digits/hyphens only, MUST start with
 * a letter, MUST contain a hyphen. The two rulesets disagree in exactly the
 * ways that made `create-kai myapp --shape widget --yes` write a construct
 * its own next-step command (`npx @kitn.ai/ui dev ...`) then rejected: no
 * hyphen, and `myapp` alone is otherwise valid everywhere else in this CLI.
 *
 * An already-valid tag passes through UNCHANGED — this only rewrites names
 * the schema would actually reject. Everything else is sanitized (lowercase,
 * every forbidden character collapsed to a hyphen, runs of hyphens
 * collapsed, a leading/trailing hyphen trimmed, a non-letter first character
 * given a `k-` prefix) and then given a kind-based suffix — `-widget` for the
 * one widget-layout template, `-chat` for everything else (fullscreen, split,
 * aside) — which is also what GUARANTEES the required hyphen exists no
 * matter how the sanitize step landed.
 *
 * Callers must STATE this when it actually changes the name (see
 * `index.ts`'s `runConstructFlow`) — a construct whose `name` silently
 * stopped matching what the user typed is exactly the kind of quiet
 * decision this repo's conventions ban.
 */
export function constructTagName(projectName: string, kind: 'widget' | 'chat'): string {
  if (CONSTRUCT_TAG_RE.test(projectName)) return projectName;

  let base = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!/^[a-z]/.test(base)) {
    base = base.length > 0 ? `k-${base}` : 'k';
  }

  return `${base}-${kind}`;
}

/**
 * Compose a construct from wizard answers. Every optional field follows one
 * rule: an unanswered/empty question is OMITTED, never emitted as an empty or
 * falsy value — the schema itself would reject some of those shapes (an empty
 * `starters` array fails its own `.min(1)`), and the rest would just be noise
 * in the construct file a user goes on to hand-edit.
 */
export function composeConstruct(a: WizardAnswers): unknown {
  const construct = wizardStarter(a.shape) as Record<string, unknown> & {
    header?: Record<string, unknown> & { title?: string };
    theme?: Record<string, unknown> & { accent?: string };
    home?: Record<string, unknown> & { greeting?: Record<string, unknown> };
    capabilities?: Record<string, unknown> & { history?: { persistence?: string } };
  };

  construct.$schema = SCHEMA_URL;
  construct.name = constructTagName(a.name, construct.layout === 'widget' ? 'widget' : 'chat');

  if (a.headerTitle !== undefined) {
    if (a.headerTitle.length > 0) {
      construct.header = { ...construct.header, title: a.headerTitle };
    } else if (construct.header) {
      delete construct.header.title;
      if (Object.keys(construct.header).length === 0) delete construct.header;
    }
  }

  if (a.accent !== undefined) {
    if (a.accent.length > 0) {
      construct.theme = { mode: 'system', ...construct.theme, accent: a.accent };
    } else if (construct.theme) {
      delete construct.theme.accent;
      if (Object.keys(construct.theme).length === 0) delete construct.theme;
    }
  }

  if (a.home !== undefined) {
    if (a.home) {
      const title =
        a.homeGreeting && a.homeGreeting.length > 0 ? a.homeGreeting : DEFAULT_HOME_GREETING_TITLE;
      construct.home = { ...construct.home, greeting: { ...construct.home?.greeting, title } };
    } else {
      delete construct.home;
    }
  }

  const capabilities: Record<string, unknown> = { ...construct.capabilities };
  if (a.starters.length > 0) capabilities.starters = a.starters.slice(0, 6);
  if (a.attachments) {
    capabilities.attachments = capabilities.attachments ?? { accept: DEFAULT_ATTACHMENTS_ACCEPT };
  } else {
    delete capabilities.attachments;
  }
  if (a.history) {
    // A starter that already persists keeps its exact shape (every persisting
    // starter ships its own history+conversations pair — pass it through,
    // never rebuild it); only history created from nothing gets the
    // local+conversations pair.
    if (!construct.capabilities?.history || construct.capabilities.history.persistence === 'none') {
      capabilities.history = { persistence: 'local' };
      capabilities.conversations = true;
    }
  } else {
    delete capabilities.history;
    // the schema rejects conversations with nowhere to persist — strip both.
    delete capabilities.conversations;
  }
  if (Object.keys(capabilities).length > 0) construct.capabilities = capabilities;
  else delete construct.capabilities;

  return construct;
}

/**
 * Write the construct `runWizard`'s answers compose to disk, refusing a
 * non-empty target dir the same way `generate()`'s scaffold flow does (see
 * `index.ts`'s own check right after the name prompt) — this function repeats
 * that check rather than trusting the caller to have already made it, because
 * it is reachable (and tested) on its own, not only through `index.ts`, which
 * is unimportable.
 *
 * The file name is derived from the project name, never asked separately —
 * `<name>.construct.json` — and the returned `devCommand` names that same
 * file relative to `dir`, since the CLI's own "Next steps" note always `cd`s
 * into `dir` first (see the `keyStep`/`steps` block in `index.ts`).
 *
 * `constructName` is `composeConstruct`'s `name` field handed back
 * separately, NOT re-read off the written JSON — so a caller (`index.ts`'s
 * `runConstructFlow`) can compare it against `answers.name` and STATE the
 * rewrite out loud whenever `constructTagName` actually changed it. The
 * FILE keeps the plain project name either way (see `constructTagName`'s own
 * header): only `Construct.name` has to satisfy the schema's stricter
 * custom-element-tag rule.
 */
export async function emitConstruct(
  dir: string,
  answers: WizardAnswers,
): Promise<{ file: string; devCommand: string; constructName: string }> {
  if (existsSync(dir) && (await readdir(dir)).length > 0) {
    throw new Error(`${dir} already exists and is not empty`);
  }
  await mkdir(dir, { recursive: true });

  const construct = composeConstruct(answers) as { name: string };
  const fileName = `${answers.name}.construct.json`;
  const file = path.join(dir, fileName);
  await writeFile(file, `${JSON.stringify(construct, null, 2)}\n`, 'utf8');

  return {
    file,
    devCommand: `npx @kitn.ai/ui dev ${fileName}`,
    constructName: construct.name,
  };
}

/** What `runDevPreview` resolves to — never rejects, so a caller cannot forget to handle a failure. */
export interface DevPreviewOutcome {
  ok: boolean;
  /** null on a normal end; a human-readable reason on failure — see below. */
  message: string | null;
}

/**
 * A `child_process.spawn`-shaped function, injected so `runDevPreview` is
 * testable without a real child process — a fake below drives both the
 * `error` event and a nonzero `close`, which is what this function exists to
 * turn into a decided-loudly failure rather than a swallowed one.
 */
export type SpawnLike = (
  command: string,
  args: readonly string[],
  options: { cwd: string; stdio: 'inherit'; shell: boolean },
) => {
  on(event: 'error', listener: (err: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
};

/**
 * Run the construct dev preview (`devCommand` from `emitConstruct`), stdio
 * inherited so the user sees the same live-reload server `npx @kitn.ai/ui
 * dev` would print on its own. Resolves once the child ends; NEVER throws, so
 * `index.ts` cannot accidentally let a rejection skip the fallback note.
 *
 * WHAT COUNTS AS A FAILURE, AND WHY NOT EVERY NONZERO CLOSE DOES. The normal
 * way to end a live-reload dev server is the user's own Ctrl-C — and per
 * Node's own `child_process` docs, a child terminated by a signal reports
 * `code: null` on `'close'`, not a nonzero code. Treating `null` as a failure
 * would print "preview failed" on every ordinary Ctrl-C, which is the
 * opposite of deciding loudly: it is crying wolf until the real failures stop
 * being read. So only two things are failures — the spawn itself erroring
 * (`ENOENT`: `npx` not resolvable) and the child exiting ON ITS OWN with an
 * explicit nonzero code (a crash or a "the file is invalid" refusal from `kai
 * dev` itself), never a signal-terminated stop.
 *
 * WINDOWS: `npx` resolves through a `.cmd` shim `shell: false` cannot exec
 * directly (ENOENT). `src/pm.ts`'s `detectPackageManager` + `index.ts`'s own
 * `run()` share this same bug for `npm install`/`pnpm install`/etc — NOT
 * fixed here, out of scope for this change; flagged as a follow-up rather
 * than copied into this new call site, which instead resolves it locally via
 * `shell: process.platform === 'win32'`.
 */
export function runDevPreview(
  devCommand: string,
  cwd: string,
  spawnFn: SpawnLike,
): Promise<DevPreviewOutcome> {
  return new Promise((resolve) => {
    const [command, ...args] = devCommand.split(' ');
    const child = spawnFn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', (err) => {
      resolve({ ok: false, message: `could not start the preview: ${err.message}` });
    });
    child.on('close', (code, signal) => {
      if (code === 0 || code === null) {
        // `code === null` is a signal-terminated end (Ctrl-C) — the normal
        // way to stop this, not a failure.
        resolve({ ok: true, message: null });
        return;
      }
      resolve({
        ok: false,
        message: `preview exited with code ${code}${signal ? ` (${signal})` : ''}`,
      });
    });
  });
}

export type RegistryStatus = 'asked' | 'stated' | 'not-asked';

export interface RegistryEntry {
  status: RegistryStatus;
  reason: string;
}

/**
 * Every `ConstructSchema` key, classified as asked (the wizard prompts for
 * it), stated (the wizard decides and prints it, never asks), or not-asked
 * (the guided flow does not touch it — hand-edit the construct file, or use
 * the `construct` MCP tool, for that vocabulary).
 *
 * `test/wizard.test.ts`'s registry-drift test derives the real key list from
 * `ConstructSchema` itself and fails here the moment a key exists in the
 * schema with no entry below — never hand-list the schema's keys anywhere
 * else, including in a future edit to this table.
 *
 * THE DRIFT GUARANTEE IS TOP-LEVEL PLUS `capabilities.*` ONLY — it is NOT
 * recursive. A key nested inside `home`, `widget`, or `theme` (e.g. a new
 * field added to `home` alongside `greeting`/`recentConversation`) has no
 * `WIZARD_REGISTRY` entry of its own and goes completely unnoticed by the
 * drift test: only `capabilities` gets the one extra level of unwrapping
 * `shapeOf()` does in the test. A schema change inside one of those three
 * objects needs a conscious read of `wizard.test.ts`'s `shapeOf()` calls,
 * not just a green run of this registry's own tests.
 */
export const WIZARD_REGISTRY: Record<string, RegistryEntry> = {
  $schema: {
    status: 'stated',
    reason: 'the wizard always stamps the construct schema URL so downstream tools can validate it; not a decision the user makes',
  },
  name: {
    status: 'stated',
    reason: 'the project name is already established before the wizard runs (the target directory); the wizard states it back rather than asking again',
  },
  layout: {
    status: 'asked',
    reason: "fixed by the chosen TEMPLATE's starter (or 'fullscreen' for scratch) — asked by shapeAxis BEFORE runWizard is invoked; runWizard itself never prompts for it directly, only receives the already-answered shape",
  },
  provider: {
    status: 'stated',
    reason: "provider: stated — the wizard's promise is a keyless first run; switch providers in the construct file after",
  },
  userId: {
    status: 'not-asked',
    reason: 'plain identity passthrough is an advanced, app-layer concern (see the schema\'s own doc comment on it); hand-edit the construct file to set it',
  },
  theme: {
    status: 'asked',
    reason: "the accent color is asked, prefilled with the template starter's own accent — accepting that prefill keeps it, while clearing the field to a blank answer removes the override (composeConstruct's own rule: '' means no accent, since accepting the prefill is how 'keep' is expressed). unreadColor and mode are left at their kit defaults — edit the construct file directly for those",
  },
  header: {
    status: 'asked',
    reason: "the header title is asked, prefilled with the template starter's own title — accepting that prefill keeps it, while clearing the field to a blank answer removes the title (composeConstruct's own rule: '' means no header title)",
  },
  empty: {
    status: 'not-asked',
    reason: 'a custom empty-state (title/description/icon) is not part of the guided flow; the home greeting and starters already cover onboarding — hand-edit the construct file to add one',
  },
  home: {
    status: 'asked',
    reason: "whether to show the home/greeting tab is asked, along with its title, prefilled with the template starter's own greeting (or the kit default if it has none) — accepting that prefill keeps it, while clearing the field to a blank answer falls back to the kit default greeting",
  },
  capabilities: {
    status: 'asked',
    reason: "the container for the capability questions below — see the capabilities.* entries for what is actually asked, stated, or left alone. runWizard never prompts for 'capabilities' as such; only its children carry a real question or statement",
  },
  cards: {
    status: 'not-asked',
    reason: 'generative-UI card definitions need a JSON tool schema the wizard cannot author interactively; use the construct MCP tool or hand-edit the file',
  },
  slots: {
    status: 'not-asked',
    reason: 'named slot projection is an advanced escape hatch for custom layouts, not offered by the guided flow',
  },
  widget: {
    status: 'not-asked',
    reason: 'layout-scoped widget chrome (position/launcherIcon/defaultOpen) keeps the kit\'s own Dock defaults; hand-edit the construct file to customize it',
  },
  aside: {
    status: 'not-asked',
    reason:
      'aside geometry (position/width) is seeded by the in-app-assistant template starter and passes through untouched; hand-edit the construct file to move or resize the rail',
  },
  workSurface: {
    status: 'not-asked',
    reason:
      "layout-scoped work-surface pane (kind/url/codeUrl/chrome), valid only on layout: 'split' — the same class as widget/aside: template data the workspace starter seeds (url and every chrome key stated) and the wizard passes through untouched; hand-edit the construct file, or use the builder, to point it at a real surface or change its chrome",
  },
  composer: {
    status: 'not-asked',
    reason:
      'composer triggers are template data (on for Workspace only — the ruling-8 default matrix lives in the registry starters); the wizard passes the starter through untouched and never prompts for trigger lists',
  },
  shell: {
    status: 'not-asked',
    reason:
      'shell chrome (command palette, user menu) is template data seeded by the Workspace starter; the wizard passes it through untouched — edit the construct file to change it',
  },
  'capabilities.starters': {
    status: 'asked',
    reason: "starter prompts are asked as a list (0-6); a blank answer keeps the template starter's value",
  },
  'capabilities.attachments': {
    status: 'asked',
    reason: 'whether to enable attachments is asked; the accept list itself is a stated default (image/* and application/pdf) rather than a second question',
  },
  'capabilities.history': {
    status: 'asked',
    reason: 'whether to persist conversation history is asked; the persistence mechanism (local) is a stated default, not a second question',
  },
  'capabilities.reasoning': {
    status: 'not-asked',
    reason: "reasoning display defaults to the kit's own 'full' behavior; not part of the guided flow",
  },
  'capabilities.reasoningOpen': {
    status: 'not-asked',
    reason: 'meaningless without customizing reasoning display first, and left at the kit default (closed) either way',
  },
  'capabilities.conversations': {
    status: 'stated',
    reason:
      "kept exactly as the template starter states it; created only when the wizard turns history on from nothing — the schema itself requires it whenever there is somewhere to persist a conversation list, so it is never asked separately",
  },
  'capabilities.messageActions': {
    status: 'not-asked',
    reason:
      'per-role action lists are template data (the research starter states the owner-default matrix); the wizard passes the starter through untouched — hand-edit or use the builder to reorder/toggle actions',
  },
  'capabilities.sources': {
    status: 'not-asked',
    reason:
      "the sources strip is the research template's defining fact, stated in its starter; the wizard passes it through untouched",
  },
};

/**
 * The two things `runWizard` needs from a terminal, injected rather than
 * imported — the same reason `AxisIo` in `axes.ts` is injected: it lets a test
 * drive the wizard with spies and assert what it CALLED, with no real prompt
 * stream in play.
 */
export interface WizardIo {
  text(msg: string, initial?: string): Promise<string>;
  confirm(msg: string, initial: boolean): Promise<boolean>;
  multilineList(msg: string): Promise<string[]>;
  state(label: string, statement: string): void;
}

/**
 * Run the guided flow for one shape and return the answers `composeConstruct`
 * turns into a construct. `nonInteractive` (the `--yes`/non-TTY path) asks
 * nothing and returns the same defaults `composeConstruct` can turn into a
 * valid construct on its own — mirroring `answerAxis`'s own non-interactive
 * rule in `axes.ts`.
 */
export async function runWizard(
  shape: Exclude<ShapeId, 'app'>,
  name: string,
  io: WizardIo,
  nonInteractive: boolean,
): Promise<WizardAnswers> {
  const starter = wizardStarter(shape) as {
    header?: { title?: string };
    theme?: { accent?: string };
    home?: { greeting?: { title?: string } };
    capabilities?: { attachments?: unknown; history?: { persistence?: string } };
  };
  const starterHasHistory = Boolean(
    starter.capabilities?.history && starter.capabilities.history.persistence !== 'none',
  );

  if (nonInteractive) {
    // Nothing asked OR stated (answerAxis's own non-interactive rule). All
    // "keep" sentinels — composeConstruct round-trips the starter unchanged.
    return {
      name,
      shape,
      headerTitle: undefined,
      home: undefined,
      homeGreeting: '',
      starters: [],
      attachments: Boolean(starter.capabilities?.attachments),
      history: starterHasHistory,
      accent: undefined,
    };
  }

  io.state('Schema', `${SCHEMA_URL} — every construct the wizard emits stamps this so tooling can validate it`);
  io.state('Name', `${name} — the project directory already fixed this`);
  io.state('Provider', 'mock — a keyless first run; switch providers in the construct file after');
  if (shape !== 'scratch') {
    io.state(
      'Template',
      `${shape} — seeded from the registry starter; each answer below overrides its field, and a blank answer keeps the template's value`,
    );
  }
  if (shape === 'workspace') {
    io.state(
      'Variant',
      'the base Workspace starter — pick artifact-preview or app-preview in the builder, or hand-edit the file',
    );
  }

  const headerTitle = await io.text('Header title? (clear the field for none)', starter.header?.title ?? '');
  const accent = await io.text('Accent color? (clear the field for the kit default)', starter.theme?.accent ?? '');
  const home = await io.confirm('Show a home/greeting screen?', Boolean(starter.home));
  const homeGreeting = home
    ? await io.text(
        'Greeting title? (clear the field for the default)',
        starter.home?.greeting?.title ?? DEFAULT_HOME_GREETING_TITLE,
      )
    : '';
  const starters = await io.multilineList(
    "Starter prompts (comma-separated, up to 6, blank to keep the template's)",
  );
  const attachments = await io.confirm('Allow file attachments?', Boolean(starter.capabilities?.attachments));
  const history = await io.confirm(
    'Persist conversation history in this browser?',
    starterHasHistory || shape === 'scratch',
  );

  if (history && !starterHasHistory) {
    io.state('Conversations', 'enabled — turned on automatically because history is on');
  }

  return {
    name,
    shape,
    headerTitle,
    home,
    homeGreeting,
    starters: starters.slice(0, 6),
    attachments,
    history,
    accent,
  };
}
