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
 * `mcp/construct/dev.test.ts` for the other side of the same fix).
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
  open?: () => Promise<Response>;
  /** Factory for POST /api/construct — lets a test 422 one write and accept
   *  the next (the stale-toast repro needs exactly that sequence). */
  construct?: () => Promise<Response>;
} = {}) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/state') return jsonResponse(200, opts.state ?? { phase: 'start' });
    if (url === '/api/constructs') return jsonResponse(200, { constructs: (opts.state?.constructs as unknown[]) ?? [] });
    if (url === '/api/open') {
      return opts.open
        ? await opts.open()
        : jsonResponse(200, {
            construct: { name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } },
            constructPath: '/proj/acme-support.construct.json',
            previewPending: true,
          });
    }
    if (url === '/api/create') {
      return opts.create
        ? await opts.create()
        : jsonResponse(200, {
            construct: { name: 'acme-support', layout: 'split', provider: { mode: 'mock' } },
            previewPending: true,
          });
    }
    if (url === '/api/construct') return opts.construct ? await opts.construct() : jsonResponse(200, { ok: true });
    if (url === '/theme-studio/') return jsonResponse(200, {}); // availability probe for the takeover
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

  it('a reload AFTER the boot shows the iframe, no placeholder — via the shared PreviewPane', async () => {
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

/** The theme-studio takeover: a control rail beside the REAL preview, live-
 *  theming through the construct file (owner-ruled DX rework 2026-08-31).
 *  postMessage frames are dispatched exactly as the browser would deliver the
 *  studio iframe's posts: same-origin MessageEvents on window. */
describe('builder page — theme-studio takeover themes the REAL app through the file', () => {
  const post = (data: unknown): void => {
    window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin }));
  };
  /** Loaded panel state with a preview already up, plus an existing accent so
   *  Cancel has something real to restore. */
  const panelState = {
    phase: 'panel',
    constructPath: '/tmp/acme-support.construct.json',
    construct: { name: 'acme-support', layout: 'fullscreen', theme: { mode: 'system', accent: '#112233' }, provider: { mode: 'mock' } },
    previewUrl: 'http://localhost:4401/',
    previewPending: false,
  };
  const CHANGE = { type: 'kai-theme-change', light: { '--kai-color-primary': '#ff0000' }, dark: { '--kai-color-primary': '#aa0000' }, radius: '0.5rem' };

  async function openTakeover(state: Json = panelState): Promise<ReturnType<typeof stubServer>> {
    const server = stubServer({ state });
    render(() => <App />);
    fireEvent.click(await screen.findByRole('button', { name: /Advanced/ }));
    await screen.findByTitle('theme studio');
    return server;
  }
  /** POSTs to /api/construct, parsed. */
  const writes = (calls: Array<{ url: string; body?: unknown }>): Json[] =>
    calls.filter((c) => c.url === '/api/construct' && c.body).map((c) => c.body as Json);

  it('opens as a RAIL (embed iframe) beside the REAL preview iframe, with Done and Cancel in the bar', async () => {
    await openTakeover();
    const studio = screen.getByTitle('theme studio');
    expect(studio).toHaveAttribute('src', '/theme-studio/?embed=1');
    // The real preview — the same pane the panel shows — sits beside the rail.
    expect(screen.getByTitle('preview')).toHaveAttribute('src', 'http://localhost:4401/');
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('a takeover opened BEFORE the preview is up shows the same honest placeholder, not a blank pane', async () => {
    await openTakeover({ ...panelState, previewUrl: undefined, previewPending: true });
    expect(screen.getByTitle('theme studio')).toBeInTheDocument();
    expect(screen.getByText(PREVIEW_STARTING_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTitle('preview')).not.toBeInTheDocument();
  });

  it('kai-theme-change writes theme.tokens through the debounced POST /api/construct path', async () => {
    const { calls } = await openTakeover();
    post(CHANGE);
    await waitFor(() => expect(writes(calls).length).toBeGreaterThan(0), { timeout: 2000 });
    const theme = writes(calls).at(-1)!.theme as Json;
    expect((theme.tokens as Json).light).toEqual({ '--kai-color-primary': '#ff0000' });
    expect((theme.tokens as Json).radius).toBe('0.5rem');
    expect(theme.accent).toBe('#ff0000'); // back-compat accent tracks the applied primary
  });

  it('a burst of change frames costs ONE write (the onEdit debounce is the ~300ms gate)', async () => {
    const { calls } = await openTakeover();
    for (let i = 0; i < 5; i++) post({ ...CHANGE, light: { '--kai-color-primary': `#ff000${i}` } });
    await waitFor(() => expect(writes(calls).length).toBeGreaterThan(0), { timeout: 2000 });
    expect(writes(calls)).toHaveLength(1);
    expect(((writes(calls)[0].theme as Json).tokens as Json).light).toEqual({ '--kai-color-primary': '#ff0004' });
  });

  it('kai-theme-close = CANCEL: restores the open-time snapshot through the same write path, toasts "Theme changes discarded"', async () => {
    const { calls } = await openTakeover();
    post(CHANGE);
    await waitFor(() => expect(writes(calls).length).toBe(1), { timeout: 2000 });
    post({ type: 'kai-theme-close' });
    await waitFor(() => expect(writes(calls).length).toBe(2), { timeout: 2000 });
    const restored = writes(calls).at(-1)!.theme as Json;
    expect(restored.accent).toBe('#112233'); // the snapshot's accent is back
    expect(restored.tokens).toBeUndefined(); // and the takeover's tokens are gone
    expect(await screen.findByText('Theme changes discarded')).toBeInTheDocument();
    expect(screen.queryByTitle('theme studio')).not.toBeInTheDocument();
  });

  it('kai-theme-close with NOTHING changed closes silently — no restore write, no "discarded" toast', async () => {
    const { calls } = await openTakeover();
    post({ type: 'kai-theme-close' });
    await waitFor(() => expect(screen.queryByTitle('theme studio')).not.toBeInTheDocument());
    await flush();
    expect(writes(calls)).toHaveLength(0);
    expect(screen.queryByText('Theme changes discarded')).not.toBeInTheDocument();
  });

  it('kai-theme-apply = DONE: keeps the applied tokens, toasts "Theme applied", closes the takeover', async () => {
    const { calls } = await openTakeover();
    post({ ...CHANGE, type: 'kai-theme-apply' });
    await waitFor(() => expect(writes(calls).length).toBeGreaterThan(0), { timeout: 2000 });
    expect(((writes(calls).at(-1)!.theme as Json).tokens as Json).light).toEqual({ '--kai-color-primary': '#ff0000' });
    expect(await screen.findByText('Theme applied')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTitle('theme studio')).not.toBeInTheDocument());
    // Back on the panel, nothing was rolled back.
    expect(screen.getByTitle('preview')).toBeInTheDocument();
  });

  it('the bar\'s Done keeps live-streamed state and toasts, without needing a payload of its own', async () => {
    const { calls } = await openTakeover();
    post(CHANGE);
    await waitFor(() => expect(writes(calls).length).toBe(1), { timeout: 2000 });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Theme applied')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTitle('theme studio')).not.toBeInTheDocument());
    expect(writes(calls)).toHaveLength(1); // the stream's write stands; Done added none
  });

  it('kai-theme-init posts the construct theme FOLDED to the flat ThemePayload — saved tokens seed the studio, not the nested construct shape', async () => {
    // The shape mismatch that shipped: the builder posted { accent, mode,
    // tokens: {…} } while the studio reads { light, dark, radius, fonts } off
    // the top level, so a saved theme never seeded and the studio opened on
    // kit defaults. This asserts the exact frame the iframe load handler posts.
    await openTakeover({
      ...panelState,
      construct: {
        ...(panelState.construct as Json),
        theme: {
          mode: 'system',
          accent: '#112233',
          tokens: { light: { '--kai-color-primary': '#123456' }, dark: { '--kai-color-primary': '#654321' }, radius: '1rem' },
        },
      },
    });
    const studio = screen.getByTitle('theme studio') as HTMLIFrameElement;
    const postSpy = vi.spyOn(studio.contentWindow!, 'postMessage');
    fireEvent.load(studio);
    expect(postSpy).toHaveBeenCalledWith(
      {
        type: 'kai-theme-init',
        theme: {
          light: { '--kai-color-primary': '#123456' },
          dark: { '--kai-color-primary': '#654321' },
          radius: '1rem',
        },
      },
      window.location.origin,
    );
  });

  it('kai-theme-init from a construct with NO saved tokens folds the accent into light\'s primary', async () => {
    await openTakeover(); // panelState: accent #112233, no tokens
    const studio = screen.getByTitle('theme studio') as HTMLIFrameElement;
    const postSpy = vi.spyOn(studio.contentWindow!, 'postMessage');
    fireEvent.load(studio);
    expect(postSpy).toHaveBeenCalledWith(
      { type: 'kai-theme-init', theme: { light: { '--kai-color-primary': '#112233' }, dark: {} } },
      window.location.origin,
    );
  });

  it('OPENING writes nothing: a change frame identical to the open-time snapshot is dropped (defense behind the studio\'s write-free open)', async () => {
    // A construct whose accent already tracks its saved primary — exactly what
    // themeFromPayload writes — so a seed echo resolves to the snapshot.
    const { calls } = await openTakeover({
      ...panelState,
      construct: {
        ...(panelState.construct as Json),
        theme: { mode: 'system', accent: '#123456', tokens: { light: { '--kai-color-primary': '#123456' } } },
      },
    });
    post({ type: 'kai-theme-change', light: { '--kai-color-primary': '#123456' } });
    await new Promise((r) => setTimeout(r, 400)); // past the debounce window
    expect(writes(calls)).toHaveLength(0);
    // …while a REAL edit still writes.
    post({ type: 'kai-theme-change', light: { '--kai-color-primary': '#ff0000' } });
    await waitFor(() => expect(writes(calls).length).toBe(1), { timeout: 2000 });
  });

  it('a STALE 422 from an earlier panel edit cannot make Done toast "Theme not saved" — no takeover write, silent close (the stale-toast defect)', async () => {
    // One rejected PANEL write before the takeover opens leaves problems()
    // non-empty; Done's verdict must be scoped to the takeover's own writes.
    let first = true;
    const server = stubServer({
      state: panelState,
      construct: async () => {
        if (first) { first = false; return jsonResponse(422, { problems: [{ path: 'header.title', message: 'too long' }] }); }
        return jsonResponse(200, { ok: true });
      },
    });
    render(() => <App />);
    // A panel edit that the server rejects: switch template → onEdit → POST.
    fireEvent.click(await screen.findByRole('button', { name: 'Switch template' }));
    fireEvent.click(await screen.findByText('Support widget'));
    await waitFor(() => expect(writes(server.calls).length).toBe(1), { timeout: 2000 });
    expect(await screen.findByText(/too long/)).toBeInTheDocument();
    // Open the takeover, change nothing, Done: it must close without the
    // false "Theme not saved" the stale ambient problems() used to produce.
    fireEvent.click(screen.getByRole('button', { name: /Advanced/ }));
    await screen.findByTitle('theme studio');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByTitle('theme studio')).not.toBeInTheDocument());
    expect(screen.queryByText('Theme not saved')).not.toBeInTheDocument();
    expect(screen.queryByText('Theme applied')).not.toBeInTheDocument(); // nothing was applied either
    expect(writes(server.calls)).toHaveLength(1); // the takeover added no write
  });

  it('the INVERSE stays loud: a failed stream write makes Done toast "Theme not saved" and hold the takeover open, even with nothing left to flush', async () => {
    const { calls } = await (async () => {
      const server = stubServer({
        state: panelState,
        construct: async () => jsonResponse(422, { problems: [{ path: 'theme.tokens.light', message: 'not a --kai-* knob' }] }),
      });
      render(() => <App />);
      fireEvent.click(await screen.findByRole('button', { name: /Advanced/ }));
      await screen.findByTitle('theme studio');
      return server;
    })();
    post(CHANGE);
    await waitFor(() => expect(writes(calls).length).toBe(1), { timeout: 2000 }); // the debounce already flushed — Done has nothing pending
    await flush(); // …and its 422 response has settled (the write is done, not merely started)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Theme not saved')).toBeInTheDocument();
    expect(screen.getByTitle('theme studio')).toBeInTheDocument(); // stays open on the failure
  });

  it('a cross-origin message is ignored entirely', async () => {
    const { calls } = await openTakeover();
    window.dispatchEvent(new MessageEvent('message', { data: CHANGE, origin: 'https://evil.example' }));
    await flush();
    await new Promise((r) => setTimeout(r, 400)); // past the debounce window
    expect(writes(calls)).toHaveLength(0);
    expect(screen.getByTitle('theme studio')).toBeInTheDocument();
  });
});

