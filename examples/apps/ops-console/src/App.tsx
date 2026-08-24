/**
 * The ops console.
 *
 * One thread, one policy. Every card verb — an approval clicked in the chat, a
 * form submitted, a proposal dismissed, a rollback requested from a page on
 * ANOTHER ORIGIN — arrives at the same `CardPolicy` and is routed from there.
 * Nothing in the kit coordinates two elements for you (host-coordinates); this
 * component is that wiring, and there is deliberately only one copy of it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chat, Resizable, ResizableItem } from '@kitn.ai/ui/react';
import { applyResolution, dismissRecovery, listenForCardEvents } from '@kitn.ai/ui';
import type { CardEnvelope, CardEvent, CardPolicy, RecoveryToast } from '@kitn.ai/ui';
import { toast } from '@kitn.ai/ui/elements';
import type { ChatMessage } from '@kitn.ai/ui/state';
import { APPROVAL_ACTION_IDS, CARD, cards } from '../shared/cards';
import type { CardOutcomes } from './assistant';
import type { RunState } from '../shared/run';
import type { TasksCardShape } from './run-view';
import { checklistDataFor, runHeadline } from './run-view';
import { cardById, cardStore, cardsOf, replaceCard, revive, withCards } from './card-store';
import { runTurn } from './assistant';
import { RunBoardFrame } from './RunBoardFrame';
import {
  BOARD_CARD_SRC,
  BOARD_ORIGIN,
  resetRun,
  rollbackRun,
  startRun,
  useRunState,
} from './run-board';
import { ROLLBACK_ACTION, RUN_BOARD_CARD_TYPE } from '../shared/run';

const SUGGESTIONS = [
  'Deploy the payments service to production',
  'Restart the queue workers',
  'Rotate the payments provider API key',
  'What is on the run board?',
];

/** Map `dismissRecovery`'s toast shape onto the kit's imperative `toast()`. */
const toastAdapter: RecoveryToast = {
  show: ({ message, action, durationMs }) => {
    const handle = toast(message, {
      duration: durationMs,
      action: action ? { label: action.label, onAction: action.onClick } : undefined,
    });
    return { dismiss: handle.dismiss };
  },
};

function newId(): string {
  return crypto.randomUUID();
}

/** What a deploy has to be authorised by. Neither field has a defensible default. */
interface DeployContext {
  region: string;
  ticket: string;
  note?: string;
}

function nonEmpty(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : undefined;
}

/**
 * The deploy context carried by a payload, or nothing.
 *
 * Deliberately all-or-nothing: half a context is not a context, and the missing
 * half is precisely the field a default would have invented.
 */
/**
 * What the CONSOLE did about one card (N2).
 *
 * Stored as a RECORD, not as a finished sentence, so the wording is rendered
 * against the run board's state at the moment the history is sent rather than at
 * the moment the button was pressed. A run that has since been cleared must not
 * still be described to the model as live — that is the fiction N2 filed.
 */
type CardOutcomeRecord =
  | { kind: 'started'; region: string; ticket: string; runId: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'unhandled'; action: string }
  | { kind: 'rejected' }
  | { kind: 'noted'; text: string };

/** Render the outcomes against the run the BOARD is currently showing. */
function describeOutcomes(
  records: ReadonlyMap<string, CardOutcomeRecord>,
  run: RunState | null,
): CardOutcomes {
  const out: Record<string, string> = {};
  for (const [cardId, record] of records) {
    switch (record.kind) {
      case 'started': {
        const live = run && run.runId === record.runId;
        const done = live ? run.steps.filter((step) => step.state === 'done').length : 0;
        out[cardId] =
          `the operator approved it and the console STARTED the deploy of payments to ` +
          `${record.region} under ${record.ticket} (run ${record.runId}). ` +
          (live
            ? `The run board now reads "${run.status}", ${done} of ${run.steps.length} steps done.`
            : 'The run board no longer holds that run; it has been cleared or replaced.');
        break;
      }
      case 'refused':
        out[cardId] =
          `the operator approved it, but the console REFUSED to act on the approval: ` +
          `${record.reason} Nothing was deployed.`;
        break;
      case 'unhandled':
        out[cardId] =
          `the operator's click carried action id "${record.action}", which this console does ` +
          'not implement. Nothing was done.';
        break;
      case 'rejected':
        out[cardId] = 'the operator rejected it. Nothing ran.';
        break;
      case 'noted':
        out[cardId] = record.text;
        break;
    }
  }
  return out;
}

