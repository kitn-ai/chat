/**
 * GUARD — every property→attribute boolean reflection in `src/elements` must go
 * through `reflectFlag`, or be a NAMED exemption with a reason.
 *
 * WHY THIS FILE EXISTS AT ALL. The read-back defect
 * (`tests/elements/reflected-boolean-readback.test.tsx`, findings G-05) was not one
 * bug. It was one PATTERN — `createEffect(() => element.toggleAttribute(x, flag(x)))` —
 * copied into four places, in three of which nobody noticed it made the property
 * unreadable, while the fourth (`kai-switch`) had quietly carried a correct version
 * the whole time and nobody generalised it. Fixing the four sites without a guard
 * would leave the copyable shape in the tree and the next facade would copy it again;
 * `resizable.tsx`'s own comment saying it was following "the `collapsed`/`loading`
 * precedent" is what that looks like in practice.
 *
 * WHAT IS DERIVED. The site list is SCANNED, never written down: every non-test
 * source file under `src/elements` is read and its real `.toggleAttribute(` calls are
 * found with comments stripped, so a new facade is covered the day it is added. Only
 * the EXEMPTIONS are written down, each with a reason — the point being that a
 * deliberate exception and an oversight look different in the diff.
 *
 * WATCH IT FAIL. `detects a planted violation` runs the same analyzer over a facade
 * written the old way and requires a finding. Without it this file could pass by
 * scanning nothing, which is the failure mode it is most exposed to (a wrong glob
 * finds zero files and every assertion below holds vacuously).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const elementsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/elements');

/**
 * Files that DEFINE elements, anywhere UNDER `src/elements` — tests, stories and type
 * declarations are not facades and may say whatever they like.
 *
 * RECURSIVE, deliberately, even though the directory is flat today. The one
 * subdirectory that exists (`logos/`) holds `.svg`/`.ico` assets and is excluded by
 * the extension filter rather than by name, so it needs no special case and no
 * maintenance; what recursion buys is that a facade filed into a subdirectory
 * tomorrow is covered without anyone remembering this file. The alternative — narrow
 * the comment to "directly in src/elements" — would have been honest but would have
 * made the guard quietly weaker than its own name suggests.
 */
function facadeSources(dir = elementsDir, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...facadeSources(resolve(dir, entry.name), rel));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|stories|declarative\.test)\.tsx?$/.test(entry.name)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    out.push(rel);
  }
  return out.sort();
}

/**
 * Strip comments, then find `.toggleAttribute(` call sites, returning their line
 * numbers.
 *
 * The comment stripping is CHEAP FUTURE-PROOFING, not a present necessity, and the
 * difference is worth stating because the stronger version of this claim is the
 * tempting one to write. Measured against the tree as it stands, a raw
 * `/\.toggleAttribute\s*\(/` finds hits in exactly two files, `define.tsx` and
 * `switch.tsx` — both already exempt — so stripping changes no verdict today. The
 * prose this fix left behind at the repaired sites names `reflectFlag` or
 * `toggleAttribute` bare, without the `.` and `(` the regex needs, so it is not
 * matched either way. What stripping buys is that the next person explaining a fix in
 * a comment (`// replaces element.toggleAttribute('x', y)`) does not get flagged for
 * describing the correct code — an easy accident, and one that would train people to
 * add exemptions to silence a false positive. The behaviour is pinned by its own
 * fixture test below rather than by the real tree, since the real tree cannot
 * currently exercise it. Strings are tracked only well enough to keep a `//` inside
 * one from eating the rest of a line.
 */
export function stripComments(
  source: string,
  { blankStrings = false }: { blankStrings?: boolean } = {},
): { code: string; lineOf: number[] } {
  let code = '';
  let line = 1;
  const lineOf: number[] = [];
  const keep = (c: string) => { code += c; lineOf.push(line); };
  let i = 0;
  let quote: string | null = null;

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    if (quote) {
      // Inside a string. `blankStrings` decides whether the CONTENT survives: the
      // toggleAttribute scan wants it gone (so prose in a string cannot look like a
      // call), while the reflectFlag scan needs it kept (the prop name it looks for
      // IS a string literal). The closing quote is always kept either way.
      if (c === '\\') { if (!blankStrings) { keep(c); keep(source[i + 1] ?? ''); } i += 2; continue; }
      if (c === quote) { quote = null; keep(c); i++; continue; }
      if (c === '\n') line++;
      if (!blankStrings) keep(c);
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; keep(c); i++; continue; }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '\n') line++;
    keep(c);
    i++;
  }
  return { code, lineOf };
}

