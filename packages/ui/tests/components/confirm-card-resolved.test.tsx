import { flush } from 'solid-js';
import { test, expect, afterEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { ConfirmCard, type ConfirmCardData } from '../../src/components/confirm-card';
import type { CardEvent, CardHost, CardContext } from '../../src/primitives/card-contract';

afterEach(() => { document.body.innerHTML = ''; });

function makeHost(): { host: CardHost; events: CardEvent[] } {
  const events: CardEvent[] = [];
  const ctx: CardContext = { theme: { mode: 'light' }, locale: 'en' };
  return { events, host: { context: () => ctx, emit: (e) => events.push(e) } };
}

const DATA: ConfirmCardData = {
  body: 'Apply 3 migrations?',
  actions: [
    { id: 'approve', label: 'Run migration', style: 'primary' },
    { id: 'reject', label: 'Cancel' },
  ],
};

test('re-hydrated resolution renders read-only with the chosen label, no buttons', () => {
  const { host } = makeHost();
  const { queryByRole, getByText } = render(() => (
    <ConfirmCard host={host} cardId="c1" data={DATA} resolution={{ kind: 'action', action: 'approve' }} />
  ));
  expect(getByText('Run migration')).toBeTruthy();
  expect(queryByRole('button', { name: 'Cancel' })).toBeNull();
});

test('unknown resolved action id falls back to the raw id', () => {
  const { host } = makeHost();
  const { getByText } = render(() => (
    <ConfirmCard host={host} cardId="c1" data={DATA} resolution={{ kind: 'action', action: 'ghost' }} />
  ));
  expect(getByText('ghost')).toBeTruthy();
});

test('re-hydrated render does not emit a new action event', () => {
  const { host, events } = makeHost();
  render(() => (
    <ConfirmCard host={host} cardId="c1" data={DATA} resolution={{ kind: 'action', action: 'approve' }} />
  ));
  expect(events.some((e) => e.kind === 'action')).toBe(false);
});

test('a payload-less action resolves without a payload key (optimistic matches re-hydrated)', () => {
  const { host, events } = makeHost();
  const { getByText } = render(() => (
    <ConfirmCard host={host} cardId="c1" data={{ body: 'ok?', actions: [{ id: 'go', label: 'Go' }] }} />
  ));
  getByText('Go').click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  const a = events.find((e) => e.kind === 'action') as Extract<CardEvent, { kind: 'action' }>;
  expect(a.action).toBe('go');
  expect('payload' in a).toBe(false);
});
