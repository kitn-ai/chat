/**
 * The message LIST's keying — driven through the FULL component path.
 *
 * WHY THIS FILE EXISTS AT ALL. `MessageBody` already has a `<Index>` over its
 * part groups, added to stop a streaming delta tearing down an open tool /
 * reasoning panel. That fix was landed on the evidence of a test that drove
 * `MessageBody` directly, and it was DEAD: `ChatThread` / `Thread` render their
 * messages through a reference-keyed `<For>`, and `createAssistantStream` hands
 * the streaming message a NEW OBJECT IDENTITY on every delta
 * (`{ ...prev[i], parts: next }`). So the parent saw an entirely new list each
 * chunk and destroyed the whole message row before the position-keying inside it
 * could matter. A test that cannot see the parent cannot see this bug.
 *
 * So these tests drive the real thing: render `ChatThread` / `Thread`, then push
 * deltas through the REAL `@kitn.ai/ui/state` folds so the object churn is the
 * genuine article, not a hand-written stand-in.
 *
 * WHAT THEY ASSERT, and why it is more than "it renders":
 *   1. NODE IDENTITY — the very same `HTMLElement` before and after the deltas.
 *      A remount is invisible in a DOM snapshot (the rebuilt markup is
 *      identical), so structure-only assertions miss this entirely. Identity is
 *      the only thing that changes.
 *   2. The generated `aria-controls` id (Solid's `createUniqueId`, `cl-9` ->
 *      `cl-11` -> ...) is STABLE. A remount mints a fresh one, which is the
 *      fingerprint the original live probe caught this bug by.
 *   3. `data-state="open"` survives. A remounted disclosure reports `closed`
 *      perfectly happily, which is the user-visible symptom: the click did
 *      nothing.
 *
 * jsdom still cannot see the LAYOUT half of this (a closed panel is a
 * zero-height box, not a removed one) — that is what
 * `SPIKE_ONLY=S18-expand-mid-stream pnpm conformance` covers in a real browser.
 * These are the cheap guards that fail in CI the moment someone reintroduces
 * reference-keying at either level.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@solidjs/testing-library';
import { createSignal, type Accessor, flush } from 'solid-js';
import { ChatThread } from '../../src/components/chat-thread';
import { Thread } from '../../src/components/thread';
import { createAssistantStream, type AssistantStream } from '../../src/state';
import type { ChatMessage } from '../../src/elements/chat-types';

beforeAll(() => {
  // The disclosures measure their content with a ResizeObserver, which jsdom
  // does not implement. A no-op stub is enough: nothing here asserts height.
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // The thread's stick-to-bottom scroller calls `scrollTo` from a rAF; jsdom has
  // no scrolling at all, and an unhandled throw in a rAF callback fails the run.
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
});

afterEach(cleanup);

/** A thread signal wired to a real `createAssistantStream`, exactly as a
 *  consumer wires it: the setter takes the functional updater the stream hands
 *  it, so every delta produces a fresh message OBJECT inside a fresh array. */
function streamingThread(): { messages: Accessor<ChatMessage[]>; stream: AssistantStream } {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const stream = createAssistantStream((updater) => setMessages((prev) => updater(prev)), {
    id: 'assistant-1',
  });
  return { messages, stream };
}

/** The tool panel's disclosure trigger, found the way the browser harness finds
 *  it: a button with `aria-controls` carrying the tool name. */
function toolTrigger(container: HTMLElement, toolName: string): HTMLElement {
  const found = [...container.querySelectorAll<HTMLElement>('button[aria-controls]')].find((b) =>
    (b.textContent ?? '').includes(toolName),
  );
  if (!found) throw new Error(`no disclosure trigger for the ${toolName} tool is rendered`);
  return found;
}

/** The PANEL a trigger controls, resolved through `aria-controls` — the same
 *  hop the browser harness makes.
 *
 *  Identity is asserted on the panel, not on the trigger: `CollapsibleTrigger`
 *  renders through an `as={...}` callback that reads `open()`, so toggling
 *  legitimately re-creates the trigger element. The panel div is stable across a
 *  toggle and is replaced ONLY by a remount, which is exactly the distinction
 *  under test. Its `id` is a `createUniqueId()` value, so a rebuilt row cannot
 *  even be found by the old id — the lookup returns null and the identity
 *  assertion fails loudly. */
