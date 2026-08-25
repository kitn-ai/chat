/**
 * The kai construct CLI: validate | eject | dev | compile.
 * Launched by bin/mcp.js (the package's one bin) via dist/construct-cli.es.js.
 * Every subcommand goes through validateConstruct first — a validation failure
 * never reaches codegen; the problems print with paths and the exit code says so.
 */
import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { validateConstruct, type Construct } from './schema';
import { accentContrastNotice, emitTypes, generateProject, writeProject } from './codegen';

export interface CliIo {
  log: (s: string) => void;
  error: (s: string) => void;
}

const defaultIo: CliIo = { log: (s) => console.log(s), error: (s) => console.error(s) };

const USAGE = `usage: kai <command>

  kai validate <construct.json>          check a construct, print problems with paths
  kai eject <construct.json> <outDir>    write the generated Solid project (it's yours)
  kai dev <construct.json>               live preview with reload-on-edit (Task 5)
  kai compile <construct.json> [outDir]  one self-registering .js (Task 6)
`;

export function loadConstruct(path: string, io: CliIo): Construct | null {
  const abs = resolve(path);
  let raw: string;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch {
    io.error(`cannot read ${abs}`);
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    io.error(`${abs} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  const out = validateConstruct(json);
  if (!out.ok) {
    io.error(`${abs} is not a valid construct:`);
    for (const p of out.problems) io.error(`  ${p.path || '(root)'}: ${p.message}`);
    return null;
  }
  return out.construct;
}

/** `--ui <spec>` extraction shared by `dev` and `compile`. NB: guard the -1
 *  case — `i !== uiFlag + 1` with uiFlag === -1 would drop index 0. */
function parseUiFlag(rest: string[]): { uiSpec: string | undefined; positional: string[] } {
  const uiFlag = rest.indexOf('--ui');
  const uiSpec = uiFlag >= 0 ? rest[uiFlag + 1] : undefined;
  const positional = uiFlag >= 0 ? rest.filter((_, i) => i !== uiFlag && i !== uiFlag + 1) : rest;
  return { uiSpec, positional };
}

export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'validate': {
      const construct = loadConstruct(rest[0] ?? '', io);
      if (!construct) return 1;
      io.log(`valid construct: <${construct.name}> (layout: ${construct.layout}, provider: ${construct.provider.mode})`);
      return 0;
    }
    case 'eject': {
      const [path, outDir] = rest;
      if (!path || !outDir) {
        io.error(USAGE);
        return 2;
      }
      const construct = loadConstruct(path, io);
      if (!construct) return 1;
      const overwritten = writeProject(generateProject(construct), resolve(outDir));
      if (overwritten.length > 0) {
        io.log(`overwriting ${overwritten.length} existing file(s)`);
      }
      const notice = accentContrastNotice(construct);
      if (notice) io.log(notice);
      io.log(`ejected <${construct.name}> to ${resolve(outDir)} — npm install && npm run dev. The source is yours.`);
      return 0;
    }
    case 'dev': {
      const { uiSpec, positional } = parseUiFlag(rest);
      const path = positional[0];
      if (!path) {
        io.error(USAGE);
        return 2;
      }
      const { dev } = await import('./dev');
      await dev(path, { io, uiSpec });
      return 0; // unreachable; dev() never resolves
    }
    case 'compile': {
      const { uiSpec, positional } = parseUiFlag(rest);
      const [path, outArg] = positional;
      if (!path) {
        io.error(USAGE);
        return 2;
      }
      const construct = loadConstruct(path, io);
      if (!construct) return 1;
      const outDir = resolve(outArg ?? 'dist-construct');
      const { workDirFor, ensureInstalled } = await import('./dev');
      const dir = workDirFor(construct.name, process.cwd());
      const files = generateProject(construct, { uiSpec });
      writeProject(files, dir);
      await ensureInstalled(dir, files, io);
      await new Promise<void>((done, fail) => {
        const child = spawn('npm', ['run', 'build'], { cwd: dir, stdio: 'inherit' });
        child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`vite build exited ${code}`))));
      });
      mkdirSync(outDir, { recursive: true });
      copyFileSync(join(dir, 'dist', `${construct.name}.js`), join(outDir, `${construct.name}.js`));
      writeFileSync(join(outDir, `${construct.name}.d.ts`), emitTypes(construct));
      writeProject(files, join(outDir, 'source'));
      io.log(`compiled <${construct.name}> → ${outDir}/${construct.name}.js (source beside it in source/).`);
      io.log(`endpoint backends: the kai MCP scaffold tool emits a matching route — see its output for your framework.`);
      return 0;
    }
    default:
      io.error(USAGE);
      return 2;
  }
}
