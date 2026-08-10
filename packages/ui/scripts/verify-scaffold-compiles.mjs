// Compile the `kai` MCP scaffolder's EMITTED code with real `tsc --strict`.
//
// WHY IT EXISTS
// -------------
// Every line the scaffolder emits lives inside a string literal, so no gate in
// this repo compiles it. `scaffold.test.ts` asserts over those strings, which
// catches wording but cannot catch a type error, a missing required prop, or an
// unused import. Those are exactly what a consumer hits: `npm create vite` turns
// on `noUnusedLocals`, so a single unreferenced name in an emitted import block
// fails `npm run build` in a stock app on the first try.
//
// This script generates the real scaffold output, writes it to disk as real
// files, resolves `@kitn.ai/ui` through the package's REAL exports map and
// shipped `.d.ts`, and runs `tsc` over the lot. Defects it has already caught:
//
//   · `applyToolOutput` named in a live import while only the COMMENTED-OUT tool
//     loop referenced it            → TS6133, breaks `npm run build`
//   · `sourcesEl.sources` on a bare `HTMLElement` in the svelte template
//                                   → TS2339
//   · `<Artifact src=… />` missing its required `files` prop
//                                   → TS2741
//
// HOW IT STAYS HONEST
// -------------------
// A green run proves nothing if the types resolved to `any`. Before the real
// matrix, `selfTest()` compiles two files that MUST fail (a wrong-type
// assignment and an unused import). If either one passes, the harness is broken
// rather than the scaffolder, and this script exits non-zero saying so.
//
// SCOPE
// -----
// 6 archetypes × 9 integrations × 5 TS frameworks = 270 compiled cells, at one
// placement. `placement` is the fourth axis and is left at 'full-page' on
// purpose: it only ever changes an inline CSS string, so the extra 3x compiles
// the same types again.
//
// The `html` target cannot be compiled: SCAF-19 keeps it plain JS inside an
// inline `<script>`, which is invisible to `tsc` by design. It gets a structural
// pass instead (`htmlStructureCheck`) that parses the emitted script and counts
// the chat elements and submit listeners in the whole scaffold, which is what
// caught ollama emitting a second front end under the BACKEND ROUTE heading.
//
// `.vue` / `.svelte` are not TS files, so their `<script>` blocks are lifted
// verbatim into `.ts`. Lifting separates the script from its template, which
// makes every template-visible top-level binding look unused, so a `void [...]`
// footer names the column-zero DECLARATIONS the template would have read.
// Imports are deliberately excluded from that footer: an unused import is the
// defect class under test.
//
// COST AND WHERE IT RUNS
// ----------------------
// ~2s wall clock for all 270 cases (esbuild bundle + one `tsc` pass with
// skipLibCheck over symlinked node_modules). No network. That is cheap enough
// for the REQUIRED CI job, and it runs there, in `.github/workflows/test.yml`
// after the build (it reads the SHIPPED dist/*.d.ts). It is deliberately NOT in
// `npm test`: it needs `dist/`, and vitest does not build.
//
//   npm run verify:scaffold                  # from packages/ui
//   node scripts/verify-scaffold-compiles.mjs [--keep] [--filter <substring>]
//
// `--keep` leaves the temp directory in place and prints its path.
// `--filter agentic` narrows the matrix while iterating.
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// Resolve tooling through Node's resolver rather than a hard-coded
// node_modules path: pnpm's layout differs between a workspace root, a
// worktree, and CI, and a wrong guess here fails as a wall of TS2307 that reads
// like a scaffolder defect.
const require = createRequire(import.meta.url);
/** Directory a package was installed into, resolved from this script. */
const pkgDir = (name) => {
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    try {
      // Packages without a `./package.json` export (older typings packages).
      return dirname(require.resolve(name));
    } catch {
      return null;
    }
  }
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEEP = process.argv.includes('--keep');
const filterIdx = process.argv.indexOf('--filter');
const FILTER = filterIdx > -1 ? process.argv[filterIdx + 1] : null;

