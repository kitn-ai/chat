// THE CONSUMER TSC PROJECTS — one definition, two callers.
//
// A throwaway tree that resolves `@kitn.ai/ui` through the package's REAL
// exports map and shipped `.d.ts`, plus the six tsconfig projects a consumer
// really builds under, plus the anti-theatre self-test that proves those types
// did not silently resolve to `any`.
//
// WHY IT IS A MODULE. It lived inside `verify-scaffold-compiles.mjs`, and the
// acceptance deck's `compiles` gate needs the same thing: "tsc --strict is clean
// under the consumer project for the framework asked for, resolving @kitn.ai/ui
// through the shipped exports map" is the gate's own 10-anchor, word for word.
// Copying the PROJECTS block into a second file would have made the anchor a
// claim about a copy — and the copy is what rots. So both callers import this.
//
// The per-project options are NOT stylistic. Each mirrors what the framework's
// own generated tsconfig sets, and the reasons are recorded at each entry: they
// were paid for one build failure at a time, and a tidy-up that drops one takes
// the coverage with it. Read them before changing anything here.
//
// NOTHING RUNS AT IMPORT. `createConsumerTsc()` is what makes the temp tree, so
// importing this module for `EXT` or `FRAMEWORK_PROJECT` alone costs nothing and
// leaves no directory behind.

