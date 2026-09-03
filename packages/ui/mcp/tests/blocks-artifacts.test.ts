// @vitest-environment node
//
// NODE, not the project's jsdom: this suite runs esbuild's transform to derive
// the same stripped `.js` twin gen-blocks.mjs writes, and esbuild refuses to
// load under jsdom ("new TextEncoder().encode('') instanceof Uint8Array is
// incorrectly false" -- jsdom's TextEncoder produces a foreign Uint8Array).
// Nothing here touches the DOM.
/**
 * The four blocks assertions whose inputs live in THIS package: the real
 * integration catalog, the real element-nonscalar map, this package's version,
 * and the BUILT artifacts under dist/blocks/ plus the generated driver page.
 *
 * They were part of mcp/tests/blocks-registry.test.ts before that suite moved
 * to @kitn.ai/blocks, and they stay here rather than moving with it because the
 * blocks package depends on nothing and must not grow a build-order dependency
 * on the kit. Splitting on "what are the inputs" rather than "what is the
 * subject" is what keeps both halves honest.
 *
 * They are in the `unit` project on purpose: verify:blocks covers the same
 * ground but needs a real browser and a full build, so this is what catches a
 * stale build in the fast suite.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import {
  discoverBlocks,
  buildRegistryIndex,
  buildRegistryItem,
  checkBlockContracts,
  type RawBlockSource,
} from '@kitn.ai/blocks';
import { handlerName, renderCdnFormFiles, withStrippedTwins } from '@kitn.ai/blocks/forms';
import { onName } from '../../scripts/gen-element-react.mjs';
import { listIntegrations } from '../registry';

const ROOT = resolve(__dirname, '../..');
const BLOCKS_DIR = join(
  dirname(createRequire(import.meta.url).resolve('@kitn.ai/blocks/package.json')),
  'blocks',
);
const DIST_BLOCKS = join(ROOT, 'dist', 'blocks');

/** Generated block artifacts live under dist/ (never committed), so a fresh
 *  checkout has none -- fail naming the exact path and how to produce it (the
 *  custom-elements.json pattern), never by walking somewhere else. */
function readBuiltArtifact(path: string): string {
  if (!existsSync(path)) {
    throw new Error(
      `${path} is missing -- generated block artifacts are build outputs, not committed. ` +
        'Run `nx build ui` (or, after build:api, `node scripts/gen-blocks.mjs` from packages/ui) first.',
    );
  }
  return readFileSync(path, 'utf8');
}

const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string;
const ROUTES = listIntegrations().map((i) => i.id);
const NONSCALAR = JSON.parse(
  readFileSync(join(ROOT, 'src/elements/element-nonscalar.json'), 'utf8'),
) as Record<string, string[]>;

/** The same walk gen-blocks.mjs does -- a dir is a block iff it holds a
 *  registry-item.json. This is the FOURTH copy of that walk: scripts/gen-blocks.mjs,
 *  scripts/verify-blocks.mjs and create-kai's `loadBlocks` each carry their own.
 *  One shared loader is PR B work; the blocks package cannot host it, because
 *  it cannot import node:fs. */
function scanRealBlocks(): RawBlockSource[] {
  return readdirSync(BLOCKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(BLOCKS_DIR, e.name, 'registry-item.json')))
    .map((e) => ({
      dirName: e.name,
      manifestJson: readFileSync(join(BLOCKS_DIR, e.name, 'registry-item.json'), 'utf8'),
      files: readdirSync(join(BLOCKS_DIR, e.name), { withFileTypes: true })
        .filter((f) => f.isFile() && f.name !== 'registry-item.json')
        .map((f) => ({ name: f.name, content: readFileSync(join(BLOCKS_DIR, e.name, f.name), 'utf8') })),
    }));
}

