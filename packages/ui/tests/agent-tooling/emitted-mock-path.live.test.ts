/**
 * RUN the scaffolder's emitted ZERO-CONFIG path. Do not read it.
 *
 * WHY THIS EXISTS
 * ---------------
 * `integration: 'mock'` is the first thing anyone sees: it is what `create-kai`
 * produces when you press Enter through every prompt, with no key and no backend.
 * If it does not stream, the tool is dead on arrival — and nothing above this
 * layer can tell whether it streams:
 *
 *   · `scaffold.test.ts` asserts the WORDING of string literals.
 *   · `verify:scaffold` COMPILES the output under eight consumer tsconfigs.
 *
 * Both were green for the whole life of the previous hand-rolled mock, which
 * replaced `parts` wholesale and silently deleted any reasoning/tool part already
 * on the message. So this writes the emitted `src/main.ts` to a real module,
 * EXECUTES it against a mounted `<kai-chat>`, and asserts a reply reaches the
 * shadow DOM.
 *
 * WHAT IT PINS THAT IS NOT "DOES TEXT APPEAR"
 * -------------------------------------------
 * Two things, and they are the reason the file is worth its seconds:
 *
 *   1. NO PROVIDER IS CONTACTED. `fetch` is replaced by a spy that FAILS the test
 *      if it is called at all. A mock that quietly acquired a network call is the
 *      exact bug this repo already shipped once (a fabricated tool call POSTed
 *      ahead of the user's own message), and the only honest way to assert the
 *      absence of a request is to make one throw.
 *   2. IT GOES THROUGH THE KIT'S PARSER. The emitted module is asserted to hand
 *      `mockResponse(value)` to `readOpenAIStream` — the same call the real
 *      backend path makes — rather than folding tokens itself. That is what makes
 *      the zero-config default a live regression test of the SSE reader instead
 *      of a code path that shares nothing with production.
 *
 * The `html` target is used for the same reason `emitted-card-path.live.test.ts`
 * uses it: its emitted logic is a plain TS module over a `KaiChatElement`, with no
 * framework runtime in the way, and it shares `realStreamBody` with the other
 * seven — so the streaming half is exercised for all of them.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../../src/agent-tooling/mcp/tools/scaffold';
// The expected thread is DERIVED from the same script the scaffolder emits,
// not restated: a re-authored script moves these assertions on its own.
import { scaffoldMockScript } from '../../src/agent-tooling/construct/mock-script';
import type { MockTurn } from '../../src/state/mock';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** Outside `tests/` and outside `src/` — see emitted-card-path.live.test.ts. */
const TMP_DIR = resolve(PKG, '.tmp-emitted-mock');

// jsdom gaps, as no-op stubs — the same set emitted-maximal-surface.live.test.ts
// carries, for the same measured reason: the scripted reply now streams a
// REASONING part, whose disclosure measures with a ResizeObserver, and the
// emitted handler wraps the turn in try/catch — so a missing global does not
// crash, it is swallowed into `stream.abort()` and the thread carries the error
// text where the scripted reply should be. Without these stubs the source part
// never arrived and the tool test's turns settled instantly with no tool part.
const proto = Element.prototype as unknown as Record<string, unknown>;
proto.scrollTo ??= () => {};
proto.scrollIntoView ??= () => {};
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const SEP = '// ── src/main.ts ──';

/** The package's own exports map, applied by hand. Same rewriter as the card guard. */
function rewrite(code: string): string {
  return code
    .split('\n')
    .filter((l) => !l.includes("'@kitn.ai/ui/theme.tokens.css'"))
    .filter((l) => !l.startsWith('import type '))
    .map((l) =>
      l
        .replace("'@kitn.ai/ui/elements'", `'${PKG}/src/elements/chat'`)
        .replace("'@kitn.ai/ui/state'", `'${PKG}/src/state'`)
        .replace("'@kitn.ai/ui/wire'", `'${PKG}/src/wire'`),
    )
    .map((l) => l.replace(/\bas KaiChatElement\b/, 'as any'))
    .join('\n');
}

