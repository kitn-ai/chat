/**
 * `<page-version-card>` — this app's own generative-UI card: the compact row a
 * generated page gets in the conversation.
 *
 * THE CUSTOM-CARD CONTRACT (see NOTES.md — this half is not in the MCP):
 *  - the kit ASSIGNS properties on the tag it was given in `cardTypes`:
 *    `data` (the envelope's data), `cardId`, `heading` (envelope.title, only
 *    when set) and `resolution`. They are plain JS properties, not attributes,
 *    and they can arrive in any order and more than once.
 *  - it also sets a `theme` attribute and `data-card-id`.
 *  - a card talks BACK through `emitCardEvent(element, cardEvent)`, which
 *    dispatches the one protocol event, `kai-card`. It is deliberately
 *    `bubbles: true, composed: true` (one of the three documented exceptions to
 *    events-non-bubbling), so it escapes <kai-chat>'s shadow root and the host
 *    can route it with `listenForCardEvents`. That is how selecting a card
 *    reaches the preview panel.
 *
 * The element must be REGISTERED before the kit assigns those properties, so
 * this module self-registers at import time and main.tsx imports it eagerly.
 */
import { emitCardEvent } from '@kitn.ai/ui';

import type { PageVersionCardData } from './cards';

export const TAG = 'page-version-card';

/** The `CardEvent` action this card emits when it is chosen. */
export const SELECT_ACTION = 'select-version';

const STYLE = `
  :host { display: block; }
  button {
    display: flex; align-items: center; gap: .75rem; width: 100%;
    padding: .6rem .7rem; border-radius: calc(var(--radius, .625rem) - 2px);
    border: 1px solid var(--color-border, #e5e5e5);
    background: var(--color-surface, #fafafa);
    color: var(--color-foreground, #111); font: inherit; text-align: start; cursor: pointer;
    transition: border-color .12s ease, background .12s ease;
  }
  button:hover { background: var(--color-surface-strong, #f0f0f0); }
  button:focus-visible { outline: 2px solid var(--color-ring, #999); outline-offset: 2px; }
  :host([data-selected]) button { border-color: var(--color-primary, #111); background: var(--color-selected, var(--color-surface-strong, #f0f0f0)); }
  .thumb {
    flex: 0 0 auto; width: 34px; height: 34px; display: grid; place-items: center;
    border-radius: 8px; border: 1px solid var(--color-border, #e5e5e5);
    background: var(--color-background, #fff); font-size: 15px; line-height: 1;
  }
  .body { min-width: 0; flex: 1 1 auto; }
  .row { display: flex; align-items: baseline; gap: .4rem; }
  .label { font-weight: 650; font-size: .8rem; letter-spacing: .01em; }
  .title { font-size: .8rem; color: var(--color-muted-foreground, #666); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .summary { margin: .1rem 0 0; font-size: .75rem; color: var(--color-muted-foreground, #666);
             overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .end { flex: 0 0 auto; display: flex; align-items: center; gap: .45rem; }
  .size { font-size: .7rem; color: var(--color-muted-foreground, #666); font-variant-numeric: tabular-nums; }
  .pill {
    font-size: .65rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    padding: .1rem .4rem; border-radius: 999px;
    background: var(--color-primary, #111); color: var(--color-primary-foreground, #fff);
  }
  .open { font-size: .72rem; color: var(--color-muted-foreground, #666); }
`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class PageVersionCardElement extends HTMLElement {
  #data: PageVersionCardData | null = null;
  #cardId = '';
  #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.innerHTML = `<style>${STYLE}</style><button type="button" part="card"></button>`;
    this.#root.querySelector('button')!.addEventListener('click', () => this.#select());
  }

  /** Assigned by the kit from `CardEnvelope.data`. */
  set data(value: PageVersionCardData | null) {
    this.#data = value;
    this.#render();
  }
  get data(): PageVersionCardData | null {
    return this.#data;
  }

  /** Assigned by the kit from `CardEnvelope.id`. */
  set cardId(value: string) {
    this.#cardId = value;
  }
  get cardId(): string {
    return this.#cardId;
  }

  /** The kit also pushes these two; this card has no use for either. */
  set heading(_value: string | undefined) {}
  set resolution(_value: unknown) {}

  connectedCallback() {
    this.#render();
  }

  #select() {
    const data = this.#data;
    if (!data) return;
    // The kit's own emitter, not a hand-rolled dispatch: it is the one place
    // that knows the event name and that this event must bubble AND compose.
    emitCardEvent(this, {
      kind: 'action',
      cardId: this.#cardId,
      action: SELECT_ACTION,
      payload: { versionId: data.versionId },
    });
  }

  #render() {
    const btn = this.#root.querySelector('button');
    if (!btn) return;
    const d = this.#data;
    if (!d) {
      btn.innerHTML = '';
      return;
    }
    if (d.selected) this.setAttribute('data-selected', '');
    else this.removeAttribute('data-selected');

    btn.innerHTML = `
      <span class="thumb" aria-hidden="true">🖹</span>
      <span class="body">
        <span class="row">
          <span class="label">${esc(d.label)}</span>
          <span class="title">${esc(d.title)}</span>
        </span>
        <span class="summary">${esc(d.summary ?? d.fileName ?? '')}</span>
      </span>
      <span class="end">
        ${d.size ? `<span class="size">${esc(d.size)}</span>` : ''}
        ${d.selected ? '<span class="pill">In preview</span>' : '<span class="open">Open →</span>'}
      </span>`;
    btn.setAttribute('aria-label', `Show ${d.label} — ${d.title} — in the preview panel`);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get(TAG)) {
  customElements.define(TAG, PageVersionCardElement);
}
