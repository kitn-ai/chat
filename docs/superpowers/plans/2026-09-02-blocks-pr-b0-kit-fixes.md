# PR B0: the four kit gaps the blocks contract spike found Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four kit defects the blocks contract spike found (F-5, F-8, F-9, F-10) so PR B's react renderer has something that compiles and renders, and prove each one against the packed tarball rather than against the tree.

**Architecture:** Four independent one-file fixes in three areas of `packages/ui`, each with its own test cycle and its own commit. The React wrapper runtime (`frameworks/react/runtime.tsx`) gains `slot` and `hidden` and stops treating a present-but-`undefined` prop as "skip"; `readViewEntry` in `src/elements/view-stack.tsx` reads the DOM PROPERTY before the attribute, the way `readTabBarItemValue` already does; `scripts/gen-element-react.mjs` threads the per-tag element interface it already generates through a second generic on `createWebComponent`, so a `ref` gives a typed handle; and `src/stores/index.ts` re-exports the one type its own controller hands back. Nothing about what a block IS changes, and nothing under `packages/blocks/` is touched.

**Tech Stack:** React 19 + `@testing-library/react` under `vitest.react.config.ts`; SolidJS + `solid-element` for the facades; the jsdom `unit` vitest project; `tsc` across the package's six typecheck passes; the `build:api` generator chain (`scripts/gen-element-api.mjs` -> `gen-element-types.mjs` + `gen-element-react.mjs`); Playwright for the runtime proof.

**Spec:** `docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md`, section 8b ("Kit fixes that gate PR B") and section 7's PR B0 paragraph. Evidence: `docs/superpowers/research/2026-09-02-blocks-contract-spike.md`, findings F-5, F-8, F-9, F-10, section "2. Runtime evidence" and section "4. Recommendation". Predecessor plan, whose house rules this one copies: `docs/superpowers/plans/2026-09-02-blocks-package-move.md` (PR A, merged as `fcd1d4ff`).

---

## Scope: PR B0, and nothing else

IN scope:

- F-8: `WebComponentProps` gains `slot` and `hidden`; the runtime forwards both; a prop PRESENT in props with the value `undefined` clears rather than being skipped.
- F-5: `readViewEntry` in `packages/ui/src/elements/view-stack.tsx` reads the property before the attribute, for **both** `name` and `tabRoot`.
  - **Spec section 8b's F-5 row names two readers; only one of them is broken.** The row reads "`readViewEntry` and `kai-tab-bar`'s item reader prefer the property over the attribute", and the spike quotes `tab-bar.tsx:257` doing an attribute-only read. That quoted line is the FALLBACK inside a helper that is already property-first: `readTabBarItemValue` at `packages/ui/src/components/tab-bar.tsx:254-258` tests the property before reaching it, and `isTabBarItemDisabled` at `:262-267` does the same for the boolean. Both are already correct and already tested (`packages/ui/src/elements/tab-bar.declarative.test.tsx:24-40`). Nothing in `tab-bar` changes; it is the pattern being copied, not a second site to fix.
- F-9: `createWebComponent` gains a second generic for the element type; `gen-element-react.mjs` passes each element's generated interface; the wrappers are regenerated.
- F-10: `@kitn.ai/ui/stores` re-exports `ConversationSummary`.

OUT of scope, do not start any of it:

- Anything the spike recommends **to the contract** (F-1 list binding, F-2 `.textContent`, F-3 identifiers-not-expressions, F-4 `@` covering native events, F-6 the seed marker, F-7 the registration + `whenDefined` emission, Amendment 1's `refs` getter, F-10's `="false"` translation). Those are renderer and spec work, and they are PR B.
- Any renderer, any binding parser, any change to `packages/blocks/`.
- The spike's Patch B (mirroring every scalar prop to an attribute). It is explicitly the blunt version; section 3 of the report says the narrower reader fix is the one to prefer, and Task 2 is that fix. Do not reintroduce the mirror.
- Making `vue-tsc` a CI cell (spike Q3). That is PR B2's verification.
- **The wider F-5 class.** `readViewEntry` is not the only declarative-child reader in the kit that reads attributes only. The same shape sits at `packages/ui/src/components/conversation-list.tsx:90-92`, `chain-of-thought.tsx:54-56`, `composer.tsx:25-28`, `model-switcher.tsx:44-48`, `message.tsx:242-245`, `prompt-input.tsx:129-132`, `prompt-suggestions.tsx:42-43` and `message-skills.tsx:26`. Each is the same defect waiting for the first framework-authored block that uses that element, and each needs its own evidence of a real break before it earns a fix -- this PR fixes the one the spike actually broke. Recorded here and in the PR body as the PR B follow-up. **Scope is unchanged: do not touch them.**
- Correcting the now-understated `hidden` JSDoc on `kai-resizable-item` (see the ruling below).

---

## Global Constraints

- Branch: `fix/blocks-pr-b0-kit-fixes`, cut from `origin/main`. **The controller prepares a worktree and passes its absolute path at dispatch.** Every command in this plan runs inside it, never in the main checkout, which the controller keeps for itself. Export it once per shell and use it everywhere:

```bash
export WT=/Users/home/Projects/kitn-ai/kitn-chat/.claude/worktrees/blocks-b0
```

  Never `git checkout` in someone else's working checkout; if another agent owns a tree, stop and say so. A worktree is the right shape here even though the work is sequential: PR A proved the three-step preparation below, and it is what keeps the main checkout free.
- Conventional commits, one per task, of the form `fix(react): ...`, `fix(elements): ...`, `fix(stores): ...`. These are bug fixes, so release-please cuts a **patch**. Verified against `release-please-config.json`, which sets `"bump-minor-pre-major": true` and `"bump-patch-for-minor-pre-major": false`: pre-1.0, a `fix` is a PATCH and only `feat`/breaking take the minor. No `feat`, no `feat!`.
- **A fresh clone or worktree needs THREE things before the unit suite means anything, and skipping one produces a failure that reads like a broken checkout:** (1) `pnpm install` -- a worktree under `.claude/worktrees/` resolves up into the parent checkout's `node_modules` while Vite refuses to serve paths outside the worktree root, and the whole suite dies on one identical `Cannot find module '/@fs/<parent>/node_modules/@testing-library/jest-dom/dist/vitest.mjs'`; (2) `pnpm --filter @kitn.ai/ui run build:css`, because `packages/ui/src/elements/compiled.css` is generated and gitignored and without it a large batch of files die on `Failed to resolve import "./compiled.css?inline"`; (3) a real build, for `dist/custom-elements.json`, `dist/kai.es.js` and `dist/blocks/`. `npm run` puts the ancestor `.bin` on PATH, so `build:css` can print success while the suite still fails identically. Do all three before believing any red.
- **`npm run test:react` needs a build too, and for a second reason:** `vitest.react.config.ts` aliases `@kitn.ai/ui/elements` (and every per-element subpath) to `dist/kai.es.js`, and aliases `@kitn.ai/ui/react` to `frameworks/react/index.tsx`. A stale `dist/` means the React tests drive stale elements.
- When a cold build is needed run `cd "$WT/packages/ui" && npm run build`, **not** `nx build ui`: the NX cache can restore a build target whose generators write into the SOURCE tree, printing success while changing nothing. A cached build looks exactly like a successful one.
- **Never pipe a heavy suite or a build through `tail` inside an `&&` chain** -- the exit status becomes the pipe's and a failure reads as a pass. Run each gate as its own command.
- Scratchpad paths are for scratch only. A scratchpad path must never appear in a committed file, and Task 5 greps for that.
- macOS `sed` needs the empty backup argument: `sed -i '' -E`.
- No em dashes and no emoji in any prose this branch adds to the tree, comments included.
- **Every new test is watched FAILING first.** Each task below states the exact expected red output. A test that has never been seen red is a test that cannot fail.
- `docs/superpowers/**` is scanned by `node packages/ui/scripts/lint-gate-parity.mjs` and `node packages/ui/scripts/lint-threshold-derivation.mjs`. Any fenced block or table you add to a doc under that tree that looks like a merge-gate enumeration needs `<!-- gate-list: partial -- <reason> -->` above it; any numeric threshold in prose needs a backticked producing command, the literal phrase `ratchet, not a target`, or `lint-thresholds: waive -- <reason>`. This plan file already carries those directives; keep them if you edit it.
- `gh pr update-branch` before merge. Task 5 does NOT merge.
- Every commit ends with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

---

## Rulings this plan makes

**1. F-5 fixes `tabRoot` as well as `name`, and the spike's own react tree is why.**

The finding is written about `name`, because that is the field whose emptiness made the failure visible ("all three `kai-view` children resolve to `{ name: '', tabRoot: false }`"). But `tabRoot` has the identical defect from the identical cause. The spike's react tree at report line 999 authors `<View name="home" tabRoot>`, and a JSX boolean on a wrapper prop sets the DOM PROPERTY `el.tabRoot = true` and never writes a `tab-root` attribute -- so `el.hasAttribute('tab-root')` is false and every view in the react form is a drill view. Fixing only `name` would leave the react form navigating into views that can never be tab roots. Both fields go property-first, each mirroring the helper beside it in `packages/ui/src/components/tab-bar.tsx`: `name` copies `readTabBarItemValue` (lines 254-258), `tabRoot` copies `isTabBarItemDisabled` (lines 262-267), which is where the "property if it is really a boolean, else the bare-attribute policy" shape already lives.

The other half of spec section 8b's F-5 row -- "and `kai-tab-bar`'s item reader" -- needs **no change**, and this is worth stating because the spike's own text points at a line that looks broken. It quotes `tab-bar.tsx:257`, `el.getAttribute('value') ?? el.id`, as doing the same attribute-only read. That line is the FALLBACK inside `readTabBarItemValue`, whose first two lines (`:255-256`) already test the property; `isTabBarItemDisabled` at `:262-267` already does the boolean version. Both are pinned by `packages/ui/src/elements/tab-bar.declarative.test.tsx:24-40`. `tab-bar` is the pattern this task copies, not a second site to fix. Do not "fix" it.

**2. `kai-view` already declares `name` and `tabRoot` as element properties. Nothing needs adding.**

Verified before this plan was written, on `main`: `packages/ui/src/elements/view.tsx:34-37` passes `{ name: undefined, tabRoot: undefined }` to `defineWebComponent`, and `packages/ui/src/elements/element-meta.json`'s `kai-view` entry lists both as props with `"scalar": true`. `solid-element` therefore defines real accessors for both on the upgraded element, and the generated `KaiViewElement` interface declares them. Task 2 keeps a step that re-confirms this on the branch rather than assuming it, but the expected outcome is "already true, no change". **If that step finds otherwise, stop and report -- do not add a property, because that would move `element-meta.json`, `element-types.d.ts`, `dist/elements.d.ts`, `llms-full.txt` and `docs/web-components.md` and blow up Task 3's "only `index.tsx` changed" regeneration gate.**

**3. The typed-ref import is the BARE specifier `@kitn.ai/ui/elements`, not a relative reach into `src/`.**

Two candidate spellings for the import the generator adds to `frameworks/react/index.tsx`:

- `'../../src/elements/element-types'`, which is what `reactImportPath` in `gen-element-react.mjs` produces for every other type it imports. **This one breaks the build.** `srcSpecifiersToDist` in `packages/ui/config/vite/react.ts` rewrites `../../src/x` in the EMITTED declarations to a `dist/` path, and it probes the source tree for `x.ts` or `x.tsx` before doing so. `element-types` is a `.d.ts`, so the probe misses, the function returns the specifier untouched (by design -- "let the boundary guard report it rather than inventing a path"), and `dist/react/index.d.ts` ships a specifier pointing outside `dist/`, which is exactly what `verify:dts` fails on.
- `'@kitn.ai/ui/elements'`, the bare subpath. `srcSpecifiersToDist` ignores bare specifiers. `verify-dts-boundaries.mjs` accepts a bare self-reference whose subpath is declared in the exports map, and `./elements` is (`types: ./dist/elements.d.ts`, which exports every `Kai*Element` interface -- checked on `main`, none missing). It is also the specifier a consumer writes, and the one the spike's own react tree writes at report line 947.

So: bare specifier. The cost is one config change. `tsconfig.react.json` and `tsconfig.react.test.json` both map `@kitn.ai/ui/elements` to `./tests/react/elements-stub.d.ts`, an empty module, on the stated grounds that "the real `/elements` type module re-exports the kit's SolidJS source, which a React-JSX typecheck can't process". That reason is stale and was measured stale: importing `KaiViewStackElement` from `src/elements/element-types.d.ts` into both React passes compiles clean. The BARE key moves to `./src/elements/element-types.d.ts`; the WILDCARD key `@kitn.ai/ui/elements/*` stays on the stub, because the per-element lazy-import subpaths really are side-effect-only.

