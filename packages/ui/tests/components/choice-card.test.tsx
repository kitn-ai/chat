// tests/components/choice-card.test.tsx
// Native Solid host path for ChoiceCard: a `host` prop's emit is called (not the
// CustomEvent). Select a row then Submit to emit `action` (id + payload), single-shot,
// empty → error, and the unified allowOther flow emits `__other__` with the typed text.
import { flush } from 'solid-js';
import { render, fireEvent } from '@solidjs/testing-library';
import { ChoiceCard } from '../../src/components/choice-card';
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

const action = (events: CardEvent[]) =>
  events.find((e) => e.kind === 'action') as Extract<CardEvent, { kind: 'action' }> | undefined;

test('ChoiceCard emits `ready` on mount', () => {
  const { host, events } = makeHost();
  render(() => (
    <ChoiceCard host={host} cardId="c1" data={{ options: [{ id: 'a', label: 'A' }] }} />
  ));
  expect(events.some((e) => e.kind === 'ready' && e.cardId === 'c1')).toBe(true);
});

test('select a row then Submit emits `action` with id + echoed payload', () => {
  const { host, events } = makeHost();
  const { getByText } = render(() => (
    <ChoiceCard
      host={host}
      cardId="c1"
      data={{
        options: [
          { id: 'free', label: 'Free' },
          { id: 'pro', label: 'Pro', payload: { plan: 'pro' } },
        ],
      }}
    />
  ));
  // Selecting a row alone does not emit.
  fireEvent.click(getByText('Pro'));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(action(events)).toBeUndefined();
  fireEvent.click(getByText('Submit'));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  const a = action(events);
  expect(a?.action).toBe('pro');
  expect(a?.payload).toEqual({ plan: 'pro' });
});

test('single-shot: after Submit there is no radiogroup; cannot re-emit', () => {
  const { host, events } = makeHost();
  const { getByText, queryByRole, queryByText } = render(() => (
    <ChoiceCard
      host={host}
      cardId="c1"
      data={{ options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }}
    />
  ));
  fireEvent.click(getByText('A'));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  fireEvent.click(getByText('Submit'));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  // After Submit the radiogroup + Submit are replaced by the read-only resolved view.
  expect(queryByRole('radiogroup')).toBeNull();
  expect(queryByText('Submit')).toBeNull();
  expect(events.filter((e) => e.kind === 'action').length).toBe(1);
  expect(action(events)?.action).toBe('a');
});

test('Submit stays disabled until a selectable row is selected; disabled rows cannot be selected', () => {
  const { host, events } = makeHost();
  const { getByText } = render(() => (
    <ChoiceCard
      host={host}
      cardId="c1"
      data={{ options: [{ id: 'a', label: 'A', disabled: true }, { id: 'b', label: 'B' }] }}
    />
  ));
  const submit = getByText('Submit') as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  // Clicking the disabled row does not select it; Submit stays disabled.
  fireEvent.click(getByText('A'));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(submit.disabled).toBe(true);
  fireEvent.click(getByText('B'));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(action(events)?.action).toBe('b');
});

test('empty options → inline error state + `error` event; no radios', () => {
  const { host, events } = makeHost();
  const { container } = render(() => (
    <ChoiceCard host={host} cardId="bad" data={{ options: [] }} />
  ));
  expect(container.querySelector('[role="alert"]')).toBeTruthy();
  expect(container.querySelector('[role="radio"]')).toBeNull();
  expect(events.some((e) => e.kind === 'error' && e.cardId === 'bad')).toBe(true);
});

test('allowOther: select Other reveals input; the one Submit emits __other__ with text', () => {
  const { host, events } = makeHost();
  const { getByText, getByLabelText, queryByLabelText } = render(() => (
    <ChoiceCard
      host={host}
      cardId="c1"
      data={{ options: [{ id: 'a', label: 'A' }], allowOther: { label: 'Other…' } }}
    />
  ));
  const submit = getByText('Submit') as HTMLButtonElement;
  // Before selecting Other: no input, Submit disabled.
  expect(queryByLabelText('Other…')).toBeNull();
  expect(submit.disabled).toBe(true);

  // Selecting Other reveals the input but does not emit; Submit still disabled (empty).
  fireEvent.click(getByText('Other…'));
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(action(events)).toBeUndefined();
  expect(submit.disabled).toBe(true);

  const input = getByLabelText('Other…') as HTMLInputElement;
  fireEvent.input(input, { target: { value: 'My custom answer' } });
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const a = action(events);
  expect(a?.action).toBe('__other__');
  expect(a?.payload).toEqual({ text: 'My custom answer' });
});
