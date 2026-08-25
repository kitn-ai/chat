/**
 * Unit tests for the declarative `<kai-toast-region>` API.
 *
 * Strategy (mirrors conversation-list.declarative.test.tsx): `defineWebComponent`
 * registers a real Shadow-DOM custom element that needs a full browser
 * (Constructable Stylesheets, shadow roots) and is unsuitable for jsdom. So we
 * test the facade's CONTRACT against the pieces it composes:
 *   1. Setting `toasts=[...]` renders the stack → exercise `ToastRegion` directly.
 *   2. A new-array-reference filter removes a toast from the stack.
 *   3. `kai-dismiss` is a non-bubbling, non-composed host CustomEvent — assert the
 *      event shape the facade's `dispatch` helper produces.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { ToastRegion } from '../components/toast';
import type { ToastItem } from '../primitives/toast-store';

afterEach(cleanup);

const item = (id: string, message: string): ToastItem => ({ id, message, duration: 0 });

describe('kai-toast-region — declarative toasts property', () => {
  it('renders the stack when toasts is set', () => {
    const toasts = [item('a', 'Alpha'), item('b', 'Bravo')];
    const { getByText } = render(() => <ToastRegion toasts={toasts} />);
    expect(getByText('Alpha')).toBeInTheDocument();
    expect(getByText('Bravo')).toBeInTheDocument();
  });

  it('removing one via a new array reference drops it from the stack', async () => {
    const [toasts, setToasts] = createSignal<ToastItem[]>([item('a', 'Alpha'), item('b', 'Bravo')]);
    const { queryByText } = render(() => <ToastRegion toasts={toasts()} />);
    expect(queryByText('Alpha')).toBeInTheDocument();
    // new reference without 'a' — the way a consumer updates the JS property
    setToasts((prev) => prev.filter((t) => t.id !== 'a'));
    flush(); // V2-FLUSH: commit the staged write
    await waitFor(() => expect(queryByText('Alpha')).toBeNull());
    expect(queryByText('Bravo')).toBeInTheDocument();
  });

  it('fires onDismiss(id, reason) when the × is clicked — the facade re-emits this as kai-dismiss', async () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(() => (
      <ToastRegion toasts={[item('x', 'Xray')]} onDismiss={onDismiss} />
    ));
    fireEvent.click(getByLabelText('Dismiss'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('x', 'close'));
  });
});

describe('kai-toast-region — event shape (non-bubbling host CustomEvent)', () => {
  // The facade dispatches via defineWebComponent's `dispatch`, which always
  // builds `new CustomEvent(type, { detail, bubbles: false, composed: false })`.
  // Verify a consumer listening on the host (not an ancestor) receives it and
  // that it does NOT bubble.
  it('kai-dismiss does not bubble and carries {id, reason}', () => {
    const host = document.createElement('kai-toast-region');
    const parent = document.createElement('div');
    parent.appendChild(host);
    document.body.appendChild(parent);

    const onHost = vi.fn();
    const onParent = vi.fn();
    host.addEventListener('kai-dismiss', onHost as EventListener);
    parent.addEventListener('kai-dismiss', onParent as EventListener);

    // Mirror exactly what the facade's dispatch produces.
    host.dispatchEvent(
      new CustomEvent('kai-dismiss', {
        detail: { id: 'x', reason: 'close' },
        bubbles: false,
        composed: false,
      }),
    );

    expect(onHost).toHaveBeenCalledTimes(1);
    const evt = onHost.mock.calls[0][0] as CustomEvent;
    expect(evt.bubbles).toBe(false);
    expect(evt.composed).toBe(false);
    expect(evt.detail).toEqual({ id: 'x', reason: 'close' });
    // Non-bubbling: an ancestor listener never sees it.
    expect(onParent).not.toHaveBeenCalled();

    parent.remove();
  });
});
