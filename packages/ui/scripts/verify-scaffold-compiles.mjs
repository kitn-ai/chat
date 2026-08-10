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
// 6 archetypes × 9 integrations × 7 TS frameworks = 378 compiled cells, at one
// placement. `placement` is the fourth axis and is left at 'full-page' on
// purpose: it only ever changes an inline CSS string, so the extra 3x compiles
// the same types again.
//
// Three tsc PROJECTS, not one, because two frameworks cannot share a tsconfig
// with the react-jsx family without failing for harness reasons rather than real
// ones:
//   · angular — needs `experimentalDecorators` for @Component.
//   · solid   — needs `jsx: preserve` + `jsxImportSource: solid-js`; under
//               react-jsx every Solid component would be checked against React's
//               JSX namespace and the whole file would error spuriously.
// Each project gets its own copy of the anti-theatre self-test, so a green
// angular/solid run is as trustworthy as the default one.
//
// The `html` target cannot be compiled: SCAF-19 keeps it plain JS inside an
// inline `<script>`, which is invisible to `tsc` by design. It gets a structural
// pass instead (`htmlStructureCheck`) that parses the emitted script and counts
// the chat elements and submit listeners in the whole scaffold, which is what
// caught ollama emitting a second front end under the BACKEND ROUTE heading.
//
// The `angular` target is only PARTLY visible to tsc: the component's TEMPLATE
// lives in a string literal that tsc never parses (Angular's own ngtsc does).
// `angularStructureCheck` covers the part tsc cannot — CUSTOM_ELEMENTS_SCHEMA
// present, exactly one <kai-chat>, arrays bound as `[prop]` PROPERTIES and not
// attributes, the kai-submit listener — and the template's real proof is
// `ng build` in a throwaway app.
//
// NEITHER pass compiles block (2). `frontEnd()` slices the emitted text at
// `=== (2) BACKEND ROUTE ===` and keeps only what is above it, so a green run
// says nothing at all about whether a route runs. Routes are proven by running
// them.
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
const FRAMEWORKS = ['react', 'next', 'tanstack-start', 'vue', 'svelte', 'angular', 'solid'];
const EXT = {
  react: 'tsx', next: 'tsx', 'tanstack-start': 'tsx', vue: 'ts', svelte: 'ts',
  angular: 'ts', solid: 'tsx',
};
/** Which tsc project each framework compiles under — see the header. */
const PROJECT = {
  react: 'default', next: 'default', 'tanstack-start': 'default', vue: 'default', svelte: 'default',
  angular: 'angular', solid: 'solid',
};

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
// `solid-js` is what the solid scaffold's own JSX is checked against, and
// `@angular/core` is what the angular one's decorator + signals resolve to —
// both are as load-bearing here as react's types are for the JSX family.
mkdirSync(join(nm, '@angular'), { recursive: true });
for (const pkg of [
  'react', 'react-dom', 'vue', 'svelte', '@types/react', '@types/react-dom',
  'solid-js', '@angular/core',
]) {
  const src = pkgDir(pkg);
  if (!src) {
    cleanup();
    fail(`'${pkg}' is not installed. Run \`pnpm install\` at the repo root.`);
  }
  symlinkSync(src, join(nm, pkg), 'dir');
}
// @angular/core's own typings reference rxjs. skipLibCheck means a miss is not
// fatal, so this one is best-effort rather than a hard requirement.
const rxjs = pkgDir('rxjs');
if (rxjs) symlinkSync(rxjs, join(nm, 'rxjs'), 'dir');

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

/** Options every project shares: what `npm create vite` turns on, which is what
 *  a consumer builds with. */
const BASE_OPTIONS = {
  target: 'ES2022',
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  module: 'ESNext',
  moduleResolution: 'bundler',
  strict: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  forceConsistentCasingInFileNames: true,
};

