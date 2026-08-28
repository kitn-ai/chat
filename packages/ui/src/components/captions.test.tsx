import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { Captions, type CaptionSegment, type CaptionsVariant } from './captions';

afterEach(cleanup);

// createPresence's no-animation close path unmounts on a queued microtask
// (jsdom has no CSS animation timing) — same flush helper as
// ui/overlay.test.tsx, which drives createPresence directly.
const flush = () => new Promise((r) => setTimeout(r, 0));

const seg = (over: Partial<CaptionSegment> = {}): CaptionSegment => ({
  speaker: 'assistant',
  text: 'Three meetings today.',
  ...over,
});

describe('Captions', () => {
  it('renders nothing when segments is undefined', () => {
    const { queryByRole } = render(() => <Captions />);
    expect(queryByRole('status')).toBeNull();
  });

  it('renders nothing when segments is empty', () => {
    const { queryByRole } = render(() => <Captions segments={[]} />);
    expect(queryByRole('status')).toBeNull();
  });

  it('renders nothing when the current segment text is empty or whitespace-only', () => {
    const { queryByRole } = render(() => <Captions segments={[seg({ text: '   ' })]} />);
    expect(queryByRole('status')).toBeNull();
  });

  it('renders the current segment text as a status live region', () => {
    const { getByRole } = render(() => <Captions segments={[seg({ text: 'Three meetings today.' })]} />);
    const el = getByRole('status');
    expect(el).toHaveTextContent('Three meetings today.');
    expect(el).toHaveAttribute('aria-live', 'polite');
  });

  it('renders only the LAST segment as the live region, not earlier history', () => {
    const { getByRole } = render(() => (
      <Captions
        variant="stacked"
        segments={[seg({ speaker: 'user', text: "What's on my calendar?" }), seg({ text: 'Three meetings today.' })]}
      />
    ));
    const el = getByRole('status');
    expect(el).toHaveTextContent('Three meetings today.');
    expect(el).not.toHaveTextContent("What's on my calendar?");
  });

  (['lower-third', 'floating', 'minimal', 'stacked'] as const satisfies readonly CaptionsVariant[]).forEach((variant) => {
    it(`renders the current line for variant="${variant}"`, () => {
      const { getByRole } = render(() => <Captions variant={variant} segments={[seg({ text: 'Hello there.' })]} />);
      expect(getByRole('status')).toHaveTextContent('Hello there.');
    });
  });

  it('defaults to variant="minimal" when unset', () => {
    const { getByRole } = render(() => <Captions segments={[seg()]} />);
    // minimal has no card/bar chrome class on the outer wrapper.
    const outer = getByRole('status').closest('[data-expanded], [data-closed]')!;
    expect(outer.className).not.toContain('kai-elevation');
    expect(outer.className).not.toContain('backdrop-blur');
  });

  it('is speaker-aware via data-speaker and a distinguishing label, without touching the accent token', () => {
    const { getByRole, getByText } = render(() => <Captions segments={[seg({ speaker: 'assistant', text: 'Hi.' })]} />);
    const el = getByRole('status');
    expect(el).toHaveAttribute('data-speaker', 'assistant');
    expect(getByText('Assistant')).toBeInTheDocument();
    expect(el.innerHTML).not.toContain('text-primary');
  });

  it('speaker="user" carries a distinct data-speaker and label from "assistant"', () => {
    const { getByRole, getByText } = render(() => <Captions segments={[seg({ speaker: 'user', text: 'Hi.' })]} />);
    const el = getByRole('status');
    expect(el).toHaveAttribute('data-speaker', 'user');
    expect(getByText('You')).toBeInTheDocument();
  });

  it('a final segment is styled with the foreground tier, not muted', () => {
    const { getByText } = render(() => <Captions segments={[seg({ text: 'Committed line.', final: true })]} />);
    const line = getByText('Committed line.');
    expect(line.className).toContain('text-foreground');
    expect(line.className).not.toContain('text-muted-foreground');
  });

  it('an interim (non-final) segment is styled a shade lighter than a final one', () => {
    const { getByText } = render(() => <Captions segments={[seg({ text: 'Still forming...', final: false })]} />);
    const line = getByText('Still forming...');
    expect(line.className).toContain('text-muted-foreground');
    expect(line.className).not.toContain('text-foreground');
  });

  it('disappears when segments becomes empty (a live-updating caption)', async () => {
    const [segments, setSegments] = createSignal<CaptionSegment[]>([seg({ text: 'Listening...' })]);
    const { queryByRole } = render(() => <Captions segments={segments()} />);
    expect(queryByRole('status')).not.toBeNull();

    setSegments([]);
    await flush();
    expect(queryByRole('status')).toBeNull();
  });

  it('reappears after clearing then setting new segments (the reopen invariant createPresence guards)', async () => {
    const [segments, setSegments] = createSignal<CaptionSegment[]>([seg({ text: 'First caption.' })]);
    const { queryByRole } = render(() => <Captions segments={segments()} />);
    expect(queryByRole('status')).not.toBeNull();

    setSegments([]);
    await flush();
    expect(queryByRole('status')).toBeNull();

    setSegments([seg({ text: 'Second caption.' })]);
    await flush();
    const el = queryByRole('status');
    expect(el).not.toBeNull();
    expect(el).toHaveTextContent('Second caption.');
  });

  it('stacked shows recent history alongside the current line, marked aria-hidden', () => {
    const { getByText, container } = render(() => (
      <Captions
        variant="stacked"
        segments={[
          seg({ speaker: 'user', text: 'Line one.' }),
          seg({ speaker: 'assistant', text: 'Line two.' }),
          seg({ speaker: 'user', text: 'Line three.' }),
        ]}
      />
    ));
    expect(getByText('Line one.')).toBeInTheDocument();
    expect(getByText('Line two.')).toBeInTheDocument();
    expect(getByText('Line three.')).toBeInTheDocument();
    const history = container.querySelector('[aria-hidden="true"]');
    expect(history).not.toBeNull();
    expect(history).toContainElement(getByText('Line one.'));
  });

  it('non-stacked variants render only the current line, not history', () => {
    const { queryByText } = render(() => (
      <Captions
        variant="floating"
        segments={[seg({ text: 'Old line.' }), seg({ text: 'Current line.' })]}
      />
    ));
    expect(queryByText('Old line.')).toBeNull();
    expect(queryByText('Current line.')).not.toBeNull();
  });

  it('carries motion-reduce:animate-none on both the container and the current line', () => {
    const { getByRole } = render(() => <Captions segments={[seg({ text: 'Hello.' })]} />);
    const el = getByRole('status');
    expect(el.className).toContain('motion-reduce:animate-none');
    const outer = el.closest('[data-expanded], [data-closed]')!;
    expect(outer.className).toContain('motion-reduce:animate-none');
  });
});
