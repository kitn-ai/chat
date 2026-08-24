# Design: masked and formatted form fields

Status: **Draft for owner review — brainstormed 2026-08-24, not implemented. §10 decisions made (owner-delegated to supervisor seat, 2026-08-24).**

Scope: the standalone input primitives (`Input` / `<kai-input>` / `<kai-search>`) **and** the
model-driven form card (`<kai-form>`, `FormField`). Field family in scope, owner-named: phone,
SSN, inventory/ticket numbers (the `CHG-####` case that started this), and partial views such as
credit card.

---

## 0. Provenance — read this before writing any code

The owner has a production-proven reference implementation, **untracked**, at
`tmp/example/common/NativeInputMask.ts` (876 lines) and the textbox component beside it — hereafter
**"the owner's reference implementation (`tmp/`, untracked)"**.

**Hard rule, applies to this file and to every future repo file:** the reference's brand name and
its component prefix must NEVER appear in this repository — not in code, comments, tests, docs,
commit messages or fixtures. Cite it only by the phrase above. Everything derived here is
**clean-room**: this spec records *behavior contracts and the reasons for them*, not copied code.
The implementer works from this document, not from the reference file; where a mechanism is
described (undo entry shape, cut/copy policy, caret clamping) it is described as a requirement to
re-derive, in the same way `docs/provenance/aurora-clean-room.md` handles the shader work.

`tmp/` is in `.gitignore` (`.gitignore:3`), so the reference is one `rm -rf tmp` away from being
gone. **Before implementation starts, a copy must be archived outside this repo** (owner's own
storage), and the archive location recorded in `docs/provenance/` — path only, no brand string.

The token vocabulary (`#`, `@`, `*`, literals-by-position) is **adopted deliberately**: it is the
one part of the reference that is a public contract rather than an implementation, the owner's
existing consumers already speak it, and the alternative (inventing a fifth mask dialect) buys
nothing.

---

## 1. Owner-ratified decisions

Binding, from the design discussion. Later sections refine these; none may contradict them.

1. **Absent mask = no masking.** Explicit over inference. A field with no mask behaves exactly as
   it does today, byte for byte.
2. **General `pattern` → mask inference is rejected.** A JSON-Schema `pattern` will never be
   compiled into a mask. (A regex describes what is *acceptable*; a mask describes what is
   *displayed*. Deriving one from the other guesses at literal placement and gets it wrong on
   exactly the alternation-heavy patterns people write.)
3. **Field family:** phone, SSN, inventory/ticket numbers, partial views (credit card).
4. **Keyboard navigation and Section 508 are first-class requirements**, not a follow-up.
5. **Improvements over the reference are welcome** — owner: production-proven, "doesn't mean there
   aren't improvements." §5 names them concretely.

---

## 2. Three tiers, staged

Each tier ships and is verified independently. Tier 1 is worth shipping alone.

### Tier 1 — input semantics (nearly free)

A semantic type on the field derives the attributes a browser and an AT already know how to use:
`inputmode`, `autocomplete`, `spellcheck="false"`, `autocorrect="off"`, `autocapitalize="off"`.

| semantic type | `inputmode` | `autocomplete` | default mask (tier 2) | canonical value |
|---|---|---|---|---|
| `tel`         | `tel`     | `tel`         | locale-free `###-###-####` only when a mask is given | digits |
| `ssn`         | `numeric` | *(none — no standard token; emits `off`)* | `###-##-####` | digits |
| `postal`      | `numeric` | `postal-code` | none by default | as typed |
| `credit-card` | `numeric` | `cc-number`   | `#### #### #### ####` | digits |
| `custom`      | inherited | inherited      | from `mask` | formatted (§4) |

Tier 1 alone satisfies WCAG 1.3.5 (Identify Input Purpose), which is a 508 line item and which the
kit currently satisfies nowhere: `grep -rn "inputmode\|autocomplete" packages/ui/src` finds the
props forwarded on `<kai-input>` and nothing that ever sets them.

