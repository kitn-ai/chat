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
 *   2. STRUCTURAL — parse `src/` and walk the call graph out of every teardown
 *      callback, so a NEW `onCleanup` in a component nobody thought to add a case
 *      for is still caught — including one that reaches the global through a
 *      named function rather than inline. See the long note above `isScopeNode`
 *      for why that is a parser and not a regex.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'solid-js/web';
import { createRoot, type JSX } from 'solid-js';
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Composer } from '../../src/components/composer';
import { FileUpload } from '../../src/components/file-upload';
import { ToastRegion } from '../../src/components/toast';
import { useDismiss } from '../../src/ui/overlay';
import { useAudioAnalysis } from '../../src/primitives/use-audio-analysis';
import { useSequencer } from '../../src/primitives/use-sequencer';
import { LabVisualizer } from '../../src/components/audio-visualizer/labs/lab-visualizer';
import { ShaderCanvas } from '../../src/components/audio-visualizer/shader-canvas';
import { createTween } from '../../src/primitives/create-tween';
import { VoiceOutput } from '../../src/components/voice-output';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');

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
 *
 * The behavioural harness below deletes this whole list rather than a hand-picked
 * pair, so a component that reaches for any of them at dispose is caught by the
 * same case that covers `document`.
 */
const FRAGILE_GLOBALS = [
  'document',
  'window',
  // The EventTarget methods, and they are here because `window === globalThis`
  // (vitest's populateGlobal sets `global.window = global`; a browser page says
  // the same). So `const win = window` captures the GLOBAL OBJECT — which
  // survives teardown — while the copied `addEventListener` /
  // `removeEventListener` accessors on it are deleted with every other key and
  // bare Node has no original to restore. `win.removeEventListener` at cleanup
  // is then undefined: a TypeError instead of the ReferenceError the capture
  // was meant to fix. Without these three keys this harness passed FileUpload
  // while the emitted project's real teardown failed it (CI run 33459714818).
  // The fix is to capture the FUNCTION at setup (`win.removeEventListener
  // .bind(win)`) — the rule the raf primitives already follow for
  // `cancelAnimationFrame`. `document` captures are unaffected: the document is
  // a real jsdom object whose methods live on its own prototype, not on
  // globalThis.
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
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
 *
 * Every FRAGILE_GLOBAL goes, not just `document`/`window`: the raf primitives
 * reach for `cancelAnimationFrame` at dispose, which vanishes on exactly the same
 * terms, and a harness that only removed the first pair would have watched those
 * three cases pass while covering nothing. Keys that are not own properties of
 * `globalThis` are skipped rather than asserted, so this stays honest if a future
 * jsdom stops installing one of them.
 *
 * `afterMount` runs while the globals are still standing, and exists because
 * several of these cases only reach the teardown path they are named for when the
 * component is in a particular STATE -- a raf loop actually armed, a WebGL program
 * actually compiled. A case that quietly failed to reach that state would pass for
 * the wrong reason and look exactly like coverage. Assert the precondition there
 * rather than hope for it.
 */
function disposeAfterGlobalsVanish(mount: () => JSX.Element, afterMount?: () => void): unknown {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const dispose = render(mount, host);
  afterMount?.();

  const saved = FRAGILE_GLOBALS.map(
    (k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const,
  ).filter((entry): entry is readonly [string, PropertyDescriptor] => entry[1] !== undefined);
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

  // --- the requestAnimationFrame family -----------------------------------
  //
  // Same bug, different global. `cancelAnimationFrame` is installed as an
  // accessor and absent from bare Node, so it disappears at teardown on exactly
  // the same terms `document` does (see FRAGILE_GLOBALS above).

  it('useSequencer — cancelAnimationFrame at dispose', () => {
    expect(
      disposeAfterGlobalsVanish(() => {
        useSequencer(() => 16);
        return <div />;
      }),
    ).toBeUndefined();
  });

  it('useAudioAnalysis — cancelAnimationFrame at dispose', () => {
    // jsdom has no Web Audio, and the hook bails before starting its raf loop
    // without a context -- which would have made this case pass while exercising
    // nothing. The stub is the minimum surface the hook actually touches.
    class FakeAnalyser {
      fftSize = 2048;
      smoothingTimeConstant = 0;
      minDecibels = 0;
      maxDecibels = 0;
      get frequencyBinCount(): number {
        return this.fftSize / 2;
      }
      getFloatFrequencyData(): void {}
      getByteFrequencyData(): void {}
      disconnect(): void {}
    }
    const node = { connect(): void {}, disconnect(): void {} };
    class FakeAudioContext {
      state = 'running';
      destination = {};
      createAnalyser(): FakeAnalyser {
        return new FakeAnalyser();
      }
      createMediaStreamSource(): typeof node {
        return node;
      }
      resume(): Promise<void> {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);

    // No `tagName`, so the hook takes its MediaStream branch (see isMediaElement).
    const stream = {} as unknown as MediaStream;
    expect(
      disposeAfterGlobalsVanish(() => {
        useAudioAnalysis(() => stream);
        return <div />;
      }),
    ).toBeUndefined();
  });

  it('LabVisualizer — cancelAnimationFrame at dispose', () => {
    expect(disposeAfterGlobalsVanish(() => <LabVisualizer look="orb" />)).toBeUndefined();
  });

  // --- the same bug, one level of indirection down --------------------------
  //
  // Neither of these two calls `cancelAnimationFrame` in the callback it hands
  // `onCleanup`. Both call a NAMED function that does. That is invisible to a
  // scan that reads the literal argument text of `onCleanup(...)`, which is why
  // the structural guard below resolves callees rather than matching text -- and
  // why these two cases exist to prove the behaviour independently of it.

  it('createTween — cancelAnimationFrame at dispose, via stop()', () => {
    let tween!: ReturnType<typeof createTween>;
    expect(
      disposeAfterGlobalsVanish(
        () => {
          tween = createTween(0);
          // `stop()` is `if (raf) cancelAnimationFrame(raf)`, so a tween with
          // nothing in flight never reaches the global at all. An animated
          // `to()` is what arms the loop; an instant one (`duration: 0`, or no
          // transition) would leave this case exercising nothing.
          tween.to(1, { duration: 500 });
          return <div />;
        },
        // `animating` is documented as true exactly while a frame loop is armed,
        // so this is a public read of the precondition rather than a guess.
        () => expect(tween.animating()).toBe(true),
      ),
    ).toBeUndefined();
  });

  it('ShaderCanvas — cancelAnimationFrame at dispose, via release() -> stopLoop()', () => {
    // jsdom has no WebGL: `getContext('webgl')` genuinely returns null, the
    // component takes its no-context path, and `raf` stays 0 -- so `stopLoop()`
    // returns at its `if (raf === 0)` guard and never reaches the global. This
    // case would have passed while covering NOTHING without a context. The stub
    // is the minimum surface compile + link + draw actually touch; every call is
    // a no-op reporting success, and it proves nothing about rendering.
    const handle = () => ({}) as never;
    const gl = {
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
      ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, BLEND: 8, ONE: 9,
      ONE_MINUS_SRC_ALPHA: 10, COLOR_BUFFER_BIT: 11,
      createShader: handle, shaderSource: () => {}, compileShader: () => {},
      getShaderParameter: () => true, getShaderInfoLog: () => '',
      createProgram: handle, attachShader: () => {}, linkProgram: () => {},
      getProgramParameter: () => true, getProgramInfoLog: () => '',
      useProgram: () => {}, createBuffer: handle, bindBuffer: () => {},
      bufferData: () => {}, getAttribLocation: () => 0,
      enableVertexAttribArray: () => {}, vertexAttribPointer: () => {},
      enable: () => {}, blendFunc: () => {}, getUniformLocation: handle,
      deleteProgram: () => {}, deleteShader: () => {}, deleteBuffer: () => {},
      viewport: () => {}, clearColor: () => {}, clear: () => {}, drawArrays: () => {},
      uniform1f: () => {}, uniform1i: () => {}, uniform2fv: () => {}, uniform4fv: () => {},
      isContextLost: () => false,
      // null: no WEBGL_lose_context. The cleanup's `if (loseExtension && ...)`
      // release branch is then skipped, so this stub never has to model context
      // loss to answer the question this case asks.
      getExtension: () => null,
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      type === 'webgl' || type === 'experimental-webgl' ? gl : null) as never);

    // Counts frames armed, so "the loop was running at dispose" is measured
    // rather than assumed. The draw callback re-arms every frame, so any count
    // above zero means `raf !== 0` when cleanup ran.
    const realRaf = globalThis.requestAnimationFrame;
    let armed = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      armed++;
      return realRaf(cb);
    });

    expect(
      disposeAfterGlobalsVanish(
        () => <ShaderCanvas fragment="void mainImage(out vec4 c, in vec2 p) { c = vec4(1.0); }" />,
        () => expect(armed).toBeGreaterThan(0),
      ),
    ).toBeUndefined();
  });

  // --- the other side of "capture at setup" ---------------------------------

  it('createTween and ShaderCanvas still construct where rAF never existed (SSR)', () => {
    // Capturing at SETUP is the fix, but for these two "setup" is the COMPONENT
    // BODY -- and a server render executes component bodies. Node has no
    // `requestAnimationFrame`/`cancelAnimationFrame` at all, so an unguarded
    // `cancelAnimationFrame.bind(globalThis)` there is a ReferenceError on the
    // server: the teardown fix would have traded a disposal crash for an SSR
    // crash. (The three landed raf fixes are all inside `createEffect`, which
    // SSR never runs, so this question did not arise for them.)
    //
    // `verify:ssr` does not cover this — it asserts every entry IMPORTS under
    // Node, and this throws only once a component is rendered.
    //
    // Deleting both keys reproduces bare Node inside jsdom, which is the same
    // absence by the same mechanism.
    const saved = ['requestAnimationFrame', 'cancelAnimationFrame']
      .map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const)
      .filter((e): e is readonly [string, PropertyDescriptor] => e[1] !== undefined);
    expect(saved.length).toBe(2); // else this case is asserting nothing
    for (const [k] of saved) delete (globalThis as Record<string, unknown>)[k];

    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      expect(() => createRoot((d) => { createTween(0); d(); })).not.toThrow();
      expect(() =>
        render(() => <ShaderCanvas fragment="void mainImage(out vec4 c, in vec2 p) { c = vec4(1.0); }" />, host)(),
      ).not.toThrow();
    } finally {
      for (const [k, desc] of saved) Object.defineProperty(globalThis, k, desc);
      host.remove();
    }
  });

  // --- a guarded reach for a global, which is NOT this bug -------------------

  it('VoiceOutput — a `typeof window` guard survives the globals vanishing', () => {
    // `onCleanup(() => { stop(); ... })` and `stop()` reaches
    // `window.speechSynthesis.cancel()` -- but only behind `hasSpeechSynthesis()`,
    // whose body is `typeof window !== 'undefined' && ...`. With `window` deleted
    // that predicate is false and the reach never happens.
    //
    // This case is here because the structural guard below MODELS that pattern
    // and stays silent about both sites. A model is a claim about runtime; this
    // is the measurement that backs it. If the guard modelling is ever wrong,
    // something has to go red, and it is this.
    expect(disposeAfterGlobalsVanish(() => <VoiceOutput text="hello" />)).toBeUndefined();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- structural guard ------------------------------------------------------

/**
 * Sites that are the SAME bug and are knowingly not fixed yet, keyed
 * `file -> global`. EMPTY, and the second test below is what keeps it honest.
 *
 * It held three `onCleanup(() => cancelAnimationFrame(raf))` sites —
 * `primitives/use-audio-analysis.ts`, `primitives/use-sequencer.ts` and
 * `components/audio-visualizer/labs/lab-visualizer.tsx` — recorded rather than
 * dropped from FRAGILE_GLOBALS, because dropping the global would have made the
 * guard quietly stop covering a whole name. All three are fixed; each has a
 * behavioural case above.
 *
 * An allowlist that only ever fails on ADDITION rots closed: a site gets fixed,
 * nobody removes its entry, and the exemption silently outlives the bug — so the
 * next real regression at that exact site lands pre-approved and invisible. This
 * one is therefore checked in BOTH directions. Adding a new violation fails; so
 * does leaving an entry here once the scan can no longer find the violation it
 * names.
 *
 * The fix is NOT the `const win = window` capture that fixes a bare `document`.
 * `window === globalThis` — measured, in jsdom and in real Chromium/WebKit alike
 * — and the teardown deletes these keys off that very object, so the captured
 * view has nothing left to call. It only turns
 * `ReferenceError: cancelAnimationFrame is not defined` into
 * `TypeError: win.cancelAnimationFrame is not a function`, which was watched
 * happening before the working fix went in. Capture the FUNCTION at setup
 * instead: `const cancelFrame = cancelAnimationFrame.bind(globalThis)`.
 *
 * One caveat on WHERE that line goes. Inside a `createEffect`/`onMount` it can be
 * written bare, because SSR never runs those. At COMPONENT-BODY scope it cannot:
 * a server render does execute the body, Node has no `cancelAnimationFrame`, and
 * the bare form turns the disposal crash into an SSR crash. The two body-scope
 * sites (`create-tween.ts`, `shader-canvas.tsx`) therefore guard the capture with
 * `typeof cancelAnimationFrame === 'function'`; the "still construct where rAF
 * never existed" case above is what holds that line.
 */
const KNOWN_UNFIXED = new Set<string>([]);

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

/*
 * WHY THIS IS A PARSER AND NOT A REGEX
 * ------------------------------------
 * This scan used to read the literal argument TEXT of each `onCleanup(...)` call
 * and look for `document.`/`matchMedia(` in it. That works only while the offending
 * read is written inside the callback. It is invisible the moment the callback
 * delegates:
 *
 *     const stop = () => { if (raf) cancelAnimationFrame(raf); };   // <- the bug
 *     onCleanup(() => { disposed = true; stop(); });                // <- what it read
 *
 * Two live sites were shaped exactly like that -- `primitives/create-tween.ts` and
 * `components/audio-visualizer/shader-canvas.tsx`, the latter two hops deep
 * (`onCleanup(release)` -> `release()` -> `stopLoop()`) -- and the text scan was
 * green across both the whole time they were broken. A green check over a bug it
 * structurally cannot see is worse than no check: it is the reason nobody looked.
 *
 * So the scan resolves callees to their bodies instead of matching text. It parses
 * each file with the TypeScript compiler's own parser (syntax only -- no program,
 * no type checker, no tsconfig), builds a lexical scope chain, and from every
 * teardown callback walks the LOCAL CALL GRAPH transitively. Depth is unbounded, so
 * adding another hop between the callback and the bug does not restore the blind
 * spot. Scope resolution is what makes it precise in both directions: a name that
 * binds to a local is not a global (no false alarm on a `const document = ...`),
 * and a name that binds to nothing IS one (no false calm on an aliased read).
 *
 * WHAT IT STILL CANNOT SEE, stated plainly rather than papered over:
 *
 *   1. It is PER-FILE. A callee that is imported is not followed into the module
 *      that defines it. Cross-module resolution needs real module resolution, and
 *      the payoff is small here: a hook that registers its own cleanup is scanned
 *      in its own file anyway, so only a directly-imported disposer would slip
 *      through, and there is currently no such site.
 *   2. It resolves NAMES, not VALUES. A disposer produced by a call
 *      (`onCleanup(makeDisposer())`) or read off an object
 *      (`onCleanup(parent.register(el))`) has no syntactic body to walk. Tracking
 *      those needs data-flow, not name resolution.
 *
 * (2) is not left silent: every teardown callback the walker cannot resolve is
 * reported, and UNRESOLVED_TEARDOWN_CALLBACKS below pins the exact set, so a NEW
 * unresolvable one fails this suite and gets read by a human instead of vanishing
 * into a blind spot. The FIXTURE at the bottom then tests the analyzer itself
 * against source whose answer is known, because an analyzer that silently stopped
 * resolving anything would otherwise report zero offenders and look like a pass.
 */

/** Every scope-introducing node, for the lexical walk in `resolveName`. */
function isScopeNode(n: ts.Node): boolean {
  return (
    ts.isSourceFile(n) || ts.isBlock(n) || ts.isModuleBlock(n) || ts.isCaseBlock(n) ||
    ts.isFunctionLike(n) || ts.isCatchClause(n) || ts.isForStatement(n) ||
    ts.isForInStatement(n) || ts.isForOfStatement(n) || ts.isClassLike(n)
  );
}

/** Flatten a binding name, so `const { a, b: [c] } = x` declares a, c. */
function bindingNames(name: ts.BindingName, out: string[] = []): string[] {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const el of name.elements) if (ts.isBindingElement(el)) bindingNames(el.name, out);
  return out;
}

const scopeCache = new WeakMap<ts.Node, Map<string, ts.Node>>();

/** Names declared DIRECTLY by `scope`, each mapped to its declaration node. */
function bindingsOf(scope: ts.Node): Map<string, ts.Node> {
  const cached = scopeCache.get(scope);
  if (cached) return cached;
  const m = new Map<string, ts.Node>();
  const add = (name: string | undefined, decl: ts.Node) => {
    if (name && !m.has(name)) m.set(name, decl);
  };

  const addStatements = (stmts: readonly ts.Statement[]) => {
    for (const s of stmts) {
      if (ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations)
          for (const n of bindingNames(d.name)) add(n, d);
      } else if (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) {
        add(s.name?.text, s);
      } else if (ts.isImportDeclaration(s) && s.importClause) {
        const c = s.importClause;
        add(c.name?.text, c);
        if (c.namedBindings) {
          if (ts.isNamespaceImport(c.namedBindings)) add(c.namedBindings.name.text, c.namedBindings);
          else for (const sp of c.namedBindings.elements) add(sp.name.text, sp);
        }
      }
    }
  };

  if (ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope)) {
    addStatements(scope.statements);
  } else if (ts.isCaseBlock(scope)) {
    for (const clause of scope.clauses) addStatements(clause.statements);
  } else if (ts.isFunctionLike(scope)) {
    for (const p of scope.parameters) for (const n of bindingNames(p.name)) add(n, p);
    // A named function expression binds its own name inside its body.
    if ((ts.isFunctionExpression(scope) || ts.isFunctionDeclaration(scope)) && scope.name)
      add(scope.name.text, scope);
  } else if (ts.isCatchClause(scope)) {
    const v = scope.variableDeclaration;
    if (v) for (const n of bindingNames(v.name)) add(n, v);
  } else if (ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) {
    const init = scope.initializer;
    if (init && ts.isVariableDeclarationList(init))
      for (const d of init.declarations) for (const n of bindingNames(d.name)) add(n, d);
  } else if (ts.isClassLike(scope)) {
    add(scope.name?.text, scope);
  }

  scopeCache.set(scope, m);
  return m;
}

