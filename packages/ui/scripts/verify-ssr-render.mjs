// Server-RENDER guard: every component a server entry exports must survive being
// EXECUTED in a DOM-free Node process, not merely imported by one.
//
// WHY IT EXISTS
// -------------
// verify-ssr-imports.mjs (which runs first, from the same `verify:ssr` script)
// proves the module graph RESOLVES under the `node` condition. That is a real
// check and it caught a real bug, but it never runs a component. A DOM global
// read at component-BODY scope sails straight through it: the module imports
// clean, and the process only dies when something renders.
//
// Measured on this tree, not assumed. Planting one line in `Skeleton` —
//
//     const coarse = document.documentElement.dataset.theme === 'dark';
//
// — left verify-ssr-imports at "all 9 required entries import cleanly under
// `node`", exit 0, while a real renderToString of the same built entry threw
// `document is not defined`. That green is the bug this file closes.
//
// WHAT IT ASSERTS
// ---------------
// For every entry that ships a SERVER TWIN, every PascalCase function export is
// rendered through Solid's `renderToString` in a child process with no DOM.
//
//   VIOLATION — the render threw a ReferenceError, or reached Solid's
//               client-only stub, or installed a browser global on globalThis.
//               A ReferenceError during render is never legitimate, so the rule
//               needs no allowlist and cannot drift; the browser-global list in
//               the probe only shapes the message.
//   UNREACHED — neither props shape got through the body (a part rendered
//               outside the parent that provides its context). Reported on every
//               run, never counted as covered — see the coverage note below.
//
// Each component is rendered with `{}` first, and, if that stops on a missing
// prop, once more with a permissive props proxy. See ssr-render-probe.mjs for
// what that buys and what it costs.
//
// Entries are derived, not listed: an entry is renderable when its `node`
// condition resolves to a DIFFERENT file than its default one. That is exactly
// the set built with Solid's SSR transform (vite.config.barrel.server.ts,
// vite.config.solid.server.ts), it is the set a server actually loads, and a new
// Solid entry with a server twin picks up this coverage on the day it is added.
//
// THE GUARD PROVES ITSELF ON EVERY RUN
// ------------------------------------
// Before it renders anything real, the probe renders two canaries defined in
// ssr-render-probe.mjs: one that reads `document` at body scope, which MUST be
// classified a violation, and one that does not, which MUST return non-empty
// markup. So a harness that quietly stopped working — a DOM shim reaching the
// probe, a mismatched solid-js instance making `renderToString` a no-op, an SSR
// build that stopped emitting — goes RED here instead of green-and-empty. This
// repo's dominant failure mode is a guard nobody ever watched fail; this is that
// watch, run every time.
//
// WHAT IT DOES NOT CATCH, MEASURED
// --------------------------------
//  - `navigator`. Node >= 21 defines it (v22.22.3 here), as do Deno and Workers,
//    so `navigator.maxTouchPoints > 0` does NOT crash a server render — it
//    silently evaluates to `false`. Verified by planting exactly that line and
//    watching the render pass. It is a wrong-markup / hydration-mismatch bug, a
//    different subject needing a DOM-vs-SSR output diff, and deliberately out of
//    scope here rather than covered by a trap that would also fire on correctly
//    guarded `typeof navigator !== 'undefined'` code.
//  - The components it reports as UNREACHED. Measured on this tree: 33 of 127 on
//    "." and 38 of 166 on "./solid". Nearly all are context PARTS —
//    `DropdownItem`, `CollapsibleTrigger`, `ContextTrigger`, `SourceContent` —
//    which throw "must be used within <X>" before their body runs, and no props
//    object can satisfy that; they would need to be rendered inside their parent,
//    which means a fixture per family. Their parents ARE rendered, so the parts
//    are covered on whatever path the parent renders them. The count is printed
//    on every run, and `--verbose` names them, so this gap stays visible instead
//    of being a number in a comment nobody re-measures.
//  - Untaken branches. Only the paths the two props shapes take are executed, so
//    a `<Show>` fallback or an `onClick` body is not reached. Children ARE
//    covered: SSR runs nested components eagerly, which is why the planted
//    Skeleton line failed two components per entry, not one.
//  - `onMount` / `createEffect`. They do not run under SSR, and they do not run
//    on a real server either, so DOM access inside them is correct code.
//
// No network, no install. Needs a build first.
//   node scripts/verify-ssr-render.mjs [--verbose]
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const VERBOSE = process.argv.includes('--verbose');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.name;

