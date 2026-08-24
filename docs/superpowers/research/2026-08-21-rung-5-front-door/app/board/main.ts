/**
 * The run board, served from origin #2 (http://localhost:5175).
 *
 * It is a `kitn-card` PROVIDER: `createCardBridge` waits for the host's `hello`,
 * negotiates a version, and mounts the renderer below when a `render` frame
 * arrives. Everything the board does flows through the `CardHost` it is handed —
 * there is no other channel to the console, and `postMessage` is never touched
 * here directly.
 *
 * The board owns NO authority. Rollback emits an `action` verb and stops; the
 * console decides whether that becomes a POST back to this server's API.
 */
import { createCardBridge } from '@kitn.ai/ui/provider';
import type { RemoteCardRenderer } from '@kitn.ai/ui/provider';
import type { JsonSchema } from '@kitn.ai/ui/schemas';
import type { RunState, RunStep } from '../shared/run';
import { ROLLBACK_ACTION, RUN_BOARD_CARD_TYPE, RUN_STATUS_LABEL } from '../shared/run';
import './board.css';

const root = document.getElementById('card-root');
const standalone = document.getElementById('standalone');
if (!root || !standalone) throw new Error('board: markup is missing #card-root / #standalone');

/* ------------------------------------------------------------ rendering --- */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  // textContent, never innerHTML: the run state is server data and the envelope
  // is model-adjacent, and neither has any business reaching a markup parser.
  if (text !== undefined) node.textContent = text;
  return node;
}

const STEP_GLYPH: Record<RunStep['state'], string> = {
  pending: '○',
  running: '◐',
  done: '●',
  reverted: '↩',
};

function renderSteps(steps: RunStep[]): HTMLElement {
  const list = el('ol', 'steps');
  if (steps.length === 0) {
    list.append(el('li', 'step empty', 'No steps — nothing has been deployed yet.'));
    return list;
  }
  for (const step of steps) {
    const item = el('li', `step step--${step.state}`);
    item.append(el('span', 'step__glyph', STEP_GLYPH[step.state]));
    const body = el('div', 'step__body');
    body.append(el('span', 'step__label', step.label));
    body.append(el('span', 'step__desc', step.description));
    item.append(body);
    item.append(el('span', 'step__state', step.state));
    list.append(item);
  }
  return list;
}

function renderPings(state: RunState): HTMLElement {
  const box = el('div', 'pings');
  box.append(el('h3', 'section__title', 'Health pings'));
  if (state.pings.length === 0) {
    box.append(el('p', 'pings__empty', 'Probing starts once the revision is live.'));
    return box;
  }
  const list = el('ul', 'pings__list');
  for (const ping of state.pings) {
    const row = el('li', `ping ping--${ping.ok ? 'ok' : 'bad'}`);
    row.append(el('span', 'ping__dot', '●'));
    row.append(el('span', 'ping__time', new Date(ping.at).toLocaleTimeString()));
    row.append(el('span', 'ping__status', String(ping.status)));
    row.append(el('span', 'ping__latency', `${ping.latencyMs} ms`));
    list.append(row);
  }
  box.append(list);
  return box;
}

interface BoardData {
  title?: string;
  hint?: string;
}

/**
 * The board's `data` schema.
 *
 * `createCardBridge` validates arriving `data` against this before mounting, so
 * a host that sends the wrong shape gets an inline diagnostic and an `error`
 * event instead of a half-drawn board.
 */
const BOARD_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', maxLength: 120 },
    hint: { type: 'string', maxLength: 240 },
  },
} satisfies JsonSchema;

const runBoardRenderer: RemoteCardRenderer = {
  type: RUN_BOARD_CARD_TYPE,
  schema: BOARD_SCHEMA,
  mount(mountRoot, envelope, host) {
    const data = (envelope.data ?? {}) as BoardData;
    mountRoot.classList.add('board');
    mountRoot.dataset.theme = host.context().theme.mode;

    const header = el('header', 'board__header');
    header.append(el('h2', 'board__title', data.title ?? 'Run board'));
    const status = el('span', 'badge', RUN_STATUS_LABEL.idle);
    header.append(status);
    mountRoot.append(header);

    const meta = el('dl', 'meta');
    mountRoot.append(meta);

    const stepsHost = el('section', 'section');
    stepsHost.append(el('h3', 'section__title', 'Deployment steps'));
    const stepsSlot = el('div');
    stepsHost.append(stepsSlot);
    mountRoot.append(stepsHost);

    const pingsSlot = el('section', 'section');
    mountRoot.append(pingsSlot);

    const footer = el('footer', 'board__footer');
    const rollback = el('button', 'danger', 'Roll back this deploy');
    rollback.type = 'button';
    rollback.disabled = true;
    const footnote = el(
      'p',
      'board__note',
      data.hint ??
        'Rollback is a REQUEST. It leaves this frame as a card event and only happens if the operator approves it in the console.',
    );
    footer.append(rollback, footnote);
    mountRoot.append(footer);

    let current: RunState | null = null;

    rollback.addEventListener('click', () => {
      if (!current) return;
      rollback.disabled = true;
      rollback.textContent = 'Rollback requested — awaiting the operator';
      host.emit({
        kind: 'action',
        cardId: envelope.id,
        action: ROLLBACK_ACTION,
        payload: { runId: current.runId, service: current.service, region: current.region },
      });
    });

    function paint(state: RunState): void {
      current = state;
      status.textContent = RUN_STATUS_LABEL[state.status];
      status.className = `badge badge--${state.status}`;

      meta.replaceChildren();
      const rows: Array<[string, string]> = [
        ['Run', state.runId],
        ['Service', state.service],
        ['Region', state.region],
        ['Ticket', state.ticket],
      ];
      for (const [term, value] of rows) {
        meta.append(el('dt', undefined, term));
        meta.append(el('dd', undefined, value));
      }

      stepsSlot.replaceChildren(renderSteps(state.steps));
      pingsSlot.replaceChildren(renderPings(state));

      const rollbackable = state.status === 'deploying' || state.status === 'healthy';
      rollback.disabled = !rollbackable;
      rollback.textContent = rollbackable
        ? 'Roll back this deploy'
        : state.status === 'rolling-back'
          ? 'Rolling back…'
          : state.status === 'rolled-back'
            ? 'Already rolled back'
            : 'Nothing to roll back';
    }

    // The board's own origin owns the run, so it reads it directly. This is the
    // reason the board is live at all: `<kai-remote>` reads `envelope` once at
    // mount and never pushes an update, so a board that waited to be TOLD the
    // state would freeze on the first frame.
    const feed = new EventSource('/api/run/stream');
    feed.addEventListener('message', (event) => {
      try {
        paint(JSON.parse(event.data) as RunState);
      } catch {
        host.emit({ kind: 'error', cardId: envelope.id, message: 'run feed sent an unreadable frame' });
      }
    });
    feed.addEventListener('error', () => {
      status.textContent = 'Run feed disconnected';
      status.className = 'badge badge--rolled-back';
    });

    return () => {
      feed.close();
      mountRoot.classList.remove('board');
    };
  },
};

const bridge = createCardBridge({ root, renderers: [runBoardRenderer] });
bridge.start();

// Opened directly rather than framed, there is no host to hand over a card.
if (window.parent === window) standalone.hidden = false;
