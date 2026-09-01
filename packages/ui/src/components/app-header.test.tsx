import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent } from '@solidjs/testing-library';
import { AppHeader } from './app-header';

afterEach(cleanup);

/** Every piece on, with every mechanism supplied — the arrangement the owner
 *  ruled and the story ships. Reused by the ordering/divider tests below so
 *  none of them can pass against a half-rendered header. */
function renderFull(): HTMLElement {
  const { container } = render(() => (
    <AppHeader
      title="Workspace"
      showSearch
      onSearch={() => {}}
      showThemeToggle
      dark={false}
      onToggleDark={() => {}}
      actions={[
        { label: 'Share', variant: 'outline' },
        { label: 'Deploy', variant: 'default' },
      ]}
      onActionSelect={() => {}}
      user={{ name: 'Ada', plan: 'Pro' }}
      onUserMenuSelect={() => {}}
    />
  ));
  return container;
}

describe('AppHeader — promoted from builder-workspace.stories.tsx', () => {
  it('renders every piece the owner-ruled arrangement carries', () => {
    renderFull();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Search commands')).toBeInTheDocument();
    expect(screen.getByLabelText('Switch to dark mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ada — Pro account menu')).toBeInTheDocument();
  });

  it('THE ARRANGEMENT: title LEFT, then search · theme | actions | user — in that document order', () => {
    const container = renderFull();
    // Read the real DOM order rather than asserting presence twice: the
    // arrangement itself is the contract (the owner ruled it is not
    // configurable), so order is what this test exists to pin.
    const order = [...container.querySelectorAll<HTMLElement>('[data-kai-app-header-title], button')]
      .map((el) =>
        el.hasAttribute('data-kai-app-header-title') ? 'title' : el.getAttribute('aria-label') ?? el.textContent?.trim(),
      );
    expect(order).toEqual([
      'title',
      'Search commands',
      'Switch to dark mode',
      'Share',
      'Deploy',
      'Ada — Pro account menu',
    ]);
  });

  it('the title sits in the LEFT group, ahead of every right-hand group (the superseded mirror put it right)', () => {
    const container = renderFull();
    const title = container.querySelector('[data-kai-app-header-title]')!;
    const utility = container.querySelector('[data-kai-app-header-utility]')!;
    expect(title.compareDocumentPosition(utility) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('two dividers with all three groups present; none when only one group has content', () => {
    const container = renderFull();
    expect(container.querySelectorAll('[role="separator"]').length).toBe(2);
    cleanup();
    const { container: actionsOnly } = render(() => (
      <AppHeader title="Workspace" actions={[{ label: 'Share' }]} onActionSelect={() => {}} />
    ));
    expect(actionsOnly.querySelectorAll('[role="separator"]').length).toBe(0);
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('one divider when the utility cluster is the only thing beside the user cluster (no orphan divider)', () => {
    const { container } = render(() => (
      <AppHeader
        title="Workspace"
        showThemeToggle
        dark
        onToggleDark={() => {}}
        user={{ name: 'Ada' }}
        onUserMenuSelect={() => {}}
      />
    ));
    expect(container.querySelectorAll('[role="separator"]').length).toBe(1);
  });

  it('paints its own background — the emitted app mounts it outside any surface that would', () => {
    // Regression: the first live capture put dark-theme foreground text on the
    // page's white, because the story's copy leaned on its preview frame for a
    // floor and the promoted component has no such host guarantee.
    const { container } = render(() => <AppHeader title="Workspace" />);
    expect(container.querySelector('[data-kai-app-header]')).toHaveClass('bg-background');
  });

  it('every element is individually optional — a bare title renders alone', () => {
    const container = render(() => <AppHeader title="Workspace" />).container;
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('[role="separator"]').length).toBe(0);
  });

  it('no title renders no title text, while the rest of the header still stands', () => {
    const container = render(() => (
      <AppHeader showSearch onSearch={() => {}} />
    )).container;
    expect(container.querySelector('[data-kai-app-header-title]')).toBeNull();
    expect(screen.getByLabelText('Search commands')).toBeInTheDocument();
  });

  // ── menu-honesty: a flag with no mechanism behind it renders nothing ──────
  // Each stale case is PAIRED with the update case over the same header, so
  // "nothing rendered" can never pass vacuously.

  it('showSearch with NO onSearch renders no search button — an affordance with nothing behind it is not an affordance', () => {
    const { container } = render(() => <AppHeader title="Workspace" showSearch showThemeToggle dark onToggleDark={() => {}} />);
    expect(container.querySelector('[data-kai-app-header-utility]')).toBeInTheDocument();
    expect(screen.getByLabelText('Switch to light mode')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search commands')).not.toBeInTheDocument();
  });

  it('the same flag WITH a handler renders it and fires it', () => {
    const onSearch = vi.fn();
    render(() => <AppHeader title="Workspace" showSearch onSearch={onSearch} />);
    fireEvent.click(screen.getByLabelText('Search commands'));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('showThemeToggle with NO onToggleDark renders no toggle', () => {
    render(() => <AppHeader title="Workspace" showThemeToggle showSearch onSearch={() => {}} />);
    expect(screen.getByLabelText('Search commands')).toBeInTheDocument();
    expect(screen.queryByLabelText('Switch to dark mode')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Switch to light mode')).not.toBeInTheDocument();
  });

  it('the theme toggle is CONTROLLED — it reports, it does not self-flip, and it shows the mode you switch TO', () => {
    const onToggleDark = vi.fn();
    render(() => <AppHeader showThemeToggle dark={false} onToggleDark={onToggleDark} />);
    // dark={false} -> offers dark ("tap for dark"), the universal convention.
    fireEvent.click(screen.getByLabelText('Switch to dark mode'));
    expect(onToggleDark).toHaveBeenCalledTimes(1);
    // Still light: the component never owned the state.
    expect(screen.getByLabelText('Switch to dark mode')).toBeInTheDocument();
  });

  it('actions with NO onActionSelect render nothing — never a button that swallows its click', () => {
    render(() => (
      <AppHeader title="Workspace" actions={[{ label: 'Share' }]} showSearch onSearch={() => {}} />
    ));
    expect(screen.getByLabelText('Search commands')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('the same actions WITH a handler render in order and report the action they carry', () => {
    const onActionSelect = vi.fn();
    render(() => (
      <AppHeader
        actions={[
          { label: 'Share', variant: 'outline' },
          { label: 'Deploy', variant: 'default' },
        ]}
        onActionSelect={onActionSelect}
      />
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));
    expect(onActionSelect).toHaveBeenCalledWith({ label: 'Deploy', variant: 'default' });
  });

  it('an empty actions array renders no actions group at all', () => {
    const { container } = render(() => <AppHeader title="Workspace" actions={[]} onActionSelect={() => {}} />);
    expect(container.querySelector('[data-kai-app-header-actions]')).toBeNull();
  });

  it('a user with NO onUserMenuSelect renders no avatar cluster — a menu whose every row is dead is a dead menu', () => {
    render(() => <AppHeader title="Workspace" user={{ name: 'Ada', plan: 'Pro' }} showSearch onSearch={() => {}} />);
    expect(screen.getByLabelText('Search commands')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ada — Pro account menu')).not.toBeInTheDocument();
  });

  it('the same user WITH a handler renders the compact avatar+chevron and reports each menu row', () => {
    const onUserMenuSelect = vi.fn();
    render(() => <AppHeader user={{ name: 'Ada', plan: 'Pro' }} onUserMenuSelect={onUserMenuSelect} />);
    const trigger = screen.getByLabelText('Ada — Pro account menu');
    // COMPACT (owner's own instruction): initials + chevron, no name/plan text.
    expect(trigger).toHaveTextContent('AD');
    expect(trigger).not.toHaveTextContent('Pro');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('Log out'));
    expect(onUserMenuSelect).toHaveBeenCalledWith('log-out');
  });

  it('the user cluster keeps its accessible name even without a plan', () => {
    render(() => <AppHeader user={{ name: 'Ada' }} onUserMenuSelect={() => {}} />);
    expect(screen.getByLabelText('Ada account menu')).toBeInTheDocument();
  });
});
