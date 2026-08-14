#!/usr/bin/env node
/**
 * Guard: no emitted .d.ts may reference a path outside dist/.
 *
 * The tarball ships `src/` today, so a declaration that type-imports
 * `../../src/elements/chat-types` still resolves for a consumer — by accident.
 * The moment raw source stops shipping (a reasonable size win) every such type
 * silently breaks, exactly like `@kitn.ai/ui/provider`, whose declarations
 * reached outside dist/ and therefore never typechecked at all.
 *
 * So: walk every .d.ts under dist/, pull out every module specifier and triple-slash
 * reference, and fail on any RELATIVE one that resolves outside dist/.
 * Bare specifiers (`react`, `@kitn.ai/ui/state`) are a consumer-resolution concern,
 * not a path-escape, and are checked separately below for self-references that
 * are not declared in the exports map.
 *
 * RESOLVABILITY, NOT JUST BOUNDARIES
 * ----------------------------------
 * This guard used to answer "does SOMETHING plausible exist at that path?" by
 * stat-ing a candidate list by hand. That is weaker than it looks, and it passed
 * green for months over a real bug: `dist/primitives/create-kai-chat.d.ts` imports
 * '../state', the hand-rolled list found `dist/state/index.d.ts`, and the check
 * was satisfied — but TypeScript does not resolve it that way. `dist/state.js`
 * exists as a sibling, and under `bundler`/`node16` resolution a matching FILE
 * beats a directory index, so tsc lands on the .js, finds no declarations beside
 * it, and a consumer with `skipLibCheck: false` gets:
 *
 *     error TS7016: Could not find a declaration file for module '../state'
 *
 * So resolution is now delegated to the TypeScript compiler itself
 * (`ts.resolveModuleName`) and the check asserts the specifier resolves to actual
 * DECLARATIONS — not merely that a file exists somewhere near the path. A guard
 * that re-implements tsc's resolution is a guard that disagrees with tsc.
 *
 * EVERY MODE A CONSUMER COMPILES IN, NOT JUST THE CONVENIENT ONE
 * -------------------------------------------------------------
 * This guard used to check `bundler` ALONE, and justified it in a comment: under
 * node16/nodenext an extensionless relative import is illegal, vite-plugin-dts
 * emits extensionless specifiers throughout, so checking that mode "would fail
 * every file for a reason this guard cannot fix". Every clause of that was true.
 * The conclusion was wrong. It was not unfixable — it was unfixed, and scoping the
 * guard to the passing mode is what let it ship:
 *
 *     same file, same tarball, only moduleResolution changed
 *     bundler  -> const x: OpenAIWireMessage = 12345   errors TS2322   (correct)
 *     nodenext -> const x: OpenAIWireMessage = 12345   compiles clean  (bug)
 *
 * Not an error a consumer could see and act on — SILENCE. `dist/wire/index.d.ts`
 * re-exports './read', './encode' and friends with no extension; nodenext rejects
 * those (TS2834), `skipLibCheck: true` (on in every Vite template) SUPPRESSES the
 * rejection, and the names re-exported through the broken specifier degrade to
 * `any`. The whole public API silently stops type-checking. That is the same shape
 * as the skipLibCheck bug: type-checking that appears to work and checks nothing.
 *
 * nodenext is not an exotic mode to us either — it is what the stock
 * `tsconfig.node.json` in Vite's TS templates uses, i.e. the mode our own emitted
 * backend routes compile under in a consumer's app.
 *
 * THE MODE ARGUMENT IS LOAD-BEARING — DO NOT DROP IT
 * --------------------------------------------------
 * `ts.resolveModuleName` under NodeNext with a DEFAULT resolutionMode resolves
 * './read' just fine, because TS2834 is raised by the CHECKER, not the resolver.
 * Adding NodeNext to the options without the mode makes this guard pass green on
 * a package that is thoroughly broken:
 *
 *     NodeNext, mode=<default>  -> RESOLVED read.d.ts   <- proves nothing
 *     NodeNext, mode=ESNext     -> UNRESOLVED           <- the real consumer result
 *
 * So each specifier is resolved with the CONTAINING file's implied module format
 * (`ts.getImpliedNodeFormatForFile`; ESM here, since package.json is
 * `"type": "module"`).
 *
 * WATCHING IT FAIL, WHICH THIS HEADER USED TO ASK YOU TO DO BY HAND
 * ----------------------------------------------------------------
 * The instruction here was: "If this check ever goes quiet, verify it can still
 * fail: strip the extensions back off one dist/*.d.ts and confirm it goes red."
 * That is now automated, because an instruction nobody runs is a guard nobody has.
 *
 *   node scripts/verify-dts-boundaries.mjs                      # the real dist/
 *   node scripts/verify-dts-boundaries.mjs --self-test          # prove it still detects
 *   node scripts/verify-dts-boundaries.mjs --package-root <dir> # any tree, e.g. a planted defect
 *
 * `--self-test` builds throwaway package roots under the OS temp dir — never the
 * real dist/ — and plants each defect class SEPARATELY: the escape, the
 * directory-index TS7016 that shipped for months, the extensionless TS2834 that
 * only nodenext sees, the unresolvable specifier, and the undeclared self-import.
 * A healthy tree must draw ZERO findings, which is the half no planted defect can
 * check.
 *
 * TWO WAYS THIS COULD COVER NOTHING WHILE EXITING 0, both now fatal:
 *   ZERO .d.ts FILES. `dist/` present but empty walked to an empty list and
 *   printed "0 emitted .d.ts files reference nothing outside dist/" — a sentence
 *   that is true of any broken build.
 *   ZERO RELATIVE SPECIFIERS. If `specifiersOf`'s patterns stop matching what
 *   vite-plugin-dts emits, every file yields nothing, the resolver is never
 *   called once, and the guard passes having tested no resolution at all.
 */
