import { describe, it, expect } from 'vitest';
import { integrations, archetypes, getIntegration, getArchetype, listIntegrations, listArchetypes, listGatewayGroups } from './registry';
import { IntegrationSchema, ArchetypeSchema } from './types';
import type { Integration } from './types';

// --- Integrations ---

it('has the launch integrations', () => {
  const ids = integrations.map((i) => i.id);
  for (const id of ['openai', 'anthropic', 'openrouter', 'vercel-ai-sdk', 'langgraph', 'cloudflare', 'ollama', 'mastra', 'pi', 'pydantic-ai', 'mock'])
    expect(ids).toContain(id);
});

it('has exactly 11 integrations (10 real + mock)', () => {
  expect(integrations).toHaveLength(11);
});

/**
 * The two keys a developer is most likely to already hold. They were missing for
 * the catalog's whole life, which meant the shortest path from "I have an OpenAI
 * key" to a running app went through a gateway signup.
 */
it('ships the two first-party provider integrations', () => {
  for (const id of ['openai', 'anthropic']) {
    const integration = getIntegration(id);
    expect(integration, `${id} is not registered`).toBeDefined();
    expect(integration?.category).toBe('provider');
    expect(integration?.envVars.length, `${id} declares no API key env var`).toBeGreaterThan(0);
  }
});

it('includes the zero-config mock integration', () => {
  const m = getIntegration('mock');
  expect(m).toBeDefined();
  expect(m?.category).toBe('mock');
  expect(m?.envVars).toEqual([]);
  // mock ships no backend route — the front-end streams locally
  expect(Object.keys(m!.routeTemplates).length).toBe(0);
});

it('every integration validates against IntegrationSchema', () => {
  for (const i of integrations) {
    const result = IntegrationSchema.safeParse(i);
    // The message, not just `false`. This assertion used to read `expected false
    // to be true`, which names neither the integration nor the rule it broke —
    // and the schema's refinements exist precisely to TELL an author what to
    // declare and why. Throwing that text away made the guard cost more to
    // diagnose than the bug it caught.
    expect(
      result.success,
      result.success ? '' : `${i.id}: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')}`,
    ).toBe(true);
  }
});

it('every real (non-mock) integration ships a route some framework can host', () => {
  for (const i of integrations.filter((i) => i.id !== 'mock')) {
    const routes = Object.keys(i.routeTemplates).length + (i.webRoute ? 1 : 0);
    expect(routes, `${i.id}: no route template and no webRoute`).toBeGreaterThan(0);
  }
});

/**
 * The portable handler is what stops a framework being handed another
 * framework's route. It has to BE portable: a `chatHandler(request)` the
 * scaffolder can wrap, with no framework's own export in it.
 */
it('every webRoute declares a chatHandler and nothing framework-specific', () => {
  for (const i of integrations.filter((i) => i.webRoute)) {
    expect(i.webRoute, `${i.id}`).toMatch(/async function chatHandler\(request: Request\): Promise<Response>/);
    // `export async function POST` / `export default {` belong to a framework's
    // route declaration, which the scaffolder appends per framework.
    expect(i.webRoute, `${i.id}: exports a framework's route from the portable body`).not.toMatch(
      /export (async function (POST|GET)|default)/,
    );
  }
});

/**
 * DEFECT (2): a route that drops the upstream status turns a 401 — the no-key
 * first run — into a 200 carrying a JSON error body labelled text/event-stream.
 * The browser then sees an empty stream: no bubble, no console output. Every
 * route that proxies an upstream Response must forward its status.
 */
it('every route that proxies an upstream forwards its status', () => {
  const bodies = integrations.flatMap((i) =>
    [...Object.entries(i.routeTemplates), ...(i.webRoute ? [['webRoute', i.webRoute] as const] : [])].map(
      ([key, code]) => ({ label: `${i.id}.${key}`, code }),
    ),
  );
  for (const { label, code } of bodies) {
    if (!/upstream\.ok/.test(code)) continue;
    expect(code, `${label}: checks upstream.ok but never forwards upstream.status`).toMatch(
      /status: upstream\.status/,
    );
  }
});

