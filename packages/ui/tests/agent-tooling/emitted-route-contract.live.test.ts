// @vitest-environment node
/**
 * EXECUTE the scaffolder's emitted BACKEND ROUTE against the host SDK it really
 * imports, with the transport stubbed. No key, no provider, no request leaves
 * the machine.
 *
 * THE DEFECT CLASS, STATED PRECISELY
 * ----------------------------------
 * This is not about models, and no network call is involved. It is: OUR
 * ENCODER'S OUTPUT IS INVALID INPUT TO THEIR SDK, rejected before any request is
 * issued. The route compiles, `verify:scaffold` is green, and every turn fails.
 *
 * The instance that earned this file, found only by driving a live model:
 *
 *   InvalidPromptError: System messages are not allowed in the prompt or
 *   messages fields. Use the instructions option instead.
 *
 * `SystemModelMessage` is still a member of `ai`'s `ModelMessage` union, so a
 * system entry in `messages` TYPECHECKS, and then `ai` v7's `standardizePrompt`
 * refuses it. Fixed in #227 by hoisting system turns into `instructions`.
 *
 * WHAT THIS FILE ASSERTS, AND WHY IT IS THE REQUEST SIDE
 * -----------------------------------------------------
 * Every covered route is driven with a genuine thread — `toOpenAIMessages` from
 * the kit's own encoder, with a system message prepended exactly as an app does
 * (see `examples/internal/openrouter-spike/src/hooks/useSpikeChat.ts`, which is
 * the app that hit the live failure) — and then asked ONE structural question:
 *
 *   DID THE ROUTE REACH ITS TRANSPORT AT ALL, CARRYING THE THREAD?
 *
 * That is the question the defect class answers "no" to, for every member of it,
 * whatever the SDK and whatever the error. It is deliberately NOT "did the
 * response parse": faking each SDK's own response protocol well enough to assert
 * on it would mean maintaining a fake of the thing under test, and the response
 * half already has real coverage (`src/wire/*-fixtures.test.ts` replay recorded
 * provider bytes; the spike replays recorded live streams).
 *
 * THE ASSERTION THAT MATTERS IS "A REQUEST WAS ISSUED", NOT "NO ERROR FRAME",
 * and that is a measurement rather than a preference. Driven against the route
 * as it shipped before #227, `ai` v7 produces:
 *
 *   · `result.textStream` — 0 deltas, NO throw, NO error part. The route emits
 *     `data: [DONE]` and nothing else. A silent empty stream: blank bubble,
 *     empty console.
 *   · `result.fullStream` — parts `['start', 'error']`, NO throw. The route's
 *     `case 'error'` turns that into an in-band error frame.
 *
 * The shipped pre-#227 route used `textStream`. So a guard that looked for an
 * error frame would have gone GREEN on the broken route that was actually in
 * main. Only "a request was issued" catches it. See the commit that added this
 * file for the watched reproduction.
 *
 * COVERAGE IS DERIVED, AND EMPTY IS A HARD FAILURE
 * ------------------------------------------------
 * The cells come from the catalog at run time, never from a list written here,
 * and `NOT_EXECUTABLE` has to name every integration that produces none — with a
 * reason that is CHECKED, not merely stated. A new integration therefore lands
 * in one of the two sets or this file goes red, and a harness that covers
 * nothing fails instead of passing. This repo has a CI step that exists solely
 * because a runner exits 0 on zero matches; the same mistake is available here.
 *
 * `outOfBand` DOES NOT DECIDE REACHABILITY, which is worth saying because it
 * looks as though it should. It describes what a DEVELOPER has to start, not
 * what this file needs. `mastra` and `ollama` are both `local-server` and both
 * covered: their routes reach that server over HTTP, so the stub stands in for
 * it exactly. `pi` is `local-binary` and is not covered: its transport is a
 * spawned child process over stdin, which no fetch stub can stand in for.
 *
 * THE LIMIT OF THE STUB, stated rather than left implicit: it replaces
 * `globalThis.fetch`, which is what all four SDKs here measurably use. An SDK
 * that switched to `node:http` would not be recorded, so its cell would fail the
 * "issued a request" assertion — loudly, but only after one request had already
 * gone out. That is how the escape described below was found, and it is the
 * reason this file has no path that could reach a provider WITH a real key: the
 * environment it sets is fake, and the required CI job has no secrets to leak
 * into it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../../mcp/mcp/tools/scaffold';
import { listIntegrations } from '../../mcp/registry';
import { defaultModelFor } from '../../mcp/route-emit';
import { toOpenAIMessages } from '../../src/wire';
import type { Integration } from '../../mcp/types';
import type { ChatMessage } from '../../src/elements/chat-types';
import type { OpenAIWireMessage } from '../../src/wire';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** Outside `tests/` and outside `src/` — same reason as the other emitted guards. */
const TMP_DIR = resolve(PKG, '.tmp-emitted-route');