**4. The `hidden` JSDoc on `kai-resizable-item` becomes understated, and is deliberately left alone.**

The `collapsed` prop doc on `kai-resizable-item` says of `hidden`: "a JSX boolean sets neither the `hidden` attribute nor the IDL property on a custom element, so the parent never sees it." After Task 1 that is no longer true through `@kitn.ai/ui/react` (measured: the wrapper sets the property AND React reflects the attribute).

The sentence lives in **three** places, which is most of the reason to leave it:

- `packages/ui/src/elements/resizable.tsx:634` -- the source of truth. There is no `resizable-item.tsx`; `kai-resizable-item` is defined inside `resizable.tsx`.
- `packages/ui/src/elements/element-meta.json:7633` -- the generated copy, and through it `element-types.d.ts`, `dist/elements.d.ts`, `llms-full.txt`, `docs/web-components.md` and `frameworks/react/index.tsx`, all of which `build:api` rewrites from the source doc in one pass.
- `packages/ui/src/elements/labs-resizable-collapsed.stories.tsx:66` -- a hand-written restatement inside a story snippet, which no generator touches and which would therefore have to be edited separately or left contradicting the fixed prose.

Correcting one sentence is thus a six-artifact regeneration plus a hand edit, and it destroys Task 3's ability to assert that the ONLY regeneration diff is the wrapper generic. Recorded in the PR body as a follow-up instead. Do not edit any of the three here.

**5. Task 3 pulls `dist/elements.d.ts` into every React consumer's type program. That is a real consequence, it is disclosed, and it is NOT fixed here.**

After Task 3 the emitted `dist/react/index.d.ts` carries `import type { ... } from '@kitn.ai/ui/elements'`, so anyone who imports `@kitn.ai/ui/react` now loads `dist/elements.d.ts` -- a single file, currently 345 KB (`wc -c packages/ui/dist/elements.d.ts`) -- into their program. That file is not inert: it contains `declare global { interface HTMLElementTagNameMap ... }`, a `declare module 'react' { namespace JSX { interface IntrinsicElements ... } }` block, and a `declare module 'vue' { interface GlobalComponents ... }` block. Three consequences, in order of how much they matter:

1. **Raw `<kai-chat>` JSX becomes type-legal by default in a React consumer's app**, because the `IntrinsicElements` augmentation is now loaded whether or not they asked for it. That is precisely the escape hatch the blocks spec's section 5.2 structural check forbids for a generated block -- so the check has to keep being a STRUCTURAL check over the emitted source, and can never be relaxed into "tsc would have caught it". Nothing in this PR relies on it being illegal; the point is that a future round must not assume it is.
2. **The `declare module 'vue'` block is now in a React consumer's program.** It is already exercised with `skipLibCheck: false` by `packages/ui/tests/elements/element-types-lib-check.test.ts`, which is why this is a disclosure and not a risk.
3. **Type-program weight.** A `.d.ts`, not runtime bytes: `dist/react.js` is unchanged and the import is erased. The measured cost of the whole react pass with the real interfaces loaded stayed under a second.

The alternative -- generating a slim per-tag interface file for the wrappers to import -- is a second copy of something a generator already emits, which is the failure mode `docs/coupling-map.md` section 4 exists to shame. **Do not build it in this PR.** Named in the coupling-map row (Task 3 Step 12) and in the PR body.

**6. `undefined` clears; an ABSENT key does not.** These are different states and the runtime must keep them different. React hands a component a complete props object on every render, so a key the caller stopped passing is the caller saying "no value" -- and skipping it is what left the spike's react form showing its conversation starters forever. A key that was never in props at all is not the caller saying anything, and clearing on it would stomp values a consumer set imperatively on the element. `name in p` is the discriminator, and both halves get a test.

---

## File structure

| File | Task | Responsibility after this PR |
|---|---|---|
| `packages/ui/frameworks/react/runtime.tsx` | 1, 3 | The wrapper runtime: declares `slot`/`hidden` on `WebComponentProps`, forwards them to the DOM, assigns every prop PRESENT in props (including `undefined`), and carries the second generic `E` that types the forwarded ref |
| `packages/ui/tests/react/wrappers.test.tsx` | 1 | Live-DOM behaviour of the wrappers; gains the `slot`, `hidden` and clear/untouched cases |
| `packages/ui/src/elements/view-stack.tsx` | 2 | `readViewEntry` reads property-then-attribute-then-id for `name`, and property-then-bare-attribute for `tabRoot` |
| `packages/ui/src/elements/view-stack.declarative.test.tsx` | 2 | The pure reader's contract; gains the three property-precedence cases |
| `packages/ui/scripts/gen-element-react.mjs` | 3 | Emits the element-interface import and `createWebComponent<XProps, KaiXElement>` |
| `packages/ui/frameworks/react/index.tsx` | 3 | GENERATED. Regenerated by `npm run build:api`; never hand-edited |
| `packages/ui/tsconfig.react.json`, `packages/ui/tsconfig.react.test.json` | 3 | The bare `@kitn.ai/ui/elements` key resolves to the real element interfaces; the wildcard stays on the stub |
| `packages/ui/tests/react/elements-stub.d.ts` | 3 | Unchanged code (`export {}`), corrected header: it now covers the per-element WILDCARD subpaths only, and says why the bare key left |
| `packages/ui/tests/scripts/react-wrappers.test.ts` | 3 | Pins the generated wrapper's shape; its one literal gains the second type argument |
| `packages/ui/tests/react/typed-refs.test.tsx` | 3 | NEW. Compile-time and runtime proof that a `ref` yields the element interface |
| `packages/ui/src/stores/index.ts` | 4 | The `@kitn.ai/ui/stores` entry; re-exports `ConversationSummary` |
| `packages/ui/src/stores/index.test.ts` | 4 | The entry's contract; gains the type-level export assertion |
| `docs/coupling-map.md` | 3 | Registers the new tsconfig-paths <-> generated-import coupling |

---

## Task 1: F-8 -- the React wrappers gain `slot` and `hidden`, and `undefined` clears

**Files:**
- Modify: `packages/ui/frameworks/react/runtime.tsx:19-27` (the props interface), `:103-115` (the prop-assign effect, guard at `:108`), `:142-152` (the `createElement` call)
- Test: `packages/ui/tests/react/wrappers.test.tsx` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `WebComponentProps` gains `slot?: string` and `hidden?: boolean`. Every generated wrapper's `XProps` extends `WebComponentProps`, so **no generated file changes** and `verify:generated` stays green in this task. `createWebComponent`'s signature is unchanged here; Task 3 changes it.

### Why this is four separate holes and one commit

The spike (F-8) hit all three symptoms with one block: `slot` is needed seven times to compose kai elements into kai slots, `hidden` is toggled on three elements, and a prop set back to `undefined` never cleared. They are one function's worth of change and share one test file, so they are one task. The measured before/after, taken on `main` with the fix applied and reverted:

| | without the fix | with the fix |
|---|---|---|
| `<Panel slot="panel">` -> `el.getAttribute('slot')` | `null` | `"panel"` |
| `<Row hidden>` -> `el.hidden` / attribute | `false` / `null` | `true` / `""` |
| ...then re-rendered as `<Row />` | -- | `false` / `null` |
| `<Suggestions suggestions={['a','b']}>` then `suggestions={undefined}` | `["a","b"]` | `undefined` |
| a key never passed, set imperatively on the element | untouched | untouched |

- [ ] **Step 1: Write the failing tests**

Append to `packages/ui/tests/react/wrappers.test.tsx`. Add `Panel`, `Row` and `Suggestions` to the existing import on line 13 so it reads:

```tsx
import { Conversations, PromptInput, Chat, Panel, Row, Suggestions } from '@kitn.ai/ui/react';
```

Then append:

```tsx
// ─── F-8: slot, hidden, and clearing a prop ──────────────────────────────────
// The blocks contract spike (docs/superpowers/research/2026-09-02-blocks-contract-spike.md,
// F-8) found three holes in one block. `slot` and `hidden` were not declared on
// WebComponentProps and not forwarded, so composing kai elements into kai SLOTS --
// which most blocks do -- did not type-check and did not work; and a prop set back
// to `undefined` was skipped rather than cleared, so a widget that drops its
// conversation starters after the first turn showed them forever.

test('slot is forwarded to the element (composing into a kai slot)', async () => {
  const { container } = render(<Panel slot="panel" />);
  const el = container.querySelector('kai-panel') as unknown as AnyEl;
  await flush();
  // The ATTRIBUTE is the one that matters: slot assignment is an attribute
  // contract, and a parent's <slot name="panel"> matches on it.
  expect(el.getAttribute('slot')).toBe('panel');
});

test('hidden is forwarded, and toggles back off', async () => {
  const { container, rerender } = render(<Row hidden />);
  const el = container.querySelector('kai-row') as unknown as AnyEl;
  await flush();
  expect(el.hidden).toBe(true);
  expect(el.hasAttribute('hidden')).toBe(true);

  rerender(<Row />);
  await flush();
  expect(el.hidden).toBe(false);
  expect(el.hasAttribute('hidden')).toBe(false);
});

test('a prop re-rendered as undefined CLEARS it on the element', async () => {
  const { container, rerender } = render(<Suggestions suggestions={['a', 'b']} />);
  const el = container.querySelector('kai-suggestions') as unknown as AnyEl;
  await flush();
  expect(el.suggestions).toEqual(['a', 'b']);

  rerender(<Suggestions suggestions={undefined} />);
  await flush();
  expect(el.suggestions).toBeUndefined();
});

test('a prop ABSENT from props is left alone (not cleared)', async () => {
  // The other half of the rule, and the reason the guard is `name in p` rather
  // than a plain assignment: React callers who mean "leave whatever is on the
  // element alone" omit the key. `undefined` is a value; an absent key is not.
  const { container, rerender } = render(<PromptInput placeholder="Ask" />);
  const el = container.querySelector('kai-prompt-input') as unknown as AnyEl;
  await flush();

  el.loading = true; // set imperatively, never passed through React
  rerender(<PromptInput placeholder="Ask again" />);
  await flush();
  expect(el.loading).toBe(true);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd "$WT/packages/ui" && npm run test:react -- tests/react/wrappers.test.tsx
```

Expected: `slot is forwarded` FAILS on `expected null to be "panel"`; `hidden is forwarded` FAILS on `expected false to be true`; `a prop re-rendered as undefined CLEARS it` FAILS on `expected [ 'a', 'b' ] to be undefined`. The fourth test PASSES already -- it is a regression pin against over-correcting Step 3, not a red.

- [ ] **Step 3: Watch the TYPE half fail too**

```bash
cd "$WT/packages/ui" && npx tsc --noEmit -p tsconfig.react.test.json
```

Expected: two errors of exactly the shape the spike recorded:

```
tests/react/wrappers.test.tsx(NN,NN): error TS2322: Type '{ slot: string; }' is not assignable to type
  'IntrinsicAttributes & PanelProps & RefAttributes<HTMLElement>'.
  Property 'slot' does not exist on type 'IntrinsicAttributes & PanelProps & RefAttributes<HTMLElement>'.
tests/react/wrappers.test.tsx(NN,NN): error TS2322: Type '{ hidden: true; }' is not assignable to type
  'IntrinsicAttributes & RowProps & RefAttributes<HTMLElement>'.
  Property 'hidden' does not exist on type 'IntrinsicAttributes & RowProps & RefAttributes<HTMLElement>'.
```

This is the half that is fatal to PR B: it is a compile error, and the obvious workaround (dropping to intrinsic `<kai-panel>` JSX) is what the spec's own structural check forbids.

- [ ] **Step 4: Declare the two props**

In `packages/ui/frameworks/react/runtime.tsx`, replace the `WebComponentProps` interface body between `id?: string;` and the `children` doc comment so the interface reads:

```tsx
export interface WebComponentProps {
  /** Color mode (`auto` follows prefers-color-scheme). */
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
  style?: CSSProperties;
  id?: string;
  /** Slot assignment when this element is a child of another kai element
   *  (`<Panel slot="panel">`). Forwarded to the DOM, never assigned as a
   *  property: slotting is an attribute contract and the parent's
   *  `<slot name="...">` matches on the attribute. */
  slot?: string;
  /** Hide the element. Forwarded to the DOM so a parent that scans its
   *  children for it sees it, which the coarse layout elements do. */
  hidden?: boolean;
  /** Light-DOM children passed through to the element (slots). */
  children?: ReactNode;
}
```

