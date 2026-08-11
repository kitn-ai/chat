import { z } from 'zod';
import type { Tool } from './types';
import { Placement, Framework } from '../../types';
import type { Integration, Archetype } from '../../types';
import {
  getArchetype,
  getIntegration,
  listArchetypes,
  listIntegrations,
} from '../../registry';

/**
 * scaffold — the keystone tool. Composes a working chat surface from four axes:
 *
 *   useCase (archetype) × integration × placement × framework
 *
 * and emits three labeled blocks an AI consumer can paste straight in:
 *   (1) Front-end  — the archetype's kai-* components, rendered for the chosen
 *                    framework and sized for the placement, wired with the
 *                    `messages` property + `kai-submit` per the Streaming recipe.
 *   (2) Backend    — the integration's route template for the framework (with a
 *                    language-aware fallback when there's no exact match).
 *   (3) Run note   — how to run it + the env vars to set.
 *
 * The handler is called directly in tests (bypassing MCP's zod validation), so it
 * validates `useCase` + `integration` against the registry itself and returns
 * graceful, self-correcting error text when either is unknown.
 */

const text = (s: string) => ({
  content: [{ type: 'text' as const, text: s }],
});

// ── placement sizing ──────────────────────────────────────────────────────────

interface PlacementStyle {
  /** container style for an HTML/web-components wrapper */
  style: string;
  /** the chat element's own style — it must FILL the container */
  chatFill: string;
  /** one-line human description of the layout */
  note: string;
  /** optional extra comment lines describing an alternative layout form */
  altNote?: string[];
}

// The chat element must fill its container. In a `display: flex; flex-direction:
// column` shell it's a flex child (`flex: 1; min-height: 0`); in a plain block
// container it fills via `height: 100%`.
const FLEX_FILL = 'flex: 1; min-height: 0;';
const BLOCK_FILL = 'height: 100%; width: 100%;';

/**
 * full-page, and it has to be true in a STOCK starter — not just in an empty page.
 *
 * It used to be `height: 100dvh; width: 100%`, which is full-page only if nothing
 * above it interferes, and in the templates consumers actually run something
 * always does. Two frameworks hit it independently:
 *
 *   · Vite's `react-ts` template ships `#root { max-width: 1280px; margin: 0 auto;
 *     padding: 2rem; text-align: center }`, so the chat was capped, inset by 2rem
 *     and had its text centred — inherited straight through the shadow boundary.
 *   · The official TanStack Start starter renders a Header (73px) and a Footer
 *     (181px) around every route in `__root.tsx`, so a 100dvh sibling put the
 *     composer 13px BELOW the fold at 1280x800.
 *
 * `position: fixed; inset: 0` is the one fix that works for both without a
 * per-framework patch: it takes the surface out of flow entirely, so an ancestor's
 * width cap, padding and flex centring stop applying and a sibling header/footer
 * stops consuming height. `text-align: start` is still needed because text-align
 * INHERITS regardless of positioning.
 *
 * `z-index` matters as much as the positioning, and is the same 1000 the other two
 * fixed placements already use. Without it the surface stacks at `auto`, and the
 * TanStack starter's header is `sticky top-0 z-50` — so the chat would sit at the
 * right geometry and still have the top 73px of its thread painted over. Half-
 * covered is the worst outcome available: either the chat owns the viewport or it
 * does not.
 *
 * The trade is stated in the emitted comment rather than hidden: this overlays
 * whatever the starter draws around it, nav included. A consumer who wants the chat
 * inside their layout wants `placement: 'inline'`, which is what that placement is for.
 */
const FULL_PAGE: PlacementStyle = {
  style:
    'position: fixed; inset: 0; display: flex; flex-direction: column; ' +
    'text-align: start; z-index: 1000;',
  chatFill: FLEX_FILL,
  note: 'fills the viewport (fixed, inset 0)',
  altNote: [
    'FULL PAGE MEANS FULL PAGE: `position: fixed; inset: 0` is deliberate, not a stray overlay.',
    '`height: 100dvh` is full-page only in an empty document, and stock starters are not empty —',
    "Vite's react-ts template caps #root at 1126px, centres its text and border-boxes it, and the",
    'TanStack Start starter wraps every route in a Header + Footer that pushed the composer 13px',
    'below the fold at 1280x800. Fixed positioning escapes both, `text-align: start` undoes the',
    'inherited centring, and z-index keeps a sticky header from painting over the thread.',
    'This DOES cover the chrome around it (nav included) — that is what full-page means here.',
    'Want the chat to sit INSIDE your own layout instead? Use placement: "inline".',
  ],
};

function placementStyle(placement: string): PlacementStyle {
  switch (placement) {
    case 'full-page':
      return FULL_PAGE;
    case 'inline':
      return {
        style: 'width: 100%; max-width: 720px; height: 540px; margin: 0 auto; display: flex; flex-direction: column;',
        chatFill: FLEX_FILL,
        note: 'in-flow block (sized by parent, not fixed)',
      };
    case 'side':
      // A full-height side panel docked to the trailing (right) edge — overlays
      // content. messages/loading/suggestions are real kai-chat props.
      return {
        style:
          'position: fixed; top: 0; inset-inline-end: 0; height: 100dvh; width: 380px; ' +
          'border-inline-start: 1px solid var(--kai-color-border); display: flex; flex-direction: column; z-index: 1000;',
        chatFill: FLEX_FILL,
        note: 'full-height side panel, docked to the trailing edge (100dvh)',
        altNote: [
          'In-flow alternative (push content instead of overlay): drop `position`/`z-index` and ' +
            'make this a `flex: 0 0 380px` column inside a `display: flex` row at `height: 100dvh`.',
        ],
      };
    case 'docked-widget':
      // The bottom-right floating bubble — rounded, elevated, fixed size.
      return {
        style:
          'position: fixed; bottom: 1.5rem; inset-inline-end: 1.5rem; width: 380px; height: 600px; ' +
          'max-height: calc(100dvh - 3rem); border-radius: 16px; overflow: hidden; ' +
          'box-shadow: 0 12px 32px var(--kai-shadow-color, rgba(0,0,0,0.18)); display: flex; flex-direction: column; z-index: 1000;',
        chatFill: FLEX_FILL,
        note: 'fixed, floating bottom-right widget',
      };
    default:
      // Unknown placement falls back to full-page (full height) rather than the bubble,
      // so a future Placement enum member doesn't silently render as a widget.
      return FULL_PAGE;
  }
}

// ── suggestions + mock streaming ───────────────────────────────────────────────

/** Default starter prompts so the suggestions feature always shows. */
const DEFAULT_SUGGESTIONS = ["What's new?", 'How can you help?'];

/** A canned assistant reply the mock integration streams back token-by-token. */
const MOCK_REPLY =
  "Hi! I'm a local preview — no backend or API key needed. Swap `integration` for a real provider (openrouter, ollama, …) and I'll talk to a real model.";

/** Render a string[] as a JS array literal (JSON-quoted — keeps apostrophes readable). */
function jsArray(items: string[]): string {
  return '[' + items.map((s) => JSON.stringify(s)).join(', ') + ']';
}

/**
 * The streaming fold, emitted into the `mock` scaffold only.
 *
 * Real backends now import the wire adapter (see `realStreamBody`), which folds
 * deltas through `createAssistantStream`. The mock path has no backend and must
 * add no imports, so it keeps the inlined copy.
 *
 * The naive `{ ...m, parts: [{ type: 'text', text: answer }] }` is the old
 * flat-string fold wearing parts clothing. It is harmless while the target
 * message starts at `parts: []`, but it DELETES every part already on the
 * message, and the agentic archetype seeds exactly such a message
 * (`SAMPLE_AGENTIC_MESSAGE` carries reasoning + a tool call), so the first
 * consumer who streams into a seeded message loses them silently.
 *
 * `@kitn.ai/ui/state` exports this same function as `appendTextPart`. It is
 * emitted inline rather than imported so a scaffold stays copy-paste readable
 * and adds no import to wire up.
 *
 * `typed` annotates the signature for strict-TS frameworks, reusing the local
 * `ChatMessage` type those scaffolds already declare (see `chatMessageType`);
 * plain-JS contexts (html) take the bare form.
 */
function appendTextHelper(pad: string, typed: boolean): string[] {
  const sig = typed
    ? `(parts: ChatMessage['parts'], delta: string): ChatMessage['parts'] =>`
    : `(parts, delta) =>`;
  return [
    `${pad}// Fold each delta onto the message's TRAILING text part, opening a new one`,
    `${pad}// when the last part is not text. Do NOT replace parts wholesale: that drops`,
    `${pad}// any reasoning/tool/card parts already on the message. This is exactly`,
    `${pad}// appendTextPart from @kitn.ai/ui/state, inlined.`,
    `${pad}const appendText = ${sig} {`,
    `${pad}  const last = parts[parts.length - 1];`,
    `${pad}  return last?.type === 'text'`,
    `${pad}    ? [...parts.slice(0, -1), { ...last, text: last.text + delta }]`,
    `${pad}    : [...parts, { type: 'text', text: delta }];`,
    `${pad}};`,
  ];
}

/**
 * The shared client-side mock stream body, parameterised by how each framework
 * commits a messages update. Two operations keep the contract correct:
 *   - `commitInitial(expr)` appends the user + empty-assistant pair.
 *   - `commitMap(mapBody)` replaces messages with `prev.map((m) => mapBody)` —
 *     each framework supplies how `prev` resolves (the React functional updater,
 *     or the live local variable for html/vue/svelte) so the streamed content is
 *     applied to the LATEST array, never a stale snapshot.
 * Each commit produces a NEW array (and a new object for the streamed message)
 * so kai-chat re-renders per chunk.
 *
 * Indented with `pad` so it drops cleanly into each framework's onSubmit.
 */
function mockStreamBody(opts: {
  pad: string;
  /** read the current messages array (for building `history`) */
  read: string;
  /** commit the initial user + empty-assistant pair */
  commitInitial: (expr: string) => string;
  /** commit a `prev.map(...)` update; `mapBody` is the body of `.map((m) => …)` */
  commitMap: (mapBody: string) => string;
  /** set loading true/false */
  setLoading: (v: 'true' | 'false') => string;
  /**
   * Emit `as const` on role literals so they narrow to 'user'|'assistant' under
   * strict TS. Set to true for TypeScript frameworks (react/next); false for
   * plain-JS contexts (html) where `as const` is invalid syntax.
   */
  strictRoles?: boolean;
  /**
   * Where the submitted text comes from. Every kai-* target reads it off the
   * `kai-submit` CustomEvent; `solid` renders the SolidJS `PromptInput`, which
   * has no such event — its submitted text is the controlled input signal.
   */
  valueSource?: string;
  /** Lines emitted right after the value is read and guarded (solid clears its
   *  controlled textarea there). */
  afterValue?: string[];
}): string {
  const {
    pad, read, commitInitial, commitMap, setLoading, strictRoles = false,
    valueSource = 'e.detail.value', afterValue = [],
  } = opts;
  const asConst = strictRoles ? ' as const' : '';
  // Under strict TS, an un-annotated array literal widens the part's `type` to
  // `string`, so the later `setMessages([...history, …])` fails TS2322. Plain-JS
  // contexts (html) have no type to annotate with.
  const historyType = strictRoles ? ': ChatMessage[]' : '';
  const mapBody = `(m.id === assistantId ? { ...m, parts: appendText(m.parts, tok) } : m)`;
  return [
    `${pad}const value = ${valueSource}.trim();`,
    `${pad}if (!value) return;`,
    ...afterValue.map((l) => `${pad}${l}`),
    `${pad}const history${historyType} = [...${read}, { id: crypto.randomUUID(), role: 'user'${asConst}, parts: [{ type: 'text', text: value }] }];`,
    `${pad}const assistantId = crypto.randomUUID();`,
    `${pad}${commitInitial(`[...history, { id: assistantId, role: 'assistant'${asConst}, parts: [] }]`)}`,
    `${pad}${setLoading('true')}`,
    `${pad}// No backend: stream a canned reply client-side, one token at a time.`,
    `${pad}const reply = ${JSON.stringify(MOCK_REPLY)};`,
    `${pad}const tokens = reply.split(/(\\s+)/);`,
    ...appendTextHelper(pad, strictRoles),
    `${pad}for (const tok of tokens) {`,
    `${pad}  await new Promise((r) => setTimeout(r, 24));`,
    `${pad}  // new array + object reference per chunk so kai-chat re-renders`,
    `${pad}  ${commitMap(mapBody)}`,
    `${pad}}`,
    `${pad}${setLoading('false')}`,
  ].join('\n');
}

// ── real-backend streaming: import the adapter, do not re-hand-roll it ─────────

/**
 * How one framework exposes the turn's thread — the array every round of the
 * tool loop re-encodes.
 *
 * THE WHOLE PROBLEM IN ONE INTERFACE. Round 2's request is
 * `toOpenAIMessages(<the thread INCLUDING the assistant turn so far>)`, and the
 * assistant message is appended by `createAssistantStream` through the setter,
 * so the submit handler never holds it. Three of the four surfaces already keep
 * their messages somewhere a closure can read back synchronously
 * (`chat.messages`, `messages.value`, a Svelte `let`), so for those the thread
 * IS that live value and there is nothing to add. React is the odd one:
 * `useState` cannot be read back inside the async turn that is writing it, so
 * the turn declares its own `thread` and `setMessages` becomes the projection of
 * it. See `REACT_THREAD` for why that is a single source of truth and not a
 * mirror.
 */
interface ThreadBinding {
  /** Lines that open the turn: append the user message and commit it. */
  open(ctx: { pad: string; userMessage: string; typed: boolean }): string[];
  /** Expression that reads the CURRENT thread, valid at any point in the turn. */
  live: string;
  /** The `SetMessages` updater handed to `createAssistantStream`. */
  setter: string;
}

/**
 * React (and next / tanstack-start, which are React).
 *
 * `thread` is the turn's single source of truth; `setMessages(thread)` is a
 * projection of it for rendering, never read back. That ordering matters: the
 * inverse (holding a copy and folding FROM it while React holds the truth) is
 * the mirror bug this kit already shipped once — `createAssistantStream` used to
 * fold from a local `currentParts` and silently clobbered any edit made through
 * the store. Here nothing folds from the store, so nothing can be clobbered by a
 * stale copy; the one rule, stated in the emitted comment, is that a turn's
 * writes all go through `set`.
 */
const REACT_THREAD: ThreadBinding = {
  open: ({ pad, userMessage }) => [
    `${pad}// THE TURN OWNS THE THREAD. Every round of the loop below re-encodes the`,
    `${pad}// whole thread, and React state cannot be read back to get it: setMessages`,
    `${pad}// is async and this closure captured the pre-submit \`messages\`. So \`thread\``,
    `${pad}// is the source of truth for this turn and setMessages just projects it for`,
    `${pad}// rendering. Route any other messages write you make mid-turn through set().`,
    `${pad}let thread: ChatMessage[] = [...messages, ${userMessage}];`,
    `${pad}const set: SetMessages = (fn) => { thread = fn(thread); setMessages(thread); };`,
    `${pad}setMessages(thread);`,
  ],
  live: 'thread',
  setter: 'set',
};

/** A framework whose messages live in a variable/property the turn can read back
 *  (html's `chat.messages`, Vue's `messages.value`, Svelte's `messages`). The
 *  live value IS the thread: no local copy, nothing to keep in sync.
 *
 *  `firstRead` differs from `expr` only where the first read can precede any
 *  write: an un-upgraded `<kai-chat>` has no `messages` yet, and spreading
 *  `undefined` throws. Every later read is of a value this code assigned. */
function liveThreadBinding(expr: string, setter: string, firstRead = expr): ThreadBinding {
  return {
    open: ({ pad, userMessage }) => [
      `${pad}// ${expr} IS the thread: the stream writes the assistant message back`,
      `${pad}// through it, so every round below re-encodes the live, current value.`,
      `${pad}${expr} = [...${firstRead}, ${userMessage}];`,
    ],
    live: expr,
    setter,
  };
}

/**
 * A framework whose messages sit behind a GETTER plus a separate setter call —
 * an Angular signal (`this.messages()` / `this.messages.set(…)`) or a Solid one
 * (`messages()` / `setMessages(…)`). Same story as `liveThreadBinding`: the read
 * is synchronous, so the live value IS the thread and React's turn-scoped copy
 * (`REACT_THREAD`) is not needed. The only difference is that the write is a
 * call, not an assignment, so the commit is passed in instead of derived.
 */
function accessorThreadBinding(read: string, commit: (value: string) => string, setter: string): ThreadBinding {
  return {
    open: ({ pad, userMessage }) => [
      `${pad}// ${read} IS the thread: the stream writes the assistant message back`,
      `${pad}// through the setter, so every round below re-encodes the live, current`,
      `${pad}// value. A signal reads back synchronously, so there is no React-style`,
      `${pad}// stale-closure problem and no turn-local copy to keep in sync.`,
      `${pad}${commit(`[...${read}, ${userMessage}]`)}`,
    ],
    live: read,
    setter,
  };
}

/**
 * The real-backend submit body. Four lines of adapter, the rest is fetch.
 *
 * This deliberately reverses the inline-everything policy that governs the mock
 * path. Inlining was correct while the kit had nothing to import; it is now the
 * reason a scaffold with kai-tool in its archetype rendered a panel no code path
 * could ever fill, and the hand-rolled reader it replaces was wrong about
 * multi-line SSE frames and codepoints split across a socket boundary.
 *
 * `createAssistantStream` appends the in-flight assistant message itself and
 * folds every delta onto its `parts`, so the scaffold no longer hand-builds an
 * empty assistant message. `readOpenAIStream` parses the SSE properly:
 * keep-alive comments, multi-line frames, codepoints split across a socket
 * boundary, tool calls and reasoning. The inline reader this replaces got the
 * last three wrong and could only ever produce text.
 *
 * `commitSet(expr)` is how each framework writes a whole new messages array, and
 * `setterAdapter` is the `SetMessages` updater createAssistantStream drives.
 * Both are used by the single-round shape only; the tool-loop shape takes its
 * thread and its setter from `thread` (see `ThreadBinding`).
 */
