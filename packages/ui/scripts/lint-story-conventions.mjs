// Regression guard for two STORY-CONVENTION defects the audit found, both of
// which were hand-authored per story with nothing enforcing them.
//
// THE TWO DEFECTS
// (a) A `.stories.tsx` file that ships a `render:` story (a story that draws
//     its own JSX rather than driving `args` through the default `Widget`) is
//     the one shape where the auto-derived Controls/Code panel has nothing to
//     show -- the story's usage isn't reconstructable from `args`. The house
//     convention is to author a usage snippet by hand: either the local
//     `const src = (code) => ({ parameters: { docs: { source: { code, ... } } } })`
//     helper every component `.stories.tsx` defines for itself (see
//     `src/components/composer.stories.tsx`), or an inline
//     `parameters.docs.source.code`. Two real files -- `view-stack.stories.tsx`
//     and `pane-group.stories.tsx` -- shipped `render:` stories with neither,
//     so their Code tab silently showed nothing (or Storybook's raw serialized
//     story-object dump; see the `preview.ts` fallback this guard's sibling
//     change adds).
// (b) An `argTypes` entry whose key looks like an event (`/^on[A-Z]/`) needs
//     `table: { category: 'Events' }` so it sorts into the Events group in
//     the Controls/Docs panel instead of alongside the props. ~34 files
//     defined an `onX` argType without it.
//
// THE INVARIANT
// (a) is a per-FILE finding: a file with at least one `render:` story must
// also contain at least one `docs.source.code` authoring site somewhere in
// the file (inline or via a local helper -- the two are structurally
// identical: a nested `docs -> source -> code` property chain, so the same
// walk catches both).
// (b) is a per-KEY finding: every LITERAL `argTypes` property whose name
// matches `/^on[A-Z]/` must carry `table: { category: 'Events' }` verbatim.
// A key introduced only via a spread (`...argTypesFor('kai-x')`) is not
// checked here -- there is no static key to check, and `argTypesFor` itself
// now stamps the category (see `src/stories/docs/element-controls.ts`).
//
// WHY AST, NOT REGEX
// Both rules are about a SHAPE in the code (a property chain, a story's
// `render` key), not a token that also legitimately appears in prose --
// `lint-cdn-pins` justifies regex for exactly that distinction and rejects it
// for shape-matching. A real parse also means renamed variables, multiline
// object literals and reordered keys don't produce false negatives the way a
// line-oriented scan would.
//
// A ZERO-MATCH RUN ON `.stories.tsx` FILES IS A HARD FAILURE. This repo's
// most expensive recurring defect is a scan that silently matches nothing and
// reads as "clean". A clean run on the FINDINGS is fine and is the goal
// state; a clean run because the file walk found no `.stories.tsx` at all is
// this script being broken.
//
// RUNNING IT, without a build:
//
//   node packages/ui/scripts/lint-story-conventions.mjs
//   node packages/ui/scripts/lint-story-conventions.mjs --self-test   # prove it still detects
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const PKG_ROOT = resolve(argOf('--package-root') ?? join(SCRIPT_DIR, '..'));
const SELF_TEST = argv.includes('--self-test');
const SRC_DIR = join(PKG_ROOT, 'src');

const parse = (path, text) =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.TSX);

const propName = (node) => {
  if (!node.name) return undefined;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
  return undefined;
};

/** True if this object literal is `const meta = {...}` -- the file's default
 *  export config, which the house convention (`satisfies Meta<typeof X>`)
 *  gives a SHARED `render:` wrapper applied to every args-driven story
 *  (`render: (args) => <div>...<X {...args} /></div>`, see e.g.
 *  `chat-thread.stories.tsx`). That is not the pattern this rule polices --
 *  a story reachable through `args` is already fully described by the
 *  Controls panel. Matched structurally, by the enclosing variable's name,
 *  because not every meta object uses `satisfies Meta<...>` (some use a type
 *  annotation instead), but every one of them is `const meta = {...}`. */
function isMetaObject(objectLiteral) {
  // `const meta = {...} satisfies Meta<typeof X>` wraps the object literal in
  // a SatisfiesExpression (or `as Meta<...>` an AsExpression) before it
  // reaches the VariableDeclaration, so climb through those first.
  let node = objectLiteral;
  while (node.parent && (ts.isSatisfiesExpression(node.parent) || ts.isAsExpression(node.parent) || ts.isParenthesizedExpression(node.parent))) {
    node = node.parent;
  }
  const decl = node.parent;
  return (
    decl &&
    ts.isVariableDeclaration(decl) &&
    ts.isIdentifier(decl.name) &&
    decl.name.text === 'meta' &&
    decl.initializer === node
  );
}

