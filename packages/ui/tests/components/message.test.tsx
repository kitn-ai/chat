import { describe, it, expect } from 'vitest';
import { render, screen } from '@solidjs/testing-library';
import axe from 'axe-core';
import { Message, MessageAvatar, MessageContent } from '../../src/components/message';

/** Run axe's ARIA-role rules over a subtree and return the violating rule ids
 *  plus the messages, so a failure names what broke instead of just a count. */
async function ariaRoleViolations(node: Element) {
  const results = await axe.run(node as HTMLElement, {
    runOnly: { type: 'rule', values: ['aria-roles', 'aria-allowed-role', 'aria-prohibited-attr'] },
  });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.failureSummary?.trim()).join(' | ')}`);
}

describe('Message', () => {
  it('renders user message', () => {
    render(() => <Message role="user"><MessageContent>Hello world</MessageContent></Message>);
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('renders assistant message with avatar', () => {
    render(() => (
      <Message role="assistant">
        <MessageAvatar fallback="AI" />
        <MessageContent>I can help</MessageContent>
      </Message>
    ));
    expect(screen.getByText('AI')).toBeTruthy();
    expect(screen.getByText('I can help')).toBeTruthy();
  });

  it('renders message with flex layout', () => {
    const { container } = render(() => <Message role="user"><MessageContent>Test</MessageContent></Message>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('flex');
  });

  // --- `role` is the SPEAKER, not an ARIA role ---
  //
  // `MessageProps` used to inherit `role` from JSX.HTMLAttributes and spread it
  // onto the row, so `<Message role="user">` put `role="user"` on a div. That is
  // not a valid ARIA role: a real chromium computes `generic` for it (the token
  // is discarded) and axe reports a CRITICAL `aria-roles` violation, leaving the
  // row with no accessible role and no accessible name.
  describe('role prop / ARIA collision', () => {
    it('never puts the speaker on the DOM as an ARIA role', () => {
      for (const speaker of ['user', 'assistant', 'system'] as const) {
        const { container, unmount } = render(() => (
          <Message role={speaker}><MessageContent>Hi</MessageContent></Message>
        ));
        const row = container.firstChild as HTMLElement;
        expect(row.getAttribute('role')).not.toBe(speaker);
        // The speaker is still readable — as data, where it belongs.
        expect(row.getAttribute('data-role')).toBe(speaker);
        unmount();
      }
    });

    it('exposes a valid ARIA role and an accessible name per speaker', () => {
      const cases = [
        ['user', 'User message'],
        ['assistant', 'Assistant message'],
        ['system', 'System message'],
      ] as const;
      for (const [speaker, label] of cases) {
        const { container, unmount } = render(() => (
          <Message role={speaker}><MessageContent>Hi</MessageContent></Message>
        ));
        const row = container.firstChild as HTMLElement;
        expect(row.getAttribute('role')).toBe('article');
        expect(row.getAttribute('aria-label')).toBe(label);
        unmount();
      }
    });

    // The structural guard: not "is the role the string I hardcoded" but "does a
    // real accessibility auditor accept it". Any future invalid token fails here,
    // not just the three that exist today.
    it('passes axe aria-roles for every speaker', async () => {
      for (const speaker of ['user', 'assistant', 'system'] as const) {
        const { container, unmount } = render(() => (
          <Message role={speaker}><MessageContent>Hi</MessageContent></Message>
        ));
        expect(await ariaRoleViolations(container)).toEqual([]);
        unmount();
      }
    });

    it('leaves a role-less message an unlabelled div, exactly as before', () => {
      const { container } = render(() => <Message><MessageContent>Hi</MessageContent></Message>);
      const row = container.firstChild as HTMLElement;
      expect(row.hasAttribute('role')).toBe(false);
      expect(row.hasAttribute('aria-label')).toBe(false);
      expect(row.hasAttribute('data-role')).toBe(false);
    });

    it('lets a caller override the generated accessible name', () => {
      const { container } = render(() => (
        <Message role="assistant" aria-label="Reply from Ada"><MessageContent>Hi</MessageContent></Message>
      ));
      const row = container.firstChild as HTMLElement;
      expect(row.getAttribute('aria-label')).toBe('Reply from Ada');
      expect(row.getAttribute('role')).toBe('article');
    });
  });
});