function realStreamBody(opts: {
  pad: string;
  /** read the current messages array (for building `history`) */
  read: string;
  /** commit a whole new messages array */
  commitSet: (expr: string) => string;
  /** the `SetMessages` functional-updater expression handed to createAssistantStream */
  setterAdapter: string;
  /** set loading true/false */
  setLoading: (v: 'true' | 'false') => string;
  /** the JSON.stringify argument for the POST body, given the thread expression */
  bodyPayload: (thread: string) => string;
  /** emit `as const` + the ChatMessage[] annotation (strict-TS frameworks) */
  strictRoles?: boolean;
  /** archetype renders kai-tool → emit the LIVE multi-round loop */
  toolLoop: boolean;
  /** how this framework exposes the turn's thread (tool-loop shape only) */
  thread: ThreadBinding;
  /** where the submitted text comes from — see `mockStreamBody.valueSource` */
  valueSource?: string;
  /** lines emitted right after the value is read and guarded */
  afterValue?: string[];
}): string {
  const {
    pad, read, commitSet, setterAdapter, setLoading, bodyPayload, strictRoles = false, toolLoop, thread,
    valueSource = 'e.detail.value', afterValue = [],
  } = opts;
  const asConst = strictRoles ? ' as const' : '';
  // Under strict TS an un-annotated array literal widens the part's `type` to
  // `string`, so the later commit fails TS2322. Plain-JS contexts (html) have no
  // type to annotate with.
  const historyType = strictRoles ? ': ChatMessage[]' : '';
  const userMessage = `{ id: crypto.randomUUID(), role: 'user'${asConst}, parts: [{ type: 'text', text: value }] }`;

  const open = toolLoop
    ? thread.open({ pad, userMessage, typed: strictRoles })
    : [
        `${pad}const history${historyType} = [...${read}, ${userMessage}];`,
        `${pad}${commitSet('history')}`,
      ];
  const threadExpr = toolLoop ? thread.live : 'history';
  const setter = toolLoop ? thread.setter : setterAdapter;

  const request = (indent: string): string[] => [
    `${indent}const res = await fetch('/api/chat', {`,
    `${indent}  method: 'POST',`,
    `${indent}  headers: { 'Content-Type': 'application/json' },`,
    `${indent}  body: JSON.stringify(${bodyPayload(threadExpr)}),`,
    `${indent}});`,
    `${indent}// The finished turn: text, reasoning, tool calls, stop reason, usage. An`,
    `${indent}// error FRAME inside a 200 stream lands on turn.error, and whatever`,
    `${indent}// streamed before it is already on the message. A non-ok RESPONSE throws`,
    `${indent}// instead, which is the catch below.`,
    `${indent}const turn = await readOpenAIStream(res, stream);`,
  ];

  return [
    `${pad}const value = ${valueSource}.trim();`,
    `${pad}if (!value) return;`,
    ...afterValue.map((l) => `${pad}${l}`),
    ...open,
    `${pad}${setLoading('true')}`,
    `${pad}// createAssistantStream appends the in-flight assistant message and folds`,
    `${pad}// every delta onto its parts. readOpenAIStream parses the SSE: keep-alive`,
    `${pad}// comments, multi-line frames, split codepoints, tool calls, reasoning.`,
    `${pad}const stream = createAssistantStream(${setter});`,
    ...(toolLoop ? toolLoopBody({ pad, request, threadExpr }) : [
      `${pad}try {`,
      ...request(`${pad}  `),
      `${pad}  if (turn.error) console.error('Model error:', turn.error.message);`,
    ]),
    `${pad}} catch (err) {`,
    `${pad}  // Without this a bad key is a permanently blank assistant bubble plus an`,
    `${pad}  // unhandled rejection. abort() settles the message and flips any tool`,
    `${pad}  // panel still waiting on a result to output-error, so nothing spins`,
    `${pad}  // forever; text that already streamed stays put.`,
    `${pad}  stream.abort(err instanceof Error ? err.message : 'Request failed');`,
    `${pad}  console.error(err);  // swap in your own error surface (a toast, a banner)`,
    `${pad}} finally {`,
    `${pad}  // done() SETTLES the message: every sink call after it is dropped, which`,
    `${pad}  // is why the whole loop runs above it and not after.`,
    `${pad}  stream.done();`,
    `${pad}  ${setLoading('false')}`,
    `${pad}}`,
  ].join('\n');
}

/**
 * The multi-round tool loop, LIVE.
 *
 * It used to be emitted commented out, on the reasoning that a loop calling
 * tools that do not exist yet would fail on the first run. That reasoning was
 * wrong in the way that matters: the commented block named an undefined
 * `runYourTool`, and its second round was prose ("then POST again with
 * toOpenAIMessages() over the updated thread") describing a value the consumer
 * had no way to obtain — `history` never contains the assistant message, the
 * `messages` closure is stale by construction, and `AssistantStream` is
 * write-only. So the archetype's headline capability could not be completed by
 * uncommenting, or by any amount of local editing.
 *
 * Live, with a `runTool` stub that answers the one tool the scaffold declares,
 * it runs end to end on the first submit: the panel reaches `output-available`
 * and the model's answer streams into the same message, after the tool part, as
 * a new text part.
 *
 * Both rounds drive the SAME `AssistantStream`, so the whole exchange folds into
 * one assistant message with its parts in stream order — which is what
 * `toOpenAIMessages` splits back into `assistant(tool_calls) → tool → assistant`
 * on the way out.
 */
function toolLoopBody(opts: {
  pad: string;
  request: (indent: string) => string[];
  threadExpr: string;
}): string[] {
  const { pad, request, threadExpr } = opts;
  return [
    `${pad}// Cap the rounds: a runaway model is a runaway bill.`,
    `${pad}const MAX_TOOL_ROUNDS = 4;`,
    `${pad}try {`,
    `${pad}  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {`,
    ...request(`${pad}    `),
    `${pad}    if (turn.error) { console.error('Model error:', turn.error.message); break; }`,
    `${pad}    // The kit never RUNS a tool. Calls the provider executed itself already`,
    `${pad}    // carry their output, and a malformed one has nothing to run.`,
    `${pad}    const pending = turn.toolCalls.filter((c) => !c.error && !c.providerExecuted);`,
    `${pad}    if (pending.length === 0) break;  // the model answered — the turn is done`,
    `${pad}    for (const call of pending) {`,
    `${pad}      try {`,
    `${pad}        applyToolOutput(stream, call.id, await runTool(call.name, call.input ?? {}));`,
    `${pad}      } catch (err) {`,
    `${pad}        // The panel must not spin forever because your tool threw; the model`,
    `${pad}        // is told about the failure and can react to it next round.`,
    `${pad}        applyToolFailure(stream, call.id, err instanceof Error ? err.message : 'Tool failed');`,
    `${pad}      }`,
    `${pad}    }`,
    `${pad}    // Next round re-encodes ${threadExpr}, which now carries this round's calls`,
    `${pad}    // AND their results: toOpenAIMessages splits the turn at the tool boundary`,
    `${pad}    // into assistant(tool_calls) -> tool(result) -> assistant(answer).`,
    `${pad}  }`,
  ];
}

/**
 * The tool runner the loop calls, emitted as a working stub.
 *
 * The kit never calls a consumer's function — this is the seam where the host
 * does. It answers the `search` tool the scaffold declares in `tools` so the
 * loop completes a round on the first run against a real model, and says so
 * loudly enough that nobody ships the canned answer.
 *
 * No template literals: the emitted code is itself inside one.
 */
function toolRunnerLines(pad: string, typed: boolean): string[] {
  const sig = typed
    ? `async function runTool(name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {`
    : `async function runTool(name, input) {`;
  return [
    `${pad}// YOUR tools run here. The kit never calls one: the model asks, you execute,`,
    `${pad}// and applyToolOutput reports the result back into the panel and into the`,
    `${pad}// next round's request. Whatever you return is JSON-encoded as the result.`,
    `${pad}${sig}`,
    `${pad}  if (name === 'search') {`,
    `${pad}    // STUB — replace with a real search call. Bracket access, not \`input.query\`:`,
    `${pad}    // \`input\` is an index signature, and Angular's stock tsconfig turns on`,
    `${pad}    // noPropertyAccessFromIndexSignature, which rejects the dotted form (TS4111).`,
    `${pad}    return { results: ['No search backend wired up yet. Query: ' + String(input['query'] ?? '')] };`,
    `${pad}  }`,
    `${pad}  return { error: 'Unknown tool: ' + name };`,
    `${pad}}`,
  ];
}

/** True when the archetype renders a tool panel, so the scaffold needs the loop. */
function hasToolPanel(archetype: Archetype): boolean {
  return archetype.components.includes('kai-tool');
}

/**
 * The import lines a real-backend scaffold needs on top of the ones it already
 * emits.
 *
 * Every name here MUST be referenced by live emitted code: every starter in this
 * repo (and create-vite's own TypeScript template) sets `noUnusedLocals`, so one
 * unreferenced name fails `npm run build` with TS6133 in a stock app.
 * `applyToolOutput`/`applyToolFailure` used to be excluded for exactly that
 * reason — the tool loop that called them was commented out. The loop is live
 * now, so they are imported, and only when it is emitted.
 *
 * `type SetMessages` is React-only for the same reason: it annotates the `set`
 * adapter in `REACT_THREAD`, which no other framework needs.
 *
 * `typed` pulls in the kit's own `ChatMessage` for the strict-TS frameworks (see
 * `chatMessageDecl`); the plain-JS html target must not emit a type import.
 */
function wireImportLines(opts: {
  pad?: string;
  typed: boolean;
  /** the live tool loop is emitted → it calls applyToolOutput/applyToolFailure */
  toolLoop?: boolean;
  /** the framework's thread binding declares `const set: SetMessages` */
  setMessagesType?: boolean;
}): string[] {
  const { pad = '', typed, toolLoop = false, setMessagesType = false } = opts;
  const stateNames = [
    'createAssistantStream',
    ...(typed ? ['type ChatMessage'] : []),
    ...(typed && setMessagesType ? ['type SetMessages'] : []),
  ].join(', ');
  const wireNames = [
    'readOpenAIStream',
    'toOpenAIMessages',
    ...(toolLoop ? ['applyToolOutput', 'applyToolFailure'] : []),
  ].join(', ');
  return [
    `${pad}import { ${stateNames} } from '@kitn.ai/ui/state';`,
    `${pad}import { ${wireNames} } from '@kitn.ai/ui/wire';`,
  ];
}

/** The POST body for a real backend. `toOpenAIMessages` keeps tool calls and
 *  tool results on the way back, which is what makes a second round possible;
 *  `tools` is what makes a FIRST tool call possible at all. Each field appears
 *  only when the emitted code declares the const it names.
 *
 *  `thread` is the expression holding the messages to encode — a const built
 *  once for a single-round scaffold, the LIVE thread for a tool loop that
 *  re-encodes it every round. */
function realBodyPayload(opts: { defaultModel?: string; tools: boolean }): (thread: string) => string {
  return (thread: string) => {
    const fields = [
      ...(opts.defaultModel ? ['model'] : []),
      `messages: toOpenAIMessages(${thread})`,
      ...(opts.tools ? ['tools'] : []),
    ];
    return `{ ${fields.join(', ')} }`;
  };
}

/**
 * SCAF-4/SCAF-11: the local ChatMessage type, emitted by the `mock` scaffold only.
 *
 * mock imports nothing, so it has to declare the shape it uses. A real backend
 * hands its messages to `toOpenAIMessages`, so it takes the kit's own type from
 * the import block instead: this local subset has no `rawInput`, `raw`,
 * `signature` or `index` on a tool and no `source`/`file` part variants, so a
 * message the kit itself produced would not satisfy it.
 */
const LOCAL_CHAT_MESSAGE_TYPE = `type ChatMessage = { id: string; role: 'user' | 'assistant'; parts: ({ type: 'text'; text: string } | { type: 'reasoning'; text: string; label?: string } | { type: 'tool'; tool: { type: string; state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'; input?: Record<string, unknown>; output?: Record<string, unknown>; toolCallId?: string } })[] };`;

function chatMessageDecl(isMock: boolean, pad = ''): string[] {
  return isMock ? [`${pad}${LOCAL_CHAT_MESSAGE_TYPE}`] : [];
}

/**
 * The `html` target's mock message type, DERIVED from the element rather than
 * restated.
 *
 * Every other mock target hand-writes `LOCAL_CHAT_MESSAGE_TYPE` because it has
 * nothing to derive from. This one does: the code assigns straight to
 * `chat.messages`, and the kit ships `KaiChatElement`, so indexing that property
 * gives the exact message type the assignment target accepts. A hand-written
 * subset would be assignable INTO the element and then fail on the way back out —
 * `chat.messages.map((m) => …appendText(m.parts)…)` reads the element's wider
 * part union, which a narrow local type cannot accept.
 */
const HTML_CHAT_MESSAGE_TYPE = [
  `// The message type, taken from the element it is assigned to rather than`,
  `// restated — so it cannot drift out of step with what <kai-chat> accepts.`,
  `type ChatMessage = KaiChatElement['messages'][number];`,
];

// ── SCAF-8: per-integration default model ids ─────────────────────────────────

/** Default model id per integration that forwards one. Anything else falls back
 *  to a generic OpenAI-compatible id, which is safe: a route that forwards the
 *  client's model is by definition pointed at an OpenAI-compatible endpoint. */
const CLIENT_MODEL_IDS: Record<string, string> = {
  openrouter: 'openai/gpt-4o-mini',
};

/**
 * The default model id for an integration whose ROUTE reads the client's `model`
 * field, and undefined for every other one.
 *
 * This used to be a substring test (`routeSrc.includes('model')`), which is true
 * of any template that so much as writes `model: 'llama3.2'`. That emitted an
 * editable `const model` into ollama, langgraph, vercel-ai-sdk and cloudflare
 * scaffolds whose routes pin their own model and never read the field, so
 * changing it did nothing, and cloudflare's default was not even a valid Workers
 * AI id. `forwardsFromClient` states the fact instead of guessing at it.
 */
function defaultModelFor(integration: Integration): string | undefined {
  if (!integration.forwardsFromClient.includes('model')) return undefined;
  return CLIENT_MODEL_IDS[integration.id] ?? 'openai/gpt-4o-mini';
}

/**
 * True when the scaffold should declare tool schemas and put them in the body.
 *
 * Both halves matter. A tool panel with no tools array in the request is a panel
 * no code path can populate: the model never emits a tool call, so kai-tool
 * renders nothing forever. And a tools array the route drops on the floor is the
 * same dead-const defect as the model one: langgraph builds its tools into the
 * agent, Mastra and Pi into the harness, and none of them read the field.
 */
function emitsToolSchemas(archetype: Archetype, integration: Integration): boolean {
  return hasToolPanel(archetype) && integration.forwardsFromClient.includes('tools');
}

/**
 * The tool schemas, emitted beside the model const. OpenAI function-calling
 * form, which is what every passthrough route forwards.
 *
 * `search` on purpose: it is the tool `SAMPLE_AGENTIC_MESSAGE` already shows in
 * the seeded thread, so the sample panel and the live one describe one tool.
 */
function toolSchemaLines(pad: string): string[] {
  return [
    `${pad}// The tools the model may call. The request body carries this array; without`,
    `${pad}// it the model never emits a tool call and the kai-tool panel stays empty,`,
    `${pad}// which is the whole reason it is here. Replace with your own. The kit never`,
    `${pad}// RUNS a tool: see the loop in onSubmit for who does.`,
    `${pad}const tools = [`,
    `${pad}  {`,
    `${pad}    type: 'function',`,
    `${pad}    function: {`,
    `${pad}      name: 'search',`,
    `${pad}      description: 'Search the web for up-to-date information.',`,
    `${pad}      parameters: {`,
    `${pad}        type: 'object',`,
    `${pad}        properties: { query: { type: 'string', description: 'What to search for.' } },`,
    `${pad}        required: ['query'],`,
    `${pad}      },`,
    `${pad}    },`,
    `${pad}  },`,
    `${pad}];`,
  ];
}

// ── SCAF-9: message-embedded companion logic ──────────────────────────────────

/**
 * Tags that live INSIDE a kai-chat message object (not standalone siblings).
 * Rendering them as bare elements is a TS error (required props missing) and
 * non-idiomatic — the chat thread carries them on each message.
 */
const MESSAGE_EMBEDDED_TAGS = new Set(['kai-tool', 'kai-reasoning']);

// ── SCAF-14: workspace structural/layout logic ────────────────────────────────

/**
 * Tags that participate in the workspace layout structure — kai-resizable is the
 * container (needs kai-resizable-item children), kai-artifact is the preview pane.
 * Neither should be emitted as a bare sibling of kai-chat — the idiomatic structure
 * is a resizable split with chat in one pane and artifact in another.
 */
const WORKSPACE_STRUCTURAL_TAGS = new Set(['kai-resizable', 'kai-artifact']);

/** True when the archetype is the resizable split workspace (chat + artifact). */
function isWorkspace(archetype: Archetype): boolean {
  return archetype.components.includes('kai-resizable') && archetype.components.includes('kai-artifact');
}

/**
 * A sample assistant message showing embedded tool + reasoning.
 *
 * IT IS NOT SEEDED INTO A REAL SCAFFOLD'S THREAD, and used not to be optional.
 * A fabricated assistant turn in the initial state is conversation history the
 * user never had, and it does three things:
 *
 *   1. it is SENT TO THE MODEL on turn one, as `assistant(tool_calls tc_001)` +
 *      `tool(result)`, so the very first request claims the model made a call it
 *      never made and that a tool it may not have answered;
 *   2. it THROWS in `toAnthropicMessages` — a reasoning part with no verbatim
 *      `raw` cannot be echoed back as a thinking block, which is a
 *      `WireEncodeError` before the request is even built;
 *   3. it kills the thread's empty state, so the `suggestions` the caller passed
 *      to `scaffold` never render at all.
 *
 * The live tool loop fills the panel for real on the first submit, so nothing is
 * lost by starting empty. The `mock` preview has no provider to lie to and no
 * encoder to throw, so it gets this as a COMMENTED fixture (see
 * `sampleSeedComment`): the one place uncommenting it is safe.
 */
const SAMPLE_AGENTIC_MESSAGE = {
  id: 'sample-assistant',
  role: 'assistant' as const,
  parts: [
    { type: 'reasoning' as const, text: 'I should call the search tool to get up-to-date data.' },
    {
      type: 'tool' as const,
      tool: {
        type: 'search',
        state: 'output-available' as const,
        input: { query: 'current pricing' },
        output: { results: ['Result A', 'Result B'] },
        toolCallId: 'tc_001',
      },
    },
    { type: 'text' as const, text: 'Searched the web for current pricing.' },
  ],
};

/**
 * What the agentic archetype emits where the seed used to be.
 *
 * `mock` gets the fixture commented out beside an empty thread; a real backend
 * gets the explanation only, because there the fixture is unsafe at any level of
 * commenting-out (see `SAMPLE_AGENTIC_MESSAGE`).
 *
 * `decl` is the framework's own line(s) for the fixture, so what an editor's
 * uncomment produces is complete: the declaration AND whatever hands it to the
 * thread. A commented block that leaves an unused `sampleMessages` behind fails
 * `noUnusedLocals` the moment someone takes it up on the offer.
 */
function sampleSeedComment(
  isMock: boolean,
  pad: string,
  decl: (literal: string) => string[],
): string[] {
  const shared = [
    `${pad}// Tool calls and reasoning render INSIDE the thread, as parts on the`,
    `${pad}// assistant message — the stream in onSubmit builds them as the model works.`,
    `${pad}// The thread starts EMPTY so the suggestions show and turn one carries no`,
    `${pad}// conversation the user never had.`,
  ];
  if (!isMock) return shared;
  return [
    ...shared,
    `${pad}// This local preview has no provider to send it to, so here — and only`,
    `${pad}// here — you can uncomment a fixture to see a filled panel with no backend`,
    `${pad}// (replace the empty initializer below with it):`,
    ...decl(JSON.stringify(SAMPLE_AGENTIC_MESSAGE)).map((line) => `${pad}// ${line}`),
  ];
}

// ── front-end rendering ───────────────────────────────────────────────────────

interface RenderCtx {
  p: PlacementStyle;
  emptyHint: string;
  suggestions: string[];
  /** mock = stream the reply client-side (no fetch, no backend, no key) */
  isMock: boolean;
  /** SCAF-8: non-undefined when the integration forwards a model param */
  defaultModel?: string;
  /** the archetype renders kai-tool AND the route forwards a tools array, so the
   *  scaffold declares the schemas that make a tool call possible */
  emitTools: boolean;
  /** the archetype renders kai-tool and there is a backend to call, so the live
   *  multi-round loop (and the `runTool` stub it calls) is emitted */
  emitToolLoop: boolean;
}

