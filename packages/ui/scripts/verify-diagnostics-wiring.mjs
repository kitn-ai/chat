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
  const a = await import(`${wireUrl}?copy=a`);
  const b = await import(`${wireUrl}?copy=b`);

  const idsFrom = async (mod) => {
    const ids = [];
    const off = mod.subscribeWireDiagnostics((e) => {
      if (e.type === 'wire.open' && e.streamId) ids.push(e.streamId);
    });
    await mod.readOpenAIStream(new Response(SSE), nullSink());
    if (typeof off === 'function') off();
    return ids;
  };

  // Subscribe through `a` for both, so this check does not depend on check 2's
  // outcome for its observations.
  const seenA = [];
  const offA = a.subscribeWireDiagnostics((e) => {
    if (e.type === 'wire.open' && e.streamId) seenA.push(e.streamId);
  });
  await a.readOpenAIStream(new Response(SSE), nullSink());
  await b.readOpenAIStream(new Response(SSE), nullSink());
  if (typeof offA === 'function') offA();

  if (seenA.length < 2) {
    // Without shared state we cannot even observe both; check 2 already said so.
    step(`(only ${seenA.length} stream id(s) observable — see the failure above)`);
  } else {
    const unique = new Set(seenA);
    if (unique.size !== seenA.length) {
      fail(
        `Stream ids COLLIDED across module copies: [${seenA.join(', ')}]. The counter is ` +
          'per-copy, so two copies mint the same wire-N for different streams. That id ' +
          'namespaces reasoning parts, so a collision merges one stream’s reasoning blocks ' +
          'into another’s and overwrites their verbatim provider payload.',
      );
    }
  }
  void idsFrom;
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
