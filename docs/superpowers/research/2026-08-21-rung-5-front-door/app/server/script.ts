/**
 * The scripted assistant.
 *
 * NO PROVIDER IS CONTACTED. This module hand-builds OpenAI chat-completions SSE
 * frames — the same shape every non-`mock` integration re-frames to server-side —
 * so the browser can read them with `readOpenAIStream` from `@kitn.ai/ui/wire`
 * and go live later by pointing that one `fetch` somewhere else.
 *
 * Why not `createMockResponder()` for everything: it cycles canned TEXT replies
 * and has no way to emit a tool call, and an ops console is nothing but tool
 * calls. So the scripted turns below are hand-built, and the responder is still
 * used verbatim for the fallback turn — see `fallbackFrames`.
 *
 * Every frame carries the kit's own mock tells (the `: kai-mock` banner, the
 * `_kai_mock` marker, `model: 'kai-mock'`, all-zero usage), imported from
 * `@kitn.ai/ui/state` rather than restated, so nothing here can be mistaken for
 * a real turn.
 */
import {
  MOCK_BANNER,
  MOCK_MARKER,
  MOCK_MARKER_KEY,
  MOCK_MODEL_ID,
  createMockResponder,
} from '@kitn.ai/ui/state';
import { toolNameForCardType } from '@kitn.ai/ui/schemas';
import { ALLOWED_CARD_TYPES, CARD, cards } from '../shared/cards.js';
import { DEPLOY_STEPS } from '../shared/run.js';

/** What the console asks for. `intent` is how the APP drives a follow-up turn. */
export interface ScriptRequest {
  prompt: string;
  intent?: string;
  params?: Record<string, unknown>;
}

interface CardCall {
  /** Envelope type; the tool name is derived, never typed out. */
  cardType: string;
  data: unknown;
}

interface ScriptedTurn {
  text: string;
  cards?: CardCall[];
}

const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-2'];

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/* ------------------------------------------------------------------ turns -- */

function deployParamsTurn(): ScriptedTurn {
  return {
    text:
      'Deploying **payments** to production needs two things I will not guess: the target region ' +
      'and the change ticket it is authorised under. Fill these in and I will draft the approval.',
    cards: [
      {
        cardType: CARD.parameters,
        data: {
          type: 'object',
          title: 'Deployment parameters',
          required: ['region', 'ticket'],
          properties: {
            region: {
              type: 'string',
              title: 'Region',
              description: 'Where the new revision lands first.',
              enum: REGIONS,
              default: 'us-east-1',
              'x-kai-widget': 'select',
            },
            ticket: {
              type: 'string',
              title: 'Change ticket',
              description: 'CHG-#### from the change calendar.',
              pattern: '^CHG-[0-9]{4}$',
              'x-kai-placeholder': 'CHG-4821',
            },
            note: {
              type: 'string',
              title: 'Operator note',
              description: 'Recorded on the run. Optional.',
              'x-kai-widget': 'textarea',
              'x-kai-placeholder': 'Anything the on-call should know.',
            },
          },
          'x-kai-order': ['region', 'ticket', 'note'],
          'x-kai-submitLabel': 'Draft the approval',
          'x-kai-dismissible': true,
        },
      },
    ],
  };
}

function deployApprovalTurn(params: Record<string, unknown> | undefined): ScriptedTurn {
  const region = str(params?.region, 'us-east-1');
  const ticket = str(params?.ticket, 'CHG-0000');
  const note = str(params?.note, '');
  return {
    text: `Ready. This ships **payments** to production in **${region}** under **${ticket}**.`,
    cards: [
      {
        cardType: CARD.approval,
        data: {
          heading: 'Deploy payments to production',
          body:
            `Region ${region} · ticket ${ticket}.\n` +
            'Five steps, canary first, migrations are forward-only and cannot be undone by the ' +
            'rollback button.' +
            (note ? `\n\nOperator note: ${note}` : ''),
          tone: 'danger',
          dismissible: true,
          actions: [
            { id: 'approve', label: 'Approve deploy', style: 'destructive', payload: { region, ticket, note } },
            { id: 'reject', label: 'Reject', style: 'default', default: true },
          ],
        },
      },
    ],
  };
}

function deployRunningTurn(params: Record<string, unknown> | undefined): ScriptedTurn {
  const region = str(params?.region, 'us-east-1');
  return {
    text:
      'Approved — the run is live. This checklist tracks the real run board and ticks as each ' +
      'step lands; the board itself is in the right-hand panel.',
    cards: [
      {
        cardType: CARD.checklist,
        data: {
          mode: 'progress',
          heading: `payments → production (${region})`,
          tasks: DEPLOY_STEPS.map((step) => ({
            id: step.id,
            label: step.label,
            description: step.description.replace('{{region}}', region).replace('{{sha}}', 'pending'),
            checked: false,
          })),
          allowEmpty: true,
          confirmLabel: 'Acknowledge',
        },
      },
    ],
  };
}

