/**
 * RUN the scaffolder's emitted CONVERSATION RAIL. Do not read it.
 *
 * WHY THIS EXISTS
 * ---------------
 * The rail's wiring shipped with the thread swap correct and the ROW inert. Every
 * row was written once, at creation, and never touched again: after a full turn
 * the sidebar still read "New chat / 0 messages / just now" while the thread beside
 * it held two messages. A consumer pasting that gets a rail that looks broken.
 *
 * Nothing above this layer could see it. `scaffold.test.ts` asserts the WORDING of
 * string literals and the wording was fine — the emit says it wires the rail, and
 * it does wire the half it claims. `verify:scaffold` COMPILES the output under
 * eight consumer tsconfigs, and a row that is never updated type-checks perfectly.
 * The defect was found by running the emitted app in a browser and reading the
 * sidebar, which is what this file automates.
 *
 * WHAT IT PINS THAT A STRING ASSERTION CANNOT
 * -------------------------------------------
 * The kit's `reactivity-two-halves` invariant, which the emitted code is itself a
 * worked example of. `<kai-conversations>` renders rows through a reference-keyed
 * `<For>`, so updating one needs BOTH a new array reference (what NOTIFIES) and a
 * new object for the row that changed (what makes it VISIBLE). The two halves fail
 * differently and both fail SILENTLY:
 *
 *   · same array back      -> nothing notifies, nothing repaints.
 *   · row mutated in place -> the list notifies and the ROW still does not repaint,
 *                             because `<For>` captured it as a value.
 *
 * The second one is the trap, and it is invisible to every check that reads the
 * emitted text or the `conversations` property: the property holds the right
 * numbers and the screen holds the old ones. So the load-bearing assertions here
 * are read off the rail's own SHADOW DOM — the count and the title as rendered —
 * never off the array that was assigned to it. `src/components/reactivity-contract.test.tsx`
 * pins the same invariant for the component; this pins that the emitted code obeys it.
 *
 * WHY `mock`. The turn has to complete for the row to advance, and the mock
 * integration is the one path that completes without a provider or a route — the
 * same reason `emitted-mock-path.live.test.ts` uses it. `fetch` is a thrower here
 * for the same reason it is there: the only honest way to assert no request.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../../mcp/mcp/tools/scaffold';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** Outside `tests/` and outside `src/` — see emitted-card-path.live.test.ts. */
const TMP_DIR = resolve(PKG, '.tmp-emitted-rail');

// jsdom does not implement Element.scrollTo, and mounting <kai-chat> calls it
// through the stick-to-bottom primitive on a rAF. Same shim as the element suites.
const proto = Element.prototype as unknown as Record<string, unknown>;
proto.scrollTo ??= () => {};
proto.scrollIntoView ??= () => {};
// The scripted mock reply streams a REASONING part, whose disclosure measures
// with a ResizeObserver jsdom lacks; without the stub the emitted try/catch
// swallows the crash into stream.abort() and the "turn" this test builds on is
// really an error message. Same stub as emitted-maximal-surface.live.test.ts.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const SEP = '// ── src/main.ts ──';

/**
 * The package's own exports map, applied by hand. Same rewriter as the other
 * guards; `@kitn.ai/ui/elements` resolves to the register-ALL entry point because
 * this surface mounts two tags, and `src/elements/chat` would leave
 * `<kai-conversations>` an unupgraded unknown element with no shadow root — which
 * is precisely where every assertion below reads from.
 */
function rewrite(code: string): string {
  return code
    .split('\n')
    .filter((l) => !l.includes("'@kitn.ai/ui/theme.tokens.css'"))
    .filter((l) => !l.startsWith('import type '))
    .map((l) =>
      l
        .replace("'@kitn.ai/ui/elements'", `'${PKG}/src/elements/register-impl'`)
        .replace("'@kitn.ai/ui/state'", `'${PKG}/src/state'`)
        .replace("'@kitn.ai/ui/wire'", `'${PKG}/src/wire'`),
    )
    .map((l) => l.replace(/\bas Kai\w+Element\b/g, 'as any'))
    .join('\n');
}

/** The rail row as the LIVE component drew it, found by the id the emit assigns. */
function renderedRow(rail: HTMLElement & { shadowRoot: ShadowRoot }, id: string): HTMLElement {
  const row = rail.shadowRoot.querySelector(`[data-conversation-id="${id}"]`) as HTMLElement | null;
  expect(row, `the rail rendered no row for conversation ${id}`).not.toBeNull();
  return row!;
}

