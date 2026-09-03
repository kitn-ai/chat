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
 * - GENERATOR SHAPE: the CDN form is self-contained; its pins come from the
 *   INJECTED version and nothing else (rendered twice under two versions, so a
 *   baked-in pin could not pass); only the phase-2-proven entries resolve; the
 *   root export is refused loudly.
 * - CONTRACT CHECKS: rich-prop-as-attribute, the kitn- prefix, document-level
 *   kai-* listeners and hand-rolled SSE are each caught on a plant.
 *
 * WHAT IS NOT HERE, and where it went. Four assertions need inputs this package
 * does not have: the kit's real integration catalog, its real
 * element-nonscalar.json, its real version (the lint:cdn-pins equality), and
 * the BUILT artifacts under its dist/blocks/. They live in
 * packages/ui/mcp/tests/blocks-artifacts.test.ts, in the package that owns
 * those inputs, plus verify:blocks on the emitted artifact. The split is by
 * what each assertion's INPUTS are, not by its subject.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { transformSync } from 'esbuild';
import { renderCdnFormFiles, withStrippedTwins } from '../src/forms';
import {
  discoverBlocks,
  validateBlockManifest,
  generateCdnForm,
  rewriteBareImport,
  rewriteBlockScript,
  checkBlockContracts,
  CDN_IMPORT_ENTRIES,
  type Block,
  type RawBlockSource,
} from '../src/registry';

const BLOCKS_DIR = resolve(__dirname, '../blocks');

/**
 * FIXTURES, not the real catalogs, and that is the point. `routeIntegrations`
 * and `nonscalarByTag` reach the registry BY INJECTION precisely so this module
 * does not know them; a test of an injection seam that reaches for the real
 * value is testing the caller instead. Reading them here would also mean a
 * relative hop into packages/ui, which is the reach the package boundary exists
 * to delete.
 *
 * The real catalogs meeting the real blocks is `pnpm --filter @kitn.ai/ui run
 * verify:blocks` ([contracts] and [pins]) plus
 * packages/ui/mcp/tests/blocks-artifacts.test.ts, both of which live in the
 * package that has them. Neither half is lost; each is asserted where its
 * inputs are.
 */
const ROUTES = ['fixture-route-a', 'fixture-route-b'];
const NONSCALAR: Record<string, string[]> = { 'kai-thread': ['messages'] };
const VERSION = '9.9.9-fixture';

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

/**
 * The exports map is not decoration: `tsc` follows `types` while gen-blocks.mjs
 * and verify-blocks.mjs read `default` out of this same map to locate the entry
 * they esbuild-bundle. If the two ever disagree, the typechecked module and the
 * generated artifacts come from different files and nothing else would say so.
 * (Re-homed from the deleted tests/skeleton.test.ts, which pinned `default`.)
 */
describe('the package exports map', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
    exports: Record<string, { types: string; default: string }>;
  };

  it('points both entries at their real source files', () => {
    expect(pkg.exports['.'].default).toBe('./src/registry.ts');
    expect(pkg.exports['./forms'].default).toBe('./src/forms/index.ts');
  });

  it('resolves `types` and `default` to the SAME file for every entry', () => {
    for (const subpath of ['.', './forms']) {
      expect(pkg.exports[subpath].types).toBe(pkg.exports[subpath].default);
    }
  });
});

