// THE FLOOR STAGE. Every `examples[].right` in the invariant records is EXECUTED
// here, and where the example makes a behavioural claim the claim is asserted.
//
// WHY THIS EXISTS, and it is not hypothetical. Task 5 shipped three defects in
// which the recommended code was structurally perfect and behaviourally wrong: a
// pair whose `wrong` form was a subset of its own `right` form (so the audit
// would have fired on correct output), `right` forms importing kit internals no
// consumer can reach, and guarded forms that THREW on an unparseable URL where
// the statement requires them to return false. Structure told you nothing about
// any of them. Running the code tells you about all three.
//
// So: if the catalog's own advice does not run, nothing downstream is worth
// measuring, and the pack refuses to be built.
//
// WHAT A HARNESS IS, AND WHY EVERY EXAMPLE NEEDS ONE
// -------------------------------------------------
// The `right` forms are CONSUMER FRAGMENTS, not programs: they carry free
// variables (`el`, `chat`, `source`, `card`, `messages`) that a consumer's own
// code would have bound. A harness supplies those bindings and then asserts what
// the example claims. Missing harness = HARD FAILURE, never a skip: a skip is
// how an example quietly stops being measured, and an example nobody runs is
// exactly the shape of the three defects above.
//
// A dangling harness -- one whose example was deleted or renumbered -- is also a
// hard failure, in the other direction. Otherwise the table rots into a set of
// checks over code that no longer exists while reporting a healthy count.
//
// HONESTY ABOUT STAND-INS. Some `right` forms call into the published package
// (`readOpenAIStream`) or the browser (`fetch`, `customElements`). Those are
// listed in `stubs` and printed in the report, because "it executed" against a
// stub is a weaker statement than "it executed" against the real thing, and the
// weaker statement must not be reported as the stronger one. Where a stub is
// unavoidable the harness carries a `corroborate` step that checks the real
// claim by another route -- e.g. that `readOpenAIStream` really is exported from
// src/wire/index.ts through the `./wire` exports key.
import vm from 'node:vm';
import * as esbuild from 'esbuild';

class FloorAssertionError extends Error {}

function assert(cond, msg) {
  if (!cond) throw new FloorAssertionError(msg);
}

/** A promise whose resolution the harness controls, for the upgrade-race timing check. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Execute one `right` fragment with the supplied bindings as its globals.
 *
 * Wrapped in an async IIFE so a fragment containing top-level `await` runs at
 * all, and awaited so a rejection surfaces as a failure rather than as an
 * unhandled rejection that leaves the run green.
 */
async function execute(code, bindings, { jsx = false } = {}) {
  const src = jsx
    ? esbuild.transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: '__h', jsxFragment: '__Fragment' })
        .code
    : code;
  const context = vm.createContext({
    // Not ECMAScript globals, so a fresh vm realm does not have them: pass in
    // exactly what a browser would have provided, and nothing else. Anything a
    // fragment needs beyond this list is a binding the harness must name.
    URL,
    console,
    setTimeout,
    queueMicrotask,
    EventTarget,
    CustomEvent,
    ...bindings,
  });
  await vm.runInContext(`(async () => {\n${src}\n})()`, context, { timeout: 2000 });
}

/**
 * The harness table. Key is `<invariant-id>#<example-index>`.
 *
 * `cases` is a list because a single execution proves only the happy path, and
 * for the guarded examples the whole contract is the UNHAPPY path: a scheme
 * check that lets `javascript:` through, or that throws on `http://[` instead of
 * returning false, is the exact defect this stage was built after. One case per
 * behaviour the example claims.
 */
