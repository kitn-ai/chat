// End-to-end consumer packaging guard. This is the one that can actually fail.
//
// WHY IT EXISTS
// -------------
// dist/kai.es.js (the `@kitn.ai/ui/elements` entry) is a small facade that loads
// the real ~650KB registration chunk (dist/register-impl-<hash>.js) with a
// dynamic import. Whether that chunk's `customElements.define` calls survive is
// decided by the CONSUMER's bundler, from package.json "sideEffects". In 0.19.0
// the glob list did not cover the hashed chunk, so Vite 8 / Rolldown shook it
// from ~650KB to a ~1.5KB stub with zero element registrations: blank page,
// silent console, customElements.whenDefined('kai-chat') hanging forever.
//
// The build-time guard (verify-elements-bundle.mjs) checked only that OUR build
// kept the reference, which was true the whole time. Nothing checked the
// consumer side. So this script builds a real consumer app against a real
// tarball with a real bundler and asserts the registrations are still there.
//
// WHY VITE 8 SPECIFICALLY
// -----------------------
// Vite 8 bundles with Rolldown, which honours `sideEffects` far more
// aggressively than the Rollup-based Vite 6/7. The same broken package builds
// FINE under Vite 6 and 7 and blank under Vite 8, so 8 is the canary. It is also
// what `npm create vite@latest` installs today, i.e. what consumers actually get.
//
// Needs network (npm install into a temp dir). Runs in CI, not in `npm run build`.
//   node scripts/verify-consumer-sideeffects.mjs [--keep]
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readPackedFilename } from '../../../scripts/pack-listing.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEEP = process.argv.includes('--keep');
const VITE = 'vite@^8';

/** Named in every pack-shape failure; it is the fact that explains them. */
const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();

const fail = (msg) => {
  console.error(`\n✗ verify-consumer-sideeffects: ${msg}\n`);
  process.exit(1);
};
const step = (msg) => console.log(`  · ${msg}`);
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

if (!existsSync(resolve(ROOT, 'dist/kai.es.js'))) {
  fail('dist/kai.es.js not found — run `nx build ui` first.');
}

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'src/elements/element-manifest.json'), 'utf8'));
const ALL_TAGS = Object.keys(manifest.tags);
const CHAT_TAGS = manifest.files.chat ?? ['kai-chat'];
if (ALL_TAGS.length === 0) fail('src/elements/element-manifest.json lists no tags.');

// Temp dir deliberately OUTSIDE the repo: a consumer resolves @kitn.ai/ui from
// its own node_modules, with no workspace links or repo tsconfig in scope.
const tmp = mkdtempSync(join(tmpdir(), 'kai-sideeffects-'));
const app = join(tmp, 'app');
let failure = null;

