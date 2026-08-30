# workSurface + starter defaults — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `layout: 'split'` a real, rendering work surface — the pane chrome promoted out of `builder-workspace.stories.tsx` into a public component, driven by new top-level `workSurface` construct vocabulary — and rewrite every template starter so the builder ships bells-and-whistles-on, brand-neutral defaults.

**Architecture:** Three layers, bottom-up. (1) The story's `WorkPane`/`WorkPaneToolbar` become `src/components/work-surface.tsx`'s `WorkSurface`, composing the kit's existing `Artifact` as the sandboxed frame so there is no second iframe/URL policy; the story then renders the promoted component instead of its local copy. (2) `ConstructSchema` widens with a top-level `workSurface` key (layout-scoped to `split`, `url` required and `isSafeUrl`'d) plus four cross-field rules. (3) `codegen.ts` emits the surface as `<slot name="pane">` FALLBACK so consumer projection still wins, and — when `workSurface` is present — arranges the split the way the story does: chat as the resizable `start` rail, work surface filling the main region.

**Tech Stack:** SolidJS · zod 4 · vitest (jsdom) · Vite · pnpm + NX · the `kai` construct CLI (`bin/mcp.js`).

**Spec:** `docs/superpowers/specs/2026-08-30-worksurface-and-starter-defaults.md`, as amended by the coordinator's 2026-08-30 re-scope (see "Corrections to the spec" below) and by the ledgered reversal at the end of `docs/superpowers/specs/2026-08-28-t5-vocabulary-rulings.md`.

---

## PROCESS NOTE — read before anything else

**The acceptance surface for anything that has a Labs/Builder story is THAT STORY, compared side by side — not the spec's prose.** The Labs/Builder stories are not sketches to be re-derived: they are the approved design *and* working implementations, each carrying many rounds of recorded owner feedback in its module comment. This is the second time in two days that verifying against a spec instead of against the story shipped a gap to the owner. Before you write a line of any task below, open `packages/ui/src/elements/builder-workspace.stories.tsx` and read its module comment (lines 45–186) and `WorkPaneToolbar`/`WorkPane` (lines 394–553). When this plan and that file disagree, the file wins — stop and report the disagreement rather than silently picking one.

**The variant card label is NOT in scope.** `"App preview with device toggles"` (`templates.ts`, the `appPreview` variant's `name`) is under review by the owner as an open question. This plan does not rename it and does not touch it. (It is, incidentally, no longer a lie — the device toggle is real vocabulary after Task 2 — but the decision is the owner's.)

---

## Corrections to the spec (the coordinator's re-scope, plus what the tree says)

The spec was written before the story was read as an implementation. These are binding overrides. Each one exists because the tree or the story contradicts the spec.

