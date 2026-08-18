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
// the example claims. Missing harness = HARD FAILURE, never a skip, and so is a
// harness with an EMPTY `cases` list: an empty list ran the loop zero times and
// reported PASS, which is the exact shape of vacuity this stage exists to
// prevent. Both are checked, and both are watched failing in `--self-test`.
//
// A dangling harness -- one whose example was deleted or renumbered -- is also a
// hard failure, in the other direction. Otherwise the table rots into a set of
// checks over code that no longer exists while reporting a healthy count.
//
// ASYNC CONTINUATIONS ARE NOT OUTSIDE THE MEASUREMENT. `execute` awaits the
// fragment's own IIFE, which resolves the moment the fragment RETURNS -- so a
// throw inside a `.then`, a timer or a listener happens afterwards, in the vm
// realm, and used to vanish. `withAsyncFaultTrap` spans execution AND the
// harness check, drains the queues, and turns any late rejection into a
// failure. `upgrade-race` is entirely about what happens in a `.then`, so
// without this its whole subject was unmeasured.
//
// HONESTY ABOUT STAND-INS. Not one example runs against the real registered
// element: this is a Node script and the elements need a built bundle and the
// Solid runtime. Every harness therefore names its stand-ins in `stubs`,
// including the ones it would be easy to leave unstated -- the jsdom document,
// the plain object standing in for an element, the JSX factory. The report
// prints them, and the pack's own wording says "executed against these
// stand-ins" rather than "executed", because the second sentence is not true.
// Where a stand-in is the SUBJECT of the claim, the harness carries a
// `corroborate` step that checks the real thing by another route.
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as esbuild from 'esbuild';

class FloorAssertionError extends Error {}

function assert(cond, msg) {
  if (!cond) throw new FloorAssertionError(msg);
}

// ---------------------------------------------------------------------------
// THE FAULT SINK -- one, for the whole process
// ---------------------------------------------------------------------------
//
// THREE SOURCES, and the third was missing until review found it. A fragment
// can fail after it returns in a `.then` (an unhandled rejection), in a timer
// (an uncaught exception) -- and inside a DOM EVENT LISTENER, which is neither:
// jsdom catches a listener's exception and routes it to its VIRTUAL CONSOLE, so
// no process-level handler ever sees it. `events-non-bubbling#0`'s right form
// IS a listener, so that hole sat on the live path, and the floor printed PASS
// over a listener that threw.
//
// ONE SINK, INSTALLED ONCE, rather than listeners added and removed per case.
// Per-case listeners meant a fault arriving between two windows was blamed on
// whichever window happened to be open next -- a chain of five nested 0ms
// timers outlived the drain and was attributed to the NEXT example. Faults now
// carry the window that was open when they were RECORDED, `null` means no
// window was open, and an unattributed fault is reported as its own structural
// failure rather than folded into an innocent row.
const FAULTS = [];
let currentWindow = null;

const record = (err, owner = currentWindow, promise = undefined) => {
  FAULTS.push({
    window: owner,
    error: err && err.message ? err.message : String(err),
    consumed: false,
    retracted: false,
    promise,
  });
};

/** Faults that still count: not retracted by a later handler. */
const liveFaults = (list) => list.filter((f) => !f.retracted);

/**
 * Timers a fragment schedules, OWNED by the case that scheduled them.
 *
 * Attribution by "which window was open when the fault landed" is attribution by
 * clock, and the clock is the one thing a late fault is guaranteed to have moved
 * past: a 50ms timer, or a chain of nested 0ms ones, lands inside the NEXT
 * example's window and gets blamed on correct code. Wrapping the callback here
 * makes ownership structural instead -- whoever scheduled it owns the throw,
 * whenever it happens.
 *
 * Rejections from a `.then` are the one route still attributed by clock; they
 * normally settle inside their own drain, and the residual is stated in the
 * floor report rather than papered over.
 */