/**
 * The declaration `id` binds to, or `null` when it binds to nothing in the file —
 * which, for a name like `document`, means the global.
 *
 * `var` is treated as block-scoped rather than hoisted to the function. The only
 * way that differs is a `var` declared in one block and read in a sibling block,
 * which would be reported as a global; there is no such code here and it would be
 * a false ALARM (loud), not a false calm (silent).
 */
function resolveName(id: ts.Identifier): ts.Node | null {
  for (let cur: ts.Node | undefined = id.parent; cur; cur = cur.parent) {
    if (!isScopeNode(cur)) continue;
    const hit = bindingsOf(cur).get(id.text);
    if (hit) return hit;
  }
  return null;
}

/** True when `id` is in a type position (`let x: Document`), not a value read. */
function inTypePosition(id: ts.Identifier): boolean {
  for (let cur: ts.Node | undefined = id.parent; cur; cur = cur.parent) {
    if (ts.isTypeNode(cur) || ts.isTypeQueryNode(cur)) return true;
    if (ts.isStatement(cur) || ts.isFunctionLike(cur) || ts.isSourceFile(cur)) return false;
  }
  return false;
}

/** True when `id` is an actual READ of the binding, not just the name of something. */
function isValueReference(id: ts.Identifier): boolean {
  const p: ts.Node | undefined = id.parent;
  if (!p) return false;
  // `{ document }` is shorthand FOR a read, unlike every other `.name === id` case.
  if (ts.isShorthandPropertyAssignment(p)) return true;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false; // `x.document`
  if (ts.isQualifiedName(p) && p.right === id) return false; // `X.document` in a type
  if (ts.isBindingElement(p) && p.propertyName === id) return false; // `{ document: d }`
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p))
    return false;
  if (ts.isTypeOfExpression(p)) return false; // `typeof document !== 'undefined'`
  if (ts.isLabeledStatement(p) || ts.isBreakStatement(p) || ts.isContinueStatement(p)) return false;
  // Anything else whose `name` this IS — a declaration, a property key, a parameter.
  if ((p as { name?: ts.Node }).name === id) return false;
  return !inTypePosition(id);
}

