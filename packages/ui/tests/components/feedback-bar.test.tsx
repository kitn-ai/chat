import { flush } from 'solid-js';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@solidjs/testing-library';
import { FeedbackBar } from '../../src/components/feedback-bar';

describe('FeedbackBar', () => {
  it('renders with title', () => {
    render(() => <FeedbackBar title="Was this helpful?" />);
    expect(screen.getByText('Was this helpful?')).toBeTruthy();
  });

  it('clicking thumbs-up calls onFeedback with "helpful"', () => {
    const onFeedback = vi.fn();
    render(() => <FeedbackBar title="Was this helpful?" onFeedback={onFeedback} />);
    fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledWith('helpful');
  });

  it('clicking thumbs-down calls onFeedback with "not-helpful"', () => {
    const onFeedback = vi.fn();
    render(() => <FeedbackBar title="Was this helpful?" onFeedback={onFeedback} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledWith('not-helpful');
  });

  it('clicking close calls onClose', () => {
    const onClose = vi.fn();
    render(() => <FeedbackBar title="Was this helpful?" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onFeedback is optional — clicking thumbs-up without handler does not throw', () => {
    render(() => <FeedbackBar title="Was this helpful?" />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Helpful' }))).not.toThrow();
  });

  it('onFeedback is optional — clicking thumbs-down without handler does not throw', () => {
    render(() => <FeedbackBar title="Was this helpful?" />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }))).not.toThrow();
  });
});
