/**
 * One assistant turn: POST the thread, read the reply, fold it onto the message.
 *
 * The kit parses and the consumer fetches. This module fetches from our own
 * `/api/chat` and hands the response straight to `readOpenAIStream` — there is
 * no hand-rolled SSE reader here, because every edge case in one (keep-alive
 * comments, multi-line frames, a codepoint split across chunks, tool-call
 * fragments arriving out of order) is already solved in `@kitn.ai/ui/wire`.
 */
import { createAssistantStream } from '@kitn.ai/ui/state';
import type { AssistantStream, CardEnvelope, ChatMessage, MessagePart } from '@kitn.ai/ui/state';
import type { AssistantStreamSink } from '@kitn.ai/ui/wire';
import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';
import { cardFromToolCall, isCardTool } from '@kitn.ai/ui/schemas';
import { approvalActionIdsFor, CARD, cards } from '../shared/cards';
import type { SetMessages } from './card-store';

export interface TurnOptions {
  /** Drives a specific scripted turn instead of matching on the prompt text. */
  intent?: string;
  params?: Record<string, unknown>;
  /** What the CONSOLE did about each card, by card id. See {@link CardOutcomes}. */
  outcomes?: CardOutcomes;
}

export interface TurnResult {
  /** Card envelopes this turn produced, in emission order. */
  cards: CardEnvelope[];
  error?: string;
  /** Cards this turn refused to render, or refused to render whole (a button
   *  removed), with the reason. Each is also written into the thread; this is
   *  for a caller that wants to branch on it. */
  cardErrors: string[];
}

/**
 * Say something in the thread that the ASSISTANT did not say.
 *
 * A card that could not be read is a fact about this turn, so it belongs in the
 * turn, not only in the console. The horizontal rule is load-bearing: appended
 * text merges into the trailing text part, and gluing "the card was rejected"
 * onto the model's half-finished sentence would read as the model saying it.
 */
function notice(stream: AssistantStream, text: string): void {
  stream.appendText(`\n\n---\n\n**${text}**`);
}

/* ------------------------------------------------------------ pollution ---- */

/**
 * Prototype-pollution keys, rejected HERE because nothing below rejects them.
 *
 * `cards.validate()` runs the kit's card validator, and that validator does not
 * implement `additionalProperties` at all — the exclusion is written down in
 * `primitives/card-validate-schemas.ts` — so an undeclared key is not a
 * validation failure in any card schema, and `cardSchemas.confirm` does not set
 * `additionalProperties: false` in the first place. The keys are INERT (JSON.parse
 * keeps them as own properties and nothing here spreads them onto a prototype),
 * but inert-and-silent is the case the repo's decide-loudly rule exists for: a
 * payload nobody will admit to receiving is exactly the payload worth naming.
 */
const POLLUTION_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** Every pollution key in `value`, as dotted paths. Own keys only, depth-limited. */
function pollutionKeysIn(value: unknown, path = 'data', depth = 0): string[] {
  if (depth > 8 || value === null || typeof value !== 'object') return [];
  const found: string[] = [];
  for (const key of Object.getOwnPropertyNames(value)) {
    const at = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
    if (POLLUTION_KEYS.has(key)) found.push(at);
    found.push(...pollutionKeysIn((value as Record<string, unknown>)[key], at, depth + 1));
  }
  return found;
}

/* ---------------------------------------------------------- action style --- */

/**
 * The `style` values the card schema allows, READ from the schema (D10).
 *
 * Not typed out here. The list lives in `cardSchemas.confirm`, the registry hands
 * it back through `validationSchemas`, and a copy in this file is a copy that
 * goes stale the moment the kit adds an eighth style.
 */
function allowedStyles(cardType: string): string[] | null {
  const schema = cards.validationSchemas[cardType] as unknown;
  let node: unknown = schema;
  for (const step of ['properties', 'actions', 'items', 'properties', 'style']) {
    node = node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[step] : undefined;
  }
  const values = node !== null && typeof node === 'object' ? (node as { enum?: unknown }).enum : undefined;
  return Array.isArray(values) ? values.map(String) : null;
}

/**
 * Replace an action style the schema does not allow, and say so (D10).
 *
 * The live model sent `style: "danger"`. Two warnings followed — one from
 * `cards.validate()` and one from `<kai-confirm>` — and the DESTRUCTIVE approval
 * then rendered with a default-styled button: the loudest thing on the card was
 * the thing that did not happen. The projected enum is a request to the model,
 * not a guarantee, so it is enforced here on arrival.
 *
 * The replacement is a NAMED default, never a guess at what the model meant:
 * mapping "danger" onto "destructive" would be this app inventing intent for a
 * button that fires an irreversible operation.
 */
