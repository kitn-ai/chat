/**
 * The blocks registry + CDN-form generator (Task 3.1, blocks-and-parts plan
 * 2026-08-31). What is pinned, and why each half matters:
 *
 * - DERIVATION: the registry is a directory scan, never a hand list — every
 *   `blocks/<dir>/` holding a registry-item.json appears in the discovered
 *   set, so adding a block is adding a directory.
 * - MANIFEST VALIDATION: each rule of the adopted registry-item skeleton is
 *   watched FAILING on a planted bad manifest (checks-that-prove-nothing:
 *   a validator nobody saw red is a validator that may check nothing).
 * - GENERATOR SHAPE: the CDN form is self-contained; its pins are generated
 *   from packages/ui/package.json and EQUAL that version (the lint:cdn-pins
 *   invariant, asserted here at the source); only the phase-2-proven entries
 *   resolve; the root export is refused loudly.
 * - CONTRACT CHECKS: rich-prop-as-attribute, the kitn- prefix, document-level
 *   kai-* listeners and hand-rolled SSE are each caught on a plant.
 * - The COMMITTED artifacts match what the builders produce from the current
 *   sources (the gen-blocks --check verdict, reproduced here without a spawn
 *   so the unit suite catches staleness too).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  discoverBlocks,
  validateBlockManifest,
  buildRegistryIndex,
  buildRegistryItem,
  generateCdnForm,
  rewriteBareImport,
  rewriteBlockScript,
  checkBlockContracts,
  CDN_IMPORT_ENTRIES,
  type Block,
  type RawBlockSource,
} from '../../src/agent-tooling/blocks/registry';
import { listIntegrations } from '../../src/agent-tooling/registry';

const ROOT = resolve(__dirname, '../..');
const BLOCKS_DIR = join(ROOT, 'blocks');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string;
const ROUTES = listIntegrations().map((i) => i.id);
const NONSCALAR = JSON.parse(
  readFileSync(join(ROOT, 'src/elements/element-nonscalar.json'), 'utf8'),
) as Record<string, string[]>;

/** The same walk gen-blocks.mjs does — a dir is a block iff it holds a
 *  registry-item.json. */
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

// A minimal valid synthetic block, mutated per test below.
function syntheticSource(overrides: Partial<{ manifest: Record<string, unknown>; files: { name: string; content: string }[] }> = {}): RawBlockSource {
  const manifest = {
    name: 'demo',
    title: 'Demo',
    description: 'A demo block.',
    type: 'registry:block',
    files: [
      { path: 'demo.html', type: 'registry:page' },
      { path: 'demo.js', type: 'registry:file' },
    ],
    ...overrides.manifest,
  };
  return {
    dirName: 'demo',
    manifestJson: JSON.stringify(manifest),
    files: overrides.files ?? [
      {
        name: 'demo.html',
        content: '<!doctype html>\n<html><head><title>d</title></head><body><kai-thread id="t"></kai-thread><script type="module" src="./demo.js"></script></body></html>',
      },
      { name: 'demo.js', content: "import '@kitn.ai/ui/autoloader';\ndocument.getElementById('t').messages = [];\n" },
    ],
  };
}

const discoverOne = (src: RawBlockSource) => discoverBlocks([src], ROUTES);

describe('registry derivation (the directory scan is the list)', () => {
  const sources = scanRealBlocks();
  const { blocks, errors } = discoverBlocks(sources, ROUTES);

  it('every blocks/<dir> with a manifest is discovered, error-free', () => {
    expect(errors).toEqual([]);
    expect(blocks.map((b) => b.name).sort()).toEqual(sources.map((s) => s.dirName).sort());
    expect(blocks.length).toBeGreaterThanOrEqual(1); // a zero-block scan is a broken walk
    expect(blocks.some((b) => b.name === 'support-widget')).toBe(true);
  });

  it('the real blocks pass the kai- contract checks', () => {
    for (const block of blocks) expect(checkBlockContracts(block, NONSCALAR)).toEqual([]);
  });

  it('the committed registry.json and r/<name>.json match what the current sources produce', () => {
    const committedIndex = JSON.parse(readFileSync(join(BLOCKS_DIR, 'registry.json'), 'utf8'));
    expect(committedIndex).toEqual(buildRegistryIndex(blocks));
    for (const block of blocks) {
      const committed = JSON.parse(readFileSync(join(BLOCKS_DIR, 'r', `${block.name}.json`), 'utf8'));
      expect(committed).toEqual(buildRegistryItem(block));
    }
  });
});