**No default mask is applied by a semantic type unless the consumer opts in** (decision 1). The
"default mask" column is what `mask="default"`/the form card's `x-kai-format` resolves to, not what
a bare `type="tel"` does.

### Tier 2 — format masks

Two strings, both optional, both from the reference's contract:

- **`format`** — the pattern. `#` = one digit. `@` = one alphanumeric. `*` = one alphanumeric,
  *obscurable*. Every other character is a **literal, identified by position, not by character
  class**. This is the load-bearing part of the design: it is why `V-***` works, where a
  character-class strip would read the literal `V` as user input.
- **`mask`** — the placeholder guide shown for unfilled positions, aligned position-for-position
  with `format` (`'   -  -    '`, `'mm/dd/yyyy'`, `'V-   '`). Optional; without it the field shows
  only up to the last typed character.

Behavior contracts:

- **Formatted text IS `input.value`.** No overlay, no ghost layer. Native caret, native selection,
  native find-in-page, native mobile behavior. This is the reference's central architectural
  choice and it is correct — every overlay implementation of this feature reinvents caret
  positioning badly.
- **Lenient normalization.** A pasted or prefilled `chg4821`, `CHG 4821`, `CHG-4821` all become
  `CHG-4821` under `@@@-####`: separators are discarded, literals re-inserted at their positions,
  case folded per an explicit `case: 'upper' | 'lower' | 'preserve'` option (default `preserve`).
  Case folding is **not** in the reference and is required by the ticket-number case.
- **As-you-type.** Every edit is reconciled through the mask and committed as one operation:
  value, caret, undo entry, change notification. Typing, delete, backspace, cut, paste and
  autofill all funnel through that single commit path (§5.5).
- **Caret and navigation.** The caret never rests inside a literal run: arrow keys, focus and
  pointer placement land it on the nearest fill position. It is never *trapped*: Tab, Shift-Tab,
  Home, End and browser find behave natively (§6).
- **Capacity is the number of fill positions.** `maxlength` is ignored when a format is present —
  one limit, applied identically to typing and paste.

### Tier 3 — partial / obscured display

`obscure` replaces the user-typed characters at `*` positions with `•` (U+2022). `#` and `@`
positions stay revealed, as do literals and placeholders.

**The consequence worth naming: a partial view is expressed in the mask, not in a `showLast`
prop.** `**** **** **** ####` with `obscure` on is "show the last four" — the reveal policy is
positional and arbitrary (leading digits, middle group, both) with no new API. That falls out of
the reference's token design and is the strongest argument for adopting it.

**Kit / app boundary** (CLAUDE.md, "the kit decides HOW; the app decides WHETHER"):

- **Kit:** how the partial view renders, how it announces, how the reveal toggle behaves, what the
  caret does over obscured positions, what an obscured copy puts on the clipboard *as a stated
  policy the consumer selects*.
- **App:** whether the value may be retained, transmitted, logged, autofilled, or copied at all;
  PCI/PII scope; masking-at-rest. None of that is a component decision — it lands in a policy
  document. The kit surfaces the facts (`obscure` state, the canonical value, a copy-policy prop)
  and the consumer decides.

The kit ships **no** Luhn check, no SSN-area validation, no phone-number library. Those decide
whether a value is acceptable.

---

## 3. Mechanism — what the reference actually does

Recorded so the implementer re-derives behavior rather than guessing, and so §5's deltas are
anchored in fact. Read from `tmp/example/common/NativeInputMask.ts` on 2026-08-24.

- **Two value representations, one stored.** An authoritative *formatted* string is held in the
  masker (not read back from the DOM, because the host framework's re-render overwrites
  `input.value`). Raw is derived on demand by walking pattern positions. Position-based
  extraction is what makes alphanumeric literals safe.
- **Position mapping.** `formatted↔raw` cursor mapping counts *filled fill-positions* before a
  point. Raw position 0 maps to the first fill index, so the caret never lands in a leading
  literal prefix.
- **Non-obscured input is reconciled by DIFF, not by caret.** On `input`, the browser-mutated
  display is compared against the stored formatted string via longest-common-prefix/suffix; the
  inserted span is the difference. Caret-independent and robust against alphanumeric literals.
  **This is the best idea in the file** and it survives into the kit unchanged.