const fail = (msg) => {
  console.error(`\n✗ verify-ssr-render: ${msg}\n`);
  process.exit(1);
};

if (!existsSync(resolve(ROOT, 'dist/index.js'))) {
  fail('dist/index.js not found — run `nx build ui` first.');
}

// ---------------------------------------------------------------- entry list
// Resolve an exports node the way Node does: first matching key wins, in
// declaration order. `types` never matches at runtime.
const targetFor = (node, conditions) => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    for (const n of node) {
      const t = targetFor(n, conditions);
      if (t) return t;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    for (const [cond, value] of Object.entries(node)) {
      if (cond === 'types') continue;
      if (cond !== 'default' && !conditions.includes(cond)) continue;
      const t = targetFor(value, conditions);
      if (t) return t;
    }
  }
  return null;
};

const renderable = [];
for (const [subpath, node] of Object.entries(pkg.exports ?? {})) {
  if (subpath.includes('*')) continue;
  const server = targetFor(node, ['node', 'import']);
  const client = targetFor(node, []);
  if (!server || !server.endsWith('.js')) continue;
  if (server === client) continue; // no server twin — not an SSR-transformed entry
  renderable.push({
    specifier: subpath === '.' ? NAME : `${NAME}/${subpath.slice(2)}`,
    server,
  });
}

if (renderable.length === 0) {
  fail(
    'no entry in package.json "exports" resolves to a server twin under the `node` condition,\n' +
      '  so this guard would render nothing. If the server builds were intentionally dropped,\n' +
      '  delete this guard deliberately rather than letting it pass empty.',
  );
}

// ------------------------------------------------------------- probe harness
// A temp package OUTSIDE the repo. `@kitn.ai/ui` is symlinked so every specifier
// resolves through the real exports map; `solid-js` is symlinked from wherever
// the package itself resolves it, so the probe's `renderToString` and the
// bundle's `createComponent` are the SAME module instance (Node resolves
// symlinks to their realpath, which is what makes that hold).
const solidDir = dirname(createRequire(join(ROOT, 'package.json')).resolve('solid-js/package.json'));

const tmp = mkdtempSync(join(tmpdir(), 'kai-ssr-render-'));
mkdirSync(join(tmp, 'node_modules', NAME.split('/')[0]), { recursive: true });
symlinkSync(ROOT, join(tmp, 'node_modules', NAME));
symlinkSync(solidDir, join(tmp, 'node_modules', 'solid-js'));
writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'ssr-render-probe', private: true, type: 'module' }));
copyFileSync(join(HERE, 'ssr-render-probe.mjs'), join(tmp, 'probe.mjs'));