| # | Spec said | Reality | Ruling |
|---|---|---|---|
| **X-1** | `chrome.deviceToggle` DROPPED — "no kit mechanism, the only device switcher is the unexported builder-internal `BuilderViewport`". | `builder-workspace.stories.tsx:394-553` has a complete, owner-reviewed device toggle: `PANE_DEVICES` (desktop/tablet/mobile, `Monitor`/`Tablet`/`Smartphone`), `PANE_DEVICE_W = { desktop: '100%', tablet: '834px', mobile: '390px' }` (Lovable's own `DEVICE_W` shape), scoped to the pane's own canvas and applied to the PREVIEW branch only. | **ADOPTED.** Promoted in Task 1, vocabulary in Task 2. |
| **X-2** | `chrome.codeView` DROPPED — "a construct has no honest source for `files[]`". | The story ships a real Preview\|Code segmented toggle (Preview FIRST — Lovable's own `TABS` order, fixed in an owner round). Its content is `StubCodeBlock`. | **ADOPTED, with content honesty enforced by the schema**: `workSurface.codeUrl` is what the Code tab reads, and `chrome.codeView: true` without `codeUrl` is a hard rejection (rule `work-surface-code-view`, both directions loud, the `history-endpoint-url` precedent). The tab can never ship with nothing behind it. The starters set neither — there is nothing honest to point at offline — and the panel says so with a hint. The component keeps the tab unconditionally so the story's design is intact. |
| **X-3** | `chrome.expand` maps to `ArtifactProps.expandable`, because "`WorkspaceShell` renders no collapse control". | Half right, and the story already resolved it: the story's module comment (lines 82–98) says explicitly that it checked `v0.stories.tsx`'s kai-resizable maximize protocol FIRST, found that `WorkspaceShell` does **not** forward `maximizedIndex`/`onMaximizeChange`, and wired Expand to `WorkspaceShell`'s real **controlled `startCollapsed`** instead — collapsing the chat rail. **The coordinator's brief said "expand via the kai-resizable maximize protocol"; the story says the opposite, in writing, with its reasoning. The story wins.** | **`expand` = controlled `expanded`/`onExpandedChange` on `WorkSurface`, wired by codegen to `WorkspaceShell`'s `startCollapsed`.** Not `ArtifactProps.expandable`. |
| **X-4** | W-3's `kind` preset table sets every chrome flag per kind. | A kind-dependent default cannot be expressed in `ANCHORED_BOOLEAN_DEFAULTS` (`construct-form-paths.ts:123`), whose defaults are path-keyed constants. The builder panel would report every chrome switch as OFF while the pane rendered it ON, and toggling one off would DELETE the key and silently turn it back on. That is a menu-honesty violation manufactured by the preset. | **No chrome preset table.** Every `chrome.*` key is a plain optional boolean, absent = OFF, uniform with every other capability in `schema.ts`. `kind` decides the `iframeTitle` and the frame look only (`artifact` = a bordered card centered on the muted backdrop; `preview` = edge-to-edge browser canvas). The starters STATE the chrome they want on, the way `widget.position` and `aside` geometry already state theirs. |
| **X-5** | W-11: split proportions unchanged. | The story puts the CHAT in `WorkspaceShell`'s `start` (360px, min 280, max 520) and the WORK SURFACE in `children` — the main region, which `WorkspaceShell` makes the larger of the two. Codegen has it inverted: chat in `children`, pane in `end` (capped at 480px). The owner's "narrow chat, huge dead space" reading is the inverted arrangement, not a math bug. | **When `workSurface` is present the emitted split follows the story**: chat rail in `start` (360/280/520), work surface in `children`. When `workSurface` is ABSENT the emitted split keeps today's exact shape — no behaviour change for anyone already projecting into `<slot name="pane">`. |
| **X-6** | `public/work-surface.html` is "token-styled". | It loads inside a sandboxed iframe with no `allow-same-origin`. It cannot see the host document's custom properties at all. | Hard-coded, self-contained inline CSS. Stated in the file's own copy. |
| **X-7** | S-11: emit a DEV `console.warn` "when an action is clicked **and no listener is attached**". | The DOM has no API that reports whether a listener exists. `dispatchEvent`'s return value only reports `preventDefault()`, which no listener is obliged to call. A detection is impossible; a `preventDefault`-based one would false-warn on correct code. | Emit a **once-per-label** DEV reminder naming the event and the seam, worded as a reminder rather than a claim about listeners. Recorded in the emitted comment. |
| **X-8** | T8: "the `apps/docs/` construct-format page". | There is no construct-format page under `apps/docs/`. The construct format's prose documentation is `packages/ui/src/agent-tooling/README.md` (its "Worked example" and "Rules that bind changes here" sections). | Document there. |
| **X-9** | C-7: "`verify:starters` is not the gate for template starters." | Confirmed — `verify:starters` covers `examples/starters/*` and `examples/apps/*`. | Do not cite it. The starter gates are `templates.test.ts` + `verify:construct`'s recursive fixture discovery. |
| **X-10** | Spec is silent on `verify-generated-sync.mjs`. | Read it: all seven `fixtures/templates/*.construct.json` entries already exist in `GENERATED` (lines 153–159), plus a sentinel `fixtureDir` check (lines 183–184) that fails on an unregistered new file. | **No edit to `verify-generated-sync.mjs` is needed.** The seven files change content, not identity. Do not add entries. |

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Widen, never restructure.** `schema.ts` is the single source of truth. `workSurface` is a purely additive top-level key. Never hand-edit `construct.v1.schema.json` or `apps/docs/public/schemas/construct/v1.json`; never restate an enum — read it off `ConstructSchema.shape` or the generated artifact.
- **`.strict()` at every object level.** An unknown key is a loud rejection, not a silently ignored one.
- **`isSafeUrl` on every URL sink.** `workSurface.url` and `workSurface.codeUrl` reach an iframe `src` and `window.open`. Guard them in `superRefine` via `isSafeUrl` imported from `../../primitives/url-scheme-policy` (NOT `card-routing.ts` — `schema.ts` compiles under `tsconfig.mcp.json`'s Node-only, no-DOM-lib pass). Never author a second policy.
- **Untrusted text is `JSON.stringify`'d at emit.** Every construct-authored string reaching emitted source (`workSurface.url`, `codeUrl`, header labels…) is emitted as a real JS string-literal expression — `prop={"..."}`, never a raw JSX attribute string.
- **Derive, don't type.** No hand-written counts, versions, paths or lists that the code already knows. `WorkSurface`'s tab type IS `ArtifactTab` (`'preview' | 'code'`), not a second union. The device-width map lives in exactly one module.
- **Menu-honesty.** No affordance offered that does nothing. The Code tab cannot exist without `codeUrl`. The open-in-new-tab button must actually open (the story's is a dead button — Task 1 fixes it).
- **Decide loudly.** No silent drops, truncations, fallbacks or swallowed errors. Slot-fallback supersession, an absent Code tab, a split with no work surface: each gets a printed notice or an emitted comment.
- **The kit decides HOW; the app decides WHETHER.** No limits, quotas or counts land in vocabulary.
- **Run every command from the repo root** (pnpm + NX workspace), except the `npm run …` package scripts, which run inside `packages/ui`.
- **NX cache caveats.** `nx build ui` can hit cache and skip the derived-artifact generators while printing success; `nx typecheck ui` has printed both a stale red AND a cached green over broken code. Use `npm run build:api` inside `packages/ui` when you need artifacts regenerated, and `nx typecheck ui --skip-nx-cache` (or `npm run typecheck` inside `packages/ui`) for verdicts you rely on. **A cached build looks exactly like a successful one.**
- **FOREGROUND only.** Never background a build, test run or gate. Run it, wait for it, read the output.
- **Reports paste RAW output.** Every task report pastes the actual terminal output of the commands it ran — never a summary, never "tests pass".
- **NOTHING IS PUSHED.** Local commits only, on `feat/modes-and-screens`. No `git push`, no PR, no merge.
- **The LAST step of the final task is `npx nx build ui --skip-nx-cache`**, run from the repo root, so the owner's local `packages/ui/dist/` carries this work.

---

## File Structure

**Created**
- `packages/ui/src/components/work-surface.tsx` — the promoted `WorkSurface` component: the story's toolbar (device toggle · read-only URL bar · open-in-new-tab · expand · Preview\|Code) over a content region that composes `Artifact` as its sandboxed frame.
- `packages/ui/src/components/work-surface.test.tsx` — behaviour tests for the promoted component.

**Modified**
- `packages/ui/src/index.ts` — export `WorkSurface` + its types (reaches `@kitn.ai/ui/solid` via `src/solid.ts`'s `export * from './index'`).
- `packages/ui/src/elements/builder-workspace.stories.tsx` — render the promoted component; delete the local copy; correct the module comment's now-false claims.
- `packages/ui/src/agent-tooling/construct/schema.ts` — the `workSurface` key + four `CROSS_FIELD_RULES` entries.
- `packages/ui/src/agent-tooling/construct/schema.test.ts` — accept/reject cases; the rule-id list.
- `packages/ui/src/components/construct-form-paths.ts` — `RuleVisibility`'s `hide-section` gains `layout: string`; four `RULE_VISIBILITY` entries.
- `packages/ui/src/components/construct-form-paths.test.ts` — the settled-treatments assertions.
- `packages/ui/src/components/builder-panel-derived.tsx` — compare against `vis.layout`; section title; field labels; render `section.hints`.
- `packages/ui/src/components/builder-panel-derived.test.tsx` — section visibility per layout; a hint renders.
- `packages/ui/scripts/verify-construct.mjs` — `TOP_LEVEL_VALUES.workSurface` + `TOP_LEVEL_LAYOUT_SCOPE.workSurface`.
- `packages/ui/src/agent-tooling/construct/codegen.ts` — the split emit, the work-surface emit, `public/work-surface.html`, the header-action DEV reminder.
- `packages/ui/src/agent-tooling/construct/codegen.test.ts` — emit assertions.
- `packages/ui/src/agent-tooling/construct/cli.ts` + `cli.test.ts` — two notices.
- `packages/ui/src/agent-tooling/construct/dev.ts` — print the new notices beside `accentContrastNotice`.
- `packages/ui/src/agent-tooling/construct/templates.ts` — `TemplateControlSection.hints`, the manifests, the starter rewrites, the variants.
- `packages/ui/src/agent-tooling/construct/templates.test.ts` — the starter-content rules.
- `packages/create-kai/src/wizard.ts` + `packages/create-kai/test/wizard.test.ts` — the registry entry.
- `packages/ui/src/agent-tooling/README.md` — the construct-format documentation.

**Regenerated (never hand-edited)**
- `packages/ui/src/agent-tooling/construct/construct.v1.schema.json`
- `apps/docs/public/schemas/construct/v1.json`
- `packages/ui/src/agent-tooling/construct/fixtures/templates/*.construct.json` — **all seven files change.**

---

## Task order and where the owner can test

The owner is running the builder locally right now and the Workspace template previews as a chat beside an empty void.

**The void dies at the end of Task 5.** Task 4 makes codegen capable of rendering a pane; Task 5 is what puts `workSurface` into the Workspace starters, which is what `kai dev --builder` actually loads. After Task 5, `node packages/ui/bin/mcp.js dev --builder` on the Workspace template shows a chat rail on the left and a rendering work surface filling the rest — **that is the first owner-testable partial landing, and it is worth handing over before Tasks 6–10 are done.** Tasks 1–3 are the prerequisites that cannot be skipped: Task 1 because there is no component to render, Task 2 because there is no vocabulary to declare it, Task 3 because a new top-level schema key hard-fails `verify:construct` until it has a valuer.

The second owner-testable landing is Task 6, which makes the two Workspace variants visibly different — this round's acceptance test.

---

# Task 1: Promote the story's pane chrome into `WorkSurface`

**Files:**
- Create: `packages/ui/src/components/work-surface.tsx`
- Create: `packages/ui/src/components/work-surface.test.tsx`
- Modify: `packages/ui/src/index.ts` (beside line 215's `Artifact` export)
- Modify: `packages/ui/src/elements/builder-workspace.stories.tsx` (delete `WorkPaneToolbar` + `WorkPane`; render `WorkSurface`)

**Interfaces:**
- Produces: `WorkSurface(props: WorkSurfaceProps)`, `WorkSurfaceProps`, `WorkSurfaceDevice = 'desktop' | 'tablet' | 'mobile'`, `WORK_SURFACE_DEVICE_WIDTHS: Record<WorkSurfaceDevice, string>` — all exported from `src/components/work-surface.tsx` and re-exported from `src/index.ts`. Tasks 4 and 6 import `WorkSurface` by name in emitted code.
- Consumes: `Artifact`, `ArtifactController`, `ArtifactTab` from `./artifact`; `Button` from `../ui/button`; `cn` from `../utils/cn`.

- [ ] **Step 1: Read the source of truth before writing anything**

Open `packages/ui/src/elements/builder-workspace.stories.tsx` and read, in this order: the module comment (lines 45–186), `PANE_DEVICES`/`PANE_DEVICE_W` (lines ~216–228), `WorkPaneToolbar` (394–480), `WorkPane` (482–553), `WorkspacePreview`'s `WorkspaceShell` usage (700–745). The promoted component must preserve the behaviour those lines describe, including the recorded reasons: the device toggle scales the PREVIEW branch only and never the Code view; the toolbar sits on `color-mix(in oklab, var(--color-muted) 20%, transparent)` and the canvas on `30%`; Preview is listed BEFORE Code; `showCodeView: false` removes the toggle **entirely** rather than disabling it.

- [ ] **Step 2: Write the failing test**

Create `packages/ui/src/components/work-surface.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup, screen, fireEvent } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { WorkSurface, WORK_SURFACE_DEVICE_WIDTHS } from './work-surface';

afterEach(cleanup);

describe('WorkSurface — promoted from builder-workspace.stories.tsx', () => {
  it('renders every toolbar affordance the story ships, when all are enabled', () => {
    render(() => (
      <WorkSurface
        src="/work-surface.html"
        showDeviceToggle
        showUrlBar
        showOpenInNewTab
        showExpand
        showCodeView
        code={<pre>source</pre>}
      />
    ));
    expect(screen.getByRole('group', { name: 'Pane device' })).toBeInTheDocument();
    expect(screen.getByLabelText('Desktop')).toBeInTheDocument();
    expect(screen.getByLabelText('Tablet')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile')).toBeInTheDocument();
    expect(screen.getByLabelText('Open in new tab')).toBeInTheDocument();
    expect(screen.getByLabelText('Expand work pane')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Pane kind' })).toBeInTheDocument();
  });

  it('showCodeView={false} REMOVES the Preview|Code toggle entirely — not a disabled control (the story\'s own rule)', () => {
    render(() => <WorkSurface src="/x.html" showCodeView={false} code={<pre>source</pre>} />);
    expect(screen.queryByRole('group', { name: 'Pane kind' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Code' })).not.toBeInTheDocument();
  });

  it('the device toggle scales the PREVIEW canvas only, never the Code view (Lovable\'s own rule)', () => {
    const { container } = render(() => (
      <WorkSurface src="/x.html" showDeviceToggle showCodeView code={<pre>source</pre>} />
    ));
    fireEvent.click(screen.getByLabelText('Mobile'));
    const canvas = container.querySelector('[data-kai-work-surface-canvas]') as HTMLElement;
    expect(canvas.style.maxWidth).toBe(WORK_SURFACE_DEVICE_WIDTHS.mobile);
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(container.querySelector('[data-kai-work-surface-canvas]')).toBeNull();
  });

  it('the tab is controllable and reports changes', () => {
    const onTabChange = vi.fn();
    render(() => (
      <WorkSurface src="/x.html" showCodeView tab="preview" onTabChange={onTabChange} code={<pre>source</pre>} />
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(onTabChange).toHaveBeenCalledWith('code');
  });

  it('expand is CONTROLLED — it reports, it does not self-toggle (codegen drives WorkspaceShell.startCollapsed)', () => {
    const [expanded, setExpanded] = createSignal(false);
    const onExpandedChange = vi.fn((v: boolean) => setExpanded(v));
    render(() => (
      <WorkSurface src="/x.html" showExpand expanded={expanded()} onExpandedChange={onExpandedChange} />
    ));
    fireEvent.click(screen.getByLabelText('Expand work pane'));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(screen.getByLabelText('Restore split')).toHaveAttribute('aria-pressed', 'true');
  });

  it('the URL bar shows urlLabel when given, and the src otherwise — read-only either way', () => {
    render(() => <WorkSurface src="/work-surface.html" showUrlBar urlLabel="preview--build-workspace.kitn.app" />);
    expect(screen.getByText('preview--build-workspace.kitn.app')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('open-in-new-tab is WIRED — the story\'s button had no onClick, which is a dead affordance', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(() => <WorkSurface src="/work-surface.html" showOpenInNewTab />);
    fireEvent.click(screen.getByLabelText('Open in new tab'));
    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });

  it('renders `preview` content instead of an iframe when no src is given (the story\'s stub path)', () => {
    const { container } = render(() => <WorkSurface preview={<div data-stub>stub</div>} />);
    expect(container.querySelector('[data-stub]')).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('frames src through the kit\'s own Artifact — one sandbox policy, not a second one', () => {
    const { container } = render(() => <WorkSurface src="/work-surface.html" />);
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/work-surface.test.tsx
```

Expected: FAIL — `Failed to resolve import "./work-surface"`.

*(If the whole suite instead dies on `Cannot find module '.../@testing-library/jest-dom/dist/vitest.mjs'` or `Failed to resolve import "./compiled.css?inline"`, the checkout is missing its setup: run `pnpm install`, then `pnpm --filter @kitn.ai/ui run build:css`, then `npx nx build ui`. That is a broken-checkout symptom, not a broken test.)*

- [ ] **Step 4: Write `packages/ui/src/components/work-surface.tsx`**

```tsx
/**
 * `WorkSurface` — the work pane's chrome, PROMOTED from
 * `src/elements/builder-workspace.stories.tsx`'s `WorkPane`/`WorkPaneToolbar`
 * (2026-08-30). That story is the APPROVED DESIGN and was already a working
 * implementation carrying many rounds of recorded owner feedback; the story now
 * renders THIS component instead of its own copy, so the design contract and the
 * product cannot drift apart again.
 *
 * The reasoning below is the story's, carried over verbatim in substance —
 * read `builder-workspace.stories.tsx`'s module comment for the full record:
 *
 *  - The toolbar mirrors Lovable's browser chrome (`elements/lovable.stories.tsx`,
 *    read line by line in that round): a device toggle · a READ-ONLY URL bar
 *    (lock icon + address text, never an editable field) · an open-in-new-tab
 *    button · an expand toggle · a Preview|Code segmented toggle with PREVIEW
 *    FIRST (Lovable's own `TABS` order).
 *  - Every affordance is independently optional. `showCodeView={false}` REMOVES
 *    the Preview|Code toggle entirely rather than disabling it — "someone may
 *    want preview-only" (owner's brief) — and the surface then always renders
 *    its preview branch.
 *  - The device toggle scales the PREVIEW canvas only, NEVER the Code view,
 *    mirroring Lovable, whose device toggle only ever wraps its
 *    `tab() === 'preview'` branch.
 *  - `expanded` is CONTROLLED, never owned here. The story checked v0's
 *    kai-resizable maximize protocol first and found `WorkspaceShell` does not
 *    forward `maximizedIndex`/`onMaximizeChange`; it wires expand to
 *    `WorkspaceShell`'s real controlled `startCollapsed` instead (collapse the
 *    chat rail, click again to restore). This component therefore reports the
 *    toggle and lets its host own the shell — codegen wires
 *    `startCollapsed={...}` on the emitted `WorkspaceShell`.
 *
 * TWO DELIBERATE CHANGES FROM THE STORY, both decided loudly:
 *  1. The preview branch frames `src` through the kit's own `Artifact` with
 *     every Artifact toolbar flag OFF — Artifact is the bare sandboxed frame
 *     here, this component is the chrome. That reuses ONE iframe sandbox
 *     (`allow-scripts allow-forms`, no `allow-same-origin`) and ONE url policy
 *     (`isSafeUrl`, inside Artifact) rather than authoring a second of either.
 *     With no `src`, `preview` renders instead — which is the path the story
 *     takes with its stub tiles.
 *  2. Open-in-new-tab is WIRED, through `ArtifactController.openExternal()`
 *     (which already filters the scheme and warns on a refusal). The story's
 *     button had no `onClick` at all; a button that does nothing is exactly the
 *     dead affordance this repo's menu-honesty rule rejects.
 *
 * STYLING: plain inline `color-mix()`, not a Tailwind opacity-modifier class.
 * That is the story's own precedent and `components/builder-skeleton.tsx`'s
 * `mix()` doc comment explains why (a fresh opacity-modifier combination proved
 * non-deterministic under the Storybook dev server's JIT pass). The helper is
 * inlined rather than imported: `builder-skeleton.tsx` is builder-story
 * furniture and this is a public component.
 */
import { type JSX, Show, For, createMemo, createSignal } from 'solid-js';
import { Code2, Globe, Monitor, Tablet, Smartphone, Lock, ExternalLink, Maximize2, Minimize2 } from 'lucide-solid';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { Artifact, type ArtifactController, type ArtifactTab } from './artifact';

/** The pane's own device canvas. Independent of `builder-layout.tsx`'s
 *  `BuilderViewport`, which scales the whole BUILDER frame. */
export type WorkSurfaceDevice = 'desktop' | 'tablet' | 'mobile';

const DEVICES: readonly { id: WorkSurfaceDevice; label: string; Icon: typeof Monitor }[] = [
  { id: 'desktop', label: 'Desktop', Icon: Monitor },
  { id: 'tablet', label: 'Tablet', Icon: Tablet },
  { id: 'mobile', label: 'Mobile', Icon: Smartphone },
];

/** Lovable's own `DEVICE_W` shape: the preview canvas takes a max-width and
 *  centers. ONE definition — the story reads it from here. */
export const WORK_SURFACE_DEVICE_WIDTHS: Record<WorkSurfaceDevice, string> = {
  desktop: '100%',
  tablet: '834px',
  mobile: '390px',
};

const TOOLBAR_BG = 'color-mix(in oklab, var(--color-muted) 20%, transparent)';
const CANVAS_BG = 'color-mix(in oklab, var(--color-muted) 30%, transparent)';

export interface WorkSurfaceProps {
  /** URL the preview frames, through `Artifact`'s sandboxed iframe. Omit to
   *  render `preview` instead (the story's stub path). */
  src?: string;
  /** Preview content used when `src` is absent. */
  preview?: JSX.Element;
  /** URL the Code tab frames. The Preview|Code toggle needs `showCodeView`;
   *  what it SHOWS is this, or `code`. */
  codeSrc?: string;
  /** Code-tab content used when `codeSrc` is absent. */
  code?: JSX.Element;
  /** Address text shown in the read-only URL bar. Defaults to `src`. */
  urlLabel?: string;
  /** Accessible title for the framed document. */
  iframeTitle?: string;
  /** `'preview'` fills the canvas edge to edge (a browser preview);
   *  `'artifact'` centers the content in a bordered card on the muted
   *  backdrop (a framed artifact). Default `'preview'` — the story's look. */
  variant?: 'artifact' | 'preview';

  /** Controlled tab. Reuses `ArtifactTab` — one union, never a second. */
  tab?: ArtifactTab;
  /** Uncontrolled initial tab. Default `'preview'`. */
  defaultTab?: ArtifactTab;
  onTabChange?: (tab: ArtifactTab) => void;

  /** Controlled device. Uncontrolled (internal signal) when omitted. */
  device?: WorkSurfaceDevice;
  onDeviceChange?: (device: WorkSurfaceDevice) => void;

  /** Controlled expand state — this component never owns it; the host wires it
   *  to `WorkspaceShell`'s `startCollapsed`. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;

  showDeviceToggle?: boolean;
  showUrlBar?: boolean;
  showOpenInNewTab?: boolean;
  showExpand?: boolean;
  /** `false` REMOVES the Preview|Code toggle entirely (the story's own rule),
   *  and the surface always renders its preview branch. */
  showCodeView?: boolean;

  class?: string;
}

export function WorkSurface(props: WorkSurfaceProps): JSX.Element {
  const [internalDevice, setInternalDevice] = createSignal<WorkSurfaceDevice>('desktop');
  const [internalTab, setInternalTab] = createSignal<ArtifactTab>(props.defaultTab ?? 'preview');
  let controller: ArtifactController | undefined;

  const device = (): WorkSurfaceDevice => props.device ?? internalDevice();
  const setDevice = (next: WorkSurfaceDevice): void => {
    if (props.device === undefined) setInternalDevice(next);
    props.onDeviceChange?.(next);
  };
  const rawTab = (): ArtifactTab => props.tab ?? internalTab();
  // `showCodeView: false` cannot leave the surface stranded on a tab whose
  // toggle no longer exists.
  const tab = createMemo<ArtifactTab>(() => (props.showCodeView ? rawTab() : 'preview'));
  const setTab = (next: ArtifactTab): void => {
    if (props.tab === undefined) setInternalTab(next);
    props.onTabChange?.(next);
  };
  const variant = (): 'artifact' | 'preview' => props.variant ?? 'preview';

  const segment = (active: boolean): string =>
    cn(
      'transition-colors',
      active ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <div
      class={cn('flex h-full min-w-0 flex-1 flex-col', props.class)}
      style={{ 'background-color': CANVAS_BG }}
      data-kai-work-surface
      data-kai-work-surface-tab={tab()}
    >
      <div
        class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3"
        style={{ 'background-color': TOOLBAR_BG }}
        data-kai-work-surface-toolbar
      >
        <Show when={props.showDeviceToggle}>
          <div class="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Pane device">
            <For each={DEVICES}>
              {(d) => (
                <button
                  type="button"
                  aria-label={d.label}
                  aria-pressed={device() === d.id}
                  class={cn('grid size-7 place-items-center rounded-md', segment(device() === d.id))}
                  onClick={() => setDevice(d.id)}
                >
                  <d.Icon size={14} aria-hidden="true" />
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show
          when={props.showUrlBar}
          fallback={<div class="min-w-0 flex-1" />}
        >
          <div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5">
            <Lock size={13} class="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span class="truncate font-mono text-xs text-muted-foreground">{props.urlLabel ?? props.src ?? ''}</span>
          </div>
        </Show>

        <Show when={props.showOpenInNewTab}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Open in new tab"
            onClick={() => controller?.openExternal()}
          >
            <ExternalLink size={14} aria-hidden="true" />
          </Button>
        </Show>

        <Show when={props.showExpand}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={props.expanded ? 'Restore split' : 'Expand work pane'}
            aria-pressed={!!props.expanded}
            onClick={() => props.onExpandedChange?.(!props.expanded)}
          >
            {props.expanded ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
          </Button>
        </Show>

        <Show when={props.showCodeView}>
          <div class="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Pane kind">
            <button
              type="button"
              class={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium', segment(tab() === 'preview'))}
              aria-pressed={tab() === 'preview'}
              onClick={() => setTab('preview')}
            >
              <Globe size={13} aria-hidden="true" />
              Preview
            </button>
            <button
              type="button"
              class={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium', segment(tab() === 'code'))}
              aria-pressed={tab() === 'code'}
              onClick={() => setTab('code')}
            >
              <Code2 size={13} aria-hidden="true" />
              Code
            </button>
          </div>
        </Show>
      </div>

      <div class="min-h-0 flex-1 overflow-auto p-5">
        <Show
          when={tab() === 'preview'}
          fallback={
            <Show when={props.codeSrc} fallback={props.code}>
              {(codeSrc) => (
                <Artifact
                  src={codeSrc()}
                  iframeTitle={props.iframeTitle ? `${props.iframeTitle} — source` : 'Source'}
                  showNav={false}
                  showReload={false}
                  showHome={false}
                  showPathField={false}
                  showTabs={false}
                  expandable={false}
                  openInTab={false}
                />
              )}
            </Show>
          }
        >
          {/* The device toggle scales THIS branch only — never the Code view
              (Lovable's own rule, carried over from the story). */}
          <div
            class={cn(
              'mx-auto h-full transition-all duration-300',
              variant() === 'artifact' && 'overflow-hidden rounded-xl border border-border bg-background',
            )}
            style={{ 'max-width': WORK_SURFACE_DEVICE_WIDTHS[device()] }}
            data-kai-work-surface-canvas
          >
            <Show when={props.src} fallback={props.preview}>
              {(src) => (
                <Artifact
                  src={src()}
                  iframeTitle={props.iframeTitle ?? 'Work surface'}
                  showNav={false}
                  showReload={false}
                  showHome={false}
                  showPathField={false}
                  showTabs={false}
                  expandable={false}
                  openInTab={false}
                  controllerRef={(api) => (controller = api)}
                />
              )}
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Export it**

In `packages/ui/src/index.ts`, immediately after line 216's `ArtifactProps` export:

```ts
export { WorkSurface, WORK_SURFACE_DEVICE_WIDTHS } from './components/work-surface';
export type { WorkSurfaceProps, WorkSurfaceDevice } from './components/work-surface';
```

`src/solid.ts` is `export * from './index'` plus Solid-only additions, so this reaches `@kitn.ai/ui/solid` — which is what codegen imports from. **`verify:solid-coverage` fails a public component with no public `<Name>Props` type**, so the `WorkSurfaceProps` export is not optional.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/work-surface.test.tsx
```

Expected: PASS, 9 tests.

- [ ] **Step 7: Rewire the story onto the promoted component**

In `packages/ui/src/elements/builder-workspace.stories.tsx`:

1. Delete `WorkPaneToolbar` (lines 394–480) and `WorkPane` (lines 482–553) entirely.
2. Delete the now-unused local `PANE_DEVICES` and `PANE_DEVICE_W` constants and the `PaneDevice` type; keep `PaneKind` **only if** something else still uses it — replace its uses with the imported `ArtifactTab`.
3. Drop the now-unused `Monitor`, `Tablet`, `Smartphone`, `Lock`, `ExternalLink`, `Maximize2`, `Minimize2`, `Globe`, `Code2` imports from the `lucide-solid` line (`noUnusedLocals` will name any you miss).
4. Add `import { WorkSurface } from '../components/work-surface';` and `import type { ArtifactTab } from '../components/artifact';`.
5. Replace the `<WorkPane … />` call inside `WorkspacePreview` (lines ~730–742) with:

```tsx
          <WorkSurface
            showDeviceToggle={props.chrome.showDeviceToggle}
            showUrlBar={props.chrome.showUrlBar}
            urlLabel="preview--build-workspace.kitn.app"
            showOpenInNewTab={props.chrome.showOpenInNewTab}
            showExpand={props.chrome.showExpand}
            showCodeView={props.chrome.showCodeView}
            tab={props.paneKind}
            onTabChange={props.onPaneKindChange}
            expanded={props.expanded}
            onExpandedChange={props.onExpandedChange}
            preview={
              <div class="flex h-full flex-col gap-4">
                <div class="grid grid-cols-3 gap-3">
                  <StubStatTile class="h-28" />
                  <StubStatTile class="h-28" />
                  <StubStatTile class="h-28" />
                </div>
                <div class="flex-1 rounded-xl border border-border" style={{ 'background-color': mix('--color-surface', 30) }} />
              </div>
            }
            code={<StubCodeBlock lines={12} class="max-w-2xl" />}
          />
```

6. Change `WorkspacePreview`'s and `WorkspaceBuilderDemo`'s `paneKind` signal type from `PaneKind` to `ArtifactTab` (identical union, one definition).

**The story keeps its stub content** — `StubStatTile`/`StubCodeBlock` are what the pane frames when there is no `src`. That is the honest boundary: this round promotes the CHROME; the content still comes from whoever mounts it (the story: stubs; an emitted construct: `workSurface.url`).

- [ ] **Step 8: Correct the story's module comment where it now describes a local copy**

In `builder-workspace.stories.tsx`, inside the "OWNER FEEDBACK ROUND (folded in)" block, replace the opening of item 1 so it names the promotion. New text for the first two lines of item 1:

```
// 1. WORK-PANE CHROME. PROMOTED 2026-08-30 into the real component
//    `components/work-surface.tsx` (`WorkSurface`) — this story now RENDERS
//    that component instead of holding its own copy, so the approved design
//    and the shipped product cannot drift. Everything below is the recorded
//    reasoning for the design it carries; the component's own doc comment
//    repeats it at the code. It mirrors Lovable's browser chrome
//    (`elements/lovable.stories.tsx`'s preview toolbar, read line by line):
```

Leave the rest of item 1 and all of item 2 exactly as they are — item 2's `startCollapsed` reasoning is still true and is why `WorkSurface`'s `expanded` is controlled. **Do not touch the "cannot be expressed" paragraph in this task — Task 2 is what makes it false and Task 2 corrects it.**

- [ ] **Step 9: Run the full unit suite and typecheck**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
npx nx typecheck ui --skip-nx-cache
```

Expected: PASS / no errors. If typecheck reports a stale error over a file you did not touch, re-run `npm run typecheck` inside `packages/ui` before concluding anything — this command has been wrong in both directions.

- [ ] **Step 10: Commit**

```bash
git add packages/ui/src/components/work-surface.tsx packages/ui/src/components/work-surface.test.tsx packages/ui/src/index.ts packages/ui/src/elements/builder-workspace.stories.tsx
git commit -m "feat(ui): promote the Workspace story's pane chrome into a real WorkSurface component"
```

---

# Task 2: `workSurface` vocabulary + its cross-field rules + the builder's visibility registry

**Files:**
- Modify: `packages/ui/src/agent-tooling/construct/schema.ts` (the object after `aside`, ~line 387; `CROSS_FIELD_RULES`, ~line 448)
- Modify: `packages/ui/src/agent-tooling/construct/schema.test.ts` (the `CROSS_FIELD_RULES` id list, ~line 602)
- Modify: `packages/ui/src/components/construct-form-paths.ts` (`RuleVisibility`, line 183; `RULE_VISIBILITY`, line 194)
- Modify: `packages/ui/src/components/construct-form-paths.test.ts` (settled-treatments block, ~line 128)
- Modify: `packages/ui/src/components/builder-panel-derived.tsx` (line 647)
- Modify: `packages/ui/src/elements/builder-workspace.stories.tsx` (module comment + `WorkSurfaceSection`'s footer paragraph)
- Regenerate: `construct.v1.schema.json`, `apps/docs/public/schemas/construct/v1.json`

**Interfaces:**
- Produces: `Construct['workSurface']` — `{ kind: 'artifact' | 'preview'; url: string; codeUrl?: string; chrome?: { deviceToggle?: boolean; urlBar?: boolean; openInNewTab?: boolean; expand?: boolean; codeView?: boolean } } | undefined`. Tasks 3, 4, 5, 6, 7 and 8 all read this exact shape.
- Produces: `RuleVisibility`'s `hide-section` member gains `layout: string`.

**Why the visibility registry is in the SAME task as the schema:** `construct-form-paths.test.ts`'s key-set-equality test goes red the instant a `CROSS_FIELD_RULES` entry exists without a `RULE_VISIBILITY` entry, and the `workSurface` entry cannot typecheck until `RuleVisibility` is widened. Splitting them would leave a task that cannot end green.

- [ ] **Step 1: Write the failing schema tests**

Append to `packages/ui/src/agent-tooling/construct/schema.test.ts`:

```ts
describe('workSurface (2026-08-30 — the split pane gets vocabulary)', () => {
  const splitBase = { name: 'build-workspace', layout: 'split', provider: { mode: 'mock' } } as const;

  it('accepts the full shape on layout: split', () => {
    expect(
      validateConstruct({
        ...splitBase,
        workSurface: {
          kind: 'preview',
          url: '/work-surface.html',
          codeUrl: '/work-surface-source.html',
          chrome: { deviceToggle: true, urlBar: true, openInNewTab: true, expand: true, codeView: true },
        },
      }).ok,
    ).toBe(true);
  });

  it('accepts the minimum: kind + url', () => {
    expect(validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: '/work-surface.html' } }).ok).toBe(true);
  });

  it('requires url — an optional url reproduces the empty pane this key exists to remove', () => {
    expect(validateConstruct({ ...splitBase, workSurface: { kind: 'artifact' } }).ok).toBe(false);
  });

  it('rejects an unknown kind and an unknown key at both levels (vocabulary is closed)', () => {
    expect(validateConstruct({ ...splitBase, workSurface: { kind: 'browser', url: '/x' } }).ok).toBe(false);
    expect(validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: '/x', width: '50%' } }).ok).toBe(false);
    expect(validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: '/x', chrome: { zoom: true } } }).ok).toBe(false);
  });

  it('rejects workSurface on every non-split layout — loud, pathed, mirroring widget/aside', () => {
    for (const layout of ['widget', 'fullscreen', 'aside', 'custom'] as const) {
      const out = validateConstruct({
        name: 'acme-support',
        layout,
        provider: { mode: 'mock' },
        ...(layout === 'custom' ? { slots: ['header'] } : {}),
        workSurface: { kind: 'artifact', url: '/work-surface.html' },
      });
      expect(out.ok, layout).toBe(false);
      if (!out.ok) {
        expect(out.problems.find((p) => p.path === 'workSurface')?.message).toBe(
          '"workSurface" is only valid on layout: "split"',
        );
      }
    }
  });

  it('rejects a javascript: url — it reaches an iframe src', () => {
    const out = validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: 'javascript:alert(1)' } });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.problems.find((p) => p.path === 'workSurface.url')?.message).toBe(
        'url must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
      );
    }
  });

  it('rejects a data: codeUrl — same sink, same policy', () => {
    const out = validateConstruct({
      ...splitBase,
      workSurface: { kind: 'artifact', url: '/x.html', codeUrl: 'data:text/html,<script>1</script>', chrome: { codeView: true } },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'workSurface.codeUrl')).toBe(true);
  });

  it('codeView without codeUrl is rejected — a tab with nothing behind it is a dead affordance', () => {
    const out = validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: '/x.html', chrome: { codeView: true } } });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.problems.find((p) => p.path === 'workSurface.codeUrl')?.message).toBe(
        '"chrome.codeView" requires a codeUrl — the Code tab needs source to read',
      );
    }
  });

  it('codeUrl without codeView is rejected too — both directions loud, the history-endpoint-url precedent', () => {
    const out = validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: '/x.html', codeUrl: '/src.html' } });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.problems.find((p) => p.path === 'workSurface.codeUrl')?.message).toBe(
        'codeUrl is only valid with "chrome.codeView": true',
      );
    }
  });
});
```

Then update the existing `CROSS_FIELD_RULES` id-list test (`schema.test.ts` ~line 603): change `twelve rules` to `sixteen rules` in the `it` name and append the four new ids to the expected array, in source order:

```ts
      'history-endpoint-url',
      'work-surface-layout-scope',
      'work-surface-url',
      'work-surface-code-url',
      'work-surface-code-view',
    ]);
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema.test.ts
```

Expected: FAIL — the accept cases fail with `"workSurface" is not construct vocabulary`, and the id-list test fails with a 12-vs-16 array mismatch.

- [ ] **Step 3: Add the schema key**

In `packages/ui/src/agent-tooling/construct/schema.ts`, insert directly after the `aside` object (which ends `.strict().optional(),` at line 387) and before `shell`:

```ts
    /** Layout-scoped work-surface pane, `layout: 'split'` only (superRefine
     *  below, mirroring `widget`/`aside`). Fills the split's main region,
     *  which otherwise reserves a column and renders nothing — the defect
     *  this key exists to remove. Emitted as `<slot name="pane">` FALLBACK
     *  content, so a consumer projecting their own pane still WINS (native
     *  slot semantics: assigned nodes replace fallback).
     *
     *  Backed by `components/work-surface.tsx`'s `WorkSurface`, promoted from
     *  `elements/builder-workspace.stories.tsx` — the approved design AND a
     *  working implementation. Every key below is one real affordance that
     *  component ships; an affordance with no mechanism is not here.
     *
     *  TOP-LEVEL, not a capability: it is layout chrome, the same class as
     *  `widget`/`aside`, and the placement is forced by the gate as well —
     *  `scripts/verify-construct.mjs` can only layout-scope TOP-LEVEL keys
     *  (`TOP_LEVEL_LAYOUT_SCOPE`); a capability valid only on `split` would
     *  make every non-split capability cell fail validation.
     *
     *  `sandbox` is deliberately NOT exposed — the same reasoning
     *  `ArtifactCardData` already records: a surface someone else authored
     *  must not be able to widen its own sandbox. */
    workSurface: z
      .object({
        /** What the pane FRAMES it as. `'preview'` fills the canvas edge to
         *  edge (a browser preview); `'artifact'` centers the content in a
         *  bordered card on the muted backdrop (a framed artifact). Also
         *  picks the iframe's accessible title. It does NOT imply any
         *  chrome: every affordance below is stated explicitly, so what the
         *  builder panel shows and what the pane renders can never disagree. */
        kind: z.enum(['artifact', 'preview']),
        /** What the pane frames. REQUIRED — an optional url reproduces
         *  exactly the empty pane this round exists to remove. Reaches an
         *  iframe `src`, so isSafeUrl in superRefine below, the same shape
         *  as `widget.launcherIcon` / `empty.icon`. */
        url: z.string().min(1),
        /** What the Code tab frames. Coupled to `chrome.codeView` in BOTH
         *  directions (superRefine below): a tab with no source is a dead
         *  affordance, and a source with no tab is unreachable. Same url
         *  policy as `url`. */
        codeUrl: z.string().min(1).optional(),
        /** Per-affordance toolbar chrome. Each key is ONE affordance
         *  `WorkSurface` really ships; absent means OFF, the same
         *  off-by-default convention as every capability in this file. */
        chrome: z
          .object({
            /** Desktop/tablet/mobile canvas widths, scoping the PREVIEW
             *  branch only (never the Code view) — Lovable's own rule,
             *  carried through the story. */
            deviceToggle: z.boolean().optional(),
            /** The read-only address bar (lock icon + address text). */
            urlBar: z.boolean().optional(),
            /** The open-in-new-tab button. */
            openInNewTab: z.boolean().optional(),
            /** The expand toggle. Collapses the chat rail via
             *  WorkspaceShell's own controlled `startCollapsed` — NOT the
             *  kai-resizable maximize protocol, which WorkspaceShell does
             *  not carry (recorded in the story's own module comment). */
            expand: z.boolean().optional(),
            /** The Preview|Code segmented toggle. Requires `codeUrl`. */
            codeView: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
```

- [ ] **Step 4: Add the four cross-field rules**

Append to `CROSS_FIELD_RULES`, after `history-endpoint-url`:

```ts
  {
    id: 'work-surface-layout-scope',
    paths: ['layout', 'workSurface'],
    check: (construct, ctx) => {
      if (construct.workSurface && construct.layout !== 'split') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workSurface'],
          message: '"workSurface" is only valid on layout: "split"',
        });
      }
    },
  },
  {
    id: 'work-surface-url',
    paths: ['workSurface.url'],
    check: (construct, ctx) => {
      if (construct.workSurface && !isSafeUrl(construct.workSurface.url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workSurface', 'url'],
          message: 'url must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
        });
      }
    },
  },
  {
    id: 'work-surface-code-url',
    paths: ['workSurface.codeUrl'],
    check: (construct, ctx) => {
      const codeUrl = construct.workSurface?.codeUrl;
      if (codeUrl && !isSafeUrl(codeUrl)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workSurface', 'codeUrl'],
          message: 'codeUrl must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
        });
      }
    },
  },
  {
    id: 'work-surface-code-view',
    paths: ['workSurface.codeUrl', 'workSurface.chrome.codeView'],
    check: (construct, ctx) => {
      const ws = construct.workSurface;
      if (!ws) return;
      // Both directions loud, exactly like history-endpoint-url: a Code tab
      // with nothing behind it is a dead affordance, and a source with no tab
      // is unreachable. Neither is a state to guess a fix for.
      if (ws.chrome?.codeView && !ws.codeUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workSurface', 'codeUrl'],
          message: '"chrome.codeView" requires a codeUrl — the Code tab needs source to read',
        });
      }
      if (ws.codeUrl && !ws.chrome?.codeView) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workSurface', 'codeUrl'],
          message: 'codeUrl is only valid with "chrome.codeView": true',
        });
      }
    },
  },
