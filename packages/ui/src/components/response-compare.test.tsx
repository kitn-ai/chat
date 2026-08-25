/**
 * Unit tests for `ResponseCompare` + its pure helpers + the `useResolved`
 * controller. We test the Solid component directly (not the Shadow-DOM custom
 * element) per the conversation-list.declarative.test.tsx strategy — the facade's
 * event contract is covered in compare.declarative.test.tsx.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { createRoot, createSignal, flush } from 'solid-js';
import { ResponseCompare, useResolved } from './response-compare';
import {
  normalizeCandidates,
  buildSelection,
  isAnyStreaming,
} from './response-compare-types';
import type {
  CompareCandidate,
  ComparePair,
  ResponseCompareData,
  CompareSelection,
} from './response-compare-types';

afterEach(cleanup);

// jsdom has no ResizeObserver; the collapsed-view test renders a `Tool` part whose
// collapsible measures itself. Stub it so MessageBody's full body renders. (Standard
// jsdom shim, not a component workaround.)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const candA = (over: Partial<CompareCandidate> = {}): CompareCandidate => ({
  id: 'a',
  content: 'Answer from A',
  label: 'A',
  ...over,
});
const candB = (over: Partial<CompareCandidate> = {}): CompareCandidate => ({
  id: 'b',
  content: 'Answer from B',
  label: 'B',
  ...over,
});

const data = (over: Partial<ResponseCompareData> = {}): ResponseCompareData => ({
  prompt: 'Which is better?',
  candidates: [candA(), candB()],
  ...over,
});

// ─── normalizeCandidates ─────────────────────────────────────────────────────

describe('normalizeCandidates', () => {
  it('accepts exactly two well-formed candidates', () => {
    const r = normalizeCandidates([candA(), candB()]);
    expect(r.error).toBeUndefined();
    expect(r.candidates).not.toBeNull();
    expect(r.candidates!.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('rejects a single candidate (≠2)', () => {
    const r = normalizeCandidates([candA()]);
    expect(r.candidates).toBeNull();
    expect(r.error).toMatch(/exactly two/i);
  });

  it('rejects three candidates (≠2)', () => {
    const r = normalizeCandidates([candA(), candB(), candA({ id: 'c' })]);
    expect(r.candidates).toBeNull();
    expect(r.error).toMatch(/exactly two/i);
  });

  it('rejects a non-array', () => {
    expect(normalizeCandidates(undefined).candidates).toBeNull();
    expect(normalizeCandidates({}).candidates).toBeNull();
  });

  it('rejects duplicate ids', () => {
    const r = normalizeCandidates([candA(), candB({ id: 'a' })]);
    expect(r.candidates).toBeNull();
    expect(r.error).toMatch(/duplicate/i);
  });

  it('rejects an empty / missing id', () => {
    expect(normalizeCandidates([candA({ id: '' }), candB()]).candidates).toBeNull();
    expect(
      normalizeCandidates([{ content: 'x' } as CompareCandidate, candB()]).candidates,
    ).toBeNull();
  });

  it('coerces missing content to an empty string and defaults streaming to false', () => {
    const r = normalizeCandidates([
      { id: 'a' } as CompareCandidate,
      candB(),
    ]);
    expect(r.candidates![0].content).toBe('');
    expect(r.candidates![0].streaming).toBe(false);
  });
});

// ─── buildSelection ──────────────────────────────────────────────────────────

describe('buildSelection', () => {
  const pair: ComparePair = [candA(), candB()];

  it('chooses A → rejects [B]', () => {
    const sel = buildSelection(pair, 'a');
    expect(sel.chosenId).toBe('a');
    expect(sel.rejectedIds).toEqual(['b']);
    expect(typeof sel.at).toBe('number');
  });

  it('chooses B → rejects [A]', () => {
    const sel = buildSelection(pair, 'b');
    expect(sel.chosenId).toBe('b');
    expect(sel.rejectedIds).toEqual(['a']);
  });
});

describe('isAnyStreaming', () => {
  it('is false when neither streams, true when either streams', () => {
    expect(isAnyStreaming([candA(), candB()])).toBe(false);
    expect(isAnyStreaming([candA({ streaming: true }), candB()])).toBe(true);
    expect(isAnyStreaming([candA(), candB({ streaming: true })])).toBe(true);
    expect(isAnyStreaming(null)).toBe(false);
  });
});

// ─── useResolved — precedence controller ─────────────────────────────────────

describe('useResolved — precedence (prop > local optimistic > none)', () => {
  it('starts unresolved; setLocal flips it optimistically', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it (owned-scope write guard).
    const [d] = createSignal({ k: 1 });
    const [c, dispose] = createRoot((dd) =>
      [useResolved<CompareSelection>({ prop: () => undefined, data: d }), dd] as const);
    {
      expect(c.isResolved()).toBe(false);
      expect(c.isOptimistic()).toBe(false);
      c.setLocal({ chosenId: 'a', rejectedIds: ['b'] });
      flush(); // V2-FLUSH
      expect(c.isResolved()).toBe(true);
      expect(c.isOptimistic()).toBe(true);
      expect(c.value()?.chosenId).toBe('a');
      dispose();
    }
  });

  it('the prop wins over a local flip and is NOT optimistic', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it (owned-scope write guard).
    const [d] = createSignal({ k: 1 });
    const [prop] = createSignal<CompareSelection | undefined>({
      chosenId: 'b',
      rejectedIds: ['a'],
    });
    const [c, dispose] = createRoot((dd) =>
      [useResolved<CompareSelection>({ prop, data: d }), dd] as const);
    c.setLocal({ chosenId: 'a', rejectedIds: ['b'] });
    flush(); // V2-FLUSH
    expect(c.value()?.chosenId).toBe('b'); // prop wins
    expect(c.isOptimistic()).toBe(false); // not a session flip
    dispose();
  });

  it('a fresh data identity clears the optimistic flip but NOT the prop', async () => {
    // The clear runs in a deferred createEffect, so drive it through a rendered
    // harness (where Solid flushes effects) and observe via waitFor.
    const [d, setD] = createSignal({ k: 1 });
    const [prop, setProp] = createSignal<CompareSelection | undefined>(undefined);
    let ctrl!: ReturnType<typeof useResolved<CompareSelection>>;
    const Harness = () => {
      ctrl = useResolved<CompareSelection>({ prop, data: d });
      return <span data-testid="resolved">{String(ctrl.isResolved())}</span>;
    };
    const { getByTestId } = render(() => <Harness />);

    // optimistic flip → cleared by a new data ref
    ctrl.setLocal({ chosenId: 'a', rejectedIds: ['b'] });
    await waitFor(() => expect(getByTestId('resolved').textContent).toBe('true'));
    setD({ k: 2 });
    flush(); // V2-FLUSH: commit the staged write
    await waitFor(() => expect(getByTestId('resolved').textContent).toBe('false'));

    // prop survives a new data ref
    setProp({ chosenId: 'b', rejectedIds: ['a'] });
    flush(); // V2-FLUSH: commit the staged write
    await waitFor(() => expect(ctrl.value()?.chosenId).toBe('b'));
    setD({ k: 3 });
    flush(); // V2-FLUSH: commit the staged write
    expect(ctrl.value()?.chosenId).toBe('b');
  });
});

// ─── ResponseCompare — rendering + selection ─────────────────────────────────

describe('ResponseCompare — rendering', () => {
  it('renders both candidate bodies as a radiogroup of two radios', () => {
    const { getByText, getAllByRole, getByRole } = render(() => (
      <ResponseCompare data={data()} />
    ));
    expect(getByRole('radiogroup')).toBeInTheDocument();
    expect(getAllByRole('radio')).toHaveLength(2);
    expect(getByText('Answer from A')).toBeInTheDocument();
    expect(getByText('Answer from B')).toBeInTheDocument();
    // the prompt is shown
    expect(getByText('Which is better?')).toBeInTheDocument();
  });

  it('renders an inline error for an unusable definition (≠2)', () => {
    const { getByText } = render(() => (
      <ResponseCompare data={{ candidates: [candA()] as unknown as ComparePair }} />
    ));
    expect(getByText(/exactly two/i)).toBeInTheDocument();
  });
});

describe('ResponseCompare — selection commits + single-shot', () => {
  it('picking A emits {chosenId:a, rejectedIds:[b]} and collapses to A', async () => {
    const onSelect = vi.fn();
    const { getAllByText, queryByRole, getByText } = render(() => (
      <ResponseCompare data={data()} onSelect={onSelect} />
    ));
    fireEvent.click(getAllByText('Pick this')[0]);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    const sel = onSelect.mock.calls[0][0] as CompareSelection;
    expect(sel.chosenId).toBe('a');
    expect(sel.rejectedIds).toEqual(['b']);
    expect(typeof sel.at).toBe('number');
    // collapsed: no more radiogroup, the chosen body remains
    await waitFor(() => expect(queryByRole('radiogroup')).toBeNull());
    expect(getByText('Answer from A')).toBeInTheDocument();
  });

  it('picking B emits {chosenId:b, rejectedIds:[a]}', async () => {
    const onSelect = vi.fn();
    const { getAllByText } = render(() => (
      <ResponseCompare data={data()} onSelect={onSelect} />
    ));
    fireEvent.click(getAllByText('Pick this')[1]);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    const sel = onSelect.mock.calls[0][0] as CompareSelection;
    expect(sel.chosenId).toBe('b');
    expect(sel.rejectedIds).toEqual(['a']);
  });

  it('is single-shot — a second pick after resolve is inert', async () => {
    const onSelect = vi.fn();
    const { getAllByText, queryAllByText } = render(() => (
      <ResponseCompare data={data()} onSelect={onSelect} />
    ));
    fireEvent.click(getAllByText('Pick this')[0]);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    // the pick buttons are gone after collapse; even if a leftover were clicked,
    // resolution is single-shot. Re-query and click anything still present.
    const leftover = queryAllByText('Pick this');
    leftover.forEach((b) => fireEvent.click(b));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

// ─── Streaming gating ────────────────────────────────────────────────────────

describe('ResponseCompare — streaming gates the pick', () => {
  it('disables both pick buttons + shows a shimmer while either streams; enables on settle', async () => {
    const [d, setD] = createSignal<ResponseCompareData>(
      data({ candidates: [candA({ streaming: true }), candB()] }),
    );
    const onReady = vi.fn();
    const { container, getByText } = render(() => (
      <ResponseCompare data={d()} onReady={onReady} />
    ));
    // The pick buttons are aria-hidden (the radio wrapper is the a11y control),
    // so query the DOM directly — filter to the "Pick this" picks (the tab pills
    // are also buttons, but they aren't streaming-gated).
    const buttons = () =>
      (Array.from(container.querySelectorAll('button')) as HTMLButtonElement[])
        .filter((b) => b.textContent?.includes('Pick this'));
    // while A streams: both pick buttons disabled
    expect(buttons().length).toBe(2);
    expect(buttons().every((b) => b.disabled)).toBe(true);
    // the streaming column shows the shimmer text
    expect(getByText(/Generating response/i)).toBeInTheDocument();

    // settle: fresh data ref with no streaming
    setD(data({ candidates: [candA(), candB()] }));
    flush(); // V2-FLUSH: commit the staged write
    await waitFor(() => expect(buttons().every((b) => !b.disabled)).toBe(true));
    // onReady fires once both have settled
    await waitFor(() => expect(onReady).toHaveBeenCalled());
  });

  it('clicking a disabled pick while streaming does not emit', () => {
    const onSelect = vi.fn();
    const { getAllByText } = render(() => (
      <ResponseCompare
        data={data({ candidates: [candA({ streaming: true }), candB({ streaming: true })] })}
        onSelect={onSelect}
      />
    ));
    // both stream → both show shimmer, no "Pick this" target text is enabled, but
    // the buttons still render disabled. Clicking is inert.
    getAllByText('Pick this').forEach((b) => fireEvent.click(b));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// ─── Resolution precedence at the component level ────────────────────────────

describe('ResponseCompare — selection prop re-hydrates the collapsed winner', () => {
  it('a `selection` prop renders the collapsed view (no radiogroup) at the chosen candidate', () => {
    const { queryByRole, getByText } = render(() => (
      <ResponseCompare
        data={data()}
        selection={{ chosenId: 'b', rejectedIds: ['a'] }}
      />
    ));
    expect(queryByRole('radiogroup')).toBeNull();
    expect(getByText('Answer from B')).toBeInTheDocument();
  });

  it('a fresh data identity clears an optimistic flip (re-opens the radiogroup), but the prop keeps it collapsed', async () => {
    // optimistic case: no prop. Pick → collapse → new data ref re-opens.
    const [d, setD] = createSignal<ResponseCompareData>(data());
    const { getAllByText, queryByRole } = render(() => (
      <ResponseCompare data={d()} />
    ));
    fireEvent.click(getAllByText('Pick this')[0]);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await waitFor(() => expect(queryByRole('radiogroup')).toBeNull());
    setD(data()); // fresh identity
    flush(); // V2-FLUSH: commit the staged write
    await waitFor(() => expect(queryByRole('radiogroup')).not.toBeNull());
  });
});

// ─── Collapsed view renders the chosen body fully (MessageBody reuse) ─────────

describe('ResponseCompare — collapsed view reuses MessageBody', () => {
  it('renders the chosen candidate reasoning + tool + markdown content', async () => {
    const rich = candA({
      content: 'The **bold** answer',
      reasoning: { text: 'because reasons', label: 'Why' },
      tools: [
        { type: 'search', state: 'output-available', input: { q: 'x' }, output: { hits: 1 } },
      ],
    });
    const { getByText, container } = render(() => (
      <ResponseCompare
        data={data({ candidates: [rich, candB()] })}
        selection={{ chosenId: 'a', rejectedIds: ['b'] }}
      />
    ));
    // markdown renders asynchronously → wait for the <strong>
    await waitFor(() => expect(container.querySelector('strong')?.textContent).toBe('bold'));
    // reasoning label present
    expect(getByText('Why')).toBeInTheDocument();
    // tool type rendered (the Tool component shows the tool name)
    expect(getByText(/search/i)).toBeInTheDocument();
  });
});

// ─── Keyboard / roving tabindex ──────────────────────────────────────────────

describe('ResponseCompare — keyboard a11y', () => {
  it('Arrow keys move focus A↔B; Enter on the focused column selects it', async () => {
    const onSelect = vi.fn();
    const { getByRole, getAllByRole } = render(() => (
      <ResponseCompare data={data()} onSelect={onSelect} />
    ));
    const group = getByRole('radiogroup');
    const radios = getAllByRole('radio') as HTMLElement[];
    // initial roving tab stop is column A (index 0)
    expect(radios[0].getAttribute('tabindex')).toBe('0');
    expect(radios[1].getAttribute('tabindex')).toBe('-1');

    // ArrowRight → focus moves to B
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await waitFor(() => expect(radios[1].getAttribute('tabindex')).toBe('0'));
    expect(radios[0].getAttribute('tabindex')).toBe('-1');

    // Enter selects the focused column (B)
    fireEvent.keyDown(group, { key: 'Enter' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect((onSelect.mock.calls[0][0] as CompareSelection).chosenId).toBe('b');
  });

  it('Space on the initial column selects A', async () => {
    const onSelect = vi.fn();
    const { getByRole } = render(() => (
      <ResponseCompare data={data()} onSelect={onSelect} />
    ));
    fireEvent.keyDown(getByRole('radiogroup'), { key: ' ' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect((onSelect.mock.calls[0][0] as CompareSelection).chosenId).toBe('a');
  });
});

// ─── Layout ──────────────────────────────────────────────────────────────────

describe('ResponseCompare — layout', () => {
  it('layout="columns" forces a 2-col grid (no container-query class)', () => {
    const { getByRole } = render(() => <ResponseCompare data={data()} layout="columns" />);
    const group = getByRole('radiogroup');
    expect(group.className).toContain('grid-cols-2');
    expect(group.className).not.toContain('@container');
  });

  it('layout="tabs" forces a single column + shows the tab pills', () => {
    const { getByRole, getAllByRole } = render(() => <ResponseCompare data={data()} layout="tabs" />);
    const group = getByRole('radiogroup');
    expect(group.className).toContain('grid-cols-1');
    expect(group.className).not.toContain('@[640px]');
    // pills to switch which candidate is shown
    expect(getByRole('tablist')).toBeTruthy();
    expect(getAllByRole('tab')).toHaveLength(2);
  });

  it('layout="auto" (default) switches columns↔tabs by CONTAINER width', () => {
    const { getByRole, container } = render(() => <ResponseCompare data={data()} />);
    const group = getByRole('radiogroup');
    expect(group.className).toContain('@[640px]/compare:grid-cols-2');
    // @container/compare on the outer wrapper drives the pills + columns
    expect(container.querySelector('[class*="@container/compare"]')).toBeTruthy();
  });
});
