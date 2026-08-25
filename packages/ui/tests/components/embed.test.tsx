// tests/components/embed.test.tsx
import { flush } from 'solid-js';
import { render, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, test } from 'vitest';
import { Embed } from '../../src/components/embed';
import type { CardEvent } from '../../src/primitives/card-contract';
import {
  configureEmbedAllowlist,
  __resetEmbedAllowlistForTests,
} from '../../src/primitives/embed-providers';

afterEach(() => {
  document.body.innerHTML = '';
  __resetEmbedAllowlistForTests();
});

describe('Embed facade (privacy guarantee)', () => {
  test('initial DOM has NO iframe — only a poster + play button', () => {
    const { container } = render(() => (
      <Embed cardId="c1" data={{ provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'Intro' }} />
    ));
    expect(container.querySelector('iframe')).toBeNull();
    const btn = container.querySelector('button[aria-label="Play Intro"]');
    expect(btn).toBeTruthy();
    const poster = container.querySelector('img') as HTMLImageElement | null;
    expect(poster?.src).toContain('i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  test('after clicking play, exactly one iframe appears with resolved src/sandbox/allow/title', () => {
    const { container } = render(() => (
      <Embed cardId="c1" data={{ provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'Intro' }} />
    ));
    fireEvent.click(container.querySelector('button[aria-label="Play Intro"]')!);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    const frames = container.querySelectorAll('iframe');
    expect(frames).toHaveLength(1);
    const f = frames[0] as HTMLIFrameElement;
    expect(f.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0');
    expect(f.getAttribute('sandbox')).toContain('allow-scripts');
    expect(f.getAttribute('allow')).toContain('autoplay');
    expect(f.getAttribute('title')).toBe('Intro');
  });

  test('Enter on the play button starts playback', () => {
    const { container } = render(() => (
      <Embed cardId="c1" data={{ provider: 'youtube', id: 'abc', title: 'X' }} />
    ));
    fireEvent.keyDown(container.querySelector('button[aria-label="Play X"]')!, { key: 'Enter' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(container.querySelector('iframe')).toBeTruthy();
  });
});

describe('Embed lifecycle + open affordance', () => {
  test('emits ready on mount', () => {
    const events: CardEvent[] = [];
    render(() => <Embed cardId="c1" data={{ provider: 'youtube', id: 'abc' }} onEmit={(e) => events.push(e)} />);
    expect(events.some((e) => e.kind === 'ready' && e.cardId === 'c1')).toBe(true);
  });

  test('"Open on YouTube" emits open/target:tab to the watch url', () => {
    const events: CardEvent[] = [];
    const { getByText } = render(() => (
      <Embed cardId="c1" data={{ provider: 'youtube', id: 'abc' }} onEmit={(e) => events.push(e)} />
    ));
    fireEvent.click(getByText(/Open on YouTube/));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    const opens = events.filter((e) => e.kind === 'open');
    expect(opens).toHaveLength(1);
    expect(opens[0]).toMatchObject({
      kind: 'open',
      url: 'https://www.youtube.com/watch?v=abc',
      target: 'tab',
    });
  });
});

describe('Embed generic + errors', () => {
  test('generic non-allowlisted → inline error + one error event, no iframe', () => {
    const events: CardEvent[] = [];
    const { getByText, container } = render(() => (
      <Embed cardId="c1" data={{ provider: 'generic', url: 'https://player.x/v' }} onEmit={(e) => events.push(e)} />
    ));
    expect(getByText("Can't load this video")).toBeTruthy();
    expect(container.querySelector('iframe')).toBeNull();
    expect(events.filter((e) => e.kind === 'error')).toHaveLength(1);
  });

  test('generic allowlisted → plays the supplied url', () => {
    configureEmbedAllowlist(['https://player.x']);
    const { container } = render(() => (
      <Embed cardId="c1" data={{ provider: 'generic', url: 'https://player.x/v', title: 'G' }} />
    ));
    fireEvent.click(container.querySelector('button[aria-label="Play G"]')!);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    const f = container.querySelector('iframe') as HTMLIFrameElement;
    expect(f.src).toBe('https://player.x/v');
  });

  test('generic non-https → inline error + error event', () => {
    const events: CardEvent[] = [];
    configureEmbedAllowlist(['https://player.x']);
    const { getByText } = render(() => (
      <Embed cardId="c1" data={{ provider: 'generic', url: 'http://player.x/v' }} onEmit={(e) => events.push(e)} />
    ));
    expect(getByText("Can't load this video")).toBeTruthy();
    expect(events.filter((e) => e.kind === 'error')).toHaveLength(1);
  });

  test('poster onError falls back to placeholder (still playable, no error event)', () => {
    const events: CardEvent[] = [];
    const { container } = render(() => (
      <Embed cardId="c1" data={{ provider: 'youtube', id: 'abc', title: 'P' }} onEmit={(e) => events.push(e)} />
    ));
    const poster = container.querySelector('img') as HTMLImageElement;
    fireEvent.error(poster);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(container.querySelector('button[aria-label="Play P"]')).toBeTruthy();
    expect(events.some((e) => e.kind === 'error')).toBe(false);
  });
});

describe('Embed aspect ratio', () => {
  test('applies the CSS aspect-ratio for 9:16', () => {
    const { container } = render(() => (
      <Embed cardId="c1" data={{ provider: 'youtube', id: 'abc', aspectRatio: '9:16' }} />
    ));
    const box = container.querySelector('[style*="aspect-ratio"]') as HTMLElement;
    expect(box.style.getPropertyValue('aspect-ratio')).toBe('9 / 16');
  });
});
