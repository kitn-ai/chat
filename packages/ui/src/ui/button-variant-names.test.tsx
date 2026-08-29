import { describe, it, expect } from 'vitest';
import { BUTTON_VARIANT_NAMES } from './button-variant-names';
import { BUTTON_VARIANT_CLASSES } from './button';

describe('BUTTON_VARIANT_NAMES drift guard (B-6a)', () => {
  it('the leaf const equals the real cva variant record, key for key', () => {
    // The create-kai precedent: the bundle boundary blocks schema.ts from
    // importing button.tsx (mcp tsc pass, no DOM/.tsx), so correspondence
    // lives HERE, driven off the real object on every run.
    expect([...BUTTON_VARIANT_NAMES].sort()).toEqual(Object.keys(BUTTON_VARIANT_CLASSES).sort());
  });
});
