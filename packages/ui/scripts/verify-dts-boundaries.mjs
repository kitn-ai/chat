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
 * `"type": "module"`). If this check ever goes quiet, verify it can still fail:
 * strip the extensions back off one dist/*.d.ts and confirm it goes red.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(pkgRoot, 'dist');
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
const selfName = pkg.name;

/** Subpaths this package publicly declares — a self-import must hit one of these. */
const exportedSubpaths = Object.keys(pkg.exports ?? {}).map((k) =>
  k === '.' ? selfName : `${selfName}/${k.slice(2)}`,
);

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

function matchesExport(specifier) {
  if (specifier === selfName) return exportedSubpaths.includes(selfName);
  for (const sub of exportedSubpaths) {
    if (sub.endsWith('/*')) {
      if (specifier.startsWith(sub.slice(0, -1))) return true;
    } else if (specifier === sub) return true;
  }
  return false;
}

if (!statSync(distRoot, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`✗ dist/ not found at ${distRoot} — run \`nx build ui\` first.`);
  process.exit(1);
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
 *
 * @returns {{ok: true} | {ok: false, reason: string}}
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

function resolvesToDeclarations(spec, containingFile) {
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

const escapes = [];
const dangling = [];
const badSelfRefs = [];
const files = walk(distRoot);

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const spec of specifiersOf(text)) {
    if (spec.startsWith('.')) {
      const target = resolve(dirname(file), spec);
      const rel = relative(distRoot, target);
      if (rel.startsWith('..') || rel.startsWith(`..${sep}`)) {
        escapes.push({ file: relative(pkgRoot, file), spec, target: relative(pkgRoot, target) });
      } else {
        // Inside dist/ — but does a consumer's tsc actually get TYPES from it?
        const verdict = resolvesToDeclarations(spec, file);
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

if (escapes.length === 0 && dangling.length === 0 && badSelfRefs.length === 0) {
  console.log(
    `✓ dts boundaries: ${files.length} emitted .d.ts files reference nothing outside dist/,\n` +
      '  and every relative specifier in them resolves to declarations under BOTH\n' +
      '  `bundler` and `nodenext` (ESM) resolution.',
  );
  process.exit(0);
}

if (escapes.length > 0) {
  console.error(
    `✗ ${escapes.length} declaration reference(s) escape dist/ — these only resolve because raw src/ still ships:\n`,
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
    `"${selfName}" subpath listed in the exports map.`,
);
process.exit(1);
