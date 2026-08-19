# `kai-dock` — design draft

Status: DRAFT, design only. No implementation, no tracked-file edits.
Owner ruling: rung 1's G-09 (`docs/superpowers/research/2026-08-19-rung-1-mcp-rebuild/findings.md`,
Candidate F) — the launcher is a HOW, so it is the kit's job.

Evidence base: two independent implementations of the same missing affordance.

- **insider** — `examples/apps/support-widget/` (`index.html:82-114`, `src/index.css:169-262`, `src/main.ts:31-44`)
- **outsider** — `docs/superpowers/research/2026-08-19-rung-1-mcp-rebuild/app/` (`index.html:141-181`, `src/styles.css:424-556`, `src/main.ts:44-72`)

Where they agree, it is a requirement. Where they diverge, it is a decision — §3.

---

## 1. What both needed (the union)

| Behaviour | insider | outsider |
|---|---|---|
| Fixed corner dock, logical inset (`inset-inline-end`) | ✅ | ✅ |
| Circular/pill launcher button, elevated, `z-index` above the panel | ✅ (1001 over 1000) | ✅ (sibling in a `pointer-events:none` dock) |
| Two-icon morph: chat glyph → ✕ when open, driven off `[aria-expanded="true"]` | ✅ | ✅ |
| `aria-expanded` + `aria-controls` on the launcher | ✅ | ✅ |
| Panel is `role="dialog"` with an `aria-label` | ✅ | ✅ (`aria-modal="false"` explicit) |
| Escape closes | ✅ (returns focus) | ✅ |
| Focus returns to the launcher on close | ✅ | ✅ |
| Panel never unmounts — thread survives a toggle | ✅ (`hidden`) | ✅ (visibility + `inert`) |
| Narrow-viewport rule so a phone is not given a 380px box hanging off the edge | ✅ | ✅ |
| Slotted content fills the panel (`flex:1; min-height:0`) | ✅ | ✅ |
| Does not move focus for the initial closed state | implicit (never opens at mount) | explicit (`setOpen(false, false)`) |
| Only outsider: `inert`, `chat.focus()` on open, unread dot, sr-only label swap, reduced-motion | — | ✅ |

Both hand-wrote: the button, both SVGs, the dock layout, the open/close state variable, the
`aria-expanded` write, the document `keydown`, the panel geometry, the mobile breakpoint. That is
~14 lines of TS + ~95 lines of CSS (insider) and ~24 lines of TS + ~115 lines of CSS (outsider) of
pure affordance, zero of it about their product.

---

## 2. API

```html
<kai-dock label="Aurora support" position="bottom-end" unread>
  <kai-chat slot="panel" chat-title="Aurora Support"></kai-chat>
  <svg slot="launcher">…</svg>          <!-- optional: replaces the default chat glyph -->
  <svg slot="launcher-open">…</svg>     <!-- optional: replaces the default ✕ -->
</kai-dock>
```

### Element name

`kai-dock`, per the owner's ruling. **Collision risk, stated not hidden:** `kai-prompt-dock` already
exists and is a composer tray; the rung-1 outsider spent an MCP call ruling it out as the
closest-sounding name (findings G-09). Renaming `kai-prompt-dock` is breaking and `kai-widget` /
`kai-launcher` are each worse (one names nothing, one names the smaller half). Recommendation: keep
`kai-dock` and pay for it in prose — both elements' doc comments cross-reference each other in their
first line, because that description is what `component_reference` renders.

Taxonomy: **Components/Elements** (composed + stateful + domain), not a Primitive.

### Slots

Following `elements/slots.ts` `SlotDef` modes:

| slot | mode | contract |
|---|---|---|
| `panel` (also the default slot) | replace | The panel body. ANY element — `kai-chat`, `kai-workspace`, a form, your own. The dock never reads or types it. |
| `launcher` | inject | Content inside the built-in button while CLOSED. Default: a chat-bubble icon. |
| `launcher-open` | inject | Content inside the button while OPEN. Default: ✕. Unfilled ⇒ the closed content stays. |

The button itself is **never** slotted away: the dock owns `aria-expanded`, `aria-controls`, the
focus return and the toggle wiring, and a replaced button would take all four with it. This is the
one place the design refuses a seam on purpose.