/** The kai-* tags for the archetype, in order, as opening/closing markup.
 *
 * SCAF-9: message-embedded companion types (kai-tool, kai-reasoning) are NOT
 * emitted as standalone siblings — they live inside a kai-chat message object.
 * Only standalone companions (kai-sources, etc.) are rendered here with sample data.
 *
 * SCAF-14: workspace structural types (kai-resizable, kai-artifact) are emitted
 * as a properly composed split layout — chat in one pane, artifact in the other.
 */
function componentTags(archetype: Archetype, chatFill: string): string {
  // SCAF-14: workspace is a structural/layout archetype — emit a runnable split.
  if (isWorkspace(archetype)) {
    return [
      `  <!-- SCAF-14: workspace split — chat pane left, artifact preview right. -->`,
      `  <!-- kai-resizable needs kai-resizable-item children to render panels. -->`,
      `  <kai-resizable orientation="horizontal" style="display:block;width:100%;height:100%">`,
      `    <kai-resizable-item size="40%" min="240px">`,
      `      <kai-chat id="chat" suggestion-mode="submit" style="${chatFill}"></kai-chat>`,
      `    </kai-resizable-item>`,
      `    <kai-resizable-item min="280px">`,
      `      <!-- Replace src with your artifact URL or set .files for multi-file preview. -->`,
      `      <kai-artifact id="artifact" src="https://example.com" style="width:100%;height:100%"></kai-artifact>`,
      `    </kai-resizable-item>`,
      `  </kai-resizable>`,
    ].join('\n');
  }

  const companionTags = archetype.components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );
  const hasEmbedded = archetype.components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
  const hasStandaloneCompanions = companionTags.length > 0;

  const lines: string[] = [];
  lines.push(`  <kai-chat id="chat" suggestion-mode="submit" style="${chatFill}"></kai-chat>`);

  if (hasEmbedded) {
    lines.push(
      `  <!-- kai-tool / kai-reasoning render INSIDE the thread, not as siblings: they are`,
      `       parts on a message — parts: [{ type: 'reasoning', … }, { type: 'tool', tool: {…} }, …]`,
      `       — and the stream in the script below builds them as the model works. -->`,
    );
  }

  for (const tag of companionTags) {
    if (tag === 'kai-sources') {
      // kai-sources is genuinely standalone — emit with realistic sample data.
      lines.push(
        `  <!-- Replace sampleSources with your data. -->`,
        `  <kai-sources id="sources"></kai-sources>`,
      );
    } else {
      lines.push(`  <${tag}></${tag}>`);
    }
  }

  if (hasStandaloneCompanions) {
    lines.push(`  <!-- wire data props — see the component_reference MCP tool -->`);
  }

  return lines.join('\n');
}

/**
 * The `html` target's logic, as a REAL `src/main.ts` module.
 *
 * SCAF-19 used to inline this as plain JS inside `<script type="module">` in
 * index.html, on the reasoning that the wiring sets untyped properties on a raw
 * `customElements` reference and would need a hand-cast per property. Being
 * invisible to tsc was described as the benefit.
 *
 * It was the defect. The canonical getting-started path
 * (`npm create vite -- --template vanilla-ts`) builds with `tsc && vite build`
 * and its tsconfig is `"include": ["src"]`, so the consumer's own build
 * type-checked NONE of the scaffold's logic. Proven rather than argued: an
 * injected call to a function that does not exist anywhere left `npm run build`
 * exiting 0 in a stock app.
 *
 * The hand-cast worry does not survive contact either — the kit SHIPS the element
 * interfaces, so one `as KaiChatElement` at the lookup types every property that
 * follows, which is what the svelte and angular targets already do. And the
 * message type comes from the element itself
 * (`KaiChatElement['messages'][number]`) instead of the hand-written local subset
 * the other mock targets declare: derived from the property it is assigned to, it
 * cannot drift out of step with it.
 *
 * Moving the logic into `src/` also retires the TS18003 workaround the old note
 * carried. That error existed only because deleting the template's `src/main.ts`
 * left `src/` with no `.ts` files at all; this scaffold now IS `src/main.ts`.
 */
