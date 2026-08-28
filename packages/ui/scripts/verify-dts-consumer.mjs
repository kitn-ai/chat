#!/usr/bin/env node
// End-to-end proof that our shipped TYPES actually type-check in a consumer app,
// in every module-resolution mode consumers compile in.
//
// WHY IT EXISTS
// -------------
// `verify:dts` reasons about dist/ with ts.resolveModuleName. That is fast and
// runs in the build, but it is still OUR model of resolution. This script asks
// the only authority that counts: a real tsc, in a real app, against a real
// tarball, resolving through the published exports map.
//
// It exists because a whole class of failure is INVISIBLE to every other check we
// have. In 0.19.0 the emitted declarations re-exported './read', './encode' and
// friends with no file extension. `bundler` tolerates that; `node16`/`nodenext`
// rejects it (TS2834); and `skipLibCheck: true` — on in every Vite template —
// SUPPRESSES the rejection and quietly types the re-exported names as `any`.
// Measured on 0.19.0, same file, only the resolution mode changed:
//
//     bundler  -> const x: OpenAIWireMessage = 12345   errors TS2322  (correct)
//     nodenext -> const x: OpenAIWireMessage = 12345   compiles clean (bug)
//
// No error, no warning — the entire public API just stops being checked. The kit's
// own typecheck cannot see this (it compiles src/, not dist/, under its own
// tsconfig), and the unit suite cannot see it either.
//
// BOTH DIRECTIONS, OR IT PROVES NOTHING
// -------------------------------------
// A guard that only asserts "wrong code errors" is satisfied by a package whose
// types are broken into errors across the board. A guard that only asserts "right
// code compiles" is satisfied by types that are entirely `any` — the actual bug.
// So every mode runs BOTH:
//
//   negative.ts  a wrong assignment per affected entry -> MUST error (types live)
//   positive.ts  correct usage across entries          -> MUST compile (types right)
//
// Needs network (npm install into a temp dir). CI, not `npm run build`.
//   node scripts/verify-dts-consumer.mjs [--keep]
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readPackedFilename } from '../../../scripts/pack-listing.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEEP = process.argv.includes('--keep');

/** Named in every pack-shape failure; it is the fact that explains them. */
const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();

const step = (msg) => console.log(`  · ${msg}`);
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

if (!existsSync(resolve(ROOT, 'dist/index.d.ts'))) {
  console.error('\n✗ verify-dts-consumer: dist/ not built — run `nx build ui` first.\n');
  process.exit(1);
}

/**
 * The modes a consumer actually compiles in.
 *
 * `node` (node10) is deliberately ABSENT: it predates the `exports` field
 * entirely, so it cannot resolve ANY subpath of this package and reports TS2307
 * with "Consider updating to 'node16', 'nodenext', or 'bundler'". That is true of
 * this package before and after this fix, and is not something declaration emit
 * can address.
 */
const MODES = [
  { label: 'bundler', module: 'esnext', moduleResolution: 'bundler' },
  { label: 'nodenext', module: 'nodenext', moduleResolution: 'nodenext' },
];

/**
 * One deliberately wrong assignment per entry point whose declarations reach
 * other files through RELATIVE specifiers — the entries this bug class affects.
 * (`./elements`, `./elements/*` and `./autoloader` are generated self-contained,
 * with no relative specifiers, so there is nothing to degrade.)
 *
 * Each type is re-exported ACROSS a relative specifier, which is what makes it a
 * detector: if that specifier stops resolving, the type becomes `any` and the
 * wrong assignment stops erroring.
 */
/**
 * The probe type for each entry, and the entries that deliberately have none.
 *
 * THE LIST OF ENTRIES IS DERIVED from the package's own `exports` map, the same
 * walk `verify-ssr-imports.mjs` does, because a hand-typed list is a gate that
 * silently skips whatever was added after it was written -- which is exactly what
 * happened: `./diagnostics` shipped and this check kept reporting six clean
 * entries without ever looking at it.
 *
 * A probe TYPE cannot be derived (nothing in package.json names one), so it stays
 * declared here -- but an entry that is neither probed nor explicitly excluded is
 * a HARD FAILURE rather than a skip. That is what turns "someone forgot" from an
 * invisible gap into a red build naming the missing entry.
 */