`::part(launcher)` · `::part(panel)` · `::part(badge)` for outside styling.

### Props / attributes

Scalars only ⇒ every one is attribute-safe. **No array or object prop exists on this element**, so
`element-nonscalar.json` and the element diagnostics do not apply to it.

| prop | attr | type | default | notes |
|---|---|---|---|---|
| `open` | `open` | boolean | `undefined` | Settable + reflected, via `wireDisclosure`. See §7 dependency. |
| `defaultOpen` | `default-open` | boolean | `false` | Uncontrolled seed. Does **not** move focus (§4). |
| `position` | `position` | `bottom-end` \| `bottom-start` \| `top-end` \| `top-start` | `bottom-end` | Logical, RTL-correct (both references used `inset-inline-end`). |
| `label` | `label` | string | `"Chat"` | The widget's NAME. Derives the panel's `aria-label` and both launcher names (`Open ${label}` / `Close ${label}`) — three hand-written strings in each reference collapse to one. |
| `openLabel` / `closeLabel` | `open-label` / `close-label` | string | derived | i18n overrides for the derived pair. |
| `unread` | `unread` | boolean | `false` | Renders the dot. Consumer-owned (§6). Shown only while CLOSED; the dock never writes it back. |
| `disabled` | `disabled` | boolean | `false` | `wireDisclosure` already gates `show()`/`toggle()` on it. |

Geometry is **CSS custom properties, not props**, matching `kai-prompt-dock`'s `--kai-prompt-dock-*`
convention: `--kai-dock-width` (380px) · `--kai-dock-height` (600px) · `--kai-dock-inset` (1.5rem) ·
`--kai-dock-gap` (0.85rem, launcher→panel) · `--kai-dock-radius` (16px) · `--kai-dock-z` (1000) ·
`--kai-dock-launcher-size` (56px). The narrow-viewport full-bleed rule ships as a default (both
references wrote it independently, which makes it a HOW, not a preference).

### Methods

`show()` · `hide()` · `toggle()` — the kit's existing disclosure vocabulary (`kai-dialog`,
`wireDisclosure`), **not** `open()`/`close()`. Plus `focus()`, which shadows the native host focus per
the WebAwesome/Shoelace convention the kit already follows: focuses the panel while open, the
launcher while closed.

### Events

**`kai-open-change` `{ open: boolean }`** — one event, not `kai-open` + `kai-close`. This is the kit's
existing standard for every open/close element (`disclosure.ts`), fires once per real change, and is
non-bubbling / non-composed like every other `kai-*` event. Answering the brief's question: follow
the convention; do not invent a second one.

---

## 3. The genuine decisions (where the references diverged)

### D-A — hide semantics. **Recommend the outsider's: `visibility:hidden` + `inert`, never unmount.**

| approach | what it breaks |
|---|---|
| `display:none` / `hidden` (insider) | The panel has **no box while closed**: `scrollHeight` is 0, so `scrollToBottom()` on reopen lands wrong; `ResizeObserver`-driven layout inside `kai-chat` measures 0 and re-measures on every open; no open/close transition is possible (display is not animatable); a streaming reply arriving while closed lays out from scratch on reveal. Correct for a11y (removed from the tree), cheap, and it did work. |
| `visibility:hidden` + `opacity` + `inert` (outsider) | Nothing measurable. Removed from the a11y tree by `visibility`, removed from the tab order by `inert`, not painted, layout box retained so measurement stays valid, transitions work. Cost: the subtree stays live, so a stream keeps rendering into a closed panel — which is precisely what makes the unread dot honest. |
| unmount the panel content | Loses everything. `component-register` disposes the Solid root on `disconnectedCallback`; re-attaching is not a defined re-render, and it re-opens the upgrade race on every open (a property set on a re-attached, non-upgraded tag is dropped). The outsider explicitly reasoned this out and refused it. |

The dock therefore ships ONE hide strategy and does not offer a `display:none` mode: two hide modes
means two focus-timing behaviours and two measurement stories for a saving nobody asked for.
`content-visibility: hidden` on the closed panel is an optimisation to evaluate later — it keeps
the box but skips the subtree's rendering work.

### D-B — focus on open. **Recommend the outsider's: move focus INTO the slotted content.**