/**
 * `forwardsFromClient` is a CLAIM about the route, and until now nothing checked
 * it in either direction. A declared field the route never reads is the dead-const
 * defect (an editable value the backend throws away); a field the route DOES read
 * but never declares is the mirror image — most visibly a `tools` array the front
 * end is never told to send, which leaves kai-tool a panel no code path can fill.
 *
 * `messages` is excluded because it is not a `forwardsFromClient` value: every
 * route reads it, by definition.
 */
const requestFields = (code: string): Set<string> => {
  const out = new Set<string>();
  const pattern = /const\s*\{([^}]*)\}\s*=\s*(?:await readChatRequest|\(await req(?:uest)?\.json\(\)\)|req\.body)/g;
  for (const match of code.matchAll(pattern)) {
    for (const raw of match[1].split(',')) {
      const name = raw.split(':')[0].trim();
      if (name === 'model' || name === 'tools') out.add(name);
    }
  }
  return out;
};

it('every forwardsFromClient field is actually read by the route', () => {
  for (const integration of integrations) {
    const sources = [...Object.values(integration.routeTemplates), ...(integration.webRoute ? [integration.webRoute] : [])];
    const read = new Set(sources.flatMap((code) => [...requestFields(code)]));
    for (const field of integration.forwardsFromClient) {
      expect(
        read.has(field),
        `${integration.id}: declares forwardsFromClient '${field}' but no route reads it off the request body — the scaffold would emit an editable const the backend throws away`,
      ).toBe(true);
    }
  }
});

it('every request field a route reads is declared in forwardsFromClient', () => {
  for (const integration of integrations) {
    const sources = [...Object.values(integration.routeTemplates), ...(integration.webRoute ? [integration.webRoute] : [])];
    for (const field of new Set(sources.flatMap((code) => [...requestFields(code)]))) {
      expect(
        integration.forwardsFromClient as string[],
        `${integration.id}: route reads '${field}' off the request body but does not declare it, so the scaffold never sends one`,
      ).toContain(field);
    }
  }
});

// --- keyExposure ---
//
// The flag `create-kai` reads before deciding where an API key goes. Wrong in the
// permissive direction, it writes a secret into a browser bundle — and a wrong
// value COMPILES, so nothing but a check over the declaration itself catches it.
// The schema refuses a missing flag; these refuse a false one.

const routeSourcesOf = (integration: Integration): string[] => [
  ...Object.values(integration.routeTemplates),
  ...(integration.webRoute ? [integration.webRoute] : []),
];

it('every integration declares keyExposure', () => {
  for (const integration of integrations) {
    expect(
      integration.keyExposure,
      `${integration.id}: no keyExposure. The CLI would have to guess whether this integration's key may sit in the browser bundle`,
    ).toBeDefined();
  }
});

/**
 * The permissive-direction guard, stated over `envVars` rather than route source
 * ON PURPOSE. Three integrations (`langgraph`, `vercel-ai-sdk`, `pydantic-ai`)
 * hold a key their route text never mentions, because the SDK reads the env var
 * itself inside `streamText()` / `new ChatOpenAI()` / `Agent(...)`. A grep of the
 * route would clear all three as keyless, which is the wrong answer in the one
 * direction that costs a secret.
 */
it('no integration that declares a secret env var claims to be frontend-safe', () => {
  const secretEnvVar = /(?:KEY|TOKEN|SECRET|PASSWORD)$/;
  for (const integration of integrations) {
    const secrets = integration.envVars.filter((name) => secretEnvVar.test(name));
    if (secrets.length === 0) continue;
    expect(
      integration.keyExposure,
      `${integration.id}: declares the secret(s) ${secrets.join(', ')} and claims keyExposure 'frontend-safe', which puts a key in client code`,
    ).toBe('needs-proxy');
  }
});

