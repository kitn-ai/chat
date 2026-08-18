// The <kai-devtools> element: a shadow root, the kit's compiled CSS adopted
// into it, and the Solid view rendered inside.
//
// The element owns exactly two things -- the event buffer and the mount -- so
// everything else stays in plain Solid components that can be reasoned about
// without a custom element in the picture.
import { createSignal, type Setter } from 'solid-js';
import { render } from 'solid-js/web';
import { adoptPanelCss } from './panel-css';
import { PanelApp } from './panel-app';
import type { WireDiagnosticEvent } from './contract';

export class KaiDevtoolsElement extends HTMLElement {
  #root: ShadowRoot;
  // Created at CONSTRUCTION, not on connect. The entry drains the hook's
  // buffered history into `push()` before appending the element, so a signal
  // made in connectedCallback would silently swallow the whole session --
  // exactly the events someone activated the panel to see.
  #events: () => WireDiagnosticEvent[];
  #setEvents: Setter<WireDiagnosticEvent[]>;
  #dispose: (() => void) | undefined;
  #stopTheme: (() => void) | undefined;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    // BEFORE anything renders. Adopting after the first paint is the kit's own
    // documented gotcha: the panel flashes unstyled.
    adoptPanelCss(this.#root);
    const [events, setEvents] = createSignal<WireDiagnosticEvent[]>([]);
    this.#events = events;
    this.#setEvents = setEvents;
  }

  connectedCallback(): void {
    if (this.#dispose) return;
    const host = document.createElement('div');
    // Follow the system the way the kit's own elements do at their default
    // `theme="auto"`. The panel sits on top of somebody's app; picking a mode
    // it did not ask for is the kind of inconsistency this rewrite exists to
    // remove. `.dark` is the scope the kit's tokens key off.
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : undefined;
    const applyTheme = () => host.classList.toggle('dark', media?.matches ?? false);
    applyTheme();
    media?.addEventListener('change', applyTheme);
    this.#stopTheme = () => media?.removeEventListener('change', applyTheme);

    this.#root.appendChild(host);
    this.#dispose = render(
      () =>
        PanelApp({
          events: this.#events,
          hookVersion: () => {
            const v = this.getAttribute('hook-version');
            return v === null ? undefined : Number(v);
          },
          payload: () => this.hasAttribute('payload'),
        }),
      host,
    );
  }

  disconnectedCallback(): void {
    this.#dispose?.();
    this.#dispose = undefined;
    this.#stopTheme?.();
    this.#stopTheme = undefined;
  }

  /** Feed one event. The panel owns retention once attached -- the kit has
   *  stopped buffering by then. A NEW array each time, because that reference is
   *  what tells Solid anything changed. */
  push(e: WireDiagnosticEvent): void {
    this.#setEvents((prev) => [...prev, e]);
  }

  pushAll(events: readonly WireDiagnosticEvent[]): void {
    if (events.length === 0) return;
    this.#setEvents((prev) => [...prev, ...events]);
  }
}

export function defineKaiDevtools(): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get('kai-devtools')) {
    customElements.define('kai-devtools', KaiDevtoolsElement);
  }
}
