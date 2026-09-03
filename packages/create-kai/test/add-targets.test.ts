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
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
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

/**
 * THE ANTI-VACUITY FLOOR under the whole "one renderer, two callers" claim.
 *
 * `dist/blocks/f/<id>.<form>.json` is what the /blocks page SHOWS: its file
 * tree prints those `target`s and its code view prints that `content`. This
 * asserts the CLI plans the same paths AND the same bytes. Paths alone would
 * miss a CLI that bundled a stale renderer, which writes the right names with
 * the wrong file in them - and the page would still be lying.
 *
 * Resolved through Node rather than a `../../ui` literal: a relative path
 * survives a package move silently until the directory it names is empty, and
 * an empty read here would make this file vacuous instead of red.
 */
const FORMS_DIR = path.join(
  path.dirname(createRequire(import.meta.url).resolve('@kitn.ai/ui/package.json')),
  'dist/blocks/f',
);

function formArtifact(blockName: string, form: string): { files: { path: string; content: string; target: string }[] } {
  const file = path.join(FORMS_DIR, `${blockName}.${form}.json`);
  if (!existsSync(file)) {
    // LOUD, never a skip: this floor is the only check that reads what the
    // site actually serves, and a skip would be indistinguishable from a pass.
    throw new Error(
      `no generated form artifact at ${file} - run \`pnpm --filter @kitn.ai/ui run build:blocks\` (a full \`npm run build\` in packages/ui writes it too)`,
    );
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe('what /blocks displays is what add writes, byte for byte', () => {
  it('the generated artifacts are present, so the loops below are not vacuous', () => {
    expect(existsSync(FORMS_DIR), `${FORMS_DIR} is missing`).toBe(true);
    for (const block of blocks) {
      for (const form of FRAMEWORK_BLOCK_FORMS) {
        expect(formArtifact(block.name, form.id).files.length, `${block.name}.${form.id}`).toBeGreaterThan(0);
      }
    }
  });

  for (const form of FRAMEWORK_BLOCK_FORMS) {
    it(`${form.id}: planned paths and bytes equal the artifact the page serves`, () => {
      for (const block of blocks) {
        const artifact = formArtifact(block.name, form.id);
        const plan = planAdd(
          { blocks: [block], routes: [] },
          { form: form.id, kitRange: KIT_RANGE, kitVersion: KIT_VERSION },
        );
        expect(plan.files.map((f) => f.path), `${block.name}/${form.id}: paths`).toEqual(
          artifact.files.map((f) => f.target),
        );
        for (const [i, file] of plan.files.entries()) {
          expect(file.contents, `${block.name}/${form.id}: ${file.path} bytes`).toBe(artifact.files[i].content);
        }
      }
    });
  }

  it('at least one form puts its files in a directory, so an empty-root renderer could not pass', () => {
    // Without this the whole describe is satisfied by a renderer whose every
    // target equals its bare file name, which is what a broken `fileTarget`
    // would produce on both sides at once.
    const nested = FRAMEWORK_BLOCK_FORMS.some((form) =>
      formArtifact(blocks[0].name, form.id).files.every((f) => f.target.includes('/')),
    );
    expect(nested, 'no framework form nests its files, which a targets table must').toBe(true);
  });
});
