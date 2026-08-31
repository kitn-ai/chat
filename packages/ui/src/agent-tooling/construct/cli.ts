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
import { classifyKit, localKitNotice, localKitStartDir, packLocalKit, unbuiltMessage } from './local-kit';

export interface CliIo {
  log: (s: string) => void;
  error: (s: string) => void;
}

const defaultIo: CliIo = { log: (s) => console.log(s), error: (s) => console.error(s) };

const USAGE = `usage: npx @kitn.ai/ui <command>   (or \`kai <command>\` once @kitn.ai/ui is installed)

  kai validate <construct.json>          check a construct, print problems with paths
  kai eject <construct.json> <outDir>    write the generated Solid project (it's yours)
  kai dev <construct.json>               live preview with reload-on-edit
  kai dev --builder [name|construct.json]  visual builder + live preview (no arg = your constructs, or the template picker)
  kai compile <construct.json> [outDir]  one self-registering .js
`;

/** H-3, decide loudly: `home.recentConversation` renders nothing without
 *  `capabilities.conversations` to draw the card from — never fatal (the
 *  schema explicitly does NOT require conversations for `home`, see
 *  schema.ts's own doc on `home`), just a non-blocking heads-up at validate
 *  time, the same idiom `validate`'s success line already uses (io.log, not
 *  a bare console call). Extracted so it can be unit-tested without going
 *  through the CLI's stdout wiring. */
export function homeRecentConversationWarning(construct: Construct): string | null {
  if (construct.home?.recentConversation && !construct.capabilities?.conversations) {
    return 'warning: home.recentConversation is set but capabilities.conversations is not — the recent-conversation card will render nothing without it.';
  }
  return null;
}

/** Decide loudly (W-6): the work surface is slot FALLBACK, so a consumer
 *  projecting their own pane REPLACES it. That is the intended behaviour and
 *  the one thing a reader cannot infer from the construct file alone. */
export function workSurfaceProjectionNotice(construct: Construct): string | null {
  if (!construct.workSurface) return null;
  return 'note: workSurface renders as <slot name="pane"> fallback — a child with slot="pane" projected by the consumer replaces it.';
}

/** The other half, equally loud: a split with no work surface has no second
 *  column until something is projected. Silence here is what made the empty
 *  pane look like a bug rather than a choice. */
export function splitWithoutWorkSurfaceNotice(construct: Construct): string | null {
  if (construct.layout !== 'split' || construct.workSurface) return null;
  return 'note: layout "split" with no workSurface — the pane stays hidden until a child with slot="pane" is projected. Add a workSurface to render one.';
}

/** Every generation-time notice, in one order, for whichever host prints them
 *  (validate · eject · dev's first run and every regen). One list, so a new
 *  notice reaches all of them rather than the two somebody remembered. */
export function generationNotices(construct: Construct): string[] {
  return [
    accentContrastNotice(construct),
    workSurfaceProjectionNotice(construct),
    splitWithoutWorkSurfaceNotice(construct),
  ].filter((n): n is string => n !== null);
}

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

/** `kai dev` arg parse, exported for tests: `--builder` opens the visual
 *  builder (path optional — no path = the Start screen, B-23); plain dev
 *  keeps requiring a path. */
export function parseDevArgs(rest: string[]): { uiSpec: string | undefined; builder: boolean; path: string | undefined } {
  const { uiSpec, positional } = parseUiFlag(rest);
  const builder = positional.includes('--builder');
  const path = positional.filter((a) => a !== '--builder')[0];
  return { uiSpec, builder, path };
}

/**
 * Which `@kitn.ai/ui` the generated project depends on, for the three
 * subcommands that emit one. `undefined` means "leave codegen's default
 * alone" — the published `^<version>`, byte-for-byte today's behaviour.
 *
 * ONE call site per subcommand rather than a default buried in codegen: this
 * decision spawns npm and can fail, and both belong to the CLI layer, not to
 * a pure emitter. See local-kit.ts for why a checkout defaults to its own
 * build and why an install must not notice this exists — including the
 * silence on the `published` and `explicit` paths, which is what makes an
 * installed package byte-identical rather than merely equivalent.
 */
