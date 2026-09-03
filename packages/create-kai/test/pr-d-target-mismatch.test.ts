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
import { loadBundledBlocks, KIT_RANGE, KIT_VERSION } from './helpers';

describe('the PR D target mismatch', () => {
  it('the react form declares src/components/<id> while add still writes src/blocks/<id>', async () => {
    const blocks = await loadBundledBlocks();
    const block = blocks.find((b) => b.name === 'support-widget');
    if (!block) throw new Error('support-widget is not in the bundled registry');

    const plan = planAdd({ blocks: [block], routes: [] }, { form: 'react', kitRange: KIT_RANGE, kitVersion: KIT_VERSION });
    const written = plan.files.map((f) => f.path);

    expect(installRoot('react', 'support-widget')).toBe('src/components/support-widget');
    expect(written.every((p) => p.startsWith('src/blocks/support-widget/'))).toBe(true);
    expect(written.some((p) => p.startsWith('src/components/'))).toBe(false);
  });
});
