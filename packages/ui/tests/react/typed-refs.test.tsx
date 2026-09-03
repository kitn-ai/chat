/**
 * F-9 (blocks contract spike): a forwarded ref must hand back the ELEMENT
 * INTERFACE, not a bare HTMLElement. The interfaces exist and ship
 * (dist/elements.d.ts, one Kai*Element per tag, methods included); the wrapper
 * generator simply did not use them, so `#ref` promised a typed handle the
 * react form could not honour and every ref site needed a cast.
 *
 * THE CALLBACK FORM IS THE TEST, AND THAT IS NOT AN AESTHETIC CHOICE.
 * `useRef<KaiViewStackElement>(null)` gives `RefObject<KaiViewStackElement | null>`,
 * and `RefObject`'s `current` is a MUTABLE property, which TypeScript checks
 * covariantly -- so that object IS assignable to `Ref<HTMLElement>` and the
 * object form compiles clean even against the broken wrapper. Measured: it
 * produces no error on main. The hole is only visible where the element flows
 * the OTHER way, into a callback parameter, which is the form the spike's react
 * tree uses at report lines 960 and 986 because that is what `#ref` compiles to.
 * A test written the object way would have passed on both sides of this fix.
 *
 * Both halves are asserted, because each catches what the other misses:
 *   - COMPILE TIME, under `tsc --noEmit -p tsconfig.react.test.json`.
 *   - RUNTIME, under `npm run test:react`, where the ref really receives the
 *     upgraded custom element from the prebuilt bundle.
 */
import { render, cleanup } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, expect, test } from 'vitest';
import { View, ViewStack } from '@kitn.ai/ui/react';
import type { KaiViewStackElement } from '@kitn.ai/ui/elements';

afterEach(cleanup);

// The NEGATIVE half of the same assertion, and it is a type query rather than a
// call for a measured reason: this file's runtime half really executes, so a
// `refs.current.stack?.pop()` written inside the effect throws "pop is not a
// function" under `npm run test:react` -- vitest strips the types and then runs
// the line. As a type query it is checked by tsc and never executed, and it
// still goes red ("Unused '@ts-expect-error' directive") the day the interface
// grows a `pop`, which is the whole point of writing it down.
// @ts-expect-error KaiViewStackElement declares push/back/replace/selectTab/navigate, not pop
type _NoPopOnViewStack = KaiViewStackElement['pop'];

test('a ref CALLBACK receives the element interface, not a bare HTMLElement', () => {
  // A holder object, not `let captured`. A `let` assigned only inside a
  // callback is still narrowed to `null` at the assertion sites by control-flow
  // analysis, and `captured?.tagName` is then TS2339 on `never` -- an error that
  // has nothing to do with what this test is about.
  const seen: { el: KaiViewStackElement | null } = { el: null };

  function Probe() {
    // The spike's shape: a ref bag of typed handles, filled by a callback.
    const refs = useRef<{ stack: KaiViewStackElement | null }>({ stack: null });

    useEffect(() => {
      seen.el = refs.current.stack;
      // A method the generated interface really declares.
      refs.current.stack?.push('chat');
    }, []);

    return (
      <ViewStack
        ref={(el) => {
          // No cast. THIS is the assignment that does not compile against a
          // wrapper typed RefAttributes<HTMLElement>.
          refs.current.stack = el;
        }}
      >
        <View name="home" tabRoot />
        <View name="chat" />
      </ViewStack>
    );
  }

  render(<Probe />);
  expect(seen.el).not.toBeNull();
  expect(seen.el?.tagName.toLowerCase()).toBe('kai-view-stack');
  expect(typeof seen.el?.push).toBe('function');
});

test('the object ref form is typed too (secondary -- it compiles either way)', () => {
  // Kept deliberately, and labelled: this form is what most consumers write,
  // so it should be right -- but it is NOT the red. RefObject's `current` is
  // covariant, so this line compiles against the broken wrapper as well. It is
  // a pin on the useful case, not evidence of the fix.
  function Probe() {
    const stack = useRef<KaiViewStackElement>(null);
    useEffect(() => {
      stack.current?.selectTab('home');
    }, []);
    return <ViewStack ref={stack} />;
  }

  const { container } = render(<Probe />);
  expect(container.querySelector('kai-view-stack')).toBeTruthy();
});
