/**
 * The island's FAILURE path, which is the one nobody sees until it is live.
 *
 * Solid's resource accessor RETHROWS the rejection when you call it, so a
 * `<Show when={items()}>` throws out of the render instead of falling to its
 * fallback. A `client:only` island has no ErrorBoundary above it, so the
 * consequence on the real page is "Loading blocks..." forever with nothing in
 * view explaining why. This suite drives that path: the registry 404s, and the
 * page has to SAY so.
 *
 * `loadKit` is mocked because the island awaits it before fetching and the real
 * one imports the kit bundle, which jsdom cannot register. Nothing else is
 * stubbed: the island's own fetch and its own error rendering are the subject.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@solidjs/testing-library';
import BlocksIsland from '../src/components/blocks/BlocksIsland';
import { registryUrl } from '../src/lib/blocks-source';

vi.mock('../src/components/example/kit', () => ({
  loadKit: (): Promise<void> => Promise.resolve(),
  getKit: (): Promise<Record<string, unknown>> => Promise.resolve({}),
  syncKaiTheme: (): (() => void) => () => {},
  syncToastRegionTheme: (): (() => void) => () => {},
}));

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('BlocksIsland when the registry does not load', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      new Response('not found', { status: 404 }),
    ) as unknown as typeof fetch;
  });

  it('shows an error naming the registry URL, and stops saying it is loading', async () => {
    render(() => <BlocksIsland />);

    await waitFor(() => {
      expect(screen.getByText(/could not load the block registry/i)).toBeTruthy();
    });
    expect(screen.getByText(new RegExp(registryUrl().replace(/\//g, '\\/')))).toBeTruthy();
    expect(screen.getByText(/404/)).toBeTruthy();
    expect(screen.queryByText(/loading blocks/i)).toBeNull();
  });
});

describe('BlocksIsland when fetch itself rejects', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
  });

  it('shows the rejection instead of hanging on the loading text', async () => {
    render(() => <BlocksIsland />);

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch/i)).toBeTruthy();
    });
    expect(screen.queryByText(/loading blocks/i)).toBeNull();
  });
});

/* The paired success case. Without it the two assertions above could pass
   vacuously against an island that renders nothing at all. */
describe('BlocksIsland when the registry loads', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === registryUrl()) {
        return new Response(
          JSON.stringify({
            items: [
              {
                name: 'support-widget',
                title: 'Support Widget',
                description: 'Docked support chat.',
                categories: ['assistant', 'widget'],
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ block: 'support-widget', form: 'html', files: [] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
  });

  it('renders the page, with neither the loading nor the error text', async () => {
    render(() => <BlocksIsland />);

    await waitFor(() => {
      expect(screen.getByText('Support Widget')).toBeTruthy();
    });
    expect(screen.queryByText(/loading blocks/i)).toBeNull();
    expect(screen.queryByText(/could not load the block registry/i)).toBeNull();
  });
});
