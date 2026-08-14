/**
 * Golden tests on the emitted project.
 *
 * These assert the RESULT of the copy + patch, not that files exist: a test that
 * only checks for the presence of `package.json` passes on a project that cannot
 * install. Each assertion below names something that breaks a user's first run.
 */
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GITIGNORE_TEMPLATE_NAME, generate, goLiveThread } from '../src/generate';
import { FRAMEWORKS, getFramework } from '../src/frameworks';
import { STRIPPED_DOTFILES, travellingName } from '../src/template-dotfiles';
import { buildTypechecks, scriptsToRun } from '../src/starter-scripts';
import type { ProjectPlan } from '../src/types';

const TEMPLATE_ROOT = path.resolve(__dirname, '../dist/templates');

const plan = (dir: string, over: Partial<ProjectPlan> = {}): ProjectPlan => ({
  dir,
  name: 'my-app',
  frameworkId: 'react',
  layout: 'full-screen',
  widgetStyle: null,
  featureIds: ['conversations'],
  gatewayId: 'mock',
  kit: '^9.9.9',
  ...over,
});

describe('generate (zero-config: react + full-screen + conversations + mock)', () => {
  let root: string;
  let dir: string;
  let files: string[];

  beforeAll(async () => {
    if (!existsSync(TEMPLATE_ROOT)) {
      throw new Error(
        `no templates at ${TEMPLATE_ROOT} — run \`pnpm --filter create-kai run build\` first`,
      );
    }
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-'));
    dir = path.join(root, 'my-app');
    const result = await generate(plan(dir), { templateRoot: TEMPLATE_ROOT });
    files = result.files;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('emits the composed workspace, not a bare chat', async () => {
    // The flagship surface is the hand-composed sidebar + thread + composer. If
    // these stop being copied the CLI still "works" and emits a different app.
    expect(files).toEqual(
      expect.arrayContaining([
        'src/App.tsx',
        'src/chat-data.ts',
        'src/components/Sidebar.tsx',
        'src/components/ThreadView.tsx',
        'src/components/Composer.tsx',
        'src/hooks/useConversations.ts',
      ]),
    );
  });

  it('renames _gitignore back to .gitignore', async () => {
    // npm strips a file named `.gitignore` from a published tarball, so it
    // travels underscored. Without the rename the emitted project ignores
    // nothing — `node_modules/` gets committed and, once a keyed gateway lands,
    // so does `.env.local`.
    expect(files).toContain('.gitignore');
    expect(files).not.toContain(GITIGNORE_TEMPLATE_NAME);
    const ignored = await readFile(path.join(dir, '.gitignore'), 'utf8');
    expect(ignored).toMatch(/^node_modules\/$/m);
    expect(ignored).toMatch(/^\.env\.local$/m);
  });

  it('pins the kit and leaves no monorepo-local dependency spec', async () => {
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@kitn.ai/ui']).toBe('^9.9.9');
    // The failure this catches is total: `workspace:*` or `file:../../..` in a
    // user's package.json makes `npm install` fail outright.
    for (const spec of Object.values(pkg.dependencies as Record<string, string>)) {
      expect(spec).not.toMatch(/^(?:workspace:|file:\.\.|link:)/);
    }
  });

  it('takes the project name and drops the workspace-member markers', async () => {
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-app');
    expect(pkg.private).toBeUndefined();
    // The scripts are the starter's own and are what the next-steps block tells
    // the user to run.
    expect(pkg.scripts.dev).toBe('vite');
  });

  it('writes kai.json describing what was scaffolded', async () => {
    const kai = JSON.parse(await readFile(path.join(dir, 'kai.json'), 'utf8'));
    expect(kai).toMatchObject({
      version: 1,
      framework: 'react',
      layout: 'full-screen',
      features: ['conversations'],
      gateway: 'mock',
      // `elements` vs `solid` is the field a v2 `add` cannot re-derive without
      // parsing the entry file.
      registration: 'elements',
    });
    expect(kai.paths.app).toBe('src/App.tsx');
  });

  it('applies the template patches', async () => {
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    expect(html).toContain('<title>my-app</title>');
    expect(html).not.toContain('React example');

    const viteConfig = await readFile(path.join(dir, 'vite.config.ts'), 'utf8');
    // A scaffolded project is not a workspace member; instructions to run
    // `nx build ui` are repo-internal and unfollowable.
    expect(viteConfig).not.toContain('nx build ui');
    expect(viteConfig).not.toContain('workspace:*');
  });

  it('emits a README about the user\'s app, not the monorepo example', async () => {
    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('# my-app');
    expect(readme).not.toContain('pnpm --filter');
  });

  it('keeps the mock identifiable rather than prettying it up', async () => {
    // The mock's tells are load-bearing: this repo shipped a fabricated turn a
    // human read as success. The scaffold must not soften them.
    const chatData = await readFile(path.join(dir, 'src/chat-data.ts'), 'utf8');
    expect(chatData).toContain('createMockResponder');
    expect(chatData).toMatch(/no provider was contacted/i);
  });
});

describe('generate (refusals)', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-refuse-'));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('refuses a surface it cannot emit rather than writing a project without it', async () => {
    // `agentic` resolves to a generated surface, which this release does not
    // wire. Emitting the composed workspace anyway would hand back a project
    // with no tool panels and no error — the exact "looks right, does nothing"
    // failure this project has shipped before.
    await expect(
      generate(plan(path.join(root, 'a'), { featureIds: ['agentic'] }), {
        templateRoot: TEMPLATE_ROOT,
      }),
    ).rejects.toThrow(/generated feature surfaces are not wired/);
  });

  /**
   * THAT `generate` STOPS AT A `resolveSurface` REFUSAL rather than emitting a
   * project the user did not ask for.
   *
   * The subject has moved twice and both moves were forced by the product getting
   * better, which is worth recording because the next reader will be tempted to
   * re-point it a third time:
   *
   *   · `featureIds: ['attachments']` — the kit's catalog can emit those now, so
   *     the request fell through to the NEXT refusal ("generated feature surfaces
   *     are not wired"), which is the test above. Two tests on one rule, none on
   *     this one.
   *   · `conversations` on Next.js — the last framework with no composed
   *     workspace. Its starter is now one, so every shipped row can produce the
   *     sidebar and that refusal has no real (framework, feature) subject left.
   *
   * So it drives the OTHER `resolveSurface` refusal that cannot run out: an
   * unknown feature id. That is still a live path — `--feature` takes a string
   * from the command line — and it is the same `if (!surface.ok) throw` this test
   * has always been about. The composed-only mechanism is asserted directly, with
   * a synthetic row, in catalog.test.ts.
   *
   * ORDER MATTERS AND IS ASSERTED. `generate` refuses in sequence — unknown
   * framework, unknown gateway, resolveSurface, unwired generated surface, no
   * template — so a bare `rejects.toThrow()` would pass on a LATER rule while
   * this one silently stopped firing. Matching the reason pins which rule caught
   * it, and the two `not.toMatch` lines name the neighbours it must not be.
   */
  it('refuses at the surface gate rather than emitting a project without the feature', async () => {
    const error = await generate(
      plan(path.join(root, 'b'), { frameworkId: 'react', featureIds: ['not-a-shipped-feature'] }),
      { templateRoot: TEMPLATE_ROOT },
    ).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error, 'generate accepted a feature that does not exist').not.toBeNull();
    // ONE error, every property. Separate `rejects` calls would let one half pass
    // on its own while another was the thing that failed.
    expect(error!.message).toMatch(/unknown feature 'not-a-shipped-feature'/);
    expect(error!.message, 'caught by the missing-template check, not the surface gate').not.toMatch(
      /no template/,
    );
    expect(
      error!.message,
      'caught by the unwired-generated-surface check, not the surface gate',
    ).not.toMatch(/generated feature surfaces are not wired/);
  });

  /**
   * STOP RE-POINTING THIS TEST AT WHATEVER IS STILL PLANNED.
   *
   * The subject was `vue`, and Vue going `ready` invalidated it, so it became
   * `svelte`; svelte going `ready` invalidated it again. Each flip silently
   * turned the assertion into "a refusal that no longer happens", and the
   * replacement had to be a framework that was both still `planned` and
   * `composedWorkspace: true` — a pool that shrinks to EMPTY as the remaining
   * cells are turned on, at which point there is no subject left to pick.
   *
   * The status table was never what this test is about. It is about
   * `generate` refusing when the template root does not hold the template it
   * was asked for. So point it at an empty template root instead: the subject
   * is a READY framework (so `conversations` resolves and the request reaches
   * the template check rather than being turned away by the feature gate
   * first), and the missing template is missing because the directory is
   * empty, not because someone has not run that cell yet. Now no framework
   * flip can invalidate it.
   */
  it('refuses a framework whose template is absent from the template root', async () => {
    const emptyRoot = await mkdtemp(path.join(tmpdir(), 'create-kai-no-templates-'));
    await expect(
      generate(plan(path.join(root, 'c'), { frameworkId: 'svelte' }), {
        templateRoot: emptyRoot,
      }),
    ).rejects.toThrow(/no template/);
    await rm(emptyRoot, { recursive: true, force: true });
  });

  /**
   * A REFUSAL LEAVES NOTHING ON DISK.
   *
   * THE INCIDENT. `create-kai@0.1.0` threw ENOENT on a missing `.npmrc` partway
   * through a Next.js scaffold and left 20 files behind — a directory that looks
   * scaffolded, containing a `package.json` still naming
   * `@kitn.ai/ui-example-nextjs` and depending on
   * `"@kitn.ai/ui": "file:../../../packages/ui"`. That path is where the kit
   * lives IN THIS REPO and resolves to nothing anywhere else, so a user who
   * missed the one-line error and ran `npm install` got a second, stranger
   * failure with no connection to the first.
   *
   * THE SUBJECT IS NOT THAT BUG, deliberately. `.npmrc` is fixed, so a test
   * driving it would assert nothing the moment it passed. The property is that
   * ANY refusal after the copy leaves the destination untouched, so this drives
   * a refusal that cannot be fixed away: Vue has no route destination, so
   * wiring a keyed gateway onto it throws from `writeGateway` — after the
   * template copy, after the patches, after `package.json` was rewritten. That
   * is the same position in the sequence the ENOENT had.
   *
   * AND IT CHECKS THE PARENT, not just the destination. Staging in a sibling
   * directory is what makes the write atomic, so a staging directory left behind
   * is this fix half-working: the user's project is clean and their `ls -a` is
   * not.
   */
  it('leaves neither a project nor a staging directory behind when it refuses', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'create-kai-atomic-'));
    const dir = path.join(parent, 'my-app');

    await expect(
      generate(plan(dir, { frameworkId: 'vue', gatewayId: 'openrouter' }), {
        templateRoot: TEMPLATE_ROOT,
      }),
    ).rejects.toThrow(/no route destination/);

    expect(existsSync(dir), 'a half-written project was left where the user asked for one').toBe(
      false,
    );
    expect(
      await readdir(parent),
      'the staging directory survived the failure it exists to contain',
    ).toEqual([]);

    await rm(parent, { recursive: true, force: true });
  });
});

