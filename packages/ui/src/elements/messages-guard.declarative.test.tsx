/**
 * Unit tests for the `messages` boundary validation on the THREAD facades.
 *
 * `<kai-message>` got its own guard (message.declarative.test.tsx); these three
 * take the same untyped array boundary and had nothing, so a consumer handing
 * `<kai-chat>` the pre-0.20.0 `{ id, role, content }` shape threw
 * `TypeError: parts is not iterable` inside a Solid render pass and blanked the
 * WHOLE element. `<kai-chat>` is the flagship and the #1 upgrade path, so the
 * diagnostic matters most there.
 *
 * Contract per facade: skip the invalid message, log ONE console.error naming
 * the element and the expected shape, never throw, never blank the siblings.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './thread';
import './chat';
import './chat-workspace';

// jsdom doesn't implement Element.scrollTo; the stick-to-bottom primitive calls
// it on a rAF. Same shim as thread-cards.declarative.test.tsx.
if (!Element.prototype.scrollTo) (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};

type AnyEl = HTMLElement & Record<string, unknown>;

const LEGACY = { id: 'bad', role: 'assistant', content: 'legacy shape' };
const GOOD = { id: 'good', role: 'assistant', parts: [{ type: 'text', text: 'still here' }] };

const FACADES = ['kai-thread', 'kai-chat'] as const;

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Restore FIRST, unconditionally: a failed assertion above must not leave a
  // stale mock swallowing console.error output for the next test.
  errorSpy.mockRestore();
  for (const tag of FACADES) document.querySelectorAll(tag).forEach((el) => el.remove());
});

async function mount(tag: string, messages: unknown): Promise<AnyEl> {
  const el = document.createElement(tag) as AnyEl;
  el.messages = messages;
  document.body.append(el);
  await customElements.whenDefined(tag);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

describe.each(FACADES)('<%s> messages boundary validation', (tag) => {
  it('a legacy content-shaped message does not throw and does not blank the element', async () => {
    let el!: AnyEl;
    // The exact reproduction: `parts is not iterable`, thrown from
    // groupMessageParts during the render pass.
    await expect((async () => { el = await mount(tag, [LEGACY, GOOD]); })()).resolves.not.toThrow();

    // The sibling still rendered. This is the "never blank" half of the contract.
    expect(el.shadowRoot!.textContent).toContain('still here');
    // And the bad one rendered nothing rather than a broken row.
    expect(el.shadowRoot!.textContent).not.toContain('legacy shape');
  });

  it('logs ONE console.error naming the element and the expected shape', async () => {
    await mount(tag, [LEGACY, GOOD]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const msg = String(errorSpy.mock.calls[0][0]);
    expect(msg).toContain(`<${tag}>`);
    expect(msg).toMatch(/'parts' array/i);
    // Names the removed field, so the reader knows what to migrate FROM.
    expect(msg).toContain('content');
  });

  it('does not re-log for the same bad message on an unrelated re-render', async () => {
    const el = await mount(tag, [LEGACY, GOOD]);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // An unrelated prop change re-renders; the SAME bad message reference must
    // not log again (otherwise streaming spams the console every chunk).
    el.setAttribute('prose-size', 'base');
    await new Promise((r) => setTimeout(r, 0));
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('an all-valid array logs nothing and renders every message', async () => {
    const el = await mount(tag, [
      { id: 'a', role: 'user', parts: [{ type: 'text', text: 'first msg' }] },
      { id: 'b', role: 'assistant', parts: [{ type: 'text', text: 'second msg' }] },
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(el.shadowRoot!.textContent).toContain('first msg');
    expect(el.shadowRoot!.textContent).toContain('second msg');
  });
});