/**
 * Credentials that are NOT credentials. Several routes read a key or a base URL
 * at module scope and fail loudly without one (mastra throws at import, by
 * design). These are obvious non-secrets, and nothing can spend them: every
 * transport below is replaced before the route is called.
 */
const FAKE_ENV: Record<string, string> = {
  AI_GATEWAY_API_KEY: 'kai-route-contract-not-a-key',
  OPENAI_API_KEY: 'kai-route-contract-not-a-key',
  ANTHROPIC_API_KEY: 'kai-route-contract-not-a-key',
  OPENROUTER_API_KEY: 'kai-route-contract-not-a-key',
  CF_API_TOKEN: 'kai-route-contract-not-a-key',
  CF_ACCOUNT_ID: 'kai-route-contract-account',
  MASTRA_URL: 'http://127.0.0.1:59999',
};

// Set before ANY emitted module is imported: mastra's route throws at import
// time when MASTRA_URL is missing, which is a deliberate property of that route
// and not something to work around by editing what it emits.
for (const [k, v] of Object.entries(FAKE_ENV)) process.env[k] ??= v;

// ── the thread ───────────────────────────────────────────────────────────────

/** Markers chosen so a substring hit cannot be an accident of SDK boilerplate. */
const SYSTEM_TEXT = 'KAI_ROUTE_CONTRACT_SYSTEM be terse';
const USER_TEXT = 'KAI_ROUTE_CONTRACT_USER what is the weather in Paris';
const TOOL_NAME = 'kai_route_contract_weather';
const TOOL_OUTPUT = 'KAI_ROUTE_CONTRACT_TOOL_OUTPUT 18C and clear';
/** base64 of `kai_route_contract_file`. Asserted as the bare base64 rather than
 *  as the whole data URI, because three routes strip the `data:...;base64,`
 *  prefix on the way into their SDK's file shape and one forwards it intact. */
const FILE_B64 = 'a2FpX3JvdXRlX2NvbnRyYWN0X2ZpbGU=';
const FILE_DATA_URI = `data:image/png;base64,${FILE_B64}`;

/** A settled tool round trip, as `<kai-tool>` holds one after `applyToolOutput`. */
const toolThread: ChatMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: USER_TEXT }] },
  {
    id: 'm2',
    role: 'assistant',
    parts: [
      {
        type: 'tool',
        tool: {
          type: TOOL_NAME,
          state: 'output-available',
          toolCallId: 'call_kai_route_contract_1',
          input: { city: 'Paris' },
          output: { summary: TOOL_OUTPUT },
        },
      },
    ],
  },
  { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'and tomorrow?' }] },
];

/** A user turn carrying an attachment: the shape that makes `toOpenAIMessages`
 *  emit the ARRAY content form, which is where three routes do their own file
 *  conversion and every other one forwards bytes it must not mangle. */
const fileThread: ChatMessage[] = [
  {
    id: 'f1',
    role: 'user',
    parts: [
      { type: 'text', text: USER_TEXT },
      {
        type: 'file',
        attachment: {
          id: 'a1',
          type: 'file',
          filename: 'shot.png',
          mediaType: 'image/png',
          url: FILE_DATA_URI,
        },
      },
    ],
  },
];

/** The OpenAI function-calling envelope the kit's front end posts as `tools`. */
const CLIENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: TOOL_NAME,
      description: 'Current weather for a city.',
      parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
    },
  },
];

interface Scenario {
  readonly name: string;
  readonly thread: ChatMessage[];
  /** Markers that MUST survive the route's conversion into the SDK's shape. */
  readonly mustCarry: readonly string[];
}

