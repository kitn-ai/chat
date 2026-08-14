#!/usr/bin/env node
/**
 * Guard: every card JSON Schema must be REACHABLE by a consumer, on both surfaces.
 *
 * WHY IT EXISTS
 * -------------
 * `scripts/copy-card-schemas.mjs` has been copying 11 schemas into `dist/schemas/`
 * on every build, and `files` ships `dist`, so the bytes have been in every
 * published tarball. Nobody could reach any of them: package.json "exports" is a
 * CLOSED map and had no `./schemas` key, so `@kitn.ai/ui/schemas/confirm.schema.json`
 * resolved to ERR_PACKAGE_PATH_NOT_EXPORTED / TS2307 for every consumer.
 *
 * The proof it mattered is in this repo. `examples/internal/openrouter-spike/src/
 * card-schema.ts` HAND-DERIVES the confirm schema, with a comment saying it had to
 * because the kit's schemas are unreachable. Our own reference harness could not
 * use them. That is the shape of the bug: not "missing", but "present, shipped, and
 * addressable by nobody".
 *
 * A GUARD THAT STATS dist/schemas/ WOULD PROVE NOTHING
 * ---------------------------------------------------
 * The files were already there and already unreachable, so existence was never the
 * question. This guard therefore never looks at `dist/schemas/` as a directory. It
 * RESOLVES the public specifiers from a temp package OUTSIDE the repo, symlink-
 * installed into its own `node_modules`, exactly the way a consumer's toolchain
 * would — so every lookup goes through the real "exports" map or fails.
 *
 * BOTH RESOLUTION MODES, WITH THE CONTAINING FILE'S IMPLIED FORMAT
 * ---------------------------------------------------------------
 * Resolution is delegated to the TypeScript compiler (`ts.resolveModuleName`), in
 * the two modes real consumers compile in:
 *
 *   bundler  — this package's own tsconfig, and the Vite / Next / Astro / TanStack
 *              default.
 *   nodenext — the stock `tsconfig.node.json` in Vite's TS templates, i.e. the mode
 *              our own emitted backend routes compile under in a consumer's app.
 *
 * The `mode` argument is LOAD-BEARING and must not be dropped. `verify-dts-
 * boundaries.mjs`'s header documents the measured consequence: under NodeNext with
 * a DEFAULT resolutionMode, specifiers resolve that a real consumer cannot resolve,
 * and the check goes green on a thoroughly broken package. So each specifier is
 * resolved with the probe file's implied module format (`ts.getImpliedNodeFormatForFile`;
 * ESM here, since the probe package is `"type": "module"`).
 *
 * `resolveJsonModule: true` — STATED, NOT LOAD-BEARING, AND THE DIFFERENCE MATTERS
 * ---------------------------------------------------------------------------------
 * Unlike the `mode` argument above, this flag is NOT holding the check up, and it is
 * written down here so nobody promotes it to something it is not. Measured against
 * this package, resolving `@kitn.ai/ui/schemas/confirm.schema.json`:
 *
 *     bundler  / nodenext, resolveJsonModule: true   -> RESOLVED (.json), compiles clean
 *     bundler  / nodenext, resolveJsonModule: false  -> UNRESOLVED, checker reports
 *                                                       TS2732 "Consider using
 *                                                       --resolveJsonModule"
 *     bundler  / nodenext, flag OMITTED               -> RESOLVED — TypeScript 5.x
 *                                                       DEFAULTS it to true in both
 *                                                       of these modes
 *
 * So setting it explicitly matches the default rather than changing the outcome, and
 * removing it would not make this guard go red. It is set to say out loud what the
 * raw-JSON surface asks of a consumer's tsconfig, and to make the third row above
 * discoverable: a consumer who has explicitly turned the flag OFF gets TS2732, which
 * reads like a missing export and is not one. That confusion, plus the Node ESM
 * import attribute and the wrangler rule, is why the JS entry is the PRIMARY surface.
 *
 * TYPESCRIPT IS NOT NODE
 * ----------------------
 * They are two independent implementations of the exports map, so each specifier is
 * additionally resolved by Node itself (`import.meta.resolve`, no execution) from
 * inside the same temp package.
 *
 * THE COUNT IS DERIVED, NOT WRITTEN DOWN
 * --------------------------------------
 * The expected set is `readdirSync('src/primitives/card-schemas')`. A hardcoded 11
 * would pass forever the day someone adds a twelfth, which is the failure mode this
 * repo keeps shipping. For the same reason the JS entry is checked for CONTENT, not
 * just resolvability: an `index.ts` that resolves but forgot the new schema is the
 * same hole one layer in, so every derived name must be present under `cardSchemas`
 * or `contractSchemas` AND be byte-identical to the file on disk.
 *
 * Needs a build first.  node scripts/verify-schemas-exported.mjs
 */
