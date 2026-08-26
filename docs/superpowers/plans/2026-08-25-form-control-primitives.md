# Plan: form-control primitives — one radio, one checkbox, one slider, one select

Date: 2026-08-25. Origin: an owner observation ("in ChoiceCard it looks like we have a custom
radio, but in our forms we use the default radio and checkbox … Range is the same") and the
read-only audit that followed. No prior spec — this file is the spec and the plan.
Branch: not yet cut. Sequential work, so a plain branch off `main` in the main checkout.
Status: **Steps 0–1 are ready to build. Steps 2–7 need the D-1..D-4 rulings below.**

**Goal:** every form control in the kit has exactly one implementation, built on a real native
input, so a radio looks and behaves the same in a form card, a choice card and anywhere a consumer
composes one — and Storybook stops lying about which of those is which.

**Architecture:** promote the four `@layer components` control styles that already exist in
`packages/ui/src/elements/styles.css` into real `packages/ui/src/ui/` components, then migrate the
call sites. Nothing is invented; the look is already designed and shipping. The work is turning CSS
classes nobody owns into components that own themselves, and deleting the four hand-rolled copies.

**Non-goals:** a `Rating` primitive (single use), a `TagList` primitive (single use), rewriting
`ui/switch.tsx` (it is correct), any validation, any limit, any quota (see §4), and any change to
`src/wire`.

---

## Executive summary

1. **Most of what the owner saw is a Storybook bug, not a shipped one.** Solid `Components/*`
   stories do not load the shipped element stylesheet, so the form's radio, checkbox and range
   render as raw native controls there while the same code inside a `kai-*` element renders fully
   designed. Measured, both ways, on the same page. §0.
2. **Underneath it there are three real defects and one ARIA bug**, none of which is what was
   reported: the switch ships at two different sizes, `tasks-card.tsx` draws two different
   checkboxes, the checklist's keyboard focus is invisible, and `RatingWidget` puts focus on the
   group instead of the radio. §1. These stand alone — ship them regardless of §3.
3. **Four control types have no owner at all** — radio, checkbox, slider, select exist only as CSS
   classes or as inline `<select>`s. That is why there are four radios and three checkboxes in the
   tree. §2.
4. **Five new `src/ui/` primitives close it**, every one a real native input behind
   `appearance: none`. Never a fake-control div: every accessibility loss found in the audit is in
   a fake-control implementation, and none is in the `appearance: none` ones. §3.
5. **Step 0 blocks everything** because the measuring instrument is broken. §5.

---

## 0. Read this first: the reported inconsistency is ~85% a Storybook artifact

`packages/ui/.storybook/styles.css` is a hand-maintained **partial mirror** of
`packages/ui/src/elements/styles.css` — the source file says so at its line 2. It re-states the
focus ring, the scrollbars and the `:host` font size, each under a "Mirror the shipped …" comment.
It does not re-state `.kai-radio`, `.kai-checkbox`, `.kai-range` or `.kai-focus-inset`, and nothing
enforces the mirror.

Re-derive:

```bash
grep -c "kai-radio\|kai-checkbox\|kai-range\|kai-focus-inset" packages/ui/.storybook/styles.css
```

Consequence, measured live on Storybook against `Components/Elements/Form → Support Ticket`, then
against a `<kai-form>` mounted into the same document (computed styles, not screenshots):

| control | Solid `Components/*` story (light DOM) | inside `<kai-form>` (shadow root) |
| --- | --- | --- |
| `input.kai-range` | `appearance: auto`, 16px tall — the OS slider | `appearance: none`, 20px, custom track + thumb |
| `input.kai-checkbox` | `appearance: auto`, 13×13 — the OS checkbox | `appearance: none`, 18×18, designed |
| `input.kai-radio` | `appearance: auto`, 13×13 — the OS radio | `appearance: none`, 18×18, 1.5px `--color-input`, drop shadow |

So "our forms use the default radio and checkbox" and "range is not custom looking, just is" are
**true in the stories and false in the shipped element.** A consumer never sees any of it.

`.kai-range` in particular is one of the more carefully built things in the sheet — a
`--kai-range-fill` gradient track, matched `-webkit-` and `-moz-` thumbs, a hover scale, a focus
halo, a disabled state — and it renders as bare OS chrome in every story that shows it.

The ChoiceCard comparison, measured in two shadow roots on the same page:

| | ChoiceCard fake ring (`choice-card.tsx:640`) | form `.kai-radio` |
| --- | --- | --- |
| box | 18×18, 1.5px `rgb(45,44,42)`, bg `rgb(23,23,22)`, round | identical |
| shadow | none | `rgba(0,0,0,.04) 0 1px 2px` |
| hover / press | none | halo + `scale(0.92)` |

The shipped delta between the two radios is a drop shadow and the press feedback.

**Both an agent and the owner reached "we never finished the controls in the form" from this.** Two
independent people, same wrong conclusion, from the same broken instrument. Anyone reading this
document later will do it again unless Step 0 lands. That is why Step 0 blocks.

---

## 1. The real defects (Step 1 — independent of everything else)

### 1.1 The switch ships at two sizes

`packages/ui/src/ui/switch.tsx:31` (and `<kai-switch>`, `src/elements/switch.tsx:109`) render a
36×20 track. `packages/ui/src/components/form-widgets.tsx:222` re-implements the same control
inline at 44×24. Measured in two shadow roots on the same page; pure Tailwind utilities, so the
story shows it too. A consumer using `<kai-switch>` beside a `<kai-form>` boolean field sees two
different switches.

**The size is the whole of the user-visible defect.** An earlier draft of this section also
claimed the inline copy "re-introduced the bug the primitive documents fixing" — that the
`bg-background` thumb at `form-widgets.tsx:243` repeated the dark-mode disappearing thumb that
`ui/switch.tsx:80` carries a comment about. **That claim is false and was measured false** in a
real Chromium during Step 1 (contrast of each candidate thumb against the on-state `bg-primary`
track, both themes):

| thumb | light | dark |
| --- | --- | --- |
| `bg-white` — the hard-coded thumb `ui/switch.tsx:80`'s comment is about | 17.72 | **1.04** |
| `bg-background` — what `form-widgets.tsx:243` actually used | 17.72 | **17.19** |
| `bg-primary-foreground` — what the primitive uses | 16.97 | 16.18 |

Only `bg-white` vanishes. `bg-background` is a theme token that flips with the theme, so the
inline copy had a visible thumb in both modes and shipped no such bug. Re-derive by reading
`getComputedStyle` on a `bg-primary` / `bg-background` / `bg-primary-foreground` probe under and
outside `.dark`; do not trust the numbers here.

What survives is a **consistency** argument, not a bug report: `primary-foreground` is the token
*paired* with `primary`, and `background` is paired with `foreground`. They happen to coincide
closely in today's theme. A theme that moved `background` without moving `primary` would break the
copy and not the primitive, and nothing in the tree stops that. Correct by luck is worth fixing;
it is not worth reporting as a shipped defect.

**Fix, unchanged:** import `Switch` from `../ui/switch`, delete the inline copy. One
implementation, correct token pairing, and the 44×24 → 36×20 convergence that was the real defect.

**Blocked on D-7:** `Switch` has no props for the four form-only hooks the inline copy carried.

### 1.2 `TaskList` checklist rows have no visible keyboard focus

`packages/ui/src/components/tasks-card.tsx:679` is an `<input type="checkbox" class="sr-only">`
inside a `<label class="group … focus-visible:ring-2 …">` at `:652`. `focus-visible:` matches only
when the label itself is focused, and the label is only focusable on completed rows
(`tabindex` at `:673`). The tab stop for every row is the off-screen input. Tab to an unchecked row
and there is no focus indicator anywhere on screen.

The description-reveal in the same element already uses `group-focus-within:` (`:724`), so the two
mechanisms inside one component disagree about where focus lives.

**Fix:** `has-[:focus-visible]:ring-2` (or `focus-within:`) on the label.

### 1.3 `tasks-card.tsx` draws two different checkboxes

`:514` and `:554` use `.kai-checkbox` — a square box. `:679` uses a lucide `Circle` /
`CircleCheck`. Same file, 130 lines apart, two visual languages for "checked". Real and
consumer-visible in both variants. Whether this is a defect or a deliberate distinction between
"pick from a list" and "a checklist" is **D-2** below.

### 1.4 `RatingWidget` puts focus on the wrong element (ARIA bug)

`packages/ui/src/components/form-widgets.tsx:175`. The container is
`role="radiogroup" tabindex={0}` (`:186–191`) and every `role="radio"` button is `tabindex={-1}`
(`:205`). Arrow keys change the value, focus never moves to a radio, and there is no
`aria-activedescendant`. A screen reader announces the group, never "3 stars, selected". The
visible ring sits on the group, not the current star.

**Fix:** roving tabindex — move the tab stop onto the radios, keep the arrow handling.

### 1.5 Noted, not scheduled

`packages/ui/src/components/response-compare.tsx:402` is a `<Button role="radio"
aria-checked={false}>`. Overriding a button's role with `radio` while hard-coding `aria-checked`
false means the control never announces a selected state. Adjacent to this work rather than in it;
fold into Step 3 only if the owner wants it.

---

## 2. How many implementations there are

This is the argument for the work. Every count below is a grep, stated so it can be re-derived
rather than trusted.

```bash
cd packages/ui
grep -rn 'type="radio"\|role="radio"\|role="radiogroup"' src/
grep -rn 'type="checkbox"' src/ | grep -v stories
grep -rn 'type="range"' src/
grep -rn '<select' src/
grep -rn "export function Checkbox\|export function Radio\|export function Slider\|export function Select" src/
```

| control | distinct implementations | where |
| --- | --- | --- |
| radio | four | `.kai-radio` CSS (`src/elements/styles.css`, `@layer components`) · ChoiceCard's fake ring (`components/choice-card.tsx:640`) · Rating's star-as-radio (`components/form-widgets.tsx:175`) · `<Button role="radio">` (`components/response-compare.tsx:402`) |
| checkbox | three | `.kai-checkbox` CSS · tasks-card select variant reuses it (`components/tasks-card.tsx:514,554`) · tasks-card checklist variant, sr-only input + lucide icon (`components/tasks-card.tsx:679`) |
| switch | two | `ui/switch.tsx:31` · `components/form-widgets.tsx:222` |
| select | two, plus two more in stories | `components/form-widgets.tsx:316` · `:391` · hand-styled `<select>`s in `ui/settings-group.stories.tsx` and `ui/settings.stories.tsx`, each with its own class string and a "a real build would swap in a kai-menu trigger" comment |
| range | one | `.kai-range` CSS + `components/form-widgets.tsx:140` — the only control in this tier that is not duplicated |
| text field | two | `ui/input.tsx` (`FIELD_BASE`) · raw `<input class={cn(inputBase)}` at `components/form-widgets.tsx:119` and `:434` |

The last grep is the finding: **there is no `Checkbox`, `Radio`, `Slider` or `Select` component
anywhere in `src/ui/`.** Every hit is a `*Widget` inside `components/form-widgets.tsx`. `src/ui/`
has `input.tsx`, `textarea.tsx`, `switch.tsx` and `segmented.tsx` and stops there. `src/elements/`
matches it — `kai-input`, `kai-search`, `kai-switch`, `kai-segmented`, and no `kai-checkbox`,
`kai-radio`, `kai-select` or `kai-slider`.

Two of the four radios and two of the three checkboxes live in a file that also uses the other
implementation.

### What the bypasses cost

`components/form-widgets.tsx:119` (number) and `:434` (taglist) paste `FIELD_BASE` onto a raw
`<input>` instead of using `Input`. They look identical, so nothing is visible — what they lose is
the focus-node-reuse fix that `ui/input.tsx:262–268` documents at length (a consumer deriving
`invalid` from the value lost focus after every keystroke; `kai-form` did exactly that), and the
masking that `Input` now owns.

---

## 3. The primitives to build

**The hard rule: a real native input behind `appearance: none`. Never a fake-control div.**

This is not style preference. It is what the audit measured. Every implementation built on a real
input — `.kai-radio`, `.kai-checkbox`, `.kai-range` — has correct keyboard behaviour, correct
screen-reader announcement, form participation and a focus ring, all free, all inherited from the
global `:focus-visible` rule in `src/elements/styles.css`. Every accessibility defect in §1 is in an
implementation that replaced the native control with a `div` or a `button`. The two facts are the
same fact.

| primitive | built on | replaces |
| --- | --- | --- |
| `Checkbox` | native `<input type="checkbox">` + `appearance: none`; promote `.kai-checkbox` as its implementation, keep the class | `form-widgets.tsx:255`, `:350`, `tasks-card.tsx:514,554` |
| `Radio` + `RadioGroup` | native `<input type="radio">` + `appearance: none`, with a presentation slot so a row can carry media, a description and a badge around the control | `form-widgets.tsx:276`, `choice-card.tsx:640` |
| `Slider` | native `<input type="range">`; promote `.kai-range`, and move the `--kai-range-fill` arithmetic (`form-widgets.tsx:146–152`) inside so no caller computes it | `form-widgets.tsx:140` |
| `Select` | native `<select>` + `appearance: none` + a kit chevron, box consistent with `FIELD_BASE`. **Native, not a listbox** — keeps mobile pickers, typeahead and form participation | `form-widgets.tsx:316`, `:391`, and the four story `<select>`s |
| `Field` (optional) | label + description + error + the `aria-describedby` chain | the duplication inside `form.tsx`'s `FieldRow` |

`RadioGroup` with a presentation slot subsumes ChoiceCard's list-row layout entirely. That is what
makes Step 3 a deletion rather than a second component.

---

## 4. Scope boundary

Per CLAUDE.md — the kit decides HOW, the app decides WHETHER. Every item here is a HOW: how a radio
looks, how a slider thumb responds to a press, how focus is indicated, how a select renders its
chevron. Squarely ours, and deciding them well is the point of the work.

What stays the consumer's, and the specific traps:

- **`Slider` must not invent a default `max`.** `SliderWidget` currently defaults `min` to 0 and
  `max` to 100 (`form-widgets.tsx:141–142`) because a JSON-Schema field may omit them. That default
  belongs to the *widget*, which is reading a consumer-authored schema — not to the primitive. The
  primitive takes `min`/`max`/`step` and renders them. If they are absent it is the caller's
  problem, surfaced, not papered over.
- **`TagList` must not grow a `maxTags`.** How many tags is too many lands in a policy document.
- **`Checkbox` / `Radio` must not validate.** No `required` enforcement, no "at least one"
  semantics. Pass `required` through to the native attribute and let the form decide.
- **`Select` must not truncate or de-duplicate its options.** If a silent drop is ever tempting,
  the answer is the same as everywhere else in this repo: decide loudly or don't decide.

---

## 5. Tasks

Each step is independently shippable. The order matters and §5's notes say what breaks if it is
violated.

### 0. Fix the measuring instrument (BLOCKING)

Everything below is verified by looking at it. Right now Storybook renders three of these four
controls wrong. Do not start Step 1 until this lands.

Options, cheapest first:

- **(a)** Add the missing rules to `.storybook/styles.css`. Fixes today's symptom, leaves the class
  of bug intact — the next `@layer components` rule diverges the same way.
- **(b) Recommended.** Make `.storybook/styles.css` `@import "../src/elements/styles.css"` and drop
  the hand-copied mirror rules. `:host` and `.dark` selectors will not match in the light DOM, so a
  small preview-only shim stays for those, but every `@layer components` rule comes across
  automatically and permanently. Storybook already runs Tailwind over the same `@source "../src/"`,
  so this should be close to free.
- **(c)** A guard asserting every `@layer components` selector in `src/elements/styles.css` is
  reachable from the Storybook sheet. Worth it only on top of (a); (b) makes it unnecessary by
  construction.

- [ ] Implement (b). Keep the `:host` / `.dark` shim and its comment.
- [ ] Update `packages/ui/src/stories/getting-started/BuildingInLabs.mdx:49` — it currently warns
      that element CSS does not hot-reload, which reads as reassurance that the CSS is otherwise
      present. Say plainly that Solid stories render in the light DOM and what that means.
- Verify: reload `Components/Elements/Form → Support Ticket` and read computed styles on the
  range, checkbox and radio. All three must report `appearance: none` and the shadow-root sizes in
  §0. **Watch it fail first** — check the same three before the change and record `appearance:
  auto` in the task report. Then re-check `Components/Elements/TasksCard` and
  `Components/Elements/ChoiceCard`, which are the other two stories the artifact touches.
- Effort: ~2h.

### 1. The three defects plus the ARIA bug

No new primitives. Ships alone.

- [ ] `components/tasks-card.tsx:652` — label gets `has-[:focus-visible]:ring-2 …` so the sr-only
      checkbox's focus is visible. Keep the existing `focus-visible:` behaviour for the completed
      rows that are focusable in their own right, or fold both into the one rule.
- [ ] `components/form-widgets.tsx:175` `RatingWidget` — roving tabindex onto the `role="radio"`
      buttons, remove `tabindex={0}` from the group, keep the arrow handling, move the focus ring
      onto the focused star.
- [ ] `components/form-widgets.tsx:222` `SwitchWidget` — delete, import `Switch` from `../ui/switch`.
- Verify: keyboard-only pass in a real Chromium over `Components/Elements/TasksCard`,
  `Components/Elements/Form` (a `rating` field and a `switch` field). Tab through every row and
  assert a visible ring on every stop; assert the rating's focused star carries `aria-checked`.
  Unit: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit`.
- **Consumer-visible change:** the form's switch shrinks from 44×24 to 36×20. That is a
  convergence, not a regression, and it is the only visible change in this step.
- Effort: ~4h.

### 2. `Checkbox` + `Radio` / `RadioGroup`

- [ ] `packages/ui/src/ui/checkbox.tsx`, `packages/ui/src/ui/radio.tsx`. Keep `.kai-checkbox` /
      `.kai-radio` as the internal implementation so the rendered result is provably unchanged.
- [ ] Support `indeterminate` on `Checkbox` — `tasks-card.tsx:518–522` already needs it and drives
      it through a `ref` + `createEffect`. Move that inside.
- [ ] Migrate `form-widgets.tsx:255`, `:350`, `tasks-card.tsx:514`, `:554`.
- Verify: computed-style diff before and after on the same stories — geometry, border, background,
  shadow, and the `:checked` state must be byte-identical. Unit suite. `nx typecheck ui
  --skip-nx-cache`.
- Effort: ~1 day.

### 3. ChoiceCard's fake ring becomes a `Radio`

This is the step the owner's observation is actually about.

- [ ] Replace the `aria-hidden` ring at `components/choice-card.tsx:640` with `Radio`.
- [ ] Decide `ListRow`'s control: keep `<div role="radio">` (no form participation) or move to a
      real input. **Recommendation: real input** — see D-1. If ruled that way, `RadioGroup`'s
      presentation slot carries the media, label, description, `RecommendedPill` and meta column,
      and `ListRow` collapses into it.
- [ ] Do not lose what `ListRow` already gets right: roving tabindex (`:611`), `aria-checked`,
      `aria-disabled`, `aria-describedby`, group-level arrow keys (`:370`), the inset focus ring
      (`:616`).
- Verify: `packages/ui/tests` ChoiceCard keyboard tests green unchanged. `[role="radio"]` selectors
  at `choice-card.tsx:370` and `response-compare.tsx:199` must still match — keep the role on the
  row wrapper, whichever way D-1 goes. Visual diff: ChoiceCard's radio gains the drop shadow and
  the press feedback.
- **Order note:** Step 2 must land first, or this creates a second radio component instead of
  deleting one.
- Effort: ~1 day.

### 4. `Slider`

- [ ] `packages/ui/src/ui/slider.tsx` over `.kai-range`, owning the fill computation.
- [ ] Migrate `form-widgets.tsx:140`. `min`/`max`/`step` are required props with no defaults (§4).
- Verify: computed styles on the track, both thumbs, hover, `:focus-visible`, disabled — all
  unchanged. Keyboard: arrows, Home, End, PageUp/PageDown all still native.
- Effort: ~3h.

### 5. `Select`

Highest consumer-visible payoff, lowest risk — this is the one that still shows OS chrome inside a
kit-styled box today. `src/elements/styles.css` sets `color-scheme` so the native dropdown at least
follows the kit's light/dark; that is a mitigation, not a fix.

- [ ] `packages/ui/src/ui/select.tsx`. Native `<select>`, `appearance: none`, kit chevron,
      `FIELD_BASE`-consistent box, `invalid` and `disabled` states matching `Input`.
- [ ] Migrate `form-widgets.tsx:316`. Migrate `:391` (`MultiSelectWidget`) subject to D-3.
- [ ] Update the four story `<select>`s in `ui/settings-group.stories.tsx` and
      `ui/settings.stories.tsx` and delete their "a real build would swap in a kai-menu trigger"
      comments.
- Verify: real Chromium and real Safari (the two that disagree most on `<select>` styling). Confirm
  the option list is still the OS list, typeahead still works, and the control still participates in
  a native form.
- Effort: ~1 day.

### 6. Number and taglist route through `Input`

- [ ] `form-widgets.tsx:119` and `:434` use `Input` instead of `cn(inputBase)`.
- Verify: the focus-preservation case `ui/input.tsx:262–268` describes — type into a number field
  whose `invalid` derives from its own value and assert focus and caret survive. Watch it fail
  first on the current raw `<input>`.
- Effort: ~3h.

### 7. `kai-*` facades (only if D-4 says yes)

- [ ] `kai-checkbox`, `kai-radio-group`, `kai-slider`, `kai-select` in `src/elements/`.
- [ ] Regenerate derived artifacts with `npm run build:api` inside `packages/ui` — never
      `gen-llms.mjs` standalone. Element counts in docs move on their own; do not hand-type them.
- Verify: `pnpm --filter @kitn.ai/ui run verify:consumer`, then the element manifest tests. Purely
  additive, so nothing existing should move.
- Effort: ~1 day.

---

## 6. Breaking changes

Small, because almost none of this is public API today.

- **No exported symbol is removed.** `.kai-radio`, `.kai-checkbox`, `.kai-range` are shadow-internal
  classes with no `::part`, so a consumer cannot reach them.
- **Visual:** the form switch shrinks (Step 1); ChoiceCard's radio gains a drop shadow and press
  feedback (Step 3); `<select>` gets a kit chevron (Step 5).
- **DOM shape inside `kai-choice`'s shadow root changes** if D-1 goes to a real input.

**Selectors that must survive every step:**

- `[role="radio"]` — `components/choice-card.tsx:370` and `components/response-compare.tsx:199`
  both query it to drive keyboard navigation. Keep the role on the row wrapper regardless of what
  sits inside it.
- `input[type="checkbox"]` — `components/tasks-card.tsx:360` queries it to find the first control
  in a group.
- `input:not([type="file"])` — `src/elements/prompt-input.tsx:195`. Unrelated to this work, but any
  new hidden input in the elements layer must not become the thing it focuses.

Unaffected gates: `lint:silent-drops` (no `src/wire` change), `lint:cdn-pins` (no version literal),
`verify:scaffold` (no scaffolder template change) — unless Step 7 lands, which touches
`src/elements/chat-types.ts` not at all but does move element counts in derived artifacts.

---

## 7. Decisions ledger — owner rules these

| ID | Question | Recommendation | Why |
| --- | --- | --- | --- |
| **D-1** | Does ChoiceCard's `ListRow` move from `<div role="radio">` to a real native `<input type="radio">`? | **Yes** | It removes one of the four radios instead of restyling it, and `RadioGroup` with a presentation slot subsumes the row layout. Cost: the row gains form participation it does not currently need, and the ChoiceCard keyboard tests need re-pointing. Saying no leaves a hand-rolled ARIA control that has to be kept correct by hand forever. |
| **D-2** | Is `tasks-card.tsx`'s checklist icon style (lucide `Circle` / `CircleCheck`, `:679`) intentional, or should it converge on `Checkbox` like the select variant at `:514`? | **Keep both, documented** (was "no recommendation"; Step 1 investigated it) | Evidence that it is deliberate, not drift: it arrived WITH `mode: 'progress'` in `735791d3`, whose commit body names *"circular indicators"* as part of the mode's design (a Claude Home/Code screen it was cloned from); `2ff7e0dd` then layered strike-through, hover-reveal descriptions and the progress bar into a coherent todo-list language; and it is already described to consumers in **three** places — `src/elements/tasks.tsx:49`, the `mode` argType at `tasks-card.stories.tsx:131`, and `:255`. The UX distinction is real: `select` is a pick-list feeding a confirm button (square = selected), `progress` has no confirm and toggling IS the action (round = done). **Argument on the other side, for the owner:** the icon replaces the visible native control, which is why the row uses an `sr-only` input, which is the entire reason §1.2's focus bug existed. Converging on `Checkbox` would take that a11y hazard with it. Step 1 landed the comments at both sites (the one thing this row already called indefensible) and changed no implementation — writing them commits us to nothing either way. |
| **D-3** | Should `MultiSelectWidget` (`form-widgets.tsx:391`) keep `<select multiple>` or become a `CheckboxGroup`? | **UX ruling, not an engineering one** | `<select multiple>` is a poor control on every platform — no touch story, ctrl-click discovery, a fixed-height scroll box. But swapping it changes how a model-authored array field renders in every existing app. Flagging, not deciding. If it changes, it changes in Step 5 and nowhere else. |
| **D-4** | Do we want the `kai-checkbox` / `kai-radio-group` / `kai-slider` / `kai-select` facades in Step 7? | **Yes, and it is cheaper than it looks** | This ties directly to the general-UI positioning item already open: roughly a third of the elements are general-purpose atoms and the docs market only AI chat components. A standalone `kai-checkbox` is exactly the atom tier that story needs and does not currently exist. Purely additive, no migration. |
| **D-5** | Fold `response-compare.tsx:402`'s `<Button role="radio" aria-checked={false}>` into Step 3? | **Yes if D-1 is yes, otherwise leave it** | It is the fourth radio and it never announces a selected state. But it is a card-picker affordance, not a form control, and it is only cheap to fix while `RadioGroup` is already being built. |
| **D-6** | Step 0 option (a), (b) or (c)? | **(b)** — `@import` the shipped sheet | (a) fixes today and guarantees a repeat. (c) is a guard over a duplication that (b) deletes. Only (b) makes the class of bug impossible. |
| **D-7** | Should `ui/switch.tsx` grow pass-through props for `id`, `data-control` and the `aria-required` / `aria-invalid` / `aria-describedby` trio? | **Yes** | Found while landing §1.1. `Switch` owns everything the inline copy did EXCEPT those four form-only hooks, so `SwitchWidget` now stamps them onto the button through `buttonRef` + a `createEffect` (the same ref+effect shape `tasks-card.tsx` uses for `indeterminate`). That preserves every behaviour — verified live: `id`, `data-control` and the aria trio are all present on the rendered `<kai-form>` switch, and the effect REMOVES them when they go false — but it is imperative attribute-stamping around a component that should just take the props, and it is the only reason `form.focusField()` still works. **Prerequisite-adjacent to Steps 2–5:** `Checkbox`, `Radio`, `Slider` and `Select` will each need exactly the same four hooks to be usable from `form-widgets.tsx`. Decide the shape once, on `Switch`, before four more primitives copy the workaround. |

---

## 8. Could not verify

Stated plainly, because the audit behind this plan was read-only under an active-editing worktree.

- **No build, test or typecheck was run.** The port rule forbade it and other agents were editing
  the tree. Every "non-breaking" claim above is reasoning from source, not a green gate. Run the
  unit suite and `nx typecheck ui --skip-nx-cache` before trusting any of it.
- **`MultiSelectWidget` and `TagListWidget` were read, not rendered.** Their described behaviour is
  from source only.
- **D-2 is genuinely open** — nobody has been asked whether the checklist icon style is deliberate.
  It is written up as a defect candidate, not a defect.
- **`ui/settings.stories.tsx` and `ui/settings-group.stories.tsx` `<select>`s** were found by grep
  and read, not rendered. There may be more hand-styled controls in stories that grep missed.
- **The tree was dirty throughout.** `src/elements/styles.css`, `components/choice-card.tsx`,
  `components/form-widgets.tsx`, `.storybook/styles.css` and `ui/input.tsx` all had uncommitted
  changes. The in-flight `styles.css` diff was checked and does not touch the `.kai-radio` /
  `.kai-checkbox` / `.kai-range` blocks — it adds `:host { font-size }` and `::selection` — so every
  measurement in §0 holds for `8a4ba9e7` as well as for the working tree. Re-confirm before
  branching.