function deployContext(source: unknown): DeployContext | null {
  if (source === null || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const region = nonEmpty(record.region);
  const ticket = nonEmpty(record.ticket) ?? nonEmpty(record.change_ticket);
  if (!region || !ticket) return null;
  const note = nonEmpty(record.note);
  return note ? { region, ticket, note } : { region, ticket };
}

function userTurn(text: string): ChatMessage {
  return { id: newId(), role: 'user', parts: [{ type: 'text', text }] };
}

/** A line the CONSOLE says, not the assistant. Kept visually identical on purpose:
 *  the operator cares what the system reports, not which process said it. */
function systemNote(text: string): ChatMessage {
  return { id: newId(), role: 'assistant', parts: [{ type: 'text', text }] };
}

export default function App(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const { run, connected } = useRunState();

  /** Read the CURRENT thread at event time; a render closure would be stale. */
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  /** The `tasks` card that mirrors the live run, if one has been proposed. */
  const checklistIdRef = useRef<string | null>(null);

  /**
   * The region and change ticket the OPERATOR last supplied, and nothing else.
   *
   * Written only from a parameters form the operator submitted, or from an
   * approve payload that actually carried both fields (the scripted assistant
   * attaches them to the approve action; a real model does not have to). It is
   * never inferred from prose and never defaulted — see the refusal in
   * `approve` for why.
   */
  const deployContextRef = useRef<DeployContext | null>(null);

  /** What the console DID about each card, by card id (N2). */
  const outcomesRef = useRef<Map<string, CardOutcomeRecord>>(new Map());
  const recordOutcome = useCallback((cardId: string, record: CardOutcomeRecord) => {
    outcomesRef.current.set(cardId, record);
  }, []);

  /** The board's own state, read at event time; the render closure is stale. */
  const runRef = useRef<RunState | null>(run);
  runRef.current = run;

  const store = useMemo(() => cardStore(() => messagesRef.current, setMessages), []);

  /**
   * Dismiss is DEFERRAL, not deletion.
   *
   * A dismissed proposal keeps its envelope in the thread, stamped `dismissed`,
   * and collapses to a reopenable stub — filtering it out would destroy both the
   * undo and the record that it was ever proposed. `dismissRecovery` writes that
   * resolution immutably and raises the "Dismissed · Undo" toast.
   */
  const recovery = useMemo(
    () => dismissRecovery({ ...store, toast: toastAdapter, undoMs: 8000 }),
    [store],
  );

  /* ------------------------------------------------------- resolving ----- */

  /**
   * Record that a card was resolved, and hand back the thread that says so.
   *
   * Routing and recording are two different jobs and BOTH have to happen: the
   * policy decides what a verb does, and this stamps the envelope so a
   * re-render draws the resolved card instead of live buttons again.
   *
   * It is synchronous, and returns the new thread, because several handlers
   * immediately start a follow-up turn from the current thread. Reading the
   * thread back out of a ref there would race the stamp and the follow-up would
   * be built on a thread where the card still looked unanswered — which is how
   * an approval silently un-approves itself one render later.
   */
  const resolveCard = useCallback((event: CardEvent): ChatMessage[] => {
    const before = messagesRef.current;
    const envelopes = cardsOf(before);
    const after = applyResolution(envelopes, event);
    // Non-terminal verb, or a card that is not in this thread (the remote board
    // is one): `applyResolution` hands back the same array and there is nothing
    // to record.
    if (after === envelopes) return before;
    const byId = new Map(after.map((envelope) => [envelope.id, envelope]));
    const next = withCards(before, (envelope) => byId.get(envelope.id) ?? envelope);
    messagesRef.current = next;
    setMessages(next);
    return next;
  }, []);

  /* ------------------------------------------------------------ turns ----- */

  const ask = useCallback(
    async (history: ChatMessage[], intent?: string, params?: Record<string, unknown>) => {
      setMessages(history);
      setLoading(true);
      try {
        // The outcomes are rendered HERE, against the board's current state, so
        // the history the model is sent cannot contradict the board (N2).
        return await runTurn(setMessages, history, {
          intent,
          params,
          outcomes: describeOutcomes(outcomesRef.current, runRef.current),
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const onSubmit = useCallback(
    (event: CustomEvent<{ value: string }>) => {
      const value = event.detail.value.trim();
      if (!value || loading) return;
      void ask([...messagesRef.current, userTurn(value)]);
    },
    [ask, loading],
  );

  /* ----------------------------------------------------------- undo ------- */

  /** Clear a card's resolution, putting the proposal back on the table. */
  const restore = useCallback((cardId: string) => {
    setMessages((prev) =>
      withCards(prev, (envelope) => {
        if (envelope.id !== cardId || !envelope.resolution) return envelope;
        const { resolution: _dropped, ...live } = envelope;
        // `revive` is what makes the card DROP its own optimistic resolution;
        // clearing the envelope's alone leaves it looking answered.
        return revive(envelope, live as CardEnvelope);
      }),
    );
  }, []);

  /** A rejection is undoable for as long as the toast is up. */
  const offerUndo = useCallback(
    (cardId: string, message: string) => {
      toast(message, {
        duration: 8000,
        action: {
          label: 'Undo',
          onAction: () => {
            restore(cardId);
            toast.success('Proposal restored — it is live again.');
          },
        },
      });
    },
    [restore],
  );

  /* --------------------------------------------------------- the policy --- */

  const onCardAction = useCallback(
    async (cardId: string, action: string, payload?: unknown) => {
      const params = (payload ?? {}) as Record<string, unknown>;
      const thread = resolveCard({ kind: 'action', cardId, action, payload });

      switch (action) {
        case 'approve': {
          /**
           * REFUSE rather than invent.
           *
           * This used to read `String(params.ticket ?? 'CHG-0000')`. The scripted
           * assistant attaches `{ region, ticket }` to its approve action, so
           * mock mode never noticed; a real model's approve action carries no
           * payload at all, and the console quietly recorded a production deploy
           * against change ticket **CHG-0000** — an audit field, fabricated, on
           * a run the operator had explicitly ticketed. A default here is not a
           * convenience, it is a false record.
           *
           * So: take the payload if it carries a whole context, else the one the
           * operator actually typed into the parameters form, else stop and say
           * what is missing. The approval still stands; nothing is deployed.
           */
          const context = deployContext(params) ?? deployContextRef.current;
          if (!context) {
            recordOutcome(cardId, {
              kind: 'refused',
              reason: 'the approval carried no region and no change ticket, and none had been supplied.',
            });
            setMessages((prev) => [
              ...prev,
              systemNote(
                'Approved, but the approval carried no region and no change ticket, and ' +
                  'none has been supplied in this conversation. **Nothing was deployed** — ' +
                  'a production run is not recorded against a made-up ticket. Tell me the ' +
                  'region and the change ticket and I will put the approval back on the table.',
              ),
            ]);
            toast('Approval refused: no region and no change ticket.', {
              variant: 'error',
              duration: 8000,
            });
            return;
          }
          deployContextRef.current = context;
          const started = await startRun({
            service: 'payments',
            region: context.region,
            ticket: context.ticket,
          });
          if (!started) {
            recordOutcome(cardId, {
              kind: 'refused',
              reason: `the run board on ${BOARD_ORIGIN} did not answer.`,
            });
            setMessages((prev) => [
              ...prev,
              systemNote(
                `Approved, but the run board on ${BOARD_ORIGIN} did not answer. ` +
                  'Nothing was deployed. Is `npm run dev` running both servers?',
              ),
            ]);
            return;
          }
          // `started` IS the board's own state, echoed back from the start call —
          // the same object the board renders. Recording the run id from it is
          // what lets the projection be checked against the board later.
          recordOutcome(cardId, {
            kind: 'started',
            region: started.region,
            ticket: started.ticket,
            runId: started.runId,
          });
          const result = await ask(messagesRef.current, 'deploy-running', { ...context });
          const checklist = result.cards.find((card) => card.type === CARD.checklist);
          checklistIdRef.current = checklist?.id ?? null;
          return;
        }

        case 'rollback': {
          const rolled = await rollbackRun();
          recordOutcome(
            cardId,
            rolled
              ? { kind: 'noted', text: 'the operator approved the rollback and the console started it.' }
              : { kind: 'refused', reason: 'the run board did not answer, so nothing was rolled back.' },
          );
          if (rolled) toast.success('Rollback started. Watch the board unwind.');
          else toast('The run board did not answer; nothing was rolled back.', { variant: 'error' });
          return;
        }

        case 'reject':
          recordOutcome(cardId, { kind: 'rejected' });
          offerUndo(cardId, 'Rejected. Nothing ran.');
          return;

        case 'rotate':
          recordOutcome(cardId, { kind: 'noted', text: 'the console rotated the key; the old key is revoked.' });
          toast.success('Key rotated. The old key is revoked.');
          return;

        case 'stage':
          recordOutcome(cardId, {
            kind: 'noted',
            text: 'the console staged a new key without revoking; the current key still works.',
          });
          toast('New key staged. The current key still works.', { variant: 'info' });
          return;

        case 'apply-strategy': {
          const option = String(params.option ?? 'rolling');
          recordOutcome(cardId, { kind: 'noted', text: `the console started a ${option} restart.` });
          toast.success(`Restart started (${option}).`);
          return;
        }

        case ROLLBACK_ACTION: {
          // Came in over the iframe bridge from the board on the OTHER origin.
          // A remote card cannot act on its own: it proposes, and the decision
          // is taken here, in the conversation, by the operator.
          await ask(thread, 'rollback', params);
          return;
        }

        case '__other__': {
          const text = String((params.text as string | undefined) ?? '').trim();
          setMessages((prev) => [
            ...prev,
            systemNote(text ? `Noted: “${text}”. Nothing has been run.` : 'Noted. Nothing has been run.'),
          ]);
          return;
        }

        default: {
          // A `choice` option's id is the model's own vocabulary and legitimately
          // free-form: the choice itself is not consequential, so it is followed
          // by an approval that is.
          const chosen = cardById(thread, cardId);
          if (chosen?.type === CARD.options) {
            await ask(thread, 'strategy-confirm', { option: action });
            return;
          }

          /**
           * D9 — THE SWITCH IS TOTAL. An action id nobody implements is refused
           * out loud, in the thread, naming the id.
           *
           * This branch used to raise a transient toast and return. A live model
           * invented `deploy` / `decline` / `cancel` in place of
           * `approve` / `reject`, so every live Approve landed here: the card
           * stamped itself resolved ("✓ Deploy to production"), a toast blinked,
           * and NOTHING happened — no run, no refusal, no record, and D5's own
           * refusal path unreachable because control never got that far. A
           * button on an approval card that does nothing and says nothing is the
           * worst failure this app has.
           *
           * The enum pinned onto the tool schema in `server/chat.ts` is the other
           * half, and it is the half that stops it happening. This half is what
           * makes it VISIBLE when it happens anyway — a hand-built envelope, a
           * provider that drops the enum, a model that ignores it.
           */
          const known = APPROVAL_ACTION_IDS.join(', ');
          recordOutcome(cardId, { kind: 'unhandled', action });
          console.warn(
            `[card ${cardId}] unimplemented action id "${action}"` +
              `${chosen ? ` on a ${chosen.type} card` : ''}; this console implements: ${known}.`,
          );
          setMessages((prev) => [
            ...prev,
            systemNote(
              `That button asked for the action \`${action}\`, which this console does not ` +
                `implement, so **nothing was done**. The actions it can carry out are ` +
                `\`${APPROVAL_ACTION_IDS.join('`, `')}\`. The proposal has not been acted on.`,
            ),
          ]);
          toast(`Nothing was done: unimplemented action “${action}”.`, {
            variant: 'error',
            duration: 8000,
          });
        }
      }
    },
    [ask, offerUndo, recordOutcome, resolveCard],
  );

  const onCardSubmit = useCallback(
    async (cardId: string, data: unknown) => {
      const thread = resolveCard({ kind: 'submit', cardId, data });
      const card = cardById(thread, cardId);
      if (card?.type === CARD.parameters) {
        // The one place a deploy context legitimately enters the console: the
        // operator typed it. Remembered so an approval that carries no payload
        // can still be authorised by real values instead of invented ones.
        const supplied = deployContext(data);
        if (supplied) deployContextRef.current = supplied;
        await ask(thread, 'deploy-approval', (data ?? {}) as Record<string, unknown>);
        return;
      }
      if (card?.type === CARD.checklist) {
        toast.success('Checklist acknowledged.');
        return;
      }
      toast('Submission recorded.');
    },
    [ask, resolveCard],
  );

  /**
   * The live policy. Rebuilt every render because it closes over fresh
   * callbacks; the STABLE facade below is what is actually attached, so the
   * listener is installed once and still sees the current handlers.
   */
  const livePolicy: CardPolicy = useMemo(
    () => ({
      onAction: (cardId, action, payload) => {
        void onCardAction(cardId, action, payload);
      },
      onSubmit: (cardId, data) => {
        void onCardSubmit(cardId, data);
      },
      onDismiss: (cardId) => recovery.onDismiss(cardId),
      onReopen: (cardId) => recovery.onReopen(cardId),
      onError: (cardId, message) => {
        console.warn(`[card ${cardId}]`, message);
        toast(`A card reported a problem: ${message}`, { variant: 'error', duration: 6000 });
      },
      // A card may never send a prompt silently on the operator's behalf.
      maxSendPromptMode: 'compose',
    }),
    [onCardAction, onCardSubmit, recovery],
  );

  const policyRef = useRef<CardPolicy>(livePolicy);
  policyRef.current = livePolicy;

  const policy = useMemo<CardPolicy>(
    () => ({
      onAction: (cardId, action, payload) => policyRef.current.onAction?.(cardId, action, payload),
      onSubmit: (cardId, data) => policyRef.current.onSubmit?.(cardId, data),
      onSendPrompt: (text, opts) => policyRef.current.onSendPrompt?.(text, opts),
      onOpen: (url, target) => policyRef.current.onOpen?.(url, target),
      onState: (cardId, patch) => policyRef.current.onState?.(cardId, patch),
      onDismiss: (cardId) => policyRef.current.onDismiss?.(cardId),
      onReopen: (cardId) => policyRef.current.onReopen?.(cardId),
      onError: (cardId, message) => policyRef.current.onError?.(cardId, message),
      maxSendPromptMode: 'compose',
    }),
    [],
  );

  /* ------------------------------------------------- attaching the policy -- */

  const [chatEl, setChatEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!chatEl) return;
    /**
     * `kai-card` is the ONE protocol event that bubbles and composes, which is
     * why a card buried in the thread's shadow DOM can be heard from the host
     * element. `<kai-chat>` carries no `policy` prop — this listener IS the
     * routing layer for cards drawn inside it.
     */
    return listenForCardEvents(chatEl, policy);
  }, [chatEl, policy]);

  /* ------------------------------------------- the checklist tracks the run */

  useEffect(() => {
    const cardId = checklistIdRef.current;
    if (!cardId || !run) return;
    setMessages((prev) => {
      const current = cardById(prev, cardId);
      if (!current) return prev;
      const data = checklistDataFor(run) satisfies TasksCardShape;
      // upsert-by-id semantics: the envelope arrives WHOLE, last write wins.
      return replaceCard(prev, { ...current, data });
    });
  }, [run]);

  /* ---------------------------------------------------- the remote board -- */

  /**
   * Mounted ONCE, and that is not an optimisation.
   *
   * `<kai-remote>` reads `envelope` at mount and never re-sends it, so a new
   * object here would either be ignored or (with a changing React key) tear the
   * iframe down and redo the handshake on every tick. The board is live because
   * it reads the run feed from its OWN origin, not because the host pushes to it.
   */
  const boardEnvelope = useMemo(
    () => ({
      type: RUN_BOARD_CARD_TYPE,
      id: 'run-board',
      title: 'Run board',
      data: {
        title: 'payments · production',
        hint: 'Rollback here is a REQUEST. It leaves this frame as a card event and only happens if you approve it in the conversation.',
      },
    }),
    [],
  );

  const onReset = useCallback(async () => {
    checklistIdRef.current = null;
    // Clearing the run clears its authorisation too: the next deploy is a new
    // decision and must carry its own ticket.
    deployContextRef.current = null;
    const reset = await resetRun();
    // The outcomes stay: "started, and the board no longer holds that run" is
    // what happened, and `describeOutcomes` renders exactly that once the board
    // is idle. Dropping them would put the history back to stating the click.
    if (reset) toast('Run board cleared.');
    else toast('The run board did not answer.', { variant: 'error' });
  }, []);

  /* ------------------------------------------------------------ render ---- */

  return (
    <div className="console">
      <header className="console__bar">
        <div className="console__brand">
          <span className="console__dot" aria-hidden="true" />
          <strong>Ops console</strong>
          <span className="console__env">production</span>
        </div>
        <div className="console__status">
          <span className={`console__pill console__pill--${run?.status ?? 'idle'}`}>
            {runHeadline(run, connected)}
          </span>
          <button type="button" className="console__reset" onClick={() => void onReset()}>
            Clear run
          </button>
        </div>
      </header>

      <Resizable orientation="horizontal" className="console__body">
        <ResizableItem min="360px">
          <Chat
            ref={setChatEl}
            theme="dark"
            chatTitle="Operations assistant"
            placeholder="Ask for something consequential…"
            messages={messages}
            loading={loading}
            suggestions={SUGGESTIONS}
            suggestionMode="submit"
            persistSuggestions
            cardTypes={cards.tags}
            cardSchemas={cards.validationSchemas}
            onSubmit={onSubmit}
            style={{ height: '100%' }}
          />
        </ResizableItem>

        <ResizableItem size="34%" min="300px" max="52%">
          <aside className="panel">
            <div className="panel__head">
              <h2>Run board</h2>
              <span className="panel__origin" title="A different origin, framed through kai-remote">
                {BOARD_ORIGIN}
              </span>
            </div>
            <div className="panel__frame">
              <RunBoardFrame
                src={BOARD_CARD_SRC}
                providerOrigin={BOARD_ORIGIN}
                envelope={boardEnvelope}
                policy={policy}
              />
            </div>
          </aside>
        </ResizableItem>
      </Resizable>
    </div>
  );
}