const SCENARIOS: readonly Scenario[] = [
  { name: 'system + a settled tool round trip', thread: toolThread, mustCarry: [SYSTEM_TEXT, USER_TEXT] },
  { name: 'system + an attachment', thread: fileThread, mustCarry: [SYSTEM_TEXT, USER_TEXT, FILE_B64] },
];

/**
 * The POST body, built the way a real app builds it.
 *
 * THE SYSTEM MESSAGE IS PREPENDED BY THE APP, not by the encoder. `ChatMessage`
 * has no system role and `toOpenAIMessages` never emits one, so #227's own
 * account ("the kit's encoder puts the system prompt at messages[0]") describes
 * the shape correctly and its origin incorrectly. What is true, and is what
 * makes this worth guarding, is that the route's declared request contract —
 * `ChatRequestBody.messages: OpenAIWireMessage[]`, whose role union includes
 * `'system'` — admits it, and adding a system prompt is the first thing anyone
 * does. The spike app that found the live failure does exactly this.
 */
function requestBody(integration: Integration, thread: ChatMessage[]): string {
  const messages: OpenAIWireMessage[] = [
    { role: 'system', content: SYSTEM_TEXT },
    ...toOpenAIMessages(thread),
  ];
  const model = defaultModelFor(integration);
  return JSON.stringify({
    messages,
    // Only what the integration DECLARES the front end sends. The scaffolder
    // emits the body from the same two facts, so a route is driven with the
    // body its own scaffold would post and not with a superset.
    ...(model === undefined ? {} : { model }),
    ...(integration.forwardsFromClient.includes('tools') ? { tools: CLIENT_TOOLS } : {}),
  });
}

// ── the emitted route, written to a real module ──────────────────────────────

const RUN = Date.now();
const FILE_SEPARATOR = /^\/\/ ── ([\w./+-]+\.\w+) ─+\s*$/m;

/** Block 2 only, exactly as `verify:scaffold`'s `backEnd()` slices it. */
function backEnd(text: string): string | null {
  const after = text.split('=== (2) BACKEND ROUTE ===')[1];
  return after === undefined ? null : after.split(/^=== \(3\)/m)[0];
}

async function emitRoute(id: string, framework: string): Promise<string> {
  const out = await scaffold.handler({
    useCase: 'drop-in-chat',
    integration: id,
    placement: 'full-page',
    framework,
  });
  const text = (out.content as { type: string; text: string }[])[0].text;
  const block = backEnd(text);
  expect(block, `${id}/${framework}: the scaffold emitted no BACKEND ROUTE section`).not.toBeNull();
  return block as string;
}

/**
 * Emitted block -> an importable module.
 *
 * Two rewrites, both of them the package's own exports map applied by hand, and
 * neither one touching the route's logic:
 *   · the scaffolder's `#` prose (runtime label, cannot-host warnings) is
 *     commentary around the code, stripped the same way `verify:scaffold` does.
 *   · `@kitn.ai/ui/wire` resolves through the exports map to `dist/`, which does
 *     not exist on a fresh worktree, so it is pointed at src for this run only —
 *     the same rewrite the other emitted guards use, and type-only here anyway.
 */
function toModule(block: string): string {
  return block
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .replaceAll("'@kitn.ai/ui/wire'", `'${PKG}/src/wire'`);
}

// ── transports ───────────────────────────────────────────────────────────────

/** One outbound call the route made, flattened to text for substring assertions. */
interface Issued {
  readonly target: string;
  readonly payload: string;
}

/**
 * A route's HOST: how it is invoked, and what its transport is.
 *
 * The transport is the whole point. `fetch` is the obvious one, but the
 * Cloudflare Worker route never calls it — its transport is the `env.AI`
 * binding — and a harness that only stubbed `fetch` would have reported that
 * route as issuing no request and been wrong about it. So the host owns both
 * halves: how to call the module, and what to replace.
 */
interface Host {
  readonly framework: string;
  /** Drives one request and returns everything the route sent out. */
  run(
    mod: Record<string, unknown>,
    body: string,
  ): Promise<{ status: number; sse: string; issued: Issued[]; logged: string }>;
}

/** OpenAI-format SSE. Enough for every pass-through route to reach [DONE]. */
const OPENAI_SSE = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
/** Cloudflare-native SSE, which the Worker route re-frames. */
const CF_NATIVE_SSE = 'data: {"response":"ok"}\n\ndata: [DONE]\n\n';

