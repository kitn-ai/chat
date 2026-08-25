// F-26: a card rendered INSIDE <kai-chat> (a `card` message part) must be able to
// emit its contract events — ready / action / error and the rest — and have them
// reach a listener on the element. Before the fix, message.tsx rendered
// CardRenderer with no CardHost and no hostElement, so every emit missed both
// branches of the card's funnel and the verb was silently discarded, while
// primitives/card-host.tsx's own header claimed the opposite.
//
// STALE-GREEN TRAP, deliberately avoided: these tests do NOT render CardRenderer
// directly (that path can be given a host and pass while the shipped element path
// still drops everything). They go through the real elements — the same path
// every real message flows through, like hostile-model-output.test.tsx does for
// text — and drive the card with a real shadow-root click.
import { flush } from 'solid-js';
import '../../src/elements/chat';
import '../../src/elements/message';
import '../../src/elements/thread';
import { expect, test } from 'vitest';
import type { ChatMessage } from '../../src/elements/chat-types';
import type { CardEvent } from '../../src/primitives/card-contract';

// jsdom does not implement Element.prototype.scrollTo (ChatContainer's
// stick-to-bottom calls it via rAF). Same shim as chat-element.test.tsx.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

const confirmMessage = (): ChatMessage[] => [
  {
    id: 'm1',
    role: 'assistant',
    parts: [
      {
        type: 'card',
        envelope: {
          type: 'confirm',
          id: 'card-1',
          title: 'Deploy?',
          data: { body: 'Ship build 42 to production?', actions: [{ id: 'approve', label: 'Approve' }] },
        },
      },
    ],
  },
];

/** Mount an element, collect every bubbling `kai-card` off it, click the card's
 *  action button inside the shadow root, and return the observed events. */
async function driveCard(el: HTMLElement): Promise<CardEvent[]> {
  const events: CardEvent[] = [];
  el.addEventListener('kai-card', (e) => events.push((e as CustomEvent<CardEvent>).detail));
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('button[data-action-id="approve"]');
  expect(btn, 'the confirm card action button should render in the shadow root').toBeTruthy();
  btn!.click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  el.remove();
  return events;
}

test('a card part inside <kai-chat> emits ready + action to a kai-card listener on the element', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { messages: ChatMessage[] };
  el.messages = confirmMessage();
  const events = await driveCard(el);
  expect(events.map((e) => e.kind)).toContain('ready');
  expect(events).toContainEqual({ kind: 'action', cardId: 'card-1', action: 'approve' });
});

test('a card part inside standalone <kai-message> emits ready + action the same way', async () => {
  const el = document.createElement('kai-message') as HTMLElement & { message: ChatMessage };
  el.message = confirmMessage()[0];
  const events = await driveCard(el);
  expect(events.map((e) => e.kind)).toContain('ready');
  expect(events).toContainEqual({ kind: 'action', cardId: 'card-1', action: 'approve' });
});

test('a card part inside <kai-thread> emits ready + action the same way', async () => {
  const el = document.createElement('kai-thread') as HTMLElement & { messages: ChatMessage[] };
  el.messages = confirmMessage();
  const events = await driveCard(el);
  expect(events.map((e) => e.kind)).toContain('ready');
  expect(events).toContainEqual({ kind: 'action', cardId: 'card-1', action: 'approve' });
});

test("an unknown card type's contract error is emitted off <kai-chat>, not discarded", async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { messages: ChatMessage[] };
  el.messages = [
    {
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'card', envelope: { type: 'no-such-card', id: 'card-x', data: {} } },
      ],
    },
  ];
  const events: CardEvent[] = [];
  el.addEventListener('kai-card', (e) => events.push((e as CustomEvent<CardEvent>).detail));
  document.body.appendChild(el);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  el.remove();
  expect(events).toContainEqual({
    kind: 'error',
    cardId: 'card-x',
    message: 'Unsupported card type: no-such-card',
  });
});