/** The body of whatever function `decl` is, or `null` if it is not one. */
function functionBodyOf(decl: ts.Node | null): ts.Node | null {
  if (!decl) return null;
  if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl) || ts.isMethodDeclaration(decl))
    return decl.body ?? null;
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    const init = decl.initializer;
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init.body;
  }
  return null;
}

/**
 * Is `expr` a check that `name` still exists?
 *
 * `typeof window !== 'undefined'` directly, or a call to a LOCAL zero-argument
 * predicate whose whole body is such a check — which is how `voice-output.tsx`
 * writes it (`hasSpeechSynthesis()`).
 *
 * Deliberately tight: the guard must name the SAME global as the use it protects,
 * so an unrelated `if (someFlag())` silences nothing. It is still a modelling
 * claim about runtime, so the VoiceOutput case in the behavioural block above
 * measures it rather than trusting it.
 */
function isTypeofGuardFor(expr: ts.Expression | undefined, name: string): boolean {
  if (!expr) return false;
  if (ts.isParenthesizedExpression(expr)) return isTypeofGuardFor(expr.expression, name);
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken) {
      const typeofSide = ts.isTypeOfExpression(expr.left) ? expr.left
        : ts.isTypeOfExpression(expr.right) ? expr.right : null;
      const other = typeofSide === expr.left ? expr.right : expr.left;
      if (typeofSide && ts.isIdentifier(typeofSide.expression) && typeofSide.expression.text === name
        && ts.isStringLiteral(other) && other.text === 'undefined') return true;
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken)
      return isTypeofGuardFor(expr.left, name) || isTypeofGuardFor(expr.right, name);
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.arguments.length === 0) {
    const body = functionBodyOf(resolveName(expr.expression));
    if (body) {
      if (!ts.isBlock(body)) return isTypeofGuardFor(body as ts.Expression, name);
      const only = body.statements.length === 1 ? body.statements[0] : undefined;
      if (only && ts.isReturnStatement(only)) return isTypeofGuardFor(only.expression, name);
    }
  }
  return false;
}

