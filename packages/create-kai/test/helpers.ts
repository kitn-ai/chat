/**
 * Shared test fixtures for the CLI's own suites: the bundled block registry
 * (the same `dist/blocks` copy `node dist/index.js add` walks) and the
 * fake-but-stable kit pins tests build a plan against.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { componentName } from '@kitn.ai/blocks/forms';

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

/**
 * A block authored ON the contract: one marked block root, the wiring on the
 * markup, and a controller instead of an entry script.
 *
 * A synthetic one keeps a case about route resolution or write targets from
 * also being a case about whichever real block happens to suit it: no authored
 * block declares a `route:` dependency, and none should have to. The type
 * names the controller declares are fixed by the contract, so they are derived
 * from the block id here too.
 */
export function authoredBlock(name: string, manifest: Partial<Block['manifest']> = {}): Block {
  const component = componentName(name);
  return {
    name,
    manifest: {
      name,
      title: component,
      description: `the ${name} test fixture`,
      type: 'registry:block',
      files: [
        { path: `${name}.html`, type: 'registry:page' },
        { path: `${name}.controller.ts`, type: 'registry:file' },
        { path: `${name}.controller.js`, type: 'registry:file' },
      ],
      ...manifest,
    },
    files: new Map([
      [
        `${name}.html`,
        `<!doctype html>\n<html><body><kai-thread data-block-root id="t" #ref="thread" .messages="messages"></kai-thread></body></html>`,
      ],
      [
        `${name}.controller.ts`,
        [
          `export interface ${component}State { messages: unknown[]; }`,
          `export interface ${component}Refs { thread: unknown; }`,
          `export interface ${component}Actions { boot(): Promise<void>; }`,
          `export function createController(deps: { refs: () => ${component}Refs }) {`,
          '  return deps as never;',
          '}',
          '',
        ].join('\n'),
      ],
      [`${name}.controller.js`, 'export function createController(deps) {\n  return deps;\n}\n'],
    ]),
  };
}
