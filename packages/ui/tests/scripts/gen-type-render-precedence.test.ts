/**
 * GUARD — every type string the API generator renders must PARSE, and must parse as
 * the type it was read from.
 *
 * WHAT THIS CAUGHT. `renderType` in `scripts/_ts-helpers.mjs` builds a union by
 * rendering each constituent alone and joining with ` | `, and an array by appending
 * `[]`. Both are correct only while every constituent binds tighter than the
 * punctuation being added, and a FUNCTION type does not: it is the loosest form in the
 * type grammar. `kai-slider`'s `valueLabel` (`boolean | ((v: number) => JSX.Element)`)
 * was the kit's first function-in-union prop and it emitted
 *
 *     valueLabel?: boolean | (value: number) => string;
 *
 * into `src/elements/element-types.d.ts` AND into `dist/elements.d.ts`, which is what a
 * TypeScript consumer of the published package resolves. TS1385, twice.
 *
 * WHY THE EXISTING TESTS ARE NOT ENOUGH. `element-types-lib-check` and
 * `element-methods-typed` compile the generated artifact, so they DID go red once the
 * bad prop existed. They could not have caught it a day earlier, because they can only
 * see shapes some element happens to declare today. This file drives the renderer over
 * FIXTURES instead, so the rule is guarded whether or not any element uses it.
 *
 * THE ARRAY CASE IS WORSE THAN THE UNION CASE AND IS THE REASON THIS IS FIXTURE-LEVEL.
 * `() => void` + `[]` is `() => void[]`: a function returning an array. It parses, tsc
 * is silent, and a consumer gets a type nobody wrote. Nothing in the kit renders an
 * array of functions today, so no compile-the-artifact test can reach it. Asserting the
 * parsed AST node kind below is what makes that one visible.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createTsHelpers, bindsLoosely, unwrapOuterParens, cleanEmittedType } from '../../scripts/_ts-helpers.mjs';

/** Props chosen to cover BOTH directions: shapes that must gain parens, and shapes
 *  that must not (an over-eager fix is its own defect, and would churn every
 *  committed artifact). */
const FIXTURE = `
export interface Fixture {
  /** The shape that shipped broken. */
  fnInUnion?: boolean | ((value: number) => string);
  /** Parses either way, so only the AST kind tells the two apart. */
  fnArray?: (() => void)[];
  /** A constructor type is spelled with the same top-level arrow. */
  ctorInUnion?: string | (new (n: number) => Date);
  /** Already handled before this fix; must stay handled. */
  unionArray?: ('a' | 'b')[];
  /** REQUIRED, so it is rendered at the TOP level rather than inside the
   *  "undefined | ..." union that an optional marker creates. Parens would be noise. */
  plainFn: (value: number) => string;
  /** Required too, so the array is the whole rendered type. */
  fnArrayRequired: (() => void)[];
  /** Required, for the same reason. */
  unionArrayRequired: ('a' | 'b')[];
  /** The arrow is inside braces. Wrapping this would be wrong. */
  objWithFn?: { onDone: () => void };
  /** The arrow is inside angle brackets. */
  recordOfFn?: Record<string, () => void>;
  /** TWO arrows inside one object. The scanner has to keep its bracket depth right
   *  ACROSS the first arrow: if the ">" of "=>" is counted as a closing angle
   *  bracket, depth falls to zero and the SECOND arrow looks top-level. */
  objWithTwoFns?: { a: () => void; b: () => void };
  /** An arrow inside a STRING LITERAL is not an arrow. */
  arrowInLiteral?: 'a => b' | 'plain';
  /** The ordinary case, which must be untouched. */
  plainUnion?: 'a' | 'b';
}
`;