/** True when `id` only evaluates once `typeof <id> !== 'undefined'` already held. */
function isGuarded(id: ts.Identifier): boolean {
  for (let cur: ts.Node = id; cur.parent; cur = cur.parent) {
    const p = cur.parent;
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      && p.right === cur && isTypeofGuardFor(p.left, id.text)) return true;
    if (ts.isConditionalExpression(p) && p.whenTrue === cur && isTypeofGuardFor(p.condition, id.text)) return true;
    if (ts.isIfStatement(p) && p.thenStatement === cur && isTypeofGuardFor(p.expression, id.text)) return true;
    if (ts.isFunctionLike(p)) break; // a guard does not cross into a deferred callback
  }
  return false;
}

interface ScanResult {
  /** `path:line  chain -> bare \`global\`” — one per distinct site. */
  offenders: string[];
  /** KNOWN_UNFIXED keys this run actually matched. Listed-but-absent is stale. */
  exempted: Set<string>;
  /** Teardown callbacks with no syntactic body to walk. See blind spot (2). */
  unresolved: string[];
}

/** Analyze one file's text. Split out so the fixture test can drive it directly. */
function scanSource(rel: string, text: string): ScanResult {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const offenders: string[] = [];
  const exempted = new Set<string>();
  const unresolved: string[] = [];
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  /** Walk a body for bare globals, following calls into local functions. */
  const walkBody = (body: ts.Node, chain: string[], visited: Set<ts.Node>) => {
    const visit = (n: ts.Node) => {
      if (ts.isIdentifier(n) && FRAGILE_GLOBALS.includes(n.text)
        && isValueReference(n) && resolveName(n) === null && !isGuarded(n)) {
        const key = `${rel} -> ${n.text}`;
        if (KNOWN_UNFIXED.has(key)) exempted.add(key);
        else offenders.push(`${rel}:${lineOf(n)}  ${chain.join(' -> ')} -> bare \`${n.text}\``);
      }
      // The indirection this scan exists for: a call to a function declared in
      // this file is followed into its body, at any depth. `visited` keeps
      // mutual recursion from looping; re-walking a body cannot find anything
      // new anyway.
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const decl = resolveName(n.expression);
        const nested = functionBodyOf(decl);
        if (decl && nested && !visited.has(decl)) {
          visited.add(decl);
          walkBody(nested, [...chain, n.expression.text], visited);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(body);
  };

  const findTeardown = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isIdentifier(callee) ? callee.text
        : ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
      const arg = n.arguments[0];
      if (name && TEARDOWN_CALLS.includes(name) && arg) {
        if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
          walkBody(arg.body, [name], new Set());
        } else if (ts.isIdentifier(arg)) {
          const decl = resolveName(arg);
          const body = functionBodyOf(decl);
          if (decl && body) walkBody(body, [name, arg.text], new Set([decl]));
          else unresolved.push(`${rel}  ${name}(${arg.text})`);
        } else {
          unresolved.push(`${rel}  ${name}(<${ts.SyntaxKind[arg.kind]}>)`);
        }
      }
    }
    ts.forEachChild(n, findTeardown);
  };
  findTeardown(sf);

  return { offenders: [...new Set(offenders)], exempted, unresolved };
}