function htmlModule(ctx: RenderCtx, archetype: Archetype): string {
  const hasEmbedded = archetype.components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
  const hasSources = archetype.components.includes('kai-sources');

  // SCAF-9: the agentic archetype explains where tool + reasoning parts come
  // from. It no longer SEEDS a fabricated turn — see `SAMPLE_AGENTIC_MESSAGE`.
  const seedLines = hasEmbedded
    ? [...sampleSeedComment(ctx.isMock, `  `, (literal) => [`chat.messages = [${literal}];`]), ``]
    : [];

  const sourcesSetupLines = hasSources
    ? [
        `  const sourcesEl = document.getElementById('sources') as KaiSourcesElement;`,
        `  // Replace with your real source data (set as a JS property — it's an array).`,
        `  const sampleSources = [`,
        `    { href: 'https://example.com/doc1', title: 'Getting started', description: 'Overview of the product.' },`,
        `    { href: 'https://example.com/doc2', title: 'API reference', description: 'Full API documentation.' },`,
        `  ];`,
        `  sourcesEl.sources = sampleSources;`,
        ``,
      ]
    : [];

  // Module scope, like vue/angular: the handler below closes over all three, and
  // `runTool` is a function declaration rather than something wedged into init().
  const modelLines = ctx.defaultModel
    ? [
        `// SCAF-8: change this model id to any provider/model string you want to use.`,
        `const model = '${ctx.defaultModel}';`,
        ``,
      ]
    : [];
  const toolsLines = ctx.emitTools ? [...toolSchemaLines(''), ``] : [];
  const runnerLines = ctx.emitToolLoop ? [...toolRunnerLines('', true), ``] : [];

  // KaiSourcesElement only when a kai-sources companion is really declared: a
  // stock vanilla-ts tsconfig sets noUnusedLocals, so an always-on import is a
  // build error on every other archetype.
  const elementTypes = hasSources ? 'KaiChatElement, KaiSourcesElement' : 'KaiChatElement';

  /**
   * Same rule, applied to the kit's own `ChatMessage`.
   *
   * Unlike vue and svelte — which declare `ref<ChatMessage[]>` / `let messages:
   * ChatMessage[]` and therefore always reference it — this target keeps the
   * thread on the element. So the name is only used by the SINGLE-ROUND shape's
   * `const history: ChatMessage[]`; the tool-loop shape's thread IS
   * `chat.messages`, already typed by `KaiChatElement`, and importing the type
   * there is a TS6133 that fails `npm run build` in a stock app.
   */
  const annotatesChatMessage = !ctx.emitToolLoop;

  const head = [
    `// src/main.ts — the page's logic, in a module YOUR build type-checks.`,
    `//`,
    `// It lives here rather than inline in index.html on purpose: the canonical`,
    `// getting-started path (\`npm create vite -- --template vanilla-ts\`) builds with`,
    `// \`tsc && vite build\` and scopes its tsconfig to "include": ["src"], so an`,
    `// inline <script> is checked by nothing at all. Delete the template's own`,
    `// src/main.ts and save this in its place; index.html already points at it.`,
    `import '@kitn.ai/ui/elements';  // registers <kai-*> — required, must come first`,
    `// The kit ships the element interfaces, so one cast at the lookup below types`,
    `// every property assignment that follows.`,
    `import type { ${elementTypes} } from '@kitn.ai/ui/elements';`,
    ...(ctx.isMock
      ? []
      : wireImportLines({ typed: annotatesChatMessage, toolLoop: ctx.emitToolLoop })),
    `import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    ``,
    ...(ctx.isMock ? [...HTML_CHAT_MESSAGE_TYPE, ``] : []),
    ...modelLines,
    ...toolsLines,
    ...runnerLines,
    `async function init() {`,
    `  const chat = document.getElementById('chat') as KaiChatElement;`,
    `  // SCAF-15: kai-* register via an async dynamic import (SSR-safety), so the`,
    `  // element may not be upgraded yet. Wait for the upgrade before setting any`,
    `  // array/object property — values set pre-upgrade are dropped on upgrade.`,
    `  await customElements.whenDefined('kai-chat');`,
    `  // suggestions is a JS PROPERTY (arrays can't be HTML attributes)`,
    `  chat.suggestions = ${jsArray(ctx.suggestions)};`,
    `  chat.suggestionMode = 'submit';`,
    ``,
    ...seedLines,
    ...sourcesSetupLines,
  ];

  // `Event`, not `CustomEvent`: addEventListener with a custom event name hands
  // the listener a plain Event, so the narrowing happens in the body — the same
  // shape renderAngular emits, for the same reason.
  const listenerOpen = [
    `  chat.addEventListener('kai-submit', async (event: Event) => {`,
    `    const e = event as CustomEvent<{ value: string }>;`,
  ];
  const footer = [
    `  });`,
    `}`,
    ``,
    `// A <script type="module"> is deferred, so the DOM is already parsed here.`,
    `void init();`,
  ];

  if (ctx.isMock) {
    return [
      ...head,
      `  // No backend: stream a canned reply client-side (no fetch, no API key).`,
      ...listenerOpen,
      mockStreamBody({
        pad: '    ',
        read: 'chat.messages',
        commitInitial: (expr) => `chat.messages = ${expr};`,
        // chat.messages is live (no React snapshot) — map over it directly
        commitMap: (mapBody) => `chat.messages = chat.messages.map((m) => ${mapBody});`,
        setLoading: (v) => `chat.loading = ${v};`,
        strictRoles: true,
      }),
      ...footer,
    ].join('\n');
  }

  return [
    ...head,
    `  // messages is a JS PROPERTY (objects can't be HTML attributes)`,
    ...listenerOpen,
    realStreamBody({
      pad: '    ',
      read: 'chat.messages',
      commitSet: (expr) => `chat.messages = ${expr};`,
      setterAdapter: '(fn) => { chat.messages = fn(chat.messages); }',
      setLoading: (v) => `chat.loading = ${v};`,
      bodyPayload: realBodyPayload({ defaultModel: ctx.defaultModel, tools: ctx.emitTools }),
      strictRoles: true,
      toolLoop: ctx.emitToolLoop,
      thread: liveThreadBinding(
        'chat.messages',
        '(fn) => { chat.messages = fn(chat.messages); }',
        'chat.messages ?? []',
      ),
    }),
    ...footer,
  ].join('\n');
}

/**
 * The `html` target: TWO files, split on the same `// ── path ──` separator the
 * backend routes already use.
 *
 *   index.html   the markup, plus a <script type="module" src="/src/main.ts">
 *   src/main.ts  the logic — see `htmlModule` for why it is not inline any more
 *
 * Both files are emitted for every target that lands here — the backend-only
 * frameworks (express/worker/fastapi) get the same browser side, since a module
 * their bundler can see beats an inline script for them too. Only the note about
 * replacing the vanilla-ts template's own entry is specific to `html`, so only
 * that is gated on `isViteHtmlTarget`.
 */
function renderHtml(archetype: Archetype, ctx: RenderCtx, isViteHtmlTarget: boolean): string {
  const { p, emptyHint } = ctx;
  const scriptNote = isViteHtmlTarget
    ? [
        `<!-- The logic is a real module, NOT an inline script: a stock vanilla-ts`,
        `     tsconfig is "include": ["src"], so anything inline is type-checked by`,
        `     nothing at all. Delete the template's src/main.ts and save the file`,
        `     below in its place — this tag is the one the template already ships. -->`,
      ]
    : [
        `<!-- The logic is a real module, not an inline script, so your own build`,
        `     type-checks it. Save the file below as src/main.ts. -->`,
      ];
  return [
    `<!-- index.html — paste this into <body>. -->`,
    `<!-- ${archetype.title} — ${p.note} -->`,
    ...(p.altNote ?? []).map((l) => `<!-- ${l} -->`),
    `<div style="${p.style}">`,
    componentTags(archetype, p.chatFill),
    `</div>`,
    ...scriptNote,
    `<script type="module" src="/src/main.ts"></script>`,
    ``,
    `<!-- empty-state hint: ${emptyHint} -->`,
    ``,
    `// ── src/main.ts ──────────────────────────────────────────────────────────────`,
    htmlModule(ctx, archetype),
  ].join('\n');
}

/** Convert a kebab-case custom-element tag to its PascalCase React wrapper name. */
function toPascalCase(tag: string): string {
  // e.g. "kai-chat" → "Chat", "kai-sources" → "Sources"
  return tag
    .replace(/^kai-/, '')
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

/** JSX usage for react/next: uses the official @kitn.ai/ui/react wrappers. */
function renderJsx(archetype: Archetype, ctx: RenderCtx, framework: string): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  const hasEmbedded = archetype.components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
  const workspace = isWorkspace(archetype);

  // SCAF-9: exclude message-embedded tags from import list.
  // SCAF-14: workspace uses Resizable+ResizableItem+Artifact — keep them in the import list.
  const renderableTags = archetype.components.filter((t) => !MESSAGE_EMBEDDED_TAGS.has(t));
  // For workspace: replace 'kai-resizable' with 'kai-resizable-item' so we get ResizableItem too.
  const importTags = workspace
    ? [...new Set([...renderableTags.filter((t) => t !== 'kai-resizable'), 'kai-resizable', 'kai-resizable-item'])]
    : renderableTags;
  const wrapperNames = importTags.map(toPascalCase);
  const importList = wrapperNames.join(', ');

  // SCAF-9: standalone companion tags (not kai-chat, not message-embedded, not workspace-structural).
  const standaloneCompanionTags = archetype.components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );

  // Build companion JSX: only standalone companions with real props.
  // SCAF-14: workspace gets its own structural JSX block (not companion lines).
  const companionJsxLines: string[] = [];
  if (hasEmbedded) {
    companionJsxLines.push(
      `      {/* kai-tool / kai-reasoning render inside the thread, as parts on the`,
      `          assistant message the stream in onSubmit builds. */}`,
    );
  }
  for (const t of standaloneCompanionTags) {
    if (t === 'kai-sources') {
      companionJsxLines.push(
        `      {/* Replace sampleSources with your real data. */}`,
        `      <Sources sources={sampleSources} />`,
      );
    } else {
      companionJsxLines.push(`      {/* wire data props — see the component_reference MCP tool */}`);
      companionJsxLines.push(`      <${toPascalCase(t)} />`);
    }
  }
  const companions = companionJsxLines.join('\n');

  const chatMessageType = chatMessageDecl(isMock);

  // SCAF-9: no fabricated seed — see SAMPLE_AGENTIC_MESSAGE for the three ways
  // one broke a real app.
  const sampleMessagesInit = [
    ...(hasEmbedded
      ? sampleSeedComment(isMock, '  ', (literal) => [
          `const sampleMessages: ChatMessage[] = [${literal}];`,
          `const [messages, setMessages] = useState<ChatMessage[]>(sampleMessages);`,
        ])
      : []),
    `  const [messages, setMessages] = useState<ChatMessage[]>([]);`,
  ].join('\n');

  // SCAF-9: sample sources data for knowledge-base archetype.
  const sampleSourcesInit =
    standaloneCompanionTags.includes('kai-sources')
      ? [
          `  // Replace sampleSources with your real source data.`,
          `  const sampleSources = [`,
          `    { href: 'https://example.com/doc1', title: 'Getting started', description: 'Overview of the product.' },`,
          `    { href: 'https://example.com/doc2', title: 'API reference', description: 'Full API documentation.' },`,
          `  ];`,
        ].join('\n')
      : '';

  // SCAF-8: model const for integrations that forward model to the upstream provider.
  const modelInit = defaultModel
    ? `  // SCAF-8: change this to any provider/model string you want to use.\n  const model = '${defaultModel}';`
    : '';

  const toolsInit = emitTools ? toolSchemaLines('  ').join('\n') : '';
  const toolRunner = emitToolLoop ? toolRunnerLines('  ', true).join('\n') : '';

  // onSubmit body: mock streams a canned reply client-side; otherwise fetch /api/chat.
  const onSubmitBody = isMock
    ? mockStreamBody({
        pad: '    ',
        read: 'messages',
        commitInitial: (expr) => `setMessages(${expr});`,
        // functional updater so each token maps over the LATEST array, not the snapshot
        commitMap: (mapBody) => `setMessages((prev) => prev.map((m) => ${mapBody}));`,
        setLoading: (v) => `setLoading(${v});`,
        strictRoles: true,
      })
    : realStreamBody({
        pad: '    ',
        read: 'messages',
        commitSet: (expr) => `setMessages(${expr});`,
        // useState's setter IS a SetMessages: both are (updater) => void.
        setterAdapter: 'setMessages',
        setLoading: (v) => `setLoading(${v});`,
        bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
        strictRoles: true,
        toolLoop: emitToolLoop,
        thread: REACT_THREAD,
      });

  // SCAF-2: Next.js App Router requires 'use client' for components that use hooks/interactivity.
  const useClientDirective = framework === 'next' ? [`'use client';`, ``] : [];

  // SCAF-6: For Next.js ONLY — use next/dynamic with { ssr: false }. NOT because
  // importing the package on the server crashes: `@kitn.ai/ui/react`, `@kitn.ai/ui/elements`
  // and the state helpers are all SSR-import-safe (verified by prerendering a server
  // component that statically imports them). The reason is rendering: <kai-*> are
  // CLIENT-ONLY custom elements, and the server has no customElements registry, so a
  // server-rendered <kai-chat> is an inert unupgraded tag that mismatches the upgraded
  // client tree on hydration. Plain `react` (Vite) has no SSR and keeps top-level imports.
  if (framework === 'next') {
    // Build dynamic() calls for every renderable wrapper in the archetype.
    const dynamicImports = wrapperNames.map(
      (name) =>
        `const ${name} = dynamic(() => import('@kitn.ai/ui/react').then((m) => m.${name}), { ssr: false });`,
    );

    // SCAF-2: Next.js config note — @kitn.ai/ui ships compiled entry points; no transpilePackages needed.
    const nextConfigNote: string[] = [];

    return [
      // 'use client' must be the very first line for Next.js App Router.
      ...useClientDirective,
      `import { useState } from 'react';`,
      `import dynamic from 'next/dynamic';`,
      // The adapter is pure parsing + pure state; both entries are SSR-import-safe,
      // so they stay static imports even though the ELEMENTS have to be dynamic.
      ...(isMock
        ? []
        : wireImportLines({ typed: true, toolLoop: emitToolLoop, setMessagesType: emitToolLoop })),
      `import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
      `// <kai-*> are client-only custom elements (the server has no customElements`,
      `// registry) → load client-only so hydration doesn't mismatch. The package itself`,
      `// is SSR-import-safe; importing it from a server component is fine.`,
      ...dynamicImports,
      ``,
      ...nextConfigNote,
      `// ${archetype.title} — ${p.note}. empty-state hint: ${emptyHint}`,
      ...(p.altNote ?? []).map((l) => `// ${l}`),
      ...chatMessageType,
      ``,
      `export default function App() {`,
      sampleMessagesInit,
      `  const [loading, setLoading] = useState(false);`,
      `  const suggestions = ${jsArray(suggestions)};`,
      ...(sampleSourcesInit ? [sampleSourcesInit] : []),
      ...(modelInit ? [modelInit] : []),
      ...(toolsInit ? [toolsInit] : []),
      ...(toolRunner ? [toolRunner] : []),
      ``,
      `  async function onSubmit(e: CustomEvent<{ value: string }>) {`,
      onSubmitBody,
      `  }`,
      ``,
      `  return (`,
      `    <div style={{ ${jsxStyle(p.style)} }}>`,
      ...(workspace
        ? [
            `      {/* SCAF-14: workspace split — chat pane left, artifact preview right. */}`,
            `      {/* Resizable needs ResizableItem children to render panels. */}`,
            `      <Resizable orientation="horizontal" style={{ display: 'block', width: '100%', height: '100%' }}>`,
            `        <ResizableItem size="40%" min="240px">`,
            `          <Chat`,
            `            messages={messages}`,
            `            loading={loading}`,
            `            suggestions={suggestions}`,
            `            suggestionMode="submit"`,
            `            onSubmit={onSubmit}`,
            `            style={{ ${jsxStyle(p.chatFill)} }}`,
            `          />`,
            `        </ResizableItem>`,
            `        <ResizableItem min="280px">`,
            `          {/* Replace src + files with your real artifact data (files is required: array/object props are never optional attributes on a kai-* element). */}`,
            `          <Artifact src="https://example.com" files={[{ path: 'index.html', url: 'https://example.com' }]} style={{ width: '100%', height: '100%' }} />`,
            `        </ResizableItem>`,
            `      </Resizable>`,
          ]
        : [
            `      <Chat`,
            `        messages={messages}`,
            `        loading={loading}`,
            `        suggestions={suggestions}`,
            `        suggestionMode="submit"`,
            `        onSubmit={onSubmit}`,
            `        style={{ ${jsxStyle(p.chatFill)} }}`,
            `      />`,
            companions,
          ]),
      `    </div>`,
      `  );`,
      `}`,
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  // SCAF-2: Next.js transpilePackages note (needed until @kitn.ai/ui ships prebuilt JS on "." + "./react").
  const nextConfigNote: string[] = [];

  return [
    // SCAF-2: 'use client' must be the very first line for Next.js App Router.
    ...useClientDirective,
    // (1) REQUIRED: registers <kai-*> — the react wrappers do NOT auto-register.
    // Must come BEFORE importing the wrappers, or <kai-chat> renders empty.
    `import '@kitn.ai/ui/elements';  // registers <kai-*> — required, must come first`,
    `import { useState } from 'react';`,
    `import { ${importList} } from '@kitn.ai/ui/react';`,
    ...(isMock
      ? []
      : wireImportLines({ typed: true, toolLoop: emitToolLoop, setMessagesType: emitToolLoop })),
    `import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    ``,
    ...nextConfigNote,
    `// ${archetype.title} — ${p.note}. empty-state hint: ${emptyHint}`,
    ...(p.altNote ?? []).map((l) => `// ${l}`),
    ...chatMessageType,
    ``,
    `export default function App() {`,
    sampleMessagesInit,
    `  const [loading, setLoading] = useState(false);`,
    `  const suggestions = ${jsArray(suggestions)};`,
    ...(sampleSourcesInit ? [sampleSourcesInit] : []),
    ...(modelInit ? [modelInit] : []),
    ...(toolsInit ? [toolsInit] : []),
    ...(toolRunner ? [toolRunner] : []),
    ``,
    `  async function onSubmit(e: CustomEvent<{ value: string }>) {`,
    onSubmitBody,
    `  }`,
    ``,
    `  return (`,
    `    <div style={{ ${jsxStyle(p.style)} }}>`,
    ...(workspace
      ? [
          `      {/* SCAF-14: workspace split — chat pane left, artifact preview right. */}`,
          `      {/* Resizable needs ResizableItem children to render panels. */}`,
          `      <Resizable orientation="horizontal" style={{ display: 'block', width: '100%', height: '100%' }}>`,
          `        <ResizableItem size="40%" min="240px">`,
          `          <Chat`,
          `            messages={messages}`,
          `            loading={loading}`,
          `            suggestions={suggestions}`,
          `            suggestionMode="submit"`,
          `            onSubmit={onSubmit}`,
          `            style={{ ${jsxStyle(p.chatFill)} }}`,
          `          />`,
          `        </ResizableItem>`,
          `        <ResizableItem min="280px">`,
          `          {/* Replace src + files with your real artifact data (files is required: array/object props are never optional attributes on a kai-* element). */}`,
          `          <Artifact src="https://example.com" files={[{ path: 'index.html', url: 'https://example.com' }]} style={{ width: '100%', height: '100%' }} />`,
          `        </ResizableItem>`,
          `      </Resizable>`,
        ]
      : [
          `      <Chat`,
          `        messages={messages}`,
          `        loading={loading}`,
          `        suggestions={suggestions}`,
          `        suggestionMode="submit"`,
          `        onSubmit={onSubmit}`,
          `        style={{ ${jsxStyle(p.chatFill)} }}`,
          `      />`,
          companions,
        ]),
    `    </div>`,
    `  );`,
    `}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** Vue: bind messages/suggestions as properties, listen for kai-submit with @. */
function renderVue(archetype: Archetype, ctx: RenderCtx): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  // SCAF-9: exclude message-embedded tags from companion rendering.
  // SCAF-14: also exclude workspace structural tags (handled by the workspace block below).
  const workspace = isWorkspace(archetype);
  const standaloneCompanionTags = archetype.components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );
  const hasEmbedded = archetype.components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));

  const companionLines: string[] = [];
  if (hasEmbedded) {
    companionLines.push(
      `    <!-- kai-tool / kai-reasoning render INSIDE the thread, as parts on the assistant message the stream builds. -->`,
    );
  }
  for (const t of standaloneCompanionTags) {
    if (t === 'kai-sources') {
      companionLines.push(`    <!-- Replace sampleSources with your real data (set as a JS property). -->`);
      companionLines.push(`    <kai-sources ref="sourcesEl" />`);
    } else {
      companionLines.push(`    <!-- wire data props — see the component_reference MCP tool -->`);
      companionLines.push(`    <${t} />`);
    }
  }
  const companions = companionLines.join('\n');

  const onSubmitBody = isMock
    ? mockStreamBody({
        pad: '    ',
        read: 'messages.value',
        commitInitial: (expr) => `messages.value = ${expr};`,
        // messages.value is live — map over it directly
        commitMap: (mapBody) => `messages.value = messages.value.map((m) => ${mapBody});`,
        setLoading: (v) => `loading.value = ${v};`,
        strictRoles: true,
      })
    : realStreamBody({
        pad: '    ',
        read: 'messages.value',
        commitSet: (expr) => `messages.value = ${expr};`,
        setterAdapter: '(fn) => { messages.value = fn(messages.value); }',
        setLoading: (v) => `loading.value = ${v};`,
        bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
        strictRoles: true,
        toolLoop: emitToolLoop,
        thread: liveThreadBinding('messages.value', '(fn) => { messages.value = fn(messages.value); }'),
      });

  // SCAF-10: ChatMessage declaration for strict-TS Vue consumers.
  const chatMessageType = chatMessageDecl(isMock);

  // SCAF-8: model const at module scope so onSubmit closes over it.
  const modelInit = defaultModel
    ? [
        `// SCAF-8: change this to any provider/model string you want to use.`,
        `const model = '${defaultModel}';`,
      ]
    : [];

  // Same scope, same reason: onSubmit puts `tools` in the request body.
  const toolsLines = emitTools ? toolSchemaLines('') : [];
  // Same scope again: the loop in onSubmit calls runTool.
  const runnerLines = emitToolLoop ? toolRunnerLines('', true) : [];

  // SCAF-9: no fabricated seed — see SAMPLE_AGENTIC_MESSAGE.
  const sampleSeed = [
    ...(hasEmbedded
      ? sampleSeedComment(isMock, '', (literal) => [
          `const messages = ref<ChatMessage[]>([${literal}]);`,
        ])
      : []),
    `const messages = ref<ChatMessage[]>([]);`,
  ];

  // SCAF-9: sample sources setup.
  const sourcesSeed = standaloneCompanionTags.includes('kai-sources')
    ? [
        `// Replace sampleSources with your real source data.`,
        `const sampleSources = [`,
        `  { href: 'https://example.com/doc1', title: 'Getting started', description: 'Overview of the product.' },`,
        `  { href: 'https://example.com/doc2', title: 'API reference', description: 'Full API documentation.' },`,
        `];`,
        `onMounted(() => {`,
        `  const el = document.querySelector('kai-sources');`,
        `  if (el) el.sources = sampleSources;`,
        `});`,
      ]
    : [];

  // SCAF-15: always import onMounted — we re-apply props after the element upgrades
  // (the .prop bindings can apply before the async element registration resolves).
  const vueImports = `import { ref, onMounted } from 'vue';`;

  // SCAF-14: workspace template block — resizable split with chat + artifact panes.
  const workspaceTemplate = workspace
    ? [
        `    <!-- SCAF-14: workspace split — chat pane left, artifact preview right. -->`,
        `    <!-- kai-resizable needs kai-resizable-item children to render panels. -->`,
        `    <kai-resizable orientation="horizontal" style="display:block;width:100%;height:100%">`,
        `      <kai-resizable-item size="40%" min="240px">`,
        `        <kai-chat`,
        `          :messages.prop="messages"`,
        `          :loading.prop="loading"`,
        `          :suggestions.prop="suggestions"`,
        `          suggestion-mode="submit"`,
        `          style="${p.chatFill}"`,
        `          @kai-submit="onSubmit"`,
        `        ></kai-chat>`,
        `      </kai-resizable-item>`,
        `      <kai-resizable-item min="280px">`,
        `        <!-- Replace src with your artifact URL or set .files for multi-file preview. -->`,
        `        <kai-artifact src="https://example.com" style="width:100%;height:100%"></kai-artifact>`,
        `      </kai-resizable-item>`,
        `    </kai-resizable>`,
      ]
    : [
        `    <kai-chat`,
        `      :messages.prop="messages"`,
        `      :loading.prop="loading"`,
        `      :suggestions.prop="suggestions"`,
        `      suggestion-mode="submit"`,
        `      style="${p.chatFill}"`,
        `      @kai-submit="onSubmit"`,
        `    ></kai-chat>`,
        companions,
      ];

  return [
    `<!-- vue — ${archetype.title} — ${p.note}. empty-state hint: ${emptyHint} -->`,
    ...(p.altNote ?? []).map((l) => `<!-- ${l} -->`),
    `<!-- SCAF-3: vite.config.ts — tell Vue that kai-* are custom elements (not Vue components).`,
    `     Without this, Vue warns "Unknown custom element" and .prop bindings may misbehave.`,
    `     import vue from '@vitejs/plugin-vue';`,
    `     export default { plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('kai-') } } })] }; -->`,
    `<script setup lang="ts">`,
    `import '@kitn.ai/ui/elements';  // registers <kai-*> — required, must come first`,
    ...(isMock ? [] : wireImportLines({ typed: true, toolLoop: emitToolLoop })),
    `import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    vueImports,
    ``,
    ...chatMessageType,
    ``,
    ...sampleSeed,
    `const loading = ref(false);`,
    `const suggestions = ${jsArray(suggestions)};`,
    ...modelInit,
    ...toolsLines,
    ...runnerLines,
    ...sourcesSeed,
    ``,
    `// SCAF-15: kai-* register via an async dynamic import (SSR-safety). The .prop`,
    `// bindings can apply before the element upgrades, which drops them — re-apply once`,
    `// the element is defined so the initial messages/suggestions/loading stick.`,
    `onMounted(async () => {`,
    `  await customElements.whenDefined('kai-chat');`,
    `  const el = document.querySelector('kai-chat');`,
    `  if (el) Object.assign(el, { messages: messages.value, loading: loading.value, suggestions });`,
    `});`,
    ``,
    `async function onSubmit(e: CustomEvent<{ value: string }>) {`,
    onSubmitBody,
    `}`,
    `</script>`,
    ``,
    `<template>`,
    `  <div style="${p.style}">`,
    ...workspaceTemplate,
    `  </div>`,
    `</template>`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** Svelte: use bind:this to set array/object properties reactively; on:kai-submit for the event. */
function renderSvelte(archetype: Archetype, ctx: RenderCtx): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  // SCAF-9: exclude message-embedded tags from companion rendering.
  // SCAF-14: also exclude workspace structural tags (handled by the workspace block below).
  const workspace = isWorkspace(archetype);
  const standaloneCompanionTags = archetype.components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );
  const hasEmbedded = archetype.components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
  const hasSourcesCompanion = standaloneCompanionTags.includes('kai-sources');

  const companionLinesList: string[] = [];
  if (hasEmbedded) {
    companionLinesList.push(
      `  <!-- kai-tool / kai-reasoning render INSIDE the thread, as parts on the assistant message the stream builds. -->`,
    );
  }
  for (const t of standaloneCompanionTags) {
    if (t === 'kai-sources') {
      companionLinesList.push(`  <!-- Replace sampleSources with your real data. -->`);
      companionLinesList.push(`  <kai-sources bind:this={sourcesEl}></kai-sources>`);
    } else {
      companionLinesList.push(`  <!-- wire data props — see the component_reference MCP tool -->`);
      companionLinesList.push(`  <${t}></${t}>`);
    }
  }
  const companionLines = companionLinesList.join('\n');

  const onSubmitBody = isMock
    ? mockStreamBody({
        pad: '    ',
        read: 'messages',
        commitInitial: (expr) => `messages = ${expr};`,
        // `messages` is a live local — reassign to map over the latest array
        commitMap: (mapBody) => `messages = messages.map((m) => ${mapBody});`,
        setLoading: (v) => `loading = ${v};`,
        strictRoles: true,
      })
    : realStreamBody({
        pad: '    ',
        read: 'messages',
        commitSet: (expr) => `messages = ${expr};`,
        setterAdapter: '(fn) => { messages = fn(messages); }',
        setLoading: (v) => `loading = ${v};`,
        bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
        strictRoles: true,
        toolLoop: emitToolLoop,
        thread: liveThreadBinding('messages', '(fn) => { messages = fn(messages); }'),
      });

  // SCAF-10: ChatMessage declaration for strict-TS Svelte consumers.
  const chatMessageType = chatMessageDecl(isMock, '  ');

  // SCAF-8: model const at script scope so onSubmit closes over it.
  const modelInit = defaultModel
    ? [
        `  // SCAF-8: change this to any provider/model string you want to use.`,
        `  const model = '${defaultModel}';`,
      ]
    : [];

  // Same scope, same reason: onSubmit puts `tools` in the request body.
  const toolsLines = emitTools ? toolSchemaLines('  ') : [];
  // Same scope again: the loop in onSubmit calls runTool.
  const runnerLines = emitToolLoop ? toolRunnerLines('  ', true) : [];

  // SCAF-9: no fabricated seed — see SAMPLE_AGENTIC_MESSAGE.
  //
  // `$state.raw`, not `$state`: the kit's contract is a NEW array reference per
  // chunk (mutating in place does not re-render), which is exactly what raw state
  // tracks. Deep state would also proxy every message object on its way into a
  // Solid-backed custom element, for reactivity this code never relies on.
  const sampleMessagesInit = [
    ...(hasEmbedded
      ? sampleSeedComment(isMock, '  ', (literal) => [
          `let messages = $state.raw<ChatMessage[]>([${literal}]);`,
        ])
      : []),
    `  let messages = $state.raw<ChatMessage[]>([]);`,
  ];

  // SCAF-9: sources element ref + sample data. Typed as the kit's own element
  // interface (not HTMLElement) so the `.sources =` assignment below typechecks
  // honestly under `tsc --strict`: HTMLElement has no `sources` property.
  // `bind:this` writes to this binding, so in runes mode it has to be $state.
  const sourcesEl = hasSourcesCompanion
    ? [`  let sourcesEl = $state<KaiSourcesElement | undefined>(undefined);`]
    : [];
  const sourcesReactive = standaloneCompanionTags.includes('kai-sources')
    ? [
        `  // Replace sampleSources with your real source data.`,
        `  const sampleSources = [`,
        `    { href: 'https://example.com/doc1', title: 'Getting started', description: 'Overview of the product.' },`,
        `    { href: 'https://example.com/doc2', title: 'API reference', description: 'Full API documentation.' },`,
        `  ];`,
        `  $effect(() => { if (sourcesEl) { sourcesEl.sources = sampleSources; } });`,
      ]
    : [];

  // SCAF-14: workspace template block — resizable split with chat + artifact panes.
  const workspaceMarkup = workspace
    ? [
        `  <!-- SCAF-14: workspace split — chat pane left, artifact preview right. -->`,
        `  <!-- kai-resizable needs kai-resizable-item children to render panels. -->`,
        `  <kai-resizable orientation="horizontal" style="display:block;width:100%;height:100%">`,
        `    <kai-resizable-item size="40%" min="240px">`,
        `      <kai-chat bind:this={chatEl} suggestion-mode="submit" style="${p.chatFill}" onkai-submit={onSubmit}></kai-chat>`,
        `    </kai-resizable-item>`,
        `    <kai-resizable-item min="280px">`,
        `      <!-- Replace src with your artifact URL or set .files for multi-file preview. -->`,
        `      <kai-artifact src="https://example.com" style="width:100%;height:100%"></kai-artifact>`,
        `    </kai-resizable-item>`,
        `  </kai-resizable>`,
      ]
    : [
        `  <kai-chat bind:this={chatEl} suggestion-mode="submit" style="${p.chatFill}" onkai-submit={onSubmit}></kai-chat>`,
        companionLines,
      ];

  return [
    `<!-- svelte — ${archetype.title} — ${p.note}. empty-state hint: ${emptyHint} -->`,
    ...(p.altNote ?? []).map((l) => `<!-- ${l} -->`),
    `<!-- SCAF-5: Svelte 5 RUNES ($state / $effect, onkai-submit). \`sv create\` forces`,
    `     runes mode project-wide (see the compilerOptions in its vite.config.ts), so the`,
    `     Svelte-4 forms this used to emit are hard errors there, not deprecations:`,
    `     "\`$:\` is not allowed in runes mode" fails svelte-check AND vite build. -->`,
    `<script lang="ts">`,
    `  import '@kitn.ai/ui/elements';  // registers <kai-*> — required, must come first`,
    // KaiSourcesElement is only imported when a kai-sources companion is actually
    // declared below: an always-on import would be unused (and fail noUnusedLocals)
    // on every archetype without kai-sources.
    `  import type { ${hasSourcesCompanion ? 'KaiChatElement, KaiSourcesElement' : 'KaiChatElement'} } from '@kitn.ai/ui/elements';`,
    ...(isMock ? [] : wireImportLines({ pad: '  ', typed: true, toolLoop: emitToolLoop })),
    `  import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    `  import { onMount } from 'svelte';`,
    ...chatMessageType,
    `  // \`bind:this\` writes to this binding, so under runes it must be $state.`,
    `  let chatEl = $state<KaiChatElement | undefined>(undefined);`,
    `  // SCAF-15: kai-* register via an async dynamic import (SSR-safety). Gate the`,
    `  // property $effect on the upgrade so the first application isn't dropped`,
    `  // (props set on a not-yet-upgraded element are lost on upgrade).`,
    `  let defined = $state(false);`,
    `  onMount(async () => { await customElements.whenDefined('kai-chat'); defined = true; });`,
    ...sourcesEl,
    ...sampleMessagesInit,
    `  let loading = $state(false);`,
    `  const suggestions: string[] = ${jsArray(suggestions)};`,
    ...modelInit,
    ...toolsLines,
    ...runnerLines,
    `  // suggestions/messages are JS PROPERTIES (arrays/objects can't be attributes)`,
    `  $effect(() => {`,
    `    if (chatEl && defined) { chatEl.messages = messages; chatEl.loading = loading; chatEl.suggestions = suggestions; }`,
    `  });`,
    ...sourcesReactive,
    ``,
    `  async function onSubmit(e: CustomEvent<{ value: string }>) {`,
    onSubmitBody,
    `  }`,
    `</script>`,
    ``,
    `<div style="${p.style}">`,
    ...workspaceMarkup,
    `</div>`,
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === '' && i === arr.length - 1))
    .join('\n');
}

/**
 * TanStack Start: emits a file-based route (`src/routes/chat.tsx`) that renders
 * the Chat surface client-only via `ssr: false` on `createFileRoute`.
 *
 * Verified pattern: `ssr: false` prevents the Solid-based web-component runtime
 * from running on the server — no `window is not defined` crash, no hydration
 * mismatch. The library is SSR-import-safe (customElements.define is guarded),
 * so the import itself is safe; only the *render* needs to be client-only.
 *
 * Scaffold command (official TanStack CLI, non-interactive):
 *   npx @tanstack/cli@latest create <app-name> --framework react --no-git --package-manager npm -y
 *
 * After scaffolding, run `npm install @kitn.ai/ui`, then drop this file into
 * `src/routes/chat.tsx`. Start the dev server with `npm run dev` (port 3000).
 * Build: `npm run build`; preview: `npm run preview` (or `node dist/server/server.js`).
 * Note: `npm start` does NOT exist in TanStack Start projects — use `npm run dev` / `npm run preview`.
 *
 * Backend: the emitted front end fetches `/api/chat`, so it needs a SERVER ROUTE,
 * not a server function. In TanStack Start that is a file route carrying a
 * `server.handlers` block — `src/routes/api/chat.ts` with
 * `createFileRoute('/api/chat')({ server: { handlers: { POST } } })`. Block (2)
 * emits exactly that. This comment used to name `createServerFn` and
 * `src/server/chat.ts`, which can never answer a `fetch('/api/chat')`: the two
 * halves of the same scaffold contradicted each other.
 */
function renderTanstackStart(archetype: Archetype, ctx: RenderCtx): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  // TanStack Start is React — reuse all the React composition logic:
  // same ChatMessage type, same state/loading/suggestions, same mock stream body,
  // same real-backend SSE streaming. The ONLY delta from plain `react` is:
  //   1. `import { createFileRoute } from '@tanstack/react-router'` instead of no-op router import
  //   2. `export const Route = createFileRoute('/chat')({ ssr: false, component: ChatPage })`
  //   3. The page function is named `ChatPage` (not `App`) — no export-default clash with createFileRoute
  //   4. No `import '@kitn.ai/ui/elements'` needed as a top-level import (same as next's dynamic approach
  //      is not needed here — the library is SSR-import-safe, but we include elements for safety)

  const hasEmbedded = archetype.components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
  const workspace = isWorkspace(archetype);

  const renderableTags = archetype.components.filter((t) => !MESSAGE_EMBEDDED_TAGS.has(t));
  const importTags = workspace
    ? [...new Set([...renderableTags.filter((t) => t !== 'kai-resizable'), 'kai-resizable', 'kai-resizable-item'])]
    : renderableTags;
  const wrapperNames = importTags.map(toPascalCase);
  const importList = wrapperNames.join(', ');

  const standaloneCompanionTags = archetype.components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );

  const companionJsxLines: string[] = [];
  if (hasEmbedded) {
    companionJsxLines.push(
      `      {/* kai-tool / kai-reasoning render inside the thread, as parts on the`,
      `          assistant message the stream in onSubmit builds. */}`,
    );
  }
  for (const t of standaloneCompanionTags) {
    if (t === 'kai-sources') {
      companionJsxLines.push(
        `      {/* Replace sampleSources with your real data. */}`,
        `      <Sources sources={sampleSources} />`,
      );
    } else {
      companionJsxLines.push(`      {/* wire data props — see the component_reference MCP tool */}`);
      companionJsxLines.push(`      <${toPascalCase(t)} />`);
    }
  }
  const companions = companionJsxLines.join('\n');

  const chatMessageType = chatMessageDecl(isMock);

  // SCAF-9: no fabricated seed — see SAMPLE_AGENTIC_MESSAGE.
  const sampleMessagesInit = [
    ...(hasEmbedded
      ? sampleSeedComment(isMock, '  ', (literal) => [
          `const sampleMessages: ChatMessage[] = [${literal}];`,
          `const [messages, setMessages] = useState<ChatMessage[]>(sampleMessages);`,
        ])
      : []),
    `  const [messages, setMessages] = useState<ChatMessage[]>([]);`,
  ].join('\n');

  const sampleSourcesInit =
    standaloneCompanionTags.includes('kai-sources')
      ? [
          `  // Replace sampleSources with your real source data.`,
          `  const sampleSources = [`,
          `    { href: 'https://example.com/doc1', title: 'Getting started', description: 'Overview of the product.' },`,
          `    { href: 'https://example.com/doc2', title: 'API reference', description: 'Full API documentation.' },`,
          `  ];`,
        ].join('\n')
      : '';

  const modelInit = defaultModel
    ? `  // SCAF-8: change this to any provider/model string you want to use.\n  const model = '${defaultModel}';`
    : '';

  const toolsInit = emitTools ? toolSchemaLines('  ').join('\n') : '';
  const toolRunner = emitToolLoop ? toolRunnerLines('  ', true).join('\n') : '';

  const onSubmitBody = isMock
    ? mockStreamBody({
        pad: '    ',
        read: 'messages',
        commitInitial: (expr) => `setMessages(${expr});`,
        commitMap: (mapBody) => `setMessages((prev) => prev.map((m) => ${mapBody}));`,
        setLoading: (v) => `setLoading(${v});`,
        strictRoles: true,
      })
    : realStreamBody({
        pad: '    ',
        read: 'messages',
        commitSet: (expr) => `setMessages(${expr});`,
        // useState's setter IS a SetMessages: both are (updater) => void.
        setterAdapter: 'setMessages',
        setLoading: (v) => `setLoading(${v});`,
        bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
        strictRoles: true,
        toolLoop: emitToolLoop,
        thread: REACT_THREAD,
      });

  // File path guidance for TanStack Start (file-based routing)
  const filePathNote = [
    `// TanStack Start route file — save as: src/routes/chat.tsx`,
    `// Scaffold command: npx @tanstack/cli@latest create <app-name> --framework react --no-git --package-manager npm -y`,
    `// Then: npm install @kitn.ai/ui`,
    `// Dev: npm run dev (port 3000)  Build: npm run build  Preview: npm run preview`,
    `// Note: there is no 'npm start' script — use 'npm run dev' or 'npm run preview'.`,
    `// Backend: the fetch below hits /api/chat, so it needs a SERVER ROUTE, not a`,
    `// server function: src/routes/api/chat.ts with server.handlers.POST — block (2).`,
    ``,
  ];

  return [
    ...filePathNote,
    // TanStack Start uses @tanstack/react-router's createFileRoute
    `import { createFileRoute } from '@tanstack/react-router'`,
    `import { useState } from 'react'`,
    // Elements registration: the library is SSR-import-safe; top-level import is safe here
    `import '@kitn.ai/ui/elements';  // registers <kai-*> — required, must come first`,
    `import { ${importList} } from '@kitn.ai/ui/react'`,
    ...(isMock
      ? []
      : wireImportLines({ typed: true, toolLoop: emitToolLoop, setMessagesType: emitToolLoop })),
    `import '@kitn.ai/ui/theme.tokens.css'  // compiled token defaults`,
    ``,
    `// ${archetype.title} — ${p.note}. empty-state hint: ${emptyHint}`,
    ...(p.altNote ?? []).map((l) => `// ${l}`),
    ...chatMessageType,
    ``,
    `// ssr: false keeps the Solid-based web component client-only.`,
    `// Server HTML for /chat omits <kai-chat> → no hydration mismatch.`,
    `export const Route = createFileRoute('/chat')({`,
    `  ssr: false,`,
    `  component: ChatPage,`,
    `})`,
    ``,
    `function ChatPage() {`,
    sampleMessagesInit,
    `  const [loading, setLoading] = useState(false);`,
    `  const suggestions = ${jsArray(suggestions)};`,
    ...(sampleSourcesInit ? [sampleSourcesInit] : []),
    ...(modelInit ? [modelInit] : []),
    ...(toolsInit ? [toolsInit] : []),
    ...(toolRunner ? [toolRunner] : []),
    ``,
    `  async function onSubmit(e: CustomEvent<{ value: string }>) {`,
    onSubmitBody,
    `  }`,
    ``,
    `  return (`,
    `    <main style={{ ${jsxStyle(p.style)} }}>`,
    ...(workspace
      ? [
          `      {/* SCAF-14: workspace split — chat pane left, artifact preview right. */}`,
          `      {/* Resizable needs ResizableItem children to render panels. */}`,
          `      <Resizable orientation="horizontal" style={{ display: 'block', width: '100%', height: '100%' }}>`,
          `        <ResizableItem size="40%" min="240px">`,
          `          <Chat`,
          `            messages={messages}`,
          `            loading={loading}`,
          `            suggestions={suggestions}`,
          `            suggestionMode="submit"`,
          `            onSubmit={onSubmit}`,
          `            style={{ ${jsxStyle(p.chatFill)} }}`,
          `          />`,
          `        </ResizableItem>`,
          `        <ResizableItem min="280px">`,
          `          {/* Replace src + files with your real artifact data (files is required: array/object props are never optional attributes on a kai-* element). */}`,
          `          <Artifact src="https://example.com" files={[{ path: 'index.html', url: 'https://example.com' }]} style={{ width: '100%', height: '100%' }} />`,
          `        </ResizableItem>`,
          `      </Resizable>`,
        ]
      : [
          `      <Chat`,
          `        messages={messages}`,
          `        loading={loading}`,
          `        suggestions={suggestions}`,
          `        suggestionMode="submit"`,
          `        onSubmit={onSubmit}`,
          `        style={{ ${jsxStyle(p.chatFill)} }}`,
          `      />`,
          companions,
        ]),
    `    </main>`,
    `  );`,
    `}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/**
 * Angular: the `kai-*` custom elements, same as vue/svelte/html — plus the two
 * things Angular needs and no other framework does.
 *
 *   1. `schemas: [CUSTOM_ELEMENTS_SCHEMA]` on the component. Without it the
 *      template compiler REJECTS every unknown tag ("'kai-chat' is not a known
 *      element") and `ng build` fails outright. With it, Angular stamps the tag
 *      and passes the bindings straight through to the DOM.
 *   2. `[messages]="messages()"` — the square brackets are what make it a DOM
 *      PROPERTY. `messages="…"` would be an ATTRIBUTE, i.e. the string
 *      "[object Object]": arrays and objects only ever reach a custom element as
 *      properties. Same for `[suggestions]` and `[loading]`.
 *
 * Two Angular-specific facts the emitted comments carry, because getting either
 * wrong is a build error rather than a subtle bug:
 *
 *   · Stylesheets come from `angular.json` -> architect.build.options.styles.
 *     `@angular/build` does not take a TS `import './x.css'`, so the theme
 *     cannot be imported the way every other framework imports it here.
 *   · `$event` on an unknown custom-element event is typed `Event` under
 *     `strictTemplates`, not `CustomEvent`, so the handler takes an `Event` and
 *     narrows inside — exactly what examples/starters/angular does.
 *
 * The thread is an Angular signal, which reads back synchronously, so this uses
 * `accessorThreadBinding` and not React's turn-scoped `thread` copy.
 */
function renderAngular(archetype: Archetype, ctx: RenderCtx): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  const workspace = isWorkspace(archetype);
  const standaloneCompanionTags = archetype.components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );
  const hasEmbedded = archetype.components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
  const hasSourcesCompanion = standaloneCompanionTags.includes('kai-sources');

  const companionLines: string[] = [];
  if (hasEmbedded) {
    companionLines.push(
      `      <!-- kai-tool / kai-reasoning render INSIDE the thread, as parts on the assistant message the stream builds. -->`,
    );
  }
  for (const t of standaloneCompanionTags) {
    if (t === 'kai-sources') {
      companionLines.push(
        `      <!-- Replace sampleSources with your real data. [sources] is a PROPERTY binding: an array can't be an attribute. -->`,
        `      <kai-sources #sources [sources]="sampleSources"></kai-sources>`,
      );
    } else {
      companionLines.push(`      <!-- wire data props — see the component_reference MCP tool -->`);
      companionLines.push(`      <${t}></${t}>`);
    }
  }

  // Angular signals: `this.messages()` reads, `this.messages.set(next)` writes a
  // BRAND-NEW array, which is what re-renders <kai-chat>.
  const read = 'this.messages()';
  const commit = (value: string) => `this.messages.set(${value});`;
  const setter = '(fn) => this.messages.set(fn(this.messages()))';

  const onSubmitBody = isMock
    ? mockStreamBody({
        pad: '    ',
        read,
        commitInitial: (expr) => commit(expr),
        // the signal reads back live — map over the current value, not a snapshot
        commitMap: (mapBody) => commit(`${read}.map((m) => ${mapBody})`),
        setLoading: (v) => `this.loading.set(${v});`,
        strictRoles: true,
      })
    : realStreamBody({
        pad: '    ',
        read,
        commitSet: (expr) => commit(expr),
        setterAdapter: setter,
        setLoading: (v) => `this.loading.set(${v});`,
        bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
        strictRoles: true,
        toolLoop: emitToolLoop,
        thread: accessorThreadBinding(read, commit, setter),
      });

  // Module scope, exactly like vue: a class can hold neither a bare `const` nor a
  // `function` declaration, and the methods below close over all three.
  const modelInit = defaultModel
    ? [
        `// SCAF-8: change this to any provider/model string you want to use.`,
        `const model = '${defaultModel}';`,
        ``,
      ]
    : [];
  const toolsLines = emitTools ? [...toolSchemaLines(''), ``] : [];
  const runnerLines = emitToolLoop ? [...toolRunnerLines('', true), ``] : [];

  // SCAF-9: no fabricated seed — see SAMPLE_AGENTIC_MESSAGE.
  const sampleSeed = [
    ...(hasEmbedded
      ? sampleSeedComment(isMock, '  ', (literal) => [
          `readonly messages = signal<ChatMessage[]>([${literal}]);`,
        ])
      : []),
    `  readonly messages = signal<ChatMessage[]>([]);`,
  ];

  const sourcesField = hasSourcesCompanion
    ? [
        `  // Replace sampleSources with your real source data.`,
        `  readonly sampleSources = [`,
        `    { href: 'https://example.com/doc1', title: 'Getting started', description: 'Overview of the product.' },`,
        `    { href: 'https://example.com/doc2', title: 'API reference', description: 'Full API documentation.' },`,
        `  ];`,
        `  private readonly sourcesEl = viewChild.required<ElementRef<KaiSourcesElement>>('sources');`,
      ]
    : [];
  const sourcesReapply = hasSourcesCompanion
    ? [`      Object.assign(this.sourcesEl().nativeElement, { sources: this.sampleSources });`]
    : [];

  const chatTag = (pad: string) =>
    [
      `<kai-chat`,
      `  #chat`,
      `  [messages]="messages()"`,
      `  [loading]="loading()"`,
      `  [suggestions]="suggestions"`,
      `  suggestion-mode="submit"`,
      `  style="${p.chatFill}"`,
      `  (kai-submit)="onSubmit($event)"`,
      `></kai-chat>`,
    ].map((l) => `${pad}${l}`);

  const templateBody = workspace
    ? [
        `      <!-- SCAF-14: workspace split — chat pane left, artifact preview right. -->`,
        `      <!-- kai-resizable needs kai-resizable-item children to render panels. -->`,
        `      <kai-resizable orientation="horizontal" style="display:block;width:100%;height:100%">`,
        `        <kai-resizable-item size="40%" min="240px">`,
        ...chatTag('          '),
        `        </kai-resizable-item>`,
        `        <kai-resizable-item min="280px">`,
        `          <!-- Replace src with your artifact URL or set [files] for multi-file preview. -->`,
        `          <kai-artifact src="https://example.com" style="width:100%;height:100%"></kai-artifact>`,
        `        </kai-resizable-item>`,
        `      </kai-resizable>`,
      ]
    : [...chatTag('      '), ...companionLines];

  // KaiSourcesElement is imported only when a kai-sources companion is really
  // declared: an always-on import is unused on every other archetype, and a stock
  // Angular tsconfig turns on the checks that make that a build error.
  const elementTypes = hasSourcesCompanion ? 'KaiChatElement, KaiSourcesElement' : 'KaiChatElement';

  return [
    `// Angular standalone component — save as: src/app/chat.component.ts`,
    `// Render it: put <app-chat /> in your root template and add ChatComponent to`,
    `// that component's \`imports: [...]\`.`,
    `//`,
    `// SETUP, once — Angular takes stylesheets from angular.json, NOT from a TS`,
    `// \`import './x.css'\`, so the theme cannot be imported here the way it is in`,
    `// every other framework. Add it to architect.build.options.styles:`,
    `//   "styles": ["node_modules/@kitn.ai/ui/dist/theme.tokens.css", "src/styles.css"]`,
    `// (@kitn.ai/ui/theme.tokens.css is the compiled token file; theme.css is`,
    `// Tailwind source and is only for apps that compile Tailwind themselves.)`,
    `import { CUSTOM_ELEMENTS_SCHEMA, Component, ElementRef, afterNextRender, signal, viewChild } from '@angular/core';`,
    `import '@kitn.ai/ui/elements';  // registers <kai-*> — required, must come first`,
    `import type { ${elementTypes} } from '@kitn.ai/ui/elements';`,
    ...(isMock ? [] : wireImportLines({ typed: true, toolLoop: emitToolLoop })),
    ``,
    `// ${archetype.title} — ${p.note}. empty-state hint: ${emptyHint}`,
    ...(p.altNote ?? []).map((l) => `// ${l}`),
    ...chatMessageDecl(isMock),
    ``,
    ...modelInit,
    ...toolsLines,
    ...runnerLines,
    `@Component({`,
    `  selector: 'app-chat',`,
    `  // REQUIRED. Angular does not know the kai-* tags; without this the template`,
    `  // compiler fails with "'kai-chat' is not a known element". With it, Angular`,
    `  // stamps the tag and passes [prop] bindings through to the DOM.`,
    `  schemas: [CUSTOM_ELEMENTS_SCHEMA],`,
    `  template: \``,
    `    <div style="${p.style}">`,
    ...templateBody,
    `    </div>`,
    `  \`,`,
    `})`,
    `export class ChatComponent {`,
    `  // Every write assigns a NEW array. That reference change is what re-renders`,
    `  // <kai-chat> — mutating the array in place does nothing.`,
    ...sampleSeed,
    `  readonly loading = signal(false);`,
    `  readonly suggestions = ${jsArray(suggestions)};`,
    ...sourcesField,
    `  private readonly chatEl = viewChild.required<ElementRef<KaiChatElement>>('chat');`,
    ``,
    `  constructor() {`,
    `    // SCAF-15: kai-* register via an async dynamic import (SSR-safety), so the`,
    `    // element may not be upgraded when Angular first applies the bindings above —`,
    `    // and a property set on a not-yet-upgraded element is dropped on upgrade.`,
    `    // Re-apply once it is defined so the initial messages/suggestions/loading stick.`,
    `    // afterNextRender never runs on the server, which is also what keeps this`,
    `    // \`customElements\` reference safe under SSR/prerender.`,
    `    afterNextRender(async () => {`,
    `      await customElements.whenDefined('kai-chat');`,
    `      Object.assign(this.chatEl().nativeElement, {`,
    `        messages: this.messages(),`,
    `        loading: this.loading(),`,
    `        suggestions: this.suggestions,`,
    `      });`,
    ...sourcesReapply,
    `    });`,
    `  }`,
    ``,
    `  // \`Event\`, not \`CustomEvent\`: under strictTemplates Angular types \`$event\` on`,
    `  // an unknown custom-element event as a plain Event, so the narrowing happens`,
    `  // here rather than in the signature.`,
    `  async onSubmit(event: Event) {`,
    `    const e = event as CustomEvent<{ value: string }>;`,
    onSubmitBody,
    `  }`,
    `}`,
  ]
    // Collapse runs of blanks rather than dropping every blank (what the JSX/vue
    // renderers do): this target emits one long file — imports, module-scope
    // consts, the decorator, the class — and with no separators at all it reads
    // as a wall.
    .filter((l, i, arr) => l !== '' || (i > 0 && i < arr.length - 1 && arr[i - 1] !== ''))
    .join('\n');
}

