/**
 * Light rendering/behavior tests, per the design-round convention this repo
 * already uses for the builder's story-first components (see
 * builder-panel.test.tsx) — this is a design surface, not a finished
 * feature, so the suite pins the contract (six cards, the "Start from
 * scratch" row, selection, keyboard operability) rather than exhaustively
 * driving every visual state.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent } from '@solidjs/testing-library';
import { BuilderStart, BUILDER_TEMPLATES, BUILDABLE_BUILDER_TEMPLATES } from './builder-start';
import { TEMPLATES } from '../agent-tooling/construct/templates';

afterEach(cleanup);

describe('BuilderStart', () => {
  it('renders one card per template, each named', () => {
    render(() => <BuilderStart onSelect={vi.fn()} />);
    for (const template of BUILDER_TEMPLATES) {
      expect(screen.getByText(template.name)).toBeInTheDocument();
    }
    expect(BUILDER_TEMPLATES).toHaveLength(6);
  });

  it('renders each template\'s one-line description', () => {
    render(() => <BuilderStart onSelect={vi.fn()} />);
    for (const template of BUILDER_TEMPLATES) {
      expect(screen.getByText(template.description)).toBeInTheDocument();
    }
  });

  it('clicking a card fires onSelect with that template\'s id', () => {
    const onSelect = vi.fn();
    render(() => <BuilderStart onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Support widget/ }));
    expect(onSelect).toHaveBeenCalledWith('widget');
  });

  it('every card is keyboard-operable: Enter and Space both fire onSelect (role=button semantics, per Card\'s own clickable behavior)', () => {
    const onSelect = vi.fn();
    render(() => <BuilderStart onSelect={onSelect} />);
    const research = screen.getByRole('button', { name: /Research/ });
    research.focus();
    expect(document.activeElement).toBe(research);
    fireEvent.keyDown(research, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('research');
    fireEvent.keyDown(research, { key: ' ' });
    expect(onSelect).toHaveBeenLastCalledWith('research');
  });

  it('reflects the controlled `value` as the selected card (aria-pressed), and nothing else', () => {
    render(() => <BuilderStart value="workspace" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Workspace/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Support widget/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^In-app assistant/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Assistant/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Research/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Voice/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('every card is a real, focusable button (tabIndex 0) — not a decorative div with a click handler', () => {
    render(() => <BuilderStart onSelect={vi.fn()} />);
    for (const template of BUILDER_TEMPLATES) {
      const card = screen.getByRole('button', { name: new RegExp(template.name) });
      expect(card.tabIndex).toBe(0);
    }
  });

  it('renders no part= attribute on the panel-authored root — only Card, the reused kit primitive, carries its own baked-in part', () => {
    const { container } = render(() => <BuilderStart onSelect={vi.fn()} />);
    const root = container.querySelector('[data-builder-start]');
    expect(root).not.toBeNull();
    expect(root).not.toHaveAttribute('part');
  });

  it('each illustration is decorative (aria-hidden), so the card\'s accessible name comes from its heading/description text, not SVG content', () => {
    render(() => <BuilderStart onSelect={vi.fn()} />);
    for (const svg of document.querySelectorAll('[data-builder-start] svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
    expect(document.querySelectorAll('[data-builder-start] svg')).toHaveLength(6);
  });

  it('renders a "Start from scratch" action below the grid, with its muted sub-line', () => {
    render(() => <BuilderStart onSelect={vi.fn()} />);
    expect(screen.getByText('Start from scratch')).toBeInTheDocument();
    expect(
      screen.getByText('A bare chat, everything off. You can switch to a template later.'),
    ).toBeInTheDocument();
  });

  it('"Start from scratch" is a real, keyboard-operable button that fires onSelect with \'scratch\', not a template', () => {
    const onSelect = vi.fn();
    render(() => <BuilderStart onSelect={onSelect} />);
    const scratch = screen.getByRole('button', { name: /Start from scratch/ });
    expect(scratch.tagName).toBe('BUTTON');
    expect(scratch.tabIndex).toBe(0);
    fireEvent.click(scratch);
    expect(onSelect).toHaveBeenCalledWith('scratch');
    expect(BUILDER_TEMPLATES.some((template) => (template.id as string) === 'scratch')).toBe(false);
  });

  it('reflects `value="scratch"` as aria-pressed on the scratch action, and false on every card', () => {
    render(() => <BuilderStart value="scratch" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Start from scratch/ })).toHaveAttribute('aria-pressed', 'true');
    for (const template of BUILDER_TEMPLATES) {
      expect(screen.getByRole('button', { name: new RegExp(`^${template.name}`) })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
  });
});

describe('BuilderStart derives from the template registry (B-17b)', () => {
  it('BUILDER_TEMPLATES is the registry, id/name/description, in registry order — never restated', () => {
    expect(BUILDER_TEMPLATES).toEqual(
      TEMPLATES.map(({ id, name, description }) => ({ id, name, description })),
    );
  });

  it('BUILDABLE_BUILDER_TEMPLATES filters availability === "buildable" (voice stays a story card only)', () => {
    expect(BUILDABLE_BUILDER_TEMPLATES.map((t) => t.id)).toEqual(
      TEMPLATES.filter((t) => t.availability === 'buildable').map((t) => t.id),
    );
    expect(BUILDABLE_BUILDER_TEMPLATES.some((t) => t.id === 'voice')).toBe(false);
  });

  it('a product surface passing the buildable list renders five cards and no Voice', () => {
    render(() => <BuilderStart templates={BUILDABLE_BUILDER_TEMPLATES} onSelect={vi.fn()} />);
    expect(screen.queryByText('Voice')).not.toBeInTheDocument();
    for (const t of BUILDABLE_BUILDER_TEMPLATES) {
      expect(screen.getByText(t.name)).toBeInTheDocument();
    }
  });

  it('the default (story) rendering still shows all six', () => {
    render(() => <BuilderStart onSelect={vi.fn()} />);
    expect(screen.getByText('Voice')).toBeInTheDocument();
    expect(BUILDER_TEMPLATES).toHaveLength(6);
  });
});