/** One pass over `src/`. Memoized — four tests read it and it parses 500+ files. */
let scanned: ScanResult | undefined;
function scanSrc(): ScanResult {
  if (scanned) return scanned;
  const offenders: string[] = [];
  const exempted = new Set<string>();
  const unresolved: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file).split(sep).join('/');
    const r = scanSource(rel, readFileSync(file, 'utf8'));
    offenders.push(...r.offenders);
    for (const k of r.exempted) exempted.add(k);
    unresolved.push(...r.unresolved);
  }
  scanned = { offenders: offenders.sort(), exempted, unresolved: unresolved.sort() };
  return scanned;
}

it('no teardown path in src/ resolves a DOM global by bare identifier', () => {
  expect(scanSrc().offenders).toEqual([]);
});

/**
 * The other direction. Without this, KNOWN_UNFIXED only ever fails on addition,
 * so a fixed site keeps its exemption forever and the next regression at that
 * exact file/global pair is waved through by a rule nobody remembers writing.
 * An entry has to keep earning its place: name a violation the scan can still
 * find, or come off the list.
 */
it('KNOWN_UNFIXED carries no stale entry for an already-fixed site', () => {
  const { exempted } = scanSrc();
  const stale = [...KNOWN_UNFIXED].filter((key) => !exempted.has(key)).sort();
  expect(stale).toEqual([]);
});

