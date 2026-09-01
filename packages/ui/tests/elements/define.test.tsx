import { createSignal } from 'solid-js';
import { defineWebComponent } from '../../src/elements/define';

test('registers a custom element that renders content and CSS into its shadow root', async () => {
  defineWebComponent('kitn-test-el', { label: 'hi' }, (props, { dispatch }) => {
    return <button onClick={() => dispatch('pressed', { label: props.label })}>{props.label}</button>;
  });

  const el = document.createElement('kitn-test-el') as HTMLElement & { label: string };
  document.body.appendChild(el);
  await Promise.resolve();

  expect(el.shadowRoot).toBeTruthy();
  expect(el.shadowRoot!.querySelector('style')).toBeTruthy();
  expect(el.shadowRoot!.textContent).toContain('hi');

  let detail: any = null;
  el.addEventListener('pressed', (e) => (detail = (e as CustomEvent).detail));
  el.shadowRoot!.querySelector('button')!.click();
  expect(detail).toEqual({ label: 'hi' });

  el.remove();
});

test('defining the same tag twice is a no-op (idempotent)', () => {
  defineWebComponent('kitn-test-el2', {}, () => <span>a</span>);
  expect(() => defineWebComponent('kitn-test-el2', {}, () => <span>b</span>)).not.toThrow();
});

// The kai-view-stack bug, pinned at the seam it came from: define.tsx used to
// invoke facade bodies inside a tracked children thunk, so a bare `props.x`
// read at body top level (seeding a signal, creating a controller) subscribed
// the WHOLE body — and any later change to that prop silently re-ran it,
// recreating every piece of facade state. Facades run ONCE; reactivity flows
// through the JSX they return, exactly like a Solid component under
// createComponent's untrack.
test('facade bodies run once even when a top-level prop read later changes', async () => {
  let bodyRuns = 0;
  defineWebComponent<{ value?: string }>('kitn-test-el-untracked', { value: 'seed' }, (props) => {
    bodyRuns++;
    // The hazard pattern verbatim: a bare tracked-context read feeding one-time init.
    const [initial] = createSignal(props.value);
    return (
      <span>
        {initial()}:{props.value}
      </span>
    );
  });

  const el = document.createElement('kitn-test-el-untracked') as HTMLElement & { value: string };
  document.body.appendChild(el);
  await Promise.resolve();
  expect(bodyRuns).toBe(1);
  expect(el.shadowRoot!.textContent).toContain('seed:seed');

  el.value = 'next';
  await Promise.resolve();
  // The body did NOT re-run (the signal seed stays 'seed')...
  expect(bodyRuns).toBe(1);
  // ...while the JSX's own reactive read still updated.
  expect(el.shadowRoot!.textContent).toContain('seed:next');

  el.remove();
});
