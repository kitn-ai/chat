/**
 * Pins the accent-cascade fix (Round A, owner report): a stub, light-DOM
 * preview wrapper needs BOTH the public `--kai-color-primary` token AND
 * the internal `--color-primary` token set directly, or the accent
 * silently does nothing — see `builder-preview.ts`'s module doc comment
 * for the full root cause (no shadow `:host` boundary to re-resolve the
 * public->internal mapping `theme.css` declares once, at `:root, :host`).
 */
import { describe, it, expect } from 'vitest';
import { resolveAccentWrapperStyle } from './builder-preview';

describe('resolveAccentWrapperStyle', () => {
  it('returns {} for no accent — the kit default applies, same as omitting the property', () => {
    expect(resolveAccentWrapperStyle(undefined)).toEqual({});
    expect(resolveAccentWrapperStyle({})).toEqual({});
  });

  it('sets BOTH --kai-color-primary and --color-primary to the accent, not just the public token', () => {
    const style = resolveAccentWrapperStyle({ accent: '#e91e63' });
    expect(style['--kai-color-primary']).toBe('#e91e63');
    expect(style['--color-primary']).toBe('#e91e63');
  });

  it('pairs a dark accent with a white foreground on both the public and internal foreground tokens', () => {
    // #e91e63 (pink), L≈0.19 -> white, per resolveContrastForeground's own
    // codegen.test.ts-verified threshold (this module's copy of it).
    const style = resolveAccentWrapperStyle({ accent: '#e91e63' });
    expect(style['--kai-color-primary-foreground']).toBe('#ffffff');
    expect(style['--color-primary-foreground']).toBe('#ffffff');
  });

  it('pairs a light accent with a black foreground', () => {
    const style = resolveAccentWrapperStyle({ accent: '#fef08a' });
    expect(style['--kai-color-primary-foreground']).toBe('#000000');
    expect(style['--color-primary-foreground']).toBe('#000000');
  });

  it('omits the foreground pair entirely for an accent that cannot be resolved to concrete RGB (decide loudly: no guessing)', () => {
    const style = resolveAccentWrapperStyle({ accent: 'var(--some-other-token)' });
    expect(style['--kai-color-primary']).toBe('var(--some-other-token)');
    expect(style['--color-primary']).toBe('var(--some-other-token)');
    expect('--kai-color-primary-foreground' in style).toBe(false);
    expect('--color-primary-foreground' in style).toBe(false);
  });
});
