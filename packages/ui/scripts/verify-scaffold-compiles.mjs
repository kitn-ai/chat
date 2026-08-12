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
// matrix, `selfTest()` compiles probes that MUST fail: a wrong-type assignment
// and an unused import in every project, plus a host-typings probe in each route
// project. If any of them compiles, the harness is broken rather than the
// scaffolder, and this script exits non-zero saying so.
//
// SCOPE
// -----
// FRONT END: 6 archetypes × 9 integrations × 8 TS frameworks = 432 compiled
// cells, at one placement. `placement` is the fourth axis and is left at
// 'full-page' on purpose: it only ever changes an inline CSS string, so the
// extra 3x compiles the same types again.
//
// ROUTES: 9 integrations × 11 frameworks = 99 cells, of which 77 reach tsc: the
// 11 `mock` cells carry no backend by design (it streams in the browser) and the
// 11 `pydantic-ai` cells are Python, so they go to `pythonCheck` instead. The
// framework axis is WIDER here than the front end's eight because `express`,
// `worker` and `fastapi` are backend-only targets a consumer can ask for
// directly. `html` and `fastapi` cannot host a route of their own but still emit
// one to run elsewhere, which is why they are in the matrix rather than skipped.
// The archetype axis is absent because `chooseRoute` never reads the archetype;
// `assertRoutesAreArchetypeIndependent` proves that rather than assuming it, so
// the day a route starts varying by archetype this stops silently checking one
// sixth of the matrix.
//
// The FRONT END compiles under three tsc PROJECTS, not one, because two
// frameworks cannot share a tsconfig with the react-jsx family without failing
// for harness reasons rather than real ones:
//   · angular — needs `experimentalDecorators` for @Component.
//   · solid   — needs `jsx: preserve` + `jsxImportSource: solid-js`; under
//               react-jsx every Solid component would be checked against React's
//               JSX namespace and the whole file would error spuriously.
// Each project gets its own copy of the anti-theatre self-test, so a green
// angular/solid run is as trustworthy as the default one.
//
// The `html` target IS compiled now, and that is a change worth stating: it used
// to be excluded because SCAF-19 kept its logic as plain JS in an inline
// `<script>`. That exclusion mirrored the consumer's own blind spot — a stock
// `vanilla-ts` app builds with `tsc && vite build` and scopes its tsconfig to
// `"include": ["src"]`, so an inline script is type-checked by nothing, and a
// call to a function that does not exist still left `npm run build` exiting 0.
// The scaffolder emits `src/main.ts` instead, so those 54 cells join the matrix.
// `htmlStructureCheck` keeps only what tsc cannot judge: one chat element and one
// submit listener in the whole scaffold (which caught ollama emitting a second
// front end under the BACKEND ROUTE heading), and that index.html LOADS the
// module rather than carrying the logic inline again.
//
// The `angular` target is only PARTLY visible to tsc: the component's TEMPLATE
// lives in a string literal that tsc never parses (Angular's own ngtsc does).
// `angularStructureCheck` covers the part tsc cannot — CUSTOM_ELEMENTS_SCHEMA
// present, exactly one <kai-chat>, arrays bound as `[prop]` PROPERTIES and not
// attributes, the kai-submit listener — and the template's real proof is
// `ng build` in a throwaway app.
//
// The `solid` target is fully visible to tsc and still has a hole tsc cannot
// reach: it is the only framework that does NOT render through <kai-chat>, so it
// composes the MessagePart switch itself, and a `<Switch>` missing a `<Match>`
// compiles perfectly while that part renders nothing at runtime.
// `solidPartCoverageCheck` asserts a branch per variant, with the variant list
// derived from the union rather than restated. See its own comment for how that
// shipped broken.
//
// BLOCK (2), THE BACKEND ROUTE, IS COMPILED TOO — see `routeCheck` below.
//
// It was not, for most of this file's life: `frontEnd()` sliced the emitted text
// at `=== (2) BACKEND ROUTE ===` and threw away everything under it, so the
// server half of every scaffold — auth, status forwarding, the provider call,
// SSE framing — had never been type-checked by any gate in this repo. That is
// how a Next-only route reached five frameworks, how `pi` shipped a template
// referencing variables it never declares, and how the dropped-status bug
// survived. The first run of `routeCheck` found TS2339 on
// `await request.json()` in all seven TypeScript integrations.
//
// Routes need typings the front end does not, and they are REAL packages
// (@sveltejs/kit, @tanstack/react-start, express, @cloudflare/workers-types,
// @angular/ssr, ai, @langchain/*, @mastra/client-js), added as devDependencies.
// They are deliberately NOT stubbed: a hand-written `declare module` would
// resolve every call to `any` and recreate the blind spot with extra steps,
// letting a wrong route pass. The one thing that IS hand-written is each
// framework's GENERATED file — SvelteKit's `./$types`, wrangler's `Env` — which
// is reproduced exactly as the framework's own codegen writes it and typed
// entirely through the real package.
//
// Routes compile under THREE projects, because the host decides the types and
// the host is what block (2) gets wrong:
//   · route-node   — express, Angular SSR, and the Vite dev-server middleware.
//                    `lib: ES2023` + `types: ["node"]` + `module: nodenext`, NO
//                    DOM: this is a stock `npm create vite` tsconfig.node.json,
//                    and it is what makes `await request.json()` `unknown`
//                    (undici) instead of `any`. It is also the ONLY project here
//                    that resolves the kit under node16/nodenext, which is the
//                    one mode where a missing extension in our shipped .d.ts
//                    degrades the whole public API to `any` — see its entry in
//                    PROJECTS.
//   · route-web    — Next, SvelteKit, TanStack Start. DOM lib present, which is
//                    what those frameworks' own tsconfigs ship.
//   · route-worker — Cloudflare. `@cloudflare/workers-types` + node, matching the
//                    nodejs_compat setup the emitted route itself tells you to use.
// A route is assigned to a project by the runtime the SCAFFOLDER declares for it
// ("# Runtime: …"), not by the requested framework, so a fallback route is
// checked against the host it will really run on. An unrecognised runtime label
// is a hard failure rather than a skip — otherwise a new host would silently
// stop being compiled, which is the bug this whole section exists to prevent.
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
// ~16s wall clock for the front-end cells plus the routes: one esbuild bundle,
// then a `tsc` pass per project for the self-test and a second per project for
// the matrix, all with skipLibCheck over symlinked node_modules.
// Routes are most of the added time, and about a third of it is the
// archetype-independence re-check (495 extra generations, no compiles).
//
// NO NETWORK, which is the property that keeps this in the REQUIRED CI job. The
// route typings are devDependencies rather than a throwaway `npm install`
// precisely for that: the required job already runs `pnpm install
// --frozen-lockfile` behind a pnpm cache, so the packages are amortised to
// nothing, whereas an uncached install inside a blocking check is a flake
// waiting to happen (measuring this, `npm install ai` failed outright with
// ETARGET on a transitive @ai-sdk/provider pin).
//
// If routes ever push this past ~60s, do NOT quietly narrow the matrix: subset
// it deterministically and PRINT the subset, so a shrinking gate is visible in
// the log instead of being discovered later.
//
// It runs in `.github/workflows/test.yml` after the build (it reads the SHIPPED
// dist/*.d.ts). It is deliberately NOT in `npm test`: it needs `dist/`, and
// vitest does not build.
//
//   npm run verify:scaffold                  # from packages/ui
//   node scripts/verify-scaffold-compiles.mjs [--keep] [--filter <substring>]
//
// `--keep` leaves the temp directory in place and prints its path.
// `--filter agentic` narrows the matrix while iterating.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, existsSync, readdirSync } from 'node:fs';
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
 * The integration axis is the one that changes emitted CODE. Each catalog
 * entry's `forwardsFromClient` drives `defaultModelFor` and `emitsToolSchemas`,
 * and `realBodyPayload` (all three in `mcp/tools/scaffold.ts`) puts `model` and
 * `tools` in the POST body only when the emitted code declares them. Each of
 * those consts is an unused-local away from failing a stock `npm run build`.
 *
 * Listing every entry is what reaches every shape `forwardsFromClient` produces:
 * an integration forwarding both consts, one forwarding tools alone, the ones
 * forwarding neither because their route picks the model and builds the tools
 * server-side, and `mock`, which takes the `isMock` branch and declares nothing
 * because it has no backend to POST to. The earlier ['openrouter', 'mock'] pair
 * reached the forwards-both shape and the mock branch, and no others.
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
/**
 * TS-visible frameworks. `html` is one of them now.
 *
 * It used to be excluded because SCAF-19 kept its logic inline in index.html as
 * plain JS. That is exactly what made it invisible to the CONSUMER's build too,
 * so the scaffolder emits `src/main.ts` instead and this matrix compiles it like
 * any other cell — `htmlStructureCheck` keeps only the checks tsc cannot make.
 */
