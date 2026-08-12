// The CONSUMER half of the card contract: a card type the kit does not ship,
// registered through the documented `cardTypes` seam and drawn by this app's own
// custom element.
//
// WHY THIS EXISTS, AND WHY IT IS ON THE NORMAL PATH
// ------------------------------------------------
// The seam used to have exactly one end-to-end user: S13 registered
// `<spike-artifact>` because the kit shipped no `artifact` card. When `artifact`
// landed as the 7th built-in, the workaround was correctly deleted — and took the
// seam's only end-to-end coverage with it, silently. Nothing went red, because
// nothing was measuring the seam; the seam was measuring the missing feature.
//
// COVERAGE THAT EXISTS ONLY BECAUSE SOMETHING IS MISSING IS COVERAGE ON A TIMER.
// So this is deliberately NOT a bespoke scenario that reaches for the seam. The
// `weather` card hangs off `get_weather` — the spike's most-used tool, in the
// DEFAULT interactive tool set (`toolsFor`) and offered by seven catalog
// scenarios. A consumer card is now what the app ORDINARILY renders when the
// model checks the weather, so breaking `cardTypes` breaks the normal path and
// several existing cells go red at once. That is the same reasoning as the kit's
// own `isCardTool`, which tests the `kai_` prefix rather than membership in the
// built-ins, precisely so a consumer-registered type travels the ordinary path.
//
// `cards.test.ts` holds the other half: it fails the day `weather` becomes a kit
// built-in, so this cannot quietly turn back into a workaround measuring itself.
//
// NO NODE, NO DOM AT MODULE SCOPE. `cards.test.ts` runs under the spike's
// node-environment vitest, so the element class is declared INSIDE
// `registerSpikeCards()` and `HTMLElement` is never touched on import.

/** The envelope type. The kit ships seven built-ins and this is not one of them —
 *  `cards.test.ts` checks that against `BUILTIN_CARD_TAGS` rather than restating
 *  the list. */
export const WEATHER_CARD_TYPE = 'weather';

/** The element the app draws it with. Anything but a `kai-*` tag: the point is
 *  that this is the consumer's own component, not one of ours wearing a hat. */
export const WEATHER_CARD_TAG = 'spike-weather-card';

/**
 * What goes on `<kai-thread>.cardTypes` — envelope type → custom-element tag,
 * merged OVER the built-ins by `mergeCardTags`.
 */
export const SPIKE_CARD_TYPES: Record<string, string> = {
  [WEATHER_CARD_TYPE]: WEATHER_CARD_TAG,
};

/**
 * What goes on `<kai-thread>.cardSchemas` — the companion of `cardTypes`. One
 * says what DRAWS a `weather`, this says what a VALID one looks like.
 *
 * Without it the kit validates its own seven built-ins and leaves this app's own
 * card as the only unchecked thing on screen. With it, a `weather` payload that
 * loses `condition` or turns `temperature` into a string trips the HARD tier and
 * `CardFallback` replaces the card — which the scenario assertions notice,
 * because they look for THIS tag and for the condition text inside it.
 */
export const SPIKE_CARD_SCHEMAS: Record<string, object> = {
  [WEATHER_CARD_TYPE]: {
    type: 'object',
    title: 'Weather card',
    required: ['city', 'condition', 'temperature', 'units'],
    properties: {
      city: { type: 'string', minLength: 1 },
      condition: { type: 'string', minLength: 1 },
      temperature: { type: 'number' },
      units: { type: 'string', enum: ['°C', '°F'] },
      humidityPct: { type: 'number', minimum: 0, maximum: 100 },
      wind: { type: 'string' },
      observedAt: { type: 'string' },
    },
  },
};

/** The payload `get_weather` puts in the envelope. */
export interface WeatherCardData {
  city: string;
  condition: string;
  temperature: number;
  units: string;
  humidityPct?: number;
  wind?: string;
  observedAt?: string;
}

/**
 * The tools whose result renders through the CONSUMER seam, each with an input
 * that provokes one.
 *
 * A list like this normally rots into a claim nobody checks, so `cards.test.ts`
 * runs every entry through `runTool` and requires a non-built-in card back. It
 * also counts how many catalog scenarios offer one of these tools, which is the
 * difference between "a scenario ran" and "the seam was on the path it ran".
 */
