#!/usr/bin/env node
// Does the diagnostic event stream actually reach a subscriber IN THE SHIPPED
// PACKAGE? Not "do the types line up", not "does the module import cleanly" --
// does an event emitted by a real read arrive at someone who subscribed.
//
// WHY THIS EXISTS. `./diagnostics` shipped completely inert and every gate was
// green over it. `verify:ssr` proved the subpath imports; `verify:dts:consumer`
// proved its types resolve; the unit suite proved the SOURCE module works. None
// of them executes a subscription against the built files, and the built files
// are where the defect lived:
//
//   · `dist/wire.js` and `dist/diagnostics.js` are separate rollup builds that
//     each inlined their own copy of `src/wire/diagnostics.ts`, so the two did
//     not share the subscriber list at all; and
//   · nothing in the diagnostics bundle CALLS the emitter, so rollup decided the
//     subscriber array was write-only and deleted it, reducing that bundle's
//     `subscribeWireDiagnostics` to `function f(){ let t=1; return () => {...} }`
//     -- it registered nothing and returned a no-op.
//
// So a consumer could install the devtools hook and read a stream and have the
// two be completely disconnected, with no error anywhere.
//
// WHAT IT CHECKS, and check 2 is the one that generalises:
//   1. A subscriber registered through `./diagnostics` receives events from a
//      read performed through `./wire`. That is the exact shipped defect.
//   2. TWO DISTINCT INSTANCES of the same module share state. This is the whole
//      duplication CLASS, not just our build config: a consumer who bundles the
//      kit and also loads the elements bundle from a CDN duplicates the module
//      identically, and no amount of shared-chunk configuration on our side
//      prevents it. Node gives us the same situation honestly by loading one
//      file twice under different specifiers.
//   3. Stream ids minted by those two instances do not collide. The counter has
//      to live in the shared state too -- two copies each starting at `wire-1`
//      mint the same id for different streams, and that id NAMESPACES REASONING
//      PARTS, so a collision silently merges one stream's reasoning blocks into
//      another's and overwrites their verbatim `raw`.
//   4. The chain a real consumer walks, and the one the panel actually failed
//      on: the elements bundle installs the hook, the app reads through the
//      separate `./wire` bundle, and the hook must receive those events.
//
// Needs a build (like verify:consumer): it reads dist/, deliberately, because
// the source passing tells you nothing about what was published.
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (msg) => failures.push(msg);
const step = (msg) => console.log(`  · ${msg}`);

for (const rel of ['dist/wire.js', 'dist/diagnostics.js']) {
  if (!existsSync(resolve(ROOT, rel))) {
    console.error(`\n✗ verify-diagnostics-wiring: ${rel} missing — run \`nx build ui\` first.\n`);
    process.exit(1);
  }
}

const wireUrl = pathToFileURL(resolve(ROOT, 'dist/wire.js')).href;
const diagUrl = pathToFileURL(resolve(ROOT, 'dist/diagnostics.js')).href;

/** An OpenAI-format body that produces open + frames + a part + close. */
const SSE = [
  'data: {"model":"guard/model","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '',
  '',
].join('\n');

const nullSink = () => ({
  appendText: () => undefined,
  appendReasoning: () => undefined,
  upsertTool: () => undefined,
  addSource: () => undefined,
});

// ── Check 1: the shipped defect ──────────────────────────────────────────────
step('a ./diagnostics subscriber receives events from a ./wire read');
{
  const diagnostics = await import(diagUrl);
  const wire = await import(wireUrl);

  if (typeof diagnostics.subscribeWireDiagnostics !== 'function') {
    fail('dist/diagnostics.js does not export subscribeWireDiagnostics as a function.');
  } else {
    const seen = [];
    const off = diagnostics.subscribeWireDiagnostics((e) => seen.push(e.type));
    await wire.readOpenAIStream(new Response(SSE), nullSink());
    if (typeof off === 'function') off();

    if (seen.length === 0) {
      fail(
        'A subscriber registered through dist/diagnostics.js received ZERO events from a read ' +
          'performed through dist/wire.js. The two bundles are not sharing the emitter state ' +
          '(each inlined its own copy of src/wire/diagnostics.ts), or the diagnostics copy was ' +
          'dead-code-eliminated because nothing in that bundle calls emit. Either way the ' +
          'devtools hook is inert for every consumer.',
      );
    } else {
      for (const type of ['wire.open', 'wire.frame', 'wire.part', 'wire.close']) {
        if (!seen.includes(type)) {
          fail(`Expected a ${type} event through the ./diagnostics subscriber; got [${seen.join(', ')}].`);
        }
      }
    }
  }
}