/**
 * Vue is the representative of the four `registration: 'elements'` +
 * `composedWorkspace: true` frameworks (vue · svelte · angular · html). It is
 * asserted separately from React rather than by parameterising the React block,
 * because what matters here is the handful of values that DIFFER — the app file
 * extension, the Vue-only vite config, the composables directory — and a shared
 * loop over both would have to be written in terms of `framework.paths` and so
 * could not catch a wrong `framework.paths`.
 */
describe('generate (vue + full-screen + conversations + mock)', () => {
  let root: string;
  let dir: string;
  let files: string[];

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-vue-'));
    dir = path.join(root, 'vue-app');
    const result = await generate(plan(dir, { frameworkId: 'vue', name: 'vue-app' }), {
      templateRoot: TEMPLATE_ROOT,
    });
    files = result.files;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('emits the composed workspace as SFCs plus composables', async () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'src/App.vue',
        'src/chat-data.ts',
        'src/components/Sidebar.vue',
        'src/components/ThreadView.vue',
        'src/components/Composer.vue',
        'src/composables/useChat.ts',
        'src/composables/useConversations.ts',
      ]),
    );
  });

  it('applies the vue patches', async () => {
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    expect(html).toContain('<title>vue-app</title>');
    expect(html).not.toContain('Vue example');

    const viteConfig = await readFile(path.join(dir, 'vite.config.ts'), 'utf8');
    expect(viteConfig).not.toContain('nx build ui');
    expect(viteConfig).not.toContain('workspace:*');
  });

  it('keeps isCustomElement, without which the app renders nothing', async () => {
    // The single most load-bearing line in a Vue consumer's config. Vue resolves
    // an unknown tag as a Vue component unless told otherwise, so dropping this
    // while patching out the paragraph above it yields a project that builds,
    // runs, logs "unknown custom element" and shows an empty page.
    const viteConfig = await readFile(path.join(dir, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('isCustomElement');
    expect(viteConfig).toContain("tag.startsWith('kai-')");
  });

  it('records vue paths in kai.json', async () => {
    const kai = JSON.parse(await readFile(path.join(dir, 'kai.json'), 'utf8'));
    expect(kai).toMatchObject({ framework: 'vue', registration: 'elements', gateway: 'mock' });
    expect(kai.paths.app).toBe('src/App.vue');
    expect(kai.paths.entry).toBe('src/main.ts');
  });

  it('points the README at the file this project actually has', async () => {
    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('# vue-app');
    // Was hard-coded to React's. A Vue project has no src/App.tsx at all, and
    // `chat.messages` is a Ref here — pasting React's snippet would serialize a
    // Ref object into the request body.
    expect(readme).toContain('`src/App.vue`');
    expect(readme).not.toContain('src/App.tsx');
    expect(readme).toContain('toOpenAIMessages(messages.value)');
    expect(readme).not.toContain('toOpenAIMessages(chat.messages)');
  });

  it('emits a package.json a user can install', async () => {
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('vue-app');
    expect(pkg.private).toBeUndefined();
    expect(pkg.dependencies['@kitn.ai/ui']).toBe('^9.9.9');
    expect(pkg.dependencies.vue).toBeDefined();
    for (const spec of Object.values(pkg.dependencies as Record<string, string>)) {
      expect(spec).not.toMatch(/^(?:workspace:|file:\.\.|link:)/);
    }
    // vue-tsc, not tsc — the emitted build has to typecheck SFC templates.
    expect(pkg.scripts.build).toContain('vue-tsc');
  });
});

