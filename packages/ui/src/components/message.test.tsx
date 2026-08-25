import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal, flush } from 'solid-js';
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
    expect(groups.map((g) => (g.kind === 'single' ? g.part.type : g.kind))).toEqual([
      'text', 'tool', 'text',
    ]);
  });

  // --- source parts group exactly like file parts ---------------------------

  it('wraps a single source part in its own sources group', () => {
    const parts: MessagePart[] = [
      { type: 'source', source: { url: 'https://ui.kitn.ai/guides/theming' } },
    ];
    expect(groupMessageParts(parts)).toEqual([{ kind: 'sources', parts: [parts[0]] }]);
  });

  it('collapses three consecutive source parts into ONE sources group', () => {
    // N citations from one search are one wrapped row, not N stacked rows.
    const parts: MessagePart[] = [
      { type: 'source', source: { url: 'https://ui.kitn.ai/a', index: 1 } },
      { type: 'source', source: { url: 'https://ui.kitn.ai/b', index: 2 } },
      { type: 'source', source: { url: 'https://ui.kitn.ai/c', index: 3 } },
    ];
    const groups = groupMessageParts(parts);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ kind: 'sources', parts });
  });

  it('keeps source parts separated by a non-source part as two distinct groups', () => {
    const src1: MessagePart = { type: 'source', source: { url: 'https://ui.kitn.ai/a' } };
    const text: MessagePart = { type: 'text', text: 'in between' };
    const src2: MessagePart = { type: 'source', source: { url: 'https://ui.kitn.ai/b' } };
    expect(groupMessageParts([src1, text, src2])).toEqual([
      { kind: 'sources', parts: [src1] },
      { kind: 'single', part: text },
      { kind: 'sources', parts: [src2] },
    ]);
  });

  it('does not merge a source run into an adjacent file run', () => {
    const file: MessagePart = { type: 'file', attachment: { id: 'a', type: 'file', filename: 'a.png' } };
    const src: MessagePart = { type: 'source', source: { url: 'https://ui.kitn.ai/a' } };
    expect(groupMessageParts([file, src])).toEqual([
      { kind: 'files', parts: [file] },
      { kind: 'sources', parts: [src] },
    ]);
  });

  it('leaves a source group where its parts sat in `parts`', () => {
    const parts: MessagePart[] = [
      { type: 'text', text: 'Searching.' },
      { type: 'source', source: { url: 'https://ui.kitn.ai/a' } },
      { type: 'source', source: { url: 'https://ui.kitn.ai/b' } },
      { type: 'text', text: 'Done.' },
    ];
    expect(groupMessageParts(parts).map((g) => (g.kind === 'single' ? g.part.type : g.kind))).toEqual([
      'text', 'sources', 'text',
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
    // V2-SHAPE: the updater form + flush — a same-tick `parts()` read-back would
    // see the last COMMITTED value under v2's staged writes and drop deltas.
    delta: (fold: (p: MessagePart[]) => MessagePart[]) => { setParts(fold); flush(); },
  };
}

/** Find a disclosure trigger by its VISIBLE label. Both disclosures now carry
 *  `aria-controls` (the reasoning block gained it along with the rest of its aria
 *  wiring), so "the button with/without aria-controls" no longer tells them
 *  apart — the label a user actually reads does. */
const triggerLabelled = (c: HTMLElement, label: string) =>
  Array.from(c.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(label),
  ) as HTMLButtonElement;
/** The tool panel's disclosure trigger — labelled with the tool's type. */
const toolTrigger = (c: HTMLElement) => triggerLabelled(c, 'get_weather');
/** The reasoning disclosure trigger — labelled from the part's `label`, default 'Reasoning'. */
const reasoningTrigger = (c: HTMLElement) => triggerLabelled(c, 'Reasoning');
/** Read the reasoning disclosure's state off its aria wiring rather than the
 *  chevron's rotation class. */
const reasoningOpen = (c: HTMLElement) =>
  reasoningTrigger(c).getAttribute('aria-expanded') === 'true';

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
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
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
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
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
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    const node = toolTrigger(container);

    delta((p) => appendTextPart(p, 'It is sunny.'));
    expect(toolTrigger(container)).toBe(node);
    expect(toolTrigger(container)).toHaveAttribute('aria-expanded', 'true');
    expect(container.textContent).toContain('It is sunny.');
  });
});

