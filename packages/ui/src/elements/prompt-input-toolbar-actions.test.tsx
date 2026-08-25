/**
 * Unit tests for custom `<kai-action>` toolbar buttons in DefaultPromptInput.
 *
 * Strategy: test DefaultPromptInput (the Solid component) directly — the
 * defineWebComponent custom element requires a full browser environment
 * (Constructable Stylesheets, shadow roots) unsuitable for jsdom.
 * This mirrors the pattern in prompt-input-stoppable.test.tsx.
 */
import { flush } from 'solid-js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { DefaultPromptInput } from './default-input';
import type { CustomAction } from './chat-types';

afterEach(cleanup);

const noop = () => {};
const baseProps = {
  value: '',
  onValueChange: noop,
  onSubmit: noop,
  onSuggestionClick: noop,
};

const ACTIONS: CustomAction[] = [
  { id: 'attach', label: 'Attach', icon: 'paperclip', tooltip: 'Attach file' },
  { id: 'bookmark', label: 'Bookmark', icon: 'bookmark', tooltip: 'Save for later' },
];

describe('DefaultPromptInput custom toolbar actions', () => {
  it('renders no custom buttons when toolbarActions is empty', () => {
    const { queryByRole } = render(() => (
      <DefaultPromptInput {...baseProps} toolbarActions={[]} />
    ));
    // The send button is the only button when no custom actions are set.
    // (paperclip attach is absent because onAttachmentsChange is not provided)
    const buttons = queryByRole('button', { name: 'Attach' });
    expect(buttons).not.toBeInTheDocument();
  });

  it('renders one ghost button per custom action', () => {
    const { getAllByRole } = render(() => (
      <DefaultPromptInput {...baseProps} toolbarActions={ACTIONS} />
    ));
    // aria-label is set to action.label on each button
    const attachBtn = getAllByRole('button').find(
      (b) => b.getAttribute('aria-label') === 'Attach',
    );
    const bookmarkBtn = getAllByRole('button').find(
      (b) => b.getAttribute('aria-label') === 'Bookmark',
    );
    expect(attachBtn).toBeInTheDocument();
    expect(bookmarkBtn).toBeInTheDocument();
  });

  it('sets data-action attribute to the action id', () => {
    const { getAllByRole } = render(() => (
      <DefaultPromptInput {...baseProps} toolbarActions={ACTIONS} />
    ));
    const attachBtn = getAllByRole('button').find(
      (b) => b.getAttribute('aria-label') === 'Attach',
    );
    expect(attachBtn).toHaveAttribute('data-action', 'attach');
  });

  it('clicking a custom action button calls onAction with the action id', () => {
    const onAction = vi.fn();
    const { getAllByRole } = render(() => (
      <DefaultPromptInput {...baseProps} toolbarActions={ACTIONS} onAction={onAction} />
    ));
    const attachBtn = getAllByRole('button').find(
      (b) => b.getAttribute('aria-label') === 'Attach',
    )!;
    fireEvent.click(attachBtn);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith('attach');
  });

  it('clicking the second action button fires onAction with its id', () => {
    const onAction = vi.fn();
    const { getAllByRole } = render(() => (
      <DefaultPromptInput {...baseProps} toolbarActions={ACTIONS} onAction={onAction} />
    ));
    const bookmarkBtn = getAllByRole('button').find(
      (b) => b.getAttribute('aria-label') === 'Bookmark',
    )!;
    fireEvent.click(bookmarkBtn);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onAction).toHaveBeenCalledWith('bookmark');
  });

  it('clicking a custom action does NOT call onSubmit', () => {
    const onSubmit = vi.fn();
    const onAction = vi.fn();
    const { getAllByRole } = render(() => (
      <DefaultPromptInput
        {...baseProps}
        onSubmit={onSubmit}
        toolbarActions={ACTIONS}
        onAction={onAction}
      />
    ));
    const attachBtn = getAllByRole('button').find(
      (b) => b.getAttribute('aria-label') === 'Attach',
    )!;
    fireEvent.click(attachBtn);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders a label-only button when the icon name is unknown', () => {
    const unknownIconAction: CustomAction[] = [
      { id: 'mystery', label: 'Mystery', icon: 'not-a-real-icon' },
    ];
    const { getByRole } = render(() => (
      <DefaultPromptInput {...baseProps} toolbarActions={unknownIconAction} />
    ));
    // aria-label is still set to the label
    const btn = getByRole('button', { name: 'Mystery' });
    expect(btn).toBeInTheDocument();
  });
});
