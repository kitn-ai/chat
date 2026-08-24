/** Observe an element's content height; invoke `onHeight` when it changes by more than
 *  THRESHOLD px (hysteresis kills sub-pixel oscillation — H-J). Returns a disposer. */
const THRESHOLD = 1;
export function observeContentHeight(el: Element, onHeight: (height: number) => void): () => void {
  let last = -1;
  const ro = new ResizeObserver((entries) => {
    const h = entries[entries.length - 1]?.contentRect.height ?? el.getBoundingClientRect().height;
    if (last < 0 || Math.abs(h - last) > THRESHOLD) { last = h; onHeight(h); }
  });
  ro.observe(el);
  return () => ro.disconnect();
}

/** Observe an element's resizes but report the FULL rendered document height (not the
 *  observed element's own content-box) — `document.body.scrollHeight`.
 *
 *  Used by the remote-card provider runtime to size the host iframe (D1, rung 5 IVP
 *  task-10-report.md): `observeContentHeight` reports the ResizeObserver content-box of
 *  the observed root, which drops that root's OWN padding/border and any ancestor
 *  (e.g. `<body>`) padding above it — the host then clips the bottom of the card by
 *  exactly those lost pixels. `scrollHeight` is the full padding-box height as actually
 *  rendered, so it stays correct no matter which element in the ancestor chain carries
 *  the padding/border, including if the provider page's own styles change later —
 *  reading contentRect off one fixed element, or hand-summing computed padding/border
 *  off a fixed list of ancestors, would both need updating every time that chain does.
 *
 *  Deliberately `document.body.scrollHeight`, NOT `document.documentElement.scrollHeight`
 *  (N1, task-10-report.md "Fix-wave re-review"): the CSSOM View spec special-cases the
 *  scrollHeight of the ROOT element to be `max(viewport scrolling area, viewport
 *  height)` — and the host sets the iframe's viewport FROM this very measurement
 *  (`host-embed.ts` `sizeIframe`), so `documentElement.scrollHeight` can only grow for
 *  the life of the frame: once the iframe is tall, the root's own scrollHeight is
 *  floored at that height even after the card's content shrinks. `<body>` carries no
 *  such floor — its scrollHeight is a plain padding-box measurement of body's own
 *  content, so it shrinks along with the card. */
export function observeDocumentHeight(el: Element, onHeight: (height: number) => void): () => void {
  let last = -1;
  const ro = new ResizeObserver(() => {
    const doc = el.ownerDocument;
    const h = doc?.body?.scrollHeight ?? doc?.documentElement?.scrollHeight ?? el.getBoundingClientRect().height;
    if (last < 0 || Math.abs(h - last) > THRESHOLD) { last = h; onHeight(h); }
  });
  ro.observe(el);
  return () => ro.disconnect();
}