/** Real `.toggleAttribute(` call sites (comments and string contents removed). */
export function toggleAttributeSites(source: string): number[] {
  const { code, lineOf } = stripComments(source, { blankStrings: true });
  const hits: number[] = [];
  const re = /\.toggleAttribute\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) hits.push(lineOf[m.index] ?? 0);
  return hits;
}

/**
 * The only places a raw `.toggleAttribute(` may appear in a facade source.
 *
 * Each entry is a decision someone made on purpose. Adding one is cheap and that is
 * fine — what it must not be is silent.
 */
const EXEMPT: Record<string, string> = {
  // The seam itself. `reflectFlag` is implemented here; this IS the one copy every
  // other site is required to route through.
  'define.tsx':
    'the implementation of reflectFlag — the single copy of the pattern',

  // Already correct, by a STRONGER mechanism than reflectFlag provides, and left
  // alone deliberately. `kai-switch` binds the `checked` property straight to its
  // internal signal (`get: () => checked()`), so a UI toggle is visible on the
  // property with no attribute round-trip at all. reflectFlag's accessor delegates to
  // component-register's prop store instead, and migrating would break a behaviour
  // nothing else covers: `el.checked = true` after mount drives the switch UI only
  // because switch's own setter calls `setChecked`; the seeded signal on line 59 is
  // never re-read from props. kai-switch has NO test suite of its own (the control
  // cases in reflected-boolean-readback.test.tsx are its only automated coverage), so
  // the migration could not have been validated even if it were equivalent.
  'switch.tsx':
    'kai-switch binds `checked` to its internal signal directly — a stronger contract '
    + 'than the store-backed read-back, and it has no suite to validate a migration against',

  // kai-checkbox is kai-switch's structure, deliberately and line for line: `checked`
  // is an own accessor bound to the internal signal (`get: () => checked()`), so a
  // click is visible on the property with no attribute round-trip, and a host write
  // after mount drives the control because the setter calls `setChecked`. reflectFlag's
  // accessor delegates to component-register's prop store instead, which is the weaker
  // contract here for exactly the reasons written above kai-switch. Exempt for the same
  // reason, not by copy-paste: if kai-switch ever migrates, this migrates with it.
  'checkbox.tsx':
    'kai-checkbox binds `checked` to its internal signal directly, the same stronger '
    + 'contract as kai-switch — the two move together or not at all',
};

/**
 * Boolean props that are deliberately NOT reflected at all, recorded here so the
 * absence reads as a decision. These are invisible to the scan above (there is no
 * `toggleAttribute` call to find), which is exactly why they need writing down.
 */
const NOT_REFLECTED: Record<string, string> = {
  'kai-resizable-item.hidden':
    'NOT exempt because it is already correct — it has the same split as the props that '
    + 'were fixed, and measurably so: `el.hidden = true` writes no attribute (a plain '
    + '<div> gets one), and after maximize writes the attribute `el.hidden` reads '
    + '`undefined`. Declaring `hidden: false` is the cause: it makes `hidden` a '
    + 'component-register prop whose non-reflecting accessor shadows the native '
    + 'reflecting one, so this is a fact about THIS element and not about custom '
    + 'elements generally. It is HARMLESS because both readers take the union '
    + '`el.hidden || el.hasAttribute("hidden")` (resizable.tsx readItems + readAttrState), '
    + 'which cannot miss either half. It stays exempt because maximize/restore already '
    + 'owns that attribute through setBoolAttr, so adding reflectFlag would put a second '
    + 'writer on it and change what an `undefined` write means on that path — a behaviour '
    + 'decision of its own, deliberately not bundled into the read-back fix.',
};

test('the scan is not vacuous', () => {
  // A wrong path or glob would make every assertion below pass while checking nothing.
  const files = facadeSources();
  expect(files.length).toBeGreaterThan(50);
  expect(files).toContain('chat.tsx');
  expect(files).toContain('define.tsx');
});

