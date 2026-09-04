/**
 * THE AXIS ITSELF. Every consumer of the forms list derives from it, so the one
 * thing worth asserting here is that the list is internally coherent: every id
 * renders, every framework id has an install root, and the dispatch covers all
 * of them.
 *
 * The block is the shared fixture rather than a real one, so this stays a fact
 * about the AXIS and not about any block's content.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BLOCK_FORMS, FRAMEWORK_BLOCK_FORMS, renderBlockForm } from '../src/forms';
import { fileTarget, isTargetFramework } from '../src/targets';
import type { Block } from '../src/registry';

const FIXTURES = resolve(__dirname, 'fixtures');
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');
const block = (): Block => ({
  name: 'fixture',
  manifest: {
    name: 'fixture', title: 'F', description: 'f', type: 'registry:block',
    files: [
      { path: 'fixture.html', type: 'registry:page' },
      { path: 'fixture.controller.ts', type: 'registry:file' },
      { path: 'fixture.controller.js', type: 'registry:file' },
      { path: 'fixture.css', type: 'registry:file' },
    ],
  },
  files: new Map([
    ['fixture.html', read('fixture.html')],
    ['fixture.controller.ts', read('fixture.controller.ts')],
    // The html form needs a stripped twin on disk; identity is enough here,
    // because what is under test is the AXIS, not the strip.
    ['fixture.controller.js', read('fixture.controller.ts')],
    ['fixture.css', read('fixture.css')],
  ]),
});

describe('the delivery-form axis', () => {
  it('has more than one framework form, so every loop below is non-vacuous', () => {
    expect(FRAMEWORK_BLOCK_FORMS.length).toBeGreaterThan(1);
    expect(BLOCK_FORMS.length).toBeGreaterThan(FRAMEWORK_BLOCK_FORMS.length);
  });

  it('never offers cdn as a framework: it is the paste form', () => {
    // `f.id as string`: TS 5.5+'s inferred type predicates already narrow
    // FRAMEWORK_BLOCK_FORMS's element type to exclude 'cdn' (it is
    // `BLOCK_FORMS.filter((form) => form.id !== 'cdn')`), which makes the
    // comparison below TS2367 ("no overlap") at the literal type. The
    // assertion is checking exactly that exclusion, so it has to compare
    // through a widened type rather than stop existing.
    expect(FRAMEWORK_BLOCK_FORMS.some((f) => (f.id as string) === 'cdn')).toBe(false);
  });

  it('every framework form id has an install root', () => {
    for (const form of FRAMEWORK_BLOCK_FORMS) {
      expect(isTargetFramework(form.id), `${form.id} has no row in INSTALL_ROOTS`).toBe(true);
    }
  });

  for (const form of BLOCK_FORMS) {
    it(`${form.id}: renderBlockForm emits a non-empty tree with derived targets`, () => {
      const files = renderBlockForm(block(), form.id, { cdn: { version: '0.0.0-test' } });
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        expect(file.target, `${form.id}/${file.path}`).toBe(
          isTargetFramework(form.id) ? fileTarget(form.id, 'fixture', file.path) : file.path,
        );
      }
    });
  }

  it('every framework form ships a README, and cdn ships exactly one file', () => {
    for (const form of FRAMEWORK_BLOCK_FORMS) {
      const files = renderBlockForm(block(), form.id, { cdn: { version: '0.0.0-test' } });
      expect(files.some((f) => f.path === 'README.md'), `${form.id} has no README`).toBe(true);
    }
    expect(renderBlockForm(block(), 'cdn', { cdn: { version: '0.0.0-test' } })).toHaveLength(1);
  });
});
