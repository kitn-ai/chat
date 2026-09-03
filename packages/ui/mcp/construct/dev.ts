/**
 * kai dev — validate → codegen → npm install (once per dependency change) →
 * vite dev inside the generated project → watch the construct file.
 *
 * HMR comes free: on every construct edit we re-run the SAME generateProject
 * and rewrite the source files in place; the running Vite server sees changed
 * modules and hot-updates the open tab. A validation failure never touches the
 * generated files — the reasons print and the LAST GOOD preview keeps running.
 * Mock-first and keyless by default.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, readdirSync, renameSync, statSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProject, writeProject, type GeneratedFile, type GenerateOptions } from './codegen';
import { npmArgs, npmInvocation } from './local-kit';
import { validateConstruct, type Construct, type ConstructProblem } from './schema';
import { buildableTemplates, inferTemplateId, templateById, type ConstructListing } from './templates';

export type { ConstructListing } from './templates';
// ONE notice list, shared with the CLI (cli.ts's `generationNotices`) rather
// than a second copy here — this file prints the same set twice (first run and
// every regen), which is exactly how the pair got out of sync before.
// cli.ts never statically imports this module (its `dev`/`compile` cases use
// `await import('./dev')`), so this direction adds no module cycle.
import { generationNotices, type CliIo } from './cli';

export function workDirFor(name: string, root: string): string {
  return join(root, '.kai', name);
}

export function installKey(files: GeneratedFile[]): string {
  const pkg = files.find((f) => f.path === 'package.json');
  return createHash('sha256').update(pkg?.code ?? '').digest('hex');
}

export type RegenOutcome =
  | { ok: true; files: GeneratedFile[]; construct: Construct }
  | { ok: false; problems: ConstructProblem[] };

/** One regen turn, injectable writer so the watch loop is testable. */
export function regenerate(
  raw: unknown,
  sink: { write: (files: GeneratedFile[], dir: string) => void },
  dir: string,
  opts: GenerateOptions = {},
): RegenOutcome {
  const validated = validateConstruct(raw);
  if (!validated.ok) return validated;
  const files = generateProject(validated.construct, opts);
  sink.write(files, dir);
  return { ok: true, files, construct: validated.construct };
}

/**
 * One watch-triggered turn: read → regenerate → report. Exported so the
 * "a throw during regen must not kill the loop" guarantee is unit-testable
 * without spawning fs.watch, npm install or Vite. Never throws — every
 * failure (invalid JSON, a rejected construct, or an exception from the
 * sink's real fs writes) is reported via `io` and swallowed here, because
 * this same body runs inside an fs.watch listener where an uncaught throw
 * is an uncaught exception that crashes the whole `kai dev` process rather
 * than leaving the last good preview running.
 */
export function regenTurn(
  readRaw: () => unknown,
  sink: { write: (files: GeneratedFile[], dir: string) => void },
  dir: string,
  opts: GenerateOptions,
  io: CliIo,
): void {
  try {
    const raw = readRaw();
    const out = regenerate(raw, sink, dir, opts);
    if (!out.ok) {
      io.error('construct rejected — last good preview stays up:');
      for (const p of out.problems) io.error(`  ${p.path || '(root)'}: ${p.message}`);
      return;
    }
    io.log('construct changed — regenerated; Vite will hot-update the tab.');
    for (const n of generationNotices(out.construct)) io.log(n);
  } catch (err) {
    io.error(`regen failed (${err instanceof Error ? err.message : String(err)}) — last good preview stays up`);
  }
}

const KEY_FILE = '.kai-install-key';

/**
 * `npm install` in the generated workdir, but only when the emitted
 * package.json actually changed since the last install (tracked via a hash
 * written to KEY_FILE) — shared by `kai dev` (on first run and per regen) and
 * `kai compile`, so there's one install path, not two.
 */
export async function ensureInstalled(dir: string, files: GeneratedFile[], io: CliIo): Promise<void> {
  const key = installKey(files);
  const keyPath = join(dir, KEY_FILE);
  const installed = existsSync(keyPath) && readFileSync(keyPath, 'utf8') === key;
  if (installed) return;
  io.log(`installing dependencies in ${dir} (first run or deps changed)…`);
  const npm = npmInvocation();
  await new Promise<void>((done, fail) => {
    const child = spawn(npm.command, npmArgs(['install'], npm.shell), { cwd: dir, stdio: 'inherit', shell: npm.shell });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`npm install exited ${code}`))));
    // A spawn failure (npm missing; EINVAL on a pre-fix Windows) surfaces on
    // 'error', never 'exit' — without this the install hangs silently forever.
    child.on('error', (err) => fail(new Error(`npm install failed to start: ${err.message}`)));
  });
  writeFileSync(keyPath, key);
}