// ─── F-21: reasoning auto-open while streaming ───────────────────────────────
//
// `reasoning.tsx` has always gated auto-open-while-streaming on an `isStreaming`
// prop, and `message.tsx` never passed it — so a user watched a static collapsed
// "Reasoning ⌄" label for the whole thinking window (the reproduced defect from
// .superpowers/sdd/2026-08-20-rung-3/latency-debug/report.md). These tests pin
// the plumb through MessageBody.
describe('MessageBody reasoning auto-open while streaming (F-21)', () => {
  const reasoningParts = () => appendReasoningPart([], 'Considering', { index: 0, streamId: 's1' });

  const renderStreaming = (initialStreaming: boolean) => {
    const [parts, setParts] = createSignal<MessagePart[]>(reasoningParts());
    const [streaming, setStreaming] = createSignal(initialStreaming);
    const rendered = render(() => (
      <MessageBody parts={parts()} isUser={false} markdown={false} isStreaming={streaming()} />
    ));
    return {
      ...rendered,
      // V2-SHAPE: the updater form + flush — a same-tick `parts()` read-back would
    // see the last COMMITTED value under v2's staged writes and drop deltas.
    delta: (fold: (p: MessagePart[]) => MessagePart[]) => { setParts(fold); flush(); },
      setStreaming,
    };
  };

  it('opens the reasoning disclosure while the message is streaming (the reproduced defect)', () => {
    // Before the fix MessageBody accepted no `isStreaming` at all, so this
    // rendered the exact collapsed-while-streaming state the latency report
    // photographed: text arriving, panel shut.
    const { container, delta } = renderStreaming(true);
    expect(reasoningOpen(container)).toBe(true);

    // …and it stays open as the reasoning text keeps streaming in.
    delta((p) => appendReasoningPart(p, ' the options.', { index: 0, streamId: 's1' }));
    expect(reasoningOpen(container)).toBe(true);
    expect(container.textContent).toContain('Considering the options.');
  });

  it('renders collapsed when the message is not streaming', () => {
    const { container } = renderStreaming(false);
    expect(reasoningOpen(container)).toBe(false);
  });

  it('keeps the state the user toggled once streaming ends', () => {
    const { container, setStreaming } = renderStreaming(true);
    expect(reasoningOpen(container)).toBe(true);

    // The user shuts the panel mid-stream; the end of the stream must not
    // reopen it or fight the toggle.
    fireEvent.click(reasoningTrigger(container));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(reasoningOpen(container)).toBe(false);

    setStreaming(false);
    flush(); // V2-FLUSH: commit the staged write
    expect(reasoningOpen(container)).toBe(false);
  });
});

// ─── The citation row ────────────────────────────────────────────────────────
//
// `source` parts arrive on the message correctly (the wire and
// `AssistantStream.addSource` both work) and used to render NOTHING. These tests
// guard the row that fixes that.
//
// The scoping below is the whole point, and it is copied from a real miss: the
// S12 conformance assertion in the openrouter spike first used a bare
// `a[href*="ui.kitn.ai/guides/theming"]` and PASSED — because the MODEL had
// typed a markdown link in its prose and `Markdown` rendered it as an anchor.
// That proved the model can type a URL, not that the kit renders a citation. A
// citation lives OUTSIDE the message bubble, so every assertion here filters to
// anchors that are NOT inside `[part~="content"]`, and the negative controls
// below keep that filter honest.

/** A message whose text part contains a link the MODEL typed — rendered as a
 *  real anchor INSIDE `[part~="content"]`. The decoy. */
const MODEL_TYPED_PROSE = 'See [theming](https://ui.kitn.ai/guides/theming) for details.';

