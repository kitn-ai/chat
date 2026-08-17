import { beforeEach, describe, expect, it } from 'vitest';
import { defineKaiDevtools, KaiDevtoolsElement } from './panel';

beforeEach(() => {
  document.body.innerHTML = '';
  defineKaiDevtools();
});

function mount(): KaiDevtoolsElement {
  const el = document.createElement('kai-devtools') as KaiDevtoolsElement;
  document.body.appendChild(el);
  return el;
}

describe('the collapse control', () => {
  it('updates its own label immediately, with no events flowing', () => {
    // The label used to be one render behind: the click handler toggled the
    // attribute and nothing re-rendered, so a collapsed panel's ONLY control
    // still read "hide" until unrelated traffic happened to repair it. A panel
    // that shows no events is exactly when nothing repairs it.
    const el = mount();
    const label = () => el.shadowRoot!.querySelector('button.toggle')!.textContent;
    const header = () => el.shadowRoot!.querySelector('header') as HTMLElement;

    expect(label()).toBe('hide');

    header().click();
    expect(el.hasAttribute('collapsed')).toBe(true);
    expect(label()).toBe('show');

    header().click();
    expect(el.hasAttribute('collapsed')).toBe(false);
    expect(label()).toBe('hide');
  });
});
