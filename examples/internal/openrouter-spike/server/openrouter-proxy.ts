// A dev-server-only proxy that keeps OPENROUTER_API_KEY server-side.
//
// SECURITY CONTRACT (the whole point of the file):
//   · the key is read with Vite's `loadEnv(mode, root, '')`: the EMPTY prefix
//     is what makes an UNPREFIXED var readable. Vite only inlines `VITE_`-
//     prefixed vars into client code, so an unprefixed name can never reach the
//     bundle. There is no VITE_OPENROUTER_API_KEY and there must never be one.
//   · the provider is reached from HERE and nowhere under `src/`. The browser
//     only ever talks to `POST /api/chat`.
//   · the key is never logged, never echoed in an error body, never sent to the
//     browser. `/api/config` reports a boolean.
//   · `apply: 'serve'`: this plugin does not exist in a production build. A
//     `vite build` of this app is a static site with NO server; a real
//     deployment needs its own route. Said again in the README.
//
// There is no provider SDK any more. The upstream is plain HTTP and its SSE
// bytes are forwarded UNTOUCHED, which is what every integration template in the
// kit's catalog tells a consumer to do. `readOpenAIStream` in the browser is
// what parses them.
import { loadEnv, type Plugin, type ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import type { AnthropicWireMessage, OpenAIWireMessage } from '@kitn.ai/ui/wire';
import type { ToolSpec } from '../src/tools';
import { REPLY_WITH_CARD_FORMAT } from '../src/card-schema';

/** OpenAI chat-completions shape. OpenRouter normalises EVERY model onto it,
 *  including Anthropic's, which is why an Anthropic model reached through here
 *  exercises `readOpenAIStream` and not the Anthropic reader. */
const UPSTREAM_OPENAI_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** OpenRouter's Anthropic-compatible passthrough ("the Anthropic Skin"): native
 *  Messages-API request and native `message_start` / `content_block_delta` SSE,
 *  which is the only way to drive `readAnthropicStream` against a real model
 *  without holding an Anthropic key of our own. */
const UPSTREAM_ANTHROPIC_URL = 'https://openrouter.ai/api/v1/messages';
const DEFAULT_MODEL = '~deepseek/deepseek-v4-flash-latest';
/** Cost discipline: the spike never needs long answers. */
const DEFAULT_MAX_TOKENS = 900;
/** Anthropic's floor for `thinking.budget_tokens`, and the value we send: the
 *  API rejects anything under 1024 and requires `max_tokens` to exceed it. */
const ANTHROPIC_THINKING_BUDGET = 1024;
/** Replay pacing. Fast enough not to slow the suite, slow enough that a test can
 *  click something while the stream is still open. */
const DEFAULT_REPLAY_DELAY_MS = 8;

/** Which request shape and which SSE dialect this server speaks. Chosen
 *  SERVER-side from the model id, exactly like the model itself: one less thing
 *  a public bundle can influence, and it cannot drift from the recorded stream. */
export type WireKind = 'openai' | 'anthropic';

/**
 * WHICH BACKEND ANSWERS `/api/chat`. `SPIKE_BACKEND`, default `openrouter`.
 *
 * `openrouter` — the original: POST OpenRouter's HTTP endpoint directly and
 * forward its SSE bytes untouched.
 *
 * `gateway` — drive the SHIPPED `vercel-ai-sdk` route instead. That route calls
 * `streamText()` against Vercel's AI Gateway and re-frames `result.fullStream`
 * onto the OpenAI wire itself, so the browser half of this app is unchanged: it
 * still POSTs `{ messages, tools }` and still parses the reply with
 * `readOpenAIStream`. What differs is the entire server hop in between, which is
 * exactly what the pair is here to measure. Run the same scenarios down both
 * with the same pinned model and any difference is the integration.
 *
 * The route is not copied into this directory — see `harness/emit-gateway-route.mjs`.
 */
export type Backend = 'openrouter' | 'gateway';

export interface ProxyEnv {
  key: string;
  /** Which backend `/api/chat` uses this session. Server-owned, like the model
   *  and the wire: it decides where a fixture lands and what a row means. */
  backend: Backend;
  model: string;
  wire: WireKind;
  /** `off` / `none` omits the reasoning field entirely. */
  reasoningEffort: string;
  maxTokens: number;
  /** Where captured SSE is written. Absolute. */
  fixtureDir: string;
  /** Whether a harness-tagged live turn gets recorded. */
  record: boolean;
}

function readEnv(root: string, mode: string): ProxyEnv {
  // OPENROUTER_ENV_DIR lets `loadEnv` look for `.env.local` somewhere OTHER than
  // the Vite root. It exists for git worktrees: the key file lives in the primary
  // checkout and is deliberately NOT copied into each worktree. This changes only
  // WHERE loadEnv looks — the key is still read server-side by loadEnv, still
  // never logged, still never sent to the browser. Unset by default, so the
  // documented `cp .env.example .env.local` flow is unchanged.
  const envDir = process.env.OPENROUTER_ENV_DIR || root;
  // '' = no prefix filter. Without it Vite hands back only VITE_* vars.
  const env = loadEnv(mode, envDir, '');
  const pick = (name: string) => env[name] || process.env[name] || '';
  const backend: Backend = pick('SPIKE_BACKEND') === 'gateway' ? 'gateway' : 'openrouter';

  // The gateway backend owns NEITHER the model nor the wire, and that is the
  // point of running it: the route pins its own model in one const and re-frames
  // its own stream. Both are read back off the generated route rather than
  // configured here, so `/api/config` reports what is actually being driven and
  // `SPIKE_EXPECT_MODEL` still has something true to check.
  if (backend === 'gateway') {
    return {
      key: pick('AI_GATEWAY_API_KEY'),
      backend,
      model: gatewayModel(root),
      wire: 'openai',
      reasoningEffort: pick('OPENROUTER_REASONING_EFFORT') || 'medium',
      maxTokens: Number(pick('OPENROUTER_MAX_TOKENS')) || DEFAULT_MAX_TOKENS,
      fixtureDir: resolve(root, 'fixtures'),
      record: (pick('OPENROUTER_RECORD') || '1') !== '0',
    };
  }

  const model = pick('OPENROUTER_MODEL') || DEFAULT_MODEL;
  return {
    key: pick('OPENROUTER_API_KEY'),
    backend,
    // Passed through VERBATIM, including the leading `~` of the floating-latest
    // alias: `~deepseek/deepseek-v4-flash-latest` is a real, cheaper slug than
    // the pinned `deepseek/deepseek-v4-flash`.
    model,
    wire: resolveWire(pick('OPENROUTER_WIRE'), model),
    reasoningEffort: pick('OPENROUTER_REASONING_EFFORT') || 'medium',
    maxTokens: Number(pick('OPENROUTER_MAX_TOKENS')) || DEFAULT_MAX_TOKENS,
    fixtureDir: resolve(root, 'fixtures'),
    // Recording is ON by default: the whole point is that every live run leaves
    // the offline suite stronger than it found it.
    record: (pick('OPENROUTER_RECORD') || '1') !== '0',
  };
}

/** Where `emit-gateway-route.mjs` writes the shipped route. Relative to the Vite
 *  root so `ssrLoadModule` can take the same string. */
const GATEWAY_ROUTE_PATH = '/server/generated/vercel-ai-sdk-route.ts';

/**
 * The model the GENERATED route pins, read back out of its source.
 *
 * The route names its model in exactly one place — `const MODEL = '…'` — and
 * nothing here may override it: an env var that could point the gateway column
 * at a different model than the route ships with would make the pair of columns
 * incomparable while still printing a tidy table. Reading it back is also what
 * lets `/api/config` report a true model and `SPIKE_EXPECT_MODEL` stay honest.
 *
 * Throws rather than defaulting. A guessed model id would be recorded into a
 * fixture directory named after a model that never ran.
 */
export function gatewayModelFrom(source: string): string {
  const match = /^const MODEL = '([^']+)';$/m.exec(source);
  if (!match) {
    throw new Error(
      'The generated vercel-ai-sdk route declares no `const MODEL = \'…\';` line, so this server ' +
        'cannot say which model it is driving. Re-run `pnpm gateway:route`; if the route stopped ' +
        'pinning a model in one const, this reader has to change with it.',
    );
  }
  return match[1];
}