export async function dev(
  constructPath: string,
  opts: { io?: CliIo; uiSpec?: string } = {},
): Promise<never> {
  const io = opts.io ?? { log: (s: string) => console.log(s), error: (s: string) => console.error(s) };
  const abs = resolve(constructPath);
  const readRaw = (): unknown => JSON.parse(readFileSync(abs, 'utf8'));

  const first = validateConstruct(readRaw());
  if (!first.ok) {
    for (const p of first.problems) io.error(`  ${p.path || '(root)'}: ${p.message}`);
    process.exit(1);
  }
  const dir = workDirFor(first.construct.name, process.cwd());
  const files = generateProject(first.construct, { uiSpec: opts.uiSpec });
  writeProject(files, dir);
  for (const n of generationNotices(first.construct)) io.log(n);

  await ensureInstalled(dir, files, io);

  // Watch the PARENT DIRECTORY, not the file itself: most editors save by
  // writing a temp file and renaming it over the original, which replaces the
  // inode. fs.watch(path) on macOS/FSEvents stays bound to the old inode and
  // goes permanently silent after that first rename — one edit works, every
  // edit after it is dropped with no error. Watching the directory and
  // filtering for the construct's basename survives rename-based saves.
  const base = basename(abs);
  watch(dirname(abs), (_event, filename) => {
    if (filename !== base) return;
    regenTurn(readRaw, { write: writeProject }, dir, { uiSpec: opts.uiSpec }, io);
  });

  io.log(`previewing <${first.construct.name}> — edit ${abs} and watch the tab.`);
  const npm = npmInvocation();
  const vite = spawn(npm.command, npmArgs(['run', 'dev'], npm.shell), { cwd: dir, stdio: 'inherit', shell: npm.shell });
  // Explicit cleanup rather than relying on process-group/SIGINT defaults:
  // whatever ends this process (a fatal error above, Ctrl-C, a signal from
  // the shell) takes the Vite child down with it instead of orphaning it.
  const killVite = () => vite.kill();
  process.once('exit', killVite);
  process.once('SIGINT', killVite);
  process.once('SIGTERM', killVite);
  return new Promise<never>((_, rejectP) => {
    vite.on('exit', (code) => {
      rejectP(new Error(`vite dev exited ${code}`));
      process.exit(code ?? 0);
    });
    // A spawn failure surfaces on 'error', never 'exit' — report it loudly
    // instead of leaving the watcher running against a preview that never was.
    vite.on('error', (err) => {
      io.error(`vite dev failed to start: ${err.message}`);
      rejectP(new Error(`vite dev failed to start: ${err.message}`));
      process.exit(1);
    });
  });
}

// ── kai dev --builder (B-22/B-23) ───────────────────────────────────────────
// A SECOND, thin server beside the loop above — dev() itself is untouched
// (plain `kai dev` stays byte-identical). The builder page is PREBUILT into
// dist/builder-page at kit build time (KAI_BUILD=builder, config/vite/page.ts),
// so at consumer runtime this server compiles nothing: it serves static files,
// exposes ONE validate-then-write endpoint (the construct FILE is the sole
// state), and iframes the generated project's own Vite dev server. Deviation
// from the spec's "thin Vite server" wording, recorded in the plan: a
// runtime Vite server would need vite + the Solid compiler resolvable at
// the CLI's runtime for zero benefit — the page needs no runtime compile,
// and node:http keeps plain kai dev's dependency graph unchanged.

export function atomicWriteJson(abs: string, value: unknown): void {
  const tmp = `${abs}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, abs);
}

/** The ONE write doorway (B-22): validate, then atomically write the RAW
 *  body — not the parsed construct, whose zod defaults (theme.mode) would
 *  silently rewrite the author's file. A rejection returns pathed problems
 *  and touches nothing. */
export function handleConstructPut(
  raw: unknown,
  abs: string,
): { ok: true; construct: Construct } | { ok: false; problems: ConstructProblem[] } {
  const out = validateConstruct(raw);
  if (!out.ok) return out;
  atomicWriteJson(abs, raw);
  return { ok: true, construct: out.construct };
}

/**
 * GET /api/construct's response shape (F5, builder-page final-review fix
 * wave): validate server-side rather than in the page bundle —
 * validateConstruct pulls zod, which dev.ts (a Node script) already
 * carries, but the browser bundle does not, and this route only fires for
 * an EXTERNAL hand-edit relayed by the SSE 'construct' event, so the file
 * on disk can be invalid mid-edit. Additive `problems` field only, so a
 * valid file's response is byte-identical to the raw on-disk JSON.
 */
export function shapeConstructGetResponse(onDisk: unknown): unknown {
  const checked = validateConstruct(onDisk);
  return checked.ok ? onDisk : { ...(onDisk as Record<string, unknown>), problems: checked.problems };
}

export interface EventHub {
  attach: (res: ServerResponse) => void;
  /** `data` is optional so the pre-existing payload-free events ('construct')
   *  keep emitting the exact `data: {}` frame they always have — only the
   *  preview events below carry a body. */
  broadcast: (event: string, data?: unknown) => void;
}

export function createEventHub(): EventHub {
  const clients = new Set<ServerResponse>();
  return {
    attach(res) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      clients.add(res);
      res.on('close', () => clients.delete(res));
    },
    broadcast(event, data) {
      const frame = `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
      for (const res of clients) res.write(frame);
    },
  };
}

// ── create → respond → boot in the background ───────────────────────────────
// POST /api/create used to do the ENTIRE boot (codegen + `npm install` +
// spawning Vite + waiting for it) inside the request, and only then respond.
// The page had nothing to show for ~28s on a warm cache and minutes on a cold
// one — no pending state, a live Create button, no progress: a silent
// decision, and the loudest possible version of one. The request now stops at
// the point where the DURABLE state exists (the construct file is on disk,
// which is the whole B-22 state model) and the slow half runs detached,
// announcing itself over the SSE hub the 'construct' event already uses.

/** What the page's preview area is showing, and the one thing every
 *  state-bearing response has to agree about. Modelled as a state rather than
 *  a nullable url so "not started", "starting", and "failed" are three
 *  distinguishable answers — a bare `previewUrl: undefined` cannot tell the
 *  page whether to wait or to give up. */