- **Obscured input is handled by `keydown` + `preventDefault`**, because the browser would
  otherwise write bullets into `.value` and corrupt the raw extraction. Autofill and IME bypass
  `keydown`, so the `input` handler has a second path that detects "display ≠ expected display"
  and absorbs it. §5.1–5.2 replace this pair.
- **Custom undo/redo.** The native stack is destroyed by programmatic `value` assignment, so the
  masker keeps its own: an array of `{ value, selStart, selEnd }`, one entry **per character**,
  seeded with the initial state, redo cleared on every new edit, and the top entry's selection
  re-snapshotted before each change so undo restores the caret the user had. `Ctrl+Z` /
  `Ctrl+Y` / `Ctrl+Shift+Z` are intercepted in `keydown`.
- **Cut / copy are intercepted.** Both put *raw* text on the clipboard when `valueType: 'raw'`
  (extracted by position, so literals are never copied), and put the *obscured* text on the
  clipboard when obscure is active. Cut then deletes the selected raw range.
- **Selection clamping.** A `select` handler prevents a selection extending past the last typed
  character and pulls a collapsed caret out of the leading literal region; `mousedown` re-runs it
  on the next animation frame and `mouseup` on a `setTimeout`.
- **Rejection is silent.** A keystroke with no valid unfilled position is `preventDefault`ed with
  no signal to anyone.
- **`.value` is shadowed** by the host component (`Object.defineProperty` over the instance, with
  a `formdata` event listener as a safety net) so `FormData` and `form.elements` read the raw
  value while the visible text stays formatted. The masker keeps the pristine prototype descriptor
  so it can bypass that override when writing the display.

---

## 4. `valueType` — what the form card submits

The reference makes `raw | formatted` a per-field consumer prop. Ported naively to the model-driven
surface, that becomes "what does the card submit back to the model", **and a model must not be the
one choosing it** — the same field would round-trip differently depending on which token the model
guessed.

**Decision: the submitted value is the field's canonical form, and canonical form is a property of
the semantic type, declared by the kit.**

- `ssn`, `credit-card`, `tel` → **digits only**. The separators in `###-##-####` are presentation;
  no backend wants them and every backend re-derives them.
- `custom` (an explicit `mask`) → **formatted, trailing placeholders trimmed**. The literals are
  part of the datum: `CHG-4821` is the ticket id; `4821` is not. An empty field submits `''`, never
  the bare mask template.
- `postal` → as typed.

Exactly **one** value per field goes into the submission — the form card's payload is validated
against the same JSON Schema it was rendered from, and a field carrying two shapes cannot be. The
non-canonical form stays reachable on the element (a `formattedValue` getter / the `kai-input`
event detail) for consumers who need both.

A consumer who disagrees overrides per field on the *element* surface (`value-type="formatted"` on
`<kai-input>`); that prop exists and is not model-settable.

---

## 5. Improvements over the reference

Concrete deltas, each with the defect or limitation it addresses.

**5.1 `beforeinput` becomes the interception point.** The reference intercepts printable characters
in `keydown` (obscure mode) and reconciles the rest in `input`. `keydown` does not describe the
edit: it has no `inputType`, it reports `Unidentified`/`229` for IME and for several Android soft
keyboards, and it never fires for dictation, drag-and-drop text, or an autofill selection.
`beforeinput` carries `inputType` + `data`, is cancelable for `insertText`, `deleteContent*` and
`insertFromPaste`, and covers every one of those paths. Contract: intercept in `beforeinput` where
the event is cancelable; **fall back to the reference's diff-reconcile in `input` where it is not**
(Android composition, some IMEs). The diff path already exists and is already correct — this makes
it the documented fallback instead of an accident.

**5.2 Composition handling is REQUIRED, and the reference has none.** `preventDefault` on a keydown
during an active IME composition breaks the composition outright. Contract: track
`compositionstart`/`compositionupdate`/`compositionend`; while a composition is active the masker
**never** cancels, never rewrites `.value`, never moves the caret. Reconciliation happens once, on
`compositionend`. This is also the correct handling for Android/Chrome word suggestions, which is
the far more common case than CJK input in the target field family.