const FRAMEWORKS = ['react', 'next', 'tanstack-start', 'vue', 'svelte', 'angular', 'solid', 'html'];
const EXT = {
  react: 'tsx', next: 'tsx', 'tanstack-start': 'tsx', vue: 'ts', svelte: 'ts',
  angular: 'ts', solid: 'tsx', html: 'ts',
};
/** Which tsc project each framework compiles under — see the header. */
const PROJECT = {
  react: 'default', next: 'default', 'tanstack-start': 'default', vue: 'default', svelte: 'default',
  angular: 'angular', solid: 'solid', html: 'default',
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
for (const scope of ['@angular', '@sveltejs', '@tanstack', '@cloudflare', '@langchain', '@mastra']) {
  mkdirSync(join(nm, scope), { recursive: true });
}
for (const pkg of [
  // ── front end (block 1) ──
  'react', 'react-dom', 'vue', 'svelte', '@types/react', '@types/react-dom',
  'solid-js', '@angular/core',
  // ── backend routes (block 2) ──
  // The HOSTS. These decide the shape a route has to have, and getting one wrong
  // is the defect class block (2) keeps shipping, so they are the real packages
  // rather than a `declare module`. @types/node is load-bearing twice over: it is
  // what makes route-node's `Request` undici's instead of the browser's.
  '@types/node', '@types/express', 'express', '@sveltejs/kit',
  '@tanstack/react-router', '@tanstack/react-start', '@cloudflare/workers-types',
  // Not imported by any route, but `routeTree.gen.ts` augments it by name, and a
  // `declare module` only resolves against THIS node_modules tree.
  '@tanstack/router-core',
  '@angular/ssr', 'vite',
  // The SDKs an integration's handler calls. Also real: a stub would make
  // `streamText(...)` / `createReactAgent(...)` accept anything, so a scaffold
  // that calls them wrongly would compile here and fail in the consumer's app.
  'ai', '@langchain/core', '@langchain/openai', '@langchain/langgraph',
  '@mastra/client-js', 'zod',
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

  /**
   * The three ROUTE projects. Block (2) runs on a server, and which server
   * decides the global types — which is exactly the axis block (2) kept getting
   * wrong, so each host gets the tsconfig it really ships with.
   *
   * `types` is set EXPLICITLY on all three. With the field absent, tsc pulls in
   * every package under node_modules/@types, so a Worker route would silently be
   * checked with Node's globals and a Vite middleware with the browser's. That
   * default is what would quietly hand `request.json()` back as `any`.
   *
   * Routes live one directory per case (`<project>/<label>/…`) because a route is
   * a multi-FILE document — the Vite adapter emits src/server/chat.ts AND
   * vite-chat-api.ts, and the second imports the first. `moduleDetection: force`
   * keeps a file that happens to have no import/export from leaking into the
   * global scope and colliding with the other 98 cases.
   */
  'route-node': {
    dir: join(tmp, 'route-node'),
    include: ['**/*.ts', '**/*.d.ts'],
    // A stock `npm create vite` tsconfig.node.json: ES lib, node types, NO DOM,
    // and `module: nodenext`. The missing DOM lib is what makes `Request` resolve
    // to undici's (json(): Promise<unknown>) rather than the browser's
    // (json(): Promise<any>), and therefore what a consumer's `tsc -b` really sees
    // for vite.config.ts → vite-chat-api.ts → server/chat.ts.
    //
    // nodenext is the OTHER half of that fidelity, and it is the only project here
    // that runs in it. It was deliberately absent until 0.19.x: the kit's shipped
    // .d.ts files re-exported './read', './encode', … with no file extension, which
    // `bundler` tolerates and node16/nodenext rejects — and with skipLibCheck on
    // (every Vite template) the rejection is SUPPRESSED and the whole public API
    // silently becomes `any`. Measured on 0.19.0, same file, only the mode changed:
    //   moduleResolution: bundler   `const x: OpenAIWireMessage = 12345` -> TS2322
    //   module: nodenext            the same line compiles CLEAN
    // So this project would have passed vacuously, which is why it stayed on
    // bundler with `assertRelativeImportsHaveExtensions` covering TS2835 textually.
    //
    // scripts/emit-subpath-dts.mjs now stamps an explicit extension on every
    // relative specifier it emits, so nodenext resolves the kit for real and the
    // swap is live. The selfTest below is what keeps it honest: re-break a single
    // specifier in dist/wire/index.d.ts and THIS project — alone among the six —
    // fails with "`@kitn.ai/ui/wire` is resolving to `any`" while every bundler
    // project stays green. Nothing else in the repo's gates can see that.
    //
    // `packageJson: { type: 'module' }` is load-bearing, not decoration. The temp
    // dir has no package.json of its own, so nodenext would infer CommonJS and
    // fail 24 routes on TS1470 (`import.meta` is not allowed) plus a bogus
    // "vite has no exported member 'Plugin'" — neither of which a real Vite
    // template (which ships `"type": "module"`) would ever see.
    packageJson: { type: 'module' },
    options: {
      lib: ['ES2023'],
      types: ['node'],
      moduleDetection: 'force',
      module: 'nodenext',
      moduleResolution: 'nodenext',
    },
    // Proves express's types are the REAL ones and did not resolve to `any`.
    probe: {
      code: `import type { RequestHandler } from 'express';\nexport const bad: RequestHandler = 5;\n`,
      expect: /error TS2322/,
      why: "express's types resolved to `any`",
    },
  },
  'route-web': {
    dir: join(tmp, 'route-web'),
    include: ['**/*.ts', '**/*.d.ts'],
    // Next, SvelteKit and TanStack Start all ship DOM in `lib` (see the tsconfig
    // each one generates), so `request.json()` is legitimately `any` here and the
    // undici narrowing below does not apply. Keeping this project HONESTLY
    // different from route-node is the point: a route that only compiles because
    // the harness gave it the browser's globals is not a route that runs.
    options: { lib: ['ES2023', 'DOM', 'DOM.Iterable'], types: ['node'], moduleDetection: 'force' },
    probe: {
      code: `import type { RequestHandler } from '@sveltejs/kit';\nexport const bad: RequestHandler = 5;\n`,
      expect: /error TS2322/,
      why: "@sveltejs/kit's types resolved to `any`",
    },
  },
  'route-worker': {
    dir: join(tmp, 'route-worker'),
    include: ['**/*.ts', '**/*.d.ts'],
    // workers-types AND node, which is the combination the emitted Worker route
    // itself prescribes: "set compatibility_date 2025-04-01 (or later) with
    // nodejs_compat, which populates process.env from your bindings". Dropping
    // node here would fail the route on `process.env` for a reason the scaffold
    // already tells the consumer how to fix.
    options: {
      lib: ['ES2023'],
      types: ['@cloudflare/workers-types', 'node'],
      moduleDetection: 'force',
    },
    probe: {
      code: `export const bad: Ai = 5;\n`,
      expect: /error TS2322/,
      why: '@cloudflare/workers-types resolved to `any`',
    },
  },
};

for (const [name, project] of Object.entries(PROJECTS)) {
  if (name !== 'default') mkdirSync(project.dir, { recursive: true });
  if (project.packageJson)
    writeFileSync(join(project.dir, 'package.json'), JSON.stringify(project.packageJson, null, 2));
  writeFileSync(
    join(project.dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: { ...BASE_OPTIONS, ...project.options },
        include: project.include ?? ['*.ts', '*.tsx'],
      },
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
  const { dir, probe } = PROJECTS[project];
  writeFileSync(
    join(dir, 'probe-wrong-type.ts'),
    `import { toOpenAIMessages } from '@kitn.ai/ui/wire';\nexport const bad: number = toOpenAIMessages([]);\n`,
  );
  writeFileSync(
    join(dir, 'probe-unused-import.ts'),
    `import { applyToolOutput } from '@kitn.ai/ui/wire';\nexport const ok = 1;\n`,
  );
  // A route project's whole value is the HOST typings it adds, and those are the
  // ones most likely to have silently not resolved (a missing devDependency, a
  // wrong `types` entry). Assigning 5 to one of their types has to error, or the
  // package came back as `any` and every route below would pass vacuously.
  if (probe) writeFileSync(join(dir, 'probe-framework.ts'), probe.code);
  const out = runTsc(project);
  const wrongType = /probe-wrong-type\.ts.*error TS2322/s.test(out);
  const unused = /probe-unused-import\.ts.*error TS6133/s.test(out);
  const frameworkReal = !probe || new RegExp(`probe-framework\\.ts.*${probe.expect.source}`, 's').test(out);
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
  if (!frameworkReal)
    fail(
      `self-test [${project}]: the framework probe did NOT error — ${probe.why}.\n` +
        '  Every route in this project would then typecheck against `any` and prove nothing.\n' +
        `  tsc said:\n${out || '  (nothing)'}`,
    );
  console.log(
    `  ✓ self-test [${project}]: types resolve for real (TS2322) and noUnusedLocals is live (TS6133)` +
      (probe ? ' + host typings are real' : ''),
  );
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

/**
 * The Solid target's `renderPart`, which tsc cannot judge either.
 *
 * Solid is the ONE framework that does not render through `<kai-chat>`: the kit
 * is authored in Solid, so the scaffold composes the real components and has to
 * do the part switch itself. That switch is a `<Switch>` of `<Match>`es, and a
 * `<Switch>` with three `<Match>`es type-checks exactly as well as one with six.
 * The part with no branch simply renders NOTHING — at runtime, in the consumer's
 * app, with no error anywhere. That is not hypothetical: the emitted renderPart
 * shipped handling `text`/`reasoning`/`tool` only, while its own comment claimed
 * it rendered "exactly what `<kai-chat>` renders", so every scaffolded Solid app
 * dropped `card` and `source` parts on the floor. A developer wires up a search
 * tool, watches citations arrive in the data and render nothing, and has no
 * reason to suspect the scaffold.
 *
 * So: every variant of the `MessagePart` union must appear as a
 * `partAs(part(), '<variant>')` branch in every emitted Solid scaffold.
 *
 * The variant list is DERIVED from the union in src/elements/chat-types.ts and
 * is never restated here. A literal list would be the same defect one level up —
 * it goes stale the day someone adds a part kind, and it passes while doing so.
 */
function messagePartVariants() {
  const ts = require('typescript');
  const file = resolve(ROOT, 'src/elements/chat-types.ts');
  if (!existsSync(file)) fail(`cannot derive the MessagePart variants: ${file} does not exist.`);
  // `setParentNodes` so `.getText()` works for the error messages below.
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

  let alias = null;
  src.forEachChild((n) => {
    if (ts.isTypeAliasDeclaration(n) && n.name.text === 'MessagePart') alias = n;
  });
  if (!alias)
    fail(
      'no `type MessagePart = …` alias in src/elements/chat-types.ts.\n' +
        '  This check derives its variant list from that union. If the union MOVED, point this\n' +
        '  function at its new home — do NOT hard-code the variants, which is the failure mode\n' +
        '  the whole check exists to prevent.',
    );
  if (!ts.isUnionTypeNode(alias.type))
    fail('`MessagePart` is no longer a union type, so the variants cannot be derived from it.');

  const variants = [];
  for (const member of alias.type.types) {
    let tag = null;
    if (ts.isTypeLiteralNode(member)) {
      for (const m of member.members) {
        if (
          ts.isPropertySignature(m) &&
          m.name &&
          m.name.getText() === 'type' &&
          m.type &&
          ts.isLiteralTypeNode(m.type) &&
          ts.isStringLiteral(m.type.literal)
        ) {
          tag = m.type.literal.text;
        }
      }
    }
    if (!tag)
      fail(
        `a MessagePart union member has no string-literal \`type\` discriminant:\n    ${member.getText()}\n` +
          '  Every member needs one, or a variant would silently drop out of this check.',
      );
    variants.push(tag);
  }
  // Two is arbitrary; the point is that an empty or one-element list means the
  // parse quietly stopped working and the check below would pass trivially.
  if (variants.length < 2)
    fail(`derived only ${variants.length} MessagePart variant(s) — the union parse is broken, not the scaffolder.`);
  return variants;
}

/**
 * Extract the emitted `renderPart` function, comments stripped.
 *
 * Returns null when there is no such function at all, which is deliberately a
 * FAILURE upstream rather than a skip: an empty emitted block, or one whose part
 * renderer was deleted, must not read as "nothing missing".
 */
function renderPartBody(front) {
  const at = front.indexOf('function renderPart(');
  if (at < 0) return null;
  // Top-level functions are emitted at column zero, so the closing brace on its
  // own line ends it.
  const end = front.indexOf('\n}\n', at);
  const body = end < 0 ? front.slice(at) : front.slice(at, end + 3);
  // Whole-line `//` comments go first. The prose inside renderPart NAMES the
  // variants it handles, and letting a comment satisfy the check would recreate
  // the exact defect under test — a claim standing in for the code.
  return body.replace(/^[ \t]*\/\/.*$/gm, '');
}

async function solidPartCoverageCheck(scaffold) {
  const variants = messagePartVariants();
  const failures = [];
  let checked = 0;
  for (const useCase of ARCHETYPES) {
    for (const integration of INTEGRATIONS) {
      const label = `${useCase}__${integration}__solid`;
      if (FILTER && !label.includes(FILTER)) continue;
      checked++;
      const out = await scaffold.handler({ useCase, integration, placement: 'full-page', framework: 'solid' });
      const body = renderPartBody(frontEnd(out.content[0].text));
      if (body === null) {
        failures.push(
          `${label}: no \`function renderPart(\` in the emitted front end — the thread renders no parts at all`,
        );
        continue;
      }
      const missing = variants.filter((v) => !body.includes(`partAs(part(), '${v}')`));
      if (missing.length)
        failures.push(
          `${label}: renderPart has no branch for ${missing.map((v) => `\`${v}\``).join(', ')} — ` +
            `those parts reach the thread and render NOTHING (tsc cannot see a missing <Match>)`,
        );
    }
  }
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    cleanup();
    fail(`${failures.length} solid scaffold(s) do not render every MessagePart variant.`);
  }
  console.log(
    `  ✓ ${checked} solid scaffolds: renderPart branches on all ${variants.length} MessagePart variants ` +
      `(${variants.join(', ')}), derived from the union`,
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
 * The `html` target, which tsc CAN now see.
 *
 * It could not for most of this file's life: SCAF-19 kept the logic as plain JS
 * inside an inline `<script type="module">`, so there was no file to compile and
 * this function did a parse-only structural pass instead. That was the same blind
 * spot the consumer had — a stock `vanilla-ts` app builds with `tsc && vite build`
 * and scopes its tsconfig to `"include": ["src"]`, so an inline script is checked
 * by nothing. (Measured: a call to a function that does not exist anywhere still
 * left `npm run build` exiting 0.)
 *
 * The scaffolder now emits `src/main.ts` as a real module, so the html cells join
 * the compiled matrix and this function keeps only the checks tsc cannot make:
 *
 *   1. the whole scaffold declares exactly one chat element and one submit
 *      listener — ollama once carried a `routeTemplates.html` entry, so
 *      `framework: 'html'` printed a SECOND `<kai-chat id="chat">` with its own
 *      listener under the BACKEND ROUTE heading;
 *   2. index.html actually LOADS the module, and does not carry the logic inline
 *      again — the whole point of the split.
 *
 * Returns the extracted `src/main.ts` bodies so `main()` can compile them.
 */
function htmlModuleOf(text) {
  const front = frontEnd(text);
  const at = front.indexOf(HTML_MODULE_SEPARATOR);
  if (at < 0) return null;
  // Cut at the end of the separator LINE, not the end of the matched prefix: the
  // heading is padded out with box-drawing dashes, and leaving those on line 1 is
  // 80 x TS1127 "Invalid character" that reads like a scaffolder defect.
  const eol = front.indexOf('\n', at);
  return eol < 0 ? '' : front.slice(eol + 1);
}
const HTML_MODULE_SEPARATOR = '// ── src/main.ts ──';

async function htmlStructureCheck(scaffold) {
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

      // Scoped to the index.html HALF of block (1), which is the only place an
      // inline script would be a defect. Two other places legitimately write the
      // characters `<script type="module">`: the LOADING OPTIONS block describing
      // the CDN autoloader, and a comment inside src/main.ts explaining why a
      // module script is deferred. Checking the whole scaffold — or even the whole
      // of block (1) — reads that prose as the bug.
      const front = frontEnd(text);
      const sep = front.indexOf(HTML_MODULE_SEPARATOR);
      const markup = sep < 0 ? front : front.slice(0, sep);
      // The markup has to LOAD the module...
      if (!/<script type="module" src="\/src\/main\.ts"><\/script>/.test(markup))
        failures.push(`${label}: index.html does not load /src/main.ts, so the emitted module is dead code`);
      // ...and must not have quietly gone back to carrying the logic inline,
      // where the consumer's tsconfig cannot reach it.
      if (/<script type="module">/.test(markup))
        failures.push(`${label}: the logic is inline again — a stock vanilla-ts tsconfig ("include": ["src"]) type-checks none of it`);
      if (sep < 0)
        failures.push(`${label}: no "${HTML_MODULE_SEPARATOR}…" section — there is no module to compile`);
    }
  }
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    cleanup();
    fail(`${failures.length} html scaffold problem(s).`);
  }
  console.log(`  ✓ ${checked} html scaffolds: one chat element, one submit listener, logic loaded from /src/main.ts`);
}

// ── 3b. The BACKEND ROUTE, block (2) ────────────────────────────────────────

/**
 * Every framework the scaffolder will emit a route for.
 *
 * Wider than FRAMEWORKS on purpose. `html` and `fastapi` cannot HOST a route, but
 * they still emit one (under a warning) for the consumer to run elsewhere, and
 * `express` / `worker` are backend-only targets a consumer can ask for directly.
 * All four produce code, and all four were unchecked.
 */
const ROUTE_FRAMEWORKS = [...new Set([...FRAMEWORKS, 'html', 'express', 'worker', 'fastapi'])];

/**
 * Runtime label → the tsc project whose globals that runtime really has.
 *
 * Keyed on what the SCAFFOLDER declares ("# Runtime: …"), not on the framework
 * that was asked for, because a fallback route is emitted for a DIFFERENT host
 * than the one requested — `framework: 'react'` with an integration that has no
 * portable handler emits an Express server. Checking that against a browser
 * tsconfig would be checking a fiction.
 *
 * `null` means "not TypeScript" and routes to the Python check instead. A label
 * that is in neither this map nor that bucket is a hard failure: silently
 * skipping an unrecognised host is precisely how block (2) went unchecked for so
 * long, and a new adapter must not be able to opt itself out by existing.
 */
const RUNTIME_PROJECT = {
  'Next.js route handler (Node/Edge)': 'route-web',
  'SvelteKit +server.ts endpoint': 'route-web',
  'TanStack Start server route': 'route-web',
  'Express handler (Node)': 'route-node',
  'Angular SSR server (Express, src/server.ts)': 'route-node',
  'Vite dev-server middleware (Node)': 'route-node',
  'Cloudflare Worker': 'route-worker',
  'FastAPI (Python)': null,
};

/** Block 2 only: the scaffolder's backend route. */
function backEnd(text) {
  const after = text.split('=== (2) BACKEND ROUTE ===')[1];
  if (after === undefined) return null;
  return after.split(/^=== \(3\)/m)[0];
}

/**
 * The runtime the scaffolder says this route is for, in either of the two shapes
 * `compose` writes: an exact match prints "# Runtime: X", a fallback prints
 * "Emitting its native\n# X route instead".
 */
function routeRuntime(block) {
  const exact = block.match(/^# Runtime: (.+)$/m);
  if (exact) return exact[1].trim();
  const fallback = block.match(/Emitting its native\n# (.+?) route instead/);
  if (fallback) return fallback[1].trim();
  return null;
}

/** A chunk that is only blank lines and `//` comments is illustration, not code. */
const hasCode = (s) => s.split('\n').some((l) => l.trim() && !l.trim().startsWith('//'));

const FILE_SEPARATOR = /^\/\/ ── ([\w./+-]+\.\w+) ─+\s*$/;
const LEADING_PATH = /^\/\/ ([\w./+-]+\.tsx?)\s*$/;

/**
 * Split one emitted route into the FILES it actually represents.
 *
 * A route is not one file. The Vite adapter emits `src/server/chat.ts`, then
 * `vite-chat-api.ts` which imports `chatHandler` back out of it, then a
 * commented-out `vite.config.ts`. Concatenating those into a single file would
 * produce a bogus TS2440 (an import colliding with the local declaration it was
 * imported from) and hide whatever is really wrong — and, worse, it would never
 * check that the cross-file import RESOLVES, which is the part a consumer pastes
 * wrong. So each `// ── name.ts ──` heading starts a new file, written at its
 * real relative path.
 *
 * The fully-commented `vite.config.ts` chunk drops out via `hasCode`: it is
 * guidance, and tsc has nothing to say about it.
 */
function splitRouteFiles(code, defaultName) {
  const chunks = [];
  let current = { path: null, lines: [] };
  for (const line of code.split('\n')) {
    const sep = line.match(FILE_SEPARATOR);
    if (sep) {
      chunks.push(current);
      current = { path: sep[1], lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  chunks.push(current);
  // The first chunk names itself with the adapter's `// path/to/file.ts` opener.
  const lead = chunks[0].lines.find((l) => l.trim())?.match(LEADING_PATH);
  chunks[0].path = lead ? lead[1] : defaultName;
  return chunks.map((c) => ({ path: c.path, code: c.lines.join('\n') })).filter((c) => hasCode(c.code));
}

/**
 * The files a framework GENERATES, reproduced exactly as its own codegen writes
 * them and typed entirely through the real package.
 *
 * This is the one place the harness writes type declarations itself, and the
 * line it does not cross matters: it never declares a framework's API. A
 * `declare module '@sveltejs/kit'` would make RequestHandler `any` and let a
 * route with the wrong signature sail through — the exact defect the svelte
 * adapter exists to prevent. What is written here is only the per-PROJECT glue
 * the framework's CLI emits and npm cannot ship:
 *
 *   · SvelteKit: `svelte-kit sync` writes a `./$types` per route directory,
 *     specialising Kit's own RequestHandler to that route's params and id.
 *   · Wrangler: `wrangler types` writes `Env` from the bindings in wrangler.jsonc.
 *     The emitted Worker reads `env.AI`, so the binding declared here is `Ai` —
 *     workers-types' real one.
 */
function generatedCompanions(files) {
  const extra = [];
  for (const f of files) {
    if (f.path.endsWith('+server.ts')) {
      extra.push({
        path: join(dirname(f.path), '$types.d.ts'),
        code: [
          `// Reproduces what \`svelte-kit sync\` generates for this route. Kit's OWN`,
          `// RequestHandler does the typing; nothing here is stubbed.`,
          `import type * as Kit from '@sveltejs/kit';`,
          `type RouteParams = Record<string, never>;`,
          `export type RequestHandler = Kit.RequestHandler<RouteParams, '/api/chat'>;`,
          ``,
        ].join('\n'),
      });
      extra.push({
        path: 'svelte-env.d.ts',
        code: [
          `// Reproduces the \`$env/dynamic/private\` block \`svelte-kit sync\` writes into`,
          `// .svelte-kit/ambient.d.ts, copied from a real \`sv create\` app. The machine's`,
          `// own variable names are omitted — they are not part of the contract — but the`,
          `// index signatures are verbatim, so \`env.OPENROUTER_API_KEY\` types as`,
          `// \`string | undefined\` here exactly as it does in a consumer's app.`,
          `declare module '$env/dynamic/private' {`,
          `  export const env: {`,
          '    [key: `PUBLIC_${string}`]: undefined;',
          '    [key: `${string}`]: string | undefined;',
          `  };`,
          `}`,
          ``,
        ].join('\n'),
      });
    }
  }
  if (files.some((f) => /createFileRoute\(/.test(f.code))) {
    extra.push({
      path: 'routeTree.gen.ts',
      code: [
        `// Reproduces the entry \`tsr\` writes into routeTree.gen.ts when it picks up`,
        `// src/routes/api/chat.ts. createFileRoute is typed`,
        `// \`<TFilePath extends keyof FileRoutesByPath>\`, and FileRoutesByPath ships EMPTY —`,
        `// the generator is what fills it in. Without this the route's own path literal is`,
        `// not assignable to \`never\`, which is a missing codegen step, not a bad route.`,
        `import type { createRootRoute } from '@tanstack/react-router';`,
        ``,
        `declare module '@tanstack/router-core' {`,
        `  interface FileRoutesByPath {`,
        `    '/api/chat': {`,
        `      id: '/api/chat';`,
        `      path: '/api/chat';`,
        `      fullPath: '/api/chat';`,
        `      parentRoute: ReturnType<typeof createRootRoute>;`,
        `    };`,
        `  }`,
        `}`,
        `export {};`,
        ``,
      ].join('\n'),
    });
  }
  if (files.some((f) => /\benv: Env\b/.test(f.code))) {
    extra.push({
      path: 'worker-configuration.d.ts',
      code: [
        `// Reproduces what \`wrangler types\` generates from an AI binding in`,
        `// wrangler.jsonc. \`Ai\` is @cloudflare/workers-types' real interface.`,
        `declare namespace Cloudflare {`,
        `  interface Env {`,
        `    AI: Ai;`,
        `  }`,
        `}`,
        `interface Env extends Cloudflare.Env {}`,
        ``,
      ].join('\n'),
    });
  }
  return extra;
}

/**
 * Every RELATIVE import an emitted route writes must carry an explicit extension.
 *
 * This is TS2835. The route-node project now runs under genuine nodenext and so
 * DOES flag it in live code — but this textual pass is not redundant, and it is
 * kept deliberately, because it covers two things tsc structurally cannot:
 *
 *   1. COMMENTED-OUT code. The vite.config.ts chunk is emitted entirely as `//`
 *      guidance a consumer uncomments, and splitRouteFiles drops it before tsc
 *      ever runs (see the call site). tsc does not parse comments. That chunk is
 *      exactly where the shipped defect was.
 *   2. route-web and route-worker, which stay on `bundler` ON PURPOSE — Next,
 *      SvelteKit, TanStack Start and wrangler all ship bundler resolution — so a
 *      missing extension in one of their routes is invisible to the compiler
 *      there, and this is its only coverage.
 *
 * So the compiled check and this one overlap on 18 live route-node imports and
 * are disjoint everywhere else. Keep both.
 *
 * Measured in a stock `npm create vite -- --template react-ts` app:
 *   vite.config.ts(1,31): error TS2835: Relative import paths need explicit file
 *   extensions in ECMAScript imports when '--moduleResolution' is 'node16' or
 *   'nodenext'. Did you mean './vite-chat-api.js'?
 *
 * `.js` is the required form even though the file on disk is `.ts` — that is the
 * TypeScript convention nodenext expects, and Vite's own config loader resolves
 * it. Verified: `npm run build` passes and `POST /api/chat` answers 401 from the
 * provider (not 404), so the plugin really loaded.
 *
 * Commented lines count. The vite.config.ts chunk is emitted entirely commented
 * out as guidance a consumer uncomments, so an extensionless import there fails
 * their build just the same — and that is exactly where the shipped defect was.
 */
function assertRelativeImportsHaveExtensions(label, files, failures) {
  // `from './x'` / `import './x'`, in live code OR in a `//` comment.
  const RELATIVE = /(?:from|import)\s+'(\.\.?\/[^']*)'/g;
  for (const f of files) {
    for (const m of f.code.matchAll(RELATIVE)) {
      const spec = m[1];
      // SvelteKit's `./$types` is generated and virtual — it has no file on disk
      // and Kit's own templates import it exactly like this.
      if (spec.endsWith('/$types')) continue;
      if (!/\.(js|mjs|cjs|ts|mts|cts|json|css)$/.test(spec))
        failures.push(
          `${label}: ${f.path} imports '${spec}' with no file extension — TS2835 under the ` +
            `nodenext tsconfig.node.json the stock Vite templates ship. Use '${spec}.js'.`,
        );
    }
  }
}

/**
 * Block (2) must not depend on the archetype.
 *
 * The route matrix skips the archetype axis because `chooseRoute` only ever
 * reads (integration, framework). That is true today and cheap to keep true, but
 * if it stopped being true this check would silently be compiling one sixth of
 * the real matrix and still reporting a full pass. So prove it, per integration
 * and framework, against every archetype.
 */
async function assertRoutesAreArchetypeIndependent(scaffold, reference) {
  const drift = [];
  for (const [label, expected] of reference) {
    const [, integration, framework] = label.split('__');
    for (const useCase of ARCHETYPES.slice(1)) {
      const out = await scaffold.handler({ useCase, integration, placement: 'full-page', framework });
      if (backEnd(out.content[0].text) !== expected) drift.push(`${integration} × ${framework}: differs for archetype '${useCase}'`);
    }
  }
  if (drift.length) {
    for (const d of drift.slice(0, 10)) console.log(`  ✗ ${d}`);
    cleanup();
    fail(
      `${drift.length} route(s) vary by ARCHETYPE, but the route matrix compiles one archetype per\n` +
        '  (integration, framework). Add the archetype axis to routeCheck, or this gate is\n' +
        '  now checking a fraction of the routes it claims to.',
    );
  }
  console.log(`  ✓ routes are archetype-independent (${reference.size} × ${ARCHETYPES.length - 1} re-checked)`);
}

/**
 * The FastAPI route, which tsc cannot see because it is Python.
 *
 * Compiled with the real `ast.parse` when python3 is on PATH — that is a genuine
 * syntax check, needs no packages, and would have caught an unterminated string
 * or a bad indent. When python3 is missing the check degrades to structure, and
 * SAYS it degraded rather than printing a checkmark that means less than it looks.
 */
function pythonCheck(cells) {
  let python3 = true;
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
  } catch {
    python3 = false;
  }
  const failures = [];
  for (const { label, code } of cells) {
    if (python3) {
      try {
        execFileSync('python3', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], {
          input: code,
          stdio: ['pipe', 'ignore', 'pipe'],
        });
      } catch (e) {
        failures.push(`${label}: the emitted Python does not parse: ${`${e.stderr ?? ''}`.trim().split('\n').pop()}`);
        continue;
      }
    }
    // Structure tsc/ast cannot judge: this has to be a streaming SSE endpoint on
    // the path the front end fetches, or the scaffold's two halves do not meet.
    for (const [needle, why] of [
      ["@app.post('/api/chat')", 'no POST /api/chat — the front end fetches that exact path'],
      ['StreamingResponse', 'not a streaming response, so the thread would fill in one jump'],
      ["media_type='text/event-stream'", 'not labelled as SSE, so readOpenAIStream sees no frames'],
      ['data: [DONE]', 'never terminates the stream, so the browser waits forever'],
    ]) {
      if (!code.includes(needle)) failures.push(`${label}: ${why}`);
    }
  }
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    cleanup();
    fail(`${failures.length} python route problem(s).`);
  }
  console.log(
    `  ✓ ${cells.length} python routes: ${python3 ? 'parse (ast.parse)' : 'STRUCTURE ONLY — python3 not on PATH, syntax UNCHECKED'} + stream as SSE on /api/chat`,
  );
}

/**
 * Compile every emitted backend route.
 *
 * Returns nothing; fails the process on the first non-empty diagnostic set, the
 * same way the front-end matrix does. Each reported path is the case label, so a
 * failure names the (integration, framework) that produced it.
 */
async function routeCheck(scaffold) {
  const cells = [];
  for (const integration of INTEGRATIONS)
    for (const framework of ROUTE_FRAMEWORKS) {
      const label = `route__${integration}__${framework}`;
      if (FILTER && !label.includes(FILTER)) continue;
      cells.push({ integration, framework, label });
    }
  if (!cells.length) return;

  console.log(`  · generating ${cells.length} backend routes`);
  const reference = new Map();
  const pythonCells = [];
  const noRoute = [];
  const usedProjects = new Set();
  const importFailures = [];

  for (const c of cells) {
    const out = await scaffold.handler({
      useCase: ARCHETYPES[0],
      integration: c.integration,
      placement: 'full-page',
      framework: c.framework,
    });
    const block = backEnd(out.content[0].text);
    if (block === null) {
      cleanup();
      fail(`${c.label}: the scaffold has no "=== (2) BACKEND ROUTE ===" section at all.`);
    }
    reference.set(c.label, block);

    const runtime = routeRuntime(block);
    if (runtime === null) {
      // `mock` streams in the browser and says so; anything ELSE without a
      // runtime is a route the scaffolder failed to choose, and pasting the
      // block would give a consumer prose where code should be.
      if (c.integration === 'mock' && /No backend or API key needed/.test(block)) {
        noRoute.push(c.label);
        continue;
      }
      cleanup();
      fail(
        `${c.label}: block (2) declares no runtime.\n` +
          "  Neither '# Runtime: X' nor a fallback note was emitted, so this route cannot be\n" +
          '  routed to a tsc project and would go unchecked. Block was:\n' +
          block.split('\n').slice(0, 12).map((l) => `    ${l}`).join('\n'),
      );
    }

    if (!(runtime in RUNTIME_PROJECT)) {
      cleanup();
      fail(
        `${c.label}: unrecognised runtime "${runtime}".\n` +
          '  Add it to RUNTIME_PROJECT with the tsc project whose globals that host really has\n' +
          '  (or null if it is not TypeScript). Refusing to skip it: an unchecked host is how\n' +
          '  block (2) went unverified in the first place.',
      );
    }

    const project = RUNTIME_PROJECT[runtime];
    // Strip the scaffolder's `#` prose (notes + the cannot-host warning). It is
    // commentary around the code, not part of it.
    const code = block
      .split('\n')
      .filter((l) => !l.startsWith('#'))
      .join('\n');

    if (project === null) {
      pythonCells.push({ label: c.label, code });
      continue;
    }

    // Run over the WHOLE block, not over `files`: splitRouteFiles drops the
    // fully-commented vite.config.ts chunk as illustration, and that chunk is
    // precisely where the extensionless import shipped. A consumer uncomments it.
    assertRelativeImportsHaveExtensions(c.label, [{ path: 'block (2)', code }], importFailures);

    const files = splitRouteFiles(code, 'route.ts');
    if (!files.length) {
      cleanup();
      fail(`${c.label}: block (2) declares runtime "${runtime}" but contains no code to compile.`);
    }
    usedProjects.add(project);
    const cellDir = join(PROJECTS[project].dir, c.label);
    for (const f of [...files, ...generatedCompanions(files)]) {
      const dest = join(cellDir, f.path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, f.code);
    }
  }

  if (importFailures.length) {
    for (const f of importFailures) console.log(`  ✗ ${f}`);
    cleanup();
    fail(`${importFailures.length} emitted route import(s) lack an explicit file extension.`);
  }
  console.log('  ✓ every relative import in an emitted route carries an explicit extension (TS2835)');

  await assertRoutesAreArchetypeIndependent(scaffold, reference);
  if (noRoute.length) console.log(`  · ${noRoute.length} cases have no backend by design (mock streams in the browser)`);
  if (pythonCells.length) pythonCheck(pythonCells);

  const projects = [...usedProjects];
  console.log(`  · running tsc over the routes (${projects.length} project(s): ${projects.join(', ')})`);
  const diagnostics = projects.map((p) => runTsc(p)).join('\n');

  // Group diagnostics by CASE. A route is several files, so the basename is not
  // the label the way it is for the front end — the label is the directory the
  // files were written into.
  const labels = cells.map((c) => c.label);
  const byLabel = new Map();
  for (const line of diagnostics.split('\n')) {
    const m = line.match(/^(.+?\.tsx?)\((\d+),(\d+)\): (error .+)$/);
    if (!m) continue;
    const label = labels.find((l) => m[1].includes(`/${l}/`)) ?? m[1];
    const file = m[1].split(`/${label}/`)[1] ?? m[1].split('/').pop();
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(`      ${file} line ${m[2]}:${m[3]}  ${m[4]}`);
  }

  const compiled = cells.length - noRoute.length - pythonCells.length;
  console.log(`\n  ${compiled - byLabel.size}/${compiled} backend routes compile clean\n`);
  if (byLabel.size) {
    for (const [label, errs] of [...byLabel.entries()].sort()) {
      console.log(`  ✗ ${label}`);
      errs.forEach((e) => console.log(e));
    }
    cleanup();
    fail(
      `${byLabel.size} backend route(s) do not compile. Each one is server code a consumer\n` +
        '  would be handed and told to paste.',
    );
  }
  console.log('  ✓ every emitted backend route compiles under its real host tsconfig');
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
  await htmlStructureCheck(scaffold);
  await angularStructureCheck(scaffold);
  await solidPartCoverageCheck(scaffold);

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
    // html emits index.html + src/main.ts; only the module is TypeScript.
    const code =
      c.framework === 'html'
        ? htmlModuleOf(out.content[0].text)
        : c.framework === 'vue' || c.framework === 'svelte'
          ? liftScript(block)
          : block;
    if (code === null) {
      skipped.push(c.label);
      continue;
    }
    writeFileSync(join(PROJECTS[PROJECT[c.framework]].dir, `${c.label}.${EXT[c.framework]}`), code);
  }
  if (skipped.length) fail(`no compilable code block found in: ${skipped.join(', ')}`);

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

  // Block (2). Everything above this line is the FRONT END; the routes were
  // sliced off and thrown away until this existed.
  await routeCheck(scaffold);
  cleanup();
}

main().catch((e) => {
  cleanup();
  fail(e?.stack ?? String(e));
});
