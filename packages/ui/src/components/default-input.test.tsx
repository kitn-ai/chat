import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { DefaultPromptInput } from '../elements/default-input';

// jsdom doesn't implement Element.scrollTo; some inner controls may call it.
if (!Element.prototype.scrollTo) (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};

afterEach(cleanup);

const noop = () => {};

// The input is now the contenteditable composer (not a <textarea>); "disabled"
// is reflected as contenteditable="false" on the editable surface.
const editableEl = (c: HTMLElement) => c.querySelector('[data-kai-composer-editable]') as HTMLElement;

describe('DefaultPromptInput disabled state', () => {
  it('renders the editable and send button as disabled', () => {
    const { container } = render(() => (
      <DefaultPromptInput
        value="hello"
        disabled
        onValueChange={noop}
        onSubmit={noop}
        onSuggestionClick={noop}
      />
    ));
    const send = container.querySelector('[data-testid="send"]');
    expect(editableEl(container).getAttribute('contenteditable')).toBe('false');
    expect(send).toBeDisabled();
  });

  it('does not call onSubmit when the send button is clicked while disabled', () => {
    const onSubmit = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput
        value="hello"
        disabled
        onValueChange={noop}
        onSubmit={onSubmit}
        onSuggestionClick={noop}
      />
    ));
    const send = container.querySelector('[data-testid="send"]') as HTMLButtonElement;
    fireEvent.click(send);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not call onSubmit when Enter is pressed while disabled', () => {
    const onSubmit = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput
        value="hello"
        disabled
        onValueChange={noop}
        onSubmit={onSubmit}
        onSuggestionClick={noop}
      />
    ));
    const editable = editableEl(container);
    fireEvent.keyDown(editable, { key: 'Enter' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reactively disables/enables the editable when `disabled` changes after mount', () => {
    const [disabled, setDisabled] = createSignal(false);
    const { container } = render(() => (
      <DefaultPromptInput
        value="hi"
        disabled={disabled()}
        onValueChange={noop}
        onSubmit={noop}
        onSuggestionClick={noop}
      />
    ));
    expect(editableEl(container).getAttribute('contenteditable')).toBe('plaintext-only');
    setDisabled(true);
    flush(); // V2-FLUSH: commit the staged write
    expect(editableEl(container).getAttribute('contenteditable')).toBe('false'); // fails if PromptInput context captures `disabled` statically
    setDisabled(false);
    flush(); // V2-FLUSH: commit the staged write
    expect(editableEl(container).getAttribute('contenteditable')).toBe('plaintext-only');
  });

  it('still submits via Enter when not disabled (sanity)', () => {
    const onSubmit = vi.fn();
    const { container } = render(() => (
      <DefaultPromptInput
        value="hello"
        onValueChange={noop}
        onSubmit={onSubmit}
        onSuggestionClick={noop}
      />
    ));
    const editable = editableEl(container);
    fireEvent.keyDown(editable, { key: 'Enter' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('DefaultPromptInput composition slots', () => {
  it('renders the input-top, toolbar-start and toolbar-end named slots', () => {
    const { container } = render(() => (
      <DefaultPromptInput
        value=""
        onValueChange={noop}
        onSubmit={noop}
        onSuggestionClick={noop}
      />
    ));
    expect(container.querySelector('slot[name="input-top"]')).toBeTruthy();
    expect(container.querySelector('slot[name="toolbar-start"]')).toBeTruthy();
    expect(container.querySelector('slot[name="toolbar-end"]')).toBeTruthy();
  });
});