/*
 * PROVING IT STILL DETECTS
 * -----------------------
 * Everything above describes what this notices. None of it is exercised by a green
 * run against a healthy package: resolution succeeding tells you nothing about
 * whether failure would be noticed. The bug it was written for — files shipped,
 * present, and addressable by nobody — looked exactly like a healthy package from
 * every angle except the one nobody was checking.
 *
 *   node scripts/verify-schemas-exported.mjs                      # this package
 *   node scripts/verify-schemas-exported.mjs --self-test          # prove it still detects
 *   node scripts/verify-schemas-exported.mjs --package-root <dir> # any package, e.g. a planted defect
 *
 * `--self-test` builds throwaway PACKAGES under the OS temp dir — a real exports
 * map, a real importable JS entry, real schema files — and plants each defect
 * class separately: the closed exports map with no `./schemas` key (the shipped
 * bug), no `./schemas/*` family, an entry missing a schema, an entry carrying a
 * STALE copy of one, an entry exporting a key with no file behind it, and a raw
 * JSON file whose bytes have drifted from the authored one. A healthy package must
 * draw ZERO.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const SELF_TEST = argv.includes('--self-test');
const PKG_ROOT = resolve(argOf('--package-root') ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'));

/** Key order is not part of the contract; the CONTENT is. */
const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'undefined';
};

const MODES = [
  {
    label: 'bundler',
    opts: {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      resolveJsonModule: true,
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
      resolveJsonModule: true,
      allowJs: true,
    },
    // See the header. Without the containing file's implied format this degrades
    // into a check that goes green on a package a consumer cannot resolve.
    impliedMode: true,
  },
];
const DECLARATION_EXTENSIONS = new Set([ts.Extension.Dts, ts.Extension.Ts, ts.Extension.Tsx]);

/** Node's resolution errors quote two absolute temp paths; neither adds anything. */
const terse = (msg) => msg.replace(/ in \/\S+package\.json/, '').replace(/ imported from \S+/, '');

/**
 * The whole check over ONE package root. Returns its failures and the lines worth
 * printing rather than exiting, so `--self-test` drives the SAME code path over
 * fixture packages. A self-test against a reimplementation would prove nothing.
 */
