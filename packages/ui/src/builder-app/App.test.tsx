/**
 * The builder page's own contract. Opened for the defect the owner hit running
 * `kai dev --builder` against a real dist (2026-08-30): the variant and name
 * steps shipped without the Start screen's canvas and brand accent — "just
 * black and white, no design colors like the first screen and the panels
 * looked smaller".
 *
 * That is a page-level fact a DOM assertion can hold: which wrapper each step
 * renders. `fetch` and `EventSource` are stubbed — this file is about the
 * page's own state machine, not the server's.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent } from '@solidjs/testing-library';
import { App, BRAND_STYLE } from './App';

/** A hand-rolled EventSource: jsdom has none, and the test needs to push a
 *  `preview` frame at a moment of its choosing. */
class FakeEventSource {
  static last: FakeEventSource | undefined;
  private listeners = new Map<string, Array<(e: Event) => void>>();
  onopen: (() => void) | undefined;
  onerror: (() => void) | undefined;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: Event) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  close(): void {
    this.closed = true;
  }
  /** Emit an SSE frame exactly as dev.ts's hub writes it: JSON in `data`. */
  emit(type: string, data: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) } as MessageEvent);
  }
}

type Json = Record<string, unknown>;
const jsonResponse = (status: number, body: Json): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** Routes the page's four endpoints. `createResponse` is a factory so a test
 *  can hold POST /api/create open and inspect the in-flight UI. */
function stubServer(opts: { state?: Json } = {}) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/state') return jsonResponse(200, opts.state ?? { phase: 'start' });
    if (url === '/api/create') {
      return jsonResponse(200, {
        construct: { name: 'acme-support', layout: 'split', provider: { mode: 'mock' } },
      });
    }
    if (url === '/api/construct') return jsonResponse(200, { ok: true });
    throw new Error(`unstubbed ${url}`);
  });
  vi.stubGlobal('fetch', fetchStub);
  return { calls, fetchStub };
}

beforeEach(() => {
  FakeEventSource.last = undefined;
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The wrapper each pre-panel step renders, found by its own step marker. */
const stepMain = (step: string): HTMLElement => {
  const el = document.querySelector(`main[data-builder-step="${step}"]`);
  if (!el) throw new Error(`no <main data-builder-step="${step}">`);
  return el as HTMLElement;
};

async function startAt(): Promise<void> {
  render(() => <App />);
  await screen.findByText('Start a construct');
}

/** Start → Workspace → the variant picker. */
async function toVariantStep(): Promise<void> {
  await startAt();
  fireEvent.click(screen.getByText('Workspace'));
  await screen.findByText('What kind of workspace?');
}

/** Start → Workspace → a variant → the name step. */
async function toNameStep(): Promise<void> {
  await toVariantStep();
  fireEvent.click(screen.getByText('Artifact preview beside chat'));
  await screen.findByText('Name your element');
}

describe('builder page — design parity across the pre-panel steps (owner defect 1)', () => {
  it('the START screen is the reference: the wide canvas and the brand accent', async () => {
    stubServer();
    await startAt();
    const main = stepMain('start');
    expect(main).toHaveClass('max-w-6xl');
    expect(main.style.getPropertyValue('--color-primary')).toBe(BRAND_STYLE['--color-primary']);
  });

  it('the VARIANT picker carries the SAME canvas and the SAME brand accent (it shipped max-w-4xl and unbranded)', async () => {
    stubServer();
    await toVariantStep();
    const main = stepMain('variant');
    // The canvas is what sets the card scale: the picker is already at Step
    // 1's own grid/media size, so a narrower container is the whole defect.
    expect(main).toHaveClass('max-w-6xl');
    expect(main).not.toHaveClass('max-w-4xl');
    expect(main.style.getPropertyValue('--color-primary')).toBe(BRAND_STYLE['--color-primary']);
  });

  it('the variant picker renders at the story\'s own card scale — the same grid the Start screen uses', async () => {
    stubServer();
    await toVariantStep();
    // `builder-workspace-variants.tsx`'s module comment records the owner's
    // explicit correction: match Step 1's proportions, do NOT shrink. Pinned
    // here so a future "compact variant picker" has to argue with a test.
    const grid = document.querySelector('[data-builder-workspace-variants] .grid') as HTMLElement;
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-3');
    expect(document.querySelectorAll('[data-builder-workspace-variants] .h-44').length).toBe(2);
  });

  it('the NAME step carries the brand accent too (same omission), keeping its deliberate single-field width', async () => {
    stubServer();
    await toNameStep();
    const main = stepMain('name');
    expect(main.style.getPropertyValue('--color-primary')).toBe(BRAND_STYLE['--color-primary']);
    expect(main).toHaveClass('max-w-md');
    // Same vertical rhythm as Start — one canvas function, not three restatements.
    for (const cls of ['mx-auto', 'flex', 'flex-col', 'gap-6', 'py-10']) expect(main).toHaveClass(cls);
  });
});