describe('the EMITTED conversation rail keeps its row in step with the thread', () => {
  it('after a turn the row shows the real count and a title derived from the message', async () => {
    const out = await scaffold.handler({
      components: ['kai-chat', 'kai-conversations'],
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    const front = text.split('=== (2) BACKEND ROUTE ===')[0];
    const at = front.indexOf(SEP);
    expect(at, 'the html target emits no src/main.ts module').toBeGreaterThan(-1);

    const indexHtml = front.slice(0, at);
    const main = front.slice(front.indexOf('\n', at) + 1);
    // The markup half, VERBATIM — the rail is SLOTTED inside <kai-chat>, and that
    // composition is part of what runs here. The parser runs before the deferred
    // module, which is the order the emitted code documents and depends on.
    const markup = indexHtml.slice(0, indexHtml.indexOf('<script'));
    document.body.innerHTML = markup;

    // THE ABSENCE ASSERTION: any request at all is a failure, not a surprise.
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = (url: unknown) => {
      calls.push(String(url));
      throw new Error(`the mock scaffold contacted the network: ${String(url)}`);
    };

    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
    const tmp = resolve(TMP_DIR, `main.${Date.now()}.ts`);
    writeFileSync(tmp, rewrite(main));
    try {
      // Importing it RUNS it: the emitted module ends with `void init()`.
      await import(/* @vite-ignore */ tmp);
      await customElements.whenDefined('kai-chat');
      await customElements.whenDefined('kai-conversations');
      await new Promise((r) => setTimeout(r, 50));

      const chat = document.getElementById('chat') as HTMLElement & {
        messages: { role: string; parts: { type: string; text?: string }[] }[];
        loading: boolean;
      };
      const rail = document.getElementById('conversations') as HTMLElement & {
        conversations: { id: string; title: string; messageCount: number; lastMessageAt: string; updatedAt: string }[];
        shadowRoot: ShadowRoot;
      };
      expect(rail.shadowRoot, 'the rail is in the document but never upgraded').not.toBeNull();

      // The starting state, captured rather than assumed — every claim below is a
      // CHANGE from here, so a rail that was already showing the answer cannot pass.
      const seededArray = rail.conversations;
      const seededRow = seededArray[0];
      const activeId = seededRow.id;
      expect(seededRow.title, 'the seeded row is expected to start as the placeholder').toBe('New chat');
      expect(seededRow.messageCount).toBe(0);
      expect(renderedRow(rail, activeId).textContent).toContain('0 messages');

      // A message long enough that a sensible title has to shorten it.
      const value = 'How do I stream tokens from OpenRouter without buffering the whole response first?';
      chat.dispatchEvent(new CustomEvent('kai-submit', { detail: { value } }));

      // The canned reply streams token by token; wait for the turn to settle
      // rather than for a fixed duration.
      for (let i = 0; i < 2000 && chat.loading !== false; i += 1) {
        await new Promise((r) => setTimeout(r, 10));
      }
      await new Promise((r) => setTimeout(r, 50));

      expect(calls, 'the zero-config scaffold must not touch the network').toEqual([]);
      // Sanity: the turn really happened. If this fails, nothing below is about the rail.
      expect(chat.messages, 'the turn did not complete — user + assistant expected').toHaveLength(2);

      // ── 1. WHAT IS ON SCREEN ────────────────────────────────────────────────
      // The load-bearing assertions. Read off the rail's own shadow DOM, so the
      // half-correct fix — a row mutated in place, re-assigned in a fresh array —
      // fails here while the property assertions below would still pass.
      const rowEl = renderedRow(rail, activeId);
      const rendered = rowEl.textContent ?? '';
      expect(rendered, 'the rail still shows a zero count after a completed turn').toContain(
        `${chat.messages.length} messages`,
      );
      expect(rendered, 'the rail still shows the "New chat" placeholder after the user spoke').not.toContain(
        'New chat',
      );
      // Derived from what the user actually said — not a second placeholder.
      expect(rendered).toContain('How do I stream tokens');

      // ── 2. THE ROW BEHIND IT ────────────────────────────────────────────────
      const row = rail.conversations.find((c) => c.id === activeId)!;
      expect(row.messageCount, 'messageCount does not reflect the thread').toBe(chat.messages.length);
      expect(row.title).not.toBe('New chat');
      // Short, and derived rather than restated: whatever the truncation rule is,
      // a title as long as the message is not a title.
      expect(row.title.length).toBeLessThan(value.length);
      expect(value.startsWith(row.title.replace(/\W+$/, '')), `title "${row.title}" is not a prefix of the message`).toBe(true);
      expect(
        Date.parse(row.updatedAt),
        'updatedAt never advanced past the moment the row was created',
      ).toBeGreaterThan(Date.parse(seededRow.updatedAt));
      expect(Date.parse(row.lastMessageAt)).toBeGreaterThan(Date.parse(seededRow.lastMessageAt));

      // ── 3. BOTH HALVES OF THE REACTIVITY CONTRACT ───────────────────────────
      // Structural, and the reason the rendering above works: a new ARRAY (what
      // notifies) and a new OBJECT for the row that changed (what the reference-keyed
      // <For> can see). Either one alone leaves the rail silently stale.
      expect(rail.conversations, 'the same array was handed back — nothing notifies').not.toBe(seededArray);
      expect(rail.conversations[0], 'the row object was mutated in place — the row never repaints').not.toBe(
        seededRow,
      );
      expect(seededRow.messageCount, 'the seeded row was mutated in place').toBe(0);
      expect(seededRow.title).toBe('New chat');
    } finally {
      rmSync(TMP_DIR, { recursive: true, force: true });
      (globalThis as unknown as { fetch: unknown }).fetch = realFetch;
      document.body.innerHTML = '';
    }
  });
});