function ownedTimers(owner) {
  const wrap = (fn) => (...a) => {
    // `currentWindow` is set for the duration too, not just the try/catch: a
    // `Promise.reject` CREATED inside the callback surfaces later through
    // `unhandledRejection`, which reads the clock. Without this line that
    // rejection was blamed on whichever example happened to be running -- the
    // same misattribution, surviving on the one route the try/catch cannot see.
    const previous = currentWindow;
    currentWindow = owner;
    try {
      return fn(...a);
    } catch (err) {
      record(err, owner);
    } finally {
      // Restored on the NEXT macrotask turn, not synchronously. Node fires
      // `unhandledRejection` at the end of the current tick's microtask drain --
      // AFTER a synchronous `finally` would have put the window back -- so a
      // rejection created inside this callback would read the clock again. The
      // identity guard means a window that opened meanwhile is never stomped.
      setTimeout(() => {
        if (currentWindow === owner) currentWindow = previous;
      }, 0);
    }
  };
  return {
    setTimeout: (fn, ms, ...a) => setTimeout(wrap(fn), ms, ...a),
    setInterval: (fn, ms, ...a) => setInterval(wrap(fn), ms, ...a),
    queueMicrotask: (fn) => queueMicrotask(wrap(fn)),
  };
}
// ONE ARGUMENT ONLY. Node calls these listeners with a SECOND argument -- the
// rejected promise, or the origin string -- and passing `record` directly meant
// that argument landed in the `owner` slot, so a fault's window became a Promise
// object and the sweep threw on `window.startsWith`. That rejection was then
// swallowed by this very handler and the run HUNG, exiting 0 with no output.
// Found by the hang; the `completed` guard in the packer exists so a silent
// exit-0 can never look like success again.
process.on('unhandledRejection', (reason, promise) => record(reason, currentWindow, promise));
// N6: a rejection handled a tick later is NOT a failure. Without this the exit
// guard deletes the pack of a run that did nothing wrong -- the false-positive
// twin of deleting the wrong directory, and just as bad for a runner that has to
// trust the verdict.
process.on('rejectionHandled', (promise) => {
  const f = FAULTS.find((x) => x.promise === promise);
  if (f) f.retracted = true;
});
// A persistent `uncaughtException` handler stops Node crashing, which is the
// point: a crash after the pack is on disk leaves a pack that looks written.
// Nothing is swallowed -- every fault reaches the sink, and the sink is what
// decides the exit code and whether the pack survives.
process.on('uncaughtException', (err) => record(err));

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (err) => record(err));

/** One jsdom realm, reused. Elements are created fresh per case. */
const dom = new JSDOM('<!doctype html><html><body><div id="wrapper"></div></body></html>', { virtualConsole });
const W = dom.window;

/** How many faults have been seen so far — the caller's acknowledgement mark. */
export const faultCount = () => FAULTS.length;
/** Everything recorded after `mark`, for the late-fault guard. */
export const faultsSince = (mark) => liveFaults(FAULTS.slice(mark));

/**
 * Wall-clock settle, for faults scheduled further out than the per-case drain
 * reaches. Bounded and stated rather than open-ended: `SETTLE_MS` is the window
 * inside which a late fault still results in ZERO files written. Anything later
 * than this is caught by the process-exit guard instead, which removes the pack
 * rather than leaving one that claims success.
 */
export const SETTLE_MS = 250;
export async function settle(ms = SETTLE_MS) {
  const until = Date.now() + ms;
  while (Date.now() < until) await new Promise((r) => setTimeout(r, 10));
}

/**
 * A stand-in for a registered `kai-*` element: a real custom element in a real
 * document, dispatching with the SAME `{ bubbles: false, composed: false }` the
 * kit's own dispatch helper hard-codes. It is not the kit's element -- that
 * needs a build and the Solid runtime -- but it does put the claim under test on
 * a real DOM tree, which a bare `EventTarget` cannot: with an EventTarget,
 * bubbling is unrepresentable, so `document = chat` would satisfy "the listener
 * on the element fires" and the assertion could not tell the invariant from its
 * own negation.
 */
class StandInElement extends W.HTMLElement {}
W.customElements.define('kai-standin', StandInElement);

function standInElement() {
  const wrapper = W.document.createElement('div');
  const el = W.document.createElement('kai-standin');
  wrapper.appendChild(el);
  W.document.body.appendChild(wrapper);
  return { el, wrapper, doc: W.document };
}

/** A promise whose resolution the harness controls, for the upgrade-race timing check. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// The drain is bounded, and the bound is stated because it is the honest limit
// of per-case attribution: turns are pumped until QUIET_TURNS consecutive turns
// record nothing new, up to MAX_TURNS. A chain of nested 0ms timers therefore
// completes inside its own window instead of surfacing in the next one; a fault
// scheduled beyond it is handled by `settle()` and, past that, by the caller's
// exit guard.
// Only ever waited on the failure path: a rejection handled a tick later must be
// allowed to retract itself before a case is called failed.
const REJECTION_GRACE_MS = 60;
const MIN_TURNS = 4;
const QUIET_TURNS = 3;
const MAX_TURNS = 40;

/**
 * Run `fn` under `label`, drain to quiescence, and fail if anything went wrong
 * ASYNCHRONOUSLY -- in a `.then`, in a timer, or inside a DOM event listener --
 * after the awaited work resolved. All three routes are measured, not assumed:
 * `--self-test` plants one of each and requires each to be reported.
 */
