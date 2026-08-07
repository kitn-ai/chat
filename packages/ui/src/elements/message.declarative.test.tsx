/**
 * Unit tests for the `<kai-message>` facade's boundary validation.
 *
 * `message` is an untyped consumer-facing property; nothing stops a consumer
 * from handing it the pre-0.20.0 `{ id, role, content }` shape (the shape this
 * whole plan removed). `parts` is a REQUIRED field internally
 * (`groupMessageParts` no longer tolerates a missing one), so the facade must
 * validate at the boundary: log one clear error and render nothing for that
 * message, never let an uncaught exception blank the element.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './message';

// jsdom doesn't implement Element.scrollTo; see chat-thread.test.tsx / thread.test.tsx.
if (!Element.prototype.scrollTo) (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};

type MessageEl = HTMLElement & { message?: unknown };

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Restore FIRST, unconditionally: a failed assertion above must not leave
  // a stale mock bleeding console.error output into the next test.
  errorSpy.mockRestore();
  document.querySelectorAll('kai-message').forEach((el) => el.remove());
});

describe('<kai-message> boundary validation', () => {
  it('a legacy content-shaped message logs one clear error and renders nothing, without throwing', async () => {
    const el = document.createElement('kai-message') as MessageEl;

    expect(() => {
      // The documented pre-0.20.0 shape: no `parts` array.
      el.message = { id: 'm1', role: 'assistant', content: 'hi' };
      document.body.appendChild(el);
    }).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toMatch(/kai-message.*'parts' array/i);
    // Renders nothing for the bad message rather than a broken/partial row.
    // (shadowRoot.textContent alone isn't a safe "empty" check: it also
    // includes the injected compiled-CSS <style> tag's text.)
    expect(el.shadowRoot!.querySelector('[part="row"]')).toBeNull();
  });

  it('does not re-log on unrelated re-renders of the same bad message reference', async () => {
    const el = document.createElement('kai-message') as MessageEl & { markdown?: boolean };
    const bad = { id: 'm1', role: 'assistant', content: 'hi' };
    el.message = bad;
    document.body.appendChild(el);
    await Promise.resolve();
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // An unrelated prop change re-renders the element; the SAME bad message
    // reference must not log again.
    el.markdown = true;
    await Promise.resolve();
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('a well-formed parts-based message renders normally (no error logged)', async () => {
    const el = document.createElement('kai-message') as MessageEl;
    el.message = { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'Hello there' }] };
    document.body.appendChild(el);
    await Promise.resolve();
    await Promise.resolve();

    expect(el.shadowRoot!.textContent).toContain('Hello there');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('a bad message does not blank a sibling valid <kai-message> (compose-your-own thread)', async () => {
    const good = document.createElement('kai-message') as MessageEl;
    const bad = document.createElement('kai-message') as MessageEl;
    good.message = { id: 'good', role: 'assistant', parts: [{ type: 'text', text: 'I am fine' }] };
    bad.message = { id: 'bad', role: 'assistant', content: 'legacy shape' };
    document.body.append(good, bad);
    await Promise.resolve();
    await Promise.resolve();

    expect(good.shadowRoot!.textContent).toContain('I am fine');
    expect(bad.shadowRoot!.querySelector('[part="row"]')).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
