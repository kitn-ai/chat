/**
 * create-kai — scaffold a runnable @kitn.ai/ui chat app.
 *
 * The `#!/usr/bin/env node` line is added by esbuild's banner in
 * scripts/build.mjs, not written here: with both, the bundle carries two
 * shebangs and the second one is a syntax error at line 2.
 *
 * `npm create kai@latest` / `npx create-kai`.
 *
 * The flow's only job is to fill in a `ProjectPlan`; `generate()` does the rest.
 * Every prompt has a default, and pressing Enter through all of them yields
 * React + full-screen + conversation history + the local mock: a project that
 * streams a canned reply on the first `npm run dev`, with no key and no backend.
 */
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import * as p from '@clack/prompts';
import pc from 'picocolors';

import { ZERO_CONFIG, defaultNameForTarget, normalizeGateway, parseArgs, validateProjectName } from './args';
import { answerAxis, gatewayAxis, layoutAxis } from './axes';
import type { AxisIo } from './axes';
import { WIRED_GATEWAYS, listGateways, wirableGateway } from './catalog';
import {
  DEFAULT_FEATURES,
  FEATURES,
  availableFeatures,
  composedWorkspaceFeatures,
  featureUnavailableReason,
  getFeature,
  resolveSurface,
} from './features';
import type { FeatureDef } from './features';
import { FRAMEWORKS, getFramework, readyFrameworks } from './frameworks';
import { generate } from './generate';
import { LAYOUTS, getLayout, readyLayouts } from './layouts';
import { detectPackageManager } from './pm';
import type { Layout, ProjectPlan } from './types';
import { emitConstruct, runDevPreview, runWizard, shapeAxis } from './wizard';
import type { ShapeId, WizardIo } from './wizard';

/**
 * The feature ids `--features` accepts — every id at least one ready framework
 * can actually scaffold, derived rather than typed.
 *
 * `FEATURES.map(f => f.id)` is what the help text used to print, and it listed
 * six while five of them refused. The union across ready frameworks is the
 * honest answer for a static help string: per-framework availability is only
 * knowable once a framework is chosen, and the refusal below names it then.
 */
const OFFERABLE_FEATURE_IDS = [
  ...new Set(readyFrameworks().flatMap((f) => availableFeatures(f).map((feature) => feature.id))),
];

/**
 * The `@kitn.ai/ui` range an emitted project pins.
 *
 * Derived from the workspace kit's own version at build time rather than
 * written here, so the pin cannot drift from the kit the templates were copied
 * from — the templates and the range come out of the same build.
 *
 * That derivation is correct at the moment of the build and DECAYS afterwards:
 * a caret cannot cross a minor pre-1.0, so once the kit publishes a new minor,
 * whatever `create-kai` is on the registry pins a range that can no longer
 * reach it. `create-kai@0.1.2` sat on `^0.24.0` after `0.24.0` was deprecated
 * for a critical XSS. Nothing here can fix that — the fix is to re-cut a
 * release — so the check lives where the registry is visible:
 * `scripts/verify-pin.mjs`, whose rules are in `src/pin-guards.ts`.
 *
 * The whole RANGE arrives substituted, not the bare version with a caret added
 * here: `scripts/build.mjs` derives it through `src/kit-pin.ts`, which is also
 * what the guard imports. That keeps one definition of the shape, and it leaves
 * the pin in the published bundle as a plain string the guard can read back.
 */
const DEFAULT_KIT_RANGE = __KIT_RANGE__;

