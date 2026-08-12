import { z } from 'zod';
import type { Tool } from './types';
import { Placement, Framework, SECRET_ENV_VAR } from '../../types';
import type { Integration } from '../../types';
import {
  getArchetype,
  getIntegration,
  listArchetypes,
  listIntegrations,
} from '../../registry';

/**
 * scaffold — the keystone tool. Composes a working chat surface from four axes:
 *
 *   components × integration × placement × framework
 *
 * and emits three labeled blocks an AI consumer can paste straight in:
 *   (1) Front-end  — the surface's kai-* components, rendered for the chosen
 *                    framework and sized for the placement, wired with the
 *                    `messages` property + `kai-submit` per the Streaming recipe.
 *   (2) Backend    — the integration's route template for the framework (with a
 *                    language-aware fallback when there's no exact match).
 *   (3) Run note   — how to run it + the env vars to set.
 *
 * THE SURFACE AXIS IS A COMPONENTS LIST, NOT AN ARCHETYPE ID, AND THAT IS THE
 * POINT OF THIS FILE'S SHAPE.
 *
 * It used to be an archetype id, and that made the six presets the whole of the
 * expressible space: `agentic` and `workspace` differ by nothing except which
 * components compose, so a builder who wanted both — a resizable artifact pane
 * that ALSO renders the tool calls that produced the artifact — could not ask for
 * it, and neither could `create-kai`'s feature multi-select. Adding a seventh
 * preset for every such combination is 2^n presets in the limit.
 *
 * So `renderSurface({ framework, components, integration })` is the renderer, the
 * archetypes are DATA over it (a preset is a named components list plus a default
 * placement), and there is exactly one of each. `create-kai` imports the same
 * function rather than growing a second one — a parallel renderer is the specific
 * failure this extraction exists to prevent, which is why
 * `assertPresetsAreData` in scripts/verify-scaffold-compiles.mjs asserts that a
 * preset request and a components request emit byte-identical surfaces.
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

// ── suggestions ───────────────────────────────────────────────────────────────

/** Default starter prompts so the suggestions feature always shows. */
const DEFAULT_SUGGESTIONS = ["What's new?", 'How can you help?'];

/** Render a string[] as a JS array literal (JSON-quoted — keeps apostrophes readable). */
function jsArray(items: string[]): string {
  return '[' + items.map((s) => JSON.stringify(s)).join(', ') + ']';
}

