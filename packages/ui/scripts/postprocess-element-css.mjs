#!/usr/bin/env node
// Makes Tailwind's ring/shadow/outline utilities work inside a Shadow DOM, and
// drops the bytes that can never work there.
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
// STEP 1, THE REMEDY, is already in the file. Tailwind ships an
// `@supports`-gated block that assigns every `--tw-*` on
// `*, ::before, ::after, ::backdrop` for browsers that lack `@property`. Its
// condition is a Safari/Firefox feature test that Chromium fails, because
// Chromium *does* support `@property` — at document level, which is the
// assumption that does not hold inside a shadow root. We rewrite that one
// condition to an always-true one, so the fallback applies everywhere and the
// custom properties have real values regardless of registration.
//
// The block is found STRUCTURALLY, not by its condition text: any `@supports`
// rule whose body opens with the `*,:before,:after,::backdrop{` reset and
// assigns the ring/shadow variables. Tailwind has reshaped the condition three
// times already (4.0.0-alpha.15 tailwindlabs/tailwindcss#13655, 4.0.0-beta.9
// #15622, 4.1.2 #17506) and package.json allows a caret range, so a lockfile
// refresh can move minors. The literal condition this was last derived from
// is kept only as a DIAGNOSTIC: the build log says whether the matched
// condition is the known shape or a new one, so a change is visible without
// being fatal.
//
// STEP 2, THE STRIP: the `@property --tw-*{...}` rules themselves are removed.
// They are ignored inside a shadow tree in every engine — WebKit deliberately,
// with the spec question unresolved (w3c/csswg-drafts#10541) and the Tailwind
// issue open (tailwindlabs/tailwindcss#15005) — and this file is ONLY ever
// injected into shadow roots (see SCOPE), so they are inert bytes in every
// consumer bundle. Once step 1 has made the fallback unconditional, nothing in
// the sheet depends on registration. Nothing but `@property` at-rules is
// stripped, and only the `--tw-*` ones; a kit-authored `@property` (there are
// none today) is left alone and reported.
//
// SCOPE: this rewrites `src/elements/compiled.css` ONLY. That file is imported
// as a raw string (`src/elements/css.ts`, Vite `?inline`) and injected into
// custom-element shadow roots; it is never served to the host document, so no
// consumer page is affected by the ungating or the strip.
//
// A ZERO-MATCH RUN IS A HARD FAILURE for BOTH steps, following the
// `lint:cdn-pins` convention in this repo. If a Tailwind upgrade stops
// emitting the fallback block, this must stop the build loudly rather than
// silently no-op the fix back into a kit whose focus indicators are invisible
// again. If it stops emitting `@property` rules, the strip must fail too: that
// is a Tailwind change to the exact mechanism this script exists for, and it
// needs a human to re-read the output before the build goes green.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(HERE, '../src/elements/compiled.css');

/**
 * The condition the structural match was last derived against (Tailwind 4.1.x
 * through 4.3.x): "this browser is Safari or Firefox", i.e. lacks `@property`.
 * Used for the build-log diagnostic only; the match does not depend on it.
 */
const KNOWN_GATE_CONDITION =
  '(((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b))))';

/** Every `@supports <condition>{` in the sheet; the structural filter runs on each. */
const ANY_SUPPORTS = /@supports ([^{]+)\{/g;

/** Always-true replacement, carrying a marker so the rewrite is idempotent and greppable. */
const MARKER = '--kai-shadow-dom-tw-fallback';
const REPLACEMENT = `@supports (${MARKER}:1){`;

/** The block must really be the `--tw-*` reset, not some other rule that happens to match. */
const EXPECTED_SELECTOR = '*,:before,:after,::backdrop{';
const REQUIRED_VARS = ['--tw-ring-shadow', '--tw-shadow', '--tw-outline-style', '--tw-ring-offset-shadow'];

/** One registration rule. `[^}]*` is safe: a descriptor block never nests braces. */
const TW_PROPERTY_RULE = /@property --tw-[\w-]+\{[^}]*\}/g;
const ANY_PROPERTY_RULE = /@property (--[\w-]+)\{[^}]*\}/g;

/**
 * Step 1. Find the one `@supports` block that carries the `--tw-*` reset and
 * ungate it. Returns the rewritten css plus the condition that was matched.
 */