const HELP = `
${pc.bold('create-kai')} — scaffold a runnable @kitn.ai/ui chat app

  ${pc.dim('npm create kai@latest')}
  ${pc.dim('npx create-kai my-app')}

Options
  --framework <id>     ${readyFrameworks().map((f) => f.id).join(', ')}
  --layout <id>        ${readyLayouts().map((l) => l.id).join(', ')}
  --features <a,b>     ${OFFERABLE_FEATURE_IDS.join(', ')}  (or 'none')
  --gateway <id>       none${[...WIRED_GATEWAYS].filter((g) => g !== 'mock').map((g) => `, ${g}`).join('')}
  --kit <spec>         @kitn.ai/ui spec to pin (default ${DEFAULT_KIT_RANGE})
  -y, --yes            accept every default (zero-config: React + full-screen + mock)
  --no-install         skip installing dependencies
  --list [--json]      print the framework / feature / gateway matrix and exit
  -h, --help           this
  -v, --version        print version
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.errors.length > 0) {
    for (const error of args.errors) console.error(pc.red(`create-kai: ${error}`));
    console.error(HELP);
    return 1;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  if (args.version) {
    console.log(__CLI_VERSION__);
    return 0;
  }
  if (args.list) {
    printMatrix(args.json);
    return 0;
  }

  const nonInteractive = args.yes || !process.stdout.isTTY;

  p.intro(pc.bgMagenta(pc.black(' create-kai ')));

  // ── 1. project name ────────────────────────────────────────────────────────
  //
  // NOT `args.dir ?? ZERO_CONFIG.name`: the raw positional is a PATH, and a
  // path is almost never also a valid package name (`.`, a trailing slash, a
  // nested `apps/my-app`). `defaultNameForTarget` derives the name from the
  // resolved directory's own basename instead — Vite/TanStack parity, and it
  // is what makes `npm create kai .` name the project after the cwd rather
  // than failing on `.` itself.
  const defaultName = defaultNameForTarget(args.dir, process.cwd());
  const name = nonInteractive
    ? defaultName
    : await ask(
        p.text({
          message: 'Project name',
          placeholder: defaultName,
          defaultValue: defaultName,
          validate: (value) => validateProjectName(value || defaultName) ?? undefined,
        }),
      );

  const nameError = validateProjectName(name);
  if (nameError) return fail(nameError);

  const dir = path.resolve(process.cwd(), args.dir ?? name);
  if (existsSync(dir) && (await readdir(dir)).length > 0) {
    return fail(`${dir} already exists and is not empty`);
  }

  // ── 2. shape ───────────────────────────────────────────────────────────────
  //
  // "What would you like to create?" — a real three-way choice
  // (widget/fullscreen/app), always asked (see `shapeAxis`'s own header in
  // `wizard.ts`). `--shape` is a flag override, and `answerAxis` hands an
  // override straight back to its caller UNVALIDATED (see `axes.ts`'s
  // `answerAxis`: `if (opts.override !== undefined) return opts.override;`
  // with no membership check) — so an unknown id would otherwise sail through
  // to `runWizard`/the framework switch below and fail confusingly deep in
  // the flow instead of here. Validated against the axis's own option ids,
  // the same shape `--framework`'s `getFramework(...)` check below takes.
  const shapes = shapeAxis();
  if (args.shape !== undefined && !shapes.options.some((o) => o.id === args.shape)) {
    return fail(
      `unknown shape '${args.shape}'. Available: ${shapes.options.map((o) => o.id).join(', ')}`,
    );
  }
  const shapeId = (await answerAxis(
    shapes,
    { override: args.shape, nonInteractive, fallback: 'app' },
    clackAxisIo,
  )) as ShapeId;

  // 'app' → the existing flow below, byte-identical to before this task:
  // widget/fullscreen route to the construct wizard instead and return here.
  if (shapeId !== 'app') {
    return runConstructFlow(shapeId, name, dir, nonInteractive);
  }

  // ── 3. framework ───────────────────────────────────────────────────────────
  const frameworkId = args.framework ?? (nonInteractive
    ? ZERO_CONFIG.framework
    : await ask(
        p.select({
          message: 'Which framework?',
          initialValue: ZERO_CONFIG.framework,
          options: readyFrameworks().map((f) => ({ value: f.id, label: f.label })),
        }),
      ));

  const framework = getFramework(frameworkId);
  if (!framework) return fail(`unknown framework '${frameworkId}'`);
  if (framework.status !== 'ready') {
    return fail(
      `'${framework.id}' is not scaffoldable yet (${framework.note ?? 'no template'}). ` +
        `Available: ${readyFrameworks().map((f) => f.id).join(', ')}`,
    );
  }

  // ── 3. layout ──────────────────────────────────────────────────────────────
  //
  // A PROMPT WITH ONE POSSIBLE ANSWER IS NOT A QUESTION. `widget` is
  // `status: 'planned'`, so this select rendered a single option and asked the
  // user to choose it — which reads as a menu that has lost its other entries,
  // and takes a keystroke to answer nothing. The rule, and the stated line that
  // replaces the question, live in `axes.ts` so the gateway axis below cannot
  // answer the same question differently. It did: it took its single answer in
  // silence.
  const layouts = layoutAxis();
  if (layouts.options.length === 0) {
    return fail('no layout in this release can be scaffolded — this build is broken');
  }
  const layoutId = (await answerAxis(
    layouts,
    { override: args.layout, nonInteractive, fallback: ZERO_CONFIG.layout },
    clackAxisIo,
  )) as Layout;

  const layout = getLayout(layoutId);
  if (!layout) return fail(`unknown layout '${layoutId}'`);
  if (layout.status !== 'ready') {
    return fail(
      `layout '${layout.id}' is not scaffoldable yet (${layout.note ?? 'no template'}). ` +
        `Available: ${layouts.options.map((l) => l.id).join(', ')}`,
    );
  }

  // ── 3a. features ───────────────────────────────────────────────────────────
  //
  // THE MENU IS `availableFeatures`, AND ONLY THAT. It used to be all six rows
  // of `FEATURES`; five of them refused after the last prompt, and so did
  // deselecting everything. What is left is split by whether the user has a
  // choice to make: the composed workspace starter is copied whole, so what it
  // brings is stated, and only what can be added on top is offered.
  const offered = availableFeatures(framework);
  const included = composedWorkspaceFeatures(framework);
  const optional = offered.filter((f) => !included.includes(f));
  const withheld = FEATURES.filter((f) => !offered.includes(f));

  const featureIds = args.features ?? (nonInteractive || optional.length === 0
    ? DEFAULT_FEATURES.filter((id) => offered.some((f) => f.id === id))
    : await ask(
        p.multiselect({
          message: 'Which features?',
          required: false,
          initialValues: DEFAULT_FEATURES.filter((id) => optional.some((f) => f.id === id)),
          options: optional.map((f) => ({ value: f.id, label: f.label, hint: f.hint })),
        }),
      ));

  // Every refusal a feature can earn, BEFORE a single file is written and with
  // what is available named in the same breath. `generate` refuses the same
  // requests, but it is reached after the gateway prompt — a `--features
  // sources` run should not answer three more questions first.
  for (const id of featureIds) {
    const feature = getFeature(id);
    if (!feature) {
      return fail(`unknown feature '${id}'. Available: ${featureList(offered)}`);
    }
    const unavailable = featureUnavailableReason(feature, framework);
    if (unavailable) {
      return fail(`${unavailable}\nAvailable for ${framework.label}: ${featureList(offered)}`);
    }
  }

  const surface = resolveSurface(featureIds, framework);
  if (!surface.ok) return fail(surface.reason);

  // WHAT THIS RELEASE SCAFFOLDS, SAID OUT LOUD — including the part the user did
  // not pick. The starter is one reviewed tree, so a selection narrower than it
  // still gets all of it.
  //
  // THE `unasked` LINE IS PRINTED IN EVERY MODE, and that is the one that had to
  // be: `--features none --yes` emits a project WITH conversation history, and a
  // scaffold that quietly includes what nobody picked is a decision made while
  // withholding that it happened. The two lines below it are prompt furniture —
  // restating what the user just saw — so they stay interactive.
  if (surface.surface.kind === 'composed' && surface.surface.unasked.length > 0) {
    stated(
      'Also included',
      `${surface.surface.unasked.join(', ')} — the ${framework.label} starter is one reviewed ` +
        'tree, so it comes as a whole',
    );
  }
  if (!nonInteractive) {
    if (optional.length === 0 && included.length > 0) {
      stated('Features', included.map((f) => `${f.label} — ${f.hint}`).join('; '));
    }
    if (withheld.length > 0) {
      stated(
        'Not offered yet',
        `${withheld.map((f) => f.id).join(', ')} — ${pc.dim('see `--list` for the whole table')}`,
      );
    }
  }

  // ── 4. gateway ─────────────────────────────────────────────────────────────
  //
  // THE AXIS THIS RULE WAS WRITTEN FOR AND THEN NOT APPLIED TO. It offers only
  // the gateways this FRAMEWORK can host — a wired gateway still needs somewhere
  // to put its route — and for most of the table that intersection is `mock`
  // alone. The old `wired.length === 1` branch took that answer WITHOUT ASKING
  // AND WITHOUT SAYING SO, so on six of the eight ready frameworks the backend
  // question never appeared in any form. Same rule as the layout axis now, from
  // the same function, which is what stops the two drifting again.
  const gateways = listGateways();
  const gatewayId = normalizeGateway(args.gateway) ?? (await answerAxis(
    gatewayAxis(framework),
    { nonInteractive, fallback: ZERO_CONFIG.gateway, initialValue: ZERO_CONFIG.gateway },
    clackAxisIo,
  ));

  if (!gateways.some((g) => g.integration.id === gatewayId)) {
    return fail(`unknown gateway '${gatewayId}'`);
  }
  const gatewayProblem = wirableGateway(gatewayId, framework);
  if (gatewayProblem) return fail(gatewayProblem);

  const plan: ProjectPlan = {
    dir,
    name,
    frameworkId: framework.id,
    layout: layout.id,
    widgetStyle: null,
    featureIds,
    gatewayId,
    kit: args.kit ?? DEFAULT_KIT_RANGE,
    // NOT `args.kit`, deliberately, and not derived from it either. This records
    // which kit the CLI was built against, which stays true when `--kit` sends
    // the dependency somewhere else — the emitted files are this version's shape
    // whatever the project ends up installing.
    kitBuiltAgainst: __KIT_VERSION__,
  };

  // ── generate ───────────────────────────────────────────────────────────────
  const spinner = p.spinner();
  spinner.start('Scaffolding');
  let result;
  try {
    result = await generate(plan);
  } catch (error) {
    spinner.stop('Scaffolding failed');
    return fail(error instanceof Error ? error.message : String(error));
  }
  spinner.stop(`Scaffolded ${pc.cyan(path.relative(process.cwd(), dir) || '.')}`);

  // ── 6. install ─────────────────────────────────────────────────────────────
  const pm = detectPackageManager();
  const shouldInstall = args.install ?? (nonInteractive
    ? false
    : await ask(p.confirm({ message: `Install dependencies with ${pm.name}?`, initialValue: true })));

  let installed = false;
  if (shouldInstall) {
    const install = p.spinner();
    install.start(`Installing with ${pm.name}`);
    const code = await run(pm.install, dir);
    if (code === 0) {
      installed = true;
      install.stop('Dependencies installed');
    } else {
      install.stop(pc.yellow(`${pm.name} install exited ${code} — run it yourself before ${pm.run}`));
    }
  }

  // ── 7. next steps ──────────────────────────────────────────────────────────
  const relative = path.relative(process.cwd(), dir);
  const integration = gateways.find((g) => g.integration.id === gatewayId)?.integration;
  // The key step goes BEFORE `npm run dev`, because that is the order it has to
  // happen in: a placeholder key reaches the provider as a 401 and the first
  // message fails.
  const keyStep =
    gatewayId !== 'mock' && integration && integration.envVars.length > 0
      ? `# put your key in ${framework.paths.env} (${integration.envVars.join(', ')})`
      : null;
  const steps = [
    relative ? `cd ${relative}` : null,
    installed ? null : pm.install.join(' '),
    keyStep,
    pm.run,
  ].filter(Boolean) as string[];

  p.note(steps.join('\n'), 'Next steps');

  p.outro(
    [
      `${pc.dim('Gateway:')} ${
        gatewayId === 'mock'
          ? "none — the kit's local mock responder. No key, no backend."
          : `${integration?.title ?? gatewayId} — route at ${framework.route?.file}`
      }`,
      `${pc.dim('Files:')}   ${result.files.length} written, including kai.json`,
      `${pc.dim('Docs:')}    https://ui.kitn.ai/${result.docsSlug}`,
    ].join('\n'),
  );

  return 0;
}