```

- [ ] **Step 5: Widen `RuleVisibility` and register the four rules**

In `packages/ui/src/components/construct-form-paths.ts`, replace line 184:

```ts
  | { treatment: 'hide-section'; section: string }
```

with:

```ts
  // `layout` is EXPLICIT and not inferred from `section`. The panel used to
  // compare the section id against the construct's layout name, which worked
  // only because the `widget` and `aside` sections happen to be NAMED after
  // their layouts. A `workSurface` section scoped to layout `split` breaks
  // that coincidence, so the scope is stated.
  | { treatment: 'hide-section'; section: string; layout: string }
```

Update the two existing entries and add the four new ones in `RULE_VISIBILITY`:

```ts
  'widget-layout-scope': { treatment: 'hide-section', section: 'widget', layout: 'widget' },
  'aside-layout-scope': { treatment: 'hide-section', section: 'aside', layout: 'aside' },
```

```ts
  'work-surface-layout-scope': { treatment: 'hide-section', section: 'workSurface', layout: 'split' },
  'work-surface-url': { treatment: 'reject-only' },
  'work-surface-code-url': { treatment: 'reject-only' },
  'work-surface-code-view': { treatment: 'show-requires', path: 'workSurface.codeUrl' },
```

- [ ] **Step 6: Fix the panel's comparison**

In `packages/ui/src/components/builder-panel-derived.tsx`, replace lines 645–647:

```tsx
      // The rule's precondition: the section's key is layout-scoped; hide
      // unless the construct's layout matches the section id.
      if (props.value.layout !== vis.section) hidden.add(vis.section);