export const CONSUMER_CARD_TOOLS: Record<string, Record<string, unknown>> = {
  get_weather: { city: 'Paris' },
};

const CARD_STYLES = `
  :host { display: block; margin: 0.5rem 0; }
  .card {
    border: 1px solid var(--color-border, rgba(127, 127, 127, 0.35));
    background: var(--color-card, transparent);
    color: var(--color-card-foreground, inherit);
    border-radius: 0.75rem;
    padding: 0.75rem 0.875rem;
    font: inherit;
    display: grid;
    gap: 0.25rem;
  }
  .city { font-weight: 600; font-size: 0.9375rem; }
  .now { display: flex; align-items: baseline; gap: 0.5rem; }
  .temp { font-size: 1.75rem; font-weight: 600; line-height: 1.1; }
  .condition { font-size: 0.9375rem; }
  .detail, .observed {
    font-size: 0.8125rem;
    color: var(--color-muted-foreground, inherit);
    opacity: 0.85;
  }
`;

/**
 * Define `<spike-weather-card>`.
 *
 * Called once from `main.tsx`, BEFORE React mounts, so the element is already
 * upgraded when `<kai-thread>` creates one. The kit's `CardTagSlot` sets `data`,
 * `cardId`, `heading` and `resolution` as DOM PROPERTIES from a Solid effect, so
 * every one of them has to be a setter that re-renders: streaming hands the slot
 * a new envelope object per chunk.
 *
 * Idempotent, because React 19's StrictMode double-invokes effects and a second
 * `customElements.define` of the same name throws.
 */
export function registerSpikeCards(): void {
  if (typeof customElements === 'undefined') return;
  if (customElements.get(WEATHER_CARD_TAG)) return;

  class SpikeWeatherCard extends HTMLElement {
    #data: WeatherCardData | null = null;
    #heading: string | null = null;
    #root: ShadowRoot;

    constructor() {
      super();
      this.#root = this.attachShadow({ mode: 'open' });
    }

    set data(value: unknown) {
      this.#data = isWeatherData(value) ? value : null;
      this.#render();
    }

    get data(): unknown {
      return this.#data;
    }

    set heading(value: string) {
      this.#heading = value;
      this.#render();
    }

    get heading(): string | null {
      return this.#heading;
    }

    /** Set by `CardTagSlot` alongside `data`. The spike's weather card is not
     *  interactive, so there is nothing to resolve — but the property has to
     *  EXIST, or assigning it would land as an expando on a card that silently
     *  ignores it. */
    set resolution(_value: unknown) {
      /* not interactive */
    }

    set cardId(_value: string) {
      /* the kit also mirrors this onto `data-card-id`, which is the handle */
    }

    connectedCallback(): void {
      this.#render();
    }

    #render(): void {
      const d = this.#data;
      if (!d) {
        this.#root.innerHTML = '';
        return;
      }
      const style = `<style>${CARD_STYLES}</style>`;
      const rows = [
        d.humidityPct != null ? `Humidity ${d.humidityPct}%` : null,
        d.wind ? `Wind ${d.wind}` : null,
      ].filter(Boolean);
      this.#root.innerHTML =
        style +
        '<div class="card" part="card">' +
        `<div class="city">${esc(this.#heading ?? d.city)}</div>` +
        '<div class="now">' +
        `<span class="temp">${esc(String(d.temperature))}${esc(d.units)}</span>` +
        `<span class="condition">${esc(d.condition)}</span>` +
        '</div>' +
        (rows.length ? `<div class="detail">${esc(rows.join(' · '))}</div>` : '') +
        (d.observedAt ? `<div class="observed">Observed ${esc(d.observedAt)}</div>` : '') +
        '</div>';
    }
  }

  customElements.define(WEATHER_CARD_TAG, SpikeWeatherCard);
}

function isWeatherData(value: unknown): value is WeatherCardData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.city === 'string' && typeof v.condition === 'string' && typeof v.temperature === 'number';
}

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}