function checkSchemas(root) {
  const failures = [];
  const out = [];
  const log = (s) => out.push(s);
  const SCHEMA_SRC = join(root, 'src/primitives/card-schemas');

  if (!existsSync(join(root, 'dist'))) {
    return { failures: ['dist/ not found — run `nx build ui` first.'], out };
  }
  if (!existsSync(SCHEMA_SRC)) {
    return {
      failures: [`${relative(root, SCHEMA_SRC)} not found — this guard has nothing to derive its list from.`],
      out,
    };
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  } catch {
    return { failures: [`no readable package.json at ${root}.`], out };
  }
  const NAME = pkg.name;
  /** The subpath the JS entry lives on, and the subpath family the raw JSON lives on. */
  const JS_ENTRY = `${NAME}/schemas`;

  // ------------------------------------------------------------- the derived set
  const schemaFiles = readdirSync(SCHEMA_SRC)
    .filter((f) => f.endsWith('.schema.json'))
    .sort();
  if (schemaFiles.length === 0) {
    return {
      failures: [`no *.schema.json under ${relative(root, SCHEMA_SRC)} — the guard would assert nothing.`],
      out,
    };
  }
  /** `confirm.schema.json` -> `confirm`; `form.result.schema.json` -> `form.result`. */
  const keyOf = (file) => file.slice(0, -'.schema.json'.length);
  const sourceOf = Object.fromEntries(
    schemaFiles.map((f) => [f, JSON.parse(readFileSync(join(SCHEMA_SRC, f), 'utf8'))]),
  );

  // ------------------------------------------------------------- probe harness
  // A temp package OUTSIDE the repo whose only dependency is a link to the built
  // package, so every specifier resolves through the real exports map.
  const tmp = mkdtempSync(join(tmpdir(), 'kai-schemas-exported-'));
  mkdirSync(join(tmp, 'node_modules', NAME.split('/')[0]), { recursive: true });
  symlinkSync(root, join(tmp, 'node_modules', NAME));
  writeFileSync(
    join(tmp, 'package.json'),
    JSON.stringify({ name: 'schemas-export-probe', private: true, type: 'module' }),
  );
  // A REAL file on disk: `ts.getImpliedNodeFormatForFile` reads the enclosing
  // package.json to decide ESM vs CJS, and the answer is the load-bearing argument.
  const probeTs = join(tmp, 'probe.ts');
  writeFileSync(probeTs, '// resolution probe\nexport {};\n');

  /**
   * @param {string} spec
   * @param {'declarations'|'json'} expect
   * @returns {string[]} one reason per mode that failed; empty means every mode is fine
   */
  function tsResolves(spec, expect) {
    const reasons = [];
    for (const { label, opts, impliedMode } of MODES) {
      const mode = impliedMode
        ? ts.getImpliedNodeFormatForFile(probeTs, undefined, ts.sys, opts)
        : undefined;
      const { resolvedModule } = ts.resolveModuleName(spec, probeTs, opts, ts.sys, undefined, undefined, mode);
      if (!resolvedModule) {
        reasons.push(`[${label}] tsc resolves it to nothing (TS2307)`);
        continue;
      }
      const ext = resolvedModule.extension;
      const where = relative(root, resolvedModule.resolvedFileName);
      if (expect === 'json' && ext !== ts.Extension.Json) {
        reasons.push(`[${label}] resolves to ${where} (${ext}) — expected the .json itself`);
      } else if (expect === 'declarations' && !DECLARATION_EXTENSIONS.has(ext)) {
        reasons.push(
          `[${label}] resolves to ${where} (${ext}) — JavaScript with no declaration file beside it (TS7016)`,
        );
      }
    }
    return reasons;
  }

  /** Node's own exports-map implementation, resolution only — nothing is executed. */
  function nodeResolves(specs) {
    const script = join(tmp, 'resolve-probe.mjs');
    writeFileSync(
      script,
      `const specs = ${JSON.stringify(specs)};\n` +
        `const out = {};\n` +
        `for (const s of specs) {\n` +
        `  try { out[s] = { url: import.meta.resolve(s) }; }\n` +
        `  catch (e) { out[s] = { error: (e && e.code ? e.code + ': ' : '') + (e && e.message ? e.message.split('\\n')[0] : String(e)) }; }\n` +
        `}\n` +
        `console.log('__RESOLVE__' + JSON.stringify(out));\n`,
    );
    const r = spawnSync(process.execPath, [script], { cwd: tmp, encoding: 'utf8', timeout: 60_000 });
    const marked = `${r.stdout}`.split('__RESOLVE__')[1];
    if (!marked) return null;
    return JSON.parse(marked.trim());
  }

  /** Import the JS entry under the `node` condition and hand back its schema maps. */
  function readJsEntry() {
    const script = join(tmp, 'entry-probe.mjs');
    writeFileSync(
      script,
      `try {\n` +
        `  const m = await import(${JSON.stringify(JS_ENTRY)});\n` +
        `  console.log('__ENTRY__' + JSON.stringify({ ok: true,\n` +
        `    cardSchemas: m.cardSchemas ?? null, contractSchemas: m.contractSchemas ?? null }));\n` +
        `} catch (e) {\n` +
        `  console.log('__ENTRY__' + JSON.stringify({ ok: false, error: (e && e.message ? e.message : String(e)).split('\\n')[0] }));\n` +
        `}\n`,
    );
    const r = spawnSync(process.execPath, ['--conditions=node', script], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 60_000,
    });
    const marked = `${r.stdout}`.split('__ENTRY__')[1];
    if (!marked) {
      return {
        ok: false,
        error: (`${r.stderr}`.split('\n').find((l) => /Error/.test(l)) || `exited with status ${r.status}`).trim(),
      };
    }
    return JSON.parse(marked.trim());
  }

  // ------------------------------------------------------------------ the checks
  const jsonSpecs = schemaFiles.map((f) => `${JS_ENTRY}/${f}`);
  const brokenJson = []; // { file, spec, reasons[] }
  const brokenEntry = []; // reasons[]
  const contentGaps = []; // strings

  try {
    const nodeVerdict = nodeResolves([JS_ENTRY, ...jsonSpecs]);
    if (!nodeVerdict) {
      return { failures: ['the Node resolution probe did not report.'], out };
    }

    log(
      `verify-schemas-exported: ${schemaFiles.length} schema(s) in ${relative(root, SCHEMA_SRC)}/, ` +
        `resolved from a temp package at ${tmp}\n`,
    );

    // --- Surface A: the JS entry (primary) -----------------------------------
    log(`Surface A — the JS entry \`${JS_ENTRY}\``);
    brokenEntry.push(...tsResolves(JS_ENTRY, 'declarations'));
    if (nodeVerdict[JS_ENTRY].error) brokenEntry.push(`[node] ${terse(nodeVerdict[JS_ENTRY].error)}`);

    const entry = brokenEntry.length === 0 ? readJsEntry() : { ok: false, error: 'not resolvable' };
    if (brokenEntry.length === 0 && !entry.ok) {
      brokenEntry.push(`[node] importing it threw: ${entry.error}`);
    }

    if (brokenEntry.length > 0) {
      log(`  ✗ ${JS_ENTRY}`);
      for (const r of brokenEntry) log(`      ${r}`);
    } else {
      // Resolvable is not the same as complete. Every derived schema must be there,
      // under one of the two maps, and byte-identical to the file on disk.
      const cards = entry.cardSchemas ?? {};
      const contracts = entry.contractSchemas ?? {};
      for (const file of schemaFiles) {
        const key = keyOf(file);
        const inCards = Object.prototype.hasOwnProperty.call(cards, key);
        const inContracts = Object.prototype.hasOwnProperty.call(contracts, key);
        if (!inCards && !inContracts) {
          contentGaps.push(`'${key}' (${file}) is in neither cardSchemas nor contractSchemas`);
          continue;
        }
        if (inCards && inContracts) {
          contentGaps.push(`'${key}' is in BOTH cardSchemas and contractSchemas — pick one`);
          continue;
        }
        const shipped = inCards ? cards[key] : contracts[key];
        if (stable(shipped) !== stable(sourceOf[file])) {
          contentGaps.push(
            `'${key}' does not match ${relative(root, join(SCHEMA_SRC, file))} — the entry is a stale copy, not the file`,
          );
        }
      }
      // …and nothing else. A key with no file behind it is a hand-written schema
      // masquerading as a shipped one, which is the drift this entry exists to end.
      const known = new Set(schemaFiles.map(keyOf));
      for (const key of [...Object.keys(cards), ...Object.keys(contracts)]) {
        if (!known.has(key)) {
          contentGaps.push(`'${key}' is exported but has no ${key}.schema.json in ${relative(root, SCHEMA_SRC)}/`);
        }
      }
      log(
        `  ✓ ${JS_ENTRY}  (resolves to declarations under bundler + nodenext, imports under \`node\`,\n` +
          `      exports ${Object.keys(cards).length} card + ${Object.keys(contracts).length} contract schema(s))`,
      );
      for (const gap of contentGaps) log(`  ✗ ${gap}`);
    }

    // --- Surface B: the raw JSON subpaths (secondary) ------------------------
    log(`\nSurface B — the raw JSON \`${JS_ENTRY}/<name>.schema.json\``);
    for (const file of schemaFiles) {
      const spec = `${JS_ENTRY}/${file}`;
      const reasons = tsResolves(spec, 'json');
      const { url, error } = nodeVerdict[spec];
      if (error) {
        reasons.push(`[node] ${terse(error)}`);
      } else {
        // Resolving is half the claim. The bytes a consumer receives must be the
        // authored file, not a copy `build:schemas` forgot to refresh.
        const shipped = JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
        if (stable(shipped) !== stable(sourceOf[file])) {
          reasons.push(
            `[node] resolves to ${relative(root, fileURLToPath(url))}, whose contents differ from ` +
              `${relative(root, join(SCHEMA_SRC, file))} — a stale copy; run \`npm run build:schemas\``,
          );
        }
      }
      if (reasons.length > 0) {
        brokenJson.push({ file, spec, reasons });
        log(`  ✗ ${file}`);
        for (const r of reasons) log(`      ${r}`);
      } else {
        log(`  ✓ ${file}`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // ----------------------------------------------------------------- the verdict
  if (brokenEntry.length > 0) {
    failures.push(
      `the JS entry \`${JS_ENTRY}\` is not reachable.\n` +
        brokenEntry.map((r) => `    ${r}`).join('\n') +
        '\n  Declare it in packages/ui/package.json "exports":\n' +
        '      "./schemas": { "types": "./dist/schemas/index.d.ts", "default": "./dist/schemas.js" }\n' +
        '  plus "typesVersions" for node10 consumers, then rebuild:\n' +
        '      pnpm exec nx build ui --skip-nx-cache',
    );
  }
  if (contentGaps.length > 0) {
    failures.push(
      `${contentGaps.length} schema(s) resolve but are missing or stale in the JS entry.\n` +
        contentGaps.map((g) => `    ${g}`).join('\n') +
        '\n  Fix packages/ui/src/schemas/index.ts so it imports every file in\n' +
        `  ${relative(root, SCHEMA_SRC)}/ directly — never a hand-copied restatement — then:\n` +
        '      pnpm exec nx build ui --skip-nx-cache',
    );
  }
  if (brokenJson.length > 0) {
    failures.push(
      `${brokenJson.length} of ${schemaFiles.length} card schema(s) ship in the tarball but are not\n` +
        '  reachable, or do not carry the authored bytes:\n' +
        brokenJson.map((b) => `    ${b.file}\n${b.reasons.map((r) => `      ${r}`).join('\n')}`).join('\n') +
        '\n  package.json "exports" is a CLOSED map: a file under dist/ that no key covers\n' +
        '  resolves to ERR_PACKAGE_PATH_NOT_EXPORTED / TS2307, however present it is.\n' +
        '  Declare the raw-JSON family in packages/ui/package.json "exports":\n' +
        '      "./schemas/*": "./dist/schemas/*"\n' +
        '  and make sure `npm run build:schemas` has run, then rebuild.',
    );
  }
  return { failures, out, schemaCount: schemaFiles.length };
}

// ---------------------------------------------------------------------------
// self-test: throwaway PACKAGES with a real exports map, a real importable JS
// entry and real schema files. Without this, a green run says only that a
// healthy package looks healthy.
// ---------------------------------------------------------------------------
const SCHEMA_A = { $id: 'confirm', type: 'object', properties: { ok: { type: 'boolean' } } };
const SCHEMA_B = { $id: 'form.result', type: 'object', properties: { value: { type: 'string' } } };

const entrySource = (cards, contracts = {}) =>
  `export const cardSchemas = ${JSON.stringify(cards, null, 2)};\n` +
  `export const contractSchemas = ${JSON.stringify(contracts, null, 2)};\n`;

const EXPORTS = {
  './schemas': { types: './dist/schemas/index.d.ts', default: './dist/schemas.js' },
  './schemas/*': './dist/schemas/*',
};

/** The healthy fixture package, with `over` merged on top (`null` deletes). */
const fixtureFiles = (over = {}) => ({
  'package.json': JSON.stringify({ name: '@kitn.ai/ui', type: 'module', exports: EXPORTS }, null, 2),
  'src/primitives/card-schemas/confirm.schema.json': JSON.stringify(SCHEMA_A, null, 2),
  'src/primitives/card-schemas/form.result.schema.json': JSON.stringify(SCHEMA_B, null, 2),
  'dist/schemas.js': entrySource({ confirm: SCHEMA_A }, { 'form.result': SCHEMA_B }),
  'dist/schemas/index.d.ts':
    'export declare const cardSchemas: Record<string, unknown>;\n' +
    'export declare const contractSchemas: Record<string, unknown>;\n',
  'dist/schemas/confirm.schema.json': JSON.stringify(SCHEMA_A, null, 2),
  'dist/schemas/form.result.schema.json': JSON.stringify(SCHEMA_B, null, 2),
  ...over,
});

function writeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'verify-schemas-exported-selftest-'));
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
    name: 'a healthy package draws EXACTLY zero findings',
    files: fixtureFiles(),
    expect: [],
  },
  {
    name: 'THE SHIPPED BUG: the exports map has no ./schemas key at all',
    // Files present, shipped, and addressable by nobody.
    files: fixtureFiles({
      'package.json': JSON.stringify({ name: '@kitn.ai/ui', type: 'module', exports: { './schemas/*': './dist/schemas/*' } }, null, 2),
    }),
    expect: ['is not reachable', 'TS2307'],
  },
  {
    name: 'the raw-JSON family is not declared, so the .json subpaths are unreachable',
    files: fixtureFiles({
      'package.json': JSON.stringify({ name: '@kitn.ai/ui', type: 'module', exports: { './schemas': EXPORTS['./schemas'] } }, null, 2),
    }),
    expect: ['ship in the tarball but are not', 'confirm.schema.json'],
  },
  {
    name: 'the JS entry resolves but forgot a schema',
    files: fixtureFiles({ 'dist/schemas.js': entrySource({ confirm: SCHEMA_A }) }),
    expect: ['is in neither cardSchemas nor contractSchemas', 'form.result'],
  },
  {
    name: 'the JS entry carries a STALE copy rather than the file',
    files: fixtureFiles({
      'dist/schemas.js': entrySource({ confirm: { ...SCHEMA_A, properties: { ok: { type: 'string' } } } }, { 'form.result': SCHEMA_B }),
    }),
    expect: ['does not match', 'stale copy, not the file'],
  },
  {
    name: 'the JS entry exports a key with no schema file behind it',
    files: fixtureFiles({
      'dist/schemas.js': entrySource({ confirm: SCHEMA_A, invented: { type: 'object' } }, { 'form.result': SCHEMA_B }),
    }),
    expect: ['is exported but has no invented.schema.json'],
  },
  {
    name: 'the same key in BOTH maps',
    files: fixtureFiles({
      'dist/schemas.js': entrySource({ confirm: SCHEMA_A, 'form.result': SCHEMA_B }, { 'form.result': SCHEMA_B }),
    }),
    expect: ['is in BOTH cardSchemas and contractSchemas'],
  },
  {
    name: 'a shipped raw JSON whose bytes drifted from the authored file',
    files: fixtureFiles({
      'dist/schemas/confirm.schema.json': JSON.stringify({ ...SCHEMA_A, properties: { ok: { type: 'string' } } }, null, 2),
    }),
    expect: ['whose contents differ from', 'build:schemas'],
  },
  {
    name: 'VACUITY: no *.schema.json to derive a list from',
    files: fixtureFiles({
      'src/primitives/card-schemas/confirm.schema.json': null,
      'src/primitives/card-schemas/form.result.schema.json': null,
      'src/primitives/card-schemas/.keep': '',
    }),
    expect: ['the guard would assert nothing'],
  },
  {
    name: 'no dist/ at all',
    files: fixtureFiles({
      'dist/schemas.js': null,
      'dist/schemas/index.d.ts': null,
      'dist/schemas/confirm.schema.json': null,
      'dist/schemas/form.result.schema.json': null,
    }),
    expect: ['dist/ not found'],
  },
];

