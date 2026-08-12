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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_SRC = join(ROOT, 'src/primitives/card-schemas');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.name;

/** The subpath the JS entry lives on, and the subpath family the raw JSON lives on. */
const JS_ENTRY = `${NAME}/schemas`;

const fail = (msg) => {
  console.error(`\n✗ verify-schemas-exported: ${msg}\n`);
  process.exit(1);
};

if (!existsSync(join(ROOT, 'dist'))) {
  fail('dist/ not found — run `nx build ui` first.');
}
if (!existsSync(SCHEMA_SRC)) {
  fail(`${relative(ROOT, SCHEMA_SRC)} not found — this guard has nothing to derive its list from.`);
}

// ------------------------------------------------------------- the derived set
const schemaFiles = readdirSync(SCHEMA_SRC)
  .filter((f) => f.endsWith('.schema.json'))
  .sort();
if (schemaFiles.length === 0) {
  fail(`no *.schema.json under ${relative(ROOT, SCHEMA_SRC)} — the guard would assert nothing.`);
}
/** `confirm.schema.json` -> `confirm`; `form.result.schema.json` -> `form.result`. */
const keyOf = (file) => file.slice(0, -'.schema.json'.length);
const sourceOf = Object.fromEntries(
  schemaFiles.map((f) => [f, JSON.parse(readFileSync(join(SCHEMA_SRC, f), 'utf8'))]),
);

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

// ------------------------------------------------------------- probe harness
// A temp package OUTSIDE the repo whose only dependency is a link to the built
// package, so every specifier resolves through the real exports map.
const tmp = mkdtempSync(join(tmpdir(), 'kai-schemas-exported-'));
mkdirSync(join(tmp, 'node_modules', NAME.split('/')[0]), { recursive: true });
symlinkSync(ROOT, join(tmp, 'node_modules', NAME));
writeFileSync(
  join(tmp, 'package.json'),
  JSON.stringify({ name: 'schemas-export-probe', private: true, type: 'module' }),
);
// A REAL file on disk: `ts.getImpliedNodeFormatForFile` reads the enclosing
// package.json to decide ESM vs CJS, and the answer is the load-bearing argument.
const probeTs = join(tmp, 'probe.ts');
writeFileSync(probeTs, '// resolution probe\nexport {};\n');

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
    const { resolvedModule } = ts.resolveModuleName(
      spec,
      probeTs,
      opts,
      ts.sys,
      undefined,
      undefined,
      mode,
    );
    if (!resolvedModule) {
      reasons.push(`[${label}] tsc resolves it to nothing (TS2307)`);
      continue;
    }
    const ext = resolvedModule.extension;
    const where = relative(ROOT, resolvedModule.resolvedFileName);
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