```

with:

```tsx
      // The rule's precondition: the section's key is layout-scoped; hide
      // unless the construct's layout matches the scope the rule STATES.
      // Never `vis.section` — that only ever worked because `widget` and
      // `aside` are named after their layouts, and `workSurface`/`split` is
      // not (2026-08-30).
      if (props.value.layout !== vis.layout) hidden.add(vis.section);
```

- [ ] **Step 7: Update the registry test's settled-treatments block**

In `packages/ui/src/components/construct-form-paths.test.ts`, replace the two `hide-section` assertions and add the new ones:

```ts
    expect(RULE_VISIBILITY['widget-layout-scope']).toEqual({ treatment: 'hide-section', section: 'widget', layout: 'widget' });
    expect(RULE_VISIBILITY['aside-layout-scope']).toEqual({ treatment: 'hide-section', section: 'aside', layout: 'aside' });
    expect(RULE_VISIBILITY['work-surface-layout-scope']).toEqual({
      treatment: 'hide-section',
      section: 'workSurface',
      layout: 'split',
    });
    expect(RULE_VISIBILITY['work-surface-code-view'].treatment).toBe('show-requires');
```

Add one more test to the same `describe`, which is the regression this round earned:

```ts
  it('every hide-section rule states a layout that is a real layout enum member — a section id is NOT a layout', () => {
    const layouts = (schemaNodeAt('layout') as unknown as { options: readonly string[] }).options;
    for (const [id, vis] of Object.entries(RULE_VISIBILITY)) {
      if (vis.treatment !== 'hide-section') continue;
      expect(layouts, `${id} scopes to a layout that does not exist`).toContain(vis.layout);
    }
  });
```

- [ ] **Step 8: Run the tests**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema.test.ts src/components/construct-form-paths.test.ts src/components/builder-panel-derived.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Regenerate the schema artifacts and prove no drift**

```bash
cd packages/ui && npm run build:api && npm run verify:generated
```

Expected: `gen-construct-schema.mjs` rewrites `src/agent-tooling/construct/construct.v1.schema.json` and `apps/docs/public/schemas/construct/v1.json` with the `workSurface` node; `verify:generated` reports byte-identical. `gen-construct-template-fixtures.mjs` also runs and should report no content change yet (the starters change in Task 5).

**`build:api` requires a build first if `dist/` is stale.** If it errors, run `npx nx build ui` from the repo root and retry. **Never run `gen-llms.mjs` standalone** — `build:api` already wrote what it needs.

- [ ] **Step 10: Correct the story's now-false vocabulary claims**

Two sites in `packages/ui/src/elements/builder-workspace.stories.tsx` now claim gaps that have closed.

**(a)** In the module comment's "THE WORK PANE'S CONTENT HAS NO CONSTRUCT VOCABULARY" block, replace the second bullet ("What CANNOT be expressed: …") with:

```
//  - CLOSED 2026-08-30 (`workSurface`, see schema.ts): the pane's OWN CHROME
//    is construct vocabulary now — `workSurface.chrome.deviceToggle` /
//    `urlBar` / `openInNewTab` / `expand` / `codeView`, plus `kind` and a
//    required `url` — and the app header's ACTIONS have been
//    `header.actions` since T-5 shipped, so that half of this note was
//    already stale before this round.
//  - STILL NOT EXPRESSIBLE: the pane's CONTENT beyond a url (a construct
//    cannot author the framed document — model-produced artifacts need a
//    `kind` on `cards`, a card->pane route, and a mock responder that
//    scripts a tool call, none of which exist), and all four composer knobs
//    (chips, menu, attachments-applying, mic). Those controls still write to
//    local signals only, never to `BuilderConstruct` — the Raw JSON section
//    not reflecting them is the honest tell.
```

**(b)** In `WorkSurfaceSection`'s footer `<p>` (~line 787), replace its text with:

```tsx
      <p class="text-xs text-muted-foreground">
        These map onto real construct vocabulary as of 2026-08-30 — <code>workSurface.kind</code>, <code>url</code> and{' '}
        <code>chrome.*</code> (see <code>schema.ts</code>). This story drives the same <code>WorkSurface</code> component the
        emitted app does, with stub content in place of a framed url. Turning off Code view removes the Preview|Code toggle
        entirely — a preview-only workspace, not just a disabled control.
      </p>
```

- [ ] **Step 11: Full unit suite + typecheck**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
npx nx typecheck ui --skip-nx-cache
```

- [ ] **Step 12: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/schema.ts packages/ui/src/agent-tooling/construct/schema.test.ts packages/ui/src/agent-tooling/construct/construct.v1.schema.json apps/docs/public/schemas/construct/v1.json packages/ui/src/components/construct-form-paths.ts packages/ui/src/components/construct-form-paths.test.ts packages/ui/src/components/builder-panel-derived.tsx packages/ui/src/elements/builder-workspace.stories.tsx
git commit -m "feat(construct): workSurface vocabulary, layout-scoped to split, with its four cross-field rules"
```

---

# Task 3: Repair the emit-chain gate

**Files:**
- Modify: `packages/ui/scripts/verify-construct.mjs` (`TOP_LEVEL_VALUES`, line 186; `TOP_LEVEL_LAYOUT_SCOPE`, line 209)

**Interfaces:**
- Consumes: `Construct['workSurface']` from Task 2.

**Why now, and not with codegen:** `missingValuers` (line 198) hard-fails on ANY new top-level schema key with no valuer, regardless of what codegen does with it. `verify:construct` is red from the moment Task 2 lands. This task is three lines and must not lag.

- [ ] **Step 1: Add the valuer**

In `packages/ui/scripts/verify-construct.mjs`, add to `TOP_LEVEL_VALUES` after the `shell` entry:

```js
  // codeUrl + chrome.codeView travel TOGETHER (schema rule
  // work-surface-code-view rejects either alone), and both urls are relative
  // so the probe never reaches the network.
  workSurface: {
    kind: 'preview',
    url: '/work-surface.html',
    codeUrl: '/work-surface-source.html',
    chrome: { deviceToggle: true, urlBar: true, openInNewTab: true, expand: true, codeView: true },
  },
```

And replace line 209:

```js
const TOP_LEVEL_LAYOUT_SCOPE = { widget: 'widget', aside: 'aside', workSurface: 'split' };
```

- [ ] **Step 2: Prove the harness still detects**

```bash
cd packages/ui && node scripts/verify-construct.mjs --self-test
```

Expected: the self-test's three probes report detection and exit 0.

- [ ] **Step 3: Run the real gate**

```bash
npx nx build ui
cd packages/ui && npm run verify:construct
```

Expected: PASS. This ejects, installs, tsc-compiles, vite-builds and consumer-bundles every derived cell plus all seven named template fixtures. It takes minutes and needs the network. **Run it in the foreground and paste the raw tail of its output in your report** — including the cell count it prints, which is derived, not a number this plan states.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/scripts/verify-construct.mjs
git commit -m "test(construct): cover workSurface in verify:construct's top-level axis, scoped to split"
```

---

# Task 4: Codegen emits a pane that renders

**Files:**
- Modify: `packages/ui/src/agent-tooling/construct/codegen.ts` — `generateProject` (189), `emitLayoutImport` (1702), `emitLayoutOpen` (1831), `emitLayoutClose` (1869), `needsHost` (1787), `emitSolidJsImports` (1438), `emitHeaderEndContentProp` (1140)
- Modify: `packages/ui/src/agent-tooling/construct/codegen.test.ts`
- Modify: `packages/ui/src/agent-tooling/construct/cli.ts`, `cli.test.ts`, `dev.ts`

**Interfaces:**
- Consumes: `Construct['workSurface']` (Task 2), `WorkSurface` from `@kitn.ai/ui/solid` (Task 1).
- Produces: `workSurfaceProjectionNotice(construct): string | null`, `splitWithoutWorkSurfaceNotice(construct): string | null` — exported from `cli.ts`, used by `dev.ts` and asserted by `cli.test.ts`.
- Produces: the emitted file `public/work-surface.html` (constant path).

**This is the task that makes a rendering pane possible; Task 5 is what turns it on for the owner's Workspace template.**

- [ ] **Step 1: Write the failing codegen tests**

Append to `packages/ui/src/agent-tooling/construct/codegen.test.ts`:

```ts
describe('workSurface — the split pane renders (2026-08-30)', () => {
  const ws = (over: Record<string, unknown> = {}) =>
    construct({
      layout: 'split',
      workSurface: { kind: 'artifact', url: '/work-surface.html', chrome: { expand: true }, ...over },
    } as never);

  it('imports WorkSurface only when workSurface is declared (the emitted project runs noUnusedLocals)', () => {
    expect(file(generateProject(ws()), 'src/App.tsx')).toContain(', WorkSurface');
    expect(file(generateProject(construct({ layout: 'split' })), 'src/App.tsx')).not.toContain('WorkSurface');
  });

  it('emits the surface as <slot name="pane"> FALLBACK, so a consumer projection still wins', () => {
    const app = file(generateProject(ws()), 'src/App.tsx');
    expect(app).toMatch(/<slot name="pane">[^]*<WorkSurface[^]*<\/slot>/);
    expect(app).toContain('projection WINS');
  });

  it('follows the story: chat is the resizable START rail, the surface fills the main region', () => {
    const app = file(generateProject(ws()), 'src/App.tsx');
    expect(app).toContain('startWidth={360}');
    expect(app).toContain('startMinWidth={280}');
    expect(app).toContain('startMaxWidth={520}');
    expect(app).toMatch(/start=\{[^]*<ChatThread/);
  });

  it('threads url, kind and every chrome flag through as real props', () => {
    const app = file(
      generateProject(ws({ kind: 'preview', chrome: { deviceToggle: true, urlBar: true, openInNewTab: true, expand: true } })),
      'src/App.tsx',
    );
    expect(app).toContain('src={"/work-surface.html"}');
    expect(app).toContain('variant="preview"');
    expect(app).toContain('iframeTitle={"App preview"}');
    expect(app).toContain('showDeviceToggle={true}');
    expect(app).toContain('showUrlBar={true}');
    expect(app).toContain('showOpenInNewTab={true}');
    expect(app).toContain('showExpand={true}');
    expect(app).toContain('showCodeView={false}');
  });

  it('kind: artifact gets the framed-card look and its own iframe title', () => {
    const app = file(generateProject(ws()), 'src/App.tsx');
    expect(app).toContain('variant="artifact"');
    expect(app).toContain('iframeTitle={"Work surface"}');
  });

  it('an absent chrome key emits false — off-by-default, never an implicit prop', () => {
    const app = file(generateProject(ws({ chrome: undefined })), 'src/App.tsx');
    expect(app).toContain('showDeviceToggle={false}');
    expect(app).toContain('showExpand={false}');
  });

  it('expand is wired to WorkspaceShell.startCollapsed, the mechanism the story ruled on', () => {
    const app = file(generateProject(ws()), 'src/App.tsx');
    expect(app).toContain('const [surfaceExpanded, setSurfaceExpanded] = createSignal(false)');
    expect(app).toContain('startCollapsed={surfaceExpanded()}');
    expect(app).toContain('onExpandedChange={setSurfaceExpanded}');
  });

  it('codeView threads codeSrc through', () => {
    const app = file(generateProject(ws({ codeUrl: '/src.html', chrome: { codeView: true } })), 'src/App.tsx');
    expect(app).toContain('showCodeView={true}');
    expect(app).toContain('codeSrc={"/src.html"}');
  });

  it('emits public/work-surface.html at a CONSTANT path for a relative url — never derived from construct text', () => {
    expect(generateProject(ws()).map((f) => f.path)).toContain('public/work-surface.html');
    const html = file(generateProject(ws()), 'public/work-surface.html');
    expect(html).toContain('Your work surface');
    expect(file(generateProject(ws({ kind: 'preview' })), 'public/work-surface.html')).toContain('Your app preview');
  });

  it('does NOT emit the placeholder for an absolute url — that page is somebody else\'s', () => {
    expect(generateProject(ws({ url: 'https://example.com/app' })).map((f) => f.path)).not.toContain(
      'public/work-surface.html',
    );
  });

  it('a path-traversal url cannot move the write target — the filename is a constant', () => {
    const files = generateProject(ws({ url: '/../../etc/passwd' }));
    expect(files.filter((f) => f.path.startsWith('public/')).map((f) => f.path)).toEqual(['public/work-surface.html']);
  });

  it('split WITHOUT workSurface: the empty pane no longer reserves a column', () => {
    const app = file(generateProject(construct({ layout: 'split' })), 'src/App.tsx');
    expect(app).toContain('<slot name="pane" />');
    expect(app).toContain('paneProjected()');
    expect(app).toContain('MutationObserver');
    expect(app).toContain('end={paneProjected()');
  });

  it('header actions carry a once-per-label DEV reminder naming the seam', () => {
    const app = file(
      generateProject(construct({ header: { title: 'X', actions: [{ label: 'Share' }] } } as never)),
      'src/App.tsx',
    );
    expect(app).toContain('import.meta.env.DEV');
    expect(app).toContain("addEventListener('kai-header-action'");
    expect(app).toContain('dispatchHeaderAction');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/codegen.test.ts
```

