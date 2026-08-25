# Plan: masked and formatted form fields (tiers 1 + 2, tier 3 gated)

Date: 2026-08-24. Spec of record: `docs/superpowers/specs/2026-08-24-form-field-formats-design.md`
(committed `9250721d`; §10 decided, owner-delegated to the supervisor seat).
Parent decisions: spec §1 (owner-ratified) and §10 (decided).
Branch: `main` is checked out for the plan file only; the build runs on `feat/field-masking` off
`main`.

**Goal:** a consumer can hand a field a semantic type and/or a token mask and get a correctly
formatted, correctly navigable, correctly announced input — in `Input` / `<kai-input>` and in the
model-driven form card — with normalization (`chg4821` → `CHG-4821`) and as-you-type formatting
carried by one clean-room, framework-agnostic primitive. Tier 3 (obscure) is specified and gated.

**Architecture:** a CODE plan, not an orchestration plan. Three layers, each a task boundary:
(1) a pure format engine — no DOM, fully unit-testable; (2) a DOM masker over a real
`HTMLInputElement` — the native-value architecture of spec §2/§3, with the §5 improvements;
(3) surfaces — the Solid `Input` (attached by `ref`), the `<kai-input>` facade, and the form card's
`x-kai-format` / `x-kai-mask`. Interfaces below are binding across tasks: a later task that needs a
different signature amends this file rather than diverging.

**Non-goals** are spec §9 verbatim (no `pattern` inference, no textarea/contenteditable, no
currency/locale numerics, no validation, no retention policy, no auto-advance OTP boxes).

## Global constraints (verbatim rules, binding on every dispatch)

- Run git from the repo root only. **Commits are the supervisor's** — no task commits.
- Writer-lock claims per dispatch (`scripts/writer-lock.mjs`); briefs generated via
  `scripts/brief.mjs`, never retyped.
- Never `nx test`; never trust nx caches. A real build is `npm run build` inside `packages/ui`;
  regeneration of derived artifacts is `npm run build:api` (never `gen-llms.mjs` standalone).
- A fresh worktree needs `pnpm install` → `build:css` → a real build before the unit suite means
  anything (CLAUDE.md). Sequential work stays on a plain branch in the main checkout.
- Unit runs are `pnpm --filter @kitn.ai/ui exec vitest run --project=unit`; the `emitted` project
  runs too when scaffolder output is touched.
- **Provenance grep (standing, every task):**
  `grep -rniFf "$FORBIDDEN_STRINGS" <changed paths>` must return nothing, where
  `FORBIDDEN_STRINGS=~/Archives/kitn-ui/field-mask-reference/forbidden-strings.txt` — the pattern
  file task 0 writes **outside the repo**, because the forbidden strings may not be spelled inside
  it either (not even in a grep command). Cite the reference only as "the owner's reference
  implementation (`tmp/`, untracked)" (spec §0).
- No implementer reads the reference to copy from it: work from the spec. Reading it to *confirm a
  described behavior* is allowed; pasting from it is not.
- Watch every new check FAIL before trusting it (planted defect or red-first ordering, stated per
  task). A check that cannot fail does not count as verification.
- Browser probes use `pressSequentially` plus a per-key focus / node-identity assertion — never
  `fill()`, which hid the D12 defect through a full green IVP (HANDOFF-2026-08-24 §5).
- The CI `test` job is the only merge gate.

## Tasks

### 0. Provenance archive (must complete before any code task starts)

- [ ] Copy `tmp/example/` to a stable path outside the repo: `~/Archives/kitn-ui/field-mask-reference/`
      (create it; `cp -a`, preserve mtimes).
- [ ] Verify the copy: file count and `shasum` of every file matches the source.
- [ ] Record it in `docs/provenance/field-mask-reference.md` — archive path, date, what it is in one
      sentence, the clean-room rule from spec §0, and the standing grep. **Path only, no brand
      string, no file listing that contains one.**
