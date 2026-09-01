/**
 * Unit tests for the panel chrome parts (blocks-and-parts ruling P-1).
 *
 * Strategy (the sibling declarative pattern, e.g.
 * compare.declarative.test.tsx): `defineWebComponent` needs a real browser
 * (shadow roots, Constructable Stylesheets), so jsdom tests pin the
 * COMPONENT contract the `kai-panel` / `kai-panel-header` facades render.
 * What matters here, per the ruling and the spike's F-2:
 *
 *   1. every chrome color is a KIT TOKEN class (bg-background /
 *      text-foreground / border-border), never an invented palette, so a
 *      `--kai-color-*` override retints the chrome with the elements;
 *   2. the header row's box is byte-for-byte ChatThread's built-in header
 *      (h-14 · border-b · px-5 · gap-2 clusters · sm semibold title), so the
 *      P-9 refactor can render kai-chat's header THROUGH these parts with no
 *      visual delta;
 *   3. frame is prop-driven (border/radius/shadow only with `frame`;
 *      radius INHERITED without it, the inside-a-dock posture);
 *   4. the ::part boundaries exist (start/title/end on the header row).
 *
 * The full computed-style probe (tokens resolving in light, dark, and under
 * a `--kai-color-primary` override) needs real CSS and belongs to the
 * phase-2 block driver, per the plan.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { Panel, PanelHeader, PanelBody, PanelFooter } from './panel';

afterEach(cleanup);

/** The exact header-row box classes ChatThread's built-in header paints. */
const CHAT_THREAD_HEADER_BOX = ['flex', 'h-14', 'shrink-0', 'items-center', 'justify-between', 'border-b', 'border-border', 'px-5'];

describe('Panel — surface and frame', () => {
  it('paints the surface from kit tokens (bg-background / text-foreground)', () => {
    const { container } = render(() => <Panel>body</Panel>);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('bg-background', 'text-foreground', 'flex', 'flex-col', 'h-full', 'overflow-hidden');
  });

  it('frameless (default) inherits the container radius and adds no border/shadow', () => {
    const { container } = render(() => <Panel>body</Panel>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.borderRadius).toBe('inherit');
    expect(root.className).not.toMatch(/border-border|shadow|rounded-2xl/);
  });

  it('frame adds the widget-box chrome: token border, radius, shadow', () => {
    const { container } = render(() => <Panel frame>body</Panel>);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('rounded-2xl', 'border', 'border-border', 'shadow-xl');
    // The frame owns its radius; it must NOT also inherit one.
    expect(root.style.borderRadius).toBe('');
  });

  it('merges a caller class without losing the token surface', () => {
    const { container } = render(() => <Panel class="w-64">body</Panel>);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('w-64', 'bg-background');
  });
});

describe('PanelHeader — ChatThread header-row parity', () => {
  it("renders ChatThread's exact header box (h-14, border-b border-border, px-5)", () => {
    const { getByRole } = render(() => <PanelHeader>Support</PanelHeader>);
    const row = getByRole('banner');
    expect(row).toHaveClass(...CHAT_THREAD_HEADER_BOX);
  });

  it("styles the title exactly as ChatThread's (text-sm font-semibold text-foreground)", () => {
    const { getByText } = render(() => <PanelHeader>Aurora Support</PanelHeader>);
    const title = getByText('Aurora Support');
    expect(title).toHaveClass('text-sm', 'font-semibold', 'text-foreground');
  });

  it('renders start content BEFORE the title and end content in the trailing cluster', () => {
    const { getByRole, getByText } = render(() => (
      <PanelHeader
        start={<button aria-label="Back">back</button>}
        end={<button aria-label="Close">x</button>}
      >
        Title
      </PanelHeader>
    ));
    const row = getByRole('banner');
    const back = getByRole('button', { name: 'Back' });
    const close = getByRole('button', { name: 'Close' });
    const title = getByText('Title');
    // Leading cluster holds back + title, in that order.
    expect(back.parentElement).toBe(title.parentElement);
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Trailing cluster is a different box, gap-2 like ChatThread's.
    expect(close.parentElement).not.toBe(back.parentElement);
    expect(close.parentElement).toHaveClass('gap-2');
    expect(back.parentElement).toHaveClass('gap-2');
    expect(row).toContainElement(close);
  });

  it('exposes the ::part visual boundaries: start, title, end', () => {
    const { getByRole } = render(() => (
      <PanelHeader start={<span>s</span>} end={<span>e</span>}>Title</PanelHeader>
    ));
    const row = getByRole('banner');
    expect(row.querySelector('[part="start"]')).not.toBeNull();
    expect(row.querySelector('[part="title"]')).not.toBeNull();
    expect(row.querySelector('[part="end"]')).not.toBeNull();
  });

  it('omits the title box when there is no title content', () => {
    const { getByRole } = render(() => <PanelHeader end={<span>e</span>} />);
    expect(getByRole('banner').querySelector('[part="title"]')).toBeNull();
  });
});

describe('PanelBody / PanelFooter — the view container regions', () => {
  it("PanelBody is ChatThread's view container: relative flex-1 overflow-hidden, min-h-0", () => {
    const { getByText } = render(() => <PanelBody>view</PanelBody>);
    const body = getByText('view');
    expect(body).toHaveClass('relative', 'flex-1', 'overflow-hidden', 'min-h-0', 'flex', 'flex-col');
  });

  it('PanelFooter never scrolls away (shrink-0) and stays unopinionated otherwise', () => {
    const { getByText } = render(() => <PanelFooter class="px-4">foot</PanelFooter>);
    const foot = getByText('foot');
    expect(foot).toHaveClass('shrink-0', 'px-4');
  });

  it('composes into the widget-box column: header, body, footer in order', () => {
    const { container } = render(() => (
      <Panel frame>
        <PanelHeader>Support</PanelHeader>
        <PanelBody>view</PanelBody>
        <PanelFooter>foot</PanelFooter>
      </Panel>
    ));
    const root = container.firstElementChild as HTMLElement;
    const kids = Array.from(root.children);
    expect(kids[0]?.tagName).toBe('HEADER');
    expect(kids[1]).toHaveClass('flex-1');
    expect(kids[2]).toHaveClass('shrink-0');
  });
});
