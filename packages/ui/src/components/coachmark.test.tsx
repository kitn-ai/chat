import { flush } from 'solid-js';
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent, within } from '@solidjs/testing-library';
import { Coachmark } from './coachmark';

afterEach(cleanup);

// createPresence unmounts on a microtask when there is no exit animation (jsdom),
// so flush the queue before asserting the bubble has left the DOM.
const tick = () => new Promise((r) => setTimeout(r, 0));

// The bubble renders through a Portal mounted onto document.body — a *sibling* of
// the render container — so container-scoped queries can't see it. Query the document.
const doc = () => within(document.body);

describe('Coachmark', () => {
  it('renders the headline, badge, and body when open', () => {
    render(() => (
      <Coachmark defaultOpen headline="Cowork has a new home" badge="New" content="Chat with Claude or switch to Cowork.">
        <button>Cowork</button>
      </Coachmark>
    ));
    expect(doc().getByText('Cowork has a new home')).toBeInTheDocument();
    expect(doc().getByText('New')).toBeInTheDocument();
    expect(doc().getByText('Chat with Claude or switch to Cowork.')).toBeInTheDocument();
  });

  it('renders the anchor (default slot) trigger', () => {
    const { getByText } = render(() => (
      <Coachmark defaultOpen headline="Hi">
        <button>Cowork</button>
      </Coachmark>
    ));
    expect(getByText('Cowork')).toBeInTheDocument();
  });

  it('shows nothing until open', () => {
    render(() => (
      <Coachmark headline="Cowork has a new home">
        <button>Cowork</button>
      </Coachmark>
    ));
    expect(doc().queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('default-open shows the bubble on mount', () => {
    render(() => (
      <Coachmark defaultOpen headline="Cowork has a new home">
        <button>Cowork</button>
      </Coachmark>
    ));
    expect(doc().getByRole('dialog')).toBeInTheDocument();
  });

  it('calls onDismiss when the × button is clicked', async () => {
    const onDismiss = vi.fn();
    render(() => (
      <Coachmark defaultOpen headline="Cowork has a new home" onDismiss={onDismiss}>
        <button>Cowork</button>
      </Coachmark>
    ));
    fireEvent.click(doc().getByRole('button', { name: 'Dismiss' }));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // Dismissing also closes the bubble.
    await tick();
    expect(doc().queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the arrow by default', () => {
    render(() => (
      <Coachmark defaultOpen headline="Cowork has a new home">
        <button>Cowork</button>
      </Coachmark>
    ));
    expect(document.querySelector('[part="arrow"]')).toBeInTheDocument();
  });

  it('omits the arrow when arrow={false}', () => {
    render(() => (
      <Coachmark defaultOpen arrow={false} headline="Cowork has a new home">
        <button>Cowork</button>
      </Coachmark>
    ));
    expect(document.querySelector('[part="arrow"]')).not.toBeInTheDocument();
  });

  it('labels the dialog by its headline', () => {
    render(() => (
      <Coachmark defaultOpen headline="Cowork has a new home">
        <button>Cowork</button>
      </Coachmark>
    ));
    const dialog = doc().getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('Cowork has a new home');
  });
});
