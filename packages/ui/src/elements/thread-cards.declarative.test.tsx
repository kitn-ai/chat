/**
 * Unit tests for the `cardTypes` seam on `<kai-thread>`: a consumer-registered
 * custom card type renders as its own custom-element tag, and an unregistered
 * type falls through to the shared `CardFallback` rather than rendering blank.
 */
import { describe, it, expect, afterEach } from 'vitest';
import './thread';

// jsdom doesn't implement Element.scrollTo; mounting a real <kai-thread> calls
// it via the stick-to-bottom primitive on a requestAnimationFrame, which
// otherwise throws as an unhandled async error and fails the whole run even
// though every test still passes. Same shim as chat-thread.test.tsx / thread.test.tsx.
if (!Element.prototype.scrollTo) (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};

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
    const widget = el.shadowRoot!.querySelector('my-widget-el') as HTMLElement & Record<string, unknown>;
    expect(widget).not.toBeNull();
    // Rendering the right tag is not enough: prove the envelope payload actually
    // reached the child, so a ref that never lands (createEffect's `if (!ref)
    // return` silently no-oping) can't slip through as a green test.
    expect(widget.data).toEqual({ label: 'hi' });
    expect(widget.cardId).toBe('c1');
  });

  it('overriding a BUILT-IN type renders the consumer tag, not the built-in tag', async () => {
    const el = document.createElement('kai-thread') as HTMLElement & Record<string, unknown>;
    el.cardTypes = { confirm: 'my-confirm-el' };
    el.messages = [{
      id: 'm1', role: 'assistant',
      parts: [{ type: 'card', envelope: { type: 'confirm', id: 'c2', data: { body: 'Are you sure?' } } }],
    }];
    document.body.append(el);
    await customElements.whenDefined('kai-thread');
    await new Promise((r) => setTimeout(r, 0));
    // Guards the merge direction against a future inversion: an override must
    // win over the built-in, not the other way around.
    expect(el.shadowRoot?.querySelector('my-confirm-el')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('kai-confirm')).toBeNull();
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