/**
 * SolidJS — the one target that does NOT render `kai-*`.
 *
 * The kit is AUTHORED in Solid, so a Solid consumer imports the real components
 * from the `@kitn.ai/ui` root entry and gets real props and real fine-grained
 * reactivity. Routing it through the custom-element facade would ship the Solid
 * runtime twice and put a reactive-context boundary in the middle of the app for
 * no gain.
 *
 * THE GRANULARITY GAP. `<kai-chat>` is a coarse preset: one tag renders the
 * thread, the parts, the scroll behaviour, the suggestions and the composer. The
 * Solid layer is fine-grained — ChatContainer / Message / MessageContent /
 * PromptInput / … — so the same capability has to be composed here. Two
 * consequences the emitted code has to handle, and both are silent failures if
 * it does not:
 *
 *   1. The thread renders exactly what `renderPart` renders. `<kai-chat>` knows
 *      every MessagePart variant; a hand-composed tree that only handles `text`
 *      shows nothing when a reasoning or tool part streams in. So the part
 *      renderer is emitted for EVERY archetype, not just the agentic one — the
 *      stream can produce those parts regardless of which components the
 *      archetype names.
 *   2. The components are Tailwind-v4 SOURCE, not shadow-encapsulated CSS. The
 *      class names have to survive into the consumer's stylesheet, which is what
 *      the `@source` line in the setup note is for. Without it Tailwind scans
 *      only `src/`, strips every kit class as unused, and the app renders
 *      unstyled — see examples/starters/solid/README.md.
 *
 * Solid signals read back synchronously, so this uses `accessorThreadBinding`
 * and not React's turn-scoped `thread` copy.
 */