function gatewayModel(root: string): string {
  const file = join(root, GATEWAY_ROUTE_PATH);
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    throw new Error(
      `No generated route at ${GATEWAY_ROUTE_PATH}. SPIKE_BACKEND=gateway drives the SHIPPED ` +
        'vercel-ai-sdk route rather than a copy of it, so it has to be emitted first: run ' +
        '`pnpm gateway:route` (every `conformance:gateway*` script already does).',
    );
  }
  return gatewayModelFrom(source);
}

/**
 * `OPENROUTER_WIRE`: `openai` | `anthropic` | `auto` (the default).
 *
 * `auto` sends an `anthropic/*` model through the Anthropic Skin, because that
 * is the shape a consumer of that model would actually use, and it is the ONLY
 * configuration in which `readAnthropicStream` runs against a live provider.
 * The explicit values exist so the same model can be driven down BOTH paths and
 * the results compared — which is how you tell an Anthropic-MODEL difference
 * from an Anthropic-WIRE bug.
 */
export function resolveWire(requested: string, model: string): WireKind {
  const want = requested.trim().toLowerCase();
  if (want === 'openai' || want === 'anthropic') return want;
  return isAnthropicFamily(model) ? 'anthropic' : 'openai';
}

/** Whether this model is served by Anthropic, INDEPENDENT of the wire it is
 *  reached through. `anthropic/claude-haiku-4.5` is an Anthropic model whether
 *  the request goes to the Anthropic Skin or to `/chat/completions`, and the
 *  provider's own constraints — the 1024-token thinking floor above all — apply
 *  on both. Sharing one predicate with `resolveWire` is deliberate: the wire
 *  default and the thinking budget must never disagree about what an Anthropic
 *  model is. */
export function isAnthropicFamily(model: string): boolean {
  return /^~?anthropic\//.test(model);
}

/** One inert path segment: a NAME, never a place.
 *
 *  The dot-run collapse is not decoration: `.` has to stay legal (`gpt-5.2` is a
 *  real model id) and the moment it is legal, `..` is legal, and a fixture
 *  directory named `..` writes somewhere other than `fixtures/`.
 *
 *  Collapsing `..` to `.` is not enough on its own, which cost a red test to
 *  learn: a segment that is ALL dots is still a directory rather than a name, and
 *  `join(root, 'live', model, '.')` is the model directory — which round 1 now
 *  deletes recursively. So an all-dots segment is replaced outright. */