// ── Check 2: the duplication class ───────────────────────────────────────────
step('two distinct instances of the same module share subscriber state');
{
  // One file, two specifiers, therefore two real module instances -- exactly
  // what a consumer produces by bundling the kit AND loading the CDN bundle.
  const a = await import(`${wireUrl}?copy=a`);
  const b = await import(`${wireUrl}?copy=b`);

  if (a.subscribeWireDiagnostics === b.subscribeWireDiagnostics) {
    fail(
      'The two imports resolved to the SAME module instance, so this check proved nothing. ' +
        'Node deduped the specifiers — the cache-busting query was dropped.',
    );
  }

  const seen = [];
  const off = a.subscribeWireDiagnostics((e) => seen.push(e.type));
  await b.readOpenAIStream(new Response(SSE), nullSink());
  if (typeof off === 'function') off();

  if (seen.length === 0) {
    fail(
      'A subscriber registered through one instance of the wire module received ZERO events ' +
        'from a read performed through a SECOND instance of the same module. The emitter state ' +
        'is per-module-copy, so any consumer who ends up with two copies of the kit silently ' +
        'splits the event stream in half.',
    );
  }
}

// ── Check 3: ids stay unique across copies ───────────────────────────────────
step('stream ids minted by two module instances do not collide');
{
  // FRESH copies, and that is the whole point of `c`/`d`.
  //
  // This check first reused `?copy=a` and `?copy=b`, and it was UNFIREABLE:
  // check 2 had already performed a read through `b`, so `b`'s counter was
  // past 1 by the time this ran. Against a half-broken build -- subscribers
  // shared, counter still module-scope -- it printed green over ids that
  // genuinely collided, because it observed `wire-1` and `wire-2` instead of
  // `wire-1` and `wire-1`. Node caches by specifier, so a NEW specifier is
  // what gets a pristine counter.
  const c = await import(`${wireUrl}?copy=c`);
  const d = await import(`${wireUrl}?copy=d`);

  const ids = [];
  const off = c.subscribeWireDiagnostics((e) => {
    if (e.type === 'wire.open' && e.streamId) ids.push(e.streamId);
  });
  await c.readOpenAIStream(new Response(SSE), nullSink());
  await d.readOpenAIStream(new Response(SSE), nullSink());
  if (typeof off === 'function') off();

  if (ids.length < 2) {
    fail(
      `Could not observe a stream id from BOTH module copies (saw ${ids.length}: ` +
        `[${ids.join(', ')}]), so the id-collision check could not run at all. That is the ` +
        'subscriber-sharing failure above, seen from here.',
    );
  } else if (new Set(ids).size !== ids.length) {
    fail(
      `Stream ids COLLIDED across module copies: [${ids.join(', ')}]. The counter is ` +
        'per-copy, so two copies mint the same wire-N for different streams. That id ' +
        'namespaces reasoning parts, so a collision merges one stream’s reasoning blocks ' +
        'into another’s and overwrites their verbatim provider payload.',
    );
  }
}

// ── Check 5: the WRITE path, in the shipped bundle ───────────────────────────
//
// Same class as check 1, different half. The encode events are emitted from a
// pure function with no stream behind it, so a bundler that decided the emitter
// was unreachable from that path would take them out on their own while the
// read events kept arriving -- a green check 1 over a silent write path.
//
// BEFORE check 4, deliberately: that one installs DOM globals.
step('an encode through ./wire reaches a ./diagnostics subscriber, metadata only');
{
  const diagnostics = await import(diagUrl);
  const wire = await import(wireUrl);

  const seen = [];
  const off = diagnostics.subscribeWireDiagnostics((e) => seen.push(e));
  wire.toOpenAIMessages([
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'GUARD-SENTINEL-message-text' },
        { type: 'card', envelope: { type: 'weather', data: {} } },
      ],
    },
  ]);
  if (typeof off === 'function') off();

  const types = seen.map((e) => e.type);
  for (const type of ['encode.request', 'encode.dropped']) {
    if (!types.includes(type)) {
      fail(
        `Expected a ${type} event from an encode performed through dist/wire.js; got ` +
          `[${types.join(', ') || 'nothing at all'}]. The write path is instrumented in source; ` +
          'if it emits nothing here, the emitter was dropped from the shipped bundle and every ' +
          'consumer gets a panel that can never say what was sent.',
      );
    }
  }

  // The boundary, asserted against the SHIPPED code rather than the source: with
  // no payload signal set, nothing content-bearing may appear anywhere.
  if (JSON.stringify(seen).includes('GUARD-SENTINEL-message-text')) {
    fail(
      'An encode event carried the message text with no payload signal set. The default ' +
        'stream is metadata, and the shipped bundle is what a production site runs.',
    );
  }
}