if (SELF_TEST) {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const { failures } = checkSchemas(writeFixture(c.files));
    const text = failures.join('\n');
    const missingExpected = c.expect.filter((s) => !text.includes(s));
    const cleanMismatch = c.expect.length === 0 && failures.length > 0;
    const ok = missingExpected.length === 0 && !cleanMismatch;
    if (!ok) failed++;
    console.log(
      `${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect.length === 0 ? 'clean' : c.expect.map((s) => `"${s}"`).join(' + ')}, got ${failures.length === 0 ? 'clean' : `${failures.length} failure(s)`})`,
    );
    if (missingExpected.length > 0) console.log(`    missing: ${missingExpected.map((s) => `"${s}"`).join(', ')}`);
    if (cleanMismatch) console.log(`    unexpected: ${text.split('\n')[0]}`);
  }
  if (failed > 0) {
    console.error(`\n✗ verify-schemas-exported self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(
    `\n✓ verify-schemas-exported self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
const { failures, out, schemaCount } = checkSchemas(PKG_ROOT);
for (const line of out) console.log(line);

if (failures.length === 0) {
  console.log(
    `\n✓ verify-schemas-exported: the JS entry and all ${schemaCount} raw schema(s) are\n` +
      '  reachable from outside the package, under `bundler`, `nodenext` and Node itself.',
  );
  process.exit(0);
}

console.error('');
for (const f of failures) console.error(`✗ ${f}\n`);
console.error(`\n✗ verify-schemas-exported: ${failures.length} unreachable or incomplete schema surface(s).\n`);
process.exit(1);
