// @vitest-environment node
//
// Regression guard: a raw `<kai-chat>` (or any other kai-*) written directly in
// TSX, bypassing the @kitn.ai/ui/react wrappers, is documented usage (see
// apps/docs/.../guides/frameworks/react.mdx, "Raw web component usage"), but
// without a JSX.IntrinsicElements augmentation it fails with "Property 'kai-chat'
// does not exist on type 'JSX.IntrinsicElements'" — a consumer-regression finding.
//
// The fix lives in scripts/gen-element-types.mjs's writeTypes(), which appends a
// `declare module 'react' { namespace JSX { interface IntrinsicElements {...} } }`
// block to BOTH the tracked src/elements/element-types.d.ts and the shipped
// dist/elements.d.ts, generated from the same `elements` registry as the
// HTMLElementTagNameMap block above it (no hand-copied tag list).
//
// This test reads the TRACKED, checked-in src/elements/element-types.d.ts (no
// build required) and asserts every real element tag got an entry, and that the
// block never references a bare React-only identifier (HTMLAttributes,
// DetailedHTMLProps, ...) — doing so would break every non-React consumer, since
// this file loads for every framework via `import '@kitn.ai/ui/elements'`.
// Verified manually against real fresh apps (see the PR description): the
// augmentation merges cleanly when 'react' IS installed, and is a silent no-op
// when it is not.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function readElementTypes(): string {
  return readFileSync(resolve(HERE, 'element-types.d.ts'), 'utf8');
}

/** The `declare module 'react' { ... }` block ALONE.
 *
 * Bounded at the NEXT `declare module` line, not at end-of-file. The file also
 * carries a `declare module 'solid-js/jsx-runtime'` augmentation after this one,
 * and that block legitimately names Solid's own `HTMLAttributes` (through an
 * import type). An unbounded slice ran the react-only-identifier assertion below
 * over that block too and flagged it, which is a false positive: the identifiers
 * this guard forbids are forbidden because @types/react may be absent, and say
 * nothing about solid-js, a hard dependency of this package.
 */
function reactBlock(src: string): string {
  const start = src.indexOf(`declare module 'react'`);
  expect(start, "no `declare module 'react'` block found").toBeGreaterThan(-1);
  const next = src.indexOf('declare module ', start + 1);
  return next === -1 ? src.slice(start) : src.slice(start, next);
}

function readElementTags(): string[] {
  const meta = JSON.parse(readFileSync(resolve(HERE, 'element-meta.json'), 'utf8')) as { tag: string }[];
  return meta.map((el) => el.tag);
}

describe('JSX.IntrinsicElements augmentation for kai-* tags', () => {
  it('augments react JSX.IntrinsicElements, not just HTMLElementTagNameMap', () => {
    const src = readElementTypes();
    expect(src).toContain(`declare module 'react'`);
    expect(src).toContain('interface IntrinsicElements');
  });

  it('every registered element tag has an IntrinsicElements entry', () => {
    const src = readElementTypes();
    const tags = readElementTags();
    expect(tags.length).toBeGreaterThan(0);

    const block = reactBlock(src);
    for (const tag of tags) {
      expect(block, `missing IntrinsicElements entry for ${tag}`).toContain(`'${tag}':`);
    }
  });

  it('does not reference a bare react-only identifier (safe for non-React consumers)', () => {
    // This file loads for EVERY framework via `import '@kitn.ai/ui/elements'`, so
    // it must not assume 'react'/@types/react is installed. Referencing an
    // identifier that only exists inside the real 'react' module (rather than a
    // fully-qualified `import('react').Foo` or a locally-declared type) breaks
    // tsc for consumers who don't have react installed at all.
    const src = readElementTypes();
    const block = reactBlock(src);
    for (const forbidden of ['HTMLAttributes', 'DetailedHTMLProps', 'ReactNode', 'React.']) {
      expect(block, `references react-only identifier "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('the shared JSX props type is declared locally, not imported', () => {
    // The augmentation must not add a relative import (that would drag library
    // source into a consumer's type graph, same LIB-2 class of bug the
    // dist/elements.d.ts self-containment comment already guards against).
    const src = readElementTypes();
    const propsTypeMatch = src.match(/interface (KaiElementJsxProps) \{/);
    expect(propsTypeMatch, 'no local KaiElementJsxProps interface found').toBeTruthy();
  });
});
