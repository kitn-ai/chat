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
import { CARD, cards } from '../shared/cards';
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
        return await runTurn(setMessages, history, { intent, params });
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
          const started = await startRun({
            service: 'payments',
            region: String(params.region ?? 'us-east-1'),
            ticket: String(params.ticket ?? 'CHG-0000'),
          });
          if (!started) {
            setMessages((prev) => [
              ...prev,
              systemNote(
                `Approved, but the run board on ${BOARD_ORIGIN} did not answer. ` +
                  'Nothing was deployed. Is `npm run dev` running both servers?',
              ),
            ]);
            return;
          }
          const result = await ask(messagesRef.current, 'deploy-running', params);
          const checklist = result.cards.find((card) => card.type === CARD.checklist);
          checklistIdRef.current = checklist?.id ?? null;
          return;
        }

        case 'rollback': {
          const rolled = await rollbackRun();
          if (rolled) toast.success('Rollback started. Watch the board unwind.');
          else toast('The run board did not answer; nothing was rolled back.', { variant: 'error' });
          return;
        }

        case 'reject':
          offerUndo(cardId, 'Rejected. Nothing ran.');
          return;

        case 'rotate':
          toast.success('Key rotated. The old key is revoked.');
          return;

        case 'stage':
          toast('New key staged. The current key still works.', { variant: 'info' });
          return;

        case 'apply-strategy':
          toast.success(`Restart started (${String(params.option ?? 'rolling')}).`);
          return;

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
          // Every remaining action id is a `choice` option; the choice itself is
          // not consequential, so it is followed by an approval that is.
          const chosen = cardById(thread, cardId);
          if (chosen?.type === CARD.options) {
            await ask(thread, 'strategy-confirm', { option: action });
            return;
          }
          toast(`Unhandled action “${action}”.`, { variant: 'warning' });
        }
      }
    },
    [ask, offerUndo, resolveCard],
  );

  const onCardSubmit = useCallback(
    async (cardId: string, data: unknown) => {
      const thread = resolveCard({ kind: 'submit', cardId, data });
      const card = cardById(thread, cardId);
      if (card?.type === CARD.parameters) {
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
    const reset = await resetRun();
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