**5.3 Rejection decides loudly.** "No room for this character" is currently a silent
`preventDefault` — a silent drop, which this repo treats as the default-wrong choice. Contract: a
rejected edit emits a reason (`full` · `wrong-class` · `over-capacity`) on the primitive's callback
and, on the element, a `kai-input-rejected` event; the form card wires it to a polite live region
so an AT user learns why their keystroke did nothing. The visible text must not change.

**5.4 Unicode, not ASCII.** `@` and `*` accept `[a-zA-Z0-9]` in the reference — `é`, `ü` and every
non-Latin script are rejected silently in an "any alphanumeric" position. The reference's own host
component is already inconsistent about this: its `beforeinput` guard tests `/[\p{L}0-9]/u` while
the masker tests ASCII. Contract: `@`/`*` accept `\p{L}` + `\p{N}`; `#` stays `[0-9]`. Names and
non-US postal codes are in scope for this kit.

**5.5 One commit path.** The reference repeats "write stored value → write display → set selection
→ push undo → clear redo → notify" in five places (paste, delete-range, obscured insert, restore,
the input handler). They have already drifted: the obscured-insert path returns early when the
formatted value is unchanged, the paste path does not. Contract: a single private `commit(next,
caret, {undo})` and no other writer.

**5.6 Undo coalescing and a bound.** One entry per character means `Ctrl+Z` walks back one
character at a time, which is not what any native input does (browsers coalesce a typing run) and
which grows without limit on a long-lived field. Contract: coalesce consecutive same-direction
insertions into one entry, break the run on caret movement / delete / paste / blur, cap the stack
(200 entries) and drop from the bottom.

**5.7 A literal-aware normalizer — this fixes a real defect.** `applyMask` strips non-alphanumerics
and then fills positions in order. With format `V-***` and mask `V-   `, pasting `V-123` strips to
`V123`, and the leading `V` — a *literal* — is consumed by the first fill position: the field
renders **`V-V12`** and silently discards the `3`. Read from `applyMask` on 2026-08-24; **confirm
it with a failing test in a real browser before fixing it** (repo discipline: watch the red).
Contract: normalization first consumes any input prefix that matches the pattern's literal run
(case-insensitively), then fills. The same rule is what makes `CHG-4821` → `CHG-4821` rather than
`CHG-CHG4`.

**5.8 Don't shadow `input.value`; use `ElementInternals`.** The reference redefines `.value` on the
input instance and adds a `formdata` listener because it had no other way to make `FormData` see
the raw value. Shadowing a native accessor breaks every consumer expectation that reads it
(testing libraries included) and needs the pristine-descriptor escape hatch that threads through
the whole file. Form-associated custom elements have `setFormValue()`, which is the supported
mechanism and does not lie about `.value`. Contract: `.value` stays native (formatted); the
canonical value is exposed by `getRawValue()` and, on the element facade, by `setFormValue()`.
**Making `<kai-input>` form-associated is not currently done and is a named prerequisite for tier
2's element surface** — flag, don't smuggle.

**5.9 One selection clamp, on `selectionchange`.** The `mousedown`+rAF / `mouseup`+`setTimeout`
pair races itself and misses keyboard-driven selection entirely. `selectionchange` fires on
`<input>` in every browser the kit targets. Contract: one handler, idempotent, no timers.

**5.10 Copy policy becomes a prop, not a consequence of `obscure`.** Copying bullets is not a
security control (the value is in the page), it is a usability decision — and whether a card number
may be copied at all is squarely an app-layer policy call. Contract: `copyPolicy: 'formatted' |
'canonical' | 'obscured' | 'blocked'`, defaulting to `'canonical'` (`'obscured'` when `obscure` is
set, preserving today's behavior for the reference's consumers).

---

## 6. Accessibility contract (Section 508 / WCAG 2.2 AA)

Non-negotiable; each line is a test in §8.