import { readdirSync, readFileSync, statSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const PKG_ROOT = resolve(argOf('--package-root') ?? join(scriptDir, '..'));
const SELF_TEST = argv.includes('--self-test');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * Module specifiers in a .d.ts: static import/export ... from '…', bare side-effect
 * `import '…'`, dynamic `import('…')` type queries, and `/// <reference path="…" />`.
 */
function specifiersOf(text) {
  const found = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /<reference\s+path\s*=\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) found.push(m[1]);
  }
  return found;
}

/**
 * Ask TYPESCRIPT to resolve the specifier, exactly as a consumer's tsc would — in
 * BOTH module-resolution modes real consumers compile in:
 *
 *   bundler  — this package's own tsconfig, and the Vite / Next / Astro / TanStack
 *              default. Where TS7016 (resolves to a .js with no declarations) bites.
 *   nodenext — the stock tsconfig.node.json in Vite's TS templates, and anything
 *              running under Node's own ESM resolution. Where TS2834 (extensionless
 *              relative specifier) bites, silently, via skipLibCheck.
 *
 * allowJs:true so a specifier that lands on a .js is REPORTED as "resolved, but
 * to JavaScript with no declarations" instead of silently reading as unresolved.
 * That distinction is the whole bug class.
 */
const MODES = [
  {
    label: 'bundler',
    opts: {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      allowJs: true,
    },
    // `bundler` has no per-file ESM/CJS split; resolution is mode-independent.
    impliedMode: false,
  },
  {
    label: 'nodenext',
    opts: {
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      module: ts.ModuleKind.NodeNext,
      target: ts.ScriptTarget.ESNext,
      allowJs: true,
    },
    // Load-bearing: see the header. Without the containing file's implied format
    // this degrades to a check that passes on extensionless specifiers.
    impliedMode: true,
  },
];
const TYPED_EXTENSIONS = new Set([ts.Extension.Dts, ts.Extension.Ts, ts.Extension.Tsx]);