/**
 * The three tsc projects. `default` stays at the temp root (so the existing
 * shims.d.ts and its non-recursive `include` keep working); the other two are
 * subdirectories, which Node/TS resolve node_modules for by walking up.
 *
 * The per-project options are not stylistic — they mirror what each framework's
 * own generated tsconfig sets, and getting them wrong turns a healthy scaffold
 * into a wall of harness noise:
 *   · angular: `experimentalDecorators` (see the tsconfig `ng new` writes).
 *   · solid:   `jsx: preserve` + `jsxImportSource: solid-js` (see the tsconfig
 *              in examples/starters/solid).
 */
const PROJECTS = {
  default: { dir: tmp, options: { jsx: 'react-jsx' } },
  angular: {
    dir: join(tmp, 'angular'),
    // Copied from the tsconfig.json `ng new` actually writes, not invented. Every
    // one of these is stricter than the react/vue baseline, and the first version
    // of this harness without them shipped an emitted `input.query` that `ng
    // build` rejected with TS4111 while this gate stayed green.
    options: {
      experimentalDecorators: true,
      noImplicitOverride: true,
      noPropertyAccessFromIndexSignature: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      isolatedModules: true,
    },
  },
  solid: { dir: join(tmp, 'solid'), options: { jsx: 'preserve', jsxImportSource: 'solid-js' } },
};

for (const [name, project] of Object.entries(PROJECTS)) {
  if (name !== 'default') mkdirSync(project.dir, { recursive: true });
  writeFileSync(
    join(project.dir, 'tsconfig.json'),
    JSON.stringify(
      { compilerOptions: { ...BASE_OPTIONS, ...project.options }, include: ['*.ts', '*.tsx'] },
      null,
      2,
    ),
  );
}

const tsDir = pkgDir('typescript');
if (!tsDir) fail('typescript is not installed. Run `pnpm install` at the repo root.');
const TSC = join(tsDir, 'bin/tsc');