function renderSolid(archetype: Archetype, ctx: RenderCtx): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  const workspace = isWorkspace(archetype);
  const standaloneCompanionTags = archetype.components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );
  const hasSources = standaloneCompanionTags.includes('kai-sources');
  const hasVoice = standaloneCompanionTags.includes('kai-voice-input');

  // Every name here is referenced by the emitted tree below — `noUnusedLocals` is
  // on in a stock Solid app (`npm run build` runs `tsc` first), so an extra one
  // is a build failure.
  const componentImports = [
    'Button',
    'ChatConfig',
    'ChatContainer',
    'ChatContainerContent',
    'ChatContainerScrollAnchor',
    'Message',
    'MessageContent',
    'PromptInput',
    'PromptInputActions',
    'PromptInputTextarea',
    'PromptSuggestion',
    'Reasoning',
    'ReasoningContent',
    'ReasoningTrigger',
    'ScrollButton',
    'Tool',
    ...(workspace ? ['Artifact', 'ResizableHandle', 'ResizablePanel', 'ResizablePanelGroup'] : []),
    ...(hasSources ? ['Source', 'SourceContent', 'SourceList', 'SourceTrigger'] : []),
    ...(hasVoice ? ['VoiceInput'] : []),
  ].sort();

  // Solid signals: `messages()` reads, `setMessages(next)` writes a NEW array.
  const read = 'messages()';
  const commit = (value: string) => `setMessages(${value});`;
  // Solid's own Setter is overloaded (and treats a function argument as an
  // updater), so it is wrapped rather than handed over directly — the wrapper is
  // exactly the `SetMessages` shape createAssistantStream wants.
  const setter = '(fn) => setMessages((prev) => fn(prev))';

  const onSubmitBody = isMock
    ? mockStreamBody({
        pad: '    ',
        read,
        commitInitial: (expr) => commit(expr),
        // the signal reads back live — map over the current value, not a snapshot
        commitMap: (mapBody) => commit(`${read}.map((m) => ${mapBody})`),
        setLoading: (v) => `setLoading(${v});`,
        strictRoles: true,
        valueSource: 'input()',
        afterValue: [`setInput('');`],
      })
    : realStreamBody({
        pad: '    ',
        read,
        commitSet: (expr) => commit(expr),
        setterAdapter: setter,
        setLoading: (v) => `setLoading(${v});`,
        bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
        strictRoles: true,
        toolLoop: emitToolLoop,
        thread: accessorThreadBinding(read, commit, setter),
        valueSource: 'input()',
        afterValue: [`setInput('');`],
      });

  const modelInit = defaultModel
    ? [
        `  // SCAF-8: change this to any provider/model string you want to use.`,
        `  const model = '${defaultModel}';`,
      ]
    : [];
  const toolsLines = emitTools ? toolSchemaLines('  ') : [];
  const runnerLines = emitToolLoop ? toolRunnerLines('  ', true) : [];

  const sourcesInit = hasSources
    ? [
        `  // Replace sampleSources with your real source data.`,
        `  const sampleSources = [`,
        `    { href: 'https://example.com/doc1', title: 'Getting started', description: 'Overview of the product.' },`,
        `    { href: 'https://example.com/doc2', title: 'API reference', description: 'Full API documentation.' },`,
        `  ];`,
      ]
    : [];

  // The scrolling thread + composer. Reused verbatim inside the workspace split.
  // `fill` is how this column claims its height: the placement's own chatFill at
  // the top level, 100% of the pane inside a resizable panel.
  const surface = (pad: string, fill: string): string[] =>
    [
      `<div class="flex w-full flex-col" style={{ ${fill} }}>`,
      `  <div class="relative min-h-0 flex-1">`,
      // ChatContainer IS the scroll container (it carries overflow-y-auto and the
      // stick-to-bottom ref), so the wrapper above must not also scroll.
      `    <ChatContainer class="h-full">`,
      `      <ChatContainerContent class="px-5 pt-4 pb-12">`,
      `        <For each={messages()}>`,
      `          {(m) => (`,
      `            <Message class={\`mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 \${m.role === 'user' ? 'items-end' : 'items-start'}\`}>`,
      `              <For each={m.parts}>{(part) => renderPart(part, m.role)}</For>`,
      `            </Message>`,
      `          )}`,
      `        </For>`,
      ...(hasSources
        ? [
            `        {/* Replace sampleSources with your real data. */}`,
            `        <SourceList class="mx-auto w-full max-w-3xl px-6 pt-2">`,
            `          <For each={sampleSources}>`,
            `            {(s) => (`,
            `              <Source href={s.href}>`,
            `                <SourceTrigger showFavicon />`,
            `                <SourceContent title={s.title} description={s.description} />`,
            `              </Source>`,
            `            )}`,
            `          </For>`,
            `        </SourceList>`,
          ]
        : []),
      `        <ChatContainerScrollAnchor />`,
      `      </ChatContainerContent>`,
      `      <div class="absolute bottom-4 left-1/2 flex w-full max-w-3xl -translate-x-1/2 justify-center px-5">`,
      `        <ScrollButton />`,
      `      </div>`,
      `    </ChatContainer>`,
      `  </div>`,
      ``,
      `  <div class="shrink-0 px-3 pb-3 md:px-5 md:pb-5">`,
      `    <div class="mx-auto max-w-3xl">`,
      `      {/* Starter prompts, shown only while the thread is empty. */}`,
      `      <Show when={messages().length === 0}>`,
      `        <div class="flex flex-wrap gap-2 pb-3">`,
      `          <For each={suggestions}>`,
      `            {(s) => <PromptSuggestion onClick={() => { setInput(s); void onSubmit(); }}>{s}</PromptSuggestion>}`,
      `          </For>`,
      `        </div>`,
      `      </Show>`,
      `      <PromptInput value={input()} onValueChange={setInput} onSubmit={onSubmit} isLoading={loading()}>`,
      `        <div class="flex flex-col">`,
      `          <PromptInputTextarea placeholder="Send a message…" class="min-h-[44px] pt-3 pl-4" />`,
      `          <PromptInputActions class="mt-2 flex w-full items-center justify-end gap-2 px-3 pb-3">`,
      ...(hasVoice
        ? [
            `            {/* hasTranscribe={false} uses the browser's native SpeechRecognition.`,
            `                Point onTranscribe at your speech-to-text endpoint to record + upload instead. */}`,
            `            <VoiceInput`,
            `              hasTranscribe={false}`,
            `              onTranscribe={async (audio) => {`,
            `                const res = await fetch('/api/transcribe', { method: 'POST', body: audio });`,
            `                const data = (await res.json()) as { text: string };`,
            `                return data.text;`,
            `              }}`,
            `              onTranscription={(text) => setInput(text)}`,
            `            />`,
          ]
        : []),
      `            <Button size="sm" class="rounded-full" disabled={!input().trim() || loading()} onClick={onSubmit}>`,
      `              Send`,
      `            </Button>`,
      `          </PromptInputActions>`,
      `        </div>`,
      `      </PromptInput>`,
      `    </div>`,
      `  </div>`,
      `</div>`,
    ].map((l) => (l === '' ? l : `${pad}${l}`));

  const tree = workspace
    ? [
        `        {/* SCAF-14: workspace split — chat pane left, artifact preview right. */}`,
        `        <ResizablePanelGroup orientation="horizontal" class="h-full w-full">`,
        `          <ResizablePanel defaultSize={40} minSize="240px">`,
        ...surface('            ', `'height': '100%', 'min-height': '0'`),
        `          </ResizablePanel>`,
        `          <ResizableHandle handle="grip" />`,
        `          <ResizablePanel minSize="280px">`,
        `            {/* Replace src + files with your real artifact data. */}`,
        `            <Artifact`,
        `              src="https://example.com"`,
        `              files={[{ path: 'index.html', url: 'https://example.com' }]}`,
        `              class="h-full w-full"`,
        `            />`,
        `          </ResizablePanel>`,
        `        </ResizablePanelGroup>`,
      ]
    : surface('        ', solidStyle(p.chatFill));

  return [
    `// SolidJS + Vite — save as: src/App.tsx`,
    `//`,
    `// This target does NOT use the <kai-*> custom elements, and that is deliberate:`,
    `// the kit is AUTHORED in SolidJS, so a Solid app renders the real components`,
    `// with real props and real fine-grained reactivity. Going through the`,
    `// web-component facade would ship the Solid runtime twice and cross a reactive`,
    `// boundary for nothing.`,
    `//`,
    `// SETUP, once. These components are Tailwind-v4 SOURCE (not shadow-encapsulated),`,
    `// so their class names have to reach YOUR stylesheet:`,
    `//   npm i -D tailwindcss @tailwindcss/vite vite-plugin-solid`,
    `//   vite.config.ts  -> plugins: [solid(), tailwindcss()]`,
    `//   src/styles.css  -> @import "tailwindcss";`,
    `//                      @import "@kitn.ai/ui/theme.css";        /* --color-* tokens */`,
    `//                      @source "../node_modules/@kitn.ai/ui";  /* scan the kit for classes */`,
    `// The @source line is NOT optional: without it Tailwind scans only src/, strips`,
    `// every kit utility class as unused, and the whole UI renders unstyled.`,
    `// (theme.css here, not theme.tokens.css: this app compiles Tailwind itself.)`,
    `import { For, Show, createSignal } from 'solid-js';`,
    `import {`,
    ...componentImports.map((n) => `  ${n},`),
    `} from '@kitn.ai/ui';`,
    `// The kit's own types, from the same entry the components come from.`,
    `import type { ChatMessage, MessagePart } from '@kitn.ai/ui';`,
    ...(isMock ? [] : wireImportLines({ typed: false, toolLoop: emitToolLoop })),
    ``,
    `// ${archetype.title} — ${p.note}. empty-state hint: ${emptyHint}`,
    ...(p.altNote ?? []).map((l) => `// ${l}`),
    ``,
    `// EVERY part kind the stream can produce, in thread order. <kai-chat> does this`,
    `// internally for the element-based targets; composing from the SolidJS layer`,
    `// means the thread renders exactly what this function renders, so a missing`,
    `// branch is a reasoning or tool part that streams in and shows nothing.`,
    `function renderPart(part: MessagePart, role: ChatMessage['role']) {`,
    `  switch (part.type) {`,
    `    case 'text':`,
    `      return role === 'user' ? (`,
    `        <MessageContent class="bg-muted text-primary max-w-[85%] rounded-3xl px-5 py-2.5">`,
    `          {part.text}`,
    `        </MessageContent>`,
    `      ) : (`,
    `        <MessageContent markdown class="text-foreground prose flex-1 rounded-lg bg-transparent p-0">`,
    `          {part.text}`,
    `        </MessageContent>`,
    `      );`,
    `    case 'reasoning':`,
    `      return (`,
    `        <Reasoning class="w-full">`,
    `          <ReasoningTrigger>{part.label ?? 'Reasoning'}</ReasoningTrigger>`,
    `          <ReasoningContent markdown>{part.text}</ReasoningContent>`,
    `        </Reasoning>`,
    `      );`,
    `    case 'tool':`,
    `      return <Tool toolPart={part.tool} />;`,
    `    default:`,
    `      // card / source / file parts — see the docs for the card dispatcher.`,
    `      return null;`,
    `  }`,
    `}`,
    ``,
    `export default function App() {`,
    `  // Each write assigns a NEW array; Solid's fine-grained <For> re-renders only`,
    `  // the message whose object reference actually changed.`,
    `  const [messages, setMessages] = createSignal<ChatMessage[]>([]);`,
    `  const [loading, setLoading] = createSignal(false);`,
    `  // PromptInput is CONTROLLED here, so this signal — not a kai-submit event — is`,
    `  // where the submitted text comes from.`,
    `  const [input, setInput] = createSignal('');`,
    `  const suggestions = ${jsArray(suggestions)};`,
    ...sourcesInit,
    ...modelInit,
    ...toolsLines,
    ...runnerLines,
    ``,
    `  async function onSubmit() {`,
    onSubmitBody,
    `  }`,
    ``,
    `  return (`,
    `    // ChatConfig carries prose size / code theme / portal target to every`,
    `    // component below it. Mount it once, at the top.`,
    `    <ChatConfig>`,
    `      <div style={{ ${solidStyle(p.style)} }}>`,
    ...tree,
    `      </div>`,
    `    </ChatConfig>`,
    `  );`,
    `}`,
  ].join('\n');
}

/**
 * Translate an inline CSS string into a SOLID style-object entry list.
 *
 * Not `jsxStyle`. Solid's `style` prop is typed from csstype's HYPHENATED
 * property set (`'flex-direction'`) and applied with `style.setProperty(key,
 * value)`; React's is camelCased (`flexDirection`). Handing Solid React's shape
 * is a TS2561 on every cell AND, if it ever got past the compiler, a declaration
 * that silently does nothing at runtime. Keys are quoted because
 * `flex-direction` is not a bare identifier.
 */
function solidStyle(style: string): string {
  return style
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const [prop, ...rest] = d.split(':');
      return `'${prop.trim()}': '${rest.join(':').trim()}'`;
    })
    .join(', ');
}

/** Translate an inline CSS string into JSX style-object entries. */
function jsxStyle(style: string): string {
  return style
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const [prop, ...rest] = d.split(':');
      const camel = prop.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return `${camel}: '${rest.join(':').trim()}'`;
    })
    .join(', ');
}

function renderFrontend(
  framework: string,
  archetype: Archetype,
  placement: string,
  emptyHint: string,
  suggestions: string[],
  isMock: boolean,
  defaultModel: string | undefined,
  emitTools: boolean,
  emitToolLoop: boolean,
): string {
  const ctx: RenderCtx = {
    p: placementStyle(placement),
    emptyHint,
    suggestions,
    isMock,
    defaultModel,
    emitTools,
    emitToolLoop,
  };
  switch (framework) {
    case 'react':
    case 'next':
      return renderJsx(archetype, ctx, framework);
    case 'vue':
      return renderVue(archetype, ctx);
    case 'svelte':
      return renderSvelte(archetype, ctx);
    case 'angular':
      return renderAngular(archetype, ctx);
    case 'solid':
      return renderSolid(archetype, ctx);
    case 'tanstack-start':
      return renderTanstackStart(archetype, ctx);
    case 'html':
    default:
      // html, and any backend-only framework (fastapi/express/worker) gets the
      // framework-agnostic web-components surface. The Vite/tsc setup note
      // (SCAF-19) only applies to the actual `html` target — the backend-only
      // frameworks aren't paired with a `tsc && vite build` script.
      return renderHtml(archetype, ctx, framework === 'html');
  }
}

// ── backend route selection (with language-aware fallback) ─────────────────────

interface RouteChoice {
  framework: string;
  template: string;
  runtime: string;
  exact: boolean;
}

const RUNTIME_LABEL: Record<string, string> = {
  next: 'Next.js route handler (Node/Edge)',
  express: 'Express handler (Node)',
  worker: 'Cloudflare Worker',
  fastapi: 'FastAPI (Python)',
  html: 'browser-direct (no server route)',
  'tanstack-start': 'TanStack Start server route',
  angular: 'Angular SSR server (Express, src/server.ts)',
  solid: 'Vite dev-server middleware (Node)',
};

/** How the emitted framework reads in a warning: "will NOT run in ___". */
const FRAMEWORK_LABEL: Record<string, string> = {
  html: 'a static HTML page',
  react: 'a Vite React SPA',
  next: 'a Next.js app',
  vue: 'a Vite Vue SPA',
  svelte: 'a SvelteKit app',
  angular: 'an Angular app',
  solid: 'a Vite SolidJS SPA',
  'tanstack-start': 'a TanStack Start app',
  express: 'an Express server',
  worker: 'a Cloudflare Worker',
  fastapi: 'a FastAPI service',
};

/**
 * Why the emitted route cannot be dropped into THIS framework, one line each.
 *
 * The warning used to be gated on `framework === 'react'`, so the two targets
 * with the worst failure modes got nothing: svelte compiled a Next.js handler
 * and threw `req.json is not a function` on the first submit, and html was
 * handed a server snippet with no server anywhere to put it in.
 */
const CANNOT_HOST_NOTE: Record<string, string> = {
  html: 'a static page has no server at all — run this route on a separate server (framework: "express" | "worker" | "next") and either proxy /api/chat to it or point the fetch at its absolute URL (CORS applies).',
  react: 'a Vite React SPA has no /api routes — add a dev-server middleware (Vite: server.middlewares in a plugin), proxy /api/chat to a separate server, or use framework: "next" | "tanstack-start".',
  vue: 'a Vite Vue SPA has no /api routes — add a dev-server middleware (Vite: server.middlewares in a plugin), proxy /api/chat to a separate server, or use framework: "next".',
  svelte: 'SvelteKit routes live at src/routes/api/chat/+server.ts and are called as POST(event) — `request` is a FIELD on that event, so a handler written to take a bare Request typechecks here and then throws "req.json is not a function" on the first submit.',
  angular: "Angular's server route lives in src/server.ts — the Express app `ng add @angular/ssr` generates — and has to be registered BEFORE the Angular catch-all `app.use(...)` that renders the app, or the renderer answers /api/chat with HTML. A file exporting POST is never called.",
  solid: 'a Vite SolidJS SPA has no /api routes — add a dev-server middleware (Vite: server.middlewares in a plugin), proxy /api/chat to a separate server, or run the handler on a real server (framework: "express" | "worker" | "next").',
  'tanstack-start': "TanStack Start routes the FILE: it needs createFileRoute('/api/chat')({ server: { handlers: { POST } } }) in src/routes/api/chat.ts. A bare `export async function POST` is never called.",
  next: 'Next.js needs the handler exported as POST from app/api/chat/route.ts.',
  express: 'Express hands the handler (req, res) — it does not take a Request or return a Response, so the code needs bridging.',
  worker: 'a Worker exports `default { fetch(request) }` and reads secrets off `env`, not process.env.',
  fastapi: 'FastAPI is Python — this route is TypeScript.',
};

