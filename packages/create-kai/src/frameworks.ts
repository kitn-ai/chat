/**
 * The framework axis.
 *
 * One entry per `examples/starters/*` tree. `templateDir` names the starter this
 * framework's project skeleton is copied from, so the starters stay the single
 * source of truth for how a consumer wires the kit — they are CI-built, so drift
 * is caught there rather than here.
 *
 * `status` is what the CLI offers. React and Vue are `ready` — scaffolded,
 * installed, built and driven in a browser — and the rest are declared but not
 * offered, because the emitted project for those cells has not been run. This
 * table is the whole of "turn one on": flip the status, drop the note, add the
 * template patches, and the prompt, the coverage gate and the `--list` output
 * all follow.
 *
 * `ready` MEANS RUN, NOT BUILT. Vue built green before it had a single patch,
 * while emitting a project whose browser tab read "@kitn.ai/ui Vue example" and
 * whose vite.config told the user to run `nx build ui`. `scripts/build.mjs` now
 * refuses that, but the standard the status is held to is
 * `scripts/smoke.mjs --framework <id> --keep` plus a real browser: a message
 * sent, and a reply streaming into `<kai-thread>`.
 */
import type { Registration } from './types';

export interface FrameworkDef {
  id: string;
  /** what the prompt calls it */
  label: string;
  /** the `examples/starters/<dir>` tree this framework's skeleton comes from */
  templateDir: string;
  /** the `framework` value `renderSurface` takes for generated surfaces */
  renderer: string;
  /** `kai.json`'s `registration` field — how this project reaches the kit */
  registration: Registration;
  /**
   * Whether the starter is the hand-composed workspace (sidebar + thread +
   * composer). This is what makes the `conversations` feature emittable, since
   * `renderSurface` has no `kai-conversations` branch.
   */
  composedWorkspace: boolean;
  /** true when the CLI can emit AND run this framework today */
  status: 'ready' | 'planned';
  /** `kai.json`'s `paths` block */
  paths: {
    entry: string;
    app: string;
    components: string;
    css: string;
    env: string;
  };
  /** shown next to a `planned` entry so the gap is stated, not hidden */
  note?: string;
}

export const FRAMEWORKS: readonly FrameworkDef[] = [
  {
    id: 'react',
    label: 'React',
    templateDir: 'react',
    renderer: 'react',
    registration: 'elements',
    composedWorkspace: true,
    status: 'ready',
    paths: {
      entry: 'src/main.tsx',
      app: 'src/App.tsx',
      components: 'src/components',
      css: 'src/index.css',
      env: '.env.local',
    },
  },
  {
    id: 'vue',
    label: 'Vue',
    templateDir: 'vue',
    renderer: 'vue',
    registration: 'elements',
    composedWorkspace: true,
    status: 'ready',
    paths: {
      entry: 'src/main.ts',
      app: 'src/App.vue',
      components: 'src/components',
      css: 'src/index.css',
      env: '.env.local',
    },
  },
  {
    id: 'svelte',
    label: 'Svelte',
    templateDir: 'svelte',
    renderer: 'svelte',
    registration: 'elements',
    composedWorkspace: true,
    status: 'planned',
    paths: {
      entry: 'src/main.ts',
      app: 'src/App.svelte',
      components: 'src/components',
      css: 'src/index.css',
      env: '.env.local',
    },
    note: 'starter exists; not yet run end to end by this CLI',
  },
  {
    id: 'solid',
    label: 'SolidJS',
    templateDir: 'solid',
    renderer: 'solid',
    // The one target that imports the SolidJS components directly instead of
    // registering `kai-*` web components. Any future codegen has to branch on
    // this, which is why `kai.json` records it rather than leaving it to be
    // re-derived by parsing the entry file.
    registration: 'solid',
    composedWorkspace: false,
    status: 'planned',
    paths: {
      entry: 'src/index.tsx',
      app: 'src/App.tsx',
      components: 'src',
      css: 'src/index.css',
      env: '.env.local',
    },
    note: 'starter exists; not yet run end to end by this CLI',
  },
  {
    id: 'angular',
    label: 'Angular',
    templateDir: 'angular',
    renderer: 'angular',
    registration: 'elements',
    composedWorkspace: true,
    status: 'planned',
    paths: {
      entry: 'src/main.ts',
      app: 'src/app/app.ts',
      components: 'src/app',
      css: 'src/styles.css',
      env: '.env.local',
    },
    note: 'starter exists; needs Node >= 22.22.3',
  },
  {
    id: 'html',
    label: 'HTML (plain, Vite)',
    templateDir: 'vanilla',
    renderer: 'html',
    registration: 'elements',
    composedWorkspace: true,
    status: 'planned',
    paths: {
      entry: 'src/main.ts',
      app: 'src/main.ts',
      components: 'src',
      css: 'src/index.css',
      env: '.env.local',
    },
    note: 'starter exists; not yet run end to end by this CLI',
  },
  {
    id: 'nextjs',
    label: 'Next.js',
    templateDir: 'nextjs',
    renderer: 'next',
    registration: 'elements',
    // Real gap, recorded in the spec: Next and TanStack Start have renderers but
    // no hand-composed workspace shell, so `conversations` is not reachable for
    // them even once their status flips.
    composedWorkspace: false,
    status: 'planned',
    paths: {
      entry: 'app/layout.tsx',
      app: 'app/page.tsx',
      components: 'app',
      css: 'app/globals.css',
      env: '.env.local',
    },
    note: 'SSR starter exists; no composed-workspace shell yet',
  },
  {
    id: 'tanstack-start',
    label: 'TanStack Start',
    templateDir: 'tanstack-start',
    renderer: 'tanstack-start',
    registration: 'elements',
    composedWorkspace: false,
    status: 'planned',
    paths: {
      entry: 'src/router.tsx',
      app: 'src/routes/index.tsx',
      components: 'src/routes',
      css: 'src/styles.css',
      env: '.env.local',
    },
    note: 'SSR starter exists; no composed-workspace shell yet',
  },
];

export function getFramework(id: string): FrameworkDef | undefined {
  return FRAMEWORKS.find((f) => f.id === id);
}

/** The frameworks the prompt offers. */
export function readyFrameworks(): FrameworkDef[] {
  return FRAMEWORKS.filter((f) => f.status === 'ready');
}

/** The framework the zero-config path uses when the user presses Enter. */
export const DEFAULT_FRAMEWORK = 'react';
