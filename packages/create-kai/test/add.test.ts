/**
 * THE ADD MENU MUST ONLY OFFER WHAT ADD CAN WRITE - `menu-honesty.test.ts`'s
 * rule applied to the block registry. The subject is the registry the CLI
 * actually ships (`dist/blocks`, the same copy `node dist/index.js add` walks),
 * and every block it lists is driven through the REAL `runAdd` path into a
 * real temp project, in every delivery form: the web-component form, the react
 * form, and the no-project CDN paste form. A block that resolves but cannot be
 * written fails here whether or not anyone remembered to add a case for it,
 * and a block directory added later is covered on arrival.
 *
 * Also here: the detection signals table row by row (spec Part 3's ruling -
 * asked loudly when ambiguous, refused with names under --yes), collision
 * refusal, per-block item JSON URL resolution through an injected fetch, and
 * the react transforms' own refusals.
 */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildRegistryItem } from '@kitn.ai/blocks';
import type { Axis } from '../src/axes';
import {
  FRAMEWORK_SIGNALS,
  detectForm,
  planAdd,
  resolveAdd,
} from '../src/blocks';
import type { Block } from '../src/blocks';
import { componentName } from '../src/react-form';
import { BLOCK_FORMS, FRAMEWORK_BLOCK_FORMS, README_FILE, withStrippedTwins } from '@kitn.ai/blocks/forms';
import { fileTarget, installRoot, isTargetFramework } from '@kitn.ai/blocks/targets';
import { decideForm, mergeDependencies, parseAddArgs, runAdd } from '../src/add';
import type { AddEnv } from '../src/add';
import { BLOCKS_ROOT, KIT_RANGE, KIT_VERSION, authoredBlock, loadBundledBlocks } from './helpers';

let root: string;
let blocks: Block[];

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'create-kai-add-'));
  blocks = await loadBundledBlocks();
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

interface Run {
  code: number;
  out: string[];
  err: string[];
  asked: Axis[];
}

async function runInto(
  dir: string,
  argv: string[],
  over: Partial<AddEnv> & { answer?: string } = {},
): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const asked: Axis[] = [];
  const code = await runAdd(argv, {
    cwd: dir,
    blocksRoot: BLOCKS_ROOT,
    kitRange: KIT_RANGE,
    kitVersion: KIT_VERSION,
    interactive: false,
    io: {
      ask: async (axis) => {
        asked.push(axis);
        return over.answer ?? axis.options[0].id;
      },
      state: () => {},
    },
    out: (line) => out.push(line),
    error: (line) => err.push(line),
    ...over,
  });
  return { code, out, err, asked };
}

/** A fresh project directory with the given package.json, or none. */
async function project(id: string, pkg: object | null): Promise<string> {
  const dir = path.join(root, id);
  await rm(dir, { recursive: true, force: true });
  await (await import('node:fs/promises')).mkdir(dir, { recursive: true });
  if (pkg !== null) await writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  return dir;
}