- **Format hint.** The expected format is stated in text and linked with `aria-describedby`. Both
  hosts already render hint text with an id: `Input`'s `part="hint"` (`src/ui/input.tsx`, `hintId`)
  and `kai-form`'s `FieldRow` description (`describedBy` in `WidgetProps`). The mask reuses those —
  it must not mint a third describedby channel. A visual mask guide (`mm/dd/yyyy`) is **not** an
  accessible name or description; the text hint is required even when a guide is shown. (SC 3.3.2)
- **Errors.** `aria-invalid` on the control plus the error text in the same `aria-describedby`
  chain — the existing `ariaProps()` behavior, unchanged by masking. (SC 3.3.1)
- **Never fight the AT or the IME.** Composition handling per §5.2 is a *requirement*, not an
  optimization. Voice dictation, on-screen keyboards, switch access and braille input all arrive
  through paths that `keydown` interception breaks.
- **The obscured value announces something sane.** A bullet-filled `.value` is not a password
  field: `type="password"` hides *everything*, so a partial view cannot use it, and screen readers
  will read the literal `•` characters (typically "bullet bullet bullet" or nothing at all). This
  is the highest-risk item in the design. Requirement: the description states the format *and*
  that characters are hidden ("Card number, last four digits shown"), the revealed digits carry
  the meaning, and **the announcement is verified in NVDA + Chrome and VoiceOver + Safari before
  tier 3 ships**. If verification says bullets are unusable, the fallback is a visually-hidden
  textual summary as the description — decided after measurement, not before.
- **The reveal affordance is keyboard-reachable and stateful.** A real `<button>` in the tab order,
  accessible name that does not change meaning under state (`aria-pressed` carries the state), and
  it toggles display only — never the submitted value. (SC 4.1.2)
- **Masks never trap or reorder navigation.** Tab / Shift-Tab / Home / End / Ctrl-A / find-in-page
  behave natively. Caret clamping is confined to *within-field* caret placement. No auto-advance to
  a next field, no multi-box split inputs.
- **Autofill still works.** Tier 1's `autocomplete` tokens are pointless if the mask discards what
  the browser fills. The autofill path (§5.1) is normalized through the mask, not rejected.

---

## 7. Surfaces

### 7.1 The primitive

`packages/ui/src/primitives/input-mask.ts` — framework-agnostic, operating on an `HTMLInputElement`,
zero Solid imports. Precedent in the tree: `src/components/composer-dom.ts`,
`src/primitives/card-routing.ts`. Shape: `createInputMask(el, options) → { setValue, getRawValue,
getFormattedValue, setObscure, detach }` plus an `onInput`/`onReject` callback pair. A factory
returning a closure rather than a class, matching the surrounding `create*` convention.

### 7.2 The Solid `Input` widget

`packages/ui/src/ui/input.tsx` attaches it **in the `<input>`'s `ref` callback**, tearing down via
`onCleanup`.

This is only safe because of the just-fixed node-identity work in that file. `Input` caches
`plainNode`/`rowNode` and builds its class through an *accessor* precisely so the `<input>` DOM node
survives reactive updates; before that fix a re-render built a **new** node, which would silently
carry the mask's listeners, stored value and undo stack into the void — masking would appear to
"randomly stop working" after a state change. The pin is
`packages/ui/tests/ui/input-node-identity.test.tsx` (K-D12a), and its comment already explains why
its identity assertions are paired with observable-re-render assertions. **Tier 2 adds a case to
that file: the masker survives an invalid-state flip and a leading/trailing affix toggle** — the
affix toggle switches which cached node is mounted, which is the one legitimate identity change and
therefore the one place re-attachment must be explicit.

Props added to `Input` / `<kai-input>`: `format`, `mask`, `obscure`, `caseMode`, `copyPolicy`,
`valueType`. All scalars, so all work as HTML attributes (the `kai-` contract).

### 7.3 The model-driven form card

`FormField` (`src/primitives/card-data-types.ts`) grows two optional keys, and `form.schema.json`
grows their declarations:

- **`x-kai-format`** — enum: `tel` · `ssn` · `postal` · `credit-card` · `custom`.
- **`x-kai-mask`** — the token string; meaningful only with `x-kai-format: "custom"`, ignored
  otherwise. The display guide is derived from the tokens (fill positions → spaces) unless an
  explicit `x-kai-mask-guide` is given.

**Why `x-kai-format` and not `format`.** The owner's shape said "the field schema grows an optional
semantic `format`". `format` is a JSON Schema keyword with a registered vocabulary and its own
assertion semantics; `ssn` and `credit-card` are not in it, `widgetFor()` already switches on
`field.format` for `email`/`uri`/`date`, and `toJsonSchema()` maps `format` to a validation pattern.
Overloading it would make an unknown format both a widget selector and a validation input. The kit's
UI hints already live in the `x-kai-*` namespace (`x-kai-widget`, `x-kai-placeholder`,
`x-kai-step`) and that is exactly what this is. Same enum, same values — different key.

**Cheap-model reliability.** Rung 5's finding is that per-intent *enums* are emitted reliably and
free-form strings are not. `x-kai-format` is enum-constrained on the projected tool schema, so a
small model picks a token rather than inventing a mask; `x-kai-mask` is free-form and therefore the
escape hatch of last resort, expected to be rare and expected to be wrong sometimes.

**No new untrusted-output sink.** The mask string is display-only: it produces text and caret
positions, never HTML, never a URL, never an attribute on a navigable element. Hardening is
therefore about denial-of-service and confusion, not injection: cap the pattern at 64 characters,
treat unknown characters as literals (never as tokens), reject a guide whose length differs from the
pattern's, and render literals as text. A hostile `x-kai-format` fails the enum and the field falls
back to an unmasked text input — loudly, with a console warning, per "decide loudly".

**App-side pinning — and a gap.** `cardTools({ require })` (F-23) narrows the projected tool schema
by dot-path so an app can force the model to fill a field. It **cannot reach into a form card's
fields**: the form card's payload is itself a JSON Schema, and `form.schema.json` declares
`properties` as a bare `{ "type": "object" }` — there is no node at `properties.ticketId` for a
`require` rule to land on, and the merge-loudly path would raise a `TypeError` naming a path it
cannot find. So "the app pins `x-kai-format: 'custom'` on the ticket field" does **not** work today.
Open question O-1.

---

## 8. Verification plan

Repo discipline: every check is watched failing first; a check that cannot fail is worse than none.

1. **Watched-red node identity.** Extend `tests/ui/input-node-identity.test.tsx`: type into a masked
   field, flip `invalid`, assert the same node *and* that the masker's stored value survived — with
   the paired observable-re-render assertion so it cannot pass vacuously. Break the ref attachment
   and watch it go red.
2. **jsdom (`--project=unit`)** covers the pure parts and only those: normalization
   (`chg4821` → `CHG-4821`), the `V-***` literal-prefix case (§5.7 — red before the fix),
   position mapping, capacity, undo coalescing, canonical-value derivation per semantic type,
   rejection reasons. **jsdom cannot verify caret rendering, `beforeinput` cancelation semantics, or
   composition** — do not write a test there that pretends otherwise.
3. **Real Chromium** (Playwright over `npm run dev`, per the repo's IVP practice — `storybook-static`
   cannot register web components): caret position after every edit class (type into a literal
   boundary, backspace across a separator, mid-string paste, select-all replace, cut), the
   `beforeinput` fallback, and drag-and-drop text.
4. **IME / composition** in Chromium: a composed sequence must survive intact and reconcile once on
   `compositionend`; an Android-style `key: 'Unidentified'` sequence must go through the diff path.
5. **Screen readers, manual, tier 3 gate:** NVDA + Chrome and VoiceOver + Safari on an obscured
   credit-card field — what the value announces, what the reveal toggle announces in both states,
   whether the format hint is read. Result recorded in the PR; §6's fallback is chosen from it.
6. **Acceptance example (the case that started this):** a form card whose `ticketId` field carries
   `x-kai-format: "custom"`, `x-kai-mask: "@@@-####"`, `caseMode: "upper"`. Pasting `chg4821` shows
   `CHG-4821`; typing `CHG4821` shows `CHG-4821`; submitting yields `"CHG-4821"` (formatted, §4).
