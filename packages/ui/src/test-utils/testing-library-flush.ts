// V2-PORT test harness shim (wired via a vitest-only alias in vitest.config.ts).
//
// Solid 2 stages ordinary reactive writes and commits them on the next microtask;
// under 1.x, `render()` returned with mount effects applied and a `fireEvent`
// dispatch left the DOM synchronously consistent. Hundreds of assertions in this
// suite were written against that contract. Rather than threading `flush()` through
// every one of them, this shim re-exports @solidjs/testing-library with `render`,
// `cleanup` and `fireEvent` wrapped to `flush()` the reactive queue after they run —
// restoring the 1.x observable contract at the harness boundary, not in the kit.
// A test that needs to observe the STAGED state on purpose imports the real
// library by its dist path the way this file does.
//
// The import below reaches the real package by relative path because the vitest
// alias rewrites the bare specifier for every importer — this file included — and
// the package's exports map refuses deep subpath imports.
// eslint-disable-next-line import/no-relative-packages
import * as tlDist from '../../../../node_modules/@solidjs/testing-library/dist/index.js';
import { flush } from 'solid-js';
// Test/dev hook the signals runtime exports for exactly this: a deliberate
// render-time crash (several suites pin crash-to-diagnostic conversions) HALTS
// the v2 reactive system for the whole worker; reviving it between renders keeps
// one crash test from poisoning every test after it in the file.
import { resetErrorHalt } from '@solidjs/signals';

type TL = typeof import('@solidjs/testing-library');
const tl = tlDist as unknown as TL;

export const screen: TL['screen'] = tl.screen;
export const waitFor: TL['waitFor'] = tl.waitFor;
export const within: TL['within'] = tl.within;

export const render: TL['render'] = ((...args: Parameters<TL['render']>) => {
  resetErrorHalt(); // revive after a previous test's deliberate crash
  const result = tl.render(...args);
  flush();
  return result;
}) as TL['render'];

export const cleanup: TL['cleanup'] = () => {
  resetErrorHalt(); // a crashed root must still be disposable
  tl.cleanup();
  flush();
};

// fireEvent is a callable object with per-event-type methods; wrap both layers.
const wrapFire = (fn: (...a: never[]) => unknown) =>
  ((...args: never[]) => {
    const out = fn(...args);
    flush();
    return out;
  }) as never;

const fireBase = wrapFire(tl.fireEvent as unknown as (...a: never[]) => unknown) as TL['fireEvent'];
for (const key of Object.keys(tl.fireEvent) as (keyof TL['fireEvent'])[]) {
  const method = tl.fireEvent[key];
  if (typeof method === 'function') {
    (fireBase as unknown as Record<string, unknown>)[key as string] = wrapFire(
      method as (...a: never[]) => unknown,
    );
  }
}
export const fireEvent: TL['fireEvent'] = fireBase;