The insider did nothing on open (only returned focus on Escape); the outsider called
`chat.focus()`, the exposed shadow-reaching method, and it is strictly better — a chat you open by
clicking is a chat you are about to type into.

The dock cannot know it holds a `kai-chat`, so the rule must be content-agnostic:

`focus-on-open` = `content` (default) | `panel` | `none`
- `content` — call `focus()` on the first assigned element of the `panel` slot. Every `kai-*`
  element that has a meaningful focus target exposes `focus()` (`kai-chat` → the composer); a plain
  `<div>` is a no-op and falls back to `panel`.
- `panel` — focus the `tabindex="-1"` panel container (what `kai-dialog` does).
- `none` — never move focus.

**The ordering the outsider discovered is a hard invariant, not a style:** `inert` must be cleared,
and `visibility` restored, **before** `focus()` — `focus()` into an inert or `visibility:hidden`
subtree is silently dropped, no error. Implementation: flip open state + attributes synchronously in
the effect, then `queueMicrotask(() => …focus())`, the same shape `ui/dialog.tsx:125-136` already
uses. This gets its own test that fails when the order is reversed (§7).

### D-C — Escape scope. **Recommend narrower than BOTH references: close on Escape only when the dock contains focus.**

Both listened on `document` and closed on any Escape anywhere on the page. That is modal behaviour in
a non-modal widget: it makes a background support bubble eat the Escape a host page's own menu,
combobox or lightbox wanted. Since the panel is non-modal (§5) and the launcher is a real tab stop,
"focus is inside the dock" is reachable and unambiguous. The dock does not `stopPropagation` on
Escape — swallowing a key from a page it is a guest on is a decide-quietly move.

Stated as a departure so the reviewer sees it: this is the one place the design overrides two
independent implementations.

### D-D — unread. **Recommend a consumer-owned `unread` boolean that the dock never writes.**

Only the outsider had it, via `data-unread` set in the fetch's `finally`. The dock cannot know what
"unread" means (a reply landed? a reply landed and it is not the one you asked for?), so it is a
prop. Two sub-rulings:

1. The dock does **not** clear `unread` on open. Writing over a consumer prop is exactly the trap
   `kai-chat.loading` fell into (findings G-05). The dot simply does not render while open; the prop
   is untouched, and the docs say clear it in your `kai-open-change` handler.
2. Boolean only in v1 — a count badge is more surface for a case neither reference had.

---

## 4. Focus contract

- **open (user-initiated or programmatic state CHANGE):** clear `inert` + restore visibility →
  microtask → focus per `focus-on-open`. Record the previously-focused element (`deepActiveElement()`,
  drilling shadow roots, as `ui/dialog.tsx:80-84` already does).
- **close:** focus returns to the **launcher**, always — not to the pre-open element. The launcher is
  where the user was and where they will go next; both references chose this.
- **mount:** `default-open` seeds the state and moves **no** focus. This needs the presence effect
  seeded with the initial open value, not `false` — note that `kai-dialog` deliberately seeds `false`
  so a `defaultOpen` modal DOES take focus at mount. Opposite default, same mechanism, and the
  difference is the modal/non-modal split.
- **no focus trap.** `kai-dialog` traps Tab; the dock must not. A support widget that traps the page
  is a bug, and the page staying usable is the whole point of "docked".
- The dock never focuses anything when `open` is driven programmatically to the value it already
  holds (`wireDisclosure`'s equality guard already prevents the event; the focus effect keys off the
  same transition).

## 5. Accessibility

