# Solid v2 spike — kai-input on solid-js@2.0.0-rc.1

Date: 2026-08-24. Executes `.superpowers/sdd/2026-08-24-form-field-formats/solid-v2-research.md`.
Throwaway spike; the code lives in the (disposable) worktree at `spike-v2/`, nothing committed.

## VERDICT: GREEN WITH CONDITIONS

The purely-mechanical v2 branch is safe **only if the sweep carries two rules the memo
does not have**, plus a test-shape pass:

1. **Ref/node reads move OUT of the tracked section, into the apply.** In v2 the
   user-effect COMPUTE runs *before* the render effect that builds a `<Show>` branch and
   fires its `ref` — at mount and on every toggle. An effect ported mechanically
   (tracked prologue → compute, untrack body → apply) that reads a mutable ref in the
   prologue reads `undefined` and fails **silently** — the mask never attached and 3 of 5
   identity tests still passed. `input.tsx:200-212`'s own comment names this exact
   failure ("el would be undefined on the toggle... detach with nothing queued to
   re-attach — silently"). The memo's §2b verdict "the assumption gets STRONGER" is
   **wrong for the compute phase**; it holds only for the apply phase.
2. **Every `onMount(() => expr)` with a concise arrow body must gain braces when it
   becomes `onSettled`.** An `onSettled` callback returning any non-function,
   non-undefined value is a dev-mode **hard crash** — `[REACTIVITY_HALTED] An uncaught
   error halted the reactive system. No further updates will be processed.` A
   `log.push(...)` body (returns a number) took the whole app down. ~251 `onMount` sites;
   a sed rename without the brace pass ships crashes.
3. Test shape: `flush()` sweeps (details under Q-A/Q-C), and a testing-library story —
   `@solidjs/testing-library@latest` (0.8.10) still peers on solid 1.x; its `next`
   (1.0.0-beta.2) is untried; this spike drove `@solidjs/web`'s `render` directly
   through a 20-line shim.

Nothing found blocks the migration; no node-recreation regression exists; the element
layer registers identically. The two conditions are sweep *rules*, not redesigns.

## Environment (exact)

- solid-js `2.0.0-rc.1` · @solidjs/web `2.0.0-rc.1` · @solidjs/element `2.0.0-rc.1`
  (bringing component-register `0.8.8` — same core as our solid-element `^1.9.1`)
- @solidjs/vite-plugin `3.0.0-next.32` (`latest` tag; default export `solidPlugin()`; worked
  under vitest with zero options) · vitest `4.1.11` · jsdom `30.0.1` · vite `8.2.2`
- tsconfig: `jsx: "preserve"`, `jsxImportSource: "@solidjs/web"`; the `JSX` *type* now
  imports from `@solidjs/web` (e.g. `JSX.InputHTMLAttributes`), not `solid-js`.
- Scope ported: `ui/input.tsx` (full), a trimmed `kai-input` facade via
  `@solidjs/element`'s `customElement`, and the framework-free primitives
  (`field-mask` / `input-mask` / `field-semantics` / `cn`) copied byte-identical — they
  needed **zero** changes, as predicted.
- Baseline first: the real `tests/ui/input-node-identity.test.tsx` on the worktree's
  solid 1.x — `Tests 5 passed (5)`, 851ms.

Commands: `npx vitest run` in `spike-v2/` (all runs below), `npx tsc --noEmit` (the
ported `src/input.tsx` typechecks clean; the only errors are spike probe artifacts).

---

## Q-A — does input-node-identity.test.tsx pass unmodified? (THE question)

**STATED-BY-TEST: the identity guarantee HOLDS under v2. The file does not pass
unmodified, and every unmodified failure is staged-write test shape — zero are node
recreation.**

Two copies were run:

- `tests/input-node-identity.test.tsx` — verbatim port (only the render/cleanup shim and
  import paths differ; no jest-dom matcher was used by the original). Result:
  **5 failed / 5**, and *every* failing assertion is a same-tick read of staged state:
  - `expect(value()).toBe('CHG-4821')` got `''` — signal reads return the last committed
    value until the microtask (`setCount(1); count() // still 0` from the memo, live).
  - `expect(el.className).toContain('border-destructive')` after `setInvalid(true)` —
    DOM commit staged.
  - `expect(row).not.toBe(plain)` after `setAffix(true)` — the swap itself staged; the
    old node still in the DOM (which also means: not an identity regression, the
    *absence* of a swap).
  - The masked progression check failed at the 4th key for a different reason — see the
    compute-phase finding under Q-B; after that port fix, the masked progression
    passes even in the unmodified file, and its only failures are the same-tick reads.
  - **No `expect(now).toBe(first)` ever failed, in any run, in either file.**
- `tests/input-node-identity.flushed.test.tsx` — the SAME five tests with the minimal v2
  adjustment: `flush()` after each keystroke, after `render()`, and after each setter
  (each tagged `V2-FLUSH` with the reason). The flush is what makes the identity
  assertions non-vacuous — it forces the `invalid` accessor to re-run on every key.
  Result: **5 passed / 5** (after the Q-B port fix; before it, the two mask tests failed
  on the silent non-attach, never on identity).

So: v2's `<Show>` preserves the child DOM node across re-runs of sibling reactive
expressions; the K-D12a fix's mechanism (class as an *accessor* so reads compile into a
nested effect on the existing node; lazily cached `plainNode`/`rowNode` swapped by
`<Show>`) survives intact, focus included (`document.activeElement` assertions all
pass). The memo's §2d open question is settled: **preservation**.

