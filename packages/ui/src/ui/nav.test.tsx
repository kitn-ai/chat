import { flush } from 'solid-js';
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { Nav, type KaiNavItem } from './nav';

afterEach(cleanup);

const ITEMS: KaiNavItem[] = [
  { id: 'a', label: 'Alpha', icon: 'plus' },
  { id: 'b', label: 'Beta', badge: 'New' },
  { id: 'c', label: 'Gamma', disabled: true },
];

const NESTED: KaiNavItem[] = [
  { id: 'home', label: 'Home', icon: 'plus' },
  {
    id: 'acme',
    label: 'Acme',
    icon: 'folder',
    children: [
      { id: 't1', label: 'Refactor auth' },
      { id: 't2', label: 'Landing page' },
    ],
  },
];

describe('Nav', () => {
  it('renders one button per item', () => {
    const { getAllByRole } = render(() => <Nav items={ITEMS} />);
    expect(getAllByRole('button')).toHaveLength(3);
  });
  it('marks the active item with aria-current', () => {
    const { getByText } = render(() => <Nav items={ITEMS} value="b" />);
    expect(getByText('Beta').closest('button')).toHaveAttribute('aria-current', 'page');
    expect(getByText('Alpha').closest('button')).not.toHaveAttribute('aria-current');
  });
  it('fires onItemSelect with the id on click', () => {
    const onItemSelect = vi.fn();
    const { getByText } = render(() => <Nav items={ITEMS} onItemSelect={onItemSelect} />);
    fireEvent.click(getByText('Alpha'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onItemSelect).toHaveBeenCalledWith('a');
  });
  it('does not fire for a disabled item', () => {
    const onItemSelect = vi.fn();
    const { getByText } = render(() => <Nav items={ITEMS} onItemSelect={onItemSelect} />);
    fireEvent.click(getByText('Gamma'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onItemSelect).not.toHaveBeenCalled();
  });
  it('renders a trailing badge', () => {
    const { getByText } = render(() => <Nav items={ITEMS} />);
    expect(getByText('New')).toBeInTheDocument();
  });

  // Backward-compat: a flat nav with no children/status/meta is unchanged — no
  // disclosure chevron, group, status, or meta markup, and no aria-expanded.
  it('renders a flat nav with no nesting/status/meta markup (unchanged)', () => {
    const { container, getAllByRole } = render(() => <Nav items={ITEMS} />);
    expect(container.querySelector('[part="chevron"]')).toBeNull();
    expect(container.querySelector('[part="group"]')).toBeNull();
    expect(container.querySelector('[part="status"]')).toBeNull();
    expect(container.querySelector('[part="meta"]')).toBeNull();
    for (const btn of getAllByRole('button')) {
      expect(btn).not.toHaveAttribute('aria-expanded');
      expect(btn).not.toHaveAttribute('aria-label');
      expect(btn).not.toHaveAttribute('style');
    }
  });
});

describe('Nav — nested groups', () => {
  it('renders a group parent with aria-expanded and its children, expanded by default', () => {
    const { getByText } = render(() => <Nav items={NESTED} />);
    const parent = getByText('Acme').closest('button')!;
    expect(parent).toHaveAttribute('aria-expanded', 'true');
    expect(getByText('Refactor auth')).toBeInTheDocument();
    expect(getByText('Landing page')).toBeInTheDocument();
  });

  it('renders a disclosure chevron on the group parent only', () => {
    const { container, getByText } = render(() => <Nav items={NESTED} />);
    const chevrons = container.querySelectorAll('[part="chevron"]');
    expect(chevrons).toHaveLength(1);
    expect(getByText('Acme').closest('button')).toContainElement(chevrons[0] as HTMLElement);
  });

  it('collapses and expands the group on click', () => {
    const { getByText, queryByText } = render(() => <Nav items={NESTED} />);
    const parent = getByText('Acme').closest('button')!;
    fireEvent.click(parent);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(parent).toHaveAttribute('aria-expanded', 'false');
    expect(queryByText('Refactor auth')).not.toBeInTheDocument();
    fireEvent.click(parent);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(parent).toHaveAttribute('aria-expanded', 'true');
    expect(queryByText('Refactor auth')).toBeInTheDocument();
  });

  it('honors defaultCollapsed for the initial state', () => {
    const { getByText, queryByText } = render(() => <Nav items={NESTED} defaultCollapsed={['acme']} />);
    expect(getByText('Acme').closest('button')).toHaveAttribute('aria-expanded', 'false');
    expect(queryByText('Refactor auth')).not.toBeInTheDocument();
  });

  it('toggles a collapsed group open with ArrowRight', () => {
    const { getByText, queryByText } = render(() => <Nav items={NESTED} defaultCollapsed={['acme']} />);
    const parent = getByText('Acme').closest('button')!;
    fireEvent.keyDown(parent, { key: 'ArrowRight' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(parent).toHaveAttribute('aria-expanded', 'true');
    expect(queryByText('Refactor auth')).toBeInTheDocument();
  });

  it('selects a leaf child (fires onItemSelect) and does not select the group parent', () => {
    const onItemSelect = vi.fn();
    const { getByText } = render(() => <Nav items={NESTED} onItemSelect={onItemSelect} />);
    fireEvent.click(getByText('Refactor auth')); // leaf: selects
    expect(onItemSelect).toHaveBeenCalledWith('t1');
    onItemSelect.mockClear();
    fireEvent.click(getByText('Acme')); // group: toggles, no select
    expect(onItemSelect).not.toHaveBeenCalled();
  });

  it('marks an active leaf child with aria-current', () => {
    const { getByText } = render(() => <Nav items={NESTED} value="t2" />);
    expect(getByText('Landing page').closest('button')).toHaveAttribute('aria-current', 'page');
  });
});

describe('Nav — status dot', () => {
  const withStatus: KaiNavItem[] = [
    { id: 'run', label: 'Refactor auth', status: { tone: 'info', label: 'Working', pulse: true } },
  ];

  it('renders a tone-colored status dot with a pulse ring', () => {
    const { container } = render(() => <Nav items={withStatus} />);
    const status = container.querySelector('[part="status"]')!;
    expect(status).toBeInTheDocument();
    expect(status.querySelector('.bg-tool-blue')).not.toBeNull();
    expect(status.querySelector('.animate-ping')).not.toBeNull();
  });

  it('folds the status label into the row accessible name', () => {
    const { getByText } = render(() => <Nav items={withStatus} />);
    expect(getByText('Refactor auth').closest('button')).toHaveAttribute('aria-label', 'Refactor auth, Working');
  });

  it('maps each tone to its hue', () => {
    const tones: Array<[KaiNavItem['status'] & object, string]> = [
      [{ tone: 'primary' }, 'bg-primary'],
      [{ tone: 'success' }, 'bg-tool-green'],
      [{ tone: 'warning' }, 'bg-tool-amber'],
      [{ tone: 'error' }, 'bg-tool-red'],
      [{ tone: 'neutral' }, 'bg-muted-foreground'],
    ];
    for (const [status, hue] of tones) {
      const { container } = render(() => <Nav items={[{ id: 'x', label: 'X', status }]} />);
      expect(container.querySelector(`[part="status"] .${hue}`)).not.toBeNull();
      cleanup();
    }
  });
});

describe('Nav — trailing action / closable', () => {
  const withTrailing: KaiNavItem[] = [
    { id: 'a', label: 'Alpha', action: { icon: 'pencil', label: 'Rename' } },
    { id: 'b', label: 'Beta', closable: true },
  ];

  // The headline guard: activating the trailing action must NOT select the row
  // (the action and the item button are siblings, so the select handler is never
  // reached). This is the unit-level catch for the demo-story regression where a
  // story wired onItemAction -> setValue.
  it('clicking the trailing action fires onItemAction and does NOT fire onItemSelect', () => {
    const onItemSelect = vi.fn();
    const onItemAction = vi.fn();
    const { container } = render(() => (
      <Nav items={withTrailing} value="a" onItemSelect={onItemSelect} onItemAction={onItemAction} />
    ));
    const actionBtn = container.querySelector<HTMLButtonElement>('[data-nav-action="action"]')!;
    expect(actionBtn).not.toBeNull();
    fireEvent.click(actionBtn);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onItemAction).toHaveBeenCalledWith('a', { icon: 'pencil', label: 'Rename' });
    expect(onItemSelect).not.toHaveBeenCalled();
  });

  it('clicking the trailing close fires onItemClose and does NOT fire onItemSelect', () => {
    const onItemSelect = vi.fn();
    const onItemClose = vi.fn();
    const { container } = render(() => (
      <Nav items={withTrailing} onItemSelect={onItemSelect} onItemClose={onItemClose} />
    ));
    const closeBtn = container.querySelector<HTMLButtonElement>('[data-nav-action="close"]')!;
    fireEvent.click(closeBtn);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onItemClose).toHaveBeenCalledWith('b');
    expect(onItemSelect).not.toHaveBeenCalled();
  });

  it('clicking the row body still fires onItemSelect (not a trailing handler)', () => {
    const onItemSelect = vi.fn();
    const onItemAction = vi.fn();
    const { getByText } = render(() => (
      <Nav items={withTrailing} onItemSelect={onItemSelect} onItemAction={onItemAction} />
    ));
    fireEvent.click(getByText('Alpha'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onItemSelect).toHaveBeenCalledWith('a');
    expect(onItemAction).not.toHaveBeenCalled();
  });

  it('renders the trailing button as a sibling of the item button (never nested)', () => {
    const { container } = render(() => <Nav items={withTrailing} />);
    const action = container.querySelector('[data-nav-action]')!;
    // No interactive ancestor: the action button is not inside the item button.
    expect(action.closest('[part="item"]')).toBeNull();
  });
});

describe('Nav — trailing meta', () => {
  const withMeta: KaiNavItem[] = [{ id: 'm', label: 'Landing page', meta: '24d ago' }];

  it('renders the meta text in a meta part', () => {
    const { container, getByText } = render(() => <Nav items={withMeta} />);
    const meta = container.querySelector('[part="meta"]')!;
    expect(meta).toBeInTheDocument();
    expect(meta).toHaveTextContent('24d ago');
    expect(getByText('Landing page').closest('button')).toContainElement(meta as HTMLElement);
  });

  it('folds meta into the row accessible name', () => {
    const { getByText } = render(() => <Nav items={withMeta} />);
    expect(getByText('Landing page').closest('button')).toHaveAttribute('aria-label', 'Landing page, 24d ago');
  });
});
