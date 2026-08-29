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
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accentContrastNotice, generateProject, writeProject, type GeneratedFile, type GenerateOptions } from './codegen';
import { validateConstruct, type Construct, type ConstructProblem } from './schema';
import { buildableTemplates } from './templates';
import type { CliIo } from './cli';

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
    const notice = accentContrastNotice(out.construct);
    if (notice) io.log(notice);
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
  await new Promise<void>((done, fail) => {
    const child = spawn('npm', ['install'], { cwd: dir, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`npm install exited ${code}`))));
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
  const firstNotice = accentContrastNotice(first.construct);
  if (firstNotice) io.log(firstNotice);

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
  const vite = spawn('npm', ['run', 'dev'], { cwd: dir, stdio: 'inherit' });
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
  });
}

// ── kai dev --builder (B-22/B-23) ───────────────────────────────────────────
// A SECOND, thin server beside the loop above — dev() itself is untouched
// (plain `kai dev` stays byte-identical). The builder page is PREBUILT into
// dist/builder-page at kit build time (vite.config.builder-page.ts), so at
// consumer runtime this server compiles nothing: it serves static files,
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

export function createEventHub(): { attach: (res: ServerResponse) => void; broadcast: (event: string) => void } {
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
    broadcast(event) {
      for (const res of clients) res.write(`event: ${event}\ndata: {}\n\n`);
    },
  };
}

/** The ONE listen call for the builder server, extracted so the loopback
 *  bind is unit-testable without spawning vite or a whole devBuilder run:
 *  omitting the host argument binds the unspecified address (`::`/
 *  `0.0.0.0`), reachable from the rest of the local network, which matters
 *  because this server writes files and spawns processes on POST. */
export function listenLoopbackOnly(server: import('node:http').Server, port: number, onListening: () => void): void {
  server.listen(port, '127.0.0.1', onListening);
}

const ASSET_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
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
export function resolveBuilderPageDir(startDir: string): { dir: string } | { tried: string[] } {
  const tried: string[] = [];
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'builder-page');
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
  const previewPort = opts.previewPort ?? 4401;
  let pageDir: string;
  try {
    pageDir = builderPageDir();
  } catch (err) {
    io.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const hub = createEventHub();
  let abs = constructPath ? resolve(constructPath) : undefined;
  // previewUrl is handed straight to the builder page, which iframes it
  // unguarded (no isSafeUrl check on the consuming side) — its trust story
  // lives HERE: it is never model- or consumer-supplied, only ever this
  // process's OWN spawned `npm run dev` Vite server on localhost, on a port
  // this same function chose. There is no injection surface between "we
  // spawned this" and "we iframe it".
  let previewUrl: string | undefined;

  const boot = async (absPath: string): Promise<void> => {
    const readRaw = (): unknown => JSON.parse(readFileSync(absPath, 'utf8'));
    const first = validateConstruct(readRaw());
    if (!first.ok) {
      for (const p of first.problems) io.error(`  ${p.path || '(root)'}: ${p.message}`);
      throw new Error('construct invalid');
    }
    const dir = workDirFor(first.construct.name, process.cwd());
    const files = generateProject(first.construct, { uiSpec: opts.uiSpec });
    writeProject(files, dir);
    await ensureInstalled(dir, files, io);
    // Same rename-surviving directory watch as dev() — see its comment.
    const base = basename(absPath);
    watch(dirname(absPath), (_event, filename) => {
      if (filename !== base) return;
      regenTurn(readRaw, { write: writeProject }, dir, { uiSpec: opts.uiSpec }, io);
      hub.broadcast('construct'); // hand-edits flow into the open builder
    });
    const vite = spawn('npm', ['run', 'dev', '--', '--port', String(previewPort), '--strictPort'], {
      cwd: dir,
      stdio: 'inherit',
    });
    const killVite = () => vite.kill();
    process.once('exit', killVite);
    process.once('SIGINT', killVite);
    process.once('SIGTERM', killVite);
    previewUrl = `http://localhost:${previewPort}/`;
    io.log(`previewing <${first.construct.name}> at ${previewUrl}`);
  };

  if (abs) await boot(abs);

  const server = createServer(async (req, res) => {
    const send = (code: number, body: unknown): void => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      const url = req.url ?? '/';
      if (req.method === 'GET' && url === '/api/state') {
        return send(200, abs
          ? { phase: 'panel', constructPath: abs, construct: JSON.parse(readFileSync(abs, 'utf8')), previewUrl }
          : { phase: 'start' });
      }
      if (req.method === 'GET' && url === '/api/construct') {
        if (!abs) return send(404, { problems: [{ path: '', message: 'no construct yet' }] });
        const onDisk = JSON.parse(readFileSync(abs, 'utf8'));
        // F5 (builder-page fix wave): validate server-side rather than in the
        // page bundle — validateConstruct pulls zod, which dev.ts (a Node
        // script) already carries, but the browser bundle does not, and this
        // route only fires for an EXTERNAL hand-edit relayed by the SSE
        // 'construct' event, so the file on disk can be invalid mid-edit.
        // Additive `problems` field only, so a valid file's response is
        // byte-identical to before.
        const checked = validateConstruct(onDisk);
        return send(200, checked.ok ? onDisk : { ...onDisk, problems: checked.problems });
      }
      if (req.method === 'GET' && url === '/api/events') return hub.attach(res);
      if (req.method === 'POST' && url === '/api/construct') {
        if (!abs) return send(409, { problems: [{ path: '', message: 'create a construct first' }] });
        const out = handleConstructPut(await readJsonBody(req), abs);
        return out.ok ? send(200, { ok: true }) : send(422, { problems: out.problems });
      }
      if (req.method === 'POST' && url === '/api/create') {
        if (abs) return send(409, { problems: [{ path: '', message: 'a construct already exists in this session' }] });
        const body = (await readJsonBody(req)) as { templateId?: string; variantId?: string; name?: string };
        const template = buildableTemplates().find((t) => t.id === body.templateId);
        const starter: unknown = body.templateId === 'scratch' || !template
          ? { name: body.name, layout: 'fullscreen', provider: { mode: 'mock' } }
          : {
              ...(template.variants?.find((v) => v.id === body.variantId)?.starter ?? template.starter),
              name: body.name,
            };
        const validated = validateConstruct(starter);
        if (!validated.ok) return send(422, { problems: validated.problems });
        const target = resolve(process.cwd(), `${body.name}.construct.json`);
        atomicWriteJson(target, starter);
        abs = target;
        await boot(target);
        return send(200, { previewUrl, construct: starter });
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
  listenLoopbackOnly(server, port, () => io.log(`kai builder at http://localhost:${port}/ — the construct file stays yours.`));
  return new Promise<never>(() => {});
}
