/**
 * examples/remote-provider/renderers.ts
 * =====================================
 * The reference provider's vanilla-DOM card renderers, extracted so they can be
 * reused both by the live cross-origin provider runtime (provider-entry.ts) AND by
 * the static Storybook docs (src/elements/remote.stories.tsx), which render the
 * card content directly when no second origin is available.
 *
 * Demonstrates BOTH canonical card interaction patterns:
 *
 *   1. form  — interactive / data-collecting card.
 *              Mounts <kai-form>, forwards submit to the host via CardHost.emit.
 *              Round-trip: host → render → user fills → submit → host receives data.
 *
 *   2. info  — display-rich / self-contained card.
 *              Renders a "weather"-style read-only view from envelope.data.
 *              May contain internal interaction (details toggle) but emits NOTHING
 *              back to the host — proves the zero-round-trip pattern.
 */

import type { RemoteCardRenderer } from '../../../packages/ui/src/remote/provider';

// Register the <kai-form> custom element (side-effect import).
import '../../../packages/ui/src/elements/form';

// ── Renderer 1: form — interactive, data-collecting ───────────────────────────
//
// Pattern: mount <kai-form>, set its .data from the envelope, listen for the
// bubbling `kai-card` CustomEvent for kind='submit', forward to host.
// The host can use the submitted data to advance the conversation.
export const formRenderer: RemoteCardRenderer = {
  type: 'form',

  mount(root, envelope, host) {
    const form = document.createElement('kai-form') as HTMLElement & {
      data: unknown;
      cardId: string;
      heading: string;
    };

    // Set the form definition from the card envelope.
    form.data = envelope.data;
    // The card id is used to correlate every emitted CardEvent back to this card.
    form.cardId = envelope.id;
    // Optional: use the envelope's title as the card heading.
    if (envelope.title) form.heading = envelope.title;

    // Apply the HOST-pushed theme to the kit element. The host flushes `context`
    // BEFORE the first `render`, so host.context() already reflects the host theme
    // at mount; a later theme toggle re-pushes context, and the bridge re-renders
    // this card (dispose+remount), so this runs again with the new theme.
    form.setAttribute('theme', host.context().theme?.mode === 'dark' ? 'dark' : 'light');

    // The <kai-form> element emits a bubbling CustomEvent named 'kai-card' when the
    // user submits the form. The event detail is a CardEvent { kind, cardId, data }.
    function onKaiCard(e: Event) {
      const ev = e as CustomEvent<{ kind: string; cardId: string; data?: unknown }>;
      const detail = ev.detail;
      if (!detail || detail.kind !== 'submit') return;
      // Forward the submit event to the host bridge, which relays it up via postMessage.
      host.emit({ kind: 'submit', cardId: envelope.id, data: detail.data });
    }

    root.addEventListener('kai-card', onKaiCard);
    root.appendChild(form);

    // Return a disposer — called by the bridge before rendering a new card.
    return () => {
      root.removeEventListener('kai-card', onKaiCard);
      form.remove();
    };
  },
};