/** Clack returns a cancel symbol rather than throwing; treat it as an exit. */
async function ask<T>(prompt: Promise<T | symbol>): Promise<T> {
  const value = await prompt;
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    process.exit(130);
  }
  return value as T;
}

/**
 * The widget/fullscreen branch of "what would you like to create?" — composes
 * a construct (Task 1's `@kitn.ai/ui/construct`) via `runWizard`/`emitConstruct`
 * instead of running `generate()`'s scaffold flow. Returns the exit code the
 * way `main()` does, so `main()` can just `return` its result directly.
 */
async function runConstructFlow(
  shape: Exclude<ShapeId, 'app'>,
  name: string,
  dir: string,
  nonInteractive: boolean,
): Promise<number> {
  // This CLI's half of `WizardIo` — the clack calls, injected the same way
  // `clackAxisIo` is: `runWizard` is tested with spies and never touches a
  // real prompt stream.
  const wizardIo: WizardIo = {
    text: (msg, initial) =>
      ask(p.text({ message: msg, defaultValue: initial ?? '', placeholder: initial })),
    confirm: (msg, initial) => ask(p.confirm({ message: msg, initialValue: initial })),
    // A single comma-separated line rather than a repeated prompt, to keep the
    // whole wizard to one screen — the brief's own call, not a schema
    // requirement.
    multilineList: async (msg) => {
      const raw = await ask(
        p.text({
          message: msg,
          placeholder: 'e.g. Summarize this page, What can you help with?',
          defaultValue: '',
        }),
      );
      return raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
    },
    state: stated,
  };

  const answers = await runWizard(shape, name, wizardIo, nonInteractive);

  const spinner = p.spinner();
  spinner.start('Writing construct');
  let result;
  try {
    result = await emitConstruct(dir, answers);
  } catch (error) {
    spinner.stop('Writing construct failed');
    return fail(error instanceof Error ? error.message : String(error));
  }
  spinner.stop(`Wrote ${pc.cyan(path.relative(process.cwd(), result.file))}`);

  // DECIDE LOUDLY, printed in EVERY mode — including `--yes`/no-TTY, the same
  // way the framework path's "unasked" feature line is (see that comment
  // further up) — because this is not prompt furniture, it's a fact about
  // what the file actually contains. `Construct.name` has to satisfy the
  // schema's custom-element-tag rule (lowercase, MUST contain a hyphen),
  // which `validateProjectName`'s directory-naming rules do not require —
  // so a plain `myapp` writes `myapp-widget` as the construct's own `name`,
  // even though the directory and the emitted FILENAME both stay `myapp`.
  // Silently rewriting it was the actual bug this guards: the tool's own
  // printed next step (`npx @kitn.ai/ui dev ...`) used to reject the file it
  // had just written, with no explanation anywhere in the output.
  if (result.constructName !== name) {
    stated(
      'Construct name',
      `${result.constructName} — "${name}" is not a valid custom-element tag; ` +
        'the directory and file name still use your name as typed',
    );
  }

  const relative = path.relative(process.cwd(), dir);
  const startPreview =
    !nonInteractive &&
    (await ask(p.confirm({ message: 'Start the live preview now?', initialValue: true })));

  // Shared by the decline path below AND a failed-preview path further down —
  // whichever way the user ends up not looking at a running preview, they get
  // the same fallback command to run by hand.
  const printFallbackSteps = () => {
    const steps = [relative ? `cd ${relative}` : null, result.devCommand].filter(Boolean) as string[];
    p.note(steps.join('\n'), 'Next steps');
  };

  // Decline → the command lands in the "Next steps" note instead, the same
  // place the framework path's key/install/run steps go. Never spawned in
  // non-interactive mode: `startPreview` is `false` there by construction, so
  // `--yes`/no-TTY runs never launch a long-lived child process unattended.
  if (!startPreview) {
    printFallbackSteps();
  }

  p.outro(
    [
      `${pc.dim('Shape:')} ${shape}`,
      `${pc.dim('File:')}  ${path.basename(result.file)}`,
    ].join('\n'),
  );

  if (startPreview) {
    const outcome = await runDevPreview(result.devCommand, dir, spawn);
    if (!outcome.ok) {
      // DECIDE LOUDLY, NEVER SILENTLY. The construct file itself was already
      // written successfully — the spinner above already confirmed that —
      // so this still exits 0 rather than reporting the whole command as a
      // failure; only the LIVE PREVIEW failed to start or crashed. What must
      // never happen is a QUIET 0: the failure goes to stderr in red, and the
      // same fallback command the decline branch prints above is printed
      // again here, so the user always has something to run by hand even
      // when the automatic handoff didn't work.
      console.error(pc.red(`\nLive preview failed: ${outcome.message}`));
      printFallbackSteps();
    }
  }
  return 0;
}

