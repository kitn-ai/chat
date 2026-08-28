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

import type { Axis, AxisOption } from './axes';

/**
 * The real schema URL, substituted at build (and test) time from the
 * workspace `@kitn.ai/ui/construct` — see this file's header. Aliased to a
 * local name rather than used inline, the same way `index.ts`'s
 * `DEFAULT_KIT_RANGE = __KIT_RANGE__` reads.
 */
const SCHEMA_URL = __CONSTRUCT_SCHEMA_URL__;

export type ShapeId = 'widget' | 'fullscreen' | 'app';

/**
 * "What are you building?" — a real three-way choice, always asked (never
 * decided for the user): a widget only makes sense embedded in an existing
 * page, a full-screen chat only makes sense as the whole page, and a full app
 * needs the OLDER `generate()` scaffold (routing, a project shell) that a
 * bare construct cannot express — so this axis exists to route the user to
 * the right tool, not to narrow a single mechanism. `runWizard` only accepts
 * `'widget' | 'fullscreen'`: the caller answers this axis first and only
 * reaches `runWizard` on those two branches, dispatching `'app'` to the
 * existing scaffold flow instead.
 */
export function shapeAxis(): Axis {
  const options: AxisOption[] = [
    {
      id: 'widget',
      label: 'Embedded widget',
      hint: 'a floating launcher that sits on top of an existing page',
    },
    {
      id: 'fullscreen',
      label: 'Full-screen chat',
      hint: 'the chat is the whole page',
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
      'each shape needs a different tool: "widget" and "fullscreen" compose a construct ' +
      '(this wizard), while "app" needs the project scaffold this wizard does not build',
  };
}

export interface WizardAnswers {
  name: string;
  shape: Exclude<ShapeId, 'app'>;
  /** '' means "no header" — omitted from the emitted construct. */
  headerTitle?: string;
  /** true emits `home: { greeting: { title } } }`. */
  home: boolean;
  /** the greeting title when `home` is true; '' falls back to a stated default. */
  homeGreeting?: string;
  /** 0-6 starter prompts; an empty array omits `capabilities.starters` (the schema requires min 1). */
  starters: string[];
  /** true emits the stated default accept list. */
  attachments: boolean;
  /** true emits `history: { persistence: 'local' }` AND `conversations: true`. */
  history: boolean;
  /** '' means "no accent" — omitted from the emitted construct's theme. */
  accent?: string;
}

/** The stated default accept-list for `capabilities.attachments`. */
const DEFAULT_ATTACHMENTS_ACCEPT = ['image/*', 'application/pdf'];

/** The stated default greeting title, used when `home` is on and no title was given. */
const DEFAULT_HOME_GREETING_TITLE = 'How can we help?';

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
 * `packages/ui/src/agent-tooling/construct/schema.ts` (that regex is not
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
 * given a `k-` prefix) and then given a shape-based suffix — `-widget` or
 * `-chat` for fullscreen — which is also what GUARANTEES the required
 * hyphen exists no matter how the sanitize step landed.
 *
 * Callers must STATE this when it actually changes the name (see
 * `index.ts`'s `runConstructFlow`) — a construct whose `name` silently
 * stopped matching what the user typed is exactly the kind of quiet
 * decision this repo's conventions ban.
 */
export function constructTagName(projectName: string, shape: Exclude<ShapeId, 'app'>): string {
  if (CONSTRUCT_TAG_RE.test(projectName)) return projectName;

  let base = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!/^[a-z]/.test(base)) {
    base = base.length > 0 ? `k-${base}` : 'k';
  }

  const suffix = shape === 'widget' ? 'widget' : 'chat';
  return `${base}-${suffix}`;
}

/**
 * Compose a construct from wizard answers. Every optional field follows one
 * rule: an unanswered/empty question is OMITTED, never emitted as an empty or
 * falsy value — the schema itself would reject some of those shapes (an empty
 * `starters` array fails its own `.min(1)`), and the rest would just be noise
 * in the construct file a user goes on to hand-edit.
 */
export function composeConstruct(a: WizardAnswers): unknown {
  const capabilities: Record<string, unknown> = {};
  if (a.starters.length > 0) capabilities.starters = a.starters;
  if (a.attachments) capabilities.attachments = { accept: DEFAULT_ATTACHMENTS_ACCEPT };
  if (a.history) {
    capabilities.history = { persistence: 'local' };
    capabilities.conversations = true;
  }

  const construct: Record<string, unknown> = {
    $schema: SCHEMA_URL,
    // NOT `a.name` — see `constructTagName`'s header. The project directory
    // name and the construct's own `Construct.name` are different
    // vocabularies (directory rules vs. a custom-element tag rule), and this
    // is the one place they're allowed to diverge.
    name: constructTagName(a.name, a.shape),
    layout: a.shape,
    provider: { mode: 'mock' },
  };

  if (a.headerTitle && a.headerTitle.length > 0) {
    construct.header = { title: a.headerTitle };
  }
  if (a.home) {
    const title =
      a.homeGreeting && a.homeGreeting.length > 0 ? a.homeGreeting : DEFAULT_HOME_GREETING_TITLE;
    construct.home = { greeting: { title } };
  }
  if (a.accent && a.accent.length > 0) {
    construct.theme = { accent: a.accent };
  }
  if (Object.keys(capabilities).length > 0) {
    construct.capabilities = capabilities;
  }

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

  const construct = composeConstruct(answers);
  const fileName = `${answers.name}.construct.json`;
  const file = path.join(dir, fileName);
  await writeFile(file, `${JSON.stringify(construct, null, 2)}\n`, 'utf8');

  return {
    file,
    devCommand: `npx @kitn.ai/ui dev ${fileName}`,
    constructName: constructTagName(answers.name, answers.shape),
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
    reason: "the shape axis (widget vs. fullscreen vs. app) decides this — widget/fullscreen map straight onto the construct's layout value. Asked by shapeAxis BEFORE runWizard is invoked; runWizard itself never prompts for it directly, only receives the already-answered shape",
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
    reason: 'the accent color is asked; unreadColor and mode are left at their kit defaults — edit the construct file directly for those',
  },
  header: {
    status: 'asked',
    reason: 'the header title is asked; an empty answer omits the header entirely rather than emitting one with nothing in it',
  },
  empty: {
    status: 'not-asked',
    reason: 'a custom empty-state (title/description/icon) is not part of the guided flow; the home greeting and starters already cover onboarding — hand-edit the construct file to add one',
  },
  home: {
    status: 'asked',
    reason: 'whether to show the home/greeting tab is asked, along with its title',
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
  'capabilities.starters': {
    status: 'asked',
    reason: 'starter prompts are asked as a list (0-6); an empty answer omits the key, since the schema itself requires at least one entry when present',
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
    reason: 'always true exactly when history is enabled — the schema itself requires it whenever there is somewhere to persist a conversation list, so it is never asked separately',
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
  // Nothing is asked OR stated in non-interactive mode — the same rule
  // `answerAxis` follows in `axes.ts`: there is no prompt stream to leave a
  // gap in, and `--yes` output is read by scripts. `shape` arrives already
  // answered (by `shapeAxis`, before this function is ever called), so this
  // branch needs nothing from `io` at all.
  if (nonInteractive) {
    return {
      name,
      shape,
      headerTitle: '',
      home: false,
      homeGreeting: '',
      starters: [],
      attachments: false,
      history: false,
      accent: '',
    };
  }

  // Every `io.state` call below corresponds to exactly one WIZARD_REGISTRY
  // key with status 'stated' that THIS function is responsible for stating —
  // '$schema', 'name', 'provider' unconditionally, 'capabilities.conversations'
  // only when history is on. 'layout' is also 'stated' upstream by whatever
  // decided the shape axis before calling runWizard, but that is not this
  // function's job to restate. `test/wizard.test.ts` drives this
  // correspondence exactly, in both directions.
  io.state('Schema', `${SCHEMA_URL} — every construct the wizard emits stamps this so tooling can validate it`);
  io.state('Name', `${name} — the project directory already fixed this`);
  io.state('Provider', "mock — a keyless first run; switch providers in the construct file after");

  const headerTitle = await io.text('Header title? (leave blank for none)', '');
  const accent = await io.text('Accent color? (leave blank for the kit default)', '');
  const home = await io.confirm('Show a home/greeting screen?', true);
  const homeGreeting = home
    ? await io.text('Greeting title? (leave blank for the default)', DEFAULT_HOME_GREETING_TITLE)
    : '';
  const starters = await io.multilineList('Starter prompts (comma-separated, up to 6, blank to skip)');
  const attachments = await io.confirm('Allow file attachments?', false);
  const history = await io.confirm('Persist conversation history in this browser?', true);

  if (history) {
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