export type PreviewState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string };

/** The preview fields carried by GET /api/state and POST /api/create alike —
 *  one derivation, so the two routes can never disagree. */
export function previewFields(preview: PreviewState): {
  previewUrl?: string;
  previewPending: boolean;
  previewError?: string;
} {
  return {
    previewUrl: preview.status === 'ready' ? preview.url : undefined,
    previewPending: preview.status === 'starting',
    previewError: preview.status === 'error' ? preview.message : undefined,
  };
}

export interface CreateRequestBody {
  templateId?: string;
  variantId?: string;
  name?: string;
}

/** The starting JSON a template (or a variant of one) seeds — T-3's own rule:
 *  a template IS a starter construct, and the picker writes it. */
export function starterFor(body: CreateRequestBody): unknown {
  const template = buildableTemplates().find((t) => t.id === body.templateId);
  return body.templateId === 'scratch' || !template
    ? { name: body.name, layout: 'fullscreen', provider: { mode: 'mock' } }
    : {
        ...(template.variants?.find((v) => v.id === body.variantId)?.starter ?? template.starter),
        name: body.name,
      };
}

/** POST /api/create's SYNCHRONOUS half: derive the starter, validate it, and
 *  — only then — write it. Identical validate-then-write semantics to
 *  `handleConstructPut` (a rejection writes nothing), and deliberately free of
 *  the boot so the route can respond the instant the file exists. */
export function handleCreate(
  body: CreateRequestBody,
  cwd: string,
): { ok: true; construct: unknown; target: string } | { ok: false; problems: ConstructProblem[] } {
  const starter = starterFor(body);
  const validated = validateConstruct(starter);
  if (!validated.ok) return { ok: false, problems: validated.problems };
  // Safe to interpolate: the schema's own TAG_RE has already constrained the
  // name to a lowercase hyphenated custom-element tag, so there is no
  // separator or traversal segment left in it by this line.
  const target = resolve(cwd, `${validated.construct.name}.construct.json`);
  // Never clobber an existing construct silently: with multiple constructs in
  // one directory (the home-screen model), a create colliding with a file on
  // disk is a rejection naming the working path, not an overwrite.
  if (existsSync(target)) {
    return {
      ok: false,
      problems: [{
        path: 'name',
        message:
          `a construct named "${validated.construct.name}" already exists here (${basename(target)}) — ` +
          `open it from the home screen, or pick another name.`,
      }],
    };
  }
  atomicWriteJson(target, starter);
  return { ok: true, construct: starter, target };
}

/** Poll until the spawned preview server is ACTUALLY listening — spawning
 *  Vite and announcing its url in the same tick is a lie the iframe pays for
 *  (a connection-refused page it never retries). `probe`, `sleep` and `now`
 *  are injectable so the loop, the timeout and the abort are unit-testable
 *  without spawning anything. `abort` is how a Vite that DIED gets reported as
 *  itself instead of as a timeout minutes later. */
export async function waitUntilListening(
  probe: () => Promise<boolean>,
  opts: {
    timeoutMs?: number;
    intervalMs?: number;
    abort?: () => string | undefined;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const intervalMs = opts.intervalMs ?? 250;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const now = opts.now ?? Date.now;
  const started = now();
  for (;;) {
    const aborted = opts.abort?.();
    if (aborted) return { ok: false, reason: aborted };
    if (await probe()) return { ok: true };
    if (now() - started >= timeoutMs) {
      return { ok: false, reason: `the preview server did not start within ${Math.round(timeoutMs / 1000)}s` };
    }
    await sleep(intervalMs);
  }
}

/** A TCP connect against one host — cheaper and more honest than an HTTP GET,
 *  since "listening" is exactly the question. */
export function probeHost(port: number, host: string): Promise<boolean> {
  return new Promise<boolean>((done) => {
    const socket = connect({ port, host });
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      done(ok);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1_000, () => finish(false));
  });
}

/** BOTH loopback families, and up if EITHER answers.
 *
 *  Found in the real run, not in review: Vite 6 binds `[::1]` and nothing on
 *  `127.0.0.1`, so an IPv4-only probe waits out the entire timeout against a
 *  preview server that has been serving happily the whole time — the page then
 *  reports "the preview server did not start" about a running server. The url
 *  we announce is `http://localhost:<port>/`, which the browser resolves under
 *  either family, so the probe has to ask the same question the browser will. */
export function probePort(port: number, hosts: readonly string[] = ['127.0.0.1', '::1']): Promise<boolean> {
  return Promise.all(hosts.map((host) => probeHost(port, host))).then((answers) => answers.some(Boolean));
}

/** Run a boot detached from the request that triggered it and ANNOUNCE the
 *  outcome — the url on success, the message on failure. Never throws and
 *  never resolves silently: a boot that dies with nothing on the wire is the
 *  same silent hang this whole change exists to remove. */
export async function announceBoot(
  boot: () => Promise<string>,
  hub: Pick<EventHub, 'broadcast'>,
  io: CliIo,
): Promise<PreviewState> {
  try {
    const url = await boot();
    hub.broadcast('preview', { previewUrl: url });
    return { status: 'ready', url };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    io.error(`preview failed to start — ${message}`);
    hub.broadcast('preview-error', { message });
    return { status: 'error', message };
  }
}

/** The ONE listen call for the builder server, extracted so the loopback
 *  bind is unit-testable without spawning vite or a whole devBuilder run:
 *  omitting the host argument binds the unspecified address (`::`/
 *  `0.0.0.0`), reachable from the rest of the local network, which matters
 *  because this server writes files and spawns processes on POST. */