function renderFixtureProps(): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'kai-render-'));
  const file = join(dir, 'fixture.ts');
  writeFileSync(file, FIXTURE, 'utf8');
  try {
    const program = ts.createProgram([file], {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
    });
    const checker = program.getTypeChecker();
    const { membersOfType } = createTsHelpers(program, checker, { importable: new Set() });
    const src = program.getSourceFile(file)!;
    const iface = src.statements.find(
      (s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === 'Fixture',
    )!;
    const type = checker.getTypeAtLocation(iface.name);
    // `_ts-helpers.mjs` is untyped JS, so `membersOfType` is `any` and its callback
    // parameter would be an implicit any under the quarantine pass. Name the shape.
    const members = membersOfType(type, iface) as Array<{ name: string; type: string }>;
    return Object.fromEntries(members.map((m) => [m.name, m.type]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Parse `type T = <rendered>` and hand back the type node plus any syntax errors. */
function parseAsType(rendered: string): { node: ts.TypeNode | undefined; errors: string[] } {
  const sf = ts.createSourceFile(
    'probe.d.ts',
    `type T = ${rendered};`,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  // `parseDiagnostics` is internal but is the only way to see SYNTAX errors from a
  // standalone createSourceFile; fall back to a full program if the shape ever changes.
  const errors = ((sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []).map((d) =>
    `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
  );
  const alias = sf.statements[0] as ts.TypeAliasDeclaration | undefined;
  return { node: alias?.type, errors };
}

describe('renderType emits type strings that parse', () => {
  const rendered = renderFixtureProps();

  it('renders every fixture prop (the scan is not vacuous)', () => {
    // Without this, a renderer that returned {} would make every assertion below pass.
    expect(Object.keys(rendered).sort()).toEqual([
      'arrowInLiteral', 'ctorInUnion', 'fnArray', 'fnArrayRequired', 'fnInUnion',
      'objWithFn', 'objWithTwoFns', 'plainFn', 'plainUnion', 'recordOfFn', 'unionArray',
      'unionArrayRequired',
    ]);
  });

  it.each(Object.keys(renderFixtureProps()))('%s parses with no syntax errors', (name) => {
    const { errors } = parseAsType(rendered[name]);
    expect({ name, rendered: rendered[name], errors }).toEqual({ name, rendered: rendered[name], errors: [] });
  });

  it('a function type inside a union is parenthesised', () => {
    const { node, errors } = parseAsType(rendered.fnInUnion);
    expect(errors).toEqual([]);
    expect(node && ts.isUnionTypeNode(node)).toBe(true);
  });

  it('a constructor type inside a union is parenthesised', () => {
    const { node, errors } = parseAsType(rendered.ctorInUnion);
    expect(errors).toEqual([]);
    expect(node && ts.isUnionTypeNode(node)).toBe(true);
  });

  it('an array of functions stays an ARRAY, not a function returning an array', () => {
    // The whole point of asserting the AST rather than the text: `() => void[]` parses
    // cleanly and means something else entirely. Checked on the REQUIRED prop, whose
    // rendered type is the array itself rather than `undefined | array`.
    const { node, errors } = parseAsType(rendered.fnArrayRequired);
    expect(errors).toEqual([]);
    expect(node && ts.isArrayTypeNode(node)).toBe(true);
    expect(node && ts.isArrayTypeNode(node) && ts.isParenthesizedTypeNode(node.elementType)).toBe(true);
  });

  it('an array of a union stays an array', () => {
    const { node } = parseAsType(rendered.unionArrayRequired);
    expect(node && ts.isArrayTypeNode(node)).toBe(true);
  });

  it('does NOT parenthesise where it would be noise', () => {
    // An over-eager fix would churn every committed artifact, which this repo reads as
    // the tell for a generator that silently rewrote its output. `plainFn` is REQUIRED,
    // so it renders at the top level where a function type needs nothing.
    expect(rendered.plainFn).toBe('(value: number) => string');
    expect(rendered.plainUnion).toBe('undefined | "a" | "b"');
    // The arrow lives inside braces / angle brackets, so neither is wrapped.
    expect(rendered.objWithFn).toBe('undefined | { onDone: () => void }');
    expect(rendered.recordOfFn).toBe('undefined | Record<string, () => void>');
    // Two arrows in one object literal. Exact text, because the failure mode here is a
    // spurious wrap rather than a parse error: `({ a: () => void; b: () => void })`
    // compiles fine and would silently churn the committed artifacts.
    expect(rendered.objWithTwoFns).toBe('undefined | { a: () => void; b: () => void }');
  });

  it('an arrow inside a string literal is not treated as a function type', () => {
    const { node, errors } = parseAsType(rendered.arrowInLiteral);
    expect(errors).toEqual([]);
    expect(node && ts.isUnionTypeNode(node)).toBe(true);
    // Exact text: wrapping a string literal type parses and would be invisible to any
    // parse-only assertion, so only the literal spelling catches it.
    expect(rendered.arrowInLiteral).toBe('undefined | "a => b" | "plain"');
  });
});

/**
 * The other half of the rule. Whether a type needs parens is a property of the POSITION
 * it sits in, and `clean()` in gen-element-types.mjs MOVES it: it strips the `undefined`
 * arm from an optional prop before writing the `.d.ts`, which can leave a function type
 * wearing parens it no longer needs. Without `unwrapOuterParens` the union fix would
 * have added redundant parens to every existing function-typed prop
 * (`kai-voice-input.transcribe`, `kai-voice-output.synthesize`) in two committed
 * artifacts, for no behavioural gain.
 */
describe('unwrapOuterParens', () => {
  it('drops a pair that wraps the whole type', () => {
    expect(unwrapOuterParens('((audio: Blob) => Promise<string>)')).toBe('(audio: Blob) => Promise<string>');
  });

  it('leaves a type whose opening paren closes before the end', () => {
    // `(a | b)[]` and `(() => void) | null` are NOT one wrapped group. Unwrapping
    // either would change what they mean, or break them outright.
    expect(unwrapOuterParens('(a | b)[]')).toBe('(a | b)[]');
    expect(unwrapOuterParens('(() => void) | null')).toBe('(() => void) | null');
    expect(unwrapOuterParens('(a: string) => void')).toBe('(a: string) => void');
  });

  it('leaves an unparenthesised type alone', () => {
    expect(unwrapOuterParens('boolean | "a"')).toBe('boolean | "a"');
    expect(unwrapOuterParens('{ a: () => void }')).toBe('{ a: () => void }');
  });
});

describe('bindsLoosely', () => {
  it.each([
    ['() => void', true],
    ['(value: number) => string', true],
    ['new (n: number) => Date', true],
  ])('%s needs parens in a union', (input, expected) => {
    expect(bindsLoosely(input)).toBe(expected);
  });

  it.each([
    ['(() => void)', 'already parenthesised, as typeToString emits it'],
    ['{ onDone: () => void }', 'arrow inside braces'],
    ['{ a: () => void; b: () => void }', 'two arrows inside braces'],
    ['Record<string, () => void>', 'arrow inside angle brackets'],
    ['(() => void)[]', 'an array is not a function'],
    ['"a => b"', 'an arrow inside a string literal is not an arrow'],
    ['boolean', 'no arrow at all'],
  ])('%s does not (%s)', (input) => {
    expect(bindsLoosely(input)).toBe(false);
  });
});

describe('cleanEmittedType', () => {
  it('leaves a function-in-union parenthesised (the shipped bug)', () => {
    expect(cleanEmittedType('undefined | false | true | ((value: number) => string)', true))
      .toBe('boolean | ((value: number) => string)');
  });

  it('drops parens that stripping undefined made redundant', () => {
    expect(cleanEmittedType('undefined | ((audio: Blob) => Promise<string>)', true))
      .toBe('(audio: Blob) => Promise<string>');
  });

  it('does not strip undefined from a REQUIRED member', () => {
    expect(cleanEmittedType('undefined | string', false)).toBe('undefined | string');
  });
});

/**
 * The normaliser had TWO byte-identical copies, one per emitter, and that is why the
 * function-in-union fix had to be discovered twice: patching gen-element-types.mjs left
 * `frameworks/react/index.tsx` — a shipped consumer entry point — still emitting
 * `valueLabel?: boolean | (value: number) => string`. The second failure was invisible
 * because `npm run typecheck` is `&&`-joined and an earlier step was already red.
 *
 * So: assert there is exactly one owner. A structural check, because the failure mode
 * is a copy that DRIFTS, and a behavioural test over one emitter cannot see the other.
 */
describe('the emitted-type normaliser has a single owner', () => {
  // Same path recovery as tests/scripts/rendered-description-style.test.ts; under
  // Vitest `import.meta.url` is not a file: URL, so `new URL(...)` cannot be used.
  const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const read = (name: string) => readFileSync(join(pkgRoot, 'scripts', name), 'utf8');

  it('is defined once, in _ts-helpers.mjs', () => {
    expect(read('_ts-helpers.mjs')).toContain('export const cleanEmittedType');
  });

  it.each(['gen-element-types.mjs', 'gen-element-react.mjs'])(
    '%s imports it rather than redefining it',
    (file) => {
      const src = read(file);
      expect(src).toContain("cleanEmittedType as clean } from './_ts-helpers.mjs'");
      // A local `const clean = (type, optional) =>` is the exact shape that drifted.
      expect(src).not.toMatch(/const clean = \(type, optional\) =>/);
    },
  );
});