- [ ] **Step 5: Forward them**

In the same file, in the `createElement` call, add the two keys after `id`:

```tsx
    return createElement(
      tagName,
      {
        ref: elRef,
        className: p.className as string | undefined,
        style: p.style as CSSProperties | undefined,
        id: p.id as string | undefined,
        slot: p.slot as string | undefined,
        hidden: p.hidden as boolean | undefined,
      },
      // Light-DOM children pass straight through to the element (slots).
      (p.children ?? null) as never,
    );
```

Note for the reviewer: `kai-resizable-item` is the one element that ALSO declares its own `hidden` prop, so for that tag `hidden` travels both paths -- React's forwarding here and the prop-assign loop below -- with the same value. Identical type, identical value, no conflict; the react typecheck in Step 8 is what proves the interface extension is legal.

- [ ] **Step 6: Make `undefined` clear**

In the same file, replace the guard inside `applyProps`:

```tsx
      const applyProps = () => {
        for (const name of propNames) {
          // PRESENT-with-undefined CLEARS. ABSENT is untouched.
          //
          // React hands a component a COMPLETE props object every render, so a
          // key the caller stopped passing is the caller saying "no value" --
          // and skipping it left the last value stuck on the element forever
          // (blocks contract spike, F-8: a widget that drops its conversation
          // starters after the first turn went on showing them). A key that was
          // never in props at all is not the caller saying anything, and
          // clearing on it would stomp a value set imperatively on the element.
          // A React caller who means "leave it alone" omits the key.
          if (name in p) (el as unknown as Record<string, unknown>)[name] = p[name];
        }
      };
```

- [ ] **Step 7: Run the tests and watch them pass**

```bash
cd "$WT/packages/ui" && npm run test:react -- tests/react/wrappers.test.tsx
```

Expected: PASS, all tests in the file, including the four new ones and the five that were already there.

- [ ] **Step 8: Run the two React typecheck passes**

```bash
cd "$WT/packages/ui" && npx tsc --noEmit -p tsconfig.react.json
cd "$WT/packages/ui" && npx tsc --noEmit -p tsconfig.react.test.json
```

Expected: both exit 0 and print nothing. The first is the one that proves `ResizableItemProps`'s own `hidden?: boolean` still legally extends the new base declaration. (Measured clean on `main` with this exact change applied.)

- [ ] **Step 9: Prove no generated file moved**

```bash
cd "$WT" && git status --porcelain
```

Expected: exactly two modified paths, `packages/ui/frameworks/react/runtime.tsx` and `packages/ui/tests/react/wrappers.test.tsx`. `runtime.tsx` is hand-written, not generated, and `WebComponentProps` is inherited rather than restated by the generator, so `frameworks/react/index.tsx` must NOT appear. If it does, something regenerated it and you have a different problem.

- [ ] **Step 10: Commit**

```bash
cd "$WT"
git add packages/ui/frameworks/react/runtime.tsx packages/ui/tests/react/wrappers.test.tsx
git commit -m "$(cat <<'BODY'
fix(react): wrappers forward slot and hidden, and undefined clears a prop

Three holes in createWebComponent, all hit by one authored block (blocks
contract spike, F-8):

- `slot` was neither declared on WebComponentProps nor forwarded, so
  composing kai elements into kai SLOTS was a type error. The workaround --
  dropping to intrinsic <kai-*> JSX -- is what the blocks spec's structural
  check forbids, so one of the two had to move.
- `hidden` was in the same state, and the coarse layout elements read it.
- a prop re-rendered as `undefined` was SKIPPED rather than cleared, so a
  widget that drops its suggestions after the first turn showed them
  forever. Invisible to tsc and to every compile cell.

An ABSENT key stays untouched: React callers who mean "leave it alone"
omit the key, and `undefined` is a value. Both halves are tested.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
BODY
)"
```

---

## Task 2: F-5 -- `readViewEntry` reads the property before the attribute

**Files:**
- Modify: `packages/ui/src/elements/view-stack.tsx:13-20` (`readViewEntry`)
- Test: `packages/ui/src/elements/view-stack.declarative.test.tsx` (append a describe block)
- Read only, as the pattern being copied: `packages/ui/src/components/tab-bar.tsx:254-266`, `packages/ui/src/elements/tab-bar.declarative.test.tsx:24-40`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `readViewEntry(el: Element): ViewEntry` keeps its exact signature and its `ViewEntry` shape (`{ name: string; tabRoot: boolean }`, declared in `packages/ui/src/components/view-stack.ts`). Only the resolution order inside changes. No caller changes.

### The defect, and why both fields move

`kai-view-stack` discovers its views by walking its `kai-view` children and calling `readViewEntry` on each. Today that reads `el.getAttribute('name') ?? el.id`. A component framework sets a declared prop as a DOM PROPERTY and never writes the attribute, so:

- **React**: every child resolves to `{ name: '', tabRoot: false }`, nothing matches, nothing is hidden, and the widget renders home, the conversation list and the chat thread stacked on top of each other. The spike's driver reported `after push: {"view":"","drilled":false,"tabbarHidden":false,"backHidden":true}`.
- **Vue**: `shouldSetAsProp` returns `key in el`, so `name="home"` is an ATTRIBUTE while the element is not yet upgraded and a PROPERTY once it is. The Vue form therefore broke only after the registration fix made elements upgrade earlier: an intermittent failure whose trigger is import timing.

`tabRoot` has the same defect from the same cause (ruling 1): the spike's react tree authors `<View name="home" tabRoot>`, a JSX boolean, which sets `el.tabRoot = true` and writes no `tab-root` attribute.

`kai-tab-bar` already got this right, and its two helpers are the shapes to copy verbatim.

- [ ] **Step 1: Confirm the element really does declare both props**

```bash
cd "$WT/packages/ui"
sed -n '34,37p' src/elements/view.tsx
node -e "const m=require('./src/elements/element-meta.json');const e=m.find(x=>x.tag==='kai-view');console.log(e.props.map(p=>p.name+':'+p.scalar).join(' '))"
```

Expected: the `defineWebComponent` call passes `{ name: undefined, tabRoot: undefined }`, and the meta prints `theme:true name:true tabRoot:true`. That is the whole precondition for a property-first read: `solid-element` defines real accessors for both on the upgraded element. **If either is missing, STOP and report** -- adding a property here would move six generated artifacts and break Task 3's regeneration gate (ruling 2).

- [ ] **Step 2: Write the failing tests**

Append to `packages/ui/src/elements/view-stack.declarative.test.tsx`, after the existing `readViewEntry` describe block:

```tsx
// ─── F-5: the PROPERTY wins, because that is all a framework sets ────────────
// A component framework assigns a declared prop as a DOM property and never
// writes the attribute. Reading the attribute alone made every kai-view in the
// React form resolve to { name: '', tabRoot: false }, so nothing matched,
// nothing was hidden, and every view rendered stacked at once (blocks contract
// spike, F-5). kai-tab-bar already reads property-first; this is the same
// order, helper for helper.

function makeViewEl(): HTMLElement & { name?: string; tabRoot?: boolean } {
  return document.createElement('kai-view') as HTMLElement & { name?: string; tabRoot?: boolean };
}

describe('readViewEntry resolves the PROPERTY first', () => {
  it('prefers the name property over the attribute and the host id', () => {
    const el = makeViewEl();
    el.name = 'prop';
    el.setAttribute('name', 'attr');
    el.id = 'host';
    expect(readViewEntry(el).name).toBe('prop');
  });

  it('falls back to the name attribute, then the host id', () => {
    const el = makeViewEl();
    el.setAttribute('name', 'attr');
    el.id = 'host';
    expect(readViewEntry(el).name).toBe('attr');
    el.removeAttribute('name');
    expect(readViewEntry(el).name).toBe('host');
  });

  it('prefers the tabRoot property, which is all a JSX boolean sets', () => {
    const el = makeViewEl();
    el.tabRoot = true;
    expect(readViewEntry(el).tabRoot).toBe(true);

    // An explicit `false` property beats a bare attribute: the property is the
    // framework's answer and the attribute is the plain-HTML spelling, so a
    // host that says false means false.
    el.tabRoot = false;
    el.setAttribute('tab-root', '');
    expect(readViewEntry(el).tabRoot).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

```bash
cd "$WT"
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/elements/view-stack.declarative.test.tsx
```

Expected: two of the three FAIL.
- `prefers the name property` -> `expected 'attr' to be 'prop'`
- `prefers the tabRoot property` -> `expected false to be true`
- `falls back to the name attribute, then the host id` PASSES: it is a regression pin on the fallback chain, so that Step 4 cannot fix the property case by breaking plain HTML.

- [ ] **Step 4: Make the reader property-first**

Replace `readViewEntry` in `packages/ui/src/elements/view-stack.tsx`:

```tsx
/** Read a `<kai-view>`'s declarative registration: `name` (the PROPERTY a
 *  framework sets, else the attribute, else the host `id`) and the `tab-root`
 *  flag. Pure -- unit-tested directly, the pattern `parseKaiConversationElement`
 *  set.
 *
 *  Property FIRST, and this order is load-bearing: a component framework
 *  assigns a declared prop as a DOM property and never writes the attribute, so
 *  an attribute-only read saw every child as `{ name: '', tabRoot: false }` and
 *  the stack matched nothing. Same order, helper for helper, as
 *  `readTabBarItemValue` and `isTabBarItemDisabled` in `../components/tab-bar`. */
export function readViewEntry(el: Element): ViewEntry {
  const nameProp = (el as Element & { name?: unknown }).name;
  const tabRootProp = (el as Element & { tabRoot?: unknown }).tabRoot;
  return {
    name:
      typeof nameProp === 'string' && nameProp
        ? nameProp
        : (el.getAttribute('name') ?? (el as HTMLElement).id),
    // A real boolean is the framework's answer and wins outright. Otherwise the
    // bare boolean attribute: present and not explicitly ="false" is ON, the
    // same policy `flag()` applies to facade props. The `typeof` test is what
    // keeps the two apart -- solid-element syncs the ATTRIBUTE onto the prop as
    // a string, which must not be mistaken for a host-supplied boolean.
    tabRoot:
      typeof tabRootProp === 'boolean'
        ? tabRootProp
        : el.hasAttribute('tab-root') && el.getAttribute('tab-root') !== 'false',
  };
}
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd "$WT"
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/elements/view-stack.declarative.test.tsx
```

Expected: PASS, every test in the file, including the five that pinned the attribute and `tab-root="false"` behaviour before this change.

- [ ] **Step 6: Run the view-stack behaviour suite and the tab-bar reader beside it**

```bash
cd "$WT"
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/view-stack.test.tsx src/elements/tab-bar.declarative.test.tsx
```

Expected: PASS. `src/components/view-stack.test.tsx` pins the navigation semantics over the same `createViewStack` core the facade runs on, and the tab-bar file is the pattern this change copied -- if the copy went wrong, the shapes will have drifted visibly.

- [ ] **Step 7: Typecheck**

```bash
cd "$WT" && nx typecheck ui --skip-nx-cache
```

Expected: exit 0. `--skip-nx-cache` is not optional here: `nx typecheck ui` is cached and its verdict has been wrong in BOTH directions in this repo, and the cached green over broken code is the one that ships.

- [ ] **Step 8: Commit**

```bash
cd "$WT"
git add packages/ui/src/elements/view-stack.tsx packages/ui/src/elements/view-stack.declarative.test.tsx
git commit -m "$(cat <<'BODY'
fix(elements): readViewEntry reads the property before the attribute

kai-view-stack discovered its views by reading its children's ATTRIBUTES.
A component framework assigns a declared prop as a DOM PROPERTY and never
writes the attribute, so in React every kai-view resolved to
{ name: '', tabRoot: false }: nothing matched, nothing was hidden, and the
widget rendered every view stacked at once. Vue broke intermittently on
the same read, its trigger being whether the element had upgraded yet.

Both fields move, not just `name`. `<View name="home" tabRoot>` is a JSX
boolean, which sets el.tabRoot and writes no tab-root attribute, so an
attribute-only read makes every view in the React form a drill view.

Same order, helper for helper, as readTabBarItemValue and
isTabBarItemDisabled, which already got this right. The fallbacks are
unchanged and still tested, so plain HTML is untouched.

