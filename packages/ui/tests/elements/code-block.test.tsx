/**
 * `<kai-code-block>` — one syntax-highlighted code block.
 *
 * WHY THIS FILE EXISTS. Before it, kai-code-block was on
 * `element-coverage.test.ts`'s punch list under the worst of its two kinds —
 * `nothing`: no test, no element story, its only mention anywhere a comment in the
 * react prop table. Nothing anywhere imported `CodeBlock` or `CodeBlockCode` from a
 * test either. So an element that runs an ASYNCHRONOUS highlighter over
 * MODEL-AUTHORED text and then hands the result to `innerHTML` had no automated
 * exercise of any kind.
 *
 * That combination is the interesting one, and it is why the two halves below are
 * each their own group:
 *
 *   · `innerHTML` + model-authored source is a sink, so the untrusted-output rule
 *     applies (`markdown-xss.test.tsx`): the hostile text must render VISIBLE and
 *     INERT, in BOTH phases. Escaping is the correct rendering; a filter that
 *     deleted the text would pass the security assertion while being a worse UI —
 *     and for a code block it would also be a lie about what the model wrote.
 *
 *   · The highlight is async, which means there are two paints, and the FIRST one is
 *     the one a reader sees. A `<Show>` whose fallback were a spinner or nothing at
 *     all would give every code block a blank flash on arrival. The fallback here is
 *     the real code in a plain `<pre>`, and that is a contract worth pinning.
 *
 * SHIKI REALLY RUNS UNDER JSDOM. `tests/primitives/highlighter.test.ts` already
 * proves it (JS regex engine, no WASM), so the post-highlight state below is
 * asserted for real rather than stubbed — no structural stand-in is needed. What IS
 * asynchronous is when it lands, so every post-highlight assertion polls instead of
 * sleeping a guessed interval.
 */
import { flush as flushSync } from 'solid-js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../src/elements/code-block';
import { CodeBlock, CodeBlockCode } from '../../src/components/code-block';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

type CodeBlock = HTMLElement & Record<string, unknown> & { code?: string; language?: string };

/** Mount with properties assigned BEFORE connect, the ordering a scaffold emits. */
function create(props: Record<string, unknown>): CodeBlock {
  const el = document.createElement('kai-code-block') as CodeBlock;
  Object.assign(el, props);
  return el;
}

const shadow = (el: CodeBlock) => el.shadowRoot!;
/** The scrollable code region — `tabindex=0` for axe's scrollable-region-focusable. */
const region = (el: CodeBlock) => shadow(el).querySelector('[tabindex="0"]') as HTMLElement;
/** Shiki's own output, distinguishable from the plain fallback by its class. */
const shikiPre = (el: CodeBlock) => shadow(el).querySelector('pre.shiki') as HTMLElement | null;

/**
 * Poll until `check` holds. Shiki's FIRST call also builds the highlighter core and
 * dynamically imports the engine, the theme and the grammar, so the latency is real
 * and variable; a fixed sleep would be either flaky or slow, and both would be a
 * worse test than waiting for the fact itself.
 */
