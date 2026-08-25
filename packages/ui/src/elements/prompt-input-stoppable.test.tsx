/**
 * Unit tests for the stoppable Stop button affordance in DefaultPromptInput.
 *
 * Strategy: test DefaultPromptInput (the Solid component) directly — the
 * defineWebComponent custom element requires a full browser environment
 * (Constructable Stylesheets, shadow roots) unsuitable for jsdom.
 * This mirrors the pattern in prompt-suggestions.declarative.test.tsx.
 */
import { flush } from 'solid-js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { DefaultPromptInput } from './default-input';

afterEach(cleanup);

const noop = () => {};
const baseProps = {
  value: '',
  onValueChange: noop,
  onSubmit: noop,
  onSuggestionClick: noop,
};

describe('DefaultPromptInput stoppable Stop button', () => {
  it('renders the send button (not Stop) when loading=false stoppable=false', () => {
    const { getByTestId, queryByTestId } = render(() => (
      <DefaultPromptInput {...baseProps} loading={false} stoppable={false} />
    ));
    expect(getByTestId('send')).toBeInTheDocument();
    expect(queryByTestId('stop')).not.toBeInTheDocument();
  });

  it('renders the send button (not Stop) when stoppable=true but loading=false', () => {
    const { getByTestId, queryByTestId } = render(() => (
      <DefaultPromptInput {...baseProps} loading={false} stoppable={true} />
    ));
    expect(getByTestId('send')).toBeInTheDocument();
    expect(queryByTestId('stop')).not.toBeInTheDocument();
  });

  it('renders the send button (not Stop) when loading=true but stoppable=false', () => {
    const { getByTestId, queryByTestId } = render(() => (
      <DefaultPromptInput {...baseProps} loading={true} stoppable={false} />
    ));
    expect(getByTestId('send')).toBeInTheDocument();
    expect(queryByTestId('stop')).not.toBeInTheDocument();
  });

  it('renders the Stop button (not send) when both loading=true and stoppable=true', () => {
    const { getByTestId, queryByTestId } = render(() => (
      <DefaultPromptInput {...baseProps} loading={true} stoppable={true} />
    ));
    expect(getByTestId('stop')).toBeInTheDocument();
    expect(queryByTestId('send')).not.toBeInTheDocument();
  });

  it('Stop button has accessible label "Stop"', () => {
    const { getByLabelText } = render(() => (
      <DefaultPromptInput {...baseProps} loading={true} stoppable={true} />
    ));
    expect(getByLabelText('Stop')).toBeInTheDocument();
  });

  it('clicking the Stop button calls onStop', () => {
    const onStop = vi.fn();
    const { getByTestId } = render(() => (
      <DefaultPromptInput {...baseProps} loading={true} stoppable={true} onStop={onStop} />
    ));
    fireEvent.click(getByTestId('stop'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('clicking the Stop button does NOT call onSubmit', () => {
    const onSubmit = vi.fn();
    const onStop = vi.fn();
    const { getByTestId } = render(() => (
      <DefaultPromptInput
        {...baseProps}
        onSubmit={onSubmit}
        loading={true}
        stoppable={true}
        onStop={onStop}
      />
    ));
    fireEvent.click(getByTestId('stop'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