/** The same claim checked against the route text, which catches a key hardcoded with no `envVars` entry. */
it('no frontend-safe integration sends a credential from its route', () => {
  for (const integration of integrations.filter((i) => i.keyExposure === 'frontend-safe')) {
    for (const code of routeSourcesOf(integration)) {
      expect(
        code,
        `${integration.id}: claims keyExposure 'frontend-safe' but its route sends an authorization header`,
      ).not.toMatch(/Authorization\s*:|['"]x-api-key['"]\s*:/i);
    }
  }
});

/**
 * `frontend-safe` is the rare answer, so it is spelled out here as well: an
 * integration silently JOINING that set is the change worth noticing in review.
 * Ollama's route fetches localhost with no auth header; mock has no route at all.
 */
it('only ollama and mock are frontend-safe', () => {
  expect(integrations.filter((i) => i.keyExposure === 'frontend-safe').map((i) => i.id).sort()).toEqual(['mock', 'ollama']);
});

// --- outOfBand + the gateway grouping ---
//
// What `create-kai` prints as a PREREQUISITE, and the heading it files each
// gateway under. Wrong in the permissive direction it produces a scaffold that
// cannot possibly run — "npm run dev" to someone who has to start Ollama first —
// and reads as a broken kit rather than a missing step. As with `keyExposure`, a
// wrong value COMPILES, so only a check over the declaration catches it.

it('every integration declares outOfBand', () => {
  for (const integration of integrations) {
    expect(
      integration.outOfBand,
      `${integration.id}: no outOfBand. create-kai would have to guess whether this integration needs ` +
        'something running before the first message works',
    ).toBeDefined();
  }
});

/**
 * The set is spelled out, exactly as `only ollama and mock are frontend-safe` is,
 * because an integration silently JOINING or LEAVING it is the change worth
 * noticing in review — it moves a menu heading and a printed prerequisite.
 *
 * `langgraph` is deliberately NOT here, and that is a divergence from the
 * create-kai spec's prose, which lists it under "Bring a server or runtime". Its
 * emitted route builds the graph in process (`createReactAgent` over a
 * `new ChatOpenAI(...)`) and its runNote asks for a key and nothing else, so
 * there is no server to bring. If a LangGraph Platform integration is ever added
 * it is a separate catalog entry, not a change to this line.
 */
it('exactly ollama, mastra, pi and pydantic-ai need something out of band', () => {
  expect(
    integrations.filter((i) => i.outOfBand !== 'none').map((i) => i.id).sort(),
  ).toEqual(['mastra', 'ollama', 'pi', 'pydantic-ai']);
});

/** The KIND matters as much as the fact: each prints a different sentence. */
it('each out-of-band integration declares the kind of thing it needs', () => {
  expect(getIntegration('ollama')?.outOfBand).toBe('local-server');
  expect(getIntegration('mastra')?.outOfBand).toBe('local-server');
  // Not 'local-server': nothing is listening in advance, the route spawns it.
  expect(getIntegration('pi')?.outOfBand).toBe('local-binary');
  expect(getIntegration('pydantic-ai')?.outOfBand).toBe('language-runtime');
});

/**
 * The permissive-direction guard over the real catalog, on route source. The
 * schema refines the same three signals; this runs them against what actually
 * shipped, which is the half that catches a route edited after the flag was set.
 */
it('no integration claiming outOfBand none contradicts itself in its route', () => {
  for (const integration of integrations.filter((i) => i.outOfBand === 'none')) {
    expect(
      integration.language,
      `${integration.id}: claims outOfBand 'none' but its route is python, which a node toolchain cannot run`,
    ).not.toBe('python');
    for (const code of routeSourcesOf(integration)) {
      expect(
        code,
        `${integration.id}: claims outOfBand 'none' but its route spawns a process that nothing installs`,
      ).not.toMatch(/\bfrom\s+['"]node:child_process['"]|\bspawn\s*\(/);
      expect(
        code,
        `${integration.id}: claims outOfBand 'none' but its route fetches a loopback address, so something local must be listening`,
      ).not.toMatch(/\b(?:fetch|URL)\s*\(\s*['"`]https?:\/\/(?:localhost|127\.0\.0\.1)/);
    }
  }
});

/**
 * THE GROUPING THE create-kai SPEC DESCRIBES, now derived instead of restated.
 *
 * It could not be derived before `outOfBand` existed: `category` does not
 * separate the groups (`provider` holds openai AND ollama), an empty
 * `routeTemplates` picks out how a route is EXPRESSED rather than what it needs,
 * and "declares a secret env var" splits langgraph from pydantic-ai the wrong
 * way. Every partition that matched the spec matched it by accident.
 *
 * Asserted by MEMBERSHIP, not by count: a count passes while two integrations
 * swap groups, which is precisely the failure that would put a key prompt in
 * front of someone who needs to start a server.
 */
it('listGatewayGroups derives the three headings the CLI prompt needs', () => {
  const groups = listGatewayGroups();
  const idsIn = (id: string) =>
    groups.find((g) => g.id === id)!.integrations.map((i) => i.id).sort();

  // Derived from having no route at all, not from `id === 'mock'`.
  expect(idsIn('no-backend')).toEqual(['mock']);
  expect(idsIn('bring-a-server')).toEqual(['mastra', 'ollama', 'pi', 'pydantic-ai']);
  expect(idsIn('bring-a-key')).toEqual([
    'anthropic',
    'cloudflare',
    'langgraph',
    'openai',
    'openrouter',
    'vercel-ai-sdk',
  ]);
});

/** Every integration lands in exactly one group — no gaps, no duplicates. */
it('the gateway groups partition the catalog', () => {
  const grouped = listGatewayGroups().flatMap((g) => g.integrations.map((i) => i.id));
  expect(grouped.sort()).toEqual(integrations.map((i) => i.id).sort());
  expect(new Set(grouped).size, 'an integration appears in more than one gateway group').toBe(grouped.length);
});

/**
 * The precedence rule, made explicit because it is the one judgement in the
 * grouping. `pydantic-ai` needs BOTH a python runtime and OPENAI_API_KEY, so the
 * groups are not disjoint in reality and something has to win. The prerequisite
 * does: a key is useless until the service it authenticates is running.
 */
it('a gateway needing both a runtime and a key is grouped by the runtime', () => {
  const py = getIntegration('pydantic-ai')!;
  expect(py.envVars.some((v) => /KEY$/.test(v)), 'pydantic-ai stopped needing a key, so this test proves nothing').toBe(true);
  expect(
    listGatewayGroups().find((g) => g.integrations.includes(py))?.id,
  ).toBe('bring-a-server');
});

// --- deps ---
//
// What `create-kai` installs. The rule is that `deps.npm` IS the set of packages
// the route imports, so neither half can drift: a missing entry is an app that
// does not build, a stale one is an install of something nothing uses.

/** `@langchain/core/tools` is the package `@langchain/core`; `node:child_process` is not a package. */
const packageOf = (specifier: string): string => {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
};

const npmImportsOf = (integration: Integration): Set<string> => {
  const out = new Set<string>();
  for (const code of routeSourcesOf(integration)) {
    for (const match of code.matchAll(/(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
      const name = packageOf(specifier);
      // The kit is already a dependency of every scaffold, so it is never a
      // gateway dep. This is what keeps cloudflare's worker template (whose only
      // import is a type from '@kitn.ai/ui/wire') at deps.npm: [].
      if (name === '@kitn.ai/ui') continue;
      out.add(name);
    }
  }
  return out;
};

it('deps.npm is exactly what the routes import', () => {
  for (const integration of integrations) {
    expect(
      [...integration.deps.npm].sort(),
      `${integration.id}: deps.npm does not match the route's imports`,
    ).toEqual([...npmImportsOf(integration)].sort());
  }
});

/**
 * Forward direction only. `pip` is a SUPERSET of the python imports because a
 * python app also needs its ASGI server: nothing imports `uvicorn`, and an app
 * installed without it cannot start.
 */
it('every python import a route makes is declared in deps.pip', () => {
  const stdlib = new Set(['json', 'os', 'typing', 'asyncio', 'sys', 're', 'time', 'dataclasses']);
  for (const integration of integrations.filter((i) => i.language === 'python')) {
    for (const code of routeSourcesOf(integration)) {
      for (const match of code.matchAll(/(?:^|\n)\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/g)) {
        const module = (match[1] ?? match[2]).split('.')[0];
        if (stdlib.has(module)) continue;
        expect(
          integration.deps.pip,
          `${integration.id}: route imports '${module}' but deps.pip does not list it`,
        ).toContain(module.replace(/_/g, '-'));
      }
    }
  }
});

it('only the python integration declares pip deps', () => {
  for (const integration of integrations.filter((i) => i.language !== 'python')) {
    expect(integration.deps.pip, `${integration.id}: a TS integration declares pip deps`).toEqual([]);
  }
});

/**
 * `deps` is the ONLY place a package list may live, and this is what keeps it
 * that way.
 *
 * Three run notes used to carry a second copy as prose, and two of the three had
 * already drifted by the time anything compared them: langgraph's said "Install
 * @langchain/langgraph, @langchain/openai, @langchain/core" while `deps.npm`
 * carries those three plus `zod` (its route's tool schema is a `z.object()`, so
 * an app installed from the sentence does not build), and pydantic-ai's said
 * "pip install pydantic-ai fastapi uvicorn" while `deps.pip` carries those three
 * plus `pydantic` (which the route imports on line 5). Neither was catchable:
 * `deps` was checked against the route and the prose was checked against nothing.
 *
 * The scaffolder now emits the install command from `deps` itself, so the prose
 * is not merely redundant — it is a second answer to a question that has one.
 */
it('no runNote restates an install command', () => {
  for (const integration of integrations) {
    expect(
      integration.runNote,
      `${integration.id}: runNote names packages to install. \`deps\` is the single source and the ` +
        `scaffolder emits it; a sentence beside it is a copy that drifts and that nothing checks`,
    ).not.toMatch(/\b(?:npm|pnpm|yarn|pip)\s+(?:install|add)\b|\bInstall\s+@/i);
  }
});

// --- Anthropic wire constraints ---
//
// The Anthropic Messages API is NOT the OpenAI one with a different host, and
// every difference below is a 400 (or a silent 200) if the route is written as a
// copy of the OpenRouter one. Source: docs/superpowers/HANDOFF-model-driven-components.md §4.

/**
 * The object literal passed to JSON.stringify as the upstream request body.
 *
 * BRACE-MATCHED, not sliced at the first `}),`. The naive slice ended inside
 * `...(system ? { system } : {})` — three lines before `messages` — so the
 * assertions below about how `messages` is sent were reading a substring that
 * could not contain the word, and passed against a route that forwarded the
 * client array verbatim. The self-check for this whole block is that each
 * assertion was watched failing against a deliberately wrong body.
 */
const anthropicRequestBody = (): string => {
  const code = getIntegration('anthropic')?.webRoute ?? '';
  const open = code.indexOf('{', code.indexOf('body: JSON.stringify('));
  expect(open, 'anthropic route has no JSON.stringify body').toBeGreaterThan(-1);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  throw new Error('anthropic request body literal is unbalanced');
};

it('the Anthropic route sends `system` as a top-level field, not as a message', () => {
  const code = getIntegration('anthropic')?.webRoute ?? '';
  // The converter has to RECOGNISE a system turn. Delete this branch and the
  // system prompt silently rides along in `messages`, which is the 400.
  expect(code, 'anthropic route never handles a system-role message').toMatch(/case 'system'/);
  const body = anthropicRequestBody();
  // A KEY, not merely the identifier. `\bsystem\b` also matched the guard
  // expression in `...(system ? {} : {})` — a body that reads the variable and
  // then sends nothing — so a route that silently dropped the system prompt
  // passed both this suite and all 99 route compiles.
  expect(body, 'anthropic request body has no top-level `system` field').toMatch(
    /\{\s*system\s*\}|(?:^|[\s{,])system\s*:/,
  );
  // The wrong route is the one that forwards the client's OpenAI-shaped array
  // verbatim. Both spellings of that are rejected here.
  expect(body, 'anthropic route forwards the client `messages` array unconverted').not.toMatch(/\bmessages\s*,/);
  expect(body, 'anthropic route forwards the client `messages` array unconverted').not.toMatch(/messages\s*:\s*messages\b/);
});

it('the Anthropic route sends max_tokens, which the API requires', () => {
  expect(anthropicRequestBody(), 'anthropic request body omits the REQUIRED max_tokens').toMatch(/\bmax_tokens\s*:\s*\d+/);
});

it('no route sends tool_choice as a bare string', () => {
  for (const integration of integrations) {
    const sources = [...Object.values(integration.routeTemplates), ...(integration.webRoute ? [integration.webRoute] : [])];
    for (const code of sources) {
      // Anthropic's tool_choice is an OBJECT ({ type: 'auto' }); OpenAI's bare
      // string is a 400 there.
      expect(code, `${integration.id}: tool_choice is a bare string`).not.toMatch(/tool_choice\s*:\s*['"]/);
    }
  }
});

/**
 * A DOCUMENTATION guard, and only that — no route enables thinking today, so
 * there are no live numbers to check. What it does check is real: any route that
 * mentions `budget_tokens` must state BOTH halves of the constraint, because
 * stating one is how the original bug shipped. A budget derived as a fraction of
 * a small max_tokens returns HTTP 200 with no thinking and no error, which reads
 * as a provider limitation and cost this project a whole conformance sweep.
 *
 * If a numeric budget ever appears, the arithmetic is checked for real.
 */
it('any route mentioning budget_tokens states the full constraint', () => {
  for (const integration of integrations) {
    const sources = [...Object.values(integration.routeTemplates), ...(integration.webRoute ? [integration.webRoute] : [])];
    for (const code of sources) {
      if (!/budget_tokens/.test(code)) continue;
      expect(code, `${integration.id}: mentions budget_tokens without the 1024 floor`).toMatch(/1024/);
      expect(
        code,
        `${integration.id}: mentions budget_tokens without saying max_tokens must exceed it`,
      ).toMatch(/max_tokens\b[^\n]*(?:greater|exceed)|(?:greater|exceed)[^\n]*\bmax_tokens\b/i);

      const budget = code.match(/budget_tokens\s*:\s*(\d+)/);
      if (!budget) continue;
      const value = Number(budget[1]);
      expect(value, `${integration.id}: budget_tokens below the 1024 floor`).toBeGreaterThanOrEqual(1024);
      const maxTokens = code.match(/max_tokens\s*:\s*(\d+)/);
      expect(maxTokens, `${integration.id}: sets budget_tokens with no max_tokens`).not.toBeNull();
      expect(
        Number(maxTokens?.[1]),
        `${integration.id}: max_tokens must be strictly greater than budget_tokens`,
      ).toBeGreaterThan(value);
    }
  }
});

/**
 * The scaffolder's front end always reads with `readOpenAIStream` — there is no
 * branch on `streamFormat`. Feeding it Anthropic frames does not throw, it parses
 * to NOTHING, so the turn resolves empty with no error anywhere. Any integration
 * whose upstream is not already OpenAI SSE has to re-frame server-side.
 */
it('integrations whose upstream is not OpenAI SSE re-frame to OpenAI frames', () => {
  for (const integration of integrations) {
    if (integration.id === 'mock' || integration.streamFormat === 'openai-sse') continue;
    const sources = [...Object.values(integration.routeTemplates), ...(integration.webRoute ? [integration.webRoute] : [])];
    for (const code of sources) {
      // `\b` matters: without it `xchoices: [` satisfied this, so a mutation that
      // renamed the field away still passed.
      expect(
        code,
        `${integration.id}: streamFormat is '${integration.streamFormat}' but the route emits no OpenAI-shaped frame, so readOpenAIStream parses it to nothing`,
      ).toMatch(/\bchoices\s*:\s*\[/);
      // The text containing an OpenAI frame somewhere is not the same fact as the
      // RETURNED stream being re-framed — a route can keep a re-framer it no
      // longer calls. Handing `upstream.body` straight to the browser is the
      // whole defect, so it is rejected outright for these formats.
      expect(
        code,
        `${integration.id}: returns upstream.body unchanged, so the browser gets ${integration.streamFormat} frames readOpenAIStream parses to nothing`,
      ).not.toMatch(/new Response\(\s*upstream\.body/);
    }
  }
});

/**
 * THE INDEX TRAP, and the exact shape of the original Critical. Anthropic indexes
 * by CONTENT BLOCK; OpenAI's `tool_calls[].index` counts TOOL CALLS. A thinking
 * block ahead of a tool call pushes the block index from 0 to 1 while the call is
 * still tool call 0, so passing the block index through mislabels the call.
 */
it('the Anthropic re-framer translates the block index, never passes it through', () => {
  const code = getIntegration('anthropic')?.webRoute ?? '';
  expect(code, 'anthropic re-framer uses the CONTENT BLOCK index as the tool_calls index').not.toMatch(
    /index\s*:\s*event\.index/,
  );
  expect(code, 'anthropic re-framer has no block-index -> tool-index map').toMatch(/toolIndexOfBlock\.get\(/);
});

it('getIntegration looks up by id', () => {
  expect(getIntegration('ollama')?.language).toBe('ts');
});

it('getIntegration returns undefined for unknown id', () => {
  expect(getIntegration('not-a-real-id')).toBeUndefined();
});

it('listIntegrations returns all integrations', () => {
  expect(listIntegrations()).toEqual(integrations);
});

// --- streamMapping copy ---
//
// These strings are the only streaming instruction a scaffolding agent reads, so
// a stale one ships a hand-rolled reader into a consumer's app. Six of them used
// to promise a "kai-chat SSE reader" that did not exist under any name. It does
// now: readOpenAIStream from '@kitn.ai/ui/wire'.

it('no streamMapping claims a reader that does not exist', () => {
  for (const integration of integrations) {
    expect(
      integration.streamMapping,
      `${integration.id} still refers to a nameless built-in reader`,
    ).not.toMatch(/kai-chat's (SSE )?reader|Streaming-recipe reader|kai-chat SSE reader/i);
  }
});

it('every streamMapping names the adapter that parses the stream', () => {
  for (const integration of integrations) {
    expect(
      integration.streamMapping,
      `${integration.id} describes a stream but does not say what parses it`,
    ).toMatch(/readOpenAIStream/);
  }
});

// --- Archetypes ---

it('archetypes array is non-empty', () => {
  expect(archetypes.length).toBeGreaterThan(0);
});

it('every archetype validates against ArchetypeSchema', () => {
  for (const a of archetypes) {
    const result = ArchetypeSchema.safeParse(a);
    expect(result.success).toBe(true);
  }
});

it('getArchetype looks up by id', () => {
  expect(getArchetype('drop-in-chat')?.title).toBe('Drop-in chat');
});

it('getArchetype returns undefined for unknown id', () => {
  expect(getArchetype('not-a-real-archetype')).toBeUndefined();
});

it('listArchetypes returns all archetypes', () => {
  expect(listArchetypes()).toEqual(archetypes);
});