/** Node's resolution errors quote two absolute temp paths; neither adds anything. */
const terse = (msg) => msg.replace(/ in \/\S+package\.json/, '').replace(/ imported from \S+/, '');

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
  if (!marked) {
    fail(
      `the Node resolution probe did not report.\n  stdout: ${`${r.stdout}`.trim()}\n  stderr: ${`${r.stderr}`.trim()}`,
    );
  }
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

  console.log(
    `verify-schemas-exported: ${schemaFiles.length} schema(s) in ${relative(ROOT, SCHEMA_SRC)}/, ` +
      `resolved from a temp package at ${tmp}\n`,
  );

  // --- Surface A: the JS entry (primary) -----------------------------------
  console.log(`Surface A — the JS entry \`${JS_ENTRY}\``);
  brokenEntry.push(...tsResolves(JS_ENTRY, 'declarations'));
  if (nodeVerdict[JS_ENTRY].error) brokenEntry.push(`[node] ${terse(nodeVerdict[JS_ENTRY].error)}`);

  const entry = brokenEntry.length === 0 ? readJsEntry() : { ok: false, error: 'not resolvable' };
  if (brokenEntry.length === 0 && !entry.ok) {
    brokenEntry.push(`[node] importing it threw: ${entry.error}`);
  }

  if (brokenEntry.length > 0) {
    console.log(`  ✗ ${JS_ENTRY}`);
    for (const r of brokenEntry) console.log(`      ${r}`);
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
          `'${key}' does not match ${relative(ROOT, join(SCHEMA_SRC, file))} — the entry is a stale copy, not the file`,
        );
      }
    }
    // …and nothing else. A key with no file behind it is a hand-written schema
    // masquerading as a shipped one, which is the drift this entry exists to end.
    const known = new Set(schemaFiles.map(keyOf));
    for (const key of [...Object.keys(cards), ...Object.keys(contracts)]) {
      if (!known.has(key)) {
        contentGaps.push(
          `'${key}' is exported but has no ${key}.schema.json in ${relative(ROOT, SCHEMA_SRC)}/`,
        );
      }
    }
    console.log(
      `  ✓ ${JS_ENTRY}  (resolves to declarations under bundler + nodenext, imports under \`node\`,\n` +
        `      exports ${Object.keys(cards).length} card + ${Object.keys(contracts).length} contract schema(s))`,
    );
    for (const gap of contentGaps) console.log(`  ✗ ${gap}`);
  }

  // --- Surface B: the raw JSON subpaths (secondary) ------------------------
  console.log(`\nSurface B — the raw JSON \`${JS_ENTRY}/<name>.schema.json\``);
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
          `[node] resolves to ${relative(ROOT, fileURLToPath(url))}, whose contents differ from ` +
            `${relative(ROOT, join(SCHEMA_SRC, file))} — a stale copy; run \`npm run build:schemas\``,
        );
      }
    }
    if (reasons.length > 0) {
      brokenJson.push({ file, spec, reasons });
      console.log(`  ✗ ${file}`);
      for (const r of reasons) console.log(`      ${r}`);
    } else {
      console.log(`  ✓ ${file}`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// ----------------------------------------------------------------- the verdict
const failures = brokenEntry.length + brokenJson.length + contentGaps.length;
if (failures === 0) {
  console.log(
    `\n✓ verify-schemas-exported: the JS entry and all ${schemaFiles.length} raw schema(s) are\n` +
      '  reachable from outside the package, under `bundler`, `nodenext` and Node itself.',
  );
  process.exit(0);
}

console.error('');
if (brokenEntry.length > 0) {
  console.error(
    `✗ the JS entry \`${JS_ENTRY}\` is not reachable.\n` +
      `  Declare it in packages/ui/package.json "exports":\n` +
      '      "./schemas": { "types": "./dist/schemas/index.d.ts", "default": "./dist/schemas.js" }\n' +
      '  plus "typesVersions" for node10 consumers, then rebuild:\n' +
      '      pnpm exec nx build ui --skip-nx-cache\n',
  );
}
if (contentGaps.length > 0) {
  console.error(
    `✗ ${contentGaps.length} schema(s) resolve but are missing or stale in the JS entry.\n` +
      '  Fix packages/ui/src/schemas/index.ts so it imports every file in\n' +
      `  ${relative(ROOT, SCHEMA_SRC)}/ directly — never a hand-copied restatement — then:\n` +
      '      pnpm exec nx build ui --skip-nx-cache\n',
  );
  for (const gap of contentGaps) console.error(`    ${gap}`);
  console.error('');
}
if (brokenJson.length > 0) {
  console.error(
    `✗ ${brokenJson.length} of ${schemaFiles.length} card schema(s) ship in the tarball but are not\n` +
      '  reachable, or do not carry the authored bytes. Each reason is printed above.\n' +
      '  package.json "exports" is a CLOSED map: a file under dist/ that no key covers\n' +
      '  resolves to ERR_PACKAGE_PATH_NOT_EXPORTED / TS2307, however present it is.\n' +
      '  Declare the raw-JSON family in packages/ui/package.json "exports":\n' +
      '      "./schemas/*": "./dist/schemas/*"\n' +
      '  and make sure `npm run build:schemas` has run, then rebuild:\n' +
      '      pnpm exec nx build ui --skip-nx-cache\n',
  );
  for (const b of brokenJson) console.error(`    ${b.file}`);
  console.error('');
}
fail(`${failures} unreachable or incomplete schema surface(s).`);
