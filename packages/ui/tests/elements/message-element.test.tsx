// tests/elements/message-element.test.tsx
//
// `<kai-message role="user">` — `role` names the SPEAKER, and is the documented
// attribute, but it is also the global ARIA `role` attribute and neither speaker
// is a valid ARIA role. Left on the host it is a CRITICAL axe `aria-roles`
// violation; chromium discards the unknown token and computes `generic`, so the
// row ends up with no accessible role and no accessible name at all rather than a
// mis-announced one. Measured in a real chromium before the fix:
//
//   <kai-message id="late-attr-user" role="user">
//   host AX role: "generic"   host AX name: ""
//   row role: null            row aria-label: null
//   axe aria-roles, impact CRITICAL:
//     "Role must be one of the valid ARIA roles: user"
//
// After: the host carries no `role`, `el.role` still reads the speaker, and the
// row inside the shadow root is `role="article"` + `aria-label="User message"`
// (AX role "article", AX name "User message"), axe 0 violations.
//
// NOT COVERED HERE, and not fixable from this facade: an element authored in HTML
// and upgraded at registration time loses the attribute in the custom-element
// CONSTRUCTOR, before any facade code runs, because `defineWebComponent` installs
// its non-reflecting `role` accessor AFTER `customElements.define()`. That is a
// defect in src/elements/define.tsx. Every test below therefore builds its element
// with `document.createElement`, which is the state of the world after upgrade.
import '../../src/elements/message';
import axe from 'axe-core';
import type { ChatMessage } from '../../src/elements/chat-types';

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.querySelectorAll('kai-message').forEach((e) => e.remove());
});

type RoleEl = HTMLElement & { role?: string | null; message?: ChatMessage };

async function mount(setup: (el: RoleEl) => void = () => {}): Promise<RoleEl> {
  const el = document.createElement('kai-message') as RoleEl;
  setup(el);
  document.body.appendChild(el);
  await flush();
  return el;
}

const rowOf = (el: RoleEl): HTMLElement =>
  el.shadowRoot!.querySelector('[part="row"]') as HTMLElement;

/** Run axe's ARIA-role rules over a subtree and return the violating rule ids plus
 *  the messages, so a failure names what broke instead of just a count. Asserting
 *  through axe rather than against a hardcoded string means ANY future invalid
 *  token fails here, not only the two speakers that exist today. */
async function ariaRoleViolations(node: Element): Promise<string[]> {
  const results = await axe.run(node as HTMLElement, {
    runOnly: {
      type: 'rule',
      values: ['aria-roles', 'aria-allowed-role', 'aria-prohibited-attr', 'aria-valid-attr-value'],
    },
  });
  return results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.failureSummary?.trim()).join(' | ')}`,
  );
}

test('kai-message registers', () => {
  expect(customElements.get('kai-message')).toBeTruthy();
});

describe('role attribute / ARIA collision', () => {
  // The structural guard: not "is the role the string I hardcoded" but "does a real
  // accessibility auditor accept this element". This is the one that reproduced the
  // browser's exact message, "Role must be one of the valid ARIA roles: user".
  test('passes axe aria-roles for every speaker', async () => {
    for (const speaker of ['user', 'assistant'] as const) {
      const el = await mount((e) => e.setAttribute('role', speaker));
      expect(await ariaRoleViolations(el)).toEqual([]);
      el.remove();
    }
  });

  test('never leaves the speaker on the host as an ARIA role, and does not lose it', async () => {
    for (const speaker of ['user', 'assistant'] as const) {
      const el = await mount((e) => e.setAttribute('role', speaker));
      // Off the DOM...
      expect(el.getAttribute('role')).toBeNull();
      // ...but NOT discarded. Both halves matter: an implementation that simply
      // deleted the attribute would satisfy the first assertion while silently
      // rendering every message as the default speaker.
      expect(el.role).toBe(speaker);
      expect(rowOf(el).getAttribute('data-role')).toBe(speaker);
      el.remove();
    }
  });

  test('gives the row a valid ARIA role and an accessible name per speaker', async () => {
    const cases = [
      ['user', 'User message'],
      ['assistant', 'Assistant message'],
    ] as const;
    for (const [speaker, label] of cases) {
      const el = await mount((e) => e.setAttribute('role', speaker));
      const row = rowOf(el);
      expect(row.getAttribute('role')).toBe('article');
      expect(row.getAttribute('aria-label')).toBe(label);
      el.remove();
    }
  });

  test('the speaker still drives the layout after being lifted off the host', async () => {
    const user = await mount((e) => e.setAttribute('role', 'user'));
    expect(rowOf(user).className).toContain('items-end');
    user.remove();
    const assistant = await mount((e) => e.setAttribute('role', 'assistant'));
    expect(rowOf(assistant).className).toContain('items-start');
  });

  test('lifts a role set as a property, the framework-ref path', async () => {
    const el = await mount((e) => { e.role = 'user'; });
    expect(el.getAttribute('role')).toBeNull();
    expect(el.role).toBe('user');
    expect(rowOf(el).getAttribute('aria-label')).toBe('User message');
    expect(await ariaRoleViolations(el)).toEqual([]);
  });

  test('lifts a role set AFTER the element is already live', async () => {
    const el = await mount();
    el.setAttribute('role', 'user');
    await flush();
    await flush();
    expect(el.getAttribute('role')).toBeNull();
    expect(el.role).toBe('user');
    expect(rowOf(el).getAttribute('aria-label')).toBe('User message');
    expect(await ariaRoleViolations(el)).toEqual([]);
  });

  test('names the row from the message object when no role attribute is used', async () => {
    const el = await mount((e) => {
      e.message = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] };
    });
    expect(el.getAttribute('role')).toBeNull();
    const row = rowOf(el);
    expect(row.getAttribute('role')).toBe('article');
    expect(row.getAttribute('aria-label')).toBe('User message');
  });
});