export function listenLoopbackOnly(server: import('node:http').Server, port: number, onListening: () => void): void {
  server.listen(port, '127.0.0.1', onListening);
}

/** What a taken builder port SHOULD say. An EADDRINUSE here is not an
 *  exceptional condition, it is the ordinary consequence of leaving a builder
 *  running in another terminal — and it used to surface as a raw Node stack
 *  trace, which names the errno and not one thing the reader can act on. */
export function portInUseNotice(taken: number, next: number): string {
  return (
    `port ${taken} is already in use — another \`kai dev --builder\` is probably still running ` +
    `(\`lsof -nP -iTCP:${taken} -sTCP:LISTEN\` names it). Trying ${next} instead.`
  );
}

export function portsExhaustedMessage(from: number, to: number): string {
  return (
    `every port from ${from} to ${to} is in use. Stop the other \`kai dev --builder\` ` +
    `(\`lsof -nP -iTCP:${from} -sTCP:LISTEN\` names it) and try again.`
  );
}

/**
 * Bind the builder server, stepping to the next port when one is taken rather
 * than dying with an EADDRINUSE stack (owner-hit). Vite-style: say which port
 * was busy and which one we moved to, then carry on. Built ON TOP of
 * `listenLoopbackOnly` rather than beside it, so the loopback-only guarantee —
 * this server writes files and spawns processes on POST — stays in one place
 * and keeps its own test.
 *
 * Resolves with the port actually bound; the CALLER must use that number
 * rather than the one it asked for.
 */
export async function listenWithPortFallback(
  server: import('node:http').Server,
  startPort: number,
  io: CliIo,
  opts: { attempts?: number; isTaken?: (port: number) => Promise<boolean> } = {},
): Promise<number> {
  const attempts = Math.max(1, opts.attempts ?? 10);
  // Pre-check BOTH loopback families, not just EADDRINUSE. Binding
  // 127.0.0.1:4401 SUCCEEDS while something already holds [::1]:4401 — they
  // are different sockets — so an EADDRINUSE-only fallback happily lands the
  // builder on the port a Vite preview is already serving `localhost` from,
  // and which one a browser reaches is then down to DNS ordering. Observed in
  // the real run, with a second builder started beside a live first one.
  const isTaken = opts.isTaken ?? ((p: number) => probePort(p));
  let port = startPort;
  for (let tried = 1; ; tried++) {
    // Port 0 means "any free port" — never something to skip.
    let busy = port !== 0 && (await isTaken(port));
    if (!busy) busy = (await tryListenLoopback(server, port)) === 'taken';
    if (!busy) {
      // Read the port back off the socket rather than trusting the number we
      // asked for: with port 0 they differ, and the caller derives the preview
      // port from this answer.
      const addr = server.address();
      return typeof addr === 'object' && addr !== null ? addr.port : port;
    }
    if (tried >= attempts) throw new Error(portsExhaustedMessage(startPort, port));
    io.error(portInUseNotice(port, port + 1));
    port += 1;
  }
}

/** One bind attempt: 'ok', 'taken', or a rejection for anything that is not a
 *  port collision (a permissions error must not be retried nine times). */
function tryListenLoopback(server: import('node:http').Server, port: number): Promise<'ok' | 'taken'> {
  return new Promise<'ok' | 'taken'>((done, fail) => {
    let settled = false;
    const cleanup = (): void => {
      server.off('error', onError);
      server.off('listening', onListening);
    };
    const onListening = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      done('ok');
    };
    const onError = (err: NodeJS.ErrnoException): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err.code === 'EADDRINUSE') done('taken');
      else fail(err);
    };
    server.on('error', onError);
    server.on('listening', onListening);
    listenLoopbackOnly(server, port, () => {});
  });
}

const ASSET_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  '.json': 'application/json',
};

/** Resolve a request path inside the prebuilt page dir; undefined on
 *  traversal or a miss. Root serves index.html. Uses `resolve`, not
 *  `realpathSync`: this only rejects `..`-style traversal in the URL, it
 *  does not chase a symlink placed inside rootDir out to another
 *  filesystem location. Trust assumption: rootDir is `dist/builder-page`,
 *  written by the kit's OWN build step, never by request input — a symlink
 *  there would have to come from a compromised build or dependency, which
 *  is a supply-chain concern this function cannot and does not defend
 *  against. */
export function serveBuilderAsset(urlPath: string, rootDir: string): { file: string; type: string } | undefined {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const file = resolve(rootDir, rel);
  if (!file.startsWith(resolve(rootDir) + '/') && file !== resolve(rootDir, 'index.html')) return undefined;
  if (!existsSync(file)) return undefined;
  return { file, type: ASSET_TYPES[extname(file)] ?? 'application/octet-stream' };
}

/** Bounded walk-up used by `builderPageDir()`, factored out so a test can
 *  drive it from a synthetic directory tree instead of the real compiled
 *  output. Exported so a chunk-split layout (a nested `dist/assets/`) is
 *  pinned directly rather than only reachable through a real Vite build.
 *
 *  Why the walk-up exists at all (2026-08-28, IVP-found): this function
 *  used to assume its own compiled module always lives directly beside
 *  `builder-page/` — true only if Rollup inlines this module into
 *  construct-cli.es.js. It doesn't: `cli.ts` reaches `dev.ts` through a
 *  dynamic `import('./dev')` (so `plain kai dev` never pays for the
 *  builder's code), and Rollup's default behaviour is to split a
 *  dynamically-imported module into its own chunk — observed at
 *  `dist/assets/dev-*.js`. `import.meta.url` inside that chunk resolves to
 *  `dist/assets/`, one level below the real `dist/builder-page/`, so the
 *  old single-level join silently computed the wrong path on every real
 *  build. Rather than pin the chunk's exact depth (a Rollup output detail
 *  that can change on any dependency bump), walk up from wherever the
 *  chunk lands until `builder-page/` is found, bounded so a genuinely
 *  missing artifact still fails fast and loud with every path it tried. */
