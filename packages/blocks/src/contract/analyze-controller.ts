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
import type { ControllerShape, ParsedTemplate } from './types';
import { walkElements } from './parse-template';

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
 * Split an interface body into member tokens at `;`, `,` and newline, but
 * ONLY when the separator sits at bracket depth zero.
 *
 * P5: a single-line body (`{ boot(): void; send(text: string): void }`) puts
 * every member after the first on the SAME line as the one before it, so a
 * line-anchored match reads only the first member -- fixed by tokenizing on
 * `;`/`,`/newline. But a naive split on those characters ALSO cuts inside a
 * parameter list: `send(text: string, opts: { silent: boolean }): void`
 * would split at the `,` between parameters and again inside the object
 * type, leaking `opts` as if it were its own member. So depth is tracked
 * across `(`, `{`, `[` and `<` and a separator only ends a token at depth
 * zero; a multi-line signature whose parameter list spans lines is the same
 * case (the newline sits at depth > 0) and is handled the same way.
 *
 * `<>` depth is tracked for generic type arguments (`Promise<void>`,
 * `Map<string, number>`) well enough for a parameter list or object type --
 * it is not a real parser and does not need to disambiguate `<` as
 * less-than, which cannot occur in this position in a type annotation.
 *
 * ONE EXCEPTION: an arrow-typed parameter's `=>` (`cb: (a: string) => void`)
 * is NOT a `<`/`>` pair, but its `>` still reads as a lone closer under plain
 * counting and drags depth down early, un-hiding the rest of that parameter
 * list's separators. So a `>` immediately after `=` (ignoring the space
 * between them) is treated as part of an arrow token, not a bracket, and
 * leaves depth untouched.
 */
function splitMembers(body: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  let lastNonSpace = '';
  for (const ch of body) {
    const isArrowClose = ch === '>' && lastNonSpace === '=';
    if (!isArrowClose) {
      if (ch === '(' || ch === '{' || ch === '[' || ch === '<') depth += 1;
      else if (ch === ')' || ch === '}' || ch === ']' || ch === '>') depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && (ch === ';' || ch === ',' || ch === '\n')) {
      tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
    if (ch !== ' ' && ch !== '\t' && ch !== '\n') lastNonSpace = ch;
  }
  tokens.push(current);
  return tokens;
}

/**
 * Member names of an interface body: `name:`, `name?:`, `name(`, or
 * `name<` for a generic method (`send<T>(x: T): void`) -- still one member,
 * so the character class accepts `<` alongside `:` and `(`.
 */
function memberNames(body: string): string[] {
  const names: string[] = [];
  for (const token of splitMembers(body)) {
    const m = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*[:(<]/.exec(token);
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

/** The page's `@` and `#ref` bindings against the controller's declared
 *  names. Called by `checkBlockContracts` (the gate) AND by every renderer,
 *  so `create-kai add` and `kai dev` refuse the same page by name instead of
 *  emitting a tree that calls a function nobody exports. */
export function crossCheckBindings(template: ParsedTemplate, shape: ControllerShape, where: string): string[] {
  const errors: string[] = [];
  for (const el of walkElements(template.body)) {
    for (const b of el.bindings) {
      if (b.kind === 'event' && !shape.actionNames.includes(b.value)) {
        errors.push(`${where}:${b.line}: ${b.raw}="${b.value}" names no action. ${shape.name}Actions declares: ${shape.actionNames.join(', ')}.`);
      }
      if (b.kind === 'ref' && !shape.refNames.includes(b.value)) {
        errors.push(`${where}:${b.line}: #ref="${b.value}" is not in ${shape.name}Refs, so the controller can never reach it. ${shape.name}Refs declares: ${shape.refNames.join(', ')}.`);
      }
    }
  }
  return errors;
}
