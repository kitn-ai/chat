import { flush } from 'solid-js';
import '../../src/elements/kbd';

test('kai-kbd renders normalized glyphs for keys + platform', async () => {
  const el = document.createElement('kai-kbd');
  el.setAttribute('keys', 'Mod+Shift+ArrowUp');
  el.setAttribute('platform', 'mac');
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const caps = Array.from(el.shadowRoot!.querySelectorAll('[part="key"]')).map((c) => c.textContent);
  expect(caps).toEqual(['⌘', '⇧', '↑']);
  // Each cap is one token; the separators carry no text, so the combo reads ⌘⇧↑.
  expect(caps.join('')).toBe('⌘⇧↑');

  el.remove();
});

test('kai-kbd maps Mod to Ctrl off mac', async () => {
  const el = document.createElement('kai-kbd');
  el.setAttribute('keys', 'Mod+K');
  el.setAttribute('platform', 'other');
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  const caps = Array.from(el.shadowRoot!.querySelectorAll('[part="key"]')).map((c) => c.textContent);
  expect(caps).toEqual(['Ctrl', 'K']);

  el.remove();
});