export function resolveBuilderPageDir(startDir: string, dirName = 'builder-page'): { dir: string } | { tried: string[] } {
  const tried: string[] = [];
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, dirName);
    tried.push(candidate);
    if (existsSync(join(candidate, 'index.html'))) return { dir: candidate };
    const atPackageRoot = existsSync(join(dir, 'package.json'));
    const parent = dirname(dir);
    if (atPackageRoot || parent === dir) break; // don't climb past the package root or the fs root
    dir = parent;
  }
  return { tried };
}

/** dist/builder-page, resolved relative to wherever THIS module's compiled
 *  chunk actually landed (see `resolveBuilderPageDir`'s comment) — not
 *  assumed to sit beside dist/construct-cli.es.js. Throws loudly, naming
 *  every path it tried, when no build artifact is found at all. */
export function builderPageDir(): string {
  const out = resolveBuilderPageDir(dirname(fileURLToPath(import.meta.url)));
  if ('dir' in out) return out.dir;
  throw new Error(
    `Missing build artifact: builder-page/index.html — the builder page ships prebuilt. ` +
      `Tried:\n${out.tried.map((p) => `  ${p}`).join('\n')}\n` +
      `Run \`nx build ui\` (or npm run build in packages/ui) and try again.`,
  );
}

/** dist/theme-studio, resolved by the same walk as dist/builder-page (it is
 *  prebuilt right beside it — KAI_BUILD=theme-studio, config/vite/page.ts).
 *  Nullable rather
 *  than throwing: the studio route is additive, and a build predating it must
 *  not take the whole builder down — the route 404s with instructions. */
export function themeStudioDir(): string | undefined {
  const out = resolveBuilderPageDir(dirname(fileURLToPath(import.meta.url)), 'theme-studio');
  return 'dir' in out ? out.dir : undefined;
}

/** dist/blocks (registry.json + r/<name>.json + r/<name>.cdn.html, emitted by
 *  gen-blocks.mjs in postbuild) — the walk probes for registry.json rather
 *  than index.html, so `resolveBuilderPageDir`'s index.html probe cannot be
 *  reused here. Bounded the same way. */