const ARCHETYPES = ['drop-in-chat', 'support-widget', 'knowledge-base', 'agentic', 'workspace', 'voice'];
/**
 * EVERY integration, not a representative pair.
 *
 * The integration axis is the one that changes emitted CODE: `requestBody`
 * decides whether a `model` const and a `tools` array are declared and
 * referenced, and each of those is an unused-local away from failing a stock
 * `npm run build`. It was ['openrouter', 'mock'] and covered neither the
 * declare-nothing path nor eight of the nine catalog entries.
 *
 * The other axis, `placement`, is deliberately left at one value: it only ever
 * changes an inline CSS string, so the extra 3x buys no type coverage.
 */
const INTEGRATIONS = [
  'openrouter',
  'vercel-ai-sdk',
  'langgraph',
  'cloudflare',
  'ollama',
  'mastra',
  'pi',
  'pydantic-ai',
  'mock',
];
/** TS-visible frameworks only. `html` is plain JS by design (SCAF-19), and is
 *  covered structurally instead: see `htmlStructureCheck`. */
const FRAMEWORKS = ['react', 'next', 'tanstack-start', 'vue', 'svelte'];
const EXT = { react: 'tsx', next: 'tsx', 'tanstack-start': 'tsx', vue: 'ts', svelte: 'ts' };

const fail = (msg) => {
  console.error(`\n✗ verify-scaffold-compiles: ${msg}\n`);
  process.exit(1);
};

if (!existsSync(resolve(ROOT, 'dist/wire/index.d.ts'))) {
  fail('dist/wire/index.d.ts not found. Run `nx build ui` first: this checks the SHIPPED types.');
}

const tmp = mkdtempSync(join(tmpdir(), 'kai-scaffold-tsc-'));
const cleanup = () => {
  if (KEEP) console.log(`\n  (--keep) harness left at ${tmp}`);
  else rmSync(tmp, { recursive: true, force: true });
};

// ── 1. node_modules: the REAL package, resolved through its own exports map ──
const nm = join(tmp, 'node_modules');
mkdirSync(join(nm, '@kitn.ai'), { recursive: true });
mkdirSync(join(nm, '@types'), { recursive: true });
symlinkSync(ROOT, join(nm, '@kitn.ai/ui'), 'dir');
// Every one of these is REQUIRED. A missing package would surface as TS2307 on
// dozens of files and read like a scaffolder defect, so fail loudly instead.
for (const pkg of ['react', 'react-dom', 'vue', 'svelte', '@types/react', '@types/react-dom']) {
  const src = pkgDir(pkg);
  if (!src) {
    cleanup();
    fail(`'${pkg}' is not installed. Run \`pnpm install\` at the repo root.`);
  }
  symlinkSync(src, join(nm, pkg), 'dir');
}

// Only the packages a scaffold imports that this repo does not install.
writeFileSync(
  join(tmp, 'shims.d.ts'),
  `// Third-party packages this repo does not install. These stand in ONLY so the
// import resolves; they mirror the real signatures closely enough that a genuine
// misuse in the emitted code still errors. Keep them permissive where the real
// package is permissive, and no looser: a shim that swallows a real defect makes
// this whole harness theatre.
declare module 'next/dynamic' {
  import type { ComponentType } from 'react';
  export default function dynamic<P = Record<string, unknown>>(
    loader: () => Promise<ComponentType<P> | { default: ComponentType<P> }>,
    options?: { ssr?: boolean; loading?: ComponentType },
  ): ComponentType<P>;
}
declare module '@tanstack/react-router' {
  import type { ComponentType } from 'react';
  // The real options object carries loaders, validators, ssr, etc. Only
  // \`component\` matters here, so the rest stays open.
  type RouteOptions = { component: ComponentType } & Record<string, unknown>;
  export function createFileRoute(path: string): (options: RouteOptions) => unknown;
  export function createLazyFileRoute(path: string): (options: RouteOptions) => unknown;
}
declare module '*.css';
`,
);

writeFileSync(
  join(tmp, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        // What `npm create vite` turns on, which is what a consumer builds with.
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ['*.ts', '*.tsx'],
    },
    null,
    2,
  ),
);

const tsDir = pkgDir('typescript');
if (!tsDir) fail('typescript is not installed. Run `pnpm install` at the repo root.');
const TSC = join(tsDir, 'bin/tsc');

