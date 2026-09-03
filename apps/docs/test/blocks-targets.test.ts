/**
 * Spec 5.4: the path /blocks DISPLAYS equals the path `create-kai add` WRITES,
 * for every block and every framework. Both sides read src/targets.ts, so this
 * is cheap and it is the guard on the section 3.4 ruling.
 *
 * It reads the GENERATED artifacts rather than a fixture, because the page
 * reads those exact files: dist/blocks/f/<id>.<form>.json, whose FormFile.target
 * is what BlockCard renders into the tree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { FRAMEWORK_BLOCK_FORMS } from '@kitn.ai/blocks/forms';
import { fileTarget, isTargetFramework } from '@kitn.ai/blocks/targets';

const require = createRequire(import.meta.url);
const kitRoot = dirname(require.resolve('@kitn.ai/ui/package.json'));
const formsDir = join(kitRoot, 'dist', 'blocks', 'f');

const blockIds = (() => {
  const index = JSON.parse(readFileSync(join(kitRoot, 'dist', 'blocks', 'registry.json'), 'utf8'));
  return (index.items as { name: string }[]).map((i) => i.name);
})();

describe('the displayed path is the written path', () => {
  it('there is at least one block and one framework -- neither axis may be empty', () => {
    expect(blockIds.length).toBeGreaterThan(0);
    expect(FRAMEWORK_BLOCK_FORMS.length).toBeGreaterThan(0);
    expect(readdirSync(formsDir).length).toBe(blockIds.length * FRAMEWORK_BLOCK_FORMS.length);
  });

  for (const id of blockIds) {
    for (const form of FRAMEWORK_BLOCK_FORMS) {
      it(`${id} x ${form.id}: every FormFile.target equals fileTarget()`, () => {
        // Narrow with the guard rather than casting: a renderer whose id is
        // not in the install-root table has no target to compare against, and
        // `as never` would hide exactly that.
        if (!isTargetFramework(form.id)) {
          throw new Error(
            `${form.id} is a renderer with no row in targets.ts INSTALL_ROOTS, so the page would display a path the CLI cannot write`,
          );
        }
        const payload = JSON.parse(readFileSync(join(formsDir, `${id}.${form.id}.json`), 'utf8'));
        expect(payload.files.length).toBeGreaterThan(0);
        for (const file of payload.files as { path: string; target: string }[]) {
          expect(file.target).toBe(fileTarget(form.id, id, file.path));
        }
      });
    }
  }
});
