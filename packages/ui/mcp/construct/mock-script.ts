/**
 * Per-template scripted mock conversations (template-purpose audit, S-1).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Every emitted starter used to call `createMockResponder()` bare, and a mock
 * turn was `{ text?, toolCalls? }` — so reasoning blocks, citation strips,
 * cards and tool rows were UNOBSERVABLE in every emitted app. No research app
 * built from a starter had ever rendered a citation. This module scripts one
 * conversation per template family so a first `npm run dev` shows every
 * content type the construct's own schema enables.
 *
 * WHAT IS DERIVED AND WHAT IS A COPY
 * ----------------------------------
 * Derived, never typed:
 *   · the FAMILY comes from `inferTemplateId(c)` — the same layout/sources
 *     discriminant the builder's home screen uses, so a hand-authored
 *     construct lands in the right script without any template key;
 *   · which CONTENT TYPES a script includes comes from the construct itself:
 *     reasoning iff `capabilities.reasoning` is not 'off', citations iff
 *     `capabilities.sources` is on (strip not disabled), a card call iff the
 *     construct declares `cards` (the first declared card's own name).
 * Hand-authored copies (per the derive-don't-type rule, declared here):
 *   · the TEXTS — each family's conversation copy is authored prose, in the
 *     mock's own voice (it names itself a mock at least once per script, tell
 *     5 of state/mock.ts's header);
 *   · the demo TOOL NAMES and their scripted outputs. These are presentation
 *     vocabulary for the mock seam only — nothing else reads them, and they
 *     vanish the moment `provider.mode` flips to 'endpoint'.
 *
 * WHY TOOL OUTPUTS LIVE HERE AND NOT ON THE WIRE
 * ----------------------------------------------
 * The chat-completions wire streams tool CALLS only; results are the host's
 * side of the loop ("the kit parses, the HOST resolves tool calls"). So the
 * script carries each demo call's output, and codegen emits a small settle
 * step that upserts it after the read — the same `stream.upsertTool` move a
 * real tool loop makes. `kai_`-prefixed calls are deliberately absent from
 * `toolOutputs`: those settle into CARDS via the existing cardFromToolCall
 * path, not into tool rows.
 *
 * Leaf discipline: type-only imports plus `inferTemplateId` from the
 * templates leaf — no zod, no components. Consumed by codegen (Node) and by
 * the MCP scaffolder (`mcp/tools/scaffold.ts`, via `scaffoldMockScript`
 * below), so the construct templates and the framework scaffolds script their
 * first conversation from ONE module instead of two drifting copies.
 */
import type { Construct } from './schema';
import type { MockReply, MockSource, MockToolCall, MockTurn } from '../../src/state/mock';
import { inferTemplateId } from './templates';

export interface MockScript {
  /** The scripted turns, cycled by `createMockResponder({ replies })`. */
  replies: readonly MockReply[];
  /** Scripted outputs keyed by demo tool name. The emitted app settles each
   *  announced non-card call with its entry after the read — empty when the
   *  script announces no plain tool calls, and codegen then emits nothing. */
  toolOutputs: Readonly<Record<string, unknown>>;
}

/** The kit's own docs — real, safe, useful links for scripted citations.
 *  The paths are hand-typed copies of apps/docs routes (checked against
 *  apps/docs/src/content/docs at authoring time); a moved page costs a
 *  redirect, not a broken app. */
const DOCS = 'https://ui.kitn.ai';

interface ContentGates {
  reasoning: boolean;
  sources: boolean;
  /** First declared card's tool-facing name, when the construct declares any. */
  cardName?: string;
}

function gatesOf(c: Construct): ContentGates {
  return {
    // 'full' and 'compact' both render; only 'off' hides reasoning. Absent
    // means the kit default (full), so absent includes it too.
    reasoning: c.capabilities?.reasoning !== 'off',
    // `strip: false` emits hideSources — scripting citations nobody can see
    // would be a silent lie, so the gate follows the visible switch.
    sources: c.capabilities?.sources !== undefined && c.capabilities.sources.strip !== false,
    cardName: c.cards?.[0]?.name,
  };
}

/** A turn builder that strips the fields the construct's gates disable, so a
 *  toggled-off capability never leaves invisible frames in the stream. */