function pathSegment(value: string, fallback: string): string {
  const slug = value.replace(/[^a-z0-9._-]+/gi, '-').replace(/\.{2,}/g, '.');
  return slug === '' || /^\.+$/.test(slug) ? fallback : slug;
}

/** A filesystem-safe slug for a model id, used as a fixture directory name.
 *
 *  The model id comes from server-side env rather than from the page, so this is
 *  depth rather than a live hole — but a recorder that can be pointed at an
 *  arbitrary directory by a typo in `.env.local` is not worth keeping. */
export function modelSlug(model: string): string {
  return pathSegment(model.replace(/^~/, ''), 'unknown-model').toLowerCase();
}

/** The fixture directory name for a (model, wire) pair.
 *
 *  The wire is part of the identity, not decoration: the same model reached
 *  through the Anthropic Skin and through the OpenAI-compatible endpoint emits
 *  two INCOMPATIBLE SSE dialects, and a replay is parsed by whichever reader the
 *  current wire selects. Sharing one directory would let an OpenAI-shaped
 *  recording be replayed into the Anthropic reader, which does not fail loudly —
 *  it yields an empty turn. The default wire for a non-Anthropic model keeps the
 *  bare slug, so every existing recording still resolves. */
export function fixtureSlug(model: string, wire: WireKind, backend: Backend = 'openrouter'): string {
  const slug = modelSlug(model);
  const wired = wire === 'anthropic' ? `${slug}-anthropic-wire` : slug;
  // The BACKEND is part of the identity for the same reason the wire is, and
  // sharper here: the gateway column runs the SAME pinned model id as its
  // OpenRouter control, so without this the two would write into one directory
  // and each run would silently overwrite the other's evidence — leaving a
  // comparison of a column against itself. `openrouter` keeps the bare slug, so
  // every existing recording still resolves.
  return backend === 'gateway' ? `${wired}-gateway` : wired;
}

// ── what the server saw happen to a replayed stream ─────────────────────────
//
// S17 clicks Stop and then asserts, from the DOM, that the answer stopped
// growing short of its closing sentence. That is the user-visible claim and it
// is worth having, but it CANNOT see the thing the scenario exists to prove.
// `AssistantStream.abort` makes the fold ignore later deltas, so a build that
// dropped `abort.abort()` and kept `stream.abort()` renders identically while
// the socket stays open and every remaining byte still arrives. Text going
// quiet is consistent with both the working implementation and the broken one,
// which makes a DOM-only cancel assertion unable to fail for the reason it
// exists. Confirmed by disabling each half in turn: only disabling BOTH turned
// the old scenario red.
//
// The abort is observable in exactly one place — HERE. The replay handler is
// the peer whose socket the abort closes, so it is the only party that can tell
// "the client went away" from "the stream ended". It already had to know (`open`
// stops the write loop); it just never said so. This publishes it.
//
// Measured on the SERVER's own clock, which is what makes it immune to renderer
// speed — the reason the character-budget bound this replaces was deleted.

/** Bounded, because a long matrix run replays hundreds of streams and this is a
 *  debugging channel, not a database. */
const REPLAY_LOG_LIMIT = 64;

/** What the replay handler observed about ONE replayed stream. */
export interface ReplayObservation {
  /** Monotonic per-server id. A caller pins the stream it is watching BEFORE it
   *  interferes with it, so a later replay (a second round, the next scenario)
   *  can never be mistaken for the one under test. */
  id: number;
  dir: string;
  round: number;
  framesTotal: number;
  framesWritten: number;
  /**
   * The client went away while frames were still unwritten — i.e. the in-flight
   * fetch was ABORTED.
   *
   * A close after the last frame is the ordinary end of a finished stream and
   * does NOT set this, which is the whole distinction: a build that never
   * aborts the fetch is served every frame and ends normally.
   */
  clientAborted: boolean;
  /** The handler has stopped writing; the counts above are final. A reader must
   *  wait for this before drawing a conclusion — an unfinished stream has
   *  written fewer frames than it will, in BOTH the aborted and the healthy
   *  case, so judging one early is a coin flip. */
  finished: boolean;
}

export interface ReplayLog {
  open(dir: string, round: number, framesTotal: number): ReplayObservation;
  entries(): ReplayObservation[];
}

export function createReplayLog(): ReplayLog {
  const entries: ReplayObservation[] = [];
  let nextId = 1;
  return {
    open(dir, round, framesTotal) {
      const entry: ReplayObservation = {
        id: nextId++,
        dir,
        round,
        framesTotal,
        framesWritten: 0,
        clientAborted: false,
        finished: false,
      };
      entries.push(entry);
      if (entries.length > REPLAY_LOG_LIMIT) entries.splice(0, entries.length - REPLAY_LOG_LIMIT);
      return entry;
    },
    // Copied, so a reader cannot hold a handle that mutates under it mid-poll.
    entries: () => entries.map((e) => ({ ...e })),
  };
}

/** The slice of `ServerResponse` the frame writer touches. Narrowed so the node
 *  test can drive this loop with a fake socket and watch the ledger separate an
 *  aborted stream from a completed one, with no browser and no dev server. */
export interface FrameSink {
  write(chunk: string): unknown;
  end(): unknown;
  on(event: 'close', listener: () => void): unknown;
}

