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
 * table edit at all. A composed chat workspace has a composer, a thread fed by a
 * chat controller, and the kit's mock responder behind it; the rest are
 * compatibility demos — a Button rendered from a server component, a static
 * `messages` array, a registration probe — with no stream for the browser check
 * to observe and so nothing the `ready` standard above can be applied to.
 *
 * WHICH ROWS ARE WHICH IS THE `composedWorkspace` COLUMN, not a roster restated
 * here. This paragraph named six starters and excepted two by id; one of the two
 * has since been rewritten and the sentence was wrong in both halves at once,
 * which is the same failure the `status` note above already refuses to repeat.
 * The column moves when the starter does.
 *
 * `scripts/build.mjs` already refuses a demo row rather than emitting one: flip
 * one and the build stops at `appPathProblem` with "<paths.app> carries no
 * toOpenAIMessages(...) expression", because the emitted README quotes that
 * expression out of the app file and there is none to quote. That throw is the
 * guard working, not a bug in it.
 *
 * Turning one of these on is therefore work in `examples/starters/<dir>/` —
 * giving the starter a real thread + composer + mock stream, SSR-safely — and
 * only then a status flip here. SOLID IS THE WORKED EXAMPLE of that sequence:
 * it sat `planned` for exactly this reason, was rewritten from a 533-line
 * single-file primitives showcase into a composed workspace on the same gateway
 * as the other five, and only then flipped. The `goLiveThread` throw its old
 * note described was never a bug to route around; it went away when the starter
 * gained the call it was asking for.
 *
 * THE QUEUE IS EMPTY as of the Next.js flip: every row below is `ready` and every
 * starter is a composed workspace. That is a statement about today, not a rule —
 * `planned`, `note` and `composedWorkspace: false` are still live machinery for
 * the NEXT framework someone adds, and the tests that grade them now drive
 * synthetic rows rather than pointing at whichever real row was still off (see
 * `catalog.test.ts`, which had run out of subjects to point at). Nothing here
 * assumes the set stays full.
 *
 * WATCH THE `templateDir` COLUMN. It is not the id. `html` is served by
 * `examples/starters/vanilla`, and since patches are keyed by templateDir, a
 * lookup written against the id finds none and the emitted project ships the
 * kit's own example title. The build's repo-internals check is what stands
 * behind that, and generate.test.ts asserts the html patches by their effect.
 */
