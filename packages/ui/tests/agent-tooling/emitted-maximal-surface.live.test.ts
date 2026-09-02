/**
 * RUN the scaffolder's MAXIMAL surface — the composed markup, not a bare <kai-chat>.
 *
 * WHY THIS EXISTS
 * ---------------
 * The other two guards in this project execute the emitted `src/main.ts`, but both
 * mount it against a hand-written `<kai-chat id="chat">`. That is fine for what
 * they check (the card round trip, the zero-config stream) and it means the other
 * half of the emit — `componentTags`, the markup — is executed by nothing. So the
 * one cell where the workspace split, the tool loop and the card registry all land
 * in the same file is COMPILED and never RUN.
 *
 * That gap has already cost a real bug. When `every-capability` was added to the
 * verify:scaffold axis it failed to compile in 33 cells, because every renderer's
 * workspace branch emitted the split and RETURNED, dropping standalone companions
 * on the floor. React, Next and TanStack failed TS6133 on the now-unused import —
 * but vue, svelte, angular and html COMPILED CLEAN AND RENDERED NOTHING. Four of
 * seven frameworks were caught by the compiler; the silent three needed execution,
 * and there was none. `create-kai` now calls `renderSurface` directly and its whole
 * promise is that a scaffold runs on first `npm run dev`, so the maximal surface is
 * both the most likely to be wrong and the most expensive to get wrong.
 *
 * WHAT MAKES THIS DIFFERENT FROM `verify:scaffold`
 * -----------------------------------------------
 * `verify:scaffold` compiles this exact cell under eight consumer tsconfigs.
 * Compilation cannot see a dropped tag: markup lives in a string literal, so a
 * surface that emits the split and forgets its companions is type-correct. Nor can
 * `scaffold.test.ts`, which asserts the WORDING of those literals. The only layer
 * that can tell a composed surface from a plausible-looking one is the one that
 * puts it in a document and looks at what upgraded.
 *
 * WHAT IS ASSERTED, AND WHY EACH IS EXECUTION RATHER THAN TEXT
 * -----------------------------------------------------------
 * Every DOM claim below is scoped to something the LIVE component produces, never
 * to a string that was already in the emitted markup:
 *
 *   · `slot="p0"` / `slot="p1"` are NOT in the emit. `<kai-resizable>` writes them
 *     onto its light-DOM children when it renders, so asserting the chat pane is
 *     p0 and the artifact pane is p1 proves the split composed — an innerHTML that
 *     never upgraded carries neither.
 *   · `data-min-size` / `data-default-size-pct` on the shadow panels are PARSED
 *     from the emitted `min="240px"` / `size="40%"` attributes. They prove the
 *     emitted numbers reached the layout, not merely the document.
 *   · The `kai-sources` assertion reads the ANCHORS its shadow root renders from
 *     the `sampleSources` array the emitted module assigns. That is the companion
 *     check with teeth: it needs the tag to have survived `componentTags` AND the
 *     emitted module to have found `#sources` and populated it.
 *
 * That last one is the one that goes red for the historical bug, and it goes red
 * twice over: with companions dropped, `document.getElementById('sources')` is
 * null, so the emitted `sourcesEl.sources = sampleSources` throws inside `init()`
 * BEFORE `chat.addEventListener('kai-submit')` is reached — the surface loses its
 * sources AND stops responding to input at all. Watched failing; see the commit.
 *
 * DELIBERATELY NOT ASSERTED IN THE MARKUP STRING. There is no
 * `expect(markup).toContain('kai-sources')` guard. It would be the cheaper check
 * and it would fail FIRST, masking the runtime failure and quietly turning this
 * file back into the wording test it exists to replace.
 *
 * THE SURFACE IS DERIVED, NOT RESTATED. `listSurfaceProbes()` owns the axis that
 * `verify:scaffold` compiles; the maximal cell is taken from it by size and then
 * checked to cover every capability group. Hard-coding the seven tags would let
 * the axis grow a capability that this file silently stopped composing.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../../mcp/mcp/tools/scaffold';
import { listCapabilityGroups, listSurfaceProbes } from '../../mcp/archetypes';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** Outside `tests/` and outside `src/` — see emitted-card-path.live.test.ts. */
const TMP_DIR = resolve(PKG, '.tmp-emitted-maximal');