/** @returns {{ok: true} | {ok: false, reason: string}} */
function resolvesToDeclarations(spec, containingFile, pkgRoot) {
  for (const { label, opts, impliedMode } of MODES) {
    const mode = impliedMode
      ? ts.getImpliedNodeFormatForFile(containingFile, undefined, ts.sys, opts)
      : undefined;
    const { resolvedModule } = ts.resolveModuleName(
      spec,
      containingFile,
      opts,
      ts.sys,
      undefined,
      undefined,
      mode,
    );
    if (!resolvedModule) {
      const hint =
        label === 'nodenext' && !/\.[a-z]+$/i.test(spec)
          ? ' — extensionless relative specifier, illegal under node16/nodenext ESM (TS2834).' +
            ` Consumers with skipLibCheck:true see NO error, just '${spec}' typed as any.` +
            ` Did you mean '${spec}.js'?`
          : '';
      return { ok: false, reason: `[${label}] resolves to nothing (TS2307)${hint}` };
    }
    if (!TYPED_EXTENSIONS.has(resolvedModule.extension)) {
      return {
        ok: false,
        reason:
          `[${label}] resolves to ${relative(pkgRoot, resolvedModule.resolvedFileName)} ` +
          `(${resolvedModule.extension}) — JavaScript with no declaration file beside it (TS7016)`,
      };
    }
  }
  return { ok: true };
}

/**
 * Everything wrong with ONE package tree. A pure function of the tree so
 * `--self-test` can drive it over fixtures; the process exits are in the caller.
 *
 * `problems` empty is the pass. `escapes`/`dangling`/`badSelfRefs` are kept apart
 * so the report can explain each class in its own words, the way it always has.
 */
function checkTree(pkgRoot) {
  const distRoot = join(pkgRoot, 'dist');
  const escapes = [];
  const dangling = [];
  const badSelfRefs = [];
  const fatal = [];

  if (!statSync(distRoot, { throwIfNoEntry: false })?.isDirectory()) {
    return { fatal: [`dist/ not found at ${distRoot} — run \`nx build ui\` first.`], escapes, dangling, badSelfRefs, files: [], relativeSpecifiers: 0 };
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
  } catch {
    return { fatal: [`no readable package.json at ${pkgRoot} — the exports map is what self-references are checked against.`], escapes, dangling, badSelfRefs, files: [], relativeSpecifiers: 0 };
  }
  const selfName = pkg.name;
  /** Subpaths this package publicly declares — a self-import must hit one of these. */
  const exportedSubpaths = Object.keys(pkg.exports ?? {}).map((k) =>
    k === '.' ? selfName : `${selfName}/${k.slice(2)}`,
  );
  const matchesExport = (specifier) => {
    if (specifier === selfName) return exportedSubpaths.includes(selfName);
    for (const sub of exportedSubpaths) {
      if (sub.endsWith('/*')) {
        if (specifier.startsWith(sub.slice(0, -1))) return true;
      } else if (specifier === sub) return true;
    }
    return false;
  };

  const files = walk(distRoot);

  // Vacuity 1. "0 files reference nothing outside dist/" is true of any broken
  // build, and this printed it as a pass.
  if (files.length === 0) {
    fatal.push(
      `walked ${distRoot} and found NO .d.ts file.\n` +
        '  A zero-file run is this guard having nothing to check, not a clean package.\n' +
        '  Run the lib build (`nx build ui`).',
    );
    return { fatal, escapes, dangling, badSelfRefs, files, relativeSpecifiers: 0 };
  }

  let relativeSpecifiers = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const spec of specifiersOf(text)) {
      if (spec.startsWith('.')) {
        relativeSpecifiers++;
        const target = resolve(dirname(file), spec);
        const rel = relative(distRoot, target);
        if (rel.startsWith('..') || rel.startsWith(`..${sep}`)) {
          escapes.push({ file: relative(pkgRoot, file), spec, target: relative(pkgRoot, target) });
        } else {
          // Inside dist/ — but does a consumer's tsc actually get TYPES from it?
          const verdict = resolvesToDeclarations(spec, file, pkgRoot);
          if (!verdict.ok) {
            dangling.push({ file: relative(pkgRoot, file), spec, reason: verdict.reason });
          }
        }
      } else if (spec === selfName || spec.startsWith(`${selfName}/`)) {
        if (!matchesExport(spec)) {
          badSelfRefs.push({ file: relative(pkgRoot, file), spec });
        }
      }
    }
  }

  // Vacuity 2. Every check above the self-reference one runs per RELATIVE
  // specifier. Zero of them means the resolver was never called, so nothing was
  // resolved in either mode and the pass says nothing about resolution.
  if (relativeSpecifiers === 0) {
    fatal.push(
      `read ${files.length} .d.ts file(s) and found NO relative specifier in any of them.\n` +
        '  Every resolution check here is per-relative-specifier, so this run called the\n' +
        '  TypeScript resolver zero times. Either the emit changed shape or the patterns in\n' +
        '  `specifiersOf` stopped matching it — not a package with nothing to check.',
    );
  }

  return { fatal, escapes, dangling, badSelfRefs, files, relativeSpecifiers };
}

