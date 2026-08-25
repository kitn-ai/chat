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
import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { generateProject, writeProject, type GeneratedFile, type GenerateOptions } from './codegen';
import { validateConstruct, type ConstructProblem } from './schema';
import type { CliIo } from './cli';

export function workDirFor(name: string, root: string): string {
  return join(root, '.kai', name);
}

export function installKey(files: GeneratedFile[]): string {
  const pkg = files.find((f) => f.path === 'package.json');
  return createHash('sha256').update(pkg?.code ?? '').digest('hex');
}

export type RegenOutcome = { ok: true; files: GeneratedFile[] } | { ok: false; problems: ConstructProblem[] };

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
  return { ok: true, files };
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
  } catch (err) {
    io.error(`regen failed (${err instanceof Error ? err.message : String(err)}) — last good preview stays up`);
  }
}

const KEY_FILE = '.kai-install-key';

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

  const key = installKey(files);
  const keyPath = join(dir, KEY_FILE);
  const installed = existsSync(keyPath) && readFileSync(keyPath, 'utf8') === key;
  if (!installed) {
    io.log(`installing dependencies in ${dir} (first run or deps changed)…`);
    await new Promise<void>((done, fail) => {
      const child = spawn('npm', ['install'], { cwd: dir, stdio: 'inherit' });
      child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`npm install exited ${code}`))));
    });
    writeFileSync(keyPath, key);
  }

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