// ── the portable route: one web-standard handler, wrapped per framework ───────

/**
 * How a framework DECLARES a route around the portable `chatHandler`.
 *
 * The body of a chat route is the same everywhere: read the request JSON, call
 * the provider, stream the response back. Only the declaration differs. That is
 * the whole reason every non-next framework used to be handed a Next.js
 * handler — the catalogs only ever filled in `next` and the rest fell through
 * to it.
 *
 * `before` is emitted above the integration's fragment (framework imports),
 * `after` below it (the declaration that calls `chatHandler`). The fragment
 * itself may open with its own imports; they all land at the top of the file.
 */
interface WebRouteAdapter {
  runtime: string;
  /** Path comment that opens the block, so the code has somewhere to go. */
  file: string;
  before?: string[];
  after: string[];
  /**
   * Rewrite the integration's portable handler into this framework's own idioms,
   * returning the new fragment plus any imports the rewrite needs.
   *
   * The portable fragments are written for a Node-shaped host, and one of them
   * does not port: `process.env`. Only SvelteKit uses this so far — see
   * `svelteEnvAccess`.
   */
  adaptFragment?: (fragment: string) => { fragment: string; imports: string[] };
}

/**
 * `process.env.X` -> SvelteKit's own `env.X`.
 *
 * A fresh `sv create` app installs no `@types/node`, so `process` is not a name
 * that exists: every emitted route reading a key failed `svelte-check` with
 * TS2580 on the first run. `$env/dynamic/private` is Kit's own accessor, is
 * typed by the `.svelte-kit/ambient.d.ts` its own `sync` step generates, and is
 * the form its docs prescribe — so this is the idiomatic fix, not a workaround
 * for a missing dependency. It also keeps the key off the client by
 * construction: importing `$env/dynamic/private` from client code is an error
 * Kit raises for you.
 */
function svelteEnvAccess(fragment: string): { fragment: string; imports: string[] } {
  if (!/\bprocess\.env\./.test(fragment)) return { fragment, imports: [] };
  return {
    fragment: fragment.replace(/\bprocess\.env\.([A-Za-z_$][\w$]*)/g, 'env.$1'),
    imports: [
      `// SvelteKit's own env accessor. \`process.env\` would need @types/node, which`,
      `// a fresh \`sv create\` app does not install — and this is the idiomatic form:`,
      `// it is typed by .svelte-kit/ambient.d.ts and cannot be imported client-side.`,
      `import { env } from '$env/dynamic/private';`,
    ],
  };
}

/**
 * The Vite dev-server middleware, which is what a plain SPA (react/vue) can
 * actually host. Dev-only on purpose, and it says so: a Vite SPA has no
 * production server to deploy a route to.
 */
function viteMiddlewareAdapter(plugin: string): WebRouteAdapter {
  return {
    runtime: 'Vite dev-server middleware (Node)',
    // `server/chat.ts`, NOT `src/server/chat.ts`. A create-vite app splits its
    // tsconfig in two: tsconfig.app.json is `"include": ["src"]` with
    // `types: ["vite/client"]` and no node types, and tsconfig.node.json covers
    // vite.config.ts and what it imports. A handler under `src/` is therefore
    // compiled by the BROWSER project as well, where `process.env` is
    // TS2591 "Cannot find name 'process'" — measured in a stock react-ts app.
    // Outside `src/` only the node project claims it, which is the one with the
    // node types it needs.
    file: 'server/chat.ts',
    after: [
      ``,
      `// vite.config.ts imports it from here.`,
      `export { chatHandler };`,
      ``,
      `// ── vite-chat-api.ts ─────────────────────────────────────────────────────────`,
      `// A Vite SPA has no server routes, so fetch('/api/chat') has nothing to answer`,
      `// it. This plugin mounts the SAME handler on the dev server. DEV ONLY: for`,
      `// production, deploy the handler to a real server (Next, SvelteKit, a Worker,`,
      `// Express) or point the fetch at one.`,
      `import type { Plugin } from 'vite';`,
      `// The '.js' is REQUIRED and is not a typo: the stock tsconfig.node.json sets`,
      `// "module": "nodenext", where an extensionless relative import is TS2835. TS`,
      `// resolves './server/chat.js' to server/chat.ts, and so does Vite.`,
      `import { chatHandler } from './server/chat.js';`,
      ``,
      `export function chatApiPlugin(): Plugin {`,
      `  return {`,
      `    name: 'chat-api',`,
      `    configureServer(server) {`,
      `      server.middlewares.use('/api/chat', async (req, res) => {`,
      `        let body = '';`,
      `        req.setEncoding('utf8');`,
      `        for await (const chunk of req) body += chunk;`,
      ``,
      `        const response = await chatHandler(`,
      `          new Request('http://localhost/api/chat', {`,
      `            method: 'POST',`,
      `            headers: { 'Content-Type': 'application/json' },`,
      `            body,`,
      `          }),`,
      `        );`,
      ``,
      `        // The STATUS has to survive the bridge: a 401 from the provider that`,
      `        // arrives at the browser as a 200 is a blank bubble and no error.`,
      `        res.statusCode = response.status;`,
      `        // Annotated: a vite.config / server tsconfig has no DOM lib, so Headers`,
      `        // comes from @types/node and these params are implicitly \`any\` (TS7006)`,
      `        // under a stock \`npm create vite\` app's noImplicitAny.`,
      `        response.headers.forEach((value: string, key: string) => res.setHeader(key, value));`,
      `        if (!response.body) { res.end(); return; }`,
      ``,
      `        // Write each chunk as it lands — buffering here defeats streaming.`,
      `        const reader = response.body.getReader();`,
      `        for (;;) {`,
      `          const { value, done } = await reader.read();`,
      `          if (done) break;`,
      `          res.write(value);`,
      `        }`,
      `        res.end();`,
      `      });`,
      `    },`,
      `  };`,
      `}`,
      ``,
      `// ── vite.config.ts ───────────────────────────────────────────────────────────`,
      `// Again '.js', for the same reason: tsconfig.node.json is "module": "nodenext",`,
      `// where './vite-chat-api' is TS2835 and fails \`npm run build\`.`,
      `// import { chatApiPlugin } from './vite-chat-api.js';`,
      `// export default defineConfig({ plugins: [${plugin}, chatApiPlugin()] });`,
    ],
  };
}

const WEB_ROUTE_ADAPTERS: Record<string, WebRouteAdapter> = {
  next: {
    runtime: 'Next.js route handler (Node/Edge)',
    file: 'app/api/chat/route.ts',
    after: [
      ``,
      `// Next.js App Router: the file exports the HTTP method.`,
      `export async function POST(req: Request): Promise<Response> {`,
      `  return chatHandler(req);`,
      `}`,
    ],
  },
  svelte: {
    runtime: 'SvelteKit +server.ts endpoint',
    file: 'src/routes/api/chat/+server.ts',
    before: [`import type { RequestHandler } from './$types';`],
    adaptFragment: svelteEnvAccess,
    after: [
      ``,
      `// SvelteKit calls POST(event), NOT POST(request): \`request\` is a FIELD on the`,
      `// event. That one line is the whole difference from the Next.js route — a`,
      `// Next-shaped \`export async function POST(req: Request)\` typechecks here and`,
      `// then throws "req.json is not a function" on the first submit.`,
      `export const POST: RequestHandler = ({ request }) => chatHandler(request);`,
    ],
  },
  'tanstack-start': {
    runtime: 'TanStack Start server route',
    file: 'src/routes/api/chat.ts',
    before: [
      `import { createFileRoute } from '@tanstack/react-router';`,
      `// Side-effect import, REQUIRED: it loads the server-route type augmentation`,
      `// (@tanstack/start-client-core) that adds \`server\` to the route options. With`,
      `// nothing under src/ importing @tanstack/react-start the augmentation never`,
      `// loads and the block below fails to typecheck: TS2353 on \`server\`, then`,
      `// TS7031 on \`request\`.`,
      `import '@tanstack/react-start';`,
    ],
    after: [
      ``,
      `// TanStack Start routes the FILE. A bare \`export async function POST\` is never`,
      `// called — the handler has to hang off the route's \`server.handlers\`.`,
      `export const Route = createFileRoute('/api/chat')({`,
      `  server: { handlers: { POST: ({ request }) => chatHandler(request) } },`,
      `});`,
    ],
  },
  react: viteMiddlewareAdapter('react()'),
  vue: viteMiddlewareAdapter('vue()'),
  // A Solid app is a Vite SPA, so it hosts the route exactly the way react/vue
  // do. `tailwindcss()` is in the plugin list because the Solid front end needs
  // it (the components are Tailwind source) — see renderSolid's setup note.
  solid: viteMiddlewareAdapter('solid(), tailwindcss()'),
  /**
   * Angular DOES have a server, and this is where it lives.
   *
   * `ng add @angular/ssr` (or `ng new --ssr`) generates `src/server.ts` as an
   * Express app, and the Angular CLI loads it through the `reqHandler` export at
   * the bottom for BOTH `ng serve` and `ng build` — the generated file's own
   * comment reads "Request handler used by the Angular CLI (for dev-server and
   * during build)". So an endpoint registered here answers in development and in
   * production, unlike the react/vue Vite middleware, which is dev-only.
   *
   * There is no second option: `@angular/build:dev-server` exposes no middleware
   * hook and takes no Vite plugins, so an Angular app WITHOUT SSR enabled cannot
   * host `/api/chat` at all — it has to proxy to a separate server.
   *
   * The whole file is emitted rather than a fragment because placement is the
   * part that goes wrong: the route must be registered BEFORE the catch-all
   * `app.use` that renders the Angular app, or the renderer answers /api/chat
   * with an HTML page and the front end tries to parse it as SSE.
   */
  angular: {
    runtime: 'Angular SSR server (Express, src/server.ts)',
    file: 'src/server.ts',
    before: [
      `// This is the file \`ng add @angular/ssr\` generates (\`ng new --ssr\` too), with`,
      `// the chat endpoint added. The Angular CLI loads it via the \`reqHandler\` export`,
      `// at the bottom for BOTH \`ng serve\` and \`ng build\`, so the route below answers`,
      `// in development and in production.`,
      `//`,
      `// If your app has no src/server.ts, you have no SSR: run \`ng add @angular/ssr\`.`,
      `// @angular/build's dev server takes no middleware and no Vite plugins, so a`,
      `// non-SSR Angular app cannot host /api/chat — proxy it to a separate server`,
      `// instead (framework: "express" | "worker" | "next").`,
      `import {`,
      `  AngularNodeAppEngine,`,
      `  createNodeRequestHandler,`,
      `  isMainModule,`,
      `  writeResponseToNodeResponse,`,
      `} from '@angular/ssr/node';`,
      `import express from 'express';`,
      `import { join } from 'node:path';`,
    ],
    after: [
      ``,
      `const browserDistFolder = join(import.meta.dirname, '../browser');`,
      ``,
      `const app = express();`,
      `const angularApp = new AngularNodeAppEngine();`,
      ``,
      `// ORDER MATTERS: this has to come BEFORE the catch-all below, or Angular`,
      `// renders the app for /api/chat and the browser parses an HTML page as SSE.`,
      `// express.json() is scoped to this one route on purpose — page requests have`,
      `// no reason to be body-parsed.`,
      `app.post('/api/chat', express.json(), async (req, res) => {`,
      `  const response = await chatHandler(`,
      `    new Request('http://localhost/api/chat', {`,
      `      method: 'POST',`,
      `      headers: { 'Content-Type': 'application/json' },`,
      `      body: JSON.stringify(req.body),`,
      `    }),`,
      `  );`,
      ``,
      `  // The STATUS has to survive the bridge: a 401 from the provider that arrives`,
      `  // at the browser as a 200 is a blank bubble and no error.`,
      `  res.status(response.status);`,
      `  // Annotated: a server-side tsconfig has no DOM lib, so Headers comes from`,
      `  // @types/node and these params are implicitly \`any\` (TS7006) under noImplicitAny.`,
      `  response.headers.forEach((value: string, key: string) => res.setHeader(key, value));`,
      `  if (!response.body) { res.end(); return; }`,
      ``,
      `  // Write each chunk as it lands — buffering here defeats streaming.`,
      `  const reader = response.body.getReader();`,
      `  for (;;) {`,
      `    const { value, done } = await reader.read();`,
      `    if (done) break;`,
      `    res.write(value);`,
      `  }`,
      `  res.end();`,
      `});`,
      ``,
      `// Serve the built browser assets.`,
      `app.use(`,
      `  express.static(browserDistFolder, { maxAge: '1y', index: false, redirect: false }),`,
      `);`,
      ``,
      `// Everything else renders the Angular application.`,
      `app.use((req, res, next) => {`,
      `  angularApp`,
      `    .handle(req)`,
      `    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))`,
      `    .catch(next);`,
      `});`,
      ``,
      `if (isMainModule(import.meta.url)) {`,
      `  const port = process.env['PORT'] || 4000;`,
      `  app.listen(port, (error) => {`,
      `    if (error) {`,
      `      throw error;`,
      `    }`,
      ``,
      `    console.log(\`Node Express server listening on http://localhost:\${port}\`);`,
      `  });`,
      `}`,
      ``,
      `// The Angular CLI (dev-server and build) picks the app up from here.`,
      `export const reqHandler = createNodeRequestHandler(app);`,
    ],
  },
  worker: {
    runtime: 'Cloudflare Worker',
    file: 'src/index.ts',
    after: [
      ``,
      `// A Worker IS the web standard: fetch(Request) -> Response.`,
      `export default {`,
      `  fetch(request: Request): Promise<Response> {`,
      `    return chatHandler(request);`,
      `  },`,
      `};`,
      `// Secrets live on \`env\`, not process.env: either thread \`env\` through to the`,
      `// handler, or set compatibility_date "2025-04-01" (or later) with nodejs_compat,`,
      `// which populates process.env from your bindings.`,
    ],
  },
  express: {
    runtime: 'Express handler (Node)',
    file: 'server.ts',
    before: [`import express from 'express';`],
    after: [
      ``,
      `const app = express();`,
      `app.use(express.json());`,
      ``,
      `// Express is (req, res) — it neither takes a Request nor returns a Response, so`,
      `// the web handler is bridged here. Node 18+ has Request/Response as globals.`,
      `app.post('/api/chat', async (req, res) => {`,
      `  const response = await chatHandler(`,
      `    new Request('http://localhost/api/chat', {`,
      `      method: 'POST',`,
      `      headers: { 'Content-Type': 'application/json' },`,
      `      body: JSON.stringify(req.body),`,
      `    }),`,
      `  );`,
      ``,
      `  // The STATUS has to survive the bridge: a 401 from the provider that arrives`,
      `  // at the browser as a 200 is a blank bubble and no error.`,
      `  res.status(response.status);`,
      `  // Annotated: a server-side tsconfig has no DOM lib, so Headers comes from`,
      `  // @types/node and these params are implicitly \`any\` (TS7006) under noImplicitAny.`,
      `  response.headers.forEach((value: string, key: string) => res.setHeader(key, value));`,
      `  if (!response.body) { res.end(); return; }`,
      ``,
      `  // Write each chunk as it lands — buffering here defeats streaming.`,
      `  const reader = response.body.getReader();`,
      `  for (;;) {`,
      `    const { value, done } = await reader.read();`,
      `    if (done) break;`,
      `    res.write(value);`,
      `  }`,
      `  res.end();`,
      `});`,
      ``,
      `app.listen(3001, () => console.log('chat api: http://localhost:3001/api/chat'));`,
      `// The front end fetches a RELATIVE /api/chat, so proxy that path to this port`,
      `// from your dev server, or serve both from one origin.`,
    ],
  },
};

/**
 * The request body, declared once per route file.
 *
 * `await request.json()` is `unknown` — it is whatever the client sent — so
 * destructuring it directly is TS2339 on EVERY field. That is not pedantry: it
 * is a hard `npm run build` failure the moment a Node-typed project compiles the
 * route, where `Request` comes from undici (`json(): Promise<unknown>`) rather
 * than from the DOM lib (`json(): Promise<any>`). A stock Vite app does exactly
 * that — `tsc -b` walks vite.config.ts → vite-chat-api.ts → src/server/chat.ts
 * with `lib` and no DOM — so the route ran fine and the build did not.
 *
 * `messages` is typed as the kit's OWN encoder output rather than restated
 * structurally, which keeps the two halves of the scaffold pinned to one type:
 * the front end sends `toOpenAIMessages(thread)`, and this is what that returns.
 * The import is type-only and erases at build time, so the route ships no
 * runtime dependency on the kit.
 */
const CHAT_REQUEST_BODY_IMPORT = `import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';`;
const CHAT_REQUEST_BODY_DECL = [
  `/**`,
  ` * What the front end POSTs. \`request.json()\` is \`unknown\` (it is whatever the`,
  ` * client sent), so the body is narrowed once here instead of at every use —`,
  ` * without it this route does not compile under a server tsconfig. Widen it as`,
  ` * you add fields of your own.`,
  ` */`,
  `type ChatRequestBody = {`,
  `  messages: OpenAIWireMessage[];`,
  `  model?: string;`,
  `  tools?: unknown[];`,
  `};`,
  ``,
  `/** Narrow the JSON body once, at the edge. */`,
  `async function readChatRequest(request: Request): Promise<ChatRequestBody> {`,
  `  return (await request.json()) as ChatRequestBody;`,
  `}`,
];

/**
 * Slot the body type in just above `chatHandler`.
 *
 * Not at the very top: a fragment may open with its own imports (langgraph,
 * mastra, vercel-ai-sdk all do), and a type declaration wedged above them reads
 * like a mistake. Anchoring on the handler — and stepping back over the comment
 * block that documents it — puts the declaration where a person would have
 * written it.
 */
function withChatRequestBody(fragment: string): string {
  const lines = fragment.split('\n');
  let at = lines.findIndex((l) => /^(?:export\s+)?async function chatHandler\b/.test(l));
  if (at < 0) return [...CHAT_REQUEST_BODY_DECL, ``, ...lines].join('\n');
  while (at > 0 && /^\s*(?:\/\/|\/\*|\*)/.test(lines[at - 1])) at -= 1;
  return [...lines.slice(0, at), ...CHAT_REQUEST_BODY_DECL, ``, ...lines.slice(at)].join('\n');
}

/** Wrap an integration's portable handler in the target framework's declaration. */
function webRouteFor(integration: Integration, framework: string): RouteChoice | undefined {
  const fragment = integration.webRoute;
  const adapter = WEB_ROUTE_ADAPTERS[framework];
  if (!fragment || !adapter) return undefined;
  // A framework may have to rewrite the portable handler into its own idioms and
  // pull in an import to do it (SvelteKit's $env accessor). Both land at the top
  // of the file, beside the adapter's own `before` lines.
  const adapted = adapter.adaptFragment?.(fragment) ?? { fragment, imports: [] };
  return {
    framework,
    runtime: adapter.runtime,
    exact: true,
    template: [
      `// ${adapter.file}`,
      CHAT_REQUEST_BODY_IMPORT,
      ...(adapter.before ?? []),
      ...adapted.imports,
      ``,
      withChatRequestBody(adapted.fragment),
      ...adapter.after,
    ].join('\n'),
  };
}