- [ ] Confirm `tmp/` is still ignored (`git check-ignore -v tmp`) and that nothing under `tmp/`
      is staged.
- [ ] Write `~/Archives/kitn-ui/field-mask-reference/forbidden-strings.txt` (outside the repo,
      one string per line: the reference's brand name and its component prefix, lowercase) — this
      is the pattern file every later task's provenance grep reads. It exists outside the repo
      precisely so the strings are never spelled inside it.
- Verify: `grep -rniFf ~/Archives/kitn-ui/field-mask-reference/forbidden-strings.txt docs/provenance/field-mask-reference.md`
  → 0 matches; the same grep over the whole repo → 0 matches (watch it FAIL first by planting a
  scratch file that contains one, then delete it); `git status --porcelain` shows only the new
  provenance file.

### 1. The pure format engine (`packages/ui/src/primitives/field-mask.ts`)

No DOM, no Solid. Mechanisms are spec §2 (tier 2) and §3; the deltas are spec §5.4 and §5.7.

Binding interface (re-exported unchanged by later tasks):

```ts
export type CaseMode = 'preserve' | 'upper' | 'lower';
export type RejectReason = 'full' | 'wrong-class' | 'over-capacity';

/** A compiled `format` + aligned display guide. Fill positions are `#` `@` `*`;
 *  every other index is a literal (spec §2). */
export interface MaskPattern {
  readonly format: string;
  readonly guide: string;          // same length as `format`
  readonly fillIndexes: readonly number[];
  readonly capacity: number;       // === fillIndexes.length
}

export class MaskError extends Error {}          // thrown by compileMask only
export function compileMask(format: string, guide?: string): MaskPattern;

/** Raw (fill-position-only) characters extracted from arbitrary input, with
 *  literal-prefix consumption and case folding. Spec §5.7, §2 "lenient". */
export function normalizeToRaw(p: MaskPattern, input: string, caseMode?: CaseMode): string;
export function formatRaw(p: MaskPattern, raw: string): string;
export function rawFromFormatted(p: MaskPattern, formatted: string): string;
export function formattedToRawIndex(p: MaskPattern, formatted: string, pos: number): number;
export function rawToFormattedIndex(p: MaskPattern, formatted: string, rawPos: number): number;
export function acceptsAt(p: MaskPattern, rawIndex: number, ch: string): boolean;
```

- [ ] `compileMask` caps `format` at 64 chars, rejects a `guide` of a different length, derives a
      spaces-for-fills guide when none is given, treats every unknown character as a literal.
- [ ] `normalizeToRaw` consumes a case-insensitively matching literal prefix **first**, then fills;
      folds per `caseMode` (default `preserve`); accepts `\p{L}`/`\p{N}` at `@`/`*` and `[0-9]` at
      `#` (spec §5.4 — ASCII classes are the defect being fixed).
- [ ] Position mapping counts filled fill-positions; raw index 0 maps to the first fill index.
- [ ] Tests (`packages/ui/tests/primitives/field-mask.test.ts`, jsdom `unit` project):
      - `@@@-####` + `caseMode:'upper'`: `chg4821`, `CHG4821`, `CHG-4821`, `chg 4821` all → raw
        `CHG4821`, formatted `CHG-4821`.
      - **§5.7 red-first:** `V-***` guide `V-   `, input `V-123` → formatted `V-123`. Land this
        test against a deliberately naive strip-then-fill normalizer, **watch it produce `V-V12`
        and fail**, record the red output in the task report, then implement literal-prefix
        consumption.
      - `#` rejects a letter; `@` accepts `é` and `Ω`; `*` behaves as `@` for input purposes.
      - Over-capacity: a 9-char raw into `###-##-####`… (11 fills) vs a 12-char raw into it →
        clipped at `capacity`.
      - Empty raw formats to `''` when a guide is present *for data purposes* and to the guide for
        display purposes — assert both call sites explicitly.
      - Round trip: `rawToFormattedIndex(formattedToRawIndex(x)) === x` for every caret position of
        a half-filled `###-##-####`.
- Verify: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/primitives/field-mask.test.ts`;
  provenance grep.

### 2. Semantic types (tier 1) (`packages/ui/src/primitives/field-semantics.ts`)

Spec §2 tier 1 table, with `postal` **dropped** per decided O-2.

```ts
export const FIELD_SEMANTIC_TYPES = ['tel', 'ssn', 'credit-card', 'custom'] as const;
export type FieldSemanticType = (typeof FIELD_SEMANTIC_TYPES)[number];

export interface FieldSemantics {
  readonly inputmode?: 'tel' | 'numeric';
  readonly autocomplete?: string;      // omitted for `ssn` — no standard token
  readonly spellcheck: false;
  readonly autocorrect: 'off';
  readonly autocapitalize: 'off';
  readonly defaultFormat?: string;     // resolved only when the consumer opts in
  readonly canonical: 'digits' | 'formatted' | 'as-typed';
}
export function fieldSemantics(type: FieldSemanticType): FieldSemantics;
export function canonicalize(p: MaskPattern, formatted: string, type: FieldSemanticType): string;
```

- [ ] The list is exported ONCE and read by the schema, the element facade and the tool projection
      (CLAUDE.md "derive it, don't type it"); no second copy of the four strings anywhere.
- [ ] `canonicalize` implements spec §4: digits for `tel`/`ssn`/`credit-card`; formatted with
      trailing placeholders trimmed for `custom`; `''` for an empty field, never the guide.
- [ ] Tests: each type's attribute bag; `canonicalize` for a full and a half-filled value of each
      type; the empty-field case; an unknown string is a TypeScript error and, at runtime, falls
      back to unmasked text with a `console.warn` (spec §7.3 "decide loudly").
- Verify: unit run + provenance grep.

### 3. The DOM masker (`packages/ui/src/primitives/input-mask.ts`)

Framework-agnostic over one `HTMLInputElement`; imports task 1 + task 2 only. Mechanisms: spec §2
(native-value architecture), §3 (what to re-derive), §5.1/5.2/5.3/5.5/5.6/5.9/5.10.

```ts
export type CopyPolicy = 'formatted' | 'canonical' | 'obscured' | 'blocked';

export interface InputMaskOptions {
  format: string;
  guide?: string;
  semantic?: FieldSemanticType;        // default 'custom'
  caseMode?: CaseMode;                 // default 'preserve'
  copyPolicy?: CopyPolicy;             // default 'canonical'
  obscure?: boolean;                   // tier 3, wired but inert until task 10
  initialValue?: string;
  onInput?: (detail: { canonical: string; formatted: string }) => void;
  onReject?: (detail: { reason: RejectReason; data: string }) => void;
}

export interface InputMask {
  setValue(value: string): void;       // accepts canonical OR formatted; normalized
  getRawValue(): string;
  getCanonicalValue(): string;
  getFormattedValue(): string;
  setObscure(on: boolean): void;
  update(next: Partial<InputMaskOptions>): void;   // re-compiles; preserves the value
  detach(): void;
}
export function createInputMask(el: HTMLInputElement, options: InputMaskOptions): InputMask;
```

- [ ] Single private `commit(nextFormatted, caret, { undo })` — the only writer of `.value`,
      selection, undo and the callback (spec §5.5). No other function touches `el.value`.
- [ ] `beforeinput` is the interception point when cancelable; the longest-common-prefix/suffix
      diff in `input` is the documented fallback (spec §5.1). Both paths converge on `commit`.
- [ ] Composition: no cancel, no value rewrite, no caret move between `compositionstart` and
      `compositionend`; reconcile once on `compositionend` (spec §5.2).
- [ ] Rejections call `onReject` with a reason and leave the text unchanged (spec §5.3).
- [ ] Undo/redo: entries of `{ formatted, selStart, selEnd }`, consecutive same-direction
      insertions coalesced, run broken by caret move / delete / paste / blur, stack capped at 200
      (spec §5.6). `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`.
- [ ] Paste, cut and copy honour `copyPolicy`; cut deletes the raw range through `commit`.
- [ ] One idempotent selection clamp on `selectionchange`, no timers (spec §5.9).
- [ ] **`.value` stays native** — no `Object.defineProperty` shadowing (spec §5.8). Canonical value
      is read through `getCanonicalValue()` only.
- [ ] `detach()` removes every listener; calling it twice is a no-op.
- [ ] Tests (`packages/ui/tests/primitives/input-mask.test.ts`, jsdom): attach/detach listener
      symmetry (assert via a spy on `addEventListener`/`removeEventListener` counts), the diff
      fallback path driven by synthetic `input` events, `onReject` firing with each reason,
      undo coalescing over a typed run, `update()` preserving the value across a format change,
      `setValue()` accepting both canonical and formatted input.
      **Stated jsdom limit:** caret rendering, `beforeinput` cancelation semantics and composition
      are NOT verifiable here — they are task 6. Do not write a jsdom test that pretends otherwise.
- Verify: unit run + provenance grep.

### 4. `Input` integration (`packages/ui/src/ui/input.tsx`)

Spec §7.2. The masker attaches in the `<input>`'s `ref` callback and detaches via `onCleanup`.

- [ ] New props on `InputProps`: `format`, `guide`, `semantic`, `caseMode`, `copyPolicy`
      (all scalars, so all survive as HTML attributes on the facade). Absent `format` **and**
      absent `semantic` = today's behavior byte for byte (spec §1.1).
- [ ] `semantic` alone applies tier-1 attributes only; a mask is applied only when `format` is
      given or `semantic` + an explicit opt-in resolves `defaultFormat`.
- [ ] Reactive `format`/`semantic` changes call `mask.update()`, never re-create the node.
- [ ] `onValueInput` / `onValueChange` emit the **canonical** value when a mask is active.
- [ ] **`tests/ui/input-node-identity.test.tsx` must stay green untouched**, and gains a masked
      case: type `CHG4821` one key at a time into a masked field whose `invalid` accessor reads the
      value — same node for every key, the mask's stored value survives, and the paired
      observable-re-render assertion (value reaches the DOM, class flips on a real invalid change)
      so the identity half cannot pass vacuously.
- [ ] Watch it fail: remove the `ref` attachment (or return a fresh node) and confirm the new case
      goes red; record the red output.
- Verify: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/ui/` + provenance grep.

### 5. `<kai-input>` facade (`packages/ui/src/elements/input.tsx`)

- [ ] Declare `format`, `guide`, `semantic`, `case-mode`, `copy-policy` as scalar props forwarded
      to `Input`. **No `valueType` prop** (decided O-5) — canonical-per-semantic-type is the whole
      contract.
- [ ] `el.value` reads the canonical value; `kai-input` / `kai-change` details carry
      `{ value: canonical, formattedValue }`. New event `kai-input-rejected` with
      `{ reason, data }` (spec §5.3).
- [ ] Form association / `ElementInternals.setFormValue()` is explicitly **out of scope** here
      (decided O-3) — record it in the element's doc comment as a known gap, do not stub it.
- [ ] Tests in `packages/ui/tests/elements/`: property-set and attribute-set paths both mask;
      `kai-input-rejected` fires on an over-capacity keystroke; the element registers.
- Verify: unit run + provenance grep. **Element API regen is task 8's**, not this task's.

### 6. Browser probes — caret, IME, paste (`packages/ui/tests/e2e/input-mask-ivp.spec.ts`)

What jsdom cannot check (spec §8.2–§8.4). Real Chromium over `npm run dev` (storybook-static cannot
register web components).

- [ ] Caret after every edit class: type into a literal boundary, backspace across a separator,
      mid-string paste, select-all replace, cut. Assert `selectionStart`/`selectionEnd` numerically,
      not "it looks right".
- [ ] **§5.7 in the browser:** paste `V-123` into a `V-***` field → `V-123`. Run it against the
      naive normalizer first (task 1 keeps the planted version available as a one-line revert) and
      record the `V-V12` red.
- [ ] Composition: a composed sequence survives intact and reconciles once on `compositionend`;
      an Android-style `key:'Unidentified'` / `keyCode 229` sequence goes through the diff fallback.
- [ ] `pressSequentially` + per-key focus and node-identity assertions on every typing probe
      (method floor).
- [ ] Every probe demonstrates it CAN fail (planted defect or the red-first ordering above), and
      the evidence — screenshots, console output, the red runs — is persisted **inside this task**
      to `docs/superpowers/research/2026-08-24-field-mask/` (HANDOFF §5: evidence that evaporates
      has to be rebuilt).
- Verify: `pnpm --filter @kitn.ai/ui exec playwright test tests/e2e/input-mask-ivp.spec.ts`.

### 7. Form-card schema + widget wiring

Spec §7.3. Enum is task 2's exported list — read, never retyped.

- [ ] `FormField` (`src/primitives/card-data-types.ts`) gains optional `x-kai-format`
      (`FieldSemanticType`), `x-kai-mask` (string), `x-kai-mask-guide` (string).
- [ ] `src/primitives/card-schemas/form.schema.json` declares all three, `x-kai-format` as an
      `enum` (cheap-model reliability, spec §7.3), `x-kai-mask` with `maxLength: 64`.
- [ ] `widgetFor()` is **unchanged** — `x-kai-format` selects formatting, not a widget; a field
      with `x-kai-format` still resolves to `text`. Pin that with a test so a later refactor cannot
      quietly turn it into a widget selector.
- [ ] `TextWidget` (`src/components/form-widgets.tsx`) forwards the three keys to `Input`. The
      format hint text reuses `FieldRow`'s existing `describedBy` channel — **no third
      aria-describedby channel** (spec §6).
- [ ] Submission carries the canonical value per spec §4, exactly one value per field.
- [ ] Hostile input: `x-kai-format: "<script>"` fails the enum → unmasked text + `console.warn`;
      a 500-char `x-kai-mask` is rejected by `compileMask` → unmasked text + warn. Test both.
- [ ] `npm run build:api` inside `packages/ui` afterwards (never a cached nx verdict), then
      **read the diff** of `element-meta.json`, `docs/web-components.md` and `llms-full.txt` before
      handing it back — an oversized diff is the tell that `gen-llms.mjs` ran standalone.
- Verify: unit run (`tests/primitives/form-schemas.test.ts`, `tests/schemas/`), `nx typecheck ui
  --skip-nx-cache` (or `npm run typecheck` inside `packages/ui`), provenance grep, and the
  regenerated-artifact diff pasted into the task report.

### 8. Docs + coupling map

- [ ] Docs page for the feature under `apps/docs` (voice per `apps/docs/STYLE.md`): the token
      vocabulary, the semantic types, normalization, the canonical-value rule, and the a11y
      requirements a consumer inherits.
- [ ] **Document the O-1 limitation where `x-kai-format` is documented:** `cardTools({ require })`
      cannot narrow inside a form card's fields, so app-side format pinning is unavailable — an app
      that needs a specific format authors the form definition itself (decided O-1).
- [ ] `docs/coupling-map.md`: the semantic-type list ⇄ `form.schema.json` enum ⇄ the tool
      projection ⇄ the docs table; the token vocabulary ⇄ the docs page; note which are enforced by
      a test and which are `NOTHING`.
- Verify: `pnpm --filter @kitn.ai/ui run lint:cdn-pins` and `lint:silent-drops` still green;
  provenance grep across the docs diff.

### 9. Acceptance (real, multi-turn, cheap model)

The verification floor since rung 4. Run against `examples/apps/ops-console` (its Change-ticket
field is the origin of the `CHG-####` case) in **real** mode: `.env.local` from that app's
`.env.example`, `OPENROUTER_API_KEY` supplied by the owner, the model left at the file's default.

- [ ] Build + pack the kit, install the tarball into the app (real build, `verify:fresh` first).
- [ ] Deterministic acceptance case: the ticket field carries `x-kai-format:"custom"`,
      `x-kai-mask:"@@@-####"`, `caseMode:"upper"`. Typing `chg4821` one key at a time shows
      `CHG-4821`; pasting `chg4821` shows `CHG-4821`; submitting yields `"CHG-4821"`.
- [ ] Multi-turn round trip on the cheap model: the model emits a form card carrying
      `x-kai-format`, it renders masked, the form is filled and submitted, and the model's **next**
      turn reads the value back correctly. Capture the request, the raw SSE bytes and the submitted
      payload.
- [ ] Captures persisted **inside this task** to
      `docs/superpowers/research/2026-08-24-field-mask/acceptance/`.
- [ ] Keyless mode still works (the app's scripted turn) — the mask must not depend on a key.
- Verify: the captures, plus `pressSequentially` per-key focus assertions in the typing probe.

### 10. Tier 3 — obscure / partial view — **OWNER-GATED**

**Do not start this task until tiers 1+2 have landed and the owner has nodded.** It carries the
a11y verification burden and its gate is manual screen-reader testing, not a test run.

- [ ] `obscure` on `Input` / `<kai-input>` / `x-kai-obscure`; `*` positions render `•`, `#`/`@`
      and literals stay revealed (spec §2 tier 3 — a partial view is expressed in the tokens, so
      there is no `showLast` prop).
- [ ] Default `copyPolicy` under obscure is `'obscured'` — copy what you see (decided O-4); a
      consumer prop may relax it.
- [ ] Reveal affordance: a real `<button>` in the tab order, `aria-pressed` carrying the state, an
      accessible name that does not change meaning under state; toggles display only, never the
      submitted value (spec §6).
- [ ] **Manual gate:** NVDA + Chrome and VoiceOver + Safari on an obscured credit-card field —
      what the value announces, what the toggle announces in both states, whether the format hint is
      read. Record the result in the PR. If bullets prove unusable, take spec §6's fallback (a
      visually-hidden textual summary as the description) — decided from the measurement, not
      before it.
- [ ] Tier 3 does not ship on a green test run alone.

## Verification

Local spot-checks; the required CI `test` job is the merge gate.

<!-- gate-list: partial -- local spot-checks; the required test job is the gate -->
```bash
cd packages/ui && npm run build && npm run typecheck
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec playwright test tests/e2e/input-mask-ivp.spec.ts
pnpm --filter @kitn.ai/ui run lint:silent-drops
pnpm --filter @kitn.ai/ui run lint:cdn-pins
grep -rniFf ~/Archives/kitn-ui/field-mask-reference/forbidden-strings.txt \
  packages/ui/src packages/ui/tests apps/docs docs examples   # must return nothing
```

Spec coverage: §0 → task 0 · §2 tier 1 → task 2 · §2 tier 2 → tasks 1, 3 · §2 tier 3 → task 10 ·
§4 → tasks 2, 5, 7 · §5.1–5.2 → tasks 3, 6 · §5.3 → tasks 3, 5 · §5.4, §5.7 → tasks 1, 6 ·
§5.5, §5.6, §5.9, §5.10 → task 3 · §5.8 → task 3 (no shadowing) + task 5 (gap recorded) ·
§6 → tasks 4, 7, 10 · §7.1 → tasks 1–3 · §7.2 → task 4 · §7.3 → tasks 5, 7 · §8 → tasks 1, 4, 6, 9 ·
§9 → not built, restated at the top · §10 → decisions applied in tasks 2, 5, 8, 10.

## Run ledger

(Appended during execution — task outcomes, red-first evidence, fix rounds, owner validation.)
