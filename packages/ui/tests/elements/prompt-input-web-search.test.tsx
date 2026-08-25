/**
 * The composer's web-search Globe toggle, post-rename (spec § 2b): prop
 * `webSearch` (attribute `web-search`), event `kai-web-search` — on BOTH
 * `<kai-prompt-input>` and `<kai-chat>`. The old `search` / `kai-search` names
 * now belong exclusively to the `<kai-search>` filter field and conversation
 * filtering; the composer no longer answers to them (feat!, no alias).
 */
import { flush as flushSync } from 'solid-js';
import '../../src/elements/prompt-input';
import '../../src/elements/chat';

const flush = () => new Promise((r) => setTimeout(r, 0));

const globeButton = (el: HTMLElement) =>
  el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Search the web"]');

test('kai-prompt-input: the web-search attribute shows the Globe button', async () => {
  const el = document.createElement('kai-prompt-input');
  document.body.appendChild(el);
  await flush();
  expect(globeButton(el)).toBeNull();

  el.setAttribute('web-search', '');
  await flush();
  expect(globeButton(el)).toBeTruthy();

  el.remove();
});

test('kai-prompt-input: clicking the Globe dispatches kai-web-search (and not kai-search)', async () => {
  const el = document.createElement('kai-prompt-input');
  el.setAttribute('web-search', '');
  document.body.appendChild(el);
  await flush();

  let webSearch = 0;
  let oldName = 0;
  el.addEventListener('kai-web-search', () => webSearch++);
  el.addEventListener('kai-search', () => oldName++);
  globeButton(el)!.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();

  expect(webSearch).toBe(1);
  expect(oldName).toBe(0);
  el.remove();
});

test('kai-prompt-input: the OLD search attribute no longer shows the Globe (feat!, no alias)', async () => {
  const el = document.createElement('kai-prompt-input');
  el.setAttribute('search', '');
  document.body.appendChild(el);
  await flush();
  expect(globeButton(el)).toBeNull();
  el.remove();
});

test('kai-chat: web-search shows the Globe and it dispatches kai-web-search', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { messages: unknown[] };
  el.messages = [];
  el.setAttribute('web-search', '');
  document.body.appendChild(el);
  await flush();

  const globe = globeButton(el);
  expect(globe).toBeTruthy();

  let webSearch = 0;
  let oldName = 0;
  el.addEventListener('kai-web-search', () => webSearch++);
  el.addEventListener('kai-search', () => oldName++);
  globe!.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();

  expect(webSearch).toBe(1);
  expect(oldName).toBe(0);
  el.remove();
});
