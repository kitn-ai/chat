#!/usr/bin/env node
// Makes Tailwind's ring/shadow/outline utilities work inside a Shadow DOM.
//
// THE MECHANISM, in two sentences: `@property` registration is document-global
// and is only collected from document-level stylesheets, so the `@property
// --tw-*` rules Tailwind emits are silently ignored inside a shadow root
// (whether delivered via `adoptedStyleSheets` or a `<style>` tag) and every
// `--tw-*` there is an unregistered, unset token. That makes the whole
// `box-shadow` shorthand behind `ring-*` and `shadow-*` invalid at
// computed-value time so it drops entirely — which is why a keyboard user got
// no visible focus indicator on any control that pairs
// `focus-visible:outline-none` with a `focus-visible:ring-*`.
//
// THE REMEDY is already in the file. Tailwind ships an `@supports`-gated block
// that assigns every `--tw-*` on `*, ::before, ::after, ::backdrop` for
// browsers that lack `@property`. Its condition is a Safari/Firefox feature
// test that Chromium fails, because Chromium *does* support `@property` — at
// document level, which is the assumption that does not hold inside a shadow
// root. We rewrite that one condition to an always-true one, so the fallback
// applies everywhere and the custom properties have real values regardless of
// registration.
//
// SCOPE: this rewrites `src/elements/compiled.css` ONLY. That file is imported
// as a raw string (`src/elements/css.ts`, Vite `?inline`) and injected into
// custom-element shadow roots; it is never served to the host document, so no
// consumer page is affected by the ungating.
//
// A ZERO-MATCH RUN IS A HARD FAILURE, following the `lint:cdn-pins` convention
// in this repo. If a Tailwind upgrade changes the block's shape, this must stop
// the build loudly rather than silently no-op the fix back into a kit whose
// focus indicators are invisible again.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(HERE, '../src/elements/compiled.css');

/**
 * Tailwind v4's fallback gate: "this browser is Safari or Firefox", i.e. lacks
 * `@property`. Matched exactly (not loosely) so a shape change fails loudly.
 */
const GATE =
  /@supports \(\(\(-webkit-hyphens:none\)\) and \(not \(margin-trim:inline\)\)\) or \(\(-moz-orient:inline\) and \(not \(color:rgb\(from red r g b\)\)\)\)\{/g;

/** Always-true replacement, carrying a marker so the rewrite is idempotent and greppable. */
const MARKER = '--kai-shadow-dom-tw-fallback';
const REPLACEMENT = `@supports (${MARKER}:1){`;

/** The block must really be the `--tw-*` reset, not some other rule that happens to match. */
const EXPECTED_SELECTOR = '*,:before,:after,::backdrop{';
const REQUIRED_VARS = ['--tw-ring-shadow', '--tw-shadow', '--tw-outline-style', '--tw-ring-offset-shadow'];

function rewrite(css, label) {
  if (css.includes(REPLACEMENT)) {
    return { css, already: true, note: `${label}: already ungated (marker present) — nothing to do` };
  }

  const matches = css.match(GATE) || [];
  if (matches.length === 0) {
    throw new Error(
      `${label}: Tailwind's @supports fallback block was NOT FOUND.\n` +
        "This is a hard failure on purpose. Either Tailwind changed the block's shape in an\n" +
        'upgrade, or the fallback is no longer emitted. Until this script is updated, every\n' +
        'ring-* and shadow-* utility is INERT inside every kai-* shadow root and keyboard users\n' +
        'have no visible focus indicator. Re-derive the condition from the Tailwind output in\n' +
        'src/elements/compiled.css and update GATE in scripts/postprocess-element-css.mjs.',
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `${label}: expected exactly one Tailwind fallback gate, found ${matches.length}. ` +
        'Refusing to guess which one carries the --tw-* reset.',
    );
  }

  const start = css.search(GATE);
  const head = css.slice(start + matches[0].length, start + matches[0].length + EXPECTED_SELECTOR.length);
  if (head !== EXPECTED_SELECTOR) {
    throw new Error(
      `${label}: the gated block does not open with "${EXPECTED_SELECTOR}" (saw "${head}"). ` +
        'This is not the --tw-* reset; refusing to ungate it.',
    );
  }

  const out = css.replace(GATE, REPLACEMENT);

  // The point of the exercise: these must actually be assigned inside the block.
  const blockStart = out.indexOf(REPLACEMENT);
  const block = out.slice(blockStart, blockStart + 6000);
  const missing = REQUIRED_VARS.filter((v) => !block.includes(`${v}:`));
  if (missing.length) {
    throw new Error(
      `${label}: the ungated block does not assign ${missing.join(', ')} — it cannot fix the ` +
        'rings it exists to fix.',
    );
  }

  return { css: out, already: false, note: `${label}: ungated Tailwind's --tw-* fallback for Shadow DOM` };
}

/* --------------------------------------------------------------- self-test */
// Proves the analyzer DETECTS, rather than merely exiting 0. A guard nobody has
// watched fail is not known to work.
if (process.argv.includes('--self-test')) {
  const realGate =
    '@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){';
  const goodBlock = `${realGate}${EXPECTED_SELECTOR}${REQUIRED_VARS.map((v) => `${v}:0 0 #0000`).join(';')};--tw-blur:initial}}`;

  const cases = [
    ['rewrites a well-formed bundle', goodBlock, null],
    ['is idempotent once rewritten', rewrite(goodBlock, 'x').css, null],
    ['fails when the gate is absent', 'body{color:red}', 'was NOT FOUND'],
    ['fails when the gate is duplicated', goodBlock + goodBlock, 'found 2'],
    [
      'fails when the block is not the --tw-* reset',
      `${realGate}.something-else{color:red}}`,
      'does not open with',
    ],
    [
      'fails when the block omits the vars it must set',
      `${realGate}${EXPECTED_SELECTOR}--tw-blur:initial}}`,
      'does not assign',
    ],
  ];

  let failed = 0;
  for (const [name, input, expectErr] of cases) {
    let err = null;
    try {
      rewrite(input, 'self-test');
    } catch (e) {
      err = e.message;
    }
    const ok = expectErr ? !!err && err.includes(expectErr) : !err;
    if (!ok) {
      failed++;
      console.error(`  ✗ ${name} — expected ${expectErr ? `error containing "${expectErr}"` : 'success'}, got ${err ? `"${err.split('\n')[0]}"` : 'success'}`);
    } else {
      console.log(`  ✓ ${name}`);
    }
  }
  if (failed) {
    console.error(`self-test FAILED (${failed})`);
    process.exit(1);
  }
  console.log('postprocess-element-css self-test passed');
  process.exit(0);
}

/* -------------------------------------------------------------------- main */
if (!fs.existsSync(TARGET)) {
  console.error(
    `postprocess-element-css: ${TARGET} does not exist. Run \`npm run build:css\` (tailwindcss) first.`,
  );
  process.exit(1);
}

try {
  const before = fs.readFileSync(TARGET, 'utf8');
  const { css, already, note } = rewrite(before, path.relative(process.cwd(), TARGET));
  if (!already) fs.writeFileSync(TARGET, css);
  console.log(`postprocess-element-css: ${note}`);
} catch (e) {
  console.error(`postprocess-element-css: ${e.message}`);
  process.exit(1);
}
