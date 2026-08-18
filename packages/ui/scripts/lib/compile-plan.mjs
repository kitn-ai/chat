// WHICH SCANNED UNITS TSC CAN ACTUALLY CHECK, and what each becomes on disk.
//
// Split out of scripts/acceptance-gate-compiles.mjs so it can be imported from a
// test: the gate script pulls in the catalog importer, which pulls in esbuild,
// which does not load under jsdom. The decision this file makes — what counts as
// compilable, and what is reported as unreadable rather than dropped — is the
// half worth pinning, and it needs no tsc to check.
//
// EVERY UNIT LANDS IN EXACTLY ONE BUCKET. `skipped` is not a quiet drop: it is
// reported in the gate's detail, and it is what keeps a JavaScript-only answer
// from being mistaken for "there is no code" — which would take the whole
// dimension out of the score rather than failing it.

import { liftScript } from './consumer-tsc-projects.mjs';

/** Fence/file languages tsc reads directly, and the extension each becomes. */
const TS_LANGS = { ts: 'ts', typescript: 'ts', tsx: 'tsx', mts: 'ts', cts: 'ts' };
/** Single-file-component languages whose `<script>` is lifted into plain TS. */
const SFC_LANGS = new Set(['vue', 'svelte', 'astro', 'html', 'htm']);
/** JavaScript. A stock consumer tsconfig has no `allowJs`, so tsc would not read it. */
const JS_LANGS = new Set(['js', 'jsx', 'mjs', 'cjs', 'javascript']);

/**
 * Turn the scanned units into files tsc can be pointed at.
 *
 * Every unit lands in exactly one bucket. `skipped` is not a quiet drop: it is
 * reported in the gate's detail and it is what keeps a JavaScript-only answer
 * from being called "no code".
 */
export function planFiles(units) {
  const files = [];
  const skipped = [];
  for (const u of units) {
    const lang = String(u.lang ?? '').toLowerCase();
    const safe = u.name.replace(/[#]/g, '.').replace(/\.\.+/g, '.');
    if (TS_LANGS[lang]) {
      // A real .ts/.tsx file keeps its path so relative imports between the
      // agent's own files still resolve; a fence gets a synthesised one.
      const name = /\.tsx?$/i.test(safe) ? safe : `${safe}.${TS_LANGS[lang]}`;
      files.push({ name, text: u.text, unit: u.name });
      continue;
    }
    if (SFC_LANGS.has(lang)) {
      const lifted = liftScript(u.text);
      if (lifted === null) {
        skipped.push({ unit: u.name, why: `${lang} unit with no <script> block — there is nothing for tsc to check in a template` });
        continue;
      }
      files.push({ name: `${safe}.ts`, text: lifted, unit: u.name, lifted: true });
      continue;
    }
    if (JS_LANGS.has(lang)) {
      skipped.push({
        unit: u.name,
        why: 'JavaScript — a stock consumer tsconfig sets no `allowJs`, so tsc does not read it. Compiling it anyway would be checking something the consumer\'s build does not.',
      });
      continue;
    }
    skipped.push({ unit: u.name, why: `\`${lang}\` is not TypeScript and not a component tsc can lift a script out of` });
  }
  return { files, skipped };
}
