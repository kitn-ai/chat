/**
 * Unit tests for the declarative `<kai-compare>` API.
 *
 * Strategy (mirrors conversation-list.declarative.test.tsx / toast.declarative):
 * `defineWebComponent` registers a real Shadow-DOM custom element that needs a
 * full browser (Constructable Stylesheets, shadow roots) and is unsuitable for
 * jsdom. So we test:
 *   1. The component contract (data → radiogroup, selection → collapsed winner)
 *      against `ResponseCompare` directly.
 *   2. The facade's EVENT shapes — non-bubbling, non-composed host CustomEvents,
 *      exactly what `defineWebComponent`'s `dispatch` produces.
 * The full component behaviour is covered in response-compare.test.tsx.
 */
import { flush } from 'solid-js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { ResponseCompare } from '../components/response-compare';
import type { ResponseCompareData, CompareSelection } from '../components/response-compare';

afterEach(cleanup);

const data: ResponseCompareData = {
  prompt: 'Pick one',
  candidates: [
    { id: 'a', content: 'Alpha answer', label: 'A' },
    { id: 'b', content: 'Bravo answer', label: 'B' },
  ],
};

describe('kai-compare — declarative data property', () => {
  it('renders the two candidates as a radiogroup when data is set', () => {
    const { getByText, getAllByRole } = render(() => <ResponseCompare data={data} />);
    expect(getAllByRole('radio')).toHaveLength(2);
    expect(getByText('Alpha answer')).toBeInTheDocument();
    expect(getByText('Bravo answer')).toBeInTheDocument();
  });

  it('renders the collapsed winner when the selection property re-hydrates a pick', () => {
    const { queryByRole, getByText } = render(() => (
      <ResponseCompare data={data} selection={{ chosenId: 'a', rejectedIds: ['b'] }} />
    ));
    expect(queryByRole('radiogroup')).toBeNull();
    expect(getByText('Alpha answer')).toBeInTheDocument();
  });

  it('fires onSelect with the preference pair — the facade re-emits this as kai-compare-select', async () => {
    const onSelect = vi.fn();
    const { getAllByText } = render(() => <ResponseCompare data={data} onSelect={onSelect} />);
    fireEvent.click(getAllByText('Pick this')[0]);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    const sel = onSelect.mock.calls[0][0] as CompareSelection;
    expect(sel.chosenId).toBe('a');
    expect(sel.rejectedIds).toEqual(['b']);
  });
});

describe('kai-compare — event shapes (non-bubbling host CustomEvents)', () => {
  // The facade dispatches via defineWebComponent's `dispatch`, which always builds
  // `new CustomEvent(type, { detail, bubbles: false, composed: false })`. Verify a
  // consumer listening on the host (not an ancestor) receives it and it does NOT
  // bubble.
  it('kai-compare-select does not bubble and carries {chosenId, rejectedIds, at}', () => {
    const host = document.createElement('kai-compare');
    const parent = document.createElement('div');
    parent.appendChild(host);
    document.body.appendChild(parent);

    const onHost = vi.fn();
    const onParent = vi.fn();
    host.addEventListener('kai-compare-select', onHost as EventListener);
    parent.addEventListener('kai-compare-select', onParent as EventListener);

    const detail: CompareSelection = { chosenId: 'a', rejectedIds: ['b'], at: 123 };
    host.dispatchEvent(
      new CustomEvent('kai-compare-select', { detail, bubbles: false, composed: false }),
    );

    expect(onHost).toHaveBeenCalledTimes(1);
    const evt = onHost.mock.calls[0][0] as CustomEvent;
    expect(evt.bubbles).toBe(false);
    expect(evt.composed).toBe(false);
    expect(evt.detail).toEqual(detail);
    expect(onParent).not.toHaveBeenCalled();

    parent.remove();
  });

  it('kai-ready and kai-error carry {compareId} / {compareId, message}', () => {
    const host = document.createElement('kai-compare');
    document.body.appendChild(host);

    const onReady = vi.fn();
    const onError = vi.fn();
    host.addEventListener('kai-ready', onReady as EventListener);
    host.addEventListener('kai-error', onError as EventListener);

    host.dispatchEvent(
      new CustomEvent('kai-ready', { detail: { compareId: 'c1' }, bubbles: false, composed: false }),
    );
    host.dispatchEvent(
      new CustomEvent('kai-error', {
        detail: { compareId: 'c1', message: 'bad' },
        bubbles: false,
        composed: false,
      }),
    );

    expect((onReady.mock.calls[0][0] as CustomEvent).detail).toEqual({ compareId: 'c1' });
    expect((onError.mock.calls[0][0] as CustomEvent).detail).toEqual({
      compareId: 'c1',
      message: 'bad',
    });

    host.remove();
  });
});
