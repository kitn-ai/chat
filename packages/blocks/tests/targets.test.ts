/**
 * The install-root table (spec 3.4). ONE table, read by the generator, the
 * CLI and the site, so the path the page DISPLAYS is the path `add` WRITES.
 */
import { describe, expect, it } from 'vitest';
import { INSTALL_ROOTS, installRoot, fileTarget } from '../src/targets';

describe('install roots', () => {
  it('carries every framework the spec names, and no other', () => {
    expect(Object.keys(INSTALL_ROOTS).sort()).toEqual(
      ['angular', 'html', 'react', 'solid', 'svelte', 'vue'],
    );
  });

  it('puts the component frameworks under src/components/<id>', () => {
    expect(installRoot('react', 'support-widget')).toBe('src/components/support-widget');
    expect(installRoot('vue', 'support-widget')).toBe('src/components/support-widget');
    expect(installRoot('solid', 'support-widget')).toBe('src/components/support-widget');
  });

  it('puts sveltekit under src/lib/components and angular under src/app/components', () => {
    expect(installRoot('svelte', 'support-widget')).toBe('src/lib/components/support-widget');
    expect(installRoot('angular', 'support-widget')).toBe('src/app/components/support-widget');
  });

  it('puts the html form under blocks/<id>', () => {
    expect(installRoot('html', 'support-widget')).toBe('blocks/support-widget');
  });

  it('fileTarget joins the root and the file name, posix only', () => {
    expect(fileTarget('react', 'support-widget', 'SupportWidget.tsx'))
      .toBe('src/components/support-widget/SupportWidget.tsx');
    expect(fileTarget('html', 'support-widget', 'support-widget.html'))
      .toBe('blocks/support-widget/support-widget.html');
  });
});
