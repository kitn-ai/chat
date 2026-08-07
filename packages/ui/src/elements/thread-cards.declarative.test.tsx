/**
 * Unit tests for the `cardTypes` seam on `<kai-thread>`: a consumer-registered
 * custom card type renders as its own custom-element tag, and an unregistered
 * type falls through to the shared `CardFallback` rather than rendering blank.
 */
import { describe, it, expect, afterEach } from 'vitest';
import './thread';

afterEach(() => {
  document.querySelectorAll('kai-thread').forEach((el) => el.remove());
});

describe('<kai-thread> cardTypes seam', () => {
  it('renders a registered custom card type from a message part', async () => {
    const el = document.createElement('kai-thread') as HTMLElement & Record<string, unknown>;
    el.cardTypes = { 'my-widget': 'my-widget-el' };
    el.messages = [{
      id: 'm1', role: 'assistant',
      parts: [{ type: 'card', envelope: { type: 'my-widget', id: 'c1', data: { label: 'hi' } } }],
    }];
    document.body.append(el);
    await customElements.whenDefined('kai-thread');
    await new Promise((r) => setTimeout(r, 0));
    expect(el.shadowRoot?.querySelector('my-widget-el')).not.toBeNull();
  });

  it('falls through to CardFallback for an UNREGISTERED card type', async () => {
    const el = document.createElement('kai-thread') as HTMLElement & Record<string, unknown>;
    el.messages = [{
      id: 'm1', role: 'assistant',
      parts: [{ type: 'card', envelope: { type: 'never-registered', id: 'c1', data: {} } }],
    }];
    document.body.append(el);
    await customElements.whenDefined('kai-thread');
    await new Promise((r) => setTimeout(r, 0));
    // Must render SOMETHING. A blank is the failure mode this guards against.
    expect(el.shadowRoot?.textContent ?? '').not.toBe('');
    expect(el.shadowRoot?.querySelector('[data-card-fallback]')).not.toBeNull();
  });
});
