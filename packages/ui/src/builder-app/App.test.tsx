/**
 * The builder page's own contract, for the two defects the owner hit running
 * `kai dev --builder` against a real dist (2026-08-30):
 *
 *  1. the variant and name steps shipped without the Start screen's canvas
 *     and brand accent — "just black and white, no design colors like the
 *     first screen and the panels looked smaller";
 *  2. Create sat silent for ~28s (minutes cold) while POST /api/create did the
 *     entire boot inside the request.
 *
 * Both are page-level facts a DOM assertion can hold: which wrapper each step
 * renders, and what the panel shows in the window between "the construct file
 * exists" and "Vite is listening". `fetch` and `EventSource` are stubbed —
 * this file is about the page's own state machine, not the server's (see
 * `agent-tooling/construct/dev.test.ts` for the other side of the same fix).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@solidjs/testing-library';
import { App, BRAND_STYLE, PREVIEW_STARTING_MESSAGE } from './App';

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
function stubServer(opts: {
  state?: Json;
  create?: () => Promise<Response>;
} = {}) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/state') return jsonResponse(200, opts.state ?? { phase: 'start' });
    if (url === '/api/create') {
      return opts.create
        ? await opts.create()
        : jsonResponse(200, {
            construct: { name: 'acme-support', layout: 'split', provider: { mode: 'mock' } },
            previewPending: true,
          });
    }
    if (url === '/api/construct') return jsonResponse(200, { ok: true });
    throw new Error(`unstubbed ${url}`);
  });
  vi.stubGlobal('fetch', fetchStub);
  return { calls, fetchStub };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

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

describe('builder page — create goes straight to the panel (owner defect 2)', () => {
  it('the Create button DISABLES while the request is in flight, and says so', async () => {
    let release!: (r: Response) => void;
    stubServer({ create: () => new Promise<Response>((res) => { release = res; }) });
    await toNameStep();

    const create = screen.getByRole('button', { name: 'Create' });
    fireEvent.click(create);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled());

    release(jsonResponse(200, {
      construct: { name: 'acme-support', layout: 'split', provider: { mode: 'mock' } },
      previewPending: true,
    }));
    await screen.findByText('Switch template');
  });

  it('a second click while in flight cannot fire a second POST /api/create', async () => {
    let release!: (r: Response) => void;
    const { calls } = stubServer({ create: () => new Promise<Response>((res) => { release = res; }) });
    await toNameStep();

    const create = screen.getByRole('button', { name: 'Create' });
    fireEvent.click(create);
    fireEvent.click(create);
    await flush();
    expect(calls.filter((c) => c.url === '/api/create')).toHaveLength(1);

    release(jsonResponse(200, { construct: { name: 'acme-support', layout: 'split', provider: { mode: 'mock' } }, previewPending: true }));
    await screen.findByText('Switch template');
  });

  it('the PANEL appears immediately on a previewPending response, with an honest placeholder and NO iframe', async () => {
    stubServer();
    await toNameStep();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    // The construct file is the state (B-22): the panel is the moment it exists.
    await screen.findByText('Switch template');
    expect(screen.getByText(PREVIEW_STARTING_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText('preview starting…')).toBeInTheDocument();
    // Not a blank pane, and not an iframe pointed at a port nothing is on yet.
    expect(screen.queryByTitle('preview')).not.toBeInTheDocument();
  });

  it('the panel is EDITABLE while the preview is still booting — the edit reaches the file', async () => {
    const { calls } = stubServer();
    await toNameStep();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('Switch template');
    expect(screen.queryByTitle('preview')).not.toBeInTheDocument(); // still booting

    // Switching templates is the page's own onEdit path, so it exercises the
    // same debounced POST /api/construct every panel control uses.
    fireEvent.click(screen.getByRole('button', { name: 'Switch template' }));
    fireEvent.click(await screen.findByText('Support widget'));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/construct')).toBe(true), { timeout: 2000 });
  });

  it('the SSE `preview` event swaps the placeholder for the iframe', async () => {
    stubServer();
    await toNameStep();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText(PREVIEW_STARTING_MESSAGE);

    FakeEventSource.last!.emit('preview', { previewUrl: 'http://localhost:4401/' });

    const frame = await screen.findByTitle('preview');
    expect(frame).toHaveAttribute('src', 'http://localhost:4401/');
    expect(screen.queryByText(PREVIEW_STARTING_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText('preview starting…')).not.toBeInTheDocument();
  });

  it('a FAILED boot surfaces loudly — the error banner and the preview pane, never a placeholder that waits forever', async () => {
    stubServer();
    await toNameStep();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText(PREVIEW_STARTING_MESSAGE);

    FakeEventSource.last!.emit('preview-error', { message: 'npm install exited 1' });

    // Two places, both role=alert: the persistent banner over every screen,
    // and the preview pane that would otherwise be waiting forever.
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(2));
    const alerts = screen.getAllByRole('alert').map((el) => el.textContent ?? '');
    expect(alerts.some((t) => /preview failed to start/i.test(t) && t.includes('npm install exited 1'))).toBe(true);
    expect(screen.queryByText(PREVIEW_STARTING_MESSAGE)).not.toBeInTheDocument();
  });

  it('a reload MID-BOOT restores the pending state from GET /api/state, not a blank pane', async () => {
    stubServer({
      state: {
        phase: 'panel',
        constructPath: '/tmp/acme-support.construct.json',
        construct: { name: 'acme-support', layout: 'fullscreen', provider: { mode: 'mock' } },
        previewPending: true,
      },
    });
    render(() => <App />);
    expect(await screen.findByText(PREVIEW_STARTING_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTitle('preview')).not.toBeInTheDocument();
  });

  it('a reload AFTER the boot shows the iframe, no placeholder', async () => {
    stubServer({
      state: {
        phase: 'panel',
        constructPath: '/tmp/acme-support.construct.json',
        construct: { name: 'acme-support', layout: 'fullscreen', provider: { mode: 'mock' } },
        previewUrl: 'http://localhost:4401/',
        previewPending: false,
      },
    });
    render(() => <App />);
    expect(await screen.findByTitle('preview')).toHaveAttribute('src', 'http://localhost:4401/');
    expect(screen.queryByText(PREVIEW_STARTING_MESSAGE)).not.toBeInTheDocument();
  });
});