export const HARNESSES = {
  'reactivity-two-halves#0': {
    stubs: [],
    cases: [
      {
        label: 'appending a turn produces a NEW array reference',
        bindings() {
          const original = [{ id: 'm0', role: 'assistant', parts: [] }];
          return { chat: { messages: original }, id: 'm1', text: 'hi', __original: original };
        },
        check(b) {
          assert(b.chat.messages !== b.__original, 'the array reference did not change; nothing would notify');
          assert(b.chat.messages.length === 2, `expected 2 messages, got ${b.chat.messages.length}`);
          assert(b.chat.messages[0] === b.__original[0], 'an untouched message lost its object identity');
          assert(b.chat.messages[1].parts[0].type === 'text', 'the appended turn is not a text part');
        },
      },
    ],
  },

  'reactivity-two-halves#1': {
    stubs: [],
    cases: [
      {
        label: 'editing an item produces BOTH a new array and a new object for that item',
        bindings() {
          const messages = [
            { id: 'a', parts: [] },
            { id: 'b', parts: [{ type: 'text', text: 'x' }] },
          ];
          return { messages, last: 1, part: { type: 'text', text: 'y' }, chat: {} };
        },
        check(b) {
          assert(b.chat.messages !== b.messages, 'same array reference: the element is never notified');
          assert(b.chat.messages[1] !== b.messages[1], 'the EDITED item kept its identity: the <For> row renders stale');
          assert(b.chat.messages[0] === b.messages[0], 'an unedited item was needlessly replaced');
          assert(b.chat.messages[1].parts.length === 2, 'the part was not appended');
        },
      },
    ],
  },

  'props-not-attributes#0': {
    stubs: [],
    cases: [
      {
        label: 'the array arrives as an array, by reference',
        bindings() {
          return { el: {}, messages: [{ id: 'm1', role: 'user', parts: [] }] };
        },
        check(b) {
          assert(Array.isArray(b.el.messages), 'the property does not hold an array');
          assert(b.el.messages === b.messages, 'the property is a copy, not the array that was assigned');
        },
      },
    ],
  },

  'props-not-attributes#1': {
    stubs: [],
    cases: [
      {
        label: 'a function survives a property assignment (and demonstrably would not survive JSON)',
        bindings() {
          return { cards: {}, onSubmit: () => 'called' };
        },
        check(b) {
          assert(typeof b.cards.policy.onSubmit === 'function', 'the callback is not a function on the property');
          assert(b.cards.policy.onSubmit() === 'called', 'the callback is not the one that was assigned');
          // The contrast the example's note asserts, measured rather than
          // claimed: the attribute route drops the handler before the attribute
          // is even set.
          assert(
            JSON.parse(JSON.stringify(b.cards.policy)).onSubmit === undefined,
            "JSON.stringify kept the function, which would contradict the invariant's own stated mechanism",
          );
        },
      },
    ],
  },

  'events-non-bubbling#0': {
    stubs: [],
    cases: [
      {
        label: 'the listener on the element itself receives detail.value',
        bindings() {
          const got = [];
          return { chat: new EventTarget(), send: (v) => got.push(v), __got: got };
        },
        check(b) {
          b.chat.dispatchEvent(new CustomEvent('kai-submit', { detail: { value: 'hello' } }));
          assert(b.__got.length === 1, `listener fired ${b.__got.length} times, expected 1`);
          assert(b.__got[0] === 'hello', `handler read ${JSON.stringify(b.__got[0])}, expected "hello"`);
        },
      },
    ],
    corroborate({ derivedEvents }) {
      assert(derivedEvents('kai-chat').includes('kai-submit'), 'kai-chat does not dispatch kai-submit in the derived layer');
    },
  },

  'events-non-bubbling#1': {
    stubs: [],
    cases: [
      {
        label: 'the same shape for a non-submit event',
        bindings() {
          const calls = [];
          return { chat: new EventTarget(), handleAction: (e) => calls.push(e.type), __calls: calls };
        },
        check(b) {
          b.chat.dispatchEvent(new CustomEvent('kai-message-action', { detail: {} }));
          assert(b.__calls.length === 1, 'the listener did not fire');
          assert(b.__calls[0] === 'kai-message-action', `fired for ${b.__calls[0]}`);
        },
      },
    ],
    corroborate({ derivedEvents }) {
      assert(
        derivedEvents('kai-chat').includes('kai-message-action'),
        'kai-chat does not dispatch kai-message-action in the derived layer',
      );
    },
  },

  'host-coordinates#0': {
    stubs: [],
    cases: [
      {
        label: 'the rows land on the element that owns the list',
        bindings() {
          return { conversations: {}, rows: [{ id: 'c1', title: 'one' }] };
        },
        check(b) {
          assert(b.conversations.conversations === b.rows, 'the rows did not reach the sidebar element');
        },
      },
    ],
    // The claim in the note -- "kai-chat has no conversations prop" -- is the
    // half a plain execution cannot see, because assigning to a plain object
    // succeeds whatever the property is called. Check it against the derived
    // layer instead, which is where the fact actually lives.
    corroborate({ derivedProp }) {
      assert(!derivedProp('kai-chat', 'conversations'), 'kai-chat DOES have a conversations prop; the example is stale');
      assert(derivedProp('kai-conversations', 'conversations'), 'kai-conversations has no conversations prop');
    },
  },

  'host-coordinates#1': {
    stubs: [],
    cases: [
      {
        label: 'event out of A, property into B',
        bindings() {
          return {
            conversations: new EventTarget(),
            chat: {},
            threadsById: { c1: [{ id: 'm1', role: 'user', parts: [] }] },
          };
        },
        check(b) {
          b.conversations.dispatchEvent(new CustomEvent('kai-conversation-select', { detail: { id: 'c1' } }));
          assert(b.chat.messages === b.threadsById.c1, 'the selected thread never reached kai-chat.messages');
        },
      },
    ],
    corroborate({ derivedEvents, derivedProp }) {
      assert(
        derivedEvents('kai-conversations').includes('kai-conversation-select'),
        'kai-conversations does not dispatch kai-conversation-select in the derived layer',
      );
      assert(derivedProp('kai-chat', 'messages'), 'kai-chat has no messages prop in the derived layer');
    },
  },

  'untrusted-model-output#0': {
    stubs: [],
    cases: [
      {
        label: 'markup stays inert AND the source text stays visible',
        bindings() {
          return { el: {}, part: { text: '<img src=x onerror=alert(1)>' } };
        },
        check(b) {
          assert(b.el.textContent === b.part.text, 'the text was altered; escaping must keep it VISIBLE');
          assert(b.el.innerHTML === undefined, 'innerHTML was written to');
        },
      },
    ],
  },

  'untrusted-model-output#1': {
    stubs: ['window.open', 'location'],
    cases: [
      {
        label: 'an https URL opens',
        bindings: () => navigableBindings('https://example.com/x'),
        check(b) {
          assert(b.__opened.length === 1, 'a legitimate https link was blocked');
          assert(b.__opened[0][2] === 'noopener,noreferrer', 'window.open lost noopener,noreferrer');
        },
      },
      {
        label: 'a relative URL opens (resolved against the page)',
        bindings: () => navigableBindings('/help'),
        check(b) {
          assert(b.__opened.length === 1, 'an ordinary relative link was blocked; the base is what keeps those working');
        },
      },
      {
        label: 'javascript: is blocked',
        bindings: () => navigableBindings('javascript:alert(1)'),
        check(b) {
          assert(b.__opened.length === 0, 'javascript: reached window.open');
        },
      },
      {
        label: 'an unparseable URL RETURNS FALSE rather than throwing',
        bindings: () => navigableBindings('http://['),
        check(b) {
          assert(b.__opened.length === 0, 'an unparseable URL reached window.open');
        },
      },
    ],
  },

  'untrusted-model-output#2': {
    jsx: true,
    stubs: [],
    cases: [
      {
        label: 'an https citation renders as a link with rel',
        bindings: () => citationBindings('https://example.com/paper'),
        check(b) {
          assert(b.__rendered.length === 1, 'nothing rendered');
          assert(b.__rendered[0].tag === 'a', `rendered <${b.__rendered[0].tag}>, expected <a>`);
          assert(b.__rendered[0].props.rel === 'noopener noreferrer', 'the anchor lost rel="noopener noreferrer"');
        },
      },
      {
        label: 'javascript: falls back to a span, with the title still VISIBLE',
        bindings: () => citationBindings('javascript:alert(1)'),
        check(b) {
          assert(b.__rendered[0].tag === 'span', `rendered <${b.__rendered[0].tag}>, expected <span>`);
          assert(b.__rendered[0].kids.includes('T'), 'the title was deleted rather than kept visible');
        },
      },
      {
        label: 'a relative path is not a citation',
        bindings: () => citationBindings('/local/page'),
        check(b) {
          assert(b.__rendered[0].tag === 'span', 'a relative path was treated as a citation; there must be no base here');
        },
      },
      {
        label: 'an unparseable URL RETURNS FALSE rather than throwing past the ternary',
        bindings: () => citationBindings('http://['),
        check(b) {
          assert(b.__rendered.length === 1, 'a throw escaped the ternary and the fallback never rendered');
          assert(b.__rendered[0].tag === 'span', 'expected the span fallback');
        },
      },
    ],
  },

  'kit-parses-consumer-fetches#0': {
    // readOpenAIStream is the published package's, and this tree is not
    // guaranteed built, so the call is executed against a stand-in. The
    // corroboration below is what actually checks that the real symbol exists
    // and is reachable through the documented specifier.
    stubs: ['readOpenAIStream (stand-in; the real one lives behind the ./wire exports key)'],
    cases: [
      {
        label: 'the reader is awaited with (response, stream)',
        bindings() {
          const calls = [];
          return {
            res: { body: {} },
            stream: { message: {} },
            readOpenAIStream: async (r, s) => {
              calls.push([r, s]);
              return { finished: true };
            },
            __calls: calls,
          };
        },
        check(b) {
          assert(b.__calls.length === 1, 'the reader was never called');
          assert(b.__calls[0][0] === b.res && b.__calls[0][1] === b.stream, 'the reader got the wrong arguments');
        },
      },
    ],
    corroborate({ wireIndexSource, exportsKeys }) {
      assert(exportsKeys.includes('./wire'), 'package.json has no ./wire exports key');
      for (const name of ['readOpenAIStream', 'readAnthropicStream', 'readModelStream']) {
        assert(
          new RegExp(`export \\{[^}]*\\b${name}\\b[^}]*\\} from`).test(wireIndexSource),
          `${name} is not exported from src/wire/index.ts`,
        );
      }
    },
  },

  'kit-parses-consumer-fetches#1': {
    stubs: ['fetch', 'toOpenAIMessages (stand-in; the real one lives behind the ./wire exports key)'],
    cases: [
      {
        label: 'the consumer posts its OWN endpoint, with the thread encoded for the wire',
        bindings() {
          const captured = {};
          return {
            history: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
            toOpenAIMessages: (h) => h.map((m) => ({ role: m.role, content: 'hi' })),
            fetch: async (url, init) => {
              captured.url = url;
              captured.init = init;
              return { ok: true };
            },
            __captured: captured,
          };
        },
        check(b) {
          assert(b.__captured.url === '/api/chat', `posted to ${b.__captured.url}, not the consumer's own endpoint`);
          assert(b.__captured.init.method === 'POST', 'not a POST');
          const body = JSON.parse(b.__captured.init.body);
          assert(Array.isArray(body.messages) && body.messages.length === 1, 'the encoded thread did not travel');
          assert(
            !JSON.stringify(b.__captured.init.headers).toLowerCase().includes('authorization'),
            'a provider credential appears in the request; the consumer endpoint must not carry one',
          );
        },
      },
    ],
    corroborate({ wireIndexSource }) {
      for (const name of ['toOpenAIMessages', 'toAnthropicMessages']) {
        assert(
          new RegExp(`export \\{[^}]*\\b${name}\\b[^}]*\\} from`).test(wireIndexSource),
          `${name} is not exported from src/wire/index.ts`,
        );
      }
    },
  },

  'upgrade-race#0': {
    stubs: ['customElements'],
    cases: [
      {
        label: 'the property is NOT set before the element is defined, and IS set after',
        bindings: () => whenDefinedBindings(),
        async check(b) {
          assert(b.chat.messages === undefined, 'the property was set before registration; that set would be lost');
          b.__define();
          await b.__settled();
          assert(b.chat.messages === b.messages, 'the property was never set after registration');
          assert(b.__asked[0] === 'kai-chat', `whenDefined was asked for ${b.__asked[0]}`);
        },
      },
    ],
    corroborate({ derivedTags }) {
      assert(derivedTags.has('kai-chat'), 'kai-chat is not a real tag in the derived layer');
    },
  },

  'upgrade-race#1': {
    // The same `right` form as #0 -- deliberately, because the record pairs it
    // against a second wrong form (DOMContentLoaded). Executed again rather than
    // aliased: an alias would stop running the day the two diverge.
    stubs: ['customElements'],
    cases: [
      {
        label: 'the same guarantee, reached from the DOMContentLoaded mistake',
        bindings: () => whenDefinedBindings(),
        async check(b) {
          assert(b.chat.messages === undefined, 'the property was set before registration');
          b.__define();
          await b.__settled();
          assert(b.chat.messages === b.messages, 'the property was never set after registration');
        },
      },
    ],
  },
};

