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

import { routeSymbolsProblem, routeWireProblem } from '../src/build-guards';
import {
  BROWSER_WIRE,
  EMITTED_READER_FORMAT,
  WIRED_GATEWAYS,
  getIntegration,
  wirableGateway,
} from '../src/catalog';
import { generate, renderEnvFile } from '../src/generate';
import { FRAMEWORKS, getFramework } from '../src/frameworks';
import { rewritePackageJson } from '../src/package-json';
import { clientModelFor, emitRoute, emittedPreambleSymbols } from '../src/routes';
import type { ProjectPlan } from '../src/types';

/** The keyed gateways this release wires, which is what most of this file loops. */
const KEYED = [...WIRED_GATEWAYS].filter((id) => id !== 'mock');

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

describe('routeSymbolsProblem — grades the EMITTED route, not the kit', () => {
  /**
   * WHAT THIS RULE IS FOR NOW. Until the kit exported `chatRoutePreamble`, this
   * package carried a hand-copied preamble and this guard watched it for drift.
   * There is one source now, so that question cannot be wrong and a guard over
   * it would be machinery over nothing.
   *
   * What survives is one step later: `emitRoute` decides whether the kit's
   * declarations actually reach the file. Every case below is a way this
   * package can ship a non-compiling route while the kit's own tests stay green,
   * because the kit never sees this file.
   */
  it('catches an emitted route that dropped the preamble it was handed', () => {
    const anthropic = getIntegration('anthropic')!;
    const required = emittedPreambleSymbols(anthropic);
    // anthropic is the case that matters: its route calls wireParts/wireText, so
    // the kit hands back the content helpers as well as the body narrowing.
    expect(required).toContain('wireParts');

    const problem = routeSymbolsProblem('anthropic', anthropic.webRoute, anthropic.webRoute!, required);
    expect(problem).toContain('does not declare');
    expect(problem).toContain('emitRoute');
  });

  it('is not fooled by a name the fragment merely CALLS', () => {
    // The fragment calls `readChatRequest`, so a substring test over the emitted
    // file would pass on a file that dropped every declaration. This asserts the
    // rule looks for a declaration.
    const problem = routeSymbolsProblem(
      'x',
      'async function chatHandler(r: Request) { return readChatRequest(r); }',
      'async function chatHandler(r: Request) { return readChatRequest(r); }',
      ['readChatRequest'],
    );
    expect(problem).toContain('does not declare');
  });

  it('refuses a wired gateway with no webRoute at all', () => {
    expect(routeSymbolsProblem('pi', undefined, '', [])).toContain('no webRoute');
  });

  it('refuses a preamble with nothing in it, which means the contract moved', () => {
    expect(routeSymbolsProblem('x', 'async function chatHandler() {}', '', [])).toContain(
      'contract moved',
    );
  });

  it('passes the real emitted route for every wired cell', () => {
    // The assertion that would have to fail before a broken gateway could ship:
    // the same integrations, frameworks and emitter the build uses.
    for (const id of KEYED) {
      const integration = getIntegration(id)!;
      for (const framework of FRAMEWORKS.filter((f) => f.status === 'ready' && f.route)) {
        const [route] = emitRoute(integration, framework);
        expect(
          routeSymbolsProblem(id, integration.webRoute, route.contents, emittedPreambleSymbols(integration)),
        ).toBeNull();
      }
    }
  });
});

