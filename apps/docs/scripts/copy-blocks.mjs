// Copy the GENERATED block artifacts into the site's public/ tree, and decide
// -- once -- which kit the previews run against.
//
// The site never regenerates a block. `packages/ui/scripts/gen-blocks.mjs`
// writes dist/blocks/ during the kit build; this copies it. Same bounded-copy
// discipline as copy-kit-assets.mjs beside it, and the outputs are gitignored
// for the same reason.
//
// THE PREVIEW SWITCH. Production (KAI_BLOCKS_KIT unset) previews the PUBLISHED
// kit off jsDelivr at the pin lint:cdn-pins keeps equal to package.json, which
// is what makes the page standing proof that the published block runs cold.
// KAI_BLOCKS_KIT=local previews the build in your working tree, which is most
// of a block's life. The two look identical on screen, so the footer says
// which in words and scripts/verify-preview-source.mjs asserts the production
// build carries the CDN URL and no local path.
//
// Astro exposes only PUBLIC_* env to client code, and this switch must never
// be reachable by accident from a deploy environment, so the decision is
// written into src/generated/blocks-preview.ts and imported by the island.
import { createRequire } from 'node:module';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where local mode mounts the kit, site-absolute. One definition. */
export const LOCAL_KIT_BASE = '/blocks/kit/';

/** The jsDelivr base `rewriteBlockScript` stamps into an emitted CDN form.
 *  A COPY of the formula in packages/blocks/src/registry.ts, and it is a copy
 *  on purpose: importing that module here would mean a .mjs script loading a
 *  .ts export. The copy cannot rot silently -- rewriteKitBase throws when it
 *  matches nothing, so a changed formula fails the next `astro dev`. */
const CDN_BASE_RE = /https:\/\/cdn\.jsdelivr\.net\/npm\/@kitn\.ai\/ui@[^/]+\/dist\//g;

/**
 * Which kit the previews run, derived from the environment. Pure.
 * @param {Record<string, string | undefined>} env
 * @param {string} version the kit version, read from packages/ui/package.json
 */
export function previewSource(env, version) {
  const raw = env.KAI_BLOCKS_KIT;
  if (raw === undefined || raw === '') {
    return {
      mode: 'cdn',
      previewDir: '/blocks/r',
      footer: `previewing @kitn.ai/ui@${version} from jsDelivr`,
    };
  }
  if (raw === 'local') {
    return {
      mode: 'local',
      previewDir: '/blocks/local',
      footer: 'previewing the local build of packages/ui/dist',
    };
  }
  throw new Error(
    `KAI_BLOCKS_KIT="${raw}" is not a preview source. Set it to "local" for the build in your working tree, or leave it unset for the published CDN pin.`,
  );
}

/**
 * Point an emitted CDN form's kit imports at the local mount. Pure.
 * A form with no kit import is a broken input, not an empty edit: the emitted
 * form is self-contained BY CONSTRUCTION (generateCdnForm refuses otherwise),
 * so zero matches means the base formula moved and this rewrite has silently
 * stopped doing anything. Same reasoning as lint:cdn-pins treating a zero-match
 * scan as a hard failure.
 * @param {string} html
 * @param {string} fileName for the message
 */
export function rewriteKitBase(html, fileName) {
  CDN_BASE_RE.lastIndex = 0;
  const out = html.replace(CDN_BASE_RE, LOCAL_KIT_BASE);
  if (out === html) {
    throw new Error(
      `copy-blocks: ${fileName} carries no @kitn.ai/ui CDN import, so KAI_BLOCKS_KIT=local rewrote nothing. Either the form is not the generated one, or rewriteBlockScript's base in packages/blocks/src/registry.ts changed and ${CDN_BASE_RE.source} no longer matches it.`,
    );
  }
  return out;
}

const IS_MAIN = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (IS_MAIN) main();

function main() {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve('@kitn.ai/ui/package.json');
  const pkgRoot = dirname(pkgJson);
  const version = JSON.parse(readFileSync(pkgJson, 'utf8')).version;

  // fileURLToPath, NOT new URL(...).pathname: a URL pathname is percent-encoded
  // and platform-shaped, and mkdirSync(recursive) would happily create the
  // wrong directory and exit 0. Same trap copy-kit-assets.mjs records.
  const here = dirname(fileURLToPath(import.meta.url));
  const pub = join(here, '..', 'public');
  const generated = join(here, '..', 'src', 'generated');

  const src = join(pkgRoot, 'dist', 'blocks');
  if (!existsSync(join(src, 'registry.json'))) {
    console.error(
      `\n[copy-blocks] ${src}/registry.json is missing. The site SERVES the generated blocks registry and does not regenerate it, so there is nothing to copy.\n` +
        `  Build the kit first:  cd packages/ui && npm run build\n`,
    );
    process.exit(1);
  }

  const source = previewSource(process.env, version);

  rmSync(join(pub, 'blocks'), { recursive: true, force: true });
  mkdirSync(join(pub, 'blocks'), { recursive: true });
  cpSync(src, join(pub, 'blocks'), { recursive: true });

  let localForms = 0;
  if (source.mode === 'local') {
    // The kit itself, so /blocks/kit/elements/autoloader.js resolves the way
    // the pinned CDN URL does. The whole dist: which chunks the autoloader
    // pulls is not a list worth hand-maintaining.
    // Everything but dist/blocks, which is already copied above and would
    // otherwise nest a second time under the kit mount. cpSync does not
    // descend a directory its filter rejects, so one path equality is enough.
    const distBlocks = join(pkgRoot, 'dist', 'blocks');
    cpSync(join(pkgRoot, 'dist'), join(pub, 'blocks', 'kit'), {
      recursive: true,
      filter: (from) => from !== distBlocks,
    });
    mkdirSync(join(pub, 'blocks', 'local'), { recursive: true });
    for (const name of readdirSync(join(src, 'r'))) {
      if (!name.endsWith('.cdn.html')) continue;
      const html = readFileSync(join(src, 'r', name), 'utf8');
      const id = name.slice(0, -'.cdn.html'.length);
      writeFileSync(join(pub, 'blocks', 'local', `${id}.html`), rewriteKitBase(html, name));
      localForms++;
    }
    if (localForms === 0) {
      console.error(
        '\n[copy-blocks] KAI_BLOCKS_KIT=local rewrote no preview: dist/blocks/r has no <id>.cdn.html.\n',
      );
      process.exit(1);
    }
  }

  mkdirSync(generated, { recursive: true });
  writeFileSync(
    join(generated, 'blocks-preview.ts'),
    [
      '// GENERATED by apps/docs/scripts/copy-blocks.mjs on predev/prebuild.',
      '// Do not edit and do not commit: it records which kit the /blocks previews',
      '// run against, decided once from KAI_BLOCKS_KIT.',
      "// The annotation is deliberate and `as const` is wrong here: a literal type",
      "// for `mode` makes the island's `mode === 'local'` comparison a TS2367.",
      "export const BLOCKS_PREVIEW: { mode: 'cdn' | 'local'; previewDir: string; footer: string } =",
      '  ' + JSON.stringify(source, null, 2).split('\n').join('\n  ') + ';',
      '',
    ].join('\n'),
  );

  console.log(
    `[copy-blocks] ${source.mode} preview: ${source.footer}` +
      (localForms > 0 ? ` (${localForms} local form(s) rewritten)` : ''),
  );
}
