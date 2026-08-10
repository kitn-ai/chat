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
  altNote?: string;
}

// The chat element must fill its container. In a `display: flex; flex-direction:
// column` shell it's a flex child (`flex: 1; min-height: 0`); in a plain block
// container it fills via `height: 100%`.
const FLEX_FILL = 'flex: 1; min-height: 0;';
const BLOCK_FILL = 'height: 100%; width: 100%;';

function placementStyle(placement: string): PlacementStyle {
  switch (placement) {
    case 'full-page':
      return {
        style: 'height: 100dvh; width: 100%; display: flex; flex-direction: column;',
        chatFill: FLEX_FILL,
        note: 'fills the viewport (100dvh)',
      };
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
        altNote:
          'In-flow alternative (push content instead of overlay): drop `position`/`z-index` and ' +
          'make this a `flex: 0 0 380px` column inside a `display: flex` row at `height: 100dvh`.',
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
      return {
        style: 'height: 100dvh; width: 100%; display: flex; flex-direction: column;',
        chatFill: FLEX_FILL,
        note: 'fills the viewport (100dvh)',
      };
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
}): string {
  const { pad, read, commitInitial, commitMap, setLoading, strictRoles = false } = opts;
  const asConst = strictRoles ? ' as const' : '';
  // Under strict TS, an un-annotated array literal widens the part's `type` to
  // `string`, so the later `setMessages([...history, …])` fails TS2322. Plain-JS
  // contexts (html) have no type to annotate with.
  const historyType = strictRoles ? ': ChatMessage[]' : '';
  const mapBody = `(m.id === assistantId ? { ...m, parts: appendText(m.parts, tok) } : m)`;
  return [
    `${pad}const value = e.detail.value.trim();`,
    `${pad}if (!value) return;`,
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
  /** the JSON.stringify argument for the POST body */
  bodyPayload: string;
  /** emit `as const` + the ChatMessage[] annotation (strict-TS frameworks) */
  strictRoles?: boolean;
  /** archetype renders kai-tool → append the commented multi-round loop */
  toolLoop: boolean;
}): string {
  const { pad, read, commitSet, setterAdapter, setLoading, bodyPayload, strictRoles = false, toolLoop } = opts;
  const asConst = strictRoles ? ' as const' : '';
  // Under strict TS an un-annotated array literal widens the part's `type` to
  // `string`, so the later commit fails TS2322. Plain-JS contexts (html) have no
  // type to annotate with.
  const historyType = strictRoles ? ': ChatMessage[]' : '';
  return [
    `${pad}const value = e.detail.value.trim();`,
    `${pad}if (!value) return;`,
    `${pad}const history${historyType} = [...${read}, { id: crypto.randomUUID(), role: 'user'${asConst}, parts: [{ type: 'text', text: value }] }];`,
    `${pad}${commitSet('history')}`,
    `${pad}${setLoading('true')}`,
    `${pad}// createAssistantStream appends the in-flight assistant message and folds`,
    `${pad}// every delta onto its parts. readOpenAIStream parses the SSE: keep-alive`,
    `${pad}// comments, multi-line frames, split codepoints, tool calls, reasoning.`,
    `${pad}const stream = createAssistantStream(${setterAdapter});`,
    `${pad}try {`,
    `${pad}  const res = await fetch('/api/chat', {`,
    `${pad}    method: 'POST',`,
    `${pad}    headers: { 'Content-Type': 'application/json' },`,
    `${pad}    body: JSON.stringify(${bodyPayload}),`,
    `${pad}  });`,
    `${pad}  await readOpenAIStream(res, stream);`,
    ...(toolLoop ? toolLoopComment(`${pad}  `) : []),
    `${pad}} finally {`,
    `${pad}  stream.done();`,
    `${pad}  ${setLoading('false')}`,
    `${pad}}`,
  ].join('\n');
}

/**
 * The multi-round tool loop, emitted COMMENTED OUT.
 *
 * The kit never calls a consumer's function, and a live loop against tools that
 * do not exist yet would fail on the first run. Commented is the honest default:
 * the shape is there to uncomment, and nothing pretends to work that does not.
 */