Found by the blocks contract spike (F-5).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
BODY
)"
```

---

## Task 3: F-9 -- a React `ref` gives the element interface, not a bare `HTMLElement`

**Files:**
- Modify: `packages/ui/frameworks/react/runtime.tsx:69-83` and `:156` (the generic and the two casts)
- Modify: `packages/ui/scripts/gen-element-react.mjs:22-33` (the import block) and `:57-66` (the emitted wrapper)
- Modify: `packages/ui/tsconfig.react.json`, `packages/ui/tsconfig.react.test.json` (one `paths` key each)
- Modify: `packages/ui/tests/scripts/react-wrappers.test.ts:9` (the pinned literal)
- Create: `packages/ui/tests/react/typed-refs.test.tsx`
- Modify: `docs/coupling-map.md` (one row in section 4)
- REGENERATED, never hand-edited: `packages/ui/frameworks/react/index.tsx`

**Interfaces:**
- Consumes: **nothing from earlier tasks.** This task is independent of Task 1 and can be reviewed, or reverted, on its own: the new test authors neither `slot` nor `hidden`, and `createWebComponent`'s second generic is orthogonal to what `WebComponentProps` declares. They share a file and nothing else.
- Produces:
  ```tsx
  export function createWebComponent<P extends WebComponentProps, E extends HTMLElement = HTMLElement>(
    tagName: string,
    propNames: readonly string[],
    eventMap: Record<string, string>,
    register?: () => Promise<unknown>,
  ): ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<E>>;
  ```
  `E` DEFAULTS to `HTMLElement`, so every existing single-argument call site keeps compiling unchanged. The generator then emits `createWebComponent<ViewStackProps, KaiViewStackElement>(...)` for each element, taking the interface name from `className` in `element-meta.json`.

### The defect

`createWebComponent` returns `RefAttributes<HTMLElement>`, so a ref gives `HTMLElement` and `stack.push('chat')` does not exist on it. The spike's react tree needed an explicit cast at every ref: `ref={(el) => { refs.current.stack = el as KaiViewStackElement | null; }}`. The types exist and ship already -- `dist/elements.d.ts` exports one `Kai*Element` interface per tag, with the methods on it -- so this is the generator not using what it already generates. Vue gets it right for free.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/tests/react/typed-refs.test.tsx`:

```tsx
/**
 * F-9 (blocks contract spike): a forwarded ref must hand back the ELEMENT
 * INTERFACE, not a bare HTMLElement. The interfaces exist and ship
 * (dist/elements.d.ts, one Kai*Element per tag, methods included); the wrapper
 * generator simply did not use them, so `#ref` promised a typed handle the
 * react form could not honour and every ref site needed a cast.
 *
 * THE CALLBACK FORM IS THE TEST, AND THAT IS NOT AN AESTHETIC CHOICE.
 * `useRef<KaiViewStackElement>(null)` gives `RefObject<KaiViewStackElement | null>`,
 * and `RefObject`'s `current` is a MUTABLE property, which TypeScript checks
 * covariantly -- so that object IS assignable to `Ref<HTMLElement>` and the
 * object form compiles clean even against the broken wrapper. Measured: it
 * produces no error on main. The hole is only visible where the element flows
 * the OTHER way, into a callback parameter, which is the form the spike's react
 * tree uses at report lines 960 and 986 because that is what `#ref` compiles to.
 * A test written the object way would have passed on both sides of this fix.
 *
 * Both halves are asserted, because each catches what the other misses:
 *   - COMPILE TIME, under `tsc --noEmit -p tsconfig.react.test.json`.
 *   - RUNTIME, under `npm run test:react`, where the ref really receives the
 *     upgraded custom element from the prebuilt bundle.
 */
import { render, cleanup } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, expect, test } from 'vitest';
import { View, ViewStack } from '@kitn.ai/ui/react';
import type { KaiViewStackElement } from '@kitn.ai/ui/elements';

afterEach(cleanup);

test('a ref CALLBACK receives the element interface, not a bare HTMLElement', () => {
  // A holder object, not `let captured`. A `let` assigned only inside a
  // callback is still narrowed to `null` at the assertion sites by control-flow
  // analysis, and `captured?.tagName` is then TS2339 on `never` -- an error that
  // has nothing to do with what this test is about.
  const seen: { el: KaiViewStackElement | null } = { el: null };

  function Probe() {
    // The spike's shape: a ref bag of typed handles, filled by a callback.
    const refs = useRef<{ stack: KaiViewStackElement | null }>({ stack: null });

    useEffect(() => {
      seen.el = refs.current.stack;
      // A method the generated interface really declares.
      refs.current.stack?.push('chat');
      // @ts-expect-error KaiViewStackElement declares push/back/replace/selectTab/navigate, not pop
      refs.current.stack?.pop();
    }, []);

    return (
      <ViewStack
        ref={(el) => {
          // No cast. THIS is the assignment that does not compile against a
          // wrapper typed RefAttributes<HTMLElement>.
          refs.current.stack = el;
        }}
      >
        <View name="home" tabRoot />
        <View name="chat" />
      </ViewStack>
    );
  }

  render(<Probe />);
  expect(seen.el).not.toBeNull();
  expect(seen.el?.tagName.toLowerCase()).toBe('kai-view-stack');
  expect(typeof seen.el?.push).toBe('function');
});

test('the object ref form is typed too (secondary -- it compiles either way)', () => {
  // Kept deliberately, and labelled: this form is what most consumers write,
  // so it should be right -- but it is NOT the red. RefObject's `current` is
  // covariant, so this line compiles against the broken wrapper as well. It is
  // a pin on the useful case, not evidence of the fix.
  function Probe() {
    const stack = useRef<KaiViewStackElement>(null);
    useEffect(() => {
      stack.current?.selectTab('home');
    }, []);
    return <ViewStack ref={stack} />;
  }

  const { container } = render(<Probe />);
  expect(container.querySelector('kai-view-stack')).toBeTruthy();
});
```

- [ ] **Step 2: Run the typecheck and watch it fail**

```bash
cd "$WT/packages/ui" && npx tsc --noEmit -p tsconfig.react.test.json
```

Expected: FAIL. Two error classes arrive in sequence, and you must see BOTH.

First, because the specifier still maps to the empty stub:

```
tests/react/typed-refs.test.tsx(NN,NN): error TS2307: Cannot find module '@kitn.ai/ui/elements'
  or its corresponding type declarations.
```

Fix the `paths` key (Step 4), re-run, and record the SECOND red, which is F-9 itself, verbatim:

```
tests/react/typed-refs.test.tsx(NN,NN): error TS2322: Type 'HTMLElement | null' is not assignable
  to type 'KaiViewStackElement | null'.
  Type 'HTMLElement' is missing the following properties from type 'KaiViewStackElement':
    push, back, replace, selectTab, navigate
```

Do not skip past the first error to the second, and **do not accept a run where only the TS2307 appeared** -- that means the paths key is still wrong, not that the wrapper is fine. Reproduced on `main` before this plan was written.

- [ ] **Step 3: Run the react tests, and understand why they PASS**

```bash
cd "$WT/packages/ui" && npm run test:react -- tests/react/typed-refs.test.tsx
```

Expected: **PASS, on main, before any fix.** This is not a red step and the plan does not pretend it is. Vitest strips types without checking them, and the ref really does receive the element at runtime -- it is only mistyped. So the runtime half of this file is a PIN (it would catch a future change that stopped delivering the element at all), and the entire red for F-9 lives in `tsc`. Say so in your report rather than letting a green here read as evidence.

That asymmetry is the spike's own point in both directions: compile-only is not enough for react (F-8's third hole and F-6's loop type-check perfectly), and runtime-only is not enough either (F-9 runs perfectly and does not type).

- [ ] **Step 4: Repoint the bare `@kitn.ai/ui/elements` key in both React tsconfigs**

In `packages/ui/tsconfig.react.json` AND `packages/ui/tsconfig.react.test.json`, change the bare key only:

```json
      "@kitn.ai/ui/elements": ["./src/elements/element-types.d.ts"],
      "@kitn.ai/ui/elements/*": ["./tests/react/elements-stub.d.ts"]
```

and update the stub's own header comment in `packages/ui/tests/react/elements-stub.d.ts` so it no longer claims to cover the bare specifier:

```ts
// Typecheck stub for the SIDE-EFFECT-ONLY per-element import subpaths
// (`@kitn.ai/ui/elements/<module>`), which the generated wrappers lazy-import
// and which carry no types a consumer names. tsconfig.react.json and
// tsconfig.react.test.json map the WILDCARD key here.
//
// The BARE `@kitn.ai/ui/elements` used to map here too, on the grounds that the
// real types entry "re-exports the kit's SolidJS source, which a React-JSX
// typecheck can't process". Measured false: src/elements/element-types.d.ts is
// a declaration file and both React passes compile it clean. It is now mapped
// to the real thing, because the generated wrappers name the Kai*Element
// interfaces for their ref types (blocks contract spike, F-9).
export {};
```

- [ ] **Step 5: Add the second generic to the runtime**

In `packages/ui/frameworks/react/runtime.tsx`, four edits inside `createWebComponent`:

```tsx
export function createWebComponent<
  P extends WebComponentProps,
  /** The generated interface for THIS tag (`KaiViewStackElement`, ...), so a
   *  forwarded ref hands back the element's real methods instead of a bare
   *  HTMLElement that needs casting at every call site. Defaults to
   *  HTMLElement, which keeps a one-argument call compiling unchanged. */
  E extends HTMLElement = HTMLElement,