/** Run tsc over one project; return raw diagnostics text ('' when clean). */
function runTsc(project = 'default') {
  try {
    execFileSync(process.execPath, [TSC, '--project', join(PROJECTS[project].dir, 'tsconfig.json')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return '';
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

/** Delete every generated source file in a project, keeping tsconfig/shims. */
function clearSources(project = 'default') {
  for (const f of readdirSync(PROJECTS[project].dir)) {
    if (/\.tsx?$/.test(f) && f !== 'shims.d.ts') rmSync(join(PROJECTS[project].dir, f), { force: true });
  }
}

// ── 2. Anti-theatre self-test: these MUST fail to compile ───────────────────
// Run for EVERY project. A green angular/solid matrix under a tsconfig whose
// types silently resolved to `any` would be exactly the kind of check that
// proves nothing, and the two new projects are the ones most likely to be
// misconfigured (a wrong `jsx`, a missing symlink).
function selfTest(project = 'default') {
  const dir = PROJECTS[project].dir;
  writeFileSync(
    join(dir, 'probe-wrong-type.ts'),
    `import { toOpenAIMessages } from '@kitn.ai/ui/wire';\nexport const bad: number = toOpenAIMessages([]);\n`,
  );
  writeFileSync(
    join(dir, 'probe-unused-import.ts'),
    `import { applyToolOutput } from '@kitn.ai/ui/wire';\nexport const ok = 1;\n`,
  );
  const out = runTsc(project);
  const wrongType = /probe-wrong-type\.ts.*error TS2322/s.test(out);
  const unused = /probe-unused-import\.ts.*error TS6133/s.test(out);
  clearSources(project);
  if (!wrongType)
    fail(
      `self-test [${project}]: assigning OpenAIWireMessage[] to \`number\` did NOT error.\n` +
        '  `@kitn.ai/ui/wire` is resolving to `any` (or not at all), so a green matrix would be meaningless.\n' +
        `  tsc said:\n${out || '  (nothing)'}`,
    );
  if (!unused)
    fail(
      `self-test [${project}]: an unused import did NOT error.\n` +
        '  noUnusedLocals is not in effect, which is the single most valuable check here.\n' +
        `  tsc said:\n${out || '  (nothing)'}`,
    );
  console.log(`  ✓ self-test [${project}]: types resolve for real (TS2322) and noUnusedLocals is live (TS6133)`);
}

/**
 * The angular template, which tsc cannot see.
 *
 * The component's markup is a string literal — Angular's own compiler parses it,
 * `tsc` does not — so the matrix above type-checks the class and nothing else.
 * These are the template facts that break an app the moment they are wrong, and
 * each one is a build error or a silent no-op in a real Angular app:
 *
 *   1. `schemas: [CUSTOM_ELEMENTS_SCHEMA]` — without it every <kai-*> tag fails
 *      the template compiler with "is not a known element".
 *   2. exactly one <kai-chat> and one kai-submit binding, per htmlStructureCheck's
 *      reasoning.
 *   3. arrays/objects bound as PROPERTIES (`[messages]=`), never as attributes
 *      (`messages=`) — an attribute binding stringifies the array to
 *      "[object Object]" and the thread silently renders nothing.
 */
async function angularStructureCheck(scaffold) {
  const failures = [];
  let checked = 0;
  for (const useCase of ARCHETYPES) {
    for (const integration of INTEGRATIONS) {
      const label = `${useCase}__${integration}__angular`;
      if (FILTER && !label.includes(FILTER)) continue;
      checked++;
      const out = await scaffold.handler({ useCase, integration, placement: 'full-page', framework: 'angular' });
      // Drop whole-line `//` comments first. The emitted prose talks ABOUT
      // <kai-chat> and about property bindings, and counting those as markup
      // makes every assertion below meaningless.
      const front = frontEnd(out.content[0].text).replace(/^[ \t]*\/\/.*$/gm, '');

      if (!front.includes('schemas: [CUSTOM_ELEMENTS_SCHEMA]'))
        failures.push(`${label}: no CUSTOM_ELEMENTS_SCHEMA — every <kai-*> tag would fail the template compiler`);
      const chats = (front.match(/<kai-chat\b/g) ?? []).length;
      if (chats !== 1) failures.push(`${label}: ${chats} <kai-chat> tags, expected 1`);
      const submits = (front.match(/\(kai-submit\)=/g) ?? []).length;
      if (submits !== 1) failures.push(`${label}: ${submits} (kai-submit) bindings, expected 1`);
      for (const prop of ['messages', 'suggestions']) {
        if (!front.includes(`[${prop}]=`))
          failures.push(`${label}: ${prop} is not bound as a DOM property ([${prop}]=…)`);
        if (new RegExp(`(?:^|\\s)${prop}="`, 'm').test(front))
          failures.push(`${label}: ${prop} bound as an ATTRIBUTE — an array stringifies to "[object Object]"`);
      }
    }
  }
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    cleanup();
    fail(`${failures.length} angular template problem(s).`);
  }
  console.log(
    `  ✓ ${checked} angular scaffolds: CUSTOM_ELEMENTS_SCHEMA, one chat element + submit binding, arrays bound as properties`,
  );
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

  for (const project of Object.keys(PROJECTS)) selfTest(project);
  await htmlStructureCheck(scaffold, esbuild);
  await angularStructureCheck(scaffold);

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
    writeFileSync(join(PROJECTS[PROJECT[c.framework]].dir, `${c.label}.${EXT[c.framework]}`), code);
  }
  if (skipped.length) fail(`no <script> block found in: ${skipped.join(', ')}`);

  // One tsc pass per project. Their diagnostics are merged: every file name is
  // the case label, so the report reads the same as it did with one project.
  const usedProjects = [...new Set(cases.map((c) => PROJECT[c.framework]))];
  console.log(
    `  · running tsc --strict --noUnusedLocals --noUnusedParameters (${usedProjects.length} project(s): ${usedProjects.join(', ')})`,
  );
  const diagnostics = usedProjects.map((p) => runTsc(p)).join('\n');

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