// ── Renderer 2: info — display-rich, self-contained (zero round-trip) ─────────
//
// Pattern: render a rich read-only view entirely from envelope.data.
// Internal interactions (details toggle, copy button) are fine — they don't
// need to notify the host. The bridge automatically emits the `ready` event
// after mount; no further events are needed for display-only cards.
export const infoRenderer: RemoteCardRenderer = {
  type: 'info',

  mount(root, envelope, host) {
    // Honor the host-pushed theme (re-runs on each context push via dispose+remount).
    const dark = host.context().theme?.mode === 'dark';
    const fg = dark ? '#fafafa' : '#18181b';
    const bg = dark ? '#18181b' : '#ffffff';
    const muted = dark ? '#a1a1aa' : '#6b7280';
    const subtle = dark ? '#a1a1aa' : '#71717a';
    const panel = dark ? '#27272a' : '#f4f4f5';
    const panelText = dark ? '#e4e4e7' : '#374151';
    const accent = dark ? '#a5b4fc' : '#4f46e5';
    const accentBg = dark ? '#312e81' : '#eef2ff';
    const listBg = dark ? '#1f1f23' : '#f9f9fb';

    // Treat envelope.data as a weather-style payload.
    const d = (envelope.data ?? {}) as Record<string, unknown>;
    const location = String(d['location'] ?? 'Unknown location');
    const temp = d['temperature'] != null ? String(d['temperature']) : '--';
    const unit = String(d['unit'] ?? '°C');
    const condition = String(d['condition'] ?? 'Unknown');
    const humidity = d['humidity'] != null ? `${d['humidity']}%` : '--';
    const wind = d['wind'] != null ? `${d['wind']} km/h` : '--';
    const feelsLike = d['feelsLike'] != null ? `${d['feelsLike']}${unit}` : '--';
    const forecast = Array.isArray(d['forecast']) ? d['forecast'] as Array<Record<string, unknown>> : [];

    // Build the card DOM — vanilla, no framework, no SolidJS.
    const card = document.createElement('div');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', `Weather for ${location}`);
    card.dataset.theme = dark ? 'dark' : 'light';
    card.style.cssText = `
      font-family: system-ui, sans-serif;
      padding: 20px;
      box-sizing: border-box;
      color: ${fg};
      background: ${bg};
    `;

    // Heading: location name
    const heading = document.createElement('h2');
    heading.textContent = envelope.title ?? location;
    heading.style.cssText = `
      margin: 0 0 4px;
      font-size: 18px;
      font-weight: 600;
      color: ${fg};
    `;
    card.appendChild(heading);

    // Condition sub-heading
    const condEl = document.createElement('p');
    condEl.textContent = condition;
    condEl.style.cssText = `margin: 0 0 16px; font-size: 13px; color: ${muted};`;
    card.appendChild(condEl);

    // Big temperature display
    const tempRow = document.createElement('div');
    tempRow.style.cssText = `display: flex; align-items: baseline; gap: 4px; margin-bottom: 16px;`;
    const tempVal = document.createElement('span');
    tempVal.textContent = `${temp}${unit}`;
    tempVal.style.cssText = `font-size: 48px; font-weight: 700; line-height: 1; color: ${fg};`;
    tempRow.appendChild(tempVal);
    card.appendChild(tempRow);

    // Key facts row
    const facts = document.createElement('dl');
    facts.style.cssText = `
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 0 0 16px;
      padding: 12px;
      background: ${panel};
      border-radius: 10px;
    `;
    const factItems: [string, string][] = [
      ['Humidity', humidity],
      ['Wind', wind],
      ['Feels like', feelsLike],
    ];
    for (const [label, value] of factItems) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      dt.style.cssText = `font-size: 11px; color: ${subtle}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;`;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dd.style.cssText = `margin: 0; font-size: 15px; font-weight: 600; color: ${fg};`;
      const cell = document.createElement('div');
      cell.appendChild(dt);
      cell.appendChild(dd);
      facts.appendChild(cell);
    }
    card.appendChild(facts);

    // Details toggle — internal interaction, emits nothing to host (zero round-trip)
    if (forecast.length > 0) {
      const details = document.createElement('details');
      details.style.cssText = `border-radius: 8px; overflow: hidden;`;
      const summary = document.createElement('summary');
      summary.textContent = `${forecast.length}-day forecast`;
      summary.style.cssText = `
        cursor: pointer;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 500;
        color: ${accent};
        background: ${accentBg};
        border-radius: 8px;
        list-style: none;
        user-select: none;
      `;
      details.appendChild(summary);

      const forecastList = document.createElement('ul');
      forecastList.style.cssText = `
        margin: 0; padding: 8px 12px;
        list-style: none;
        background: ${listBg};
        border-radius: 0 0 8px 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      `;
      for (const day of forecast) {
        const li = document.createElement('li');
        li.style.cssText = `display: flex; justify-content: space-between; font-size: 13px; color: ${panelText}; padding: 2px 0;`;
        const dayName = document.createElement('span');
        dayName.textContent = String(day['day'] ?? '');
        const dayTemp = document.createElement('span');
        dayTemp.style.fontWeight = '600';
        dayTemp.textContent = `${day['high'] ?? '--'}/${day['low'] ?? '--'}${unit}`;
        li.appendChild(dayName);
        li.appendChild(dayTemp);
        forecastList.appendChild(li);
      }
      details.appendChild(forecastList);
      card.appendChild(details);
    }

    root.appendChild(card);

    // Return a disposer.
    return () => {
      card.remove();
    };
  },
};
