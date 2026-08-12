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

import { GITIGNORE_TEMPLATE_NAME, generate } from '../src/generate';
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

  it('refuses a framework with no template', async () => {
    await expect(
      generate(plan(path.join(root, 'c'), { frameworkId: 'vue' }), {
        templateRoot: TEMPLATE_ROOT,
      }),
    ).rejects.toThrow(/no template/);
  });
});