function chatRequest(body: string): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

/**
 * `globalThis.fetch`, replaced ONCE at module scope and never put back.
 *
 * IT IS INSTALLED HERE, AT THE TOP OF THE FILE, AND THAT PLACEMENT IS THE WHOLE
 * POINT. The first version of this harness swapped `fetch` around each call to
 * the route and restored it in a `finally`, which is wrong in a way that is
 * invisible until it bites: a route returns its `Response` as soon as the
 * headers are ready, and the provider call happens later, inside
 * `ReadableStream.start()`, when the body is READ. `await res.text()` therefore
 * ran after the restore — and `ai`'s gateway request went to the real network on
 * a fake key. The evidence was an in-band frame no stub could have produced:
 *
 *   AI Gateway authentication failed: Invalid API key or token.
 *
 * Nothing was spent, but a request left the machine, which this file exists not
 * to do. A stub whose lifetime is a function call cannot cover a transport whose
 * lifetime is a stream. So the real implementation is unreachable for the whole
 * run, and a fetch made outside a driven request THROWS rather than escaping:
 * the only honest way to assert the absence of a network call is to make one
 * fail.
 */
let recording: Issued[] | null = null;
let canned: () => Response = () => sse(OPENAI_SSE);

(globalThis as unknown as { fetch: unknown }).fetch = async (
  input: unknown,
  init?: RequestInit,
): Promise<Response> => {
  let target = '';
  let payload = '';
  if (input instanceof Request) {
    target = input.url;
    payload = await input.clone().text();
  } else {
    target = String(input);
    const b = init?.body;
    payload = typeof b === 'string' ? b : b === undefined || b === null ? '' : String(b);
  }
  if (recording === null) {
    throw new Error(
      `an emitted route called fetch(${target}) outside a driven request — at import time, or ` +
        `after its response was read. Nothing may reach the network from this file.`,
    );
  }
  recording.push({ target, payload });
  return canned();
};

/**
 * Drive one request with the transport recorded.
 *
 * The body is drained INSIDE the window, because for several routes that is when
 * the provider is actually called.
 */
async function driven(
  response: () => Response,
  fn: () => Promise<Response>,
  // Passed in rather than created here so a host with a NON-fetch transport can
  // record into the same list: the Worker's binding stub is built before the
  // request and pushes into this array, so "issued a request" means the same
  // thing whichever transport a route uses.
  issued: Issued[] = [],
): Promise<{ status: number; sse: string; issued: Issued[]; logged: string }> {
  recording = issued;
  canned = response;

  // Captured, not forwarded. `streamText`'s default `onError` is
  // `({ error }) => console.error(error)`, so for the historical defect this is
  // the ONLY place the reason appears anywhere: the pre-#227 route drove
  // `textStream`, which yields nothing and throws nothing, and the route's own
  // in-band catch never fires. Forwarding instead would print on every green run
  // too, because a canned response is not any SDK's real wire protocol and
  // several of them say so out loud once the request has been issued — which is
  // past the point this file is asserting about.
  const realError = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '));
  };
  try {
    const res = await fn();
    const text = await res.text();
    return { status: res.status, sse: text, issued, logged: lines.join(' | ') };
  } finally {
    console.error = realError;
    recording = null;
  }
}

const NEXT_HOST: Host = {
  framework: 'next',
  async run(mod, body) {
    const post = mod.POST as ((r: Request) => Promise<Response>) | undefined;
    expect(typeof post, 'the emitted Next route exports no POST').toBe('function');
    return driven(
      () => sse(OPENAI_SSE),
      () => (post as (r: Request) => Promise<Response>)(chatRequest(body)),
    );
  },
};

/**
 * The Cloudflare Worker route, whose transport is a BINDING.
 *
 * `env.AI.run(model, options)` is Workers AI's own API, reached through the
 * runtime rather than over HTTP, so the stub goes on the binding. `fetch` is
 * stubbed as well and recorded into the same list: if this route ever grows an
 * HTTP call, it counts as issuing a request too.
 */
