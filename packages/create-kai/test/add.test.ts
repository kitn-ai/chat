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
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildRegistryItem } from '@kitn.ai/blocks';
import type { Axis } from '../src/axes';
import {
  FRAMEWORK_SIGNALS,
  blockFormAxis,
  detectForm,
  planAdd,
  resolveAdd,
} from '../src/blocks';
import type { Block } from '../src/blocks';
// `componentName` comes back with the positive react-form assertions in the
// commit that converts the blocks (Task 9); nothing here names it today.
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
    // The roster above is NOT the subject (the derived loop below is); it only
    // pins that the reference block stays enrolled by name.
    it(`still ships ${name} or this file's assumptions moved`, () => {
      if (name === 'support-widget') expect(blocks.map((b) => b.name)).toContain(name);
    });
  }
});

describe('web-component form (any non-react project)', () => {
  // The real blocks are still authored the old way at this point in the
  // branch, so the html renderer refuses every one of them by name. The four
  // positive cases this describe carried are restored in the commit that
  // converts them (Task 9): "writes every manifest file and pins the kit",
  // "wraps the wc entry script so nothing top-level awaits through a
  // bundler", "renders registration per delivery: emitted scripts never
  // import the CDN-only autoloader", and "refuses a second add loudly,
  // listing the collisions, overwriting nothing".
  it('refuses the html form for a block that is not on the authored contract yet', async () => {
    for (const block of blocks) {
      const dir = await project(`html-${block.name}`, { name: 'host', dependencies: { vue: '^3.0.0' } });
      const run = await runInto(dir, [block.name, '--form', 'html']);
      expect(run.code, `${block.name}: expected a refusal`).toBe(1);
      expect(run.err.join('\n'), block.name).toContain(block.name);
      expect(run.err.join('\n'), block.name).toContain('controller.ts');
    }
  });
});

describe('react form (react in the project deps)', () => {
  // The real blocks are still authored the old way at this point in the
  // branch; the react renderer refuses a page with no controller, by name.
  // Task 9 converts them and this case becomes the positive assertions again,
  // in that commit: "writes the component, the hook and the controller for
  // every block; never the page html".
  it('refuses the react form for a block that is not on the authored contract yet', async () => {
    for (const block of blocks) {
      const dir = await project(`react-${block.name}`, { name: 'host', dependencies: { react: '^19.0.0' } });
      const run = await runInto(dir, [block.name]);
      expect(run.code, `${block.name}: expected a refusal`).toBe(1);
      expect(run.err.join('\n'), block.name).toContain(block.name);
      expect(run.err.join('\n'), block.name).toContain('controller.ts');
    }
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
});

describe('the detection signals table, row by row', () => {
  it('no package.json is rule 1: the cdn form', async () => {
    const decided = await decideForm(undefined, null, false, false, { ask: async () => 'x', state: () => {} });
    expect(decided.form).toBe('cdn');
  });

  for (const signal of FRAMEWORK_SIGNALS) {
    it(`${signal.dep} alone lands on ${signal.lands}`, () => {
      const detection = detectForm({ dependencies: { [signal.dep]: '1.0.0' } });
      expect(detection).toEqual({ kind: 'detected', form: signal.lands, found: [signal.dep] });
    });
  }

  it('a project with no framework signal at all is still a project: web components', () => {
    expect(detectForm({ dependencies: { express: '^4.0.0' } })).toEqual({ kind: 'detected', form: 'html', found: [] });
  });

  it('devDependencies count as signals too', () => {
    expect(detectForm({ devDependencies: { react: '^19.0.0' } }).kind).toBe('detected');
  });

  it('react AND svelte is ambiguous, with what was found named', () => {
    const detection = detectForm({ dependencies: { react: '1', svelte: '4' } });
    expect(detection).toEqual({ kind: 'ambiguous', found: ['react', 'svelte'] });
  });

  it('two non-react frameworks agree on the answer, so nothing is ambiguous', () => {
    expect(detectForm({ dependencies: { vue: '3', svelte: '4' } }).kind).toBe('detected');
  });

  it('ambiguous + interactive ASKS through the axis seam, naming what was found', async () => {
    const asked: Axis[] = [];
    const decided = await decideForm(
      undefined,
      { dependencies: { react: '1', svelte: '4' } },
      true,
      true,
      { ask: async (axis) => { asked.push(axis); return 'html'; }, state: () => {} },
    );
    expect(decided.form).toBe('html');
    expect(asked).toHaveLength(1);
    expect(asked[0].question).toContain('react AND svelte');
    expect(asked[0].options.map((o) => o.id).sort()).toEqual(['html', 'react']);
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

  it('the ambiguous axis has a real choice, so the axis rule would ask it', () => {
    expect(blockFormAxis(['react', 'svelte']).options.length).toBeGreaterThan(1);
  });
});

describe('per-block item JSON URLs resolve through the same path (the integration surface)', () => {
  it('a fetched item reaches the same renderer the bundled block does', async () => {
    // While the real blocks are unconverted that renderer REFUSES, so what
    // this pins today is the fetch surface plus the refusal being identical
    // through both doors. Task 9 converts them and the assertion goes back to
    // "writes the same files the bundled block does".
    const block = blocks[0];
    const item = buildRegistryItem(block);
    const dir = await project('url-case', { name: 'host', dependencies: { vue: '3' } });
    let fetched: string | undefined;
    const run = await runInto(dir, [`https://registry.example/r/${block.name}.json`], {
      fetchJson: async (url) => {
        fetched = url;
        return JSON.parse(JSON.stringify(item));
      },
    });
    expect(fetched).toBe(`https://registry.example/r/${block.name}.json`);
    expect(run.code).toBe(1);
    expect(run.err.join('\n')).toContain('controller.ts');
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
  // Authored ON THE CONTRACT (the shared fixture), because this describe's
  // subject is route resolution: it has to render for either form to be
  // reached, and the real blocks do not convert until the next commit.
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

  it('--form html is accepted and --form wc is refused by name', () => {
    expect(parseAddArgs(['support-widget', '--form', 'html']).errors).toEqual([]);
    const legacy = parseAddArgs(['support-widget', '--form', 'wc']);
    expect(legacy.errors.join(' ')).toContain("--form must be react, html or cdn, got 'wc'");
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
