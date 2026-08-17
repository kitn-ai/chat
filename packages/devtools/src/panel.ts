// The <kai-devtools> element: a launcher pill and a bottom drawer with a
// master/detail inspector.
//
// SHAPE. A launcher that opens a drawer, rather than an always-present box,
// because this thing sits on top of somebody else's application. The panel
// should be reachable in one click and invisible until then.
//
// METADATA ONLY. Everything rendered is a count, a size, a duration, an id, a
// variant name or a FIELD NAME. That is not caution for its own sake: the panel
// can run on a live site, so what a stranger who activates it can see has to be
// the SHAPE of a conversation and never its content.
import { PANEL_CSS } from './panel-css';
import {
  inspector,
  matchesQuery,
  statusCounts,
  STATUSES,
  streamRow,
} from './panel-view';
import { foldStreams, streamStatus, type StreamSummary } from './streams';
import type { WireDiagnosticEvent } from './contract';

/** A UI retention decision, which the capture model explicitly allows: once
 *  attached, the panel owns retention. */
const MAX_RAW_LINES = 200;

/** The panel's OWN storage key. It must never write the activation key --
 *  remembering that the drawer was open is not consent to record. */
const UI_KEY = 'kai-devtools:ui';

/** 42% of the viewport on a desktop, where the drawer shares the screen with
 *  the app being debugged -- but 62% on a narrow one, where the panes stack and
 *  the tool is effectively the whole screen anyway. At 42vh on a phone the
 *  stacked list and inspector were about two rows each, which is not a
 *  master/detail view so much as a rumour of one.
 *
 *  This is only the FIRST-RUN default; a height the developer chose is
 *  persisted and always wins. */
const DEFAULT_HEIGHT = () => {
  if (typeof window === 'undefined') return 336;
  const narrow = window.innerWidth <= 720;
  return Math.round(window.innerHeight * (narrow ? 0.62 : 0.42));
};
const MIN_HEIGHT = 180;
const maxHeight = () => Math.round((typeof window === 'undefined' ? 800 : window.innerHeight) * 0.85);

interface UiState {
  open: boolean;
  height: number;
}

