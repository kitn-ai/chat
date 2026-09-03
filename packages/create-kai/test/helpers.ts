/**
 * Shared test fixtures for the CLI's own suites: the bundled block registry
 * (the same `dist/blocks` copy `node dist/index.js add` walks) and the
 * fake-but-stable kit pins tests build a plan against.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { loadBlocks } from '../src/blocks';
import type { Block } from '../src/blocks';

export const BLOCKS_ROOT = path.resolve(__dirname, '../dist/blocks');
export const KIT_RANGE = '^9.9.9';
export const KIT_VERSION = '9.9.9';

export async function loadBundledBlocks(): Promise<Block[]> {
  if (!existsSync(BLOCKS_ROOT)) {
    throw new Error(`no blocks at ${BLOCKS_ROOT} - run \`pnpm --filter create-kai run build\` first`);
  }
  return loadBlocks(BLOCKS_ROOT);
}
