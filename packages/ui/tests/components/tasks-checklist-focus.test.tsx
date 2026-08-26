import { test, expect, afterEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TasksCard } from '../../src/components/tasks-card';
import type { CardEvent, CardHost, CardContext } from '../../src/primitives/card-contract';

afterEach(() => { document.body.innerHTML = ''; });

function makeHost(): CardHost {
  const ctx: CardContext = { theme: { mode: 'light' }, locale: 'en' };
  return { context: () => ctx, emit: (_e: CardEvent) => {} };
}

/** `mode: 'progress'` is the onboarding-checklist presenter (tasks-card.tsx:590). */
const DATA = {
  mode: 'progress' as const,
  heading: 'Getting started',
  tasks: [
    { id: 'a', label: 'Connect a provider', description: 'Pick a model' },
    { id: 'b', label: 'Send a message', description: 'Anything at all' },
  ],
};

/**
 * WHAT jsdom CANNOT DO HERE, stated so this guard is not mistaken for a paint test:
 * jsdom does no layout and does not resolve Tailwind's arbitrary variants, so it can
 * never tell us a ring was PAINTED. What it does do — verified by probe — is evaluate
 * `:focus-visible` and `:has(...)` in `Element.matches()`. So the guard is a pair:
 *   (1) really focus the element the keyboard would land on, and ask the DOM which
 *       focus SELECTOR the row matches as a result — that half is real behaviour;
 *   (2) assert the row carries the Tailwind variant keyed on exactly that selector.
 * The ring's actual pixels are verified by the Chromium keyboard pass, not here.
 *
 * The bug this pins: every incomplete row's only tab stop is an `sr-only` checkbox
 * INSIDE the label, and the label only carried `focus-visible:ring-2`, which matches
 * when the label ITSELF is focused. Tabbing to an unchecked row put focus off-screen
 * with no indicator anywhere.
 */
function ringVariantFor(label: Element): { selfRing: boolean; descendantRing: boolean } {
  const cls = label.className;
  return {
    selfRing: /(^|\s)focus-visible:ring-2(\s|$)/.test(cls),
    descendantRing: /(^|\s)has-\[:focus-visible\]:ring-2(\s|$)/.test(cls),
  };
}

test('every checklist tab stop, checked or not, puts a focus ring on its row', () => {
  const { container } = render(() => <TasksCard host={makeHost()} cardId="t1" data={DATA} />);

  const rows = [...container.querySelectorAll('label[data-task-id]')];
  expect(rows.length).toBe(2);

  // Leave row `a` unchecked and complete row `b`, so both row states are covered:
  // only completed rows get `tabindex` on the label itself.
  const rowB = rows.find((r) => r.getAttribute('data-task-id') === 'b')!;
  (rowB.querySelector('input[type="checkbox"]') as HTMLInputElement).click();

  const stops: { row: Element; el: HTMLElement }[] = [];
  for (const row of container.querySelectorAll('label[data-task-id]')) {
    // Everything the keyboard can reach in this row: the label when it is itself
    // focusable, plus every enabled control inside it.
    if (row.hasAttribute('tabindex')) stops.push({ row, el: row as HTMLElement });
    for (const c of row.querySelectorAll<HTMLInputElement>('input:not([disabled])')) {
      stops.push({ row, el: c });
    }
  }
  // Two rows: the incomplete one contributes its sr-only checkbox; the completed one
  // contributes the label AND its checkbox. If that ever drops to nothing this test
  // would pass vacuously, so assert the count.
  expect(stops.length).toBe(3);

  for (const { row, el } of stops) {
    el.focus();
    expect(document.activeElement).toBe(el);
    const variants = ringVariantFor(row);
    const selfFocused = row.matches(':focus-visible');
    const descendantFocused = row.matches(':has(:focus-visible)');
    // One of the two must be true or the harness is broken, not the component.
    expect(selfFocused || descendantFocused).toBe(true);
    const covered = (selfFocused && variants.selfRing) || (descendantFocused && variants.descendantRing);
    expect(
      covered,
      `focusing <${el.tagName.toLowerCase()}${el.className ? ` class="${el.className}"` : ''}> in row ` +
        `"${row.getAttribute('data-task-id')}" leaves no focus ring: row matched ` +
        `${selfFocused ? ':focus-visible' : ':has(:focus-visible)'} but its class list has ` +
        `${JSON.stringify(variants)}`,
    ).toBe(true);
  }
});

test('the has-[:focus-visible] variant really compiles — it is not a silently-ignored class', () => {
  // A Tailwind variant that does not exist produces NO rule and no error, so the
  // class-token half of the test above would keep passing over a typo. Read the
  // generated sheet and prove the selector is in it.
  // `import.meta.url` is an http:// URL under Vite, so resolve from the package root
  // (vitest runs with cwd = packages/ui) rather than from the module.
  const css = resolve(process.cwd(), 'src/elements/compiled.css');
  if (!existsSync(css)) {
    throw new Error(
      `${css} is missing. It is generated and gitignored — run ` +
        `\`pnpm --filter @kitn.ai/ui run build:css\` before the unit suite.`,
    );
  }
  const sheet = readFileSync(css, 'utf8');
  // Tailwind emits the `has-[:focus-visible]` variant as `&:has(*:focus-visible)`
  // (or `:has(:focus-visible)`) around the ring declarations.
  expect(/:has\(\s*\*?:focus-visible\s*\)/.test(sheet)).toBe(true);
});
