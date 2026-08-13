/**
 * The framework axis.
 *
 * One entry per `examples/starters/*` tree. `templateDir` names the starter this
 * framework's project skeleton is copied from, so the starters stay the single
 * source of truth for how a consumer wires the kit — they are CI-built, so drift
 * is caught there rather than here.
 *
 * `status` is what the CLI offers. A `ready` framework has been scaffolded,
 * installed, built and driven in a browser; the rest are declared but not
 * offered, because the emitted project for those cells has not been run. Which
 * ones are which is the table below — and `--list --json` at runtime — rather
 * than a roster restated here that goes stale every time one flips. This
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
 *
 * NOT EVERY STARTER IS A CHAT APP, so for some rows flipping `status` is not a
 * table edit at all. Five starters (react, vue, svelte, angular, vanilla) are
 * composed chat workspaces with a composer and the kit's mock responder behind
 * them. THREE ARE NOT: `nextjs` and `tanstack-start` are SSR/RSC compatibility
 * demos — a Button rendered from a server component, a static `messages` array,
 * a registration probe — and `solid` is likewise a component demo. None of the
 * three has a composer, a `<kai-thread>` fed by `useKaiChat`, or a mock
 * responder, so there is no stream for the browser check to observe and nothing
 * the `ready` standard above can be applied to.
 *
 * `scripts/build.mjs` already refuses them rather than emitting one: flip either
 * SSR row and the build stops at `verifyAppPath` with "app/page.tsx carries no
 * toOpenAIMessages(...) expression", because the emitted README quotes that
 * expression out of the app file and there is none to quote. That throw is the
 * guard working, not a bug in it.
 *
 * Turning one of these on is therefore work in `examples/starters/<dir>/` —
 * giving the starter a real thread + composer + mock stream, SSR-safely — and
 * only then a status flip here.
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
      // `src/styles.css`, not the `src/index.css` every other row carries. This
      // was wrong from the day the row was written and nothing caught it,
      // because `verifyDeclaredPaths` only runs against a READY framework's
      // template. Fixed here so the row is true before it is ever offered.
      css: 'src/styles.css',
      env: '.env.local',
    },
    /**
     * NOT a "nobody got to it yet" note. Solid was run against this CLI and
     * cannot be emitted by it today, blocked on three things in
     * `examples/starters/solid/` — outside this package, so recorded rather than
     * worked around:
     *
     *  1. no `.gitignore`. It is the only one of the eight starters without one,
     *     and `scripts/build.mjs` refuses a template that has none, because an
     *     emitted project that ignores neither `node_modules/` nor `.env.local`
     *     stages an API key on its first `git add .`.
     *  2. no `toOpenAIMessages(...)`, because the starter does not use
     *     `@kitn.ai/ui/wire` AT ALL. It replays a canned part script through the
     *     `@kitn.ai/ui/state` folds, so it has no `readOpenAIStream` call for the
     *     README's go-live diff to point at. `goLiveThread` throws on it, and
     *     that throw is correct: the diff this CLI emits would name identifiers
     *     the file does not contain.
     *  3. `index.html` links its favicon to `../../internal/shared/logo.svg`, a
     *     path that escapes the project root and resolves only inside this repo.
     *
     * (1) and (3) are small. (2) is a product question — that starter is
     * deliberately a primitives showcase, and giving it a wire-backed mock
     * changes what it demonstrates. Whoever picks this up should settle (2)
     * first; the rest follows in minutes.
     */
    note: 'starter has no .gitignore and no @kitn.ai/ui/wire call for the README go-live diff',
  },
  {
    id: 'angular',
    label: 'Angular',
    templateDir: 'angular',
    renderer: 'angular',
    registration: 'elements',
    composedWorkspace: true,
    status: 'ready',
    paths: {
      entry: 'src/main.ts',
      app: 'src/app/app.ts',
      components: 'src/app',
      css: 'src/styles.css',
      env: '.env.local',
    },
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
    note: 'starter is an SSR compatibility demo, not a chat app; no thread, composer or mock stream to run',
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
    note: 'starter is an SSR compatibility demo, not a chat app; no thread, composer or mock stream to run',
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
