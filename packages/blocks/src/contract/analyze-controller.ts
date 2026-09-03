/**
 * The controller's DECLARED shape (spec 3.2), read off the source.
 *
 * WHY NOT A REAL PARSER. `packages/blocks` cannot depend on `typescript`
 * (create-kai bundles this source into its CLI and `bundleGraphProblem`
 * grades that bundle) and cannot depend on `esbuild` for the same reason --
 * and esbuild could not answer this question anyway: it reports RUNTIME
 * exports, and every name here except `createController` is a TYPE, erased
 * before a metafile exists.
 *
 * So this reads only what the CONTRACT FIXES: three interfaces named after
 * the block, and one exported factory. Fixing those names is what makes the
 * react adapter generatable at all, so a wrong name is an error that says
 * which identifier it wanted.
 *
 * ANTI-VACUITY IS THE POINT. An empty result is a HARD ERROR, never a quiet
 * empty list: the html form has no typecheck behind it, so this is the only
 * thing standing between a typo and `actions.bck is not a function` at
 * runtime. For the react form tsc is the backstop and this is the early,
 * legible failure.
 */
import type { ControllerShape } from './types';

/** Strip line and block comments without touching string contents. */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      if (ch === '\\') { out += '  '; i += 2; continue; }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; i += 1; continue; }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      out += '  ';
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      i += 2;
      out += '  ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** The body of `export interface <name> { ... }`, brace-matched, or null. */
function interfaceBody(source: string, name: string): string | null {
  const head = new RegExp(`export\\s+interface\\s+${name}\\s*\\{`).exec(source);
  if (!head) return null;
  let depth = 1;
  let i = head.index + head[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  return source.slice(start, i - 1);
}

/**
 * Member names of an interface body: `name:`, `name?:`, `name(`.
 *
 * P5: a single-line body (`{ boot(): void; send(text: string): void }`) puts
 * every member after the first on the SAME line as the one before it, so a
 * line-anchored match reads only the first member. Tokenize the body on `;`,
 * `,` and newline BEFORE matching, so a single-line or multi-line body reads
 * every member the same way.
 */
function memberNames(body: string): string[] {
  const names: string[] = [];
  for (const token of body.split(/[;,\n]/)) {
    const m = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*[:(]/.exec(token);
    if (m && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

export function analyzeController(
  source: string,
  componentName: string,
  where: string,
): { shape?: ControllerShape; errors: string[] } {
  const errors: string[] = [];
  const code = stripComments(source);

  if (!/export\s+function\s+createController\s*\(/.test(code)) {
    errors.push(`${where}: no \`export function createController(\`. The controller contract (spec 3.2) is one factory returning { state, actions, subscribe }.`);
  }

  const read = (suffix: string, label: string): string[] => {
    const name = `${componentName}${suffix}`;
    const body = interfaceBody(code, name);
    if (body === null) {
      errors.push(`${where}: no \`export interface ${name}\` (or its braces do not close). The generated adapters import that exact name, derived from the block id, so it is fixed by the contract.`);
      return [];
    }
    const members = memberNames(body);
    if (members.length === 0) {
      errors.push(`${where}: \`${name}\` declares no ${label}. An empty ${label} block is a hard error, not an empty result: nothing downstream can tell it apart from a shape this analyzer failed to read.`);
    }
    return members;
  };

  const stateFields = read('State', 'state');
  const actionNames = read('Actions', 'actions');
  const refNames = read('Refs', 'refs');

  if (errors.length) return { errors };
  return { shape: { name: componentName, stateFields, actionNames, refNames }, errors: [] };
}
