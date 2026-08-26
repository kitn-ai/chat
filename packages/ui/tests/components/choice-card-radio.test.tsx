// tests/components/choice-card-radio.test.tsx
//
// ChoiceCard's rows are REAL `<input type="radio">`s, not `<div role="radio">`s.
//
// This file exists because that migration is exactly the kind of change that can be
// undone by accident: the row still *looks* like a radio either way, every existing
// ChoiceCard test passes against either implementation (they all drive `[role="radio"]`
// and `aria-checked`, which a fake control provides just as happily), and the one thing
// only the native control can do — putting a value into a native form submission — was
// not asserted anywhere. Watched RED against the `<div role="radio">` it replaced:
// four of the six below fail there. The other two — the roving-tabindex/arrow test and
// the click-anywhere test — pass BOTH ways on purpose. They are preservation checks,
// pinning behaviour the hand-rolled row already had correct so the migration cannot
// quietly drop it; they are not evidence that the migration happened.
//
// WHAT jsdom CANNOT SEE, stated so nothing here is mistaken for more than it is:
// jsdom performs no layout and does not adopt `src/elements/compiled.css`, so
// `.kai-radio` is an inert class string here. Nothing in this file pins the control's
// geometry, its drop shadow, its hover halo, the row's inset focus ring, or the
// left-alignment of the control column in PIXELS. The ragged-column fix is therefore
// pinned as DOM ORDER (the control precedes any media), which is the cause; the
// alignment is the effect, and it was measured in a real Chromium instead.
import { render, fireEvent } from '@solidjs/testing-library';
import { ChoiceCard } from '../../src/components/choice-card';
import type { CardEvent, CardHost, CardContext } from '../../src/primitives/card-contract';

afterEach(() => {
  document.body.innerHTML = '';
});

function makeHost(): { host: CardHost; events: CardEvent[] } {
  const events: CardEvent[] = [];
  const ctx: CardContext = { theme: { mode: 'light' }, locale: 'en' };
  return { events, host: { context: () => ctx, emit: (e) => events.push(e) } };
}

const OPTIONS = [
  { id: 'free', label: 'Free', description: 'One workspace.' },
  { id: 'team', label: 'Team', media: { icon: 'TM' } },
  { id: 'legacy', label: 'Legacy', disabled: true },
];

const radios = (c: HTMLElement) => [...c.querySelectorAll<HTMLInputElement>('[role="radio"]')];

test('every row control is a real native radio input sharing one group name', () => {
  const { host } = makeHost();
  const { container } = render(() => (
    <ChoiceCard host={host} cardId="c1" data={{ options: OPTIONS }} />
  ));
  const rs = radios(container);
  expect(rs.length).toBe(3);
  // The selector `choice-card.tsx` and `response-compare.tsx` both drive still matches,
  // and what it matches is now the input itself rather than a div wrapper.
  for (const r of rs) {
    expect(r.tagName).toBe('INPUT');
    expect(r.type).toBe('radio');
  }
  const names = new Set(rs.map((r) => r.name));
  expect(names.size).toBe(1);
  expect([...names][0]).toBeTruthy();
  expect(rs.map((r) => r.value)).toEqual(['free', 'team', 'legacy']);
});

test('the selection reaches a native FormData — the thing the fake control could not do', () => {
  const { host } = makeHost();
  const form = document.createElement('form');
  document.body.appendChild(form);
  render(
    () => <ChoiceCard host={host} cardId="c1" data={{ options: OPTIONS }} />,
    { container: form },
  );
  const rs = radios(form);
  const name = rs[0].name;
  // Nothing selected → the control contributes nothing, exactly like any radio group.
  expect(new FormData(form).get(name)).toBeNull();
  fireEvent.click(rs[1]);
  expect(new FormData(form).get(name)).toBe('team');
  fireEvent.click(rs[0]);
  expect(new FormData(form).get(name)).toBe('free');
});

test('a11y state survives on the control: aria-checked, aria-disabled, aria-describedby', () => {
  const { host } = makeHost();
  const { container } = render(() => (
    <ChoiceCard host={host} cardId="c1" data={{ options: OPTIONS }} />
  ));
  const [free, team, legacy] = radios(container);

  expect(free.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(free);
  expect(free.getAttribute('aria-checked')).toBe('true');
  expect(free.checked).toBe(true);
  expect(team.getAttribute('aria-checked')).toBe('false');

  // A disabled option is inert on BOTH channels: the ARIA one a screen reader reads and
  // the native one that stops the browser checking it.
  expect(legacy.getAttribute('aria-disabled')).toBe('true');
  expect(legacy.disabled).toBe(true);
  expect(legacy.getAttribute('tabindex')).toBe('-1');

  // aria-describedby points at the row's own description element, which must exist.
  const descId = free.getAttribute('aria-describedby');
  expect(descId).toBeTruthy();
  expect(container.querySelector(`#${descId}`)?.textContent).toBe('One workspace.');
  // A row with no description gets no dangling reference.
  expect(team.getAttribute('aria-describedby')).toBeNull();
});

test('roving tabindex: exactly one control is a tab stop, and arrows move it', () => {
  const { host } = makeHost();
  const { container } = render(() => (
    <ChoiceCard host={host} cardId="c1" data={{ options: OPTIONS }} />
  ));
  expect(radios(container).filter((r) => r.tabIndex === 0).length).toBe(1);

  const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
  const [free, team] = radios(container);
  free.focus();
  expect(document.activeElement).toBe(free);
  // ArrowDown moves FOCUS only — it must not select, which is this card's contract
  // (Submit is the commit point) and is NOT what a bare native radio group does. The
  // group handler's preventDefault is the only reason that still holds.
  fireEvent.keyDown(group, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(team);
  expect(team.getAttribute('aria-checked')).toBe('false');
  expect(radios(container).filter((r) => r.tabIndex === 0)).toEqual([team]);
});

test('the control leads the row, ahead of any media — the ragged control column fix', () => {
  const { host } = makeHost();
  const { container } = render(() => (
    <ChoiceCard host={host} cardId="c1" data={{ options: OPTIONS }} />
  ));
  for (const r of radios(container)) {
    const row = r.closest('label')!;
    // First element child of the row, whether or not the option carries an icon badge
    // or a thumbnail. When media came first the control column went ragged between
    // rows that had media and rows that did not.
    expect(row.firstElementChild).toBe(r);
  }
  // Guard the guard: the fixture really does mix media and no-media rows, so this
  // cannot pass vacuously on a list where no row has media.
  const rows = radios(container).map((r) => r.closest('label')!);
  const withMedia = rows.filter((row) => row.querySelector('span[aria-hidden="true"]'));
  expect(withMedia.length).toBe(1);
  expect(withMedia[0].textContent).toContain('Team');
  expect(rows.length - withMedia.length).toBe(2);
});

test('clicking anywhere on the row still selects it', () => {
  const { host } = makeHost();
  const { container, getByText } = render(() => (
    <ChoiceCard host={host} cardId="c1" data={{ options: OPTIONS }} />
  ));
  fireEvent.click(getByText('One workspace.'));
  expect(radios(container)[0].getAttribute('aria-checked')).toBe('true');
});
