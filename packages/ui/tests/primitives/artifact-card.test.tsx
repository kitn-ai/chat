// tests/primitives/artifact-card.test.tsx
// The `artifact` built-in card: the sizing wrapper (an <Artifact> fills its
// container, so a card with no height collapses to an invisible zero-height box),
// its stable handles, and the emit wiring onto the frozen CardEvent set.
import { createSignal, flush } from 'solid-js';
import { render } from '@solidjs/testing-library';
import { BUILTIN_CARD_COMPONENTS } from '../../src/primitives/card-registry';
import { CardRenderer } from '../../src/components/card-renderer';
import { CardProvider } from '../../src/primitives/card-host';
import { upsertCardPart } from '../../src/state/parts';
import type { MessagePart } from '../../src/elements/chat-types';
import type { CardEnvelope, CardEvent, CardHost } from '../../src/primitives/card-contract';

afterEach(() => { document.body.innerHTML = ''; });

function makeHost() {
  const events: CardEvent[] = [];
  const host: CardHost = {
    context: () => ({ theme: { mode: 'light' as const }, locale: 'en' }),
    emit: (e) => events.push(e),
  };
  return { host, events };
}

function renderArtifactCard(envelope: CardEnvelope, host?: CardHost) {
  const Comp = BUILTIN_CARD_COMPONENTS.artifact;
  return render(() => <Comp envelope={envelope} host={host} />);
}

const BASE: CardEnvelope = {
  type: 'artifact',
  id: 'a1',
  data: { src: 'https://example.com/preview' },
};

/** The wrapper carrying the height + the stable handles. */
function wrapperOf(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-card-type="artifact"]') as HTMLElement;
}

test('renders a wrapper carrying the stable part + data-card-type handles', () => {
  const { container } = renderArtifactCard(BASE);
  const el = wrapperOf(container);
  expect(el).toBeTruthy();
  // `card` matches the other chromed cards (they inherit it from <Card>). The
  // artifact-specific handle is data-card-type: a second part token would have to
  // be declared in elements/slots.ts, which slots.test.ts's drift guard enforces.
  expect(el.getAttribute('part')).toBe('card');
});

// THE height guard. <Artifact>'s root is `flex h-full w-full flex-col`, so with no
// height on the wrapper it resolves to 0 and the card renders invisible.
test('the wrapper carries a non-zero default height', () => {
  const { container } = renderArtifactCard(BASE);
  const height = wrapperOf(container).style.height;
  expect(height).toBeTruthy();
  expect(parseFloat(height)).toBeGreaterThan(0);
});

test('data.height overrides the default height (number = px)', () => {
  const { container } = renderArtifactCard({ ...BASE, data: { src: 'https://x.test', height: 640 } });
  expect(wrapperOf(container).style.height).toBe('640px');
});

test('data.height accepts a CSS length string', () => {
  const { container } = renderArtifactCard({ ...BASE, data: { src: 'https://x.test', height: '30rem' } });
  expect(wrapperOf(container).style.height).toBe('30rem');
});

test('renders the framed src in the preview iframe', () => {
  const { container } = renderArtifactCard(BASE);
  const frame = container.querySelector('iframe');
  expect(frame).toBeTruthy();
  expect(frame!.getAttribute('src')).toBe('https://example.com/preview');
});

test('envelope.title reaches the user as a heading above the frame', () => {
  const { getByRole } = renderArtifactCard({ ...BASE, title: 'Landing page v3' });
  expect(getByRole('heading').textContent).toContain('Landing page v3');
});

test('no title renders no heading', () => {
  const { queryByRole } = renderArtifactCard(BASE);
  expect(queryByRole('heading')).toBeNull();
});

test('the wrapper is labelled by the title for assistive tech', () => {
  const { container } = renderArtifactCard({ ...BASE, title: 'Landing page v3' });
  const el = wrapperOf(container);
  const labelledBy = el.getAttribute('aria-labelledby');
  expect(labelledBy).toBeTruthy();
  expect(container.querySelector(`#${labelledBy}`)!.textContent).toContain('Landing page v3');
});

test('displayUrl is shown in the path field instead of the real src', () => {
  const { container } = renderArtifactCard({
    ...BASE,
    data: { src: 'data:text/html,<h1>hi</h1>', displayUrl: 'preview.internal/app' },
  });
  const input = container.querySelector('input') as HTMLInputElement;
  expect(input.value).toBe('preview.internal/app');
});

test('data.tab drives the initial view (code shows the file tree)', () => {
  const { getByRole } = renderArtifactCard({
    ...BASE,
    data: {
      src: 'https://x.test',
      tab: 'code',
      files: [{ path: 'index.html', code: '<h1>hi</h1>', language: 'html' }],
      activeFile: 'index.html',
    },
  });
  // The Code tab is the selected segment.
  const codeTab = getByRole('tab', { name: /code/i });
  expect(codeTab.getAttribute('aria-selected')).toBe('true');
});

// The contract is frozen: the artifact's three observation callbacks must ride an
// EXISTING CardEvent kind. `state` is the patch channel.
test('a tab change emits a contract `state` patch, not a new event kind', () => {
  const { host, events } = makeHost();
  const { getByRole } = renderArtifactCard(BASE, host);
  (getByRole('tab', { name: /code/i }) as HTMLElement).click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  const patches = events.filter((e) => e.kind === 'state');
  expect(patches).toHaveLength(1);
  expect(patches[0]).toEqual({ kind: 'state', cardId: 'a1', patch: { tab: 'code' } });
});

