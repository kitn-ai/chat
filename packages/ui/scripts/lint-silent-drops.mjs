// Regression guard for SILENT DROPS in the wire encoders.
//
// CLAUDE.md: "A silent drop, a silent truncation, a swallowed error, a silent
// fallback: each is a decision made while withholding the information that it
// happened. Deciding loudly is usually fine; deciding quietly almost never is."
//
// This enforces ONE narrow, high-signal case of that rule, chosen because it is
// where a quiet decision is IRREVERSIBLE: `src/wire/` turns `ChatMessage.parts`
// into a provider request. A UI component that renders only `text` parts is
// fine, because the data is still there. An ENCODER that reads only `text`
// parts has destroyed the rest by the time the request leaves the process, and
// the user sees a turn that silently did nothing.
//
// THE INVARIANT
// A function in `src/wire/` that discriminates a `MessagePart` at all is
// responsible for ALL of the union's variants. Touch one, account for six.
// Anything it deliberately does not encode has to say so in a machine-readable
// waiver that NAMES each dropped variant.
//
// WHY THE WAIVER IS NOT PROSE (this is the load-bearing design decision)
// The real defect this is built from -- PR #186, a user turn carrying only an
// attachment encoded to nothing -- was ALREADY commented. `toOpenAIMessages`
// carried "card, source and file parts are never encoded; they are kit-side ...
// which is why a user turn carrying only an attachment encodes to nothing", and
// `toAnthropicMessages` had a `default:` clause whose entire body was a comment
// saying the same thing plus `break;`. A rule that accepts a prose comment as
// justification would have passed, unchanged, the exact source that shipped the
// bug. So the waiver here is a parsed directive, and it must ENUMERATE the
// variants:
//
//   // lint-silent-drops: drops card,source -- <reason, >= 20 chars>
//
// Enumeration is what makes this fire FOREVER rather than once. A waiver covers
// only the variants it literally spells out, so adding a seventh member to
// `MessagePart` re-fires every waived site instead of being swallowed by a
// blanket suppression that was written before that variant existed.
//
// SCOPE, deliberately small. A noisy guard gets disabled, and a disabled guard
// is worse than none: it leaves everyone believing the class is covered. This
// looks at `src/wire/*.ts` only, skipping tests and fixtures. Patterns
// considered and REJECTED for now are documented in the PR, the short version
// being that `content ?? ''` and `url: cond ? x : undefined` could not be made
// to pay for their false positives yet.
//
// RUNNING IT, without a build. This parses source and reads no `dist/`, so it
// is a seam anyone can grab to watch it fail:
//
//   node packages/ui/scripts/lint-silent-drops.mjs
//   node packages/ui/scripts/lint-silent-drops.mjs --package-root <dir>   # a historical checkout
//   node packages/ui/scripts/lint-silent-drops.mjs --self-test            # prove the analyzer still detects
//
// KNOWN LIMITATION, stated rather than hidden: a function's waiver search spans
// its whole body, so a waiver written inside a nested callback is also visible
// to the function enclosing it. That errs toward FEWER findings on the outer
// site. It is left this way because the alternative -- a waiver that reads as
// correct but is scoped somewhere non-obvious -- is worse, and because the outer
// site already gets credit for what the callback handles.
//
// A ZERO-MATCH RUN IS A HARD FAILURE. This repo's single most expensive
// recurring defect is a runner that exits 0 because it matched no files and
// gets read as "nothing was wrong". If the union cannot be parsed, or no wire
// source is found, or no function in it discriminates a part at all, that is
// this script being broken, not the tree being clean, and it exits non-zero.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
// The variant list is read by ONE shared derivation, so this guard and the
// catalog generator can never disagree about what `MessagePart` declares.
import {
  readVariants,
  MIN_VARIANTS as SHARED_MIN_VARIANTS,
  UNION_NAME,
} from './lib/message-part-variants.mjs';

// Anchored to THIS FILE, not the cwd. CLAUDE.md tells everyone to run from the
// repo root while `npm run` sets the cwd to the package; verify-react-wrappers
// misdiagnosed itself that way once and sent someone off to re-run a build that
// was never the problem.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const PKG_ROOT = resolve(argOf('--package-root') ?? join(SCRIPT_DIR, '..'));
const SELF_TEST = argv.includes('--self-test');