function navigableBindings(url) {
  const opened = [];
  return {
    card: { url },
    location: { href: 'https://site.test/page' },
    window: { open: (u, target, features) => opened.push([u, target, features]) },
    __opened: opened,
  };
}

function citationBindings(url) {
  const rendered = [];
  return {
    source: { url, title: 'T' },
    __h: (tag, props, ...kids) => {
      const node = { tag, props, kids };
      rendered.push(node);
      return node;
    },
    __rendered: rendered,
  };
}

function whenDefinedBindings() {
  const asked = [];
  const d = deferred();
  const messages = [{ id: 'm1', role: 'user', parts: [] }];
  return {
    chat: {},
    messages,
    customElements: {
      whenDefined: (tag) => {
        asked.push(tag);
        return d.promise;
      },
    },
    __asked: asked,
    __define: () => d.resolve(),
    // One turn is not enough: the fragment's `.then` is queued behind the
    // resolution, so wait until the microtask queue has actually drained.
    __settled: async () => {
      await d.promise;
      await null;
      await null;
    },
  };
}

/**
 * Run the floor over a list of invariant records.
 *
 * Returns `{ ok, results, errors }`. `errors` holds the structural failures
 * (missing or dangling harness); `results` holds one row per example. Nothing is
 * skipped and nothing is silently tolerated: a row with no harness is an error,
 * not an absence.
 */
