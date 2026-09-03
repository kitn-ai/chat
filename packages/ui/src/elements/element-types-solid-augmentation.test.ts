/**
 * The SOLID JSX augmentation, and the reason it exists.
 *
 * `solid-js`'s `JSX.IntrinsicElements` is closed: it extends HTMLElementTags,
 * HTMLElementDeprecatedTags, SVGElementTags and MathMLElementTags and carries
 * no index signature, so a `<kai-dock>` in a Solid TSX file is TS2339 before
 * anything else about the solid delivery form matters.
 *
 * A note on this file's own name: a test filename containing the substring
 * `solid-js` is externalized by vite-plugin-solid's `server.deps.external`
 * regex and never transformed by vite-node, which is why this file is named
 * `element-types-solid-augmentation.test.ts` and not `solid-jsx-augmentation.test.ts`.
 *
 * TWO THINGS ARE PINNED HERE and neither is stylistic.
 *
 * 1. THE AUGMENTATION TARGET IS `solid-js/jsx-runtime`, not `solid-js`.
 *    `solid-js`'s index re-exports JSX as a TYPE; `solid-js/jsx-runtime`'s
 *    `types` condition points at the file that DECLARES `export namespace JSX`,
 *    which is what a module augmentation has to name to merge.
 *
 * 2. EVERY REGISTERED TAG IS IN IT. The list is generated from the same
 *    element model the React and Vue blocks use, so a new element joins all
 *    three at once; this asserts the three lists have the same length rather
 *    than re-deriving a fourth.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, 'element-types.d.ts'), 'utf8');

const tagsIn = (block: string): string[] =>
  [...block.matchAll(/'(kai-[\w-]+)'\s*:/g)].map((m) => m[1]);

/** The body of a `declare module '<name>' { ... }` block, to its closing brace. */
function moduleBlock(name: string): string {
  const start = SOURCE.indexOf(`declare module '${name}' {`);
  expect(start, `no \`declare module '${name}'\` block in element-types.d.ts`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = SOURCE.indexOf('{', start); i < SOURCE.length; i += 1) {
    if (SOURCE[i] === '{') depth += 1;
    if (SOURCE[i] === '}') {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated \`declare module '${name}'\` block`);
}

/** The body of the given `header` (e.g. `declare module 'react'` or `declare
 *  global`), to its closing brace -- same brace-depth walk as `moduleBlock`,
 *  generalized past the `declare module '<name>'` shape for `declare global`,
 *  which is where `HTMLElementTagNameMap` (the tag-to-className source of
 *  truth) lives. */
function blockAfter(header: string): string {
  const start = SOURCE.indexOf(`${header} {`);
  expect(start, `no \`${header}\` block in element-types.d.ts`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = SOURCE.indexOf('{', start); i < SOURCE.length; i += 1) {
    if (SOURCE[i] === '{') depth += 1;
    if (SOURCE[i] === '}') {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated \`${header}\` block`);
}

describe('the solid JSX augmentation', () => {
  it('targets solid-js/jsx-runtime, which is the module that declares the namespace', () => {
    // `declare module 'solid-js'` would create a NEW namespace rather than
    // merging into the one `types/jsx.d.ts` exports, and every standard tag
    // would stop resolving. Verified by compiling both shapes.
    expect(SOURCE).toContain("declare module 'solid-js/jsx-runtime' {");
    expect(SOURCE).not.toContain("declare module 'solid-js' {");
  });

  it('carries every tag the react and vue augmentations carry', () => {
    const solid = tagsIn(moduleBlock('solid-js/jsx-runtime'));
    const react = tagsIn(moduleBlock('react'));
    expect(solid.length).toBeGreaterThan(0);
    expect(solid).toEqual(react);
  });

  it('is generic, and says out loud that it is', () => {
    // A per-element version needs an Events type keyed by the RAW event name
    // (`on:kai-click`), and the generator emits only the camel-cased
    // `onKaiClick` shape. Until it does, the solid compile cell cannot type a
    // kai prop value and the gate output says so.
    expect(SOURCE).toContain('interface KaiElementSolidProps');
    const solid = moduleBlock('solid-js/jsx-runtime');
    expect(solid).toContain('KaiElementSolidProps');
  });

  it('is generic on the ELEMENT TYPE, extending JSX.HTMLAttributes<T>', () => {
    // Under a hand-rolled prop list, a fixed `HTMLElement`, or the index
    // signature alone, an unannotated `ref={(el) => ...}` or `onClick={(e) =>
    // ...}` is TS7006 (no contextual type to infer the callback's parameter
    // from) -- and worse, a FIXED `HTMLElement` makes an explicitly annotated
    // `ref={(el: KaiDockElement) => ...}` a TS2322 (a narrower callback is not
    // assignable to a wider one, under strictFunctionTypes). Parameterizing on
    // T fixes both: `ref` (via Solid's own `CustomAttributes<T>`, which
    // `HTMLAttributes<T>` extends) infers the REAL element interface at each
    // tag's own instantiation, unannotated or annotated.
    const solid = moduleBlock('solid-js/jsx-runtime');
    expect(solid).toContain(
      'interface KaiElementSolidProps<T extends HTMLElement = HTMLElement> extends SolidHtmlAttributes<T>',
    );
  });

  it('reaches HTMLAttributes through an import type, not the bare name', () => {
    // A module augmentation merges with the real module only when that module
    // is in the program; otherwise tsc reads the block as a fresh ambient
    // declaration, `JSX` means the tiny namespace declared inside it, and the
    // bare `JSX.HTMLAttributes` is TS2694 under `skipLibCheck: false`. The
    // shipped dist/elements.d.ts imports nothing (self-contained by design),
    // and neither does a react or vue consumer's program, so the import type
    // is what pulls solid's types/jsx.d.ts in and makes the merge happen.
    // tests/elements/element-types-lib-check.test.ts compiles both copies and
    // is what catches a regression here; this pins the mechanism by name so it
    // is not "tidied" back to the bare reference.
    const solid = moduleBlock('solid-js/jsx-runtime');
    expect(solid).toContain(
      "type SolidHtmlAttributes<T extends HTMLElement> = import('solid-js/jsx-runtime').JSX.HTMLAttributes<T>;",
    );
    expect(solid).not.toContain('extends JSX.HTMLAttributes<');
  });

  it('gives every tag its OWN element interface, not the generic HTMLElement default', () => {
    // Derived from the SAME `HTMLElementTagNameMap` augmentation this file
    // already carries (element-types.d.ts's tag-to-interface source of
    // truth), not re-typed here -- so a new element's className is covered
    // automatically, and a generator regression that left one tag on the
    // generic `KaiElementSolidProps` default (instead of its own
    // `KaiXElement`) fails this test without anyone updating a count.
    const tagNameMapBody = blockAfter('declare global');
    const tagToClassName = new Map(
      [...tagNameMapBody.matchAll(/'(kai-[\w-]+)':\s*(Kai\w+Element);/g)].map((m) => [m[1], m[2]]),
    );
    expect(tagToClassName.size).toBeGreaterThan(0);
    const solid = moduleBlock('solid-js/jsx-runtime');
    for (const [tag, className] of tagToClassName) {
      expect(solid, `${tag} should map to KaiElementSolidProps<${className}>`).toContain(
        `'${tag}': KaiElementSolidProps<${className}>;`,
      );
    }
  });

  it('is generated, not hand-written', () => {
    expect(SOURCE.startsWith('// AUTO-GENERATED by scripts/gen-element-api.mjs')).toBe(true);
  });
});
