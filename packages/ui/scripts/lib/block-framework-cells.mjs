// THE FOUR FRAMEWORK CELLS: vue, svelte, angular, solid (spec 2026-09-02
// section 5.1, and the PR B2 rulings).
//
// WHY EACH RUNS ITS OWN TOOL. `tsc` cannot read a .vue file, a .svelte file or
// an Angular templateUrl, so a `default`-project pass over any of the three
// would compile the script block and NOTHING about the template that carries
// every binding. That is the "green on nothing" shape this repo names most
// often, and for vue it is a ruled requirement (spec section 9, from the
// contract spike: vue-tsc IS the vue cell, not a supplement).
//
// WHAT EACH ONE CANNOT SEE, stated here and PRINTED by the gate, because a
// cell that compiles and proves nothing about behaviour must not read as a
// behavioural pass:
//
//   vue     vue-tsc + the kit's shipped GlobalComponents augmentation.
//           Script, template expressions AND kai prop types. The only one of
//           the four that types a kai prop value.
//   svelte  svelte-check. Script and template expressions. NOT kai prop names
//           or types: svelte/elements.d.ts ends SvelteHTMLElements with
//           `[name: string]: { [name: string]: any }`, so every unknown element
//           and every attribute on it is `any`.
//   angular ngc with strictTemplates. Class and template expressions. NOT kai
//           prop names or types: CUSTOM_ELEMENTS_SCHEMA suppresses exactly that
//           check, which is what the schema IS.
//   solid   tsc under the `solid` project. Module and JSX expressions. NOT kai
//           prop types: the kit's solid-js/jsx-runtime augmentation is generic
//           (see scripts/gen-element-types.mjs for why).
//
// NONE OF THE FOUR RUNS ANYTHING. React is the only runtime cell
// (verify:blocks:react) and stays so, per the owner ruling in spec section 9.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** A tool's entry script, resolved through Node rather than a node_modules
 *  path literal: pnpm's layout differs between the workspace root, a worktree
 *  and CI, and a wrong guess reads as a scaffolder defect. */
function toolBin(pkg, rel) {
  let root;
  try {
    root = dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    throw new Error(
      `${pkg} is not installed. It is a devDependency of packages/ui because this gate runs it; run \`pnpm install\` at the repo root.`,
    );
  }
  const bin = join(root, rel);
  if (!existsSync(bin)) throw new Error(`${pkg} is installed but ${rel} is missing (found ${root})`);
  return bin;
}