describe('manifest validation (each rule watched failing)', () => {
  const bad = (mutate: (m: Record<string, unknown>) => void, files?: { name: string; content: string }[]) => {
    const src = syntheticSource(files ? { files } : {});
    const m = JSON.parse(src.manifestJson) as Record<string, unknown>;
    mutate(m);
    return validateBlockManifest(m, 'demo', src.files.map((f) => f.name), { blockNames: ['demo'], routeIntegrations: ROUTES });
  };

  it('accepts the valid synthetic manifest', () => {
    expect(bad(() => {})).toEqual([]);
  });
  it('name must equal the directory name', () => {
    expect(bad((m) => { m.name = 'other'; }).join()).toMatch(/must equal the directory name/);
  });
  it('exactly one registry:page', () => {
    expect(bad((m) => { m.files = [{ path: 'demo.js', type: 'registry:file' }]; }).join()).toMatch(/exactly one/);
  });
  it('a listed file must exist in the scanned directory', () => {
    expect(bad((m) => { (m.files as { path: string; type: string }[]).push({ path: 'ghost.css', type: 'registry:file' }); }).join()).toMatch(/no such file/);
  });
  it('cssVars knobs must be --kai-*', () => {
    expect(bad((m) => { m.cssVars = { light: { '--brand': 'red' } }; }).join()).toMatch(/--kai-\*/);
  });
  it('an unknown route dependency names the known integrations', () => {
    expect(bad((m) => { m.registryDependencies = ['route:not-a-thing']; }).join()).toMatch(/not a scaffolder integration/);
  });
  it('an unknown bare block dependency is refused', () => {
    expect(bad((m) => { m.registryDependencies = ['no-such-block']; }).join()).toMatch(/not a known block/);
  });
  it('a real route dependency and a sibling block are accepted', () => {
    expect(bad((m) => { m.registryDependencies = [`route:${ROUTES[0]}`, 'demo']; })).toEqual([]);
  });
  it('rendered copy refuses em dashes and emoji (house voice)', () => {
    expect(bad((m) => { m.description = 'nice — dashy'; }).join()).toMatch(/em dash/);
    expect(bad((m) => { m.docs = 'sparkle ✨'; }).join()).toMatch(/emoji/);
  });
  it('meta.iframeHeight must be a CSS length', () => {
    expect(bad((m) => { m.meta = { iframeHeight: 'tall' }; }).join()).toMatch(/not a CSS length/);
  });
});

