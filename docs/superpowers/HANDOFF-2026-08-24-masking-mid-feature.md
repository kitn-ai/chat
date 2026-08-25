# Handoff: form-field formats/masking — T0-T9 DONE, one app-only defect in diagnosis

Date: 2026-08-24. For a fresh seat, no context. Ledger of record:
`.superpowers/sdd/2026-08-24-form-field-formats/progress.md` (READ IT — every task, review,
ruling, and banked item). Spec: `docs/superpowers/specs/2026-08-24-form-field-formats-design.md`
(§10 decided). Plan: `docs/superpowers/plans/2026-08-24-form-field-formats.md`.

## 1. State: branch `feat/form-field-formats` (NOT pushed, no PR yet)

Tasks 0-7 + 9 complete, each reviewed with watched-red discipline; T8 (docs) deferred to the PR
round; tier 3 (obscure) OWNER-GATED. Commits (oldest first): plan 4f7da09c · provenance
35062dbf + 6360f835 · T1 engine c79d7b8f · T2 semantics 903e14d7 · T3 masker 4f1d6652 ·
T4 Input 74c4f73a · T5 kai-input f605997b · T6 browser IVP 82f1063e · merge-main 0962dce3
(the branch was cut from STALE local main — lesson below) · T7 model-facing schema fd076e0d ·
T9 real-model acceptance 5fab1116 · owner-round caret fix 7c4ca28e. Plus roadmap-doc commits
riding this branch: ef058e96, 234265ae, 49d055c7, 8182b558, cd956ca1.

Suites at head: unit 4498+ green · input-mask jsdom 97 · e2e IVP 10/10 (`test:input-mask-ivp`,
not CI-collected, family convention) · typecheck green · real-model acceptance: DeepSeek 9/9
(model AUTHORED masked fields, canonical round trip in captured bytes), gpt-4o-mini 5/5 with
the honest limit (ticket got a regex, no format — the CardRequireRule properties.* gap, banked).

## 2. THE OPEN DEFECT (next seat's first task)

Owner-observed: the guided-caret clamp (7c4ca28e — caret floors after `CHG-`|, ceilings at the
fill frontier) works in STORYBOOK (source-served, flat DOM) but NOT in examples/apps/ops-console
(dist-served, input ~3 shadow roots deep) — focus/click leaves caret at 0. Typing/masking works
in the app (t9-mock-mask 15/15 — which asserts typing, NOT the clamp; that vacuity is why it
"passed"). Agent M11 was dispatched with a measure-first brief (full text in the ledger tail):
reproduce in the app → instrument which of the four clamp triggers fire in nested shadow vs
flat → fix in-lane (input-mask.ts) → prove red→green IN THE APP path, not Storybook. If the
session died before M11 finished, RE-DISPATCH that brief verbatim. Owner has agreed this does
not block: quick fix rides the PR; otherwise it ships as an honest known-issue in the README.

## 3. After the defect: the PR round

T8 (docs page for the feature + `kai-input` section in docs/web-components.md which has NONE —
generator has no marker there; + O-1 limitation documented) per plan task 8, then ONE PR of the
whole branch for OWNER review (feature PR = owner reviews; supervisor merge authority covers
fixes). Before the PR: `git merge origin/main` again (main moves), full gates (unit, emitted,
typecheck, verify:scaffold, lint:silent-drops, lint:cdn-pins, verify:consumer), and the ops-console
dev servers on :5182/:5183 may still be RUNNING from the owner's test — check and kill.

## 4. The recipe (delivered; owner mid-validation)

Mock: `cd examples/apps/ops-console && npm run dev` → :5182 → "deploy payments to production" →
the form's three masked fields (ticket chg4821→CHG-4821, date 09152026→09/15/2026, tel).
Real: copy `.env` from examples/apps/builder, DeepSeek default. Storybook: Components/Primitives/
Input → MaskedFormats. OWNER RULES in force: no SSN anywhere in stories/fixtures/demos; the
date mask is labeled a mask, not a validator. STALENESS TRAP that already bit twice: the app
serves the kit's BUILT dist — after any kit change, `npm run build` in packages/ui AND clear
`examples/apps/ops-console/node_modules/.vite`, or the owner sees stale behavior.

## 5. Strategy decisions this session (all owner-ratified, recorded in memory + the roadmap doc)

`docs/superpowers/2026-08-24-roadmap-decision.md` (on this branch) is the standing direction
agenda — D-1..D-9 AWAIT OWNER RULING (one sitting), D-10 decided. Highlights: ladder DONE +
0.26.0 SHIPPED (verify release state from the registry, never local refs); Solid v2 STAGED
migration (spike right after masking lands → mechanical branch; builder targets v2); the
plugin-harness thesis (open/safe/loud vs deepseek-harness; execution machinery is a syllabus
not a wall); dsh plugin spike + Bun webview spike banked; devtools revival = FEED-FIRST
(model-visible ⟺ logged; memos in `.superpowers/sdd/2026-08-24-form-field-formats/*-research.md`).

## 6. Banked this session (ledger has detail)

CardRequireRule cannot reach form-card `properties.*` (live cost measured on gpt-4o-mini) ·
FieldRow body builds 2x per visible row · controlled-canonical double-workaround (kai-input +
form.tsx both split signals; consolidation belongs in ui/input.tsx) · gen-element-api.mjs
`(): void` fallback on inferred returns unguarded · slots.test.ts quote-parity regex is
apostrophe-fragile · forbidden-strings file is only 2 patterns (weak clean-room evidence) ·
the clamp's trigger set is a dated Chromium measurement.

## 7. Method lessons priced in (2nd+ instances now rules)

Derive branch/release state from origin or the registry, NEVER a local ref (bit twice: the
roadmap author's false "0.26.0 unshipped", the branch cut from stale main). The dist-vs-source
staleness trap (bit twice). A probe that asserts typing proves nothing about carets — name what
a green actually covers. Evidence persists inside the task (t9-captures mirrored to the tracked
research dir because `.superpowers/` is gitignored).