function rollbackTurn(params: Record<string, unknown> | undefined): ScriptedTurn {
  const runId = str(params?.runId, 'the current run');
  const service = str(params?.service, 'payments');
  return {
    text:
      'The run board asked for a rollback. That request came from another origin, so it is a ' +
      '**proposal** — it takes effect here or not at all.',
    cards: [
      {
        cardType: CARD.approval,
        data: {
          heading: `Roll back ${service}`,
          body:
            `Run ${runId}. Traffic returns to the previous revision step by step.\n` +
            'Applied migrations are NOT reverted — they are forward-only.',
          tone: 'danger',
          dismissible: true,
          actions: [
            { id: 'rollback', label: 'Roll back now', style: 'destructive', payload: { runId } },
            { id: 'reject', label: 'Keep the new revision', style: 'default', default: true },
          ],
        },
      },
    ],
  };
}

function strategyTurn(): ScriptedTurn {
  return {
    text: 'The queue workers can be restarted four ways. They differ in how much backlog you eat.',
    cards: [
      {
        cardType: CARD.options,
        data: {
          prompt: 'How should I restart the queue workers?',
          submitLabel: 'Use this strategy',
          dismissible: true,
          options: [
            {
              id: 'rolling',
              label: 'Rolling restart',
              description: 'One pod at a time, drain first. ~4 min, no backlog.',
              meta: '~4 min',
              recommended: true,
            },
            {
              id: 'blue-green',
              label: 'Blue/green',
              description: 'Stand up a parallel pool and cut over. Doubles cost briefly.',
              meta: '~7 min',
            },
            {
              id: 'drain-halt',
              label: 'Drain and halt',
              description: 'Finish in-flight jobs, then stop. Backlog grows until restart.',
              meta: '~2 min',
            },
            {
              id: 'hard',
              label: 'Hard restart',
              description: 'SIGKILL every worker. In-flight jobs are lost.',
              meta: 'instant',
            },
          ],
        },
      },
    ],
  };
}

const STRATEGY_LABEL: Record<string, string> = {
  rolling: 'a rolling restart',
  'blue-green': 'a blue/green cutover',
  'drain-halt': 'a drain and halt',
  hard: 'a hard restart',
};

function strategyConfirmTurn(params: Record<string, unknown> | undefined): ScriptedTurn {
  const option = str(params?.option, 'rolling');
  const label = STRATEGY_LABEL[option] ?? 'that strategy';
  const lossy = option === 'hard';
  return {
    text: `Understood — ${label}. One approval and I start it.`,
    cards: [
      {
        cardType: CARD.approval,
        data: {
          heading: 'Restart the queue workers',
          body: lossy
            ? 'A hard restart SIGKILLs every worker. In-flight jobs are lost, not retried.'
            : `Strategy: ${label}. In-flight jobs finish before each worker goes down.`,
          tone: lossy ? 'danger' : 'warning',
          dismissible: true,
          actions: [
            {
              id: 'apply-strategy',
              label: lossy ? 'Kill them anyway' : 'Start the restart',
              style: lossy ? 'destructive' : 'primary',
              payload: { option },
            },
            { id: 'reject', label: 'Not now', style: 'default', default: true },
          ],
        },
      },
    ],
  };
}

function rotateTurn(): ScriptedTurn {
  return {
    text:
      'Rotating the payments provider key invalidates the current one the moment the new one is ' +
      'written. Anything still holding the old key fails closed.',
    cards: [
      {
        cardType: CARD.approval,
        data: {
          heading: 'Rotate payments provider API key',
          body:
            'Writes a new key to the vault and revokes the current one.\n' +
            '3 services read this secret; each picks the new value up within 60s.',
          tone: 'danger',
          dismissible: true,
          actions: [
            { id: 'rotate', label: 'Rotate the key', style: 'destructive' },
            { id: 'stage', label: 'Stage only, do not revoke', style: 'primary' },
            { id: 'reject', label: 'Cancel', style: 'default', default: true },
          ],
        },
      },
    ],
  };
}

function boardTurn(): ScriptedTurn {
  return {
    text:
      'The run board is on the right. It is served by a **second local server on port 5175** — a ' +
      'different origin, framed through `<kai-remote>` — so it cannot touch this page. Its rollback ' +
      'button sends a request up the card bridge and I turn that into an approval card here.',
  };
}

/* ------------------------------------------------------------- dispatch --- */

/** The intents the APP drives directly, bypassing keyword matching. */
export type ScriptIntent =
  | 'deploy'
  | 'deploy-approval'
  | 'deploy-running'
  | 'rollback'
  | 'strategy'
  | 'strategy-confirm'
  | 'rotate'
  | 'board';

