// tests/components/cards-host-path.test.tsx
// Native Solid host path: a `host` prop's emit is called (not the CustomEvent).
import { flush } from 'solid-js';
import { render, fireEvent } from '@solidjs/testing-library';
import { ConfirmCard } from '../../src/components/confirm-card';
import { TasksCard } from '../../src/components/tasks-card';
import type { CardEvent, CardHost, CardContext } from '../../src/primitives/card-contract';

afterEach(() => {
  document.body.innerHTML = '';
});

function makeHost(): { host: CardHost; events: CardEvent[] } {
  const events: CardEvent[] = [];
  const ctx: CardContext = { theme: { mode: 'light' }, locale: 'en' };
  return {
    events,
    host: { context: () => ctx, emit: (e) => events.push(e) },
  };
}

test('ConfirmCard calls host.emit (action) — no CustomEvent', () => {
  const { host, events } = makeHost();
  const { getByText } = render(() => (
    <ConfirmCard
      host={host}
      cardId="c1"
      data={{ actions: [{ id: 'ok', label: 'OK', default: true }] }}
    />
  ));
  expect(events.some((e) => e.kind === 'ready' && e.cardId === 'c1')).toBe(true);
  fireEvent.click(getByText('OK'));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  const action = events.find((e) => e.kind === 'action') as Extract<CardEvent, { kind: 'action' }>;
  expect(action.action).toBe('ok');
});

test('TasksCard calls host.emit (submit) — no CustomEvent', () => {
  const { host, events } = makeHost();
  const { getByText } = render(() => (
    <TasksCard
      host={host}
      cardId="t1"
      data={{ tasks: [{ id: 'a', label: 'A', checked: true }], confirmLabel: 'Go' }}
    />
  ));
  expect(events.some((e) => e.kind === 'ready' && e.cardId === 't1')).toBe(true);
  fireEvent.click(getByText('Go'));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  const submit = events.find((e) => e.kind === 'submit') as Extract<
    CardEvent,
    { kind: 'submit' }
  >;
  expect(submit.data).toEqual({ selected: ['a'] });
});