- Launcher: `<button type="button" aria-expanded aria-controls="<panel id>">`, accessible name
  swapping between `Open ${label}` and `Close ${label}` (the outsider's `.sr-only` swap, built in).
  The icon morph is decorative (`aria-hidden`) — the NAME is what changes for AT.
- Panel: `role="dialog"` + `aria-modal="false"` + `aria-label={label}`, matching both references,
  which arrived at it independently. Considered and rejected: `role="region"` / `complementary`
  (landmark-navigable, but loses the "this is an overlay you can dismiss" affordance SR users expect
  from a floating panel). `aria-modal="false"` is load-bearing given there is no trap — claiming
  modality without trapping is worse than claiming neither.
- Closed panel: `inert` **and** `visibility:hidden`. Belt and braces on purpose: `visibility` removes
  it from the a11y tree, `inert` removes the focusable composer from the tab order. The outsider's
  comment names exactly this ("a visibility:hidden panel is already skipped by most AT, but the
  composer is focusable and inert is the part that actually stops it").
- `prefers-reduced-motion: reduce` disables the open/close transition (outsider had it).
- Documented constraint: put `<kai-dock>` as a body-level child. A `transform`/`filter`/`contain`
  ancestor makes `position: fixed` resolve against that ancestor instead of the viewport — a real
  HOW fact the element cannot fix from inside, so it gets stated rather than discovered.

## 6. Scope boundary (kit decides HOW, app decides WHETHER)

Audited against the rule; each of these was pulled OUT of the component:

| candidate behaviour | ruling |
|---|---|
| Whether a reply arriving while closed counts as unread | **WHETHER** → `unread` prop, consumer sets it |
| Whether closing cancels the in-flight request | **WHETHER, lands on an invoice** → the dock aborts NOTHING. It owns visibility and focus, never network. Both references let the stream keep folding after close; that is correct. |
| Whether the open state persists across reloads | **WHETHER (retention)** → out. `open` + `kai-open-change` is the seam; the consumer persists if they want to. |
| Whether the widget renders at all / on which pages / for which users | **WHETHER** → the consumer renders the element |
| Panel size, corner, z-index, brand colour | consumer's design → CSS tokens + `position` |
| Whether opening steals focus | borderline → `focus-on-open` prop, sane default |
| Focus return, `inert` ordering, Escape, `aria-expanded`, the tab order, the reduced-motion rule | **HOW** → the kit's, non-configurable |

## 7. What the two rung-1 apps delete (the extraction test)

**`examples/apps/support-widget/`**
- `index.html:82-98` — the whole launcher `<button>`, both inline SVGs. `index.html:100-114` — the
  panel `<div role="dialog" hidden>` wrapper (the `<kai-chat>` gains `slot="panel"` and stays).
- `src/index.css:169-210` (`.launcher`, the icon-morph rules) and `:212-262` (the copied
  `placementStyle('docked-widget')` block, the `[hidden]` override, the 480px media query) — **~95
  lines, the entire second half of the file.**
- `src/main.ts:27-44` — `launcher`/`panel` lookups, `setOpen`, the click listener, the document
  `keydown`. **14 lines and two of the three `must()` calls.** What remains is `chat` + the
  `kai-submit` wiring, i.e. only the product.

**`docs/superpowers/research/2026-08-19-rung-1-mcp-rebuild/app/`**
- `index.html:141-181` — the `.kai-dock` wrapper, panel `<section>`, launcher button, two SVGs, the
  `.sr-only` label span.
- `src/styles.css:424-556` — `.kai-dock`, `.kai-panel` (+ `.is-open`, the reduced-motion rule),
  `.kai-launcher` (+ icon morph, focus ring, `[data-unread]::after`), the 480px query. **~115 lines.**
- `src/main.ts:43-72` — `panel`/`launcher`/`isOpen` module state and all of `setOpen` (24 lines:
  class toggle, `inert`, `aria-expanded`, sr-label swap, unread clear, `chat.focus()`), plus the
  document `keydown` (`:159-161`) and `setOpen(false, false)` (`:163`).
- **Residue, deliberately:** `dock.unread = true` in the `finally` when closed, and
  `chat.scrollToBottom('instant')` on `kai-open-change`. The dock must not call `scrollToBottom` —
  that is a method on content it is not allowed to know about. If a future version needs it, the seam
  is the event, not a reach into the slot.

Both apps shrink by roughly the same 100–140 lines and neither loses a behaviour. If a proposed API
change makes either app grow, the change is wrong.

## 8. Scaffolder impact

`placementStyle('docked-widget')` (`packages/ui/src/agent-tooling/mcp/tools/scaffold.ts:163-172`)
currently returns raw fixed CSS for a permanently-visible panel — the thing findings G-09 says is
"not a widget". After `kai-dock`:

- The placement **emits the element**, not the CSS: `<kai-dock label="…">` wrapping the surface, with
  `style: ''` for the container and `chatFill` **unchanged** (`flex:1; min-height:0` — the panel is
  still a flex column and the chat still has to fill it).
- Emitted closed. A launcher IS visible on load, so nothing looks broken, and closed is what the
  archetype means.
- `archetypes.ts` `support-widget` gains `kai-dock` in its components list — that is the actual fix
  for the discovery half of G-09: the ingredient list for an archetype named "widget, docked" should
  contain the dock.
- Knock-ons to expect (name them in the implementation plan, do not discover them):
  `mcp/scaffold.test.ts:359` ("docked-widget placement produces a fixed, sized container") and
  `:734` ("'side' and 'docked-widget' produce DISTINCT layouts") both assert the raw CSS and must be
  rewritten against the element; `matrix.test.ts:135` enumerates placements; `verify:scaffold`'s
  `html` structural check should assert `<kai-dock>` wraps the surface; the React wrapper (`Dock`)
  and `element-meta.json` / `custom-elements.json` / `llms-full.txt` regenerate from `build:api`.
- `side`, `full-page` and `inline` are untouched.

## 9. Testing

Following the repo's conventions — `semantic-state.aria.test.tsx` (assert against the real custom
element, not the Solid component), `reactivity-contract.test.tsx` (every negative assertion paired
with a positive one over the same harness), and "watch it fail first".

1. **Reflected-boolean read-back** — `el.open = true; expect(el.open).toBe(true)`. `wireDisclosure`
   reflects `open` with `toggleAttribute`, which is *exactly* the write-only mechanism traced in
   findings G-05. **DEPENDENCY: the broad fix in `.superpowers/sdd/2026-08-19-rung-1-findings/fix2-brief.md`
   (the pre-define seam accessor) must land first**, or `kai-dock.open` ships write-only on day one.
   This applies to every boolean prop here (`open`, `defaultOpen`, `unread`, `disabled`).
2. **Attribute parsing** — `<kai-dock open>` is open, `open="false"` is closed, absent is closed
   (`resolveFlag`, findings G-10).
3. **A11y** — `aria-expanded` flips on toggle; the panel has an accessible name derived from `label`;
   `open-label`/`close-label` override it; the launcher's accessible NAME changes (not just the icon).
   Not axe — axe has nothing to complain about here; assert the state EXISTS (the reasoning in
   `semantic-state.aria.test.tsx`'s header applies verbatim).
4. **Tab order** — a focusable element inside the closed panel is not reachable; paired with the open
   case over the same harness so "not reachable" cannot pass vacuously. jsdom needs `bool:inert`
   (see `ui/collapsible.tsx:158`) for the attribute to reflect.
5. **Focus choreography** — open → focus lands in the slotted content (`deepActiveElement()`);
   close → focus is on the launcher; `default-open` at mount moves no focus; **ordering**: mutate the
   implementation to focus before clearing `inert` and watch the test go red. jsdom does not model
   visibility-based focusability, so the ordering test either runs in the storybook browser project
   or asserts the operation ORDER via spies — say which, do not let it pass vacuously in jsdom.
6. **Escape scope** — Escape with focus inside the dock closes; Escape with focus on a page element
   outside it does NOT (the D-C departure, and the only test that pins it); Escape does not stop
   propagation.
7. **Event** — `kai-open-change` fires once per change, `{ open }` detail, `bubbles: false`,
   `composed: false`; setting `open` to its current value fires nothing.
8. **`unread`** — the dot renders closed, not open, and the prop is unchanged after an open/close
   cycle (pins D-D.1).
9. **Registration/manifest** — the element appears in `register-impl.ts`, the element registry test,
   and `dist/custom-elements.json` after a real build (the manifest tests need one — CLAUDE.md's
   three-step rule).

## 10. Out of scope for v1

- Light dismiss / click-outside close.
- Focus trap, and any `modal` variant.
- Unread **count** badge, sound, or a "teaser" proactive bubble ("Need help?").
- Drag, resize, or a remembered position.
- Persistence of the open state.
- A stacking manager for two or more docks on one page.
- `no-launcher` mode (a panel with no toggle is `placement: 'side'`).
- Mobile takeover as a *prop* — the breakpoint ships as a default instead.
- Any knowledge of the slotted content: no `scrollToBottom`, no message counting, no
  `kai-chat`-specific behaviour anywhere in the element.
