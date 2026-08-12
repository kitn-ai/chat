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

import { ZERO_CONFIG, normalizeGateway, parseArgs, validateProjectName } from './args';
import { WIRED_GATEWAYS, listGateways } from './catalog';
import { DEFAULT_FEATURES, FEATURES, availableFeatures, getFeature } from './features';
import { FRAMEWORKS, getFramework, readyFrameworks } from './frameworks';
import { generate } from './generate';
import { LAYOUTS, getLayout, readyLayouts } from './layouts';
import { detectPackageManager } from './pm';
import type { Layout, ProjectPlan } from './types';

/**
 * The `@kitn.ai/ui` range an emitted project pins.
 *
 * Derived from the workspace kit's own version at build time rather than
 * written here, so the pin cannot drift from the kit the templates were copied
 * from — the templates and the range come out of the same build.
 */
const DEFAULT_KIT_RANGE = `^${__KIT_VERSION__}`;

const HELP = `
${pc.bold('create-kai')} — scaffold a runnable @kitn.ai/ui chat app

  ${pc.dim('npm create kai@latest')}
  ${pc.dim('npx create-kai my-app')}

Options
  --framework <id>     ${readyFrameworks().map((f) => f.id).join(', ')}
  --layout <id>        ${readyLayouts().map((l) => l.id).join(', ')}
  --features <a,b>     ${FEATURES.map((f) => f.id).join(', ')}  (or 'none')
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
  const defaultName = args.dir ?? ZERO_CONFIG.name;
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

  // ── 2. framework ───────────────────────────────────────────────────────────
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
  const layoutId = (args.layout ?? (nonInteractive
    ? ZERO_CONFIG.layout
    : await ask(
        p.select({
          message: 'Where does the chat live?',
          initialValue: ZERO_CONFIG.layout,
          options: readyLayouts().map((l) => ({ value: l.id, label: l.label, hint: l.hint })),
        }),
      ))) as Layout;

  const layout = getLayout(layoutId);
  if (!layout) return fail(`unknown layout '${layoutId}'`);
  if (layout.status !== 'ready') {
    return fail(`layout '${layout.id}' is not scaffoldable yet (${layout.note ?? 'no template'})`);
  }

  // ── 3a. features ───────────────────────────────────────────────────────────
  const offered = availableFeatures(framework);
  const featureIds = args.features ?? (nonInteractive
    ? DEFAULT_FEATURES.filter((id) => offered.some((f) => f.id === id))
    : await ask(
        p.multiselect({
          message: 'Which features?',
          required: false,
          initialValues: DEFAULT_FEATURES.filter((id) => offered.some((f) => f.id === id)),
          options: offered.map((f) => ({ value: f.id, label: f.label, hint: f.hint })),
        }),
      ));

  for (const id of featureIds) {
    if (!getFeature(id)) return fail(`unknown feature '${id}'`);
  }

  // ── 4. gateway ─────────────────────────────────────────────────────────────
  const gateways = listGateways();
  const wired = gateways.filter((g) => g.wired);
  const gatewayId = normalizeGateway(args.gateway) ?? (nonInteractive || wired.length === 1
    ? ZERO_CONFIG.gateway
    : await ask(
        p.select({
          message: 'Wire a model gateway?',
          initialValue: ZERO_CONFIG.gateway,
          options: wired.map((g) => ({
            value: g.integration.id,
            label: g.integration.id === 'mock' ? 'None' : g.integration.title,
            hint: g.integration.id === 'mock' ? 'local mock, no key, no backend' : undefined,
          })),
        }),
      ));

  if (!WIRED_GATEWAYS.has(gatewayId)) {
    const known = gateways.some((g) => g.integration.id === gatewayId);
    return fail(
      known
        ? `gateway '${gatewayId}' is in the kit catalog but is not wired by this release yet. ` +
            `Available: none${[...WIRED_GATEWAYS].filter((g) => g !== 'mock').map((g) => `, ${g}`).join('')}`
        : `unknown gateway '${gatewayId}'`,
    );
  }

  const plan: ProjectPlan = {
    dir,
    name,
    frameworkId: framework.id,
    layout: layout.id,
    widgetStyle: null,
    featureIds,
    gatewayId,
    kit: args.kit ?? DEFAULT_KIT_RANGE,
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
  const steps = [
    relative ? `cd ${relative}` : null,
    installed ? null : pm.install.join(' '),
    pm.run,
  ].filter(Boolean) as string[];

  p.note(steps.join('\n'), 'Next steps');

  p.outro(
    [
      `${pc.dim('Gateway:')} ${gatewayId === 'mock' ? 'none — the kit\'s local mock responder. No key, no backend.' : gatewayId}`,
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

function fail(message: string): number {
  p.cancel(pc.red(message));
  return 1;
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
    frameworks: FRAMEWORKS.map((f) => ({
      id: f.id,
      label: f.label,
      status: f.status,
      registration: f.registration,
      composedWorkspace: f.composedWorkspace,
      ...(f.note ? { note: f.note } : {}),
    })),
    layouts: LAYOUTS.map((l) => ({ id: l.id, status: l.status, ...(l.note ? { note: l.note } : {}) })),
    features: FEATURES.map((f) => ({ id: f.id, components: f.components, default: f.default })),
    gateways: listGateways().map((g) => ({
      id: g.integration.id,
      title: g.integration.title,
      wired: g.wired,
      envVars: g.integration.envVars,
      keyExposure: g.integration.keyExposure,
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
