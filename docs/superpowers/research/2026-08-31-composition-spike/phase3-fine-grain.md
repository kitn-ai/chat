# Composition spike, phase 3: the same widget at the finer grain — no `<kai-chat>`

**Date:** 2026-08-31 · **Question (owner's words):** "show me the same widget composed at the finer grain. let's make sure we aren't fooling ourselves."

**Method:** the support widget from [phase 2](phase2-cdn.md) (`cdn-widget-src/index.html` + `app.js`) rebuilt with the facade removed: no `<kai-chat>` anywhere. The interior is composed from the public fine-grain elements — `<kai-thread>` + `<kai-prompt-input>` + `<kai-conversations>` + `<kai-tabs>` + `<kai-empty>` + `<kai-button>` — inside the same `<kai-dock>` shell (shell, not chat), glued by plain JS over the same CDN stand-in (`/kit/` = fresh `dist/`). Streaming through `/kit/state.js` + `/kit/wire.js` and the same scripted mock; persistence through the NEW `/kit/stores.js` (`localStorageStore`, `isConversationUnread`, `byRecency`). Spike ethic held strictly: documented public props/events/methods/slots only, no shadow-root reaches, no private imports; every place the public surface fell short is a numbered finding below, not a quiet hack.

Files: `cdn-widget-src/fine.html` + `fine.js` (open <http://localhost:8931/fine.html> on the running server), `fine-accent.html` (accent probe), `fine-drive.mjs` (the Playwright driver, run against a second server instance on :8942). Screenshots: `shots/fine-*.png` (light + dark + accent; closed, home, empty thread, streamed reply, conversations list, closed-with-badge, reopened, new-conversation).

## Verdict: fine-grain composition is real. We are not fooling ourselves — about the engine.

Every item on the parity checklist was reached on the public surface, light and dark, with **zero console errors or warnings** across all three driver runs: launcher open/close · home tab with greeting → start-chat handoff · thread rendering the scripted mock (reasoning disclosure + text + settled `lookup_order` tool row + action bars) · streaming send round-trip · conversations list persisted via `localStorageStore` with load-on-click and new-conversation · unread badge on the closed launcher, derived from the public `isConversationUnread` · empty state via `<kai-thread slot="empty">` · dark mode · magenta accent via `--kai-color-primary` (CTA, send button, launcher — `shots/fine-accent-light-2-home.png`). Auto-restore across reload also works (`fine-drive.mjs` asserts it).

The honest half of the verdict: parity cost **~1.8× the code** (328 lines vs 186 — see LOC below), and what the extra lines buy back is not engine behavior but *product tier*: the home screen, the panel chrome, the widget-styled conversation panel, and the controller glue (view routing, store lifecycle, unread write-policy) are all facade-internal with no fine-grain element or helper behind them. The seams themselves — `state`/`wire`/`stores` driving `<kai-thread>` directly, the kai- reactivity contract, the store contract — behaved identically with the facade gone. The gaps are packaging debt, not composition debt.

A point FOR the fine grain that phase 2 couldn't claim: the phase-2 driver had to spelunk shadow roots to click the facade's internal buttons; `fine-drive.mjs` drives the whole story through **user-level clicks on accessible names** ("Open Support", "Send us a message", "New chat") plus documented public methods (`dock.hide()`, `prompt.send()`). When you own the composition, the seams you need to automate against are yours and public.

## What existed, and what carried each feature

| Facade feature | Fine-grain carrier | Grade |
|---|---|---|
| Message thread (reasoning/text/tool/actions/streaming) | `<kai-thread>` — `messages`, `loading`, `slot="empty"` | element, full parity |
| Composer (send, suggestions, attachments staging) | `<kai-prompt-input>` — `suggestions`, `loading`, `kai-submit` (same detail shape as the facade's) | element, full parity minus `accept` (F-5) |
| Conversations list | `<kai-conversations>` — `conversations`/`activeId` props, `kai-conversation-select`, built-in `kai-new-chat` | element, works; sidebar-flavored (F-8) |
| Home/Messages tab bar | `<kai-tabs>` (selection only — routing is yours) | element + glue |
| Empty state | `<kai-empty>` slotted into the thread | element, full parity |
| Launcher shell + badge | `<kai-dock>` — unchanged from phase 2 | element, full parity |
| Home screen (greeting, recent card, CTA, links) | **nothing** — hand-built light DOM | F-1 |
| Panel chrome (header, close, view container) | **nothing** — hand-built light DOM | F-2 |
| Store lifecycle, view routing, id minting, markRead policy | **nothing** — ~60 lines of glue in `fine.js` | F-3 |
| Unread computation | `isConversationUnread` + `byRecency` from `/kit/stores.js` | primitive, 1 line (F-6) |

## Findings

1. **F-1 — no home-screen element.** `<kai-chat home={…}>`'s greeting / recent-conversation card / new-conversation CTA / links have no `kai-*` element behind them. Hand-built in light DOM (~40 lines of HTML+CSS). This was the headline risk going in and it is confirmed: the Intercom-pattern home tab is facade-only.
2. **F-2 — no panel chrome.** Header row, close affordance placement, the view container: with the facade gone there is no widget frame, and the kit's tokens do not paint your light DOM — the page carries ~70 lines of its own layout CSS and must self-theme dark mode by hand (`prefers-color-scheme` blocks in `fine.html`).
3. **F-3 — the controller is unpackaged.** View routing (`kai-tabs` is documented as "not a content router" — correctly, but nothing else routes either), active-conversation id, mint-id-on-first-message (C-6), save-per-turn, mount-time auto-restore, and the three-leg "seen" rule for `markRead` (open + chat view + active conversation) are all reimplemented in `fine.js`. All of it was *possible* on documented surface — the store contract and the `ChatThread` docs even describe the rules — but nothing ships it as a headless controller. This is the single biggest LOC cost and the likeliest source of consumer drift (everyone will restate the markRead rule slightly differently).
4. **F-4 — `userActions`/`assistantActions` are facade sugar.** At the fine grain, actions are a per-message `actions` field, so the app stamps the assistant's action bar onto the finished turn itself — with a new array AND a new message object, per the contract. Two lines, but it must be *known*: forget it and streaming looks perfect while every action bar silently vanishes.
5. **F-5 — `<kai-prompt-input>` has no `accept`.** The facade's `accept="image/*,application/pdf"` filter and its `kai-attachment-rejected` reporting are `kai-chat`-only (verified against element-meta: no such prop). Attachments still stage and submit; they cannot be narrowed at the paperclip. The documented escape (`encodableMediaTypes()` from wire + your own picker) means replacing the paperclip, not configuring it.
6. **F-6 — unread at the finer grain: the primitive serves; the event does not exist and doesn't need to.** The facade's `kai-unread-change` has no fine-grain equivalent — and last week's parity fix turns out to be exactly what replaces it: `(await store.list()).some(isConversationUnread)` is one line, reachable with no bundler via `/kit/stores.js`, and its own JSDoc names this consumer ("any consumer-composed launcher deriving its own badge from `store.list()`"). Verified end-to-end: reply lands while the dock is closed → badge on (`shots/fine-light-6-closed-unread.png`); reopen → `markRead` → badge off (driver asserts both). The caveat is the WRITE side: the primitive covers the read, while the when-to-`markRead` policy is F-3's hand glue.
7. **F-7 — icon names are undiscoverable and fail silent in prod.** `icon="list"` and `icon="send"` painted as the literal words "list" / "sendSend us a message" (first driver run). The curated roster (~75 names in `src/ui/icon.tsx`; no `list`, no `send`) is enumerated nowhere in `docs/web-components.md` — the prop doc says 'a named icon (e.g. "mic", "plus")' and stops. The unknown-name warning is `import.meta.env.DEV`-only, so the shipped build renders wrong with zero console output: a decide-quietly path a CDN consumer hits blind. Cheap fixes: list `ICON_NAMES` in the docs; consider the warning in prod too.
8. **F-8 — `<kai-conversations>` is the desktop sidebar rail, not the widget conversation panel.** It works (rows, select, search, built-in New chat that fires `kai-new-chat`), but inside a widget panel it brings sidebar furniture: a sidebar-toggle hamburger, a "Chats" title, and — with `groups` omitted entirely — the rows still render under an "Ungrouped" section header (`shots/fine-light-5-conversations.png`), which reads odd when grouping was never in play. The facade's widget-styled list (`ConversationPanel`, C-1) is facade-internal. The `header` slot can replace the title row; the Ungrouped header for an entirely-ungrouped list looks like a small bug worth a look.
9. **Observation — `localStorageStore` titles from the last message text at first save**, so the row title and its trailing preview both read "Let me pull up that order." (near-duplicate; the phase-2 hand-rolled store titled from the first *user* message, which read better). Store behavior, not a fine-grain gap — but the fine grain is where you see it, because the facade run never used the built-in store.
10. **Observation — payload: dropping the facade saves nothing.** Initial load 652.4 KB raw / 103 requests vs the facade autoloader page's 647.4 KB / 99 (phase 2). `kai-thread` + `kai-prompt-input` pull the same bulk `kai-chat` did, and this page adds `kai-conversations`/`kai-tabs` eagerly where the facade lazy-loads its list view. Re-run `fine-drive.mjs` for fresh numbers rather than trusting these.
11. **Observation — accent at the fine grain:** `--kai-color-primary` takes the CTA, the send button, and the launcher; the segmented `kai-tabs` active pill stays neutral (its active style doesn't derive from primary — cosmetically fine, noted for completeness beside phase 2's dock-border loose end).

## LOC, honestly counted

`wc -l` over the sources (re-run it rather than trusting this prose against edited files):

| | HTML | JS | Total |
|---|---|---|---|
| Facade (`index.html` + `app.js`) | 39 | 147 | **186** |
| Fine grain (`fine.html` + `fine.js`) | 121 | 207 | **328** |

~1.8× — and the comparison flatters the facade's JS: 45 of `app.js`'s 147 lines are the hand-rolled store that phase 2's gap forced, which `fine.js` replaces with one import from `/kit/stores.js`. Like for like (both on `stores.js`), the facade page would be ~141 lines total, putting the fine grain nearer **2.3×**. Where the extra lives: the home screen + panel chrome markup and CSS (~80 lines of `fine.html`), and the controller glue (~60 lines of `fine.js`) — F-1/F-2/F-3, precisely the unpackaged product tier.

## What would close the gap

Ordered by leverage:

1. **A headless conversation-controller** (the F-3 glue as a shipped primitive beside the stores: restore/select/new/save/markRead with the seen-rule inside) — turns ~60 lines of drift-prone consumer code into a few calls, at every grain including React/Solid.
2. **Widget-tier panel parts** — a home-screen element (or card parts for greeting/recent/CTA) and a widget-styled conversations view (or a `variant` on `kai-conversations` that drops the sidebar furniture) — F-1/F-2/F-8.
3. **`accept` on `<kai-prompt-input>`** — F-5 is a straight facade-to-element push-down; the resolver (`resolveMediaPolicy`) already exists.
4. **Docs: the icon roster** (+ prod-visible unknown-icon signal) — F-7 is the only finding where the current behavior actively misleads.

## Reproduce

```bash
# owner's server already serves it: http://localhost:8931/fine.html
cd docs/superpowers/research/2026-08-31-composition-spike/cdn-widget-src
PORT=8942 node serve.mjs &          # second instance for driving
node fine-drive.mjs                  # story + assertions + screenshots, light/dark/accent
```
