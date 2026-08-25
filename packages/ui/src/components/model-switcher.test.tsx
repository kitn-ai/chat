import { flush } from 'solid-js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent, screen } from '@solidjs/testing-library';
import { ModelSwitcher } from './model-switcher';
import type { ModelOption } from '../types';

afterEach(cleanup);

const MODELS: ModelOption[] = [
  { id: 'gpt-5.5', name: 'GPT-5.5', description: 'Flagship model' },
  { id: 'gpt-4o', name: 'GPT-4o', group: 'Legacy models' },
  { id: 'gpt-4.1', name: 'GPT-4.1', group: 'Legacy models' },
];

// Dropdown content renders through a Portal (outside the render container), so
// query via `screen` (document.body). The trigger button is the only button
// before any group is expanded.
const open = () => fireEvent.click(screen.getByRole('button'));

describe('ModelSwitcher grouping & descriptions', () => {
  it('renders a model description under the model name', () => {
    render(() => <ModelSwitcher models={MODELS} currentModelId="gpt-5.5" onModelChange={() => {}} />);
    open();
    expect(screen.getByText('Flagship model')).toBeInTheDocument();
  });

  it('hides grouped models behind a collapsed group header until expanded', () => {
    render(() => <ModelSwitcher models={MODELS} currentModelId="gpt-5.5" onModelChange={() => {}} />);
    open();
    expect(screen.getByText('Legacy models')).toBeInTheDocument();
    expect(screen.queryByText('GPT-4o')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Legacy models'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.getByText('GPT-4.1')).toBeInTheDocument();
  });

  it('selects an ungrouped model', () => {
    const onModelChange = vi.fn();
    render(() => <ModelSwitcher models={MODELS} currentModelId="gpt-4o" onModelChange={onModelChange} />);
    open();
    fireEvent.click(screen.getByText('Flagship model')); // the GPT-5.5 row (description is unique)
    expect(onModelChange).toHaveBeenCalledWith('gpt-5.5');
  });

  it('selects a grouped model after expanding its group', () => {
    const onModelChange = vi.fn();
    render(() => <ModelSwitcher models={MODELS} currentModelId="gpt-5.5" onModelChange={onModelChange} />);
    open();
    fireEvent.click(screen.getByText('Legacy models'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    fireEvent.click(screen.getByText('GPT-4o'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onModelChange).toHaveBeenCalledWith('gpt-4o');
  });

  it('still renders provider when no description is given (back-compat)', () => {
    render(() => (
      <ModelSwitcher
        models={[{ id: 'a', name: 'Model A', provider: 'Acme' }, { id: 'b', name: 'Model B' }]}
        currentModelId="a"
        onModelChange={() => {}}
      />
    ));
    open();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });
});