async function until(check: () => boolean, what: string, ms = 4000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

/** Every element the block actually created, so an injected tag cannot hide. */
const tags = (root: ParentNode) => new Set([...root.querySelectorAll('*')].map((n) => n.tagName.toLowerCase()));
/** Any live event-handler attribute anywhere under `root`. */
const handlerAttrs = (root: ParentNode) =>
  [...root.querySelectorAll('*')].flatMap((n) => [...n.attributes].map((a) => a.name)).filter((n) => /^on/i.test(n));

// ---------------------------------------------------------------------------
// The two paints
// ---------------------------------------------------------------------------

describe('the code is painted BEFORE the highlighter resolves — no blank flash', () => {
  const CODE = 'const answer = 42;\nexport default answer;';

  test('the first paint already contains the code, synchronously with connect', async () => {
    // Not "eventually": the element upgrades and renders inside appendChild, and the
    // highlight cannot possibly have resolved by then (it has not even been awaited
    // once). Reading synchronously is what makes this an assertion about the FIRST
    // paint rather than about whichever paint the test happened to catch.
    const el = create({ code: CODE, language: 'ts' });
    document.body.appendChild(el);

    expect(shikiPre(el), 'the highlight cannot have landed yet').toBeNull();
    expect(region(el), 'the code region must exist on the first paint').not.toBeNull();
    expect(region(el).querySelector('pre > code')).not.toBeNull();
    expect(region(el).textContent).toBe(CODE);
  });

  test('the highlight then lands, and the code text is UNCHANGED by it', async () => {
    // The pair. Without it, "the first paint has the code" would be satisfied by an
    // element whose highlighter never runs at all.
    const el = create({ code: CODE, language: 'ts' });
    document.body.appendChild(el);
    const before = region(el).textContent;

    await until(() => shikiPre(el) !== null, 'shiki markup to replace the plain fallback');

    expect(shikiPre(el)!.querySelectorAll('span').length, 'real tokens, not one blob').toBeGreaterThan(1);
    expect(region(el).textContent, 'highlighting must not rewrite the source').toBe(before);
    expect(region(el).textContent).toBe(CODE);
  });

  test('the code region stays keyboard-reachable across both paints', async () => {
    // The region scrolls horizontally, so axe requires it to be focusable; it is
    // rebuilt when the highlight lands, which is exactly when an attribute like this
    // gets dropped.
    const el = create({ code: CODE, language: 'ts' });
    document.body.appendChild(el);
    expect(region(el).getAttribute('tabindex')).toBe('0');

    await until(() => shikiPre(el) !== null, 'shiki markup');
    expect(region(el).getAttribute('tabindex')).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Hostile, model-authored source
// ---------------------------------------------------------------------------

describe('hostile code renders VISIBLE and INERT, in BOTH paints', () => {
  // The threat model is not a hostile provider: an attacker only has to influence
  // the model's OUTPUT, and "show me an HTML snippet" is a request people make of
  // coding assistants constantly. A code block is the one surface where the hostile
  // string is also the LEGITIMATE content, so deleting it is not an option — the
  // only correct answer is to show it, escaped.
  const HOSTILE = '<script>alert(1)</script>\n<img src=x onerror="alert(1)">\n<a href="javascript:alert(1)">x</a>';

  test('first paint: escaped text, no script, no img, no link, no handler', async () => {
    const el = create({ code: HOSTILE, language: 'html' });
    document.body.appendChild(el);

    expect(shikiPre(el), 'this really is the pre-highlight paint').toBeNull();
    expect(tags(shadow(el)).has('script')).toBe(false);
    expect(tags(shadow(el)).has('img')).toBe(false);
    expect(tags(shadow(el)).has('a')).toBe(false);
    expect(handlerAttrs(shadow(el))).toEqual([]);
    // VISIBLE: the whole source, character for character.
    expect(region(el).textContent).toBe(HOSTILE);
  });

  test('after highlighting: same verdict, through the innerHTML path', async () => {
    // This is the paint that matters most, because it is the one that goes through
    // `innerHTML={highlighted()}` rather than through a text node.
    const el = create({ code: HOSTILE, language: 'html' });
    document.body.appendChild(el);
    await until(() => shikiPre(el) !== null, 'shiki markup');

    expect(tags(shadow(el)).has('script')).toBe(false);
    expect(tags(shadow(el)).has('img')).toBe(false);
    expect(tags(shadow(el)).has('a')).toBe(false);
    expect(handlerAttrs(shadow(el))).toEqual([]);
    expect(region(el).textContent, 'the source stays readable, escaped not deleted').toBe(HOSTILE);
  });

  test('THE CONTROL: the same census DOES see the elements the kit means to build', async () => {
    // Without this, every assertion above would pass against a block that renders
    // nothing. Shiki's own <span> tokens are elements the kit deliberately creates
    // from the same string, so their presence proves the census is live.
    const el = create({ code: HOSTILE, language: 'html' });
    document.body.appendChild(el);
    await until(() => shikiPre(el) !== null, 'shiki markup');
    expect(tags(shadow(el)).has('span')).toBe(true);
    expect(tags(shadow(el)).has('code')).toBe(true);
  });

  test('with highlighting OFF the hostile source is still text, not markup', async () => {
    // The other branch of the `<Show>`, and the one a host reaches by turning
    // highlighting off — it must not be the lenient one.
    const el = create({ code: HOSTILE, language: 'html', codeHighlight: false });
    document.body.appendChild(el);
    await flush();

    expect(tags(shadow(el)).has('script')).toBe(false);
    expect(tags(shadow(el)).has('img')).toBe(false);
    expect(handlerAttrs(shadow(el))).toEqual([]);
    expect(region(el).textContent).toBe(HOSTILE);
  });
});

// ---------------------------------------------------------------------------
// Language routing and graceful degradation
// ---------------------------------------------------------------------------

describe('language routing', () => {
  test('a registered language really gets highlighted, and an alias resolves', async () => {
    for (const language of ['typescript', 'ts', 'js', 'json']) {
      const el = create({ code: '{"a": 1}', language });
      document.body.appendChild(el);
      await until(() => shikiPre(el) !== null, `shiki markup for ${language}`);
      expect(shikiPre(el), `${language} must highlight`).not.toBeNull();
      el.remove();
    }
  });

  test('a language with NO grammar degrades to plain text, source intact', async () => {
    // Not an error, not an empty block, not a thrown promise: the same readable
    // `<pre><code>` the first paint used. A model naming a language the kit has never
    // heard of is the ordinary case, not an edge one.
    const code = 'IDENTIFICATION DIVISION.\nPROGRAM-ID. HELLO.';
    const el = create({ code, language: 'cobol' });
    document.body.appendChild(el);
    await flush();
    // Give the resource a real chance to resolve, so "still plain" is a settled
    // verdict rather than a race the test won.
    await new Promise((r) => setTimeout(r, 300));

    expect(shikiPre(el), 'no grammar means no shiki markup').toBeNull();
    expect(region(el).querySelector('pre > code')).not.toBeNull();
    expect(region(el).textContent).toBe(code);
  });

  test('switching to an unknown language falls back without losing the code', async () => {
    // The transition is the risky direction: the resource already holds highlighted
    // HTML, and the fallback has to win it back.
    const el = create({ code: 'const x = 1', language: 'ts' });
    document.body.appendChild(el);
    await until(() => shikiPre(el) !== null, 'shiki markup');

    el.language = 'cobol';
    await until(() => shikiPre(el) === null, 'the plain fallback to come back');
    expect(region(el).textContent).toBe('const x = 1');
  });

  test('`language` and `code-theme` route as ATTRIBUTES (they are scalars)', async () => {
    // The kai contract: only scalars work as HTML attributes. These two are the ones
    // a consumer writes in markup, so the attribute path is the one that must work.
    document.body.insertAdjacentHTML(
      'beforeend',
      '<kai-code-block id="cb" language="ts" code-theme="github-light" prose-size="lg"></kai-code-block>',
    );
    const el = document.getElementById('cb') as CodeBlock;
    el.code = 'const x = 1';
    await until(() => shikiPre(el) !== null, 'shiki markup');

    expect(shikiPre(el)!.classList.contains('github-light'), 'code-theme must reach shiki').toBe(true);
    expect(region(el).className, 'prose-size must reach the text sizing').toContain('text-base');
  });

  test('`code-highlight="false"` disables shiki entirely and never imports it', async () => {
    const el = create({ code: 'const x = 1', language: 'ts', codeHighlight: false });
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));

    expect(shikiPre(el)).toBeNull();
    expect(region(el).innerHTML).toBe('<pre><code>const x = 1</code></pre>');

    // Paired over the same shapes: the default really does highlight, so "no shiki"
    // is not passing because shiki never works in this harness.
    const on = create({ code: 'const x = 1', language: 'ts' });
    document.body.appendChild(on);
    await until(() => shikiPre(on) !== null, 'shiki markup with highlighting on');
  });

  test('empty code renders an empty block rather than throwing or vanishing', async () => {
    const el = create({ code: '' });
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));
    expect(region(el)).not.toBeNull();
    expect(region(el).textContent).toBe('');
  });

  test('a `code` property set BEFORE upgrade survives it', async () => {
    const el = document.createElement('kai-code-block') as CodeBlock;
    el.code = 'seeded before upgrade';
    document.body.appendChild(el);
    await flush();
    expect(region(el).textContent).toBe('seeded before upgrade');
  });
});

// ---------------------------------------------------------------------------
// The copy control
// ---------------------------------------------------------------------------

describe('the copy control', () => {
  /** A clipboard jsdom does not provide. Returns the spy so a test can read the call. */
  function stubClipboard() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    return writeText;
  }

  const copyButton = (el: CodeBlock) => shadow(el).querySelector('[part="copy"]') as HTMLButtonElement | null;

  test('the element ships the copy button its docs promise', async () => {
    // WAS A REAL, CONSUMER-FACING DEFECT: the promise and the element disagreed, and
    // the promise is the half that gets published.
    //
    //   · src/elements/code-block.tsx, the facade's own doc comment:
    //       "`<kai-code-block>` — one syntax-highlighted code block (with a copy button)."
    //   · docs/web-components.md (generated, and the file the docs site renders):
    //       "A single syntax-highlighted code block with a copy button."
    //
    // The facade rendered `<CodeBlock><CodeBlockCode/></CodeBlock>` and nothing else.
    // `CodeBlockGroup` — the flex row the button belongs in — existed and was used only
    // by a STORY, which supplied its own button. So the copy button was real in the
    // Solid layer's showcase and absent from the element every consumer is told to use.
    const el = create({ code: 'const x = 1', language: 'ts' });
    document.body.appendChild(el);
    await until(() => shikiPre(el) !== null, 'shiki markup');

    const copy = copyButton(el)!;
    expect(copy, 'kai-code-block must render the copy button its docs promise').not.toBeNull();
    expect(copy.tagName).toBe('BUTTON');
    expect(copy.getAttribute('type'), 'never a submit button inside a consumer form').toBe('button');
    expect(copy.getAttribute('aria-label')).toBe('Copy code');
  });

  test('it writes the RAW code, not the highlighted HTML', async () => {
    // THE assertion that makes the button correct rather than merely present. By the
    // time it is clicked the source has been through shiki, so the tempting
    // implementation — reading the rendered region — copies either `<span>`-laden HTML
    // or a text reconstruction, and the reconstruction is where trailing whitespace and
    // line endings quietly change. The clipboard gets the `code` property verbatim.
    //
    // The fixture is chosen to catch exactly that: a tab, a blank line, and a trailing
    // newline all survive a round trip through `textContent` unevenly.
    const CODE = 'const x = 1;\n\n\tconst y = 2;\n';
    const writeText = stubClipboard();

    const el = create({ code: CODE, language: 'ts' });
    document.body.appendChild(el);
    await until(() => shikiPre(el) !== null, 'shiki markup');

    copyButton(el)!.click();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    await flush();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe(CODE);
    expect(writeText.mock.calls[0][0]).not.toContain('<span');
    // Belt and braces on the thing that would silently differ: the rendered text is
    // NOT what was copied, and asserting that keeps the test honest if shiki's
    // whitespace handling ever changes.
    expect(writeText.mock.calls[0][0]).toBe(el.code);
  });

  test('it copies the CURRENT code after the property changes', async () => {
    // A stale closure over the initial `code` is the natural way to get this wrong,
    // and streaming replaces the property.
    const writeText = stubClipboard();
    const el = create({ code: 'first', language: 'ts' });
    document.body.appendChild(el);
    await flush();

    el.code = 'second';
    await flush();
    copyButton(el)!.click();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    await flush();

    expect(writeText.mock.calls[0][0]).toBe('second');
  });

  test('the copied state shows, then reverts on its own', async () => {
    // The affordance is only honest if it goes back: a button stuck on "Copied" tells
    // the next copy nothing happened.
    stubClipboard();
    vi.useFakeTimers();
    try {
      // Highlighting off so nothing async races the fake clock.
      const el = create({ code: 'const x = 1', language: 'ts', codeHighlight: false });
      document.body.appendChild(el);
      await vi.advanceTimersByTimeAsync(0);

      const copy = copyButton(el)!;
      expect(copy.getAttribute('aria-label')).toBe('Copy code');

      copy.click();
      flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
      await vi.advanceTimersByTimeAsync(0);
      expect(copyButton(el)!.getAttribute('aria-label'), 'the press must be acknowledged').toBe('Copied');

      await vi.advanceTimersByTimeAsync(3000);
      expect(copyButton(el)!.getAttribute('aria-label'), 'and it must revert').toBe('Copy code');
    } finally {
      vi.useRealTimers();
    }
  });

  test('the button is ALWAYS visible — never hover-gated', async () => {
    // A hover-only affordance fails touch outright and is undiscoverable everywhere
    // else. jsdom has no hover, so this pins the STRUCTURE that would implement one:
    // no opacity-0 / invisible / group-hover utility on the button or any ancestor
    // between it and the shadow root.
    const el = create({ code: 'const x = 1', language: 'ts' });
    document.body.appendChild(el);
    await until(() => shikiPre(el) !== null, 'shiki markup');

    // Asserted FIRST: with no button the walk below has nothing to iterate and the
    // empty offender list passes while checking nothing.
    expect(copyButton(el), 'the scan is not vacuous').not.toBeNull();

    const offenders: string[] = [];
    for (let n: Element | null = copyButton(el); n; n = n.parentElement) {
      for (const c of n.classList) {
        if (/^(opacity-0|invisible)$/.test(c) || c.startsWith('group-hover:') || c.startsWith('hover:opacity')) {
          offenders.push(`${n.tagName.toLowerCase()}.${c}`);
        }
      }
    }
    expect(offenders, 'the copy button must not be revealed on hover').toEqual([]);
  });

  test('the button sits in a header row, not over the code', async () => {
    const el = create({ code: 'const x = 1', language: 'ts' });
    document.body.appendChild(el);
    await until(() => shikiPre(el) !== null, 'shiki markup');
    // Asserted FIRST: `contains(null)` is false, so without this the assertion below
    // is satisfied most comfortably by there being no button at all.
    expect(copyButton(el), 'the check is not vacuous').not.toBeNull();
    // It must not be inside the scrollable code region — that region scrolls
    // horizontally and would carry the button off-screen with the code.
    expect(region(el).contains(copyButton(el))).toBe(false);
  });

  test('`copy={false}` and `copy="false"` each remove it — the facade default is ON', async () => {
    // The facade defaults ON because the docs and the JSDoc promise the button; a
    // default-off element would make the published docs true only for consumers who
    // read the fine print. Opting out is the standard boolean mechanics.
    const off = create({ code: 'const x = 1', language: 'ts', copy: false });
    document.body.appendChild(off);
    await until(() => shikiPre(off) !== null, 'shiki markup');
    expect(copyButton(off)).toBeNull();
    expect(shadow(off).querySelectorAll('button')).toHaveLength(0);

    document.body.insertAdjacentHTML('beforeend', '<kai-code-block id="attr" language="ts" copy="false"></kai-code-block>');
    const attr = document.getElementById('attr') as CodeBlock;
    attr.code = 'const x = 1';
    await until(() => shikiPre(attr) !== null, 'shiki markup');
    expect(copyButton(attr)).toBeNull();

    // Paired over the same shapes: the default really does render one, so "no button"
    // is not passing because the button never renders in this harness.
    const on = create({ code: 'const x = 1', language: 'ts' });
    document.body.appendChild(on);
    await until(() => shikiPre(on) !== null, 'shiki markup');
    expect(copyButton(on)).not.toBeNull();
  });

  test('turning `copy` off and on again at runtime follows', async () => {
    const el = create({ code: 'const x = 1', language: 'ts' });
    document.body.appendChild(el);
    await flush();
    expect(copyButton(el)).not.toBeNull();

    el.copy = false;
    await flush();
    expect(copyButton(el)).toBeNull();

    el.copy = true;
    await flush();
    expect(copyButton(el)).not.toBeNull();
  });

  test('the docs promises are really in the tree, exactly as quoted above', () => {
    // The quotes in the comment above are the evidence, so they are read from the
    // files rather than trusted. The RULING was to make the element true to the docs
    // rather than the docs true to the element, so these strings must stay put —
    // if someone edits the docs instead, this fails and says so.
    const facade = readFileSync(resolve(pkgRoot, 'src/elements/code-block.tsx'), 'utf8');
    expect(facade).toContain('(with a copy button)');
    const docs = readFileSync(resolve(pkgRoot, '../../docs/web-components.md'), 'utf8');
    expect(docs).toContain('code block with a copy button');
  });
});