import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Resolve tooling through Node's resolver rather than a hard-coded
// node_modules path: pnpm's layout differs between a workspace root, a
// worktree, and CI, and a wrong guess here fails as a wall of TS2307 that reads
// like a scaffolder defect.
const require = createRequire(import.meta.url);
/** Directory a package was installed into, resolved from this module. */
export const pkgDir = (name) => {
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

/** `packages/ui` — this module lives at `packages/ui/scripts/lib/`. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The file extension each framework's front end is written as. */
export const EXT = {
  react: 'tsx', next: 'tsx', 'tanstack-start': 'tsx', vue: 'ts', svelte: 'ts',
  angular: 'ts', solid: 'tsx', html: 'ts',
};
/** Which tsc project each framework compiles under — see PROJECTS below. */
export const FRAMEWORK_PROJECT = {
  react: 'default', next: 'default', 'tanstack-start': 'default', vue: 'default', svelte: 'default',
  angular: 'angular', solid: 'solid', html: 'default',
};

/** Options every project shares: what `npm create vite` turns on, which is what
 *  a consumer builds with. */
export const BASE_OPTIONS = {
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
 * THE ANTI-THEATRE PROBES. Two files that MUST fail to compile in every project.
 *
 * A green run proves nothing if `@kitn.ai/ui` resolved to `any` or the strict
 * flags never took effect, and both failures look exactly like success. These
 * are exported rather than inlined so a caller running tsc in a SUBDIRECTORY of
 * a project (the acceptance gate does, to keep one run's files together) can run
 * the identical controls there instead of trusting that the parent project's
 * green carries down.
 */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const ANTI_THEATRE_PROBES = [
  {
    file: 'probe-wrong-type.ts',
    code: `import { toOpenAIMessages } from '@kitn.ai/ui/wire';\nexport const bad: number = toOpenAIMessages([]);\n`,
    expect: /error TS2322/,
    why: '`@kitn.ai/ui/wire` is resolving to `any` (or not at all), so a green result would be meaningless',
  },
  {
    file: 'probe-unused-import.ts',
    code: `import { applyToolOutput } from '@kitn.ai/ui/wire';\nexport const ok = 1;\n`,
    expect: /error TS6133/,
    why: 'noUnusedLocals is not in effect, which is the single most valuable check here',
  },
];

/**
 * Lift a `<script>` block out of a .vue/.svelte single-file component into
 * plain TS.
 *
 * `.vue` / `.svelte` are not TS files, so tsc cannot read them at all. Lifting
 * separates the script from its template, which makes every template-visible
 * top-level binding look unused, so the `void [...]` footer names the
 * column-zero DECLARATIONS the template would have read. Imports are
 * deliberately excluded from that footer: an unused import is the defect class
 * under test.
 *
 * Returns null when there is no `<script>` at all — a template-only component
 * carries nothing for tsc to check, and saying so is the caller's job.
 */
export function liftScript(block) {
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
    ? `\n// harness: the template would read these; see scripts/lib/consumer-tsc-projects.mjs\nvoid [${[...names].join(', ')}];\n`
    : '';
  return `${body}\n${footer}`;
}

/**
 * The project definitions, minus the temp directory they will live in.
 *
 * `dir` is filled in by `createConsumerTsc`; everything else here is the fact
 * both callers share.
 */
function projectSpecs(tmp) {
  return {
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
}

/** The project names, derived — never restated by a caller. */
export const PROJECT_NAMES = Object.keys(projectSpecs('/'));

/**
 * Stand up the consumer tree.
 *
 * @param {{ keep?: boolean, fail: (msg: string) => never }} input
 *   `fail` prints in the CALLER's voice and exits — the harness never decides
 *   how a caller reports its own failure.
 */
export function createConsumerTsc({ keep = false, fail }) {
  const ROOT = PACKAGE_ROOT;
  if (typeof fail !== 'function') throw new Error('createConsumerTsc needs a `fail(msg)` — the harness reports in the caller\'s voice.');

  if (!existsSync(resolve(ROOT, 'dist/wire/index.d.ts'))) {
    fail('dist/wire/index.d.ts not found. Run `nx build ui` first: this checks the SHIPPED types.');
  }

  const tmp = mkdtempSync(join(tmpdir(), 'kai-consumer-tsc-'));
  const cleanup = () => {
    if (keep) console.log(`\n  (--keep) harness left at ${tmp}`);
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
    'solid-js', '@angular/core', '@angular/common', '@angular/compiler', '@angular/platform-browser',
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
  const shims = join(tmp, 'shims.d.ts');
  writeFileSync(
    shims,
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

  const PROJECTS = projectSpecs(tmp);

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
  if (!tsDir) {
    cleanup();
    fail('typescript is not installed. Run `pnpm install` at the repo root.');
  }
  const TSC = join(tsDir, 'bin/tsc');

  /** Run tsc over a directory holding a tsconfig.json; raw diagnostics ('' when clean). */
  function runTscIn(dir) {
    try {
      execFileSync(process.execPath, [TSC, '--project', join(dir, 'tsconfig.json')], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return '';
    } catch (e) {
      return `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
  }

  /** Run tsc over one project; return raw diagnostics text ('' when clean). */
  const runTsc = (project = 'default') => runTscIn(PROJECTS[project].dir);

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
    for (const p of ANTI_THEATRE_PROBES) writeFileSync(join(dir, p.file), p.code);
    // A route project's whole value is the HOST typings it adds, and those are the
    // ones most likely to have silently not resolved (a missing devDependency, a
    // wrong `types` entry). Assigning 5 to one of their types has to error, or the
    // package came back as `any` and every route below would pass vacuously.
    if (probe) writeFileSync(join(dir, 'probe-framework.ts'), probe.code);
    const out = runTsc(project);
    const missed = ANTI_THEATRE_PROBES.filter(
      (p) => !new RegExp(`${escapeRe(p.file)}.*${p.expect.source}`, 's').test(out),
    );
    const frameworkReal = !probe || new RegExp(`probe-framework\\.ts.*${probe.expect.source}`, 's').test(out);
    clearSources(project);
    for (const p of missed) {
      fail(
        `self-test [${project}]: ${p.file} did NOT error.\n  ${p.why}.\n  tsc said:\n${out || '  (nothing)'}`,
      );
    }
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
   * A SUBDIRECTORY of a project, with the project's own compilerOptions and a
   * recursive include.
   *
   * The front-end projects include `*.ts`/`*.tsx` NON-recursively, so a caller
   * that drops files into a subdirectory of `default` would compile ZERO files
   * and read the silence as a pass. That is the exact failure this repo keeps
   * paying for, so a sandbox writes its own tsconfig — with the SAME options
   * object the project computed, never a re-typed one — and the caller is
   * expected to run `sandbox.selfTest()` in it before trusting a green.
   *
   * node_modules still resolves: the sandbox is inside `tmp`, and both Node and
   * tsc walk up.
   *
   * `opts.include` is APPENDED to the default include array, for a caller whose
   * files are not .ts/.tsx (a .vue SFC, a .svelte component). Appended rather
   * than replacing, because the default array ends with the shims path and a
   * caller that restated the list would silently drop it: `declare module
   * '*.css'` and the next/dynamic and router stand-ins live there, and losing
   * them would show up as a defect in whatever tree happened to import a
   * stylesheet. `opts.tsconfigExtra` is spread at the TOP level of the written
   * tsconfig, for a caller whose tool reads a sibling of `compilerOptions`
   * (`angularCompilerOptions`). Neither touches the compilerOptions merge: that
   * stays the project's own computed object and is never re-typed, which is the
   * property this module's header defends.
   */
  function sandbox(project, name, opts = {}) {
    const spec = PROJECTS[project];
    if (!spec) {
      cleanup();
      fail(`no such tsc project "${project}". The projects are ${Object.keys(PROJECTS).join(', ')}.`);
    }
    const dir = join(spec.dir, name);
    mkdirSync(dir, { recursive: true });
    if (spec.packageJson) writeFileSync(join(dir, 'package.json'), JSON.stringify(spec.packageJson, null, 2));
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: { ...BASE_OPTIONS, ...spec.options },
          include: [
            '**/*.ts',
            '**/*.tsx',
            '**/*.d.ts',
            relative(dir, shims).split('\\').join('/'),
            ...(opts.include ?? []),
          ],
          ...(opts.tsconfigExtra ?? {}),
        },
        null,
        2,
      ),
    );
    const clear = () => {
      for (const f of readdirSync(dir)) if (f !== 'tsconfig.json' && f !== 'package.json') rmSync(join(dir, f), { recursive: true, force: true });
    };
    return {
      dir,
      project,
      clear,
      run: () => runTscIn(dir),
      /**
       * The same anti-theatre controls, IN THIS DIRECTORY. Returns the probes
       * that failed to fire; an empty array means the sandbox is real.
       */
      selfTest: () => {
        clear();
        for (const p of ANTI_THEATRE_PROBES) writeFileSync(join(dir, p.file), p.code);
        const out = runTscIn(dir);
        const missed = ANTI_THEATRE_PROBES.filter(
          (p) => !new RegExp(`${escapeRe(p.file)}.*${p.expect.source}`, 's').test(out),
        );
        clear();
        return { missed, out };
      },
    };
  }

  return { ROOT, tmp, PROJECTS, TSC, runTsc, runTscIn, clearSources, selfTest, sandbox, cleanup };
}