/** Run tsc over the temp project; return raw diagnostics text ('' when clean). */
function runTsc() {
  try {
    execFileSync(process.execPath, [TSC, '--project', join(tmp, 'tsconfig.json')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return '';
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

/** Delete every generated source file, keeping node_modules/tsconfig/shims. */
function clearSources() {
  for (const f of readdirSync(tmp)) {
    if (/\.tsx?$/.test(f) && f !== 'shims.d.ts') rmSync(join(tmp, f), { force: true });
  }
}

// ── 2. Anti-theatre self-test: these MUST fail to compile ───────────────────
function selfTest() {
  writeFileSync(
    join(tmp, 'probe-wrong-type.ts'),
    `import { toOpenAIMessages } from '@kitn.ai/ui/wire';\nexport const bad: number = toOpenAIMessages([]);\n`,
  );
  writeFileSync(
    join(tmp, 'probe-unused-import.ts'),
    `import { applyToolOutput } from '@kitn.ai/ui/wire';\nexport const ok = 1;\n`,
  );
  const out = runTsc();
  const wrongType = /probe-wrong-type\.ts.*error TS2322/s.test(out);
  const unused = /probe-unused-import\.ts.*error TS6133/s.test(out);
  clearSources();
  if (!wrongType)
    fail(
      'self-test: assigning OpenAIWireMessage[] to `number` did NOT error.\n' +
        '  `@kitn.ai/ui/wire` is resolving to `any` (or not at all), so a green matrix would be meaningless.\n' +
        `  tsc said:\n${out || '  (nothing)'}`,
    );
  if (!unused)
    fail(
      'self-test: an unused import did NOT error.\n' +
        '  noUnusedLocals is not in effect, which is the single most valuable check here.\n' +
        `  tsc said:\n${out || '  (nothing)'}`,
    );
  console.log('  ✓ self-test: types resolve for real (TS2322) and noUnusedLocals is live (TS6133)');
}

// ── 3. Emit the matrix ──────────────────────────────────────────────────────
/** Block 1 only: the scaffolder's own front-end code. */
function frontEnd(text) {
  const body = text.split('=== (2) BACKEND ROUTE ===')[0];
  const start = body.indexOf('=== (1) FRONT-END');
  const block = start < 0 ? body : body.slice(start);
  // drop the `=== (1) FRONT-END (...) ===` marker line itself
  return block.replace(/^=== \(1\) FRONT-END[^\n]*===\n/, '');
}

/**
 * Lift a `<script>` block out of a .vue/.svelte single-file component into
 * plain TS. See the header: the `void [...]` footer stands in for the template.
 */
function liftScript(block) {
  const m = block.match(/<script[^>]*>\n?([\s\S]*?)\n?<\/script>/);
  if (!m) return null;
  const lines = m[1].split('\n');
  // Dedent by the smallest indent on a non-blank line (svelte indents by 2).
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const pad = indents.length ? Math.min(...indents) : 0;
  const body = lines.map((l) => l.slice(pad)).join('\n');
  // Column-zero declarations only, and NEVER imports.
  const names = new Set();
  for (const line of body.split('\n')) {
    const d = line.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
    if (d) names.add(d[1]);
    const f = line.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
    if (f) names.add(f[1]);
  }
  const footer = names.size
    ? `\n// harness: the template would read these; see verify-scaffold-compiles.mjs\nvoid [${[...names].join(', ')}];\n`
    : '';
  return `${body}\n${footer}`;
}

/**
 * The `html` target, which tsc cannot see.
 *
 * SCAF-19 keeps it plain JS inside an inline `<script type="module">`, so there
 * is no file for the matrix above to compile. Two things are still checkable
 * cheaply, and one of them shipped broken: ollama carried a `routeTemplates.html`
 * entry, so `framework: 'html'` printed a SECOND `<kai-chat id="chat">` with its
 * own kai-submit listener under the BACKEND ROUTE heading. Pasting both blocks
 * gave a duplicate element id and two fetches per submit, and nothing in this
 * repo parsed or compiled that output.
 *
 *   1. the whole scaffold declares exactly one chat element and one submit
 *      listener;
 *   2. the emitted `<script>` body actually PARSES as an ES module.
 */
async function htmlStructureCheck(scaffold, esbuild) {
  const failures = [];
  let checked = 0;
  for (const useCase of ARCHETYPES) {
    for (const integration of INTEGRATIONS) {
      const label = `${useCase}__${integration}__html`;
      if (FILTER && !label.includes(FILTER)) continue;
      checked++;
      const out = await scaffold.handler({ useCase, integration, placement: 'full-page', framework: 'html' });
      const text = out.content[0].text;

      const chats = (text.match(/<kai-chat id="chat"/g) ?? []).length;
      if (chats !== 1) failures.push(`${label}: ${chats} <kai-chat id="chat"> elements, expected 1`);
      const submits = (text.match(/addEventListener\('kai-submit'/g) ?? []).length;
      if (submits !== 1) failures.push(`${label}: ${submits} kai-submit listeners, expected 1`);

      const script = text.match(/<script type="module">\n([\s\S]*?)\n\s*<\/script>/);
      if (!script) {
        failures.push(`${label}: no <script type="module"> block`);
        continue;
      }
      try {
        await esbuild.transform(script[1], { loader: 'js', format: 'esm' });
      } catch (e) {
        failures.push(`${label}: the emitted script does not parse: ${e.message.split('\n')[0]}`);
      }
    }
  }
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    cleanup();
    fail(`${failures.length} html scaffold problem(s).`);
  }
  console.log(`  ✓ ${checked} html scaffolds: one chat element, one submit listener, script parses`);
}

async function main() {
  console.log('  · bundling the scaffolder with esbuild');
  const bundle = join(tmp, 'scaffold.bundle.mjs');
  // The JS API, not the .bin shim: pnpm does not always link binaries where a
  // hard-coded path expects them.
  const esbuild = await import('esbuild');
  await esbuild.build({
    entryPoints: [resolve(ROOT, 'src/agent-tooling/mcp/tools/scaffold.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'error',
  });
  const { scaffold } = await import(pathToFileURL(bundle).href);

  selfTest();
  await htmlStructureCheck(scaffold, esbuild);

  const cases = [];
  for (const useCase of ARCHETYPES)
    for (const integration of INTEGRATIONS)
      for (const framework of FRAMEWORKS) {
        const label = `${useCase}__${integration}__${framework}`;
        if (FILTER && !label.includes(FILTER)) continue;
        cases.push({ useCase, integration, framework, label });
      }

  console.log(`  · generating ${cases.length} scaffolds`);
  const skipped = [];
  for (const c of cases) {
    const out = await scaffold.handler({
      useCase: c.useCase,
      integration: c.integration,
      placement: 'full-page',
      framework: c.framework,
    });
    const block = frontEnd(out.content[0].text);
    const code = c.framework === 'vue' || c.framework === 'svelte' ? liftScript(block) : block;
    if (code === null) {
      skipped.push(c.label);
      continue;
    }
    writeFileSync(join(tmp, `${c.label}.${EXT[c.framework]}`), code);
  }
  if (skipped.length) fail(`no <script> block found in: ${skipped.join(', ')}`);

  console.log(`  · running tsc --strict --noUnusedLocals --noUnusedParameters`);
  const diagnostics = runTsc();

  // ── 4. Report ─────────────────────────────────────────────────────────────
  const byFile = new Map();
  for (const line of diagnostics.split('\n')) {
    const m = line.match(/^([^(]+\.tsx?)\((\d+),(\d+)\): (error .+)$/);
    if (!m) continue;
    // tsc reports paths relative to cwd, which is a wall of `../`. The basename
    // is the case label and is all anyone needs.
    const file = m[1].split('/').pop();
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(`      line ${m[2]}:${m[3]}  ${m[4]}`);
  }

  const failedLabels = [...byFile.keys()].map((f) => f.replace(/\.tsx?$/, ''));
  const passed = cases.filter((c) => !failedLabels.includes(c.label));

  console.log(`\n  ${passed.length}/${cases.length} scaffolds compile clean\n`);
  if (byFile.size) {
    for (const [file, errs] of [...byFile.entries()].sort()) {
      console.log(`  ✗ ${file}`);
      errs.forEach((e) => console.log(e));
    }
    cleanup();
    fail(`${byFile.size} scaffold(s) do not compile. Each one is code a consumer would be handed.`);
  }

  console.log('  ✓ every emitted scaffold compiles under a stock consumer tsconfig');
  cleanup();
}

main().catch((e) => {
  cleanup();
  fail(e?.stack ?? String(e));
});