const UNION_FILE = join(PKG_ROOT, 'src/elements/chat-types.ts');
const WIRE_DIR = join(PKG_ROOT, 'src/wire');

// The degradation floor for the parse; see `scripts/lib/message-part-variants.mjs`.
const MIN_VARIANTS = SHARED_MIN_VARIANTS;

const parse = (path, text) =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.TS);

const isTypeAccess = (node) =>
  ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name) && node.name.text === 'type';

/** Function-like nodes own a finding. Attribution is to the INNERMOST enclosing
 *  function and does not bubble outward, so the `forEach` callback that encodes
 *  a user turn is reported separately from the outer encoder it sits in --
 *  those are two different decisions and each needs its own answer. */
const isFunctionLike = (node) =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node);

function functionLabel(node, sf) {
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  let name;
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) {
    name = node.name.getText(sf);
  } else if (node.parent && ts.isVariableDeclaration(node.parent)) {
    name = node.parent.name.getText(sf);
  } else if (node.parent && ts.isPropertyAssignment(node.parent)) {
    name = node.parent.name.getText(sf);
  } else if (node.parent && ts.isCallExpression(node.parent)) {
    // `message.parts.forEach(...)` -- name the callback by what it is passed to.
    const callee = node.parent.expression.getText(sf);
    name = `${callee.length > 40 ? callee.slice(-40) : callee}() callback`;
  }
  return { name: name ?? '(anonymous)', line };
}

/** `const isTextPart = (p: MessagePart): p is TextPart => p.type === 'text'`.
 *  A predicate like this is a SELECTOR DEFINITION, not a consumer, so it is
 *  exempt from the invariant. But calling one is a variant reference, which is
 *  how `parts.filter(isTextPart)` -- the literal shape of the #186 user-turn
 *  drop, which contains no string literal at all -- still gets attributed. */
