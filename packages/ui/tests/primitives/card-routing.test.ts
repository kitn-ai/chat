// tests/primitives/card-routing.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  CARD_EVENT_NAME,
  emitCardEvent,
  routeCardEvent,
  listenForCardEvents,
  isSafeUrl,
  isScriptUrl,
} from '../../src/primitives/card-routing';
import type { CardPolicy } from '../../src/primitives/card-contract';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

test('emitCardEvent dispatches a bubbling, composed kai-card event', () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const seen = vi.fn();
  document.addEventListener(CARD_EVENT_NAME, (e) => seen((e as CustomEvent).detail));
  emitCardEvent(el, { kind: 'ready', cardId: 'c1' });
  expect(seen).toHaveBeenCalledWith({ kind: 'ready', cardId: 'c1' });
});

test('routeCardEvent dispatches verbs to handlers', () => {
  const policy: CardPolicy = { onSubmit: vi.fn(), onAction: vi.fn() };
  routeCardEvent(policy, { kind: 'submit', cardId: 'c1', data: { a: 1 } });
  expect(policy.onSubmit).toHaveBeenCalledWith('c1', { a: 1 });
  routeCardEvent(policy, { kind: 'action', cardId: 'c1', action: 'approve', payload: 7 });
  expect(policy.onAction).toHaveBeenCalledWith('c1', 'approve', 7);
});

test('send-prompt downgrades send→compose unless opted in', () => {
  const onSendPrompt = vi.fn();
  routeCardEvent({ onSendPrompt }, { kind: 'send-prompt', cardId: 'c1', text: 'hi', mode: 'send' });
  expect(onSendPrompt).toHaveBeenCalledWith('hi', { mode: 'compose', context: undefined });
  onSendPrompt.mockClear();
  routeCardEvent({ onSendPrompt, maxSendPromptMode: 'send' }, { kind: 'send-prompt', cardId: 'c1', text: 'hi', mode: 'send' });
  expect(onSendPrompt).toHaveBeenCalledWith('hi', { mode: 'send', context: undefined });
});

test('open rejects unsafe schemes and surfaces an error', () => {
  const onOpen = vi.fn(); const onError = vi.fn();
  routeCardEvent({ onOpen, onError }, { kind: 'open', cardId: 'c1', url: 'javascript:alert(1)' });
  expect(onOpen).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalled();
  routeCardEvent({ onOpen, onError }, { kind: 'open', cardId: 'c1', url: 'https://x.com', target: 'tab' });
  expect(onOpen).toHaveBeenCalledWith('https://x.com', 'tab');
});

// `isSafeUrl` is reused by the markdown renderer and the artifact viewer, so
// its exact behaviour is a contract three call sites depend on. Pinned here
// because it was refactored to share one parse with `isScriptUrl`.
describe('isSafeUrl', () => {
  test('passes the three safe schemes', () => {
    expect(isSafeUrl('https://x.test/a')).toBe(true);
    expect(isSafeUrl('http://x.test/a')).toBe(true);
    expect(isSafeUrl('mailto:a@b.test')).toBe(true);
  });

  test('passes relative, absolute-path and fragment urls (they inherit the base)', () => {
    // Load-bearing for markdown body links AND for artifact files with no
    // `src` to resolve against, which yield a bare `path`.
    expect(isSafeUrl('docs/report.pdf')).toBe(true);
    expect(isSafeUrl('/docs/guide')).toBe(true);
    expect(isSafeUrl('#section')).toBe(true);
    expect(isSafeUrl('./rel')).toBe(true);
  });

  test('rejects the executable and inline-document schemes', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('blob:https://x.test/uuid')).toBe(false);
  });

  test('sees through case, padding and embedded whitespace', () => {
    expect(isSafeUrl('JaVaScRiPt:alert(1)')).toBe(false);
    expect(isSafeUrl('  javascript:alert(1)  ')).toBe(false);
    // The URL parser strips embedded tabs/newlines, so this IS `javascript:`.
    expect(isSafeUrl('java\nscript:alert(1)')).toBe(false);
    expect(isSafeUrl('java\tscript:alert(1)')).toBe(false);
  });
});

// The narrower question, for the ONE sink where the allowlist is wrong: an
// `<iframe src>` legitimately takes `data:`/`blob:` (opaque origin, cannot
// reach the host page), so only the schemes that execute in the EMBEDDER's
// origin are refused there.
describe('isScriptUrl', () => {
  test('is true for exactly the schemes that execute in the caller origin', () => {
    expect(isScriptUrl('javascript:alert(1)')).toBe(true);
    expect(isScriptUrl('JaVaScRiPt:alert(1)')).toBe(true);
    expect(isScriptUrl('  javascript:alert(1)  ')).toBe(true);
    expect(isScriptUrl('java\nscript:alert(1)')).toBe(true);
    expect(isScriptUrl('vbscript:msgbox(1)')).toBe(true);
  });

  test('is false for everything an iframe may legitimately frame', () => {
    expect(isScriptUrl('https://x.test/a')).toBe(false);
    expect(isScriptUrl('data:text/html,<p>hi</p>')).toBe(false);
    expect(isScriptUrl('blob:https://x.test/uuid')).toBe(false);
    expect(isScriptUrl('about:blank')).toBe(false);
    expect(isScriptUrl('docs/index.html')).toBe(false);
    expect(isScriptUrl('')).toBe(false);
  });

  test('is strictly narrower than !isSafeUrl, never wider', () => {
    // If this ever inverts, the iframe guard has quietly become an allowlist
    // (or the allowlist has quietly started letting script through).
    for (const u of ['javascript:x', 'vbscript:x', 'data:text/html,x', 'blob:https://x/y', 'https://x', '#a']) {
      if (isScriptUrl(u)) expect(isSafeUrl(u)).toBe(false);
    }
  });
});

test('missing handler is a no-op + warns, never throws', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(() => routeCardEvent({}, { kind: 'dismiss', cardId: 'c1' })).not.toThrow();
  expect(warn).toHaveBeenCalled();
});

test('routeCardEvent routes the reopen verb to onReopen (mirrors dismiss)', () => {
  const onReopen = vi.fn();
  routeCardEvent({ onReopen }, { kind: 'reopen', cardId: 'c1' });
  expect(onReopen).toHaveBeenCalledWith('c1');
});

test('reopen with no handler warns + is a no-op, never throws', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(() => routeCardEvent({}, { kind: 'reopen', cardId: 'c1' })).not.toThrow();
  expect(warn).toHaveBeenCalled();
});

test('listenForCardEvents routes bubbling events through policy + unsubscribes', () => {
  const onAction = vi.fn();
  const off = listenForCardEvents(document, { onAction });
  const el = document.createElement('div'); document.body.appendChild(el);
  emitCardEvent(el, { kind: 'action', cardId: 'c1', action: 'go' });
  expect(onAction).toHaveBeenCalledWith('c1', 'go', undefined);
  off();
  emitCardEvent(el, { kind: 'action', cardId: 'c1', action: 'again' });
  expect(onAction).toHaveBeenCalledTimes(1);
});