/**
 * Angular is the structurally odd one of the four `elements` cells: its
 * index.html is at `src/index.html` rather than the project root, it has no
 * vite.config at all (the builder is configured by `angular.json`), and its
 * app file is a decorated class rather than a component template. So the values
 * that differ from Vue's are asserted here rather than assumed to follow.
 */
describe('generate (angular + full-screen + conversations + mock)', () => {
  let root: string;
  let dir: string;
  let files: string[];

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-ng-'));
    dir = path.join(root, 'ng-app');
    const result = await generate(plan(dir, { frameworkId: 'angular', name: 'ng-app' }), {
      templateRoot: TEMPLATE_ROOT,
    });
    files = result.files;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('emits the composed workspace as Angular components', async () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'angular.json',
        'src/app/app.ts',
        'src/app/components/sidebar/sidebar.ts',
        'src/app/components/thread-view/thread-view.ts',
        'src/app/components/composer/composer.ts',
        'src/app/state/chat.store.ts',
      ]),
    );
  });

  it('names the browser tab after the user app, at angular’s own index path', async () => {
    // `src/index.html`, not the root `index.html` React and Vue patch. A patch
    // row copied from those would target a file this template does not have.
    const html = await readFile(path.join(dir, 'src/index.html'), 'utf8');
    expect(html).toContain('<title>ng-app</title>');
    expect(html).not.toContain('Angular example');
  });

  it('builds into the user’s own dist, not the kit example’s', async () => {
    // `angular.json` is where Angular's builder learns the project name, and it
    // is the one starter config nothing rewrote: `rewritePackageJson` only
    // touches package.json. So a scaffolded `ng-app` used to `ng build` into
    // `dist/ui-example-angular` — the emitted package.json and browser tab both
    // said `ng-app` while the build output was named after our example.
    const raw = await readFile(path.join(dir, 'angular.json'), 'utf8');
    expect(raw).not.toContain('ui-example-angular');

    const json = JSON.parse(raw);
    expect(Object.keys(json.projects)).toEqual(['ng-app']);
    expect(json.projects['ng-app'].architect.build.options.outputPath).toBe('dist/ng-app');
    // `ng serve` resolves these; a target naming a project that no longer
    // exists is a dev server that will not start.
    expect(json.projects['ng-app'].architect.serve.configurations).toMatchObject({
      production: { buildTarget: 'ng-app:build:production' },
      development: { buildTarget: 'ng-app:build:development' },
    });
  });

  it('records angular paths in kai.json', async () => {
    const kai = JSON.parse(await readFile(path.join(dir, 'kai.json'), 'utf8'));
    expect(kai).toMatchObject({ framework: 'angular', registration: 'elements', gateway: 'mock' });
    expect(kai.paths.app).toBe('src/app/app.ts');
    expect(kai.paths.css).toBe('src/styles.css');
  });

  it('points the README at the expression this project actually has', async () => {
    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('`src/app/app.ts`');
    expect(readme).not.toContain('src/App.tsx');
    // Angular reads its thread off the injected store, through a signal call.
    expect(readme).toContain('toOpenAIMessages(this.chat.messages())');
  });

  it('emits a package.json a user can install', async () => {
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('ng-app');
    expect(pkg.private).toBeUndefined();
    expect(pkg.dependencies['@kitn.ai/ui']).toBe('^9.9.9');
    expect(pkg.dependencies['@angular/core']).toBeDefined();
    for (const spec of Object.values(pkg.dependencies as Record<string, string>)) {
      expect(spec).not.toMatch(/^(?:workspace:|file:\.\.|link:)/);
    }
    expect(pkg.scripts.build).toContain('ng build');
  });

  it('ships the .gitignore back under its real name', async () => {
    expect(files).toContain('.gitignore');
    expect(files).not.toContain(GITIGNORE_TEMPLATE_NAME);
  });
});

