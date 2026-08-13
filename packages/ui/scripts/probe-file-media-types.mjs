/**
 * Measure what a browser actually calls the files a user picks, and what
 * `FileReader.readAsDataURL` produces when it cannot name one.
 *
 * WHY THIS EXISTS. `src/wire/media-types.ts` decides what a composer may stage
 * and what an encoder may send, and both decisions start from `File.type`. That
 * value is not ours and is not portable: the browser asks the OS, and the OS
 * answers from its own type database. Anything written about it in a comment is
 * an observation of one machine on one day, so this script is the observation --
 * re-runnable, rather than a number someone has to trust.
 *
 * WHY A REAL BROWSER, AND A REAL PICKER. Constructing `new File([], 'a.rs')` in
 * JS proves nothing: whatever `type` the test passes is the `type` it reads back.
 * The only honest reading comes from handing paths to an actual
 * `<input type="file">` and letting the browser build the `File` objects, which
 * is what `setInputFiles` does. jsdom cannot answer this at all -- it has no type
 * database, so every File it builds carries the type the caller supplied, and its
 * `readAsDataURL` substitutes `application/octet-stream` for an empty one. That
 * substitution is itself worth knowing (the unit suite runs on jsdom), so it is
 * reported here beside the browser's answer rather than mistaken for it.
 *
 *   node scripts/probe-file-media-types.mjs [--channel=chrome] [--headed]
 *
 * Prints a table and exits 0. It asserts nothing -- there is no correct answer to
 * assert, only what this platform says today.
 */
import { chromium } from 'playwright';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};

// One file per extension people actually attach to a chat. Contents are real
// enough to be plausible but are never inspected: only the NAME reaches the type
// database. `.zip` and `.png` carry real magic bytes so the binary rows are not
// text wearing a binary extension.
const TEXTUAL = [
  ['txt', 'hello\n'],
  ['md', '# Title\n'],
  ['csv', 'a,b\n1,2\n'],
  ['json', '{"a":1}\n'],
  ['xml', '<a/>\n'],
  ['yaml', 'a: 1\n'],
  ['yml', 'a: 1\n'],
  ['py', 'print(1)\n'],
  ['sh', 'echo hi\n'],
  ['html', '<!doctype html>\n'],
  ['js', 'export const a = 1\n'],
  ['css', 'a{color:red}\n'],
  ['ts', 'export const a: number = 1\n'],
  ['tsx', 'export const A = () => null\n'],
  ['rs', 'fn main() {}\n'],
  ['go', 'package main\n'],
  ['sql', 'select 1;\n'],
  ['toml', 'a = 1\n'],
  ['log', 'boot ok\n'],
];

const dir = mkdtempSync(path.join(tmpdir(), 'kai-media-probe-'));
const paths = [];
for (const [ext, body] of TEXTUAL) {
  const file = path.join(dir, `sample.${ext}`);
  writeFileSync(file, body);
  paths.push(file);
}
// Two genuine binaries, so "decodes as UTF-8" has something to say no to. Both
// carry bytes above 0x7f that form no valid UTF-8 sequence: a zip header alone
// (`50 4b 03 04` then NULs) is all inside the ASCII range and DECODES, which is
// the honest limit of a decode-based test and worth not hiding behind a fixture
// picked to flatter it.
const png = path.join(dir, 'sample.png');
writeFileSync(png, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
paths.push(png);
const zip = path.join(dir, 'sample.zip');
writeFileSync(zip, Buffer.from('504b0304ffd8ffe000104a46', 'hex'));
paths.push(zip);
// A binary wearing a text extension: the case a decode-based fallback exists to
// catch, and the one a name-based fallback would get wrong.
const fake = path.join(dir, 'archive-renamed.txt');
writeFileSync(fake, Buffer.from('504b0304ffffff00', 'hex'));
paths.push(fake);

const browser = await chromium.launch({
  channel: arg('channel', 'chrome'),
  headless: !process.argv.includes('--headed'),
});
try {
  const page = await browser.newPage();
  await page.setContent('<input type="file" multiple id="f">');
  await page.setInputFiles('#f', paths);

  const rows = await page.evaluate(async () => {
    const input = document.querySelector('input');
    const read = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    const out = [];
    for (const file of Array.from(input.files ?? [])) {
      const dataUrl = await read(file);
      let decodes = false;
      try {
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        decodes = true;
      } catch {
        decodes = false;
      }
      out.push({
        name: file.name,
        type: file.type,
        dataUrlPrefix: dataUrl.slice(0, dataUrl.indexOf(',') + 1),
        decodes,
      });
    }
    return out;
  });

  const version = browser.version();
  console.log(`\nBrowser: ${arg('channel', 'chrome')} ${version}`);
  console.log(`Platform: ${process.platform} ${process.arch} ${(await import('node:os')).release()}`);
  console.log(`Date: ${new Date().toISOString()}\n`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    `${pad('file', 22)}${pad('File.type', 26)}${pad('readAsDataURL prefix', 38)}utf8?`,
  );
  console.log('-'.repeat(94));
  for (const row of rows) {
    console.log(
      `${pad(row.name, 22)}${pad(JSON.stringify(row.type), 26)}${pad(row.dataUrlPrefix, 38)}${row.decodes ? 'yes' : 'NO'}`,
    );
  }
  const nameless = rows.filter((r) => r.type === '');
  console.log(
    `\n${nameless.length}/${rows.length} files the browser could not name: ${nameless.map((r) => r.name).join(', ') || '(none)'}`,
  );
  const prefixes = [...new Set(rows.filter((r) => r.type === '').map((r) => r.dataUrlPrefix))];
  console.log(`readAsDataURL prefix for those: ${prefixes.map((p) => JSON.stringify(p)).join(', ') || '(n/a)'}`);
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
