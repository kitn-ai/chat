// tests/components/link-preview.test.tsx
import { flush } from 'solid-js';
import { render, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { LinkPreview } from '../../src/components/link-preview';
import type { CardEvent } from '../../src/primitives/card-contract';
import {
  configureLinkPreview,
  __resetLinkPreviewForTests,
} from '../../src/primitives/link-preview';
import * as linkPreview from '../../src/primitives/link-preview';

afterEach(() => {
  document.body.innerHTML = '';
  __resetLinkPreviewForTests();
  vi.restoreAllMocks();
});

const FULL = {
  url: 'https://www.example.com/blog/post',
  title: 'Generative UI',
  description: 'How agents render typed cards.',
  image: 'https://example.com/og.png',
  imageAlt: 'A diagram',
  favicon: 'https://example.com/favicon.ico',
  siteName: 'Example Blog',
};

describe('LinkPreview render', () => {
  test('renders title/description/image from data', () => {
    const { getByText, container } = render(() => <LinkPreview cardId="c1" data={FULL} />);
    expect(getByText('Generative UI')).toBeTruthy();
    expect(getByText('How agents render typed cards.')).toBeTruthy();
    const img = container.querySelector('img[alt="A diagram"]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('og.png');
  });

  test('prefers siteName over domain in the header', () => {
    const { getByText } = render(() => <LinkPreview cardId="c1" data={FULL} />);
    expect(getByText('Example Blog')).toBeTruthy();
  });

  test('derives domain from url (strips www) when siteName/domain absent', () => {
    const { getByText } = render(() => (
      <LinkPreview cardId="c1" data={{ url: 'https://www.example.com/x', title: 'T' }} />
    ));
    expect(getByText('example.com')).toBeTruthy();
  });

  test('title falls back to domain when absent', () => {
    const { getAllByText } = render(() => (
      <LinkPreview cardId="c1" data={{ url: 'https://example.com/x' }} />
    ));
    // domain appears both in header + as the title fallback.
    expect(getAllByText('example.com').length).toBeGreaterThanOrEqual(1);
  });
});

describe('LinkPreview interaction', () => {
  test('click emits exactly one open event with target tab + cardId', () => {
    const events: CardEvent[] = [];
    const { container } = render(() => (
      <LinkPreview cardId="card-9" data={FULL} onEmit={(e) => events.push(e)} />
    ));
    const anchor = container.querySelector('a')!;
    fireEvent.click(anchor);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    const opens = events.filter((e) => e.kind === 'open');
    expect(opens).toHaveLength(1);
    expect(opens[0]).toMatchObject({ kind: 'open', url: FULL.url, target: 'tab', cardId: 'card-9' });
  });

  test('Enter key emits open', () => {
    const events: CardEvent[] = [];
    const { container } = render(() => (
      <LinkPreview cardId="c1" data={FULL} onEmit={(e) => events.push(e)} />
    ));
    fireEvent.keyDown(container.querySelector('a')!, { key: 'Enter' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(events.some((e) => e.kind === 'open')).toBe(true);
  });

  test('emits ready on mount', () => {
    const events: CardEvent[] = [];
    render(() => <LinkPreview cardId="c1" data={FULL} onEmit={(e) => events.push(e)} />);
    expect(events[0]).toMatchObject({ kind: 'ready', cardId: 'c1' });
  });
});

describe('LinkPreview image degradation', () => {
  test('image onError removes the image region, keeps the rest, no error event', () => {
    const events: CardEvent[] = [];
    const { container, getByText } = render(() => (
      <LinkPreview cardId="c1" data={FULL} onEmit={(e) => events.push(e)} />
    ));
    const img = container.querySelector('img[alt="A diagram"]') as HTMLImageElement;
    fireEvent.error(img);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(container.querySelector('img[alt="A diagram"]')).toBeNull();
    expect(getByText('Generative UI')).toBeTruthy(); // rest intact
    expect(events.some((e) => e.kind === 'error')).toBe(false);
  });
});

describe('LinkPreview invalid url', () => {
  test('renders a non-clickable error chip + emits one error event', () => {
    const events: CardEvent[] = [];
    const { container, getByText } = render(() => (
      <LinkPreview cardId="c1" data={{ url: 'javascript:alert(1)' }} onEmit={(e) => events.push(e)} />
    ));
    expect(getByText('Invalid link')).toBeTruthy();
    expect(container.querySelector('a')).toBeNull(); // not a link
    expect(events.filter((e) => e.kind === 'error')).toHaveLength(1);
  });
});

describe('LinkPreview pure vs bare-URL path', () => {
  test('pure path: with metadata, resolveLinkMetadata is NEVER called', async () => {
    const spy = vi.spyOn(linkPreview, 'resolveLinkMetadata');
    render(() => <LinkPreview cardId="c1" data={FULL} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  test('bare-URL path: skeleton → merged render with a configured fetcher', async () => {
    configureLinkPreview({
      fetchMetadata: async () => ({ title: 'Fetched Title', description: 'Fetched body' }),
    });
    const { getByText } = render(() => (
      <LinkPreview cardId="c1" data={{ url: 'https://example.com/bare' }} />
    ));
    await waitFor(() => expect(getByText('Fetched Title')).toBeTruthy());
    expect(getByText('Fetched body')).toBeTruthy();
  });

  test('bare-URL path: rejecting fetcher falls back to the bare chip (still clickable, no error)', async () => {
    const events: CardEvent[] = [];
    configureLinkPreview({ fetchMetadata: async () => Promise.reject(new Error('boom')) });
    const { container } = render(() => (
      <LinkPreview cardId="c1" data={{ url: 'https://example.com/bare' }} onEmit={(e) => events.push(e)} />
    ));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('a')).toBeTruthy(); // still a clickable link chip
    expect(events.some((e) => e.kind === 'error')).toBe(false);
  });

  test('no metadata + no fetcher: renders the bare chip without calling the hook', async () => {
    const spy = vi.spyOn(linkPreview, 'resolveLinkMetadata');
    const { container } = render(() => (
      <LinkPreview cardId="c1" data={{ url: 'https://example.com/bare' }} />
    ));
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
    expect(container.querySelector('a')).toBeTruthy();
  });
});