/**
 * Svelte — an `elements` + `composedWorkspace` cell (no ordinal: this docblock
 * used to say "the third", which Angular landing beside it made wrong).
 *
 * Vue proved the shared machinery, so what is asserted here is only what Svelte
 * does DIFFERENTLY: runes files under `src/lib/*.svelte.ts` rather than Vue's
 * `src/composables/*`, `svelte-check` in the build script rather than `vue-tsc`,
 * and a vite config whose second comment paragraph is kept for the opposite
 * reason to Vue's — Vue's explains a setting the app breaks without, Svelte's
 * explains why no such setting is needed.
 */
describe('generate (svelte + full-screen + conversations + mock)', () => {
  let root: string;
  let dir: string;
  let files: string[];

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-svelte-'));
    dir = path.join(root, 'svelte-app');
    const result = await generate(plan(dir, { frameworkId: 'svelte', name: 'svelte-app' }), {
      templateRoot: TEMPLATE_ROOT,
    });
    files = result.files;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('emits the composed workspace as components plus rune modules', async () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'src/App.svelte',
        'src/chat-data.ts',
        'src/components/Sidebar.svelte',
        'src/components/ThreadView.svelte',
        'src/components/Composer.svelte',
        'src/lib/chat.svelte.ts',
        'src/lib/conversations.svelte.ts',
      ]),
    );
  });

  it('applies the svelte patches', async () => {
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    expect(html).toContain('<title>svelte-app</title>');
    expect(html).not.toContain('Svelte example');

    const viteConfig = await readFile(path.join(dir, 'vite.config.ts'), 'utf8');
    expect(viteConfig).not.toContain('nx build ui');
    expect(viteConfig).not.toContain('workspace:*');
  });

  it('keeps the note explaining why kai-* needs no compiler config', async () => {
    // The mirror of Vue's isCustomElement assertion. A reader arriving from the
    // Vue config's `isCustomElement` block will look for the equivalent here and
    // find nothing; this paragraph is what tells them the absence is deliberate,
    // so patching out the paragraph ABOVE it must not take it along.
    const viteConfig = await readFile(path.join(dir, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('isCustomElement');
    expect(viteConfig).toContain('native custom element');
  });

  it('records svelte paths in kai.json', async () => {
    const kai = JSON.parse(await readFile(path.join(dir, 'kai.json'), 'utf8'));
    expect(kai).toMatchObject({ framework: 'svelte', registration: 'elements', gateway: 'mock' });
    expect(kai.paths.app).toBe('src/App.svelte');
    expect(kai.paths.entry).toBe('src/main.ts');
  });

  it('points the README at the file this project actually has', async () => {
    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('# svelte-app');
    expect(readme).toContain('`src/App.svelte`');
    expect(readme).not.toContain('src/App.tsx');
    expect(readme).not.toContain('src/App.vue');
  });

  it('emits a package.json a user can install', async () => {
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('svelte-app');
    expect(pkg.private).toBeUndefined();
    expect(pkg.dependencies['@kitn.ai/ui']).toBe('^9.9.9');
    expect(pkg.dependencies.svelte).toBeDefined();
    for (const spec of Object.values(pkg.dependencies as Record<string, string>)) {
      expect(spec).not.toMatch(/^(?:workspace:|file:\.\.|link:)/);
    }
    // svelte-check, not tsc — the emitted build has to typecheck `.svelte` markup.
    expect(pkg.scripts.build).toContain('svelte-check');
  });
});

/**
 * SolidJS — the only row whose `registration` is not `elements`.
 *
 * IT WAS THE ONE `ready` FRAMEWORK WITHOUT A BLOCK HERE, which is the reason to
 * write one: not that it was uncovered — the parameterized `paths` loop below
 * asserts its emitted paths and `smoke.mjs` builds it — but that six of seven
 * had a hand-written block and the seventh did not, which reads as a deliberate
 * exemption and is not one.
 *
 * What it is FOR, rather than symmetry: every other starter reaches the kit by
 * registering `kai-*` custom elements, and this one imports the SolidJS
 * components directly from `@kitn.ai/ui/solid`, because Solid is the kit's
 * authored layer. `kai.json` records that as `registration: 'solid'` so a future
 * codegen branches on the field instead of re-deriving it by parsing the entry
 * file — so the field being right is load-bearing, and nothing else asserts it
 * on an emitted project.
 */