describe('the registry the CLI ships is the directory scan, derived not typed', () => {
  it('lists exactly the dist/blocks directories', async () => {
    const dirs = (await readdir(BLOCKS_ROOT, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect(blocks.map((b) => b.name)).toEqual(dirs);
    expect(dirs.length, 'no blocks at all - every loop below is vacuous').toBeGreaterThan(0);
  });

  it('`add --list` prints every block and a derived count', async () => {
    const run = await runInto(root, ['--list']);
    expect(run.code).toBe(0);
    for (const block of blocks) {
      expect(run.out.some((line) => line.includes(block.name)), `--list omits ${block.name}`).toBe(true);
    }
    expect(run.out.at(-1)).toContain(`${blocks.length} block`);
  });
});

describe('every listed block writes through the real add path, in every form', () => {
  it('has blocks to drive, so the loops below are not vacuous', () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  for (const name of ['support-widget', 'assistant', 'in-app-assistant']) {
    // The roster is NOT the subject (the derived loops below are); it pins
    // that each named block stays enrolled. It asserted only `support-widget`
    // while the other two were unconverted, so it read as three checks and was
    // one; the contract is mandatory now and all three are real.
    it(`still ships ${name} or this file's assumptions moved`, () => {
      expect(blocks.map((b) => b.name)).toContain(name);
    });
  }
});

describe('web-component form (any non-react project)', () => {
  // EVERY bundled block, with no predicate in front of it: the contract is
  // mandatory, so a block that resolves is a block the html form renders. The
  // refusal a consumer meets with an unconverted block has its own case at the
  // end of this describe, driven by a fetched item.
  const all = () => blocks;

  it('has blocks to drive, so the loops below are not vacuous', () => {
    expect(all().length).toBeGreaterThan(0);
  });

  it('writes every manifest file and pins the kit', async () => {
    for (const block of all()) {
      const dir = await project(`wc-${block.name}`, { name: 'host', dependencies: { vue: '^3.0.0' } });
      const run = await runInto(dir, [block.name]);
      expect(run.code, run.err.join('\n')).toBe(0);
      // The html form's OWN file list, not the manifest's: the authored
      // `.ts` sources are shipped as their stripped `.js` twins and the entry
      // script is generated, so the manifest is no longer the write list.
      const planned = planAdd({ blocks: [block], routes: [] }, { form: 'html', kitRange: KIT_RANGE, kitVersion: KIT_VERSION }).files;
      expect(planned.length, `${block.name}: the html form planned nothing`).toBeGreaterThan(0);
      for (const file of planned) {
        expect(existsSync(path.join(dir, file.path)), `${block.name}: ${file.path} not written`).toBe(true);
      }
      const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
      expect(pkg.dependencies['@kitn.ai/ui']).toBe(KIT_RANGE);
      if (block.manifest.docs) {
        expect(run.out.join('\n')).toContain(block.manifest.docs);
      }
    }
  });

  it('the emitted binder signals readiness and awaits registration, at module scope', async () => {
    // This case used to assert an IIFE wrap (`(async () => {`) around the
    // AUTHORED entry script, so that nothing awaited at module scope through
    // a consumer bundler. The authored entry script is gone: the binder is
    // GENERATED, and it awaits registration and boot() at module scope
    // deliberately, ending with the driver's one readiness constant. So the
    // subject moves to what the generated file must actually contain.
    for (const block of all()) {
      const dir = await project(`binder-${block.name}`, { name: 'host' });
      expect((await runInto(dir, [block.name])).code).toBe(0);
      const binder = await readFile(path.join(dir, fileTarget('html', block.name, `${block.name}.js`)), 'utf8');
      expect(binder, `${block.name}: no whenDefined await`).toContain('customElements.whenDefined');
      expect(binder, `${block.name}: no controller call`).toContain('createController');
      expect(binder, `${block.name}: no readiness signal`).toContain('window.__blockReady = true;');
    }
  });

  it('renders registration per delivery: emitted scripts never import the CDN-only autoloader', async () => {
    // The autoloader resolves element modules relative to its own URL, so a
    // bundled project 404s every element and renders nothing - observed live
    // before this rewrite existed. The CDN paste form keeps it (its native
    // pattern); both add forms must not.
    for (const block of all()) {
      const wcDir = await project(`reg-wc-${block.name}`, { name: 'host' });
      const reactDir = await project(`reg-react-${block.name}`, { name: 'host', dependencies: { react: '19' } });
      expect((await runInto(wcDir, [block.name])).code).toBe(0);
      expect((await runInto(reactDir, [block.name])).code).toBe(0);
      for (const base of [
        path.join(wcDir, installRoot('html', block.name)),
        path.join(reactDir, installRoot('react', block.name)),
      ]) {
        for (const file of (await readdir(base)).filter((f) => f.endsWith('.js'))) {
          const js = await readFile(path.join(base, file), 'utf8');
          expect(js, `${base}/${file} still imports the autoloader`).not.toContain(`'@kitn.ai/ui/autoloader'`);
        }
      }
    }
  });

  it('refuses a second add loudly, listing the collisions, overwriting nothing', async () => {
    const block = all()[0];
    const dir = await project('collide', { name: 'host' });
    expect((await runInto(dir, [block.name])).code).toBe(0);
    const page = block.manifest.files.find((f) => f.type === 'registry:page')!;
    const pagePath = path.join(dir, fileTarget('html', block.name, page.target ?? path.basename(page.path)));
    await writeFile(pagePath, 'EDITED BY THE CONSUMER');
    const second = await runInto(dir, [block.name]);
    expect(second.code).toBe(1);
    expect(second.err.join('\n')).toContain('refusing to overwrite');
    expect(second.err.join('\n')).toContain(fileTarget('html', block.name, page.target ?? path.basename(page.path)));
    expect(await readFile(pagePath, 'utf8')).toBe('EDITED BY THE CONSUMER');
  });

  it('refuses a block that is not on the authored contract, by name', async () => {
    // NOT transitional. Every bundled block is converted now, so this drives
    // the door a consumer would actually meet an old block through: a fetched
    // item JSON whose page still carries its own entry script. The refusal has
    // to name the file the wiring belongs in, or the consumer is told only
    // that something is wrong. (`dev.test.ts` keeps a synthetic fixture for
    // the same reason.)
    const item = {
      name: 'legacy-block',
      title: 'Legacy block',
      description: 'a block authored before the contract, as a consumer might still fetch one',
      type: 'registry:block',
      files: [
        {
          path: 'legacy-block.html',
          type: 'registry:page',
          content:
            '<!doctype html>\n<html lang="en"><head></head><body><kai-thread id="t"></kai-thread>'
            + '<script type="module" src="./legacy-block.js"></scr' + 'ipt></body></html>\n',
        },
        { path: 'legacy-block.js', type: 'registry:file', content: "document.getElementById('t').messages = [];\n" },
      ],
    };
    const dir = await project('html-legacy', { name: 'host', dependencies: { vue: '^3.0.0' } });
    const run = await runInto(dir, ['https://registry.example/r/legacy-block.json', '--form', 'html'], {
      fetchJson: async () => JSON.parse(JSON.stringify(item)),
    });
    expect(run.code, 'expected a refusal').toBe(1);
    expect(run.err.join('\n')).toContain('legacy-block');
    expect(run.err.join('\n')).toContain('controller.ts');
  });

  it('prints the README it just wrote, and prints the docs sentence exactly once', async () => {
    // The README is what a consumer reads to find out what the block needs.
    // Writing it and not printing it makes the terminal end on a file list.
    for (const block of all()) {
      const dir = await project(`readme-${block.name}`, { name: 'host', dependencies: { vue: '^3.0.0' } });
      const run = await runInto(dir, [block.name]);
      expect(run.code, run.err.join('\n')).toBe(0);
      const written = await readFile(path.join(dir, fileTarget('html', block.name, README_FILE)), 'utf8');
      const printed = run.out.join('\n');
      for (const line of written.trimEnd().split('\n').filter((l) => l.trim())) {
        expect(printed, `${block.name}: the README line "${line}" was written but not printed`).toContain(line);
      }
      if (block.manifest.docs) {
        const hits = printed.split(block.manifest.docs).length - 1;
        expect(hits, `${block.name}: the docs sentence appears ${hits} times`).toBe(1);
      }
    }
  });
});

describe('react form (react in the project deps)', () => {
  const all = () => blocks;

  it('writes the component, the hook and the controller for every block; never the page html', async () => {
    expect(all().length).toBeGreaterThan(0);
    for (const block of all()) {
      const dir = await project(`react-${block.name}`, { name: 'host', dependencies: { react: '^19.0.0' } });
      const run = await runInto(dir, [block.name]);
      expect(run.code, `${block.name}: ${run.err.join('\n')}`).toBe(0);
      const base = path.join(dir, installRoot('react', block.name));
      const tsx = await readFile(path.join(base, `${componentName(block.name)}.tsx`), 'utf8');
      expect(tsx).toContain("from '@kitn.ai/ui/react'");
      expect(tsx).toContain(`export function ${componentName(block.name)}()`);
      expect(tsx).toContain(`from './use${componentName(block.name)}'`);
      expect(tsx).toContain('className=');
      expect(tsx).not.toMatch(/<script\b/);
      expect(tsx).not.toContain(' class="');
      expect(existsSync(path.join(base, 'kai-elements.d.ts'))).toBe(false);
      expect(existsSync(path.join(base, `use${componentName(block.name)}.ts`))).toBe(true);
      expect(existsSync(path.join(base, `${block.name}.controller.ts`))).toBe(true);
      const page = block.manifest.files.find((f) => f.type === 'registry:page')!;
      expect(existsSync(path.join(base, page.target ?? path.basename(page.path)))).toBe(false);
    }
  });

  it('refuses a second add at the NEW root too, overwriting nothing', async () => {
    // The collision refusal is whole-plan and unchanged by this PR, but it had
    // no react case at all, and the root it guards just moved. A refusal that
    // silently stopped matching would look exactly like a clean first add.
    const block = all()[0];
    const dir = await project('react-collide', { name: 'host', dependencies: { react: '^19.0.0' } });
    expect((await runInto(dir, [block.name])).code).toBe(0);
    const component = fileTarget('react', block.name, `${componentName(block.name)}.tsx`);
    await writeFile(path.join(dir, component), 'EDITED BY THE CONSUMER');
    const second = await runInto(dir, [block.name]);
    expect(second.code).toBe(1);
    expect(second.err.join('\n')).toContain('refusing to overwrite');
    expect(second.err.join('\n')).toContain(component);
    expect(await readFile(path.join(dir, component), 'utf8')).toBe('EDITED BY THE CONSUMER');
  });
});

describe('no project: the CDN paste form (rule 1 of the signals table)', () => {
  it('writes a self-contained pinned html file and points at the wizard', async () => {
    const block = blocks.find((b) => (b.manifest.registryDependencies ?? []).every((d) => d.startsWith('route:')))!;
    const dir = await project('cdn-case', null);
    const run = await runInto(dir, [block.name]);
    expect(run.code, run.err.join('\n')).toBe(0);
    expect(run.out.join('\n')).toContain('No project here');
    expect(run.out.join('\n')).toContain('npm create kai@latest');
    const html = await readFile(path.join(dir, `${block.name}.html`), 'utf8');
    expect(html).toContain(`https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${KIT_VERSION}/dist/`);
    expect(html).not.toMatch(/src="\.\//);
    expect(html).not.toMatch(/href="\.\//);
  });

  it('still prints docs for the paste form, which carries no README', async () => {
    const block = blocks.find((b) => (b.manifest.registryDependencies ?? []).every((d) => d.startsWith('route:')))!;
    const dir = await project('cdn-docs', null);
    const run = await runInto(dir, [block.name]);
    expect(run.code).toBe(0);
    expect(existsSync(path.join(dir, 'README.md')), 'the paste form wrote a README').toBe(false);
    if (block.manifest.docs) expect(run.out.join('\n')).toContain(block.manifest.docs);
  });
});

describe('the detection signals table, row by row', () => {
  it('no package.json is rule 1: the cdn form', async () => {
    const decided = await decideForm(undefined, null, false, false, { ask: async () => 'x', state: () => {} });
    expect(decided.form).toBe('cdn');
  });

  it('has signal rows to drive, so the loop below is not vacuous', () => {
    expect(FRAMEWORK_SIGNALS.length).toBeGreaterThan(0);
  });

  for (const signal of FRAMEWORK_SIGNALS) {
    // The EXPECTATION is derived from the same place the code derives it: a
    // framework lands in its own tree when the generator emits one, and in the
    // framework-neutral html form until then. PR B2 moves both sides at once.
    const emits = FRAMEWORK_BLOCK_FORMS.some((form) => form.id === signal.framework);
    const expected = emits ? signal.framework : 'html';

    it(`${signal.dep} alone lands on ${expected}`, () => {
      const detection = detectForm({ dependencies: { [signal.dep]: '1.0.0' } });
      expect(detection.kind).toBe('detected');
      expect(detection.kind === 'detected' && detection.form).toBe(expected);
    });

    it(`${signal.dep}: the fallback is named when this release generates no ${signal.framework ?? 'framework'} tree`, () => {
      const detection = detectForm({ dependencies: { [signal.dep]: '1.0.0' } });
      if (detection.kind !== 'detected') throw new Error('expected a detection');
      // `null` means the framework has no tree of its own and never will
      // (preact renders web components like any other host), so it is not a
      // fallback to announce.
      expect(detection.fallback).toEqual(emits || signal.framework === null ? [] : [signal.framework]);
    });
  }

  it('every framework a signal names has an install root', () => {
    for (const signal of FRAMEWORK_SIGNALS) {
      if (signal.framework === null) continue;
      expect(isTargetFramework(signal.framework), signal.framework).toBe(true);
    }
  });

  it('a project with no framework signal at all is still a project: web components', () => {
    const detection = detectForm({ dependencies: { express: '^4.0.0' } });
    expect(detection).toEqual({ kind: 'detected', form: 'html', found: [], fallback: [] });
  });

  it('devDependencies count as signals too', () => {
    expect(detectForm({ devDependencies: { react: '^19.0.0' } }).kind).toBe('detected');
  });

  it('two signals that decide DIFFERENT forms are ambiguous, with what was found named', () => {
    // react always has its own tree; svelte does not until PR B2. Whichever is
    // true, these two decide different forms, which is what makes it a
    // question worth asking.
    const detection = detectForm({ dependencies: { react: '1', svelte: '4' } });
    expect(detection.kind).toBe('ambiguous');
    expect(detection.kind === 'ambiguous' && detection.found).toEqual(['react', 'svelte']);
  });

  it('two signals that decide the SAME form are not a question at all', () => {
    // Today vue and svelte both land on html, so there is nothing to choose
    // and asking would be noise. When B2 emits both trees they start deciding
    // different forms and this case flips on its own - which is why the
    // expectation is derived rather than written.
    const forms = new Set(['vue', 'svelte'].map((dep) => {
      const d = detectForm({ dependencies: { [dep]: '1' } });
      return d.kind === 'detected' ? d.form : 'ambiguous';
    }));
    const detection = detectForm({ dependencies: { vue: '3', svelte: '4' } });
    expect(detection.kind).toBe(forms.size === 1 ? 'detected' : 'ambiguous');
  });

  it('ambiguous + interactive ASKS through the axis seam, offering only the forms in contention', async () => {
    const asked: Axis[] = [];
    const decided = await decideForm(
      undefined,
      { dependencies: { react: '1', svelte: '4' } },
      true,
      true,
      { ask: async (axis) => { asked.push(axis); return axis.options[axis.options.length - 1].id; }, state: () => {} },
    );
    expect(asked).toHaveLength(1);
    expect(asked[0].question).toContain('react AND svelte');
    expect(asked[0].options.length).toBeGreaterThan(1);
    // MENU HONESTY: every option offered is a form the generator emits.
    for (const option of asked[0].options) {
      expect(BLOCK_FORMS.map((f) => f.id), `offered '${option.id}'`).toContain(option.id);
    }
    expect(asked[0].because.length, 'an axis with an empty `because` cannot be stated').toBeGreaterThan(0);
    expect(decided.form).toBe(asked[0].options[asked[0].options.length - 1].id);
  });

  it('ambiguous + non-interactive REFUSES with the flag to pass, never guesses', async () => {
    const decided = await decideForm(
      undefined,
      { dependencies: { react: '1', svelte: '4' } },
      true,
      false,
      { ask: async () => { throw new Error('must not ask under --yes'); }, state: () => {} },
    );
    expect(decided.form).toBeUndefined();
    expect(decided.error).toContain('react AND svelte');
    expect(decided.error).toContain('--form');
  });

  it('a --form flag answers the axis without asking, like every other flag', async () => {
    const decided = await decideForm('html', { dependencies: { react: '1' } }, true, true, {
      ask: async () => { throw new Error('flag given, must not ask'); },
      state: () => {},
    });
    expect(decided.form).toBe('html');
  });

  it('a framework with no generated tree is told so, loudly, in one sentence', async () => {
    // Decided loudly: landing a vue project on the html form is a decision,
    // and making it silently is the failure mode this repo names most often.
    const decided = await decideForm(undefined, { dependencies: { vue: '3' } }, true, false, {
      ask: async () => { throw new Error('not ambiguous, must not ask'); },
      state: () => {},
    });
    // Cast to a plain string comparison: today's BlockFormId union has no
    // 'vue' member at all, so a literal comparison against it is a compile
    // error rather than a false condition. Step 6 plants a real 'vue' row and
    // this widened check is what lets the SAME line answer true on both sides
    // of that plant with nothing here to edit.
    const emitsVue = (FRAMEWORK_BLOCK_FORMS as readonly { id: string }[]).some((form) => form.id === 'vue');
    if (emitsVue) {
      expect(decided.form).toBe('vue');
      expect(decided.note).toBeUndefined();
    } else {
      expect(decided.form).toBe('html');
      expect(decided.note).toContain('vue');
      expect(decided.note).toContain('html');
    }
  });
});

describe('per-block item JSON URLs resolve through the same path (the integration surface)', () => {
  it('a fetched item writes the same files the bundled block does', async () => {
    const block = blocks[0];
    // The item as the REGISTRY publishes it: gen-blocks.mjs runs
    // withStrippedTwins before buildRegistryItem, so the twins are listed in
    // the manifest a consumer fetches. The bundled copy already has them on
    // disk, so nothing is re-stripped here.
    const item = buildRegistryItem(withStrippedTwins(block, (source) => source));
    const dir = await project('url-case', { name: 'host', dependencies: { vue: '3' } });
    let fetched: string | undefined;
    const run = await runInto(dir, [`https://registry.example/r/${block.name}.json`], {
      fetchJson: async (url) => {
        fetched = url;
        return JSON.parse(JSON.stringify(item));
      },
    });
    expect(fetched).toBe(`https://registry.example/r/${block.name}.json`);
    expect(run.code, run.err.join('\n')).toBe(0);
    // The SAME renderer, so the same files: an item JSON carries the stripped
    // twins gen-blocks wrote into it, which is why the fetched door does not
    // need a stripper of its own.
    const planned = planAdd({ blocks: [block], routes: [] }, { form: 'html', kitRange: KIT_RANGE, kitVersion: KIT_VERSION }).files;
    expect(planned.length).toBeGreaterThan(0);
    for (const file of planned) {
      expect(existsSync(path.join(dir, file.path)), `${file.path} not written through the URL door`).toBe(true);
    }
  });

  it('bare registryDependencies inside a URL item resolve as sibling URLs', async () => {
    const dep = blocks[0];
    const composed = {
      name: 'composed',
      title: 'Composed',
      description: 'composes the reference block',
      type: 'registry:block',
      registryDependencies: [dep.name],
      files: [
        {
          path: 'composed.html',
          type: 'registry:page',
          content: '<!doctype html>\n<html><body><kai-thread></kai-thread></body></html>',
        },
      ],
    };
    const fetched: string[] = [];
    const resolved = await resolveAdd('https://registry.example/r/composed.json', {
      local: () => undefined,
      fetchItem: async (url) => {
        fetched.push(url);
        if (url.endsWith('composed.json')) {
          const { blockFromItemJson } = await import('../src/blocks');
          return blockFromItemJson(composed, url).block!;
        }
        return dep;
      },
    });
    expect(fetched).toEqual([
      'https://registry.example/r/composed.json',
      `https://registry.example/r/${dep.name}.json`,
    ]);
    // dependency order: the dep lands before its dependent
    expect(resolved.blocks.map((b) => b.name)).toEqual([dep.name, 'composed']);
  });
});

describe('route:<integration> dependencies, resolved against the scaffolder catalog', () => {
  // A synthetic block (the shared fixture) rather than a real one, because
  // this describe's subject is route resolution: no authored block declares a
  // `route:` dependency, and a case about routes should not also be a case
  // about whichever block happens to have one.
  const routed = (): Block => authoredBlock('routed-block', { registryDependencies: ['route:openrouter'] });

  it('the react form emits the route the way the scaffolder does', async () => {
    const resolved = await resolveAdd('routed-block', {
      local: (name) => (name === 'routed-block' ? { ...routed(), manifest: { ...routed().manifest } } : undefined),
      fetchItem: async () => { throw new Error('no fetch expected'); },
    });
    expect(resolved.routes.map((r) => r.id)).toEqual(['openrouter']);
    const plan = planAdd(resolved, { form: 'react', kitRange: KIT_RANGE, kitVersion: KIT_VERSION });
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain('server/chat.ts');
    expect(paths).toContain('vite-chat-api.ts');
    const route = plan.files.find((f) => f.path === 'server/chat.ts')!;
    expect(route.contents).toContain('openrouter.ai');
    expect(plan.notes.join('\n')).toContain('OPENROUTER_API_KEY');
  });

  it('the web-component form states the gap loudly instead of writing nothing silently', async () => {
    const resolved = await resolveAdd('routed-block', {
      local: (name) => (name === 'routed-block' ? routed() : undefined),
      fetchItem: async () => { throw new Error('no fetch expected'); },
    });
    const plan = planAdd(resolved, { form: 'html', kitRange: KIT_RANGE, kitVersion: KIT_VERSION });
    expect(plan.files.map((f) => f.path)).not.toContain('server/chat.ts');
    const notes = plan.notes.join('\n');
    expect(notes).toContain('openrouter');
    expect(notes).toContain('OPENROUTER_API_KEY');
  });

  it('an unknown route integration is refused with the known ids named', async () => {
    await expect(
      resolveAdd('route:not-a-gateway', { local: () => undefined, fetchItem: async () => { throw new Error('x'); } }),
    ).rejects.toThrow(/names no scaffolder integration.*mock/s);
  });
});

describe('refusals name the way out', () => {
  it('an unknown block points at --list', async () => {
    const dir = await project('unknown', { name: 'host' });
    const run = await runInto(dir, ['no-such-block']);
    expect(run.code).toBe(1);
    expect(run.err.join('\n')).toContain('create-kai add --list');
  });

  it('every delivery form is accepted and --form wc is refused by name', () => {
    // The accepted set is the form axis itself, DERIVED here as `add.ts`
    // derives it: a fourth delivery form is accepted and named in the refusal
    // with nothing on either side to hand-edit. Hand-typing the list is how
    // the flag came to accept a form the axis had dropped.
    for (const { id } of BLOCK_FORMS) expect(parseAddArgs(['support-widget', '--form', id]).errors, id).toEqual([]);
    const legacy = parseAddArgs(['support-widget', '--form', 'wc']);
    const message = legacy.errors.join(' ');
    expect(message).toContain('--form must be');
    for (const { id } of BLOCK_FORMS) expect(message, id).toContain(id);
    expect(message).toContain("got 'wc'");
  });

  // The three cases that stood here pinned `wrapEntryScript` and `bodyToJsx`,
  // the regex JSX translation the parsed template replaced. They are deleted
  // with the functions: the grammar's refusals have their own cases in
  // packages/blocks/tests/parse-template.test.ts.
});

describe('dependency merging never downgrades what the project already chose', () => {
  it('keeps an existing entry and says so', () => {
    const merged = mergeDependencies(
      JSON.stringify({ name: 'host', dependencies: { '@kitn.ai/ui': '^0.1.0' } }),
      { '@kitn.ai/ui': KIT_RANGE },
    );
    expect(merged.kept).toEqual(['@kitn.ai/ui']);
    expect(merged.added).toEqual([]);
    expect(JSON.parse(merged.text).dependencies['@kitn.ai/ui']).toBe('^0.1.0');
  });
});

describe('menu honesty: every --form value the flag accepts writes a real tree', () => {
  // `menu-honesty.test.ts`'s rule applied to the delivery-form flag. The
  // accepted set is the axis itself, and every value in it is driven through
  // the REAL runAdd into a real temp project. A form the flag accepts but the
  // generator cannot emit fails here whether or not anyone remembered a case,
  // and PR B2's four forms are covered on arrival.
  it('the accepted set is exactly the framework forms plus the paste form', () => {
    expect(BLOCK_FORMS.map((f) => f.id).sort()).toEqual(
      [...FRAMEWORK_BLOCK_FORMS.map((f) => f.id), 'cdn'].sort(),
    );
  });

  it('has forms and blocks to drive, so the loops below are not vacuous', () => {
    expect(BLOCK_FORMS.length).toBeGreaterThan(1);
    expect(blocks.length).toBeGreaterThan(0);
  });

  for (const form of BLOCK_FORMS) {
    it(`--form ${form.id} writes every file the form renders`, async () => {
      for (const block of blocks) {
        // A project with NO framework signal, so the flag is the only thing
        // deciding: a leg that also matched detection would pass on detection.
        const dir = await project(`form-${form.id}-${block.name}`, { name: 'host' });
        const run = await runInto(dir, [block.name, '--form', form.id]);
        expect(run.code, `${block.name} --form ${form.id}: ${run.err.join('\n')}`).toBe(0);
        const planned = planAdd(
          { blocks: [block], routes: [] },
          { form: form.id, kitRange: KIT_RANGE, kitVersion: KIT_VERSION },
        ).files;
        expect(planned.length, `${block.name} --form ${form.id}: planned nothing`).toBeGreaterThan(0);
        for (const file of planned) {
          expect(existsSync(path.join(dir, file.path)), `${block.name} --form ${form.id}: ${file.path} not written`).toBe(true);
        }
      }
    });
  }
});