// ── the home-screen entry flow (owner ask, 2026-08-31) ───────────────────────
// The server decides the front door: `phase: 'home'` when the directory holds
// constructs, `phase: 'start'` (today's picker, pinned by every test above)
// when it does not. This block is the page's half of the loop: land on home,
// open a card into the panel, reach the picker through New, and get back.
const HOME_STATE = {
  phase: 'home',
  constructs: [
    {
      file: 'acme-support.construct.json',
      name: 'acme-support',
      templateId: 'widget',
      templateName: 'Support widget',
      updatedAt: new Date().toISOString(),
      valid: true,
    },
    {
      file: 'acme-desk.construct.json',
      name: 'acme-desk',
      templateId: 'assistant',
      templateName: 'Assistant',
      updatedAt: new Date().toISOString(),
      valid: true,
    },
  ],
};

describe('builder page — the home screen entry flow', () => {
  it('phase "home" lands on the construct list, not the template picker', async () => {
    stubServer({ state: HOME_STATE });
    render(() => <App />);
    expect(await screen.findByText('Your constructs')).toBeInTheDocument();
    expect(screen.getByText('<acme-support>')).toBeInTheDocument();
    expect(screen.getByText('<acme-desk>')).toBeInTheDocument();
    expect(screen.queryByText('Start a construct')).not.toBeInTheDocument();
    expect(stepMain('home')).toBeInTheDocument();
  });

  it('opening a card POSTs /api/open with THAT file and goes straight to the panel, preview pending honestly', async () => {
    const { calls } = stubServer({ state: HOME_STATE });
    render(() => <App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open acme-support' }));
    expect(await screen.findByText(PREVIEW_STARTING_MESSAGE)).toBeInTheDocument();
    const open = calls.find((c) => c.url === '/api/open');
    expect(open?.body).toEqual({ file: 'acme-support.construct.json' });
  });

  it('a rejected open (invalid file raced in) surfaces problems and STAYS on home', async () => {
    stubServer({
      state: HOME_STATE,
      open: async () => jsonResponse(422, { problems: [{ path: 'layout', message: 'not one of the layouts' }] }),
    });
    render(() => <App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open acme-desk' }));
    expect(await screen.findByText(/not one of the layouts/)).toBeInTheDocument();
    expect(screen.getByText('Your constructs')).toBeInTheDocument();
    expect(screen.queryByText(PREVIEW_STARTING_MESSAGE)).not.toBeInTheDocument();
  });

  it('the New construct tile reaches the picker, which now carries a way BACK to the list', async () => {
    stubServer({ state: HOME_STATE });
    render(() => <App />);
    fireEvent.click(await screen.findByText('New construct'));
    expect(await screen.findByText('Start a construct')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Back to your constructs'));
    expect(await screen.findByText('Your constructs')).toBeInTheDocument();
  });

  it('an EMPTY directory keeps today\'s behavior: the picker, with NO back link to an empty list', async () => {
    stubServer({ state: { phase: 'start', constructs: [] } });
    render(() => <App />);
    expect(await screen.findByText('Start a construct')).toBeInTheDocument();
    expect(screen.queryByText('Back to your constructs')).not.toBeInTheDocument();
  });

  it('the panel header grows a home affordance that refetches the list on the way back', async () => {
    const { calls } = stubServer({ state: HOME_STATE });
    render(() => <App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open acme-support' }));
    await screen.findByText(PREVIEW_STARTING_MESSAGE);
    fireEvent.click(screen.getByRole('button', { name: 'Your constructs' }));
    expect(await screen.findByText('Your constructs')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/constructs')).toBe(true);
  });
});