/**
 * Write `frames` to the client, pausing `delayMs` between them, recording into
 * `entry` what happened.
 *
 * The pause is what makes a replayed stream a real stream — the only way to
 * test what a user can do to a half-written message.
 */
export async function streamReplayFrames(
  res: FrameSink,
  frames: string[],
  delayMs: number,
  entry: ReplayObservation,
): Promise<void> {
  let open = true;
  res.on('close', () => {
    open = false;
    // Ordering matters and is the entire assertion: this reads the count as of
    // the moment the socket died. Still owing frames means the CLIENT hung up.
    if (entry.framesWritten < entry.framesTotal) entry.clientAborted = true;
  });
  for (const frame of frames) {
    if (!open) break;
    res.write(frame);
    entry.framesWritten += 1;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  entry.finished = true;
  res.end();
}

/** Split a captured SSE file into the frames it will be re-emitted as.
 *
 *  Frames are split on the blank line that terminates an SSE event and keep that
 *  terminator, so the bytes a client sees are byte-identical to the file.
 *
 *  The `filter` is DEFENSIVE, not corrective, and the distinction is worth
 *  stating because it is easy to get backwards: JavaScript's `String.split` does
 *  NOT emit a trailing empty segment for a zero-width match at the end of the
 *  string, so a well-formed capture (which does end in `\n\n`) splits to exactly
 *  its frames and nothing else — measured, 16 for `canned/S17-cancel/round-1`.
 *  Python's `re.split` DOES emit that trailing empty, which is how this got
 *  miscounted once while being checked in the wrong language. The old loop's
 *  `!frame` break was therefore dead code for every real capture.
 *
 *  It stays because `framesTotal` is now load-bearing: it is the denominator
 *  `clientAborted` is decided against, so an empty segment sneaking in from a
 *  malformed capture would inflate the total, leave it permanently unreachable,
 *  and make every COMPLETED stream report as aborted — this ledger's own defect
 *  class, one directory over. Skipping is also strictly better than the old
 *  `break`, which would have truncated the stream at the first one. */
export function splitReplayFrames(sse: string): string[] {
  return sse.split(/(?<=\n\n)/).filter(Boolean);
}

/** Resolve a fixture path from client-supplied components, refusing anything that
 *  escapes `fixtures/`. The dev server is localhost-only, but a path that a page
 *  can steer is a path worth pinning. */
export function fixturePath(root: string, dir: string, round: number): string | null {
  if (!Number.isInteger(round) || round < 1 || round > 99) return null;
  if (typeof dir !== 'string' || dir.length === 0 || isAbsolute(dir) || dir.includes('\0')) return null;
  const full = resolve(root, dir, `round-${round}.sse`);
  const base = root.endsWith(sep) ? root : root + sep;
  return full.startsWith(base) ? full : null;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function openrouterProxy(): Plugin {
  let root = process.cwd();
  let mode = 'development';
  // Lives for the life of the dev server, because a scenario reads it AFTER the
  // stream it describes is already over.
  const replayLog = createReplayLog();

  return {
    name: 'openrouter-spike-proxy',
    apply: 'serve', // dev only (see the security contract above)
    configResolved(config) {
      root = config.root;
      mode = config.mode;
    },
    configureServer(server) {
      // GET /api/config: what the client is allowed to know. NEVER the key.
      server.middlewares.use('/api/config', (_req, res) => {
        const env = readEnv(root, mode);
        json(res, 200, {
          model: env.model,
          // The fixture directory name for this model AND wire, so the harness
          // can point a replay at the streams THIS configuration produced
          // without re-deriving the slug rule in two places.
          modelSlug: fixtureSlug(env.model, env.wire, env.backend),
          // Which SSE dialect the client must parse this turn with. Server-owned
          // (see resolveWire): the browser reads it, it never chooses it.
          wire: env.wire,
          reasoningEffort: env.reasoningEffort,
          maxTokens: env.maxTokens,
          hasKey: env.key.length > 0,
          recording: env.record,
        });
      });

      // GET /api/replay-report: what the server saw happen to each replayed
      // stream. The only channel through which a test can observe that a fetch
      // was ABORTED rather than merely ignored — see `ReplayObservation`. Replay
      // bookkeeping only: it names fixture directories, never the key, never a
      // request body, and it does not exist in a production build (`apply:
      // 'serve'`, like the rest of this plugin).
      server.middlewares.use('/api/replay-report', (_req, res) => {
        json(res, 200, { replays: replayLog.entries() });
      });

      // POST /api/chat: add the key, forward the upstream SSE byte for byte.
      server.middlewares.use('/api/chat', (req, res) => {
        void handleChat(req, res, readEnv(root, mode), replayLog, server);
      });
    },
  };
}

export interface ChatBody {
  /** Already wire-shaped: the client builds it with `toOpenAIMessages` or
   *  `toAnthropicMessages` according to the wire `/api/config` reported, so
   *  there is no message mapping left to do here. */
  messages?: OpenAIWireMessage[] | AnthropicWireMessage[];
  /** Which shape `messages` is in. Echoed back by the client from
   *  `/api/config`; the SERVER still decides the wire, and a mismatch is
   *  rejected rather than guessed at. */
  wire?: WireKind;
  /** The system turn. On the Anthropic wire `system` is a top-level field
   *  rather than a message, so the client hands it over separately. */
  system?: string;
  tools?: ToolSpec[];
  /** `structured` swaps the tool-driven card for a response_format schema. */
  cardMode?: 'tool' | 'structured';
  /** Conformance-harness recording label. Never influences the upstream call. */
  harness?: { scenario?: string; round?: number };
  /** Serve a captured/canned stream instead of calling the provider. */
  replay?: { dir?: string; round?: number; delayMs?: number };
}

async function handleChat(
  req: IncomingMessage,
  res: ServerResponse,
  env: ProxyEnv,
  replayLog: ReplayLog,
  server: ViteDevServer,
): Promise<void> {
  if (req.method !== 'POST') return json(res, 405, { error: { message: 'POST only' } });

  let body: ChatBody;
  try {
    body = (await readBody(req)) as ChatBody;
  } catch {
    return json(res, 400, { error: { message: 'Request body was not valid JSON' } });
  }

  // REPLAY is checked BEFORE the key, on purpose: a replay turn must run with no
  // key and no socket at all, which is what makes the offline suite offline. It
  // is also checked before the BACKEND branch: a replay is bytes off the disk,
  // so which backend recorded them is already baked into the fixture path.
  if (body.replay) return handleReplay(res, env, body.replay, replayLog);

  if (!env.key) {
    const missing =
      env.backend === 'gateway'
        ? 'AI_GATEWAY_API_KEY is not set. The vercel-ai-sdk route reads it out of the environment ' +
          'itself, inside streamText(). Put it in .env.local (UNPREFIXED) and restart the dev server.'
        : 'OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and paste your key ' +
          '(UNPREFIXED, never VITE_OPENROUTER_API_KEY), then restart the dev server.';
    return json(res, 503, { error: { code: 'missing_key', message: missing } });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json(res, 400, { error: { message: '`messages` must be a non-empty array' } });
  }

  if (env.backend === 'gateway') return handleGatewayChat(req, res, env, body, server);

  // The wire is a SERVER decision, and the client encoded its messages against
  // whatever `/api/config` told it. If those have drifted — a page left open
  // across a dev-server restart onto a different model — the request would go
  // out in the wrong shape and come back as a confusing provider 400. Say so
  // instead.
  if (body.wire && body.wire !== env.wire) {
    return json(res, 409, {
      error: {
        code: 'wire_mismatch',
        message:
          `This server speaks the "${env.wire}" wire (model ${env.model}) but the page encoded its ` +
          `request for "${body.wire}". Reload the page so it re-reads /api/config.`,
      },
    });
  }

  const abort = new AbortController();
  req.on('close', () => abort.abort());

  const { url, payload } = buildUpstreamRequest(env, body);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.key}`,
        // Required by the Anthropic Messages API and ignored by the OpenAI-
        // compatible endpoint, so it is sent unconditionally rather than
        // branched on.
        'anthropic-version': '2023-06-01',
        'HTTP-Referer': 'http://localhost:5177',
        'X-Title': '@kitn.ai/ui OpenRouter spike',
      },
      body: JSON.stringify(payload),
      signal: abort.signal,
    });
  } catch (e) {
    // Deliberately does not echo the request: it carries the Authorization header.
    return json(res, 502, { error: { message: `OpenRouter call failed: ${errorText(e)}` } });
  }

  if (!upstream.ok || !upstream.body) {
    // The upstream error body passes through unchanged so WireError can carry it.
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await upstream.text().catch(() => ''));
    return;
  }

  // Forward the bytes UNTOUCHED. Every integration template in the catalog does
  // exactly this, so the spike now exercises the same path a consumer takes.
  await forwardSse(res, upstream.body, upstream.headers.get('content-type'), env, body);
}

/**
 * Stream one SSE body to the client and tee it into a fixture on the way past.
 *
 * Shared by both backends, and it has to be: a recording is the evidence a cell
 * rests on, and a gateway column whose fixtures were written by a second,
 * slightly different copy of this loop would be comparing two recording
 * mechanisms as much as two integrations.
 *
 * The captured bytes are always the ones the BROWSER received, which never
 * contain a request header and therefore never contain a key.
 */
async function forwardSse(
  res: ServerResponse,
  stream: ReadableStream<Uint8Array>,
  contentType: string | null,
  env: ProxyEnv,
  body: ChatBody,
): Promise<void> {
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType ?? 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // don't let a proxy buffer the stream
  res.flushHeaders?.();

  // Tee the raw bytes into a fixture when the turn is harness-tagged, so every
  // live run leaves the offline suite one stream stronger than it found it.
  const capture: Buffer[] | null =
    env.record && body.harness?.scenario && typeof body.harness.round === 'number' ? [] : null;

  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        res.write(value);
        capture?.push(Buffer.from(value));
      }
    }
  } catch (e) {
    // Headers are already out, so report in-band the way OpenRouter itself does.
    // readOpenAIStream surfaces this as ModelTurn.error, not as a WireError.
    res.write(
      `data: ${JSON.stringify({
        error: { code: 'proxy_stream_error', message: errorText(e) },
        choices: [{ delta: {}, finish_reason: 'error' }],
      })}\n\n`,
    );
  } finally {
    await reader.cancel().catch(() => undefined);
    res.end();
    if (capture) {
      await recordFixture(env, body.harness!.scenario!, body.harness!.round!, Buffer.concat(capture));
    }
  }
}

/** What the generated route exports. `next`'s adapter names it `POST`. */
interface GatewayRouteModule {
  POST(request: Request): Promise<Response>;
}

/**
 * Drive the SHIPPED `vercel-ai-sdk` route.
 *
 * `ssrLoadModule` rather than a static import, for two reasons that both matter:
 * the file is GENERATED (a static import would make a missing generation a Vite
 * resolve error at server start instead of a legible message here), and it is
 * loaded through Vite's own transform, so the route runs as TypeScript exactly
 * as the scaffolder emitted it — no build step of ours in between.
 *
 * The request handed over is a real web `Request`, because that is the ONLY
 * thing the route's signature accepts and building it here is the whole test:
 * everything the browser sent that the route does not read is dropped on the
 * floor by this line, which is what makes `forwardsFromClient` a claim rather
 * than a hope.
 */
async function handleGatewayChat(
  req: IncomingMessage,
  res: ServerResponse,
  env: ProxyEnv,
  body: ChatBody,
  server: ViteDevServer,
): Promise<void> {
  // The AI SDK reads AI_GATEWAY_API_KEY out of `process.env` ITSELF, inside
  // streamText() — that is the case the integration's `keyExposure` comment
  // calls out, and it is why grepping the route for a key finds nothing.
  // `loadEnv` does NOT populate process.env, so the value read from .env.local
  // is placed there once, in this server process, and nowhere else. It is still
  // never logged, never echoed into an error body and never sent to the browser.
  if (!process.env.AI_GATEWAY_API_KEY) process.env.AI_GATEWAY_API_KEY = env.key;

  let route: GatewayRouteModule;
  try {
    route = (await server.ssrLoadModule(GATEWAY_ROUTE_PATH)) as unknown as GatewayRouteModule;
  } catch (e) {
    return json(res, 500, {
      error: {
        code: 'gateway_route_unloadable',
        message:
          `Could not load ${GATEWAY_ROUTE_PATH}: ${errorText(e)}. Run \`pnpm gateway:route\` to ` +
          'regenerate it from the shipped integration.',
      },
    });
  }
  if (typeof route.POST !== 'function') {
    return json(res, 500, {
      error: {
        code: 'gateway_route_shape',
        message: `${GATEWAY_ROUTE_PATH} exports no POST handler. The scaffolder's next adapter emits one; regenerate.`,
      },
    });
  }

  const abort = new AbortController();
  req.on('close', () => abort.abort());

  let response: Response;
  try {
    response = await route.POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ONLY what a scaffolded front end posts. `cardMode`, `system` and
        // `wire` are this spike's own fields and the route has never heard of
        // them; passing them would be testing a route nobody ships.
        body: JSON.stringify({ messages: body.messages, tools: body.tools }),
        signal: abort.signal,
      }),
    );
  } catch (e) {
    // A throw here is the route failing BEFORE it returned a Response — a bad
    // model id, a rejected key. It never reached the stream, so there is a
    // status left to spend.
    return json(res, 502, { error: { message: `The vercel-ai-sdk route threw: ${errorText(e)}` } });
  }

  if (!response.ok || !response.body) {
    res.statusCode = response.status;
    res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await response.text().catch(() => ''));
    return;
  }

  await forwardSse(res, response.body, response.headers.get('content-type'), env, body);
}