/** True if the file contains at least one `render: <function>` property on a
 *  STORY-level object (an individually exported story), as opposed to the
 *  meta object's shared default-render wrapper -- a story defining its own
 *  JSX outside `args`. */
function hasRenderStory(sf) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (
      ts.isPropertyAssignment(node) &&
      propName(node) === 'render' &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer) ||
        ts.isIdentifier(node.initializer)) && // `render: Widget`
      !isMetaObject(node.parent)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** True if the file contains a nested `docs -> source -> code` property
 *  chain anywhere -- inline `parameters.docs.source.code`, or inside a local
 *  `src()`/similar helper that RETURNS that shape (the helper's own object
 *  literal is walked just like inline usage; there's no special-casing of
 *  the helper's name). */
function hasDocsSourceCode(sf) {
  let found = false;
  const isNamed = (node, name) =>
    (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && propName(node) === name;
  const visit = (node) => {
    if (found) return;
    if (isNamed(node, 'code')) {
      const sourceObj = node.parent; // ObjectLiteralExpression
      const sourceProp = sourceObj?.parent; // PropertyAssignment 'source'
      if (sourceProp && isNamed(sourceProp, 'source')) {
        const docsObj = sourceProp.parent;
        const docsProp = docsObj?.parent;
        if (docsProp && isNamed(docsProp, 'docs')) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Every LITERAL `argTypes` property whose key matches /^on[A-Z]/, with
 *  whether it carries `table: { category: 'Events' }` verbatim. Spread
 *  entries (`...argTypesFor(...)`) carry no static key and are skipped. */
function findEventArgTypes(sf) {
  const findings = [];
  const hasEventsCategory = (initializer) => {
    if (!initializer || !ts.isObjectLiteralExpression(initializer)) return false;
    for (const prop of initializer.properties) {
      if (!ts.isPropertyAssignment(prop) || propName(prop) !== 'table') continue;
      if (!ts.isObjectLiteralExpression(prop.initializer)) continue;
      for (const inner of prop.initializer.properties) {
        if (
          ts.isPropertyAssignment(inner) &&
          propName(inner) === 'category' &&
          ts.isStringLiteral(inner.initializer) &&
          inner.initializer.text === 'Events'
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && propName(node) === 'argTypes' && ts.isObjectLiteralExpression(node.initializer)) {
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue; // skip spreads
        const name = propName(prop);
        if (!name || !/^on[A-Z]/.test(name)) continue;
        const initializer = ts.isPropertyAssignment(prop) ? prop.initializer : undefined;
        const line = sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line + 1;
        if (!hasEventsCategory(initializer)) {
          findings.push({ key: name, line });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

function analyzeFile(path, text) {
  const sf = parse(path, text);
  const findings = { renderWithoutDocs: false, eventArgTypes: [] };
  if (hasRenderStory(sf) && !hasDocsSourceCode(sf)) findings.renderWithoutDocs = true;
  findings.eventArgTypes = findEventArgTypes(sf);
  return findings;
}

// ---------------------------------------------------------------------------
// self-test: proves the analyzer still DETECTS both defect shapes, and lets
// the compliant/waived forms through.
// ---------------------------------------------------------------------------
const SELF_TEST_CASES = [
  {
    name: '(a) a render: story with no docs.source.code is flagged (the view-stack/pane-group shape)',
    code: `export const Playground = { render: () => <Widget /> };`,
    expectRenderFlag: true,
  },
  {
    name: '(a) a render: story WITH inline parameters.docs.source.code is clean',
    code: `export const Playground = {
      render: () => <Widget />,
      parameters: { docs: { source: { code: '<kai-widget />', language: 'html' } } },
    };`,
    expectRenderFlag: false,
  },
  {
    name: "(a) a render: story documented via the local src() helper is clean",
    code: `const src = (code: string) => ({ parameters: { docs: { source: { code, language: 'tsx' } } } });
    export const Playground = { render: () => <Widget />, ...src('<Widget />') };`,
    expectRenderFlag: false,
  },
  {
    name: '(a) a file with no render: story at all is not flagged for (a)',
    code: `export const Playground = { args: { label: 'hi' } };`,
    expectRenderFlag: false,
  },
  {
    name: '(a) render: Widget (identifier form) still counts as a render story',
    code: `function Widget() { return null; }
    export const Playground = { render: Widget };`,
    expectRenderFlag: true,
  },
  {
    name: '(a) a SHARED render: on `const meta = {...}` is the args-driven wrapper, not policed (the chat-thread.stories.tsx shape)',
    code: `const meta = {
      title: 'X',
      render: (args) => <X {...args} />,
    } satisfies Meta<typeof X>;
    export default meta;
    export const Default = { args: { label: 'hi' } };`,
    expectRenderFlag: false,
  },
  {
    name: "(b) an onX argType with no table.category is flagged",
    code: `const meta = { argTypes: { onSubmit: { action: 'submit' } } };`,
    expectEventKeys: ['onSubmit'],
  },
  {
    name: "(b) an onX argType WITH table.category: 'Events' is clean",
    code: `const meta = { argTypes: { onSubmit: { action: 'submit', table: { category: 'Events' } } } };`,
    expectEventKeys: [],
  },
  {
    name: "(b) table.category set to something other than 'Events' still fires",
    code: `const meta = { argTypes: { onSubmit: { table: { category: 'Props' } } } };`,
    expectEventKeys: ['onSubmit'],
  },
  {
    name: '(b) a non-event key (does not match /^on[A-Z]/) is never flagged',
    code: `const meta = { argTypes: { online: { control: 'boolean' } } };`,
    expectEventKeys: [],
  },
  {
    name: '(b) a spread entry has no static key and is skipped',
    code: `const meta = { argTypes: { ...argTypesFor('kai-x'), onSubmit: { table: { category: 'Events' } } } };`,
    expectEventKeys: [],
  },
  {
    name: '(b) two offending keys in one argTypes are both reported',
    code: `const meta = { argTypes: { onSubmit: {}, onCancel: { table: {} } } };`,
    expectEventKeys: ['onSubmit', 'onCancel'],
  },
];

function runSelfTest() {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const sf = parse('selftest.tsx', c.code);
    let ok = true;
    const notes = [];
    if ('expectRenderFlag' in c) {
      const got = hasRenderStory(sf) && !hasDocsSourceCode(sf);
      if (got !== c.expectRenderFlag) {
        ok = false;
        notes.push(`render-flag: expected ${c.expectRenderFlag}, got ${got}`);
      }
    }
    if ('expectEventKeys' in c) {
      const got = findEventArgTypes(sf).map((f) => f.key);
      const same = got.length === c.expectEventKeys.length && got.every((k, i) => k === c.expectEventKeys[i]);
      if (!same) {
        ok = false;
        notes.push(`event-keys: expected [${c.expectEventKeys.join(', ')}], got [${got.join(', ')}]`);
      }
    }
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${c.name}${notes.length ? `  (${notes.join('; ')})` : ''}`);
  }
  if (failed > 0) {
    console.error(`\n✗ lint-story-conventions self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(`\n✓ lint-story-conventions self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`);
  process.exit(0);
}

if (SELF_TEST) runSelfTest();

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(full, out);
    } else if (e.isFile() && e.name.endsWith('.stories.tsx')) {
      out.push(full);
    }
  }
  return out;
}

if (!existsSync(SRC_DIR)) {
  console.error(`✗ lint-story-conventions: ${SRC_DIR} not found. This script is misrooted.`);
  process.exit(1);
}
const files = walk(SRC_DIR, []).sort();
if (files.length === 0) {
  console.error(
    `✗ lint-story-conventions: walked ${relative(PKG_ROOT, SRC_DIR)} and found NO .stories.tsx file.\n` +
      `  That is this script being broken, not the tree being clean.`,
  );
  process.exit(1);
}

const renderOffenders = [];
const eventOffenders = [];
for (const path of files) {
  const rel = relative(PKG_ROOT, path);
  const text = readFileSync(path, 'utf8');
  const { renderWithoutDocs, eventArgTypes } = analyzeFile(path, text);
  if (renderWithoutDocs) renderOffenders.push(rel);
  for (const f of eventArgTypes) eventOffenders.push({ file: rel, ...f });
}

const total = renderOffenders.length + eventOffenders.length;
if (total === 0) {
  console.log(
    `✓ lint-story-conventions: scanned ${files.length} .stories.tsx file(s); every render: story documents ` +
      `docs.source.code and every onX argType carries table.category 'Events'.`,
  );
  process.exit(0);
}

console.error(`✗ lint-story-conventions: ${total} finding(s) across ${files.length} scanned .stories.tsx file(s).\n`);

if (renderOffenders.length > 0) {
  console.error(`  (a) ${renderOffenders.length} file(s) ship a \`render:\` story with no docs.source.code usage snippet:`);
  for (const f of renderOffenders) console.error(`    ${f}`);
  console.error(
    `    Add a usage snippet: parameters.docs.source.code (inline), or the local\n` +
      `    const src = (code) => ({ parameters: { docs: { source: { code, language: ... } } } }) helper.\n`,
  );
}

if (eventOffenders.length > 0) {
  console.error(`  (b) ${eventOffenders.length} argType key(s) matching /^on[A-Z]/ with no table.category 'Events':`);
  for (const f of eventOffenders) console.error(`    ${f.file}:${f.line}  ${f.key}`);
  console.error(`    Add table: { category: 'Events' } to each of these argTypes entries.\n`);
}

process.exit(1);