// jsdom gaps this surface walks into, as no-op stubs: the stick-to-bottom primitive
// calls scrollTo from a rAF (kai-chat), and the disclosures measure with a
// ResizeObserver (kai-reasoning). Same stubs `element-methods-runtime.test.tsx`
// uses, and nothing here asserts scroll position or height.
//
// They are load-bearing for a reason worth naming: the emitted tool loop wraps its
// rounds in try/catch, so a missing ResizeObserver does not surface as a crash — it
// is swallowed into `stream.abort()` and reads as "the model turn failed". Measured,
// not assumed: without these stubs this test's turn stopped after round 1 with the
// message on console.error and no tool part on the thread.
const proto = Element.prototype as unknown as Record<string, unknown>;
proto.scrollTo ??= () => {};
proto.scrollIntoView ??= () => {};
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
// jsdom implements neither half of the object-URL API. This stub is DEFENSIVE
// ONLY, and the distinction matters to anyone mutating this file to check it
// still discriminates.
//
// The emitted attachment bridge used to call createObjectURL. It does not any
// more: `toAttachment` reads every file with FileReader.readAsDataURL and stages
// a `data:` URI, because an object URL resolves only inside the tab that minted
// it and the wire encoder refuses one. Measured rather than assumed — replacing
// this stub with a thrower leaves all 3 tests in this project GREEN, so nothing
// on this surface reaches it today. It is kept because other components here
// (voice output, image previews) can, and a jsdom gap reads as a crash.
//
// SO: breaking createObjectURL does NOT test the staging bridge. The mutation
// that does is `FileReader.prototype.readAsDataURL`, which fires the "a dropped
// file never reached <kai-attachments>" assertion below; breaking
// `toOpenAIMessages` instead fires the round assertion. Those two are the
// layered check, and they were watched failing separately.
(globalThis.URL as unknown as { createObjectURL?: unknown }).createObjectURL ??= () => 'blob:kai-test';
(globalThis.URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL ??= () => {};

const SEP = '// ── src/main.ts ──';

/**
 * The package's own exports map, applied by hand — same rewriter as the other two
 * guards, with ONE difference: `@kitn.ai/ui/elements` resolves to `dist/kai.es.js`,
 * the register-ALL bundle, and this surface needs six tags rather than one. The
 * others point it at `src/elements/chat` because `<kai-chat>` is all they mount;
 * doing that here would leave kai-resizable / kai-artifact / kai-sources /
 * kai-voice-input as unupgraded unknown elements and every assertion below would be
 * testing inert markup. `register-impl` is that bundle's source-tree entry point.
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
        .replace("'@kitn.ai/ui/wire'", `'${PKG}/src/wire'`)
        .replace("'@kitn.ai/ui/schemas'", `'${PKG}/src/schemas'`),
    )
    // Both KaiChatElement and KaiSourcesElement appear on this surface.
    .map((l) => l.replace(/\bas Kai\w+Element\b/g, 'as any'))
    .join('\n');
}

const sse = (frames: unknown[]) =>
  `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`;

/** Round one: the model thinks out loud, then calls the emitted `search` tool. */
const ROUND_1 = sse([
  { choices: [{ delta: { reasoning: 'The user wants current data, so I should search.' } }] },
  {
    choices: [
      {
        delta: {
          tool_calls: [
            { index: 0, id: 'call_s1', type: 'function', function: { name: 'search', arguments: '' } },
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
            { index: 0, function: { arguments: JSON.stringify({ query: 'kitn ui release notes' }) } },
          ],
        },
      },
    ],
  },
  { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
]);

/** Round two: the model answers from the tool result and stops, so the loop exits. */
const ROUND_2 = sse([
  { choices: [{ delta: { content: 'Here is what I found in the release notes.' } }] },
  { choices: [{ delta: {}, finish_reason: 'stop' }] },
]);

/** The element, asserted PRESENT and UPGRADED — an un-upgraded tag has no shadow root. */
function upgraded(tag: string, why: string): HTMLElement & { shadowRoot: ShadowRoot } {
  const el = document.querySelector(tag) as HTMLElement | null;
  expect(el, `<${tag}> is not in the composed surface at all — ${why}`).not.toBeNull();
  expect(
    el!.shadowRoot,
    `<${tag}> is in the document but never upgraded, so nothing it renders is on screen`,
  ).not.toBeNull();
  return el as HTMLElement & { shadowRoot: ShadowRoot };
}

describe('the EMITTED maximal surface really composes, end to end', () => {
  it('workspace split + companions + tool loop, all in one document', async () => {
    // ── the surface, DERIVED from the axis verify:scaffold compiles ──────────────
    const maximal = listSurfaceProbes().reduce((a, b) =>
      b.components.length > a.components.length ? b : a,
    );
    // The "maximal" claim, made checkable: if the axis ever degenerates so the
    // largest probe stops covering a capability, this fails instead of quietly
    // composing less than the name promises.
    for (const group of listCapabilityGroups()) {
      for (const tag of group.components) {
        expect(
          maximal.components,
          `the largest surface probe (${maximal.id}) omits ${tag}, so it is not maximal`,
        ).toContain(tag);
      }
    }

    const out = await scaffold.handler({
      components: [...maximal.components],
      integration: 'openrouter',
      placement: 'full-page',
      framework: 'html',
    });
    const text = (out.content as { type: string; text: string }[])[0].text;
    const front = text.split('=== (2) BACKEND ROUTE ===')[0];
    const at = front.indexOf(SEP);
    expect(at, 'the html target emits no src/main.ts module').toBeGreaterThan(-1);

    // Block (1) is TWO files. Both halves are used here — that is the point of the
    // file: the markup comes from `componentTags`, not from this test.
    const indexHtml = front.slice(0, at);
    const main = front.slice(front.indexOf('\n', at) + 1);
    const markup = indexHtml.slice(0, indexHtml.indexOf('<script'));

    // Fail here rather than at a DOM assertion if the workspace branch vanished
    // ENTIRELY — that regression would otherwise read as "kai-resizable did not
    // upgrade". Scoped to the split on purpose: the companions are checked by
    // execution below, never by matching this string (see the header).
    expect(markup, 'the maximal surface emits no workspace split').toContain('<kai-resizable');
    expect(main, 'the emitted module must wire the sources companion').toContain(
      "document.getElementById('sources')",
    );

    // The markup half, VERBATIM. The parser runs before the deferred module, which
    // is the order the emitted code documents and depends on.
    document.body.innerHTML = markup;

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
      await new Promise((r) => setTimeout(r, 50));

      // ── 1. THE SPLIT COMPOSED ───────────────────────────────────────────────
      // Read off the live element's own shadow DOM, so this cannot be satisfied by
      // the emitted tags sitting inert in the document.
      const resizable = upgraded('kai-resizable', 'the workspace split was not emitted');
      const root = resizable.shadowRoot.querySelector('[data-resizable-root]');
      expect(root, 'kai-resizable upgraded but rendered no panel root').not.toBeNull();
      expect(root!.getAttribute('data-orientation')).toBe('horizontal');
      const panels = resizable.shadowRoot.querySelectorAll('[data-panel]');
      expect(panels, 'a split needs exactly two panes').toHaveLength(2);
      expect(
        resizable.shadowRoot.querySelectorAll('[role="separator"]'),
        'no drag separator between the panes — the split is not resizable',
      ).toHaveLength(1);
      // PARSED from the emitted `size="40%" min="240px"`, not restated by the emit:
      // these attributes exist only because the component read those values.
      expect(panels[0].getAttribute('data-default-size-pct')).toBe('40');
      expect(panels[0].getAttribute('data-min-size')).toBe('240');
      expect(panels[1].getAttribute('data-min-size')).toBe('280');

      // ── 2. CHAT LEFT, ARTIFACT RIGHT ────────────────────────────────────────
      // `slot` is written by kai-resizable at render time and appears nowhere in
      // the emit, so this is the assignment the LIVE component made.
      const chatEl = document.getElementById('chat') as HTMLElement & {
        messages: { role: string; parts: { type: string; text?: string }[] }[];
        loading: boolean;
      };
      const artifact = upgraded('kai-artifact', 'the workspace preview pane was not emitted');
      expect(
        chatEl.closest('kai-resizable-item')?.getAttribute('slot'),
        'the chat is not slotted into the first pane',
      ).toBe('p0');
      expect(
        artifact.closest('kai-resizable-item')?.getAttribute('slot'),
        'the artifact is not slotted into the second pane',
      ).toBe('p1');
      expect(
        artifact.shadowRoot.querySelector('[data-artifact-toolbar]'),
        'kai-artifact upgraded but drew no toolbar',
      ).not.toBeNull();

      // ── 3. THE COMPANIONS SURVIVED THE SPLIT ────────────────────────────────
      // THE REGRESSION THIS FILE EXISTS FOR. A workspace branch that emits the
      // split and returns leaves both of these out of the document entirely.
      const sources = upgraded(
        'kai-sources',
        'the workspace branch dropped the standalone companions (the 33-cell bug)',
      );
      // Not "kai-sources rendered something": the two hrefs the EMITTED module put
      // on it. This needs the tag to have survived AND the module to have found it.
      const links = [...sources.shadowRoot.querySelectorAll('a[href]')].map((a) =>
        a.getAttribute('href'),
      );
      expect(links).toEqual(['https://example.com/doc1', 'https://example.com/doc2']);

      const voice = upgraded(
        'kai-voice-input',
        'the workspace branch dropped the standalone companions (the 33-cell bug)',
      );
      expect(
        voice.shadowRoot.querySelector('button[aria-label="Voice input"]'),
        'kai-voice-input upgraded but drew no control',
      ).not.toBeNull();

      // ── 3b. THE ATTACHMENT STAGING LOOP RUNS ────────────────────────────────
      // The emitted dropzone is listened to, the staged list is populated from
      // that listener, and the chip is drawn by the LIVE <kai-attachments> — none
      // of which any string in the emit can demonstrate. `verify:scaffold` compiles
      // all seven renderers' version of this; only execution says it works.
      const upload = upgraded('kai-file-upload', 'the attachment dropzone was not emitted');
      const attachmentsEl = upgraded('kai-attachments', 'the staged-attachment list was not emitted');
      expect(
        upload.shadowRoot.textContent,
        'kai-file-upload upgraded but drew no dropzone label',
      ).toContain('drop files');

      // The element's own event, with its own detail shape. The emitted module's
      // listener is what turns this into an AttachmentData and assigns `.items`.
      upload.dispatchEvent(
        new CustomEvent('kai-files-added', {
          detail: { files: [new File(['%PDF-1.4'], 'quarterly-report.pdf', { type: 'application/pdf' })] },
        }),
      );
      await new Promise((r) => setTimeout(r, 20));
      expect(
        attachmentsEl.shadowRoot.textContent,
        'a dropped file never reached <kai-attachments> — the dropzone is mounted but nothing stages',
      ).toContain('quarterly-report.pdf');

      // ── 4. THE TOOL LOOP RUNS INSIDE THE COMPOSED SURFACE ───────────────────
      // `attachments` is on the real detail every time — <kai-chat> always sends
      // `{ value, attachments }` — and it carries a file here on purpose: the
      // emitted handler merges the composer's own paperclip with the dropzone, and
      // a synthetic event that omitted the field would let a regression to reading
      // only one of them pass.
      // The attachment carries a `data:` URI because that is what the composer
      // now stages — `DefaultPromptInput` reads every file with
      // FileReader.readAsDataURL. It used to be a bare {id,type,filename} here,
      // which was realistic when `file` parts never reached the wire and stopped
      // being realistic the moment they did: the encoder refuses an attachment
      // with no bytes and no address, so a fixture without one would assert a
      // shape the product cannot produce.
      chatEl.dispatchEvent(
        new CustomEvent('kai-submit', {
          detail: {
            value: 'what shipped lately?',
            attachments: [
              {
                id: 'from-composer',
                type: 'file',
                filename: 'notes.png',
                mediaType: 'image/png',
                url: 'data:image/png;base64,iVBORw0KGgo=',
              },
            ],
          },
        }),
      );
      for (let i = 0; i < 400 && (round < 2 || chatEl.loading !== false); i += 1) {
        await new Promise((r) => setTimeout(r, 10));
      }
      await new Promise((r) => setTimeout(r, 50));

      expect(round, 'the emitted tool loop did not run a second round').toBe(2);
      // The tools array really went to the model, from a surface built by markup
      // this test never wrote.
      const sent = JSON.parse(bodies[0]) as { tools: { function: { name: string } }[] };
      expect(sent.tools.map((t) => t.function.name)).toContain('search');

      // The thread carries all three part kinds the maximal surface promises.
      const parts = chatEl.messages[1].parts;
      expect(parts.map((p) => p.type)).toEqual(['reasoning', 'tool', 'text']);

      // THE USER TURN CARRIES BOTH STAGED FILES, ahead of its text. This is the
      // assertion the whole capability exists for: mounting the dropzone and
      // drawing the chip are worth nothing if the submit drops the files, which is
      // exactly what every scaffold did before — `kai-submit` has always carried
      // `attachments` and every emitted handler read only `.value`.
      const userParts = chatEl.messages[0].parts;
      expect(
        userParts.map((p) => p.type),
        'the staged files did not reach the outgoing message as `file` parts',
      ).toEqual(['file', 'file', 'text']);
      // The two SOURCES, not just two parts: the dropzone's file and the one the
      // composer's own paperclip put on the event. Reading either alone passes a
      // count check and still loses half the user's attachments.
      expect(
        userParts
          .filter((p): p is { type: 'file'; attachment: { filename?: string } } => p.type === 'file')
          .map((p) => p.attachment.filename),
      ).toEqual(['quarterly-report.pdf', 'notes.png']);
      // Staging is emptied by the submit, so the next message does not re-send them.
      expect(
        attachmentsEl.shadowRoot.textContent,
        'the staged list still shows a sent file — the next message would attach it again',
      ).not.toContain('quarterly-report.pdf');

      // ── 5. IT IS ON SCREEN, IN THE CHAT PANE ────────────────────────────────
      // Scoped to the thread's own rendered nodes rather than the whole shadow
      // root: kai-chat adopts a stylesheet AND the composer injects a <style>
      // block, so an unscoped textContent match can be satisfied by CSS text.
      const rendered = [...chatEl.shadowRoot!.children]
        .filter((el) => el.tagName !== 'STYLE')
        .map((el) => el.textContent ?? '')
        .join(' ');
      expect(rendered, 'the reasoning part never reached the thread').toContain(
        'The user wants current data, so I should search.',
      );
      // The tool panel's own rendering of the call: the model's argument, the
      // result `runTool` returned, and the provider's call id.
      expect(rendered, 'the tool panel did not render the model input').toContain(
        'query: kitn ui release notes',
      );
      expect(rendered, 'the tool panel did not render the tool result').toContain(
        'No search backend wired up yet. Query: kitn ui release notes',
      );
      expect(rendered).toContain('call_s1');
      expect(rendered, 'the final answer never reached the thread').toContain(
        'Here is what I found in the release notes.',
      );
      expect(chatEl.loading, 'the turn never settled, so the composer stays locked').toBe(false);
    } finally {
      rmSync(TMP_DIR, { recursive: true, force: true });
      (globalThis as unknown as { fetch: unknown }).fetch = realFetch;
    }
  });
});