/** An Anthropic tool definition. Same JSON Schema, one level shallower and
 *  under a different key than OpenAI's `function.parameters`. */
interface AnthropicToolSpec {
  name: string;
  description: string;
  input_schema: ToolSpec['function']['parameters'];
}

/** The scenarios author their tools ONCE, in OpenAI shape (see src/tools.ts).
 *  Re-shaping happens here rather than in the catalog so that a scenario means
 *  the same thing on both wires and cannot drift between them. */
function toAnthropicTools(tools: ToolSpec[]): AnthropicToolSpec[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

/**
 * Build the upstream URL and body for the configured wire.
 *
 * The client never picks the model, the token cap or the wire: the server does,
 * from env. What the client supplies is the CONVERSATION, already encoded by the
 * kit's own encoder for this wire.
 *
 * Three asymmetries the Anthropic branch has to honour, all of them 400s
 * otherwise:
 *   · `system` is a top-level string, not a message with `role: 'system'`.
 *   · `tool_choice` is an OBJECT (`{ type: 'auto' }`), not the string `'auto'`.
 *   · extended thinking needs `budget_tokens >= 1024` AND `max_tokens` strictly
 *     greater than it, so the cap is raised by the budget rather than shared
 *     with it — otherwise the answer gets no tokens at all.
 */
export function buildUpstreamRequest(
  env: ProxyEnv,
  body: ChatBody,
): { url: string; payload: Record<string, unknown> } {
  const thinking = env.reasoningEffort !== 'off' && env.reasoningEffort !== 'none';
  // Anthropic takes a token BUDGET, not an effort level, on either wire. See the
  // OpenAI branch below for why asking it for an effort level silently produced
  // no thinking at all.
  const budgeted = thinking && isAnthropicFamily(env.model);

  if (env.wire === 'anthropic') {
    return {
      url: UPSTREAM_ANTHROPIC_URL,
      payload: {
        model: env.model,
        stream: true,
        max_tokens: env.maxTokens + (thinking ? ANTHROPIC_THINKING_BUDGET : 0),
        ...(body.system ? { system: body.system } : {}),
        messages: body.messages,
        ...(body.tools?.length
          ? { tools: toAnthropicTools(body.tools), tool_choice: { type: 'auto' } }
          : {}),
        ...(thinking
          ? { thinking: { type: 'enabled', budget_tokens: ANTHROPIC_THINKING_BUDGET } }
          : {}),
        // NOTE: no `response_format` equivalent. Path B (the card via a JSON
        // schema) is an OpenAI-wire feature; on this wire the same job is done
        // with a forced tool, which the spike does not model. `cardMode:
        // 'structured'` therefore degrades to Path A here rather than erroring.
      },
    };
  }

  return {
    url: UPSTREAM_OPENAI_URL,
    payload: {
      model: env.model,
      stream: true,
      messages: body.messages,
      // Tools go out in BOTH card modes on purpose: whether a provider
      // accepts `tools` and `response_format` together is one of the things
      // the Path A / Path B comparison is trying to find out. A 4xx here is
      // itself the answer, and it now reaches the UI as a WireError carrying
      // the provider's own error body.
      ...(body.tools?.length ? { tools: body.tools, tool_choice: 'auto' } : {}),
      ...(body.cardMode === 'structured' ? { response_format: REPLY_WITH_CARD_FORMAT } : {}),
      // An Anthropic model reached through THIS wire is still an Anthropic model,
      // and OpenRouter derives its thinking budget from `effort` as a percentage
      // of `max_tokens` (medium ~= 50%). At this spike's 900-token cap that
      // derives 450, under Anthropic's 1024 floor, and the provider returns no
      // thinking at all — no error, no warning, just an empty reasoning channel.
      // The matrix recorded that silence as a PROVIDER limit ("Haiku emits no
      // reasoning on the OpenAI wire") for a whole sweep. It was our own request.
      //
      // So send the budget explicitly, and send the SAME one the Anthropic branch
      // sends, which is the only thing that makes the two Haiku columns
      // comparable — the entire reason this configuration is in the matrix.
      ...(thinking
        ? {
            reasoning: budgeted
              ? { max_tokens: ANTHROPIC_THINKING_BUDGET }
              : { effort: env.reasoningEffort },
          }
        : {}),
      // Same reason as the Anthropic branch: the budget is ADDED to the cap, not
      // shared with it, or the answer gets no tokens after thinking.
      max_tokens: env.maxTokens + (budgeted ? ANTHROPIC_THINKING_BUDGET : 0),
    },
  };
}

/** The scenario id as a directory name.
 *
 *  Case is PRESERVED: the recorded directories are `S12-citations`, not
 *  `s12-citations`, and lowercasing here would orphan all 136 of them.
 *
 *  The dot-run collapse is the same rule `modelSlug` applies and for a sharper
 *  reason: this segment comes off the request body, and `..` survives a
 *  character-class filter untouched because dots are legal in a scenario name.
 *  `live/<model>/..` is `live/`, and round 1 now DELETES this directory
 *  recursively — so the sanitiser is what stands between a typo'd harness label
 *  and the whole fixture tree. */
export function scenarioSlug(scenario: string): string {
  return pathSegment(scenario, 'unknown-scenario');
}

/** The frame that ends a clean stream on all three dialects the spike records —
 *  the OpenAI-compatible endpoint, the Anthropic Skin and DeepSeek. Checked
 *  against every recording in fixtures/live: 136 of 136 end with it. */
const SSE_TERMINATOR = 'data: [DONE]';

/**
 * Whether a captured stream ran to completion.
 *
 * `recordFixture` is called from a `finally`, so it runs on the error path too,
 * and the error frame that path emits goes to `res.write` without ever reaching
 * the capture buffer. A stream that died mid-flight therefore arrives here as a
 * short, well-formed, entirely unmarked SSE file — one that reads as a clean
 * stream that simply ended early.
 *
 * Only the tail is examined: the terminator is the last frame by definition, and
 * a fixture can be 60KB.
 */
export function isCompleteCapture(bytes: Buffer): boolean {
  const tail = bytes.subarray(Math.max(0, bytes.length - 64)).toString('utf8');
  return tail.trimEnd().endsWith(SSE_TERMINATOR);
}

/**
 * A stream that carried NOTHING BUT AN ERROR.
 *
 * `isCompleteCapture` asks whether the bytes end properly, and an error-only
 * stream does: the route reports the failure in band and then closes with
 * `data: [DONE]`, so it is a well-formed recording of a turn that never
 * happened. Written under a replayable name it is worse than a missing fixture,
 * because a missing one reports as `skip` — a MISSING measurement — while this
 * one replays as a real stream and reads as a model that answered with an error.
 *
 * That is not hypothetical either. The AI Gateway's free tier rate-limited the
 * S04 tool loop mid-run; the retry was refused on round 1, and the one-frame
 * error stream it produced OVERWROTE the two good tool rounds the first attempt
 * had recorded — because round 1 empties the directory. Two rounds of real
 * evidence replaced by a billing message, silently.
 *
 * "Nothing but" is the whole test: a stream that produced text or a tool call
 * and THEN failed is a genuine recording of a provider failure (S16 exists for
 * exactly that) and is kept.
 */
export function isErrorOnlyCapture(bytes: Buffer): boolean {
  let sawError = false;
  for (const line of bytes.toString('utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === '' || payload === '[DONE]') continue;
    let frame: unknown;
    try {
      frame = JSON.parse(payload);
    } catch {
      return false; // unreadable, but not provably error-only
    }
    if (frame !== null && typeof frame === 'object' && 'error' in frame) {
      sawError = true;
      continue;
    }
    return false; // a frame that is not an error: this stream carried content
  }
  return sawError;
}

/**
 * Write one captured round to `fixtures/live/<model>/<scenario>/round-N.sse`.
 *
 * Two things this refuses to do, both of which shipped:
 *
 *  · WRITE A TRUNCATED STREAM UNDER A REPLAYABLE NAME. A missing fixture 404s on
 *    the replay path and the matrix runner reports the cell as `skip` — a MISSING
 *    measurement, which is exactly what a failed recording is. A truncated one
 *    replays as a real stream and can go GREEN if the partial content happens to
 *    satisfy the assertion, and reads downstream as zero reasoning tokens and a
 *    smaller cost, because the usage frame is the LAST thing in a stream. So the
 *    bytes are parked at `.partial` instead: kept for diagnosis, but unreachable
 *    by construction rather than by convention, because `fixturePath` only ever
 *    builds `round-N.sse`. An in-file failure marker was the other option and is
 *    weaker — it leaves the bad bytes at the replayable path and trusts every
 *    downstream reader to honour a marker none of them currently read.
 *
 *  · LET A SHORT RUN INHERIT A LONG RUN'S TAIL. Round 1 starts a new recording of
 *    this scenario, so the directory is emptied first. Without this, a re-run that
 *    settled in two rounds left the previous run's round-3 in place — recorded
 *    against a conversation that no longer exists. Two of those shipped in
 *    e352545 and inflated that sweep's measured cost by $0.002437.
 *
 *  · RECORD A TURN THAT NEVER HAPPENED. An error-only stream is well formed and
 *    terminated, so the truncation guard above waves it through — see
 *    `isErrorOnlyCapture` for the run where that cost two rounds of real
 *    evidence. It is parked at `.error` for the same reason a truncated one is
 *    parked at `.partial`: diagnosable, unreachable.
 *
 *    And the ORDER matters. This is checked BEFORE the directory is emptied, so
 *    a refused round 1 no longer deletes a good recording on its way to writing
 *    nothing — which is the specific way the evidence was lost.
 */
export async function recordFixture(
  env: ProxyEnv,
  scenario: string,
  round: number,
  bytes: Buffer,
): Promise<void> {
  const dir = join(env.fixtureDir, 'live', fixtureSlug(env.model, env.wire, env.backend), scenarioSlug(scenario));
  const file = join(dir, `round-${round}.sse`);
  const complete = isCompleteCapture(bytes);
  const errorOnly = isErrorOnlyCapture(bytes);
  try {
    if (errorOnly) {
      await mkdir(dir, { recursive: true });
      await writeFile(`${file}.error`, bytes);
      console.warn(
        `[spike] ${scenario} round ${round}: the stream carried nothing but an error frame, so this ` +
          `is NOT a recording of the scenario and was not written as a fixture (and did not clear ` +
          `any earlier one). Kept at ${file}.error for diagnosis.`,
      );
      return;
    }
    if (round === 1) await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    if (complete) {
      await writeFile(file, bytes);
      return;
    }
    await writeFile(`${file}.partial`, bytes);
    console.warn(
      `[spike] ${scenario} round ${round}: the stream ended without \`${SSE_TERMINATOR}\`, so this ` +
        `is a PARTIAL recording (${bytes.length} bytes) and was NOT written as a fixture. ` +
        `Kept at ${file}.partial for diagnosis; the scenario will replay as a missing measurement ` +
        `until it is re-recorded.`,
    );
  } catch (e) {
    // A recording failure must never fail the turn the user is watching.
    console.warn(`[spike] could not record ${file}: ${errorText(e)}`);
  }
}

/** Serve a captured/canned SSE file frame by frame. No key, no socket.
 *
 *  What it wrote, and whether the client hung up mid-stream, is recorded into
 *  `replayLog` and published at `/api/replay-report` — see `ReplayObservation`
 *  for why that is the only place a cancelled fetch is observable. */
async function handleReplay(
  res: ServerResponse,
  env: ProxyEnv,
  replay: NonNullable<ChatBody['replay']>,
  replayLog: ReplayLog,
): Promise<void> {
  const file = fixturePath(env.fixtureDir, replay.dir ?? '', replay.round ?? 0);
  if (!file) {
    return json(res, 400, { error: { message: `Invalid replay target: ${replay.dir}#${replay.round}` } });
  }

  let sse: string;
  try {
    sse = await readFile(file, 'utf8');
  } catch {
    return json(res, 404, {
      error: {
        code: 'no_fixture',
        // Relative, so the message is useful in a report without leaking a path.
        message: `No fixture at fixtures/${replay.dir}/round-${replay.round}.sse. Record one with a live run first.`,
      },
    });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Kai-Replay', '1'); // so a test can prove it did NOT hit the model
  res.flushHeaders?.();

  const delay = Math.max(0, replay.delayMs ?? DEFAULT_REPLAY_DELAY_MS);
  const frames = splitReplayFrames(sse);
  const entry = replayLog.open(replay.dir ?? '', replay.round ?? 0, frames.length);
  await streamReplayFrames(res, frames, delay, entry);
}

/** Error text with no chance of leaking the request (and therefore the key). */
function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
