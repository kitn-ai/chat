/**
 * The autoloader and `<template>` content.
 *
 * A generated block page ships its repeated row markup inside a
 * `<template>` (the binder clones it once per row), and the elements in that
 * template are the ONLY occurrence of their tag on the page. `querySelectorAll`
 * does not descend into a template's content -- the children live on the
 * element's `.content` DocumentFragment, not in the tree -- so the autoloader
 * never saw them and never registered them.
 *
 * That is a deadlock, not a slow path: the generated binder awaits
 * `customElements.whenDefined` for every tag the page uses BEFORE its first
 * apply, and the first apply is what clones a row into the live DOM where the
 * MutationObserver would have caught it. Observed live: the support-widget
 * driver page hung for 15s with `kai-conversation-item` undefined, no console
 * error and no failed request.
 */
import { describe, expect, it } from 'vitest';
import { undefinedAutoloadableTags } from './autoloader';

const html = (markup: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host;
};

describe('the autoloader tag scan', () => {
  it('finds a tag that appears ONLY inside a <template>', () => {
    const root = html('<template><kai-conversation-item></kai-conversation-item></template>');
    expect(undefinedAutoloadableTags(root)).toContain('kai-conversation-item');
  });

  it('still finds the tags in the live tree, and the root element itself', () => {
    const root = html('<kai-panel><kai-button></kai-button></kai-panel>');
    const panel = root.firstElementChild as HTMLElement;
    expect(undefinedAutoloadableTags(panel).sort()).toEqual(['kai-button', 'kai-panel']);
  });

  it('descends into a template nested inside the live tree, at any depth', () => {
    const root = html('<kai-conversations><template><kai-conversation-item></kai-conversation-item></template></kai-conversations>');
    expect(undefinedAutoloadableTags(root).sort()).toEqual(['kai-conversation-item', 'kai-conversations']);
  });

  it('ignores tags the manifest does not know', () => {
    const root = html('<template><not-a-kai-element></not-a-kai-element></template>');
    expect(undefinedAutoloadableTags(root)).toEqual([]);
  });
});