describe('generate (solid + full-screen + conversations + mock)', () => {
  let root: string;
  let dir: string;
  let files: string[];

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-solid-'));
    dir = path.join(root, 'solid-app');
    const result = await generate(plan(dir, { frameworkId: 'solid', name: 'solid-app' }), {
      templateRoot: TEMPLATE_ROOT,
    });
    files = result.files;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('emits the composed workspace as components plus lib modules', async () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'src/App.tsx',
        'src/chat-data.ts',
        'src/components/Sidebar.tsx',
        'src/components/ThreadView.tsx',
        'src/components/Composer.tsx',
        'src/lib/chat.ts',
        'src/lib/conversations.ts',
      ]),
    );
    // This starter used to be a 533-line single-file primitives showcase with no
    // composer and no stream. Asserting the files exist would pass on a shell, so
    // assert what makes it a chat APP.
    const app = await readFile(path.join(dir, 'src/App.tsx'), 'utf8');
    expect(app).toContain('createChat');
    expect(app).toContain('readOpenAIStream');
  });

  it('imports the Solid components directly instead of registering kai-* elements', async () => {
    // THE POINT OF THIS ROW. Checked against the IMPORT LIST rather than by
    // searching the source for `kai-`, which appears eight times in this
    // starter's own prose explaining why it does NOT use the web components — a
    // check that reads prose reports on what a file says, not what it does.
    const app = await readFile(path.join(dir, 'src/App.tsx'), 'utf8');
    expect(app).toMatch(/from '@kitn\.ai\/ui\/solid'/);
    // The root entry is the wrong one for this target and the starter says so;
    // `/solid` is the subpath that ships the authored components.
    expect(app).not.toMatch(/from '@kitn\.ai\/ui'/);

    const entry = await readFile(path.join(dir, 'src/index.tsx'), 'utf8');
    expect(entry).toContain('solid-js/web');
    expect(entry).not.toContain('@kitn.ai/ui/elements');
  });

  it('applies the solid patch — its only one', async () => {
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    expect(html).toContain('<title>solid-app</title>');
    expect(html).not.toContain('SolidJS example');
    // Solid's vite.config has no `workspace:*` paragraph to strip, which is why
    // this template needs one patch where every other Vite row needs two. The
    // absence is asserted rather than assumed.
    const viteConfig = await readFile(path.join(dir, 'vite.config.ts'), 'utf8');
    expect(viteConfig).not.toContain('nx build ui');
    expect(viteConfig).not.toContain('workspace:*');
  });

  it('records solid paths in kai.json, with the stylesheet this starter has', async () => {
    const kai = JSON.parse(await readFile(path.join(dir, 'kai.json'), 'utf8'));
    expect(kai).toMatchObject({ framework: 'solid', registration: 'solid', gateway: 'mock' });
    expect(kai.paths.entry).toBe('src/index.tsx');
    expect(kai.paths.app).toBe('src/App.tsx');
    // `src/styles.css`, NOT the `src/index.css` every other row carries and this
    // row claimed until it went `ready`. A `planned` framework is never checked
    // against its template, so it was wrong for as long as the row existed.
    expect(kai.paths.css).toBe('src/styles.css');
    // `src/components`, not the `src` it said while the app was one file.
    expect(kai.paths.components).toBe('src/components');
  });

  it('points the README at the file this project actually has', async () => {
    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('# solid-app');
    expect(readme).toContain('`src/App.tsx`');
    expect(readme).not.toContain('src/App.svelte');
    expect(readme).not.toContain('src/App.vue');
  });

  it('emits a package.json a user can install, with a build that typechecks', async () => {
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('solid-app');
    expect(pkg.private).toBeUndefined();
    expect(pkg.dependencies['@kitn.ai/ui']).toBe('^9.9.9');
    expect(pkg.dependencies['solid-js']).toBeDefined();
    for (const spec of Object.values(pkg.dependencies as Record<string, string>)) {
      expect(spec).not.toMatch(/^(?:workspace:|file:\.\.|link:)/);
    }
    // The CONTRAST with tanstack-start, which bundles green with type errors in
    // it. This build runs `tsc` first, so `scriptsToRun` has no typecheck to add.
    expect(buildTypechecks(pkg.scripts.build)).toBe(true);
    expect(scriptsToRun(pkg.scripts)).toEqual(['build']);
  });
});

/**
 * HTML — the no-framework cell, and the only row whose `templateDir` is not its
 * `id`: `html` is served by `examples/starters/vanilla`.
 *
 * That mismatch is the thing worth testing. Everything else in the CLI keys off
 * `framework.id`, so a `patchesFor(framework.id)` written anywhere by reflex
 * silently finds NO patches for this row and the build's repo-internals check is
 * the only thing standing between that and a shipped `nx build ui`. The patch
 * assertions below fail if the lookup ever drifts to the id.
 */
