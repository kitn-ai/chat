# Composition spike, phase 3: the same widget at the finer grain — no `<kai-chat>`

**Date:** 2026-08-31 · **Question (owner's words):** "show me the same widget composed at the finer grain. let's make sure we aren't fooling ourselves."

**Method:** the support widget from [phase 2](phase2-cdn.md) (`cdn-widget-src/index.html` + `app.js`) rebuilt with the facade removed: no `<kai-chat>` anywhere. The interior is composed from the public fine-grain elements — `<kai-thread>` + `<kai-prompt-input>` + `<kai-conversations>` (item mode, with `<kai-conversation-item>` rows) + `<kai-empty>` + `<kai-button>` + `<kai-icon>` — inside the same `<kai-dock>` shell (shell, not chat), glued by plain JS over the same CDN stand-in (`/kit/` = fresh `dist/`). Streaming through `/kit/state.js` + `/kit/wire.js` and the same scripted mock; persistence through the NEW `/kit/stores.js` (`localStorageStore`, `isConversationUnread`, `byRecency`). Spike ethic held strictly: documented public props/events/methods/slots only, no shadow-root reaches, no private imports; every place the public surface fell short is a numbered finding below, not a quiet hack.

The work ran in **four passes**: a feature-parity pass, then three owner side-by-side reviews that failed it on *fidelity* and forced a per-state visual match against the facade — see "The fidelity round" below, which is itself the strongest evidence for F-1/F-2/F-3.

Files: `cdn-widget-src/fine.html` + `fine.js` (open <http://localhost:8931/fine.html> on the running server), `fine-accent.html` (accent probe), `fine-drive.mjs` (the Playwright driver: it now drives **both** `index.html` and `fine.html` through the same 8-state story against a second server instance on :8942). Screenshots: `shots/facade-*` vs `shots/fine-*`, same state names (`1-closed` · `2-home` · `3-thread-empty` · `4-reply` · `5-conversations` · `6-closed-unread` · `7-reopened` · `8-new-conversation-empty`), light + dark, plus `fine-accent-*`.

## Verdict: fine-grain composition is real. We are not fooling ourselves — about the engine.

Every item on the parity checklist was reached on the public surface, light and dark, with **zero console errors or warnings** across every driver story (facade and fine, both schemes, plus accent): launcher open/close · home tab with greeting → start-chat handoff · thread rendering the scripted mock (reasoning disclosure + text + settled `lookup_order` tool row + action bars) · streaming send round-trip · conversations list persisted via `localStorageStore` with load-on-click and new-conversation · unread badge on the closed launcher, derived from the public `isConversationUnread` · empty state via `<kai-thread slot="empty">` · dark mode · magenta accent via `--kai-color-primary` (CTA, send button, launcher — `shots/fine-accent-light-2-home.png`). Auto-restore across reload also works (`fine-drive.mjs` asserts it).

The honest half of the verdict: parity cost **~2.7× the code** (498 lines vs 186 — see LOC below, which also explains why the first pass's 1.8× was an undercount), and what the extra lines buy back is not engine behavior but *product tier*: the home screen, the panel chrome, the widget tab bar, the widget-styled conversation panel, and the controller glue (view routing, store lifecycle, unread write-policy) are all facade-internal with no fine-grain element or helper behind them. The seams themselves — `state`/`wire`/`stores` driving `<kai-thread>` directly, the kai- reactivity contract, the store contract — behaved identically with the facade gone. The gaps are packaging debt, not composition debt.

A point FOR the fine grain that phase 2 couldn't claim: `fine-drive.mjs` drives the whole story through **user-level clicks on accessible names** ("Open Support", "Send us a message", "Back", "New conversation") plus documented public methods (`prompt.send()`). When you own the composition, the seams you need to automate against are yours and public. (The facade page still needs one synthetic `kai-submit` dispatch to land a reply while the dock is closed — it has no public send.)

## The fidelity round: feature parity passed while the widget drifted visually

The first pass hit every feature checkbox and still wasn't the same widget — the owner's side-by-side caught it. What had drifted, and what each fix took:

| Owner's observation (first pass) | Root cause | Fix needed |
|---|---|---|
| Tab bar stayed visible inside the thread; no back arrow | I invented a navigation model instead of matching the facade's (H-2/H-5: home and list are tab levels, a chat is always a *drill* that hides the tab bar and shows a header back arrow; the Messages tab IS the list, so the header list-toggle I added doesn't exist in the facade at all) | behavior glue (~20 lines of `fine.js` routing rewritten) |
| Suggestion chips persisted mid-conversation; scroll button overlapped a bubble | the facade's `persistSuggestions` default (starters hide once messages exist) is ChatThread policy, and `kai-prompt-input` renders whatever it's handed — the policy is the glue's job | behavior glue (1 line) |
| Tabs were text-only segmented pills, not icon-over-label | `<kai-tabs>` cannot reproduce the facade's `WidgetTabBar` (icon-over-label columns, unread dot on the Messages glyph) — **kai-tabs was dropped for a hand-built bar** using `<kai-icon name="home"/"message-square">` | hand-built chrome (F-1/F-2 demonstrated again) |
| Header showed a stray icon; wrong per-state controls | same invented-navigation root cause; facade header = title + close on levels, + back arrow only on a drilled chat | behavior glue |
| Recent card: duplicated title/preview, missing "2m ago"; CTA a compact button, not a full-width row with trailing arrow; Help row missing book icon and chevron | hand-built home screen was approximated from memory, not from `HomePanel`'s actual markup; the timestamp needs `relativeTimeShort`, which is not public (F-9) | chrome CSS + F-9 restatement; display-dedupe for the store's title-equals-preview case |
| Panel chrome was blue-tinted, facade's is neutral | the F-2 CSS used invented slate hex values | **kit tokens**: link `dist/theme.tokens.css` and use `var(--color-background/foreground/border/muted-foreground/accent/primary/unread)` everywhere; its dark scope is the `.dark` class, so 4 lines of script sync `<html>` with `prefers-color-scheme` to match the elements' `theme="auto"` |

After the fixes, the driver runs both pages through all 8 states (light and dark, zero console errors) with identical behavioral probes — back arrow present and tab bar absent in-thread, suggestions gone mid-conversation, badge on/off — and the facade/fine screenshot pairs match state-for-state to small layout tolerance. Compare any `shots/facade-<scheme>-<state>.png` against its `shots/fine-<scheme>-<state>.png`.

A second owner side-by-side then caught four more, all fixed (round 2):

| Round-2 observation | Fix | Kind |
|---|---|---|
| List rows not the facade's dense presentation | `compact` attribute on each `<kai-conversation-item>`, plus the right-aligned relative time moved to the item's `menu` slot (the right-aligned region; `meta` renders under the title) | public surface |
| "New conversation" pill under-rounded vs the facade's pill | `::part(button) { border-radius: 999px; box-shadow; background }` on the light-DOM `kai-button` | public surface (`::part`) |
| Home and Messages tab icons visibly unequal sizes | explicit `size="lg"` (20px — the facade `WidgetTabBar`'s `size-5`) on BOTH `<kai-icon>`s instead of the 16px default | public surface |
| The list's built-in search box (was the F-8 residual; owner ruled: remove) | **KIT FIX** — no part/slot/prop could hide it, so `<kai-conversations>` gained `searchable` (default `true`, same default-true flag convention as `<kai-prompt-input attach>`); `fine.html` sets `searchable="false"` | kit change, F-8 residual CLOSED |

A third owner pass caught two subtler ones, both closed by MEASURING the facade instead of eyeballing it (a probe reads computed styles off both pages' shadow trees — the driver's tooling, not the app's):

| Round-3 observation | Measured | Fix | Kind |
|---|---|---|---|
| List spacing/padding not the facade's | facade panel row = `px-3 py-2.5` (12/10px), 40px tall, first row 8px under the header; the item element offers only compact (10/6, 32px) or default (10/8, ~36px) — the exact density is a PRIVATE interior class with no part/prop | dropped `compact`; host `padding-top: 4px`; the slotted title/time spans carry the last 2px each way. Row boxes now measure IDENTICAL (same y, same 40px height) | public surface, but only via slotted-content contortions — feeds the panel-family case |
| "New conversation" pill still off | facade pill: 38px tall, 8/16px padding, 14px/500 over a 20px line, rounded-full, `border-border`, `bg-background`, shadow-md (it IS a text pill, not a circle icon-button); the kai-button `sm` default differs in height/weight/line | full `::part(button)` restyle to the measured values, `line-height: 1.25rem` closing the final ~1.3px | public surface (`::part`) |

One recorded deviation remains: the conversation title text (observation under Findings — `localStorageStore` titles from the last message, the facade page's hand-rolled store from the first user message).

**The lesson is the finding.** A feature checklist could not tell this composition apart from the facade; a per-state visual diff could, immediately. Everything the fidelity round repaired lived in exactly the layers F-1/F-2/F-3 name as unpackaged — the navigation model, the tab bar, the home screen's precise anatomy, the chrome palette. A consumer composing at this grain would drift the same way and have no facade beside them to diff against.

## What existed, and what carried each feature

| Facade feature | Fine-grain carrier | Grade |
|---|---|---|
| Message thread (reasoning/text/tool/actions/streaming) | `<kai-thread>` — `messages`, `loading`, `slot="empty"` | element, full parity |
| Composer (send, suggestions, attachments staging) | `<kai-prompt-input>` — `suggestions`, `loading`, `kai-submit` (same detail shape as the facade's) | element, full parity minus `accept` (F-5) |
| Conversations list | `<kai-conversations>` in ITEM mode — `<kai-conversation-item>` rows, `header` slot emptied, `kai-conversation-select`; light-DOM "New conversation" pill | element + glue; sidebar residue (F-8) |
| Home/Messages tab bar | **hand-built** (`<kai-tabs>` tried and dropped — it cannot do the facade's icon-over-label columns or the unread dot) | F-1/F-2 |
| Empty state | `<kai-empty>` slotted into the thread | element, full parity |
| Launcher shell + badge | `<kai-dock>` — unchanged from phase 2 | element, full parity |
| Home screen (greeting, recent card, CTA, links) | **nothing** — hand-built light DOM | F-1 |
| Panel chrome (header, close, view container) | **nothing** — hand-built light DOM | F-2 |
| Store lifecycle, view routing, id minting, markRead policy | **nothing** — ~60 lines of glue in `fine.js` | F-3 |
| Unread computation | `isConversationUnread` + `byRecency` from `/kit/stores.js` | primitive, 1 line (F-6) |

## Findings

1. **F-1 — no home-screen element.** `<kai-chat home={…}>`'s greeting / recent-conversation card / new-conversation CTA / links have no `kai-*` element behind them. Hand-built in light DOM (~40 lines of HTML+CSS). This was the headline risk going in and it is confirmed: the Intercom-pattern home tab is facade-only.
2. **F-2 — no panel chrome, and the palette is on you.** Header row, per-state header controls, the view container, the widget tab bar: with the facade gone there is no widget frame — the page carries ~100 lines of its own layout CSS. The first pass proved how this goes wrong: invented slate hex values made the whole chrome blue-tinted next to the facade's neutral. The correct recipe (fidelity round): link `dist/theme.tokens.css` and paint every chrome color from `var(--color-*)` — those resolve from the `--kai-color-*` knobs, so the chrome then tracks the kit's palette AND any accent override automatically. One wrinkle: that stylesheet's dark scope is the `.dark` class, not `prefers-color-scheme`, so matching the elements' `theme="auto"` takes a 4-line matchMedia sync in the page. Nothing documents this pairing for a fine-grain composer.
3. **F-3 — the controller is unpackaged, and it WILL be misinvented.** View routing, active-conversation id, mint-id-on-first-message (C-6), save-per-turn, mount-time auto-restore, the three-leg "seen" rule for `markRead` (open + chat view + active conversation), drilled-chat-vs-level navigation with a back target — all reimplemented in `fine.js`. All of it was *possible* on documented surface — the `ChatThread` prop docs describe the H-2/H-5 model precisely — but nothing ships it, and the fidelity round is the proof of the drift risk: the first pass invented a plausible-but-wrong navigation model (persistent tab bar, header list toggle) that passed every feature check. The likeliest consumer failure mode is not "can't build it" but "builds a different widget without noticing".
4. **F-4 — `userActions`/`assistantActions` are facade sugar.** At the fine grain, actions are a per-message `actions` field, so the app stamps the assistant's action bar onto the finished turn itself — with a new array AND a new message object, per the contract. Two lines, but it must be *known*: forget it and streaming looks perfect while every action bar silently vanishes.
5. **F-5 — `<kai-prompt-input>` has no `accept`.** The facade's `accept="image/*,application/pdf"` filter and its `kai-attachment-rejected` reporting are `kai-chat`-only (verified against element-meta: no such prop). Attachments still stage and submit; they cannot be narrowed at the paperclip. The documented escape (`encodableMediaTypes()` from wire + your own picker) means replacing the paperclip, not configuring it.
6. **F-6 — unread at the finer grain: the primitive serves; the event does not exist and doesn't need to.** The facade's `kai-unread-change` has no fine-grain equivalent — and last week's parity fix turns out to be exactly what replaces it: `(await store.list()).some(isConversationUnread)` is one line, reachable with no bundler via `/kit/stores.js`, and its own JSDoc names this consumer ("any consumer-composed launcher deriving its own badge from `store.list()`"). Verified end-to-end: reply lands while the dock is closed → badge on (`shots/fine-light-6-closed-unread.png`); reopen → `markRead` → badge off (driver asserts both). The caveat is the WRITE side: the primitive covers the read, while the when-to-`markRead` policy is F-3's hand glue.
7. **F-7 — icon names are undiscoverable and fail silent in prod.** `icon="list"` and `icon="send"` painted as the literal words "list" / "sendSend us a message" (first driver run). The curated roster (~75 names in `src/ui/icon.tsx`; no `list`, no `send`) is enumerated nowhere in `docs/web-components.md` — the prop doc says 'a named icon (e.g. "mic", "plus")' and stops. The unknown-name warning is `import.meta.env.DEV`-only, so the shipped build renders wrong with zero console output: a decide-quietly path a CDN consumer hits blind. Cheap fixes: list `ICON_NAMES` in the docs; consider the warning in prod too.
8. **F-8 — `<kai-conversations>` is the desktop sidebar rail, not the widget conversation panel.** Its batteries mode brings sidebar furniture into a widget panel: a hamburger toggle, a "Chats" title, "N messages" sublines, and — with `groups` omitted entirely — rows still render under an "Ungrouped" section header, which reads odd when grouping was never in play (first-pass shot; looks like a small bug worth a look). The fidelity rounds reached the facade's `ConversationPanel` look by combining four escapes: **item mode** (light-DOM `<kai-conversation-item compact>` rows — no group sections; title + a right-aligned `menu`-slot time), an **empty `header` slot** (kills the toggle/"Chats"/new row), a light-DOM **"New conversation" pill** absolutely positioned over the list (`::part(button)` rounded-full, replacing `kai-new-chat`), and — the one thing NO public surface could do — the round-2 **kit fix**: a new `searchable` prop on `<kai-conversations>` (default `true`, the `<kai-prompt-input attach>` default-true flag convention; JSDoc + component test + regenerated element-meta/docs/llms-full/React wrapper), because the built-in search box had no part, slot, or prop to remove it. Spike ethic: that residual is now closed *in the kit*, not worked around. Round 3 added the measured-density lesson: the facade panel's exact row padding (`px-3 py-2.5`) sits in a private interior class between the element's `compact` and default densities, so matching it took host padding plus padding smuggled in on the slotted title/time spans — workable, but exactly the kind of contortion a widget `variant` (or row-density prop) would delete. Remaining polish gap: item rows carry no unread dot.
9. **F-9 — `relativeTimeShort` is not public.** The "2m ago"/"just now" on the facade's recent card and list rows comes from a helper internal to the Solid layer; `/kit/stores.js` ships `byRecency` and `isConversationUnread` but not the time formatter that sits beside them in every rendering of a `ConversationSummary`, so `fine.js` restates it (~10 lines). Same class as F-6's read-side, one export short.
10. **Observation — `localStorageStore` titles from the last message text at first save**, so the recent card's title and its trailing preview can be the same string (near-duplicate; the phase-2 hand-rolled store titled from the first *user* message, which read better — and this is why `facade-*-5` and `fine-*-5` shots show different row titles: it is a store-behavior difference, not a fine-grain one). The fidelity round dedupes the *display* (the preview line hides when it equals the title; list rows show title + time only), but the derivation itself is the store's call and worth revisiting.
11. **Observation — payload: dropping the facade saves nothing.** Initial load was within ~1% of the facade autoloader page's bytes and within a handful of requests (first-pass measurement; re-run `fine-drive.mjs` for current numbers). `kai-thread` + `kai-prompt-input` pull the same bulk `kai-chat` did, and this page adds `kai-conversations` eagerly where the facade lazy-loads its list view.
12. **Observation — accent at the fine grain now beats the facade's coverage:** because the chrome is painted from `--color-*` tokens (F-2's recipe), the single `--kai-color-primary` override retints the CTA, send button, launcher AND the hand-built tab bar's active state together (`shots/fine-accent-light-2-home.png`); phase 2 noted the facade's dock border missing the override, and that loose end still stands.

## LOC, honestly counted

`wc -l` over the sources (re-run it rather than trusting this prose against edited files):

| | HTML | JS | Total |
|---|---|---|---|
| Facade (`index.html` + `app.js`) | 39 | 147 | **186** |
| Fine grain, first pass (feature parity only) | 121 | 207 | **328** |
| Fine grain, after all three fidelity rounds | 234 | 264 | **498** |

**~2.7×** — and the comparison still flatters the facade's JS: 45 of `app.js`'s 147 lines are the hand-rolled store that phase 2's gap forced, which `fine.js` replaces with one import from `/kit/stores.js`. Like for like (both on `stores.js`), the facade page would be ~141 lines total, putting the fine grain nearer **3.5×**. The first pass's 1.8× was an undercount by exactly the fidelity debt: matching the facade's actual navigation, tab bar, home-screen anatomy, list presentation and palette added ~170 lines across the three rounds, almost all of it chrome markup/CSS and routing glue — F-1/F-2/F-3, precisely the unpackaged product tier.

## What would close the gap

Ordered by leverage:

1. **A headless conversation-controller** (the F-3 glue as a shipped primitive beside the stores: restore/select/new/save/markRead with the seen-rule inside, plus the level-vs-drilled navigation state) — turns the most drift-prone consumer code into a few calls, at every grain including React/Solid. The fidelity round showed the drift is real, not hypothetical.
2. **Widget-tier panel parts** — a home-screen element (or card parts for greeting/recent/CTA), a widget tab bar (`kai-tabs` cannot express it), and a widget `variant` on `kai-conversations` that bundles what round 2 assembled by hand (item-mode density, no header, floating pill; the search half already landed as the `searchable` prop) — F-1/F-2/F-8.
3. **Document the fine-grain chrome recipe** — `theme.tokens.css` + `--color-*` for light-DOM chrome, with the `.dark`-class/`prefers-color-scheme` sync — so composers inherit the palette instead of inventing one (F-2's fidelity lesson), and export `relativeTimeShort` beside the other summary-reading helpers (F-9).
4. **`accept` on `<kai-prompt-input>`** — F-5 is a straight facade-to-element push-down; the resolver (`resolveMediaPolicy`) already exists.
5. **Docs: the icon roster** (+ prod-visible unknown-icon signal) — F-7 is the only finding where the current behavior actively misleads.

## Reproduce

```bash
# owner's server already serves it: http://localhost:8931/fine.html
# (facade for side-by-side: http://localhost:8931/index.html)
cd docs/superpowers/research/2026-08-31-composition-spike/cdn-widget-src
PORT=8942 node serve.mjs &          # second instance for driving
node fine-drive.mjs                  # 8 states x {facade,fine} x {light,dark} + accent; assertions + shots
```