/** Prefer the language's canonical server framework when there's no exact match. */
function preferredKeyFor(integration: Integration): string[] {
  return integration.language === 'python'
    ? ['fastapi']
    : ['next', 'express', 'worker'];
}

function chooseRoute(integration: Integration, framework: string): RouteChoice | undefined {
  const templates = integration.routeTemplates;

  // 1. exact match. Never for 'html': that key can only hold a browser snippet,
  //    and block (1) already emits the whole browser side. Selecting one here
  //    printed a SECOND <kai-chat id="chat"> under a "BACKEND ROUTE" heading,
  //    with its own kai-submit listener, so pasting both blocks gave a duplicate
  //    element id and two fetches per submit. Step 4 below has always skipped
  //    'html' for the same reason; step 1 did not.
  //
  //    This is where a route that CANNOT be portable wins: a Worker on an `env`
  //    binding, an Express bridge, a FastAPI service.
  if (framework !== 'html' && templates[framework]) {
    return { framework, template: templates[framework], runtime: RUNTIME_LABEL[framework] ?? framework, exact: true };
  }

  // 2. the portable handler, wrapped in this framework's own route declaration.
  const portable = webRouteFor(integration, framework);
  if (portable) return portable;

  // 3. no adapter for this framework at all (html, fastapi): the framework
  //    cannot host ANY route, so emit the portable handler under a host that can
  //    run it standalone — with the warning from step 5. Emitting nothing here
  //    would leave `html` with no backend code whatsoever, which is worse than a
  //    route it has to run elsewhere: the handler is still the thing to deploy.
  if (!WEB_ROUTE_ADAPTERS[framework] && integration.webRoute) {
    const host = webRouteFor(integration, 'express');
    if (host) return { ...host, exact: false };
  }

  // 4. language-canonical fallback (python → fastapi; ts → next/express/worker)
  for (const key of preferredKeyFor(integration)) {
    if (templates[key]) {
      return { framework: key, template: templates[key], runtime: RUNTIME_LABEL[key] ?? key, exact: false };
    }
  }

  // 5. anything usable that isn't a pure front-end snippet
  for (const [key, template] of Object.entries(templates)) {
    if (key === 'html') continue;
    return { framework: key, template, runtime: RUNTIME_LABEL[key] ?? key, exact: false };
  }

  return undefined;
}

/**
 * The honest warning for a route the target framework cannot host.
 *
 * Emitted for EVERY such framework. It used to be gated on
 * `framework === 'react'`, which left the two worst cases silent: svelte, whose
 * Next-shaped handler compiles and then throws at runtime, and html, which has
 * no server to paste anything into.
 */
function cannotHostWarning(integration: Integration, route: RouteChoice, framework: string): string[] {
  const target = FRAMEWORK_LABEL[framework] ?? `a ${framework} app`;
  const options = [
    `#   • ${CANNOT_HOST_NOTE[framework] ?? "port it to this framework's route convention."}`,
    ...(integration.language === 'python'
      ? [
          `#   • it is a separate SERVICE either way: run it (uvicorn main:app) and proxy`,
          `#     /api/chat to it, or point the fetch at http://localhost:8000/api/chat.`,
        ]
      : [`#   • or run it where it belongs: framework: "${route.framework}".`]),
    `#   • or use integration: "mock" for a zero-config local stream (no backend, no key).`,
  ];
  return [
    `#`,
    `# WARNING: the route below is written for ${route.runtime} and will NOT run`,
    `# as-is in ${target}.`,
    ...options,
  ];
}

// ── compose ───────────────────────────────────────────────────────────────────

function compose(
  archetype: Archetype,
  integration: Integration,
  placement: string,
  framework: string,
  suggestions: string[],
  audience?: string,
): string {
  const audienceHint = audience
    ? `tuned for ${audience} — keep the empty state and tone audience-appropriate`
    : 'add an empty-state prompt that fits your product';

  const isMock = integration.id === 'mock';
  // SCAF-8: compute the default model only for non-mock integrations that forward model.
  const defaultModel = isMock ? undefined : defaultModelFor(integration);
  const emitTools = !isMock && emitsToolSchemas(archetype, integration);
  // The loop needs a backend to POST the second round to; `mock` has none.
  // It does NOT require `emitTools`: an integration that builds its tools
  // server-side (langgraph, mastra, pi) still streams tool calls back, and the
  // loop that answers them is the same loop.
  const emitToolLoop = !isMock && hasToolPanel(archetype);
  const frontend = renderFrontend(
    framework,
    archetype,
    placement,
    audienceHint,
    suggestions,
    isMock,
    defaultModel,
    emitTools,
    emitToolLoop,
  );
  const route = isMock ? undefined : chooseRoute(integration, framework);

  const header = [
    `# AI/UI scaffold — ${archetype.title} × ${integration.title}`,
    `combo: ${archetype.id} × ${integration.id} × ${placement} × ${framework}`,
    `stream: ${integration.streamMapping}`,
  ].join('\n');

  const block1 = [
    `=== (1) FRONT-END (${framework}, ${placementStyle(placement).note}) ===`,
    ``,
    frontend,
  ].join('\n');

  const block2Parts: string[] = [`=== (2) BACKEND ROUTE ===`, ``];
  if (isMock) {
    // The mock integration has no backend — the front-end streams locally.
    block2Parts.push(
      `# No backend or API key needed — replies stream locally for preview (see the`,
      `# front-end onSubmit above). Swap \`integration\` for a real provider (openrouter,`,
      `# ollama, vercel-ai-sdk, …) when ready, and this block becomes its route handler.`,
    );
  } else if (route) {
    if (!route.exact) {
      block2Parts.push(
        `# Note: ${integration.title} has no route for "${framework}". Emitting its native`,
        `# ${route.runtime} route instead (matches the integration's ${integration.language} language).`,
        // For EVERY framework that cannot host it, not just react.
        ...cannotHostWarning(integration, route, framework),
      );
      block2Parts.push(``);
    } else {
      block2Parts.push(`# Runtime: ${route.runtime}`, ``);
    }
    block2Parts.push(route.template);
  } else {
    block2Parts.push(
      `# ${integration.title} ships no usable backend route template. See its docs`,
      `# (${integration.docsSlug}) — wire the route by hand following the streamMapping above.`,
    );
  }
  const block2 = block2Parts.join('\n');

  const envLines = integration.envVars.length
    ? integration.envVars.map((v) => `  - ${v}`).join('\n')
    : '  (none)';
  const block3 = [
    `=== (3) RUN NOTE ===`,
    ``,
    integration.runNote,
    ``,
    `Env vars to set:`,
    envLines,
  ].join('\n');

  // SCAF-16: loading-options note — inform consumers about the two opt-in load modes
  // (per-element tree-shaking + autoloader) without changing the default import above.
  // Leads with "the default is right" rather than a size headline; the debug tool
  // carries the full KB breakdown for developers who ask for it.
  // The default varies by framework, so describe what THIS scaffold actually emits:
  // every framework but `next` emits a top-level `import '@kitn.ai/ui/elements'`;
  // the next output loads the React wrappers through next/dynamic instead, and each
  // wrapper lazy-registers its own element on first client mount.
  const defaultLoadNote =
    framework === 'solid'
      ? [
          `The scaffold emits NO \`import '@kitn.ai/ui/elements'\` — a Solid app renders`,
          `the SolidJS components straight from the root entry, so no custom element is`,
          `registered at all and your bundler already tree-shakes what you never import.`,
          `Leave it as is. The two modes below matter only if you ALSO put raw \`<kai-*>\``,
          `tags on the page (you do not need to):`,
        ]
      : framework === 'next'
      ? [
          `The scaffold emits NO \`import '@kitn.ai/ui/elements'\` — it loads the React`,
          `wrappers through next/dynamic, and each wrapper lazy-registers ITS element on`,
          `first client mount, so you already ship only the elements you use. Leave it as`,
          `is. Two other modes exist if you drop the wrappers for raw \`<kai-*>\` tags:`,
        ]
      : [
          `The scaffold uses \`import '@kitn.ai/ui/elements'\` (register-all) — the right`,
          `default: it registers every kai-* element and is SSR-safe, so leave it as is.`,
          `Two opt-in modes load less if a page only ever uses a few elements:`,
        ];

  const block4 = [
    `=== LOADING OPTIONS ===`,
    ``,
    ...defaultLoadNote,
    ``,
    `  Per-element (bundler apps): import '@kitn.ai/ui/elements/<file>'`,
    `    Registers just that element; your bundler tree-shakes the rest away.`,
    `    Example: import '@kitn.ai/ui/elements/chat'  (client-only — not for SSR)`,
    ``,
    `  Autoloader (no-build / CDN pages): a <script type="module"> tag pointing at`,
    `    dist/elements/autoloader.js — loads each kai-* element on demand as it`,
    `    appears in the DOM. A CDN/static-file tool; not importable through a bundler.`,
    ``,
    `Run the debug tool with "reduce bundle size" for the full breakdown and sizes.`,
  ].join('\n');

  // SCAF-17: interaction patterns — small, copy-pasteable snippets for the
  // toast / card-recovery / preference-capture features. Appended as a reference
  // section so the consumer can wire confirmations, undo, and A/B preference
  // capture without leaving the scaffold. Does not change blocks 1–4.
  const block5 = interactionPatternsBlock();

  return [header, block1, block2, block3, block4, block5].join('\n\n');
}

// ── SCAF-17: reusable interaction-pattern snippets ─────────────────────────────

/**
 * The three interaction patterns from the chat-interactions feature set, emitted
 * as a labeled reference section the scaffolder always appends:
 *   1. `toast()` confirmation + Undo.
 *   2. `dismissRecovery()` card-policy wiring (with a toast adapter).
 *   3. `kai-compare` preference capture (two streams → kai-compare-select →
 *      recordPreference({ prompt, chosen, rejected })).
 *
 * Framework-agnostic (plain TS / DOM) so it drops into any of the front-end
 * targets; the imports are valid from `@kitn.ai/ui` (and `toast` also from
 * `@kitn.ai/ui/elements`).
 */
function interactionPatternsBlock(): string {
  const toastPattern = [
    `--- Pattern: toast() — confirmation + Undo ---`,
    `// toast is IMPERATIVE — call it; there is no <kai-toast> to place. The first`,
    `// call auto-mounts one <kai-toast-region> on document.body. Exported from`,
    `// both '@kitn.ai/ui' and '@kitn.ai/ui/elements'.`,
    `import { toast } from '@kitn.ai/ui/elements';`,
    ``,
    `toast('Copied to clipboard');      // neutral, auto-dismisses`,
    `toast.success('Saved');            // emerald success variant`,
    ``,
    `// Undo affordance: an action floors the duration so there's time to act.`,
    `const t = toast('Item deleted', {`,
    `  action: { label: 'Undo', onAction: () => restoreItem() },`,
    `});`,
    `// t.update({ message: 'Restored', variant: 'success' });  t.dismiss();`,
    ``,
    `// Collapsed (Sonner-style) stacking — toasts pile + expand on hover/focus.`,
    `// Opt in once at startup, or per-region via <kai-toast-region stack="collapsed">.`,
    `import { configureToasts } from '@kitn.ai/ui/elements';`,
    `configureToasts({ stack: 'collapsed' });`,
  ].join('\n');

  const recoveryPattern = [
    `--- Pattern: dismissRecovery() — card dismiss + Undo (DEFERRED, not deleted) ---`,
    `// Dismissing a generative-UI card does NOT delete its envelope — it stamps a`,
    `// 'dismissed' resolution and collapses to a reopenable stub. Keep dismissed`,
    `// envelopes in your array; wire the policy with dismissRecovery().`,
    `import { dismissRecovery } from '@kitn.ai/ui';`,
    `import { toast } from '@kitn.ai/ui/elements';`,
    ``,
    `// Adapter: map dismissRecovery's toast shape onto the imperative toast().`,
    `const toastAdapter = {`,
    `  show: ({ message, action, durationMs }) => {`,
    `    const h = toast(message, {`,
    `      duration: durationMs,`,
    `      action: action && { label: action.label, onAction: action.onClick },`,
    `    });`,
    `    return { dismiss: h.dismiss };`,
    `  },`,
    `};`,
    ``,
    `const { onDismiss, onReopen } = dismissRecovery({`,
    `  get: () => cards,                 // your current envelopes`,
    `  set: (next) => setCards(next),    // a NEW array reference (never mutate in place)`,
    `  toast: toastAdapter,`,
    `});`,
    `// Hand { onDismiss, onReopen } to the CardPolicy on <kai-cards> / <kai-remote>.`,
  ].join('\n');

  const preferencePattern = [
    `--- Pattern: kai-compare — capture an A/B preference pair ---`,
    `// <kai-compare> shows EXACTLY two candidates for one prompt. data is a JS`,
    `// PROPERTY; stream both columns with a fresh data ref per chunk; picking is`,
    `// terminal and fires kai-compare-select { chosenId, rejectedIds }.`,
    `import type { ResponseCompareData, CompareSelection } from '@kitn.ai/ui';`,
    ``,
    `const el = document.querySelector('kai-compare')!;`,
    `el.data = {`,
    `  prompt,`,
    `  candidates: [`,
    `    { id: 'a', content: '', streaming: true },`,
    `    { id: 'b', content: '', streaming: true },`,
    `  ],`,
    `} satisfies ResponseCompareData;`,
    ``,
    `// Stream BOTH: replace data with a NEW object per chunk; clear streaming when`,
    `// a candidate settles. The pick unlocks once both have settled (kai-ready).`,
    `// el.data = { ...el.data, candidates: [{ ...a, content: aText }, { ...b, content: bText }] };`,
    ``,
    `el.addEventListener('kai-compare-select', (e) => {`,
    `  const { chosenId, rejectedIds } = (e as CustomEvent<CompareSelection>).detail;`,
    `  recordPreference({ prompt, chosen: chosenId, rejected: rejectedIds });`,
    `});`,
  ].join('\n');

  const statePattern = [
    `--- Pattern: State helpers + streaming (new-array contract) ---`,
    `// Setter contract: always (prev) => next — every helper returns a new array.`,
    `// Vanilla adapter (works with any element ref):`,
    `// const set = (fn) => { el.messages = fn(el.messages ?? []); };`,
    ``,
    `// Low-level helpers from @kitn.ai/ui/state:`,
    `// import { appendMessage, updateMessage, appendText, createAssistantStream } from '@kitn.ai/ui/state';`,
    ``,
    `// Streaming loop (framework-agnostic):`,
    `// const stream = createAssistantStream(set);`,
    `// stream.appendText(chunk);                // text delta, appended to the trailing text part`,
    `// stream.appendReasoning(chunk);            // reasoning delta`,
    `// stream.upsertTool(toolCallId, patch);     // tool call delta (patch merges into the ToolPart)`,
    `// stream.done();                            // seal the message`,
    ``,
    `// One-liner for React (batteries-included):`,
    `// import { useKaiChat } from '@kitn.ai/ui/react';`,
    `// const chat = useKaiChat();`,
    `// <Chat {...chat.bind} />`,
    ``,
    `// One-liner for Solid (batteries-included):`,
    `// import { createKaiChat } from '@kitn.ai/ui';`,
    `// const chat = createKaiChat();`,
    `// <kai-chat {...chat.bind} on:kai-submit={chat.handleSubmit} />`,
  ].join('\n');

  return [
    `=== INTERACTION PATTERNS ===`,
    ``,
    `Optional snippets for confirmations, card recovery, preference capture, and state/streaming helpers.`,
    `Drop in the one(s) you need; all imports resolve from @kitn.ai/ui.`,
    ``,
    toastPattern,
    ``,
    recoveryPattern,
    ``,
    preferencePattern,
    ``,
    statePattern,
  ].join('\n');
}

// ── error text ────────────────────────────────────────────────────────────────

function rejectIntegration(id: string): string {
  const valid = listIntegrations()
    .map((i) => `${i.id} (${i.title})`)
    .join(', ');
  return [
    `Unknown integration: "${id}".`,
    ``,
    `Valid integrations: ${valid}.`,
    `Pick one of those ids and call scaffold again.`,
  ].join('\n');
}

function rejectUseCase(id: string): string {
  const valid = listArchetypes()
    .map((a) => `${a.id} (${a.title})`)
    .join(', ');
  return [
    `Unknown useCase: "${id}".`,
    ``,
    `Valid useCases (archetypes): ${valid}.`,
    `Pick one of those ids and call scaffold again.`,
  ].join('\n');
}

// ── tool ──────────────────────────────────────────────────────────────────────

export const scaffold: Tool = {
  name: 'scaffold',
  description:
    'Scaffold a working AI/UI chat surface from four axes: useCase (archetype) × integration × placement × framework. ' +
    'Emits a copy-pasteable front-end (kai-* components wired with messages + kai-submit + starter suggestions), the backend ' +
    'route for the chosen framework, and a run note with env vars. Use integration: "mock" for a zero-config local preview.',
  inputSchema: z.object({
    // useCase + integration are dynamic catalog ids — kept as strings and
    // validated against the registry in the handler (the handler is called
    // directly in tests, bypassing this schema). Use component_reference / the
    // catalogs to discover valid ids.
    useCase: z
      .string()
      .describe(
        'Archetype id, e.g. "drop-in-chat", "support-widget", "knowledge-base", "agentic", "workspace", "voice".',
      ),
    integration: z
      .string()
      .describe(
        'Backend integration id, e.g. "openrouter", "vercel-ai-sdk", "langgraph", "cloudflare", "ollama", "mastra", "pi", "pydantic-ai".',
      ),
    placement: Placement.describe(
      'Where the surface lives: full-page | side | docked-widget | inline.',
    ),
    framework: Framework.describe(
      'Target front-end/back-end framework: html | react | next | vue | svelte | angular | solid | fastapi | express | worker | tanstack-start. ' +
        'Note "solid" emits the SolidJS components from the @kitn.ai/ui root entry, not <kai-*> elements — the kit is authored in Solid.',
    ),
    suggestions: z
      .array(z.string())
      .optional()
      .describe(
        'Optional starter prompts shown above the input when the thread is empty (real kai-chat prop). ' +
          'Defaults to a generic pair if omitted so the feature always shows.',
      ),
    audience: z
      .string()
      .optional()
      .describe('Optional audience hint (tweaks the empty-state comment only).'),
  }),
  handler: async (args) => {
    const useCase = String(args.useCase ?? '');
    const integrationId = String(args.integration ?? '');
    const placement = String(args.placement ?? '');
    const framework = String(args.framework ?? 'html');
    const audience = args.audience ? String(args.audience) : undefined;
    // Default the suggestions so the feature always shows; honour a passed array.
    const suggestions =
      Array.isArray(args.suggestions) && args.suggestions.length > 0
        ? args.suggestions.map(String)
        : DEFAULT_SUGGESTIONS;

    // Validate against the registry BEFORE composing — graceful, self-correcting text.
    const archetype = getArchetype(useCase);
    if (!archetype) return text(rejectUseCase(useCase));

    const integration = getIntegration(integrationId);
    if (!integration) return text(rejectIntegration(integrationId));

    // Fall back to the archetype's default placement only if none was provided.
    const effectivePlacement = placement || archetype.defaultPlacement;

    return text(compose(archetype, integration, effectivePlacement, framework, suggestions, audience));
  },
};
