import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineWebComponent } from './define-entry';

describe('@kitn.ai/ui/define', () => {
  it('re-exports the real defineWebComponent', () => {
    expect(typeof defineWebComponent).toBe('function');
  });

  // Same shape as `./solid`'s server twin (vite.config.solid.server.ts):
  // `node`/`deno`/`worker` resolve to a Solid-SSR-transformed build
  // (dist/define.server.js, vite.config.define.server.ts) so merely IMPORTING
  // the entry under Node doesn't hit Solid's client-only `notSup` stub at
  // module scope — the same class of bug verify-ssr-imports.mjs exists to
  // catch. `browser`/`default` still resolve to the DOM build.
  it('is wired into the exports map with types and a server twin', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
    ) as { exports: Record<string, { types?: string; default?: string; browser?: string; node?: string; worker?: string; deno?: string }> };
    expect(pkg.exports['./define']).toEqual({
      types: './dist/define.d.ts',
      worker: './dist/define.server.js',
      browser: './dist/define.js',
      deno: './dist/define.server.js',
      node: './dist/define.server.js',
      default: './dist/define.js',
    });
  });
});