Expected: FAIL on every new case.

- [ ] **Step 3: Add the work-surface emitters to `codegen.ts`**

Insert above `emitLayoutOpen` (line 1831):

```ts
/** The construct's declared work surface, or undefined. Layout-narrowed once,
 *  here, so every call site below reads plainly. */
function workSurfaceOf(c: Construct): NonNullable<Construct['workSurface']> | undefined {
  return c.layout === 'split' ? c.workSurface : undefined;
}

/** `kind` -> the two things it really decides: how `WorkSurface` frames its
 *  content, and the framed document's accessible title. It decides NO chrome:
 *  every chrome affordance is stated explicitly in the construct, so what the
 *  builder panel shows and what the pane renders can never disagree (a
 *  kind-dependent default cannot be expressed in the panel's own
 *  ANCHORED_BOOLEAN_DEFAULTS, and a panel that misreports a switch is exactly
 *  the menu-honesty failure this format's rules reject). */
const WORK_SURFACE_IFRAME_TITLE: Record<'artifact' | 'preview', string> = {
  artifact: 'Work surface',
  preview: 'App preview',
};

/** Declares the signal `WorkSurface`'s expand toggle writes and
 *  `WorkspaceShell`'s controlled `startCollapsed` reads. A SIGNAL, not a
 *  closure variable: both are read reactively every render. Gated on
 *  `chrome.expand` — no toggle, nothing to declare, and the emitted project
 *  runs `noUnusedLocals`. */
function emitWorkSurfaceVars(c: Construct, indent: string): string {
  return workSurfaceOf(c)?.chrome?.expand
    ? `${indent}// workSurface.chrome.expand -> WorkspaceShell's own CONTROLLED startCollapsed
${indent}// (collapse the chat rail, click again to restore). NOT the kai-resizable
${indent}// maximize protocol: WorkspaceShell does not forward maximizedIndex/
${indent}// onMaximizeChange — see components/work-surface.tsx's doc comment.
${indent}const [surfaceExpanded, setSurfaceExpanded] = createSignal(false);\n`
    : '';
}

/** The `<WorkSurface …>` element itself. `url`/`codeUrl` are construct-authored
 *  untrusted text (isSafeUrl'd at authoring time by schema.ts's superRefine),
 *  so both are JSON.stringify'd into real JS string-literal expressions here,
 *  never raw JSX attribute strings. Every chrome flag is emitted EXPLICITLY,
 *  true or false, so the gating decision is visible in the eject artifact
 *  rather than inferred from an absent prop — the same convention
 *  `webSearch={false}`/`voice={false}` already follow above. */
function emitWorkSurface(c: Construct, indent: string): string {
  const ws = workSurfaceOf(c);
  if (!ws) return '';
  const chrome = ws.chrome ?? {};
  const flag = (name: string, on: boolean | undefined): string => `${indent}  ${name}={${on === true}}\n`;
  return (
    `${indent}<WorkSurface\n` +
    `${indent}  src={${JSON.stringify(ws.url)}}\n` +
    `${indent}  variant="${ws.kind}"\n` +
    `${indent}  iframeTitle={${JSON.stringify(WORK_SURFACE_IFRAME_TITLE[ws.kind])}}\n` +
    (chrome.urlBar ? `${indent}  urlLabel={${JSON.stringify(ws.url)}}\n` : '') +
    (ws.codeUrl ? `${indent}  codeSrc={${JSON.stringify(ws.codeUrl)}}\n` : '') +
    flag('showDeviceToggle', chrome.deviceToggle) +
    flag('showUrlBar', chrome.urlBar) +
    flag('showOpenInNewTab', chrome.openInNewTab) +
    flag('showExpand', chrome.expand) +
    flag('showCodeView', chrome.codeView) +
    (chrome.expand
      ? `${indent}  expanded={surfaceExpanded()}\n${indent}  onExpandedChange={setSurfaceExpanded}\n`
      : '') +
    `${indent}/>\n`
  );
}

/** Whether `workSurface.url` points at something this project should SHIP.
 *  Relative only: an absolute url is somebody else's page and writing a
 *  placeholder for it would be a lie. */
function workSurfaceUrlIsRelative(url: string): boolean {
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !url.startsWith('//');
}

/** The starting page a relative `workSurface.url` frames, so a builder preview
 *  renders something real with no network at all.
 *
 *  THE FILENAME IS A CONSTANT, never derived from `url`: deriving a WRITE PATH
 *  from construct-authored text would open a path-traversal sink that does not
 *  exist today. `writeProject`'s manifest pruning deletes this file on its own
 *  when `workSurface` is removed.
 *
 *  Styling is hard-coded and self-contained, not tokens: this document loads
 *  inside a sandboxed iframe with no `allow-same-origin`, so it cannot see the
 *  host's custom properties at all. */
const WORK_SURFACE_PAGE = 'public/work-surface.html';

function emitWorkSurfacePage(c: Construct): string {
  const ws = workSurfaceOf(c)!;
  const headline = ws.kind === 'artifact' ? 'Your work surface' : 'Your app preview';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${headline}</title>
  </head>
  <body style="margin: 0; background: #f8fafc; color: #0f172a; font: 15px/1.6 system-ui, -apple-system, sans-serif;">
    <main style="max-width: 34rem; margin: 0 auto; padding: 3.5rem 1.5rem;">
      <h1 style="margin: 0 0 0.5rem; font-size: 1.125rem; font-weight: 600;">${headline}</h1>
      <p style="margin: 0 0 1rem; color: #64748b;">
        This placeholder ships with the construct so the pane renders offline, with no network and no backend.
      </p>
      <p style="margin: 0; color: #64748b;">
        Replace it by pointing <code>workSurface.url</code> at your own page &mdash; or project your own markup as a
        <code>&lt;slot name="pane"&gt;</code> child of the element, which wins over this pane entirely.
      </p>
    </main>
  </body>
</html>
`;
}
```

- [ ] **Step 4: Wire the file into `generateProject`**

In `generateProject` (line 200), after the `cards` line:

```ts
  const ws = workSurfaceOf(construct);
  if (ws && workSurfaceUrlIsRelative(ws.url)) {
    files.push({ path: WORK_SURFACE_PAGE, code: emitWorkSurfacePage(construct) });
  }
```

- [ ] **Step 5: Rewrite the split layout emit**

Replace `emitLayoutImport`'s `split` case (line 1706-1707):

```ts
    case 'split':
      return workSurfaceOf(c) ? ', WorkspaceShell, WorkSurface' : ', WorkspaceShell';
```

Replace `emitLayoutOpen`'s `split` case (lines 1857–1863) with:

```ts
    case 'split': {
      const ws = workSurfaceOf(c);
      // drawerBelow: split's mobile takeover is the kit's OWN WorkspaceShell
      // capability, not hand-rolled CSS. 480 matches Dock's own breakpoint
      // (ui/dock.tsx:229) so every layout takes over at the same width.
      if (!ws) {
        // No work surface: the end pane is a PURE PROJECTION SEAM. It must not
        // reserve a column around nothing — WorkspaceShell's own `showAside`
        // is `!!props.end`, and a wrapper div is truthy even when nothing is
        // projected, which is exactly the empty column this round removes.
        // The check reads the LIGHT DOM (the host's own [slot="pane"]
        // children), not the <slot>: a slot inside a collapsed column is
        // unmounted, so a slotchange listener there could never fire itself
        // back on. Only ELEMENTS can carry a slot attribute, so an element
        // query is the whole test for a NAMED slot.
        return `    <div style={{ height: '100dvh' }}>\n      <WorkspaceShell class="h-full" drawerBelow={480} end={paneProjected() ? (\n        <div style={{ height: '100%', overflow: 'auto' }}>\n          <slot name="pane" />\n        </div>\n      ) : undefined}>\n`;
      }
      return `    <div style={{ height: '100dvh' }}>\n      <WorkspaceShell class="h-full" drawerBelow={480} startWidth={360} startMinWidth={280} startMaxWidth={520}${
        ws.chrome?.expand ? ' startCollapsed={surfaceExpanded()}' : ''
      } start={\n        <div style={{ height: '100%', minHeight: '0', display: 'flex', 'flex-direction': 'column' }}>\n`;
    }
```

Replace `emitLayoutClose`'s `split` case (lines 1877–1885) with:

```ts
    case 'split': {
      const ws = workSurfaceOf(c);
      if (!ws) {
        return `      </WorkspaceShell>\n    </div>\n`;
      }
      // The chat is the resizable START rail and the work surface fills the
      // MAIN region — WorkspaceShell makes `children` the larger of the two,
      // which is the arrangement builder-workspace.stories.tsx ships and the
      // owner approved. The surface is <slot name="pane"> FALLBACK content:
      // native slot semantics mean an assigned node replaces it, so a
      // consumer's own projection still WINS.
      return `        </div>\n      }>\n        {/* Your own <slot name="pane"> projection WINS over this: assigned nodes\n            replace fallback content. The construct's work surface is the\n            DEFAULT, not an override. */}\n        <slot name="pane">\n${emitWorkSurface(c, '          ')}        </slot>\n      </WorkspaceShell>\n    </div>\n`;
    }
```

**Note on declared `slots` under this arrangement:** `emitApp` emits `emitSlots(c.slots, '      ')` between layout-open and `ChatThread`, so a split+workSurface construct's declared slots render inside the chat rail, above the thread. That is still "above the chat", the same relative position as before. Add this line to the emitted comment above `<slot name="pane">` so it is stated, not discovered.

- [ ] **Step 6: Declare the light-DOM pane probe**

Add above `needsHost` (line 1787):

```ts
/** `layout: 'split'` with no `workSurface`: the emitted App needs the host to
 *  see whether anything is projected into the pane (see emitLayoutOpen's split
 *  case for why the light DOM and not a slotchange listener). */
function splitNeedsPaneProbe(c: Construct): boolean {
  return c.layout === 'split' && !c.workSurface;
}

/** The `paneProjected` signal + its MutationObserver, declared inside App()
 *  for the same instance-isolation reason as every other var-emitter here. */
function emitPaneProbeVar(c: Construct, indent: string): string {
  if (!splitNeedsPaneProbe(c)) return '';
  return `${indent}// Does the consumer project anything into <slot name="pane">? Read the
${indent}// HOST's own light-DOM children: that is observable whether or not the
${indent}// column (and with it the <slot>) is currently mounted, so it cannot
${indent}// deadlock the way a slotchange listener on an unmounted slot would.
${indent}const [paneProjected, setPaneProjected] = createSignal(false);
${indent}onMount(() => {
${indent}  const sync = () => setPaneProjected(props.host.querySelector(':scope > [slot="pane"]') !== null);
${indent}  const observer = new MutationObserver(sync);
${indent}  observer.observe(props.host, { childList: true });
${indent}  sync();
${indent}  onCleanup(() => observer.disconnect());
${indent}});
`;
}
```

Widen `needsHost` (line 1788):

```ts
function needsHost(c: Construct): boolean {
  return hasThemeToggleChrome(c) || hasHeaderActionsChrome(c) || hasUserMenuChrome(c) || splitNeedsPaneProbe(c);
}
```

Widen `emitSolidJsImports` (lines 1440–1442):

```ts
  if (needsCreateEffect(c)) names.push('createEffect');
  if (widgetHasConversationsChrome(c) || hasShellPalette(c) || splitNeedsPaneProbe(c) || workSurfaceOf(c)?.chrome?.expand) {
    names.push('createSignal');
  }
  if (hasShellPalette(c)) names.push('Show');
  if (hasShellPalette(c) || splitNeedsPaneProbe(c)) names.push('onMount', 'onCleanup');
