import { describe, it, expect } from 'vitest';
import { previewSource, rewriteKitBase, LOCAL_KIT_BASE } from '../scripts/copy-blocks.mjs';

const VERSION = '9.9.9';

describe('previewSource', () => {
  it('is the CDN pin when KAI_BLOCKS_KIT is unset -- production', () => {
    const out = previewSource({}, VERSION);
    expect(out.mode).toBe('cdn');
    expect(out.previewDir).toBe('/blocks/r');
    expect(out.footer).toContain(`@kitn.ai/ui@${VERSION}`);
    expect(out.footer).toContain('jsDelivr');
    expect(out.footer).not.toContain('packages/ui/dist');
  });

  it('is the local build when KAI_BLOCKS_KIT=local, and SAYS SO in words', () => {
    const out = previewSource({ KAI_BLOCKS_KIT: 'local' }, VERSION);
    expect(out.mode).toBe('local');
    expect(out.previewDir).toBe('/blocks/local');
    expect(out.footer).toContain('packages/ui/dist');
    expect(out.footer).not.toContain('jsDelivr');
  });

  it('refuses any other value rather than guessing which kit it meant', () => {
    expect(() => previewSource({ KAI_BLOCKS_KIT: 'cdn' }, VERSION)).toThrow(/KAI_BLOCKS_KIT/);
    expect(() => previewSource({ KAI_BLOCKS_KIT: '1' }, VERSION)).toThrow(/KAI_BLOCKS_KIT/);
  });
});

describe('rewriteKitBase', () => {
  const form = [
    '<script type="module">',
    `import 'https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${VERSION}/dist/elements/autoloader.js'; // x-release-please-version`,
    `import { readModelStream } from 'https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${VERSION}/dist/wire.js';`,
    '</script>',
  ].join('\n');

  it('points every kit import at the local mount', () => {
    const out = rewriteKitBase(form, 'support-widget.cdn.html');
    expect(out).toContain(`import '${LOCAL_KIT_BASE}elements/autoloader.js'`);
    expect(out).toContain(`from '${LOCAL_KIT_BASE}wire.js'`);
    expect(out).not.toContain('cdn.jsdelivr.net');
  });

  it('a zero-replacement rewrite is a HARD FAILURE naming the file, never a silent pass', () => {
    expect(() => rewriteKitBase('<html></html>', 'support-widget.cdn.html')).toThrow(
      /support-widget\.cdn\.html/,
    );
  });
});
