# Handoff: bring `main` (#323) into `feat/construct-engine`

Paste the section below to the construct-engine agent. It is written to be actionable without this conversation.

---

## What you are merging

`main` is now at **`f8155931`** — PR #323, squash-merged 2026-08-26. It is one round of component work: the type scale, five new form-control primitives, a batch of contrast/a11y fixes, and a shipped type-generator bug. Nine commits' worth of change, 127 files, all gates green (353 test files / 4822 tests, typecheck clean, all four Storybook shards, spike-conformance, scenario-assertion-control).

Your branch is 56 commits / 72 files ahead of the merge base. **Merge `main` in, do not rebase** — your branch has a long reviewed history and an SDD ledger that references commit hashes.

## The overlap surface: exactly nine files

These are the only files both branches touched. Everything else merges clean.

**Generated. Do not resolve by hand, do not pick a side. Take either side, then regenerate.**

- `packages/ui/src/elements/element-meta.json`
- `packages/ui/src/elements/element-types.d.ts`
- `packages/ui/frameworks/react/index.tsx`
- `packages/ui/llms-full.txt`
- `packages/ui/src/agent-tooling/catalog/derived.json`
- `docs/web-components.md`

Resolution: `npm run build:api` inside `packages/ui`. **Never run `gen-llms.mjs` standalone** — it silently rewrites `llms-full.txt` with less data, collapsing every slot's inject/replace to a dash, and the oversized diff is the only tell. After regenerating, sanity-check that no slot row collapsed.

**Hand-written. Read both sides.**

- `packages/ui/src/components/message.tsx` — you changed the user-text token (`text-primary` → `text-foreground`, commit `d1f30f21`) as part of your brand-token-on-content sweep. #323 only purged internal spec references from its JSDoc. Should be a clean textual merge; verify your token change survived.
- `packages/ui/src/components/chat-thread.tsx` — you added the `reasoning` prop (Task 10b). #323 only touched JSDoc. Same story.
- `docs/coupling-map.md` — both appended entries. Keep both.

## Behaviour changes you inherit, ranked by how much they touch construct emit

**1. Your emitted form cards will render differently, and this is the big one.**

Task 11 made construct cards render as schema-driven forms through the kit's form component. #323 rebuilt the form widget layer underneath you:

- `RadioGroupWidget`, `CheckboxGroupWidget`, `SwitchWidget`, `SelectWidget`, `NumberWidget` and the taglist now delegate to new `src/ui/` primitives instead of hand-rolling controls.
- **`MultiSelectWidget` is no longer a `<select multiple>`.** It is a scrolling checkbox group. Nothing is truncated. Numeric enum values now stay numbers where the old `<select>` stringified them, so if any construct fixture asserted string values from a multiselect, it will now see numbers.
- **Group labels are now visible.** `radio`, `checkbox-group`, `multiselect` and `taglist` previously set only `aria-label`, so their labels were announced to screen readers and invisible on screen. They now render a visible label. Your `refund_approval` example and any card with those field kinds gains visible heading text it did not have before. If a construct snapshot or screenshot test pins the old layout, it will move.
- The `x-kai-format` masking hints you rely on are unaffected.

**2. The type scale changed shape, though defaults did not move.**

`theme.css` now points Tailwind's own `text-xs` / `text-sm` / `text-base` at the kit's `--kai-text-*` tokens, so `text-sm` and `text-body` are literally the same utility. Seven rungs: micro 10 · caption 11 · meta 12 · compact 13 · body 14 · title 16 · lg 18. Values are byte-identical to before, so nothing moves visually until someone sets a token.

**What does move: `:host` now sets `font-size: var(--text-body)` (14px).** Previously every shadow root inherited the document's 16px for any text without an explicit size class. Two consequences for you:

- Light-DOM content slotted into any `kai-*` element now inherits 14px instead of the page's 16px. If a construct's emitted host page relies on inherited sizing, check it.
- `proseSize` now resolves through the tokens, so `--kai-text-body` finally moves message reading text. Your theming note should say so.

**3. Contrast and colour tokens moved, and this interacts with your brand sweep.**

You did a content-vs-control classification (7 content sites → neutral, 4 controls kept). #323 changed control colours underneath that:

- `--color-input` went from 1.27:1 to 3.85:1 light / 4.35:1 dark, because it was doubling as both a control boundary and a decorative border. Seven decorative sites moved to `border-border`. **`border-input` now means "interactive control edge" only** — worth knowing if your emit or theming touches it.
- The switch track gained a border, so it clears 3:1 in both themes. It was failing in both, not just light.
- Checkboxes gained an `:indeterminate` paint. They previously rendered identically to unchecked, so any partial-selection state was a lie.
- New tokens: `--kai-color-highlight` (a `<mark>` yellow, replacing a grey that came from tinting the neutral `--color-primary`) and `--kai-color-selection` / `--kai-color-selection-foreground` (a kit-owned `::selection`, scoped to shadow roots only — the light-DOM layer deliberately keeps the browser default, since styling it would restyle a consumer's whole page).

All are `--kai-*`, so a construct's theme block can override them. The Theme Studio at `/theme/editor` now exposes the type scale as sliders.

**4. Five new elements, so the kit is 89 not 84.**

`kai-checkbox`, `kai-radio-group`, `kai-checkbox-group`, `kai-slider`, `kai-select`, each with a `src/ui/` primitive behind it. All build on real native inputs behind `appearance: none`. If your construct vocabulary or the MCP catalog enumerates elements, it needs the new count and names. `derived.json` picks them up from the regen.

**5. Smaller, but visible if you screenshot.**

- Scroll button: opaque (was 50% alpha), rounded square (was a circle), gained elevation, uses `ArrowDown` at 16px, and takes `label` / `showLabel`. `ChatThread` renders it, so your emitted surface shows this.
- ChoiceCard rows are real radios inside labels now, not `div[role="radio"]`. A choice reaches `FormData`. **This broke the S08 conformance scenario**, which was reading the label from inside the radio node; the harness was fixed to assert behaviour instead. If any construct test selects on ChoiceCard internals, check it.
- Card headings and descriptions moved onto the scale; the card shell was using two one-off sizes (17px / 13px) that existed nowhere else.
- Empty-state titles were 18px, larger than the kit's largest rung. Now 16px.
- Composer: focus ring moved to the outer rounded frame (it was drawing a square outline on the inner editable), font size 16px → 14px, and text alignment is pinned so a centred ancestor cannot centre the input.

## Two known bugs, unfixed, that will bite you

**`flag()` ignores boolean attributes set after upgrade.** In `src/elements/define.tsx`, `flag()` reads `props[name]`, which stays `undefined` for a bare attribute, so no re-render happens. The **property** works (`el.disabled = true`); the attribute does not. Confirmed on `kai-radio-group` and `kai-checkbox-group`, so it is the shared shape and affects **every boolean attribute on every facade**. If your emitted code sets boolean attributes on `kai-*` elements after mount, use properties.

**Array props as attributes are not inert.** The `kai-` contract says array/object props must be set as JS properties. That is still the right advice, on object-identity and reactivity grounds — but the stated reason ("an array attribute does nothing") is not literally true: component-register JSON-parses a JSON attribute and it renders. Do not rely on either behaviour.

## Traps that cost time in #323 and will cost you the same

- **Labs `kai-*` Storybook stories render whatever build the Storybook process started with.** `.storybook/preview.ts:13` imports `elementsReady` from `dist/kai.es.js`, which wins the `customElements.define` race. Editing `src` and reloading shows stale behaviour; a dev-server fetch returning new source proves nothing about what the page ran. Worse, the process pins `dist/` at start, so it can serve a build that no longer exists on disk. Rebuild **and restart** before believing a facade story. `Components/*` Solid stories are live from `src` and are the exception.
- **A story that imports `./register` gets its tags a microtask late** — `register` defines them through an SSR-gated dynamic `import()`, so a property set before the upgrade is silently overwritten by the accessor's default. Import the facade module directly.
- `parameters.docs.controls` filters the autodocs table, **not** the Controls panel. The panel needs `parameters.controls`.
- Storybook's Solid renderer runs the story body once and `args` is a store. A story passing `args.value` into a controlled component snapshots it: the control appears to do nothing. Seed a signal from args and sync with `createEffect`.

## Verifying the merge

After `build:api`, run in `packages/ui`:

```
pnpm --filter @kitn.ai/ui run build:css
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
npm run typecheck
```

Expect roughly 353 files + your branch's tests. Then `nx build ui` before trusting anything that reads `dist/`.

Worth running once given the overlap: `pnpm --filter @kitn.ai/ui run verify:pack` — #323 raised the ceiling from 13.15 to 13.5 MiB for the five new elements, leaving **0.209 MiB** of headroom. That was chosen deliberately: any headroom past ~0.29 MiB would re-hide the `dist/llms/` duplication regression the previous ceiling was tuned to catch. Your branch adds emitted artifacts, so if you approach the ceiling, read the comment in `scripts/verify-pack-weight.mjs` before raising it. Per-element cost is about 78 KiB of tarball, and roughly half of the recent growth was the same element metadata re-inlined into eight bundles — that is the lever if the number needs to come down.

## Open items on the kit side, in case they overlap your plan

- `RadioGroup` needs an `itemProps`-style per-row hook before `ChoiceCard`'s `ListRow` can collapse into it. It currently uses the bare `Radio` primitive.
- The S09 conformance scenario asserts "0 inputs remain" to prove a form stayed editable. A widget that becomes a non-`input` control is invisible to that check, and the enum `Select` already is a `<select>`. Pre-existing, can pass vacuously.
- `scripts/build-theme-tokens.mjs:5` claims `theme.css` contains the `tw-animate-css` import. It does not; the import is at `src/elements/styles.css:22`.

Plan and decisions ledger for the primitives work: `docs/superpowers/plans/2026-08-25-form-control-primitives.md`.