Test-shape delta, exhaustively: `flush()` inserted at (1) after each `press`, (2) after
`render()` where a mount-time effect matters, (3) after each signal setter whose result
is asserted synchronously. Nothing else changed; every identity assertion is verbatim.

## Q-B — the effect split at input.tsx:189 (mask attach)

**Not as mechanical as the memo infers.** The shape-level split is exactly as predicted —
but it produces a silent runtime defect if applied verbatim.

Before (1.x, abridged):

```ts
createEffect(() => {
  const format = maskFormat();
  const config = { guide: local.guide, ... };
  const el = hasAffix() ? rowEl : plainEl;   // tracked section — SAFE in 1.x
  untrack(() => { /* attach/update/detach using el */ });
});
```

Mechanical port (WRONG, and wrong silently):

```ts
createEffect(
  () => {
    const format = maskFormat();
    const config = { ... };
    const el = hasAffix() ? rowEl : plainEl; // compute — runs BEFORE render builds the node
    return { format, config, el };           // el === undefined at mount AND on toggle
  },
  ({ format, config, el }) => { /* detaches, nothing re-attaches */ },
);
```

Correct port (one line moves):

```ts
createEffect(
  () => ({ format: maskFormat(), config: {...}, affix: hasAffix() }),  // tracked deps only
  ({ format, config, affix }) => {
    const el = affix ? rowEl : plainEl;      // apply — runs AFTER render; el is set
    /* former untrack body verbatim; the untrack() wrapper is dropped (apply is untracked) */
  },
);
```

Phase-order evidence (`order3.json`, probe `tests/debug-compute-timing.test.tsx`, the
Input shape — Show fallback + lazily cached node + effect created before the JSX):

```
mount:  compute(affix=false, el=UNDEFINED) → ref:plain → apply
toggle: compute(affix=true,  el=UNDEFINED) → ref:row  → apply
```

And with the read in the APPLY instead (`order2.json`): `ref:plain → apply(el=set)`,
`ref:row → apply(el=set)` — both phases, both transitions.

**Migration rule for the branch:** in every effect split, refs/DOM nodes and anything
else produced by the render phase are read in the *apply*; the compute holds only the
tracked reactive reads. This cannot be sed'd — each of the ~202 `createEffect` sites
needs the one-line judgment.

## Q-C — the microtask apply window after a Show toggle

**No observable unmasked frame. The memo's §2b caveat did not materialize.**
`tests/microtask-window.test.tsx`, 2/2 passing, no explicit flush on the main path:

- Synchronously after `setAffix(true)`: the DOM is *unchanged* (old node, still masked) —
  the pre-toggle frame, not an unmasked one.
- Inside the MutationObserver callback for the swap — the earliest microtask an outside
  observer can react in — a probe keystroke into the new node came out **formatted**: the
  Show swap and the mask effect's apply committed in the *same* flush; no interleaving
  point between them is reachable from outside.
- After natural microtask settling, typing continues formatted (`555-123-4567`).
- `flush()` after the setter makes the whole transition synchronous for tests (second
  test) — deterministic, no window.

So this is a **test-shape change only** (the flushes above); no behavior change, and no
one-frame unmasked flash for a real user. The window that does exist is *before* the
commit (staged writes), where the old, still-masked node is what's visible — benign.

One real asymmetry found while probing (`tests/debug-attach.test.tsx`, recorded in the
test): **at MOUNT, a direct `render()` runs effect applies synchronously before
`render()` returns** — only post-mount updates are staged. But the **custom-element
upgrade path does NOT**: after `document.body.innerHTML = '<kai-input …>'` the applies
stay staged until a microtask/`flush()`. Element-facade tests therefore need a flush
after mount even though component tests don't.

## Q-D — @solidjs/element and the kai-input facade

**Registers identically. 6/6 passing** (`tests/element.test.tsx`), with the one caveat
that mount needs a `flush()` (above). Verified against a trimmed facade:

- Registration + upgrade from parsed HTML, rendering into an open **shadow root** (still
  the default), label/input present.