>(
  tagName: string,
  /** DOM-property names to assign from props (incl. `theme`). */
  propNames: readonly string[],
  /** Map of React handler prop → DOM event name. */
  eventMap: Record<string, string>,
  /** Client-only thunk that loads + registers this element (a literal dynamic
   *  import of its `@kitn.ai/ui/elements/<name>` chunk). */
  register?: () => Promise<unknown>,
): ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<E>> {
  const eventEntries = Object.entries(eventMap);

  const Component = forwardRef<E, P>((props, ref) => {
    const elRef = useRef<E | null>(null);
    useImperativeHandle(ref, () => elRef.current as E, []);
```

and the final cast:

```tsx
  Component.displayName = tagName;
  return Component as ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<E>>;
}
```

The `eventMap` doc comment keeps whatever arrow it already has; do not introduce a new one. Nothing else in the function body changes.

- [ ] **Step 6: Re-run the typecheck and watch it STILL fail**

```bash
cd "$WT/packages/ui" && npx tsc --noEmit -p tsconfig.react.test.json
```

Expected: **STILL FAILS**, and this is the point -- `ViewStack` is still `createWebComponent<ViewStackProps>` in the generated file, so `E` defaults to `HTMLElement` and the callback parameter is still `HTMLElement | null`. The error is character-for-character the one from Step 2:

```
tests/react/typed-refs.test.tsx(NN,NN): error TS2322: Type 'HTMLElement | null' is not assignable
  to type 'KaiViewStackElement | null'.
  Type 'HTMLElement' is missing the following properties from type 'KaiViewStackElement':
    push, back, replace, selectTab, navigate
```

The generator has to move for the test to go green, which is what makes the generic more than decoration. If this step goes GREEN, the test is not testing what it claims: check that you wrote the CALLBACK form and not the object form.

- [ ] **Step 7: Teach the generator to pass the element type**

In `packages/ui/scripts/gen-element-react.mjs`, after the `importLines` computation (the block ending `.join('\n');`), add:

```js
  // Every wrapper's ref is typed as ITS element interface, which this same
  // generator chain already emits into src/elements/element-types.d.ts and
  // dist/elements.d.ts. Imported by the BARE subpath, not `../../src/...`:
  // config/vite/react.ts's srcSpecifiersToDist rewrites relative src/
  // specifiers in the EMITTED declarations by probing for a `.ts`/`.tsx`
  // source, which a `.d.ts` misses, leaving a specifier pointing outside
  // dist/ that verify:dts fails on. A bare self-reference to a subpath the
  // exports map declares is what that guard accepts, and it is what a
  // consumer writes.
  const elementTypeImport = `import type {\n${elements
    .map((el) => `  ${el.className},`)
    .sort()
    .join('\n')}\n} from '@kitn.ai/ui/elements';`;
```

Then, in the per-element block, replace the emitted `createWebComponent` line:

```js
    const name = el.displayName;
    const propsName = `${name}Props`;
    const elementType = el.className;
```

```js
    return `export interface ${propsName} extends WebComponentProps {
${[...propLines, ...eventLines].join('\n')}
}

export const ${name} = /*#__PURE__*/ createWebComponent<${propsName}, ${elementType}>(
  '${el.tag}',
  ${propNames},
  ${eventMap},
  () => import('@kitn.ai/ui/elements/${moduleName}'),
);`;
```

and add the new import to the emitted preamble, immediately after the `./runtime` import line:

```js
import { createWebComponent, registerAll, type WebComponentProps } from './runtime';
${elementTypeImport}
export { registerAll };
```

- [ ] **Step 8: Regenerate, and check the diff is only what was promised**

```bash
cd "$WT/packages/ui" && npm run build:api
```

Then, from the repo root:

```bash
cd "$WT" && git status --porcelain
```

Expected: `packages/ui/frameworks/react/index.tsx` is the ONLY file modified.

`build:api` is a chain of six generators, and between them they rewrite every artifact in the table below. **None of the others should MOVE**, because no element's source doc, prop, type, slot, part, icon or catalog entry changed in this branch (ruling 4 is exactly why the `kai-resizable-item` `hidden` prose was left alone). Read the authoritative list where it lives -- `GENERATED` in `packages/ui/scripts/verify-generated-sync.mjs` -- rather than from this copy; the copy is here so you know what to look at, and `verify:generated` in Task 5 is what actually enforces it.

| Generator in the `build:api` chain | Writes |
|---|---|
| `gen-elements-manifest.mjs` | `src/elements/element-manifest.json` |
| `gen-element-api.mjs` | `src/elements/element-meta.json`, `src/elements/icon-names.json`, `dist/custom-elements.json`, and then delegates to `gen-element-types.mjs` (`src/elements/element-types.d.ts`), `gen-element-react.mjs` (`frameworks/react/index.tsx`), `gen-llms.mjs` (`llms.txt`, `llms-full.txt`) and `gen-web-components-md.mjs` (the marked blocks of `docs/web-components.md`) |
| `gen-element-nonscalar.mjs` | `src/elements/element-nonscalar.json` |
| `gen-catalog.mjs` | `mcp/catalog/derived.json` |
| `gen-construct-schema.mjs` | the construct schema artifacts |
| `gen-construct-template-fixtures.mjs` | the construct template fixtures |

**What to do with an unexpected diff, per file:**

- Appears in `git status` but `git diff` shows **no content change** (whitespace-only, or a rewrite that is byte-identical): `git checkout -- <path>` it. That is a generator rewriting a file it had no reason to change, and carrying it makes the PR's diff lie about its blast radius.
- Appears **with** a content change: **STOP and report.** Something in this branch touched a facade, a slot, a part, a catalog entry or a template, and the plan says nothing did. Do not commit it and do not reason about whether it looks harmless. This is the check that keeps the "only `index.tsx` changed" claim in the PR body true, and it is worth nothing if it is overridden the first time it fires.

**Never run `gen-llms.mjs` standalone to "fix" a diff.** `build:api` writes `llms-full.txt` from the model it parsed once; the standalone generator silently rewrites it with LESS data (every slot's `inject`/`replace` collapses to `—` across every row), and the oversized diff is the only tell.

Then check the wrapper diff itself is mechanical:

```bash
cd "$WT"
git diff --stat -- packages/ui/frameworks/react/index.tsx
git diff -- packages/ui/frameworks/react/index.tsx | grep -c '^[+-]export const '
git diff -- packages/ui/frameworks/react/index.tsx | grep '^[+-]' | grep -v '^[+-]export const ' | grep -v '^[+-][+-]' | head -40
```

Expected: the third command prints the added `import type { ... } from '@kitn.ai/ui/elements';` block and nothing else. The second prints twice the wrapper count (one removed and one added line per element) -- read the number the command prints, do not compare it to a figure written here. Every changed `export const` line differs only by the added `, Kai<Name>Element` before the closing angle bracket.

- [ ] **Step 9: Update the generated-shape pin**

`packages/ui/tests/scripts/react-wrappers.test.ts:9` asserts the exact emitted spelling and will now be red. Change it to:

```ts
    expect(src).toContain('export const Artifact = /*#__PURE__*/ createWebComponent<ArtifactProps, KaiArtifactElement>(');
```

Run it and watch it go from red to green:

```bash
cd "$WT"
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/react-wrappers.test.ts
```

Expected: PASS. Run it once BEFORE editing the literal to confirm it was really red -- a pin that did not notice a generator change is a pin worth nothing.

- [ ] **Step 10: Run both typechecks and the react suite**

```bash
cd "$WT/packages/ui" && npx tsc --noEmit -p tsconfig.react.json
cd "$WT/packages/ui" && npx tsc --noEmit -p tsconfig.react.test.json
cd "$WT/packages/ui" && npm run test:react
```

Expected: all three exit 0. The `@ts-expect-error` on `pop()` is itself an assertion: if the interface ever grows a `pop`, tsc reports "Unused '@ts-expect-error' directive" and this goes red, which is correct.

- [ ] **Step 11: Cold build, then the declaration guards**

The emitted `dist/react/index.d.ts` now carries a bare self-reference, and this is the step that proves it resolves for a consumer.

```bash
cd "$WT/packages/ui" && npm run build
```

Expected: green, including the `verify:react-wrappers` step the build ends with.

```bash
cd "$WT/packages/ui" && npm run verify:dts
cd "$WT/packages/ui" && npm run verify:dts:consumer
cd "$WT/packages/ui" && grep -n "@kitn.ai/ui/elements" dist/react/index.d.ts | head -3
```

Expected: both guards exit 0, and the grep shows `import { Kai... } from '@kitn.ai/ui/elements';` in the emitted declaration -- a bare subpath the exports map declares, which is the case `verify-dts-boundaries.mjs`'s own self-test admits. If `verify:dts` instead reports a specifier pointing outside `dist/`, the generator emitted the relative spelling; go back to Step 7.

- [ ] **Step 12: Register the coupling**

Add one row to the table in section 4 of `docs/coupling-map.md`:

```
| The `className` field of each element in `packages/ui/src/elements/element-meta.json` | `scripts/gen-element-react.mjs`, which emits one `import type { Kai<Name>Element } from '@kitn.ai/ui/elements'` and one `createWebComponent<XProps, Kai<Name>Element>` per element, and `scripts/gen-element-types.mjs`, which emits the interfaces themselves into `src/elements/element-types.d.ts` and `dist/elements.d.ts` | A renamed or removed interface breaks the generated wrapper's import, so `tsc -p tsconfig.react.json` fails by name rather than the wrapper silently degrading to `HTMLElement` refs. The BARE `@kitn.ai/ui/elements` key in `tsconfig.react.json` and `tsconfig.react.test.json` is what makes that pass see the real interfaces at all; pointed back at `tests/react/elements-stub.d.ts` the whole import resolves to nothing and every ref type quietly becomes an error rather than a silent widening. **Consumer-facing side effect, deliberate and disclosed:** the emitted `dist/react/index.d.ts` now carries that same bare import, so every consumer of `@kitn.ai/ui/react` loads `dist/elements.d.ts` (345 KB, `wc -c`) into their type program, including its `declare global HTMLElementTagNameMap`, its `declare module 'react'` `JSX.IntrinsicElements` block and its `declare module 'vue'` `GlobalComponents` block. Raw `<kai-*>` JSX is therefore type-legal by default in a React consumer's app, which is the workaround the blocks spec's section 5.2 forbids for a generated block -- so that check must stay STRUCTURAL over the emitted source and can never be relaxed to "tsc would have caught it" | `nx typecheck ui` (both React passes) and `verify:generated`, which reruns `build:api` and diffs. `verify:dts` covers the emitted half: the bare self-reference must name a subpath the exports map declares. `tests/elements/element-types-lib-check.test.ts` compiles the interface file with `skipLibCheck: false`, which is what keeps the newly-reachable `declare module 'vue'` block honest. What is covered by **NOTHING**: nobody asserts the two React tsconfigs agree with each other, so repointing one key and not the other leaves the wrappers checked and the tests not; and nothing fails if a generated block starts using raw `<kai-*>` JSX now that it type-checks |
```

- [ ] **Step 13: Commit**

```bash
cd "$WT"
git add packages/ui/frameworks/react/runtime.tsx packages/ui/frameworks/react/index.tsx \
        packages/ui/scripts/gen-element-react.mjs \
        packages/ui/tsconfig.react.json packages/ui/tsconfig.react.test.json \
        packages/ui/tests/react/elements-stub.d.ts packages/ui/tests/react/typed-refs.test.tsx \
        packages/ui/tests/scripts/react-wrappers.test.ts docs/coupling-map.md
git commit -m "$(cat <<'BODY'
fix(react): a forwarded ref is typed as the element interface

createWebComponent returned RefAttributes<HTMLElement>, so a ref gave a
bare HTMLElement and stack.push('chat') did not exist on it. Every ref
site in a real React tree needed `el as KaiViewStackElement | null`.

The interfaces already exist and already ship -- one Kai*Element per tag in
dist/elements.d.ts, methods included -- so this is the generator not using
what it generates. createWebComponent gains a second generic defaulting to
HTMLElement, and gen-element-react.mjs passes each element's className.

The interfaces come in by the BARE `@kitn.ai/ui/elements` subpath, not a
relative reach into src/: config/vite/react.ts rewrites relative src/
specifiers in the emitted declarations by probing for a .ts source, which a
.d.ts misses, and the leftover specifier is exactly what verify:dts fails
on. Both React tsconfigs point that bare key at the real interfaces; the
per-element wildcard keeps the side-effect stub.

Regenerated wrappers included: they are this change's output.

Found by the blocks contract spike (F-9).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
BODY
)"
```

---

## Task 4: F-10 -- `@kitn.ai/ui/stores` exports `ConversationSummary`

**Files:**
- Modify: `packages/ui/src/stores/index.ts` (append one re-export)
- Test: `packages/ui/src/stores/index.test.ts` (append one case)
- Read only: `packages/ui/src/types.ts:30` (where the interface is declared), `packages/ui/src/index.ts:25` (the only entry re-exporting it today)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `import type { ConversationSummary } from '@kitn.ai/ui/stores'` resolves. The interface itself is unchanged: `{ id: string; title: string; groupId?: string; scope?: ConversationScope; messageCount: number; lastMessageAt?: string; updatedAt: string; ... }`, declared at `packages/ui/src/types.ts:30`. `ConversationScope` is NOT re-exported here: nothing in the spike needed it, and it stays reachable from the root entry.

### Why it matters

`ConversationSummary` is what `ConversationStore.list()` returns and what `createConversationController`'s `onSummariesChange` hands you -- both of which the `stores` entry exports. It shipped only through the package root, whose bundle bare-imports `solid-js`, so a framework-neutral controller consuming this entry had to reach into the heavy root entry for a type its own dependency already gives it. The spike's controller carries the comment recording exactly that (report lines 650-652).

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('@kitn.ai/ui/stores entry', ...)` block in `packages/ui/src/stores/index.test.ts`, and add the type import at the top of the file next to the existing `import * as stores from './index';`:

```ts
import type { ConversationSummary } from './index';
```

```ts
  it('exports the ConversationSummary type its own controller hands back', () => {
    // A TYPE assertion, so the red lives in `tsc --noEmit`, not in vitest:
    // vitest strips types without checking them and this body would pass
    // against a missing export. `ConversationSummary` is what list() returns
    // and what onSummariesChange is called with, and it shipped only through
    // the root entry -- whose bundle bare-imports solid-js -- so a controller on
    // this entry had to import @kitn.ai/ui for a type its own dependency
    // already hands it (blocks contract spike, F-10).
    const summary: ConversationSummary = {
      id: 'c1',
      title: 'Hello',
      messageCount: 1,
      updatedAt: '2026-09-02T00:00:00Z',
    };
    expect(summary.id).toBe('c1');
  });
```

- [ ] **Step 2: Watch the typecheck fail**

```bash
cd "$WT/packages/ui" && npx tsc --noEmit
```

Expected: FAIL with

```
src/stores/index.test.ts(NN,NN): error TS2305: Module '"./index"' has no exported member 'ConversationSummary'.
```

This is the bare `tsc --noEmit` pass, whose `include` is `src/**/*.ts` -- it covers this test file. **Watch this red before writing the export.** Note explicitly in your report that `vitest run --project=unit src/stores/index.test.ts` is GREEN at this point, because types are stripped, so the runner is not the gate for this fix.

- [ ] **Step 3: Add the re-export**

Append to `packages/ui/src/stores/index.ts`:

```ts
// The type `ConversationStore.list()` returns and `onSummariesChange` hands
// you. It shipped only through the package ROOT, whose bundle bare-imports
// solid-js, so a framework-neutral controller consuming this self-contained
// entry had to import @kitn.ai/ui for a type its own dependency already gives
// it (blocks contract spike, F-10). Type-only, so dist/stores.js is byte-equal
// and the entry stays solid-free.
export type { ConversationSummary } from '../types';
```

- [ ] **Step 4: Watch the typecheck pass**

```bash
cd "$WT/packages/ui" && npx tsc --noEmit
```

Expected: exit 0, nothing printed.

- [ ] **Step 5: Run the entry's suite**

```bash
cd "$WT"
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/stores/index.test.ts
```

Expected: PASS, including the existing "cannot drift from the root export" case, which walks every VALUE `conversation-store` exports -- unaffected by a type-only addition, and worth seeing green so the drift check is known not to have been disturbed.

- [ ] **Step 6: Rebuild and check the shipped declaration carries the name**

```bash
cd "$WT/packages/ui" && npm run build
cd "$WT/packages/ui" && grep -n "ConversationSummary" dist/stores/index.d.ts
cd "$WT/packages/ui" && npm run verify:dts
cd "$WT/packages/ui" && npm run verify:dts:consumer
cd "$WT/packages/ui" && npm run verify:cdn-entries
```

Expected: the grep prints `export type { ConversationSummary } from '../types';` (or the emitter's equivalent naming `dist/types`), and all three guards exit 0. `verify:dts` is the one that matters here: the emitted declaration reaches `../types` across a relative specifier, exactly the resolution path that guard exists to exercise, and `dist/types.d.ts` is where it must land. `verify:cdn-entries` confirms the entry is still free of bare runtime imports, which a type-only export cannot break but is cheap to prove.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add packages/ui/src/stores/index.ts packages/ui/src/stores/index.test.ts
git commit -m "$(cat <<'BODY'
fix(stores): re-export ConversationSummary from @kitn.ai/ui/stores

It is the type ConversationStore.list() returns and the one
onSummariesChange hands you, and both of those ship on this entry -- but
the type itself shipped only through the package root, whose bundle
bare-imports solid-js. A framework-neutral controller consuming the
self-contained stores entry therefore had to import @kitn.ai/ui for a
type its own dependency already gives it.

Type-only, so dist/stores.js is unchanged and the entry stays solid-free.

Found by the blocks contract spike (F-10).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
BODY
)"
```

---

## Task 5: the gate, the proof against the packed tarball, and the PR

**Files:**
- Create, in the SCRATCHPAD only, never committed: a throwaway Vite React app recreated from the spike report's appendix
- No source files change in this task. If a gate goes red, the fix belongs in the task that owns the file, as its own commit.

**Interfaces:**
- Consumes: all four fixes.
- Produces: a PR on `fix/blocks-pr-b0-kit-fixes`. **This task does not merge.**

### Step group A: the local gate

- [ ] **Step 1: Cold build from a clean tree**

```bash
cd "$WT" && git status --porcelain
cd "$WT/packages/ui" && npm run build
```

Expected: `git status` clean apart from untracked files that were there before the branch; the build green. **Not `nx build ui`** -- the NX cache can restore a build whose generators write into the source tree, printing success while changing nothing.

- [ ] **Step 2: The typecheck chain and the three suites**

Each as its own command. Never `&&`-chained through `tail`.

<!-- gate-list: partial -- this task's local pre-push subset, not the merge gate; the merge gate is the required `test` job graph printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

```bash
cd "$WT/packages/ui" && npm run typecheck
cd "$WT/packages/ui" && npm run test:react
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=unit
cd "$WT" && pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
```

Expected: all four exit 0. `npm run typecheck` inside the package is the green worth trusting -- it runs `verify:quarantine` first and then six tsc passes, and it is not NX-cached. A green `--project=unit` alone is not the merge gate; the `emitted` project runs as a separate step in the same required CI job.

- [ ] **Step 3: The verify and lint gates**

<!-- gate-list: partial -- the gates this change can plausibly move, not the merge gate; the merge gate is the required `test` job graph printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` -->

```bash
cd "$WT/packages/ui" && npm run verify:generated
cd "$WT/packages/ui" && npm run verify:dts
cd "$WT/packages/ui" && npm run verify:dts:consumer
cd "$WT/packages/ui" && npm run verify:consumer
cd "$WT/packages/ui" && npm run verify:scaffold
cd "$WT/packages/ui" && npm run verify:blocks
cd "$WT/packages/ui" && npm run verify:construct
cd "$WT/packages/ui" && npm run verify:solid-coverage
cd "$WT/packages/ui" && npm run verify:ssr
cd "$WT/packages/ui" && npm run verify:artifact-glob
cd "$WT/packages/ui" && npm run verify:pack
cd "$WT/packages/ui" && npm run lint:silent-drops
cd "$WT/packages/ui" && npm run lint:cdn-pins
cd "$WT/packages/ui" && npm run build-storybook
cd "$WT" && pnpm --filter @kitn.ai/blocks run typecheck
cd "$WT" && pnpm --filter @kitn.ai/blocks exec vitest run
cd "$WT" && pnpm --filter @kitn.ai/docs run verify:docs
```

Expected: every one exits 0.

**`verify:artifact-glob` and `verify:pack` are a three-step shape in CI -- snapshot, build, verify -- so a bare invocation here can read differently than the job does.** Run them immediately after the Step 1 cold build, against the artifacts that build produced, and if either complains about a missing snapshot, do the snapshot step the script names rather than skipping it. They are in this list because Task 3 changes what the react build emits and Task 4 changes a shipped declaration, which is exactly what they measure.

**`test:storybook:ci` is NOT in this list, and that is a decision, not an omission.** `build-storybook` COMPILES the stories and runs none of them; the story TESTS live in the `storybook` vitest project, which `npm run test:storybook:ci` drives through `scripts/run-storybook-tests.mjs`. It is deferred to the PR run for one reason: it is the sharded, browser-backed leg that CLAUDE.md records as flaky, and running it once locally proves less than the CI shards do. `build-storybook` still earns its place -- it is the only thing here that compiles the `View`/`ViewStack` stories at all, and Task 2 changes what those elements see. If the PR's storybook leg goes red, that is a real finding about Task 2, not flake, until a rerun says otherwise.

Notes on what each is here for, so a red is diagnosed rather than retried:
- `verify:generated` reruns the real `build:api` and diffs. It is the gate that catches Task 3 having regenerated `frameworks/react/index.tsx` from a generator the tree no longer matches, and it is the reason Task 3's regeneration is part of that commit rather than a separate step.
- `verify:dts` and `verify:dts:consumer` cover Task 3's new bare self-reference and Task 4's new relative reach into `dist/types`.
- `verify:scaffold` **prints the axes and cell counts it actually ran** -- read those from the output, never a figure copied from any doc. Task 2 changes an element the scaffolder can emit, so a change in what it compiles is a finding.
- `verify:blocks` drives every block against its committed baseline in a real browser. `support-widget` is a block and Task 2 changes what `kai-view-stack` sees, so if a baseline moves here that is real behaviour change, not noise -- read it before regenerating anything.
- `build-storybook` is the only thing here that compiles the stories, and `View`/`ViewStack` have stories. It runs none of them; see the note above about `test:storybook:ci`.
- `@kitn.ai/blocks`'s typecheck and suite are direct downstream of Task 2: `support-widget`'s authored page is a `kai-view-stack` with `kai-view` children, and the blocks package is where those sources now live after PR A.
- `verify:construct` drives the real eject -> install -> tsc -> build -> consumer-bundle chain, which is the only gate here that compiles emitted consumer code against the newly-changed react wrappers end to end.
- `verify:docs` compiles every docs snippet against the shipped API. Task 3 changes what `@kitn.ai/ui/react` exports types for, and the docs are full of react snippets.

- [ ] **Step 4: The doc linters, over this plan file included**

```bash
cd "$WT" && node packages/ui/scripts/lint-gate-parity.mjs
cd "$WT" && node packages/ui/scripts/lint-threshold-derivation.mjs
```

Expected: both exit 0. They scan `docs/superpowers/**`, which includes this plan. If one flags a fenced block here, add `<!-- gate-list: partial -- <reason> -->` above that block rather than editing the commands inside it.

- [ ] **Step 5: Prove no scratchpad path leaked into the tree**

```bash
cd "$WT" && git diff origin/main --name-only
cd "$WT" && if git grep -nE '/(private/)?tmp/claude-|/var/folders/' -- $(git diff origin/main --name-only); then echo "SCRATCHPAD PATH LEAKED"; exit 1; else echo "clean"; fi
```

Expected: `clean`. Written as an `if`, not `... || echo clean`: `git grep` exits 1 for "no match" but also non-zero for a bad invocation (128 for an unknown pathspec), and the `||` form prints `clean` for both, so a broken command reads as a pass. An absolute scratchpad path has been committed before in this repo; this is the grep that stops it, and it has to be a grep that can fail.

### Step group B: the proof -- the spike's react tree, against the packed tarball, without the workarounds

This is the step the whole PR exists for. Everything above proves the tree is consistent; this proves a stranger installing the package gets the fix. The tree is not the tarball.

- [ ] **Step 6: Pack, and stand up the throwaway app**

`$SCRATCH` is the absolute scratchpad path passed at dispatch. Nothing under it is ever committed.

```bash
export SCRATCH="<the scratchpad path passed at dispatch>"
mkdir -p "$SCRATCH/b0-proof" "$SCRATCH/b0-branch-pack" "$SCRATCH/b0-main-pack"
cd "$WT/packages/ui" && npm pack --ignore-scripts --pack-destination "$SCRATCH/b0-branch-pack"
ls "$SCRATCH/b0-branch-pack"
export BRANCH_TGZ="$(ls "$SCRATCH/b0-branch-pack"/kitn.ai-ui-*.tgz)"
echo "$BRANCH_TGZ"
```

Expected: one `kitn.ai-ui-<version>.tgz`, and `$BRANCH_TGZ` names it. Read the version from the filename; do not type one.

**The branch tarball and `main`'s tarball go in SEPARATE directories, and this is not tidiness.** Both are cut from the same package version -- release-please has not bumped anything yet -- so both files are named `kitn.ai-ui-<same version>.tgz`. Packed into one directory the second silently overwrites the first, and Step 11's before/after contrast would then be comparing `main` against `main` and reporting it as the fix working.

```bash
cd "$SCRATCH/b0-proof" && npm create vite@latest app -- --template react-ts
cd "$SCRATCH/b0-proof/app" && npm install
cd "$SCRATCH/b0-proof/app" && npm install "$BRANCH_TGZ"
cd "$SCRATCH/b0-proof/app" && npm install -D @playwright/test
cd "$SCRATCH/b0-proof/app" && npx playwright install chromium
```

- [ ] **Step 7: Recreate the spike's react tree from the report's appendices**

The spike's `spike/` directory was discarded by design; the report is the archive. Copy the listings verbatim out of `docs/superpowers/research/2026-09-02-blocks-contract-spike.md`:

| Report appendix | Copy to |
|---|---|
| A2, "The framework-neutral controller" | `$SCRATCH/b0-proof/app/src/support-widget.controller.ts` |
| A3, "React -- the component" | `$SCRATCH/b0-proof/app/src/SupportWidget.tsx` |
| A4, "React -- the adapter" | `$SCRATCH/b0-proof/app/src/useSupportChat.ts` |

and take the two unchanged authored files straight from the repo, which is where they still live:

```bash
cp "$WT"/packages/blocks/blocks/support-widget/mock.js "$SCRATCH/b0-proof/app/src/mock.ts"
cp "$WT"/packages/blocks/blocks/support-widget/support-widget.css "$SCRATCH/b0-proof/app/src/support-widget.css"
```

**Exactly ONE import specifier changes**, and it is worth being precise because guessing at more of them is how a transcription error gets attributed to the kit. Checked against the report:

- `useSupportChat.ts` (appendix A4, report line 1106) imports `'../support-widget/support-widget.controller'`. That is the only path that assumes the spike's two-directory layout. In a flat `src/` it becomes `'./support-widget.controller'`.
- The controller (A2, report line 653) already imports `'./mock'`, extensionless -- the report's listing is the `.ts` conversion, not the authored `.js`. Leave it.
- `SupportWidget.tsx` (A3) imports `'./useSupportChat'` and `'./support-widget.css'`, both already flat. It does NOT import the controller. Leave both.

Nothing else about the listings changes.

Then wire it as the app's only screen:

```tsx
// $SCRATCH/b0-proof/app/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SupportWidget } from './SupportWidget';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SupportWidget />
  </StrictMode>,
);
```

- [ ] **Step 8: Remove the spike's two workarounds -- this is the assertion**

Three edits, each deleting something the spike needed and this PR exists to make unnecessary:

1. In `SupportWidget.tsx`, both ref callbacks lose their cast:

```tsx
      ref={(el) => {
        refs.current.dock = el;
      }}
```

```tsx
        ref={(el) => {
          refs.current.stack = el;
        }}
```

   (F-9. If `createWebComponent` still returned `RefAttributes<HTMLElement>` these are TS2322.)

2. In `SupportWidget.tsx`, the `slot=` and `hidden=` props are **left exactly as the appendix has them**, bare and unsuppressed. There is no `@ts-expect-error` to delete: appendix A3 carries none, because the spike patched its INSTALLED copy of the tarball (report section 3, Patch A) rather than annotating the tree. So this is not an edit at all -- it is the absence of one, and the assertion lives in the contrast: those same bare props are `TS2322: Property 'slot' does not exist ...` against `main`'s tarball in Step 11, and compile clean against the branch's in Step 9. If `noUnusedLocals` now flags the `import type { KaiDockElement, KaiViewStackElement }` at report line 947, that is edit 1 having removed its last use; delete the unused name, and record which. (F-8.)

3. In `support-widget.controller.ts`, fold the reach into the root entry back into the stores import and delete the GAP comment above it:

```ts
import { localStorageStore, createConversationController, isConversationUnread } from '@kitn.ai/ui/stores';
import type { ConversationSummary } from '@kitn.ai/ui/stores';
```

   (F-10.)

- [ ] **Step 9: Compile it, strictly, against the INSTALLED package**

```bash
cat > "$SCRATCH/b0-proof/app/tsconfig.proof.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
JSON
cd "$SCRATCH/b0-proof/app" && npx tsc --noEmit -p tsconfig.proof.json
```

Expected: exit 0, nothing printed. **This one command is F-8's first two holes and F-9 and F-10, all four proven against the tarball rather than the tree.** `skipLibCheck: true` is deliberate: it is what a stock Vite template ships, so this is what a consumer's `npm run build` actually does.

A clean `tsc` proves the tree compiles; it does not prove the workarounds are gone, because a surviving cast or suppression compiles beautifully. Assert their absence directly:

```bash
cd "$SCRATCH/b0-proof/app" && if grep -rnE '@ts-expect-error|@ts-ignore|as Kai[A-Za-z]+Element|as unknown as' src/; then echo "WORKAROUND SURVIVED"; exit 1; else echo "no workarounds"; fi
```

Expected: `no workarounds`. Both halves are needed and neither substitutes for the other: the grep without `tsc` would pass on a tree that does not compile, and `tsc` without the grep would pass on a tree that still carries every cast the spike needed.

To prove the check is not vacuous, put ONE cast back and watch it go red:

```bash
cd "$SCRATCH/b0-proof/app" && cp src/SupportWidget.tsx src/SupportWidget.tsx.bak
cd "$SCRATCH/b0-proof/app" && sed -i '' -E 's/refs\.current\.stack = el;/refs.current.stack = el as unknown as never;/' src/SupportWidget.tsx
cd "$SCRATCH/b0-proof/app" && npx tsc --noEmit -p tsconfig.proof.json; echo "exit=$?"
cd "$SCRATCH/b0-proof/app" && mv src/SupportWidget.tsx.bak src/SupportWidget.tsx
cd "$SCRATCH/b0-proof/app" && npx tsc --noEmit -p tsconfig.proof.json; echo "restored exit=$?"
```

Expected: a non-zero exit naming `src/SupportWidget.tsx`, then `restored exit=0`.

The restore is a `cp`/`mv` pair, not `git checkout`: **the scratch Vite app is not a git repository**, so `git checkout src/SupportWidget.tsx` fails, `|| true` swallows the failure, and every step after this one would run against a deliberately-broken file -- turning the vacuity probe into the thing that poisons Steps 10 and 11. The second `tsc` run is there so the restore is verified rather than assumed.

- [ ] **Step 10: Run it, and drive the two behaviours only a browser finds**

F-8's third hole and F-6's loop both type-check perfectly. The compile above says nothing about either.

```bash
cat > "$SCRATCH/b0-proof/app/drive.spec.ts" <<'TS'
import { test, expect } from '@playwright/test';

// The two runtime facts the spike measured. Neither is visible to tsc.
test('the widget navigates, and clears its suggestions after the first turn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  const dock = page.locator('kai-dock');
  await expect(dock).toBeAttached();

  // Open, then drill into the chat view. F-5: with an attribute-only read the
  // stack matched nothing, every view rendered at once, and `view` stayed ''.
  await page.locator('kai-dock button').first().click();
  await page.locator('kai-view-stack').evaluate((el: any) => el.push('chat'));
  await expect
    .poll(() => page.locator('kai-view-stack').evaluate((el: any) => ({
      view: el.view,
      drilled: !!el.drilled,
    })))
    .toEqual({ view: 'chat', drilled: true });

  // Send one turn. F-8 third hole: the block sets suggestions = undefined once
  // the thread is non-empty; the react form kept showing them forever.
  const before = await page.locator('kai-prompt-input').evaluate((el: any) => el.suggestions);
  expect(Array.isArray(before)).toBe(true);
  expect((before as unknown[]).length).toBeGreaterThan(0);

  await page.locator('kai-prompt-input [data-kai-composer-editable]').fill("Where's my order?");
  await page.locator('kai-prompt-input [data-kai-composer-editable]').press('Enter');

  await expect
    .poll(() => page.locator('kai-thread').evaluate((el: any) => (el.messages ?? []).length))
    .toBe(2);
  await expect
    .poll(() => page.locator('kai-prompt-input').evaluate((el: any) => el.suggestions))
    .toBe(undefined);

  // BYSTANDER ASSERTION, not a fix this PR ships. F-6 (a literal seed on a
  // self-managed prop is a controlled-component trap in React, because the
  // wrapper re-applies every prop after every render) is CONTRACT work and is
  // out of scope here; the tree simply drops the redundant `view` seed, which
  // is behaviour-identical. This line pins that the navigation is still where
  // we left it a tick later, so a future round that reintroduces the seed sees
  // it break. If it fails, the finding is about the tree, not about the four
  // fixes.
  await expect(page.locator('kai-view-stack')).toHaveJSProperty('view', 'chat');

  // Back out to the tab root.
  await page.locator('kai-view-stack').evaluate((el: any) => el.back());
  await expect
    .poll(() => page.locator('kai-view-stack').evaluate((el: any) => ({
      view: el.view,
      drilled: !!el.drilled,
    })))
    .toEqual({ view: 'home', drilled: false });

  expect(errors).toEqual([]);
});
TS
cat > "$SCRATCH/b0-proof/app/playwright.config.ts" <<'TS'
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'drive.spec.ts',
  use: { baseURL: 'http://localhost:5178' },
  webServer: { command: 'npm run dev -- --port 5178', port: 5178, reuseExistingServer: false },
});
TS
cd "$SCRATCH/b0-proof/app" && npx playwright test
```

Expected: PASS, and no page errors, which is what the spike's own runtime table reports for both frameworks.

Three of the four hard assertions are this PR's: `view`/`drilled` after `push` and after `back` are F-5 (an attribute-only read left `view` as `''` and rendered every view stacked), and `suggestions` becoming `undefined` is F-8's third hole. The `toHaveJSProperty('view', 'chat')` line is labelled a bystander in the spec itself.

If a selector does not match, read the authored markup at `$WT/packages/blocks/blocks/support-widget/support-widget.html` and the report's appendix A1 and adjust the LOCATOR, never the assertion. The four assertions -- `view`/`drilled` after `push`, two messages after one turn, `suggestions` becoming `undefined`, `view`/`drilled` after `back` -- are the spike's measured evidence and must not be weakened.

- [ ] **Step 11: Record the before/after honestly**

Re-run Step 9 and Step 10 against `main`'s tarball, so the PR carries a measured contrast rather than a claim:

```bash
cd "$WT" && git worktree add "$SCRATCH/b0-main" origin/main
cd "$SCRATCH/b0-main" && pnpm install
cd "$SCRATCH/b0-main/packages/ui" && npm run build:css
cd "$SCRATCH/b0-main/packages/ui" && npm run build
cd "$SCRATCH/b0-main/packages/ui" && npm pack --ignore-scripts --pack-destination "$SCRATCH/b0-main-pack"
export MAIN_TGZ="$(ls "$SCRATCH/b0-main-pack"/kitn.ai-ui-*.tgz)"
echo "branch=$BRANCH_TGZ"
echo "main=$MAIN_TGZ"
test "$BRANCH_TGZ" != "$MAIN_TGZ" || { echo "SAME FILE -- the contrast would be main vs main"; exit 1; }
cd "$SCRATCH/b0-proof/app" && npm install "$MAIN_TGZ"
cd "$SCRATCH/b0-proof/app" && npx tsc --noEmit -p tsconfig.proof.json; echo "exit=$?"
```

The two `echo`s and the `test` are the guard: both tarballs carry the SAME version in their filename, so packing them into one directory would have left `$BRANCH_TGZ` overwritten by `main`'s and the whole contrast comparing `main` to itself -- passing, and meaning nothing. Separate directories, explicit paths, and an assertion that they really are two files.

Expected on `main`: FAIL, and specifically these four classes, no more and no fewer:

```
src/SupportWidget.tsx(NN,NN): error TS2322: ... Property 'slot' does not exist on type
  'IntrinsicAttributes & PanelProps & RefAttributes<HTMLElement>'.
src/SupportWidget.tsx(NN,NN): error TS2322: ... Property 'hidden' does not exist on type
  'IntrinsicAttributes & RowProps & RefAttributes<HTMLElement>'.
src/SupportWidget.tsx(NN,NN): error TS2322: Type 'HTMLElement | null' is not assignable to type
  'KaiViewStackElement | null'. ... missing ... push, back, replace, selectTab, navigate
src/support-widget.controller.ts(NN,NN): error TS2305: Module '"@kitn.ai/ui/stores"' has no
  exported member 'ConversationSummary'.
```

**A FIFTH error class is a transcription bug in Step 7, not a finding about the kit.** That is what this step is really for: it is the only thing standing between a mistyped appendix and a false claim in the PR body. Read the errors before believing them.

Then restore the branch and re-verify green before writing anything:

```bash
cd "$SCRATCH/b0-proof/app" && npm install "$BRANCH_TGZ"
cd "$SCRATCH/b0-proof/app" && npx tsc --noEmit -p tsconfig.proof.json; echo "exit=$?"
cd "$SCRATCH/b0-proof/app" && npx playwright test
cd "$WT" && git worktree remove "$SCRATCH/b0-main" --force
```

Expected: `exit=0` and the Playwright spec passing again.

- [ ] **Step 12: Clean up the scratch directory**

```bash
rm -rf "$SCRATCH/b0-proof" "$SCRATCH/b0-branch-pack" "$SCRATCH/b0-main-pack" "$SCRATCH/b0-main"
cd "$WT" && git worktree prune
cd "$WT" && git status --porcelain
```

Expected: the scratch directory is gone and the tree is clean.

### Step group C: the PR

- [ ] **Step 13: Push and open the PR**

```bash
cd "$WT" && git push -u origin fix/blocks-pr-b0-kit-fixes
cd "$WT" && gh pr create \
  --title "fix: the four kit gaps the blocks contract spike found (F-5, F-8, F-9, F-10)" \
  --body "$(cat <<'BODY'
PR B0 of the blocks spec (`docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md`,
section 8b and section 7). Four kit defects the contract spike
(`docs/superpowers/research/2026-09-02-blocks-contract-spike.md`) found by
converting a real block by hand and RUNNING both framework forms. Each is a bug
in its own right; together they are what PR B would otherwise spend its budget
rediscovering, and two of them mean the react form of `support-widget` does not
compile or does not render until they land.

No blocks change, no renderer, no contract change. Patch release.

## The four

**F-8 -- `fix(react)`: wrappers forward `slot` and `hidden`, and `undefined` clears.**
`WebComponentProps` declared neither, so `<Panel slot="panel">` was a type error
and the block needs `slot` seven times. The obvious workaround, dropping to
intrinsic `<kai-*>` JSX, is what the spec's own structural check forbids, so one
of the two had to move. Separately, `applyProps` guarded with
`p[name] !== undefined`, so a prop re-rendered as `undefined` was skipped rather
than cleared: the block drops its conversation starters after the first turn and
the react form went on showing them forever. Invisible to tsc and to every
compile cell. A key ABSENT from props is still left alone; both halves are
tested.

**F-5 -- `fix(elements)`: `readViewEntry` reads the property before the attribute.**
`kai-view-stack` discovered its views from its children's ATTRIBUTES, and a
component framework sets a declared prop as a DOM PROPERTY and never writes the
attribute. Every `kai-view` in the react form resolved to `{ name: '', tabRoot: false }`,
so nothing matched, nothing was hidden, and the widget rendered home, the
conversation list and the chat thread stacked on top of each other. Vue broke on
the same read intermittently, its trigger being whether the element had upgraded
yet. Both fields move, not just `name`: `<View name="home" tabRoot>` is a JSX
boolean, which writes no `tab-root` attribute, so an attribute-only read makes
every view a drill view. Same order, helper for helper, as `readTabBarItemValue`
and `isTabBarItemDisabled`, which already got this right. The spike's blunt
alternative -- mirroring every scalar prop to an attribute -- is deliberately NOT
taken; it has blast radius across every element.

**F-9 -- `fix(react)`: a forwarded ref is typed as the element interface.**
`createWebComponent` returned `RefAttributes<HTMLElement>`, so `stack.push('chat')`
did not exist and every ref site needed `el as KaiViewStackElement | null`. The
interfaces already exist and already ship. A second generic, defaulting to
`HTMLElement`, plus the generator passing each element's `className`. The
regenerated wrappers are this change's output, not a separate step.

**F-10 -- `fix(stores)`: re-export `ConversationSummary` from `@kitn.ai/ui/stores`.**
It is what `list()` returns and what `onSummariesChange` hands you, and it
shipped only through the package root, whose bundle bare-imports `solid-js`.

## The proof

The spike's own react tree, recreated from the report's appendices A2/A3/A4,
installed the PACKED tarball into a throwaway Vite app, and run:

- `tsc --strict --noUnusedLocals` compiles it clean with BOTH spike workarounds
  removed -- no `@ts-expect-error` on `slot`, no cast on either ref, and
  `ConversationSummary` imported from `@kitn.ai/ui/stores`. Against `main`'s
  tarball the same tree fails with the TS2322s the report quotes verbatim.
- Playwright drives it in Chromium: `push('chat')` reaches
  `{ view: 'chat', drilled: true }`, one turn produces two messages, the prompt
  input's `suggestions` becomes `undefined`, `back()` returns to
  `{ view: 'home', drilled: false }`, and the page logs no errors. Those are the
  spike's measured numbers, re-measured here.

## Deliberately not in this PR

- Everything the spike recommends to the CONTRACT (F-1 list binding, F-2
  `.textContent`, F-3 identifiers-not-expressions, F-4 native events, F-6 the
  seed marker, F-7 the registration + `whenDefined` emission, F-10's `="false"`
  translation, Amendment 1). Those are renderer and spec work: PR B.
- Making `vue-tsc` a CI cell (spike Q3). PR B2's verification.
- The `hidden` prose on `kai-resizable-item`, which now understates what React
  can do ("a JSX boolean sets neither the `hidden` attribute nor the IDL
  property"). It lives in three places -- `src/elements/resizable.tsx:634`
  (source; there is no `resizable-item.tsx`), the generated copy at
  `src/elements/element-meta.json:7633` and everything `build:api` derives from
  it, and a hand-written restatement in
  `src/elements/labs-resizable-collapsed.stories.tsx:66`. Correcting one
  sentence is a six-artifact regeneration plus a hand edit, which would have
  destroyed this PR's ability to assert that the ONLY regeneration diff is the
  wrapper generic. Follow-up.
- **The wider F-5 class.** `readViewEntry` is not the only attribute-only
  declarative-child reader in the kit; the same shape sits at
  `src/components/conversation-list.tsx:90-92`, `chain-of-thought.tsx:54-56`,
  `composer.tsx:25-28`, `model-switcher.tsx:44-48`, `message.tsx:242-245`,
  `prompt-input.tsx:129-132`, `prompt-suggestions.tsx:42-43` and
  `message-skills.tsx:26`. Each breaks the first time a framework-authored
  block uses that element, and each should earn its fix with its own evidence
  rather than a sweep. PR B follow-up; this PR fixes the one the spike actually
  broke.

## Notes for the reviewer

- The generated `frameworks/react/index.tsx` diff is mechanical: one added
  `import type { ... } from '@kitn.ai/ui/elements'` block, and one added
  `, Kai<Name>Element` per wrapper. Nothing else under `build:api`'s outputs
  moved.
- The element interfaces come in by the BARE subpath, not `../../src/...`:
  `config/vite/react.ts`'s `srcSpecifiersToDist` rewrites relative `src/`
  specifiers in the EMITTED declarations by probing for a `.ts`/`.tsx` source,
  which a `.d.ts` misses, leaving a specifier pointing outside `dist/` that
  `verify:dts` fails on. Both React tsconfigs point the bare key at the real
  interfaces; the per-element wildcard keeps the side-effect stub. The reason
  the stub gave for covering the bare key was measured stale.
- **New consumer-facing consequence, deliberate and disclosed.** The emitted
  `dist/react/index.d.ts` now imports `@kitn.ai/ui/elements`, so every consumer
  of `@kitn.ai/ui/react` loads `dist/elements.d.ts` (345 KB, `wc -c`) into
  their TYPE program -- runtime bytes are unchanged, the import is erased.
  That file carries `declare global { HTMLElementTagNameMap }`, a
  `declare module 'react'` `JSX.IntrinsicElements` block and a
  `declare module 'vue'` `GlobalComponents` block, so **raw `<kai-*>` JSX
  becomes type-legal by default in a React consumer's app** -- which is exactly
  the workaround the blocks spec's section 5.2 forbids for a generated block.
  Consequence: that check must stay STRUCTURAL over emitted source and can
  never be relaxed into "tsc would have caught it". The vue block is already
  exercised with `skipLibCheck: false` by
  `tests/elements/element-types-lib-check.test.ts`. Not fixed here: the
  alternative is a second slim copy of interfaces a generator already emits,
  which is the failure mode `docs/coupling-map.md` section 4 exists to shame.
- One coupling-map row added (section 4), carrying the above, whose enforced
  column names what is covered by NOTHING: nobody asserts the two React
  tsconfigs agree with each other, and nothing fails if a generated block
  starts using raw `<kai-*>` JSX now that it type-checks.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
BODY
)"
```

- [ ] **Step 14: Before merge (a separate decision, not this task's)**

```bash
cd "$WT" && gh pr update-branch
cd "$WT" && gh pr checks --watch
```

Expected: the branch is current with `main` and the required `test` check concludes success. A green local run is not the merge gate. **This task stops here. Do not merge.**

---

## Self-review

**Spec coverage.** Section 8b's table has four rows and each has a task: F-8 is Task 1, F-5 is Task 2, F-9 is Task 3, F-10 is Task 4. Section 8b's closing sentence -- "F-8's third hole and F-6's loop are the two the runtime cell exists for: both type-check perfectly, and only running the block finds them" -- is Task 5 Step 10, which asserts both by name and says so. Section 7's PR B0 paragraph makes three claims this plan honours: the fixes touch `src/elements/`, `frameworks/react/` and `gen-element-react.mjs` rather than anything PR A moved (the file-structure table shows exactly that, plus two tsconfigs and a coupling-map row, both consequences of the F-9 fix); each is a defect worth fixing with no blocks round at all (each task's commit message argues the defect on its own terms); and "regenerating the react wrappers is part of this PR, the generated wrapper files are its output, not a separate step" (Task 3 Step 8, inside Task 3's commit). The spike's section 4 recommendation table is the same four rows and adds nothing this plan omits; everything else in section 4 is addressed to the contract or to verification and is listed OUT of scope by name.

**Placeholder scan.** No TBD, no "add appropriate error handling", no "similar to Task N". Every code step carries literal replacement text. Four things are deliberately left to the run, and each names the command that prints it: the packed tarball's version (read from the `npm pack` filename), `verify:scaffold`'s axes and cell counts, the wrapper-line count in Task 3 Step 8's `grep -c`, and the exact line/column numbers in the expected tsc errors, written `(NN,NN)` because a line number typed into a plan is stale the moment a test file grows. The two tsc error TEXTS are quoted exactly, because those are the identity of the failure and were reproduced on `main` before this plan was written.

**Review round applied (independent reviewer, 2026-09-02).** Three blockers and eleven should-fixes, all applied in place. The two that changed what this plan ASSERTS rather than how it says it:

- **Task 3's F-9 test could not go red as first written.** `useRef<KaiViewStackElement>(null)` gives `RefObject<KaiViewStackElement | null>`, whose `current` is a mutable property and therefore checked covariantly, so it is assignable to `Ref<HTMLElement>` and compiles clean against the broken wrapper. I had measured the fixed side and not the broken side, which is the exact mistake this repo's memory calls a check that cannot fail. The red only exists in the ref-CALLBACK form -- the one the spike's tree actually uses -- where the element flows into a parameter and variance runs the other way. The callback form is now the primary test with its error text quoted verbatim, the object form is kept and LABELLED as compiling either way, and Step 6 says a green there means the test is wrong.
- **Task 5's before/after packed both tarballs into one directory under the same filename**, so `main`'s would have overwritten the branch's and the contrast would have compared `main` to itself and passed. Separate directories, explicit `$BRANCH_TGZ` / `$MAIN_TGZ`, and an assertion that they are two files.

One reviewer line ref is recorded differently here after checking: the `verify-dts-boundaries.mjs` self-test case "a self-reference to a DECLARED subpath is clean" is the object at **:389-395** (its `name:` line is `:390`), not `:391-396`.

**Type consistency.** `createWebComponent<P extends WebComponentProps, E extends HTMLElement = HTMLElement>` is declared in Task 3's Interfaces block, written out in Task 3 Step 5, and consumed by the generator in Step 7 as `createWebComponent<${propsName}, ${elementType}>` where `elementType = el.className`; the pinned literal in Step 9 spells the same thing for `Artifact`. `WebComponentProps` gains `slot?: string` / `hidden?: boolean` in Task 1 and is referenced under those exact names in Task 3's test and in Task 5 Step 8. `readViewEntry(el: Element): ViewEntry` keeps its signature across Task 2; `ViewEntry` is not redefined anywhere. `ConversationSummary` is spelled identically in Task 4's export, its test, and Task 5 Step 8's controller edit.

**Known risks, stated rather than hidden.**

0. **The F-9 red depends on ref VARIANCE, and that is the fragile part of this plan.** The callback form is red because `HTMLElement | null` does not flow into a `KaiViewStackElement | null` slot; the object form is green on both sides because `RefObject.current` is mutable and checked covariantly. A future edit that "simplifies" the test to the object form silently removes the only thing proving F-9. Step 6 exists to catch that -- it asserts the test is STILL red after the runtime generic lands and before the generator moves -- and the test file says so in its own header.
1. **Task 1 makes React write `undefined` onto elements that never received it before.** Every element facade must tolerate a declared prop being assigned `undefined` on a live element. There is an existing net: `tests/react/optional-props.test.tsx`'s "survives an explicit undefined" case already drives `undefined` onto twelve elements across a dozen prop names. It is narrower than the change, though -- it covers the widened props, not every prop on every element -- so Task 5's full `--project=unit`, `test:react` and `verify:blocks` runs are where a facade that reaches into `props.x.length` would surface. If one does, the fix is that facade's default, not a retreat to skipping `undefined`.
2. **Task 3's regeneration diff is the step most likely to sprawl.** `build:api` writes nine committed artifacts from one parse, and any of them moving is a signal that something other than the wrapper generic changed. Step 8 enumerates the expected diff and says to `git checkout --` a no-content-change file and to STOP on a content change. Ruling 4 exists to keep that promise true, at the price of leaving one JSDoc sentence understated; that trade is stated in the PR body rather than hidden.
3. **The bare-specifier decision (ruling 3) rests on one measurement and one reading.** Measured: both React tsc passes compile clean with the bare key repointed at `src/elements/element-types.d.ts`, and `dist/elements.d.ts` exports every `Kai*Element` interface. Read, not measured: that `verify-dts-boundaries.mjs` accepts a bare self-reference to a declared subpath -- its own self-test at `scripts/verify-dts-boundaries.mjs:389-395` (the case object; its `name:` line is `:390`) plants exactly that case and expects it to PASS. Task 3 Step 11 is where the reading gets tested, against a real build, before anything else depends on it.
4. **Task 5 Step 7 transcribes code out of a report.** The spike's tree was discarded and the report is the only copy, so a transcription error reads as a kit bug. The mitigation is Step 11: the same transcribed tree is compiled against `main`'s tarball and must fail with the four EXPECTED errors and no others. A transcription error shows up there as a fifth error, before it can be misread as a finding.
5. **`verify:blocks` moving a baseline is ambiguous and must not be auto-resolved.** Task 2 changes what `kai-view-stack` sees, and `support-widget` is a block with a committed baseline. Task 5 Step 3 says to read a moved baseline as real behaviour change rather than regenerating it. If a baseline genuinely needs updating, that is a finding to report before the PR, not a step to perform quietly.