const WORKER_HOST: Host = {
  framework: 'worker',
  async run(mod, body) {
    const handler = mod.default as { fetch(req: Request, env: unknown): Promise<Response> } | undefined;
    expect(typeof handler?.fetch, 'the emitted Worker exports no default.fetch').toBe('function');
    const issued: Issued[] = [];
    const env = {
      AI: {
        run: async (model: string, options: unknown) => {
          issued.push({ target: `binding:env.AI.run(${model})`, payload: JSON.stringify(options) });
          return sse(CF_NATIVE_SSE).body as ReadableStream<Uint8Array>;
        },
      },
    };
    return driven(
      () => sse(OPENAI_SSE),
      () => (handler as { fetch(req: Request, env: unknown): Promise<Response> }).fetch(chatRequest(body), env),
      issued,
    );
  },
};

function sse(text: string): Response {
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/**
 * The `{ error: { message } }` frames a route sent in band, as one string.
 *
 * Every route in the catalog reports a mid-stream failure this way, because the
 * status is spent once the headers are out. When the transport was never
 * reached, that frame is the only thing that says WHY — so it goes into the
 * failure message rather than being left for whoever reruns with a debugger.
 * It is never asserted on: see the header for why the response half is out of
 * scope here.
 */
function inBandErrors(text: string): string {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') continue;
    try {
      const frame = JSON.parse(payload) as { error?: { message?: string } };
      if (frame.error?.message) out.push(frame.error.message);
    } catch {
      /* not JSON — nothing to report */
    }
  }
  return out.length === 0 ? '(the route reported no error in band)' : out.join(' | ');
}

// ── which cells exist ────────────────────────────────────────────────────────

/**
 * A host per emission shape the scaffolder can produce, keyed by how the route
 * is reached rather than by integration id.
 *
 * `next` is chosen for the portable handler because its adapter is the thinnest
 * one that is still real: no imports, no generated companion file, and the
 * `export async function POST(req: Request)` it appends is three lines over the
 * integration's own `chatHandler`. The framework axis proper belongs to
 * `verify:scaffold`, which compiles all 11 x 11; what varies at RUNTIME between
 * frameworks is the adapter's own wrapper, not the conversion under test here.
 */
const HOSTS: Record<string, Host> = { next: NEXT_HOST, worker: WORKER_HOST };

interface Cell {
  readonly id: string;
  readonly integration: Integration;
  readonly host: Host;
  readonly label: string;
}

/**
 * Every integration this harness cannot execute, and why.
 *
 * `check` is what keeps these from being prose. Each reason is re-derived from
 * the catalog on every run, so an exclusion that stops being true fails here
 * rather than quietly granting itself amnesty — which is the same failure mode
 * as a runner exiting 0 on zero matches, one level up.
 *
 * Declared ABOVE `cellsFor` because `cellsFor` consults it: `mock` now ships a
 * webRoute (the G-04 fix) that this harness's one load-bearing assertion — "a
 * request was ISSUED" — is wrong about by design, so the exclusion has to keep
 * the cell from existing, not merely excuse an integration that produced none.
 */
