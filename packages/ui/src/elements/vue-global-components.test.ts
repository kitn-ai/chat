// @vitest-environment node
//
// Regression guard: Vue resolves a template tag against `GlobalComponents` FIRST
// and only then falls through to @vue/runtime-dom's JSX IntrinsicElements, which
// carries a `[name: string]: any` index signature. So an unregistered `<kai-chat>`
// types as `any` and vue-tsc checks NOTHING — a consumer-regression round proved a
// `boolean`-prop-bound-to-`string` positive control compiling with ZERO errors,
// and the removed 0.19 `ChatMessage.content` shape passing straight through to the
// runtime messages guard, which drops it. React consumers got a real error for the
// same mistake (see jsx-intrinsic-elements.test.ts); Vue consumers got nothing.
//
// The fix lives in scripts/gen-element-types.mjs's writeTypes(), which appends a
// `declare module 'vue' { interface GlobalComponents {...} }` block plus one
// props + one events interface per element to BOTH the tracked
// src/elements/element-types.d.ts and the shipped dist/elements.d.ts, generated
// from the same `elements` registry as every other block (no hand-copied tag list).
//
// This test reads the TRACKED, checked-in src/elements/element-types.d.ts (no
// build required). It cannot type-check Vue templates — that needs vue-tsc against
// a real install, which is how the shape was established. What it CAN do is fail
// when the generated surface drifts from the element registry.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function readElementTypes(): string {
  return readFileSync(resolve(HERE, 'element-types.d.ts'), 'utf8');
}

interface ElementMeta {
  tag: string;
  className: string;
  props: { name: string }[];
  events: { name: string }[];
}

function readElements(): ElementMeta[] {
  return JSON.parse(readFileSync(resolve(HERE, 'element-meta.json'), 'utf8')) as ElementMeta[];
}

const pascal = (s: string) =>
  s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

function vueBlock(src: string): string {
  const i = src.indexOf(`declare module 'vue'`);
  expect(i, `no "declare module 'vue'" block in element-types.d.ts`).toBeGreaterThan(-1);
  return src.slice(i);
}

describe('Vue GlobalComponents augmentation for kai-* tags', () => {
  it('augments vue GlobalComponents, not just HTMLElementTagNameMap', () => {
    const src = readElementTypes();
    expect(src).toContain(`declare module 'vue'`);
    expect(src).toContain('interface GlobalComponents');
  });

  it('every registered element tag has an entry under BOTH lookup keys', () => {
    // Volar resolves the tag under its raw kebab name or its PascalCase form
    // depending on `vueCompilerOptions.strictTemplates`, so both must be present.
    // Measured: with strictTemplates on, vue-tsc reports a MISSING entry as
    // "Property 'KaiChat' does not exist on type '{}'" — the PascalCase key.
    const src = readElementTypes();
    const block = vueBlock(src);
    const elements = readElements();
    expect(elements.length).toBeGreaterThan(0);

    for (const el of elements) {
      expect(block, `missing kebab GlobalComponents entry for ${el.tag}`).toContain(`'${el.tag}':`);
      expect(block, `missing PascalCase GlobalComponents entry for ${el.tag}`).toMatch(
        new RegExp(`\\n    ${pascal(el.tag)}:`),
      );
    }
  });

  it('every element has a props interface carrying all of its props', () => {
    // The props interfaces are generated from the SAME propBody() as the
    // HTMLElement interfaces. They exist separately (rather than being derived
    // with `Omit<KaiXElement, keyof HTMLElement>`) because Omit silently STRIPS
    // any prop whose name collides with an HTMLElement member — measured: it drops
    // kai-message's `role`, kai-resizable-item's `hidden` and kai-confirm's
    // `autofocus`, so bad values for those three sail through unchecked.
    const src = readElementTypes();
    for (const el of readElements()) {
      const start = src.indexOf(`export interface ${el.className}Props {`);
      expect(start, `no props interface for ${el.tag}`).toBeGreaterThan(-1);
      const body = src.slice(start, src.indexOf('\n}', start));
      expect(body, `${el.className}Props is missing "theme"`).toContain('\n  theme?:');
      for (const p of el.props) {
        expect(body, `${el.className}Props is missing prop "${p.name}"`).toMatch(
          new RegExp(`\\n  ${p.name}\\??:`),
        );
      }
    }
  });

  it('the collision-prone props survive into the Vue props interfaces', () => {
    // Explicit pin for the three props an Omit-based derivation would erase.
    const src = readElementTypes();
    const cases: [string, string][] = [
      ['KaiMessageElementProps', 'role'],
      ['KaiResizableItemElementProps', 'hidden'],
      ['KaiConfirmElementProps', 'autofocus'],
    ];
    for (const [iface, prop] of cases) {
      const start = src.indexOf(`export interface ${iface} {`);
      expect(start, `no ${iface}`).toBeGreaterThan(-1);
      const body = src.slice(start, src.indexOf('\n}', start));
      expect(body, `${iface} lost the HTMLElement-colliding prop "${prop}"`).toMatch(
        new RegExp(`\\n  ${prop}\\??:`),
      );
    }
  });

  it('every element has an events interface using Volar handler keys', () => {
    // Measured against vue-tsc: `@kai-submit` binds the prop `onKaiSubmit` —
    // camelized with the `kai-` prefix KEPT. (The React wrappers strip it and use
    // `onSubmit`, so the two transforms must not be conflated.)
    const src = readElementTypes();
    for (const el of readElements()) {
      const start = src.indexOf(`export interface ${el.className}Events {`);
      expect(start, `no events interface for ${el.tag}`).toBeGreaterThan(-1);
      const body = src.slice(start, src.indexOf('\n}', start));
      for (const e of el.events) {
        expect(body, `${el.className}Events is missing handler for "${e.name}"`).toContain(
          `\n  on${pascal(e.name)}?: (event: CustomEvent`,
        );
      }
    }
  });

  it('does not reference a bare vue-only identifier (safe for non-Vue consumers)', () => {
    // element-types.d.ts loads for EVERY framework via `import '@kitn.ai/ui/elements'`,
    // so the block must not assume 'vue' is installed. Verified against a real
    // consumer app with NEITHER vue nor react installed: with skipLibCheck both on
    // and off, the augmentation adds zero errors.
    const block = vueBlock(readElementTypes());
    for (const forbidden of ['DefineComponent', 'ComponentCustomProps', 'VNode', 'Vue.']) {
      expect(block, `references vue-only identifier "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('the shared Vue prop types are declared locally, not imported', () => {
    // No relative import may appear: that would drag library source into a
    // consumer's type graph (the LIB-2 class of bug dist/elements.d.ts's
    // self-containment comment already guards against).
    const src = readElementTypes();
    expect(src).toContain('export interface KaiElementVueProps {');
    expect(src).toContain('export type KaiVueElement<Props, Events>');
  });
});
