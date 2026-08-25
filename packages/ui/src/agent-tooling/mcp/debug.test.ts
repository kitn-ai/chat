import { describe, it, expect } from 'vitest';
import { debug } from './tools/debug';

/**
 * debug — diagnoses classic AI/UI integration failures and returns
 * the likely cause + fix.  The handler returns the MCP CallToolResult shape;
 * tests read out.content[0].text (same pattern as reference.test.ts).
 */
describe('debug', () => {
  // ── Rule 1: array/object set as HTML attribute ──────────────────────────
  it('array-as-attribute → JS property fix', async () => {
    const out = await debug.handler({
      snippet: '<kai-chat messages="[...]"></kai-chat>',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/set .*messages.* in JavaScript|property, not an attribute/i);
  });

  // ── Rule 2: in-place mutation / no re-render ────────────────────────────
  it('no re-render → new reference fix', async () => {
    const out = await debug.handler({
      symptom: "messages don't update when I push",
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/new array|new reference/i);
  });

  it('in-place-mutation fix mentions @kitn.ai/ui/state state helpers as the ergonomic path', async () => {
    const out = await debug.handler({
      symptom: "messages don't update when I mutate in place",
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('@kitn.ai/ui/state');
  });

  // ── Rule 4: wrong element prefix kitn- ─────────────────────────────────
  it('kitn- prefix in snippet → kai- prefix fix', async () => {
    const out = await debug.handler({
      snippet: '<kitn-chat></kitn-chat>',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/kai-|correct prefix/i);
    // must flag the kitn- prefix is wrong
    expect(text).toMatch(/kitn-.*only.*bundle|prefix.*kai-|element prefix.*kai-/i);
  });

  // ── Rule 3: event not firing / listener on wrong element ────────────────
  it('event not firing → listen directly on element', async () => {
    const out = await debug.handler({
      symptom: 'kai-submit event is not firing when I listen on document',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/directly on the element|non-bubbling/i);
  });

  // ── Rule 5: SSR / server component ─────────────────────────────────────
  it('SSR symptom → client-only registration fix', async () => {
    const out = await debug.handler({
      symptom: 'document is not defined when using kai-chat in a Next.js server component',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/client.only|client-side|dynamic.import|import.*elements/i);
  });

  // ── Fallback: no rule matches ───────────────────────────────────────────
  it('unrelated symptom → fallback mentioning component_reference', async () => {
    const out = await debug.handler({
      symptom: 'the background color of my button looks wrong in dark mode',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/component_reference/i);
  });

  // ── False-positive guards ────────────────────────────────────────────────
  it('"pushing a button" does NOT trigger the in-place-mutation rule', async () => {
    const out = await debug.handler({
      symptom: 'pushing a button does nothing visible',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must NOT match mutation rule (no "new array" / "new reference" fix)
    expect(text).not.toMatch(/In-place mutation|new array|new reference/i);
  });

  it('generic React hydration question does NOT trigger the SSR rule', async () => {
    const out = await debug.handler({
      symptom: 'React hydration mismatch error in my app',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must NOT match SSR rule (no web-component/kai context)
    expect(text).not.toMatch(/SSR.*server-side|client.only.*registration/i);
  });

  it('"hydration" with a kai-chat context DOES trigger the SSR rule', async () => {
    const out = await debug.handler({
      symptom: 'hydration error when using kai-chat in Next.js',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/client.only|client-side|dynamic.import/i);
  });

  // Confirm existing test still passes after push\b tightening
  it('"messages don\'t update when I push" still triggers mutation rule', async () => {
    const out = await debug.handler({
      symptom: "messages don't update when I push",
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/new array|new reference/i);
  });

  // ── Rule 6: custom elements not registered / renders nothing ───────────────
  it('React wrapper renders nothing / empty → elements-not-registered fix', async () => {
    const out = await debug.handler({
      symptom:
        'Using the React wrapper, the kai-chat element renders nothing / appears empty. ' +
        'How do I register the custom elements?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/@kitn\.ai\/ui\/elements/);
  });

  it('"renders nothing" + "not registered" → elements-not-registered fix', async () => {
    const out = await debug.handler({
      symptom: 'kai-chat renders nothing — customElements.get returns undefined, element not registered',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/Custom elements not registered|elements-not-registered|@kitn\.ai\/ui\/elements/i);
  });

  it('generic "empty" symptom without render context does NOT fire Rule 6', async () => {
    const out = await debug.handler({
      symptom: 'the data array is empty after fetch',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).not.toMatch(/Custom elements not registered/i);
  });

  // ── Rule 7: tsc errors inside node_modules/@kitn.ai/ui/src ─────────────────
  it('tsc TS2786 Show error in @kitn.ai/ui → tsc-source-pull paths/stub fix', async () => {
    const out = await debug.handler({
      symptom:
        'node_modules/@kitn.ai/ui/src/ui/Chat.tsx error TS2786: Show cannot be used as a JSX component',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/paths|kitn-elements\.d\.ts|skipLibCheck/i);
  });

  // ── Rule 8: fetch('/api/chat') 404 in Vite SPA ────────────────────────────
  it("fetch('/api/chat') 404 in Vite app → vite-api-404 mock/express/next fix", async () => {
    const out = await debug.handler({
      symptom: "fetch('/api/chat') returns 404 in my Vite app",
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/mock|Next\.?js|express|proxy/i);
  });

  // ── Rule 9: bundle footprint / reduce bundle size ─────────────────────────
  it('bundle size symptom → explains three load modes (register-all, per-element, autoloader)', async () => {
    const out = await debug.handler({
      symptom: 'How do I reduce bundle size? How much does @kitn.ai/ui add?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // must explain register-all (default)
    expect(text).toMatch(/@kitn\.ai\/ui\/elements/);
    // must explain per-element imports with an example
    expect(text).toMatch(/@kitn\.ai\/ui\/elements\/chat/);
    // must explain the autoloader, positioned as CDN-only (not a bundler import)
    expect(text).toMatch(/autoloader/i);
    expect(text).toMatch(/CDN|not importable through a bundler/i);
  });

  it('tree-shaking symptom → bundle-footprint rule fires', async () => {
    const out = await debug.handler({
      symptom: 'How do I tree-shake @kitn.ai/ui to only import the elements I need?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/per.?element|elements\/chat/i);
  });

  it('CDN / no-build autoloader symptom → bundle-footprint rule fires', async () => {
    const out = await debug.handler({
      symptom: 'I have a no-build CDN page. Can I avoid downloading all elements up front?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/autoloader/i);
  });

  it('bundle-footprint rule mentions SSR constraint for per-element + autoloader', async () => {
    const out = await debug.handler({
      symptom: 'reduce bundle size footprint for @kitn.ai/ui',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // SSR safety note must appear
    expect(text).toMatch(/SSR|client.only/i);
    // register-all is flagged as the SSR-safe default
    expect(text).toMatch(/register.all|elements['"].*registers/i);
  });

  it('generic bundle question without kai context does NOT fire bundle-footprint rule', async () => {
    const out = await debug.handler({
      symptom: 'My webpack bundle is too large after adding lodash',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Must NOT match the bundle-footprint fix (no kai-* context)
    expect(text).not.toMatch(/per.?element import|@kitn\.ai\/ui\/elements\/chat|autoloader/i);
  });

  // ── Rule 10: toast is imperative (no <kai-toast> to place) ─────────────────
  it('placing a <kai-toast> element → toast-imperative fix (call toast(), region auto-mounts)', async () => {
    const out = await debug.handler({
      snippet: '<kai-toast message="Saved"></kai-toast>',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/imperative|toast\(/i);
    // names the correct import path(s)
    expect(text).toMatch(/@kitn\.ai\/ui\/elements|@kitn\.ai\/ui/);
    // explains the region auto-mounts (no hand-placed element)
    expect(text).toMatch(/auto.?mount|kai-toast-region/i);
  });

  it('"how do I show a toast" with kai context → toast-imperative fix', async () => {
    const out = await debug.handler({
      symptom: 'How do I show a toast notification in my kai-chat app?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/toast\(/);
    expect(text).toMatch(/imperative/i);
  });

  it('generic "toast" with no kai/show context does NOT fire toast-imperative rule', async () => {
    const out = await debug.handler({
      symptom: 'I had toast for breakfast',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).not.toMatch(/imperative call|no .*<kai-toast>/i);
  });

  // ── Rule 11: dismissed cards are deferred (reopenable stub), not deleted ────
  it('filtering dismissed cards out → card-dismiss-deferred fix (keep them, use dismissRecovery)', async () => {
    const out = await debug.handler({
      symptom: 'When a card is dismissed should I filter the dismissed envelope out of my cards array?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/deferred|reopenable stub|not deleted/i);
    expect(text).toMatch(/dismissRecovery/);
  });

  it('"card disappears when dismissed / how to reopen" → card-dismiss-deferred fix', async () => {
    const out = await debug.handler({
      symptom: 'My kai-cards card just disappears when dismissed — how do I let the user reopen it?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/dismissRecovery|reopen/i);
  });

  it('generic "dismiss a modal" without card context does NOT fire card-dismiss-deferred', async () => {
    const out = await debug.handler({
      symptom: 'How do I dismiss a modal dialog on escape?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).not.toMatch(/dismissRecovery|reopenable stub/i);
  });

  // ── Rule 12: kai-compare contract ──────────────────────────────────────────
  it('kai-compare snippet → compare-contract fix (data JS prop, stream both, terminal pick)', async () => {
    const out = await debug.handler({
      snippet: '<kai-compare data="[...]"></kai-compare>',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // data is a JS property
    expect(text).toMatch(/JS PROPERTY|property/i);
    // exactly two candidates
    expect(text).toMatch(/two candidates|exactly two/i);
    // the terminal select event
    expect(text).toMatch(/kai-compare-select/);
  });

  it('"compare two responses" with preference context → compare-contract fix', async () => {
    const out = await debug.handler({
      symptom: 'I want to compare two candidate responses and record which one the user prefers in kai',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/kai-compare/);
    expect(text).toMatch(/chosenId|rejectedIds/);
  });

  it('"fresh data ref per chunk" guidance present for streaming both compare columns', async () => {
    const out = await debug.handler({
      symptom: 'kai-compare candidates do not re-render while streaming',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // streaming needs a NEW data reference per chunk (mirrors the chat rule)
    expect(text).toMatch(/NEW .*reference|new object per chunk|fresh `data`/i);
  });

  it('generic "compare two strings" without kai context does NOT fire compare-contract', async () => {
    const out = await debug.handler({
      symptom: 'How do I compare two strings for equality in JavaScript?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).not.toMatch(/kai-compare|kai-compare-select/i);
  });

  // ── Rule 13: kai-composer is bare — attachments/send live on kai-prompt-input ──
  it('"attach a file in kai-composer" → composer-attachments fix (reach for kai-prompt-input)', async () => {
    const out = await debug.handler({
      symptom: 'How does a user attach a file in kai-composer? I cannot find an attachment prop or a paperclip.',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/kai-prompt-input/);
    expect(text).toMatch(/bare editing surface|no attachment/i);
  });

  it('"kai-composer has no send button" → composer-attachments fix', async () => {
    const out = await debug.handler({
      symptom: 'kai-composer has no send button — where is it?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/kai-prompt-input/);
  });

  it('generic "attach a file" without composer/kai context does NOT fire composer-attachments', async () => {
    const out = await debug.handler({
      symptom: 'How do I attach a file to an email in JavaScript?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).not.toMatch(/kai-prompt-input/);
  });

  // ── Rule 14: blob: attachment URLs — the wire refuses them; use a data: URI ──
  it('URL.createObjectURL in an attachment snippet → attachment-blob-url fix (data: URI)', async () => {
    const out = await debug.handler({
      snippet: "return { id, type: 'file', filename: file.name, url: URL.createObjectURL(file) };",
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/data:/);
    expect(text).toMatch(/readAsDataURL|FileReader/i);
  });

  it('"wire refuses my blob: attachment url" → attachment-blob-url fix', async () => {
    const out = await debug.handler({
      symptom: 'toOpenAIMessages throws on my attachment — it refuses a blob: URL',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/data: URI|data URI/i);
  });

  it('generic blob question without attachment/kai context does NOT fire attachment-blob-url', async () => {
    const out = await debug.handler({
      symptom: 'How do I download a blob from S3 in Node?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).not.toMatch(/readAsDataURL|data: URI/i);
  });

  // ── Rule 15: mock tool calls — MockTurn.toolCalls, and the HOST resolves them ──
  it('"make createMockResponder emit a tool call" → mock-tool-calls fix (MockTurn.toolCalls)', async () => {
    const out = await debug.handler({
      symptom: 'How do I make createMockResponder emit a tool call?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/toolCalls/);
    expect(text).toMatch(/upsertTool/);
  });

  it('"mock tool call stuck in input-available" → mock-tool-calls fix (host resolves it)', async () => {
    const out = await debug.handler({
      symptom: 'my mock tool call is stuck in input-available and never shows output in kai-chat',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/output-available/);
    expect(text).toMatch(/upsertTool/);
  });

  it('generic "mock a function in tests" does NOT fire mock-tool-calls', async () => {
    const out = await debug.handler({
      symptom: 'How do I mock a function with vitest?',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // The intent is "the PATTERN did not fire", not "the words never appear":
    // the no-match fallback legitimately names createMockResponder as a
    // component_reference pointer (F-52), so assert the response IS the
    // fallback and carries none of the pattern's own fix text.
    expect(text).toMatch(/^No known failure pattern matched/);
    expect(text).not.toContain('Scripting mock tool calls');
    expect(text).not.toContain('announce-then-arguments');
  });
});
