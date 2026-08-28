import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent } from '@solidjs/testing-library';
import { WorkspaceVariantPicker, WORKSPACE_VARIANTS } from './builder-workspace-variants';

afterEach(cleanup);

describe('WorkspaceVariantPicker', () => {
  it('renders one card per variant, each named and described', () => {
    render(() => <WorkspaceVariantPicker onSelect={vi.fn()} onBack={vi.fn()} />);
    for (const variant of WORKSPACE_VARIANTS) {
      expect(screen.getByText(variant.name)).toBeInTheDocument();
      expect(screen.getByText(variant.description)).toBeInTheDocument();
    }
    expect(WORKSPACE_VARIANTS).toHaveLength(2);
  });

  it('clicking a card fires onSelect with that variant\'s id', () => {
    const onSelect = vi.fn();
    render(() => <WorkspaceVariantPicker onSelect={onSelect} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Artifact preview beside chat/ }));
    expect(onSelect).toHaveBeenCalledWith('artifactPreview');
  });

  it('clicking the other card fires onSelect with its own id', () => {
    const onSelect = vi.fn();
    render(() => <WorkspaceVariantPicker onSelect={onSelect} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /App preview with device toggles/ }));
    expect(onSelect).toHaveBeenCalledWith('appPreview');
  });

  it('the selected variant carries aria-pressed=true, the other false', () => {
    render(() => <WorkspaceVariantPicker value="artifactPreview" onSelect={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Artifact preview beside chat/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /App preview with device toggles/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('the back button fires onBack', () => {
    const onBack = vi.fn();
    render(() => <WorkspaceVariantPicker onSelect={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