/** Run a tool and return its combined output ('' when it exits 0). */
function runTool(bin, args, cwd) {
  try {
    execFileSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return '';
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

/**
 * The augmentation shim every non-solid cell writes into its sandbox.
 *
 * WHAT IT IS FOR, stated precisely, because the obvious version of this claim
 * is false. vue-tsc applies a module augmentation only when the declaring file
 * is IN THE PROGRAM, and with nothing importing the kit anywhere Vue falls
 * through to @vue/runtime-dom's `[name: string]: any` and the cell type-checks
 * the script block and nothing about the template. What the program needs is
 * REACHABILITY, and the emitted trees already have it: the SFC imports its
 * composable and the composable imports '@kitn.ai/ui/elements'. Measured, all
 * three shapes: no kit import anywhere is GREEN, the SFC's own script importing
 * it is RED, and a sibling .ts importing it (the emitted shape) is RED.
 *
 * So this file is BELT AND BRACES, not the load-bearing part: it keeps the cell
 * honest for a future emitted tree that stops importing the kit from its script.
 * The self-test below withholds reachability entirely, not just this file, and
 * watches both plants turn GREEN.
 */
const SHIM = `import '@kitn.ai/ui/elements';\n`;

/** Write one form's files into a sandbox, under their `path` (not `target`:
 *  the sandbox IS the block directory, and the install root is the consumer
 *  project's business, checked by apps/docs/test/blocks-targets.test.ts). */
function writeTree(dir, files) {
  for (const file of files) {
    const dest = join(dir, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.content);
  }
}

/** The sandbox self-test, run before every cell: a green over a sandbox whose
 *  @kitn.ai/ui resolved to `any` would pass every assertion below. */
function guardSandbox(box, name, form) {
  const { missed, out } = box.selfTest();
  if (!missed.length) return null;
  return (
    `${name} [${form}]: the sandbox self-test did NOT fire (${missed.map((p) => p.file).join(', ')}).\n` +
    `    ${missed.map((p) => p.why).join('\n    ')}\n` +
    `    Every cell under it would pass vacuously. tsc said:\n${out || '    (nothing)'}`
  );
}

export function vueCell({ tsc, name, files }) {
  const box = tsc.sandbox('default', `block-${name}-vue`, {
    include: ['**/*.vue'],
  });
  const guard = guardSandbox(box, name, 'vue');
  if (guard) return [guard];
  box.clear();
  writeTree(box.dir, files);
  writeFileSync(join(box.dir, 'kai-shim.d.ts'), SHIM);
  const out = runTool(toolBin('vue-tsc', 'bin/vue-tsc.js'), ['--noEmit', '-p', join(box.dir, 'tsconfig.json')], box.dir);
  box.clear();
  return out.trim() ? [`${name} [vue]: vue-tsc rejects the emitted SFC:\n${out.trimEnd()}`] : [];
}

export function svelteCell({ tsc, name, files }) {
  const box = tsc.sandbox('default', `block-${name}-svelte`, {
    include: ['**/*.svelte'],
  });
  const guard = guardSandbox(box, name, 'svelte');
  if (guard) return [guard];
  box.clear();
  writeTree(box.dir, files);
  writeFileSync(join(box.dir, 'kai-shim.d.ts'), SHIM);
  const out = runTool(
    toolBin('svelte-check', 'bin/svelte-check'),
    ['--output', 'machine', '--fail-on-warnings', '--tsconfig', join(box.dir, 'tsconfig.json')],
    box.dir,
  );
  box.clear();
  // svelte-check's machine output is one record per line; ERROR and WARNING
  // records are the failures, and `--fail-on-warnings` makes the exit code
  // agree. Filtering rather than trusting the exit code alone keeps the
  // reported text short enough to read.
  //
  // `runTool` returns text ONLY when the tool exited non-zero, so reaching here
  // with output and no records is not a clean tree: it is svelte-check having
  // CRASHED (a tsconfig it cannot read, a missing peer, a .svelte it cannot
  // parse), and returning [] on it would be exactly the green-on-nothing this
  // cell was added to close. It fails loudly instead, with the raw text. The
  // `COMPLETED` record is the tool's own "I really ran" line and its absence is
  // the same anomaly.
  if (!out.trim()) return [];
  const lines = out.split('\n');
  const problems = lines.filter((l) => /^\d+\s+(ERROR|WARNING)/.test(l));
  if (!problems.length || !lines.some((l) => /^\d+\s+COMPLETED/.test(l))) {
    return [
      `${name} [svelte]: svelte-check exited non-zero with no machine records (or no COMPLETED line), ` +
        `which is a crashed tool rather than a clean tree:\n${out.trimEnd()}`,
    ];
  }
  return [`${name} [svelte]: svelte-check rejects the emitted component:\n    ${problems.join('\n    ')}`];
}

export function angularCell({ tsc, name, files }) {
  const box = tsc.sandbox('angular', `block-${name}-angular`, {
    // Copied from the tsconfig `ng new` writes (examples/starters/angular),
    // not invented. `strictTemplates` is the whole reason ngc is the cell:
    // without it the template's expressions are unchecked too and the cell
    // would be back to compiling the class alone.
    tsconfigExtra: {
      angularCompilerOptions: {
        strictTemplates: true,
        strictInjectionParameters: true,
        strictInputAccessModifiers: true,
        enableI18nLegacyMessageIdFormat: false,
      },
    },
  });
  const guard = guardSandbox(box, name, 'angular');
  if (guard) return [guard];
  box.clear();
  writeTree(box.dir, files);
  writeFileSync(join(box.dir, 'kai-shim.d.ts'), SHIM);
  const out = runTool(toolBin('@angular/compiler-cli', 'bundles/src/bin/ngc.js'), ['-p', join(box.dir, 'tsconfig.json')], box.dir);
  box.clear();
  return out.trim() ? [`${name} [angular]: ngc rejects the emitted component:\n${out.trimEnd()}`] : [];
}

export function solidCell({ tsc, name, files }) {
  // The `solid` project, which is `jsx: preserve` + `jsxImportSource:
  // solid-js` -- the same one the scaffolder's solid front end compiles under,
  // which is what makes "it compiles for a consumer" mean the same thing in
  // both places. No shim: the solid-js/jsx-runtime augmentation reaches the
  // program through the tree's own `import '@kitn.ai/ui/elements'`.
  const box = tsc.sandbox('solid', `block-${name}-solid`);
  const guard = guardSandbox(box, name, 'solid');
  if (guard) return [guard];
  box.clear();
  writeTree(box.dir, files);
  const out = box.run();
  box.clear();
  return out.trim() ? [`${name} [solid]: does not compile under a stock solid consumer tsconfig:\n${out.trimEnd()}`] : [];
}

export const FRAMEWORK_CELLS = { vue: vueCell, svelte: svelteCell, angular: angularCell, solid: solidCell };

/** One line per form, printed by the gate. What the cell checked, and what it
 *  did not. Keyed by form id so a form with no note is a missing note rather
 *  than a silent one. */
export const CELL_NOTES = {
  vue: 'vue     vue-tsc + the kit GlobalComponents augmentation: script, template expressions AND kai prop types.',
  svelte: 'svelte  svelte-check: script + template expressions. NOT kai prop names or types (svelte types every unknown element `any`).',
  angular: 'angular ngc --strictTemplates: class + template expressions. NOT kai prop names or types (CUSTOM_ELEMENTS_SCHEMA suppresses that check by design).',
  solid: 'solid   tsc, solid project: module + JSX expressions. NOT kai prop types (the solid-js JSX augmentation is generic).',
};

// ---------------------------------------------------------------------------
// THE PLANTS. A cell that cannot go red is compile theatre and looks exactly
// like a passing one, so every cell is handed a tree with a known defect and
// must name it. These trees are hand-written and MINIMAL on purpose: they are
// the only thing available before a renderer exists, and a plant that needed a
// real block would make this self-test depend on the thing it is guarding.
// ---------------------------------------------------------------------------

const CONTROLLER = `export interface PlantState { title: string }
export interface PlantActions { open(): void; boot(): Promise<void> }
export interface PlantRefs { host: HTMLElement | null }
export function createController(deps: { refs: () => PlantRefs }) {
  let state: PlantState = { title: 'x' };
  const listeners = new Set<() => void>();
  void deps;
  return {
    state: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    actions: { open() { state = { ...state }; }, async boot() {} },
  };
}
`;

const f = (path, content) => ({ path, content, target: path });

/**
 * Each plant is [label, files, expected]. `expected` is a substring the cell's
 * failure text MUST contain, so "it went red" is not enough: it has to go red
 * for the planted reason. Every plant is a TEMPLATE defect, because the
 * template is the half a plain `tsc` cell cannot see and therefore the half
 * these tools exist for.
 */
function plants() {
  return [
    // vue, plant 1: the ruled one (spec section 9). `kai-tab-bar`'s `value` is
    // `string`, so binding a number to it as a PROPERTY is TS2322 -- but only
    // when GlobalComponents is REACHABLE from the program. The plant's own
    // script imports the kit, which is enough on its own; with neither that
    // import nor the shim, Vue falls through to `[name: string]: any` and this
    // is green, which is the arm the self-test runs second.
    ['vue', 'kai prop type (single-word prop)', [
      f('plant.controller.ts', CONTROLLER),
      f('Plant.vue', `<script setup lang="ts">
import '@kitn.ai/ui/elements';
import { createController } from './plant.controller';
const c = createController({ refs: () => ({ host: null }) });
const state = c.state();
</script>

<template>
  <kai-tab-bar :value.prop="42">{{ state.title }}</kai-tab-bar>
</template>
`),
    ], 'TS2322'],

    // vue, plant 2: NOT a duplicate. `value` is one word, so plant 1 cannot
    // tell "the declared member was reached" from "the kebab-to-camel spelling
    // quietly missed and the KaiElementVueProps index signature swallowed it".
    // `activeId` on kai-conversations is `string` and is two words, so it can.
    // The generated SFC uses the camelCase spelling for exactly this reason.
    ['vue', 'kai prop type (multi-word prop reaches the declared member)', [
      f('plant.controller.ts', CONTROLLER),
      f('Plant.vue', `<script setup lang="ts">
import '@kitn.ai/ui/elements';
import { createController } from './plant.controller';
const c = createController({ refs: () => ({ host: null }) });
const state = c.state();
</script>

<template>
  <kai-conversations :activeId.prop="42">{{ state.title }}</kai-conversations>
</template>
`),
    ], 'TS2322'],

    // svelte: an expression defect, which is what this cell CAN see. A prop
    // defect is deliberately not planted here: svelte types every unknown
    // element `any`, so such a plant could never fire and a self-test that
    // expects a red it cannot get is worse than no plant at all.
    ['svelte', 'template expression against the controller', [
      f('plant.controller.ts', CONTROLLER),
      f('Plant.svelte', `<script lang="ts">
  import '@kitn.ai/ui/elements';
  import { createController } from './plant.controller';
  const c = createController({ refs: () => ({ host: null }) });
</script>

<kai-dock onkai-click={c.actions.opne}>{c.state().title}</kai-dock>
`),
    ], 'opne'],

    // angular: the same class of defect, in a templateUrl that `tsc` cannot
    // open at all. This is the plant that proves ngc is doing the work rather
    // than the angular tsc project.
    ['angular', 'template expression against the component class', [
      f('plant.controller.ts', CONTROLLER),
      f('plant.component.html', `<kai-dock (kai-click)="store.actions.opne()">{{ store.title }}</kai-dock>\n`),
      f('plant.component.ts', `import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import '@kitn.ai/ui/elements';
import { createController } from './plant.controller';

@Component({
  selector: 'app-plant',
  templateUrl: './plant.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PlantComponent {
  protected readonly store = createController({ refs: () => ({ host: null }) });
  protected readonly title = this.store.state().title;
}
`),
    ], 'opne'],

    // solid: a JSX expression defect resolved against the controller's
    // `actions` under the kit's generic solid-js/jsx-runtime augmentation. The
    // augmentation types every kai element's event handlers generically (it
    // does not know per-tag prop shapes -- CELL_NOTES says so), so this plant
    // is deliberately NOT a prop-type defect: it is a typo on the controller
    // side (`c.actions.opne`) that only a real program-wide type check catches,
    // which is what this cell CAN see and a `tsc`-under-`solid` pass over an
    // unreachable tree could not.
    ['solid', 'JSX expression against the controller', [
      f('plant.controller.ts', CONTROLLER),
      f('Plant.tsx', `import '@kitn.ai/ui/elements';
import { createController } from './plant.controller';

export function Plant() {
  const c = createController({ refs: () => ({ host: null }) });
  return <kai-dock on:kai-click={c.actions.opne}>{c.state().title}</kai-dock>;
}
`),
    ], 'opne'],
  ];
}

/**
 * Run every plant. Returns the labels that did NOT fire, which the caller
 * turns into a hard failure: a cell that cannot fail is the dominant failure
 * mode in this repo.
 *
 * It ALSO runs the vue plants a second time with the kit's augmentation
 * UNREACHABLE from the program, and those two must go GREEN. That direction is
 * the whole point: it proves the augmentation is what is doing the work rather
 * than vue-tsc happening to be strict, which is the ruled requirement (spec
 * section 9, open item 3). Unreachable means BOTH the shim file and the plant's
 * own `import '@kitn.ai/ui/elements'`: either one alone reaches the program and
 * turns the plant red, which is why the arm is named for reachability rather
 * than for the shim (ruling R4).
 */
export function frameworkCellSelfTest({ tsc, log }) {
  const problems = [];
  for (const [form, label, files, expected] of plants()) {
    const errors = FRAMEWORK_CELLS[form]({ tsc, name: `plant-${form}-${label.replace(/\W+/g, '-')}`, files });
    const text = errors.join('\n');
    const fired = errors.length > 0 && text.includes(expected);
    log(`  ${fired ? 'OK ' : 'RED'} plant [${form}] ${label} (expected "${expected}")`);
    if (!fired) problems.push(`[${form}] ${label}: expected a failure containing "${expected}", got ${errors.length ? text.split('\n')[0] : 'CLEAN'}`);
  }

  // The reachability direction, vue only.
  const unreachable = plants().filter(([form]) => form === 'vue');
  for (const [, label, files] of unreachable) {
    const stripped = files.map((file) =>
      file.path.endsWith('.vue') ? { ...file, content: file.content.replace("import '@kitn.ai/ui/elements';\n", '') } : file,
    );
    const errors = vueCellWithoutAugmentation({ tsc, name: `plant-vue-unreachable-${label.replace(/\W+/g, '-')}`, files: stripped });
    const green = errors.length === 0;
    log(`  ${green ? 'OK ' : 'RED'} plant [vue] ${label} with the augmentation UNREACHABLE (expected CLEAN: this is what vue-tsc does on its own)`);
    if (!green) problems.push(`[vue] ${label} with the augmentation unreachable: expected CLEAN, got ${errors[0].split('\n')[0]}. If vue-tsc is now strict on its own, this plant has stopped proving what the augmentation is for.`);
  }

  return problems;
}

/** vueCell with the augmentation made UNREACHABLE: no shim file, and the
 *  caller has already stripped the plant's own kit import. Only the self-test
 *  calls it. Withholding the shim alone would prove nothing, because the
 *  plant's own import reaches the program by itself (ruling R4). */
function vueCellWithoutAugmentation({ tsc, name, files }) {
  const box = tsc.sandbox('default', `block-${name}-vue`, {
    include: ['**/*.vue'],
  });
  box.clear();
  writeTree(box.dir, files);
  const out = runTool(toolBin('vue-tsc', 'bin/vue-tsc.js'), ['--noEmit', '-p', join(box.dir, 'tsconfig.json')], box.dir);
  box.clear();
  return out.trim() ? [out.trimEnd()] : [];
}