/**
 * The analyzer's blind spot, pinned rather than hidden.
 *
 * These are teardown callbacks that are neither an inline function nor a name
 * bound to one in the same file, so there is no body to walk (see blind spot (2)
 * at the top). Both were READ, and neither reaches a DOM global:
 *
 *   · `reasoning.tsx` — `observeContentHeight(...)` returns `() => ro.disconnect()`,
 *     closing over the observer object it created.
 *   · `dropdown.tsx` — `registerSubMenu(el)` returns a closure that only calls a
 *     Solid setter.
 *
 * Asserting the exact set, rather than tolerating any number of them, is the point:
 * a new unresolvable disposer fails here and gets looked at by a person, instead of
 * being quietly excluded by an analyzer that reports nothing about what it skipped.
 *
 * Keyed by file and callback name, deliberately WITHOUT a line number. A line here
 * would make this suite go red for any edit that merely shifted those files, which
 * trains people to update the expectation without reading it — the exact reflex
 * that lets a real entry slip in. `offenders` keeps its line numbers, because those
 * have to be actionable and are expected to be empty anyway.
 */
const UNRESOLVED_TEARDOWN_CALLBACKS = [
  'components/reasoning.tsx  onCleanup(dispose)',
  'ui/dropdown.tsx  onCleanup(unregister)',
];

