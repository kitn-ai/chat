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

    const reactBlock = src.slice(src.indexOf(`declare module 'react'`));
    for (const tag of tags) {
      expect(reactBlock, `missing IntrinsicElements entry for ${tag}`).toContain(`'${tag}':`);
    }
  });

  it('does not reference a bare react-only identifier (safe for non-React consumers)', () => {
    // This file loads for EVERY framework via `import '@kitn.ai/ui/elements'`, so
    // it must not assume 'react'/@types/react is installed. Referencing an
    // identifier that only exists inside the real 'react' module (rather than a
    // fully-qualified `import('react').Foo` or a locally-declared type) breaks
    // tsc for consumers who don't have react installed at all.
    const src = readElementTypes();
    const reactBlock = src.slice(src.indexOf(`declare module 'react'`));
    for (const forbidden of ['HTMLAttributes', 'DetailedHTMLProps', 'ReactNode', 'React.']) {
      expect(reactBlock, `references react-only identifier "${forbidden}"`).not.toContain(forbidden);
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
