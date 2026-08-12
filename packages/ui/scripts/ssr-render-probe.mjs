// The child half of verify-ssr-render.mjs. Copied into a throwaway package
// OUTSIDE the repo and run there, so `@kitn.ai/ui` and `solid-js/web` resolve the
// way a consumer's server resolves them. It is a real file rather than a string
// literal in the parent so it can be read, linted and edited like code.
//
// Contract: argv[2] is the specifier to render. Everything it learns goes to
// stdout as NDJSON, one line per event, flushed as it goes — if a render hangs or
// kills the process, the parent still knows exactly which component it died on.
//
// This file must not import anything from the repo: its whole job is to be a
// consumer.
import { renderToString, createComponent } from 'solid-js/web';

const specifier = process.argv[2];
const emit = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

// Message shaping only. The pass/fail rule below is "a ReferenceError during
// render", which needs no list and cannot drift; this just turns
// "document is not defined" into "browser global `document`" in the report.
const BROWSER_GLOBALS = [
  'window', 'document', 'customElements', 'HTMLElement', 'Element', 'Node',
  'DocumentFragment', 'ShadowRoot', 'localStorage', 'sessionStorage', 'matchMedia',
  'getComputedStyle', 'getSelection', 'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'IntersectionObserver', 'ResizeObserver', 'MutationObserver',
  'CSSStyleSheet', 'DOMParser', 'XMLHttpRequest', 'location', 'history', 'screen',
  'HTMLDivElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLCanvasElement',
  'Image', 'Audio', 'FileReader', 'ClipboardEvent', 'KeyboardEvent', 'MouseEvent',
];

// Anything already on globalThis is what Node itself provides (Node >= 21 has a
// partial `navigator`, for instance). A render that ADDS one to this set has
// installed a DOM shim, which would mask every violation after it — so the
// baseline is snapshotted once and re-checked after every render.
const presentAtStart = new Set(BROWSER_GLOBALS.filter((g) => g in globalThis));

// A component that fires an async task during render can reject after the render
// returned. That is not this guard's subject and must not abort the loop halfway
// through, so it is counted and reported rather than left to kill the process.
let asyncErrors = 0;
process.on('unhandledRejection', () => { asyncErrors++; });

const message = (e) => (e && e.message ? String(e.message) : String(e)).split('\n')[0];

const classify = (e) => {
  const msg = message(e);
  if (e && e.name === 'ReferenceError') {
    const named = /^(\w+) is not defined$/.exec(msg);
    const global = named && named[1];
    return {
      status: 'violation',
      err: global && BROWSER_GLOBALS.includes(global)
        ? `reads browser global \`${global}\` during render (${msg})`
        : `ReferenceError during render: ${msg}`,
    };
  }
  // Solid's server build stubs its client-only entry points with this throw.
  // Reaching one means the render tried to touch the DOM through Solid itself.
  if (msg.includes('Client-only API called on the server side')) {
    return { status: 'violation', err: `Solid client-only API reached during render (${msg})` };
  }
  // Everything else is a shape complaint: a missing required prop, or a part
  // rendered outside the parent that provides its context. The body ran, it just
  // did not get far. Not a violation, and NOT counted as covered either.
  return { status: 'shape', err: msg };
};

// Two props shapes, tried in order. A bare `{}` is the honest first attempt.
// When that stops on a missing prop, PERMISSIVE answers every string key with a
// fresh empty array, which is what `props.messages.map(...)`,
// `props.items.length` and `props.x.some(...)` all need. Symbols pass through as
// undefined so Solid's own brand checks on the props object still behave.
//
// It buys real coverage, measured on this tree: `Thread` and `ChatThread` — the
// two flagship composables, and the components a consumer is most likely to
// server-render — only get executed at all under this pass. It cannot invent
// coverage it did not get: everything it unlocks produced non-empty markup.
//
// It does change which BRANCH runs, because `[]` is truthy where `undefined` is
// not, so a `<Show>` takes its `when` arm. That is a render path a consumer with
// real data also takes, which is why a DOM read found under this pass is still a
// real finding — and the report says which pass found it.
const PERMISSIVE = () =>
  new Proxy(
    {},
    {
      get: (_t, k) => (typeof k === 'symbol' ? undefined : []),
      has: () => true,
      ownKeys: () => [],
      getOwnPropertyDescriptor: () => undefined,
    },
  );

const renderOne = (fn, props) => {
  const html = renderToString(() =>
    typeof createComponent === 'function' ? createComponent(fn, props) : fn(props),
  );
  const leaked = BROWSER_GLOBALS.filter((g) => g in globalThis && !presentAtStart.has(g));
  if (leaked.length) {
    const err = new Error(`render installed browser global(s) ${leaked.join(', ')} on globalThis`);
    err.leaked = true;
    throw err;
  }
  return typeof html === 'string' ? html : '';
};

// ---------------------------------------------------------------- self-test
// Run BEFORE the real work, every run, so the harness has to demonstrate it can
// still tell the two apart. A guard nobody watches fail is this repo's dominant
// failure mode; this is that watch, automated.
//
// `positive` reads a browser global at component-BODY scope — exactly the bug
// class this guard exists for — and MUST come back a violation.
// `negative` MUST render, and MUST produce non-empty markup, so a renderToString
// that degraded into a no-op (a mismatched solid-js instance, an SSR build that
// stopped emitting) cannot read as "nothing was wrong".
const selfTest = () => {
  const positive = () => `<i>${document.documentElement.dataset.theme}</i>`;
  const negative = () => '<i>kai-ssr-render-selftest</i>';

  let detected = false;
  try {
    renderOne(positive, {});
  } catch (e) {
    detected = classify(e).status === 'violation';
  }

  let markup = '';
  let rendered = false;
  try {
    markup = renderOne(negative, {});
    rendered = true;
  } catch {
    /* reported below */
  }

  emit({
    t: 'selftest',
    detects: detected,
    renders: rendered,
    markup: markup.includes('kai-ssr-render-selftest'),
  });
};

selfTest();

// ---------------------------------------------------------------------- work
const mod = await import(specifier);

// Components are the PascalCase function exports. Hooks (`createX`, `useX`) and
// helpers (`cn`) are lowercase by this codebase's convention, and a value export
// is not a function. Stated as a heuristic because it is one: a component
// exported under a lowercase name would not be rendered here.
const names = Object.keys(mod)
  .filter((n) => /^[A-Z]/.test(n) && typeof mod[n] === 'function')
  .sort();

emit({ t: 'meta', specifier, total: names.length });

for (const name of names) {
  try {
    const html = renderOne(mod[name], {});
    emit({ t: 'result', name, status: 'ok', bytes: html.length });
    continue;
  } catch (e) {
    const { status, err } = classify(e);
    if (status === 'violation' || (e && e.leaked)) {
      emit({ t: 'result', name, status: 'violation', err, props: 'empty' });
      continue;
    }
    // Blocked on shape, not on the DOM. Retry with props that satisfy the shape.
    try {
      const html = renderOne(mod[name], PERMISSIVE());
      emit({ t: 'result', name, status: 'ok', bytes: html.length, props: 'permissive' });
    } catch (e2) {
      const second = classify(e2);
      if (second.status === 'violation' || (e2 && e2.leaked)) {
        emit({ t: 'result', name, status: 'violation', err: second.err, props: 'permissive' });
      } else {
        // Neither props shape reached the end of the body. Almost always a part
        // rendered outside the parent that provides its context, which no props
        // object can satisfy. Reported, never counted as covered.
        emit({ t: 'result', name, status: 'shape', err });
      }
    }
  }
}

emit({ t: 'done', asyncErrors });
