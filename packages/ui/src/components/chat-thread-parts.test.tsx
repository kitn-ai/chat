/**
 * P-9 (blocks-and-parts, 2026-08-31): `ChatThread` — the `<kai-chat>`
 * facade's interior — is a thin preset over the public parts. These tests pin
 * the STRUCTURAL half of that ruling:
 *
 * 1. Grep-level source assertions (required by the plan's Task 2.2): the
 *    conversation lifecycle policy is IMPORTED from the shipped controller
 *    (`src/stores/conversation-controller`), never reimplemented — the
 *    drift-prone glue (hand-rolled save effects, a private seen rule, the
 *    `suppressNextSave` dance around a hand-written save path) must not
 *    reappear here. Same for the view navigator and the panel chrome.
 * 2. Behavioral pins for the P-6 `home` region slot (replace mode) and for
 *    the chrome actually rendering through the parts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, cleanup } from '@solidjs/testing-library';
import { ChatThread } from './chat-thread';

if (!Element.prototype.scrollTo) (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(HERE, 'chat-thread.tsx'), 'utf8');

describe('P-9 grep-level assertions over chat-thread.tsx', () => {
  it('imports the conversation policy from the shipped controller (P-5)', () => {
    expect(source).toMatch(/import \{[^}]*createConversationController[^}]*\} from '\.\.\/stores\/conversation-controller'/);
    expect(source).toContain('createConversationController(');
  });

  it('does not reimplement the controller policy locally', () => {
    // The pre-refactor implementation's own store calls and derivations. Any
    // of these reappearing means the policy forked back into the facade.
    expect(source).not.toContain('suppressNextSave');
    expect(source).not.toContain('store!.save(');
    expect(source).not.toContain('store!.list(');
    expect(source).not.toContain('store!.load(');
    // Call forms only: the `hostOpen` prop doc legitimately NAMES
    // `store.markRead` while describing the seen rule.
    expect(source).not.toContain('markRead?.(');
    expect(source).not.toContain('markRead!(');
    expect(source).not.toContain('markRead(');
    expect(source).not.toContain('crypto.randomUUID');
    expect(source).not.toContain('isConversationUnread');
  });

  it('routes views through the shipped navigator (P-3), not a private view signal', () => {
    expect(source).toMatch(/import \{[^}]*createViewStack[^}]*\} from '\.\/view-stack'/);
    expect(source).toContain('createViewStack(');
    // The old grammar's private state.
    expect(source).not.toContain('chatEntry');
    expect(source).not.toContain("createSignal<WidgetView>");
  });

  it('renders its chrome through the Panel family (P-1)', () => {
    expect(source).toMatch(/import \{[^}]*Panel[^}]*\} from '\.\/panel'/);
    for (const tag of ['<Panel', '<PanelHeader', '<PanelBody', '<PanelFooter']) {
      expect(source).toContain(tag);
    }
  });
});

describe('the chrome renders through the parts', () => {
  it('the built-in header is the PanelHeader box (part="header-bar", start/end regions)', () => {
    const { container } = render(() => <ChatThread messages={[]} chatTitle="Assistant" />);
    const header = container.querySelector('header[part="header-bar"]');
    expect(header).toBeTruthy();
    expect(header!.querySelector('[part="start"]')).toBeTruthy();
    expect(header!.querySelector('[part="end"]')).toBeTruthy();
    expect(header!.querySelector('[part="title"]')!.textContent).toBe('Assistant');
  });

  it('the widget tab bar dot is the shared tab-bar part mark (both hook names)', () => {
    const { container } = render(() => <ChatThread messages={[]} home={{}} onSubmit={() => {}} />);
    // No unread yet: the bar renders, no dot.
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
    expect(container.querySelector('[data-kai-tab-dot]')).toBeNull();
  });
});

describe('P-6 region slot: home (replace)', () => {
  it('homeFull stands the slot in for the built-in HomePanel', () => {
    const { container } = render(() => <ChatThread messages={[]} home={{}} homeFull onSubmit={() => {}} />);
    expect(container.querySelector('slot[name="home"]')).toBeTruthy();
    expect(container.querySelector('[data-kai-home-panel]')).toBeNull();
    // Navigation chrome stays built in around the replaced content.
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
  });

  it('absent homeFull changes nothing: the built-in home screen renders', () => {
    const { container } = render(() => <ChatThread messages={[]} home={{}} onSubmit={() => {}} />);
    expect(container.querySelector('slot[name="home"]')).toBeNull();
    expect(container.querySelector('[data-kai-home-panel]')).toBeTruthy();
  });
});
