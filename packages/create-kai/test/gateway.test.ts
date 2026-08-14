/**
 * The gateway path: a project wired to a real provider rather than the mock.
 *
 * Split from `generate.test.ts` because the two grade different claims. That
 * file asserts an emitted project is a faithful copy of a reviewed starter; this
 * one asserts the parts that have NO starter behind them — a generated route, a
 * rewritten call site, an env file — are right. The route is the only code this
 * CLI writes rather than copies, so it is the only code where "it was emitted"
 * and "it is correct" are separate questions.
 *
 * NOTHING HERE CALLS A PROVIDER, and nothing here should be changed so that it
 * does. The route is graded by compiling it (`scripts/smoke.mjs --gateway`) and
 * by reading the bytes below. A live round trip would cost money on every CI run
 * and would grade OpenRouter's uptime rather than this CLI.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { routeModelProblem, routeSymbolsProblem } from '../src/build-guards';
import { WIRED_GATEWAYS, getIntegration, wirableGateway } from '../src/catalog';
import { generate, renderEnvFile } from '../src/generate';
import { FRAMEWORKS, getFramework } from '../src/frameworks';
import { rewritePackageJson } from '../src/package-json';
import { CLIENT_MODEL_IDS, PREAMBLE_SYMBOLS, clientModelFor, emitRoute } from '../src/routes';
import type { ProjectPlan } from '../src/types';

const TEMPLATE_ROOT = path.resolve(__dirname, '../dist/templates');

const plan = (dir: string, over: Partial<ProjectPlan> = {}): ProjectPlan => ({
  dir,
  name: 'my-app',
  frameworkId: 'react',
  layout: 'full-screen',
  widgetStyle: null,
  featureIds: ['conversations'],
  gatewayId: 'openrouter',
  kit: '^9.9.9',
  ...over,
});

/** Every framework the CLI can wire this gateway onto, derived not restated. */
const wirable = (gatewayId: string) =>
  FRAMEWORKS.filter((f) => f.status === 'ready' && wirableGateway(gatewayId, f) === null);

describe('routeSymbolsProblem — the guard standing behind the duplicated preamble', () => {
  it('refuses a route needing a preamble this CLI does not carry', () => {
    // The real shape of the failure: anthropic, mastra and vercel-ai-sdk all
    // re-map message content and call the kit's `wireParts` / `wireText`
    // helpers, which are injected by a SECOND private preamble create-kai has
    // no copy of. Wiring one of them without noticing emits a route that does
    // not compile, and the user's `npm run build` is the only other thing that
    // would catch it.
    const problem = routeSymbolsProblem(
      'anthropic',
      'async function chatHandler(r: Request) { const b = await readChatRequest(r); return wireText(b.messages[0].content); }',
      PREAMBLE_SYMBOLS,
    );
    expect(problem).toContain('wireText');
    expect(problem).toContain('WIRED_GATEWAYS');
  });

  it('refuses a route that references none of the injected helpers', () => {
    // The reverse failure, and the one that protects the duplicate itself:
    // every webRoute in the catalog narrows its body through `readChatRequest`,
    // so a wired route that references nothing means the kit changed the
    // preamble contract and src/routes.ts is now a stale copy of it.
    const problem = routeSymbolsProblem(
      'someone',
      'async function chatHandler(r: Request) { return fetch("https://example.test"); }',
      PREAMBLE_SYMBOLS,
    );
    expect(problem).toContain('stale copy');
  });

  it('refuses a wired gateway with no webRoute at all', () => {
    expect(routeSymbolsProblem('pi', undefined, PREAMBLE_SYMBOLS)).toContain('no webRoute');
  });

  it('passes every gateway actually wired today, against the real catalog', () => {
    // Not a synthetic fixture: this is the assertion that would have to fail
    // before a broken gateway could ship, so it reads the same integrations the
    // build does.
    for (const id of WIRED_GATEWAYS) {
      if (id === 'mock') continue;
      expect(routeSymbolsProblem(id, getIntegration(id)?.webRoute, PREAMBLE_SYMBOLS)).toBeNull();
    }
  });
});

