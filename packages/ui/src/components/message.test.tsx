import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { groupMessageParts, MessageBody } from './message';
import { appendReasoningPart, appendTextPart, upsertToolPart } from '../state/parts';
import type { MessagePart } from '../elements/chat-types';

// jsdom has no ResizeObserver; the reasoning disclosure wires one when its
// content mounts (same stub as response-compare.test.tsx / thread.test.tsx).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

afterEach(cleanup);

describe('groupMessageParts', () => {
  it('wraps a single file part in its own files group', () => {
    const parts: MessagePart[] = [
      { type: 'file', attachment: { id: 'a', type: 'file', filename: 'a.png' } },
    ];
    const groups = groupMessageParts(parts);
    expect(groups).toEqual([
      { kind: 'files', parts: [parts[0]] },
    ]);
  });

  it('collapses three consecutive file parts into one files group', () => {
    const parts: MessagePart[] = [
      { type: 'file', attachment: { id: 'a', type: 'file', filename: 'a.png' } },
      { type: 'file', attachment: { id: 'b', type: 'file', filename: 'b.png' } },
      { type: 'file', attachment: { id: 'c', type: 'file', filename: 'c.png' } },
    ];
    const groups = groupMessageParts(parts);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ kind: 'files', parts });
  });

  it('keeps file parts separated by a non-file part as two distinct groups', () => {
    const file1: MessagePart = { type: 'file', attachment: { id: 'a', type: 'file', filename: 'a.png' } };
    const text: MessagePart = { type: 'text', text: 'in between' };
    const file2: MessagePart = { type: 'file', attachment: { id: 'b', type: 'file', filename: 'b.png' } };
    const groups = groupMessageParts([file1, text, file2]);
    expect(groups).toEqual([
      { kind: 'files', parts: [file1] },
      { kind: 'single', part: text },
      { kind: 'files', parts: [file2] },
    ]);
  });

  it('preserves order across a mix of part types', () => {
    const parts: MessagePart[] = [
      { type: 'text', text: 'Checking.' },
      { type: 'tool', tool: { type: 'get_weather', kind: 'generic', state: 'output-available' } },
      { type: 'text', text: 'Done.' },
    ];
    const groups = groupMessageParts(parts);
    expect(groups.map((g) => (g.kind === 'single' ? g.part.type : 'files'))).toEqual([
      'text', 'tool', 'text',
    ]);
  });
});

// ─── Streaming identity ──────────────────────────────────────────────────────
//
// A live message is re-rendered once per stream delta with a BRAND-NEW `parts`
// array (that is the re-render signal). Anything the user has toggled inside a
// part — an open tool panel, an expanded reasoning block — lives in that
// subtree's local state, so the subtree must SURVIVE those re-renders. These
// tests drive the real `@kitn.ai/ui/state` folds, because only they reproduce
// which part objects a live stream actually replaces per chunk.

/** Render `MessageBody` over a signal-backed `parts` array, so a test can push
 *  successive deltas exactly as a stream does: a new array per chunk. */
function renderStream(initial: MessagePart[]) {
  const [parts, setParts] = createSignal<MessagePart[]>(initial);
  const rendered = render(() => <MessageBody parts={parts()} isUser={false} markdown={false} />);
  return {
    ...rendered,
    /** Push one delta. `fold` receives the current parts and returns the next
     *  array — pass a real fold (appendTextPart / upsertToolPart / …). */
    delta: (fold: (p: MessagePart[]) => MessagePart[]) => setParts(fold(parts())),
  };
}

/** The tool panel's disclosure trigger — the only button carrying aria-controls. */
const toolTrigger = (c: HTMLElement) => c.querySelector('button[aria-controls]') as HTMLButtonElement;
/** The reasoning disclosure trigger (a plain button, no aria-controls). */
const reasoningTrigger = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')).find((b) => !b.hasAttribute('aria-controls')) as HTMLButtonElement;
/** The reasoning disclosure has no aria state; its chevron rotates when open. */
const reasoningOpen = (c: HTMLElement) =>
  (reasoningTrigger(c).querySelector('div')?.className ?? '').includes('rotate-180');

