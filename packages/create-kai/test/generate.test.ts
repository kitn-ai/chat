/**
 * Golden tests on the emitted project.
 *
 * These assert the RESULT of the copy + patch, not that files exist: a test that
 * only checks for the presence of `package.json` passes on a project that cannot
 * install. Each assertion below names something that breaks a user's first run.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GITIGNORE_TEMPLATE_NAME, generate, goLiveThread } from '../src/generate';
import { FRAMEWORKS, getFramework } from '../src/frameworks';
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
   * Was `featureIds: ['attachments']`, which the kit's catalog can now emit — so
   * the request stopped being refused HERE and fell through to the next refusal
   * ("generated feature surfaces are not wired"), which is the test above. That
   * is two tests asserting one rule and none asserting this one.
   *
   * The subject moved to `conversations` on Next.js: no composed workspace shell
   * and no `kai-conversations` renderer branch, so nothing can produce it.
   *
   * ORDER MATTERS AND IS ASSERTED. `generate` refuses in sequence — unknown
   * framework, unknown gateway, resolveSurface, unwired generated surface, no
   * template — and Next.js has no template in `dist/templates` either, so a bare
   * `rejects.toThrow()` here would pass on the LAST of those while this one
   * silently stopped firing. Matching the reason pins which rule caught it.
   */
  it('refuses a feature no renderer and no starter can produce', async () => {
    const error = await generate(
      plan(path.join(root, 'b'), { frameworkId: 'nextjs', featureIds: ['conversations'] }),
      { templateRoot: TEMPLATE_ROOT },
    ).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error, 'generate accepted a feature nothing can produce').not.toBeNull();
    // ONE error, both properties. Two separate `rejects` calls would let the
    // "not the template refusal" half pass on its own while the first half was
    // the thing that failed — and this cell reaches BOTH refusals, so which one
    // fired is the entire question.
    expect(error!.message).toMatch(/feature 'conversations' cannot be emitted for Next\.js/);
    expect(error!.message, 'caught by the missing-template check, not the feature gate').not.toMatch(
      /no template/,
    );
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