function ungate(css, label) {
  const candidates = [];
  for (const m of css.matchAll(ANY_SUPPORTS)) {
    const bodyStart = m.index + m[0].length;
    if (css.startsWith(EXPECTED_SELECTOR, bodyStart)) {
      candidates.push({ index: m.index, length: m[0].length, condition: m[1].trim() });
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `${label}: Tailwind's @supports fallback block was NOT FOUND.\n` +
        `Looked for any @supports block whose body opens with "${EXPECTED_SELECTOR}".\n` +
        'This is a hard failure on purpose. Either Tailwind changed the block beyond its\n' +
        'condition in an upgrade, or the fallback is no longer emitted. Until this script is\n' +
        'updated, every ring-* and shadow-* utility is INERT inside every kai-* shadow root and\n' +
        'keyboard users have no visible focus indicator. Re-derive the shape from the Tailwind\n' +
        'output in src/elements/compiled.css and update scripts/postprocess-element-css.mjs.',
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `${label}: expected exactly one Tailwind fallback gate, found ${candidates.length} ` +
        `(conditions: ${candidates.map((c) => JSON.stringify(c.condition)).join(', ')}). ` +
        'Refusing to guess which one carries the --tw-* reset.',
    );
  }

  const [gate] = candidates;
  const out = css.slice(0, gate.index) + REPLACEMENT + css.slice(gate.index + gate.length);

  // The point of the exercise: these must actually be assigned inside the block.
  const blockStart = out.indexOf(REPLACEMENT);
  const blockEnd = out.indexOf('}', blockStart + REPLACEMENT.length + EXPECTED_SELECTOR.length);
  const block = out.slice(blockStart, blockEnd === -1 ? undefined : blockEnd);
  const missing = REQUIRED_VARS.filter((v) => !block.includes(`${v}:`));
  if (missing.length) {
    throw new Error(
      `${label}: the ungated block does not assign ${missing.join(', ')} — it cannot fix the ` +
        'rings it exists to fix.',
    );
  }

  return { css: out, condition: gate.condition };
}

/**
 * Step 2. Remove every `@property --tw-*` rule. Returns the css plus counts.
 * `fresh` says whether this is un-postprocessed Tailwind output, where zero
 * rules is a hard failure; on an already-processed sheet zero is the expected
 * state.
 */
function stripProperties(css, label, fresh) {
  const tw = css.match(TW_PROPERTY_RULE) || [];
  if (fresh && tw.length === 0) {
    throw new Error(
      `${label}: found ZERO @property --tw-* rules in fresh Tailwind output.\n` +
        'This is a hard failure on purpose. Tailwind has stopped emitting the registrations this\n' +
        'script exists to work around, which means the --tw-* mechanism itself has changed. Re-read\n' +
        'the output in src/elements/compiled.css before deciding whether step 1 still applies.',
    );
  }
  const out = css.replace(TW_PROPERTY_RULE, '');
  const other = [...out.matchAll(ANY_PROPERTY_RULE)].map((m) => m[1]);
  return { css: out, stripped: tw.length, bytes: tw.reduce((n, r) => n + r.length, 0), other };
}

function rewrite(css, label) {
  const already = css.includes(REPLACEMENT);
  const notes = [];
  let out = css;

  if (already) {
    notes.push(`${label}: already ungated (marker present)`);
  } else {
    const r = ungate(css, label);
    out = r.css;
    const shape =
      r.condition === KNOWN_GATE_CONDITION
        ? 'the known Tailwind 4.1+ condition'
        : `a NEW condition shape, not the one this script was derived against: ${JSON.stringify(r.condition)}`;
    notes.push(`${label}: ungated Tailwind's --tw-* fallback for Shadow DOM (matched ${shape})`);
  }

  const s = stripProperties(out, label, !already);
  out = s.css;
  if (s.stripped > 0) {
    notes.push(`${label}: stripped ${s.stripped} @property --tw-* rules (${s.bytes} bytes; inert inside a shadow root)`);
  } else {
    notes.push(`${label}: no @property --tw-* rules left to strip`);
  }
  if (s.other.length) {
    notes.push(`${label}: left ${s.other.length} non-Tailwind @property rule(s) alone: ${s.other.join(', ')}`);
  }

  return { css: out, changed: out !== css, notes };
}