function turn(g: ContentGates, t: MockTurn): MockTurn {
  const out: MockTurn = {};
  if (g.reasoning && t.reasoning !== undefined) out.reasoning = t.reasoning;
  if (t.text !== undefined) out.text = t.text;
  if (g.sources && t.sources !== undefined) out.sources = t.sources;
  if (t.toolCalls !== undefined) out.toolCalls = t.toolCalls;
  return out;
}

/** The scripted card call, when the construct declares a card: the model
 *  proposes, the user confirms — args stay `{}` because the card's fields come
 *  from the construct's OWN declared schema (emitApplyCardTools), not from
 *  anything a mock could invent. */
function cardCall(name: string): MockToolCall {
  return { name: `kai_${name}`, arguments: {} };
}

const CITE_WIRE: MockSource = {
  url: `${DOCS}/guides/recipes/wire-adapter/`,
  title: 'The wire adapter — AI/UI docs',
  snippet: 'The kit parses, the consumer fetches: readOpenAIStream and readAnthropicStream turn provider SSE into message parts.',
};
const CITE_PARTS: MockSource = {
  url: `${DOCS}/guides/state-and-hooks/`,
  title: 'State and hooks — AI/UI docs',
  snippet: 'A message is an ordered list of parts: text, reasoning, tool, card, source, file.',
};
const CITE_THEME: MockSource = {
  url: `${DOCS}/guides/theming/`,
  title: 'Theming — AI/UI docs',
};

function widgetScript(g: ContentGates): MockScript {
  const replies: MockReply[] = [
    turn(g, {
      reasoning:
        'An order question. Look the order up before answering — guessing a delivery date is worse than a short wait.',
      text: 'Let me pull up that order.',
      toolCalls: [{ name: 'lookup_order', arguments: { order: 'KAI-1042' } }],
    }),
    turn(g, {
      text:
        'Order KAI-1042 shipped with DHL and should arrive Thursday. ' +
        "(I'm a local mock — no provider was contacted — but a real model's tool call renders exactly like the row above.)",
    }),
    turn(
      g,
      g.cardName
        ? {
            reasoning: 'A refund request. Collect the details on a card and let them confirm — never assume the amount.',
            text: 'I can start that refund. Check the details below and confirm.',
            toolCalls: [cardCall(g.cardName)],
          }
        : { text: 'Anything else? Still the mock: swap the provider seam for your endpoint and this handler keeps its exact shape.' },
    ),
  ];
  return {
    replies,
    toolOutputs: {
      lookup_order: { order: 'KAI-1042', status: 'shipped', carrier: 'DHL', eta: 'Thursday' },
    },
  };
}

function inAppAssistantScript(g: ContentGates): MockScript {
  const replies: MockReply[] = [
    turn(g, {
      reasoning: 'A question about the current page. Search the docs before answering from memory.',
      text: 'Checking the docs for that.',
      toolCalls: [{ name: 'search_docs', arguments: { query: 'deploy checklist' } }],
    }),
    turn(g, {
      text:
        'Found it: the deploy checklist wants a green canary before promoting. ' +
        "(Local mock, no provider contacted — the tool row above streamed through the kit's real parser.)",
      sources: [CITE_PARTS],
    }),
    turn(
      g,
      g.cardName
        ? {
            reasoning: 'This needs explicit confirmation — put a card in the thread instead of assuming.',
            text: 'Confirm the details below and I will take it from there.',
            toolCalls: [cardCall(g.cardName)],
          }
        : {
            reasoning: 'Follow-up. Keep it short.',
            text: 'Anything else on this page? Swap the mock for your endpoint and this handler does not change shape.',
          },
    ),
  ];
  return {
    replies,
    toolOutputs: {
      search_docs: { matches: 3, top: 'Deploy checklist — promote only on a green canary.' },
    },
  };
}

function assistantScript(g: ContentGates): MockScript {
  const replies: MockReply[] = [
    turn(g, {
      reasoning:
        'A drafting request. Sketch the structure first, then write — a board update wants numbers before narrative.',
      text:
        'Here is a first pass at the Q3 update: revenue, retention, and the two launches, in that order. ' +
        "(I'm a local mock — no provider, no key — streaming through the kit's real parser.)",
    }),
    turn(g, {
      reasoning: 'Summarizing means reading first. Fetch the document, then compress.',
      text: 'Give me a second to read the document.',
      toolCalls: [{ name: 'read_document', arguments: { name: 'q3-metrics.pdf' } }],
    }),
    turn(
      g,
      g.cardName
        ? {
            text: 'One decision left — confirm below.',
            toolCalls: [cardCall(g.cardName)],
          }
        : {
            text: 'Summary: revenue up 12%, retention flat, both launches on schedule. Still the mock — swap the seam for a real backend and nothing else changes.',
          },
    ),
  ];
  return {
    replies,
    toolOutputs: {
      read_document: { pages: 14, headline: 'Revenue up 12% QoQ; retention flat.' },
    },
  };
}