function coerceActionStyles(envelope: CardEnvelope, warn: (message: string) => void): void {
  const allowed = allowedStyles(envelope.type);
  if (!allowed || allowed.length === 0) return;
  const data = envelope.data as { actions?: unknown } | null | undefined;
  if (!data || !Array.isArray(data.actions)) return;
  const fallback = allowed.includes('default') ? 'default' : allowed[0]!;
  for (const action of data.actions as Array<Record<string, unknown>>) {
    if (action === null || typeof action !== 'object') continue;
    const style = action.style;
    if (style === undefined || (typeof style === 'string' && allowed.includes(style))) continue;
    warn(
      `${envelope.type} action "${String(action.id ?? '?')}" asked for style ` +
        `"${String(style)}", which is not one of ${allowed.join(', ')}; using "${fallback}".`,
    );
    action.style = fallback;
  }
}

/* ------------------------------------------------------ action vocabulary -- */

/**
 * Strip approval actions this turn is not allowed to offer, and say so (N3).
 *
 * The enum pinned onto the tool schema is a request to the model; this is the
 * guarantee, and it is needed on exactly the same grounds D9's total switch was:
 * a provider may drop the enum, a hand-built envelope never saw it, and the card
 * that gets through is the one the operator clicks.
 *
 * The offending BUTTON is removed rather than the whole card, because in the
 * captured case the card also carried a legitimate approve/reject pair and
 * refusing all of it would take the operator's real decision away with it. If
 * nothing survives there is no decision left to take, and the card is refused.
 *
 * SCOPE, stated because it is a real limit and not an oversight: this runs only
 * on turns the APP drove, where it knows what it asked for. A free-form turn is
 * covered at the source instead — `server/chat.ts` pins the enum to
 * `DEFAULT_APPROVAL_ACTION_IDS` on exactly those requests, which is where the
 * captured N3 card came from. Enforcing here on an intent-less turn as well
 * would strip the mock script's own keyword-routed proposals (typing "roll back
 * the deploy" routes to a rollback card with no intent set), i.e. it would
 * reject the app's own trusted output. The residue is a real-mode model that
 * ignores its schema's enum on a free-form turn; `App`'s total switch catches
 * every id outside the vocabulary, and this is the one hole left in it.
 *
 * Returns false when the card must not be rendered at all.
 */