describe('routeModelProblem — the failure no build can see', () => {
  it('refuses a gateway that forwards `model` with no id to send', () => {
    // openrouter's handler puts the client's `model` straight into its
    // /chat/completions body. A front end that omits it posts no model and the
    // provider answers 400 — on a project that installed, built and smoked
    // green.
    const problem = routeModelProblem('openrouter', ['model', 'tools'], {});
    expect(problem).toContain('CLIENT_MODEL_IDS');
    expect(problem).toContain('no fallback');
  });

  it('is silent for a gateway whose route pins its own model', () => {
    // langgraph, cloudflare, ollama and vercel-ai-sdk all build the model into
    // the route. Emitting an editable constant for those is a knob that does
    // nothing, which is why this reads `forwardsFromClient` rather than
    // scanning the route text for the word `model`.
    expect(routeModelProblem('langgraph', ['tools'], {})).toBeNull();
  });

  it('passes every wired gateway against the real catalog', () => {
    for (const id of WIRED_GATEWAYS) {
      if (id === 'mock') continue;
      const integration = getIntegration(id);
      expect(routeModelProblem(id, integration?.forwardsFromClient ?? [], CLIENT_MODEL_IDS)).toBeNull();
    }
  });
});

describe('wirableGateway — a cell, not an axis', () => {
  it('refuses a wired gateway on a framework with no route destination', () => {
    const vue = getFramework('vue')!;
    // Vue is `ready` and openrouter is wired, and the pair is still not
    // scaffoldable: a keyed gateway needs a server route and this row declares
    // nowhere to put one. The message has to say which of the two is missing,
    // because the fixes live in different files.
    expect(vue.route).toBeNull();
    expect(wirableGateway('openrouter', vue)).toContain('no route destination');
  });

  it('refuses a gateway the release has not wired, even where a route could go', () => {
    const react = getFramework('react')!;
    expect(wirableGateway('anthropic', react)).toContain('not wired by this release');
  });

  it('always allows the mock, which needs no route anywhere', () => {
    for (const framework of FRAMEWORKS) {
      expect(wirableGateway('mock', framework)).toBeNull();
    }
  });
});

describe('emitRoute', () => {
  it('gives a Vite SPA the handler AND the plugin that mounts it', () => {
    // Three files is not an implementation detail here, it is the whole
    // difference between the two host shapes: without the plugin the emitted
    // fetch('/api/chat') 404s against the dev server's static handler and the
    // SSE reader fails on an HTML body.
    const files = emitRoute(getIntegration('openrouter')!, getFramework('react')!);
    expect(files.map((f) => f.path)).toEqual(['server/chat.ts', 'vite-chat-api.ts']);
  });

  it('gives a meta-framework one file at its own route path', () => {
    const files = emitRoute(getIntegration('openrouter')!, getFramework('nextjs')!);
    expect(files.map((f) => f.path)).toEqual(['app/api/chat/route.ts']);
    expect(files[0].contents).toContain('export async function POST');
  });

  it('carries the preamble the handler needs, above the handler', () => {
    const [route] = emitRoute(getIntegration('openrouter')!, getFramework('nextjs')!);
    // Order is load-bearing: `readChatRequest` is called by the handler, so a
    // preamble emitted below it is a use-before-declaration for the type alias.
    expect(route.contents.indexOf('async function readChatRequest')).toBeLessThan(
      route.contents.indexOf('async function chatHandler'),
    );
    expect(route.contents).toContain(`import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';`);
  });

  it('emits nothing for a framework with no route host', () => {
    expect(emitRoute(getIntegration('openrouter')!, getFramework('svelte')!)).toEqual([]);
  });

  it('reads the handler from the catalog rather than restating it', () => {
    // The provider endpoint must arrive from the integration. If this CLI ever
    // grows its own copy of a handler, this is what catches it.
    const [route] = emitRoute(getIntegration('openrouter')!, getFramework('nextjs')!);
    expect(route.contents).toContain(getIntegration('openrouter')!.webRoute!);
  });
});

describe('gateway dependencies', () => {
  /**
   * THE ONE CLAIM THE openrouter PROBE CANNOT MAKE.
   *
   * "the gateway's deps land in package.json" is wired and was wired before this
   * change — but `openrouter.deps.npm` is EMPTY (its route is global `fetch` and
   * imports no SDK), so scaffolding it exercises the path vacuously. A green
   * smoke run therefore proves nothing about deps, and saying otherwise would be
   * the exact shape of check this repo keeps paying for.
   *
   * So it is graded here against an integration that actually has some, which is
   * what a second wired gateway would hit on day one.
   */
  it('is a no-op for openrouter, which declares none', () => {
    expect(getIntegration('openrouter')!.deps.npm).toEqual([]);
  });

  it('carries a gateway`s declared npm deps into the emitted package.json', () => {
    const langgraph = getIntegration('langgraph')!;
    expect(langgraph.deps.npm.length).toBeGreaterThan(0);

    const { json } = rewritePackageJson(
      JSON.stringify({ name: 's', private: true, dependencies: { '@kitn.ai/ui': 'workspace:*' } }),
      { name: 'my-app', kit: '^9.9.9', gatewayDeps: langgraph.deps.npm },
    );
    const deps = json.dependencies as Record<string, string>;
    for (const pkg of langgraph.deps.npm) expect(deps[pkg]).toBeDefined();
  });
});