describe('routeWireProblem — what the BROWSER receives', () => {
  /**
   * THE FAILURE HERE IS SILENT, which is why it is worth a rule of its own. The
   * kit's own catalog note says feeding a foreign SSE dialect to
   * `readOpenAIStream` "does not throw — it parses to nothing and the turn ends
   * silently empty". So the emitted project installs, builds, typechecks, smokes
   * green, and answers every message with an empty bubble.
   */
  it('refuses a wired gateway that never says what its route returns', () => {
    const problem = routeWireProblem('vercel-ai-sdk', BROWSER_WIRE, EMITTED_READER_FORMAT);
    expect(problem).toContain('BROWSER_WIRE');
    expect(problem).toContain('SILENT');
  });

  it('refuses a gateway whose route returns a dialect the front end cannot read', () => {
    // The concrete near-future case: vercel-ai-sdk's route returns an AI-SDK
    // stream. Wiring it needs a reader axis in the go-live patch first.
    const problem = routeWireProblem('vercel-ai-sdk', { 'vercel-ai-sdk': 'ai-sdk' }, 'openai-sse');
    expect(problem).toContain('reader axis');
  });

  it('accepts anthropic even though its streamFormat is `native`', () => {
    // THE WHOLE REASON THIS IS A DECLARATION AND NOT A DERIVATION. Gating on
    // `streamFormat === 'openai-sse'` would refuse a gateway that works: the
    // anthropic route re-frames every frame to OpenAI form before returning.
    expect(getIntegration('anthropic')!.streamFormat).toBe('native');
    expect(routeWireProblem('anthropic', BROWSER_WIRE, EMITTED_READER_FORMAT)).toBeNull();
  });

  it('passes every wired gateway', () => {
    for (const id of KEYED) {
      expect(routeWireProblem(id, BROWSER_WIRE, EMITTED_READER_FORMAT)).toBeNull();
    }
  });
});

describe('the model table comes from the kit', () => {
  /**
   * NO GUARD HERE ANY MORE, deliberately. This package used to carry a copy of
   * `CLIENT_MODEL_IDS` and a `routeModelProblem` rule to notice a missing row.
   * `defaultModelFor` is exported now and THROWS on exactly that condition, at
   * exactly the moment ours fired, from the one place that owns the table — so
   * the rule was a second copy of a check, which is the thing it existed to
   * prevent. Deleting it is not a coverage loss; the assertion below is the
   * behaviour that used to be ours.
   */
  it('throws for an integration that forwards `model` with no id registered', () => {
    expect(() =>
      clientModelFor({ ...getIntegration('openrouter')!, id: 'not-in-the-table' }),
    ).toThrow(/CLIENT_MODEL_IDS/);
  });

  it('gives every wired gateway that forwards `model` a real id', () => {
    for (const id of KEYED) {
      const integration = getIntegration(id)!;
      if (!integration.forwardsFromClient.includes('model')) continue;
      expect(clientModelFor(integration)).toBeTruthy();
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
    // `openai` is `outOfBand: 'none'`, TypeScript, and has a webRoute — it is
    // the cheapest UNWIRED gateway there is, and it is still refused, because
    // being wirable and being wired are different claims.
    expect(WIRED_GATEWAYS.has('openai')).toBe(false);
    expect(wirableGateway('openai', react)).toContain('not wired by this release');
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

/** Every (gateway, framework) cell this release claims to wire. */
const CELLS = KEYED.flatMap((gatewayId) =>
  wirable(gatewayId).map((f) => ({ gatewayId, frameworkId: f.id })),
);

describe.each(CELLS)('generate($frameworkId + $gatewayId)', ({ gatewayId, frameworkId }) => {
  let root: string;
  let dir: string;
  let files: string[];
  const framework = getFramework(frameworkId)!;
  const integration = getIntegration(gatewayId)!;

  beforeAll(async () => {
    if (!existsSync(TEMPLATE_ROOT)) {
      throw new Error(
        `no templates at ${TEMPLATE_ROOT} — run \`pnpm --filter create-kai run build\` first`,
      );
    }
    root = await mkdtemp(path.join(tmpdir(), 'create-kai-gw-'));
    dir = path.join(root, 'my-app');
    files = (
      await generate(plan(dir, { frameworkId, gatewayId }), { templateRoot: TEMPLATE_ROOT })
    ).files;
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
    for (const name of integration.envVars) {
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
    expect(app).toContain(`model: '${clientModelFor(integration)}'`);
  });

  it('records the route path in kai.json for a v2 `add` to read', async () => {
    const kai = JSON.parse(await readFile(path.join(dir, 'kai.json'), 'utf8'));
    expect(kai.gateway).toBe(gatewayId);
    expect(kai.paths.route).toBe(framework.route!.file);
  });

  it('keeps the key out of anything that could be committed', async () => {
    // `.env.local` is the only file that may carry the variable's VALUE, and it
    // has to be ignored. A scaffold whose first `git add .` stages an API key is
    // the worst version of this whole feature.
    const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.env.local');
    const app = await readFile(path.join(dir, framework.paths.app), 'utf8');
    for (const name of integration.envVars) expect(app).not.toContain(name);
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