describe('the CDN-form generator', () => {
  const { blocks } = discoverBlocks(scanRealBlocks(), ROUTES);
  const widget = blocks.find((b) => b.name === 'support-widget') as Block;

  it('pins are generated from package.json and EQUAL its version (the lint:cdn-pins invariant)', () => {
    const { html, errors } = generateCdnForm(widget, { version: VERSION });
    expect(errors).toEqual([]);
    const pins = [...(html as string).matchAll(/@kitn\.ai\/ui@(\d+\.\d+\.\d+(?:-[\w.-]+)?)/g)].map((m) => m[1]);
    expect(pins.length).toBeGreaterThan(0);
    expect(new Set(pins)).toEqual(new Set([VERSION]));
    // Every pinned line is release-wired (inline annotation, pin first on line).
    for (const line of (html as string).split('\n')) {
      if (/@kitn\.ai\/ui@\d/.test(line)) expect(line).toMatch(/x-release-please-version/);
    }
  });

  it('the form is self-contained: no relative links/scripts survive, mock and css are inlined', () => {
    const { html } = generateCdnForm(widget, { version: VERSION });
    expect(html).not.toMatch(/src="\.\//);
    expect(html).not.toMatch(/href="\.\/(?!.*#)/);
    expect(html).toContain('inlined from ./support-widget.css');
    expect(html).toContain('inlined from ./mock.js');
    expect(html).toContain('JS PROPERTIES'); // the baked-in contract banner
    expect(html).toContain('kai-* events do not bubble');
  });

  it('the /kit/ rendering (the driver form) carries no pins at all', () => {
    const { html, errors } = generateCdnForm(widget, { version: VERSION, base: '/kit/' });
    expect(errors).toEqual([]);
    expect(html).not.toMatch(/@kitn\.ai\/ui@\d/);
    expect(html).toContain("from '/kit/state.js'");
    expect(html).not.toMatch(/x-release-please/);
  });

  it('the committed cdn.html and driver page match what the current sources produce', () => {
    const cdn = generateCdnForm(widget, { version: VERSION });
    expect(readFileSync(join(BLOCKS_DIR, 'r', 'support-widget.cdn.html'), 'utf8')).toBe(cdn.html);
    const local = generateCdnForm(widget, { version: VERSION, base: '/kit/' });
    expect(readFileSync(join(ROOT, 'scripts/block-driver/pages/support-widget/index.html'), 'utf8')).toBe(local.html);
  });

  it('maps ONLY the phase-2-proven entries, refusing the root export loudly', () => {
    expect(Object.keys(CDN_IMPORT_ENTRIES).sort()).toEqual([
      '@kitn.ai/ui/autoloader',
      '@kitn.ai/ui/elements',
      '@kitn.ai/ui/state',
      '@kitn.ai/ui/stores',
      '@kitn.ai/ui/wire',
    ]);
    expect(rewriteBareImport('@kitn.ai/ui', 'B/').error).toMatch(/root .* not loadable|root "@kitn\.ai\/ui" export/);
    expect(rewriteBareImport('@kitn.ai/ui/react', 'B/').error).toMatch(/not in the proven/);
    expect(rewriteBareImport('lodash', 'B/').error).toMatch(/cannot resolve/);
    expect(rewriteBareImport('@kitn.ai/ui/wire', 'B/').url).toBe('B/wire.js');
  });

  it('a block importing the root export fails generation with the phase-2 reason', () => {
    const src = syntheticSource({
      files: [
        { name: 'demo.html', content: '<!doctype html>\n<script type="module" src="./demo.js"></script>' },
        { name: 'demo.js', content: "import { something } from '@kitn.ai/ui';\n" },
      ],
    });
    const { blocks: b } = discoverOne(src);
    const { errors } = generateCdnForm(b[0] as Block, { version: VERSION });
    expect(errors.join()).toMatch(/root "@kitn\.ai\/ui" export is not loadable/);
  });

  it('an inlined relative module may not have imports of its own', () => {
    const out = rewriteBlockScript(
      "import { X } from './leaf.js';\n",
      new Map([['leaf.js', "import 'other';\nexport const X = 1;\n"]]),
      { version: VERSION },
    );
    expect(out.errors.join()).toMatch(/leaf modules/);
  });
});

describe('contract checks (each plant watched being caught)', () => {
  const blockWith = (files: { name: string; content: string }[]): Block => {
    const src = syntheticSource({
      manifest: { files: files.map((f, i) => ({ path: f.name, type: i === 0 ? 'registry:page' : 'registry:file' })) },
      files,
    });
    const { blocks: b, errors } = discoverOne(src);
    expect(errors).toEqual([]);
    return b[0] as Block;
  };

  it('catches a non-scalar prop set as an HTML attribute (derived from element-nonscalar.json)', () => {
    const block = blockWith([{ name: 'demo.html', content: '<!doctype html><kai-thread messages="[]"></kai-thread>' }]);
    expect(checkBlockContracts(block, NONSCALAR).join()).toMatch(/non-scalar prop "messages" as an HTML attribute/);
  });
  it('catches the legacy kitn- prefix', () => {
    const block = blockWith([{ name: 'demo.html', content: '<!doctype html><kitn-chat></kitn-chat>' }]);
    expect(checkBlockContracts(block, NONSCALAR).join()).toMatch(/kitn-/);
  });
  it('catches kai-* listeners on document/window (non-bubbling events never arrive there)', () => {
    const block = blockWith([
      { name: 'demo.html', content: '<!doctype html><p>x</p>' },
      { name: 'demo.js', content: "document.addEventListener('kai-submit', () => {});\n" },
    ]);
    expect(checkBlockContracts(block, NONSCALAR).join()).toMatch(/do not bubble/);
  });
  it('catches a hand-rolled SSE reader', () => {
    for (const line of ['new EventSource("/api")', "fetch(u,{headers:{accept:'text/event-stream'}})", 'res.body.getReader()']) {
      const block = blockWith([
        { name: 'demo.html', content: '<!doctype html><p>x</p>' },
        { name: 'demo.js', content: `${line};\n` },
      ]);
      expect(checkBlockContracts(block, NONSCALAR).join()).toMatch(/@kitn\.ai\/ui\/wire/);
    }
  });
});