7. **Form-card end-to-end, multi-turn, on a cheap model** (the ladder's verification floor since
   rung 4): the model emits a form card with `x-kai-format`, it renders masked, the user fills it,
   the submission carries the canonical value, and the model's next turn reads it back correctly.
8. **Coupling map.** Add the rows this creates: `x-kai-format` enum ⇄ the semantic-type table in the
   primitive ⇄ the tool-schema projection; token vocabulary ⇄ the docs page. Derive the enum in one
   place and read it in the others — do not type the list twice (`docs/coupling-map.md` §4).

---

## 9. Explicitly not doing

- **`pattern` → mask inference** (owner decision 1/2).
- **Masking `<textarea>` or contenteditable.** Single-line `<input>` only; the composer's
  contenteditable path is a different machine with its own selection model.
- **Currency and locale-aware numeric formatting** — thousands separators, decimal marks, negative
  forms, currency symbols, `Intl.NumberFormat`. A genuinely separate family: its literals move as
  you type, which the position-aligned model does not express. Named here so it is not smuggled in
  as "just another mask".
- **Any storage, retention, transmission or PCI policy.** App layer (§2, tier 3).
- **Validation** — Luhn, phone-number parsing, SSN area rules. Whether a value is acceptable is the
  consumer's call; the kit formats.
- **Auto-advance across multiple boxes** (the one-box-per-digit OTP pattern). Different component,
  different a11y problem.

---

## 10. Open questions for the owner

- **O-1.** `cardTools({ require })` cannot narrow inside a form card's fields (§7.3). Options:
  (a) accept it — apps pin by supplying the form definition themselves rather than letting the
  model author it; (b) extend `require` with a form-aware path syntax; (c) leave it and document
  the limitation. Recommendation: **(a) for now, (c) documented** — a form whose fields matter that
  much is usually one the app should be authoring.
  
  **Decided (2026-08-24, owner-delegated to the supervisor seat):** Accepted and documented — `cardTools({ require })` is not extended to reach form-card fields; app-side format pinning is documented as unavailable, and the limitation is stated where `x-kai-format` is documented.
- **O-2.** Is `postal` worth an enum slot? It has an `autocomplete` token and no stable mask (US-5,
  US-9, UK, CA all differ), so it is a tier-1-only member. Keeping it is honest; dropping it keeps
  the enum to four.
  
  **Decided (2026-08-24, owner-delegated to the supervisor seat):** `postal` is dropped from the v1 enum (no stable cross-locale mask); the enum ships as tel / ssn / credit-card / custom. Enum growth is backward-compatible, so postal can join later with evidence.
- **O-3.** Should tier 2 wait on making `<kai-input>` form-associated (§5.8), or ship the Solid
  primitive + form card first and add element form participation after? Recommendation: **ship
  first, form-associate after** — the form card does not submit through `FormData`.
  
  **Decided (2026-08-24, owner-delegated to the supervisor seat):** Tier 2 ships before any form-association migration of kai-input; ElementInternals.setFormValue lands with or after that migration, not as a tier-2 blocker.
- **O-4.** Default `copyPolicy` when `obscure` is on: bullets (reference-compatible) or blocked?
  Recommendation: **bullets**, because blocking silently is the worse failure and blocking loudly
  needs an announcement channel copy does not have.
  
  **Decided (2026-08-24, owner-delegated to the supervisor seat):** Default copy policy under obscure: copy-what-you-see (bullets). Revealing raw values via clipboard silently would contradict the display's own promise; a consumer prop may relax it.
- **O-5.** Does the owner want the reference's `valueType` prop surfaced on `<kai-input>` at all
  (§4), or is the canonical-per-semantic-type rule the whole contract?
  
  **Decided (2026-08-24, owner-delegated to the supervisor seat):** `valueType` is NOT surfaced on kai-input; canonical-form-per-semantic-type is the whole contract. The reference needed the prop because it had no semantic types.