function researchScript(g: ContentGates): MockScript {
  const replies: MockReply[] = [
    turn(g, {
      reasoning:
        'A research question. Search first, then answer with the sources attached — an uncited claim is not an answer here.',
      text: 'Searching for that now.',
      toolCalls: [{ name: 'web_search', arguments: { query: 'how does the wire adapter work' } }],
    }),
    turn(g, {
      reasoning: 'Three of the results agree. Cite the two strongest and quote the load-bearing sentence.',
      text:
        'The wire adapter parses provider SSE into message parts — the kit parses, your app fetches [1]. ' +
        'Each streamed part lands in an ordered list on the message, which is what the thread renders [2]. ' +
        "(I'm a local mock, so these citations are scripted — but they render through the exact path a real model's take.)",
      sources: [CITE_WIRE, CITE_PARTS],
    }),
    turn(g, {
      reasoning: 'Follow-up on theming. One source is enough.',
      text: 'Theming rides CSS custom properties on the host element — restyle without touching the shadow DOM [1].',
      sources: [CITE_THEME],
    }),
  ];
  return {
    replies,
    toolOutputs: {
      web_search: { results: 12, top: 'ui.kitn.ai — Wire adapters' },
    },
  };
}

function workspaceScript(g: ContentGates): MockScript {
  const replies: MockReply[] = [
    turn(g, {
      reasoning:
        'A build request. Scaffold the smallest version that renders, apply it to the work surface, then iterate on feedback.',
      text:
        'First pass coming up — watch the work surface beside this chat. ' +
        "(I'm a local mock: the preview is a placeholder page, but a real build loop's tool calls render exactly like this.)",
      toolCalls: [{ name: 'apply_to_work_surface', arguments: { file: 'work-surface.html', change: 'scaffold the page' } }],
    }),
    turn(g, {
      reasoning: 'Revision. Keep the structure, adjust the section they named.',
      text: 'Revised — the hero now stacks on narrow screens. Tell me what to change next.',
      toolCalls: [{ name: 'apply_to_work_surface', arguments: { file: 'work-surface.html', change: 'stack the hero on mobile' } }],
    }),
    turn(
      g,
      g.cardName
        ? {
            text: 'Ready to ship? Confirm below.',
            toolCalls: [cardCall(g.cardName)],
          }
        : {
            text: 'Done for this round. Swap the mock seam for your endpoint and the loop keeps this exact shape.',
          },
    ),
  ];
  return {
    replies,
    toolOutputs: {
      apply_to_work_surface: { file: 'work-surface.html', status: 'applied' },
    },
  };
}

/** The fallback for shapes `inferTemplateId` cannot place (custom layouts,
 *  unrecognized hand-authored constructs): still exercises every gated
 *  content type, in neutral copy. */
function genericScript(g: ContentGates): MockScript {
  const replies: MockReply[] = [
    turn(g, {
      reasoning: 'Answer plainly, and show every content type this construct enables while doing it.',
      text:
        "Hi! I'm a local mock — no backend, no key, no provider contacted — streaming through the same parser a real model would.",
      sources: [CITE_PARTS],
    }),
    turn(g, {
      reasoning: 'Demonstrate the tool path: announce a call, let the app settle it.',
      text: 'Here is a tool call, parsed and settled through the real path.',
      toolCalls: [{ name: 'demo_tool', arguments: { note: 'scripted by the mock' } }],
    }),
    turn(
      g,
      g.cardName
        ? { text: 'And a card — confirm below.', toolCalls: [cardCall(g.cardName)] }
        : { text: 'Swap `createMockResponder` for a fetch to your endpoint and this handler keeps its exact shape.' },
    ),
  ];
  return {
    replies,
    toolOutputs: { demo_tool: { ok: true, note: 'scripted by the mock' } },
  };
}