try {
  console.log(`\nverify-consumer-sideeffects — ${tmp}`);

  step('npm pack');
  // Shape-normalised: npm 12 made the top level an object keyed by package name,
  // so `JSON.parse(raw)[0]` — what stood here — is `undefined` under it. See
  // <repo>/scripts/pack-listing.mjs.
  const { filename } = readPackedFilename(
    run('npm', ['pack', '--json', '--pack-destination', tmp], ROOT),
    { npmVersion },
  );
  const tarball = join(tmp, filename);

  mkdirSync(join(app, 'src'), { recursive: true });
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({ name: 'kai-consumer-guard', private: true, version: '0.0.0', type: 'module' }, null, 2),
  );

  // Entry A: the register-all path — a bare side-effect import, exactly what the
  // docs and every vanilla/plain-HTML consumer writes.
  writeFileSync(
    join(app, 'src/register-all.ts'),
    `import '@kitn.ai/ui/elements';\ncustomElements.whenDefined('kai-chat').then(() => console.log('ready'));\n`,
  );
  // Entry B: the per-element path (@kitn.ai/ui/elements/*), which the React
  // wrappers and footprint-conscious consumers use.
  writeFileSync(
    join(app, 'src/per-element.ts'),
    `import '@kitn.ai/ui/elements/chat';\ncustomElements.whenDefined('kai-chat').then(() => console.log('ready'));\n`,
  );

  // Separate builds, separate outDirs: one shared build would let entry A's
  // chunks satisfy an assertion entry B had actually failed.
  for (const name of ['register-all', 'per-element']) {
    writeFileSync(
      join(app, `vite.${name}.config.js`),
      `export default { logLevel: 'error', build: { outDir: 'out-${name}', emptyOutDir: true, ` +
        `rollupOptions: { input: 'src/${name}.ts' } } };\n`,
    );
  }

  step(`npm install ${VITE} + the packed tarball`);
  try {
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', tarball, VITE], app);
  } catch (e) {
    fail(`npm install failed (network?):\n${e.stderr || e.message}`);
  }
  const viteVersion = run('npx', ['vite', '--version'], app).trim();
  step(viteVersion);

  const results = [];
  for (const [name, required] of [
    ['register-all', ALL_TAGS],
    ['per-element', CHAT_TAGS],
  ]) {
    step(`vite build — ${name}`);
    try {
      run('npx', ['vite', 'build', '--config', `vite.${name}.config.js`], app);
    } catch (e) {
      fail(`consumer \`vite build\` failed for ${name}:\n${e.stdout || ''}${e.stderr || e.message}`);
    }

    const outDir = join(app, `out-${name}`);
    let bytes = 0;
    let code = '';
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith('.js')) {
          const src = readFileSync(p, 'utf8');
          bytes += Buffer.byteLength(src);
          code += src;
        }
      }
    };
    walk(outDir);

    // Tag literals are the honest signal: minifiers rewrite `customElements.define`
    // into an aliased member call (solid-element does `customElements.define(...)`
    // through a local binding), but they can never rewrite a string literal. Zero
    // tags in the emitted output IS the blank-page bug.
    const missing = required.filter((tag) => !code.includes(tag));
    results.push({ name, required: required.length, missing, bytes });
  }

  console.log('');
  for (const r of results) {
    const kb = (r.bytes / 1024).toFixed(1);
    const ok = r.missing.length === 0;
    console.log(
      `  ${ok ? '✓' : '✗'} ${r.name.padEnd(12)} ${String(r.required - r.missing.length).padStart(3)}/${r.required} tags · ${kb} kB emitted JS`,
    );
  }

  const broken = results.filter((r) => r.missing.length > 0);
  if (broken.length > 0) {
    failure =
      `a real consumer build DROPPED element registrations.\n\n` +
      broken
        .map(
          (r) =>
            `  entry: import '@kitn.ai/ui/elements${r.name === 'per-element' ? '/chat' : ''}'\n` +
            `    ${r.missing.length}/${r.required} kai-* tags missing from the emitted bundle\n` +
            `    (${(r.bytes / 1024).toFixed(1)} kB of JS emitted; e.g. ${r.missing.slice(0, 6).join(', ')})`,
        )
        .join('\n') +
      `\n\n  ${viteVersion} treated the registration chunk as side-effect free and shook\n` +
      `  the customElements.define calls out of it. Consumers get a blank page and a\n` +
      `  SILENT console — whenDefined() just never resolves.\n\n` +
      `  Fix: package.json "sideEffects" must match every emitted chunk that carries\n` +
      `  registrations. The chunk hash changes every build, so match the stem:\n` +
      `    "./dist/register-impl-*.js"\n` +
      `  Current value:\n` +
      JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
        .sideEffects.map((s) => `    ${s}`)
        .join('\n');
  }
} finally {
  if (KEEP) console.log(`\n  (--keep) temp app left at ${app}`);
  else rmSync(tmp, { recursive: true, force: true });
}

if (failure) fail(failure);
console.log('\n✓ verify-consumer-sideeffects — registrations survive a real consumer bundle.\n');