export async function runFloor(invariants, helpers, { harnesses = HARNESSES } = {}) {
  const errors = [];
  const results = [];
  const seen = new Set();

  for (const inv of invariants) {
    for (let i = 0; i < inv.examples.length; i++) {
      const key = `${inv.id}#${i}`;
      const harness = harnesses[key];
      if (!harness) {
        errors.push(
          `no harness for ${key}. Every examples[].right must be executed; add a harness in scripts/lib/invariant-floor.mjs binding its free variables, or the example stops being measured.`,
        );
        results.push({ key, invariant: inv.id, index: i, status: 'no-harness', stubs: [], cases: [] });
        continue;
      }
      seen.add(key);

      const row = { key, invariant: inv.id, index: i, status: 'passed', stubs: harness.stubs ?? [], cases: [] };
      for (const c of harness.cases) {
        const bindings = c.bindings();
        try {
          await execute(inv.examples[i].right, bindings, { jsx: harness.jsx });
          await c.check(bindings, helpers);
          row.cases.push({ label: c.label, status: 'passed' });
        } catch (err) {
          row.status = 'failed';
          row.cases.push({ label: c.label, status: 'failed', error: String(err && err.message ? err.message : err) });
        }
      }
      if (harness.corroborate) {
        try {
          await harness.corroborate(helpers);
          row.corroboration = 'passed';
        } catch (err) {
          row.status = 'failed';
          row.corroboration = `failed: ${err && err.message ? err.message : err}`;
        }
      }
      if (row.status === 'failed') errors.push(`${key}: ${row.cases.filter((c) => c.status === 'failed').map((c) => c.label).join('; ') || row.corroboration}`);
      results.push(row);
    }
  }

  for (const key of Object.keys(harnesses)) {
    if (!seen.has(key)) {
      errors.push(
        `dangling harness ${key}: no such invariant example. The table is checking code that no longer exists, which is how a healthy-looking count outlives the thing it counts.`,
      );
    }
  }

  return { ok: errors.length === 0, results, errors };
}