describe('registry derivation (the directory scan is the list)', () => {
  const sources = scanRealBlocks();
  const { blocks } = discoverBlocks(sources, ROUTES);

  // THE WALK, which depends on nothing but the directory layout. A zero-block
  // scan is a broken walk, and naming one real block catches a walk that found
  // directories but not these ones.
  it('the directory walk finds the authored block directories', () => {
    expect(sources.length).toBeGreaterThanOrEqual(1);
    expect(sources.map((s) => s.dirName)).toContain('support-widget');
  });

  // THE DERIVATION: everything the walk found is everything discovery returns,
  // so adding a block is adding a directory.
  //
  // THIS ASSERTION DEPENDS ON THE FIXTURE `ROUTES` ABOVE, and is not immune to a
  // real route dependency. `discoverBlocks` DROPS a source whose manifest fails
  // validation (src/registry.ts: `if (errs.length) { errors.push(...errs);
  // continue; }`), so the day a manifest declares a `route:<id>` the fixture list
  // does not contain, that block validates red, never reaches `blocks`, and this
  // equality goes red with it. The fix then is to add the id to ROUTES, not to
  // weaken this. The real-catalog version of this claim, which cannot drift that
  // way, lives in packages/ui/mcp/tests/blocks-artifacts.test.ts (and verify:blocks
  // [contracts]); both have the real integration catalog, and this package
  // deliberately does not.
  it('every walked directory is discovered, and nothing else is', () => {
    expect(blocks.map((b) => b.name).sort()).toEqual(sources.map((s) => s.dirName).sort());
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
  it('refuses a files[].target that is not the file basename (targets.ts owns the directory)', () => {
    const errs = bad((m) => {
      m.files = [{ path: 'demo.html', type: 'registry:page', target: 'src/blocks/x/demo.html' }];
    });
    expect(errs.join(' ')).toContain('targets.ts');
    expect(errs.join(' ')).toContain('"target" is derived');
  });
  it('accepts a target that equals the basename, and its absence', () => {
    expect(bad((m) => {
      m.files = [{ path: 'demo.html', type: 'registry:page', target: 'demo.html' }];
    })).toEqual([]);
    expect(bad((m) => {
      m.files = [{ path: 'demo.html', type: 'registry:page' }];
    })).toEqual([]);
  });
});

describe('the CDN-form generator', () => {
  const { blocks } = discoverBlocks(scanRealBlocks(), ROUTES);
  const widget = blocks.find((b) => b.name === 'support-widget') as Block;

  // The paste form is rendered from the HTML FORM, never from the authored
  // files: an authored page carries no script for the inliner to inline, and
  // the twin is what the html form ships in place of the .ts source. This is
  // the same two-call sequence gen-blocks.mjs and the kai dev route run.
  const twinned = (block: Block): Block =>
    withStrippedTwins(block, (source, fileName) =>
      transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: fileName }).code,
    );
  const cdnHtml = (block: Block, opts: { version: string; base?: string }): string =>
    renderCdnFormFiles(twinned(block), opts)[0].content;

  it('pins are generated from the injected version, never baked in', () => {
    const a = cdnHtml(widget, { version: '1.2.3-fixture' });
    const b = cdnHtml(widget, { version: '4.5.6-fixture' });
    const pins = (html: string) =>
      new Set([...html.matchAll(/@kitn\.ai\/ui@([\d.]+(?:-[\w.-]+)?)/g)].map((m) => m[1]));
    expect(pins(a)).toEqual(new Set(['1.2.3-fixture']));
    expect(pins(b)).toEqual(new Set(['4.5.6-fixture']));
    // Every pinned line stays release-wired (inline annotation, pin first on line).
    for (const line of a.split('\n')) {
      if (/@kitn\.ai\/ui@\d/.test(line)) expect(line).toMatch(/x-release-please-version/);
    }
  });

  it('the form is self-contained: no relative links/scripts survive, mock and css are inlined', () => {
    const html = cdnHtml(widget, { version: VERSION });
    expect(html).not.toMatch(/src="\.\//);
    expect(html).not.toMatch(/href="\.\/(?!.*#)/);
    expect(html).toContain('inlined from ./support-widget.css');
    // Two levels: the generated binder imports the controller, the controller
    // imports the mock, and both bodies land in the one file.
    expect(html).toContain('inlined from ./support-widget.controller.js');
    expect(html).toContain('inlined from ./mock.js');
    expect(html).toContain('JS PROPERTIES'); // the baked-in contract banner
    expect(html).toContain('kai-* events do not bubble');
  });

  it('carries the binder and the controller, not just markup', () => {
    // The failure this catches is silent by construction: a form whose script
    // never got inlined is still valid HTML and still renders a page.
    const html = cdnHtml(widget, { version: VERSION });
    expect(html).toContain('createController');
    expect(html).toContain('window.__blockReady = true;');
    expect(html).toContain('customElements.whenDefined');
    // The autoloader, not the register-all bundle: the paste form runs off
    // raw CDN URLs in a plain page, which is the autoloader's own pattern.
    expect(html).toContain('elements/autoloader.js');
  });

  it('the /kit/ rendering (the driver form) carries no pins at all', () => {
    const html = cdnHtml(widget, { version: VERSION, base: '/kit/' });
    expect(html).not.toMatch(/@kitn\.ai\/ui@\d/);
    expect(html).toContain("from '/kit/state.js'");
    expect(html).not.toMatch(/x-release-please/);
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

  // The inliner used to refuse ANY import inside an inlined module ("leaf
  // modules, constants only"). The authored contract makes that shape
  // impossible: the generated binder imports the controller, and the
  // controller imports its mock plus the @kitn.ai/ui entries it parses
  // through. That is exactly two levels, so two levels is what the inliner
  // does, and the third is a loud refusal naming the file.
  it("inlines one level: the entry, the controller it imports, and the controller's own leaf import", () => {
    const files = new Map([
      ['b.js', "import '@kitn.ai/ui/autoloader';\nimport { createController } from './b.controller.js';\ncreateController({});\n"],
      ['b.controller.js', "import { readOpenAIStream } from '@kitn.ai/ui/wire';\nimport { MOCK } from './mock.js';\nexport function createController() { return [readOpenAIStream, MOCK]; }\n"],
      ['mock.js', 'export const MOCK = [];\n'],
    ]);
    const out = rewriteBlockScript(files.get('b.js') as string, files, { version: VERSION });
    expect(out.errors).toEqual([]);
    const code = out.code as string;
    expect(code).toContain(`@kitn.ai/ui@${VERSION}/dist/elements/autoloader.js`);
    expect(code).toContain(`@kitn.ai/ui@${VERSION}/dist/wire.js`);
    expect(code).toContain('const MOCK = [];');
    expect(code).not.toContain("from './b.controller.js'");
    expect(code).not.toContain("from './mock.js'");
    // ORDER is load-bearing: a module's body sits above the code that reads
    // it, deepest first. Nothing else in this suite would notice if the two
    // were swapped, and the pasted file would throw at load.
    expect(code.indexOf('const MOCK = [];')).toBeLessThan(code.indexOf('function createController()'));
    expect(code.indexOf('function createController()')).toBeLessThan(code.indexOf('createController({});'));
  });

  it('rewrites a MULTI-LINE import, which is what esbuild emits for a wide one', () => {
    // The scan was line-anchored, so `import {\n  a,\n  b\n} from "x";` matched
    // nothing and was copied through VERBATIM: the pasted file kept a bare
    // specifier no browser resolves, and nothing said a word. The block's own
    // stripped controller is exactly this shape.
    const files = new Map([
      ['b.js', "import { createController } from './b.controller.js';\ncreateController();\n"],
      [
        'b.controller.js',
        'import {\n  localStorageStore,\n  isConversationUnread\n} from "@kitn.ai/ui/stores";\nexport function createController() { return [localStorageStore, isConversationUnread]; }\n',
      ],
    ]);
    const out = rewriteBlockScript(files.get('b.js') as string, files, { version: VERSION });
    expect(out.errors).toEqual([]);
    expect(out.code as string).toContain(`@kitn.ai/ui@${VERSION}/dist/stores.js`);
    expect(out.code as string).not.toContain('"@kitn.ai/ui/stores"');
  });

  it('refuses a bare specifier that survived the rewrite, rather than emitting it', () => {
    // The BACKSTOP, and the reason the case above was ever able to ship: the
    // rewrite recognises the import shapes it models, and one it does not
    // model is copied through verbatim with nothing said. The form claims to
    // be self-contained, so a bare specifier left in the emitted script makes
    // that claim false in a way only a browser would report. An import with a
    // trailing comment is one such shape (the pattern ends the statement at
    // the quote), and it stands here for all of them.
    const files = new Map([['b.js', "import { x } from 'unknown-pkg'; // why\nx();\n"]]);
    const errors = rewriteBlockScript(files.get('b.js') as string, files, { version: VERSION }).errors.join(' ');
    expect(errors).toContain('unknown-pkg');
    expect(errors).toContain('self-contained');
  });

  it('refuses a THIRD level rather than inlining a module graph', () => {
    const files = new Map([
      ['b.js', "import { a } from './a.js';\na();\n"],
      ['a.js', "import { b } from './b2.js';\nexport const a = () => b;\n"],
      ['b2.js', "import { c } from './c.js';\nexport const b = c;\n"],
      ['c.js', 'export const c = 1;\n'],
    ]);
    const out = rewriteBlockScript(files.get('b.js') as string, files, { version: VERSION });
    expect(out.errors.join(' ')).toContain('two levels');
    expect(out.errors.join(' ')).toContain('b2.js');
  });

  it('still refuses a bare import that is not a proven @kitn.ai/ui entry, at any level', () => {
    const files = new Map([
      ['b.js', "import { x } from './a.js';\nx();\n"],
      ['a.js', "import lodash from 'lodash';\nexport const x = lodash;\n"],
    ]);
    expect(rewriteBlockScript(files.get('b.js') as string, files, { version: VERSION }).errors.join(' '))
      .toContain('lodash');
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

  /** A full authored page around `body`, with the block root the contract
   *  requires. `demo` is the synthetic block's name, so the controller the
   *  checks look for is `demo.controller.ts` and its types are `Demo*`. */
  const pageOf = (body: string) =>
    `<!doctype html>\n<html lang="en"><head></head><body><div data-block-root>${body}</div></body></html>`;

  /** A controller of the contract shape, with the members the case needs. */
  const controllerOf = (opts: { actions?: string[]; refs?: string[]; state?: string[] }) =>
    [
      `export interface DemoState { ${(opts.state ?? ['ready']).map((f) => `${f}: boolean;`).join(' ')} }`,
      `export interface DemoRefs { ${(opts.refs ?? ['dock']).map((r) => `${r}: unknown;`).join(' ')} }`,
      `export interface DemoActions { ${[...(opts.actions ?? ['open']), 'boot'].map((a) => `${a}(): void;`).join(' ')} }`,
      `export function createController(deps: unknown) { return deps as never; }`,
      '',
    ].join('\n');

  const contractErrors = (body: string, controller?: string) =>
    checkBlockContracts(
      blockWith([
        { name: 'demo.html', content: pageOf(body) },
        ...(controller ? [{ name: 'demo.controller.ts', content: controller }] : []),
      ]),
      NONSCALAR,
    );

  it('catches a non-scalar prop in : attribute position (the prefix used to slip past the scan)', () => {
    expect(contractErrors('<kai-thread :messages="messages"></kai-thread>', controllerOf({})).join(' '))
      .toContain('non-scalar prop "messages"');
  });

  it('catches a non-scalar prop in seed: attribute position, for the same reason', () => {
    expect(contractErrors('<kai-thread seed:messages="[]"></kai-thread>', controllerOf({})).join(' '))
      .toContain('non-scalar prop "messages"');
  });

  it('accepts the same prop in .prop position, which is what a rich binding looks like', () => {
    expect(contractErrors('<kai-thread .messages="messages"></kai-thread>', controllerOf({ state: ['messages'] })))
      .toEqual([]);
  });

  it('surfaces a grammar error from the page (one owner for the grammar)', () => {
    expect(contractErrors('<kai-button :hidden="!drilled"></kai-button>', controllerOf({})).join(' '))
      .toContain('never an expression');
  });

  it('catches an @ binding pointing at an action the controller does not export', () => {
    const errs = contractErrors('<kai-button @kai-click="bak"></kai-button>', controllerOf({ actions: ['back'] }));
    expect(errs.join(' ')).toContain('@kai-click="bak"');
    expect(errs.join(' ')).toContain('back');
  });

  it('catches a #ref the controller does not declare in its Refs', () => {
    const errs = contractErrors('<kai-dock #ref="dok"></kai-dock>', controllerOf({ refs: ['dock'] }));
    expect(errs.join(' ')).toContain('#ref="dok"');
  });

  it('refuses a page with bindings and no controller', () => {
    expect(contractErrors('<kai-button @kai-click="open"></kai-button>').join(' '))
      .toContain('demo.controller.ts');
  });

  it('refuses a block with no controller, now that the contract is mandatory', () => {
    // The case above is a page that DECLARES bindings. This one declares
    // none, which used to be how an unconverted block travelled through the
    // conversion round: the checks were skipped for it entirely and this
    // assertion passed vacuously on an empty error list.
    expect(contractErrors('<kai-thread></kai-thread>').join(' ')).toContain('.controller.ts');
  });
});
