/**
 * The message row must name its speaker THROUGH THE ELEMENT — `<kai-thread>` and
 * `<kai-chat>`, populated, which is the only path a consumer has.
 *
 * WHY THIS FILE EXISTS, which is the part worth keeping: `Message` gained
 * `role="article"` + a speaker `aria-label` in c80080e, and that fix was verified
 * on `Message` in ISOLATION — rendered directly, role asserted, axe clean.
 * Neither `Thread` nor `ChatThread` passed `role` when rendering the list, so the
 * a11y fix reached nobody through the primary path and the isolated tests stayed
 * green the whole time. Verifying a mechanism is not verifying the thing that
 * uses it. Every assertion below therefore goes through a real custom element
 * with messages on it; none of them constructs a `<Message>`.
 *
 * WHAT THIS FILE CANNOT DO. jsdom has no accessibility tree, so these assert the
 * ATTRIBUTES that produce the accessible role and name, not the computed values
 * themselves. The computed AX role/name is measured in a real chromium by
 * `scripts/probe-thread-row-semantics.mjs` (CDP Accessibility.getFullAXTree),
 * which is where the claim "AX role article, AX name User message" is actually
 * established — with the fix reverted it reads role "none", name "",
 * ignored=true ("uninteresting") on all six rows. Keep the two together: this
 * file is the cheap CI guard, that script is the evidence.
 *
 * NOT GUARDED BY AXE, deliberately. Axe has no rule for "a message row ought to
 * name its speaker"; it judges a role that is present and wrong, never a missing
 * one. Measured, not assumed: with the fix reverted, aria-roles /
 * aria-allowed-role / aria-prohibited-attr / aria-valid-attr-value all report 0
 * violations over a fully unlabelled thread. An axe assertion here would have
 * been a check that proves nothing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../src/elements/thread';
import '../../src/elements/chat';
import type { ChatMessage } from '../../src/elements/chat-types';

// jsdom doesn't implement Element.scrollTo; the stick-to-bottom primitive calls
// it on a requestAnimationFrame when rows mount. Same shim as chat-element.test.tsx.
if (!Element.prototype.scrollTo) (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};

/** Both speakers AND both `<Message>` call sites. The avatar entry is not
 *  padding: `Thread`/`ChatThread` each render `<Message>` from two branches, and
 *  a fix applied to only the no-avatar fallback passes a thread without one. */
const MESSAGES: ChatMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'What is the capital of France?' }] },
  { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Paris.' }] },
  { id: 'm3', role: 'user', avatar: { fallback: 'RT' }, parts: [{ type: 'text', text: 'Thanks.' }] },
  { id: 'm4', role: 'assistant', avatar: { fallback: 'AI' }, parts: [{ type: 'text', text: 'Any time.' }] },
];

const EXPECTED = [
  { role: 'user', label: 'User message' },
  { role: 'assistant', label: 'Assistant message' },
  { role: 'user', label: 'User message' },
  { role: 'assistant', label: 'Assistant message' },
];

const HOSTS = ['kai-thread', 'kai-chat'] as const;

async function mount(tag: string, messages: ChatMessage[] = MESSAGES) {
  const el = document.createElement(tag) as HTMLElement & { messages?: ChatMessage[] };
  el.messages = messages;
  document.body.append(el);
  await customElements.whenDefined(tag);
  await new Promise((r) => setTimeout(r, 0));
  return el;
}

const rows = (el: HTMLElement) => [...el.shadowRoot!.querySelectorAll('[part="row"]')];

afterEach(() => {
  for (const tag of HOSTS) document.querySelectorAll(tag).forEach((el) => el.remove());
});

describe.each(HOSTS)('<%s> message rows name their speaker', (tag) => {
  it('renders one row per message, on both the avatar and no-avatar branches', async () => {
    const el = await mount(tag);
    // Pin the count first. Every assertion below is `for (const row of rows)`,
    // and an empty list would make all of them vacuously true.
    expect(rows(el)).toHaveLength(MESSAGES.length);
  });

  it('gives every row a valid ARIA role that can carry a name', async () => {
    const el = await mount(tag);
    const got = rows(el).map((r) => r.getAttribute('role'));
    expect(got).toEqual(EXPECTED.map(() => 'article'));
    // The row must never carry the SPEAKER as its ARIA role: 'user' and
    // 'assistant' are not valid ARIA roles, and shipping one was the original
    // c80080e defect. Guard the composed path against reintroducing it.
    for (const r of got) expect(['user', 'assistant', 'system']).not.toContain(r);
  });

  it('names each row after its own speaker, in order', async () => {
    const el = await mount(tag);
    // Asserted as a LIST rather than per-row so a fix that labels every row
    // identically — the obvious way to get this wrong — fails here.
    expect(rows(el).map((r) => r.getAttribute('aria-label'))).toEqual(EXPECTED.map((e) => e.label));
  });

  it('exposes the speaker as data-role for styling and querying', async () => {
    const el = await mount(tag);
    expect(rows(el).map((r) => r.getAttribute('data-role'))).toEqual(EXPECTED.map((e) => e.role));
  });

  it('keeps the speaker on the row after a streaming-style message replacement', async () => {
    // The rows are keyed by message id and outlive the object that produced
    // them, so a row could pick up its role once at mount and then go stale.
    // Replace the array the way a stream does and re-read.
    const el = await mount(tag);
    el.messages = MESSAGES.map((m) =>
      m.id === 'm2' ? { ...m, parts: [{ type: 'text' as const, text: 'Paris, the capital of France.' }] } : { ...m },
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(el.shadowRoot!.textContent).toContain('Paris, the capital of France.');
    expect(rows(el).map((r) => r.getAttribute('aria-label'))).toEqual(EXPECTED.map((e) => e.label));
  });
});