const PROBE_TYPES = {
  '.': 'ModelOption',
  './react': 'KaiChatController',
  './solid': 'InputProps',
  './state': 'ChatMessage',
  './wire': 'OpenAIWireMessage',
  './provider': 'CardBridge',
  './diagnostics': 'KaiDevtoolsHook',
  './define': 'WebComponentContext',
  './construct': 'Construct',
  // BuildableTemplate's `starter` field is typed `Construct`, imported into
  // templates.d.ts across a relative specifier to schema.d.ts — the same
  // resolution path `./construct` itself depends on. TemplateId was the
  // other candidate but it's a pure string-literal union defined entirely
  // inside templates.ts, with zero cross-file dependency, so it would
  // exercise nothing this guard cares about.
  './construct/templates': 'BuildableTemplate',
};

/** Entries whose declarations reach nothing through a RELATIVE specifier, so
 *  there is no degradation for this bug class to cause. Each needs its reason. */
const NO_RELATIVE_SPECIFIERS = {
  './elements': 'generated self-contained',
  './elements/*': 'generated self-contained',
  './autoloader': 'generated self-contained',
  './schemas': 'generated self-contained',
  './schemas/*': 'generated self-contained',
};

/** A subpath is testable if SOME condition resolves to a .js file; `types`, .css
 *  and .json targets are not importable code. Mirrors verify-ssr-imports.mjs. */
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

const consumerPkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const probed = [];
const unregistered = [];
for (const [subpath, node] of Object.entries(consumerPkg.exports ?? {})) {
  if (jsTargets(node).length === 0) continue;
  if (NO_RELATIVE_SPECIFIERS[subpath]) continue;
  if (PROBE_TYPES[subpath]) {
    probed.push([subpath, PROBE_TYPES[subpath]]);
    continue;
  }
  unregistered.push(subpath);
}

if (unregistered.length > 0) {
  console.error(
    `\n✗ verify-dts-consumer: ${unregistered.length} exported entry point(s) have no declaration probe:\n` +
      unregistered.map((s) => `    ${s}`).join('\n') +
      '\n\n  Add a type to PROBE_TYPES (a type this entry re-exports across a RELATIVE\n' +
      '  specifier, so it degrades to `any` when resolution breaks), or add the entry to\n' +
      '  NO_RELATIVE_SPECIFIERS with the reason it cannot degrade.\n',
  );
  process.exit(1);
}
if (probed.length === 0) {
  console.error('\n✗ verify-dts-consumer: no probed entries — the guard would assert nothing.\n');
  process.exit(1);
}

const PKG_NAME = consumerPkg.name;
const specifierOf = (subpath) => (subpath === '.' ? PKG_NAME : `${PKG_NAME}/${subpath.slice(2)}`);

const NEGATIVE = [
  '// Every line here MUST error. A clean compile means the types degraded to `any`.',
  ...probed.map(([subpath, type]) => `import type { ${type} } from '${specifierOf(subpath)}';`),
  '',
  ...probed.map(([, type], i) => `export const probe${i}: ${type} = 12345;`),
  '',
].join('\n');

const POSITIVE = `// Correct usage. MUST compile clean, or the fix broke real consumers.
import type { OpenAIWireMessage, AnthropicWireMessage, ModelTurn } from '@kitn.ai/ui/wire';
import { toOpenAIMessages, readModelStream } from '@kitn.ai/ui/wire';
import { appendTextPart, createAssistantStream } from '@kitn.ai/ui/state';
import type { ChatMessage } from '@kitn.ai/ui/state';

export const msg: OpenAIWireMessage = { role: 'user', content: 'hi' };
export const amsg: AnthropicWireMessage = { role: 'user', content: [{ type: 'text', text: 'hi' }] };
export const thread: ChatMessage[] = [
  { id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
];
export const encoded = toOpenAIMessages(thread);
export const stream = createAssistantStream;
export const append = appendTextPart;
export const read: typeof readModelStream = readModelStream;
export type Turn = ModelTurn;
`;

// Temp dir deliberately OUTSIDE the repo: a consumer resolves @kitn.ai/ui from its
// own node_modules, with no workspace links or repo tsconfig in scope.
const tmp = mkdtempSync(join(tmpdir(), 'kai-dts-consumer-'));
const app = join(tmp, 'app');
const failures = [];