describe('renderEnvFile', () => {
  it('names the catalog variable and never leaves it blank', () => {
    const env = renderEnvFile(['OPENROUTER_API_KEY'], 'Set OPENROUTER_API_KEY.');
    expect(env).toContain('OPENROUTER_API_KEY=replace-me');
    // An empty assignment loads as the empty string, so the route would send
    // `Authorization: Bearer ` and the provider would answer 401 — legible only
    // after a round trip, and indistinguishable from a wrong key.
    expect(env).not.toMatch(/^OPENROUTER_API_KEY=$/m);
  });
});

describe.each(wirable('openrouter').map((f) => f.id))('generate(%s + openrouter)', (frameworkId) => {
  let root: string;
  let dir: string;
  let files: string[];
  const framework = getFramework(frameworkId)!;

  beforeAll(async () => {
    if (!existsSync(TEMPLATE_ROOT)) {
      throw new Error(
        `no templates at ${TEMPLATE_ROOT} — run \`pnpm --filter create-kai run build\` first`,
      );
    }
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-gw-'));
    dir = path.join(root, 'my-app');
    files = (await generate(plan(dir, { frameworkId }), { templateRoot: TEMPLATE_ROOT })).files;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes the route where the framework says it goes', () => {
    expect(files).toContain(framework.route!.file);
  });

  it('writes .env.local with the declared variable and a placeholder', async () => {
    expect(files).toContain(framework.paths.env);
    const env = await readFile(path.join(dir, framework.paths.env), 'utf8');
    for (const name of getIntegration('openrouter')!.envVars) {
      expect(env).toContain(`${name}=replace-me`);
    }
  });

  it('points the front end at the route instead of the mock', async () => {
    const app = await readFile(path.join(dir, framework.paths.app), 'utf8');
    expect(app).toContain(`fetch('/api/chat'`);
    expect(app).toContain('toOpenAIMessages(');
    // The whole point of the switch: the mock must be GONE, not merely unused.
    // An import left behind is TS6133 under the starters' `noUnusedLocals`, so
    // this is a build failure in the emitted project, not a tidiness question.
    expect(app).not.toContain('mockResponse');
  });

  it('sends a model id, because this gateway\'s route forwards one', async () => {
    const app = await readFile(path.join(dir, framework.paths.app), 'utf8');
    expect(app).toContain(`model: '${clientModelFor(getIntegration('openrouter')!)}'`);
  });

  it('records the route path in kai.json for a v2 `add` to read', async () => {
    const kai = JSON.parse(await readFile(path.join(dir, 'kai.json'), 'utf8'));
    expect(kai.gateway).toBe('openrouter');
    expect(kai.paths.route).toBe(framework.route!.file);
  });

  it('keeps the key out of anything that could be committed', async () => {
    // `.env.local` is the only file that may carry the variable's VALUE, and it
    // has to be ignored. A scaffold whose first `git add .` stages an API key is
    // the worst version of this whole feature.
    const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.env.local');
    const app = await readFile(path.join(dir, framework.paths.app), 'utf8');
    expect(app).not.toContain('OPENROUTER_API_KEY');
  });

  it('tells the README reader the route is there instead of how to add one', async () => {
    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain(framework.route!.file);
    // The mock README's body is a go-live diff. Emitting it here would tell a
    // user to make an edit their project already has.
    expect(readme).not.toContain('- await readOpenAIStream(mockResponse(text), stream);');
  });
});

describe('generate(mock) is unchanged by any of this', () => {
  it('writes no route, no env file, and records route: null', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'create-kai-mock-'));
    try {
      const dir = path.join(root, 'my-app');
      const { files } = await generate(plan(dir, { gatewayId: 'mock' }), {
        templateRoot: TEMPLATE_ROOT,
      });
      expect(files).not.toContain('server/chat.ts');
      expect(files).not.toContain('.env.local');
      const kai = JSON.parse(await readFile(path.join(dir, 'kai.json'), 'utf8'));
      expect(kai.paths.route).toBeNull();
      // The zero-config path must still ship the mock, which is the thing that
      // makes it zero-config.
      expect(await readFile(path.join(dir, 'src/App.tsx'), 'utf8')).toContain('mockResponse');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses rather than emitting a project that posts nowhere', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'create-kai-refuse-'));
    try {
      await expect(
        generate(plan(path.join(root, 'my-app'), { frameworkId: 'vue' }), {
          templateRoot: TEMPLATE_ROOT,
        }),
      ).rejects.toThrow(/no route destination/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