export function formatFloor({ results, errors }) {
  const lines = [];
  for (const r of results) {
    const stub = r.stubs.length ? `  [stubbed: ${r.stubs.join(', ')}]` : '';
    lines.push(`${r.status === 'passed' ? 'PASS' : 'FAIL'}  ${r.key}${stub}`);
    for (const c of r.cases) {
      lines.push(`        ${c.status === 'passed' ? '·' : '✗'} ${c.label}${c.error ? ` -- ${c.error}` : ''}`);
    }
    if (r.corroboration) lines.push(`        corroboration: ${r.corroboration}`);
  }
  for (const e of errors) lines.push(`ERROR ${e}`);
  return lines.join('\n');
}

/**
 * POSITIVE CONTROL. A stage that reports "every example ran" is worth nothing
 * until it has been watched to FAIL, so this plants four faults and requires the
 * runner to report each one:
 *
 *   1. a `right` that throws (an undeclared free variable),
 *   2. a `right` that executes cleanly but violates its own claim,
 *   3. an example with no harness at all,
 *   4. a harness whose example does not exist.
 *
 * Plus one control that must PASS, so "reports everything as failed" cannot
 * masquerade as a working detector.
 */
export async function selfTest(helpers) {
  const probes = [
    {
      id: 'zz-throws',
      examples: [{ wrong: 'x', right: 'notDeclaredAnywhere.messages = [];' }],
    },
    {
      id: 'zz-silently-wrong',
      // Executes fine. Sets the SAME array back, which is precisely the mistake
      // reactivity-two-halves exists to prevent -- so the check must catch it.
      examples: [{ wrong: 'x', right: 'chat.messages = messages;' }],
    },
    { id: 'zz-unharnessed', examples: [{ wrong: 'x', right: 'const ok = 1;' }] },
    { id: 'zz-good', examples: [{ wrong: 'x', right: 'chat.messages = [...messages];' }] },
  ];

  const probeHarnesses = {
    'zz-throws#0': { stubs: [], cases: [{ label: 'throws', bindings: () => ({}), check: () => {} }] },
    'zz-silently-wrong#0': {
      stubs: [],
      cases: [
        {
          label: 'must notice the same array reference',
          bindings: () => ({ chat: {}, messages: [1] }),
          check(b) {
            assert(b.chat.messages !== b.messages, 'same array reference');
          },
        },
      ],
    },
    'zz-good#0': {
      stubs: [],
      cases: [
        {
          label: 'a fresh array is a fresh array',
          bindings: () => ({ chat: {}, messages: [1] }),
          check(b) {
            assert(b.chat.messages !== b.messages, 'same array reference');
          },
        },
      ],
    },
    'zz-dangling#0': { stubs: [], cases: [] },
  };

  const { results, errors } = await runFloor(probes, helpers, { harnesses: probeHarnesses });
  const status = (key) => results.find((r) => r.key === key)?.status;

  const expectations = [
    ['a right form that throws is reported failed', status('zz-throws#0') === 'failed'],
    ['a right form that executes but violates its claim is reported failed', status('zz-silently-wrong#0') === 'failed'],
    ['an example with no harness is reported, not skipped', status('zz-unharnessed#0') === 'no-harness'],
    ['a missing harness raises a structural error', errors.some((e) => e.includes('no harness for zz-unharnessed#0'))],
    ['a dangling harness raises a structural error', errors.some((e) => e.includes('dangling harness zz-dangling#0'))],
    ['a correct right form still passes', status('zz-good#0') === 'passed'],
  ];

  const failed = expectations.filter(([, ok]) => !ok).map(([what]) => what);

  // The consistency guard the packer relies on, self-tested here for the same
  // reason: a check that has never been watched to fire is not a check.
  const enrichmentFailures = [];
  try {
    assertEnrichmentCovers([{ tag: 'kai-a' }, { tag: 'kai-b' }], [{ tag: 'kai-a' }]);
    enrichmentFailures.push('a missing element-meta entry was NOT detected');
  } catch {
    /* expected */
  }
  try {
    assertEnrichmentCovers([{ tag: 'kai-a' }], [{ tag: 'kai-a' }]);
  } catch (err) {
    enrichmentFailures.push(`a matching pair was wrongly rejected: ${err.message}`);
  }

  return { ok: failed.length === 0 && enrichmentFailures.length === 0, failed: [...failed, ...enrichmentFailures], expectations };
}

/**
 * derived.json and element-meta.json are written by the same `build:api` run, so
 * they agree by construction -- until one of them is regenerated alone. The pack
 * reads the element SPINE from derived.json and the prose (types, defaults,
 * slots, docs) from element-meta.json, so a divergence would silently produce
 * element pages with no types on them. Decide loudly: fail instead.
 */
export function assertEnrichmentCovers(derivedElements, metaElements) {
  const metaTags = new Set(metaElements.map((m) => m.tag));
  const missing = derivedElements.map((e) => e.tag).filter((t) => !metaTags.has(t));
  if (missing.length) {
    throw new Error(
      `element-meta.json is missing ${missing.length} element(s) that derived.json has: ${missing.join(', ')}. ` +
        'The two artifacts have diverged -- regenerate both with `npm run build:api` inside packages/ui.',
    );
  }
}