export function blocksDistDir(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'blocks');
    if (existsSync(join(candidate, 'registry.json'))) return candidate;
    const atPackageRoot = existsSync(join(dir, 'package.json'));
    const parent = dirname(dir);
    if (atPackageRoot || parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

// ── the manifest-of-constructs entry flow (owner ask, 2026-08-31) ───────────
// The builder used to start from scratch every time. Now the session's cwd is
// scanned for existing `*.construct.json` files (they live at the PROJECT
// ROOT — handleCreate writes `<cwd>/<name>.construct.json`; `.kai/` holds only
// generated workdirs): none → the template picker, one or more → a home screen
// listing them, and `kai dev --builder <name>` opens one directly.

/** Scan a directory (non-recursive) for construct files, newest first. Every
 *  `*.construct.json` is listed; unreadable/unparseable/invalid ones are
 *  marked rather than dropped. */
export function listConstructs(cwd: string): ConstructListing[] {
  let entries: string[];
  try {
    entries = readdirSync(cwd);
  } catch {
    return [];
  }
  const rows: ConstructListing[] = [];
  for (const file of entries) {
    if (!file.endsWith('.construct.json')) continue;
    const abs = join(cwd, file);
    let updatedAt = new Date(0).toISOString();
    try {
      updatedAt = statSync(abs).mtime.toISOString();
    } catch {
      continue; // raced away between readdir and stat — not a listing
    }
    const fallbackName = file.slice(0, -'.construct.json'.length);
    try {
      const checked = validateConstruct(JSON.parse(readFileSync(abs, 'utf8')));
      if (checked.ok) {
        const templateId = inferTemplateId(checked.construct);
        rows.push({
          file,
          name: checked.construct.name,
          templateId,
          templateName: templateId ? templateById(templateId)?.name : undefined,
          updatedAt,
          valid: true,
        });
        continue;
      }
    } catch {
      // unreadable or not JSON — falls through to the invalid row
    }
    rows.push({ file, name: fallbackName, updatedAt, valid: false });
  }
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/** `kai dev --builder <arg>` accepts a path OR a bare construct name
 *  (`acme-support` → `<cwd>/acme-support.construct.json`). An unknown name
 *  fails loudly, listing what actually exists — never a bare ENOENT. */
export function resolveConstructArg(
  arg: string,
  cwd: string,
): { ok: true; abs: string } | { ok: false; message: string } {
  const asPath = resolve(cwd, arg);
  if (existsSync(asPath)) return { ok: true, abs: asPath };
  if (!arg.includes('/') && !arg.endsWith('.json')) {
    const asName = resolve(cwd, `${arg}.construct.json`);
    if (existsSync(asName)) return { ok: true, abs: asName };
  }
  const names = listConstructs(cwd).map((c) => c.file.slice(0, -'.construct.json'.length));
  const inventory =
    names.length > 0
      ? `this directory has: ${names.join(', ')}`
      : `no *.construct.json files exist in ${cwd}`;
  return {
    ok: false,
    message:
      `no construct named "${arg}" — ${inventory}. ` +
      `Run \`kai dev --builder\` with no argument to pick from a list, or pass a path to a .construct.json file.`,
  };
}

/** POST /api/open's doorway: the page asks by BASENAME only (the file must be
 *  one the scan could have listed — a path with separators or a traversal
 *  segment is inexpressible, not filtered), and an invalid file is rejected
 *  with its own problems rather than mounted over a panel that cannot edit it. */
export function handleOpen(
  body: { file?: unknown },
  cwd: string,
): { ok: true; abs: string; construct: unknown } | { ok: false; status: number; problems: ConstructProblem[] } {
  const file = body.file;
  if (typeof file !== 'string' || file !== basename(file) || !file.endsWith('.construct.json')) {
    return {
      ok: false,
      status: 422,
      problems: [{ path: 'file', message: 'file must be the basename of a *.construct.json in the project directory' }],
    };
  }
  const abs = resolve(cwd, file);
  if (!existsSync(abs)) {
    return {
      ok: false,
      status: 404,
      problems: [{ path: 'file', message: `no construct file "${file}" here — the list may be stale; reload the page.` }],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      status: 422,
      problems: [{ path: 'file', message: `${file} is not valid JSON: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }
  const checked = validateConstruct(raw);
  if (!checked.ok) return { ok: false, status: 422, problems: checked.problems };
  return { ok: true, abs, construct: raw };
}

/**
 * Drive-by-POST guard for every state-changing route. The builder server is
 * loopback-bound, but loopback does not stop a hostile WEB PAGE the user
 * happens to have open: `fetch('http://localhost:4400/api/create', {method:
 * 'POST'})` is a no-preflight simple request any origin can fire, and each
 * such call writes `<cwd>/<name>.construct.json`, supersedes the live
 * preview, and spawns `npm install` + Vite. The browser stamps every
 * cross-origin fetch with an unforgeable `Origin` header, so the rule is:
 * an Origin that is present and NOT this server's own origin (derived from
 * the request's Host — `http://localhost:4400` and `http://127.0.0.1:4400`
 * both match themselves) is rejected. An ABSENT Origin stays allowed — curl
 * and same-origin non-CORS requests send none — and `Origin: null`
 * (sandboxed iframes, some redirects) is present-and-foreign, so it rejects.
 * Returns the rejection message, or undefined when the request may proceed.
 */
export function crossOriginProblem(headers: { origin?: string; host?: string }): string | undefined {
  const origin = headers.origin;
  if (origin === undefined) return undefined;
  if (headers.host !== undefined && origin === `http://${headers.host}`) return undefined;
  return `cross-origin request rejected (origin: ${origin}) — the builder API only accepts requests from its own page`;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function devBuilder(
  constructPath: string | undefined,
  opts: { io?: CliIo; uiSpec?: string; port?: number; previewPort?: number } = {},
): Promise<never> {
  const io = opts.io ?? { log: (s: string) => console.log(s), error: (s: string) => console.error(s) };
  const port = opts.port ?? 4400;
  // Derived from the port we ACTUALLY bind, not the one we asked for: when the
  // builder steps off a taken 4400 onto 4401, a hard-coded preview port would
  // collide with the builder itself. Filled in once the bind resolves, below.
  let previewPort = opts.previewPort ?? port + 1;
  let pageDir: string;
  try {
    pageDir = builderPageDir();
  } catch (err) {
    io.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const hub = createEventHub();
  // The argument may be a path OR a bare name (`kai dev --builder acme-support`
  // → `<cwd>/acme-support.construct.json`); an unknown name fails loudly,
  // listing the constructs that exist, before any server is offered.
  let abs: string | undefined;
  if (constructPath) {
    const resolved = resolveConstructArg(constructPath, process.cwd());
    if (!resolved.ok) {
      io.error(resolved.message);
      process.exit(1);
    }
    abs = resolved.abs;
  }
  // The preview url is handed straight to the builder page, which iframes it
  // unguarded (no isSafeUrl check on the consuming side) — its trust story
  // lives HERE: it is never model- or consumer-supplied, only ever this
  // process's OWN spawned `npm run dev` Vite server on localhost, on a port
  // this same function chose. There is no injection surface between "we
  // spawned this" and "we iframe it".
  let preview: PreviewState = { status: 'idle' };

  // One live preview at a time: opening a DIFFERENT construct (POST /api/open,
  // or a create after one) kills the previous Vite child and closes its
  // watcher before booting the next — both on the same fixed preview port
  // (--strictPort), so the old process must actually release it first.
  let activeVite: ReturnType<typeof spawn> | undefined;
  let activeWatcher: ReturnType<typeof watch> | undefined;
  // ONE set of teardown handlers for the whole server, closing over whichever
  // Vite child is current — NOT one set per boot. Per-boot `process.once`
  // registrations never came off, so ~11 opens in one session tripped
  // MaxListenersExceededWarning and pinned every dead child's closure for the
  // life of the process.
  const killActiveVite = (): void => {
    activeVite?.kill();
  };
  process.once('exit', killActiveVite);
  process.once('SIGINT', killActiveVite);
  process.once('SIGTERM', killActiveVite);
  // Monotonic boot generation: a second open racing a boot still in its slow
  // half (npm install) must supersede it — the stale boot checks after every
  // await and aborts instead of spawning a second Vite onto the same port.
  let bootGeneration = 0;

  const boot = async (absPath: string, gen: number): Promise<string> => {
    const superseded = (): boolean => gen !== bootGeneration;
    activeWatcher?.close();
    activeWatcher = undefined;
    if (activeVite) {
      const previous = activeVite;
      activeVite = undefined;
      previous.kill();
      const freed = await waitUntilListening(async () => !(await probePort(previewPort)), { timeoutMs: 15_000 });
      if (!freed.ok) {
        throw new Error(`the previous preview server did not release port ${previewPort} — stop it and reopen`);
      }
    }
    if (superseded()) throw new Error('superseded by a newer open');
    const readRaw = (): unknown => JSON.parse(readFileSync(absPath, 'utf8'));
    const initialText = readFileSync(absPath, 'utf8');
    const first = validateConstruct(JSON.parse(initialText));
    if (!first.ok) {
      for (const p of first.problems) io.error(`  ${p.path || '(root)'}: ${p.message}`);
      throw new Error('construct invalid');
    }
    const dir = workDirFor(first.construct.name, process.cwd());
    const files = generateProject(first.construct, { uiSpec: opts.uiSpec });
    writeProject(files, dir);
    await ensureInstalled(dir, files, io);
    if (superseded()) throw new Error('superseded by a newer open');
    // Same rename-surviving directory watch as dev() — see its comment.
    const base = basename(absPath);
    activeWatcher = watch(dirname(absPath), (_event, filename) => {
      if (filename !== base) return;
      regenTurn(readRaw, { write: writeProject }, dir, { uiSpec: opts.uiSpec }, io);
      hub.broadcast('construct'); // hand-edits flow into the open builder
    });
    // The panel is now LIVE for the whole of the install above (that is the
    // point of booting in the background), so the file can have moved on since
    // the generateProject a few lines up. Catch up once, after the watcher is
    // attached — the two windows overlap, so no edit can fall between them.
    // Guarded on the text actually changing so a boot with no edits does not
    // print a misleading "construct changed" line.
    if (readFileSync(absPath, 'utf8') !== initialText) {
      regenTurn(readRaw, { write: writeProject }, dir, { uiSpec: opts.uiSpec }, io);
    }
    const npm = npmInvocation();
    const vite = spawn(npm.command, npmArgs(['run', 'dev', '--', '--port', String(previewPort), '--strictPort'], npm.shell), {
      cwd: dir,
      stdio: 'inherit',
      shell: npm.shell,
    });
    activeVite = vite;
    let viteDied: string | undefined;
    vite.on('exit', (code) => {
      viteDied ??= `the preview server exited with code ${code} before it started listening`;
    });
    // A spawn failure (npm missing; EINVAL from Windows' .cmd hardening before
    // this helper existed) fires 'error', never 'exit' — without this line the
    // abort below never triggers and the boot waits out its whole timeout.
    vite.on('error', (err) => {
      viteDied ??= `the preview server failed to start: ${err.message}`;
    });
    // Teardown on process exit/SIGINT/SIGTERM is registered ONCE at server
    // start (killActiveVite above) — never per boot.
    // Announce the url only once something is actually accepting connections
    // on that port: the page iframes it the moment it hears about it, and an
    // iframe pointed at a refused connection stays broken — it does not retry.
    const listening = await waitUntilListening(() => probePort(previewPort), { abort: () => viteDied });
    if (!listening.ok) throw new Error(listening.reason);
    const url = `http://localhost:${previewPort}/`;
    io.log(`previewing <${first.construct.name}> at ${url}`);
    return url;
  };

  /** Boot detached, then park the outcome where /api/state can report it.
   *  Everything is gated on the boot's generation still being current, so a
   *  boot superseded mid-install can neither clobber the newer boot's state
   *  nor broadcast a stray preview/preview-error frame for the wrong file. */
  const bootInBackground = (absPath: string): void => {
    const gen = ++bootGeneration;
    preview = { status: 'starting' };
    const gatedHub: Pick<EventHub, 'broadcast'> = {
      broadcast: (event, data) => {
        if (gen === bootGeneration) hub.broadcast(event, data);
      },
    };
    void announceBoot(() => boot(absPath, gen), gatedHub, io).then((next) => {
      if (gen === bootGeneration) preview = next;
    });
  };

  if (abs) {
    // Fail fast on a construct path that is not a construct — same contract as
    // dev()'s own first validate. Only the SLOW half of the boot moves into the
    // background (below, after the bind); a bad argument still exits before a
    // server is ever offered.
    try {
      const initial = validateConstruct(JSON.parse(readFileSync(abs, 'utf8')));
      if (!initial.ok) {
        for (const p of initial.problems) io.error(`  ${p.path || '(root)'}: ${p.message}`);
        process.exit(1);
      }
    } catch (err) {
      io.error(`cannot read ${abs}: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  const server = createServer(async (req, res) => {
    const send = (code: number, body: unknown): void => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      const url = req.url ?? '/';
      // Before ANY route dispatch: every non-GET is state-changing here
      // (create/open/construct all write files or spawn processes), so the
      // guard sits on the method, not on a hand-kept route list a new POST
      // could silently miss. GETs stay unguarded — cross-origin reads are
      // already blocked by CORS (no Access-Control-Allow-Origin is sent).
      if (req.method !== 'GET') {
        const rejected = crossOriginProblem({ origin: req.headers.origin, host: req.headers.host });
        if (rejected) return send(403, { problems: [{ path: '', message: rejected }] });
      }
      if (req.method === 'GET' && url === '/api/state') {
        if (abs) {
          return send(200, {
            phase: 'panel',
            constructPath: abs,
            construct: JSON.parse(readFileSync(abs, 'utf8')),
            ...previewFields(preview),
          });
        }
        // No construct opened yet: existing constructs in this directory make
        // the session start at the HOME screen; an empty directory keeps
        // today's template picker (`phase: 'start'`, additive `constructs`).
        const constructs = listConstructs(process.cwd());
        return send(200, { phase: constructs.length > 0 ? 'home' : 'start', constructs });
      }
      if (req.method === 'GET' && url === '/api/constructs') {
        return send(200, { constructs: listConstructs(process.cwd()) });
      }
      if (req.method === 'GET' && url === '/api/construct') {
        if (!abs) return send(404, { problems: [{ path: '', message: 'no construct yet' }] });
        return send(200, shapeConstructGetResponse(JSON.parse(readFileSync(abs, 'utf8'))));
      }
      if (req.method === 'GET' && url === '/api/events') return hub.attach(res);
      if (req.method === 'POST' && url === '/api/construct') {
        if (!abs) return send(409, { problems: [{ path: '', message: 'create a construct first' }] });
        const out = handleConstructPut(await readJsonBody(req), abs);
        return out.ok ? send(200, { ok: true }) : send(422, { problems: out.problems });
      }
      if (req.method === 'POST' && url === '/api/open') {
        const out = handleOpen((await readJsonBody(req)) as { file?: unknown }, process.cwd());
        if (!out.ok) return send(out.status, { problems: out.problems });
        // Reopening the construct that is ALREADY live (back-to-home, then the
        // same card) must not kill and respawn a healthy preview.
        if (abs === out.abs && (preview.status === 'ready' || preview.status === 'starting')) {
          return send(200, { construct: out.construct, constructPath: abs, ...previewFields(preview) });
        }
        abs = out.abs;
        preview = { status: 'starting' };
        send(200, { construct: out.construct, constructPath: abs, ...previewFields(preview) });
        bootInBackground(out.abs);
        return;
      }
      if (req.method === 'POST' && url === '/api/create') {
        // No session-level 409 any more: with the home screen, creating a
        // SECOND construct in the same session is the "New construct" flow.
        // handleCreate itself refuses to overwrite a file that already exists.
        const out = handleCreate((await readJsonBody(req)) as CreateRequestBody, process.cwd());
        if (!out.ok) return send(422, { problems: out.problems });
        // The construct file IS the state (B-22), so the moment it is on disk
        // the session is real: publish it, respond, and let the boot catch up
        // over SSE. Setting `abs` before responding is what makes the panel
        // immediately usable — POST /api/construct works while Vite installs.
        abs = out.target;
        preview = { status: 'starting' };
        send(200, { construct: out.construct, ...previewFields(preview) });
        bootInBackground(out.target);
        return;
      }
      // The standalone theme studio (dist/theme-studio), iframed by the
      // builder page. /theme-studio/kit/* maps onto the package's own dist
      // root, so the studio's external `import('@kitn.ai/ui/elements')`
      // (rewritten to /theme-studio/kit/kai.es.js at build time) loads the
      // element bundle + its chunks WITHOUT dist/theme-studio re-bundling the
      // kit. Same trust story as pageDir: our own build output, loopback only.
      if (req.method === 'GET' && (url === '/theme-studio' || url.startsWith('/theme-studio?'))) {
        const q = url.indexOf('?');
        res.writeHead(302, { location: `/theme-studio/${q === -1 ? '' : url.slice(q)}` });
        return res.end();
      }
      if (req.method === 'GET' && url.startsWith('/theme-studio/')) {
        const studioDir = themeStudioDir();
        if (!studioDir) {
          return send(404, {
            problems: [{ path: '', message: 'dist/theme-studio is missing — run `npm run build` in packages/ui (or nx build ui) and reload.' }],
          });
        }
        const sub = url.slice('/theme-studio'.length);
        const studioAsset = sub.startsWith('/kit/')
          ? serveBuilderAsset(sub.slice('/kit'.length), dirname(studioDir))
          : serveBuilderAsset(sub, studioDir);
        if (!studioAsset) return send(404, { problems: [{ path: '', message: 'not found' }] });
        res.writeHead(200, { 'content-type': studioAsset.type });
        return res.end(readFileSync(studioAsset.file));
      }
      const asset = serveBuilderAsset(url, pageDir);
      if (asset) {
        res.writeHead(200, { 'content-type': asset.type });
        return res.end(readFileSync(asset.file));
      }
      // SPA fallback: any other GET serves the page shell.
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(readFileSync(join(pageDir, 'index.html')));
      }
      return send(404, { problems: [{ path: '', message: 'not found' }] });
    } catch (err) {
      return send(400, { problems: [{ path: '', message: err instanceof Error ? err.message : String(err) }] });
    }
  });
  let bound: number;
  try {
    bound = await listenWithPortFallback(server, port, io);
  } catch (err) {
    io.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  if (opts.previewPort === undefined) previewPort = bound + 1;
  io.log(`kai builder at http://localhost:${bound}/ — the construct file stays yours.`);
  // AFTER the bind, so the preview port is derived from the port we really got
  // and the builder url is on screen before the first npm install starts.
  if (abs) bootInBackground(abs);
  return new Promise<never>(() => {});
}
