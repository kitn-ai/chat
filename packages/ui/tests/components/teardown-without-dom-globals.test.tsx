/**
 * A teardown path must never resolve a DOM global.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * `onCleanup(() => document.removeEventListener(...))` reads `document` off the
 * global object at DISPOSE time, not at setup time. Dispose is not guaranteed to
 * run while the page that mounted the component is still standing:
 *
 *   · `component-register`'s `disconnectedCallback` is `async` and starts with
 *     `await Promise.resolve()` — deliberately, so moving a `kai-*` element
 *     around the DOM doesn't destroy its Solid root. The release therefore lands
 *     one microtask AFTER whatever detached the element finished.
 *   · vitest's jsdom environment teardown is `dom.window.close()` (which sets
 *     `document.body.innerHTML = ""`, detaching every element synchronously)
 *     followed IMMEDIATELY, in the same synchronous run, by
 *     `keys.forEach(key => delete global[key])` — `document`, `window`, `self`,
 *     `top` and `parent` all stop existing.
 *
 * So the deferred release runs with the globals already gone, a bare `document`
 * throws `ReferenceError`, and because the throw happens inside an `async`
 * callback whose promise the DOM drops on the floor it surfaces as an UNHANDLED
 * REJECTION: every test passes, and the run still exits 1. That is exactly how it
 * was found, and why it looked nondeterministic — whether the worker process
 * lives long enough to drain that microtask and still have an open channel to
 * report on varies run to run.
 *
 * Consumers hit the same shape without vitest: any host that tears its
 * environment down between disposal and cleanup.
 *
 * THE RULE: capture the node/view at SETUP time and close over it. An object
 * property (`editable.ownerDocument`) or a captured binding (`const win = window`)
 * survives the global going away; a bare identifier does not.
 *
 * Two guards below, because neither covers the other:
 *   1. BEHAVIOURAL — mount each component that registers a global listener, delete
 *      the DOM globals, dispose, and require no throw. Deterministic: `dispose()`
 *      is synchronous, so the ordering that made the original symptom flaky is
 *      removed rather than waited on.
 *   2. STRUCTURAL — scan `src/` for the pattern itself, so a NEW `onCleanup` in a
 *      component nobody thought to add a case for is still caught.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'solid-js/web';
import type { JSX } from 'solid-js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Composer } from '../../src/components/composer';
import { FileUpload } from '../../src/components/file-upload';
import { ToastRegion } from '../../src/components/toast';
import { useDismiss } from '../../src/ui/overlay';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');

// ToastRegion's target-anchored branch observes the target. jsdom has no
// ResizeObserver; same shim the other suites use.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/**
 * Mount `mount`, then reproduce the environment teardown that the original
 * failure happened under — the DOM globals are deleted and the Solid root is
 * disposed afterwards — and hand back whatever dispose threw (or `undefined`).
 *
 * `delete` is safe here: vitest's `populateGlobal` installs every one of these as
 * `configurable: true` precisely so its own teardown can delete them, and nothing
 * runs between the delete and the restore because `dispose()` is synchronous.
 */
function disposeAfterGlobalsVanish(mount: () => JSX.Element): unknown {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const dispose = render(mount, host);

  const saved = (['document', 'window'] as const).map(
    (k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)!] as const,
  );
  for (const [k] of saved) delete (globalThis as Record<string, unknown>)[k];

  try {
    dispose();
    return undefined;
  } catch (err) {
    return err;
  } finally {
    for (const [k, desc] of saved) Object.defineProperty(globalThis, k, desc);
    host.remove();
  }
}

describe('disposal after the host environment tore the DOM globals down', () => {
  it('Composer — selectionchange listener', () => {
    expect(disposeAfterGlobalsVanish(() => <Composer placeholder="Message" />)).toBeUndefined();
  });

  it('FileUpload — window drag/drop listeners', () => {
    expect(
      disposeAfterGlobalsVanish(() => (
        <FileUpload onFilesAdded={() => {}}>
          <span>drop</span>
        </FileUpload>
      )),
    ).toBeUndefined();
  });

  it('ToastRegion (target-anchored) — window scroll/resize listeners', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    expect(
      disposeAfterGlobalsVanish(() => <ToastRegion toasts={[]} target={target} />),
    ).toBeUndefined();
    target.remove();
  });

  it('useDismiss — document keydown/pointerdown listeners', () => {
    expect(
      disposeAfterGlobalsVanish(() => {
        useDismiss({ enabled: () => true, onDismiss: () => {}, refs: () => [] });
        return <div />;
      }),
    ).toBeUndefined();
  });
});

// --- structural guard ------------------------------------------------------

