/**
 * A store-only zip writer, in the browser.
 *
 * MOVED from packages/ui/mcp/construct/dev.ts, whose /gallery/api/zip route
 * PR C retires. The decision it records still holds: node's zlib has DEFLATE
 * but no zip CONTAINER, nothing in the dependency tree ships one, and the
 * files are a handful of small text sources, so compression buys nothing worth
 * a dependency. Method 0, which every unzip reads. Deterministic on purpose
 * (fixed 1980-01-01 stamps), so the same files always produce the same bytes.
 *
 * It lives HERE and not in packages/blocks because that package's tsconfig
 * sets `types: []` and `lib: ["ES2023"]` with no DOM, deliberately, and
 * TextEncoder has no type there.
 *
 * Entries are keyed on `target`, not `path`: `target` is the project-relative
 * path a form's card displays and `create-kai add` writes (owner ruling), so
 * the zip unzips into that same project-root shape rather than into the
 * form's own mount-relative layout.
 */
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The listed files as one uncompressed (store-only) zip, entries named by `target`. */
export function storeZip(files: readonly { target: string; content: string }[]): Uint8Array {
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01, the zip epoch
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.target);
    const data = enc.encode(file.content);
    const crc = crc32(data);

    const fixed = (sig: number, extraLead: Uint8Array): Uint8Array => {
      const head = new Uint8Array(4);
      new DataView(head.buffer).setUint32(0, sig, true);
      const meta = new Uint8Array(22);
      const mv = new DataView(meta.buffer);
      mv.setUint16(0, 20, true); // version needed: 2.0
      mv.setUint16(2, 0, true); // flags
      mv.setUint16(4, 0, true); // method: store
      mv.setUint16(6, 0, true); // mod time
      mv.setUint16(8, DOS_DATE, true); // mod date
      mv.setUint32(10, crc, true);
      mv.setUint32(14, data.length, true); // compressed = uncompressed (store)
      mv.setUint32(18, data.length, true);
      return concat([head, extraLead, meta]);
    };

    const localTail = new Uint8Array(4);
    new DataView(localTail.buffer).setUint16(0, name.length, true); // extra length stays 0
    const local = concat([fixed(0x04034b50, new Uint8Array(0)), localTail, name, data]);

    const centralVersion = new Uint8Array(2);
    new DataView(centralVersion.buffer).setUint16(0, 20, true); // version made by
    const centralTail = new Uint8Array(18);
    const cv = new DataView(centralTail.buffer);
    cv.setUint16(0, name.length, true);
    // extra(2) comment(2) disk(2) internal-attrs(2) external-attrs(4): all zero
    cv.setUint32(14, offset, true); // local header offset
    centrals.push(concat([fixed(0x02014b50, centralVersion), centralTail, name]));

    locals.push(local);
    offset += local.length;
  }

  const centralDir = concat(centrals);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); // entries on this disk
  ev.setUint16(10, files.length, true); // entries total
  ev.setUint32(12, centralDir.length, true);
  ev.setUint32(16, offset, true); // central dir offset
  return concat([...locals, centralDir, eocd]);
}

/** One derivation, shared by the Download button and its test. */
export function zipFileName(id: string, form: string): string {
  return `${id}-${form}.zip`;
}
