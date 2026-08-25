import { flush } from 'solid-js';
import { defineWebComponent } from '../../src/elements/define';

test('registers a custom element that renders content and CSS into its shadow root', async () => {
  defineWebComponent('kitn-test-el', { label: 'hi' }, (props, { dispatch }) => {
    return <button onClick={() => dispatch('pressed', { label: props.label })}>{props.label}</button>;
  });

  const el = document.createElement('kitn-test-el') as HTMLElement & { label: string };
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(el.shadowRoot).toBeTruthy();
  expect(el.shadowRoot!.querySelector('style')).toBeTruthy();
  expect(el.shadowRoot!.textContent).toContain('hi');

  let detail: any = null;
  el.addEventListener('pressed', (e) => (detail = (e as CustomEvent).detail));
  el.shadowRoot!.querySelector('button')!.click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(detail).toEqual({ label: 'hi' });

  el.remove();
});

test('defining the same tag twice is a no-op (idempotent)', () => {
  defineWebComponent('kitn-test-el2', {}, () => <span>a</span>);
  expect(() => defineWebComponent('kitn-test-el2', {}, () => <span>b</span>)).not.toThrow();
});