function routeOf(request: ScriptRequest): ScriptIntent | null {
  if (request.intent) return request.intent as ScriptIntent;
  const p = request.prompt.toLowerCase();
  if (/\broll ?back|\brevert\b/.test(p)) return 'rollback';
  if (/\bdeploy|\bship\b|\brelease\b|\bpromote\b/.test(p)) return 'deploy';
  if (/\brestart\b|\bstrateg|\bworker|\bqueue\b|\bscale\b/.test(p)) return 'strategy';
  if (/\brotate\b|\bcredential|\bsecret\b|\bapi key\b|\bkey\b/.test(p)) return 'rotate';
  if (/\bboard\b|\bstatus\b|\brun\b|\bhealth\b/.test(p)) return 'board';
  return null;
}

/**
 * The scripted turns stand in for a model that was handed `cardTools(cards, …)`.
 * A hand-written script can drift from that declaration in a way a real model
 * cannot, so it is checked against the registry rather than trusted: an envelope
 * type the console never registered would render as an unknown card with no
 * error, which is the failure this catches at the source.
 */
function assertScriptable(turn: ScriptedTurn | null): ScriptedTurn | null {
  for (const card of turn?.cards ?? []) {
    if (!ALLOWED_CARD_TYPES.has(card.cardType)) {
      throw new Error(
        `script: card type "${card.cardType}" is not in the console's registry ` +
          `(${cards.types.join(', ')}). Add it to shared/cards.ts or stop emitting it.`,
      );
    }
    const report = cards.validate(card.cardType, card.data);
    if (report && !report.ok) {
      throw new Error(`script: ${card.cardType} card does not satisfy its own schema: ${report.summary}`);
    }
  }
  return turn;
}

function turnFor(request: ScriptRequest): ScriptedTurn | null {
  return assertScriptable(pickTurn(request));
}

function pickTurn(request: ScriptRequest): ScriptedTurn | null {
  switch (routeOf(request)) {
    case 'deploy':
      return deployParamsTurn();
    case 'deploy-approval':
      return deployApprovalTurn(request.params);
    case 'deploy-running':
      return deployRunningTurn(request.params);
    case 'rollback':
      return rollbackTurn(request.params);
    case 'strategy':
      return strategyTurn();
    case 'strategy-confirm':
      return strategyConfirmTurn(request.params);
    case 'rotate':
      return rotateTurn();
    case 'board':
      return boardTurn();
    default:
      return null;
  }
}

/* ----------------------------------------------------------- SSE framing -- */

let frameSeq = 0;

function frame(delta: Record<string, unknown>, finishReason: string | null = null): string {
  frameSeq += 1;
  const payload = {
    id: `chatcmpl-kai-mock-${frameSeq}`,
    object: 'chat.completion.chunk',
    created: 0,
    model: MOCK_MODEL_ID,
    [MOCK_MARKER_KEY]: MOCK_MARKER,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function usageFrame(): string {
  frameSeq += 1;
  const payload = {
    id: `chatcmpl-kai-mock-${frameSeq}`,
    object: 'chat.completion.chunk',
    created: 0,
    model: MOCK_MODEL_ID,
    [MOCK_MARKER_KEY]: MOCK_MARKER,
    choices: [],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Split on whitespace but KEEP it, so the reassembled text still has its spaces. */
function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [];
}

/**
 * The fallback turn: the kit's own responder, used verbatim.
 *
 * MODULE scope, not per-request — the responder owns the cursor into its canned
 * replies, so rebuilding it per turn would answer with the first one forever.
 */
const mockResponse = createMockResponder({ delayMs: 18, announce: false });

async function* fallbackFrames(prompt: string): AsyncGenerator<string> {
  for await (const chunk of mockResponse(prompt)) yield chunk;
}

/**
 * One turn's worth of SSE frames.
 *
 * Text streams token by token; each card is emitted as a `kai_<type>` tool call
 * whose arguments arrive in slices, because that is what a real provider does
 * and the reader's accumulator is what has to cope with it.
 */
export async function* scriptFrames(request: ScriptRequest): AsyncGenerator<string> {
  const turn = turnFor(request);
  if (!turn) {
    // The kit's responder already emits its own banner and markers.
    yield* fallbackFrames(request.prompt);
    return;
  }

  yield `${MOCK_BANNER}\n\n`;
  yield frame({ role: 'assistant', content: '' });

  for (const token of tokenize(turn.text)) {
    yield frame({ content: token });
    await sleep(14);
  }

  const cards = turn.cards ?? [];
  for (const [index, card] of cards.entries()) {
    const callId = `call_${Date.now().toString(36)}_${index}`;
    // Fragment 1 announces id + name with no arguments, exactly as OpenAI does.
    yield frame({
      tool_calls: [
        { index, id: callId, type: 'function', function: { name: toolNameForCardType(card.cardType), arguments: '' } },
      ],
    });
    const args = JSON.stringify(card.data);
    for (let at = 0; at < args.length; at += 96) {
      yield frame({ tool_calls: [{ index, function: { arguments: args.slice(at, at + 96) } }] });
      await sleep(10);
    }
  }

  yield frame({}, cards.length > 0 ? 'tool_calls' : 'stop');
  yield usageFrame();
  yield 'data: [DONE]\n\n';
}