// ---------------------------------------------------------------------------
// self-test
// ---------------------------------------------------------------------------

/** The healthy fixture, with `over` merged on top (a `null` value deletes a file). */
const fixtureFiles = (over = {}) => ({
  'package.json': JSON.stringify({
    name: '@kitn.ai/ui',
    type: 'module',
    exports: {
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './state': { types: './dist/state.d.ts', default: './dist/state.js' },
    },
  }),
  'dist/index.d.ts': `export * from './state.js';\nexport type { Local } from './local.js';\n`,
  'dist/state.d.ts': `export type S = { a: number };\n`,
  'dist/state.js': `export const s = 1;\n`,
  'dist/local.d.ts': `export type Local = string;\n`,
  'dist/local.js': `export const l = 1;\n`,
  ...over,
});

function writeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'verify-dts-boundaries-selftest-'));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const SELF_TEST_CASES = [
  {
    name: 'a healthy tree draws EXACTLY zero findings',
    files: fixtureFiles(),
    expect: [],
  },
  {
    name: 'ESCAPE: a declaration reaching outside dist/ into src/',
    files: fixtureFiles({
      'dist/index.d.ts': `export type { ChatMessage } from '../../src/elements/chat-types';\n` + `export * from './state.js';\n`,
    }),
    expect: ['ESCAPE', "'../../src/elements/chat-types'"],
    reject: ['TS7016', 'TS2307'],
  },
  {
    name: 'TS7016: the directory-index trap that shipped green for months',
    // `dist/state.js` sits beside `dist/state/index.d.ts`. The hand-rolled stat
    // list found the index and was satisfied; tsc takes the FILE and lands on
    // JavaScript with no declarations beside it.
    files: fixtureFiles({
      'dist/state.d.ts': null,
      'dist/state/index.d.ts': `export type S = { a: number };\n`,
      'dist/index.d.ts': `export * from './state';\n`,
    }),
    expect: ['TS7016', '[bundler]', "'./state'"],
  },
  {
    name: 'TS2834: an extensionless specifier only nodenext rejects',
    // The mode argument is what makes this visible: bundler resolves it fine.
    files: fixtureFiles({ 'dist/index.d.ts': `export * from './state';\n` }),
    expect: ['[nodenext]', 'TS2834', "Did you mean './state.js'"],
    reject: ['[bundler]'],
  },
  {
    name: 'TS2307: a specifier that resolves to nothing at all',
    files: fixtureFiles({ 'dist/index.d.ts': `export * from './gone.js';\n` }),
    expect: ['TS2307'],
  },
  {
    name: 'SELF-REF: importing a subpath the exports map does not declare',
    files: fixtureFiles({
      'dist/index.d.ts': `import type { X } from '@kitn.ai/ui/internal';\nexport * from './state.js';\nexport type { X2 } from './state.js';\n`,
    }),
    expect: ['@kitn.ai/ui/internal', 'exports'],
    reject: ['TS7016'],
  },
  {
    name: 'a self-reference to a DECLARED subpath is clean',
    files: fixtureFiles({
      'dist/index.d.ts': `import type { S } from '@kitn.ai/ui/state';\nexport * from './state.js';\nexport type { S2 } from './state.js';\n`,
    }),
    expect: [],
  },
  {
    name: 'VACUITY: dist/ exists but holds no .d.ts',
    files: { 'package.json': JSON.stringify({ name: '@kitn.ai/ui', type: 'module' }), 'dist/index.js': 'export const x = 1;\n' },
    expect: ['found NO .d.ts file'],
  },
  {
    name: 'VACUITY: .d.ts files exist but not one relative specifier among them',
    files: fixtureFiles({
      'dist/index.d.ts': `export type A = 1;\n`,
      'dist/state.d.ts': `export type S = 2;\n`,
      'dist/local.d.ts': `export type L = 3;\n`,
    }),
    expect: ['NO relative specifier', 'resolver zero times'],
  },
  {
    name: 'no dist/ at all',
    files: { 'package.json': JSON.stringify({ name: '@kitn.ai/ui', type: 'module' }) },
    expect: ['dist/ not found'],
  },
];