describe('generate (html + full-screen + conversations + mock)', () => {
  let root: string;
  let dir: string;
  let files: string[];

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-html-'));
    dir = path.join(root, 'html-app');
    const result = await generate(plan(dir, { frameworkId: 'html', name: 'html-app' }), {
      templateRoot: TEMPLATE_ROOT,
    });
    files = result.files;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('emits the composed workspace as plain modules, no framework components', async () => {
    expect(files).toEqual(
      expect.arrayContaining(['src/main.ts', 'src/chat-data.ts', 'src/state.ts', 'src/view.ts']),
    );
    // The whole point of this cell: no `.svelte`/`.vue`/`.tsx` anywhere.
    expect(files.filter((f) => /\.(?:svelte|vue|tsx|jsx)$/.test(f))).toEqual([]);
  });

  it('applies the vanilla patches, found by templateDir and not by id', async () => {
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    expect(html).toContain('<title>html-app</title>');
    expect(html).not.toContain('vanilla example');

    const viteConfig = await readFile(path.join(dir, 'vite.config.ts'), 'utf8');
    expect(viteConfig).not.toContain('nx build ui');
    expect(viteConfig).not.toContain('workspace:*');
  });

  it('keeps the browser explanation and drops the self-description', async () => {
    // This template's second paragraph is the one case where a patch REWRITES
    // rather than stops short: half of it explains the browser (true in the
    // user's project), half describes the starter — "unlike the React/Vue
    // examples", "this is the showcase" — which is a sentence about a different
    // project than the one the user is now holding.
    const viteConfig = await readFile(path.join(dir, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('No framework plugin here');
    expect(viteConfig).toContain('upgrades the `kai-*` custom elements');
    expect(viteConfig).not.toContain('showcase');
    expect(viteConfig).not.toMatch(/React\/Vue examples/);
  });

  it('records html paths in kai.json, where entry and app are the same file', async () => {
    const kai = JSON.parse(await readFile(path.join(dir, 'kai.json'), 'utf8'));
    expect(kai).toMatchObject({ framework: 'html', registration: 'elements', gateway: 'mock' });
    // Unique to this row: there is no component tree, so the entry IS the app.
    expect(kai.paths.app).toBe('src/main.ts');
    expect(kai.paths.entry).toBe('src/main.ts');
  });

  it('points the README at this project\'s own thread expression', async () => {
    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('# html-app');
    expect(readme).toContain('`src/main.ts`');
    // Each framework reads its thread back differently; this one goes through a
    // plain store, so React's `chat.messages` would name nothing that exists.
    expect(readme).toContain('toOpenAIMessages(store.state.messages)');
    expect(readme).not.toContain('toOpenAIMessages(chat.messages)');
  });

  it('emits a package.json with no framework dependency at all', async () => {
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('html-app');
    expect(pkg.private).toBeUndefined();
    expect(pkg.dependencies['@kitn.ai/ui']).toBe('^9.9.9');
    expect(Object.keys(pkg.dependencies)).toEqual(['@kitn.ai/ui']);
    for (const spec of Object.values(pkg.dependencies as Record<string, string>)) {
      expect(spec).not.toMatch(/^(?:workspace:|file:\.\.|link:)/);
    }
    // Plain tsc: no template compiler is involved anywhere in this project.
    expect(pkg.scripts.build).toContain('tsc');
    expect(pkg.scripts.build).not.toContain('vue-tsc');
    expect(pkg.scripts.build).not.toContain('svelte-check');
  });
});

/**
 * The SERVER-RENDERED cell, and the first STANDALONE starter to be `ready`.
 *
 * Two things here are covered by nothing else in the suite, which is why this
 * block is not just a copy of the five above:
 *
 *   1. THE BROWSER TAB. `verifyTitles` in the build reads `.html` files, and this
 *      framework has none — the document title is a `head()` meta entry in
 *      `src/routes/__root.tsx`. See the KNOWN LIMIT paragraph on `titleProblems`
 *      (src/template-guards.ts), which names this exact case and hands the gap to
 *      whoever makes an SSR row ready. The title assertion below is that gap
 *      closed for the title this project HAS. (A second `head()` added in a new
 *      route is still uncovered; that needs a parser, not a regex.)
 *   2. THE KIT SPEC OUTSIDE package.json. The six linked starters say
 *      `workspace:*`; this one says `file:../../../packages/ui`, and it repeats
 *      that path in `.npmrc`, which `rewritePackageJson` never opens.
 */
describe('generate (tanstack-start + full-screen + conversations + mock)', () => {
  let root: string;
  let dir: string;
  let files: string[];

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-tanstack-'));
    dir = path.join(root, 'tanstack-app');
    const result = await generate(
      plan(dir, { frameworkId: 'tanstack-start', name: 'tanstack-app' }),
      { templateRoot: TEMPLATE_ROOT },
    );
    files = result.files;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('emits the composed workspace as routes plus components, not a static <Chat>', async () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'src/routes/index.tsx',
        'src/routes/__root.tsx',
        'src/chat-data.ts',
        'src/components/Sidebar.tsx',
        'src/components/ThreadView.tsx',
        'src/components/Composer.tsx',
        'src/hooks/useConversations.ts',
      ]),
    );
    // This starter used to be a static demo: one batteries-included <Chat> fed a
    // frozen MESSAGES array, with no composer and no stream. Asserting the files
    // exist would pass on that too, so assert what makes it a chat APP.
    const app = await readFile(path.join(dir, 'src/routes/index.tsx'), 'utf8');
    expect(app).toContain('useKaiChat');
    expect(app).toContain('readOpenAIStream');
    expect(app).toContain('streamAssistant');

    // The drop-in is gone, checked against the IMPORT LIST rather than by
    // searching the source for `<Chat`. The first version of this assertion did
    // the latter and failed on the file's own header comment, which explains why
    // the static `<Chat>` demo was replaced — a check that reads prose reports on
    // what a file SAYS instead of what it does.
    const named = app.match(/import \{([^}]*)\} from '@kitn\.ai\/ui\/react'/)?.[1];
    expect(named, 'the app must import the composed pieces from @kitn.ai/ui/react').toBeDefined();
    const imported = named!.split(',').map((s) => s.trim());
    expect(imported).toContain('useKaiChat');
    expect(imported).not.toContain('Chat');
  });

  it('names the browser tab after the user app, in the head() meta the build cannot read', async () => {
    const rootRoute = await readFile(path.join(dir, 'src/routes/__root.tsx'), 'utf8');
    expect(rootRoute).toContain("{ title: 'tanstack-app' }");
    expect(rootRoute).not.toContain('TanStack Start example');
  });

  it('leaves no monorepo-relative kit path in .npmrc, which no rewrite opens', async () => {
    const npmrc = await readFile(path.join(dir, '.npmrc'), 'utf8');
    expect(npmrc).not.toMatch(/file:(?:\.\.\/)+packages\/ui/);
    // The directive survives; only the explanation of OUR layout is replaced.
    expect(npmrc).toContain('install-links=true');
  });

  it('records tanstack paths in kai.json, with components outside routes/', async () => {
    const kai = JSON.parse(await readFile(path.join(dir, 'kai.json'), 'utf8'));
    expect(kai).toMatchObject({
      framework: 'tanstack-start',
      registration: 'elements',
      gateway: 'mock',
    });
    expect(kai.paths.app).toBe('src/routes/index.tsx');
    expect(kai.paths.entry).toBe('src/router.tsx');
    // NOT `src/routes`: the router plugin compiles that directory to build the
    // route tree, so a v2 `add` must not drop a plain component into it.
    expect(kai.paths.components).toBe('src/components');
  });

  it('points the README at this project\'s own thread expression', async () => {
    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('# tanstack-app');
    expect(readme).toContain('`src/routes/index.tsx`');
    expect(readme).toContain('toOpenAIMessages(chat.messages)');
  });

  it('emits a build that does NOT typecheck, plus the typecheck script that covers it', async () => {
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('tanstack-app');
    expect(pkg.dependencies['@kitn.ai/ui']).toBe('^9.9.9');
    for (const spec of Object.values(pkg.dependencies as Record<string, string>)) {
      expect(spec).not.toMatch(/^(?:workspace:|file:\.\.|link:)/);
    }
    // THE #195 HOLE, PINNED. A bare `vite build` strips types with esbuild rather
    // than checking them, so this project bundles green with type errors in it.
    // `scriptsToRun` is what makes smoke run `typecheck` as well — if this build
    // ever gains a `tsc`, that rule stops adding it, and this assertion is what
    // says so out loud rather than letting coverage quietly shrink.
    expect(pkg.scripts.build).toBe('vite build');
    expect(buildTypechecks(pkg.scripts.build)).toBe(false);
    expect(pkg.scripts.typecheck).toContain('tsc');
    expect(scriptsToRun(pkg.scripts)).toEqual(['build', 'typecheck']);
  });
});