describe('MessageBody streaming identity', () => {
  it('keeps a TOOL panel expanded across the next stream delta', () => {
    // A settled tool call, then the assistant starts answering.
    const initial = appendTextPart(
      upsertToolPart([], 'call_1', {
        type: 'get_weather', state: 'output-available', input: { city: 'SF' }, output: { forecast: 'sunny' },
      }),
      'The weather ',
    );
    const { container, delta } = renderStream(initial);

    fireEvent.click(toolTrigger(container));
    expect(toolTrigger(container)).toHaveAttribute('aria-expanded', 'true');

    // The very next chunk of the SAME in-flight message.
    delta((p) => appendTextPart(p, 'in SF is sunny.'));
    expect(toolTrigger(container)).toHaveAttribute('aria-expanded', 'true');

    // …and the one after that.
    delta((p) => appendTextPart(p, ' Anything else?'));
    expect(toolTrigger(container)).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps a REASONING panel expanded while its own text is still streaming', () => {
    const { container, delta } = renderStream(
      appendReasoningPart([], 'Considering', { index: 0, streamId: 's1' }),
    );

    fireEvent.click(reasoningTrigger(container));
    expect(reasoningOpen(container)).toBe(true);

    // The part the user just expanded is the one being rebuilt each delta.
    delta((p) => appendReasoningPart(p, ' the options', { index: 0, streamId: 's1' }));
    expect(reasoningOpen(container)).toBe(true);

    delta((p) => appendReasoningPart(p, ' carefully.', { index: 0, streamId: 's1' }));
    expect(reasoningOpen(container)).toBe(true);
  });

  it('does not remount the parts subtree between deltas', () => {
    // The structural guard behind the two tests above: reference-keying the
    // parts list makes every delta look like a whole new list, so each row is
    // torn down and rebuilt — observable as a fresh DOM node and a fresh
    // `createUniqueId()` for the collapsible's content id. Both must be stable.
    const initial = appendTextPart(
      upsertToolPart([], 'call_1', { type: 'get_weather', state: 'output-available', output: { forecast: 'sunny' } }),
      'The weather ',
    );
    const { container, delta } = renderStream(initial);

    const node = toolTrigger(container);
    const contentId = node.getAttribute('aria-controls');

    delta((p) => appendTextPart(p, 'in SF '));
    delta((p) => appendTextPart(p, 'is sunny.'));

    expect(toolTrigger(container)).toBe(node);
    expect(toolTrigger(container).getAttribute('aria-controls')).toBe(contentId);
  });

  it('still streams TEXT into the already-mounted part', () => {
    // The other half of the invariant: keeping identity must not cost
    // reactivity. Content that changes in place has to keep flowing.
    const { container, delta } = renderStream(appendTextPart([], 'The weather '));
    delta((p) => appendTextPart(p, 'in SF '));
    delta((p) => appendTextPart(p, 'is sunny.'));
    expect(container.textContent).toContain('The weather in SF is sunny.');
  });

  it('still streams REASONING text into the already-mounted panel', () => {
    const { container, delta } = renderStream(
      appendReasoningPart([], 'Considering', { index: 0, streamId: 's1' }),
    );
    delta((p) => appendReasoningPart(p, ' the options.', { index: 0, streamId: 's1' }));
    expect(container.textContent).toContain('Considering the options.');
  });

  it('still applies a TOOL patch to the already-mounted panel', () => {
    const { container, delta } = renderStream(
      upsertToolPart([], 'call_1', { type: 'get_weather', state: 'input-streaming' }),
    );
    expect(container.textContent).toContain('Processing');

    delta((p) => upsertToolPart(p, 'call_1', { state: 'output-available', output: { forecast: 'sunny in SF' } }));
    expect(container.textContent).toContain('Completed');
    expect(container.textContent).toContain('sunny in SF');
  });

  it('appends a NEW part without disturbing the parts before it', () => {
    // A new part arriving mid-stream is a genuine list growth, not a rebuild.
    const { container, delta } = renderStream(
      upsertToolPart([], 'call_1', { type: 'get_weather', state: 'output-available', output: { forecast: 'sunny' } }),
    );
    fireEvent.click(toolTrigger(container));
    const node = toolTrigger(container);

    delta((p) => appendTextPart(p, 'It is sunny.'));
    expect(toolTrigger(container)).toBe(node);
    expect(toolTrigger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(container.textContent).toContain('It is sunny.');
  });
});