function collectGuards(sf, variantSet) {
  const guards = new Map();
  const predicateNodes = new Set();
  const visit = (node) => {
    if (isFunctionLike(node) && node.type && ts.isTypePredicateNode(node.type)) {
      const variants = new Set();
      const scan = (n) => {
        if (
          ts.isBinaryExpression(n) &&
          isTypeAccess(n.left) &&
          ts.isStringLiteral(n.right) &&
          variantSet.has(n.right.text)
        ) {
          variants.add(n.right.text);
        }
        ts.forEachChild(n, scan);
      };
      scan(node);
      if (variants.size > 0) {
        predicateNodes.add(node);
        let name;
        if (ts.isFunctionDeclaration(node) && node.name) name = node.name.text;
        else if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
          name = node.parent.name.text;
        }
        if (name) guards.set(name, variants);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { guards, predicateNodes };
}

const WAIVER = /lint-silent-drops:\s*drops\s+([a-z0-9,\s-]+?)\s*--\s*(.+)/i;

/** Waivers are read from the function's own text plus the leading trivia of the
 *  STATEMENT that introduces it, so they can sit above `const textOf = ...` or
 *  above `message.parts.forEach(...)` -- where a reader would naturally write
 *  one -- and not only inside the braces. An arrow function's own trivia starts
 *  after the `=`, so anchoring to the node alone would silently ignore a waiver
 *  written one line higher, and "my waiver does nothing" is how a guard loses
 *  its audience. */
function waiverSearchStart(node) {
  let outer = node;
  while (
    outer.parent &&
    !ts.isBlock(outer.parent) &&
    !ts.isSourceFile(outer.parent) &&
    !ts.isCaseClause(outer.parent) &&
    !ts.isDefaultClause(outer.parent) &&
    !ts.isModuleBlock(outer.parent)
  ) {
    outer = outer.parent;
  }
  return outer.getFullStart();
}

function readWaivers(node, sf) {
  const full = sf.text.slice(waiverSearchStart(node), node.getEnd());
  const out = [];
  for (const line of full.split('\n')) {
    const m = WAIVER.exec(line);
    if (!m) continue;
    out.push({
      variants: new Set(
        m[1]
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      ),
      reason: m[2].trim(),
      raw: line.trim(),
    });
  }
  return out;
}

function analyze(sf, variants) {
  const variantSet = new Set(variants);
  const { guards, predicateNodes } = collectGuards(sf, variantSet);
  // node -> { referenced:Set, swallowingDefault:boolean }
  const sites = new Map();
  const stack = [];

  const record = (variant) => {
    const fn = stack[stack.length - 1];
    if (!fn) return;
    if (!sites.has(fn)) sites.set(fn, { referenced: new Set(), swallowingDefault: false });
    sites.get(fn).referenced.add(variant);
  };

  const visit = (node) => {
    const pushed = isFunctionLike(node);
    if (pushed) stack.push(node);

    // `part.type === 'file'` and `part.type !== 'file'`. The negative form is
    // the sharper signal: an exclusion guard that returns drops every variant it
    // did not name, which is five of six from a single line.
    if (
      ts.isBinaryExpression(node) &&
      isTypeAccess(node.left) &&
      ts.isStringLiteral(node.right) &&
      variantSet.has(node.right.text)
    ) {
      record(node.right.text);
    }

    // `switch (part.type) { case 'text': ... default: break }`
    if (ts.isSwitchStatement(node) && isTypeAccess(node.expression)) {
      for (const clause of node.caseBlock.clauses) {
        if (ts.isCaseClause(clause) && ts.isStringLiteral(clause.expression)) {
          if (variantSet.has(clause.expression.text)) record(clause.expression.text);
        } else if (ts.isDefaultClause(clause)) {
          // A default that only falls through is the swallow itself: every
          // unlisted variant lands here and leaves no trace. A default that
          // THROWS is the loud version and is fine.
          const text = clause.statements.map((s) => s.getText(sf)).join(' ').trim();
          const loud = /\bthrow\b|\bassertNever\b|\bnever\b/.test(text);
          const fn = stack[stack.length - 1];
          if (!loud && fn) {
            if (!sites.has(fn)) sites.set(fn, { referenced: new Set(), swallowingDefault: false });
            sites.get(fn).swallowingDefault = true;
          }
        }
      }
    }

    // `parts.filter(isTextPart)` -- a call to a known variant guard.
    if (ts.isCallExpression(node)) {
      for (const arg of node.arguments) {
        if (ts.isIdentifier(arg) && guards.has(arg.text)) {
          for (const v of guards.get(arg.text)) record(v);
        }
      }
      if (ts.isIdentifier(node.expression) && guards.has(node.expression.text)) {
        for (const v of guards.get(node.expression.text)) record(v);
      }
    }

    ts.forEachChild(node, visit);
    if (pushed) stack.pop();
  };
  visit(sf);

  // A parent gets CREDIT for what its nested functions handle. Attribution is
  // still innermost, so the user-turn callback and the assistant-turn loop stay
  // separate findings answering separate questions -- but without this, the
  // outer encoder is reported as dropping `file` while the callback three lines
  // inside it is the thing that encodes `file`. That reads as the guard not
  // understanding the code, which is how a guard earns a blanket suppression.
  const credited = new Map();
  for (const [fn, info] of sites) {
    credited.set(fn, new Set(info.referenced));
  }
  for (const [fn, info] of sites) {
    for (let p = fn.parent; p; p = p.parent) {
      if (credited.has(p)) for (const v of info.referenced) credited.get(p).add(v);
    }
  }

  const findings = [];
  for (const [fn, info] of sites) {
    if (predicateNodes.has(fn)) continue; // a selector definition, not a consumer
    const handledSet = credited.get(fn);
    const missing = variants.filter((v) => !handledSet.has(v));
    if (missing.length === 0 && !info.swallowingDefault) continue;

    const waivers = readWaivers(fn, sf);
    const waived = new Set();
    const badReasons = [];
    for (const w of waivers) {
      if (w.reason.length < 20) {
        badReasons.push(w);
        continue;
      }
      for (const v of w.variants) waived.add(v);
    }
    const unwaived = missing.filter((v) => !waived.has(v));
    const bogus = [...waived].filter((v) => !variantSet.has(v));

    // A fall-through `default` is reported as CONTEXT on a finding, never as a
    // finding of its own. On a switch that already handles every variant it is
    // not a drop today, and the enumerated waiver is what protects tomorrow: a
    // seventh union member is unwaived by construction and fires here even
    // though it would land in that `default` at runtime. Making it independently
    // fatal would leave the assistant-turn encoder permanently red with no way
    // to answer it, which is how a guard gets switched off.
    if (unwaived.length === 0 && bogus.length === 0 && badReasons.length === 0) {
      continue;
    }
    findings.push({
      ...functionLabel(fn, sf),
      handled: variants.filter((v) => handledSet.has(v)),
      missing,
      unwaived,
      bogus,
      badReasons,
      swallowingDefault: info.swallowingDefault,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// self-test: proves the analyzer can still DETECT. Guards this script against
// degrading into the thing it exists to prevent -- a check that quietly matches
// nothing and is read as a pass.
// ---------------------------------------------------------------------------
const FIXTURE_VARIANTS = ['text', 'reasoning', 'tool', 'card', 'source', 'file'];
const SELF_TEST_CASES = [
  {
    name: 'exclusion guard drops the unnamed variants',
    code: `function enc(parts: MessagePart[]) {
      parts.forEach((part) => { if (part.type !== 'file') return; use(part); });
    }`,
    expect: true,
  },
  {
    name: 'filter(isTextPart) drops the rest (the #186 shape, no string literal)',
    code: `const isTextPart = (p: MessagePart): p is TextPart => p.type === 'text';
    function textOf(parts: MessagePart[]) { return parts.filter(isTextPart).map((p) => p.text).join(''); }`,
    expect: true,
  },
  {
    name: 'non-exhaustive switch whose default falls through (the #186 shape)',
    code: `function enc(part: MessagePart) {
      switch (part.type) {
        case 'text': return 1; case 'reasoning': return 2; case 'tool': return 3;
        default: break;
      }
    }`,
    expect: true,
  },
  {
    name: 'exhaustive switch with a fall-through default is clean (context, not a finding)',
    code: `function enc(part: MessagePart) {
      switch (part.type) {
        case 'text': return 1; case 'reasoning': return 2; case 'tool': return 3;
        case 'card': return 4; case 'source': return 5; case 'file': return 6;
        default: break;
      }
    }`,
    expect: false,
  },
  {
    name: 'prose alone does not waive (the comment #186 actually shipped)',
    code: `function enc(part: MessagePart) {
      // card, source and file are kit-side and have no wire representation in v1.
      if (part.type === 'text') return 1;
      if (part.type === 'reasoning') return 2;
      if (part.type === 'tool') return 3;
    }`,
    expect: true,
  },
  {
    name: 'an enumerated waiver with a reason clears it',
    code: `function enc(part: MessagePart) {
      // lint-silent-drops: drops card,source,file -- kit-side parts with no wire form, asserted in encode.test.ts
      if (part.type === 'text') return 1;
      if (part.type === 'reasoning') return 2;
      if (part.type === 'tool') return 3;
    }`,
    expect: false,
  },
  {
    name: 'a waiver that misses a variant still fires for that variant',
    code: `function enc(part: MessagePart) {
      // lint-silent-drops: drops card,source -- kit-side parts with no wire representation at all
      if (part.type === 'text') return 1;
      if (part.type === 'reasoning') return 2;
      if (part.type === 'tool') return 3;
    }`,
    expect: true,
  },
  {
    name: 'exhaustive switch that throws on default is clean',
    code: `function enc(part: MessagePart) {
      switch (part.type) {
        case 'text': return 1; case 'reasoning': return 2; case 'tool': return 3;
        case 'card': return 4; case 'source': return 5; case 'file': return 6;
        default: throw new Error('unreachable');
      }
    }`,
    expect: false,
  },
  {
    name: 'a type-guard definition is not itself a consumer',
    code: `const isTextPart = (p: MessagePart): p is TextPart => p.type === 'text';`,
    expect: false,
  },
  {
    name: 'a non-MessagePart union is not touched',
    code: `function j(out: Schema) { if (out.type === 'object') return 1; if (out.type === 'null') return 2; }`,
    expect: false,
  },
];

if (SELF_TEST) {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const sf = parse('selftest.ts', c.code);
    const got = analyze(sf, FIXTURE_VARIANTS).length > 0;
    const ok = got === c.expect;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect ? 'a finding' : 'clean'}, got ${got ? 'a finding' : 'clean'})`);
  }
  if (failed > 0) {
    console.error(`\n✗ lint-silent-drops self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(`\n✓ lint-silent-drops self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
if (!existsSync(UNION_FILE)) {
  console.error(`✗ lint-silent-drops: ${UNION_FILE} not found -- cannot read the ${UNION_NAME} union, so nothing could be checked.`);
  process.exit(1);
}
const variants = readVariants(readFileSync(UNION_FILE, 'utf8'));
if (variants.length < MIN_VARIANTS) {
  console.error(
    `✗ lint-silent-drops: parsed only ${variants.length} variant(s) of ${UNION_NAME} ` +
      `(${variants.join(', ') || 'none'}) from ${relative(PKG_ROOT, UNION_FILE)}.\n` +
      `  The declaration moved or changed shape. This script is reading the wrong thing and would pass everything.`,
  );
  process.exit(1);
}

if (!existsSync(WIRE_DIR)) {
  console.error(`✗ lint-silent-drops: ${WIRE_DIR} not found -- no wire source to check.`);
  process.exit(1);
}
const files = readdirSync(WIRE_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.includes('.test.'))
  .sort();
if (files.length === 0) {
  console.error(`✗ lint-silent-drops: no non-test .ts files under ${relative(PKG_ROOT, WIRE_DIR)} -- matched nothing, which is a broken scan, not a clean tree.`);
  process.exit(1);
}

let partsConsumers = 0;
const report = [];
for (const file of files) {
  const path = join(WIRE_DIR, file);
  const sf = parse(path, readFileSync(path, 'utf8'));
  const variantSet = new Set(variants);
  // Count every function that discriminates a part at all, waived or not: this
  // is the "did the scan actually see anything" tripwire.
  const { guards, predicateNodes } = collectGuards(sf, variantSet);
  const seen = new Set();
  const stack = [];
  const walk = (node) => {
    const pushed = isFunctionLike(node);
    if (pushed) stack.push(node);
    const fn = stack[stack.length - 1];
    if (fn && !predicateNodes.has(fn)) {
      if (
        (ts.isBinaryExpression(node) && isTypeAccess(node.left) && ts.isStringLiteral(node.right) && variantSet.has(node.right.text)) ||
        (ts.isCallExpression(node) && node.arguments.some((a) => ts.isIdentifier(a) && guards.has(a.text))) ||
        (ts.isSwitchStatement(node) && isTypeAccess(node.expression))
      ) {
        seen.add(fn);
      }
    }
    ts.forEachChild(node, walk);
    if (pushed) stack.pop();
  };
  walk(sf);
  partsConsumers += seen.size;

  const findings = analyze(sf, variants);
  if (findings.length > 0) report.push({ file: `src/wire/${file}`, findings });
}

if (partsConsumers === 0) {
  console.error(
    `✗ lint-silent-drops: scanned ${files.length} wire file(s) and found NO function that discriminates a ${UNION_NAME}.\n` +
      `  The encoders always do. A zero-match run is this script being broken, not the tree being clean.`,
  );
  process.exit(1);
}

const total = report.reduce((n, r) => n + r.findings.length, 0);
if (total === 0) {
  console.log(
    `✓ lint-silent-drops: ${partsConsumers} part-discriminating function(s) across ${files.length} wire file(s); ` +
      `every variant of ${UNION_NAME} (${variants.join(', ')}) is either encoded or waived by name.`,
  );
  process.exit(0);
}

console.error(`✗ lint-silent-drops: ${total} silent drop(s) of a ${UNION_NAME} variant in src/wire/.\n`);
console.error(`  ${UNION_NAME} declares: ${variants.join(', ')}\n`);
for (const { file, findings } of report) {
  for (const f of findings) {
    console.error(`  ${file}:${f.line}  ${f.name}`);
    console.error(`    handles: ${f.handled.join(', ') || '(none by literal)'}`);
    if (f.unwaived.length > 0) {
      console.error(`    DROPS SILENTLY: ${f.unwaived.join(', ')}`);
    }
    if (f.swallowingDefault) {
      console.error(`    switch has a \`default\` that falls through -- every unlisted variant lands there and leaves no trace.`);
    }
    if (f.bogus.length > 0) {
      console.error(`    waiver names ${f.bogus.join(', ')}, which is not a ${UNION_NAME} variant (typo, or the union changed).`);
    }
    for (const b of f.badReasons) {
      console.error(`    waiver reason is too short to be a reason: "${b.raw}"`);
    }
    console.error('');
  }
}
console.error(
  `  Encode the variant, or declare the drop where it happens:\n` +
    `    // lint-silent-drops: drops <variant>[,<variant>] -- why this one cannot reach the wire\n` +
    `  The waiver covers only the variants it names, so a new ${UNION_NAME} member re-fires every site.`,
);
process.exit(1);