```

*(`Show` splits out of the `onMount`/`onCleanup` group because the pane probe needs the lifecycle helpers but no `Show`; `noUnusedLocals` in the emitted project catches the mistake either way.)*

Splice both new var-emitters into `emitApp`'s var line (line 718), before `  return (`:

```ts
${emitToggleThemeVar(c, '  ')}${emitDockCloseVar(c, '  ')}${emitChatControllerVar(c, '  ')}${emitConversationsSignalsVar(c, '  ')}${emitShellPaletteVars(c, '  ')}${emitPaneProbeVar(c, '  ')}${emitWorkSurfaceVars(c, '  ')}${emitHeaderActionDispatchVar(c, '  ')}  return (
```

- [ ] **Step 7: The header-action DEV reminder (S-11)**

Add beside the other var-emitters:

```ts
/** header.actions dispatch `kai-header-action` and nothing in the emitted app
 *  listens — clicking Share/Deploy in a builder preview does nothing. That is
 *  the dead-affordance class T-5 ruling 3 rejected `voice` for, so it is
 *  STATED rather than left to be discovered.
 *
 *  It is a once-per-label REMINDER, not a detection: the DOM has no API that
 *  reports whether a listener is attached (`dispatchEvent`'s return value only
 *  reports preventDefault(), which no listener is obliged to call), so a
 *  "nobody is listening" claim would be false on correct code. DEV only —
 *  `import.meta.env.DEV`, and the emitted tsconfig already carries
 *  `types: ['vite/client']`. */
function emitHeaderActionDispatchVar(c: Construct, indent: string): string {
  if (!hasHeaderActionsChrome(c)) return '';
  return `${indent}// Each header action dispatches 'kai-header-action' on the host and nothing
${indent}// here handles it — that is the consumer's seam, by design (vocabulary
${indent}// never logic). The DEV line below is a one-time reminder per label, NOT a
${indent}// listener check: the DOM cannot report whether a listener exists.
${indent}const warnedHeaderActions = new Set<string>();
${indent}const dispatchHeaderAction = (label: string) => {
${indent}  if (import.meta.env.DEV && !warnedHeaderActions.has(label)) {
${indent}    warnedHeaderActions.add(label);
${indent}    console.warn(\`[${c.name}] header action "\${label}" dispatched 'kai-header-action' on the host. Nothing happens until your app listens: el.addEventListener('kai-header-action', (e) => …).\`);
${indent}  }
${indent}  props.host.dispatchEvent(new CustomEvent('kai-header-action', { detail: { label } }));
${indent}};
`;
}
```

Replace the inline handler in `emitHeaderEndContentProp` (line 1155):

```ts
      pieces.push(
        `<Button${variant} size="sm" onClick={() => dispatchHeaderAction(${JSON.stringify(a.label)})}>{${JSON.stringify(a.label)}}</Button>`,
      );
```

- [ ] **Step 8: Add the two CLI notices**

In `packages/ui/src/agent-tooling/construct/cli.ts`, after `homeRecentConversationWarning`:

```ts
/** Decide loudly (W-6): the work surface is slot FALLBACK, so a consumer
 *  projecting their own pane REPLACES it. That is the intended behaviour and
 *  the one thing a reader cannot infer from the construct file alone. */
export function workSurfaceProjectionNotice(construct: Construct): string | null {
  if (!construct.workSurface) return null;
  return 'note: workSurface renders as <slot name="pane"> fallback — a child with slot="pane" projected by the consumer replaces it.';
}

/** The other half, equally loud: a split with no work surface has no second
 *  column until something is projected. Silence here is what made the empty
 *  pane look like a bug rather than a choice. */
export function splitWithoutWorkSurfaceNotice(construct: Construct): string | null {
  if (construct.layout !== 'split' || construct.workSurface) return null;
  return 'note: layout "split" with no workSurface — the pane stays hidden until a child with slot="pane" is projected. Add a workSurface to render one.';
}
```

Print both wherever `accentContrastNotice` already prints: `runCli`'s `validate` case (after the `homeRecentConversationWarning` line) and its `eject` case (after `const notice = …`), and `dev.ts` lines 76–77 and 120–121. Factor the three lines into one local helper in each file rather than repeating the pair:

```ts
for (const n of [accentContrastNotice(construct), workSurfaceProjectionNotice(construct), splitWithoutWorkSurfaceNotice(construct)]) {
  if (n) io.log(n);
}
```

Add to `cli.test.ts`:

```ts
describe('work-surface notices (decide loudly)', () => {
  it('states that projection wins when a workSurface is declared', () => {
    const c = validateConstruct({
      name: 'build-workspace', layout: 'split', provider: { mode: 'mock' },
      workSurface: { kind: 'artifact', url: '/work-surface.html' },
    });
    if (!c.ok) throw new Error('fixture invalid');
    expect(workSurfaceProjectionNotice(c.construct)).toContain('slot name="pane"');
    expect(splitWithoutWorkSurfaceNotice(c.construct)).toBeNull();
  });

  it('states that a bare split has no pane until something is projected', () => {
    const c = validateConstruct({ name: 'bare-split', layout: 'split', provider: { mode: 'mock' } });
    if (!c.ok) throw new Error('fixture invalid');
    expect(splitWithoutWorkSurfaceNotice(c.construct)).toContain('stays hidden');
    expect(workSurfaceProjectionNotice(c.construct)).toBeNull();
  });

  it('says nothing on a layout that has no pane at all', () => {
    const c = validateConstruct({ name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } });
    if (!c.ok) throw new Error('fixture invalid');
    expect(workSurfaceProjectionNotice(c.construct)).toBeNull();
    expect(splitWithoutWorkSurfaceNotice(c.construct)).toBeNull();
  });
});
```

- [ ] **Step 9: Run the tests**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/
```

Expected: PASS. The pre-existing split tests at `codegen.test.ts:614-620` and `638-643` must still pass unchanged — `end={`, `<slot name="pane" />`, `drawerBelow={480}` and "no `PaneGroup`" all still hold.

- [ ] **Step 10: Full suite, typecheck, emitted-code guards**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
npx nx typecheck ui --skip-nx-cache
```

`--project=emitted` is a separate CI step; a green `--project=unit` is not the merge gate.

- [ ] **Step 11: Prove the emitted project really compiles and builds**

```bash
npx nx build ui
cd packages/ui && npm run verify:construct
```

This is the gate that catches an emitted `noUnusedLocals` violation, a bad import, or an `import.meta.env` type error — none of which any unit test in this tree can see.

- [ ] **Step 12: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/codegen.ts packages/ui/src/agent-tooling/construct/codegen.test.ts packages/ui/src/agent-tooling/construct/cli.ts packages/ui/src/agent-tooling/construct/cli.test.ts packages/ui/src/agent-tooling/construct/dev.ts
git commit -m "feat(construct): emit a rendering work surface for split, and stop reserving an empty column without one"
```

---

# Task 5: Starter defaults, neutral accents, manifests and hints — THE VOID DIES HERE

**Files:**
- Modify: `packages/ui/src/agent-tooling/construct/templates.ts`
- Modify: `packages/ui/src/agent-tooling/construct/templates.test.ts`
- Regenerate: all seven `fixtures/templates/*.construct.json`

**Interfaces:**
- Produces: `TemplateControlSection.hints?: Readonly<Record<string, string>>` — Task 7 renders it.
- Consumes: `Construct['workSurface']` (Task 2).

- [ ] **Step 1: Write the failing starter tests**

In `packages/ui/src/agent-tooling/construct/templates.test.ts`, replace the composer-triggers test in `describe('starter content rules …')` and append the new rules:

```ts
  it('composer.triggers ship on exactly the two agentic shapes (Workspace and the in-app assistant)', () => {
    const withTriggers = buildableTemplates()
      .filter((t) => [t.starter, ...(t.variants ?? []).map((v) => v.starter)].some((s) => s.composer?.triggers !== undefined))
      .map((t) => t.id);
    expect(withTriggers.sort()).toEqual(['inAppAssistant', 'workspace']);
  });

  it('no starter pre-commits anybody\'s brand: theme.accent and theme.unreadColor are omitted everywhere (S-7/S-8)', () => {
    for (const { name, starter } of starterCases) {
      expect(starter.theme?.accent, `${name} carries an accent`).toBeUndefined();
      expect(starter.theme?.unreadColor, `${name} carries an unreadColor`).toBeUndefined();
    }
  });

  it('everything free, local and reversible ships ON — a person cannot switch off an option they never saw (S-2)', () => {
    for (const { name, starter } of starterCases) {
      expect(starter.capabilities?.starters?.length, name).toBeGreaterThan(0);
      expect(starter.capabilities?.attachments, name).toBeDefined();
      expect(starter.capabilities?.history?.persistence, name).toBe('local');
      expect(starter.capabilities?.conversations, name).toBe(true);
      expect(starter.capabilities?.reasoning, name).toBe('full');
      expect(starter.capabilities?.messageActions, name).toEqual({
        user: ['edit'],
        assistant: ['copy', 'like', 'dislike'],
      });
      expect(starter.empty, name).toBeDefined();
    }
  });

  it('anything needing a backend or an invoice stays OFF (S-3)', () => {
    for (const { name, starter } of starterCases) {
      expect(starter.provider, name).toEqual({ mode: 'mock' });
      expect(starter.capabilities?.history?.url, name).toBeUndefined();
      expect(starter.capabilities?.reasoningOpen, name).toBeUndefined();
      expect(starter.cards, name).toBeUndefined();
    }
  });

  it('every hint is keyed by a path its own section actually edits — a hint on a control nobody renders is invisible', () => {
    for (const t of buildableTemplates()) {
      for (const s of t.controls) {
        for (const path of Object.keys(s.hints ?? {})) {
          expect(s.paths, `${t.id}/${s.id}: hint on "${path}"`).toContain(path);
        }
      }
    }
  });

  it('every template offers an Empty-state section, so the starter\'s own empty copy is editable (S-5)', () => {
    for (const t of buildableTemplates()) {
      expect(t.controls.map((s) => s.id), t.id).toContain('empty');
    }
  });

  it('Workspace offers the Work surface section (S-5), and no other template does', () => {
    for (const t of buildableTemplates()) {
      expect(t.controls.some((s) => s.id === 'workSurface'), t.id).toBe(t.id === 'workspace');
    }
  });
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/templates.test.ts
```

Expected: FAIL on accents, defaults-on, sections and hints.

- [ ] **Step 3: Add `hints` to `TemplateControlSection`**

In `templates.ts`, replace the interface at line 46:

```ts
export interface TemplateControlSection {
  id: string;
  paths: readonly string[];
  /** Path-keyed one-liners rendered under the control, saying why the
   *  starter leaves it off ON PURPOSE (S-4). A section's PRESENCE is the
   *  discovery surface; a hint is why the default inside it is off. Data,
   *  not vocabulary (T-3) — every key must be one of this section's own
   *  `paths`, which templates.test.ts pins. */
  hints?: Readonly<Record<string, string>>;
}
```

- [ ] **Step 4: Rewrite the shared section manifests**

Replace the constants at lines 79–108 with:

```ts
const EMPTY: TemplateControlSection = { id: 'empty', paths: ['empty.title', 'empty.description', 'empty.icon'] };
const HOME: TemplateControlSection = { id: 'home', paths: ['home'] };
const CAPABILITIES: TemplateControlSection = {
  id: 'capabilities',
  paths: [
    'capabilities.starters',
    'capabilities.attachments',
    'capabilities.history',
    'capabilities.conversations',
    'capabilities.reasoning',
    'capabilities.reasoningOpen',
  ],
  hints: {
    'capabilities.history':
      'Endpoint needs a thread route you host. Local keeps history in this browser — no backend, nothing metered.',
    'capabilities.reasoningOpen':
      'Off by owner ruling (2026-08-26): the thinking panel starts closed and opens on click.',
  },
};
const MESSAGE_ACTIONS: TemplateControlSection = {
  id: 'messageActions',
  paths: ['capabilities.messageActions.user', 'capabilities.messageActions.assistant'],
};
const SOURCES: TemplateControlSection = { id: 'sources', paths: ['capabilities.sources.strip'] };
const WIDGET_CHROME: TemplateControlSection = {
  id: 'widget',
  paths: ['widget.position', 'widget.launcherIcon', 'widget.defaultOpen'],
};
const ASIDE: TemplateControlSection = { id: 'aside', paths: ['aside.position', 'aside.width'] };
const WORK_SURFACE: TemplateControlSection = {
  id: 'workSurface',
  paths: [
    'workSurface.kind',
    'workSurface.url',
    'workSurface.codeUrl',
    'workSurface.chrome.deviceToggle',
    'workSurface.chrome.urlBar',
    'workSurface.chrome.openInNewTab',
    'workSurface.chrome.expand',
    'workSurface.chrome.codeView',
  ],
  hints: {
    'workSurface.codeUrl':
      'The Code tab reads source from this URL. Leave it blank and the tab stays hidden — a preview-only surface.',
  },
};
const COMPOSER_TRIGGERS: TemplateControlSection = {
  id: 'composerTriggers',
  paths: ['composer.triggers.slash', 'composer.triggers.mention'],
};
const SHELL: TemplateControlSection = { id: 'shell', paths: ['shell.commandPalette', 'shell.userMenu'] };
const CARDS: TemplateControlSection = {
  id: 'cards',
  paths: ['cards'],
  hints: { cards: 'Cards arrive as tool calls from a model — the mock provider never emits one.' },
};
const PROVIDER: TemplateControlSection = {
  id: 'provider',
  paths: ['provider'],
  hints: { provider: 'Endpoint needs your own chat route. Mock streams locally, with no key and no bill.' },
};
```

And widen `HEADER_CHROME` (line 75) with its hint:

```ts
const HEADER_CHROME: TemplateControlSection = {
  id: 'header',
  paths: ['header.title', 'header.themeToggle', 'header.actions'],
  hints: {
    'header.actions':
      'Each button dispatches `kai-header-action` for your app to handle — nothing happens until you listen.',
  },
};
```

`HEADER` (title only) stays as it is — widget keeps it. **The spec's S-3 row "header.themeToggle (widget only)" has no hint site**: widget's manifest has no `header.themeToggle` path, so there is no control to hang a hint on. The section's absence is itself the statement. Record that in a comment beside `HEADER`.

- [ ] **Step 5: Rewrite the five starters**

**widget** (lines 111–139) — omit `unreadColor`, add the default-ON set:

```ts
  theme: { mode: 'system' },
```

and replace its `capabilities` with:

```ts
  capabilities: {
    starters: ["Where's my order?", 'Request a refund'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
    // Stated, not implied — the anchored-on-the-default convention (B-4), so
    // the fact is visible and editable in the template's own JSON.
    reasoning: 'full',
    // The owner's A3 default matrix (builder-message-actions.tsx).
    messageActions: { user: ['edit'], assistant: ['copy', 'like', 'dislike'] },
  },
```

**inAppAssistant** (142–161) — `theme: { mode: 'dark' }`; add `themeToggle`, `empty`, `composer`, and the capability set:

```ts
  header: { title: 'Assistant', themeToggle: true },
  theme: { mode: 'dark' },
  aside: { position: 'end', width: '380px' },
  empty: {
    title: 'What can I help with?',
    description: 'Ask about this page, or anything else.',
  },
  composer: {
    triggers: {
      slash: [
        { id: 'summarize', label: 'summarize', description: 'Summarize the thread so far' },
        { id: 'explain', label: 'explain', description: 'Explain the current page' },
      ],
      mention: [
        { id: 'docs', label: 'docs', description: 'Search the documentation' },
        { id: 'support', label: 'support', description: 'Hand off to a person' },
      ],
    },
  },
  capabilities: {
    starters: ['Deploy payments to production', 'Check the canary status'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
    reasoning: 'full',
    messageActions: { user: ['edit'], assistant: ['copy', 'like', 'dislike'] },
  },
```

**assistant** (164–183) — `theme: { mode: 'dark' }`, `themeToggle`, `shell`, and the capability set:

```ts
  header: { title: 'Assistant', themeToggle: true },
  theme: { mode: 'dark' },
  shell: { commandPalette: true, userMenu: { name: 'Ada', plan: 'Pro' } },
```
```ts
  capabilities: {
    starters: ['Draft the Q3 board update', 'Summarize a document', 'Compare two options'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
    reasoning: 'full',
    messageActions: { user: ['edit'], assistant: ['copy', 'like', 'dislike'] },
  },
```

**research** (186–208) — `theme: { mode: 'dark' }`, `themeToggle`, `empty`, and the capability set (`sources.strip` and `messageActions` are already there; keep both):

```ts
  header: { title: 'Research', themeToggle: true },
  theme: { mode: 'dark' },
  empty: {
    title: 'What do you want to know?',
    description: 'Answers come back with their sources attached.',
  },
```
```ts
  capabilities: {
    starters: ['How does the wire adapter work?', 'What are message parts?'],
    attachments: { accept: ['application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
    reasoning: 'full',
    sources: { strip: true },
    messageActions: { user: ['edit'], assistant: ['copy', 'like', 'dislike'] },
  },
```

**workspaceBase** (229–255) — `theme: { mode: 'dark' }`, `empty`, `workSurface`, and the capability set:

```ts
  theme: { mode: 'dark' },
  empty: {
    title: 'What should we build?',
    description: 'Describe it, and it takes shape in the work surface beside this chat.',
  },
  // The template's whole point, and the reason this round exists: a split
  // layout with no workSurface previews as a chat beside an empty column.
  // Every chrome key is STATED, never left to a default — what the builder
  // panel shows and what the pane renders can then never disagree.
  workSurface: {
    kind: 'artifact',
    url: '/work-surface.html',
    chrome: { deviceToggle: false, urlBar: false, openInNewTab: false, expand: true },
  },
  shell: { commandPalette: true, userMenu: { name: 'Ada', plan: 'Pro' } },
  composer: workspaceTriggers,
  capabilities: {
    starters: ['Build a pricing table', 'Add a dark mode toggle'],
    attachments: { accept: ['image/*'] },
    history: { persistence: 'local' },
    conversations: true,
    reasoning: 'full',
    messageActions: { user: ['edit'], assistant: ['copy', 'like', 'dislike'] },
  },
```

- [ ] **Step 6: Update the manifests in `TEMPLATES`**

```ts
    controls: [IDENTITY, THEME, HEADER, EMPTY, HOME, CAPABILITIES, MESSAGE_ACTIONS, WIDGET_CHROME, PROVIDER],          // widget
    controls: [IDENTITY, THEME, HEADER_CHROME, EMPTY, ASIDE, COMPOSER_TRIGGERS, CAPABILITIES, MESSAGE_ACTIONS, CARDS, PROVIDER], // inAppAssistant
    controls: [IDENTITY, THEME, HEADER_CHROME, SHELL, EMPTY, CAPABILITIES, MESSAGE_ACTIONS, PROVIDER],                  // assistant
    controls: [IDENTITY, THEME, HEADER_CHROME, EMPTY, CAPABILITIES, SOURCES, MESSAGE_ACTIONS, PROVIDER],                // research
    controls: [IDENTITY, THEME, HEADER_CHROME, WORK_SURFACE, SHELL, COMPOSER_TRIGGERS, CAPABILITIES, MESSAGE_ACTIONS, EMPTY, PROVIDER], // workspace
```

- [ ] **Step 7: Correct the starter-provenance comment (S-10)**

In `templates.ts`'s module header, replace the provenance sentence (lines 22–24):

```
 * Starter provenance (C-6): each starter is the schema-expressible subset
 * of its Labs/Builder story's seed state (or the owner-widget fixture
 * lineage, for widget) — titles, starters, capability toggles, trigger
 * lists, header/shell/work-surface chrome. ACCENTS DO NOT CARRY OVER
 * (owner ruling, 2026-08-30): a starter must not pre-commit somebody's
 * brand, so `theme.accent` and `theme.unreadColor` are omitted everywhere
 * and the kit's own `--color-primary` neutral applies in both modes. The
 * stories keep their accents — they are the design surface that
 * demonstrates accenting works — and `builder-app/App.tsx`'s BRAND_STYLE
 * is the kitn product identity on the builder's own canvases and is
 * explicitly out of scope. Stub message threads, pane CONTENT and other
 * non-vocabulary story state do NOT carry over. All providers are
 * `{ mode: 'mock' }` (B-14 — the wizard's own keyless-first-run promise).
```

- [ ] **Step 8: Run the tests, regenerate the fixtures, prove no drift**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/templates.test.ts src/components/construct-form-paths.test.ts src/components/builder-panel-derived.test.tsx
cd packages/ui && npm run build:api && npm run verify:generated
```

`build:api` rewrites **all seven** `fixtures/templates/*.construct.json`. Confirm all seven are dirty:

```bash
git status --short packages/ui/src/agent-tooling/construct/fixtures/templates/
```

Expected: seven ` M` lines.

- [ ] **Step 9: Full suite + the real emit chain**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
npx nx build ui
cd packages/ui && npm run verify:construct
```

`verify:construct` discovers the seven fixtures by name and ejects, installs, compiles, builds and bundles each one. This is what proves the rewritten starters are not just valid but buildable.

- [ ] **Step 10: SHOW THE OWNER — the void is dead**

```bash
mkdir -p /tmp/kai-worksurface-check && cd /tmp/kai-worksurface-check
node /Users/home/Projects/kitn-ai/kitn-chat/packages/ui/bin/mcp.js dev --builder
```

Open the printed URL, pick **Workspace**, and confirm: a chat rail on the left and a **rendering** work surface filling the rest, with the placeholder page inside it. Screenshot it. **Stop here and hand this to the owner before starting Task 6** — this is the landing they are waiting for.

- [ ] **Step 11: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/templates.ts packages/ui/src/agent-tooling/construct/templates.test.ts packages/ui/src/agent-tooling/construct/fixtures/templates/
git commit -m "feat(builder): starters ship bells-and-whistles-on and brand-neutral; Workspace gets a real work surface"
```

---

# Task 6: The two Workspace variants must visibly differ

**Files:**
- Modify: `packages/ui/src/agent-tooling/construct/templates.ts` (`workspaceArtifactPreview` 257–260, `workspaceAppPreview` 262–269)
- Modify: `packages/ui/src/agent-tooling/construct/templates.test.ts`
- Regenerate: `fixtures/templates/workspace.artifactPreview.construct.json`, `workspace.appPreview.construct.json`

**This is this round's acceptance test.** Before it, the two variants differed only in `name` and `starters` — a picker offering a choice that changed almost nothing, which is what the T-5 amendment calls out by name.

**Exactly how they differ, after this task:**

| | `artifactPreview` | `appPreview` |
|---|---|---|
| `workSurface.kind` | `'artifact'` | `'preview'` |
| framing | content centered in a bordered card on the muted backdrop | content edge-to-edge, filling the canvas |
| iframe title | `Work surface` | `App preview` |
| `chrome.deviceToggle` | `false` | **`true`** — desktop/tablet/mobile segmented control |
| `chrome.urlBar` | `false` | **`true`** — lock icon + address |
| `chrome.openInNewTab` | `false` | **`true`** |
| `chrome.expand` | `true` | `true` |
| `chrome.codeView` | absent (no `codeUrl`) | absent (no `codeUrl`) |
| starter prompts | pricing table / dark mode | landing page / mobile hero |

Side by side: `artifactPreview` shows a clean framed card with one expand button; `appPreview` shows a browser-shaped toolbar carrying four controls. Nobody can mistake one for the other.

- [ ] **Step 1: Write the failing test**

Append to `templates.test.ts`'s `describe('starter content rules …')`:

```ts
  it('the two Workspace variants differ in what the PANE LOOKS LIKE, not just in name and prompts (W-12)', () => {
    const ws = buildableTemplates().find((t) => t.id === 'workspace')!;
    const artifact = ws.variants!.find((v) => v.id === 'artifactPreview')!.starter;
    const app = ws.variants!.find((v) => v.id === 'appPreview')!.starter;

    expect(artifact.workSurface?.kind).toBe('artifact');
    expect(app.workSurface?.kind).toBe('preview');

    expect(artifact.workSurface?.chrome).toEqual({
      deviceToggle: false, urlBar: false, openInNewTab: false, expand: true,
    });
    expect(app.workSurface?.chrome).toEqual({
      deviceToggle: true, urlBar: true, openInNewTab: true, expand: true,
    });

    // The tell that this is a real difference and not a renamed one.
    expect(JSON.stringify(artifact.workSurface)).not.toBe(JSON.stringify(app.workSurface));
  });

  it('the two variants emit DIFFERENT Artifact/WorkSurface props, not merely a different name', async () => {
    const { generateProject } = await import('./codegen');
    const ws = buildableTemplates().find((t) => t.id === 'workspace')!;
    const appOf = (starter: (typeof ws.variants)[number]['starter']) =>
      generateProject(starter).find((f) => f.path === 'src/App.tsx')!.code;
    const a = appOf(ws.variants!.find((v) => v.id === 'artifactPreview')!.starter);
    const b = appOf(ws.variants!.find((v) => v.id === 'appPreview')!.starter);

    expect(a).toContain('showDeviceToggle={false}');
    expect(b).toContain('showDeviceToggle={true}');
    expect(a).toContain('variant="artifact"');
    expect(b).toContain('variant="preview"');
    expect(a).toContain('iframeTitle={"Work surface"}');
    expect(b).toContain('iframeTitle={"App preview"}');
  });
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/templates.test.ts
```

Expected: FAIL — both variants currently inherit the base's `workSurface`.

- [ ] **Step 3: Differentiate the variants**

```ts
const workspaceArtifactPreview: Construct = {
  ...workspaceBase,
  name: 'artifact-workspace',
  // A clean framed surface: one expand control, no browser chrome. The
  // difference from appPreview below is what the two variant CARDS promise,
  // and until 2026-08-30 the two starters delivered none of it.
  workSurface: {
    kind: 'artifact',
    url: '/work-surface.html',
    chrome: { deviceToggle: false, urlBar: false, openInNewTab: false, expand: true },
  },
};

const workspaceAppPreview: Construct = {
  ...workspaceBase,
  name: 'app-workspace',
  // Full browser chrome: device toggle, address bar, open-in-new-tab, expand.
  workSurface: {
    kind: 'preview',
    url: '/work-surface.html',
    chrome: { deviceToggle: true, urlBar: true, openInNewTab: true, expand: true },
  },
  capabilities: {
    ...workspaceBase.capabilities,
    starters: ['Build a landing page for a coffee shop', 'Make the hero work on mobile'],
  },
};
```

- [ ] **Step 4: Run the tests, regenerate, verify**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/
cd packages/ui && npm run build:api && npm run verify:generated
```

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/templates.ts packages/ui/src/agent-tooling/construct/templates.test.ts packages/ui/src/agent-tooling/construct/fixtures/templates/
git commit -m "feat(builder): the two Workspace variants now differ in what the pane looks like"
```

---

# Task 7: The builder panel renders the Work surface section and its hints

**Files:**
- Modify: `packages/ui/src/components/builder-panel-derived.tsx` (`FIELD_LABELS` 51–70, `SECTION_TITLES` 694–699, the section loop 670–689)
- Modify: `packages/ui/src/components/builder-panel-derived.test.tsx`

**Interfaces:**
- Consumes: `TemplateControlSection.hints` (Task 5), `RuleVisibility.layout` (Task 2).

**Deviation from the spec, stated:** the spec says hints go "into the existing `Field`'s `hint` prop". `Field` (`builder-panel.tsx:219`) is used by the string-list branch and a few override editors only — the enum, string and boolean branches render their own label+control inline. Threading a hint through every branch would mean five render sites. The hint is therefore rendered ONCE, in the section loop, as a sibling `<p>` immediately after the field, using the exact class `Field`'s own hint uses (`text-xs text-muted-foreground`). One site, identical appearance, works for override editors and derived fields alike.

- [ ] **Step 1: Write the failing tests**

Append to `packages/ui/src/components/builder-panel-derived.test.tsx`:

```tsx
describe('work-surface section visibility (2026-08-30)', () => {
  it('renders on layout: split — the Workspace template', () => {
    const { container } = render(() => <Controlled template={tpl('workspace')} />);
    expect(container.querySelector('[data-derived-section="workSurface"]')).toBeInTheDocument();
    expect(screen.getByText('Work surface')).toBeInTheDocument();
  });

  it('is hidden on every non-split layout, even if a manifest asks for it', () => {
    const workspace = tpl('workspace');
    for (const other of ['widget', 'inAppAssistant', 'assistant', 'research'] as const) {
      const hybrid = { ...tpl(other), controls: workspace.controls } as BuildableTemplate;
      const { container, unmount } = render(() => <Controlled template={hybrid} />);
      expect(
        container.querySelector('[data-derived-section="workSurface"]'),
        `${other} must not show the work-surface section`,
      ).toBeNull();
      unmount();
    }
  });

  it('labels the work-surface fields the way the design story labels them', () => {
    render(() => <Controlled template={tpl('workspace')} />);
    for (const label of ['Pane kind', 'Preview URL', 'Device toggle', 'URL bar', 'Open in new tab', 'Expand', 'Code view']) {
      expect(screen.getByText(label), label).toBeInTheDocument();
    }
  });

  it('the widget and aside sections still hide correctly after the layout-scope fix', () => {
    const { container: widgetPanel } = render(() => <Controlled template={tpl('widget')} />);
    expect(widgetPanel.querySelector('[data-derived-section="widget"]')).toBeInTheDocument();
    cleanup();
    const { container: asidePanel } = render(() => <Controlled template={tpl('inAppAssistant')} />);
    expect(asidePanel.querySelector('[data-derived-section="aside"]')).toBeInTheDocument();
    expect(asidePanel.querySelector('[data-derived-section="widget"]')).toBeNull();
  });
});

describe('hints (S-4 — off reads as a choice, not an absence)', () => {
  it('renders the manifest hint under its control', () => {
    render(() => <Controlled template={tpl('workspace')} />);
    expect(screen.getByText(/Endpoint needs your own chat route/)).toBeInTheDocument();
    expect(screen.getByText(/Local keeps history in this browser/)).toBeInTheDocument();
  });

  it('renders no hint for a path that has none', () => {
    const { container } = render(() => <Controlled template={tpl('widget')} />);
    const identity = container.querySelector('[data-derived-section="identity"]')!;
    expect(identity.querySelector('[data-derived-hint]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/builder-panel-derived.test.tsx
```

- [ ] **Step 3: Add the labels and the title**

In `FIELD_LABELS`, after `'home.recentConversation'`:

```ts
  // The design story's own labels (builder-workspace.stories.tsx's
  // WorkSurfaceSection) — the panel names these controls the way the approved
  // design names them, never a fresh auto-generated wording.
  'workSurface.kind': 'Pane kind',
  'workSurface.url': 'Preview URL',
  'workSurface.codeUrl': 'Code URL',
  'workSurface.chrome.deviceToggle': 'Device toggle',
  'workSurface.chrome.urlBar': 'URL bar',
  'workSurface.chrome.openInNewTab': 'Open in new tab',
  'workSurface.chrome.expand': 'Expand',
  'workSurface.chrome.codeView': 'Code view',
```

In `SECTION_TITLES`:

```ts
  shell: 'Shell', provider: 'Provider', cards: 'Cards', workSurface: 'Work surface',
```

- [ ] **Step 4: Render the hints**

Replace the section loop's inner `<For each={section.paths}>` body (lines 674–683) with:

```tsx
            <For each={section.paths}>
              {(path) => {
                const Override = FIELD_OVERRIDES[path];
                const hint = section.hints?.[path];
                return (
                  <>
                    {Override ? (
                      <Dynamic component={Override} path={path} value={props.value} write={props.onChange} />
                    ) : (
                      <DerivedField path={path} value={props.value} write={props.onChange} disabledReason={disabledReasonFor(path)} />
                    )}
                    <Show when={hint}>
                      {/* One site, not five: DerivedField's enum/string/boolean
                          branches each render their own label+control inline, so
                          threading a hint through `Field` would mean five render
                          sites for one line of text. Same class Field's own hint
                          uses (builder-panel.tsx:219), so it looks identical. */}
                      <p class="text-xs text-muted-foreground" data-derived-hint={path}>{hint}</p>
                    </Show>
                  </>
                );
              }}
            </For>
