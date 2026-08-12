/**
 * RUN the scaffolder's emitted card path. Do not read it.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT REDUNDANT
 * -------------------------------------------
 * There are already two layers over the emitted card round trip and neither can
 * see what this file checks.
 *
 *   · `scaffold.test.ts` asserts WORDING. Every line the scaffolder emits lives
 *     inside a string literal, so that is genuinely all it can do: it cannot tell
 *     a working `cardFromToolCall` call from a plausible-looking one.
 *   · `verify:scaffold` COMPILES the same output under eight real consumer
 *     tsconfigs, which is a much stronger check and still not behaviour. The card
 *     round trip is three pieces with no type relating them — the registry,
 *     `cardTools()`, `cardFromToolCall()` — and any two of them compile perfectly
 *     while nothing ever reaches the screen.
 *
 * So this takes the `html` target's emitted `src/main.ts` VERBATIM, rewrites only
 * the bare specifiers to the sources the exports map points at, stubs
 * `fetch('/api/chat')` with a real OpenAI SSE stream carrying a `kai_confirm` tool
 * call, and asserts a confirm card built from the model's own arguments reaches
 * the shadow DOM.
 *
 * THE ASSERTION IS SCOPED TO THE CARD, AND THAT IS LOAD-BEARING.
 * `<kai-tool>` renders the model's arguments a few inches up the same thread, so
 * an unscoped `textContent` match on "Delete the production database?" is
 * satisfied by the tool panel's echo whether or not a card ever drew. Measured,
 * not assumed: pointing the same fixture at an UNREGISTERED card type leaves the
 * text assertion GREEN and fails only on `[data-action-id]`, which exists solely
 * on the real ConfirmCard's buttons.
 *
 * The `html` target is used because its emitted logic is a plain TS module
 * operating on a `KaiChatElement` — no framework runtime in the way. It shares
 * `toolLoopBody`, `cardRegistryLines` and `toolSchemaLines` with the other seven,
 * so the shared halves are exercised for all of them; what stays framework-
 * specific (where each one wires cardTypes/cardSchemas) is what
 * `cardRoundTripCheck` covers across all 8.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../../src/agent-tooling/mcp/tools/scaffold';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/**
 * Outside `tests/` and outside `src/`, so a crashed run cannot leave a file that
 * any tsconfig `include` picks up — a stale half-written module under `tests/`
 * would break `nx typecheck ui` for a reason that reads like a source defect.
 */
const TMP_DIR = resolve(PKG, '.tmp-emitted-scaffold');

// jsdom does not implement Element.scrollTo, and mounting <kai-chat> calls it
// through the stick-to-bottom primitive on a rAF. Same shim as the element suites.
if (!Element.prototype.scrollTo) (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};

const SEP = '// ── src/main.ts ──';

/**
 * The package's own exports map, applied by hand: each bare specifier is pointed
 * at the source file `@kitn.ai/ui`'s `exports` resolves it to.
 *
 * The CSS import is dropped (there is nothing to style in jsdom) and type-only
 * imports go with it, since they erase anyway and `KaiChatElement` lives in a
 * `.d.ts` the exports map does not surface as a runtime module. Nothing else in
 * the emitted module is touched.
 */
function rewrite(code: string): string {
  return code
    .split('\n')
    .filter((l) => !l.includes("'@kitn.ai/ui/theme.tokens.css'"))
    .filter((l) => !l.startsWith('import type '))
    .map((l) =>
      l
        .replace("'@kitn.ai/ui/elements'", `'${PKG}/src/elements/chat'`)
        .replace("'@kitn.ai/ui/state'", `'${PKG}/src/state'`)
        .replace("'@kitn.ai/ui/wire'", `'${PKG}/src/wire'`)
        .replace("'@kitn.ai/ui/schemas'", `'${PKG}/src/schemas'`),
    )
    .map((l) => l.replace(/\bas KaiChatElement\b/, 'as any'))
    .join('\n');
}

