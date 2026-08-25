import { flush } from 'solid-js';
import { render, fireEvent } from '@solidjs/testing-library';
import { Artifact } from '../../src/components/artifact';

afterEach(() => {
  document.body.innerHTML = '';
});

const btn = (root: HTMLElement, label: string) =>
  root.querySelector<HTMLElement>(`[aria-label="${label}"]`);

test('expand button hidden by default, shown when expandable, fires onMaximizeChange', () => {
  const calls: boolean[] = [];
  const { container, unmount } = render(() => (
    <Artifact src="https://x.test" expandable onMaximizeChange={(m) => calls.push(m)} />
  ));
  const b = btn(container, 'Expand')!;
  expect(b).toBeTruthy();
  fireEvent.click(b);
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(calls).toEqual([true]);
  expect(btn(container, 'Collapse')).toBeTruthy(); // toggled label
  unmount();
});

test('expand button is absent without expandable', () => {
  const { container } = render(() => <Artifact src="https://x.test" />);
  expect(btn(container, 'Expand')).toBeNull();
});

test('standalone suppresses the expand button even when expandable', () => {
  const { container } = render(() => <Artifact src="https://x.test" expandable standalone />);
  expect(btn(container, 'Expand')).toBeNull();
});

test('open-in-tab button: hidden by default, shown when openInTab, disabled for blank url', () => {
  const open = vi.fn();
  vi.stubGlobal('open', open);
  const { container } = render(() => <Artifact openInTab />); // no src → about:blank
  const b = btn(container, 'Open in new tab')! as HTMLButtonElement;
  expect(b).toBeTruthy();
  expect(b.disabled).toBe(true);
  vi.unstubAllGlobals();
});

test('open-in-tab calls window.open(url, _blank, noopener,noreferrer)', () => {
  const open = vi.fn();
  vi.stubGlobal('open', open);
  const { container } = render(() => <Artifact src="https://x.test/page" openInTab />);
  fireEvent.click(btn(container, 'Open in new tab')!);
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(open).toHaveBeenCalledWith('https://x.test/page', '_blank', 'noopener,noreferrer');
  vi.unstubAllGlobals();
});

test('no-* flags hide their affordances; all hidden → no toolbar', () => {
  const { container } = render(() => (
    <Artifact
      src="https://x.test"
      showNav={false}
      showReload={false}
      showHome={false}
      showPathField={false}
      showTabs={false}
    />
  ));
  expect(btn(container, 'Back')).toBeNull();
  expect(btn(container, 'Reload')).toBeNull();
  expect(container.querySelector('[role="tablist"]')).toBeNull();
  expect(container.querySelector('input#kai-artifact-path')).toBeNull();
  // showAnyToolbar false → the toolbar bar is omitted entirely.
  expect(container.querySelector('[data-artifact-toolbar]')).toBeNull();
});

test('standalone toggles the root rounded/border chrome', () => {
  const { container: plain } = render(() => <Artifact src="https://x.test" />);
  const { container: solo } = render(() => <Artifact src="https://x.test" standalone />);
  const plainRoot = plain.firstElementChild as HTMLElement;
  const soloRoot = solo.firstElementChild as HTMLElement;
  expect(plainRoot.className).not.toContain('rounded-xl');
  expect(plainRoot.className).not.toContain('border-border');
  expect(soloRoot.className).toContain('rounded-xl');
  expect(soloRoot.className).toContain('border-border');
});

test('readonly-path: input is readonly, submit does not navigate, value still tracks', () => {
  const nav: string[] = [];
  const { container } = render(() => (
    <Artifact src="https://x.test/a" readonlyPath onNavigate={(u) => nav.push(u)} />
  ));
  const input = container.querySelector<HTMLInputElement>('input#kai-artifact-path')!;
  expect(input.readOnly).toBe(true);
  expect(input.getAttribute('aria-readonly')).toBe('true');
  input.value = 'https://x.test/b';
  fireEvent.submit(input.closest('form')!);
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(nav).toEqual([]); // submit is a no-op while read-only
  expect(input.value).toContain('x.test/a'); // still reflects currentUrl
});
