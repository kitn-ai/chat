# Composition spike, phase 2: the same widget over the CDN, no bundler

**Date:** 2026-08-31 · **Question:** does the hand-composed support widget from [report.md](report.md) survive delivery with no bundler at all — a plain HTML page loading the kit the way the docs tell a CDN consumer to?

**Method:** the branch's kit is unpublished, so a local static server stood in for the CDN, serving the freshly built `dist/` at `/kit/` (same file layout a `cdn.jsdelivr.net/npm/@kitn.ai/ui@<version>/dist/` URL would give). `composed-widget-src/main.ts` was ported to what a no-bundler page can actually do — plain JS, raw module URLs, no node_modules (`cdn-widget-src/` beside this file). Driven through the same story as phase 1 (closed launcher → home tab → CTA → thread → suggestion chip → scripted mock with reasoning + tool row), light and dark, in a real Chromium via Playwright, with every request's bytes counted off the wire. Screenshots: `shots/cdn-*.png`.

**Caveat on the kit under test:** `dist/` was rebuilt by another agent twice during this session. All numbers and screenshots below come from one full driver run against a complete, consistent tree (every request 200, every fetched file present for the gzip pass); the tree was 0.30.0-era `feat/modes-and-screens`. Re-run `cdn-widget-src/drive.mjs` for fresh numbers rather than trusting these against a later dist.

## Which path do the docs recommend? Both, in different places

- `apps/docs/guides/loading.mdx` is unambiguous: the **autoloader** (`<script type="module" src=".../dist/elements/autoloader.js">`) is *the* CDN/static tool; the register-all bundle is framed as the bundler default.
- `guides/getting-started.mdx`, `guides/frameworks/html.mdx` ("No-build option"), and `packages/ui/README.md`'s CDN quick-start all tell the CDN consumer to `import 'https://cdn.jsdelivr.net/npm/@kitn.ai/ui/dist/kai.es.js'` — the **register-all** bundle.

So both are recommended, and nothing cross-references them or compares their cost. Both were tested.

## Result: full parity, both paths

The whole phase-1 story works over raw CDN-style URLs on **both** loader paths, light and dark, with **zero console errors or warnings**: launcher, home tab (greeting / CTA / Help-center link / Home–Messages tab bar), thread empty state with chips and paperclip, the scripted mock streaming through `createMockResponder` → `readOpenAIStream` → `createAssistantStream` (reasoning disclosure, `lookup_order` settling to Completed, action rows, edit on the user bubble), unread dot, conversations persistence. The kai- contract (JS properties for rich data, non-bubbling `kai-*` events, new array + new item refs) behaves identically — it is delivery-independent, as it should be. Phase 1's two real gaps (hand-derived unread, unreachable `closeConversationsList`) carry over unchanged; the delivery path neither widens nor closes them.

The register-all page's dark run captured the closed state only (the full story ran light-side on that path); the autoloader path ran the full story in both schemes.

## The big answer: state/wire ARE reachable — the root export is NOT

This was the question that mattered most, and it splits clean down the exports map:

- **`dist/state.js` and `dist/wire.js` are self-contained ESM with zero bare imports.** `import { createAssistantStream, createMockResponder } from '.../dist/state.js'` and `import { readOpenAIStream } from '.../dist/wire.js'` work raw from a CDN URL and drove the entire streaming story. **The open-composition story on CDN is NOT elements-only** — the model-stream adapter and the pure state folds, the pieces that make composition real, are right there. (13.8 KB + 52.0 KB raw; 4.5 + 15.2 KB gz.)
- **`dist/index.js` (the root export) opens with bare `solid-js` imports and fails to load raw** — captured live: `Failed to resolve module specifier "solid-js"` (`cdn-widget-src/index-root-import.html`). Everything only the root export carries is therefore unreachable with no bundler, and the one that bites is **`localStorageStore` / `fetchStore`**: the `<kai-chat>` `store` prop's own JSDoc says "Two built-ins ship", but a CDN consumer can reach neither. The port hand-writes a ~45-line `ConversationStore` (`list`/`load`/`save`/`markRead`) against localStorage to keep the conversations feature (`cdn-widget-src/app.js`). It works — the contract is small and documented in the d.ts — but the flagship no-build path silently loses both built-in stores.
- Untested possibility: jsDelivr's `/+esm` transform rewrites bare imports and might make the root export loadable. No doc recommends it, the documented URLs are the raw `/dist/...` form, and an unpublished kit can't verify it — noted, not claimed.

Neither `state.js` nor `wire.js` is documented as a CDN URL anywhere — `loading.mdx` and `html.mdx` cover element *loading* only. A no-build consumer has to discover the dist layout by reading the exports map out of `package.json`. That is the difference between "reachable" and "part of the story".

## Payload, off the wire

Everything below measured from actual responses during the driver run (`drive.mjs` sums response bodies; gzip computed over the same files — a real CDN would serve brotli, i.e. somewhat smaller):

| | Autoloader | Register-all (`kai.es.js`) |
|---|---|---|
| Requests (whole page, incl. html + app.js) | **99** | **6** |
| Bytes raw | 647.4 KB | 841.4 KB |
| Bytes gzip-equivalent | **~217 KB** | **~242 KB** |
| Biggest files (raw) | define chunk 146.4 KB · wire.js 53.3 KB · markdown 44.1 KB | register-impl **755.1 KB** · wire.js 53.3 KB · kai.es.js 31.6 KB |
| `window.__widgetReady` after load start (localhost) | 120–170 ms | 70–100 ms |

Reading it honestly:

- **This widget is close to the autoloader's worst case.** `<kai-chat>` transitively pulls most of the kit (composer, markdown, cards, attachments, model switcher…), so on-demand loading saves only ~25 KB gz over register-all while costing **93 extra requests**. All 99 arrived at initial load — every tag is in the HTML at parse, and nothing further loaded during the story (no code block rendered, so the lazy highlighter never fetched). A page using two small elements would tell the opposite story; a page using `kai-chat` gets the autoloader's cost without much of its benefit.
- **Localhost TTI says nothing about real-world latency.** Both paths felt instant here; the number that would differ on a real CDN is the autoloader's dynamic-import chain depth (each `import()` layer costs an RTT before the next is discovered), which this spike did not measure. The register-all bundle is one fetch deep by construction.
- ~220–240 KB gz for a support widget is the footprint-round trade-off already on record; nothing new, but a CDN embedder sees all of it on the host page.

## Accent and theming: the docs' recipe restyles nothing

The phase-1 widget carries no accent override (default accent, `theme="auto"` following `prefers-color-scheme` — both verified again here in the dark shots). To cover the accent axis, the documented no-build theming recipe was tried: `html.mdx` "Theming" says to link `dist/theme.tokens.css` and "override any `--color-*` or `--radius-*` custom properties on `:root`".

- **Overriding `--color-primary` on `:root` restyles nothing** — CTA, launcher, and tabs stayed default. The elements are self-themed inside shadow DOM and never read `--color-*`; those variables theme host-page chrome.
- **The working knob is `--kai-color-primary`** (+ `-foreground`): full magenta takeover of CTA, active tab, and launcher (`shots/cdn-accent-light-home.png`).
- **The `theme.tokens.css` link is not even needed for element theming** — verified by removing it: the accent held (elements read `var(--kai-color-*, fallback)` directly, and custom properties inherit into shadow DOM). The stylesheet's own generated header says exactly this ("the kit's ELEMENTS are self-themed and don't need this"); the docs page contradicts its own artifact.
- Minor loose end: the dock panel's blue border did not follow the primary override — some token not derived from primary (not chased down here).

## No-bundler DX: types are gone, and nothing catches you

- The port is plain JS: no `ChatMessage`, no `MockReply`, no event detail types, no completions. Phase 1's finding 1 (no typed `addEventListener` overloads) is moot here in the worst way — there are no types at all.
- The `.d.ts` files ship in the same dist the CDN serves, so an editor *could* be pointed at them (JSDoc `@type` + a jsconfig path, or `// @ts-check` against the npm package installed as a dev-only convenience), but no doc says so. An agent writing against this page works from `llms-full.txt` prose and runtime errors.
- The store-before-`conversations` ordering (phase-1 finding 2) was preserved in the port and produced no console error; the race was not re-probed here.

## Verdict

**The open×CDN cell is real, with caveats that are documentation and exports-map debt rather than engine debt.** The hand-composed widget runs feature-complete over raw CDN-style URLs on both documented loader paths, light and dark, accent-themable, with the streaming seam (`state` + `wire`) fully reachable — the composition story does not collapse to elements-only when the bundler goes away. The caveats: everything the root export owns is unreachable (most painfully both built-in conversation stores, forcing a hand-rolled one), none of the reachable-but-undocumented surface (`dist/state.js`, `dist/wire.js`, the `--kai-color-*` knobs) is written down for this path, one docs theming instruction is wrong as stated, the two CDN recommendations never mention each other, and the whole thing is typeless. Every workaround in `cdn-widget-src/app.js` is annotated at the site where it stands in for something the npm path gets for free.

## Concrete gaps

1. **`localStorageStore`/`fetchStore` unreachable without a bundler** (root export bare-imports solid-js). Either ship them in a self-contained module (they are solid-free glue — `state.js` is the obvious home, or a small `dist/stores.js`) or document the hand-rolled `ConversationStore` recipe for no-build pages. The `store` prop's JSDoc currently promises built-ins this path cannot have.
2. **`html.mdx` theming section is wrong for elements**: "override any `--color-*`" does not restyle them; the knob is `--kai-color-*`, and the `theme.tokens.css` link is unnecessary for element theming (it themes host-page chrome). Fix the prose to match the stylesheet's own header.
3. **`dist/state.js` and `dist/wire.js` are CDN-loadable but undocumented as such.** One paragraph + pinned URLs in `loading.mdx` or `html.mdx` turns "elements-only" into the full composition story for no-build consumers.
4. **Two CDN recommendations, no cross-reference, no cost guidance**: `loading.mdx` says autoloader, README/getting-started/html.mdx say `kai.es.js`. For a `kai-chat` page the autoloader buys ~25 KB gz for 93 extra requests; for a two-atom page the ranking flips. A sentence in each place would let consumers pick.
5. **No-build typing recipe undocumented** — the d.ts files are already on the CDN; a short JSDoc/`@ts-check` recipe would give agents and humans back most of the DX.
6. **Unmeasured:** autoloader import-chain depth × RTT on a real CDN (the number that decides time-to-interactive at distance). Worth one measurement before recommending the autoloader for chat-sized pages.
7. Minor: dock panel border color does not follow `--kai-color-primary` (token underivation, unchased).

## Reproduce

<!-- gate-list: partial -- reproduction commands for a scratch spike, not a merge-gate enumeration -->
```bash
# from cdn-widget-src/ (needs a built packages/ui/dist; symlink it to ./kit,
# and symlink the repo's node_modules here for playwright)
node serve.mjs &        # CDN stand-in on :8931, logs bytes per request
node drive.mjs          # full story, both paths, light+dark, JSON to stdout
```