const sse = (frames: unknown[]) =>
  `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;

/** The model asks for a confirm card, filling in confirm.schema.json's own shape. */
const ROUND_1 = sse([
  {
    choices: [
      {
        delta: {
          tool_calls: [
            { index: 0, id: 'call_abc', type: 'function', function: { name: 'kai_confirm', arguments: '' } },
          ],
        },
      },
    ],
  },
  {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              function: {
                arguments: JSON.stringify({
                  heading: 'Delete the production database?',
                  body: 'This removes every row and cannot be undone.',
                  tone: 'danger',
                  actions: [
                    { id: 'approve', label: 'Delete it', style: 'destructive' },
                    { id: 'cancel', label: 'Not now', default: true },
                  ],
                }),
              },
            },
          ],
        },
      },
    ],
  },
  { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
]);

/** Round two: the model acknowledges and stops, so the emitted loop exits. */
const ROUND_2 = sse([
  { choices: [{ delta: { content: 'Waiting for your decision.' } }] },
  { choices: [{ delta: {}, finish_reason: 'stop' }] },
]);

describe('the EMITTED scaffold really produces a card, end to end', () => {
  it('kai_confirm -> cardFromToolCall -> addCard -> a ConfirmCard in the shadow DOM', async () => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    const front = text.split('=== (2) BACKEND ROUTE ===')[0];
    const at = front.indexOf(SEP);
    expect(at, 'the html target emits no src/main.ts module').toBeGreaterThan(-1);
    const main = front.slice(front.indexOf('\n', at) + 1);

    // Fail here rather than further down if the card arm regressed: a scaffold with
    // no card code would otherwise reach the DOM assertions and fail with a much
    // less obvious message.
    expect(main).toContain('createCardRegistry(');
    expect(main).toContain("cardTools(cards, { provider: 'openai' })");
    expect(main).toContain('cardFromToolCall(call.name, call.input ?? {}, { id: call.id })');

    // The markup half of block (1) — the emitted module looks up #chat.
    document.body.innerHTML = '<kai-chat id="chat"></kai-chat>';

    const bodies: string[] = [];
    let round = 0;
    const realFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async (_url: string, init: { body: string }) => {
      bodies.push(init.body);
      round += 1;
      return new Response(round === 1 ? ROUND_1 : ROUND_2, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    };

    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
    const tmp = resolve(TMP_DIR, `main.${Date.now()}.ts`);
    writeFileSync(tmp, rewrite(main));
    try {
      // Importing it RUNS it: the emitted module ends with `void init()`.
      await import(/* @vite-ignore */ tmp);
      await customElements.whenDefined('kai-chat');
      await new Promise((r) => setTimeout(r, 0));

      const chat = document.getElementById('chat') as HTMLElement & { messages: unknown[] };
      chat.dispatchEvent(new CustomEvent('kai-submit', { detail: { value: 'drop the prod db' } }));
      for (let i = 0; i < 100 && round < 2; i += 1) await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 50));

      // 1. The tools array the model was really sent carried the GENERATED card tool,
      //    and `use` really narrowed which ones.
      const sent = JSON.parse(bodies[0]) as { tools: { function: { name: string } }[] };
      const names = sent.tools.map((t) => t.function.name);
      expect(names).toContain('kai_confirm');
      expect(names).toContain('kai_choice');
      expect(names).not.toContain('kai_artifact');
      // GENERATED, not restated: the tool's parameters are confirm.schema.json's own
      // shape, which the scaffold never writes down.
      const confirmTool = sent.tools.find((t) => t.function.name === 'kai_confirm') as unknown as {
        function: { parameters: { required: string[]; properties: Record<string, unknown> } };
      };
      expect(confirmTool.function.parameters.required).toEqual(['actions']);
      expect(Object.keys(confirmTool.function.parameters.properties)).toContain('dismissible');

      // 2. The tool call became a card PART on the assistant message.
      const parts = (
        chat.messages as { role: string; parts: { type: string; envelope?: { type: string; id: string } }[] }[]
      ).flatMap((m) => m.parts);
      const card = parts.find((p) => p.type === 'card');
      expect(card?.envelope?.type).toBe('confirm');
      // The provider's tool_call_id, verbatim — which is what makes a model's
      // revision upsert in place instead of drawing a second card.
      expect(card?.envelope?.id).toBe('call_abc');

      // 3. It is ON SCREEN. Scoped to the ConfirmCard's own action buttons, never an
      //    unscoped text match: see the header — the tool panel echoes these same
      //    words and an unscoped assertion passes on a card that never rendered.
      const root = chat.shadowRoot!;
      const buttons = [...root.querySelectorAll('[data-action-id]')].map((b) => b.textContent?.trim());
      expect(buttons).toContain('Delete it');
      expect(buttons).toContain('Not now');
      expect(root.textContent).toContain('Delete the production database?');

      // 4. The model was told the card is waiting on the user, so the turn closes
      //    instead of the panel spinning forever.
      expect(round).toBe(2);
      expect(JSON.stringify(JSON.parse(bodies[1]))).toContain('awaiting_user');
    } finally {
      rmSync(TMP_DIR, { recursive: true, force: true });
      (globalThis as unknown as { fetch: unknown }).fetch = realFetch;
    }
  }, 30000);
});
