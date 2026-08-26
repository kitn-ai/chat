import { describe, it, expect } from 'vitest';
import { cn } from './cn';

// Locks the cn() / tailwind-merge behavior the kit relies on. Guards the
// tailwind-merge v2→v3 upgrade (v3 = Tailwind v4 class groups).
describe('cn (clsx + extendTailwindMerge)', () => {
  it('resolves genuine conflicts last-wins', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-left', 'text-right')).toBe('text-right');
  });

  it('keeps custom font-size utilities separate from text COLORS (the TextShimmer fix)', () => {
    // text-body is a custom @theme font-size utility; text-transparent is a color.
    // They must NOT be treated as conflicting — both must survive.
    const out = cn('text-transparent', 'text-body');
    expect(out).toContain('text-transparent');
    expect(out).toContain('text-body');
  });

  it('still merges two custom font sizes against each other (last wins)', () => {
    expect(cn('text-body', 'text-title')).toBe('text-title');
  });

  it('merges custom font size against a standard one', () => {
    expect(cn('text-sm', 'text-body')).toBe('text-body');
  });

  // theme.css re-points Tailwind's scale at the kit's tokens, so `text-sm` and
  // `text-body` are the SAME declaration under two names. Emitting both would
  // put two identical font-size rules on the element and make whichever the
  // cascade picked look arbitrary — the merge has to collapse them to one.
  it('collapses a Tailwind alias and its semantic twin to ONE class', () => {
    expect(cn('text-sm', 'text-body').split(' ')).toHaveLength(1);
    expect(cn('text-body', 'text-sm')).toBe('text-sm');
    expect(cn('text-xs', 'text-meta').split(' ')).toHaveLength(1);
    expect(cn('text-base', 'text-title').split(' ')).toHaveLength(1);
  });

  // 13px is a real rung the kit already used three times as `text-[13px]`, in
  // two places that are not code at all — so it is named for its ROLE on the
  // ladder (a notch below body), not for one of its callers.
  it('groups text-compact with the rest of the font sizes', () => {
    expect(cn('text-meta', 'text-compact')).toBe('text-compact');
    expect(cn('text-compact', 'text-body')).toBe('text-body');
    expect(cn('text-compact', 'text-sm').split(' ')).toHaveLength(1);
    const out = cn('text-transparent', 'text-compact');
    expect(out).toContain('text-transparent');
    expect(out).toContain('text-compact');
  });

  it('groups the two new rungs with the rest of the font sizes', () => {
    expect(cn('text-micro', 'text-caption')).toBe('text-caption');
    expect(cn('text-body', 'text-micro')).toBe('text-micro');
    expect(cn('text-title', 'text-lg')).toBe('text-lg');
    // …and still not confused with a color.
    const out = cn('text-transparent', 'text-micro');
    expect(out).toContain('text-transparent');
    expect(out).toContain('text-micro');
  });
});