const runProbe = (specifier) => {
  const r = spawnSync(process.execPath, ['--conditions=node', join(tmp, 'probe.mjs'), specifier], {
    cwd: tmp,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const events = [];
  for (const line of `${r.stdout}`.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* a stray write is not an event */
    }
  }
  return { events, stderr: `${r.stderr}`, status: r.status, signal: r.signal };
};

let violations = 0;
let harnessFailures = 0;
const problems = [];

try {
  console.log(`verify-ssr-render: ${renderable.length} entr${renderable.length === 1 ? 'y' : 'ies'} with a server twin\n`);

  for (const { specifier, server } of renderable) {
    const { events, stderr, status, signal } = runProbe(specifier);
    const of = (t) => events.filter((e) => e.t === t);
    const results = of('result');
    const done = of('done')[0];
    const selftest = of('selftest')[0];
    const meta = of('meta')[0];

    console.log(`  ${specifier}  →  ${server}`);

    // The self-test first: if the harness cannot catch its own canary, nothing
    // it says about the real components means anything.
    if (!selftest) {
      harnessFailures++;
      problems.push(
        `${specifier}: the probe never reported its self-test` +
          `${signal ? ` (killed by ${signal})` : ''} — exit ${status}.\n      ${stderr.split('\n').filter(Boolean).slice(-3).join('\n      ')}`,
      );
      continue;
    }
    if (!selftest.detects || !selftest.renders || !selftest.markup) {
      harnessFailures++;
      problems.push(
        `${specifier}: the render harness FAILED ITS OWN SELF-TEST — ` +
          `detects-a-planted-DOM-read=${selftest.detects}, renders-a-clean-component=${selftest.renders}, ` +
          `produced-markup=${selftest.markup}.\n` +
          '      Every result below it is meaningless until that is fixed. Likely causes: a DOM shim\n' +
          '      reaching the probe, a second solid-js instance, or an entry that stopped being SSR-built.',
      );
      continue;
    }
    console.log('    self-test: catches a planted body-scope DOM read, renders a clean component ✓');

    if (!done) {
      harnessFailures++;
      problems.push(
        `${specifier}: the probe died after ${results.length} of ${meta ? meta.total : '?'} components` +
          `${results.length ? `, last was \`${results[results.length - 1].name}\`` : ''}` +
          `${signal ? ` (killed by ${signal})` : ''} — exit ${status}.\n      ${stderr.split('\n').filter(Boolean).slice(-3).join('\n      ')}`,
      );
      continue;
    }

    if (results.length === 0) {
      harnessFailures++;
      problems.push(
        `${specifier}: exports no PascalCase component function, so this entry asserts nothing.\n` +
          '      Either the entry stopped exporting components or the build emitted an empty bundle.',
      );
      continue;
    }

    const ok = results.filter((r) => r.status === 'ok');
    const viaPermissive = ok.filter((r) => r.props === 'permissive');
    const shape = results.filter((r) => r.status === 'shape');
    const bad = results.filter((r) => r.status === 'violation');
    const withMarkup = ok.filter((r) => r.bytes > 0);

    // A pile of clean renders that all produced "" would be the same nothing as
    // not rendering at all.
    if (withMarkup.length === 0) {
      harnessFailures++;
      problems.push(
        `${specifier}: ${ok.length} component(s) "rendered" and every one produced ZERO bytes of markup.\n` +
          '      That is renderToString no-opping, not a clean tree.',
      );
      continue;
    }

    for (const r of bad) {
      violations++;
      problems.push(`${specifier} → ${r.name}  (props: ${r.props})\n      ${r.err}`);
    }

    console.log(
      `    ${results.length} components: ${ok.length} rendered (${withMarkup.length} with markup, ` +
        `${viaPermissive.length} needed permissive props), ${shape.length} unreached, ${bad.length} violation(s)` +
        `${done.asyncErrors ? `, ${done.asyncErrors} async rejection(s) after render` : ''}`,
    );
    if (VERBOSE) {
      for (const r of viaPermissive) console.log(`      ~ ${r.name} — rendered only under permissive props`);
      for (const r of shape) console.log(`      · ${r.name} — UNREACHED: ${r.err}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (violations > 0 || harnessFailures > 0) {
  console.log('');
  for (const p of problems) console.log(`  ✗ ${p}`);
  // Two different failures, kept apart on purpose. "N components cannot render"
  // is a finding about the LIBRARY; "the harness could not measure" is a finding
  // about the GUARD, and reporting the second as the first is how a broken check
  // gets fixed by editing a component.
  const parts = [];
  if (violations > 0) {
    parts.push(
      `${violations} component${violations === 1 ? '' : 's'} cannot be SERVER-RENDERED.\n` +
        '  These import fine and still hard-fail any SSR / prerender / RSC pass that renders them.\n' +
        '  Move the DOM access into onMount/createEffect (which do not run on the server), or\n' +
        '  guard it with `isServer` from solid-js/web.',
    );
  }
  if (harnessFailures > 0) {
    parts.push(
      `${harnessFailures} entr${harnessFailures === 1 ? 'y' : 'ies'} could not be MEASURED.\n` +
        '  The guard is reporting on itself, not on the components: until this is fixed it is\n' +
        '  covering nothing, and a green run would mean nothing.',
    );
  }
  fail(parts.join('\n\n  '));
}
console.log('\n✓ verify-ssr-render: every component exported by a server entry renders without a DOM.');