test('a navigation emits a contract `state` patch carrying the url', () => {
  const { host, events } = makeHost();
  const { getByRole } = renderArtifactCard(BASE, host);
  (getByRole('button', { name: 'Reload' }) as HTMLElement).click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  const patches = events.filter((e) => e.kind === 'state');
  expect(patches).toHaveLength(1);
  expect(patches[0]).toEqual({
    kind: 'state',
    cardId: 'a1',
    patch: { src: 'https://example.com/preview' },
  });
});

test('a file selection emits a contract `state` patch carrying activeFile', () => {
  const { host, events } = makeHost();
  const { container } = renderArtifactCard(
    {
      ...BASE,
      data: {
        src: 'https://x.test',
        tab: 'code',
        files: [{ path: 'index.html', code: '<h1>hi</h1>', language: 'html' }],
      },
    },
    host,
  );
  const row = container.querySelector('[data-tree-path="index.html"]') as HTMLElement;
  expect(row).toBeTruthy();
  row.click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  const patches = events.filter((e) => e.kind === 'state');
  expect(patches.some((p) => (p as { patch: { activeFile?: string } }).patch.activeFile === 'index.html')).toBe(true);
});

test('emitting without a host does not throw', () => {
  const { getByRole } = renderArtifactCard(BASE);
  expect(() => (getByRole('tab', { name: /code/i }) as HTMLElement).click()).not.toThrow();
});

// --- Revision safety -------------------------------------------------------
// The card exists to be REVISED (addCard upserts on envelope.id). A revision
// hands the same live component a new envelope; it must not reach in and undo
// what the user did in the meantime.
//
// The rendering shape here mirrors components/message.tsx: an <Index> + accessor
// keeps ONE component instance alive and only updates its props. Using a keyed
// <For> would recreate the component and mask the effect being tested, so the
// envelope must arrive through a reactive accessor exactly as it does there.

const REV_FILES = [
  { path: 'index.html', code: '<h1>Home v1</h1>', language: 'html', type: 'html' as const },
  { path: 'about.html', code: '<h1>About v1</h1>', language: 'html', type: 'html' as const },
];

function revisable(version: string): CardEnvelope {
  return {
    type: 'artifact',
    id: 'rev-1',
    title: `Landing page ${version}`,
    data: {
      src: 'https://x.test/index.html',
      files: REV_FILES.map((f) => ({ ...f, code: f.code.replace('v1', version) })),
      tab: 'code',
      activeFile: 'index.html',
    },
  };
}

function renderRevisable() {
  const [parts, setParts] = createSignal<MessagePart[]>(upsertCardPart([], revisable('v1')));
  const envelope = () => (parts()[0] as Extract<MessagePart, { type: 'card' }>).envelope;
  const r = render(() => (
    <CardProvider context={{ theme: { mode: 'light' }, locale: 'en' }} policy={{}}>
      <CardRenderer envelope={envelope()} />
    </CardProvider>
  ));
  /** A model revising its own artifact: same id, same tab/activeFile, new source. */
  const revise = () => { setParts((p) => upsertCardPart(p, revisable('v2'))); flush(); }; // V2-FLUSH
  return { ...r, revise, parts };
}

const selectedTab = (c: HTMLElement) =>
  [...c.querySelectorAll('[role="tab"]')].find((t) => t.getAttribute('aria-selected') === 'true')?.textContent?.trim();
const selectedFile = (c: HTMLElement) =>
  c.querySelector('[role="treeitem"][aria-selected="true"]')?.getAttribute('data-tree-path') ?? null;

test('a revision does NOT yank the user out of the tab they chose', () => {
  const { container, getByRole, revise } = renderRevisable();
  expect(selectedTab(container)).toBe('Code'); // data.tab seeded the first view
  (getByRole('tab', { name: /preview/i }) as HTMLElement).click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(selectedTab(container)).toBe('Preview');
  revise();
  // The revision landed...
  expect(container.querySelector('h3')!.textContent).toContain('v2');
  // ...without dragging the user back to the envelope's tab.
  expect(selectedTab(container)).toBe('Preview');
});

test('a revision does NOT reset the file the user selected', () => {
  const { container, revise } = renderRevisable();
  expect(selectedFile(container)).toBe('index.html'); // data.activeFile seeded it
  (container.querySelector('[data-tree-path="about.html"]') as HTMLElement).click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(selectedFile(container)).toBe('about.html');
  revise();
  expect(container.querySelector('h3')!.textContent).toContain('v2');
  expect(selectedFile(container)).toBe('about.html');
});

test('a revision still updates the CONTENT the user is looking at', () => {
  const { container, revise } = renderRevisable();
  (container.querySelector('[data-tree-path="about.html"]') as HTMLElement).click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(container.textContent).toContain('About v1');
  revise();
  // Same file, revised source — the point of upserting rather than appending.
  expect(selectedFile(container)).toBe('about.html');
  expect(container.textContent).toContain('About v2');
});
