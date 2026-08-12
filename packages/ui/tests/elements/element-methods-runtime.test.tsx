/**
 * GUARD — the other direction of `element-methods-typed.test.ts`.
 *
 * That file pins that every exposed method is CALLABLE through the generated
 * types. This one pins that the types are not lying: a method the declarations
 * promise must actually exist on a mounted element at runtime. Types and model
 * are both generated from the same `expose({ … })` walk, so a mis-read of the
 * source (a renamed helper, a method moved out of the facade callback, an
 * `expose` call the extractor stops recognizing) would otherwise ship a
 * `.d.ts` advertising methods that are not there — which is worse than the
 * missing-methods bug it replaced, because it type-checks.
 *
 * Derived from element-meta.json, not a hand-kept list.
 */
import '../../src/elements/register-impl';
import '../../src/elements/register';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// This file mounts EVERY element that exposes a method, so it collects every jsdom
// gap the individual element suites stub one at a time: the stick-to-bottom
// primitive calls `scrollTo` from a rAF (kai-chat / kai-thread / kai-workspace) and
// the disclosures measure with a ResizeObserver (kai-reasoning). Both land as
// UNCAUGHT exceptions, after the element is gone. Same no-op stubs the component
// suites already use — nothing here asserts scroll position or height.
const proto = Element.prototype as unknown as Record<string, unknown>;
proto.scrollTo ??= () => {};
proto.scrollIntoView ??= () => {};
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const meta: { tag: string; methods?: { name: string }[] }[] = JSON.parse(
  readFileSync(resolve(pkgRoot, 'src/elements/element-meta.json'), 'utf8'),
);

test('every method the generated types promise exists on the upgraded element', async () => {
  const withMethods = meta.filter((e) => e.methods?.length);
  expect(withMethods.length).toBeGreaterThan(30);

  const missing: string[] = [];
  for (const { tag, methods } of withMethods) {
    await customElements.whenDefined(tag);
    const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
    document.body.append(el);
    // The facade callback runs on mount; give Solid's render a turn to settle.
    await Promise.resolve();
    for (const m of methods!) {
      if (typeof el[m.name] !== 'function') missing.push(`${tag}.${m.name}`);
    }
    el.remove();
  }
  expect(missing).toEqual([]);
});

test('<kai-resizable> maximize/restore survive the move to ctx.expose', async () => {
  // The one element whose methods were assigned straight onto `element` instead
  // of through `expose()` — invisible to the extractor, hence uncallable through
  // the types. Rerouting them must not change the behaviour.
  await customElements.whenDefined('kai-resizable');
  // The cast is a tsconfig.tests.json artifact, NOT the bug: this pass includes
  // `tests/**` but not `src/**`, so the generated HTMLElementTagNameMap
  // augmentation is not in this program and every element here is a bare
  // HTMLElement. (Importing element-types.d.ts to fix that lands the augmentation
  // on the WHOLE tests program and breaks four unrelated files' own casts.) The
  // consumer-facing type proof lives in element-methods-typed.test.ts, which
  // compiles the shipped declarations the way a consumer does.
  const group = document.createElement('kai-resizable') as HTMLElement & {
    maximize(index: number): void;
    restore(): void;
  };
  for (let i = 0; i < 3; i++) group.append(document.createElement('kai-resizable-item'));
  document.body.append(group);
  await new Promise((r) => setTimeout(r, 0));

  const seen: { maximized: boolean; index: number | null }[] = [];
  group.addEventListener('kai-maximize-change', (e) => seen.push((e as CustomEvent).detail));

  // Called through the GENERATED type, with no cast — the point of the fix.
  group.maximize(1);
  await new Promise((r) => setTimeout(r, 0));
  expect(group.hasAttribute('data-maximized')).toBe(true);
  expect(seen.at(-1)).toEqual({ maximized: true, index: 1 });

  group.restore();
  await new Promise((r) => setTimeout(r, 0));
  expect(group.hasAttribute('data-maximized')).toBe(false);
  expect(seen.at(-1)).toEqual({ maximized: false, index: null });

  group.remove();
});
