import { flush } from 'solid-js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import {
  TasksCard,
  type TasksCardData,
  isProgressMode,
  progressCount,
  canConfirm,
  selectedInOrder,
  type TasksTask,
} from './tasks-card';

afterEach(cleanup);

/** Match an element whose normalized OWN text is exactly `count` (e.g. "1 / 2").
 *  The progress count renders `{done} / {total}` as adjacent dynamic text nodes,
 *  so a plain string `getByText` can miss it; this targets the count element. */
const countText = (count: string) => (_content: string, el: Element | null) =>
  el?.textContent?.replace(/\s+/g, ' ').trim() === count &&
  // Only the leaf count <span> (no element children), not its ancestors.
  el.children.length === 0;

const ONBOARDING: TasksCardData = {
  mode: 'progress',
  heading: 'Get started with Claude',
  tasks: [
    { id: 'role', label: 'Customize Claude to your role', description: 'Tune tone and defaults' },
    { id: 'tools', label: 'Add ready-made tools and workflows', description: 'Connect skills and MCP' },
  ],
};

describe('tasks-card progress helpers', () => {
  it('isProgressMode is true only for mode: progress', () => {
    expect(isProgressMode({ tasks: [] })).toBe(false);
    expect(isProgressMode({ tasks: [], mode: 'select' })).toBe(false);
    expect(isProgressMode({ tasks: [], mode: 'progress' })).toBe(true);
  });

  it('progressCount derives done/total from the checked set', () => {
    const tasks: TasksTask[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];
    expect(progressCount(tasks, new Set())).toEqual({ done: 0, total: 3 });
    expect(progressCount(tasks, new Set(['a', 'c']))).toEqual({ done: 2, total: 3 });
    // Unknown ids in the set don't inflate `done`.
    expect(progressCount(tasks, new Set(['a', 'zzz']))).toEqual({ done: 1, total: 3 });
  });
});

describe('TasksCard progress (onboarding checklist)', () => {
  it('renders the heading, a 0 / total count, and each item title + description', () => {
    const { getByText } = render(() => <TasksCard data={ONBOARDING} cardId="onboarding" />);
    expect(getByText('Get started with Claude')).toBeInTheDocument();
    expect(getByText(countText('0 / 2'))).toBeInTheDocument();
    expect(getByText('Customize Claude to your role')).toBeInTheDocument();
    expect(getByText('Tune tone and defaults')).toBeInTheDocument();
    expect(getByText('Add ready-made tools and workflows')).toBeInTheDocument();
  });

  it('has NO confirm button in progress mode (checking a row is the action)', () => {
    const { queryByRole } = render(() => <TasksCard data={ONBOARDING} cardId="onboarding" />);
    expect(queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument();
  });

  it('checking an item advances the progress count and fires onValueChange', () => {
    const onValueChange = vi.fn();
    const { getByText, getAllByRole } = render(() => (
      <TasksCard data={ONBOARDING} cardId="onboarding" onValueChange={onValueChange} />
    ));
    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);

    fireEvent.click(checkboxes[0]);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(getByText(countText('1 / 2'))).toBeInTheDocument();
    expect(onValueChange).toHaveBeenLastCalledWith({ value: ['role'] });

    fireEvent.click(checkboxes[1]);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(getByText(countText('2 / 2'))).toBeInTheDocument();
    expect(onValueChange).toHaveBeenLastCalledWith({ value: ['role', 'tools'] });

    // Unchecking walks it back down.
    fireEvent.click(checkboxes[0]);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(getByText(countText('1 / 2'))).toBeInTheDocument();
    expect(onValueChange).toHaveBeenLastCalledWith({ value: ['tools'] });
  });

  it('seeds the count from per-task checked + defaultValue', () => {
    const seeded: TasksCardData = {
      mode: 'progress',
      heading: 'Get started with Claude',
      tasks: [
        { id: 'role', label: 'Customize Claude to your role', checked: true },
        { id: 'tools', label: 'Add ready-made tools and workflows' },
      ],
    };
    const { getByText } = render(() => <TasksCard data={seeded} cardId="onboarding" />);
    expect(getByText(countText('1 / 2'))).toBeInTheDocument();
  });

  it('still honors the max gate in progress mode (blocks past max)', () => {
    const bounded: TasksCardData = {
      mode: 'progress',
      heading: 'Pick up to 1',
      max: 1,
      tasks: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    };
    const { getByText, getAllByRole } = render(() => <TasksCard data={bounded} cardId="bounded" />);
    const checkboxes = getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(checkboxes[0]);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    // `total` is the number of rows (2); `max` only gates how many can be checked.
    expect(getByText(countText('1 / 2'))).toBeInTheDocument();
    // The other row is now blocked (disabled) by the max gate.
    expect(checkboxes[1]).toBeDisabled();
  });
});

describe('TasksCard select mode unchanged', () => {
  const PLAN: TasksCardData = {
    confirmLabel: 'Run selected',
    tasks: [
      { id: 'lint', label: 'Run linter', checked: true },
      { id: 'build', label: 'Build bundle' },
    ],
  };

  it('renders the confirm button and the "N selected" footer (no progress count)', () => {
    const { getByRole, getByText, queryByText } = render(() => (
      <TasksCard data={PLAN} heading="Approve" cardId="plan" />
    ));
    expect(getByRole('button', { name: 'Run selected' })).toBeInTheDocument();
    expect(getByText('1 selected')).toBeInTheDocument();
    // The progress `done / total` count is a progress-mode-only affordance.
    expect(queryByText('1 / 2')).not.toBeInTheDocument();
  });

  it('select-mode confirm gate (canConfirm) is intact', () => {
    expect(canConfirm({ tasks: [] }, 0)).toBe(false); // default min 1
    expect(canConfirm({ tasks: [] }, 1)).toBe(true);
    expect(canConfirm({ tasks: [], allowEmpty: true }, 0)).toBe(true);
    expect(canConfirm({ tasks: [], max: 2 }, 3)).toBe(false);
  });

  it('selectedInOrder preserves task order regardless of selection order', () => {
    const tasks: TasksTask[] = [
      { id: 'lint', label: 'Lint' },
      { id: 'build', label: 'Build' },
    ];
    expect(selectedInOrder(tasks, new Set(['build', 'lint']))).toEqual(['lint', 'build']);
  });
});