describe("the real blocks against this package's real inputs", () => {
  const sources = scanRealBlocks();
  const { blocks, errors } = discoverBlocks(sources, ROUTES);

  /**
   * The twins, derived the same way gen-blocks.mjs derives them.
   *
   * The built artifacts carry a `.js` twin beside every `.ts` block source,
   * so comparing them against `buildRegistryItem(block)` over the AUTHORED
   * block compares two different things. This package has esbuild, so it can
   * run the generator's own transform rather than trusting the built file.
   */
  const stripTypes = (source: string, fileName: string): string =>
    transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: fileName }).code;
  const twinned = blocks.map((b) => withStrippedTwins(b, stripTypes));

  it('discovers every block directory, error-free, against the real integration catalog', () => {
    expect(errors).toEqual([]);
    expect(blocks.length).toBeGreaterThanOrEqual(1); // a zero-block scan is a broken walk
    expect(blocks.map((b) => b.name).sort()).toEqual(sources.map((s) => s.dirName).sort());
  });

  it('the real blocks pass the kai- contract checks against the real element-nonscalar map', () => {
    for (const block of blocks) expect(checkBlockContracts(block, NONSCALAR)).toEqual([]);
  });

  it('the built dist/blocks/registry.json and r/<name>.json match what the current sources produce', () => {
    const builtIndex = JSON.parse(readBuiltArtifact(join(DIST_BLOCKS, 'registry.json')));
    expect(builtIndex).toEqual(buildRegistryIndex(twinned));
    for (const block of twinned) {
      const built = JSON.parse(readBuiltArtifact(join(DIST_BLOCKS, 'r', `${block.name}.json`)));
      expect(built).toEqual(buildRegistryItem(block));
    }
  });

  it('the emitted item JSON carries a .js twin beside every .ts source', () => {
    // The anti-vacuity floor for the line above: if `twinned` silently added
    // nothing, the comparison would still pass and prove less than it reads.
    let checked = 0;
    for (const block of twinned) {
      const built = JSON.parse(readBuiltArtifact(join(DIST_BLOCKS, 'r', `${block.name}.json`)));
      const paths = (built.files as { path: string }[]).map((f) => f.path);
      for (const path of paths.filter((f) => f.endsWith('.ts'))) {
        expect(paths, `${block.name}: ${path} has no .js twin in the item JSON`).toContain(
          path.replace(/\.ts$/, '.js'),
        );
        checked += 1;
      }
    }
    expect(checked, 'no .ts block source at all - this check would pass vacuously').toBeGreaterThan(0);
  });

  it('the built cdn.html and generated driver page match what the current sources produce, pinned to this package version', () => {
    for (const block of twinned) {
      const cdn = renderCdnFormFiles(block, { version: VERSION })[0].content;
      expect(readBuiltArtifact(join(DIST_BLOCKS, 'r', `${block.name}.cdn.html`))).toBe(cdn);
      const local = renderCdnFormFiles(block, { version: VERSION, base: '/kit/' })[0].content;
      expect(
        readBuiltArtifact(join(ROOT, 'scripts/block-driver/pages/generated', block.name, 'index.html')),
      ).toBe(local);
    }
  });

  it('the emitted cdn form and driver page carry the binder and the controller, not just markup', () => {
    // The failure this catches is silent by construction: a form whose script
    // never got inlined is still valid HTML and still renders a page.
    let checked = 0;
    for (const block of blocks) {
      for (const path of [
        join(DIST_BLOCKS, 'r', `${block.name}.cdn.html`),
        join(ROOT, 'scripts/block-driver/pages/generated', block.name, 'index.html'),
      ]) {
        const html = readBuiltArtifact(path);
        expect(html, path).toContain('window.__blockReady = true');
        expect(html, path).toContain('createController');
        checked += 1;
      }
    }
    expect(checked, 'no emitted form was read - this check would pass vacuously').toBeGreaterThan(0);
  });
});

/**
 * The blocks package restates two rules the kit owns, because it cannot
 * import from packages/ui: the react block renderer needs the handler-prop
 * name and the wrapper component name, and PR A's dependency direction is
 * what keeps that package free of a build-order dependency on the kit. This
 * suite is the one that already holds BOTH packages' inputs, so the
 * restatements are checked here against the kit's own metadata rather than
 * trusted (plan R17 and R18; a docs/coupling-map.md section 4 row).
 */
describe('the derivations the react block renderer makes', () => {
  const meta = JSON.parse(readFileSync(join(ROOT, 'src/elements/element-meta.json'), 'utf8')) as {
    tag: string;
    displayName: string;
    className: string;
    events: { name: string }[];
  }[];

  it('handlerName agrees with the wrapper generator for every event the kit declares', () => {
    const events = meta.flatMap((el) => el.events.map((e) => e.name));
    expect(events.length).toBeGreaterThan(0); // anti-vacuity: an empty roster must not pass
    for (const event of events) expect(handlerName(event)).toBe(onName(event));
  });

  it('the component and element-interface names are derivable from the tag, with no exceptions', () => {
    const pascalTag = (tag: string) =>
      tag.replace(/^kai-/, '').split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('');
    expect(meta.length).toBeGreaterThan(0);
    for (const el of meta) {
      expect(el.displayName).toBe(pascalTag(el.tag));
      expect(el.className).toBe(`Kai${pascalTag(el.tag)}Element`);
    }
  });
});