async function withAsyncFaultTrap(label, fn) {
  const mark = FAULTS.length;
  currentWindow = label;
  try {
    await fn();
    let quiet = 0;
    for (let i = 0; i < MAX_TURNS && (i < MIN_TURNS || quiet < QUIET_TURNS); i++) {
      const before = FAULTS.length;
      await new Promise((r) => setTimeout(r, 0));
      quiet = FAULTS.length === before ? quiet + 1 : 0;
    }
  } finally {
    currentWindow = null;
  }
  // ONLY this window's own faults. Slicing by index alone claims whatever landed
  // during the window, so a timer another case scheduled would fail an innocent
  // one -- the same misattribution, moved rather than fixed. A fault with a
  // different owner, or none, is left for the post-run sweep.
  const own = () => liveFaults(FAULTS.slice(mark)).filter((f) => f.window === label);
  let mine = own();
  if (mine.length) {
    // A rejection that gets a handler slightly later is not a failure, and
    // `rejectionHandled` can arrive after the drain has stopped. Pay this only
    // on the failure path, so a clean run costs nothing.
    await new Promise((r) => setTimeout(r, REJECTION_GRACE_MS));
    mine = own();
  }
  if (mine.length) {
    for (const f of mine) f.consumed = true;
    throw new FloorAssertionError(
      `failed AFTER returning, in an async continuation: ${mine.map((f) => f.error).join('; ')}`,
    );
  }
}

/**
 * Execute one `right` fragment with the supplied bindings as its globals.
 *
 * Wrapped in an async IIFE so a fragment containing top-level `await` runs at
 * all, and awaited so a synchronous rejection surfaces as a failure. What
 * happens after it returns is `withAsyncFaultTrap`'s job.
 */
async function execute(code, bindings, { jsx = false, owner = null } = {}) {
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
    // Before `...bindings`, so a harness can still override one deliberately.
    ...ownedTimers(owner),
    ...bindings,
  });
  await vm.runInContext(`(async () => {\n${src}\n})()`, context, { timeout: 2000 });
}