/**
 * Globals a host can take away underneath a deferred cleanup.
 *
 * This list is measured, not guessed. vitest's `populateGlobal` installs an
 * ACCESSOR on `globalThis` for every key it will later `delete`, and its teardown
 * then restores only the keys that already existed in bare Node. So a name
 * vanishes iff it is installed as an accessor AND Node has no own version:
 *
 *   vanishes  document · customElements · navigator* · CSSStyleSheet ·
 *             localStorage · sessionStorage · matchMedia · getComputedStyle ·
 *             getSelection · MutationObserver · requestAnimationFrame ·
 *             cancelAnimationFrame
 *   vanishes  window — a plain data property, but `skipKeys` puts it back in the
 *             delete set explicitly, and Node has no `window` to restore
 *   SAFE      setTimeout · clearTimeout · setInterval · clearInterval ·
 *             queueMicrotask — Node owns these, so `getWindowKeys` filters them
 *             out and they are never overridden in the first place. The four
 *             `onCleanup(() => clearTimeout(...))` sites in src/ are fine.
 *
 * (*) `navigator` is deleted and then RESTORED to Node's, so it is a
 *     wrong-object risk rather than a crash. Listed anyway: reading it at
 *     teardown is still a bug, just a quieter one.
 */
const FRAGILE_GLOBALS = [
  'document',
  'window',
  'customElements',
  'navigator',
  'CSSStyleSheet',
  'localStorage',
  'sessionStorage',
  'matchMedia',
  'getComputedStyle',
  'getSelection',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
];

/**
 * Sites that are the SAME bug and are not fixed here, keyed `file -> global`.
 *
 * They are `onCleanup(() => cancelAnimationFrame(raf))`, which vanishes exactly
 * like `document` does. They live in `primitives/` and `audio-visualizer/`, which
 * this change does not own, so they are recorded rather than silently dropped
 * from the list — leaving `cancelAnimationFrame` out of FRAGILE_GLOBALS entirely
 * would have made the guard quietly stop covering a whole global.
 *
 * The fix is the same one applied to the four sites above: capture the view at
 * setup (`const win = window`) and call `win.cancelAnimationFrame(raf)`.
 *
 * Shrinking this list never fails the test; adding a NEW violation does.
 */
const KNOWN_UNFIXED = new Set([
  'primitives/use-audio-analysis.ts -> cancelAnimationFrame',
  'primitives/use-sequencer.ts -> cancelAnimationFrame',
  'components/audio-visualizer/labs/lab-visualizer.tsx -> cancelAnimationFrame',
]);

/** Teardown callbacks — everything that runs at dispose rather than at setup. */
const TEARDOWN_CALLS = ['onCleanup', 'addReleaseCallback'];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    // `*.stories.tsx` are excluded on purpose, and it is not a lane dodge: a
    // story only ever executes inside Storybook or a Playwright browser, where
    // no host deletes `document` out from under a running page. Shipped source
    // is what reaches consumers whose environment CAN tear down, so that is what
    // this scan is absolute about.
    else if (/\.tsx?$/.test(name) && !name.endsWith('.stories.tsx')) out.push(p);
  }
  return out;
}

/** Text of the balanced-paren argument list of the call whose `(` is at `open`. */
function argumentText(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
    }
  }
  return src.slice(open + 1);
}

it('no teardown callback in src/ resolves a DOM global by bare identifier', () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const call of TEARDOWN_CALLS) {
      const callRe = new RegExp(`\\b${call}\\s*\\(`, 'g');
      let m: RegExpExecArray | null;
      while ((m = callRe.exec(src))) {
        const open = m.index + m[0].length - 1;
        const body = argumentText(src, open);
        const startLine = src.slice(0, m.index).split('\n').length;
        for (const g of FRAGILE_GLOBALS) {
          // A USE of the global: `document.x`, `window[...]`, `matchMedia(...)`.
          // `typeof document !== 'undefined'` is not a use and not matched.
          const useRe = new RegExp(`(^|[^\\w.$'"\`])${g}\\s*[.\\[(]`, 'g');
          let u: RegExpExecArray | null;
          while ((u = useRe.exec(body))) {
            const before = body.slice(Math.max(0, u.index - 40), u.index);
            if (/\b(const|let|var|function|import)\s*$/.test(before)) continue;
            const rel = relative(SRC, file).split(sep).join('/');
            if (KNOWN_UNFIXED.has(`${rel} -> ${g}`)) continue;
            const line = startLine + body.slice(0, u.index).split('\n').length - 1;
            offenders.push(`${rel}:${line}  ${call} -> bare \`${g}\``);
          }
        }
      }
    }
  }

  expect([...new Set(offenders)].sort()).toEqual([]);
});