try {
  console.log(`\nverify-dts-consumer — ${tmp}`);

  step('npm pack');
  // Shape-normalised: npm 12 made the top level an object keyed by package name,
  // so `JSON.parse(raw)[0]` — what stood here — is `undefined` under it. See
  // <repo>/scripts/pack-listing.mjs.
  const { filename } = readPackedFilename(
    run('npm', ['pack', '--json', '--pack-destination', tmp], ROOT),
    { npmVersion },
  );

  // UNIQUE tarball filename. npm serves a CACHED tarball when the name repeats, so
  // reusing `kitn.ai-ui-<version>.tgz` can silently install a PREVIOUS build and
  // verify code that is not the code under test.
  const original = join(tmp, filename);
  const tarball = join(tmp, `kai-dts-${Date.now()}-${process.pid}.tgz`);
  run('mv', [original, tarball], tmp);

  mkdirSync(join(app, 'src'), { recursive: true });
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify(
      { name: 'kai-dts-consumer', private: true, version: '0.0.0', type: 'module' },
      null,
      2,
    ),
  );
  writeFileSync(join(app, 'src/negative.ts'), NEGATIVE);
  writeFileSync(join(app, 'src/positive.ts'), POSITIVE);

  step('npm install (tarball + typescript)');
  run('npm', ['install', '--no-audit', '--no-fund', tarball, 'typescript@5'], app);

  // Prove the INSTALLED package is the one we just built, not a cached tarball.
  const installedWire = join(app, 'node_modules/@kitn.ai/ui/dist/wire/index.d.ts');
  const installed = readFileSync(installedWire, 'utf8');
  const extensionless = [...installed.matchAll(/\bfrom\s*['"](\.[^'"]*)['"]/g)].filter(
    ([, s]) => !/\.(js|mjs|cjs|json|css)$/.test(s),
  );
  if (extensionless.length > 0) {
    failures.push(
      `installed dist/wire/index.d.ts still has ${extensionless.length} extensionless ` +
        `relative specifier(s) (e.g. '${extensionless[0][1]}') — stale tarball, or the ` +
        'extension pass in scripts/emit-subpath-dts.mjs did not run.',
    );
  } else {
    step('installed declarations carry explicit extensions');
  }

  const tsc = (file, mode) => {
    try {
      run(
        'npx',
        [
          'tsc', '--noEmit',
          '--target', 'ES2022',
          '--lib', 'ES2022,DOM,DOM.Iterable',
          '--module', mode.module,
          '--moduleResolution', mode.moduleResolution,
          '--strict',
          '--skipLibCheck', // the realistic consumer default, and what hid the bug
          `src/${file}`,
        ],
        app,
      );
      return { errored: false, output: '' };
    } catch (err) {
      return { errored: true, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  };

  for (const mode of MODES) {
    // NEGATIVE — every entry must still be type-checked.
    const neg = tsc('negative.ts', mode);
    const errorLines = neg.output.split('\n').filter((l) => /error TS/.test(l));
    const expected = NEGATIVE.split('\n').filter((l) => l.startsWith('export const')).length;
    if (!neg.errored) {
      failures.push(
        `[${mode.label}] negative.ts COMPILED CLEAN — the public API is typed as \`any\`. ` +
          'Declarations are not resolving in this mode; consumers get no type-checking at all.',
      );
    } else if (errorLines.length < expected) {
      failures.push(
        `[${mode.label}] negative.ts errored on only ${errorLines.length}/${expected} entries — ` +
          `the rest degraded to \`any\`:\n${neg.output.trim()}`,
      );
    } else {
      step(`[${mode.label}] negative: ${errorLines.length}/${expected} entries type-checked ✓`);
    }

    // POSITIVE — correct usage must still compile.
    const pos = tsc('positive.ts', mode);
    if (pos.errored) {
      failures.push(`[${mode.label}] positive.ts FAILED to compile:\n${pos.output.trim()}`);
    } else {
      step(`[${mode.label}] positive: correct usage compiles clean ✓`);
    }
  }
} catch (err) {
  failures.push(`unexpected failure: ${err.message}\n${err.stdout ?? ''}${err.stderr ?? ''}`);
} finally {
  if (KEEP) console.log(`\n  (kept ${tmp})`);
  else rmSync(tmp, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('\n✗ verify-dts-consumer FAILED:\n');
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log(
  `\n✓ dts consumer: shipped types type-check in a real app under ` +
    `${MODES.map((m) => m.label).join(' + ')} — wrong code errors, correct code compiles.\n`,
);
