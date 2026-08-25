import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineWebComponent } from './define-entry';

describe('@kitn.ai/ui/define', () => {
  it('re-exports the real defineWebComponent', () => {
    expect(typeof defineWebComponent).toBe('function');
  });

  it('is wired into the exports map with types', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
    ) as { exports: Record<string, { types?: string; default?: string }> };
    expect(pkg.exports['./define']).toEqual({
      types: './dist/define.d.ts',
      default: './dist/define.js',
    });
  });
});