```

- [ ] **Step 5: Run the tests + full suite + typecheck**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
npx nx typecheck ui --skip-nx-cache
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/builder-panel-derived.tsx packages/ui/src/components/builder-panel-derived.test.tsx
git commit -m "feat(builder): the panel renders the Work surface section and its off-by-default hints"
```

---

# Task 8: Classify `workSurface` in create-kai's wizard registry

**Files:**
- Modify: `packages/create-kai/src/wizard.ts` (`WIZARD_REGISTRY`, ~line 427)
- Verify: `packages/create-kai/test/wizard.test.ts` (drift test — no edit expected)

- [ ] **Step 1: Run the drift test to watch it fail**

```bash
pnpm --filter create-kai test
```

Expected: FAIL — `top-level key "workSurface" is not classified in WIZARD_REGISTRY`. **Watch this fail before fixing it** — a guard you never saw fail is a guard you have not verified.

- [ ] **Step 2: Add the entry**

In `WIZARD_REGISTRY`, after the `shell` entry:

```ts
  workSurface: {
    status: 'not-asked',
    reason:
      "the split pane's work surface is template-seeded (the Workspace starter and its two variants state kind/url/chrome); the wizard has no split-layout branch to ask it from, so it passes the starter through untouched — edit the construct file or use the `construct` MCP tool to retarget the pane",
  },
```

