/**
 * KNOWN MISMATCH, deliberate, temporary, and scheduled: PR D.
 *
 * PR B put `src/targets.ts` in the blocks package because the react renderer
 * needs a path, and left `blockDir()` alone because rewriting the CLI's write
 * planner is PR D's job. So right now the FORM says its react files belong at
 * `src/components/<id>/` and `add` still writes them to `src/blocks/<id>/`.
 *
 * This test asserts the mismatch EXISTS. It goes red the day either side
 * moves, which is the point: PR D deletes a failing test instead of
 * discovering an old lie. Delete this file in PR D, in the commit that makes
 * `planAdd` read `fileTarget()`.
 */
import { describe, expect, it } from 'vitest';
import { installRoot } from '@kitn.ai/blocks/targets';
import { planAdd } from '../src/blocks';
import { authoredBlock, KIT_RANGE, KIT_VERSION } from './helpers';

describe('the PR D target mismatch', () => {
  it('the react form declares src/components/<id> while add still writes src/blocks/<id>', () => {
    // The subject is where `add` WRITES, so any renderable block shows it. It
    // is the synthetic authored-contract fixture rather than support-widget
    // only while the real blocks are unconverted: the react renderer refuses
    // one, and this case would then be red for a reason that is not the
    // mismatch.
    const block = authoredBlock('authored-block');
    const plan = planAdd({ blocks: [block], routes: [] }, { form: 'react', kitRange: KIT_RANGE, kitVersion: KIT_VERSION });
    const written = plan.files.map((f) => f.path);

    expect(written.length).toBeGreaterThan(0);
    expect(installRoot('react', block.name)).toBe(`src/components/${block.name}`);
    expect(written.every((p) => p.startsWith(`src/blocks/${block.name}/`))).toBe(true);
    expect(written.some((p) => p.startsWith('src/components/'))).toBe(false);
  });
});