/** Flatten a verdict into the text the self-test matches against. */
const verdictText = (v) =>
  [
    ...v.fatal,
    ...v.escapes.map((e) => `ESCAPE ${e.file} imports '${e.spec}' -> ${e.target}`),
    ...v.dangling.map((e) => `${e.file} imports '${e.spec}' -> ${e.reason}`),
    ...v.badSelfRefs.map((e) => `${e.file} imports '${e.spec}' — not in exports`),
  ].join('\n');

const findingCount = (v) => v.fatal.length + v.escapes.length + v.dangling.length + v.badSelfRefs.length;

if (SELF_TEST) {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const verdict = checkTree(writeFixture(c.files));
    const text = verdictText(verdict);
    const missingExpected = c.expect.filter((s) => !text.includes(s));
    const wrongfullyPresent = (c.reject ?? []).filter((s) => text.includes(s));
    const cleanMismatch = c.expect.length === 0 && findingCount(verdict) > 0;
    const ok = missingExpected.length === 0 && wrongfullyPresent.length === 0 && !cleanMismatch;
    if (!ok) failed++;
    const got = findingCount(verdict) === 0 ? 'clean' : `${findingCount(verdict)} finding(s)`;
    console.log(
      `${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect.length === 0 ? 'clean' : c.expect.map((s) => `"${s}"`).join(' + ')}, got ${got})`,
    );
    if (missingExpected.length > 0) console.log(`    missing: ${missingExpected.map((s) => `"${s}"`).join(', ')}`);
    if (wrongfullyPresent.length > 0) console.log(`    fired for the wrong reason: ${wrongfullyPresent.map((s) => `"${s}"`).join(', ')}`);
    if (cleanMismatch) console.log(`    unexpected: ${text.split('\n')[0]}`);
  }
  if (failed > 0) {
    console.error(`\n✗ verify-dts-boundaries self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(
    `\n✓ verify-dts-boundaries self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
const { fatal, escapes, dangling, badSelfRefs, files, relativeSpecifiers } = checkTree(PKG_ROOT);

if (fatal.length === 0 && escapes.length === 0 && dangling.length === 0 && badSelfRefs.length === 0) {
  console.log(
    `✓ dts boundaries: ${files.length} emitted .d.ts files reference nothing outside dist/,\n` +
      `  and every one of ${relativeSpecifiers} relative specifiers in them resolves to declarations\n` +
      '  under BOTH `bundler` and `nodenext` (ESM) resolution.',
  );
  process.exit(0);
}

for (const f of fatal) console.error(`✗ ${f}\n`);

if (escapes.length > 0) {
  console.error(
    `✗ ${escapes.length} declaration reference(s) ESCAPE dist/ — these only resolve because raw src/ still ships:\n`,
  );
  for (const e of escapes) {
    console.error(`  ${e.file}`);
    console.error(`      imports '${e.spec}'  ->  ${e.target}`);
  }
  console.error('');
}

if (dangling.length > 0) {
  console.error(
    `✗ ${dangling.length} declaration reference(s) point inside dist/ but do NOT resolve to declarations:\n`,
  );
  for (const e of dangling) {
    console.error(`  ${e.file}`);
    console.error(`      imports '${e.spec}'  ->  ${e.reason}`);
  }
  console.error(
    '\n  A consumer compiling with `skipLibCheck: false` sees these as hard errors.\n' +
      '  Fix by emitting a declaration where tsc actually looks — for a bundled subpath\n' +
      '  entry `dist/x.js`, that means a SIBLING `dist/x.d.ts`, not `dist/x/index.d.ts`.\n',
  );
}

if (badSelfRefs.length > 0) {
  console.error(
    `✗ ${badSelfRefs.length} self-reference(s) to a subpath that package.json "exports" does not declare:\n`,
  );
  for (const e of badSelfRefs) console.error(`  ${e.file}  imports '${e.spec}'`);
  console.error('');
}

console.error(
  'Emitted declarations must point at compiled dist/ output, or at a public\n' +
    'package subpath listed in the exports map.',
);
process.exit(1);