/**
 * The RSC cell — the other standalone starter, and the last row to go `ready`.
 *
 * It shares the `.npmrc` and JS-declared-title shapes with tanstack-start above,
 * so those are asserted here in their Next spellings rather than assumed. What is
 * covered by NOTHING else in the suite is the pair below:
 *
 *   1. THE `'use client'` BOUNDARY. Next is the only framework where putting the
 *      directive in the wrong file is a build error on one side and a silently
 *      server-rendered dead page on the other. The emitted project has to keep
 *      `app/page.tsx` a Server Component and `app/workspace.tsx` the island.
 *   2. THE TOKEN STYLESHEET, third instance of a defect that has now cost three
 *      starters (#216 TanStack, #217 Solid-is-safe, this row). `theme.css` is
 *      Tailwind SOURCE; a project with no Tailwind must import the pre-compiled
 *      `theme.tokens.css` or the browser discards its `@theme { … }` block whole
 *      — measured in Chromium, that leaves the host-page chrome outside every
 *      `kai-*` element with no light-mode colours (`.app` computes
 *      `rgba(0, 0, 0, 0)`), with a completely green build. Asserted on the
 *      IMPORT LIST, not by searching the file — the file's
 *      own comment explains the trap and names `theme.css` in prose, so a
 *      substring search would report on what the file SAYS instead of what it
 *      does. That is the mistake #216 made writing the sibling assertion.
 */
describe('generate (nextjs + full-screen + conversations + mock)', () => {
  let root: string;
  let dir: string;
  let files: string[];

  /** The bare `import '<spec>'` specifiers in a module, in order. */
  const sideEffectImports = (source: string) =>
    [...source.matchAll(/^import\s+'([^']+)';/gm)].map((m) => m[1]);

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-nextjs-'));
    dir = path.join(root, 'next-app');
    const result = await generate(plan(dir, { frameworkId: 'nextjs', name: 'next-app' }), {
      templateRoot: TEMPLATE_ROOT,
    });
    files = result.files;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('emits the composed workspace as an RSC page plus a client island', async () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'app/layout.tsx',
        'app/page.tsx',
        'app/workspace.tsx',
        'app/globals.css',
        'app/chat-data.ts',
        'app/components/Sidebar.tsx',
        'app/components/ThreadView.tsx',
        'app/components/Composer.tsx',
        'app/hooks/useConversations.ts',
      ]),
    );
    // This starter used to be an SSR compatibility demo: a `<Button>` rendered
    // from a Server Component and a `<Conversations>` fed a frozen array, with no
    // composer and no stream. Asserting the files exist would pass on a project
    // that still had that in it, so assert what makes it a chat APP.
    const app = await readFile(path.join(dir, 'app/workspace.tsx'), 'utf8');
    expect(app).toContain('useKaiChat');
    expect(app).toContain('readOpenAIStream');
    expect(app).toContain('streamAssistant');
    expect(files).not.toContain('app/InteractiveIsland.tsx');

    // The drop-in is gone, checked against the IMPORT LIST rather than by
    // searching the source for `<Chat`: the file's header comment explains why
    // the static demo was replaced, and a check that reads prose reports on what
    // a file SAYS instead of what it does.
    const named = app.match(/import \{([^}]*)\} from '@kitn\.ai\/ui\/react'/)?.[1];
    expect(named, 'the app must import the composed pieces from @kitn.ai/ui/react').toBeDefined();
    const imported = named!.split(',').map((s) => s.trim());
    expect(imported).toContain('useKaiChat');
    expect(imported).not.toContain('Chat');
  });

  it("puts 'use client' on the island and leaves the page a Server Component", async () => {
    const page = await readFile(path.join(dir, 'app/page.tsx'), 'utf8');
    const layout = await readFile(path.join(dir, 'app/layout.tsx'), 'utf8');
    const workspace = await readFile(path.join(dir, 'app/workspace.tsx'), 'utf8');
    // The directive is only a directive at the top of the file; anywhere else it
    // is a string expression. So the first line is what is asserted, not
    // `includes`, which both of these files would satisfy from their prose.
    const firstLine = (s: string) => s.split('\n')[0].trim();
    expect(firstLine(workspace)).toBe("'use client';");
    expect(firstLine(page)).not.toBe("'use client';");
    expect(firstLine(layout)).not.toBe("'use client';");
  });

  it('imports the COMPILED token stylesheet, not the Tailwind source', async () => {
    const layout = await readFile(path.join(dir, 'app/layout.tsx'), 'utf8');
    const specs = sideEffectImports(layout);
    expect(specs).toContain('@kitn.ai/ui/theme.tokens.css');
    // The defect: `@kitn.ai/ui/theme.css` is Tailwind v4 source, and this project
    // runs no Tailwind (`postcss.config.mjs` declares no plugins), so the browser
    // discards its `@theme { … }` block whole and `:root` ends up with no
    // light-mode `--color-*` at all — with a completely green `next build`.
    expect(specs).not.toContain('@kitn.ai/ui/theme.css');
    // And the stylesheet it pairs with actually consumes those tokens, so this is
    // not two files agreeing about an import nothing reads.
    const css = await readFile(path.join(dir, 'app/globals.css'), 'utf8');
    expect(css).toContain('var(--color-background)');
  });

  it('names the browser tab after the user app, in the metadata export the guard parses', async () => {
    const layout = await readFile(path.join(dir, 'app/layout.tsx'), 'utf8');
    expect(layout).toContain("title: 'next-app'");
    expect(layout).not.toContain('Next.js App Router example');
  });

  it('leaves no monorepo-relative kit path in .npmrc, which no rewrite opens', async () => {
    const npmrc = await readFile(path.join(dir, '.npmrc'), 'utf8');
    expect(npmrc).not.toMatch(/file:(?:\.\.\/)+packages\/ui/);
    // The directive survives; only the explanation of OUR layout is replaced.
    expect(npmrc).toContain('install-links=true');
  });

  it('records next paths in kai.json, with components outside the route files', async () => {
    const kai = JSON.parse(await readFile(path.join(dir, 'kai.json'), 'utf8'));
    expect(kai).toMatchObject({ framework: 'nextjs', registration: 'elements', gateway: 'mock' });
    // NOT `app/page.tsx`: the page is the Server Component, and the composed
    // workspace — with the go-live expression in it — is the island.
    expect(kai.paths.app).toBe('app/workspace.tsx');
    expect(kai.paths.entry).toBe('app/layout.tsx');
    // NOT the bare `app`, which would scatter a v2 `add`'s generated components
    // in among page.tsx and layout.tsx.
    expect(kai.paths.components).toBe('app/components');
    expect(kai.paths.css).toBe('app/globals.css');
  });

  it("points the README at this project's own thread expression", async () => {
    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('# next-app');
    expect(readme).toContain('`app/workspace.tsx`');
    expect(readme).toContain('toOpenAIMessages(chat.messages)');
  });

  it('emits a build that typechecks on its own, unlike TanStack Start', async () => {
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('next-app');
    expect(pkg.dependencies['@kitn.ai/ui']).toBe('^9.9.9');
    for (const spec of Object.values(pkg.dependencies as Record<string, string>)) {
      expect(spec).not.toMatch(/^(?:workspace:|file:\.\.|link:)/);
    }
    // THE CONTRAST with tanstack-start, which bundles green with type errors in
    // it: `next build` runs tsc unless `typescript.ignoreBuildErrors` is set, so
    // `scriptsToRun` adds nothing after it. If this project ever gains that
    // setting, this pair is what says so out loud.
    expect(pkg.scripts.build).toBe('next build');
    expect(buildTypechecks(pkg.scripts.build)).toBe(true);
    expect(scriptsToRun(pkg.scripts)).toEqual(['build']);
  });
});