function resolveUiSpec(explicit: string | undefined, io: CliIo): { ok: true; uiSpec: string | undefined } | { ok: false } {
  const origin = classifyKit(explicit, localKitStartDir());
  switch (origin.kind) {
    case 'explicit':
      return { ok: true, uiSpec: origin.uiSpec };
    case 'published':
      return { ok: true, uiSpec: undefined };
    case 'unbuilt':
      io.error(unbuiltMessage(origin));
      return { ok: false };
    case 'checkout': {
      let packed;
      try {
        packed = packLocalKit(origin.pkgRoot);
      } catch (err) {
        io.error(
          `packing this checkout's @kitn.ai/ui failed: ${err instanceof Error ? err.message : String(err)}\n` +
            `  Pass --ui <version|tarball|path> to choose a kit explicitly.`,
        );
        return { ok: false };
      }
      io.log(localKitNotice(origin.pkgRoot, packed.tarball, packed.packed));
      return { ok: true, uiSpec: packed.tarball };
    }
  }
}

export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'validate': {
      const construct = loadConstruct(rest[0] ?? '', io);
      if (!construct) return 1;
      io.log(`valid construct: <${construct.name}> (layout: ${construct.layout}, provider: ${construct.provider.mode})`);
      const warning = homeRecentConversationWarning(construct);
      if (warning) io.log(warning);
      for (const n of generationNotices(construct)) io.log(n);
      return 0;
    }
    case 'eject': {
      const { uiSpec, positional } = parseUiFlag(rest);
      const [path, outDir] = positional;
      if (!path || !outDir) {
        io.error(USAGE);
        return 2;
      }
      const construct = loadConstruct(path, io);
      if (!construct) return 1;
      const kit = resolveUiSpec(uiSpec, io);
      if (!kit.ok) return 1;
      const overwritten = writeProject(generateProject(construct, { uiSpec: kit.uiSpec }), resolve(outDir));
      if (overwritten.length > 0) {
        io.log(`overwriting ${overwritten.length} existing file(s)`);
      }
      for (const n of generationNotices(construct)) io.log(n);
      io.log(`ejected <${construct.name}> to ${resolve(outDir)} — npm install && npm run dev. The source is yours.`);
      return 0;
    }
    case 'dev': {
      const { uiSpec, builder, path } = parseDevArgs(rest);
      // The kit is resolved per branch, always AFTER the usage check and
      // BEFORE anything is generated or served: the one line saying which kit
      // this preview runs belongs on screen at startup, a checkout with no
      // build must fail here rather than minutes later inside a preview whose
      // imports do not exist, and a bad invocation must not spawn `npm pack`
      // on its way to printing the usage it was always going to print.
      if (builder) {
        const kit = resolveUiSpec(uiSpec, io);
        if (!kit.ok) return 1;
        const { devBuilder } = await import('./dev');
        await devBuilder(path, { io, uiSpec: kit.uiSpec });
        return 0; // unreachable; devBuilder never resolves
      }
      if (!path) {
        io.error(USAGE);
        return 2;
      }
      const kit = resolveUiSpec(uiSpec, io);
      if (!kit.ok) return 1;
      const { dev } = await import('./dev');
      await dev(path, { io, uiSpec: kit.uiSpec });
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
      const kit = resolveUiSpec(uiSpec, io);
      if (!kit.ok) return 1;
      const outDir = resolve(outArg ?? 'dist-construct');
      const { workDirFor, ensureInstalled } = await import('./dev');
      const dir = workDirFor(construct.name, process.cwd());
      const files = generateProject(construct, { uiSpec: kit.uiSpec });
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
