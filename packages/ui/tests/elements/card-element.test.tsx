// tests/elements/card-element.test.tsx
import { flush as flushSync } from 'solid-js';
import '../../src/elements/card';

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.querySelectorAll('kai-card').forEach((e) => e.remove());
});

test('kai-card registers', () => {
  expect(customElements.get('kai-card')).toBeTruthy();
});

test('projects default-slot body and applies the appearance surface', async () => {
  const el = document.createElement('kai-card');
  el.setAttribute('appearance', 'filled');
  el.innerHTML = '<p data-testid="body">the body</p>';
  document.body.appendChild(el);
  await flush();
  const root = el.shadowRoot!;
  // The default slot exists so light-DOM body projects, and gets a part="body".
  expect(root.querySelector('slot:not([name])')).toBeTruthy();
  expect(root.querySelector('[part="body"]')).toBeTruthy();
  expect((root.querySelector('[part="card"]') as HTMLElement).className).toContain('bg-surface-strong');
});

test('renders a structural region slot only when that slot is filled', async () => {
  const el = document.createElement('kai-card');
  el.innerHTML = '<img slot="media" alt="m" /><h3 slot="header">Title</h3>body';
  document.body.appendChild(el);
  await flush();
  const root = el.shadowRoot!;
  // media + header are projected; footer was never filled, so no footer slot/region.
  expect(root.querySelector('slot[name="media"]')).toBeTruthy();
  expect(root.querySelector('[part="header"]')).toBeTruthy();
  expect(root.querySelector('slot[name="header"]')).toBeTruthy();
  expect(root.querySelector('slot[name="footer"]')).toBeNull();
  expect(root.querySelector('[part="footer"]')).toBeNull();
});

test('an empty card renders no body/media/header regions', async () => {
  const el = document.createElement('kai-card');
  document.body.appendChild(el);
  await flush();
  const root = el.shadowRoot!;
  expect(root.querySelector('[part="body"]')).toBeNull();
  expect(root.querySelector('[part="media"]')).toBeNull();
  expect(root.querySelector('[part="header"]')).toBeNull();
});

test('dismissible renders a dismiss part, hides the card, and fires kai-dismiss', async () => {
  const el = document.createElement('kai-card');
  el.setAttribute('dismissible', '');
  el.innerHTML = 'body';
  let fired = false;
  el.addEventListener('kai-dismiss', () => (fired = true));
  document.body.appendChild(el);
  await flush();
  const root = el.shadowRoot!;
  const x = root.querySelector('[part="dismiss"]') as HTMLElement;
  expect(x).toBeTruthy();
  x.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();
  expect(fired).toBe(true);
  expect(root.querySelector('[part="card"]')).toBeNull();
});

test('clickable makes the card a role=button that fires kai-card-click', async () => {
  const el = document.createElement('kai-card');
  el.setAttribute('clickable', '');
  el.innerHTML = 'body';
  let fired = false;
  el.addEventListener('kai-card-click', () => (fired = true));
  document.body.appendChild(el);
  await flush();
  const root = el.shadowRoot!;
  const card = root.querySelector('[part="card"]') as HTMLElement;
  expect(card.getAttribute('role')).toBe('button');
  card.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(fired).toBe(true);
});