// ---------------------------------------------------------------------------
// The blast radius: the two OTHER surfaces that share this component
// ---------------------------------------------------------------------------

describe('markdown and artifact are unchanged — the Solid default is OFF', () => {
  // `CodeBlock` is shared by three surfaces: markdown.tsx (every fenced block in every
  // assistant message), artifact.tsx (the code panel), and this element. Only the
  // ELEMENT was promised a copy button, so the Solid-layer default stays OFF and the
  // facade opts in. Getting that backwards would silently add a button to every code
  // block in every message — a kit-wide visible change riding along on a bug fix.

  test('a bare <CodeBlock> renders no copy button', () => {
    const { container } = render(() => (
      <CodeBlock class="my-4">
        <CodeBlockCode code="const x = 1" language="ts" />
      </CodeBlock>
    ));
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelector('[part="copy"]')).toBeNull();
  });

  test.each([
    ['markdown.tsx', 'src/components/markdown.tsx'],
    ['artifact.tsx', 'src/components/artifact.tsx'],
  ])('%s does not opt in to `copy`', (_name, file) => {
    // Behaviour is pinned above; this pins the CALL SITES, which is what would have to
    // change for the behaviour to. Reading the source is the honest check here: both
    // files render CodeBlock deep inside components with their own heavy setup, and a
    // full render test of each would be asserting their scaffolding, not this.
    const source = readFileSync(resolve(pkgRoot, file), 'utf8');
    expect(source, `${file} must really render a CodeBlock, or this pin is vacuous`).toMatch(/<CodeBlock[\s>]/);
    for (const m of source.matchAll(/<CodeBlock\b([^>]*)>/g)) {
      expect(m[1], `${file} must not enable the copy button`).not.toMatch(/\bcopy\b/);
    }
  });
});