function fail(message: string): number {
  p.cancel(pc.red(message));
  return 1;
}

/**
 * An answer that was decided rather than asked.
 *
 * Printed in the prompt stream, in the same place the question would have been,
 * so the flow reads as a list of decisions with no gap where a choice silently
 * went away.
 */
function stated(label: string, value: string): void {
  p.log.info(`${pc.dim(`${label}:`)} ${value}`);
}

/**
 * This CLI's half of `answerAxis` — the two things it is allowed to do to a
 * terminal, handed to the rule rather than reached for by it.
 *
 * The rule itself lives in `axes.ts` so a test can drive it with spies and
 * assert that a decided axis STATES and an open one ASKS. It could not, while
 * both the rule and these calls lived here: nothing can import this module, so
 * the guard reached only as far as the axis data and a deleted `state(...)` call
 * left the suite green.
 */
const clackAxisIo: AxisIo = {
  ask: (axis, initialValue) =>
    ask(
      p.select({
        message: axis.question,
        initialValue,
        options: axis.options.map((o) => ({ value: o.id, label: o.label, hint: o.hint })),
      }),
    ),
  state: stated,
};

/** Feature ids for a refusal message, or an honest `none` rather than an empty gap. */
function featureList(features: readonly FeatureDef[]): string {
  return features.length > 0 ? features.map((f) => f.id).join(', ') : 'none';
}