const JSDOM_STANDIN = 'a jsdom document + a stand-in custom element (not the kit’s registered element)';

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
    stubs: ['`chat` is a plain object, not a registered element'],
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
    stubs: ['`chat` is a plain object, not a registered element'],
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
    stubs: [JSDOM_STANDIN],
    cases: [
      {
        label: 'the array lands as a JS PROPERTY and no attribute is written',
        bindings() {
          const { el } = standInElement();
          return { el, messages: [{ id: 'm1', role: 'user', parts: [] }] };
        },
        check(b) {
          assert(Array.isArray(b.el.messages), 'the property does not hold an array');
          assert(b.el.messages === b.messages, 'the property is a copy, not the array that was assigned');
          // The half a plain object cannot express, and the half the invariant
          // is actually about: the right form must NOT take the attribute path.
          // On a bare `{}` this assertion is a tautology of JS assignment; on a
          // real element it distinguishes the two mechanisms.
          assert(b.el.getAttribute('messages') === null, 'an attribute was written; that is the path that stringifies');
          assert(!b.el.outerHTML.includes('messages='), `the element serialised with an attribute: ${b.el.outerHTML}`);
        },
      },
    ],
  },

  'props-not-attributes#1': {
    stubs: [JSDOM_STANDIN],
    cases: [
      {
        label: 'a function survives a property assignment (and demonstrably would not survive an attribute)',
        bindings() {
          const { el } = standInElement();
          return { cards: el, onSubmit: () => 'called' };
        },
        check(b) {
          assert(typeof b.cards.policy.onSubmit === 'function', 'the callback is not a function on the property');
          assert(b.cards.policy.onSubmit() === 'called', 'the callback is not the one that was assigned');
          assert(b.cards.getAttribute('policy') === null, 'an attribute was written');
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
    stubs: [JSDOM_STANDIN],
    cases: [
      {
        label: 'the listener on the element fires; the same listener on a parent and on document does NOT',
        bindings() {
          const { el, wrapper, doc } = standInElement();
          const got = [];
          const missed = [];
          wrapper.addEventListener('kai-submit', () => missed.push('wrapper'));
          doc.addEventListener('kai-submit', () => missed.push('document'));
          return { chat: el, send: (v) => got.push(v), __got: got, __missed: missed, __el: el };
        },
        check(b) {
          b.__el.dispatchEvent(new W.CustomEvent('kai-submit', { detail: { value: 'hello' }, bubbles: false, composed: false }));
          assert(b.__got.length === 1, `listener on the element fired ${b.__got.length} times, expected 1`);
          assert(b.__got[0] === 'hello', `handler read ${JSON.stringify(b.__got[0])}, expected "hello"`);
          // Without this, `document = chat` satisfies the assertion above and
          // the check cannot tell the invariant from its opposite.
          assert(b.__missed.length === 0, `a delegated listener fired on: ${b.__missed.join(', ')}`);
        },
      },
    ],
    corroborate({ derivedEvents, defineSource }) {
      assert(derivedEvents('kai-chat').includes('kai-submit'), 'kai-chat does not dispatch kai-submit in the derived layer');
      // The stand-in dispatches non-bubbling because the kit's helper does. If
      // that stops being true, the stand-in is modelling nothing.
      assert(/bubbles:\s*false/.test(defineSource), 'src/elements/define.tsx no longer hard-codes bubbles: false');
      assert(/composed:\s*false/.test(defineSource), 'src/elements/define.tsx no longer hard-codes composed: false');
    },
  },

  'events-non-bubbling#1': {
    stubs: [JSDOM_STANDIN],
    cases: [
      {
        label: 'the same shape for a non-submit event, with the wrapper proven silent',
        bindings() {
          const { el, wrapper, doc } = standInElement();
          const calls = [];
          const missed = [];
          wrapper.addEventListener('kai-message-action', () => missed.push('wrapper'));
          doc.addEventListener('kai-message-action', () => missed.push('document'));
          return { chat: el, handleAction: (e) => calls.push(e.type), __calls: calls, __missed: missed, __el: el };
        },
        check(b) {
          b.__el.dispatchEvent(new W.CustomEvent('kai-message-action', { detail: {}, bubbles: false, composed: false }));
          assert(b.__calls.length === 1, 'the listener on the element did not fire');
          assert(b.__calls[0] === 'kai-message-action', `fired for ${b.__calls[0]}`);
          assert(b.__missed.length === 0, `a delegated listener fired on: ${b.__missed.join(', ')}`);
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
    stubs: [JSDOM_STANDIN],
    cases: [
      {
        label: 'the rows land on the element that owns the list',
        bindings() {
          const { el } = standInElement();
          return { conversations: el, rows: [{ id: 'c1', title: 'one' }] };
        },
        check(b) {
          assert(b.conversations.conversations === b.rows, 'the rows did not reach the sidebar element');
        },
      },
    ],
    // The claim in the note -- "kai-chat has no conversations prop" -- is the
    // half no execution can see, because assigning to any object succeeds
    // whatever the property is called. Check it against the derived layer
    // instead, which is where the fact actually lives.
    corroborate({ derivedProp }) {
      assert(!derivedProp('kai-chat', 'conversations'), 'kai-chat DOES have a conversations prop; the example is stale');
      assert(derivedProp('kai-conversations', 'conversations'), 'kai-conversations has no conversations prop');
    },
  },

  'host-coordinates#1': {
    stubs: [JSDOM_STANDIN],
    cases: [
      {
        label: 'event out of A, property into B -- and no parent listener is involved',
        bindings() {
          const { el, wrapper } = standInElement();
          const chat = W.document.createElement('kai-standin');
          const missed = [];
          wrapper.addEventListener('kai-conversation-select', () => missed.push('wrapper'));
          return {
            conversations: el,
            chat,
            threadsById: { c1: [{ id: 'm1', role: 'user', parts: [] }] },
            __el: el,
            __missed: missed,
          };
        },
        check(b) {
          b.__el.dispatchEvent(
            new W.CustomEvent('kai-conversation-select', { detail: { id: 'c1' }, bubbles: false, composed: false }),
          );
          assert(b.chat.messages === b.threadsById.c1, 'the selected thread never reached kai-chat.messages');
          assert(b.__missed.length === 0, 'a parent listener saw the event');
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
    stubs: [JSDOM_STANDIN],
    cases: [
      {
        label: 'the markup becomes a TEXT NODE -- inert by parse, not by a name-matched sink check',
        bindings() {
          const { el } = standInElement();
          return { el, part: { text: '<img src=x onerror=alert(1)>' } };
        },
        check(b) {
          // Asserting `innerHTML === undefined` on a plain object would be blind
          // to outerHTML, insertAdjacentHTML and every other HTML sink. Asking
          // the real DOM what it PARSED covers all of them at once.
          assert(b.el.querySelector('img') === null, 'the markup was parsed into an element');
          assert(b.el.childNodes.length === 1, `expected one child node, got ${b.el.childNodes.length}`);
          assert(b.el.childNodes[0].nodeType === 3, 'the child is not a text node');
          assert(b.el.textContent === b.part.text, 'the text was altered; escaping must keep it VISIBLE');
        },
      },
    ],
  },

  'untrusted-model-output#1': {
    stubs: ['`window.open` and `location` (no browser here)'],
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
    stubs: ['a recording JSX factory instead of a framework renderer'],
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
    // corroboration is what checks the real symbol exists and is reachable
    // through the documented specifier.
    stubs: ['`readOpenAIStream` (stand-in; the real one lives behind the ./wire exports key)'],
    cases: [
      {
        label: 'the reader is called with (response, stream) AND its result is awaited',
        bindings() {
          const calls = [];
          const marks = [];
          return {
            res: { body: {} },
            stream: { message: {} },
            // A thenable rather than an async function: `then` is called ONLY if
            // the caller awaits. Without this the label's word "awaited" was
            // claiming something nothing checked.
            readOpenAIStream: (r, s) => {
              calls.push([r, s]);
              return {
                then(resolve) {
                  marks.push('awaited');
                  resolve({ finished: true });
                },
              };
            },
            __calls: calls,
            __marks: marks,
          };
        },
        check(b) {
          assert(b.__calls.length === 1, 'the reader was never called');
          assert(b.__calls[0][0] === b.res && b.__calls[0][1] === b.stream, 'the reader got the wrong arguments');
          assert(b.__marks.includes('awaited'), 'the result was never awaited; the turn would be used before it is filled');
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
    stubs: ['`fetch`', '`toOpenAIMessages` (stand-in; the real one lives behind the ./wire exports key)'],
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
    stubs: ['`customElements` (a controllable whenDefined, so the BEFORE state is observable)'],
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
    stubs: ['`customElements` (a controllable whenDefined, so the BEFORE state is observable)'],
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

/** A stable, human-readable discriminator, so an inserted example does not make every message point at the wrong line. */
const describeExample = (inv, i) => {
  const wrong = inv.examples[i]?.wrong ?? '(no such example)';
  return `${inv.id}#${i} (wrong: ${wrong.slice(0, 48)}${wrong.length > 48 ? '…' : ''})`;
};

/**
 * Run the floor over a list of invariant records.
 *
 * Returns `{ ok, results, errors }`. `errors` holds the structural failures
 * (missing harness, empty harness, dangling harness); `results` holds one row
 * per example. Nothing is skipped and nothing is silently tolerated.
 */
export async function runFloor(invariants, helpers, { harnesses = HARNESSES } = {}) {
  const startMark = FAULTS.length;
  const errors = [];
  const results = [];
  const seen = new Set();

  for (const inv of invariants) {
    for (let i = 0; i < inv.examples.length; i++) {
      const key = `${inv.id}#${i}`;
      const where = describeExample(inv, i);
      const harness = harnesses[key];
      if (!harness) {
        errors.push(
          `no harness for ${where}. Every examples[].right must be executed; add a harness in scripts/lib/invariant-floor.mjs binding its free variables, or the example stops being measured.`,
        );
        results.push({ key, where, invariant: inv.id, index: i, status: 'no-harness', stubs: [], cases: [] });
        continue;
      }
      seen.add(key);

      // An empty case list runs the loop zero times and reports PASS. That is
      // the vacuity this whole stage exists to prevent, so it is an error in its
      // own right rather than a quietly green row.
      if (!harness.cases || harness.cases.length === 0) {
        errors.push(
          `the harness for ${where} has NO CASES, so the right form is never executed. An empty case list reports PASS while measuring nothing.`,
        );
        results.push({ key, where, invariant: inv.id, index: i, status: 'no-cases', stubs: harness.stubs ?? [], cases: [] });
        continue;
      }

      const row = { key, where, invariant: inv.id, index: i, status: 'passed', stubs: harness.stubs ?? [], cases: [] };
      for (const c of harness.cases) {
        const bindings = c.bindings();
        try {
          // The trap spans BOTH, because upgrade-race's `.then` only runs
          // during the check and a throw there would otherwise vanish.
          const owner = `${key}: ${c.label}`;
          await withAsyncFaultTrap(owner, async () => {
            await execute(inv.examples[i].right, bindings, { jsx: harness.jsx, owner });
            await c.check(bindings, helpers);
          });
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
      if (row.status === 'failed') {
        // The case LABEL alone is not the finding -- it names what was being
        // checked, never what went wrong -- so the error text travels too.
        errors.push(
          `${where}: ${
            row.cases
              .filter((c) => c.status === 'failed')
              .map((c) => `${c.label} -- ${c.error}`)
              .join('; ') || row.corroboration
          }`,
        );
      }
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

  // Settle past the per-case drain before declaring the floor clean, so a fault
  // scheduled further out still lands INSIDE the run rather than after the pack
  // has been written. Bounded; the caller's exit guard covers anything later.
  await settle();

  // Anything that landed after its own case's window closed. It still carries
  // the case that SCHEDULED it, so it is reported against that case rather than
  // against whichever example happened to be running -- sending a reader to
  // correct code is worse than saying "this could not be attributed".
  for (const f of liveFaults(FAULTS.slice(startMark)).filter((x) => !x.consumed)) {
    f.consumed = true;
    if (f.window) {
      errors.push(`${f.window}: failed after its case finished, in a continuation it scheduled: ${f.error}`);
      const row = results.find((r) => f.window.startsWith(`${r.key}:`));
      if (row) row.status = 'failed';
    } else {
      errors.push(
        `a fault arrived outside any measured window and carries no owner, so it cannot be attributed to a single example: ${f.error}.`,
      );
    }
  }

  return { ok: errors.length === 0, results, errors, mark: FAULTS.length };
}

export function formatFloor({ results, errors }) {
  const lines = [];
  for (const r of results) {
    const stub = r.stubs.length ? `  [stand-ins: ${r.stubs.join(', ')}]` : '';
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
 * until it has been watched to FAIL, so this plants six faults and requires the
 * runner to report each one:
 *
 *   1. a `right` that throws (an undeclared free variable),
 *   2. a `right` that executes cleanly but violates its own claim,
 *   3. a `right` that throws LATE, inside a `.then` after it has returned,
 *   4. an example with no harness at all,
 *   5. a harness with an EMPTY case list,
 *   6. a harness whose example does not exist.
 *
 * Plus one control that must PASS, so "reports everything as failed" cannot
 * masquerade as a working detector.
 */
export async function selfTest(helpers) {
  const probes = [
    { id: 'zz-throws', examples: [{ wrong: 'x', right: 'notDeclaredAnywhere.messages = [];' }] },
    {
      id: 'zz-silently-wrong',
      // Executes fine. Sets the SAME array back, which is precisely the mistake
      // reactivity-two-halves exists to prevent -- so the check must catch it.
      examples: [{ wrong: 'x', right: 'chat.messages = messages;' }],
    },
    {
      id: 'zz-late-throw',
      examples: [
        {
          wrong: 'x',
          right: "customElements.whenDefined('kai-chat').then(() => { chat.messages = messages; throw new Error('LATE BOOM'); });",
        },
      ],
    },
    {
      // jsdom routes a listener's exception to its virtual console, so neither
      // uncaughtException nor unhandledRejection sees it. This probe is the one
      // that would have caught the hole review found.
      id: 'zz-listener-throw',
      examples: [{ wrong: 'x', right: "chat.addEventListener('kai-submit', () => { throw new Error('LISTENER BOOM'); });" }],
    },
    {
      // Scheduled beyond the per-case drain but inside `settle()`.
      id: 'zz-beyond-drain',
      examples: [{ wrong: 'x', right: "setTimeout(() => { throw new Error('BEYOND DRAIN BOOM'); }, 120);" }],
    },
    {
      // N5: a rejection CREATED inside an owned timer. The try/catch cannot see
      // it -- it surfaces through unhandledRejection later -- so this is the one
      // shape where attribution could still fall back to the clock.
      id: 'zz-timer-reject',
      examples: [
        { wrong: 'x', right: "setTimeout(() => { Promise.reject(new Error('TIMER REJECT BOOM')); }, 60);" },
      ],
    },
    {
      // N6: a rejection that gets a handler a tick later is NOT a failure. The
      // guard must not delete the pack of a run that did nothing wrong.
      id: 'zz-handled-rejection',
      examples: [
        {
          wrong: 'x',
          right: "const p = Promise.reject(new Error('benign-handled')); setTimeout(() => p.catch(() => {}), 10);",
        },
      ],
    },
    {
      // The shape review measured: nested 0ms timers outlive any fixed number of
      // drain turns, and used to be blamed on the NEXT row.
      id: 'zz-nested-timers',
      examples: [
        {
          wrong: 'x',
          right:
            "setTimeout(() => setTimeout(() => setTimeout(() => setTimeout(() => setTimeout(() => setTimeout(() => { throw new Error('NESTED BOOM'); })))))); ",
        },
      ],
    },
    { id: 'zz-unharnessed', examples: [{ wrong: 'x', right: 'const ok = 1;' }] },
    { id: 'zz-no-cases', examples: [{ wrong: 'x', right: 'const ok = 1;' }] },
    { id: 'zz-good', examples: [{ wrong: 'x', right: 'chat.messages = [...messages];' }] },
  ];

  const freshArray = {
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
  };

  const probeHarnesses = {
    'zz-throws#0': { stubs: [], cases: [{ label: 'throws', bindings: () => ({}), check: () => {} }] },
    'zz-silently-wrong#0': freshArray,
    'zz-late-throw#0': {
      stubs: [],
      cases: [
        {
          label: 'a throw inside the .then must not vanish',
          bindings: () => whenDefinedBindings(),
          async check(b) {
            b.__define();
            await b.__settled();
          },
        },
      ],
    },
    'zz-listener-throw#0': {
      stubs: [],
      cases: [
        {
          label: 'a throw inside a DOM listener must not vanish into the virtual console',
          bindings() {
            const { el } = standInElement();
            return { chat: el, __el: el };
          },
          check(b) {
            b.__el.dispatchEvent(new W.CustomEvent('kai-submit', { detail: {}, bubbles: false, composed: false }));
          },
        },
      ],
    },
    'zz-beyond-drain#0': {
      stubs: [],
      cases: [{ label: 'schedules past the drain', bindings: () => ({}), check: () => {} }],
    },
    'zz-nested-timers#0': {
      stubs: [],
      cases: [{ label: 'schedules a nested chain', bindings: () => ({}), check: () => {} }],
    },
    'zz-timer-reject#0': {
      stubs: [],
      cases: [{ label: 'rejects from inside a timer', bindings: () => ({}), check: () => {} }],
    },
    'zz-handled-rejection#0': {
      stubs: [],
      cases: [{ label: 'a rejection that is handled a tick later', bindings: () => ({}), check: () => {} }],
    },
    'zz-no-cases#0': { stubs: [], cases: [] },
    'zz-good#0': freshArray,
    'zz-dangling#0': { stubs: [], cases: [{ label: 'never runs', bindings: () => ({}), check: () => {} }] },
  };

  const { results, errors } = await runFloor(probes, helpers, { harnesses: probeHarnesses });
  const status = (key) => results.find((r) => r.key === key)?.status;

  const expectations = [
    ['a right form that throws is reported failed', status('zz-throws#0') === 'failed'],
    ['a right form that executes but violates its claim is reported failed', status('zz-silently-wrong#0') === 'failed'],
    [
      'a right form that throws LATE, inside a .then, is reported failed',
      status('zz-late-throw#0') === 'failed' && errors.some((e) => e.includes('LATE BOOM')),
    ],
    [
      'a throw inside a DOM EVENT LISTENER is reported failed (jsdom hides these in its virtual console)',
      status('zz-listener-throw#0') === 'failed' && errors.some((e) => e.includes('LISTENER BOOM')),
    ],
    [
      'a fault scheduled BEYOND the per-case drain is blamed on the case that SCHEDULED it, not on another example',
      errors.some((e) => e.includes('BEYOND DRAIN BOOM') && e.startsWith('zz-beyond-drain#0')) &&
        !errors.some((e) => e.includes('BEYOND DRAIN BOOM') && !e.startsWith('zz-beyond-drain#0')),
    ],
    [
      'a chain of nested 0ms timers outliving the drain is also blamed on its own case',
      errors.some((e) => e.includes('NESTED BOOM') && e.startsWith('zz-nested-timers#0')) &&
        !errors.some((e) => e.includes('NESTED BOOM') && !e.startsWith('zz-nested-timers#0')),
    ],
    [
      'a REJECTION created inside an owned timer is blamed on its own case, not on the clock',
      errors.some((e) => e.includes('TIMER REJECT BOOM') && e.startsWith('zz-timer-reject#0')) &&
        !errors.some((e) => e.includes('TIMER REJECT BOOM') && !e.startsWith('zz-timer-reject#0')),
    ],
    [
      'a rejection HANDLED a tick later is not a failure at all',
      !errors.some((e) => e.includes('benign-handled')) && status('zz-handled-rejection#0') === 'passed',
    ],
    ['an example with no harness is reported, not skipped', status('zz-unharnessed#0') === 'no-harness'],
    ['a missing harness raises a structural error', errors.some((e) => e.includes('no harness for zz-unharnessed#0'))],
    ['a harness with an EMPTY case list is reported, not passed', status('zz-no-cases#0') === 'no-cases'],
    ['an empty case list raises a structural error', errors.some((e) => e.includes('NO CASES'))],
    ['a dangling harness raises a structural error', errors.some((e) => e.includes('dangling harness zz-dangling#0'))],
    ['a correct right form still passes', status('zz-good#0') === 'passed'],
  ];

  const failed = expectations.filter(([, ok]) => !ok).map(([what]) => what);

  // The artifact-agreement guard the packer relies on, self-tested here for the
  // same reason: a check that has never been watched to fire is not a check.
  // Each probe plants ONE divergence and requires it to be named.
  const good = [
    {
      tag: 'kai-a',
      props: [{ name: 'p', scalar: true, optional: true, fn: false }],
      events: ['kai-x'],
    },
  ];
  const goodMeta = [{ tag: 'kai-a', props: [{ name: 'p', scalar: true, type: 'string' }], events: [{ name: 'kai-x' }] }];
  const agreementProbes = [
    ['a tag only derived.json has', good, []],
    ['a tag only element-meta.json has', [], goodMeta],
    ['a prop only derived.json has', good, [{ ...goodMeta[0], props: [] }]],
    [
      'a prop only element-meta.json has',
      [{ ...good[0], props: [] }],
      goodMeta,
    ],
    ['an event only element-meta.json has', [{ ...good[0], events: [] }], goodMeta],
    [
      'a prop whose type makes it function-valued on one side only',
      good,
      [{ ...goodMeta[0], props: [{ name: 'p', scalar: true, type: '(x: string) => void' }] }],
    ],
    [
      'a prop whose scalar flag disagrees',
      good,
      [{ ...goodMeta[0], props: [{ name: 'p', scalar: false, type: 'string' }] }],
    ],
  ];
  const agreementFailures = [];
  for (const [what, d, m] of agreementProbes) {
    try {
      assertArtifactsAgree(d, m);
      agreementFailures.push(`NOT detected: ${what}`);
    } catch {
      /* expected */
    }
  }
  try {
    assertArtifactsAgree(good, goodMeta);
  } catch (err) {
    agreementFailures.push(`a matching pair was wrongly rejected: ${err.message}`);
  }
  for (const [what] of agreementProbes) {
    expectations.push([`artifact agreement detects ${what}`, !agreementFailures.includes(`NOT detected: ${what}`)]);
  }

  return {
    ok: failed.length === 0 && agreementFailures.length === 0,
    failed: [...failed, ...agreementFailures],
    expectations,
  };
}

/**
 * The generator's own rule for "is this prop a callback the consumer must
 * supply", restated here so the two artifacts can be cross-checked rather than
 * merely compared. Strip a leading `undefined | `, then function-valued iff the
 * remainder starts with `(` AND contains `=>`.
 */
function fnValuedFromType(type) {
  if (typeof type !== 'string') return false;
  const t = type.startsWith('undefined | ') ? type.slice('undefined | '.length) : type;
  return t.startsWith('(') && t.includes('=>');
}

const setsDiffer = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  return [[...A].filter((x) => !B.has(x)), [...B].filter((x) => !A.has(x))];
};

/**
 * derived.json and element-meta.json are written by the same `build:api` run, so
 * they agree by construction -- until one of them is regenerated alone. The pack
 * reads the element SPINE from derived.json (the tag list, the scalar/fn flags,
 * the index's counts) and the prose from element-meta.json (types, defaults,
 * slots, docs), so a divergence produces element pages that quietly contradict
 * the index the pack calls complete. Decide loudly: fail instead.
 *
 * BOTH DIRECTIONS, per element, over props and events. A one-directional tag
 * membership check -- what this was before review -- passes on an extra tag in
 * element-meta, on a prop dropped from either side, and on a `fn`/`scalar` flag
 * that no longer matches the printed type. The last of those is S3's whole
 * scoring line, so it is cross-checked against the generator's rule rather than
 * merely compared.
 *
 * WHAT THIS STILL CANNOT SEE, stated rather than implied: nothing here can tell
 * a correct prop TYPE from a plausible wrong one. `type: 'ThisDoesNotExist'` on
 * a non-function prop agrees with everything and packs clean. Types are checked
 * by `verify:generated` regenerating the artifact, not by this.
 */
export function assertArtifactsAgree(derivedElements, metaElements) {
  const problems = [];
  const metaByTag = new Map(metaElements.map((m) => [m.tag, m]));
  const [onlyDerived, onlyMeta] = setsDiffer(
    derivedElements.map((e) => e.tag),
    metaElements.map((m) => m.tag),
  );
  for (const t of onlyDerived) problems.push(`${t}: in derived.json, absent from element-meta.json`);
  for (const t of onlyMeta) problems.push(`${t}: in element-meta.json, absent from derived.json`);

  for (const el of derivedElements) {
    const m = metaByTag.get(el.tag);
    if (!m) continue;
    const [dp, mp] = setsDiffer(el.props.map((p) => p.name), (m.props ?? []).map((p) => p.name));
    for (const p of dp) problems.push(`${el.tag}.${p}: prop in derived.json only`);
    for (const p of mp) problems.push(`${el.tag}.${p}: prop in element-meta.json only`);

    const [de, me] = setsDiffer(el.events ?? [], (m.events ?? []).map((e) => e.name));
    for (const e of de) problems.push(`${el.tag}: event ${e} in derived.json only`);
    for (const e of me) problems.push(`${el.tag}: event ${e} in element-meta.json only`);

    for (const p of el.props) {
      const mprop = (m.props ?? []).find((x) => x.name === p.name);
      if (!mprop) continue;
      if (fnValuedFromType(mprop.type) !== p.fn) {
        problems.push(
          `${el.tag}.${p.name}: derived.json says fn=${p.fn}, but element-meta.json's type says ${!p.fn} (${mprop.type})`,
        );
      }
      if (mprop.scalar !== undefined && mprop.scalar !== p.scalar) {
        problems.push(`${el.tag}.${p.name}: scalar disagrees (derived ${p.scalar} vs meta ${mprop.scalar})`);
      }
    }
  }

  if (problems.length) {
    throw new Error(
      `derived.json and element-meta.json have diverged in ${problems.length} place(s):\n  - ${problems
        .slice(0, 20)
        .join('\n  - ')}${problems.length > 20 ? `\n  … and ${problems.length - 20} more` : ''}\n` +
        'Regenerate both with `npm run build:api` inside packages/ui.',
    );
  }
}