// ── streaming: import the adapter, do not re-hand-roll it ─────────────────────

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
  /** the scaffold declares a card registry → the loop gets its cardFromToolCall arm */
  cards?: boolean;
  /** how this framework exposes the turn's thread (tool-loop shape only) */
  thread: ThreadBinding;
  /** where the submitted text comes from — every kai-* target reads it off the
   *  `kai-submit` CustomEvent; `solid` renders the SolidJS `PromptInput`, which
   *  has no such event, so its submitted text is the controlled input signal. */
  valueSource?: string;
  /** lines emitted right after the value is read and guarded */
  afterValue?: string[];
  /**
   * The `mock` integration. Swaps ONLY the source of the stream — the canned
   * responder instead of `fetch('/api/chat')` — and leaves every other line
   * identical. That identity is the point: see `mockRequest`.
   */
  mock?: boolean;
}): string {
  const {
    pad, read, commitSet, setterAdapter, setLoading, bodyPayload, strictRoles = false, toolLoop, thread,
    cards = false, valueSource = 'e.detail.value', afterValue = [], mock = false,
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

  /**
   * The mock's request. Note what it is NOT: it is not a different streaming
   * strategy, it is the same two lines with a different source expression.
   *
   * `mockResponse(value)` yields SSE frames that `readOpenAIStream` parses
   * exactly as it parses a provider's, so the no-backend preview exercises the
   * kit's real reader rather than a hand-rolled fold — and swapping to a real
   * backend is replacing this one expression with the `fetch` below.
   *
   * It is also, deliberately, impossible to mistake for a real response: the
   * stream opens with a `: kai-mock` SSE comment, every frame carries a
   * `_kai_mock` marker, the model reports as `kai-mock` and the turn reports
   * zero tokens. See `createMockResponder` in @kitn.ai/ui/state.
   */
  const mockRequest = (indent: string): string[] => [
    `${indent}// NO BACKEND AND NO PROVIDER. mockResponse() returns canned SSE frames that`,
    `${indent}// are read by the SAME parser a real model's response goes through, so this`,
    `${indent}// preview exercises the real path. Every frame is marked as a mock (a`,
    `${indent}// ': kai-mock' banner, a _kai_mock field, model 'kai-mock', zero usage), so`,
    `${indent}// nothing here can be mistaken for a real turn.`,
    `${indent}//`,
    `${indent}// TO GO LIVE, only this one line changes: \`res\` becomes the POST to your`,
    `${indent}// route, with toOpenAIMessages(${threadExpr}) as the body. Rather than copy`,
    `${indent}// that request into a comment here — where it would drift from the real`,
    `${indent}// one — scaffold again with a provider (integration: 'openrouter', 'ollama',`,
    `${indent}// …) and the emitted code is the exact replacement, backend route included.`,
    `${indent}// Everything below this line is already the real path and stays as it is.`,
    `${indent}const res = mockResponse(value);`,
    `${indent}const turn = await readOpenAIStream(res, stream);`,
  ];

  const realRequest = (indent: string): string[] => [
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

  const request = mock ? mockRequest : realRequest;

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
    ...(toolLoop ? toolLoopBody({ pad, request, threadExpr, cards }) : [
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
  /** the scaffold declares a card registry, so a `kai_*` call is a card, not a tool */
  cards?: boolean;
}): string[] {
  const { pad, request, threadExpr, cards = false } = opts;
  // THE ONE LINE THAT CLOSES THE LOOP.
  //
  // A `kai_confirm` call is not a tool to run: `cardTools` handed the model the
  // card's own data schema, so the arguments ARE the envelope's `data` and the
  // mapping is identity. `cardFromToolCall` returns null for every other name, so
  // the app's own tools fall through untouched and this costs nothing when the
  // model never asks for a card.
  //
  // The provider's `tool_call_id` becomes `CardEnvelope.id` verbatim, which is what
  // buys free revision: a model correcting a card re-sends the same call id and
  // `addCard` upserts in place instead of stacking a second copy.
  const cardBranch = cards
    ? [
        `${pad}      // A kai_* call is a CARD, not a tool to run: cardTools handed the model`,
        `${pad}      // the card's own schema, so the arguments ARE the envelope's data.`,
        `${pad}      // cardFromToolCall returns null for anything else, which falls through to`,
        `${pad}      // your own tools below.`,
        `${pad}      const card = cardFromToolCall(call.name, call.input ?? {}, { id: call.id });`,
        `${pad}      if (card) {`,
        `${pad}        // The id IS the tool call id, so a model that revises the card re-sends`,
        `${pad}        // the same id and this replaces it in place instead of drawing a second.`,
        `${pad}        stream.addCard(card);`,
        `${pad}        // Answer the call now: the card is on screen and the model must not sit`,
        `${pad}        // waiting on a result. The user's click comes back through the card's own`,
        `${pad}        // kai-card-event, not through this round.`,
        `${pad}        applyToolOutput(stream, call.id, { status: 'awaiting_user' });`,
        `${pad}        continue;`,
        `${pad}      }`,
      ]
    : [];
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
    ...cardBranch,
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

/** True when the surface renders a tool panel, so the scaffold needs the loop. */
function hasToolPanel(components: readonly string[]): boolean {
  return components.includes('kai-tool');
}

/**
 * True when the scaffold emits the generative-UI card round trip: a
 * `createCardRegistry` declaration, `cardTools()` in the tools array, and
 * `cardFromToolCall()` in the tool loop.
 *
 * CARDS FOLD INTO `kai-tool`. THERE IS NO SEPARATE CARD COMPONENT, AND THAT IS A
 * CHOICE. A card is a tool call the model makes and the app draws instead of
 * executing, so "the model reaches for a tool" is the same capability `kai-tool`
 * already stands for, and a distinct card capability would add another surface's
 * worth of front-end cells to `verify:scaffold` to say it twice.
 *
 * Written as its own predicate rather than being spelled `hasToolPanel` at each
 * call site even though it returns exactly that today. The fold is a decision with
 * ONE place to change: point this at a different component and the registry, the
 * tools and the loop line move together. Inlining `hasToolPanel` would scatter the
 * decision over eight renderers and make moving it a search-and-replace.
 */
function bearsCards(components: readonly string[]): boolean {
  return hasToolPanel(components);
}

/**
 * Which provider envelope `cardTools()` should project into, for the wire this
 * integration's route really speaks.
 *
 * `cardTools` takes `provider` as a REQUIRED argument because the three shapes are
 * genuinely different documents: OpenAI nests the schema under
 * `function.parameters`, Anthropic puts it at `input_schema`, and `jsonschema`
 * returns a bare `{name, description, schema}` that `ai@7`'s `jsonSchema()` takes
 * directly. Emitting the wrong one is not a style problem — the provider 400s, or
 * (worse) ignores the tool and the card silently never arrives.
 *
 * READ OFF THE INTEGRATION, not inferred. This used to be a table keyed on
 * `streamFormat`, and that table was wrong in a way only `anthropic` made
 * visible: `streamFormat` describes the RESPONSE stream, the tool envelope is a
 * REQUEST concern, and the two only looked correlated while every integration
 * that forwarded tools happened to be `openai-sse`. `anthropic` is
 * `streamFormat: 'native'`, the table mapped `native` to `null`, and a null here
 * means a scaffold that hands the model a tools array with no card in it.
 *
 * Nor is the fix "key on the provider instead". Anthropic's emitted route
 * CONVERTS the array itself — `toAnthropicTools` reads `raw.function.name` and
 * `raw.function.parameters` — so it wants the OPENAI envelope even though it
 * POSTs to api.anthropic.com. Only the route knows its own request contract, so
 * the integration declares it (`clientToolFormat`), exactly as it already
 * declares `forwardsFromClient`.
 *
 * `null` here means the integration does not forward a tools array at all, which
 * is the honest state for langgraph/mastra/pi/vercel-ai-sdk (their routes own the
 * tool list server-side). It can no longer mean "forwards tools, envelope
 * unknown": `IntegrationSchema` rejects that combination at the catalog boundary,
 * `assertCardToolFormat` below refuses to emit it, and `scaffold.test.ts` +
 * `cardRoundTripCheck` both assert it against the real registry.
 */
function cardToolProviderFor(integration: Integration): 'openai' | 'anthropic' | 'jsonschema' | null {
  return integration.clientToolFormat ?? null;
}

/**
 * The emit-time hard stop.
 *
 * The schema refinement catches a malformed catalog entry, but `Integration`
 * values also arrive from tests and from callers that build one by hand, so the
 * emit path refuses rather than trusting that. Throwing here is the point: the
 * failure this guards is SILENT by nature — a tools array with no card tool in it
 * produces a model that is never told a card exists, so it never emits one, and
 * nothing anywhere says why. A thrown error naming the integration is strictly
 * better than a scaffold that looks fine and renders nothing.
 */
function assertCardToolFormat(integration: Integration): 'openai' | 'anthropic' | 'jsonschema' {
  const provider = cardToolProviderFor(integration);
  if (provider === null) {
    throw new Error(
      `Integration '${integration.id}' forwards a 'tools' array but declares no clientToolFormat, so the ` +
        `scaffold would offer the model no card tool at all. Set clientToolFormat on the integration to the ` +
        `envelope its route expects: 'openai' | 'anthropic' | 'jsonschema'.`,
    );
  }
  return provider;
}

/**
 * What the scaffolder INTENDS to emit for one (components, integration) pair, so a
 * guard can check the eight renderers against the decision instead of restating it.
 *
 * Exported for `cardRoundTripCheck` in scripts/verify-scaffold-compiles.mjs and
 * for scaffold.test.ts. It reads the same three predicates `renderSurface` reads
 * and nothing else, which is the point: the failure it exists to catch is one of
 * the eight framework renderers not following the decision, and the check would be
 * worthless if the guard hard-coded "the agentic archetype, 8 integrations".
 *
 * KEYED ON A COMPONENTS LIST, not an archetype id, for the same reason
 * `renderSurface` is. A guard that took an archetype id could only ever check the
 * six presets, so the surfaces the feature multi-select makes reachable — the ones
 * with no preset — would emit cards with nothing asserting they did. The archetype
 * axis was also the narrower one: `getArchetype` returns `undefined` for anything
 * not in the catalog, so the guard could not have been pointed at a new surface
 * without first shipping a catalog entry for it.
 *
 * It cannot catch the emitter and the plan being wrong TOGETHER, so it is not the
 * only check: `cardRoundTripCheck` also asserts, without consulting this function,
 * that a scaffold declaring a `tools` array always calls `cardTools` — a tools
 * array offered to a model with no card in it is the silent hole.
 */
export function cardEmitPlan(
  components: readonly string[],
  integrationId: string,
): { cards: boolean; tools: boolean; provider: 'openai' | 'anthropic' | 'jsonschema' | null } | null {
  const integration = getIntegration(integrationId);
  if (!integration || components.length === 0) return null;
  const isMock = integration.id === 'mock';
  const cards = !isMock && bearsCards(components);
  const tools = !isMock && emitsToolSchemas(components, integration);
  return { cards, tools, provider: cards && tools ? cardToolProviderFor(integration) : null };
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
 * `typed` pulls in the kit's own `ChatMessage` for the strict-TS frameworks; the
 * plain-JS html target must not emit a type import, and `solid` takes the same
 * type from `@kitn.ai/ui` alongside its components.
 *
 * The `mock` integration imports from here too. It used to import nothing at all
 * and hand-declare a narrow local `ChatMessage` instead — a subset with no
 * `raw`/`rawInput` and no `source`/`file` part variants, which a message the kit
 * itself produced did not satisfy. Now that the mock streams through
 * `readOpenAIStream` like everything else, it takes the real type.
 */
function wireImportLines(opts: {
  pad?: string;
  typed: boolean;
  /** the live tool loop is emitted → it calls applyToolOutput/applyToolFailure */
  toolLoop?: boolean;
  /** the framework's thread binding declares `const set: SetMessages` */
  setMessagesType?: boolean;
  /** the card registry is emitted → createCardRegistry + cardFromToolCall */
  cards?: boolean;
  /** the tools array calls cardTools() as well */
  cardTools?: boolean;
  /** the `mock` integration → import the shared responder, not a fetch encoder */
  mock?: boolean;
}): string[] {
  const { pad = '', typed, toolLoop = false, setMessagesType = false, cards = false, cardTools: emitsCardTools = false, mock = false } = opts;
  const stateNames = [
    'createAssistantStream',
    // The mock's canned reply comes from the kit, not from a copy pasted into
    // this file. One implementation, shared with create-kai and the starters.
    ...(mock ? ['createMockResponder'] : []),
    ...(typed ? ['type ChatMessage'] : []),
    ...(typed && setMessagesType ? ['type SetMessages'] : []),
  ].join(', ');
  // `noUnusedLocals` is enforced over the emitted scaffolds (verify:scaffold), so
  // the mock must NOT name toOpenAIMessages: it has no request body to encode.
  const wireNames = [
    'readOpenAIStream',
    ...(mock ? [] : ['toOpenAIMessages']),
    ...(toolLoop ? ['applyToolOutput', 'applyToolFailure'] : []),
  ].join(', ');
  // Same noUnusedLocals rule as above, one entry finer: `cardTools` is named only
  // when the integration's route actually forwards a tools array, because on the
  // ones that build their tools server-side the registry is still wired to the
  // client (cardTypes/cardSchemas) while nothing here calls cardTools.
  const schemaNames = [
    'createCardRegistry',
    ...(emitsCardTools ? ['cardTools'] : []),
    ...(toolLoop ? ['cardFromToolCall'] : []),
  ].join(', ');
  return [
    `${pad}import { ${stateNames} } from '@kitn.ai/ui/state';`,
    `${pad}import { ${wireNames} } from '@kitn.ai/ui/wire';`,
    // Server-safe: no DOM, no Solid runtime. The same import works in the route
    // when the registry moves to its own cards.ts.
    ...(cards ? [`${pad}import { ${schemaNames} } from '@kitn.ai/ui/schemas';`] : []),
  ];
}

/**
 * The mock responder, declared at MODULE scope.
 *
 * Module scope rather than inside the submit handler because the responder owns
 * the cursor into its canned replies: rebuilt per turn it would answer with the
 * first reply forever, and the seeded conversation would stop making sense on
 * the second message.
 */
function mockResponderInit(pad = ''): string[] {
  return [
    `${pad}// The kit's own mock responder — no backend, no key, no network. It streams`,
    `${pad}// canned SSE frames through the same reader a real provider's response uses,`,
    `${pad}// and marks every one of them as a mock. Shared with create-kai and the`,
    `${pad}// starters, so there is one implementation of this and not seven.`,
    `${pad}const mockResponse = createMockResponder();`,
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

// ── SCAF-8: per-integration default model ids ─────────────────────────────────

/**
 * Default model id per integration whose route forwards one.
 *
 * THE ID IS HOST-SPECIFIC, and there is no such thing as a safe generic one.
 * This used to fall through to `'openai/gpt-4o-mini'` for anything unlisted, on
 * the reasoning that "a route that forwards the client's model is by definition
 * pointed at an OpenAI-compatible endpoint". That was false twice over the
 * moment a first-party provider landed: `openai/gpt-4o-mini` is an OPENROUTER
 * slug — api.openai.com 404s the prefixed form, and api.anthropic.com rejects it
 * outright — so a scaffold generated for the provider it names could not run
 * against it.
 *
 * tsc cannot see any of this; every one of those strings compiles. The guard is
 * `scaffold.test.ts` → "the emitted model id is valid for the host its route
 * POSTs to", which reads the id out of the EMITTED scaffold and the host out of
 * the route source, so a new integration cannot reintroduce a wrong one.
 */
const CLIENT_MODEL_IDS: Record<string, string> = {
  // Vendor-prefixed `vendor/model`: OpenRouter's own id space, and the ONLY one
  // of the three where the prefix belongs.
  openrouter: 'openai/gpt-4o-mini',
  // No vendor prefix. This is what the route already pinned, so moving the knob
  // to the client changes the wire not at all.
  openai: 'gpt-4o-mini',
  // Anthropic's id space. Matches what the route pinned; 'claude-sonnet-5' and
  // 'claude-haiku-4-5' are the cheaper swaps (see this integration's runNote).
  anthropic: 'claude-opus-5',
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
  const id = CLIENT_MODEL_IDS[integration.id];
  // No fallback, deliberately — the old `?? 'openai/gpt-4o-mini'` is what let a
  // first-party provider inherit an OpenRouter slug and emit a scaffold that
  // 404s on its own host. A model id is a per-host fact; an integration that
  // forwards one has to say which.
  if (id === undefined) {
    throw new Error(
      `Integration '${integration.id}' forwards the client's 'model' but has no CLIENT_MODEL_IDS entry, so the ` +
        `scaffold would emit a model id that is not valid for the host its route POSTs to. Add one in ` +
        `mcp/tools/scaffold.ts.`,
    );
  }
  return id;
}

/**
 * True when the scaffold should declare tool schemas and put them in the body.
 *
 * Both halves matter. A tool panel with no tools array in the request is a panel
 * no code path can populate: the model never emits a tool call, so kai-tool
 * renders nothing forever. And a tools array the route drops on the floor is the
 * same dead-const defect as the model one: langgraph builds its tools into the
 * agent, Mastra and Pi into the harness, and none of them read the field.
 *
 * The archetype half is an OR, not just `hasToolPanel`, because there are now two
 * reasons a scaffold needs a tools array: a tool panel with nothing to call, and a
 * card the model can never be asked for. Both operands are true for `agentic`
 * today (see `bearsCards`), so the `||` changes no output — it is here so that
 * moving cards to an archetype without `kai-tool` keeps emitting their tools
 * instead of silently dropping them.
 */
function emitsToolSchemas(components: readonly string[], integration: Integration): boolean {
  const needsToolsArray = hasToolPanel(components) || bearsCards(components);
  return needsToolsArray && integration.forwardsFromClient.includes('tools');
}

/**
 * The tool schemas, emitted beside the model const. OpenAI function-calling
 * form, which is what every passthrough route forwards.
 *
 * `search` on purpose: it is the tool `SAMPLE_AGENTIC_MESSAGE` already shows in
 * the seeded thread, so the sample panel and the live one describe one tool.
 *
 * The CARD tools are appended by calling `cardTools(cards, { provider })`, never
 * by writing a card's shape out here. That is the whole point of the emit
 * contract: a `confirm` card's schema already exists, the kit already validates
 * arriving cards against it, and a scaffolder that restated it would be the sixth
 * copy of one shape — the copy that drifts, in the file a developer is least
 * likely to re-read.
 */
function toolSchemaLines(
  pad: string,
  cardProvider: 'openai' | 'anthropic' | 'jsonschema' | null = null,
): string[] {
  // The `provider` note differs per shape, because the three shapes are genuinely
  // different documents and a developer swapping backends needs to know which line
  // to change.
  const PROVIDER_NOTE: Record<'openai' | 'anthropic' | 'jsonschema', string[]> = {
    openai: [
      `// \`provider\` is required, not cosmetic: this route POSTs to an OpenAI-compatible`,
      `// endpoint, which wants { type: 'function', function: { parameters } }. Anthropic`,
      `// wants the schema at \`input_schema\` instead — one word here, not a rewrite.`,
    ],
    anthropic: [
      `// \`provider\` is required, not cosmetic: Anthropic's /v1/messages wants the schema`,
      `// at \`input_schema\`, where an OpenAI-compatible endpoint wants it nested under`,
      `// \`function.parameters\`. One word here, not a rewrite.`,
    ],
    jsonschema: [
      `// 'jsonschema' returns a bare { name, description, schema }, which is the form the`,
      `// AI SDK takes directly: tool({ description, inputSchema: jsonSchema(def.schema) }).`,
      `// No provider envelope, so our schema is not an awkward second source of truth.`,
    ],
  };
  const cardLines =
    cardProvider === null
      ? []
      : [
          `${pad}  // Every card type \`cards\` declares, as a tool definition GENERATED from the`,
          `${pad}  // card's own JSON Schema — the same schema the kit validates arriving cards`,
          `${pad}  // against, so the tool the model sees and the card that renders cannot drift.`,
          ...PROVIDER_NOTE[cardProvider].map((l) => `${pad}  ${l}`),
          `${pad}  ...cardTools(cards, { provider: '${cardProvider}' }),`,
        ];
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
    ...cardLines,
    `${pad}];`,
  ];
}

/**
 * The card registry: the ONE place this app writes down which cards it renders.
 *
 * Emitted at MODULE scope in every framework, deliberately. Three separate things
 * read it — the tools array, the tool loop's `cardFromToolCall` fall-through, and
 * the client's `cardTypes`/`cardSchemas` wiring — and in the Solid target one of
 * them (`renderPart`) is a top-level function that cannot see a component-local
 * const. In a real app this block is `cards.ts`, imported by the client AND by the
 * route; the scaffold's tool loop runs in the browser, so one module holds both
 * ends here and the comment says where it goes when they separate.
 *
 * `use` is a real narrowing, not decoration: it is what the model is OFFERED, so
 * two entries is two tool definitions per request instead of seven. It does not
 * narrow what RENDERS — `mergeCardTags` unions all seven built-ins in regardless,
 * so a `tasks` envelope arriving from somewhere else still draws.
 */
function cardRegistryLines(pad = ''): string[] {
  return [
    `${pad}// The card types this app renders, declared ONCE for both ends of the round`,
    `${pad}// trip: \`cardTools(cards, …)\` turns them into the tool definitions the model`,
    `${pad}// is offered, and cardTypes/cardSchemas below tell <kai-chat> what draws an`,
    `${pad}// arriving card and what a valid one looks like. Move this to its own cards.ts`,
    `${pad}// the moment your BACKEND needs it too — it imports nothing from the DOM.`,
    `${pad}const cards = createCardRegistry({`,
    `${pad}  // The built-ins the model is OFFERED. Omit \`use\` for all seven; every entry`,
    `${pad}  // is one more tool definition in every request. This does NOT narrow what`,
    `${pad}  // RENDERS: all seven built-in cards still draw if one turns up.`,
    `${pad}  use: ['confirm', 'choice'],`,
    `${pad}  // YOUR card types go here, and this is the half that makes the generative UI`,
    `${pad}  // yours. \`schema\` is both what the model is told and what arriving data is`,
    `${pad}  // checked against; \`tag\` is your own custom element.`,
    `${pad}  // custom: {`,
    `${pad}  //   'pricing-table': {`,
    `${pad}  //     schema: pricingSchema,          // import pricingSchema from './pricing.schema.json'`,
    `${pad}  //     tag: 'my-pricing-table',`,
    `${pad}  //     description: 'Show a plan comparison the user can pick from.',`,
    `${pad}  //   },`,
    `${pad}  // },`,
    `${pad}});`,
  ];
}

/**
 * The two card properties, as the JS PROPERTIES they have to be.
 *
 * `cards.tags` and `cards.validationSchemas` carry the CUSTOM types only, because
 * the kit merges its own seven in itself — so with no `custom` block above they are
 * both `{}` and these two lines currently do nothing. They are emitted anyway, and
 * that is the point of the emit contract rather than an oversight: filling in
 * `custom` is then a one-line change instead of an archaeology exercise through the
 * docs, and the two names are the ones a developer would otherwise have to
 * discover. `verify:scaffold` compiles the assignment in all eight frameworks, so
 * the shapes are proven compatible rather than asserted to be.
 *
 * Never an attribute. `cardTypes`/`cardSchemas` are objects, and an object set as
 * an HTML attribute stringifies to "[object Object]" and silently registers
 * nothing.
 */
const CARD_PROP_COMMENT = [
  `// Cards, as JS PROPERTIES (objects can never be HTML attributes). \`tags\` says`,
  `// what DRAWS your own card type; \`cardSchemas\` says what a VALID one looks like,`,
  `// so a model that gets the shape wrong shows a named diagnostic instead of empty`,
  `// chrome. Both are {} until the \`custom\` block above is filled in; the built-in`,
  `// seven draw and validate without them.`,
];

// `//` comment lines as a JSX comment block, for the three JSX targets.
//
// A JSX comment (a braces pair wrapping a block comment) is legal only at ELEMENT
// position; between attributes it is a parse error. So these go above the tag
// rather than among its props. Written as line comments here because the thing
// being described cannot be spelled inside a block comment.
function jsxComment(lines: readonly string[], pad: string): string[] {
  return lines.map((l) => `${pad}{/* ${l.replace(/^\/\/ ?/, '')} */}`);
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

/** True when the surface is the resizable split workspace (chat + artifact). */
function isWorkspace(components: readonly string[]): boolean {
  return components.includes('kai-resizable') && components.includes('kai-artifact');
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
  /**
   * The human label in the emitted banner comment, DERIVED from the components
   * (see `surfaceLabel`) rather than passed in from a preset's `title`.
   *
   * That is deliberate and it is what makes archetypes data. A renderer that took
   * a caller-supplied title would emit different bytes for the same components
   * depending on who asked, so `renderSurface(components)` and
   * `scaffold({ useCase })` could not be compared for equality — and that equality
   * is the single check standing between this file and a second renderer growing
   * back (see `assertPresetsAreData` in scripts/verify-scaffold-compiles.mjs).
   * The preset's title is still printed, in the provenance header `compose`
   * writes ABOVE the surface, where it describes where the request came from
   * instead of what was rendered.
   */
  label: string;
  /** mock = stream the reply client-side (no fetch, no backend, no key) */
  isMock: boolean;
  /** SCAF-8: non-undefined when the integration forwards a model param */
  defaultModel?: string;
  /** the surface renders kai-tool AND the route forwards a tools array, so the
   *  scaffold declares the schemas that make a tool call possible */
  emitTools: boolean;
  /** the surface renders kai-tool and there is a backend to call, so the live
   *  multi-round loop (and the `runTool` stub it calls) is emitted */
  emitToolLoop: boolean;
  /** the surface bears cards and there is a model to ask for one, so the
   *  registry + the loop's cardFromToolCall arm + the cardTypes/cardSchemas
   *  wiring are emitted */
  emitCards: boolean;
  /** which provider envelope `cardTools()` projects into, or null when this
   *  integration's route does not forward a tools array we can shape (see
   *  `cardToolProviderFor`). Non-null implies `emitCards`. */
  cardProvider: 'openai' | 'anthropic' | 'jsonschema' | null;
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
function componentTags(components: readonly string[], chatFill: string): string {
  const companionTags = components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );
  const hasEmbedded = components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
  const hasStandaloneCompanions = companionTags.length > 0;

  const lines: string[] = [];
  // SCAF-14: workspace is a structural/layout surface — emit a runnable split.
  //
  // This used to `return` here, which dropped every standalone companion on the
  // floor: a surface with kai-sources AND the workspace pair rendered the split
  // and nothing else. No archetype could reach that combination (`workspace` is
  // the only preset with the pair and it carries no companions), so the bug was
  // unreachable until the surface axis became a components list. Building the
  // chat block into `lines` instead means the companion loop below runs either
  // way, which is the property that was missing rather than a special case.
  if (isWorkspace(components)) {
    lines.push(
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
    );
  } else {
    lines.push(`  <kai-chat id="chat" suggestion-mode="submit" style="${chatFill}"></kai-chat>`);
  }

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
function htmlModule(ctx: RenderCtx, components: readonly string[]): string {
  const hasEmbedded = components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
  const hasSources = components.includes('kai-sources');

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
        `// SCAF-8: change this model id to another id THIS PROVIDER accepts.`,
        `const model = '${ctx.defaultModel}';`,
        ``,
      ]
    : [];
  const cardsLines = ctx.emitCards ? [...cardRegistryLines(''), ``] : [];
  const toolsLines = ctx.emitTools ? [...toolSchemaLines('', ctx.cardProvider), ``] : [];
  const runnerLines = ctx.emitToolLoop ? [...toolRunnerLines('', true), ``] : [];
  const cardPropLines = ctx.emitCards
    ? [
        ...CARD_PROP_COMMENT.map((l) => `  ${l}`),
        `  chat.cardTypes = cards.tags;`,
        `  chat.cardSchemas = cards.validationSchemas;`,
        ``,
      ]
    : [];

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
    ...wireImportLines({
      typed: annotatesChatMessage,
      toolLoop: ctx.emitToolLoop,
      cards: ctx.emitCards,
      cardTools: ctx.cardProvider !== null,
      mock: ctx.isMock,
    }),
    `import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    ``,
    ...(ctx.isMock ? [...mockResponderInit(), ``] : []),
    ...modelLines,
    ...cardsLines,
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
    ...cardPropLines,
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
      cards: ctx.emitCards,
      thread: liveThreadBinding(
        'chat.messages',
        '(fn) => { chat.messages = fn(chat.messages); }',
        'chat.messages ?? []',
      ),
      mock: ctx.isMock,
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
function renderHtml(components: readonly string[], ctx: RenderCtx, isViteHtmlTarget: boolean): string {
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
    `<!-- ${ctx.label} — ${p.note} -->`,
    ...(p.altNote ?? []).map((l) => `<!-- ${l} -->`),
    `<div style="${p.style}">`,
    componentTags(components, p.chatFill),
    `</div>`,
    ...scriptNote,
    `<script type="module" src="/src/main.ts"></script>`,
    ``,
    `<!-- empty-state hint: ${emptyHint} -->`,
    ``,
    `// ── src/main.ts ──────────────────────────────────────────────────────────────`,
    htmlModule(ctx, components),
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
function renderJsx(components: readonly string[], ctx: RenderCtx, framework: string): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  const hasEmbedded = components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
  const workspace = isWorkspace(components);

  // SCAF-9: exclude message-embedded tags from import list.
  // SCAF-14: workspace uses Resizable+ResizableItem+Artifact — keep them in the import list.
  const renderableTags = components.filter((t) => !MESSAGE_EMBEDDED_TAGS.has(t));
  // For workspace: replace 'kai-resizable' with 'kai-resizable-item' so we get ResizableItem too.
  const importTags = workspace
    ? [...new Set([...renderableTags.filter((t) => t !== 'kai-resizable'), 'kai-resizable', 'kai-resizable-item'])]
    : renderableTags;
  const wrapperNames = importTags.map(toPascalCase);
  const importList = wrapperNames.join(', ');

  // SCAF-9: standalone companion tags (not kai-chat, not message-embedded, not workspace-structural).
  const standaloneCompanionTags = components.filter(
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

  const mockInit = isMock ? mockResponderInit() : [];

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
    ? `  // SCAF-8: change this model id to another id THIS PROVIDER accepts.\n  const model = '${defaultModel}';`
    : '';

  const toolsInit = emitTools ? toolSchemaLines('  ', ctx.cardProvider).join('\n') : '';
  const toolRunner = emitToolLoop ? toolRunnerLines('  ', true).join('\n') : '';
  // MODULE scope, unlike `tools`/`runTool`: a registry is static data, so rebuilding
  // it on every render would allocate a new object per keystroke and hand <Chat> a
  // new cardTypes reference each time.
  const cardsInit = ctx.emitCards ? cardRegistryLines('') : [];
  // The two card props, as JSX props on the wrapper — which sets them as DOM
  // PROPERTIES on <kai-chat>, never as attributes. The explanation goes ABOVE the
  // element, not between its attributes: `{/* … */}` is only legal at element
  // position in JSX, and in attribute position it is a parse error.
  const cardProps = (pad: string): string[] =>
    ctx.emitCards
      ? [`${pad}cardTypes={cards.tags}`, `${pad}cardSchemas={cards.validationSchemas}`]
      : [];
  const cardPropsNote = (pad: string): string[] =>
    ctx.emitCards ? jsxComment(CARD_PROP_COMMENT, pad) : [];

  // onSubmit body. The mock and the real backend differ by ONE expression — the
  // stream's source — and share every other line: see `realStreamBody`.
  const onSubmitBody = realStreamBody({
    pad: '    ',
    read: 'messages',
    commitSet: (expr) => `setMessages(${expr});`,
    // useState's setter IS a SetMessages: both are (updater) => void.
    setterAdapter: 'setMessages',
    setLoading: (v) => `setLoading(${v});`,
    bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
    strictRoles: true,
    toolLoop: emitToolLoop,
    cards: ctx.emitCards,
    thread: REACT_THREAD,
    mock: isMock,
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
      ...wireImportLines({
        typed: true,
        toolLoop: emitToolLoop,
        setMessagesType: emitToolLoop,
        cards: ctx.emitCards,
        cardTools: ctx.cardProvider !== null,
        mock: isMock,
      }),
      `import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
      `// <kai-*> are client-only custom elements (the server has no customElements`,
      `// registry) → load client-only so hydration doesn't mismatch. The package itself`,
      `// is SSR-import-safe; importing it from a server component is fine.`,
      ...dynamicImports,
      ``,
      ...nextConfigNote,
      `// ${ctx.label} — ${p.note}. empty-state hint: ${emptyHint}`,
      ...(p.altNote ?? []).map((l) => `// ${l}`),
      ...mockInit,
      ``,
      ...cardsInit,
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
            ...cardPropsNote('          '),
            `          <Chat`,
            `            messages={messages}`,
            `            loading={loading}`,
            `            suggestions={suggestions}`,
            `            suggestionMode="submit"`,
            ...cardProps('            '),
            `            onSubmit={onSubmit}`,
            `            style={{ ${jsxStyle(p.chatFill)} }}`,
            `          />`,
            `        </ResizableItem>`,
            `        <ResizableItem min="280px">`,
            `          {/* Replace src + files with your real artifact data (files is required: array/object props are never optional attributes on a kai-* element). */}`,
            `          <Artifact src="https://example.com" files={[{ path: 'index.html', url: 'https://example.com' }]} style={{ width: '100%', height: '100%' }} />`,
            `        </ResizableItem>`,
            `      </Resizable>`,
            // Standalone companions are siblings of the SPLIT, not of the chat:
            // the split owns chat + artifact, and a sources panel or a voice input
            // belongs beside it. Dropping them here is what the workspace branch
            // used to do — see WORKSPACE_STRUCTURAL_TAGS.
            companions,
          ]
        : [
            ...cardPropsNote('      '),
            `      <Chat`,
            `        messages={messages}`,
            `        loading={loading}`,
            `        suggestions={suggestions}`,
            `        suggestionMode="submit"`,
            ...cardProps('        '),
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
    ...wireImportLines({
      typed: true,
      toolLoop: emitToolLoop,
      setMessagesType: emitToolLoop,
      cards: ctx.emitCards,
      cardTools: ctx.cardProvider !== null,
      mock: isMock,
    }),
    `import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    ``,
    ...nextConfigNote,
    `// ${ctx.label} — ${p.note}. empty-state hint: ${emptyHint}`,
    ...(p.altNote ?? []).map((l) => `// ${l}`),
    ...mockInit,
    ``,
    ...cardsInit,
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
          ...cardPropsNote('          '),
          `          <Chat`,
          `            messages={messages}`,
          `            loading={loading}`,
          `            suggestions={suggestions}`,
          `            suggestionMode="submit"`,
          ...cardProps('            '),
          `            onSubmit={onSubmit}`,
          `            style={{ ${jsxStyle(p.chatFill)} }}`,
          `          />`,
          `        </ResizableItem>`,
          `        <ResizableItem min="280px">`,
          `          {/* Replace src + files with your real artifact data (files is required: array/object props are never optional attributes on a kai-* element). */}`,
          `          <Artifact src="https://example.com" files={[{ path: 'index.html', url: 'https://example.com' }]} style={{ width: '100%', height: '100%' }} />`,
          `        </ResizableItem>`,
          `      </Resizable>`,
          // Siblings of the SPLIT — see the same line in the other JSX branch.
          companions,
        ]
      : [
          ...cardPropsNote('      '),
          `      <Chat`,
          `        messages={messages}`,
          `        loading={loading}`,
          `        suggestions={suggestions}`,
          `        suggestionMode="submit"`,
          ...cardProps('        '),
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
function renderVue(components: readonly string[], ctx: RenderCtx): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  // SCAF-9: exclude message-embedded tags from companion rendering.
  // SCAF-14: also exclude workspace structural tags (handled by the workspace block below).
  const workspace = isWorkspace(components);
  const standaloneCompanionTags = components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );
  const hasEmbedded = components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));

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

  const onSubmitBody = realStreamBody({
    pad: '    ',
    read: 'messages.value',
    commitSet: (expr) => `messages.value = ${expr};`,
    setterAdapter: '(fn) => { messages.value = fn(messages.value); }',
    setLoading: (v) => `loading.value = ${v};`,
    bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
    strictRoles: true,
    toolLoop: emitToolLoop,
    cards: ctx.emitCards,
    thread: liveThreadBinding('messages.value', '(fn) => { messages.value = fn(messages.value); }'),
    mock: isMock,
  });

  // SCAF-10: ChatMessage declaration for strict-TS Vue consumers.
  const mockInit = isMock ? mockResponderInit() : [];

  // SCAF-8: model const at module scope so onSubmit closes over it.
  const modelInit = defaultModel
    ? [
        `// SCAF-8: change this model id to another id THIS PROVIDER accepts.`,
        `const model = '${defaultModel}';`,
      ]
    : [];

  const cardsInit = ctx.emitCards ? [...cardRegistryLines(''), ``] : [];
  // Vue applies the card props in the SAME onMounted re-application the other
  // element properties go through, and NOT as a `:cardTypes.prop` template binding.
  // A registry is static — it is built once at module load and never changes — so a
  // reactive binding would buy nothing, and the one place that has to be right is
  // the post-upgrade re-apply: a property set on a not-yet-upgraded custom element
  // is dropped on upgrade.
  const cardPropAssign = ctx.emitCards
    ? [`cardTypes: cards.tags`, `cardSchemas: cards.validationSchemas`]
    : [];

  // Same scope, same reason: onSubmit puts `tools` in the request body.
  const toolsLines = emitTools ? toolSchemaLines('', ctx.cardProvider) : [];
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
        // Siblings of the SPLIT — see the same line in renderJsx.
        companions,
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
    `<!-- vue — ${ctx.label} — ${p.note}. empty-state hint: ${emptyHint} -->`,
    ...(p.altNote ?? []).map((l) => `<!-- ${l} -->`),
    `<!-- SCAF-3: pair this with the vite.config.ts in block (0) above. Without its`,
    `     isCustomElement, every kai-* tag logs "[Vue warn]: Failed to resolve`,
    `     component: kai-chat" in dev — the app still renders, but the console does`,
    `     not, and that warning is Vue asking you for exactly that config. -->`,
    `<script setup lang="ts">`,
    `import '@kitn.ai/ui/elements';  // registers <kai-*> — required, must come first`,
    ...wireImportLines({
      typed: true,
      toolLoop: emitToolLoop,
      cards: ctx.emitCards,
      cardTools: ctx.cardProvider !== null,
      mock: isMock,
    }),
    `import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    vueImports,
    ``,
    ...mockInit,
    ``,
    ...cardsInit,
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
    ...(ctx.emitCards ? CARD_PROP_COMMENT.map((l) => `  ${l}`) : []),
    `  const el = document.querySelector('kai-chat');`,
    `  if (el) Object.assign(el, { messages: messages.value, loading: loading.value, suggestions${cardPropAssign.length ? `, ${cardPropAssign.join(', ')}` : ''} });`,
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
function renderSvelte(components: readonly string[], ctx: RenderCtx): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  // SCAF-9: exclude message-embedded tags from companion rendering.
  // SCAF-14: also exclude workspace structural tags (handled by the workspace block below).
  const workspace = isWorkspace(components);
  const standaloneCompanionTags = components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );
  const hasEmbedded = components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
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

  const onSubmitBody = realStreamBody({
    pad: '    ',
    read: 'messages',
    commitSet: (expr) => `messages = ${expr};`,
    setterAdapter: '(fn) => { messages = fn(messages); }',
    setLoading: (v) => `loading = ${v};`,
    bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
    strictRoles: true,
    toolLoop: emitToolLoop,
    cards: ctx.emitCards,
    thread: liveThreadBinding('messages', '(fn) => { messages = fn(messages); }'),
    mock: isMock,
  });

  // SCAF-10: ChatMessage declaration for strict-TS Svelte consumers.
  const mockInit = isMock ? mockResponderInit('  ') : [];

  // SCAF-8: model const at script scope so onSubmit closes over it.
  const modelInit = defaultModel
    ? [
        `  // SCAF-8: change this model id to another id THIS PROVIDER accepts.`,
        `  const model = '${defaultModel}';`,
      ]
    : [];

  const cardsInit = ctx.emitCards ? cardRegistryLines('  ') : [];
  // Applied in the same upgrade-gated $effect as messages/loading/suggestions, for
  // the same reason: a property set on a not-yet-upgraded custom element is dropped
  // on upgrade. `cards` never changes, so re-running the effect re-applies the same
  // two references and does nothing.
  const cardPropEffect = ctx.emitCards
    ? ` chatEl.cardTypes = cards.tags; chatEl.cardSchemas = cards.validationSchemas;`
    : '';

  // Same scope, same reason: onSubmit puts `tools` in the request body.
  const toolsLines = emitTools ? toolSchemaLines('  ', ctx.cardProvider) : [];
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
        // Siblings of the SPLIT — see the same line in renderJsx.
        companionLines,
      ]
    : [
        `  <kai-chat bind:this={chatEl} suggestion-mode="submit" style="${p.chatFill}" onkai-submit={onSubmit}></kai-chat>`,
        companionLines,
      ];

  return [
    `<!-- svelte — ${ctx.label} — ${p.note}. empty-state hint: ${emptyHint} -->`,
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
    ...wireImportLines({
      pad: '  ',
      typed: true,
      toolLoop: emitToolLoop,
      cards: ctx.emitCards,
      cardTools: ctx.cardProvider !== null,
      mock: isMock,
    }),
    `  import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    `  import { onMount } from 'svelte';`,
    ...mockInit,
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
    ...cardsInit,
    ...toolsLines,
    ...runnerLines,
    `  // suggestions/messages are JS PROPERTIES (arrays/objects can't be attributes)`,
    ...(ctx.emitCards ? CARD_PROP_COMMENT.map((l) => `  ${l}`) : []),
    `  $effect(() => {`,
    `    if (chatEl && defined) { chatEl.messages = messages; chatEl.loading = loading; chatEl.suggestions = suggestions;${cardPropEffect} }`,
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
 * After scaffolding, install what block (3) lists — `@kitn.ai/ui` plus whatever
 * the chosen integration's route imports, which this renderer cannot know and so
 * no longer guesses — then drop this file into `src/routes/chat.tsx`. Start the
 * dev server with `npm run dev` (port 3000).
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
function renderTanstackStart(components: readonly string[], ctx: RenderCtx): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  // TanStack Start is React — reuse all the React composition logic:
  // same ChatMessage type, same state/loading/suggestions, same mock stream body,
  // same real-backend SSE streaming. The ONLY delta from plain `react` is:
  //   1. `import { createFileRoute } from '@tanstack/react-router'` instead of no-op router import
  //   2. `export const Route = createFileRoute('/chat')({ ssr: false, component: ChatPage })`
  //   3. The page function is named `ChatPage` (not `App`) — no export-default clash with createFileRoute
  //   4. No `import '@kitn.ai/ui/elements'` needed as a top-level import (same as next's dynamic approach
  //      is not needed here — the library is SSR-import-safe, but we include elements for safety)

  const hasEmbedded = components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
  const workspace = isWorkspace(components);

  const renderableTags = components.filter((t) => !MESSAGE_EMBEDDED_TAGS.has(t));
  const importTags = workspace
    ? [...new Set([...renderableTags.filter((t) => t !== 'kai-resizable'), 'kai-resizable', 'kai-resizable-item'])]
    : renderableTags;
  const wrapperNames = importTags.map(toPascalCase);
  const importList = wrapperNames.join(', ');

  const standaloneCompanionTags = components.filter(
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

  const mockInit = isMock ? mockResponderInit() : [];

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
    ? `  // SCAF-8: change this model id to another id THIS PROVIDER accepts.\n  const model = '${defaultModel}';`
    : '';

  const toolsInit = emitTools ? toolSchemaLines('  ', ctx.cardProvider).join('\n') : '';
  const toolRunner = emitToolLoop ? toolRunnerLines('  ', true).join('\n') : '';
  // Module scope: static data, so it is not rebuilt on every render (see renderJsx).
  const cardsInit = ctx.emitCards ? cardRegistryLines('') : [];
  const cardProps = (pad: string): string[] =>
    ctx.emitCards
      ? [`${pad}cardTypes={cards.tags}`, `${pad}cardSchemas={cards.validationSchemas}`]
      : [];
  const cardPropsNote = (pad: string): string[] =>
    ctx.emitCards ? jsxComment(CARD_PROP_COMMENT, pad) : [];

  const onSubmitBody = realStreamBody({
    pad: '    ',
    read: 'messages',
    commitSet: (expr) => `setMessages(${expr});`,
    // useState's setter IS a SetMessages: both are (updater) => void.
    setterAdapter: 'setMessages',
    setLoading: (v) => `setLoading(${v});`,
    bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
    strictRoles: true,
    toolLoop: emitToolLoop,
    cards: ctx.emitCards,
    thread: REACT_THREAD,
    mock: isMock,
  });

  // File path guidance for TanStack Start (file-based routing)
  const filePathNote = [
    `// TanStack Start route file — save as: src/routes/chat.tsx`,
    `// Scaffold command: npx @tanstack/cli@latest create <app-name> --framework react --no-git --package-manager npm -y`,
    // NOT "npm install @kitn.ai/ui". This block is emitted for every integration,
    // so a fixed package list here is wrong for the eight of them whose route
    // imports something else — and it silently WAS, for langgraph and mastra.
    // Block (3) builds the line from the integration's own `deps`.
    `// Then: install the packages block (3) lists.`,
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
    ...wireImportLines({
      typed: true,
      toolLoop: emitToolLoop,
      setMessagesType: emitToolLoop,
      cards: ctx.emitCards,
      cardTools: ctx.cardProvider !== null,
      mock: isMock,
    }),
    `import '@kitn.ai/ui/theme.tokens.css'  // compiled token defaults`,
    ``,
    `// ${ctx.label} — ${p.note}. empty-state hint: ${emptyHint}`,
    ...(p.altNote ?? []).map((l) => `// ${l}`),
    ...mockInit,
    ``,
    ...cardsInit,
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
          ...cardPropsNote('          '),
          `          <Chat`,
          `            messages={messages}`,
          `            loading={loading}`,
          `            suggestions={suggestions}`,
          `            suggestionMode="submit"`,
          ...cardProps('            '),
          `            onSubmit={onSubmit}`,
          `            style={{ ${jsxStyle(p.chatFill)} }}`,
          `          />`,
          `        </ResizableItem>`,
          `        <ResizableItem min="280px">`,
          `          {/* Replace src + files with your real artifact data (files is required: array/object props are never optional attributes on a kai-* element). */}`,
          `          <Artifact src="https://example.com" files={[{ path: 'index.html', url: 'https://example.com' }]} style={{ width: '100%', height: '100%' }} />`,
          `        </ResizableItem>`,
          `      </Resizable>`,
          // Siblings of the SPLIT — see the same line in the other JSX branch.
          companions,
        ]
      : [
          ...cardPropsNote('      '),
          `      <Chat`,
          `        messages={messages}`,
          `        loading={loading}`,
          `        suggestions={suggestions}`,
          `        suggestionMode="submit"`,
          ...cardProps('        '),
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
function renderAngular(components: readonly string[], ctx: RenderCtx): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  const workspace = isWorkspace(components);
  const standaloneCompanionTags = components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );
  const hasEmbedded = components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
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

  const onSubmitBody = realStreamBody({
    pad: '    ',
    read,
    commitSet: (expr) => commit(expr),
    setterAdapter: setter,
    setLoading: (v) => `this.loading.set(${v});`,
    bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
    strictRoles: true,
    toolLoop: emitToolLoop,
    cards: ctx.emitCards,
    thread: accessorThreadBinding(read, commit, setter),
    mock: isMock,
  });

  // Module scope, exactly like vue: a class can hold neither a bare `const` nor a
  // `function` declaration, and the methods below close over all three.
  const modelInit = defaultModel
    ? [
        `// SCAF-8: change this model id to another id THIS PROVIDER accepts.`,
        `const model = '${defaultModel}';`,
        ``,
      ]
    : [];
  const cardsInit = ctx.emitCards ? [...cardRegistryLines(''), ``] : [];
  const toolsLines = emitTools ? [...toolSchemaLines('', ctx.cardProvider), ``] : [];
  const runnerLines = emitToolLoop ? [...toolRunnerLines('', true), ``] : [];
  // Set in the SAME afterNextRender re-application as messages/loading/suggestions,
  // not as a `[cardTypes]` template binding. Two reasons, and the second is the
  // load-bearing one: a registry is static, so a binding buys nothing; and an
  // Angular template can only read CLASS members, so a template binding would need
  // the module-scope `cards` restated as a field. The re-apply is also the point
  // that matters — a property set on a not-yet-upgraded custom element is dropped.
  const cardPropAssign = ctx.emitCards
    ? [
        ...CARD_PROP_COMMENT.map((l) => `        ${l}`),
        `        cardTypes: cards.tags,`,
        `        cardSchemas: cards.validationSchemas,`,
      ]
    : [];

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
        // Siblings of the SPLIT — see the same line in renderJsx.
        ...companionLines,
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
    ...wireImportLines({
      typed: true,
      toolLoop: emitToolLoop,
      cards: ctx.emitCards,
      cardTools: ctx.cardProvider !== null,
      mock: isMock,
    }),
    ``,
    `// ${ctx.label} — ${p.note}. empty-state hint: ${emptyHint}`,
    ...(p.altNote ?? []).map((l) => `// ${l}`),
    ...(isMock ? mockResponderInit() : []),
    ``,
    ...modelInit,
    ...cardsInit,
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
    ...cardPropAssign,
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
 *   1. The thread renders exactly what `renderPart` renders, so `renderPart` has
 *      to carry a branch for EVERY variant of `MessagePart`. `<kai-chat>` owns
 *      that switch internally; a hand-composed tree that only handles `text`
 *      shows nothing when a reasoning or tool part streams in. A missing branch
 *      is not a type error — a `<Switch>` with fewer `<Match>`es compiles fine —
 *      it is a part that arrives in the data and renders nothing, which is how
 *      `card` and `source` were silently dropped here while this very paragraph
 *      claimed otherwise. `solidPartCoverageCheck` in
 *      scripts/verify-scaffold-compiles.mjs now derives the variant list from
 *      the `MessagePart` union and fails the build when one has no branch. The
 *      part renderer is emitted for EVERY archetype, not just the agentic one —
 *      the stream can produce any variant regardless of which components the
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
function renderSolid(components: readonly string[], ctx: RenderCtx): string {
  const { p, emptyHint, suggestions, isMock, defaultModel, emitTools, emitToolLoop } = ctx;

  const workspace = isWorkspace(components);
  const standaloneCompanionTags = components.filter(
    (t) => t !== 'kai-chat' && !MESSAGE_EMBEDDED_TAGS.has(t) && !WORKSPACE_STRUCTURAL_TAGS.has(t),
  );
  const hasSources = standaloneCompanionTags.includes('kai-sources');
  const hasVoice = standaloneCompanionTags.includes('kai-voice-input');

  // Every name here is referenced by the emitted tree below — `noUnusedLocals` is
  // on in a stock Solid app (`npm run build` runs `tsc` first), so an extra one
  // is a build failure.
  //
  // The unconditional block is what `renderPart` needs, and it is unconditional
  // because `renderPart` is: the stream can produce any MessagePart variant no
  // matter which components the archetype named. `Source*` in particular is NOT
  // gated on `hasSources` — that flag only decides whether the archetype also
  // gets a standalone sample source list, while `source` PARTS arrive from any
  // model that cites.
  const componentImports = [
    'Attachment',
    'AttachmentInfo',
    'AttachmentPreview',
    'Attachments',
    'Button',
    'CardRenderer',
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
    'Source',
    'SourceContent',
    'SourceList',
    'SourceTrigger',
    'Tool',
    ...(workspace ? ['Artifact', 'ResizableHandle', 'ResizablePanel', 'ResizablePanelGroup'] : []),
    ...(hasVoice ? ['VoiceInput'] : []),
  ].sort();

  // Solid signals: `messages()` reads, `setMessages(next)` writes a NEW array.
  const read = 'messages()';
  const commit = (value: string) => `setMessages(${value});`;
  // Solid's own Setter is overloaded (and treats a function argument as an
  // updater), so it is wrapped rather than handed over directly — the wrapper is
  // exactly the `SetMessages` shape createAssistantStream wants.
  const setter = '(fn) => setMessages((prev) => fn(prev))';

  const onSubmitBody = realStreamBody({
    pad: '    ',
    read,
    commitSet: (expr) => commit(expr),
    setterAdapter: setter,
    setLoading: (v) => `setLoading(${v});`,
    bodyPayload: realBodyPayload({ defaultModel, tools: emitTools }),
    strictRoles: true,
    toolLoop: emitToolLoop,
    cards: ctx.emitCards,
    thread: accessorThreadBinding(read, commit, setter),
    valueSource: 'input()',
    afterValue: [`setInput('');`],
    mock: isMock,
  });

  const modelInit = defaultModel
    ? [
        `  // SCAF-8: change this model id to another id THIS PROVIDER accepts.`,
        `  const model = '${defaultModel}';`,
      ]
    : [];
  // MODULE scope in this target and not merely by convention: `renderPart` is a
  // top-level function (it has to be — <Index> calls it per row), and it is what
  // hands the registry to <CardRenderer>. A const inside App() would be invisible
  // to it.
  const cardsInit = ctx.emitCards ? [...cardRegistryLines(''), ``] : [];
  const toolsLines = emitTools ? toolSchemaLines('  ', ctx.cardProvider) : [];
  const runnerLines = emitToolLoop ? toolRunnerLines('  ', true) : [];
  // Solid renders the components directly, so the props go on <CardRenderer>
  // itself rather than on <kai-chat>: `types` is the Solid-component half of
  // `cardTypes` (a component, not a tag name) and `schemas` is `cardSchemas`.
  const cardRendererProps = ctx.emitCards
    ? [
        `            types={cards.components}`,
        `            schemas={cards.validationSchemas}`,
      ]
    : [];

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
      `        {/* Keyed by message id (see messageKeys), so a delta updates the row`,
      `            instead of replacing it. */}`,
      `        <For each={messageKeys()}>`,
      `          {(_id, i) => (`,
      `            // The row reads its message through <For>'s index accessor, never`,
      `            // through a captured value: it outlives the delta that replaced its`,
      `            // object, so every read below has to go through m(). <Show> supplies`,
      `            // the non-null accessor and covers the frame where a removal has`,
      `            // shortened the array.`,
      `            <Show when={messages()[i()]}>`,
      `              {(m) => (`,
      `                <Message class={\`mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 \${m().role === 'user' ? 'items-end' : 'items-start'}\`}>`,
      `                  {/* <Index>, not <For>, INSIDE a message. The state folds only`,
      `                      ever append a part or patch one in place — they never`,
      `                      reorder — so a part's POSITION is a stable identity, and`,
      `                      <Index> hands each row its part as a SIGNAL so the row stays`,
      `                      mounted while its content grows. (Position is not a valid`,
      `                      key for the message list above it, which the host splices.) */}`,
      `                  {/* renderPart also takes the part's INDEX and the array it came`,
      `                      from: consecutive source/file parts render as one row, so a`,
      `                      branch has to be able to see its neighbours. \`() => m().parts\``,
      `                      stays an accessor for the same reason \`part\` does. */}`,
      `                  <Index each={m().parts}>`,
      `                    {(part, pi) => renderPart(part, pi, () => m().parts, m().role)}`,
      `                  </Index>`,
      `                </Message>`,
      `              )}`,
      `            </Show>`,
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
    `import { For, Index, Match, Show, Switch, createMemo, createSignal } from 'solid-js';`,
    `import {`,
    ...componentImports.map((n) => `  ${n},`),
    `} from '@kitn.ai/ui';`,
    `// The kit's own types, from the same entry the components come from.`,
    `import type { ChatMessage, MessagePart, MessageSource } from '@kitn.ai/ui';`,
    ...wireImportLines({
      typed: false,
      toolLoop: emitToolLoop,
      cards: ctx.emitCards,
      cardTools: ctx.cardProvider !== null,
      mock: isMock,
    }),
    ``,
    `// ${ctx.label} — ${p.note}. empty-state hint: ${emptyHint}`,
    ...(p.altNote ?? []).map((l) => `// ${l}`),
    ``,
    ...(isMock ? [...mockResponderInit(), ``] : []),
    ...cardsInit,
    `// Narrow a part to ONE variant, or false. One read, one cast — and the JSX`,
    `// below re-runs it on every delta, which is what keeps a growing text or`,
    `// reasoning block updating while its row stays put.`,
    `function partAs<T extends MessagePart['type']>(`,
    `  part: MessagePart,`,
    `  type: T,`,
    `): Extract<MessagePart, { type: T }> | false {`,
    `  return part.type === type ? (part as Extract<MessagePart, { type: T }>) : false;`,
    `}`,
    ``,
    `// Two part kinds render as a RUN rather than one row each: the N citations one`,
    `// search produced are ONE wrapped row, and consecutive attachments share one`,
    `// attachment row. This returns the whole run when \`index\` is where it STARTS`,
    `// and false at every later member of it, so a run renders exactly once and`,
    `// stays exactly where it sat in \`parts\`.`,
    `function runAt<T extends MessagePart['type']>(`,
    `  parts: MessagePart[],`,
    `  index: number,`,
    `  type: T,`,
    `): Extract<MessagePart, { type: T }>[] | false {`,
    `  if (index > 0 && parts[index - 1].type === type) return false;`,
    `  const run: Extract<MessagePart, { type: T }>[] = [];`,
    `  for (let i = index; i < parts.length && parts[i].type === type; i += 1) {`,
    `    run.push(parts[i] as Extract<MessagePart, { type: T }>);`,
    `  }`,
    `  return run.length > 0 && run;`,
    `}`,
    ``,
    `// The citation chip's label: the model's own number when it numbered its`,
    `// citations, otherwise nothing so SourceTrigger falls back to the domain. A`,
    `// source with no url has no domain to fall back to, so its title stands in`,
    `// rather than rendering an empty chip.`,
    `function citationLabel(s: MessageSource): string | number | undefined {`,
    `  if (s.index !== undefined) return s.index;`,
    `  if (s.url) return undefined;`,
    `  return s.title || 'Source';`,
    `}`,
    ``,
    `// EVERY variant of MessagePart, in thread order: text, reasoning, tool, card,`,
    `// source, file. <kai-chat> owns that switch internally for the element-based`,
    `// targets; composing from the SolidJS layer moves it here, so the thread`,
    `// renders exactly what this function renders and a branch that is missing is a`,
    `// part that arrives in the data and renders NOTHING. The compiler cannot help`,
    `// — a <Switch> with fewer <Match>es is valid code — so the kit's`,
    `// verify-scaffold-compiles gate derives the variant list from the MessagePart`,
    `// union and fails when one has no branch here.`,
    `//`,
    `// Branch for branch this is what the kit's own message renderer does (the one`,
    `// behind <kai-chat>), runs included: consecutive \`source\` parts collapse into`,
    `// ONE citation row and consecutive \`file\` parts into one attachment row, and`,
    `// the citation row is a SIBLING of the text bubble rather than a child of it.`,
    `// The one thing deliberately NOT copied over is the bubble's own padding and`,
    `// radius — styling, and yours to change.`,
    ...(ctx.emitCards
      ? [
          `// The card branch DOES carry the registry through: \`types\` is the`,
          `// Solid-component half of <kai-chat>'s \`cardTypes\` (a component, not a tag`,
          `// name) and \`schemas\` is its \`cardSchemas\`.`,
        ]
      : []),
    `//`,
    `// \`part\` is an ACCESSOR, not a value. The <Index> that calls this keeps each`,
    `// row MOUNTED while the message streams, so the row outlives the delta that`,
    `// replaced its part object: every read has to go through part() for the new`,
    `// content to reach the DOM. Capturing part() once freezes the row at its first`,
    `// delta — a panel that stays open but stops updating. \`index\` and \`parts\` are`,
    `// what let the source/file branches see their neighbours.`,
    `function renderPart(`,
    `  part: () => MessagePart,`,
    `  index: number,`,
    `  parts: () => MessagePart[],`,
    `  role: ChatMessage['role'],`,
    `) {`,
    `  return (`,
    `    // Nothing reaches this fallback today: MessagePart is a closed union and`,
    `    // every variant of it has a branch below. It is where a variant ADDED to`,
    `    // the union after this file was generated would land.`,
    `    <Switch fallback={null}>`,
    `      <Match when={partAs(part(), 'text')}>`,
    `        {(p) =>`,
    `          role === 'user' ? (`,
    `            <MessageContent class="bg-muted text-primary max-w-[85%] rounded-3xl px-5 py-2.5">`,
    `              {p().text}`,
    `            </MessageContent>`,
    `          ) : (`,
    `            <MessageContent markdown class="text-foreground prose flex-1 rounded-lg bg-transparent p-0">`,
    `              {p().text}`,
    `            </MessageContent>`,
    `          )`,
    `        }`,
    `      </Match>`,
    `      <Match when={partAs(part(), 'reasoning')}>`,
    `        {(p) => (`,
    `          // A reasoning part with NO text is a round-trip carrier, not something`,
    `          // to show: Anthropic's redacted_thinking blocks carry an opaque blob`,
    `          // with no readable text, and the encoder needs them kept in \`parts\`,`,
    `          // in order. Render one and you get a blank disclosure.`,
    `          <Show when={p().text !== ''}>`,
    `            <Reasoning class="w-full">`,
    `              <ReasoningTrigger>{p().label ?? 'Reasoning'}</ReasoningTrigger>`,
    `              <ReasoningContent markdown>{p().text}</ReasoningContent>`,
    `            </Reasoning>`,
    `          </Show>`,
    `        )}`,
    `      </Match>`,
    `      <Match when={partAs(part(), 'tool')}>`,
    `        {(p) => <Tool toolPart={p().tool} />}`,
    `      </Match>`,
    `      <Match when={partAs(part(), 'card')}>`,
    `        {(p) => (`,
    `          // Generative-UI cards. An envelope whose type is not registered gets`,
    `          // the built-in fallback card, so an unknown card is visible rather`,
    `          // than absent; register your own components on the card registry.`,
    ...(ctx.emitCards
      ? [
          `          <CardRenderer`,
          `            envelope={p().envelope}`,
          ...cardRendererProps,
          `          />`,
        ]
      : [`          <CardRenderer envelope={p().envelope} />`]),
    `        )}`,
    `      </Match>`,
    `      <Match when={partAs(part(), 'source')}>`,
    `        {/* ONE citation row per RUN, and a SIBLING of the bubble rather than a`,
    `            child of it: a citation rendered inside the prose is indistinguishable`,
    `            from a link the model typed itself. part="citations" is the same`,
    `            ::part name the kai-chat element exposes, so a stylesheet written`,
    `            against one target works against the other. */}`,
    `        <Show when={runAt(parts(), index, 'source')}>`,
    `          {(run) => (`,
    `            <SourceList part="citations" class={role === 'user' ? 'justify-end' : undefined}>`,
    `              {/* Reference-keyed <For> is right HERE: the run's part objects are`,
    `                  carried over untouched by the state folds. */}`,
    `              <For each={run()}>`,
    `                {(sp) => (`,
    `                  <Source href={sp.source.url}>`,
    `                    <SourceTrigger label={citationLabel(sp.source)} />`,
    `                    <SourceContent`,
    `                      title={sp.source.title ?? sp.source.url ?? 'Source'}`,
    `                      description={sp.source.snippet ?? ''}`,
    `                    />`,
    `                  </Source>`,
    `                )}`,
    `              </For>`,
    `            </SourceList>`,
    `          )}`,
    `        </Show>`,
    `      </Match>`,
    `      <Match when={partAs(part(), 'file')}>`,
    `        {/* Same run-collapse as citations: consecutive attachments share one`,
    `            row instead of each opening its own. */}`,
    `        <Show when={runAt(parts(), index, 'file')}>`,
    `          {(run) => (`,
    `            <Attachments variant="inline" class={role === 'user' ? 'mb-2 justify-end' : 'mb-2'}>`,
    `              <For each={run()}>`,
    `                {(fp) => (`,
    `                  <Attachment data={fp.attachment}>`,
    `                    <AttachmentPreview />`,
    `                    <AttachmentInfo />`,
    `                  </Attachment>`,
    `                )}`,
    `              </For>`,
    `            </Attachments>`,
    `          )}`,
    `        </Show>`,
    `      </Match>`,
    `    </Switch>`,
    `  );`,
    `}`,
    ``,
    `export default function App() {`,
    `  // Each write assigns a NEW array, and createAssistantStream rebuilds the`,
    `  // streaming message as a NEW OBJECT on every delta: a new reference IS the`,
    `  // re-render signal. Which is exactly why the thread below is keyed by message`,
    `  // id rather than by the message objects — see messageKeys.`,
    `  const [messages, setMessages] = createSignal<ChatMessage[]>([]);`,
    `  const [loading, setLoading] = createSignal(false);`,
    `  // PromptInput is CONTROLLED here, so this signal — not a kai-submit event — is`,
    `  // where the submitted text comes from.`,
    `  const [input, setInput] = createSignal('');`,
    `  // THE MESSAGE LIST'S KEY. <For> is REFERENCE-keyed, so keying it on the`,
    `  // message objects makes every streaming delta look like an entirely new list`,
    `  // and tears the whole row down — taking with it everything the user did`,
    `  // inside it (expanding a tool or reasoning panel mid-stream would silently do`,
    `  // nothing: the disclosure opens and the next token discards it). Ids are`,
    `  // stable across the object churn, so <For> over this array diffs by string`,
    `  // value, no row moves, and the content updates through accessors instead.`,
    `  const messageKeys = createMemo(() => messages().map((m) => m.id));`,
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

/**
 * A human label for a components list, for the emitted banner comment.
 *
 * Derived, never passed in — see `RenderCtx.label`. `kai-chat` is dropped because
 * every surface has it, so naming it in every banner says nothing; a surface that
 * is ONLY the chat says so.
 */
function surfaceLabel(components: readonly string[]): string {
  const rest = components.filter((c) => c !== 'kai-chat');
  if (rest.length === 0) return 'chat';
  return `chat + ${rest.map((c) => c.replace(/^kai-/, '')).join(' + ')}`;
}

/** What `renderSurface` needs to emit one chat surface. */
export interface SurfaceRequest {
  /** html | react | next | vue | svelte | angular | solid | tanstack-start */
  framework: string;
  /**
   * The `kai-*` components this surface composes — THE AXIS, not an archetype id.
   *
   * A list rather than a preset name is the whole point of this function. The six
   * archetypes are six points in this space and the CLI's feature multi-select
   * reaches the rest of it, so a renderer keyed on a preset id could only ever
   * emit what someone had already thought to name. `kai-chat` is expected to be
   * present; everything else is a capability.
   */
  components: readonly string[];
  /** The backend this surface talks to. `mock` takes the no-backend branch. */
  integration: Integration;
  /** full-page | side | docked-widget | inline. Defaults to full-page. */
  placement?: string;
  /** Starter prompts for the empty thread. Defaults to `DEFAULT_SUGGESTIONS`. */
  suggestions?: string[];
  /** Audience hint — tweaks the empty-state comment only. */
  audience?: string;
}

/**
 * THE ONE RENDERER. Emits the front-end block for a chat surface.
 *
 * Shared by the `kai` MCP (via `compose`, which wraps it in the backend route and
 * the run note) and, by design, by `create-kai`. There is deliberately no second
 * entry point keyed on an archetype: `compose` resolves a preset to its
 * `components` and calls this, so a preset is DATA over this function rather than
 * a parallel path through it. `assertPresetsAreData` in
 * scripts/verify-scaffold-compiles.mjs holds that open by requiring the two
 * request shapes to emit byte-identical surfaces.
 *
 * It takes the `integration` rather than the six booleans it derives from it,
 * because those derivations ARE the contract between the surface and the wire —
 * whether a tools array is forwarded, whether there is a backend to POST a second
 * round to, which envelope a card tool takes — and a caller that computed them
 * itself would be free to compute them differently. `create-kai` gets them right
 * by not being asked.
 */
export function renderSurface(req: SurfaceRequest): string {
  const { framework, components, integration } = req;
  const placement = req.placement || 'full-page';
  const suggestions = req.suggestions?.length ? req.suggestions : DEFAULT_SUGGESTIONS;
  const emptyHint = req.audience
    ? `tuned for ${req.audience} — keep the empty state and tone audience-appropriate`
    : 'add an empty-state prompt that fits your product';

  const isMock = integration.id === 'mock';
  // SCAF-8: compute the default model only for non-mock integrations that forward model.
  const defaultModel = isMock ? undefined : defaultModelFor(integration);
  const emitTools = !isMock && emitsToolSchemas(components, integration);
  // The loop needs a backend to POST the second round to; `mock` has none.
  // It does NOT require `emitTools`: an integration that builds its tools
  // server-side (langgraph, mastra, pi) still streams tool calls back, and the
  // loop that answers them is the same loop.
  const emitToolLoop = !isMock && hasToolPanel(components);
  // Cards need a MODEL to ask for one, so `mock` (which streams a canned reply in
  // the browser and never sees a tool call) is out for the same reason the loop is.
  const emitCards = !isMock && bearsCards(components);
  // Only shape card tools when the array is really forwarded AND we know which
  // envelope this route's provider takes. Either half missing means the registry
  // is still wired to the client (cardTypes/cardSchemas) while the model is not
  // offered a card tool — which is the honest state for langgraph/mastra/pi, whose
  // routes own their tool list server-side.
  // `assertCardToolFormat`, not `cardToolProviderFor`: reaching here with both
  // flags true means a tools array IS going into the request body, so an
  // undeclared envelope is a scaffold that silently ships no card tool. Fail
  // loudly instead. (`cardEmitPlan` keeps returning null for the same case on
  // purpose — it is a planning function the guards read, and its job is to let
  // them report the gap in their own words rather than blow up first.)
  const cardProvider = emitCards && emitTools ? assertCardToolFormat(integration) : null;

  const ctx: RenderCtx = {
    p: placementStyle(placement),
    emptyHint,
    suggestions,
    label: surfaceLabel(components),
    isMock,
    defaultModel,
    emitTools,
    emitToolLoop,
    emitCards,
    cardProvider,
  };
  switch (framework) {
    case 'react':
    case 'next':
      return renderJsx(components, ctx, framework);
    case 'vue':
      return renderVue(components, ctx);
    case 'svelte':
      return renderSvelte(components, ctx);
    case 'angular':
      return renderAngular(components, ctx);
    case 'solid':
      return renderSolid(components, ctx);
    case 'tanstack-start':
      return renderTanstackStart(components, ctx);
    case 'html':
    default:
      // html, and any backend-only framework (fastapi/express/worker) gets the
      // framework-agnostic web-components surface. The Vite/tsc setup note
      // (SCAF-19) only applies to the actual `html` target — the backend-only
      // frameworks aren't paired with a `tsc && vite build` script.
      return renderHtml(components, ctx, framework === 'html');
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
  // NOT a bare `vue()`. This one-liner and block (0) configure the same file, and
  // a consumer who pastes this over that silently drops `isCustomElement`, at
  // which point every kai-* tag stops resolving and the page renders empty.
  vue: viteMiddlewareAdapter('vue({ /* keep the template.compilerOptions from block (0) */ })'),
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
    // Led by the option `keyExposure` unlocks, where there is one. The generic
    // note below tells a static page to "run this route on a separate server",
    // which for ollama is work nobody has to do: its route holds no credential
    // and reaches localhost, so the page can call it. That advice was emitted
    // identically for every integration because nothing read the flag that
    // distinguishes them.
    ...(integration.keyExposure === 'frontend-safe'
      ? [
          `#   • or drop the route entirely: this integration needs no server hop — see the`,
          `#     run note — so the page may call it directly (CORS applies).`,
        ]
      : []),
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

// ── block (0): setup a framework REQUIRES before block (1) runs at all ────────

/**
 * SCAF-3, promoted from a comment to a step.
 *
 * The placement was the defect. This used to be an HTML comment sitting ABOVE the
 * `<script setup>` block, and block (1) is a `<script setup>` + `<template>` pair:
 * an agent or a developer copying "the component" copies that pair, and the one
 * thing that configures it is not inside it. As its own labelled block, ordered
 * first, it cannot be lost to that copy.
 *
 * WHAT IT ACTUALLY DOES, measured rather than assumed. On Vue 3.5.39, skipping it
 * does NOT blank the page: Vue falls back to rendering the unresolved tag as a
 * native element, and its runtime sets `key in el` bindings as DOM properties, so
 * a scaffold built from this output still runs — verified in a stock `vue-ts` app
 * in dev AND in a production build, with and without the `.prop` modifiers, and
 * the mock reply streamed in every time. What you get instead is
 *
 *   [Vue warn]: Failed to resolve component: kai-chat
 *
 * on every kai-* tag in development, which reads like a bug and is the exact
 * warning Vue tells you to fix with `compilerOptions.isCustomElement`.
 *
 * So the emitted copy says that, and does not claim a blank page it cannot
 * produce. Overstating it would be worse than the buried comment was: the first
 * developer to skip the step and find their app working stops believing the rest
 * of the scaffold.
 *
 * The whole file is emitted rather than a fragment because the plugin list is
 * where this collides with block (2): a Vite SPA's dev API route adds
 * `chatApiPlugin()` to the SAME array, and a consumer who pastes one config over
 * the other silently loses whichever came first. The emitted comment says so.
 */
function setupBlock(framework: string): string | undefined {
  if (framework !== 'vue') return undefined;
  return [
    `=== (0) REQUIRED SETUP — do this FIRST ===`,
    ``,
    `// vite.config.ts`,
    `//`,
    `// Tell Vue that kai-* tags are CUSTOM ELEMENTS rather than Vue components.`,
    `// This is its own step, not a note inside block (1), because block (1) is a`,
    `// <script setup> + <template> pair and this configures it from outside — copy`,
    `// just the component and you never see it.`,
    `//`,
    `// Without it, every kai-* tag logs this in development:`,
    `//   [Vue warn]: Failed to resolve component: kai-chat`,
    `//   If this is a native custom element, make sure to exclude it from component`,
    `//   resolution via compilerOptions.isCustomElement.`,
    `// The app does still render — Vue falls back to a native element — so this is`,
    `// a warning to remove, not a crash to avoid. Removing it is the point: it is`,
    `// the fix Vue's own message asks for, and it stops the console reading like`,
    `// something is broken.`,
    `import vue from '@vitejs/plugin-vue';`,
    `import { defineConfig } from 'vite';`,
    ``,
    `export default defineConfig({`,
    `  plugins: [`,
    `    vue({`,
    `      template: {`,
    `        compilerOptions: {`,
    `          // Every kai-* tag is a custom element, not a Vue component.`,
    `          isCustomElement: (tag) => tag.startsWith('kai-'),`,
    `        },`,
    `      },`,
    `    }),`,
    `    // If you also add the dev API route from block (2), its chatApiPlugin() goes`,
    `    // in THIS array — do not replace this file with the one-liner shown there.`,
    `  ],`,
    `});`,
  ].join('\n');
}

// ── block (3): what to install, and where the key may live ───────────────────

/**
 * The install command, DERIVED from the catalog's `deps`.
 *
 * `deps` was declared by all eleven integrations and consumed by nothing: the
 * schema typed it, `registry.test.ts` checked its SHAPE, and the fact a developer
 * actually needs — which packages to install — lived a SECOND time as prose in
 * each integration's `runNote`. Two copies of one fact drift silently, and both
 * copies already had: langgraph's prose named three packages where `deps.npm`
 * carries four (it never mentioned `zod`, which its route imports and its app
 * therefore fails to build without), and pydantic-ai's named three where
 * `deps.pip` carries four (it never mentioned `pydantic`, which its route
 * imports). Nothing could catch either, because nothing compared them.
 *
 * So the prose is gone and this is the only place the scaffold names a package.
 * `registry.test.ts` pins `deps.npm` to the imports of the route's own source, so
 * the line below cannot drift from the code printed above it either.
 *
 * `@kitn.ai/ui` leads and is deliberately in no integration's `deps`: it is the
 * kit, a dependency of every scaffold whatever the backend, so declaring it
 * per-integration would be eleven copies of one constant.
 *
 * Only what the emitted CODE imports is listed. The host a route runs on (Express,
 * an Angular SSR server, a Vite dev server) comes from the app template the
 * developer created, not from here.
 */
function installLines(integration: Integration): string[] {
  const lines = [
    `Install:`,
    `  npm install ${['@kitn.ai/ui', ...integration.deps.npm].join(' ')}`,
  ];
  if (integration.deps.pip.length > 0) {
    lines.push(
      `  # ...and block (2) is Python — a separate service, with its own install:`,
      `  pip install ${integration.deps.pip.join(' ')}`,
    );
  }
  return lines;
}

/**
 * The two halves of the proxy decision, as the exact strings the emitted run note
 * carries. Exported so the guards in scaffold.test.ts can look for the claim the
 * scaffold really makes instead of restating it — a copied string is a guard that
 * goes green the day the wording changes.
 */
export const PROXY_REQUIRED_CLAIM = 'a server hop is REQUIRED';
export const NO_PROXY_CLAIM = 'no server hop is required';

/**
 * Where this integration's key may live, DERIVED from the catalog's `keyExposure`.
 *
 * This is the field's whole point of existence (see `KeyExposure` in types.ts) and
 * until now nothing read it, which meant every one of the eleven values could have
 * been wrong with every test still green.
 *
 * `'frontend-safe'` is tested POSITIVELY and everything else — including an absent
 * flag, which the type still permits — falls through to the proxy branch. That
 * asymmetry is the safety property: declaring a proxy where none was needed costs
 * a server hop, and reading a missing flag as "safe" costs the key.
 */
function keyHandlingLines(integration: Integration, route: RouteChoice | undefined): string[] {
  if (integration.keyExposure === 'frontend-safe') {
    return [
      `Key handling: frontend-safe — ${NO_PROXY_CLAIM}.`,
      `  Nothing here is secret and nothing needs a capability a browser lacks, so the`,
      `  page may talk to this integration itself.`,
      ...(route
        ? [
            `  The route in block (2) is a convenience — one origin, one place to log — and`,
            `  not a requirement.`,
          ]
        : []),
    ];
  }

  // Named rather than described: "OPENAI_API_KEY stays on the server" is a
  // sentence a developer can act on. `SECRET_ENV_VAR` is the schema's own pattern,
  // imported rather than restated, so this list and the refinement that rejects a
  // false `frontend-safe` cannot disagree about what counts as a secret.
  const secrets = integration.envVars.filter((name) => SECRET_ENV_VAR.test(name));
  return [
    `Key handling: needs-proxy — ${PROXY_REQUIRED_CLAIM}.`,
    ...(secrets.length > 0
      ? [
          `  ${secrets.join(' and ')} ${secrets.length > 1 ? 'stay' : 'stays'} on the server: the front end POSTs to`,
          `  /api/chat, and only the route reads ${secrets.length > 1 ? 'them' : 'it'}.`,
          `  Do NOT re-export ${secrets.length > 1 ? 'them' : 'it'} through a client-bundle env var — a bundler INLINES`,
          `  VITE_*, NEXT_PUBLIC_* and PUBLIC_* into the JavaScript the browser downloads,`,
          `  so a key put there is published, not configured.`,
        ]
      : [
          // Two integrations are here, for two different reasons, and the sentence
          // has to be true of both: `pi` spawns a local process, which a browser
          // cannot do at any price, and `mastra` points at an unauthenticated agent
          // endpoint that a public bundle must not be aimed at. Neither declares a
          // key, and neither is frontend-safe.
          `  No API key is involved. What keeps this on a server is the route itself —`,
          `  either a capability a browser does not have, or an endpoint a public bundle`,
          `  must not be pointed at. Block (2) is not optional.`,
        ]),
  ];
}

// ── compose ───────────────────────────────────────────────────────────────────

/**
 * The three labeled blocks the MCP tool returns: the surface, the backend route
 * and the run note.
 *
 * It owns NO rendering. `renderSurface` emits block (1) and `chooseRoute` picks
 * block (2); what is left here is the provenance header and the assembly. That
 * split is what lets `create-kai` reuse the renderer without inheriting the MCP's
 * output format, which is the reason this extraction exists.
 *
 * `preset` is provenance only — the archetype id and title, when the request came
 * in as `useCase`. It is printed in the header and NEVER reaches `renderSurface`,
 * so it cannot change a single byte of the emitted surface.
 */
function compose(
  components: readonly string[],
  integration: Integration,
  placement: string,
  framework: string,
  suggestions: string[],
  audience?: string,
  preset?: { id: string; title: string },
): string {
  const frontend = renderSurface({
    framework,
    components,
    integration,
    placement,
    suggestions,
    audience,
  });
  const isMock = integration.id === 'mock';
  const route = isMock ? undefined : chooseRoute(integration, framework);

  const header = [
    `# AI/UI scaffold — ${preset ? preset.title : surfaceLabel(components)} × ${integration.title}`,
    `combo: ${preset ? preset.id : components.join('+')} × ${integration.id} × ${placement} × ${framework}`,
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
  // The catalog's two machine-readable facts, emitted rather than described: what
  // to install comes from `deps`, and where the key may live comes from
  // `keyExposure`. `runNote` is prose ABOUT running it and no longer restates
  // either — see `installLines` for the drift that duplication had already caused.
  const block3 = [
    `=== (3) RUN NOTE ===`,
    ``,
    integration.runNote,
    ``,
    ...installLines(integration),
    ``,
    `Env vars to set:`,
    envLines,
    ``,
    ...keyHandlingLines(integration, route),
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

  // Block (0) is emitted only where the framework genuinely needs setup before
  // block (1) will run — today that is vue's isCustomElement.
  const block0 = setupBlock(framework);

  return [header, ...(block0 ? [block0] : []), block1, block2, block3, block4, block5].join('\n\n');
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
    .map((a) => `${a.id} (${a.title}: ${a.components.join(', ')})`)
    .join(', ');
  return [
    id ? `Unknown useCase: "${id}".` : `No surface given: pass either \`components\` or \`useCase\`.`,
    ``,
    `Valid useCases (presets): ${valid}.`,
    ``,
    // The presets are six points, not the space. A harness that only ever learns
    // the six ids will ask for the nearest one instead of the surface it wants,
    // so the rejection that teaches the id list is the right place to say so.
    `These are PRESETS over the real axis, which is \`components\`. To compose a surface no`,
    `preset names, pass the list directly, e.g. components: ["kai-chat", "kai-tool",`,
    `"kai-reasoning", "kai-artifact", "kai-resizable"] for a workspace that also renders its`,
    `tool calls. Pick a preset id or pass \`components\`, then call scaffold again.`,
  ].join('\n');
}

// ── tool ──────────────────────────────────────────────────────────────────────

export const scaffold: Tool = {
  name: 'scaffold',
  description:
    'Scaffold a working AI/UI chat surface from: components (or a useCase preset) × integration × placement × framework. ' +
    'Emits a copy-pasteable front-end (kai-* components wired with messages + kai-submit + starter suggestions), the backend ' +
    'route for the chosen framework, and a run note with env vars. Use integration: "mock" for a zero-config local preview. ' +
    'Pass `components` to compose any feature set; `useCase` is a named preset over the same axis and the two cannot disagree.',
  inputSchema: z.object({
    // useCase + integration are dynamic catalog ids — kept as strings and
    // validated against the registry in the handler (the handler is called
    // directly in tests, bypassing this schema). Use component_reference / the
    // catalogs to discover valid ids.
    //
    // `useCase` is OPTIONAL because `components` can carry the surface instead —
    // the archetypes are six points in the components space, not the space. A
    // request must still name one of the two, and the handler says so when it
    // names neither.
    useCase: z
      .string()
      .optional()
      .describe(
        'Archetype PRESET id, e.g. "drop-in-chat", "support-widget", "knowledge-base", "agentic", "workspace", "voice". ' +
          'Shorthand for the preset\'s `components`. Omit it and pass `components` to compose a surface no preset names.',
      ),
    components: z
      .array(z.string())
      .optional()
      .describe(
        'The kai-* components this surface composes, e.g. ["kai-chat", "kai-tool", "kai-reasoning", "kai-artifact", "kai-resizable"]. ' +
          'The real axis: any combination is renderable, not just the six presets. Include "kai-chat". Wins over `useCase` when both are given.',
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
    const integrationId = String(args.integration ?? '');
    const placement = String(args.placement ?? '');
    const framework = String(args.framework ?? 'html');
    const audience = args.audience ? String(args.audience) : undefined;
    // Default the suggestions so the feature always shows; honour a passed array.
    const suggestions =
      Array.isArray(args.suggestions) && args.suggestions.length > 0
        ? args.suggestions.map(String)
        : DEFAULT_SUGGESTIONS;

    // The surface arrives one of two ways, and `components` wins: it is the axis,
    // and `useCase` is a preset over it. A caller that passes an explicit list has
    // said something more specific than a preset name can.
    const explicit = Array.isArray(args.components)
      ? args.components.map(String).filter(Boolean)
      : undefined;

    let components: readonly string[];
    let preset: { id: string; title: string } | undefined;
    let effectivePlacement = placement;

    if (explicit && explicit.length > 0) {
      components = explicit;
      // No preset means no `defaultPlacement` to fall back to. Full-page is the
      // same default `renderSurface` applies, stated here so the header prints
      // the placement that was really used.
      effectivePlacement = placement || 'full-page';
    } else {
      const useCase = String(args.useCase ?? '');
      // Validate against the registry BEFORE composing — graceful, self-correcting text.
      const archetype = getArchetype(useCase);
      if (!archetype) return text(rejectUseCase(useCase));
      components = archetype.components;
      preset = { id: archetype.id, title: archetype.title };
      // Fall back to the archetype's default placement only if none was provided.
      effectivePlacement = placement || archetype.defaultPlacement;
    }

    const integration = getIntegration(integrationId);
    if (!integration) return text(rejectIntegration(integrationId));

    return text(
      compose(components, integration, effectivePlacement, framework, suggestions, audience, preset),
    );
  },
};