function toolLoopComment(pad: string): string[] {
  return [
    ``,
    `${pad}// Multi-round tool loop. readOpenAIStream RETURNS the turn, so:`,
    `${pad}//`,
    `${pad}//   // add to the imports at the top of the file:`,
    `${pad}//   import { applyToolOutput } from '@kitn.ai/ui/wire';`,
    `${pad}//`,
    `${pad}//   const turn = await readOpenAIStream(res, stream);`,
    `${pad}//   for (const call of turn.toolCalls) {`,
    `${pad}//     if (call.error || call.providerExecuted) continue;`,
    `${pad}//     const output = await runYourTool(call.name, call.input ?? {});`,
    `${pad}//     applyToolOutput(stream, call.id, output);`,
    `${pad}//   }`,
    `${pad}//   // then POST again with toOpenAIMessages(latestMessages) to let the`,
    `${pad}//   // model answer with the results. Cap the rounds: a runaway model is`,
    `${pad}//   // a runaway bill.`,
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
 * Every name here MUST be referenced by live emitted code. `applyToolOutput` is
 * deliberately absent: it is called only from the commented-out tool loop, and
 * every starter in this repo (and create-vite's own TypeScript template) sets
 * `noUnusedLocals`, so importing it would fail `npm run build` with TS6133 in a
 * stock app. `toolLoopComment` shows its import line beside the loop instead.
 *
 * `typed` pulls in the kit's own `ChatMessage` for the strict-TS frameworks (see
 * `chatMessageDecl`); the plain-JS html target must not emit a type import.
 */
function wireImportLines(opts: { pad?: string; typed: boolean }): string[] {
  const { pad = '', typed } = opts;
  const stateNames = typed ? 'createAssistantStream, type ChatMessage' : 'createAssistantStream';
  return [
    `${pad}import { ${stateNames} } from '@kitn.ai/ui/state';`,
    `${pad}import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';`,
  ];
}

/** The POST body for a real backend. `toOpenAIMessages` keeps tool calls and
 *  tool results on the way back, which is what makes a second round possible. */
function realBodyPayload(defaultModel?: string): string {
  return defaultModel
    ? `{ model, messages: toOpenAIMessages(history) }`
    : `{ messages: toOpenAIMessages(history) }`;
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

// ── SCAF-8: per-integration default model ids ─────────────────────────────────

/**
 * Return a sensible default model id for integrations whose route forwards a
 * `model` field to the upstream provider.  The dev can change this const.
 * Returns undefined for integrations whose route does not use a model param.
 */
function defaultModelFor(integration: Integration): string | undefined {
  // Detect: any route template destructures `model` from the request body.
  const routeSrc = Object.values(integration.routeTemplates).join('\n');
  if (!routeSrc.includes('model')) return undefined;

  const defaults: Record<string, string> = {
    openrouter: 'openai/gpt-4o-mini',
    ollama: 'llama3.2',
    'vercel-ai-sdk': 'openai/gpt-4o-mini',
    cloudflare: 'openai/gpt-4o-mini',
  };
  return defaults[integration.id] ?? 'openai/gpt-4o-mini';
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
 * A sample assistant message that demonstrates embedded tool + reasoning so the
 * agentic archetype renders correctly out of the box.
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

// ── front-end rendering ───────────────────────────────────────────────────────

interface RenderCtx {
  p: PlacementStyle;
  emptyHint: string;
  suggestions: string[];
  /** mock = stream the reply client-side (no fetch, no backend, no key) */
  isMock: boolean;
  /** SCAF-8: non-undefined when the integration forwards a model param */
  defaultModel?: string;
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
      `  <!-- kai-tool / kai-reasoning render INSIDE the thread, not as siblings.`,
      `       Seed messages with parts: [{ type: 'reasoning', text: '...' }, { type: 'tool', tool: {...} }, ...] — see the sample in the script below. -->`,
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

/** The HTML <script> wiring — mock streams client-side; everything else fetches /api/chat. */
function htmlWiring(ctx: RenderCtx, archetype: Archetype): string {
  const hasEmbedded = archetype.components.some((t) => MESSAGE_EMBEDDED_TAGS.has(t));
  const hasSources = archetype.components.includes('kai-sources');

  // SCAF-9: seed the sample agentic message so tool+reasoning render immediately.
  const seedLines = hasEmbedded
    ? [
        `    // SCAF-9: tool calls + reasoning render INSIDE the thread — set them on the message object.`,
        `    // Replace this sample with real messages from your backend.`,
        `    chat.messages = [${JSON.stringify(SAMPLE_AGENTIC_MESSAGE, null, 0)}];`,
        ``,
      ]
    : [];

  const sourcesSetupLines = hasSources
    ? [
        `    const sourcesEl = document.getElementById('sources');`,
        `    // Replace with your real source data (set as a JS property — it's an array).`,
        `    const sampleSources = [`,
        `      { href: 'https://example.com/doc1', title: 'Getting started', description: 'Overview of the product.' },`,
        `      { href: 'https://example.com/doc2', title: 'API reference', description: 'Full API documentation.' },`,
        `    ];`,
        `    sourcesEl.sources = sampleSources;`,
        ``,
      ]
    : [];

  // SCAF-8: the model id lives in init() scope so the submit handler closes over it.
  const modelLines = ctx.defaultModel
    ? [
        `      // SCAF-8: change this model id to any provider/model string you want to use.`,
        `      const model = '${ctx.defaultModel}';`,
        ``,
      ]
    : [];

  const head = [
    `  <script type="module">`,
    `    import '@kitn.ai/ui/elements';  // registers <kai-*> — required, must come first`,
    ...(ctx.isMock ? [] : wireImportLines({ pad: '    ', typed: false })),
    `    import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    ``,
    `    // Guard: module scripts run before the DOM is ready when inlined in <head>.`,
    `    // DOMContentLoaded fires synchronously when already loaded; otherwise waits.`,
    `    async function init() {`,
    `      const chat = document.getElementById('chat');`,
    `      // SCAF-15: kai-* register via an async dynamic import (SSR-safety), so the`,
    `      // element may not be upgraded yet. Wait for the upgrade before setting any`,
    `      // array/object property — values set pre-upgrade are dropped on upgrade.`,
    `      await customElements.whenDefined('kai-chat');`,
    `      // suggestions is a JS PROPERTY (arrays can't be HTML attributes)`,
    `      chat.suggestions = ${jsArray(ctx.suggestions)};`,
    `      chat.suggestionMode = 'submit';`,
    ``,
    ...modelLines,
    ...seedLines.map((l) => (l.trim() === '' ? l : `  ${l}`)),
    ...sourcesSetupLines.map((l) => (l.trim() === '' ? l : `  ${l}`)),
  ];

  // DOMContentLoaded footer — closes init() and wires it safely.
  const domReadyFooter = [
    `    }`,
    `    if (document.readyState === 'loading') {`,
    `      document.addEventListener('DOMContentLoaded', init);`,
    `    } else {`,
    `      init();`,
    `    }`,
  ];

  if (ctx.isMock) {
    const body = mockStreamBody({
      pad: '        ',
      read: 'chat.messages',
      commitInitial: (expr) => `chat.messages = ${expr};`,
      // chat.messages is live (no React snapshot) — map over it directly
      commitMap: (mapBody) => `chat.messages = chat.messages.map((m) => ${mapBody});`,
      setLoading: (v) => `chat.loading = ${v};`,
    });
    return [
      ...head,
      `      // No backend: stream a canned reply client-side (no fetch, no API key).`,
      `      chat.addEventListener('kai-submit', async (e) => {`,
      body,
      `      });`,
      ...domReadyFooter,
      `  </script>`,
    ].join('\n');
  }

  return [
    ...head,
    `      // messages is a JS PROPERTY (objects can't be HTML attributes)`,
    `      chat.addEventListener('kai-submit', async (e) => {`,
    realStreamBody({
      pad: '        ',
      read: 'chat.messages',
      commitSet: (expr) => `chat.messages = ${expr};`,
      setterAdapter: '(fn) => { chat.messages = fn(chat.messages); }',
      setLoading: (v) => `chat.loading = ${v};`,
      bodyPayload: realBodyPayload(ctx.defaultModel),
      strictRoles: false,
      toolLoop: hasToolPanel(archetype),
    }),
    `      });`,
    ...domReadyFooter,
    `  </script>`,
  ].join('\n');
}

/**
 * SCAF-19: the `html` framework's canonical getting-started path is
 * `npm create vite@latest <name> -- --template vanilla-ts` (see recipes.md),
 * whose build script is `tsc && vite build`. This front-end is one inline
 * `<script type="module">` pasted into index.html — deliberately plain JS,
 * not a real `src/*.ts` module: the wiring sets untyped properties
 * (messages, suggestions, loading, ...) on a raw customElements reference,
 * which only type-checks cleanly against a real element type (the
 * `@kitn.ai/ui/react` wrappers carry that; raw DOM lookups here would need
 * a hand-cast per property and per archetype, which is worse). Keeping it
 * inline keeps it invisible to tsc, avoiding that entirely.
 *
 * The cost: the vanilla-ts template ships its wiring in `src/main.ts`, and
 * once a dev drops that file (this scaffold makes it dead code), `src/`
 * has zero `.ts` files, so `tsc` fails with TS18003 ("No inputs were
 * found") before vite even runs — a first-build failure with no code to
 * point at. One file fixes it: `src/vite-env.d.ts` with the same ambient
 * reference the template ships by default, which gives tsc an input.
 * Verified against a real `npm create vite@latest -- --template
 * vanilla-ts` app: without this file `tsc` exits 2 with TS18003; with it,
 * `npm run build` succeeds unmodified.
 */
const VITE_HTML_SETUP_NOTE = [
  `  <!-- SCAF-19: scaffolded with \`npm create vite@latest -- --template vanilla-ts\`?`,
  `       Its "build" script is \`tsc && vite build\`. This page's only code is the`,
  `       inline <script> above — once you delete the template's src/main.ts (this`,
  `       page replaces it), src/ has no .ts files left and tsc fails with`,
  `       "TS18003: No inputs were found" before vite even runs. Add one file: -->`,
  `  <!-- src/vite-env.d.ts:`,
  `         /// <reference types="vite/client" /> -->`,
].join('\n');

function renderHtml(archetype: Archetype, ctx: RenderCtx, isViteHtmlTarget: boolean): string {
  const { p, emptyHint } = ctx;
  return [
    `<!-- ${archetype.title} — ${p.note} -->`,
    ...(p.altNote ? [`<!-- ${p.altNote} -->`] : []),
    `<div style="${p.style}">`,
    componentTags(archetype, p.chatFill),
    `</div>`,
    ``,
    htmlWiring(ctx, archetype),
    ``,
    `  <!-- empty-state hint: ${emptyHint} -->`,
    ...(isViteHtmlTarget ? ['', VITE_HTML_SETUP_NOTE] : []),
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
  const { p, emptyHint, suggestions, isMock, defaultModel } = ctx;

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
      `      {/* kai-tool / kai-reasoning render inside the thread. Tool calls + reasoning`,
      `          are set on each message object — see the sampleMessages initializer above. */}`,
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

  // SCAF-9: seed sample messages for agentic archetype so tool+reasoning render immediately.
  const sampleMessagesInit = hasEmbedded
    ? [
        `  // SCAF-9: tool calls and reasoning render inside the thread — set them on the message object.`,
        `  // Replace with real messages streamed from your backend.`,
        `  const sampleMessages: ChatMessage[] = [${JSON.stringify(SAMPLE_AGENTIC_MESSAGE)}];`,
        `  const [messages, setMessages] = useState<ChatMessage[]>(sampleMessages);`,
      ].join('\n')
    : `  const [messages, setMessages] = useState<ChatMessage[]>([]);`;

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
        bodyPayload: realBodyPayload(defaultModel),
        strictRoles: true,
        toolLoop: hasToolPanel(archetype),
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
      ...(isMock ? [] : wireImportLines({ typed: true })),
      `import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
      `// <kai-*> are client-only custom elements (the server has no customElements`,
      `// registry) → load client-only so hydration doesn't mismatch. The package itself`,
      `// is SSR-import-safe; importing it from a server component is fine.`,
      ...dynamicImports,
      ``,
      ...nextConfigNote,
      `// ${archetype.title} — ${p.note}. empty-state hint: ${emptyHint}`,
      ...(p.altNote ? [`// ${p.altNote}`] : []),
      ...chatMessageType,
      ``,
      `export default function App() {`,
      sampleMessagesInit,
      `  const [loading, setLoading] = useState(false);`,
      `  const suggestions = ${jsArray(suggestions)};`,
      ...(sampleSourcesInit ? [sampleSourcesInit] : []),
      ...(modelInit ? [modelInit] : []),
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
    ...(isMock ? [] : wireImportLines({ typed: true })),
    `import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    ``,
    ...nextConfigNote,
    `// ${archetype.title} — ${p.note}. empty-state hint: ${emptyHint}`,
    ...(p.altNote ? [`// ${p.altNote}`] : []),
    ...chatMessageType,
    ``,
    `export default function App() {`,
    sampleMessagesInit,
    `  const [loading, setLoading] = useState(false);`,
    `  const suggestions = ${jsArray(suggestions)};`,
    ...(sampleSourcesInit ? [sampleSourcesInit] : []),
    ...(modelInit ? [modelInit] : []),
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
  const { p, emptyHint, suggestions, isMock, defaultModel } = ctx;

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
      `    <!-- kai-tool / kai-reasoning render INSIDE the thread — set them as parts on each message object. -->`,
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
        bodyPayload: realBodyPayload(defaultModel),
        strictRoles: true,
        toolLoop: hasToolPanel(archetype),
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

  // SCAF-9: sample seeding for agentic archetype.
  const sampleSeed = hasEmbedded
    ? [
        `// SCAF-9: tool calls + reasoning render inside the thread — set them on the message object.`,
        `// Replace with real messages streamed from your backend.`,
        `const messages = ref<ChatMessage[]>([${JSON.stringify(SAMPLE_AGENTIC_MESSAGE)}]);`,
      ]
    : [`const messages = ref<ChatMessage[]>([]);`];

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
    ...(p.altNote ? [`<!-- ${p.altNote} -->`] : []),
    `<!-- SCAF-3: vite.config.ts — tell Vue that kai-* are custom elements (not Vue components).`,
    `     Without this, Vue warns "Unknown custom element" and .prop bindings may misbehave.`,
    `     import vue from '@vitejs/plugin-vue';`,
    `     export default { plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('kai-') } } })] }; -->`,
    `<script setup lang="ts">`,
    `import '@kitn.ai/ui/elements';  // registers <kai-*> — required, must come first`,
    ...(isMock ? [] : wireImportLines({ typed: true })),
    `import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    vueImports,
    ``,
    ...chatMessageType,
    ``,
    ...sampleSeed,
    `const loading = ref(false);`,
    `const suggestions = ${jsArray(suggestions)};`,
    ...modelInit,
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
  const { p, emptyHint, suggestions, isMock, defaultModel } = ctx;

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
      `  <!-- kai-tool / kai-reasoning render INSIDE the thread — set them as parts on each message object. -->`,
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
        bodyPayload: realBodyPayload(defaultModel),
        strictRoles: true,
        toolLoop: hasToolPanel(archetype),
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

  // SCAF-9: seed sample messages for agentic archetype.
  const sampleMessagesInit = hasEmbedded
    ? [
        `  // SCAF-9: tool calls + reasoning render INSIDE the thread — set them on the message object.`,
        `  // Replace with real messages streamed from your backend.`,
        `  let messages: ChatMessage[] = [${JSON.stringify(SAMPLE_AGENTIC_MESSAGE)}];`,
      ]
    : [`  let messages: ChatMessage[] = [];`];

  // SCAF-9: sources element ref + sample data. Typed as the kit's own element
  // interface (not HTMLElement) so the `.sources =` assignment below typechecks
  // honestly under `tsc --strict`: HTMLElement has no `sources` property.
  const sourcesEl = hasSourcesCompanion ? [`  let sourcesEl: KaiSourcesElement | undefined;`] : [];
  const sourcesReactive = standaloneCompanionTags.includes('kai-sources')
    ? [
        `  // Replace sampleSources with your real source data.`,
        `  const sampleSources = [`,
        `    { href: 'https://example.com/doc1', title: 'Getting started', description: 'Overview of the product.' },`,
        `    { href: 'https://example.com/doc2', title: 'API reference', description: 'Full API documentation.' },`,
        `  ];`,
        `  $: if (sourcesEl) { sourcesEl.sources = sampleSources; }`,
      ]
    : [];

  // SCAF-14: workspace template block — resizable split with chat + artifact panes.
  const workspaceMarkup = workspace
    ? [
        `  <!-- SCAF-14: workspace split — chat pane left, artifact preview right. -->`,
        `  <!-- kai-resizable needs kai-resizable-item children to render panels. -->`,
        `  <kai-resizable orientation="horizontal" style="display:block;width:100%;height:100%">`,
        `    <kai-resizable-item size="40%" min="240px">`,
        `      <kai-chat bind:this={chatEl} suggestion-mode="submit" style="${p.chatFill}" on:kai-submit={onSubmit}></kai-chat>`,
        `    </kai-resizable-item>`,
        `    <kai-resizable-item min="280px">`,
        `      <!-- Replace src with your artifact URL or set .files for multi-file preview. -->`,
        `      <kai-artifact src="https://example.com" style="width:100%;height:100%"></kai-artifact>`,
        `    </kai-resizable-item>`,
        `  </kai-resizable>`,
      ]
    : [
        `  <kai-chat bind:this={chatEl} suggestion-mode="submit" style="${p.chatFill}" on:kai-submit={onSubmit}></kai-chat>`,
        companionLines,
      ];

  return [
    `<!-- svelte — ${archetype.title} — ${p.note}. empty-state hint: ${emptyHint} -->`,
    ...(p.altNote ? [`<!-- ${p.altNote} -->`] : []),
    `<!-- SCAF-5: This uses Svelte-4 syntax ($:, on:event). Works in Svelte 5 via legacy mode;`,
    `     runes-mode users should adapt to $state/$effect and onkai-submit event handlers. -->`,
    `<script lang="ts">`,
    `  import '@kitn.ai/ui/elements';  // registers <kai-*> — required, must come first`,
    // KaiSourcesElement is only imported when a kai-sources companion is actually
    // declared below: an always-on import would be unused (and fail noUnusedLocals)
    // on every archetype without kai-sources.
    `  import type { ${hasSourcesCompanion ? 'KaiChatElement, KaiSourcesElement' : 'KaiChatElement'} } from '@kitn.ai/ui/elements';`,
    ...(isMock ? [] : wireImportLines({ pad: '  ', typed: true })),
    `  import '@kitn.ai/ui/theme.tokens.css';  // compiled token defaults; use theme.css only for Tailwind-source apps`,
    `  import { onMount } from 'svelte';`,
    ...chatMessageType,
    `  let chatEl: KaiChatElement | undefined;`,
    `  // SCAF-15: kai-* register via an async dynamic import (SSR-safety). Gate the`,
    `  // reactive property block on the upgrade so the first application isn't dropped`,
    `  // (props set on a not-yet-upgraded element are lost on upgrade).`,
    `  let defined = false;`,
    `  onMount(async () => { await customElements.whenDefined('kai-chat'); defined = true; });`,
    ...sourcesEl,
    ...sampleMessagesInit,
    `  let loading: boolean = false;`,
    `  const suggestions: string[] = ${jsArray(suggestions)};`,
    ...modelInit,
    `  // suggestions/messages are JS PROPERTIES (arrays/objects can't be attributes)`,
    `  $: if (chatEl && defined) { chatEl.messages = messages; chatEl.loading = loading; chatEl.suggestions = suggestions; }`,
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
 * Backend: TanStack Start supports server-side routes via `createServerFn` in
 * `src/server/`. For a chat API, place the route in `src/server/chat.ts` and call
 * it from your route component. The emitted scaffold uses `fetch('/api/chat')` as a
 * placeholder pointing at a standard route — swap for your TanStack server function
 * or an external endpoint.
 */
function renderTanstackStart(archetype: Archetype, ctx: RenderCtx): string {
  const { p, emptyHint, suggestions, isMock, defaultModel } = ctx;

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
      `      {/* kai-tool / kai-reasoning render inside the thread. Tool calls + reasoning`,
      `          are set on each message object — see the sampleMessages initializer above. */}`,
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

  const sampleMessagesInit = hasEmbedded
    ? [
        `  // SCAF-9: tool calls and reasoning render inside the thread — set them on the message object.`,
        `  // Replace with real messages streamed from your backend.`,
        `  const sampleMessages: ChatMessage[] = [${JSON.stringify(SAMPLE_AGENTIC_MESSAGE)}];`,
        `  const [messages, setMessages] = useState<ChatMessage[]>(sampleMessages);`,
      ].join('\n')
    : `  const [messages, setMessages] = useState<ChatMessage[]>([]);`;

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
        bodyPayload: realBodyPayload(defaultModel),
        strictRoles: true,
        toolLoop: hasToolPanel(archetype),
      });

  // File path guidance for TanStack Start (file-based routing)
  const filePathNote = [
    `// TanStack Start route file — save as: src/routes/chat.tsx`,
    `// Scaffold command: npx @tanstack/cli@latest create <app-name> --framework react --no-git --package-manager npm -y`,
    `// Then: npm install @kitn.ai/ui`,
    `// Dev: npm run dev (port 3000)  Build: npm run build  Preview: npm run preview`,
    `// Note: there is no 'npm start' script — use 'npm run dev' or 'npm run preview'.`,
    `// Backend: place TanStack server functions in src/server/chat.ts (createServerFn).`,
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
    ...(isMock ? [] : wireImportLines({ typed: true })),
    `import '@kitn.ai/ui/theme.tokens.css'  // compiled token defaults`,
    ``,
    `// ${archetype.title} — ${p.note}. empty-state hint: ${emptyHint}`,
    ...(p.altNote ? [`// ${p.altNote}`] : []),
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
  defaultModel?: string,
): string {
  const ctx: RenderCtx = { p: placementStyle(placement), emptyHint, suggestions, isMock, defaultModel };
  switch (framework) {
    case 'react':
    case 'next':
      return renderJsx(archetype, ctx, framework);
    case 'vue':
      return renderVue(archetype, ctx);
    case 'svelte':
      return renderSvelte(archetype, ctx);
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
  'tanstack-start': 'TanStack Start server function (Node)',
};

/** Prefer the language's canonical server framework when there's no exact match. */
function preferredKeyFor(integration: Integration): string[] {
  return integration.language === 'python'
    ? ['fastapi']
    : ['next', 'express', 'worker'];
}

function chooseRoute(integration: Integration, framework: string): RouteChoice | undefined {
  const templates = integration.routeTemplates;

  // 1. exact match
  if (templates[framework]) {
    return { framework, template: templates[framework], runtime: RUNTIME_LABEL[framework] ?? framework, exact: true };
  }

  // 2. language-canonical fallback (python → fastapi; ts → next/express/worker)
  for (const key of preferredKeyFor(integration)) {
    if (templates[key]) {
      return { framework: key, template: templates[key], runtime: RUNTIME_LABEL[key] ?? key, exact: false };
    }
  }

  // 3. anything usable that isn't a pure front-end snippet
  for (const [key, template] of Object.entries(templates)) {
    if (key === 'html') continue;
    return { framework: key, template, runtime: RUNTIME_LABEL[key] ?? key, exact: false };
  }

  return undefined;
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
  const frontend = renderFrontend(framework, archetype, placement, audienceHint, suggestions, isMock, defaultModel);
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
        `# Note: ${integration.title} has no template for "${framework}". Emitting its native`,
        `# ${route.runtime} route instead (matches the integration's ${integration.language} language).`,
      );
      // Honest warning: a Next.js/server route will NOT run inside a Vite SPA.
      if (framework === 'react') {
        block2Parts.push(
          `#`,
          `# WARNING: this is a Next.js route handler — it will NOT run in a Vite SPA`,
          `# (a Vite \`react\` app has no /api routes). To make the front-end above work, either:`,
          `#   • use Next.js (framework: "next"), or`,
          `#   • add a Vite dev-server middleware/proxy to a server, or`,
          `#   • run a separate server (framework: "express" | "worker"), or`,
          `#   • use integration: "mock" for a zero-config local stream (no backend, no key).`,
        );
      }
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
    framework === 'next'
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
      'Target front-end/back-end framework: html | react | next | vue | svelte | fastapi | express | worker | tanstack-start.',
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
