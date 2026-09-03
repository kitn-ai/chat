import { describe, it, expect } from 'vitest';
import { storeZip, crc32, zipFileName } from '../src/components/blocks/zip';

const dec = new TextDecoder();
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at, true);

describe('storeZip', () => {
  // `target` is the project-relative path FormFile carries -- the one the
  // card displays and `add` writes -- so the zip entry is keyed on it, not
  // on `path` (the form's own mount-relative name). See the module header.
  const files = [
    { path: 'X.tsx', target: 'src/components/x/X.tsx', content: 'export const X = () => null;\n' },
    { path: 'README.md', target: 'src/components/x/README.md', content: '# X\n' },
  ];

  it('is a real zip: local header, central directory, end-of-central-directory', () => {
    const zip = storeZip(files);
    expect(u32(zip, 0)).toBe(0x04034b50);
    const eocdAt = zip.length - 22;
    expect(u32(zip, eocdAt)).toBe(0x06054b50);
    const view = new DataView(zip.buffer, zip.byteOffset);
    expect(view.getUint16(eocdAt + 10, true)).toBe(files.length);
  });

  it('stores, never deflates, so the file bytes appear verbatim', () => {
    const text = dec.decode(storeZip(files));
    for (const f of files) {
      expect(text).toContain(f.target);
      expect(text).toContain(f.content);
    }
  });

  it('is deterministic: the same files give byte-identical output', () => {
    expect(Array.from(storeZip(files))).toEqual(Array.from(storeZip(files)));
  });

  it('crc32 matches the known PKZIP value for "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('a different file set gives different bytes -- so the determinism test cannot pass vacuously', () => {
    expect(Array.from(storeZip(files))).not.toEqual(Array.from(storeZip([files[0]])));
  });
});

describe('zipFileName', () => {
  it('names the block and the framework, so two downloads do not collide', () => {
    expect(zipFileName('support-widget', 'react')).toBe('support-widget-react.zip');
    expect(zipFileName('assistant', 'html')).not.toBe(zipFileName('support-widget', 'html'));
  });
});