- [ ] **Step 3: Run the tests + typecheck**

```bash
pnpm --filter create-kai test
npx nx typecheck ui --skip-nx-cache
```

- [ ] **Step 4: Commit**

```bash
git add packages/create-kai/src/wizard.ts
git commit -m "chore(create-kai): classify workSurface in the wizard registry"
```

---

# Task 9: Document the format

**Files:**
- Modify: `packages/ui/src/agent-tooling/README.md`

Per correction X-8: there is no construct-format page under `apps/docs/`; this README's "Worked example" and "Rules that bind changes here" sections are the format's prose documentation.

- [ ] **Step 1: Add a work-surface section after the "Worked example" list**

Insert after the `"capabilities.conversations": true` bullet (~line 134):

````markdown
### The split layout's work surface

`layout: "split"` puts the chat in a resizable rail and a **work surface** in
the main region. The surface is `components/work-surface.tsx`'s `WorkSurface`
— promoted from `elements/builder-workspace.stories.tsx`, which is the
approved design and stays the acceptance surface for it.

```json
"workSurface": {
  "kind": "preview",
  "url": "/work-surface.html",
  "chrome": { "deviceToggle": true, "urlBar": true, "openInNewTab": true, "expand": true }
}
```

- `kind` — `"preview"` fills the canvas edge to edge (a browser preview);
  `"artifact"` centers the content in a bordered card. It also picks the
  framed document's accessible title. It implies **no chrome**: every
  affordance is stated, so the builder panel and the rendered pane can never
  disagree.
- `url` — **required**, and `isSafeUrl`-checked: it reaches an iframe `src`.
  A relative url makes codegen emit `public/work-surface.html`, a
  self-contained placeholder page, so a preview renders offline. That
  filename is a constant, never derived from `url`.
- `codeUrl` + `chrome.codeView` travel together in both directions — a Code
  tab with no source is a dead affordance, and a source with no tab is
  unreachable. Either alone is a hard rejection.
- `chrome.expand` collapses the chat rail through `WorkspaceShell`'s own
  controlled `startCollapsed`. Not the kai-resizable maximize protocol:
  `WorkspaceShell` does not forward it.
- `workSurface` is valid **only** on `layout: "split"`, the same way `widget`
  and `aside` are scoped to theirs.

**Projection wins.** The surface is emitted as `<slot name="pane">` FALLBACK
content, so a consumer who projects their own `slot="pane"` child replaces it
entirely — the construct's surface is the default, not an override. `kai
validate`, `kai eject` and `kai dev` all print that fact, and a `split`
construct with no `workSurface` gets the opposite notice: the pane stays
hidden until something is projected, so an empty column is never reserved.
````

- [ ] **Step 2: Note the story-is-the-design rule in "Rules that bind changes here"**

Append a bullet:

```markdown
- **A Labs/Builder story is the acceptance surface for what it shows.** Those
  stories are the approved design AND working implementations, each carrying
  its rounds of owner feedback in its module comment. When a spec and a story
  disagree about an affordance, the story wins — check it side by side before
  ruling something "has no mechanism". `WorkSurface` exists because that check
  was skipped once.
```

- [ ] **Step 3: Verify nothing else moved**

```bash
cd packages/ui && npm run lint:cdn-pins
```

Expected: PASS. (No version literal should have been touched. Run it anyway — the doc edit is in a scanned directory.)

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/agent-tooling/README.md
git commit -m "docs(construct): document workSurface, its rules, and the story-is-the-design rule"
```

---

# Task 10: Owner-facing verification and the local build

**Files:** none modified. This task produces evidence and one build.

**No claim of "done" before the screenshots exist.**

- [ ] **Step 1: Build the tree the gates need**

```bash
npx nx build ui
```

- [ ] **Step 2: Run every gate this round moves, in the foreground, and paste the raw output**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
pnpm --filter create-kai test
npx nx typecheck ui --skip-nx-cache
cd packages/ui && npm run verify:generated
cd packages/ui && npm run verify:construct
cd packages/ui && npm run verify:solid-coverage
cd packages/ui && npm run lint:silent-drops
cd packages/ui && npm run lint:cdn-pins
```

- [ ] **Step 3: Drive the real builder in a scratch directory**

```bash
mkdir -p /tmp/kai-worksurface-verify && cd /tmp/kai-worksurface-verify
node /Users/home/Projects/kitn-ai/kitn-chat/packages/ui/bin/mcp.js dev --builder
```

This is the real CLI over the real built `dist/`, not Storybook and not a unit harness.

- [ ] **Step 4: Capture the four required screenshots**

In the builder, create **both** Workspace variants and capture:

**(a) The pane renders.** Workspace → `artifactPreview`. The preview shows a chat rail on the left and a work surface filling the main region with the placeholder page inside it. **No empty column anywhere.** Screenshot the whole preview frame.

**(b) The two variants look different.** Screenshot `artifactPreview` and `appPreview` side by side. `artifactPreview` must show a bordered card and a single expand button; `appPreview` must show the device toggle (three segmented icons), the lock-icon address bar, open-in-new-tab and expand. Click `appPreview`'s Mobile device chip and screenshot the narrowed canvas — that proves the device toggle is live, not decorative.

**(c) No starter carries a brand accent.** For each of the five templates, screenshot the panel's Theme section: the Accent `ColorField` must be EMPTY (meaning "kit default"), and the preview must be legible — near-black primary in light, near-white in dark. Also flip Theme → Mode between light and dark on one template and screenshot both, proving the omitted accent reads correctly in both.

**(d) The default-on sections are visible in each template's panel.** For each of the five templates, screenshot the full panel and confirm: an **Empty state** section, a **Message actions** section with the A3 matrix checked (`Edit` on user; `Copy`/`Like`/`Dislike` on assistant), Capabilities showing Starters/Attachments/History=Local/Conversations on and Reasoning=full, and the hint text under Provider and under History. Workspace additionally shows **Work surface**.

Also capture, as evidence for the slot-fallback contract: eject the Workspace starter, add a `<div slot="pane">projected</div>` child to the emitted `index.html`'s element tag, run the emitted project's dev server, and screenshot the projected div winning over the construct's surface.

```bash
cd /tmp/kai-worksurface-verify
node /Users/home/Projects/kitn-ai/kitn-chat/packages/ui/bin/mcp.js eject \
  /Users/home/Projects/kitn-ai/kitn-chat/packages/ui/src/agent-tooling/construct/fixtures/templates/workspace.appPreview.construct.json \
  ./ejected
```

- [ ] **Step 5: Save the screenshots into the repo's evidence directory**

```bash
mkdir -p docs/superpowers/screenshots/2026-08-30-worksurface
```

Copy every capture there with a descriptive filename (`workspace-artifact-variant.png`, `workspace-app-variant-mobile.png`, `research-panel-defaults.png`, `widget-theme-neutral-light.png`, `pane-projection-wins.png`, …), and commit them:

```bash
git add docs/superpowers/screenshots/2026-08-30-worksurface/
git commit -m "docs(builder): verification screenshots for the workSurface round"
```

- [ ] **Step 6: FINAL STEP — rebuild the owner's local dist, uncached**

```bash
npx nx build ui --skip-nx-cache
```

`--skip-nx-cache` is mandatory: a cached build looks exactly like a successful one while restoring nothing, and this build is what the owner's local `kai dev --builder` loads.

- [ ] **Step 7: Confirm nothing was pushed**

```bash
git status --short --branch
```

Expected: `## feat/modes-and-screens...origin/feat/modes-and-screens [ahead N]` with a clean tree. **Do not push. Do not open a PR.**

---

## Gate consequences, in one place

| Change | Gate that moves | What it does if you skip it |
|---|---|---|
| New top-level schema key | `verify:construct`'s `TOP_LEVEL_VALUES` + `TOP_LEVEL_LAYOUT_SCOPE` | Hard failure naming the key (`missingValuers`) — by design. Without the scope entry, every non-split cell would carry an invalid `workSurface`. |
| Any schema key at all | `npm run build:api` → `construct.v1.schema.json` + `apps/docs/public/schemas/construct/v1.json`; `npm run verify:generated` | Byte-drift failure. |
| New `CROSS_FIELD_RULES` entry | `construct-form-paths.test.ts`'s `RULE_VISIBILITY` key-set-equality test | Red until the builder classifies the rule. |
| New rule id | `schema.test.ts`'s ordered id-list test | Red on an array mismatch — the list is source-ordered. |
| `hide-section` on a section not named after its layout | `RuleVisibility.layout` + `builder-panel-derived.tsx:647` | The section is silently shown on every layout. |
| Changed starter | `npm run build:api` → all seven `fixtures/templates/*.construct.json`; `verify:generated`; `verify:construct`'s named-fixture discovery | Drift failure, then a stale fixture ejected/compiled by the gate. |
| New emitted file (`public/work-surface.html`) | `writeProject`'s manifest pruning | None to add — the manifest handles creation and deletion. `verify-generated-sync.mjs` needs **no** edit (X-10). |
| New public component | `verify:solid-coverage` | Fails a public component with no exported `<Name>Props`. |
| New top-level key | create-kai's `WIZARD_REGISTRY` | `wizard.test.ts`'s drift test red. |
| Emitted code that imports a name it may not use | the emitted project's own `noUnusedLocals`, caught only by `verify:construct` | Green unit tests over an emitted project that does not compile. |
| Any of the above | `nx typecheck ui --skip-nx-cache` | A cached green over broken code is the one that ships. |

---

## Self-review

**1. Spec coverage.** Walked the spec section by section against the tasks.

- §0 mechanism table → the five verdicts are honoured or corrected in X-1…X-5, each with the tree evidence.
- W-1 (top level) → Task 2, with C-1's gate reasoning carried into the doc comment. W-2 (shape) → Task 2, widened by `codeUrl` and `chrome.deviceToggle`/`codeView` per the re-scope. W-3 (presets) → **superseded by X-4**, reasoned. W-4/W-5 (drops) → **reversed** by X-1/X-2, which is the point of the re-scope. W-6 (slot fallback) → Task 4 steps 5 and 8, all three "decide loudly" sites: the emitted comment, the CLI notice, the panel section. W-7 (no new collision rule) → correct, `split-pane-slot-collision` already covers it; no task. W-8 (two rules) → Task 2, grown to four. W-9 (deferrals) → model-produced artifacts stay deferred with their reopen condition in the story-comment correction (Task 2 step 10); `workSurface.width` stays deferred, superseded in practice by X-5's arrangement. W-10 (`work-surface.html`) → Task 4 steps 3–4, constant filename, relative-url gate, path-traversal test. W-11 (proportions) → **superseded by X-5**. W-12 (acceptance test) → Task 6, both as data and as an emit-diff test.
- S-1…S-5 → Task 5. S-6 → Task 6. S-7/S-8 (neutral) → Task 5 steps 5 and 7 plus a corpus-wide test. S-9 (`theme.mode` unchanged) → untouched; the existing test at `templates.test.ts:95` still guards it. S-10 (scope boundary) → stated in the provenance comment; `builder-app/App.tsx`'s `BRAND_STYLE` and the story seeds are named as out of scope and appear in no task's file list. S-11 → Task 4 step 7, with X-7's correction to what is actually detectable.
- C-1…C-7 → C-1 in Task 2's doc comment; C-2 **overturned** by X-3 (the story's own recorded ruling); C-3 in Task 2 steps 5–6; C-4 (no `artifact` MessagePart) unchanged and still the reason the model-driven pane stays deferred; C-5 in Task 6's framing; C-6 (`conversations` + local is free) in Task 5's default-ON set; C-7 in X-9.
- Coordinator's four re-scope points → (1) Task 1; (2) Task 2; (3) X-2 + Task 2's `work-surface-code-view` rule, with the choice stated and the tab kept in the component; (4) Task 2 step 10.
- Brief's explicit asks → owner-urgent ordering and the partial-landing marker (the "Task order" section and Task 5 step 10); the `showAside` truthiness defect (Task 4 steps 5–6); `hints` + Field wiring (Task 5 step 3, Task 7 step 4, with the deviation stated); the `RULE_VISIBILITY` `layout` fix (Task 2); the variant task (Task 6); the owner verification with four required screenshot classes (Task 10 step 4); the final `npx nx build ui --skip-nx-cache` (Task 10 step 6); the one-line note that the variant card label is under review and untouched (Process note).

**Gap found and closed during review:** the spec's task list had no step correcting `templates.test.ts`'s "Workspace is the ONLY template whose starters carry `composer.triggers`" assertion, which S-5 breaks by giving `inAppAssistant` triggers. Task 5 step 1 replaces that test rather than deleting it. A second: nothing in the spec noticed that `schema.test.ts` pins the rule-id list as an ordered array; Task 2 step 1 updates it.

**2. Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N", no "write tests for the above". Every code step carries the actual code; every command is runnable as written; every file reference carries a real line number or symbol name read out of the tree. The only figures deliberately not stated are `verify:construct`'s cell count and the test totals, which the gates print and which this repo's rules forbid restating.

**3. Type consistency.** Checked across tasks: `WorkSurfaceProps`' prop names (`src`, `preview`, `codeSrc`, `code`, `urlLabel`, `iframeTitle`, `variant`, `tab`, `defaultTab`, `onTabChange`, `device`, `onDeviceChange`, `expanded`, `onExpandedChange`, `showDeviceToggle`, `showUrlBar`, `showOpenInNewTab`, `showExpand`, `showCodeView`) are identical in Task 1's definition, Task 1's story rewiring, Task 4's emitters and Task 4's and Task 6's assertions. `WORK_SURFACE_DEVICE_WIDTHS` is one name in the component, its test and the story. The construct field names (`kind`, `url`, `codeUrl`, `chrome.deviceToggle`/`urlBar`/`openInNewTab`/`expand`/`codeView`) are identical in the schema, the four rules, `TOP_LEVEL_VALUES`, `WORK_SURFACE`'s `paths`, `FIELD_LABELS`, the starters and every test. The emitted identifiers `paneProjected`, `surfaceExpanded`/`setSurfaceExpanded` and `dispatchHeaderAction` each appear in exactly one emitter and the assertion that pins it. `ArtifactTab` is reused rather than redeclared, in the component, the story and the tests. The four rule ids are spelled identically in `schema.ts`, `schema.test.ts`, `RULE_VISIBILITY` and `construct-form-paths.test.ts`.
