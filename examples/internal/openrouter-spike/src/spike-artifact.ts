// <spike-artifact> — a CONSUMER-SIDE card type, registered by the app.
//
// It exists because the kit has no `artifact` entry in `BUILTIN_CARD_TAGS`:
// `<kai-artifact>` ships as an element but nothing maps a `card` part of type
// `artifact` onto it, so a model cannot reach it. `<kai-thread cardTypes>` is
// the documented extension point for exactly this, and taking it here is what
// makes S13 a measurement of the REAL gap (no id-keyed card upsert) instead of a
// measurement of a missing card type that a consumer can add in 40 lines.
//
// `CardTagSlot` sets `.data`, `.cardId`, `.heading` and `.resolution` as DOM
// PROPERTIES on whatever tag it is given, so that is the whole contract to meet.
export interface SpikeArtifactData {
  title?: string;
  body?: string;
}

const TAG = 'spike-artifact';

class SpikeArtifactElement extends HTMLElement {
  #data: SpikeArtifactData = {};

  set data(value: SpikeArtifactData) {
    this.#data = value ?? {};
    this.#render();
  }
  get data(): SpikeArtifactData {
    return this.#data;
  }

  // Accepted and ignored: CardTagSlot sets them on every card tag.
  cardId?: string;
  heading?: string;
  resolution?: unknown;

  connectedCallback(): void {
    this.#render();
  }

  #render(): void {
    if (!this.isConnected) return;
    this.replaceChildren();
    const frame = document.createElement('div');
    frame.className = 'spike-artifact';
    const head = document.createElement('div');
    head.className = 'spike-artifact-title';
    head.textContent = this.#data.title ?? 'Artifact';
    const body = document.createElement('pre');
    body.className = 'spike-artifact-body';
    body.textContent = this.#data.body ?? '';
    frame.append(head, body);
    this.append(frame);
  }
}

export function registerSpikeArtifact(): void {
  if (typeof customElements === 'undefined' || customElements.get(TAG)) return;
  customElements.define(TAG, SpikeArtifactElement);
}

/** The `cardTypes` map to hand `<kai-thread>`. */
export const SPIKE_CARD_TYPES: Record<string, string> = { artifact: TAG };
