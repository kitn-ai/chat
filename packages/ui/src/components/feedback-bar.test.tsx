import { flush } from 'solid-js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { FeedbackBar } from './feedback-bar';

afterEach(cleanup);

describe('FeedbackBar', () => {
  it('shows the prompt and rating buttons in the ask phase', () => {
    const { getByText, getByLabelText } = render(() => <FeedbackBar title="Helpful?" />);
    expect(getByText('Helpful?')).toBeInTheDocument();
    expect(getByLabelText('Helpful')).toBeInTheDocument();
    expect(getByLabelText('Not helpful')).toBeInTheDocument();
  });

  it('fires onFeedback immediately and confirms in place (no detail by default)', () => {
    const onFeedback = vi.fn();
    const { getByLabelText, getByText, queryByLabelText } = render(() => (
      <FeedbackBar title="Helpful?" onFeedback={onFeedback} />
    ));
    fireEvent.click(getByLabelText('Helpful'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onFeedback).toHaveBeenCalledWith('helpful');
    // Confirms in place — does not disappear; the prompt is replaced by thanks.
    expect(getByText('Thanks for your feedback')).toBeInTheDocument();
    expect(queryByLabelText('Helpful')).not.toBeInTheDocument();
  });

  it('a not-helpful vote goes straight to thanks when collectDetail is off', () => {
    const { getByLabelText, getByText, queryByText } = render(() => <FeedbackBar title="Helpful?" />);
    fireEvent.click(getByLabelText('Not helpful'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(getByText('Thanks for your feedback')).toBeInTheDocument();
    expect(queryByText('What went wrong?')).not.toBeInTheDocument();
  });

  it('opens the detail form on a not-helpful vote when collectDetail is set', () => {
    const onFeedback = vi.fn();
    const { getByLabelText, getByText } = render(() => (
      <FeedbackBar title="Helpful?" collectDetail categories={['Inaccurate', 'Unhelpful']} onFeedback={onFeedback} />
    ));
    fireEvent.click(getByLabelText('Not helpful'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    // Vote still recorded immediately, AND the detail form appears.
    expect(onFeedback).toHaveBeenCalledWith('not-helpful');
    expect(getByText('What went wrong?')).toBeInTheDocument();
    expect(getByText('Inaccurate')).toBeInTheDocument();
  });

  it('a helpful vote skips the detail form even when collectDetail is set', () => {
    const { getByLabelText, getByText, queryByText } = render(() => (
      <FeedbackBar title="Helpful?" collectDetail categories={['Inaccurate']} />
    ));
    fireEvent.click(getByLabelText('Helpful'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(getByText('Thanks for your feedback')).toBeInTheDocument();
    expect(queryByText('What went wrong?')).not.toBeInTheDocument();
  });

  it('submits the detail form with the selected category and comment', () => {
    const onSubmitDetail = vi.fn();
    const { getByLabelText, getByText, getByPlaceholderText } = render(() => (
      <FeedbackBar
        title="Helpful?"
        collectDetail
        categories={['Inaccurate', 'Unhelpful']}
        onSubmitDetail={onSubmitDetail}
      />
    ));
    fireEvent.click(getByLabelText('Not helpful'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    fireEvent.click(getByText('Inaccurate'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    fireEvent.input(getByPlaceholderText('Tell us more (optional)'), { target: { value: 'wrong answer' } });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    fireEvent.click(getByText('Submit'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSubmitDetail).toHaveBeenCalledWith({
      value: 'not-helpful',
      category: 'Inaccurate',
      comment: 'wrong answer',
    });
    expect(getByText('Thanks for your feedback')).toBeInTheDocument();
  });

  it('Skip dismisses the detail form to thanks without firing onSubmitDetail', () => {
    const onSubmitDetail = vi.fn();
    const { getByLabelText, getByText } = render(() => (
      <FeedbackBar title="Helpful?" collectDetail categories={['Inaccurate']} onSubmitDetail={onSubmitDetail} />
    ));
    fireEvent.click(getByLabelText('Not helpful'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    fireEvent.click(getByText('Skip'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSubmitDetail).not.toHaveBeenCalled();
    expect(getByText('Thanks for your feedback')).toBeInTheDocument();
  });

  it('fires onClose when dismissed from the ask phase', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(() => <FeedbackBar title="Helpful?" onClose={onClose} />);
    fireEvent.click(getByLabelText('Close'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onClose).toHaveBeenCalled();
  });

  it('honors a custom thanksMessage', () => {
    const { getByLabelText, getByText } = render(() => (
      <FeedbackBar title="Helpful?" thanksMessage="Got it — thank you!" />
    ));
    fireEvent.click(getByLabelText('Helpful'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(getByText('Got it — thank you!')).toBeInTheDocument();
  });
});
