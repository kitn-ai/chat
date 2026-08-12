// Regression guard for the WebGL shader path in the audio visualizer
// (components/audio-visualizer/{shader-canvas,wave.glsl,aurora.glsl,
// variant-wave,variant-aurora,variant-custom}). `vite.config.ts` sets
// `treeshake: false` on the register-all bundle by design, so if
// `SHADER_VARIANTS`'s dynamic `import()` calls in
// components/audio-visualizer/index.tsx ever become static imports, the
// WebGL runtime plus the GLSL strings (roughly 25 to 30 KB, and GLSL barely
// compresses) would silently ship to every consumer, including one who only
// uses <kai-chat>. This asserts the shader path stays out of that bundle so
// that regression can never silently ship again.
//
// dist/kai.es.js (the `@kitn.ai/ui/elements` entry) is a thin stub: it
// dynamically imports a hashed dist/register-impl-<hash>.js chunk, and THAT
// file -- not kai.es.js itself -- is where every kai-* element's code
// actually lives, because treeshake:false keeps it all in one place. Since
// kai.es.js unconditionally imports register-impl on load, register-impl's
// weight ships to every consumer of the register-all bundle regardless of
// which element they use. Checking kai.es.js alone would miss a leak
// entirely (verified empirically: a static `import './variant-aurora'`
// added to index.tsx left kai.es.js's 23,964 bytes untouched and only grew
// register-impl-<hash>.js), so both files are checked here.
//
// DIST is anchored to THIS FILE, not to the cwd. `npm run build` sets the cwd to the
// package, but CLAUDE.md tells everyone to run from the REPO ROOT, and this guard
// degrades QUIETLY in the wrong direction when the cwd is wrong: `findRegisterImpl`
// catches the `readdirSync` failure and returns null, i.e. a wrong cwd looks like
// "found nothing to check" rather than "cannot check". The kai.es.js read then bails
// with "run the lib build first" against a tree that just built green. A leak detector
// whose miss-mode is silence has to be pinned to the package it inspects.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(PKG_ROOT, 'dist');
const KAI_ES = join(DIST, 'kai.es.js');

function findRegisterImpl() {
  let entries;
  try {
    entries = readdirSync(DIST);
  } catch {
    return null;
  }
  const match = entries.find((f) => /^register-impl-.*\.js$/.test(f));
  return match ? join(DIST, match) : null;
}

// Distinctive strings that only exist in the shader path, verified absent
// from dist/kai.es.js + dist/register-impl-<hash>.js and present in the lazy
// chunk(s) as of this writing:
//   - 'mainImage(gl_FragColor' is shader-canvas.tsx's `main()` wrapper,
//     shared by every shader variant (wave, aurora, custom).
//   - 'auroraWarp' is a GLSL function name unique to aurora.glsl.ts.
//   - 'randFibo' is a GLSL function name unique to wave.glsl.ts.
const SHADER_MARKERS = ['mainImage(gl_FragColor', 'auroraWarp', 'randFibo'];

const registerImplPath = findRegisterImpl();

let kaiEsCode;
try {
  kaiEsCode = readFileSync(KAI_ES, 'utf8');
} catch {
  console.error(
    `✗ verify-shader-lazy: ${KAI_ES} not found — run the lib build first.`,
  );
  process.exit(1);
}

if (!registerImplPath) {
  console.error(
    `✗ verify-shader-lazy: no dist/register-impl-*.js chunk found — run the lib build first.\n` +
      `  ${KAI_ES} dynamically imports this chunk; it must exist alongside it.`,
  );
  process.exit(1);
}

const registerImplCode = readFileSync(registerImplPath, 'utf8');
const code = kaiEsCode + registerImplCode;

const leaked = SHADER_MARKERS.filter((m) => code.includes(m));

if (leaked.length > 0) {
  console.error(
    `✗ verify-shader-lazy: the shader path leaked into the register-all bundle\n` +
      `  (${KAI_ES} + ${registerImplPath}).\n` +
      `  Found: ${leaked.join(', ')}\n\n` +
      `  The register-all bundle disables tree-shaking, so a static import of\n` +
      `  variant-wave / variant-aurora / variant-custom / shader-canvas ships to\n` +
      `  every consumer. Keep SHADER_VARIANTS in\n` +
      `  components/audio-visualizer/index.tsx as dynamic import() calls.`,
  );
  process.exit(1);
}

console.log(
  `✓ verify-shader-lazy — the register-all bundle does not contain the shader path`,
);