/** Anchors the KIT put on screen as citations: anchors OUTSIDE the content part. */
const citationAnchors = (c: HTMLElement) =>
  [...c.querySelectorAll('a[href]')].filter((a) => !a.closest('[part~="content"]')) as HTMLAnchorElement[];

const citationHrefs = (c: HTMLElement) => citationAnchors(c).map((a) => a.getAttribute('href'));

const citationRow = (c: HTMLElement) => c.querySelector('[part~="citations"]');

const renderBody = (parts: MessagePart[], markdown = true) =>
  render(() => <MessageBody parts={parts} isUser={false} markdown={markdown} />);

describe('MessageBody citation row', () => {
  it('renders a source part as a citation the user can see and follow', () => {
    const { container } = renderBody([
      { type: 'source', source: { url: 'https://ui.kitn.ai/guides/theming', title: 'Theming' } },
    ]);
    expect(citationHrefs(container)).toContain('https://ui.kitn.ai/guides/theming');
  });

  it('puts the citation row OUTSIDE the message content part', () => {
    const { container } = renderBody([
      { type: 'text', text: 'Theming uses CSS variables.' },
      { type: 'source', source: { url: 'https://ui.kitn.ai/guides/theming', title: 'Theming' } },
    ]);
    const row = citationRow(container);
    expect(row).not.toBeNull();
    expect(row!.closest('[part~="content"]')).toBeNull();
    // The anchor really is inside that row, not merely somewhere on the page.
    expect(citationAnchors(container)[0]!.closest('[part~="citations"]')).toBe(row);
  });

  // --- negative controls: the assertions above must have teeth --------------

  it('does NOT count a link the model typed in its prose as a citation', () => {
    // No source parts at all. The prose still contains a rendered anchor to the
    // exact URL a citation would use. If this ever goes green-by-accident, the
    // filter above is measuring the model, not the kit.
    const { container } = renderBody([{ type: 'text', text: MODEL_TYPED_PROSE }]);

    // The decoy is genuinely there and genuinely an anchor…
    const inProse = container.querySelectorAll('[part~="content"] a[href]');
    expect(inProse.length).toBe(1);
    expect(inProse[0]!.getAttribute('href')).toBe('https://ui.kitn.ai/guides/theming');

    // …and it is NOT a citation.
    expect(citationRow(container)).toBeNull();
    expect(citationHrefs(container)).toEqual([]);
  });

  it('renders no citation row for a message with no source parts', () => {
    const { container } = renderBody([
      { type: 'text', text: 'Just an answer.' },
      { type: 'tool', tool: { type: 'get_weather', kind: 'generic', state: 'output-available' } },
    ]);
    expect(citationRow(container)).toBeNull();
  });

  it('separates the citation from the model-typed link when BOTH are present', () => {
    // The realistic case: the model cites in prose AND the search tool produced
    // source parts. Exactly one of those two anchors is the kit's citation.
    const { container } = renderBody([
      { type: 'text', text: MODEL_TYPED_PROSE },
      { type: 'source', source: { url: 'https://ui.kitn.ai/guides/theming', title: 'Theming' } },
    ]);
    expect(container.querySelectorAll('a[href]')).toHaveLength(2);
    expect(citationHrefs(container)).toEqual(['https://ui.kitn.ai/guides/theming']);
  });

  // --- grouping, as seen in the DOM ----------------------------------------

  it('renders three consecutive sources as ONE row, not three', () => {
    const { container } = renderBody([
      { type: 'source', source: { url: 'https://ui.kitn.ai/a' } },
      { type: 'source', source: { url: 'https://ui.kitn.ai/b' } },
      { type: 'source', source: { url: 'https://ui.kitn.ai/c' } },
    ]);
    expect(container.querySelectorAll('[part~="citations"]')).toHaveLength(1);
    expect(citationHrefs(container)).toEqual([
      'https://ui.kitn.ai/a', 'https://ui.kitn.ai/b', 'https://ui.kitn.ai/c',
    ]);
  });

  it('renders two rows when a text part splits the source run', () => {
    const { container } = renderBody([
      { type: 'source', source: { url: 'https://ui.kitn.ai/a' } },
      { type: 'text', text: 'Then I looked further.' },
      { type: 'source', source: { url: 'https://ui.kitn.ai/b' } },
    ]);
    expect(container.querySelectorAll('[part~="citations"]')).toHaveLength(2);
  });

  it('keeps a source group in its original position among the parts', () => {
    const { container } = renderBody([
      { type: 'text', text: 'First.' },
      { type: 'source', source: { url: 'https://ui.kitn.ai/a' } },
      { type: 'text', text: 'Last.' },
    ], false);
    const order = [...container.querySelectorAll('[part~="content"],[part~="citations"]')]
      .map((el) => (el.getAttribute('part')!.includes('citations') ? 'citations' : 'content'));
    expect(order).toEqual(['content', 'citations', 'content']);
  });

  // --- labels + the all-optional Source shape ------------------------------

  it('labels a citation with its index when the model numbered it', () => {
    const { container } = renderBody([
      { type: 'source', source: { url: 'https://ui.kitn.ai/a', index: 1 } },
      { type: 'source', source: { url: 'https://example.com/b', index: 2 } },
    ]);
    expect(citationAnchors(container).map((a) => a.textContent?.trim())).toEqual(['1', '2']);
  });

  it('falls back to the domain when the source is not numbered', () => {
    const { container } = renderBody([
      { type: 'source', source: { url: 'https://ui.kitn.ai/guides/theming' } },
    ]);
    expect(citationAnchors(container)[0]!.textContent?.trim()).toBe('ui.kitn.ai');
  });

  it('renders a url-less source without crashing and without href="undefined"', () => {
    // EVERY field on `Source` is optional. A citation with no url must degrade
    // to a plain non-link chip, never to `<a href="undefined">` or `<a href="">`
    // (which navigates to the current page).
    const { container } = renderBody([
      { type: 'source', source: { title: 'An offline reference', index: 3 } },
      { type: 'source', source: {} },
    ]);
    const row = citationRow(container);
    expect(row).not.toBeNull();
    expect(row!.innerHTML).not.toContain('undefined');
    for (const a of row!.querySelectorAll('a')) {
      // No href attribute at all — an <a> without href is valid and inert.
      expect(a.hasAttribute('href')).toBe(false);
    }
    expect(row!.textContent).toContain('3');
  });

  it('labels a url-less, unnumbered source with its title rather than nothing', () => {
    const { container } = renderBody([
      { type: 'source', source: { title: 'An offline reference' } },
    ]);
    expect(citationRow(container)!.textContent).toContain('An offline reference');
  });

  it('shows the source title + snippet in the hover card', async () => {
    // The chip is only the handle; `title` and `snippet` live in the hover card,
    // which is PORTALED and only mounts while open. Drive it for real (focus
    // opens it, same as pointer-enter) instead of asserting the props go in.
    vi.useFakeTimers();
    try {
      const { container } = renderBody([
        {
          type: 'source',
          source: {
            url: 'https://ui.kitn.ai/guides/theming',
            title: 'Theming',
            snippet: 'Themes are driven by CSS custom properties.',
          },
        },
      ]);
      const chip = citationAnchors(container)[0]!;
      expect(document.body.textContent).not.toContain('Themes are driven by CSS custom properties.');

      fireEvent.focusIn(chip);
      flush(); // V2-FLUSH: v2 stages writes; commit before asserting
      vi.advanceTimersByTime(200); // past HoverCardRoot's 150ms openDelay
      await Promise.resolve();
      flush(); // V2-FLUSH: v2 stages writes; commit before asserting

      expect(document.body.textContent).toContain('Theming');
      expect(document.body.textContent).toContain('Themes are driven by CSS custom properties.');
    } finally {
      vi.useRealTimers();
    }
  });
});
