/**
 * The .js twin is written in TWO places -- packages/ui/scripts/gen-blocks.mjs
 * (into the emitted item JSON) and this package's build (beside the copied
 * source) -- because neither runtime renderer can strip types itself. Two
 * writers of one artifact is a copy, and this is the check that keeps them
 * one file rather than two.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { transformSync } from 'esbuild';

const DIST_BLOCKS = resolve(__dirname, '../dist/blocks');

describe('the stripped twins in the packed CLI', () => {
  it('exist for every .ts block source and equal what esbuild produces from it', () => {
    if (!existsSync(DIST_BLOCKS)) {
      throw new Error(`${DIST_BLOCKS} is missing. Run \`pnpm --filter create-kai run build\` first: this asserts a BUILD artifact.`);
    }
    let checked = 0;
    for (const id of readdirSync(DIST_BLOCKS)) {
      const dir = join(DIST_BLOCKS, id);
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.ts')) continue;
        const twin = join(dir, file.replace(/\.ts$/, '.js'));
        expect(existsSync(twin), `${id}/${file} has no .js twin`).toBe(true);
        const expected = transformSync(readFileSync(join(dir, file), 'utf8'), {
          loader: 'ts', format: 'esm', target: 'es2022', sourcefile: file,
        }).code;
        expect(readFileSync(twin, 'utf8')).toBe(expected);
        checked += 1;
      }
    }
    // Anti-vacuity: a scan that finds nothing must not read as a pass.
    expect(checked).toBeGreaterThan(0);
  });
});