const NOT_EXECUTABLE: Record<string, { why: string; check(i: Integration): boolean }> = {
  mock: {
    why:
      'its route reaches no transport at all — createMockResponder() streams canned frames ' +
      'in-process, so there is no SDK conversion and no upstream contract for this harness to ' +
      'pin, and "issued a request" is false by DESIGN rather than by defect. The frames are ' +
      "pinned by the state package's own tests, the browser path by " +
      '`emitted-mock-path.live.test.ts`, and the route COMPILES under verify:scaffold like any other',
    // Honest only while the route stays transport-free: a fetch, a spawn or an
    // SDK client appearing in it makes this check false and the exclusion red.
    check: (i) =>
      !!i.webRoute &&
      Object.keys(i.routeTemplates).length === 0 &&
      !/\bfetch\s*\(|\bspawn\s*\(|new\s+[A-Z]\w*Client/.test(i.webRoute),
  },
  'pydantic-ai': {
    why: 'Python. `verify:scaffold` sends it to `ast.parse` plus substring checks; it cannot be imported into a node runtime',
    check: (i) => i.language === 'python',
  },
  pi: {
    why:
      'its route is an Express server that spawns the `pi` BINARY and talks to it over stdin. ' +
      'The transport is a child process, and importing the module binds port 3001 — so covering ' +
      'it would mean replacing express AND node:child_process, i.e. replacing the route rather ' +
      'than driving it. It also does no SDK conversion: it reads messages.at(-1) and refuses a ' +
      'non-text array outright, which is the one shape this harness would have to check',
    check: (i) =>
      !i.webRoute &&
      i.outOfBand === 'local-binary' &&
      /spawn\(|app\.listen\(/.test(Object.values(i.routeTemplates).join('\n')),
  },
};

/**
 * Derived from the catalog, never listed.
 *
 * An integration contributes a `next` cell if it has a portable `webRoute`, plus
 * one cell for every framework-specific `routeTemplates` key a host exists for.
 * Registering an integration therefore adds coverage by itself — the property
 * `verify:scaffold` had to be repaired to get, after `openai` and `anthropic`
 * both landed in the catalog and compiled zero times.
 */
function cellsFor(integration: Integration): Cell[] {
  // Excluded integrations produce no cells AT ALL, not just an excuse after the
  // fact — see the NOT_EXECUTABLE header. The `check` functions above are what
  // keep this gate from being a silent coverage hole: a stale exclusion fails
  // the "states a reason that is still true" test below.
  if (integration.id in NOT_EXECUTABLE) return [];
  const out: Cell[] = [];
  if (integration.webRoute) {
    out.push({ id: integration.id, integration, host: NEXT_HOST, label: `${integration.id}/next` });
  }
  for (const framework of Object.keys(integration.routeTemplates)) {
    const host = HOSTS[framework];
    if (!host) continue;
    out.push({ id: integration.id, integration, host, label: `${integration.id}/${framework}` });
  }
  return out;
}

const INTEGRATIONS = listIntegrations();
const CELLS = INTEGRATIONS.flatMap(cellsFor);
const COVERED = new Set(CELLS.map((c) => c.id));

// ── the runs ─────────────────────────────────────────────────────────────────

const modules = new Map<string, Record<string, unknown>>();

beforeAll(async () => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
  for (const cell of CELLS) {
    const block = await emitRoute(cell.id, cell.host.framework);
    // Single-file only. The Vite-middleware adapter emits several files that
    // import each other; if one of these two ever did, importing the first
    // chunk would silently drive half a route.
    expect(
      FILE_SEPARATOR.test(block),
      `${cell.label}: block (2) is multi-file, which this harness cannot import as one module`,
    ).toBe(false);
    const file = resolve(TMP_DIR, `${RUN}.${cell.id}.${cell.host.framework}.ts`);
    writeFileSync(file, toModule(block));
    // Imported ONCE per cell and reused across scenarios, which is also what a
    // server does: langgraph builds its agent and mastra its client at module
    // scope, and re-importing per request would test a shape nobody runs.
    modules.set(cell.label, (await import(/* @vite-ignore */ file)) as Record<string, unknown>);
  }
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('the harness covers what the catalog contains', () => {
  it('runs the node environment the routes need, not jsdom', () => {
    // If the `@vitest-environment node` directive above ever stops being read,
    // these routes would run against jsdom's globals and this file would start
    // testing something else. Named explicitly so the failure says so.
    expect(typeof globalThis.window, 'the `@vitest-environment node` directive is not in effect').toBe(
      'undefined',
    );
    expect(typeof globalThis.Request).toBe('function');
    expect(typeof globalThis.ReadableStream).toBe('function');
  });

  it('executes at least one route — zero coverage is a failure, not a pass', () => {
    expect(
      CELLS.map((c) => c.label),
      'no emitted route is executed by this harness, so every assertion below would pass vacuously',
    ).not.toEqual([]);
    expect(COVERED.size).toBeGreaterThan(0);
  });

  it('accounts for every integration in the catalog, executed or excluded', () => {
    const unaccounted = INTEGRATIONS.map((i) => i.id)
      .filter((id) => !COVERED.has(id))
      .filter((id) => !(id in NOT_EXECUTABLE));
    expect(
      unaccounted,
      'these integrations emit a route that nothing here executes. Add a Host for the shape ' +
        'they emit, or an entry in NOT_EXECUTABLE saying why they cannot be driven offline.',
    ).toEqual([]);
  });

  it('states a reason for each exclusion that is still true', () => {
    for (const [id, entry] of Object.entries(NOT_EXECUTABLE)) {
      const integration = INTEGRATIONS.find((i) => i.id === id);
      expect(integration, `NOT_EXECUTABLE names '${id}', which is not in the catalog`).toBeDefined();
      // True by construction since `cellsFor` consults NOT_EXECUTABLE; kept so
      // that decoupling the two again cannot leave an integration both excluded
      // and executed without a failure saying so.
      expect(
        COVERED.has(id),
        `'${id}' is excluded as "${entry.why}" but now produces an executable cell — drop the exclusion`,
      ).toBe(false);
      expect(
        entry.check(integration as Integration),
        `'${id}' is excluded because it ${entry.why}, and that is no longer true of the catalog entry`,
      ).toBe(true);
    }
  });
});

describe.each(CELLS.map((c) => [c.label, c] as const))(
  'the emitted %s route reaches its transport',
  (_label, cell) => {
    it.each(SCENARIOS.map((s) => [s.name, s] as const))('%s', async (_name, scenario) => {
      const mod = modules.get(cell.label);
      expect(mod, `${cell.label}: module was not imported`).toBeDefined();

      const { status, sse: body, issued, logged } = await cell.host.run(
        mod as Record<string, unknown>,
        requestBody(cell.integration, scenario.thread),
      );

      // THE ASSERTION THIS FILE EXISTS FOR. A conversion that the host SDK
      // rejects produces zero outbound calls, and does it before anything can
      // go wrong on the network — which is exactly why it is reachable offline.
      expect(
        issued.length,
        `${cell.label} issued NO request. The route reached its SDK and the SDK refused what ` +
          `we handed it, so nothing was ever sent. This is the InvalidPromptError class: it ` +
          `typechecks, verify:scaffold is green, and every turn fails.\n` +
          `  in band: ${inBandErrors(body)}\n` +
          `  logged by the SDK: ${logged === '' ? '(nothing)' : logged}`,
      ).toBeGreaterThan(0);

      // A real status. `langgraph` and `mastra` return 502 when their client
      // throws before the stream opens, which is a failure this must not read
      // as success just because it was reported honestly.
      expect(status, `${cell.label} answered ${status}, not 200`).toBe(200);

      const sent = issued.map((i) => `${i.target} ${i.payload}`).join('\n');
      for (const marker of scenario.mustCarry) {
        expect(
          sent.includes(marker),
          `${cell.label} issued a request that does not carry ${JSON.stringify(marker)}. ` +
            `The route reached its transport but dropped part of the thread on the way into ` +
            `the SDK's shape — a silent drop, which is the same class arriving quietly.`,
        ).toBe(true);
      }
    });
  },
);

/**
 * The tool round trip, kept separate because who it applies to is a CATALOG
 * fact rather than a property of every route.
 *
 * `mastra` drops the tool bookkeeping deliberately and says so in the route
 * ("this agent owns its tools server-side ... the entry is dropped rather than
 * guessed"). That exemption is tied to `forwardsFromClient` rather than to the
 * name, so an integration cannot be excused by being listed here while its
 * catalog entry says it forwards tools.
 */
describe.each(CELLS.map((c) => [c.label, c] as const))('%s carries the tool round trip', (_label, cell) => {
  it('the prior call and its result survive the conversion', async () => {
    const forwards = cell.integration.forwardsFromClient.includes('tools');
    const mod = modules.get(cell.label) as Record<string, unknown>;
    const { issued } = await cell.host.run(mod, requestBody(cell.integration, toolThread));
    const sent = issued.map((i) => `${i.target} ${i.payload}`).join('\n');

    if (!forwards && !sent.includes(TOOL_NAME)) {
      // Declared server-side tools and dropped the client's bookkeeping. Assert
      // the DECLARATION, so this branch cannot be reached by a route that
      // forwards tools and merely lost them.
      expect(
        cell.integration.forwardsFromClient,
        `${cell.label} dropped the tool history while declaring it forwards tools`,
      ).not.toContain('tools');
      return;
    }

    expect(
      sent.includes(TOOL_NAME),
      `${cell.label} lost the tool CALL from the thread it forwarded`,
    ).toBe(true);
    expect(
      sent.includes(TOOL_OUTPUT),
      `${cell.label} lost the tool RESULT from the thread it forwarded, so the model is asked ` +
        `to answer a call it can no longer see the output of`,
    ).toBe(true);
  });
});
