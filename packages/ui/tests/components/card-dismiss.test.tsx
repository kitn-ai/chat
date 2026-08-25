// tests/components/card-dismiss.test.tsx
// Per-card dismiss → collapsed stub → reopen, across confirm / choice / form / tasks.
// The × (only when `dismissible`) emits `dismiss` AND optimistically flips to the
// re-openable DismissedStub; Reopen emits `{ kind:'reopen', cardId }`.
import { flush } from 'solid-js';
import { test, expect, afterEach } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { ConfirmCard, type ConfirmCardData } from '../../src/components/confirm-card';
import { ChoiceCard, type ChoiceCardData } from '../../src/components/choice-card';
import { TasksCard, type TasksCardData } from '../../src/components/tasks-card';
import { Form, type FormDefinition } from '../../src/components/form';
import type { CardEvent, CardHost, CardContext } from '../../src/primitives/card-contract';

afterEach(() => { document.body.innerHTML = ''; });

function makeHost(): { host: CardHost; events: CardEvent[] } {
  const events: CardEvent[] = [];
  const ctx: CardContext = { theme: { mode: 'light' }, locale: 'en' };
  return { events, host: { context: () => ctx, emit: (e) => events.push(e) } };
}

const CONFIRM: ConfirmCardData = {
  body: 'Apply 3 migrations?',
  dismissible: true,
  actions: [{ id: 'go', label: 'Run' }, { id: 'no', label: 'Cancel' }],
};

test('confirm: × emits dismiss + collapses to a reopenable stub; Reopen emits reopen', () => {
  const { host, events } = makeHost();
  const { getByRole, queryByText } = render(() => (
    <ConfirmCard host={host} cardId="c1" heading="Migrate" data={CONFIRM} />
  ));

  // The action buttons are present before dismiss.
  expect(queryByText('Run')).toBeTruthy();

  fireEvent.click(getByRole('button', { name: 'Dismiss' }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  // dismiss event emitted.
  expect(events.some((e) => e.kind === 'dismiss' && e.cardId === 'c1')).toBe(true);

  // Collapsed: a stub group, no action buttons, a Reopen button.
  const group = getByRole('group', { name: /Proposed: Migrate — dismissed/ });
  expect(group).toBeTruthy();
  expect(queryByText('Run')).toBeNull();
  const reopen = getByRole('button', { name: 'Reopen' });
  expect(reopen).toBeTruthy();

  fireEvent.click(reopen);
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(events.some((e) => e.kind === 'reopen' && e.cardId === 'c1')).toBe(true);
});

test('confirm: no × when not dismissible', () => {
  const { host } = makeHost();
  const { queryByRole } = render(() => (
    <ConfirmCard host={host} cardId="c1" data={{ ...CONFIRM, dismissible: false }} />
  ));
  expect(queryByRole('button', { name: 'Dismiss' })).toBeNull();
});

test('confirm: a re-hydrated `dismissed` resolution renders the stub (no optimistic announce)', () => {
  const { host } = makeHost();
  const { getByRole, queryByText } = render(() => (
    <ConfirmCard host={host} cardId="c1" heading="Migrate" data={CONFIRM} resolution={{ kind: 'dismissed' }} />
  ));
  expect(getByRole('button', { name: 'Reopen' })).toBeTruthy();
  expect(queryByText('Run')).toBeNull();
});

const CHOICE: ChoiceCardData = {
  prompt: 'Pick one',
  dismissible: true,
  options: [{ id: 'a', label: 'Apple' }, { id: 'b', label: 'Banana' }],
};

test('choice: × emits dismiss + stub; Reopen emits reopen', () => {
  const { host, events } = makeHost();
  const { getByRole, queryByText } = render(() => (
    <ChoiceCard host={host} cardId="ch1" heading="Fruit" data={CHOICE} />
  ));
  fireEvent.click(getByRole('button', { name: 'Dismiss' }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(events.some((e) => e.kind === 'dismiss' && e.cardId === 'ch1')).toBe(true);
  expect(getByRole('group', { name: /Choose: Fruit — dismissed/ })).toBeTruthy();
  expect(queryByText('Apple')).toBeNull();
  fireEvent.click(getByRole('button', { name: 'Reopen' }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(events.some((e) => e.kind === 'reopen' && e.cardId === 'ch1')).toBe(true);
});

const TASKS: TasksCardData = {
  dismissible: true,
  tasks: [{ id: 'a', label: 'Apple' }, { id: 'b', label: 'Banana' }],
};

test('tasks: × emits dismiss + stub; Reopen emits reopen', () => {
  const { host, events } = makeHost();
  const { getByRole, queryByText } = render(() => (
    <TasksCard host={host} cardId="t1" heading="Plan" data={TASKS} />
  ));
  fireEvent.click(getByRole('button', { name: 'Dismiss' }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(events.some((e) => e.kind === 'dismiss' && e.cardId === 't1')).toBe(true);
  expect(getByRole('group', { name: /Tasks: Plan — dismissed/ })).toBeTruthy();
  expect(queryByText('Apple')).toBeNull();
  fireEvent.click(getByRole('button', { name: 'Reopen' }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(events.some((e) => e.kind === 'reopen' && e.cardId === 't1')).toBe(true);
});

const FORM: FormDefinition = {
  type: 'object',
  title: 'Profile',
  'x-kai-dismissible': true,
  properties: { name: { type: 'string', title: 'Name' } },
};

test('form: Dismiss emits dismiss + stub; Reopen emits reopen', () => {
  const { host, events } = makeHost();
  const { getByRole, queryByLabelText } = render(() => (
    <Form host={host} cardId="f1" data={FORM} />
  ));
  fireEvent.click(getByRole('button', { name: 'Dismiss' }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(events.some((e) => e.kind === 'dismiss' && e.cardId === 'f1')).toBe(true);
  expect(getByRole('group', { name: /Form: Profile — dismissed/ })).toBeTruthy();
  expect(queryByLabelText('Name')).toBeNull();
  fireEvent.click(getByRole('button', { name: 'Reopen' }));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(events.some((e) => e.kind === 'reopen' && e.cardId === 'f1')).toBe(true);
});
