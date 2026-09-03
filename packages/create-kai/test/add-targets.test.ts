/**
 * WHERE `add` WRITES.
 *
 * Every planned path is the rendered file's own `target`, which the renderers
 * derived through `fileTarget()` in `@kitn.ai/blocks/targets`. So the path the
 * /blocks page displays and the path the CLI writes are ONE string rather than
 * two joins that happen to agree today. `blockDir()` was the second join, and
 * it disagreed: it wrote react blocks to `src/blocks/<id>/` while the table
 * said `src/components/<id>/`.
 *
 * The loops are derived twice over: blocks from the shipped registry scan,
 * forms from `FRAMEWORK_BLOCK_FORMS`. PR B2's four renderers are covered here
 * on arrival with nothing to edit.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { FRAMEWORK_BLOCK_FORMS, renderBlockForm } from '@kitn.ai/blocks/forms';
import { fileTarget, isTargetFramework } from '@kitn.ai/blocks/targets';
import { planAdd } from '../src/blocks';
import type { Block } from '../src/blocks';
import { KIT_RANGE, KIT_VERSION, loadBundledBlocks } from './helpers';

let blocks: Block[];

beforeAll(async () => {
  blocks = await loadBundledBlocks();
});

describe('planAdd writes at the targets table', () => {
  it('has blocks and framework forms to drive, so the loops below are not vacuous', () => {
    expect(blocks.length).toBeGreaterThan(0);
    expect(FRAMEWORK_BLOCK_FORMS.length).toBeGreaterThan(0);
  });

  it('every framework form id is a framework the targets table knows', () => {
    // The coupling itself: a renderer added to BLOCK_FORMS with no install
    // root would make `fileTarget` unreachable for it, and the loops below
    // would throw rather than check anything.
    for (const form of FRAMEWORK_BLOCK_FORMS) {
      expect(isTargetFramework(form.id), `${form.id} has no install root`).toBe(true);
    }
  });

  for (const form of FRAMEWORK_BLOCK_FORMS) {
    it(`${form.id}: every planned path is fileTarget(${form.id}, id, name)`, () => {
      if (!isTargetFramework(form.id)) throw new Error(`${form.id} is not a target framework`);
      for (const block of blocks) {
        const rendered = renderBlockForm(block, form.id, { cdn: { version: KIT_VERSION } });
        expect(rendered.length, `${block.name}/${form.id}: rendered nothing`).toBeGreaterThan(0);
        const plan = planAdd(
          { blocks: [block], routes: [] },
          { form: form.id, kitRange: KIT_RANGE, kitVersion: KIT_VERSION },
        );
        expect(plan.files.map((f) => f.path)).toEqual(
          rendered.map((f) => fileTarget(form.id, block.name, f.path)),
        );
      }
    });
  }

  it('the react form lands under src/components/<id>/ and never src/blocks/', () => {
    for (const block of blocks) {
      const plan = planAdd(
        { blocks: [block], routes: [] },
        { form: 'react', kitRange: KIT_RANGE, kitVersion: KIT_VERSION },
      );
      expect(plan.files.length).toBeGreaterThan(0);
      for (const file of plan.files) {
        expect(file.path.startsWith(`src/components/${block.name}/`), file.path).toBe(true);
      }
    }
  });

  it('the cdn form is one self-contained file in the cwd, with no directory at all', () => {
    const block = blocks.find((b) => (b.manifest.registryDependencies ?? []).every((d) => d.startsWith('route:')));
    expect(block, 'no block can be rendered as a single paste file').toBeDefined();
    const plan = planAdd(
      { blocks: [block!], routes: [] },
      { form: 'cdn', kitRange: KIT_RANGE, kitVersion: KIT_VERSION },
    );
    expect(plan.files.map((f) => f.path)).toEqual([`${block!.name}.html`]);
  });
});