describe('the EMITTED zero-config scaffold really streams, with no backend', () => {
  it('mockResponse -> readOpenAIStream -> a reply in the shadow DOM, no fetch', async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    const front = text.split('=== (2) BACKEND ROUTE ===')[0];
    const at = front.indexOf(SEP);
    expect(at, 'the html target emits no src/main.ts module').toBeGreaterThan(-1);
    const main = front.slice(front.indexOf('\n', at) + 1);

    // Fail HERE rather than at a DOM assertion if the emit regressed to a
    // hand-rolled fold: the mock must reach the screen THROUGH the kit's reader.
    expect(main, 'the mock must import the kit\'s shared responder').toContain(
      'createMockResponder',
    );
    expect(main, 'the mock must stream through the kit\'s own SSE reader').toContain(
      'const turn = await readOpenAIStream(res, stream);',
    );
    expect(main, 'the mock must feed the responder INTO that reader').toContain(
      'const res = mockResponse(value);',
    );
    // The inlined fold is gone. If it ever comes back, the mock has stopped
    // sharing an implementation with everything else and this guard is why.
    expect(main, 'the hand-rolled appendText fold must not return').not.toContain(
      'const appendText =',
    );

    document.body.innerHTML = '<kai-chat id="chat"></kai-chat>';

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
      await new Promise((r) => setTimeout(r, 0));

      const chat = document.getElementById('chat') as HTMLElement & {
        messages: { role: string; parts: { type: string; text?: string }[] }[];
        loading: boolean;
      };
      chat.dispatchEvent(new CustomEvent('kai-submit', { detail: { value: 'hello there' } }));

      // The scripted reply streams token by token at 24ms — the rich script
      // (reasoning + text + citation) runs several seconds — so wait for the
      // turn to settle rather than for a fixed duration.
      for (let i = 0; i < 2000 && chat.loading !== false; i += 1) {
        await new Promise((r) => setTimeout(r, 10));
      }
      await new Promise((r) => setTimeout(r, 50));

      // 1. Nothing was requested. Stated first because it is the claim that
      //    distinguishes a mock from a demo that quietly works.
      expect(calls, 'the zero-config scaffold must not touch the network').toEqual([]);

      // 2. The thread is the user turn plus a streamed assistant turn.
      expect(chat.messages).toHaveLength(2);
      expect(chat.messages[0].role).toBe('user');
      expect(chat.messages[1].role).toBe('assistant');

      // 3. The scripted RICH first turn, derived from the shared script the
      //    scaffolder emits (chat-only surface, so no tool call): a reasoning
      //    part, ONE text part holding the WHOLE reply — `appendTextPart`
      //    folding onto the trailing part; per-token parts or a truncated
      //    reply both mean the fold is broken — and the scripted citation.
      //    This is the named residue of the construct round: the framework
      //    scaffolds used to boot into plain text.
      const scripted = scaffoldMockScript({ tools: false }).replies[0] as MockTurn;
      const parts = chat.messages[1].parts;
      expect(parts.map((p) => p.type)).toEqual(['reasoning', 'text', 'source']);
      expect(parts[0].text).toBe(scripted.reasoning);
      expect(parts[1].text).toBe(scripted.text);

      // 4. It is ON SCREEN. A distinctive slice of the canned reply, so this
      //    cannot be satisfied by placeholder or empty-state copy.
      const root = (chat as unknown as { shadowRoot: ShadowRoot }).shadowRoot;
      expect(root.textContent).toContain('no provider was contacted');

      // 5. The turn settled, so the composer is usable again.
      expect(chat.loading).toBe(false);
    } finally {
      rmSync(TMP_DIR, { recursive: true, force: true });
      (globalThis as unknown as { fetch: unknown }).fetch = realFetch;
    }
  });

  /**
   * The kai-tool surface's scripted call SETTLES. The wire only ever announces
   * a call; the emitted settle loop (MOCK_TOOL_OUTPUTS + applyToolOutput) is
   * the mock's host side, and nothing above this layer can see whether it runs:
   * scaffold.test.ts asserts its wording, verify:scaffold compiles it, and a
   * loop that never fired would leave the row spinning at input-available
   * forever — a worse first run than the plain text this round replaced.
   *
   * Two submits: the script's first reply is the no-tool introduction, its
   * second announces the demo call.
   */
  it('the agentic surface settles the scripted tool call to output-available', async () => {
    const out = await scaffold.handler({
      useCase: 'agentic',
      integration: 'mock',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    const front = text.split('=== (2) BACKEND ROUTE ===')[0];
    const at = front.indexOf(SEP);
    expect(at, 'the html target emits no src/main.ts module').toBeGreaterThan(-1);
    const main = front.slice(front.indexOf('\n', at) + 1);

    document.body.innerHTML = '<kai-chat id="chat"></kai-chat>';
    const realFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = (url: unknown) => {
      throw new Error(`the mock scaffold contacted the network: ${String(url)}`);
    };

    rmSync(TMP_DIR, { recursive: true, force: true });
    mkdirSync(TMP_DIR, { recursive: true });
    const tmp = resolve(TMP_DIR, `main.agentic.${Date.now()}.ts`);
    writeFileSync(tmp, rewrite(main));
    try {
      await import(/* @vite-ignore */ tmp);
      await customElements.whenDefined('kai-chat');
      await new Promise((r) => setTimeout(r, 0));

      const chat = document.getElementById('chat') as HTMLElement & {
        messages: {
          role: string;
          parts: { type: string; text?: string; tool?: { type: string; state: string; output?: unknown } }[];
        }[];
        loading: boolean;
      };
      const settle = async () => {
        for (let i = 0; i < 2000 && chat.loading !== false; i += 1) {
          await new Promise((r) => setTimeout(r, 10));
        }
        await new Promise((r) => setTimeout(r, 50));
      };
      chat.dispatchEvent(new CustomEvent('kai-submit', { detail: { value: 'hello' } }));
      await settle();
      chat.dispatchEvent(new CustomEvent('kai-submit', { detail: { value: 'show me a tool call' } }));
      await settle();

      expect(chat.messages).toHaveLength(4);
      const scripted = scaffoldMockScript({ tools: true });
      const call = (scripted.replies[1] as MockTurn).toolCalls?.[0];
      expect(call, 'the shared script no longer announces a call on its second reply').toBeDefined();
      const toolPart = chat.messages[3].parts.find((p) => p.type === 'tool');
      expect(toolPart, 'the announced call never reached the thread as a tool part').toBeDefined();
      expect(toolPart!.tool!.type).toBe(call!.name);
      // THE claim: settled, not spinning. And with the SCRIPTED output, so the
      // row shows a result a first-run reader can actually see.
      expect(toolPart!.tool!.state).toBe('output-available');
      expect(toolPart!.tool!.output).toEqual(scripted.toolOutputs[call!.name]);
      expect(chat.loading).toBe(false);
    } finally {
      rmSync(TMP_DIR, { recursive: true, force: true });
      (globalThis as unknown as { fetch: unknown }).fetch = realFetch;
    }
  });
});
