// src/primitives/url-scheme-policy.ts
// The kit's one URL-scheme allow/deny policy, split out of card-routing.ts so it
// has NO DOM dependency (`URL` is a global in both the browser and Node — the
// rest of card-routing.ts uses HTMLElement/window/CustomEvent, which aren't).
// That split matters beyond tidiness: this schema.ts (agent-tooling/construct)
// runs under tsconfig.mcp.json's Node-only, no-DOM-lib pass (it's imported
// transitively via mcp/tools/construct.ts), and importing anything from
// card-routing.ts there drags its HTMLElement/window/Document/CustomEvent
// references into that compile and breaks it — even though only isSafeUrl is
// used. card-routing.ts re-exports everything here so its own public surface
// (isSafeUrl/isScriptUrl, used by markdown.tsx/artifact.tsx/source.tsx) is
// unchanged; this is a location split, not a second policy.

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];
const SCRIPT_SCHEMES = ['javascript:', 'vbscript:'];

/** The scheme the WHATWG parser reads out of `url`, resolved against a base so a
 *  relative input inherits `http:`. `undefined` when it will not parse at all.
 *
 *  ONE parser for the two questions below, deliberately: the parsing is where
 *  the subtlety lives (it strips embedded tabs/newlines and trims surrounding
 *  whitespace before reading the scheme, so `java\nscript:` and
 *  `  javascript:...  ` are both read as `javascript:` -- which a regex over the
 *  raw string would miss). Two predicates over one parse cannot drift on that;
 *  two hand-rolled parsers would. */
function schemeOf(url: string): string | undefined {
  try { return new URL(url, 'http://_invalid_base').protocol; } catch { return undefined; }
}

/** True when `url` is safe to put in an href / hand to `window.open` / an `<img src>`.
 *
 *  Exported so the MARKDOWN renderer, the ARTIFACT viewer and the construct
 *  format's `widget.launcherIcon` reuse this exact guard rather than growing a
 *  second scheme list that can drift from this one.
 *
 *  Resolving against a base is deliberate and is what makes it correct for
 *  markdown: a relative or fragment link (`/docs`, `#section`, `./rel`) is
 *  ordinary markdown, and resolving it inherits the base's `http:` so it
 *  passes, while `javascript:`/`data:`/`vbscript:` keep their own protocol and
 *  fail. It is correct for the artifact viewer for the same reason: a file with
 *  no `src` to resolve against yields a bare relative path (`docs/report.pdf`),
 *  which is a legitimate artifact address. Contrast `isRenderableLink` in
 *  `primitives/link-preview.ts`, which takes NO base and so demands an absolute
 *  http(s) URL: that is the right guard for a model-supplied citation -- a
 *  reference to a page on the public web -- this one for markdown body links,
 *  artifact file addresses, and a construct's launcher icon. */
export function isSafeUrl(url: string): boolean {
  const scheme = schemeOf(url);
  return scheme !== undefined && SAFE_SCHEMES.includes(scheme);
}

/** True when navigating to `url` would EXECUTE it as script in the initiating
 *  document's origin.
 *
 *  Strictly narrower than `!isSafeUrl(url)`, and not a competing policy: it
 *  answers a different question, for the one sink where the allowlist is the
 *  wrong tool. An `<iframe src>` legitimately takes `data:` and `blob:` (a
 *  `data:` blob artifact is a documented `<kai-artifact>` use -- it is what
 *  `displayUrl` exists for) and both get an OPAQUE origin in every modern
 *  browser, so neither can reach the host page. `javascript:`/`vbscript:` are
 *  the schemes that run in the EMBEDDER's origin, and they are the whole risk:
 *  the default sandbox (no `allow-same-origin`) already makes the browser refuse
 *  them, but a consumer who sets `allow-same-origin` turns a model-supplied
 *  `src` into host-origin script execution. The artifact viewer used to suggest
 *  that setting for "an artifact you trust"; it no longer does, and this guard
 *  is what protects the consumers who took the old advice. */
export function isScriptUrl(url: string): boolean {
  const scheme = schemeOf(url);
  return scheme !== undefined && SCRIPT_SCHEMES.includes(scheme);
}
