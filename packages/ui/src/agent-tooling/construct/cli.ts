/**
 * The kai construct CLI: validate | eject | dev | compile.
 * Launched by bin/mcp.js (the package's one bin) via dist/construct-cli.es.js.
 * Every subcommand goes through validateConstruct first — a validation failure
 * never reaches codegen; the problems print with paths and the exit code says so.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateConstruct, type Construct } from './schema';
import { generateProject, writeProject } from './codegen';

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
      const construct = path && outDir ? loadConstruct(path, io) : null;
      if (!construct || !outDir) {
        if (construct === null && path) return 1;
        io.error(USAGE);
        return 2;
      }
      writeProject(generateProject(construct), resolve(outDir));
      io.log(`ejected <${construct.name}> to ${resolve(outDir)} — npm install && npm run dev. The source is yours.`);
      return 0;
    }
    default:
      io.error(USAGE);
      return 2;
  }
}
