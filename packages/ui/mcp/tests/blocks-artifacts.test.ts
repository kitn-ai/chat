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
import {
  discoverBlocks,
  buildRegistryIndex,
  buildRegistryItem,
  generateCdnForm,
  checkBlockContracts,
  type RawBlockSource,
} from '@kitn.ai/blocks';
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

describe('the real blocks against this package real inputs', () => {
  const sources = scanRealBlocks();
  const { blocks, errors } = discoverBlocks(sources, ROUTES);

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
    expect(builtIndex).toEqual(buildRegistryIndex(blocks));
    for (const block of blocks) {
      const built = JSON.parse(readBuiltArtifact(join(DIST_BLOCKS, 'r', `${block.name}.json`)));
      expect(built).toEqual(buildRegistryItem(block));
    }
  });

  it('the built cdn.html and generated driver page match what the current sources produce, pinned to this package version', () => {
    for (const block of blocks) {
      const cdn = generateCdnForm(block, { version: VERSION });
      expect(cdn.errors).toEqual([]);
      expect(readBuiltArtifact(join(DIST_BLOCKS, 'r', `${block.name}.cdn.html`))).toBe(cdn.html);
      const local = generateCdnForm(block, { version: VERSION, base: '/kit/' });
      expect(
        readBuiltArtifact(join(ROOT, 'scripts/block-driver/pages/generated', block.name, 'index.html')),
      ).toBe(local.html);
    }
  });
});