// ── Check 4: the chain the panel actually failed on ──────────────────────────
//
// LAST, because it installs DOM globals that the checks above should not see.
//
// This is the real consumer path and nothing else in CI walks it: the elements
// bundle (`dist/kai.es.js`) dynamically imports register-impl, which installs
// the devtools hook, and the app then reads a stream through the SEPARATE
// `dist/wire.js`. Those are two different files, each carrying its own copy of
// the emitter, which is exactly where the events used to vanish.
//
// It cannot pass vacuously: it asserts a NON-ZERO count of events delivered by a
// real read, and that count was 0 before this fix.
step('the elements bundle installs a hook that receives events from a ./wire read');
{
  const elementsPath = resolve(ROOT, 'dist/kai.es.js');
  if (!existsSync(elementsPath)) {
    console.error(`\n✗ verify-diagnostics-wiring: dist/kai.es.js missing — run \`nx build ui\` first.\n`);
    process.exit(1);
  }

  const { JSDOM } = await import('jsdom');
  // The query signal, so the kit takes its RECORDING branch and buffers.
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/?kai-devtools=1',
    pretendToBeVisual: true,
  });
  const shimmed = [
    'document', 'customElements', 'HTMLElement', 'Element', 'Node', 'navigator',
    'location', 'localStorage', 'CSSStyleSheet', 'MutationObserver', 'getComputedStyle',
    'requestAnimationFrame', 'cancelAnimationFrame', 'DocumentFragment', 'ShadowRoot',
    'Event', 'CustomEvent', 'HTMLTemplateElement',
  ];
  for (const key of shimmed) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
      globalThis[key] = dom.window[key];
    }
  }
  globalThis.window = dom.window;

  await import(pathToFileURL(elementsPath).href);
  await customElements.whenDefined('kai-chat');

  const hook = dom.window.__KAI_DEVTOOLS_HOOK__;
  if (!hook) {
    fail(
      'Importing dist/kai.es.js did not install window.__KAI_DEVTOOLS_HOOK__. The elements ' +
        'bundle is the auto-install site, so without it no consumer of the kit gets a hook.',
    );
  } else if (hook.recording !== true) {
    fail(
      `The hook installed with recording=${hook.recording} despite ?kai-devtools=1 being set, ` +
        'so it took the dormant branch and buffered nothing.',
    );
  } else {
    const wire = await import(wireUrl);
    await wire.readOpenAIStream(new Response(SSE), nullSink());

    const buffered = hook.drain();
    if (buffered.length === 0) {
      fail(
        'The hook installed by dist/kai.es.js buffered ZERO events from a read performed ' +
          'through dist/wire.js. This is the exact path the devtools panel failed on: the ' +
          'hook is live, the read is real, and the two are not connected.',
      );
    }

    // And the live path, which is what a panel uses after it attaches.
    const live = [];
    const detach = hook.attach((e) => live.push(e.type));
    await wire.readOpenAIStream(new Response(SSE), nullSink());
    if (typeof detach === 'function') detach();
    if (live.length === 0) {
      fail(
        'A callback attached to the hook from dist/kai.es.js received ZERO events from a read ' +
          'through dist/wire.js, so a panel would render an empty session against a live stream.',
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`\n✗ verify-diagnostics-wiring FAILED (${failures.length}):\n`);
  for (const f of failures) console.error(`  • ${f}\n`);
  console.error(
    '  The emitter’s mutable state must be shared across every copy of the module.\n' +
      '  See src/wire/diagnostics.ts.\n',
  );
  process.exit(1);
}

console.log(
  '\n✓ verify-diagnostics-wiring: events cross the ./diagnostics ↔ ./wire boundary, ' +
    'two module copies share one emitter, and stream ids stay unique across them.\n',
);