function loadUi(): UiState {
  // Default OPEN on first activation. Somebody who just set the signal and
  // reloaded is looking for the panel; showing them a dot to find would read
  // as broken.
  const fallback: UiState = { open: true, height: DEFAULT_HEIGHT() };
  try {
    const raw = window.localStorage.getItem(UI_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<UiState>;
    return {
      open: typeof parsed.open === 'boolean' ? parsed.open : fallback.open,
      height: typeof parsed.height === 'number' ? parsed.height : fallback.height,
    };
  } catch {
    return fallback; // storage can throw, and a devtool must not take a page down
  }
}

function saveUi(state: UiState): void {
  try {
    window.localStorage.setItem(UI_KEY, JSON.stringify(state));
  } catch {
    // Not worth reporting: the panel still works, it just forgets.
  }
}

export class KaiDevtoolsElement extends HTMLElement {
  #events: WireDiagnosticEvent[] = [];
  #root: ShadowRoot;
  #ui: UiState;
  #selected: string | undefined;
  #filters = new Set<string>();
  #query = '';
  #dragFrom: { y: number; height: number } | undefined;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#ui = loadUi();
    this.#root.innerHTML = `<style>${PANEL_CSS}</style><div class="mount"></div>`;
    this.#root.addEventListener('click', this.#onClick);
    this.#root.addEventListener('input', this.#onInput);
    this.#root.addEventListener('keydown', this.#onKeydown);
    this.#root.addEventListener('pointerdown', this.#onPointerDown);
  }

  connectedCallback(): void {
    this.render();
  }

  disconnectedCallback(): void {
    this.#endDrag();
  }

  /** Feed one event. The panel keeps its own list because it owns retention
   *  once attached -- the kit has stopped buffering by then. */
  push(e: WireDiagnosticEvent): void {
    this.#events.push(e);
    this.render();
  }

  pushAll(events: readonly WireDiagnosticEvent[]): void {
    this.#events.push(...events);
    this.render();
  }

  // ── Interaction ────────────────────────────────────────────────────────

  #onClick = (event: Event) => {
    const target = event.target as HTMLElement;

    if (target.closest('.launcher')) return this.#setOpen(true);
    if (target.closest('[data-act="close"]')) return this.#setOpen(false);
    if (target.closest('[data-act="clear"]')) {
      this.#events = [];
      this.#selected = undefined;
      return this.render();
    }

    const pill = target.closest('[data-status]') as HTMLElement | null;
    if (pill) {
      const status = pill.dataset.status!;
      if (this.#filters.has(status)) this.#filters.delete(status);
      else this.#filters.add(status);
      return this.render();
    }

    const row = target.closest('.row') as HTMLElement | null;
    if (row) {
      const streams = this.#visible();
      const picked = streams[Number(row.dataset.index)];
      if (picked) {
        this.#selected = picked.streamId;
        this.render();
      }
    }
  };

  #onInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (!input.classList.contains('search')) return;
    this.#query = input.value;
    // Re-render, then restore the caret: the search field is replaced wholesale
    // on every keystroke and would otherwise lose focus after one character.
    const caret = input.selectionStart;
    this.render();
    const next = this.#root.querySelector('.search') as HTMLInputElement | null;
    if (next) {
      next.focus();
      if (caret !== null) next.setSelectionRange(caret, caret);
    }
  };

  #onKeydown = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = (e.target as HTMLElement).closest('.list');
    if (!list) return;
    e.preventDefault();
    const streams = this.#visible();
    if (streams.length === 0) return;
    // With nothing explicitly selected the list still SHOWS row 0 as selected
    // (render falls back to the first visible stream), so the keyboard has to
    // start from there. Starting from -1 made the first ArrowDown re-select the
    // row the user was already looking at, and the list appeared frozen.
    const at = streams.findIndex((s) => s.streamId === this.#selected);
    const current = at === -1 ? 0 : at;
    const next =
      e.key === 'ArrowDown'
        ? Math.min(current + 1, streams.length - 1)
        : Math.max(current - 1, 0);
    this.#selected = streams[next].streamId;
    this.render();
    (this.#root.querySelector('.list') as HTMLElement | null)?.focus();
  };

  #onPointerDown = (event: Event) => {
    const e = event as PointerEvent;
    const grip = (e.target as HTMLElement).closest('.grip');
    if (!grip) return;
    e.preventDefault();
    this.#dragFrom = { y: e.clientY, height: this.#ui.height };
    grip.classList.add('dragging');
    window.addEventListener('pointermove', this.#onPointerMove);
    window.addEventListener('pointerup', this.#endDrag);
  };

  #onPointerMove = (e: PointerEvent) => {
    if (!this.#dragFrom) return;
    // Dragging UP grows the drawer, so the delta is inverted.
    const next = this.#dragFrom.height + (this.#dragFrom.y - e.clientY);
    this.#ui.height = Math.max(MIN_HEIGHT, Math.min(maxHeight(), next));
    const drawer = this.#root.querySelector('.drawer') as HTMLElement | null;
    // Set the height directly during the drag: a full re-render per pointermove
    // would rebuild the tables underneath the cursor.
    if (drawer) drawer.style.height = `${this.#ui.height}px`;
  };

  #endDrag = () => {
    if (!this.#dragFrom) return;
    this.#dragFrom = undefined;
    window.removeEventListener('pointermove', this.#onPointerMove);
    window.removeEventListener('pointerup', this.#endDrag);
    this.#root.querySelector('.grip')?.classList.remove('dragging');
    saveUi(this.#ui);
  };

  #setOpen(open: boolean): void {
    this.#ui.open = open;
    saveUi(this.#ui);
    this.render();
  }

  // ── Derived state ──────────────────────────────────────────────────────

  #streams(): StreamSummary[] {
    return foldStreams(this.#events).streams;
  }

  /** The rows the list is showing, after both filters. Everything that needs to
   *  agree on "which row is index 3" goes through this. */
  #visible(): StreamSummary[] {
    return this.#streams().filter(
      (s) =>
        (this.#filters.size === 0 || this.#filters.has(streamStatus(s))) &&
        matchesQuery(s, this.#query),
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  render(): void {
    const mount = this.#root.querySelector('.mount');
    if (!mount) return;

    // Both panes are rebuilt wholesale, so their scroll offsets have to be
    // carried across. Without this, every arriving event snapped the tables
    // back to the top -- during a live stream that is dozens of times a second,
    // and it made the inspector impossible to read while it mattered most.
    const listTop = (this.#root.querySelector('.list') as HTMLElement | null)?.scrollTop;
    const inspectorTop = (this.#root.querySelector('.inspector') as HTMLElement | null)?.scrollTop;
    const restoreScroll = () => {
      const list = this.#root.querySelector('.list') as HTMLElement | null;
      if (list && listTop !== undefined) list.scrollTop = listTop;
      const inspect = this.#root.querySelector('.inspector') as HTMLElement | null;
      if (inspect && inspectorTop !== undefined) inspect.scrollTop = inspectorTop;
    };

    const all = this.#streams();
    const counts = statusCounts(all);
    const alert = counts.failed + counts.empty > 0;

    if (!this.#ui.open) {
      mount.innerHTML = `
        <button class="launcher" type="button" aria-label="Open kai devtools">
          <span class="brand">kai</span>
          <span class="count">${all.length}</span>
          ${alert ? '<span class="alert"></span>' : ''}
        </button>`;
      return; // no panes to restore
    }

    const visible = this.#visible();
    const selected = visible.find((s) => s.streamId === this.#selected) ?? visible[0];
    const version = this.getAttribute('hook-version') ?? '?';
    const legacy = this.hasAttribute('legacy') ? ' · legacy hook' : '';
    const { unknownTypes } = foldStreams(this.#events);
    const unknown = Object.keys(unknownTypes);

    mount.innerHTML = `
      <section class="drawer" style="height:${this.#ui.height}px">
        <div class="grip" title="Drag to resize"></div>
        <header class="bar">
          <span class="title">kai devtools</span>
          <span class="meta">hook v${version}${legacy} · ${this.#events.length} events</span>
          <div class="pills">
            ${STATUSES.map(
              (s) => `<button class="pill ${s}" type="button" data-status="${s}"
                        aria-pressed="${this.#filters.has(s) ? 'true' : 'false'}">
                        <span class="dot"></span>${s}<span class="n">${counts[s]}</span>
                      </button>`,
            ).join('')}
          </div>
          <span class="spacer"></span>
          <input class="search" type="text" placeholder="filter id, format, model, code"
                 value="${this.#query.replace(/"/g, '&quot;')}" />
          <button class="act" type="button" data-act="clear">Clear</button>
          <button class="act" type="button" data-act="close" aria-label="Close">Close</button>
        </header>
        <div class="split">
          <div class="list" role="listbox" tabindex="0" aria-label="Streams">
            ${
              visible.length === 0
                ? `<div class="empty"><div class="lead">${
                    all.length === 0 ? 'No streams yet' : 'No streams match'
                  }</div><div>${
                    all.length === 0
                      ? 'Trigger a request to see it here.'
                      : 'Clear the filter or a status pill.'
                  }</div></div>`
                : visible
                    .map((s, i) => streamRow(s, i, s.streamId === selected?.streamId))
                    .join('')
            }
          </div>
          <div class="inspector">
            ${inspector(selected, this.#events, MAX_RAW_LINES)}
            ${
              unknown.length > 0
                ? `<div class="unknown">${unknown
                    .map((n) => `${n} ×${unknownTypes[n]}`)
                    .join(', ')} — event type(s) this panel does not render.</div>`
                : ''
            }
          </div>
        </div>
      </section>`;

    restoreScroll();
  }
}

export function defineKaiDevtools(): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get('kai-devtools')) {
    customElements.define('kai-devtools', KaiDevtoolsElement);
  }
}