/**
 * The cross-framework version of the `paths` check, over the EMITTED project
 * rather than the template.
 *
 * `kai.json` hands these paths to a v2 `add`, so a wrong one is a command that
 * writes to a file that is not there — reported against the user's project
 * rather than against the table that was wrong. `scripts/build.mjs` gates the
 * same invariant, but only at build time and only for whoever runs the build;
 * this puts it in the suite, and it widens by itself the moment another
 * framework flips to `ready`.
 */
describe('every ready framework declares paths its emitted project has', () => {
  for (const framework of FRAMEWORKS.filter((f) => f.status === 'ready')) {
    it(`${framework.id}: entry, app, components and css all exist`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), `create-kai-paths-${framework.id}-`));
      try {
        const dir = path.join(root, 'paths-app');
        await generate(plan(dir, { frameworkId: framework.id, name: 'paths-app' }), {
          templateRoot: TEMPLATE_ROOT,
        });
        for (const key of ['entry', 'app', 'components', 'css'] as const) {
          expect(
            existsSync(path.join(dir, framework.paths[key])),
            `${framework.id} declares paths.${key}='${framework.paths[key]}', which the emitted project does not have`,
          ).toBe(true);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

/**
 * Every dotfile that travelled underscored arrives under its real name.
 *
 * WHY THIS IS A LOOP OVER A LIST AND NOT TWO NAMED TESTS. `_gitignore` had a
 * named test from the start and `.npmrc` had none, which is the whole shape of
 * the 0.1.0 defect: the mechanism was understood, tested, and applied to one
 * file. So the subject is `STRIPPED_DOTFILES` — the list `scripts/build.mjs`
 * renames from and `generate()` renames back to — and a row added there is
 * covered here without anybody remembering this block exists.
 *
 * WHICH TEMPLATES CARRY WHICH FILE IS READ OFF DISK, not declared. `.gitignore`
 * is required of every starter and `.npmrc` only exists in the two standalone
 * ones; hard-coding that split would make this test wrong the day a Vite starter
 * grows an `.npmrc`, and wrong in the silent direction.
 *
 * THE VACUITY GUARD AT THE END IS THE POINT. Every assertion in the loop is
 * conditional on the template having the travelling file, so a build that
 * emitted no `_npmrc` at all — which is precisely the regression — would run
 * this block to completion, assert nothing about it, and pass.
 */
describe('the stripped-dotfile rename round-trips', () => {
  const exercised = new Set<string>();

  for (const framework of FRAMEWORKS.filter((f) => f.status === 'ready')) {
    it(`${framework.id}: every travelling dotfile lands under its real name`, async () => {
      const template = path.join(TEMPLATE_ROOT, framework.templateDir);
      const travelling = STRIPPED_DOTFILES.filter((dotfile) =>
        existsSync(path.join(template, travellingName(dotfile))),
      );

      const root = await mkdtemp(path.join(tmpdir(), `create-kai-dotfiles-${framework.id}-`));
      try {
        const dir = path.join(root, 'dot-app');
        await generate(plan(dir, { frameworkId: framework.id, name: 'dot-app' }), {
          templateRoot: TEMPLATE_ROOT,
        });

        for (const dotfile of travelling) {
          exercised.add(dotfile);
          expect(
            existsSync(path.join(dir, dotfile)),
            `${framework.id} ships ${travellingName(dotfile)} in its template, but the emitted ` +
              `project has no ${dotfile} — npm strips that name, so this only breaks once published`,
          ).toBe(true);
          expect(
            existsSync(path.join(dir, travellingName(dotfile))),
            `${framework.id} left ${travellingName(dotfile)} in the emitted project`,
          ).toBe(false);
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  it('exercised every name on the list, so none of the above was vacuous', () => {
    // If a template stops carrying a travelling dotfile the loop above simply
    // has nothing to assert for it and stays green. That is the regression, so
    // it is asserted directly: each row must have been reached by at least one
    // framework.
    expect([...exercised].sort()).toEqual([...STRIPPED_DOTFILES].sort());
  });
});

/**
 * A focused control on the go-live extraction, because the emitted README's
 * snippet is the one piece of this CLI's output a user pastes verbatim.
 */
describe('goLiveThread', () => {
  const fw = getFramework('angular')!;

  it('keeps a call expression balanced', () => {
    // The regression: `[^)]+` returned `this.chat.messages(` here, and the
    // README emitted an unclosed call.
    expect(goLiveThread('toOpenAIMessages(this.chat.messages())', fw)).toBe(
      'this.chat.messages()',
    );
  });

  it('still reads the paren-free expressions react and vue use', () => {
    expect(goLiveThread('toOpenAIMessages(chat.messages)', fw)).toBe('chat.messages');
    expect(goLiveThread('toOpenAIMessages(messages.value)', fw)).toBe('messages.value');
  });

  it('handles nesting rather than stopping at the first close', () => {
    expect(goLiveThread('toOpenAIMessages(sel(get(state)))', fw)).toBe('sel(get(state))');
  });

  it('throws rather than inventing one when the call never closes', () => {
    expect(() => goLiveThread('toOpenAIMessages(this.chat.messages(', fw)).toThrow(/balanced/);
  });

  it('throws when the app file carries no such call', () => {
    expect(() => goLiveThread('const x = 1;', fw)).toThrow(/balanced/);
  });
});
