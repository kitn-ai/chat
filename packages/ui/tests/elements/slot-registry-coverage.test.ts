/**
 * GUARD — a `<slot>` a facade renders must be documented in the slots registry.
 *
 * `src/elements/slots.ts` is hand-maintained and is the ONLY source the generators
 * read, so a slot added to a facade and not to the registry is invisible
 * everywhere it matters: element-meta.json, the docs tables, llms-full.txt, and
 * dist/custom-elements.json — the file the `kai` MCP serves to coding agents. It
 * had drifted: `<kai-empty>`'s `media` and `<kai-popover>`'s `trigger` were live
 * named slots documented nowhere, and 20 elements projected light-DOM children
 * through a default `<slot />` that no artifact mentioned.
 *
 * SCOPE, deliberately narrow. This walks a facade file and the ELEMENT-LOCAL
 * helper modules it imports (`./default-input`, where `<kai-prompt-input>` builds
 * its composer). It does NOT follow into ../components/ — `<kai-chat>`'s slots are
 * declared in components/chat-thread.tsx, which `<kai-workspace>` also renders, and
 * asserting a slot is reachable through a second element's shadow root without
 * having verified that it is would be a check pretending to know something. Those
 * registry entries are simply left unasserted here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { ELEMENT_COMPOSITION } from '../../src/elements/slots';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const elementsDir = resolve(pkgRoot, 'src/elements');

interface FacadeSlots {
  /** Tags this file registers. */
  tags: string[];
  /** Literal `<slot name="…">` names rendered by the file or its local helpers. */
  named: Set<string>;
  /** Whether a bare `<slot />` (the default slot) is rendered. */
  hasDefault: boolean;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
}

function collect(file: string, acc: FacadeSlots, seen: Set<string>, isRoot: boolean) {
  if (seen.has(file)) return;
  seen.add(file);
  const sf = parse(file);
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'defineWebComponent') {
      const a = n.arguments[0];
      if (a && ts.isStringLiteralLike(a) && isRoot) acc.tags.push(a.text);
    }
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText() === 'slot') {
      const attr = n.attributes.properties.find(
        (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === 'name',
      );
      if (!attr) acc.hasDefault = true;
      else {
        const init = attr.initializer;
        // Only LITERAL names are checkable; `<slot name={region} />` is resolved by
        // the facade's own SlotName union, whose members the registry already lists.
        if (init && ts.isStringLiteral(init)) acc.named.add(init.text);
        else if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) {
          acc.named.add(init.expression.text);
        }
      }
    }
    // Follow element-local helper modules (`./default-input`), never another facade.
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text;
      if (spec.startsWith('./') && !n.importClause?.isTypeOnly) {
        for (const ext of ['.tsx', '.ts']) {
          const target = resolve(dirname(file), spec + ext);
          if (!existsSync(target)) continue;
          if (/defineWebComponent\s*</.test(readFileSync(target, 'utf8'))) break; // a facade of its own
          collect(target, acc, seen, false);
          break;
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const SKIP = new Set(['define.tsx', 'register.ts', 'register-impl.ts', 'css.ts', 'chat-types.ts']);
const facades = readdirSync(elementsDir)
  .filter((f) => /\.tsx?$/.test(f) && !/\.(stories|test)\.tsx?$/.test(f) && !SKIP.has(f))
  .map((f) => resolve(elementsDir, f))
  .map((file) => {
    const acc: FacadeSlots = { tags: [], named: new Set(), hasDefault: false };
    collect(file, acc, new Set(), true);
    return { file, ...acc };
  })
  .filter((f) => f.tags.length > 0);

const registered = (tag: string) => {
  const comp = ELEMENT_COMPOSITION[tag];
  return {
    named: new Set((comp?.slots ?? []).map((s) => s.name)),
    children: comp?.children,
  };
};

describe('slots.ts covers what the facades actually render', () => {
  it('sees a meaningful number of facades (the rule is not vacuous)', () => {
    expect(facades.length).toBeGreaterThan(60);
    expect(facades.some((f) => f.named.size > 0)).toBe(true);
    expect(facades.some((f) => f.hasDefault)).toBe(true);
  });

  it('every literal named <slot> is registered for its element', () => {
    const missing: string[] = [];
    for (const f of facades) {
      for (const name of f.named) {
        if (!f.tags.some((t) => registered(t).named.has(name))) {
          missing.push(`${f.tags.join('/')}: slot name="${name}" (${f.file.replace(`${pkgRoot}/`, '')})`);
        }
      }
    }
    expect(missing.sort()).toEqual([]);
  });

  it('every element with a default <slot /> documents what goes in it', () => {
    const missing = facades
      .filter((f) => f.hasDefault && !f.tags.some((t) => registered(t).children))
      .flatMap((f) => f.tags)
      .sort();
    expect(missing).toEqual([]);
  });
});