/* --------------------------------------------------------------- self-test */
// Proves the analyzer DETECTS, rather than merely exiting 0. A guard nobody has
// watched fail is not known to work.
if (process.argv.includes('--self-test')) {
  const knownGate = `@supports ${KNOWN_GATE_CONDITION}{`;
  const otherGate = '@supports (not (some-future-feature:1)) or ((-moz-orient:inline) and (not (foo:bar))){';
  const reset = `${EXPECTED_SELECTOR}${REQUIRED_VARS.map((v) => `${v}:0 0 #0000`).join(';')};--tw-blur:initial}}`;
  const props = '@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-blur{syntax:"*";inherits:false}';
  const goodBlock = `@layer properties{${knownGate}${reset}}.x{color:red}${props}`;
  const otherShape = `@layer properties{${otherGate}${reset}}.x{color:red}${props}`;

  /** Run and return either the result or the error message. */
  const run = (input) => {
    try {
      return { res: rewrite(input, 'self-test') };
    } catch (e) {
      return { err: e.message };
    }
  };

  const cases = [
    ['rewrites a well-formed bundle', goodBlock, null],
    ['is idempotent once rewritten', run(goodBlock).res?.css ?? '', null],
    ['fails when the gate is absent', `body{color:red}${props}`, 'was NOT FOUND'],
    ['fails when the gate is duplicated', `${knownGate}${reset}${knownGate}${reset}${props}`, 'found 2'],
    [
      'ignores @supports blocks that are not the --tw-* reset',
      `${knownGate}.something-else{color:red}}${props}`,
      'was NOT FOUND',
    ],
    [
      'fails when the block omits the vars it must set',
      `${knownGate}${EXPECTED_SELECTOR}--tw-blur:initial}}${props}`,
      'does not assign',
    ],
    ['matches the reset STRUCTURALLY under a different gate condition', otherShape, null],
    ['fails when fresh output carries no @property --tw-* rules', `@layer properties{${knownGate}${reset}}.x{color:red}`, 'ZERO @property'],
  ];

  let failed = 0;
  const report = (ok, name, detail) => {
    if (ok) {
      console.log(`  ✓ ${name}`);
    } else {
      failed++;
      console.error(`  ✗ ${name} — ${detail}`);
    }
  };

  for (const [name, input, expectErr] of cases) {
    const { err } = run(input);
    const ok = expectErr ? !!err && err.includes(expectErr) : !err;
    report(
      ok,
      name,
      `expected ${expectErr ? `error containing "${expectErr}"` : 'success'}, got ${err ? `"${err.split('\n')[0]}"` : 'success'}`,
    );
  }

  // Output-shape assertions: what the rewrite must PRODUCE, not just accept.
  {
    const { res, err } = run(goodBlock);
    const css = res?.css ?? '';
    report(!err && css.includes(REPLACEMENT), 'output carries the idempotency marker', `err=${err} css=${css}`);
    report(!err && !/@property/.test(css), 'output has no @property rules left', `css=${css}`);
    report(!err && css.includes('--tw-ring-shadow:0 0 #0000'), 'output keeps the --tw-* fallback values', `css=${css}`);
    report(!err && css.includes('.x{color:red}'), 'output keeps unrelated rules untouched', `css=${css}`);
    report(
      !err && res.notes.some((n) => n.includes('stripped 2 @property')),
      'reports the number of @property rules stripped',
      `notes=${JSON.stringify(res?.notes)}`,
    );
  }
  {
    const { res, err } = run(otherShape);
    const css = res?.css ?? '';
    report(!err && css.includes(REPLACEMENT), 'a new-shape gate is still ungated', `err=${err} css=${css}`);
    report(
      !err && res.notes.some((n) => n.includes('NEW condition shape') && n.includes('some-future-feature')),
      'a new-shape gate is called out in the log',
      `notes=${JSON.stringify(res?.notes)}`,
    );
    const known = run(goodBlock).res?.notes ?? [];
    report(known.some((n) => n.includes('the known Tailwind')), 'the known gate is reported as known', `notes=${JSON.stringify(known)}`);
  }
  {
    const withKit = `${goodBlock}@property --kai-custom{syntax:"*";inherits:true}`;
    const { res, err } = run(withKit);
    const css = res?.css ?? '';
    report(!err && css.includes('@property --kai-custom{'), 'leaves non-Tailwind @property rules alone', `css=${css}`);
    report(
      !err && res.notes.some((n) => n.includes('--kai-custom')),
      'reports the non-Tailwind @property rules it left',
      `notes=${JSON.stringify(res?.notes)}`,
    );
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
  const { css, changed, notes } = rewrite(before, path.relative(process.cwd(), TARGET));
  if (changed) fs.writeFileSync(TARGET, css);
  for (const note of notes) console.log(`postprocess-element-css: ${note}`);
  console.log(
    `postprocess-element-css: ${changed ? `${before.length} -> ${css.length} bytes` : 'nothing to do'}`,
  );
} catch (e) {
  console.error(`postprocess-element-css: ${e.message}`);
  process.exit(1);
}