/**
 * The scripted mock conversation for a FRAMEWORK SCAFFOLD (the MCP
 * scaffolder's non-construct starters — React/Vue/Svelte/Angular/Solid/html).
 *
 * There is no Construct to gate on here. What the scaffolder's registry does
 * know is one fact per surface: whether it renders `kai-tool`
 * (`hasToolPanel` in scaffold.ts), and that is the `tools` gate. Everything
 * else is one well-authored default, on purpose:
 *   · reasoning and citations are ALWAYS scripted, because every emitted
 *     front end renders every `MessagePart` variant — `<kai-chat>` natively,
 *     and the solid target's `renderPart` under the structural check in
 *     verify:scaffold that derives the variant list from the union;
 *   · a card call is NEVER scripted, because the mock scaffold declares no
 *     card registry (`cardEmitPlan` returns `cards: false` for mock), so a
 *     `kai_` call would be a row nothing settles and a card nothing renders.
 *
 * The demo tool is named `search` — a declared copy of the scaffolder's own
 * `toolSchemaLines` demo tool (and the tool `SAMPLE_AGENTIC_MESSAGE` shows),
 * so the row the mock settles and the tool a real integration would forward
 * describe the same tool.
 */
export function scaffoldMockScript(opts: { tools: boolean }): MockScript {
  const g: ContentGates = { reasoning: true, sources: true };
  const replies: MockReply[] = [
    turn(g, {
      reasoning:
        'First run. Say what I am before anything else — no one should wonder whether a model replied — then show every part a real turn can carry.',
      text:
        "Hi! I'm a local mock — no backend, no API key, no provider was contacted. " +
        "This reasoning block, this text and the citation below all streamed through the kit's real parser, on the exact path a live model's reply takes.",
      sources: [CITE_PARTS],
    }),
    ...(opts.tools
      ? [
          turn(g, {
            reasoning:
              'Demonstrate the tool path: announce a call on the wire and let the app settle it with a scripted output.',
            text: 'Here is a tool call. The wire only announces it — this app settles it from MOCK_TOOL_OUTPUTS, the same move a real tool loop makes.',
            toolCalls: [{ name: 'search', arguments: { query: 'streaming chat UI components' } }],
          }),
          turn(g, {
            text:
              'That row settled the way a real one does: announced by the model, answered by the host. ' +
              'Still the mock — every frame is tagged _kai_mock and usage reports zero tokens [1].',
            sources: [CITE_WIRE],
          }),
        ]
      : [
          turn(g, {
            reasoning: 'Second turn. Point at the seam.',
            text:
              "Still the mock. Swap `mockResponse(value)` for a fetch to your own route and nothing else in this handler changes — that's the whole point of the seam [1].",
            sources: [CITE_WIRE],
          }),
        ]),
    turn(g, {
      text: 'Mock again — the script cycles from the top after this. Edit MOCK_SCRIPT in this file to script your own conversation: it is data, not wiring.',
    }),
  ];
  return {
    replies,
    toolOutputs: opts.tools
      ? { search: { results: 3, top: 'AI/UI — streaming chat components (ui.kitn.ai)' } }
      : {},
  };
}

/** Build the scripted mock conversation for a construct: family by
 *  `inferTemplateId`, content types by the construct's own gates. */
export function mockScriptFor(c: Construct): MockScript {
  const g = gatesOf(c);
  const script = (() => {
    switch (inferTemplateId(c)) {
      case 'widget':
        return widgetScript(g);
      case 'inAppAssistant':
        return inAppAssistantScript(g);
      case 'assistant':
        return assistantScript(g);
      case 'research':
        return researchScript(g);
      case 'workspace':
        return workspaceScript(g);
      default:
        return genericScript(g);
    }
  })();
  // Keep the outputs map honest: only tools the surviving turns actually
  // announce. (A gate stripping a turn's fields never strips toolCalls today,
  // but the filter is what makes that impossible to get wrong later.)
  const announced = new Set(
    script.replies.flatMap((r) =>
      typeof r === 'string' ? [] : (r.toolCalls ?? []).map((t) => t.name),
    ),
  );
  const toolOutputs = Object.fromEntries(
    Object.entries(script.toolOutputs).filter(([name]) => announced.has(name)),
  );
  return { replies: script.replies, toolOutputs };
}