test('detects a planted violation — THE TEETH', () => {
  // The old shape, exactly as it appeared in chat.tsx before this fix.
  const planted = `
    defineWebComponent('kai-thing', { busy: false }, (props, { element, flag }) => {
      createEffect(() => { element.toggleAttribute('busy', flag('busy')); });
      return <i />;
    });
  `;
  expect(toggleAttributeSites(planted)).toHaveLength(1);
});

test('ignores toggleAttribute mentioned in comments and strings', () => {
  // The analyzer's own failure mode: this fix left prose naming `toggleAttribute` at
  // most of the sites it repaired, so a comment-blind scan would flag every FIXED file.
  const prose = `
    // reflectFlag, not a hand-rolled element.toggleAttribute effect
    /* element.toggleAttribute('x', y) is what used to be here */
    const help = "call element.toggleAttribute() instead";
    const tpl = \`element.toggleAttribute('a', b)\`;
    export const nothing = 1;
  `;
  expect(toggleAttributeSites(prose)).toEqual([]);
});

test('every reflection routes through reflectFlag, or is a named exemption', () => {
  const offenders: string[] = [];
  for (const file of facadeSources()) {
    const sites = toggleAttributeSites(readFileSync(resolve(elementsDir, file), 'utf8'));
    if (sites.length && !(file in EXEMPT)) {
      offenders.push(`${file}:${sites.join(',')}`);
    }
  }

  expect(
    offenders,
    'These facades reflect a boolean with a raw toggleAttribute. That makes the property '
    + 'read back `undefined` (see WebComponentContext.reflectFlag). Use `reflectFlag(name)` '
    + 'from the facade context, or add the file to EXEMPT in this test WITH a reason.',
  ).toEqual([]);
});

test('each exemption still has a call site to justify it', () => {
  // An exemption that outlives its code is a lie that reads as diligence. If a file
  // stops reflecting anything, or is renamed, the waiver has to go with it.
  const stale: string[] = [];
  for (const file of Object.keys(EXEMPT)) {
    let source: string;
    try {
      source = readFileSync(resolve(elementsDir, file), 'utf8');
    } catch {
      stale.push(`${file} (no such file)`);
      continue;
    }
    if (toggleAttributeSites(source).length === 0) stale.push(`${file} (no toggleAttribute left)`);
  }
  expect(stale, 'stale exemptions — delete them').toEqual([]);
});

test('the migrated facades really do call reflectFlag', () => {
  // The complement of the offender check. Removing the reflection ENTIRELY would also
  // produce an empty offender list, so assert the replacement is present rather than
  // only that the old shape is absent.
  //
  // Over STRIPPED source, because this assertion was itself comment-blind when first
  // written: commenting out `reflectFlag('locked')` left the text on the line, the
  // regex still matched, and the guard stayed green over a facade that had stopped
  // reflecting. The same stripper the toggleAttribute scan uses closes it — with
  // string contents KEPT here, since the prop name it looks for is a string literal.
  const expected: Record<string, string[]> = {
    'chat.tsx': ['loading'],
    'resizable.tsx': ['collapsed', 'locked'],
    'disclosure.ts': ['open'],
  };
  for (const [file, props] of Object.entries(expected)) {
    const { code } = stripComments(readFileSync(resolve(elementsDir, file), 'utf8'));
    for (const prop of props) {
      expect(code, `${file} should reflect ${prop} via reflectFlag`).toMatch(
        new RegExp(`reflectFlag\\(\\s*'${prop}'`),
      );
    }
  }
});

test('the deliberate non-reflections are recorded with a reason', () => {
  // Not mechanically checkable — a prop that is not reflected leaves no trace to scan
  // for. This asserts only that the record exists and is a REASON rather than a label,
  // so "why is `hidden` different?" has an answer in the tree instead of in a PR thread.
  for (const [prop, reason] of Object.entries(NOT_REFLECTED)) {
    expect(prop).toMatch(/^kai-[a-z-]+\.[a-zA-Z]+$/);
    expect(reason.length, `${prop}'s exemption needs a real reason`).toBeGreaterThan(80);
  }
});