function panelOf(container: HTMLElement, contentId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[id="${contentId}"]`);
}

/** A Collapsible marks its open panel with `data-expanded` (and drops it when
 *  closed) — the attribute half of the `grid-rows-[1fr]` layout the user sees. */
function isOpen(panel: HTMLElement | null): boolean {
  return !!panel?.hasAttribute('data-expanded');
}

/** Open the streaming assistant turn: some prose, then a tool call whose
 *  arguments are still arriving. */
function openTurn(stream: AssistantStream) {
  stream.appendText('Let me check the weather.');
  flush(); // V2-FLUSH: commit the staged delta
  stream.upsertTool('call_1', { type: 'get_weather', state: 'input-streaming', input: { city: 'Par' } });
  flush(); // V2-FLUSH: commit the staged delta
}

/** Everything a stream does AFTER the user clicked: the arguments settle, the
 *  tool returns, and the answer keeps streaming. Each one is a new message
 *  object; each one used to close the panel. */
function keepStreaming(stream: AssistantStream) {
  stream.upsertTool('call_1', { state: 'input-available', input: { city: 'Paris' } });
  flush(); // V2-FLUSH: commit the staged delta
  stream.appendText(' One moment.');
  flush(); // V2-FLUSH: commit the staged delta
  stream.upsertTool('call_1', { state: 'output-available', output: { forecast: 'Light rain' } });
  flush(); // V2-FLUSH: commit the staged delta
  stream.appendText(' Pack an umbrella.');
  flush(); // V2-FLUSH: commit the staged delta
  stream.done();
  flush(); // V2-FLUSH: commit the staged delta
}

/** The shared body: open a disclosure mid-stream, push more deltas, and require
 *  the row to have SURVIVED them. */
function assertSurvivesDeltas(container: HTMLElement, stream: AssistantStream) {
  const trigger = toolTrigger(container, 'get_weather');
  const contentId = trigger.getAttribute('aria-controls');
  expect(contentId, 'the tool disclosure must expose aria-controls').toBeTruthy();
  const panelBefore = panelOf(container, contentId!);
  expect(isOpen(panelBefore), 'the tool panel starts closed').toBe(false);

  fireEvent.click(trigger);
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(isOpen(panelOf(container, contentId!)), 'clicking the trigger must open the panel').toBe(true);

  keepStreaming(stream);

  expect(
    toolTrigger(container, 'get_weather').getAttribute('aria-controls'),
    'the disclosure minted a NEW generated id, which only happens on a remount: the ' +
      'message row was torn down and rebuilt by a delta, so the panel the user just ' +
      'opened was replaced by a fresh closed one',
  ).toBe(contentId);
  expect(
    panelOf(container, contentId!),
    'the panel element itself was replaced — the row did not survive the deltas',
  ).toBe(panelBefore);
  expect(isOpen(panelOf(container, contentId!)), 'the panel opened mid-stream must still be open').toBe(true);

  // Still-mounted must not mean frozen: the row has to keep reading its new
  // content through the accessor, or we traded one bug for a worse one.
  expect(container.textContent).toContain('Pack an umbrella.');
  expect(container.textContent).toContain('Light rain');
}

describe('ChatThread — message list keying under a live stream', () => {
  it('keeps a tool panel opened mid-stream open across every subsequent delta', () => {
    const { messages, stream } = streamingThread();
    const { container } = render(() => <ChatThread messages={messages()} />);
    openTurn(stream);
    assertSurvivesDeltas(container, stream);
  });

  it('does not remount the message row when a delta replaces the message object', () => {
    const { messages, stream } = streamingThread();
    const { container } = render(() => <ChatThread messages={messages()} />);
    stream.appendReasoning('Paris in autumn', { label: 'Thinking' });
    flush(); // V2-FLUSH: commit the staged delta

    const row = container.querySelector<HTMLElement>('[part="row"]');
    expect(row, 'the assistant row must render').toBeTruthy();

    stream.appendReasoning(' is usually wet.');
    flush(); // V2-FLUSH: commit the staged delta
    stream.appendText('It rains.');
    flush(); // V2-FLUSH: commit the staged delta

    expect(
      container.querySelector<HTMLElement>('[part="row"]'),
      'a new message object per delta must NOT rebuild the row',
    ).toBe(row);
    expect(row!.textContent).toContain('is usually wet.');
  });

  it('keys rows by message id, so prepending history leaves an open panel with its own message', () => {
    const [messages, setMessages] = createSignal<ChatMessage[]>([
      { id: 'assistant-1', role: 'assistant', parts: [{ type: 'tool', tool: { type: 'get_weather', toolCallId: 'call_1', state: 'output-available', output: { forecast: 'Light rain' } } }] },
    ]);
    const { container } = render(() => <ChatThread messages={messages()} />);

    const trigger = toolTrigger(container, 'get_weather');
    const contentId = trigger.getAttribute('aria-controls')!;
    const panelBefore = panelOf(container, contentId);
    fireEvent.click(trigger);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(isOpen(panelOf(container, contentId))).toBe(true);

    // Load-earlier-messages: an older turn arrives at the FRONT of the list.
    setMessages((prev) => [
      { id: 'older-1', role: 'user', parts: [{ type: 'text', text: 'earlier question' }] },
      ...prev,
    ]);

    expect(
      panelOf(container, contentId),
      'the tool row must follow its message by id, not stay behind at its old position',
    ).toBe(panelBefore);
    expect(isOpen(panelOf(container, contentId))).toBe(true);
  });
});

describe('Thread — the same list, the same keying', () => {
  it('keeps a tool panel opened mid-stream open across every subsequent delta', () => {
    const { messages, stream } = streamingThread();
    const { container } = render(() => <Thread messages={messages()} />);
    openTurn(stream);
    assertSurvivesDeltas(container, stream);
  });
});