import { NEXT_ROUTE_HOST, REACT_ROUTE_HOST } from './routes';
import type { RouteHost } from './routes';
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
  /**
   * Where this framework puts a server route, or `null` when create-kai cannot
   * emit one for it yet.
   *
   * DELIBERATELY NOT IN `paths` ABOVE, even though `kai.json` reports it beside
   * those. `declaredPathsProblem` grades every `paths` entry by asserting the
   * file EXISTS in the template, which is exactly right for the five that are
   * copied and exactly wrong for a route: a route is the one file with no
   * starter behind it, because every starter runs on the mock and the mock has
   * no server side. `env` is already exempted there for the same reason and the
   * comment on that exemption says so. Adding a third exemption to a guard whose
   * job is "these paths are real" would have made the guard mean less; deriving
   * `kai.json`'s `paths.route` from this field instead (see `buildKaiJson`)
   * keeps the guard grading only what it can actually check.
   *
   * `null` is not a gap to be filled in by copying a neighbouring row. The route
   * destination is the part of this table the eight frameworks disagree about
   * most — a file route for the meta-frameworks, a dev-server middleware plus a
   * config edit for the SPAs, an SSR Express file for Angular, nothing at all
   * for a static page — so each one is its own piece of work. `README.md`
   * records what each costs.
   */
  route: RouteHost | null;
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
    // A Vite SPA has no server, so the handler needs a dev-server plugin beside it.
    route: REACT_ROUTE_HOST,
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
    route: null,
  },
  {
    id: 'svelte',
    label: 'Svelte',
    templateDir: 'svelte',
    renderer: 'svelte',
    registration: 'elements',
    composedWorkspace: true,
    status: 'ready',
    paths: {
      entry: 'src/main.ts',
      app: 'src/App.svelte',
      components: 'src/components',
      css: 'src/index.css',
      env: '.env.local',
    },
    route: null,
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
    /**
     * TRUE since the starter became a hand-composed chat workspace — a sidebar
     * rail, a scrolling thread and a composer, wired to `createMockResponder()`
     * through `readOpenAIStream`, the same gateway the other five run.
     *
     * It is composed HARDER than they are, which is the point of this row rather
     * than an aside: the other five reach the thread through one `<kai-thread>`
     * tag, and Solid spells the list out as `<ChatContainer>` + a `<Message>` /
     * `<MessageBody>` per turn, because Solid is the kit's authored layer and
     * renders the components directly. So `conversations` is emittable here for
     * the same reason it is for React — there is a real rail to emit into.
     */
    composedWorkspace: true,
    status: 'ready',
    paths: {
      entry: 'src/index.tsx',
      app: 'src/App.tsx',
      // `src/components`, not the `src` this said while the starter was a single
      // 533-line `App.tsx` with nowhere else to put anything. It now has the same
      // `components/` seam every other composed starter has, and this path is
      // what a v2 `add` reads out of `kai.json` to decide where to WRITE a
      // generated component — so pointing it at `src` would have scattered
      // generated files next to the entry point.
      components: 'src/components',
      // `src/styles.css`, not the `src/index.css` every other row carries. This
      // was wrong from the day the row was written and nothing caught it,
      // because `verifyDeclaredPaths` only runs against a READY framework's
      // template. Fixed here so the row is true before it is ever offered.
      css: 'src/styles.css',
      env: '.env.local',
    },
    route: null,
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
    route: null,
  },
  {
    id: 'html',
    label: 'HTML (plain, Vite)',
    templateDir: 'vanilla',
    renderer: 'html',
    registration: 'elements',
    composedWorkspace: true,
    status: 'ready',
    paths: {
      entry: 'src/main.ts',
      app: 'src/main.ts',
      components: 'src',
      css: 'src/index.css',
      env: '.env.local',
    },
    route: null,
  },
  {
    id: 'nextjs',
    label: 'Next.js',
    templateDir: 'nextjs',
    renderer: 'next',
    registration: 'elements',
    // The starter is now the hand-composed workspace, prerendered by the App
    // Router: a `<Resizable>` split, `<Conversations>` in the rail, `<Thread>`
    // fed by `useKaiChat`, `<PromptInput>` below it, and the kit's
    // `createMockResponder` streaming through `readOpenAIStream`. So
    // `conversations` is emittable here exactly as it is for the six Vite rows.
    //
    // It was the last row to flip, and BOTH of the defects its old note predicted
    // were real. Recorded here because each was a class, not a typo:
    //
    //   · `paths.css` named `app/globals.css`, which the starter did not have —
    //     the third instance of a `css` entry copied down from the row above and
    //     never opened, after Solid's and TanStack's. `declaredPathsProblem` only
    //     runs on a READY framework, so a `planned` row is never graded against
    //     its template and the defect waits for the flip. The composed starter
    //     now HAS `app/globals.css`, so the path became true rather than being
    //     edited to match a wrong file.
    //
    //   · `app/layout.tsx` imported `@kitn.ai/ui/theme.css` while
    //     `postcss.config.mjs` declared `plugins: {}` — the THIRD instance of the
    //     Tailwind-source import (#216 hit it in TanStack, #217 proved Solid is
    //     safe). Measured on the emitted asset before the fix: one raw `@theme {`
    //     at-rule in `.next/static/css/*.css`, with `--color-background` defined
    //     ONLY inside it. A browser discards an unknown at-rule whole, and
    //     `next build` was green throughout. It now imports the pre-compiled
    //     `theme.tokens.css` and the same count is zero.
    //
    //     ITS BLAST RADIUS IS NARROWER THAN "the app renders on fallbacks",
    //     which is what the audit note said and what a reader would repeat.
    //     Measured in Chromium against a scaffolded project, defect twin beside
    //     fixed: DARK mode is unaffected, because those tokens are a plain
    //     `.dark` rule rather than `@theme`. In LIGHT mode `:root` carries no
    //     `--color-*` at all, but chrome INSIDE a `kai-*` element still resolves
    //     — the elements re-scope their own tokens onto slotted content, so the
    //     sidebar still computed `rgb(244, 244, 245)`. What actually broke is the
    //     chrome OUTSIDE every element: `.app` computed
    //     `background-color: rgba(0, 0, 0, 0)` against `rgb(255, 255, 255)`
    //     fixed. That is precisely what `theme.tokens.css` is documented to be
    //     for, and the narrowness is why it survived review — the page looks
    //     nearly right.
    //
    //     THE RULE IS "DOES TAILWIND PROCESS THIS FILE", NOT "NEVER IMPORT
    //     theme.css" — the second is the obvious lesson and it is wrong. Solid
    //     imports the very same file and is correct, because its `styles.css`
    //     says `@import "tailwindcss"` above it and `@tailwindcss/vite` is in the
    //     pipeline, so `@theme` is COMPILED rather than discarded. A starter with
    //     Tailwind imports `theme.css`; one without imports the pre-compiled
    //     `theme.tokens.css`. This row has no Tailwind, so it wants the latter.
    composedWorkspace: true,
    status: 'ready',
    paths: {
      entry: 'app/layout.tsx',
      // `app/workspace.tsx`, NOT `app/page.tsx`. The page is a Server Component
      // that renders the client island next to it, which is the idiomatic App
      // Router shape and the starter's answer to "where does `'use client'` go".
      // The composed workspace — and so the `toOpenAIMessages(...)` expression the
      // emitted README quotes — lives in the island.
      app: 'app/workspace.tsx',
      // `app/components`, not the bare `app` this row used to claim. Everything
      // under `app/` that is not a `page`/`layout`/`route` file is ignored by the
      // router, so colocation is fine — but a v2 `add` reads this to decide where
      // to WRITE a generated component, and `app` would scatter them next to the
      // route files.
      components: 'app/components',
      css: 'app/globals.css',
      env: '.env.local',
    },
    // The cheapest correct destination in the table: one file, no config edit,
    // and the same route answers `next dev` and `next start`.
    route: NEXT_ROUTE_HOST,
  },
  {
    id: 'tanstack-start',
    label: 'TanStack Start',
    templateDir: 'tanstack-start',
    renderer: 'tanstack-start',
    registration: 'elements',
    // The starter is now the hand-composed workspace, server-rendered: a
    // `<Resizable>` split, `<Conversations>` in the rail, `<Thread>` fed by
    // `useKaiChat`, `<PromptInput>` below it, and the kit's `createMockResponder`
    // streaming through `readOpenAIStream`. So `conversations` is emittable here
    // exactly as it is for the five Vite rows.
    composedWorkspace: true,
    status: 'ready',
    paths: {
      entry: 'src/router.tsx',
      app: 'src/routes/index.tsx',
      // `src/components`, NOT `src/routes`, which this row used to claim. The
      // route files are compiled by the TanStack Router plugin to build the route
      // tree, so a v2 `add` dropping a plain component in there would be writing
      // into generated-routing territory. The starter keeps its shared components
      // outside `routes/` for the same reason.
      components: 'src/components',
      css: 'src/styles.css',
      env: '.env.local',
    },
    route: null,
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