function run(command: readonly string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { cwd, stdio: 'ignore', shell: false });
    child.on('error', () => resolve(-1));
    child.on('close', (code) => resolve(code ?? -1));
  });
}

/**
 * `--list`, in the spirit of TanStack's `--json` introspection: a coding agent
 * can discover what this CLI can emit without scraping help text. It reports
 * `planned` cells too, so the gaps are legible rather than invisible.
 */
function printMatrix(asJson: boolean): void {
  const matrix = {
    cli: __CLI_VERSION__,
    kit: DEFAULT_KIT_RANGE,
    // The same pair `kai.json` carries. An agent reading this to decide what to
    // install gets the range; one reasoning about which kit the templates match
    // gets the exact version, without having to parse the range for a floor.
    kitBuiltAgainst: __KIT_VERSION__,
    frameworks: FRAMEWORKS.map((f) => ({
      id: f.id,
      label: f.label,
      status: f.status,
      registration: f.registration,
      composedWorkspace: f.composedWorkspace,
      // Where a keyed gateway's route would go, or null when this framework has
      // no destination declared yet. An agent reading this can tell "gateway not
      // wired" from "gateway wired but not for this framework" without guessing.
      route: f.route ? { file: f.route.file, runtime: f.route.runtime, production: f.route.production } : null,
      ...(f.note ? { note: f.note } : {}),
    })),
    layouts: LAYOUTS.map((l) => ({ id: l.id, status: l.status, ...(l.note ? { note: l.note } : {}) })),
    features: FEATURES.map((f) => ({
      id: f.id,
      components: f.components,
      default: f.default,
      // Derived, never restated — and the field the six-item menu needed: the
      // ready frameworks whose prompt actually offers this feature. An empty
      // array means the row is catalogued and cannot be scaffolded by anything,
      // which is what an agent reading this has to be able to see.
      frameworks: readyFrameworks()
        .filter((framework) => availableFeatures(framework).includes(f))
        .map((framework) => framework.id),
    })),
    gateways: listGateways().map((g) => ({
      id: g.integration.id,
      title: g.integration.title,
      wired: g.wired,
      envVars: g.integration.envVars,
      keyExposure: g.integration.keyExposure,
      // What a scaffold cannot provide for you: 'none' means a key is the whole
      // of it, anything else means a process has to already be running.
      outOfBand: g.integration.outOfBand,
      language: g.integration.language,
      // Derived, never restated: the frameworks this gateway can actually be
      // scaffolded onto today.
      frameworks: g.wired
        ? FRAMEWORKS.filter((f) => f.status === 'ready' && !wirableGateway(g.integration.id, f)).map((f) => f.id)
        : [],
    })),
  };

  if (asJson) {
    console.log(JSON.stringify(matrix, null, 2));
    return;
  }
  console.log(pc.bold('\nFrameworks'));
  for (const f of matrix.frameworks) {
    console.log(`  ${mark(f.status === 'ready')} ${f.id.padEnd(16)}${f.note ?? ''}`);
  }
  console.log(pc.bold('\nLayouts'));
  for (const l of matrix.layouts) {
    console.log(`  ${mark(l.status === 'ready')} ${l.id.padEnd(16)}${l.note ?? ''}`);
  }
  // Features were in `--json` and missing from the human table entirely, which
  // is the half a person reads before running the thing.
  console.log(pc.bold('\nFeatures'));
  for (const f of matrix.features) {
    console.log(
      `  ${mark(f.frameworks.length > 0)} ${f.id.padEnd(16)}${
        f.frameworks.length > 0 ? '' : 'not scaffoldable in this release'
      }`,
    );
  }
  console.log(pc.bold('\nGateways'));
  for (const g of matrix.gateways) {
    console.log(`  ${mark(g.wired)} ${g.id.padEnd(16)}${g.envVars.join(', ')}`);
  }
  console.log('');
}

const mark = (ok: boolean) => (ok ? pc.green('•') : pc.dim('·'));

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(pc.red(error instanceof Error ? error.stack ?? error.message : String(error)));
    process.exit(1);
  },
);
