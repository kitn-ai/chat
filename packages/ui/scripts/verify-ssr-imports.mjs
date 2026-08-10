// Server-import guard: every public entry in the exports map must be IMPORTABLE
// under Node's `node` condition.
//
// WHY IT EXISTS
// -------------
// Importing `@kitn.ai/ui` on a server threw
//   Client-only API called on the server side.
// and hard-failed any SSR / prerender / RSC pass that touched a value export —
// on every published version up to and including 0.19.0. dist/index.js is
// compiled with Solid's DOM transform (121 module-scope `template("<div>")`
// calls, 24 module-scope `delegateEvents([...])` calls) while leaving solid-js
// external; under Node `solid-js/web` resolves to Solid's SERVER build, where
// `template` is the `notSup` stub. Nothing in the repo ever imported the built
// package under the `node` condition, so nothing caught it. This does.
//
// WHAT IT ASSERTS
// ---------------
// Entries are derived from package.json "exports", not hardcoded, so a NEW
// subpath is covered the day it is added.
//
//   REQUIRED  — every non-wildcard JS entry must import with no error.
//   SHAPED    — the ./elements/* wildcard family (the per-element registration
//               modules) is compiled DOM-only by design: each one calls
//               `customElements.define` and Solid's `delegateEvents(events,
//               doc = window.document)` at module scope, so it cannot be imported
//               without a DOM. That is a separate, still-open limitation. Rather
//               than pretend, this guard asserts they fail ONLY for that known
//               reason — a missing file, a bad specifier or a broken chunk
//               reference still fails the build.
//
// Each entry is imported in its OWN child process, so one entry cannot mask
// another's failure via shared module state or a global it installed.
//
// No network, no install. Needs a build first.
//   node scripts/verify-ssr-imports.mjs [--verbose]
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.name;

// The per-element registration modules are DOM-only by design (see header).
// These are the errors that limitation legitimately produces; anything else is
// a packaging bug.
const CLIENT_ONLY_ERRORS = [
  'window is not defined',
  'document is not defined',
  'customElements is not defined',
  'navigator is not defined',
  'HTMLElement is not defined',
  'Client-only API called on the server side',
];

const fail = (msg) => {
  console.error(`\n✗ verify-ssr-imports: ${msg}\n`);
  process.exit(1);
};

if (!existsSync(resolve(ROOT, 'dist/index.js'))) {
  fail('dist/index.js not found — run `nx build ui` first.');
}

// ---------------------------------------------------------------- entry list
// Walk the exports map. A subpath is testable if SOME condition resolves to a
// .js file; `types`/.css/.json targets are not importable code.
const isJs = (t) => typeof t === 'string' && t.endsWith('.js');
const jsTargets = (node) => {
  if (typeof node === 'string') return isJs(node) ? [node] : [];
  if (Array.isArray(node)) return node.flatMap(jsTargets);
  if (node && typeof node === 'object') {
    return Object.entries(node)
      .filter(([cond]) => cond !== 'types')
      .flatMap(([, v]) => jsTargets(v));
  }
  return [];
};

const required = [];
const wildcards = [];
for (const [subpath, node] of Object.entries(pkg.exports ?? {})) {
  if (jsTargets(node).length === 0) continue;
  if (subpath.includes('*')) wildcards.push(subpath);
  else required.push(subpath === '.' ? NAME : `${NAME}/${subpath.slice(2)}`);
}
if (required.length === 0) fail('no importable entries found in package.json "exports" — the guard would assert nothing.');

// Expand each wildcard subpath against what the build actually emitted, so the
// list tracks the element set instead of drifting from it.
const shaped = [];
for (const subpath of wildcards) {
  const pattern = jsTargets(pkg.exports[subpath])[0]; // e.g. ./dist/elements/*.js
  const [prefix, suffix] = pattern.split('*');
  // `prefix` already ends at the directory boundary ("./dist/elements/"), so
  // dirname() would climb one level too far and glob all of dist/.
  const dir = resolve(ROOT, prefix.endsWith('/') ? prefix : dirname(prefix));
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(suffix)) continue;
    const stem = file.slice(0, -suffix.length);
    shaped.push(`${NAME}/${subpath.slice(2).replace('*', stem)}`);
  }
}

// ------------------------------------------------------------- probe harness
// A temp package OUTSIDE the repo whose only dependency is a link to the built
// package, so every specifier resolves through the real exports map. Node's
// default ESM conditions are exactly ["node", "import"] — the SSR case.
const tmp = mkdtempSync(join(tmpdir(), 'kai-ssr-imports-'));
const scope = join(tmp, 'node_modules', NAME.split('/')[0]);
mkdirSync(scope, { recursive: true });
symlinkSync(ROOT, join(tmp, 'node_modules', NAME));
writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'ssr-import-probe', private: true, type: 'module' }));

const importUnderNode = (specifier) => {
  const src = `try { await import(${JSON.stringify(specifier)}); console.log('__OK__'); }
               catch (e) { console.log('__ERR__' + (e && e.message ? e.message : String(e)).split('\\n')[0]); }`;
  const r = spawnSync(process.execPath, ['--conditions=node', '--input-type=module', '-e', src], {
    cwd: tmp,
    encoding: 'utf8',
    timeout: 60_000,
  });
  const out = `${r.stdout}`;
  if (out.includes('__OK__')) return null;
  const marked = out.split('__ERR__')[1];
  if (marked) return marked.trim();
  // Crashed before our own handler could report (e.g. a parse error).
  return (`${r.stderr}`.split('\n').find((l) => /Error/.test(l)) || `exited with status ${r.status}`).trim();
};

let broken = 0;
try {
  console.log(`verify-ssr-imports: ${required.length} required entries, ${shaped.length} client-only element entries\n`);

  for (const specifier of required.sort()) {
    const err = importUnderNode(specifier);
    if (err) {
      broken++;
      console.log(`  ✗ ${specifier}\n      ${err}`);
    } else {
      console.log(`  ✓ ${specifier}`);
    }
  }

  const unexpected = [];
  for (const specifier of shaped.sort()) {
    const err = importUnderNode(specifier);
    if (err && !CLIENT_ONLY_ERRORS.some((known) => err.includes(known))) {
      unexpected.push(`${specifier}\n      ${err}`);
    } else if (VERBOSE) {
      console.log(`  ${err ? '·' : '✓'} ${specifier}${err ? ` (client-only: ${err})` : ''}`);
    }
  }
  if (unexpected.length) {
    broken += unexpected.length;
    console.log(`\n  ${unexpected.length} element subpath(s) failed for a reason OTHER than being DOM-only:`);
    for (const u of unexpected) console.log(`  ✗ ${u}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (broken > 0) {
  fail(
    `${broken} public entr${broken === 1 ? 'y is' : 'ies are'} not importable under the \`node\` condition.\n` +
      '  An SSR / prerender / RSC pass that touches one of these hard-fails for the consumer.',
  );
}
console.log(`\n✓ verify-ssr-imports: all ${required.length} required entries import cleanly under \`node\`.`);