it('every teardown callback the scan cannot resolve is one that was reviewed', () => {
  expect(scanSrc().unresolved).toEqual([...UNRESOLVED_TEARDOWN_CALLBACKS].sort());
});

/**
 * THE ANALYZER'S OWN TEST.
 *
 * `offenders` being empty is a pass and also exactly what a broken analyzer
 * returns. The previous text scan was green over two real bugs for precisely that
 * reason, so the replacement does not get to be trusted on the strength of a green
 * run over clean source. This drives it over a fixture where the answer is known:
 * every `// BAD` line must be reported and every `// OK` line must not.
 *
 * The `via two hops` case is the one that matters most — it is the shape the text
 * scan could not see, and the shape a "just match a bit more text" fix would still
 * miss.
 */
const FIXTURE = `
import { onCleanup } from 'solid-js';

function hasWin(): boolean { return typeof window !== 'undefined'; }

export function widget(el: HTMLElement) {
  let raf = 0;
  const cancelFrame = cancelAnimationFrame.bind(globalThis);
  const ownerDoc = el.ownerDocument;

  const deep = () => { matchMedia('(min-width: 1px)'); };          // BAD:11 (two hops)
  const middle = () => { deep(); };
  const stopOk = () => { if (raf) cancelFrame(raf); };             // OK: bound at setup
  const stopBad = () => { if (raf) cancelAnimationFrame(raf); };   // BAD:14 (one hop)

  function shadowed() {
    const document = { removeEventListener() {} };
    document.removeEventListener();                                // OK: local binding
  }

  const guarded = () => {
    if (hasWin()) window.scrollTo(0, 0);                           // OK: predicate guard
    if (typeof getSelection !== 'undefined') getSelection();       // OK: inline guard
    if (hasWin()) getComputedStyle(el);                            // BAD:24 (guards a
  };                                                               //   different global)

  const propertyNames = () => {
    const bag = { document: 1, window: 2 };
    return bag.document + bag.window;                              // OK: property names
  };

  document.body.appendChild(el);                                   // OK: not a teardown

  onCleanup(() => {
    ownerDoc.removeEventListener('x', () => {});                   // OK: captured node
    document.removeEventListener('y', () => {});                   // BAD:36 (direct)
    stopOk();
    stopBad();
    middle();
    shadowed();
    guarded();
    propertyNames();
  });
  onCleanup(makeDisposer());                                       // unresolved
}
`;

it('the analyzer finds indirect violations and only those — checked against a fixture', () => {
  const { offenders, unresolved } = scanSource('fixture.tsx', FIXTURE);
  expect(offenders.sort()).toEqual([
    'fixture.tsx:11  onCleanup -> middle -> deep -> bare `matchMedia`',
    'fixture.tsx:14  onCleanup -> stopBad -> bare `cancelAnimationFrame`',
    'fixture.tsx:24  onCleanup -> guarded -> bare `getComputedStyle`',
    'fixture.tsx:36  onCleanup -> bare `document`',
  ]);
  expect(unresolved).toEqual(['fixture.tsx  onCleanup(<CallExpression>)']);
});