- **Hyphenated attribute bridge**: `<kai-input format="@@@-####" case-mode="upper">` —
  `case-mode` arrives as the `caseMode` prop; typing `chg4` renders `CHG-4`.
- **Props as JS properties, set before connect** (the ref-callback house rule's timing):
  `el.format = '###-###-####'; el.semantic = 'tel'; appendChild(el)` — masked, and the
  tier-1 `inputmode="tel"` attribute landed.
- **Non-bubbling `kai-*` CustomEvents** off the host; detail carried the canonical value
  (`5551234567`) beside the formatted text; a body-level listener saw nothing.
- **`Object.defineProperty(element, 'value', …)` override** works: set drives the mask
  (screen `555-123-4567`, property `5551234567`), get reads live; an `expose`-style
  method assignment works.
- **Ref callbacks are unowned — CONFIRMED**: `getOwner()` is `null` inside a ref
  (`ref-owner.json`: `{"ownerNull":true,"threw":"no"}`). Note `onCleanup` inside the ref
  did **not** throw in rc.1 — it silently no-ops/leaks instead of failing loud, which is
  worse for us: nothing flags a 1.x-style cleanup left in a ref. Our house rule (set WC
  props in ref callbacks) survives — the audited facade registers no cleanup in refs —
  but the sweep must grep for `onCleanup` inside ref callbacks explicitly.
- component-register under `@solidjs/element@2.0.0-rc.1` is `0.8.8` — the same core our
  `solid-element@^1.9.1` uses. The `ComponentOptions.element: ICustomElement` typing
  needs the same cast `define.tsx` already does; no new friction.

**Not exercised** (outside the slice; must be re-proved on the real branch):
`ChatConfig`/portal mount, the shared constructable stylesheet + pre-paint adoption, the
pre-define registry seam (`defineWithNonReflectingProps`) and element diagnostics
snapshotting, `reflectFlag`/flag read-back, slot-occupancy tracking, SSR no-op.

## Q-E — what the memo missed (would trip a mechanical migration)

1. **Compute-before-render ordering** (Q-B) — the memo's §2b/risk-table row says the
   input.tsx assumption "holds *more* strongly"; empirically the tracked section moved to
   the WRONG side of the render phase. Highest-value single correction to the memo.
2. **`onSettled` return-value crash** (verdict #2) — dev-mode `REACTIVITY_HALTED`, whole
   reactive system dead, from one concise arrow body. Not in the memo at all.
3. **`onCleanup` in unowned refs silently no-ops** rather than throwing — the memo says
   "no longer works," which is true but understates that nothing tells you.
4. **Mount-flush asymmetry**: direct `render()` flushes mount applies synchronously; the
   custom-element upgrade path does not. Every `*.declarative`/element test mounts via
   markup, so the element suites need the flush sweep even where component suites pass.
5. **A dead mask looks alive**: pre-fix, typing `CHG` into the silently-unmasked field
   matched the expected progression for 3 keys (raw == formatted until the first
   literal). Short-input assertions cannot detect a non-attached mask; keep the
   progression assertions long enough to cross a literal.
6. `splitProps` two-way destructure has no `pick` counterpart: `local` becomes direct
   `props` reads (aliasing `const local = props` makes the port a pure import change)
   plus `rest = omit(props, ...keys)`. Worked cleanly here; `merge`'s
   undefined-overrides semantic was NOT exercised in this slice (no `mergeProps` in it) —
   the memo's audit flag on that stands.
7. `@solidjs/vite-plugin`'s working version is on the **`latest`** tag (3.0.0-next.32);
   the `next` tag is *older* (next.28). Pin explicitly, don't trust tags.
8. The `JSX` type import must move to `@solidjs/web` — `solid-js` no longer exports the
   JSX namespace the props interfaces extend (`JSX.InputHTMLAttributes` etc.). Purely
   mechanical but touches every `type JSX` import in `src/`.

## File map (all inside the disposable worktree `spike-v2/`)

- `src/input.tsx` — the port; every deviation tagged `V2-PORT`, the non-mechanical fix
  tagged `V2-PORT (2b)`.
- `src/element-input.tsx` — trimmed facade; `src/{field-mask,input-mask,field-semantics,cn}.ts`
  — byte-identical copies.
- `tests/input-node-identity.test.tsx` (unmodified shape, fails 5/5 on staged reads,
  kept as evidence) · `tests/input-node-identity.flushed.test.tsx` (5/5) ·
  `tests/microtask-window.test.tsx` (2/2) · `tests/element.test.tsx` (6/6) ·
  `tests/debug-{attach,ordering,compute-timing}.test.tsx` (the ordering probes;
  `order1/2/3.json`, `ref-owner.json` hold the raw logs).
- Full suite: `Tests 5 failed | 19 passed (24)` — the 5 are the unmodified-shape
  evidence file, by design.
