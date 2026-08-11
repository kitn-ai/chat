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
import { loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
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

export interface ProxyEnv {
  key: string;
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
  const model = pick('OPENROUTER_MODEL') || DEFAULT_MODEL;
  return {
    key: pick('OPENROUTER_API_KEY'),
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

/** A filesystem-safe slug for a model id, used as a fixture directory name.
 *
 *  The dot-run collapse is not decoration: `.` has to stay legal (`gpt-5.2` is a
 *  real model id) and the moment it is legal, `..` is legal, and a fixture
 *  directory named `..` writes somewhere other than `fixtures/`. The model id
 *  comes from server-side env rather than from the page, so this is depth rather
 *  than a live hole — but a recorder that can be pointed at an arbitrary
 *  directory by a typo in `.env.local` is not worth keeping. */
export function modelSlug(model: string): string {
  const slug = model
    .replace(/^~/, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/\.{2,}/g, '.')
    .toLowerCase();
  return slug || 'unknown-model';
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
export function fixtureSlug(model: string, wire: WireKind): string {
  const slug = modelSlug(model);
  return wire === 'anthropic' ? `${slug}-anthropic-wire` : slug;
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
          modelSlug: fixtureSlug(env.model, env.wire),
          // Which SSE dialect the client must parse this turn with. Server-owned
          // (see resolveWire): the browser reads it, it never chooses it.
          wire: env.wire,
          reasoningEffort: env.reasoningEffort,
          maxTokens: env.maxTokens,
          hasKey: env.key.length > 0,
          recording: env.record,
        });
      });

      // POST /api/chat: add the key, forward the upstream SSE byte for byte.
      server.middlewares.use('/api/chat', (req, res) => {
        void handleChat(req, res, readEnv(root, mode));
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

async function handleChat(req: IncomingMessage, res: ServerResponse, env: ProxyEnv): Promise<void> {
  if (req.method !== 'POST') return json(res, 405, { error: { message: 'POST only' } });

  let body: ChatBody;
  try {
    body = (await readBody(req)) as ChatBody;
  } catch {
    return json(res, 400, { error: { message: 'Request body was not valid JSON' } });
  }

  // REPLAY is checked BEFORE the key, on purpose: a replay turn must run with no
  // key and no socket at all, which is what makes the offline suite offline.
  if (body.replay) return handleReplay(res, env, body.replay);

  if (!env.key) {
    return json(res, 503, {
      error: {
        code: 'missing_key',
        message:
          'OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and paste your key ' +
          '(UNPREFIXED, never VITE_OPENROUTER_API_KEY), then restart the dev server.',
      },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json(res, 400, { error: { message: '`messages` must be a non-empty array' } });
  }

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
  res.statusCode = 200;
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // don't let a proxy buffer the stream
  res.flushHeaders?.();

  // Tee the raw bytes into a fixture when the turn is harness-tagged, so every
  // live run leaves the offline suite one stream stronger than it found it. The
  // captured bytes are the PROVIDER's, which never contain the request headers
  // and therefore never contain the key.
  const capture: Buffer[] | null =
    env.record && body.harness?.scenario && typeof body.harness.round === 'number' ? [] : null;

  const reader = upstream.body.getReader();
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

/** Write one captured round to `fixtures/live/<model>/<scenario>/round-N.sse`. */
async function recordFixture(
  env: ProxyEnv,
  scenario: string,
  round: number,
  bytes: Buffer,
): Promise<void> {
  const safeScenario = scenario.replace(/[^a-z0-9._-]+/gi, '-');
  const file = join(
    env.fixtureDir,
    'live',
    fixtureSlug(env.model, env.wire),
    safeScenario,
    `round-${round}.sse`,
  );
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
  } catch (e) {
    // A recording failure must never fail the turn the user is watching.
    console.warn(`[spike] could not record ${file}: ${errorText(e)}`);
  }
}

/** Serve a captured/canned SSE file frame by frame. No key, no socket.
 *
 *  Frames are split on the blank line that terminates an SSE event and re-emitted
 *  WITH that terminator, so the bytes a client sees are byte-identical to the
 *  file. The per-frame pause is the point: it makes a replayed stream a real
 *  stream, which is the only way to test what a user can do to a half-written
 *  message. */
async function handleReplay(
  res: ServerResponse,
  env: ProxyEnv,
  replay: NonNullable<ChatBody['replay']>,
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
  const frames = sse.split(/(?<=\n\n)/);
  let open = true;
  res.on('close', () => {
    open = false;
  });
  for (const frame of frames) {
    if (!open || !frame) break;
    res.write(frame);
    if (delay) await new Promise((r) => setTimeout(r, delay));
  }
  res.end();
}

/** Error text with no chance of leaking the request (and therefore the key). */
function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
