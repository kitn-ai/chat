# Composable Web Components — Roster & Rulings

Status: **shipped surface + rulings record**. Rewritten 2026-08-25 against the WS1 surface
audit (`docs/superpowers/research/2026-08-25-ws1-surface-audit.md`), which found the previous
version of this file contradicting the tree it described. The old document was the 2026-06
planning map for the element spike; the plan shipped, kept shipping, and the doc did not move.
Its rulings are preserved below as **history** — a record is waived, not rewritten into a
falsehood — but nothing in it should be read as a description of the current tree.

What this file IS for: the ruling + reasoning per element family — which pieces are elements,
which stay SolidJS-only, and why. What it is NOT for: element lists, counts, or per-element
APIs. Those rot the moment the tree moves, so they are named by artifact here, never restated:

- **The roster** = the `tag` keys of `packages/ui/src/elements/element-meta.json` (generated
  by `build:api`; the audit counted 83 on 2026-08-25, and `kai-pane-grid` landed immediately
  after it — read the file, not this sentence).
- **Per-element APIs** = `docs/web-components.md` (generated) and the docs site.
- **Entry points** = `packages/ui/src/elements/element-manifest.json` (generated from
  `register-impl.ts` imports).

## 1. The mapping rules (how a Solid primitive becomes an element)

These are contract, not measurement, and they held from the spike through today:

| In the SolidJS layer… | …becomes, on the web component |
|---|---|
| a `variant` / `size` / `mode` prop | a **`variant`/`size` attribute** (string) |
| including/omitting a sub-part to change the look | a **boolean flag attribute** (`hover-card`, `removable`) |
| object/array data to display | a **JS property** (`el.messages = …`) — never an attribute |
| a **fire-and-forget** callback (`onSelect`, `onRemove`) | a non-bubbling **`kai-*` CustomEvent** |
| a callback that **returns a value** (`onTranscribe`) | a **function-valued property** — events can't return values |
| genuinely custom inner markup | a named **`<slot>`** |

Two corrections to the spike-era phrasing, both shipped: events are **`kai-`-prefixed**
(`kai-submit`, `kai-tab-change`), not bare names; and `defineKitnElement` became
`defineWebComponent` (`src/elements/define.tsx`) when the `kitn-` prefix era ended.

## 2. What shipped (the parts of the old plan that are now just the tree)

- **Every element is standalone by construction.** Each facade is its own Solid root with its
  own `ChatConfig` and shadow-root portal mount (`elements/define.tsx`). The audit verified
  this structurally for the whole roster: there is no elements-tier internal glue.
- **The per-element bundle split is merged and shipped** — not "measured and never merged" as
  the roadmap once said. `config/vite/elements.ts` (KAI_BUILD=split) builds a self-registering module per tag;
  the package exports `"./elements/*"` and `"./autoloader"` alongside the register-all bundle;
  `sideEffects` protects the registration modules; `apps/docs` documents all three loading
  strategies (`guides/loading.mdx`). The live footprint question is no longer the JS split but
  the **shared CSS floor** (one compiled sheet adopted whole into every shadow root) — audit
  item 10, unruled.
- **No store; the host coordinates.** The v1 ruling held: data in via properties, out via
  non-bubbling events, host wires A→B. Nothing since has needed a `<kai-provider>`.
- **Cross-element protocols exist where wiring wasn't enough** — e.g. the composed
  `kai-maximize-intent` / `kai-maximize-state` pair in `src/elements/resizable.tsx` — but they
  are opt-in events, not shared state.

## 3. Evidence tiers (from the 2026-08-25 audit — the current honest picture)

Strict derivation (tag literal or wrapper import in `examples/apps/`): **25 driven /
14 rendered-inside-`kai-chat`-only / 44 never touched by any app** at audit time. Structural
standalone-ness is NOT the blocker anywhere; evidence and docs are. The per-element lists,
the 17 zero-docs elements, and the backlog live in the audit doc — this file only records the
rulings that came out of it (§5).

## 4. Stays SolidJS-only (the current ruling, family by family)

The blanket spike-era rule — "generic UI primitives stay Solid-only; a host framework already
has these" — is **overturned as a blanket rule** (history in §6). The replacement test, from
the Dropdown lesson: *is it kit composition surface a consumer can only reach through an
element (themed, composed, wrapper-generated), or a widget their framework already has?* Under
that test, the `src/ui/` atoms still without facades ruled 2026-08-25:

| Atom | Ruling | Why |
|---|---|---|
| `PaneGrid` | **Element-ized** as `kai-pane-grid` (2026-08-25, audit item 7) | Tier-3 layout with real behavior; its siblings `kai-pane`/`kai-pane-group` already had facades, so a framework consumer composing the pane family hit the exact alias-cast wall that overturned the Dropdown ruling. |
| `Stat` | **Deleted** (owner-ruled 2026-08-25, audit item 9) | Was built + tested but exported NOWHERE — reachable at no layer. Widget territory (a KPI tile is three spans in any framework; the one app that wanted one hand-rolled it in six lines). The deletion completes the 2026-06-27 ruling that un-shipped `kai-stat` as demo-only (commit b91fa2eb) but left the Solid primitive behind with no internal consumer. Resurrection path: git history (shipped in commit 735791d3), if the devtools feed work ever wants a kit-styled stat tile. |
| `Collapsible` | Stays Solid-only | Interior mechanism of `kai-reasoning`/`kai-tool`; exported on the root barrel; `<details>` is the host widget. |
| `Textarea` | Stays Solid-only | `kai-input` / `kai-prompt-input` are the element-tier surface. |
| `overlay.tsx` hooks | Cannot be elements | Hooks, not components; the documented `./solid` escape hatch for custom popovers. |
| `action-icons.ts` | Stays internal | `kai-icon` is the surface. |

Hooks/config (`useAutoResize`, `useStickToBottom`, `ChatConfig`, …) stay Solid-only exactly as
originally ruled — that half of the spike ruling was never wrong.

## 5. The popover / dropdown / menu ruling (question CLOSED 2026-08-25: no convergence)

The 2026-08-24 annotation (kept in §6) left an open question: was the real gap behind
element-izing Dropdown *menu semantics* — and should `kai-popover` and `kai-dropdown`
therefore converge? Read against the source, the hypothesized gap does not exist:

- `ui/dropdown.tsx` already ships full menu semantics: `role="menu"`, roving focus whose item
  set includes `menuitem`, `menuitemcheckbox`, `menuitemradio` (disabled skipped, slotted
  light-DOM rows included via a flat-tree walk), typeahead, Home/End, `role="separator"`
  dividers, non-focusable labels, and submenus with `aria-haspopup`/`aria-expanded`.
- `ui/popover.tsx` is deliberately the *other* WAI-ARIA pattern: its own comment contrasts it
  with Dropdown, and its panel is `role="dialog"` for arbitrary content.

So popover and dropdown are the two distinct ARIA patterns, not duplicates; merging them would
un-decide a decision the code already made correctly. The actual near-pair is
**`kai-dropdown` vs `kai-menu`** — both facades over the same `ui/Dropdown`, split by
authoring model: `kai-dropdown` is slot-composed (you write the rows in markup), `kai-menu` is
data-driven (`items: KaiMenuItem[]`). That split is legitimate and matches the kit's
construction-over-configuration direction (slot form for construction, property form for
model/host-driven menus). **Ruling: keep all three; no code convergence; document the
triangle** — `kai-popover` when the panel is content, `kai-dropdown` when you compose menu
items in markup, `kai-menu` when the items are data. (The docs section itself is audit
item 6's residual deliverable.)

## 6. History — superseded rulings, kept as the record

- **2026-06 (the spike plan).** This file originally mapped ~28 proposed feature elements with
  proposed per-element APIs, under the `kitn-` prefix and `defineKitnElement`. All of it
  shipped, was renamed (`kai-`), and grew past the plan; the generated references above
  superseded the API tables. Two of its claims were later measured wrong: the projected bundle
  numbers (superseded by the shipped per-element split, §2), and the claim that a standalone
  `<kai-scroll-button>` "can't see another element's scroll context" — the shipped element
  solves exactly that with a `for` attribute plus a composed-tree ancestor walk.
- **2026-06 ruling: "generic UI primitives stay Solid-only"** (`Button`, `Avatar`, `Tooltip`,
  `Dropdown`, `Dialog`, …: "a host framework already has these; wrapping them is surface area
  for no value").
- **2026-08-24: the Dropdown entry overturned.** A React build test hit the gap: with no
  facade there is no generated wrapper, so the app imported the SolidJS component under an
  alias cast and mount-gated it against `getNextContextId` to keep it off the server. The cost
  the ruling did not price in: "the host framework already has these" holds for the WIDGET,
  not for the kit's own composition surface, which a consumer can only reach through an
  element. Recorded then as one overturned entry, not a policy.
- **2026-08-25: the whole widget tier is element-ized.** The audit found every one of those
  atoms already carries a facade (the tree quietly generalized the Dropdown lesson), and ruled
  that nothing already element-ized should be de-element-ized. The blanket rule is replaced by
  the reach test in §4.
- **2026-08-24 open question on popover/dropdown convergence** — closed 2026-08-25, §5:
  the hypothesized menu-semantics gap was already built, so no convergence.