function enforceActionVocabulary(
  envelope: CardEnvelope,
  intent: string | undefined,
  refuse: (message: string) => void,
): boolean {
  if (!intent) return true;
  if (envelope.type !== CARD.approval) return true;
  const data = envelope.data as { actions?: unknown } | null | undefined;
  if (!data || !Array.isArray(data.actions)) return true;

  const allowed = approvalActionIdsFor(intent);
  const actions = data.actions as Array<Record<string, unknown>>;
  const kept = actions.filter(
    (action) =>
      action !== null && typeof action === 'object' && allowed.includes(String(action.id ?? '')),
  );
  if (kept.length === actions.length) return true;

  // Named with the LABEL as well as the id: the label is what the operator would
  // have read, and in the case this exists for the two disagreed.
  const removed = actions
    .filter((action) => !kept.includes(action))
    .map((action) => `\`${String(action?.id ?? '?')}\` ("${String(action?.label ?? '')}")`)
    .join(', ');

  if (kept.length === 0) {
    refuse(
      `A ${envelope.type} card was rejected: none of its actions — ${removed} — is one this ` +
        `turn can offer (${allowed.map((id) => `\`${id}\``).join(', ')}). Nothing was rendered.`,
    );
    return false;
  }

  data.actions = kept;
  refuse(
    `A button was removed from a ${envelope.type} card: ${removed} is not an action this turn ` +
      `can offer (${allowed.map((id) => `\`${id}\``).join(', ')}). The rest of the card stands.`,
  );
  return true;
}

/* ------------------------------------------------ projecting card outcomes -- */

/**
 * What the CONSOLE did about a card, keyed by card id.
 *
 * N2: the projection used to state the operator's CLICK ("the operator chose
 * \"deploy\""), which is not the same fact as what happened. In the live run the
 * model was told a deploy had been chosen, the console had in fact refused to
 * act on it, and the next turn reported a live 1-of-5 run while the board read
 * `idle`. A projection that can say something the board contradicts is worse
 * than no projection: it is a fiction with the app's authority behind it. So the
 * outcome is written by the code that DECIDED it, in `App.onCardAction`, from
 * the state the board itself reads back.
 */
export type CardOutcomes = Readonly<Record<string, string>>;

/** One line of history for a card the model can no longer see. */
function cardLine(envelope: CardEnvelope, outcomes: CardOutcomes = {}): string {
  const title = envelope.title ?? (envelope.data as { heading?: string } | undefined)?.heading ?? '';
  const head = `[card ${envelope.type}${title ? ` "${title}"` : ''} id=${envelope.id}]`;
  const resolution = envelope.resolution;
  if (!resolution) return `${head} proposed to the operator; still unanswered.`;
  // The outcome outranks the click wherever one was recorded: what the console
  // DID is the fact the next turn has to reason from.
  const outcome = outcomes[envelope.id];
  if (outcome) return `${head} ${outcome}`;
  switch (resolution.kind) {
    case 'action':
      return (
        `${head} the operator chose "${resolution.action}"` +
        (resolution.payload ? ` with ${JSON.stringify(resolution.payload)}` : '') +
        // Said explicitly, because the absence of an outcome is itself
        // information and the alternative is implying the console acted.
        '; the console recorded no outcome for it.'
      );
    case 'submit':
      return `${head} the operator submitted ${JSON.stringify(resolution.data)}.`;
    case 'dismissed':
      return `${head} the operator dismissed it without answering.`;
    case 'expired':
      return `${head} expired unanswered${resolution.reason ? ` (${resolution.reason})` : ''}.`;
  }
}

/**
 * Project card proposals and their resolutions into text the encoder KEEPS.
 *
 * `toOpenAIMessages` drops `card` parts by design — that is the kit's settled
 * silent-drop waiver, and it is the right call for the kit, because a card
 * envelope has no canonical provider representation. The consequence lands on
 * the app: without this, a live follow-up turn is sent a history in which the
 * console never proposed anything and the operator never approved anything, and
 * the model correctly answers that it has no record of an approval.
 *
 * So the app states the outcome itself, compactly, as an extra text part beside
 * each card. The card part is left in place (the encoder drops it either way),
 * and the projection is built for the REQUEST only — it never enters app state.
 */
export function withCardOutcomes(history: ChatMessage[], outcomes: CardOutcomes = {}): ChatMessage[] {
  let changed = false;
  const next = history.map((message) => {
    if (!message.parts.some((part) => part.type === 'card')) return message;
    changed = true;
    const parts: MessagePart[] = [];
    for (const part of message.parts) {
      parts.push(part);
      if (part.type === 'card') parts.push({ type: 'text', text: cardLine(part.envelope, outcomes) });
    }
    return { ...message, parts };
  });
  return changed ? next : history;
}

/**
 * Wrap the stream so CARD tool calls do not also render as tool panels.
 *
 * A card tool call is not a tool the console executes — it IS the card, and
 * `onToolCallReady` turns it into one. Left alone, the accumulator would also
 * push a `<kai-tool>` panel for the same call and every proposal would render
 * twice: once as a collapsed "kai_confirm" panel and once as the card. Tools
 * the app really does run are deliberately NOT suppressed; an ops console
 * should show its own work.
 *
 * The name arrives on the announce patch (`patch.type`), which is the first
 * moment the id can be classified, so the id is remembered from there on.
 *
 * ONE PATCH IS NOT SUPPRESSED: `state: 'output-error'`.
 *
 * That is the F-34 / F-22 class at app scale. When a card tool call cannot be
 * read — truncated `arguments`, a name that never arrived — the kit reports it
 * on exactly one channel, `sink.upsertTool(id, { state: 'output-error', … })`
 * (`wire/consume.ts`), and `onToolCallReady` is never called at all. Suppressing
 * every patch for a card id therefore suppressed the ONLY report that turn had,
 * and a corrupted proposal rendered as "Working on it." and stopped. The panel
 * is let through (the kit's own diagnostic) and `onCardToolError` says it in
 * words, because a collapsed panel is not a thing an operator reads.
 */
function cardAwareSink(
  stream: AssistantStream,
  onCardToolError: (toolCallId: string, message: string) => void,
): AssistantStreamSink {
  const cardCallIds = new Set<string>();
  return {
    appendText: (delta) => stream.appendText(delta),
    appendReasoning: (delta, opts) => stream.appendReasoning(delta, opts),
    addSource: (source) => stream.addSource(source),
    upsertTool: (toolCallId, patch) => {
      if (typeof patch.type === 'string' && isCardTool(patch.type)) cardCallIds.add(toolCallId);
      if (cardCallIds.has(toolCallId)) {
        if (patch.state !== 'output-error') return;
        onCardToolError(toolCallId, patch.errorText ?? 'The tool call could not be read.');
      }
      return stream.upsertTool(toolCallId, patch);
    },
  };
}

export async function runTurn(
  setMessages: SetMessages,
  history: ChatMessage[],
  options: TurnOptions = {},
): Promise<TurnResult> {
  const stream = createAssistantStream(setMessages);
  const emitted: CardEnvelope[] = [];
  const cardErrors: string[] = [];

  /** A card this turn produced but the console refused to draw. Said out loud on
   *  both channels: the thread (the operator) and the console (the producer). */
  const refuse = (message: string): void => {
    cardErrors.push(message);
    console.warn(`[assistant] ${message}`);
    notice(stream, message);
  };

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // withCardOutcomes FIRST: the encoder drops card parts, so the decisions
        // taken on those cards have to be stated as text before it runs.
        messages: toOpenAIMessages(withCardOutcomes(history, options.outcomes)),
        intent: options.intent,
        params: options.params,
      }),
    });

    const sink = cardAwareSink(stream, (toolCallId, message) => {
      // The kit's message ends with `Received N chars: <the raw fragment>`. That
      // fragment is MODEL OUTPUT, and pasting it into the conversation is the
      // thing this app refuses to do everywhere else; the tool panel and the
      // console warning both carry it in full for whoever is debugging.
      const sentence = message.split(' Received ')[0] ?? message;
      cardErrors.push(message);
      console.warn(`[assistant] A proposal could not be read (${toolCallId}): ${message}`);
      notice(stream, `A proposal could not be read and was not shown: ${sentence}`);
    });

    const turn = await readOpenAIStream(response, sink, {
      traceId: options.intent ?? 'operator-turn',
      onToolCallReady: (call) => {
        if (!isCardTool(call.name)) return;
        // `tool_call_id` becomes `CardEnvelope.id` UNCHANGED — that is what makes
        // a re-sent call revise the card in place instead of drawing a second one.
        const envelope = cardFromToolCall(call.name, call.input, { id: call.id });
        if (!envelope) return;
        // Rejected BEFORE the card reaches the thread, and rejected out loud.
        const polluted = pollutionKeysIn(envelope.data);
        if (polluted.length > 0) {
          refuse(
            `A ${envelope.type} card was rejected: its payload carries ` +
              // Backticked, and that is not cosmetic: the notice is rendered as
              // markdown, so a bare `data.__proto__` comes out as emphasised
              // "proto" and the notice names a key that is not the offending one.
              `prototype-pollution keys (${polluted.map((key) => `\`${key}\``).join(', ')}). ` +
              'Nothing was rendered.',
          );
          return;
        }
        // N3: what this turn is allowed to OFFER, enforced before anything is
        // rendered. Runs ahead of the style repair so a button that is about to
        // be removed does not also get a cosmetic fix on the way out.
        if (!enforceActionVocabulary(envelope, options.intent, refuse)) return;
        // Before validation: an unknown style is a card-shape defect the app can
        // repair, and repairing it first keeps the validation report about the
        // things the app cannot.
        coerceActionStyles(envelope, (message) => console.warn(`[assistant] ${message}`));
        const report = cards.validate(envelope.type, envelope.data);
        if (report && !report.ok) {
          // The card renderer will draw its own diagnostic; this is for whoever
          // has to fix the producer.
          console.warn(`[assistant] ${envelope.type} card failed validation: ${report.summary}`);
        }
        emitted.push(envelope);
        stream.addCard(envelope);
      },
    });

    if (turn.error) {
      // An IN-BAND provider failure: the headers were fine, the stream simply
      // stopped and said why (`server/chat.ts` re-frames a proxied mid-stream
      // failure exactly this way). It reaches us as ModelTurn.error, NOT as a
      // throw, so the catch below never sees it — and discarding it here is a
      // reply that stops mid-sentence with no error anywhere. abort() is the
      // same presentation the transport-drop path uses: the reason becomes a
      // text part in the thread, and any tool still in flight is settled.
      const reason = turn.error.message || 'The model stream failed mid-generation.';
      console.error('[assistant] in-band stream error', turn.error);
      stream.abort(reason);
      return { cards: emitted, error: reason, cardErrors };
    }
    return { cards: emitted, cardErrors };
  } catch (error) {
    // Without this a failed request is a permanently blank assistant bubble plus
    // an unhandled rejection. abort() puts the reason in the thread, where the
    // operator can actually read it.
    const reason = error instanceof Error && error.message ? error.message : 'The assistant is unreachable.';
    stream.abort(reason);
    console.error('[assistant]', error);
    return { cards: emitted, error: reason, cardErrors };
  } finally {
    // done() SETTLES the message: every mutation after it is dropped, which is
    // why the whole loop runs above it.
    stream.done();
  }
}
