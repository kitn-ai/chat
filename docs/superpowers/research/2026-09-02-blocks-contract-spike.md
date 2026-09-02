# The authored-block contract, tested by hand against a real block

**Date:** 2026-09-02 · **Kind:** throwaway design spike, findings only · **Subject:**
`docs/superpowers/specs/2026-09-02-blocks-package-and-site-design.md` §3 (the authored
contract) and §5 (verification), plus the two amendments agreed in-session (`:attr=`
and `#ref=`).

`support-widget` was converted by hand to the contract, then hand-written into a React
tree and a Vue tree, and both were compiled under `tsc --strict` / `vue-tsc` and RUN in a
real Chromium against the packed `@kitn.ai/ui` tarball. The point was to find out what the
contract cannot say before six renderers are built on top of it.

**Headline: the controller seam holds cleanly. The binding syntax needs one more kind
(a list), one marker (a seed), and three rules it does not currently state. And the
conversion surfaced four defects in the KIT that have nothing to do with the syntax and
would have broken PR B on contact — one of them fatal to the react form of this block.**

Recommendation at the end: **stable with the changes in §4.**

---

## 0. What was built, and where

Everything below `spike/` in the worktree, and it is **discarded** — only this file is kept.

| Path | What |
|---|---|
| `spike/support-widget/support-widget.html` | the authored page, bindings on the markup |
| `spike/support-widget/support-widget.controller.ts` | the framework-neutral controller |
| `spike/support-widget/mock.ts`, `.css` | unchanged from the authored block, `.js` → `.ts` |
| `spike/react/SupportWidget.tsx`, `useSupportChat.ts` | the react form (generator target) |
| `spike/vue/SupportWidget.vue`, `useSupportChat.ts`, `kai-elements.d.ts` | the vue form |
| `spike/apps/{react-app,vue-app}` | throwaway Vite apps over the packed tarball |
| `spike/drive.mjs` | the Playwright evidence driver |
| `spike/shots/{react,vue}/*.png` | screenshots, 8 states per framework |

Nothing under `packages/` or `apps/` was modified. Two changes were made to the **installed
copy** of the tarball inside `spike/node_modules/` to test proposed kit fixes; both are
described in §3 and neither leaked out of the throwaway directory.

Preconditions, all three per CLAUDE.md: `pnpm install`, `build:css`, `nx build ui`
(`--skip-nx-cache`) in the worktree, then `npm pack --ignore-scripts` for the tarball the
apps install.

---

## Q1. Does the controller seam hold?

**Yes, and better than expected.** `state()` + `subscribe()` + `actions` was enough for both
hosts with no escape hatches. The whole react adapter is one `useSyncExternalStore` call and
the whole vue adapter is one `shallowRef` plus one `subscribe`; neither mirrors state, and
neither needed an effect to re-derive anything.

### Every ref method call, in full

Two refs. Both are navigation methods with no declarative equivalent.

| Ref | Method | Called from | Why it cannot be a binding |
|---|---|---|---|
| `stack` | `push('chat')` | `startNew`, `openRecent`, `openConversation` | drilling is a stack PUSH; there is no view name that means "push rather than replace" |
| `stack` | `back()` | `back` | popping has no value at all to write — `view="home"` after a drill from `messages` lands on the wrong root |
| `stack` | `selectTab(value)` | `tabChange` | switching roots also clears the drill; a `view` write does not |
| `dock` | `hide()` | `close` | `open=false` would work, but the dock self-manages `open` and the block never drives it |

That is the whole DOM surface of the controller. Everything else the imperative
`support-widget.js` did by hand — `thread.messages = …`, `prompt.suggestions = …`,
`dock.unread = …`, `$('back').hidden = …`, `tabbar.hidden = …`, `conversations.activeId = …`,
and the entire `renderSummaries` DOM-building loop — became declarative. **No view-stack or
dock logic leaked into the controller**; the controller consumes `kai-view-change`'s
`{ view, root, drilled }` and never restates the stack's rule.

### Every state field

Fifteen. Grouped as they appear in `SupportWidgetState`:

| Field | Bound to | Note |
|---|---|---|
| `messages` | `kai-thread.messages` | new array reference per patch, per the kai- contract |
| `suggestions` | `kai-prompt-input.suggestions` | `undefined` clears — **and React cannot express that, see F-8** |
| `loading` | `kai-thread.loading`, `kai-prompt-input.loading` | one field, two elements |
| `backHidden` | back button `hidden` | precomputed `!drilled` |
| `tabBarHidden` | tab bar `hidden` | `drilled` |
| `tab` | `kai-tab-bar.value` | the stack's `root` |
| `unread` | `kai-dock.unread`, `kai-tab-bar-item.dot` | one field, two elements |
| `activeId` | `kai-conversations.activeId` | |
| `conversationRows` | the `*for` list | a projected view model, not `ConversationSummary[]` |
| `recentHidden` / `recentTitle` / `recentTime` / `recentPreview` / `recentPreviewHidden` / `recentDotHidden` | the home recent card | six fields for one row, because the bindings have no expressions |

**Amendment 1, required: `refs` must be a getter of nullable handles.** The spec writes
`createController(deps: { refs, … })`. No framework has its element handles when the
controller is constructed — React's ref is null through the first render, Vue's template ref
is null until mount. The signature that worked is `refs: () => { stack: … | null; dock: … | null }`,
read lazily at each call site.

**Amendment 2, a consequence worth stating: `State` is a view model, not domain state.** The
six `recent*` fields and `ConversationRow`'s `previewHidden` exist only because a binding
holds a field name, never an expression. That is the right trade — dumb bindings are what six
renderers can agree about — but it means the field count is presentation-shaped and the
controller is not reusable across a different layout of the same block.

---

## Q2. Is the binding syntax complete after `:attr` and `#ref`?

**No — one kind short, one marker short, and three unstated rules.** The four kinds carried
most of this block; what they missed is below. Findings are numbered so the plan can cite
them. F-5 and F-7 through F-10 are kit defects the conversion exposed, not syntax gaps, and
they are the ones that cost real time.

### F-1. There is no list binding. This is the big one.

The messages tab is `kai-conversations` in **item mode**: the block builds its own
`kai-conversation-item` rows, each with three slotted spans whose text comes from data. The
authored `support-widget.js` does that in a 25-line imperative loop. None of `.prop`,
`:attr`, `@kai-event` or `#ref` can express it.

Item mode is not incidental. The data-driven path (`kai-conversations.conversations`) renders
through `GroupSection`, which paints a section header — `conversation-list.tsx:402` falls back
to a group named "Ungrouped" — and the block deliberately avoids that ("item mode also skips
the rail's group sections, matching the facade's headerless list"). Using the array prop would
change what the block looks like.

**Proposed fix — a fifth kind, `*for` with a mandatory `:key`:**

```html
<kai-conversation-item *for="row of conversationRows" :key="row.id"
                       :conversation-id="row.id" density="panel" :unread="row.unread">
```

`*for` opens a scope in which `row.<field>` is a legal binding target; `:key` is required, not
optional, because the kai- reactivity contract is reference-keyed and every host framework
needs a key anyway. It maps directly: `.map()` + `key=` in React, `v-for` + `:key` in Vue,
`{#each … (key)}` in Svelte, `*ngFor; trackBy` in Angular, `<For each>` in Solid.

### F-2. There is no text binding — but `.prop` already covers it, by accident.

The recent card interpolates four data values into slotted spans. `textContent` is a JS
property on every element, so `.textContent="recentTitle"` is legal under the existing rule
and reads naturally. **No new syntax needed, but every renderer must special-case it**: emitting
`el.textContent = …` in the html form and `{state.recentTitle}` / `{{ state.recentTitle }}` as
children everywhere else. Worth writing down, because the mechanical translation
(a `textContent={…}` prop) is wrong in React and silently wrong in Vue.

### F-3. Bindings hold field names, not expressions — so negation has no home.

`:hidden="!drilled"` is not expressible. Two ways out: allow a leading `!`, or precompute in
the controller. **Recommend precomputing** (this spike did: `backHidden`, `tabBarHidden`,
`recentPreviewHidden`, `recentDotHidden`, `previewHidden`). It keeps the grammar at
"identifier, optionally dotted" — which is what makes six renderers cheap — at the cost of
Amendment 2's field inflation. Say so in the spec so authors do not reach for an expression.

### F-4. `@` must cover native events, or the kit must be checked first.

The authored block wires `back` and `close` with `addEventListener('click', …)`. Under the
contract that reads as `@click="back"`, which the spec's grammar (`@kai-event`) does not
sanction. In this case the kit rescues it: `kai-button` and `kai-row` both fire their own
non-bubbling `kai-click`, and the React wrapper maps it to `onClick`, so `@kai-click` is the
correct authoring and the imperative block was using the weaker form. **But the grammar should
say what happens for an element with no `kai-` equivalent**, and today `@click` on a
`<kai-*>` element is unspecified rather than illegal.

### F-5. A literal attribute is not a literal attribute in any component framework.

This is the finding that cost the most time and is the most likely to recur.

`kai-view-stack` discovers its views by reading its children's **attributes**:

```ts
// packages/ui/src/elements/view-stack.tsx:13
export function readViewEntry(el: Element): ViewEntry {
  return {
    name: el.getAttribute('name') ?? (el as HTMLElement).id,
    tabRoot: el.hasAttribute('tab-root') && el.getAttribute('tab-root') !== 'false',
  };
}
```

`kai-tab-bar` does the same for its items (`tab-bar.tsx:257`: `el.getAttribute('value') ?? el.id`).

`name="home"` in the authored markup is a plain literal, exactly what the contract says stays
literal. But **neither framework emits it as an attribute**:

- React's `createWebComponent` assigns every declared prop as a **DOM property** and never
  touches the attribute. Result, observed live: all three `kai-view` children resolve to
  `{ name: '', tabRoot: false }`, nothing matches, nothing is hidden, and the widget renders
  home, the conversation list and the chat thread stacked on top of each other. Screenshot of
  the failure state was taken before the fix; the driver reported
  `after push: {"view":"","drilled":false,"tabbarHidden":false,"backHidden":true}`.
- Vue picks per element: `shouldSetAsProp` returns `key in el`, so `name="home"` is an
  **attribute** while `kai-view` is not yet upgraded and a **property** once it is. The Vue
  tree therefore broke *only after* F-7's registration fix made the elements upgrade earlier —
  a genuinely intermittent failure whose trigger is import timing.

**This is a kit defect, not a syntax gap.** Recommended fix, kit-side: `readViewEntry` and
`kai-tab-bar`'s item reader should prefer the **property** and fall back to the attribute.
A renderer-side workaround exists in both hosts and was used here to get the trees running
(React: mirror scalars to attributes in the wrapper runtime, §3; Vue: `:name.attr="'home'"`),
but it needs a per-element list of "props a parent scans as attributes", which is a
hand-written list of exactly the kind `docs/coupling-map.md` §4 exists to shame.

### F-6. A seed attribute needs a marker. `view="home"` broke React specifically.

`kai-view-stack`'s `view` is both a deep-link seed and a settable navigation prop. In HTML the
attribute is written once. In React the wrapper re-applies every prop after **every render**,
so the cycle `push('chat')` → `kai-view-change` → `setState` → render → `el.view = 'home'` →
`controller.navigate('home')` silently undid every navigation, including a manual
`stack.push('chat')` from the console. Vue was unaffected: it does not re-patch static props.

Here the seed is redundant (the stack defaults to its first tab root) and dropping it is
behaviour-identical, which is what the react tree does. **But the general case needs saying**:
any `:attr`/literal naming a prop the element self-manages is a controlled-component trap in
React. Either the contract gains a `seed:` marker the react renderer emits once in a mount
effect, or the spec states the rule that an uncontrolled seed is never authored as a literal.
The kit's own `defaultX` convention already draws this line; `view` is the element that
violates it.

### F-7. Registration left the contract and nothing put it back.

The authored script's first two lines are `import '@kitn.ai/ui/autoloader'` and
`await Promise.all(tags.map((t) => customElements.whenDefined(t)))`. The contract moves the
wiring out of the script — and takes both with it. The consequences, both observed:

- **The vue tree registered nothing** and hung on `customElements.get('kai-dock')` forever
  until `import '@kitn.ai/ui/elements'` was added by hand. React needs no equivalent because
  its wrappers self-register; **every other framework does**, and `adaptRegistrationForBundler`
  already knows the right specifier.
- **The `whenDefined` await is load-bearing.** Without it, Vue created `<kai-conversations>`
  before the register-all bundle finished defining it (instrumented: at `document.createElement`
  time the prototype had no `searchable` accessor), so `:searchable.prop="false"` landed as an
  own data property on a plain `HTMLElement`, the upgrade discarded it, and the block rendered
  the element's default — a visible search box the authored block does not have. React's
  wrapper runtime absorbs the same race with its `customElements.whenDefined(tag).then(applyProps)`
  re-apply. Nothing else does.

**The generated non-react forms must emit both lines.** This is cheap and mechanical; it is
listed because it is exactly the kind of thing a "the wiring is generated now" round drops.

### F-8. React's wrappers cannot set `slot`, cannot set `hidden`, and cannot clear a prop.

Three separate holes in `createWebComponent`, all hit by this one block:

- **`slot`** — the wrapper forwards only `className`, `style` and `id`. `WebComponentProps`
  does not declare `slot`, so `<Panel slot="panel">` is a **type error**, and the block needs
  it seven times (`panel`, `header`, `start`, `end`, `leading`, `empty`, `footer`). This is
  fatal for any block that composes kai elements into kai slots, which is most of them.
- **`hidden`** — same, and the block toggles it on `Button`, `Row` and `TabBar`.
- **`undefined` cannot clear.** `applyProps` guards with `p[name] !== undefined`, so a prop set
  back to `undefined` is skipped rather than cleared. Measured on the running apps after one
  turn:

  ```
  react thread.messages: 2 | prompt.suggestions: ["Where's my order?","Request a refund"]
  vue   thread.messages: 2 | prompt.suggestions: undefined
  ```

  The block sets `suggestions = undefined` once the thread is non-empty; the react form keeps
  showing the conversation starters forever. Vue is correct. This is invisible to tsc and
  invisible to the compile cells — only running it finds it.

The first two errors, verbatim, before the fix:

```
react/SupportWidget.tsx(43,14): error TS2322: Property 'slot' does not exist on type
  'IntrinsicAttributes & PanelProps & RefAttributes<HTMLElement>'.
react/SupportWidget.tsx(78,56): error TS2322: Property 'hidden' does not exist on type
  'IntrinsicAttributes & RowProps & RefAttributes<HTMLElement>'.
```

Note the interaction with the spec's own structural check (§5.2, "no raw `kai-*` tags"): the
obvious workaround — drop to intrinsic JSX for the slotted elements, which the shipped
`declare module 'react'` augmentation supports — is the thing that check forbids. **One of the
two has to move.** Recommend fixing the wrapper.

### F-9. `#ref` does not deliver a typed handle in React.

`createWebComponent` returns `RefAttributes<HTMLElement>`, so a ref gives `HTMLElement` and
`stack.push('chat')` does not exist on it. The react tree needs an explicit cast:

```tsx
ref={(el) => { refs.current.stack = el as KaiViewStackElement | null; }}
```

The types exist and ship (`KaiViewStackElement`, `KaiDockElement` in `dist/elements.d.ts`, with
an `HTMLElementTagNameMap` augmentation) — the wrapper generator simply does not use them.
**Vue gets this right for free**: `ref<KaiViewStackElement | null>(null)` is honest and
vue-tsc checks it. Fix: `gen-element-react.mjs` should type the ref as the element interface
it already generates.

### F-10. Two smaller kit gaps the conversion exposed.

- `ConversationSummary` is the type `onSummariesChange` hands you, and
  `@kitn.ai/ui/stores` does not export it — only the heavy root entry does. A
  framework-neutral controller that wants the type has to import from `@kitn.ai/ui`.
- `searchable="false"` — the kit's documented "default-true flag turned off by the string
  `false`" idiom — does not survive translation. vue-tsc rejects it against the generated
  `searchable?: boolean` (`TS2322: Type 'string' is not assignable to type 'boolean | undefined'`),
  and it has to become `:searchable.prop="false"`. **The renderers must translate a
  `="false"` literal on a boolean prop, per framework.**

---

## Q3. Can vue-tsc be a CI cell?

**Yes, comfortably — but only with the augmentation explicitly loaded, and without it the cell
passes vacuously.**

### Measured

Box was **not quiet** (`load averages: 4.67 4.18 3.79`, Zed + Chrome + this session), so per
CLAUDE.md the real figures are LOWER, never higher. Three runs each, same 226-file program:

| Command | real |
|---|---|
| `tsc --noEmit -p tsconfig.react.json` | 0.90 / 0.73 / 0.74 |
| `vue-tsc --noEmit -p tsconfig.vue.json` | 1.03 / 0.97 / 1.03 |
| `vue-tsc`, `skipLibCheck: false` | 2.75 |

**vue-tsc costs roughly a quarter of a second more than tsc over the same tree.** It is not a
budget question. Re-measure on a quiet box before recording anything; these are upper bounds.

### Config it needed

Two things, and only two:

1. **`skipLibCheck: true`.** `dist/elements.d.ts` is ~4700 lines of generated declarations;
   turning lib-check on triples the run and buys nothing.
2. **The augmentation must be explicitly imported.** The kit already ships Vue typings — 
   `dist/elements.d.ts` carries `declare module 'vue' { interface GlobalComponents { 'kai-dock':
   KaiVueElement<KaiDockElementProps, KaiDockElementEvents>; … } }` — so the shim is one real
   line:

   ```ts
   // spike/vue/kai-elements.d.ts
   import '@kitn.ai/ui/elements';
   declare module '*.css';
   ```

**And it is load-bearing, watched failing both ways.** Planting `:value.prop="42"` on
`kai-tab-bar` (whose `value` is `string`):

```
--- WITH the augmentation reachable:
vue/SupportWidget.vue(134,10): error TS2322: Type 'number' is not assignable to type 'string'.
--- WITHOUT any kai typings (shim removed AND the type import removed):
(no output — green)
```

vue-tsc is silently permissive about unknown custom elements. **A vue cell that does not
import the augmentation checks the composable and the script block and nothing about the
template's kai props.** That is precisely the "check that proves nothing" shape, and it should
be pinned by a planted-defect self-test, not assumed.

No `isCustomElement` is needed for **vue-tsc** — it is needed for the **build**, one line in
the vite plugin:

```ts
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('kai-') } } })
```

which is what the spec already says the vue README must state.

### On the §5 open item

The spec's recommendation (compile the extractable TypeScript under `default`, add vue-tsc as
its own cell) is right, and this spike says go further: **vue-tsc should be the vue cell, not a
supplement.** It costs +0.25s, it type-checks the composable and the SFC in one pass, and the
`default`-project half would have caught none of F-5, F-6, F-7 or F-8 — all four are template
or runtime facts.

---

## 2. Runtime evidence

Both forms drive identically end to end. `spike/drive.mjs`, headless Chromium, the packed
`@kitn.ai/ui@0.31.0` tarball installed into throwaway Vite apps.

```
                                        react                          vue
after push      view/drilled/tabbar   chat/true/true             chat/true/true
thread after 1 turn                   2 msgs, [text],            2 msgs, [text],
                                      [reasoning,text,tool]      [reasoning,text,tool]
after back      view/drilled/recent   home/false/visible         home/false/visible
                recentTitle           "Let me pull up that order." (both)
conversation rows                     1 row, "just now"          1 row, "just now"
re-entered      view/messages         chat/2                     chat/2
page errors                           none                       none
```

Screenshots, eight states each: `spike/shots/react/01-closed.png` … `08-reentered.png` and
`spike/shots/vue/…` (same names). `05-streamed.png` shows the mock's reasoning disclosure,
the `lookup_order` tool row with its Completed badge and the assistant actions;
`07-messages-tab.png` shows the panel-density row with its right-aligned relative time and no
search box.

Two residual divergences, both already named: React keeps stale suggestions (F-8) and Vue
delivers `density` as a property rather than an attribute (F-5's other half, cosmetically
harmless here because `kai-conversation-item` reads its own `density` prop rather than a
parent scanning it).

---

## 3. The two throwaway patches

Both applied to `spike/node_modules/@kitn.ai/ui/`, both are the proposed kit fix, neither left
the throwaway directory.

**Patch A — `WebComponentProps` gains `slot` and `hidden`, and the runtime forwards them**
(F-8). Two added lines in `createElement`'s prop object and two declarations. After it, the
react tree compiles clean under `tsc --strict --noUnusedLocals`.

**Patch B — scalar props are mirrored to attributes** (F-5), in `applyProps`:

```js
const a = k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const v = m[k];
if (typeof v === 'string' || typeof v === 'number') d.setAttribute(a, String(v));
else if (typeof v === 'boolean') v ? d.setAttribute(a, '') : d.removeAttribute(a);
```

This is the blunt version of the fix and it is what made the react form route at all. It has
blast radius (every scalar prop on every element now reflects) and wants its own test; the
narrower kit fix — make `readViewEntry` and the tab-bar item reader prefer the property — is
the one to prefer.

---

## 4. Recommendation

**Contract stable with these changes.** The shape is right: the controller seam is real, the
adapters are one call each in both frameworks, and nothing about view-stack or dock logic
pulled DOM back into the controller. The syntax needs three additions and one marker, and PR B
needs four kit fixes landed first or it will spend its budget rediscovering them.

**To the contract (§3.1/§3.2):**

1. Add `*for="row of field"` with a **mandatory** `:key`. (F-1)
2. State that `.textContent` is a sanctioned property binding and that every renderer emits it
   as children, not as a prop. (F-2)
3. State that a binding is an identifier, never an expression; derivations belong in the
   controller. (F-3)
4. State `@` covers any event the element fires, and that `kai-` forms are preferred where one
   exists. (F-4)
5. Add a seed marker, or forbid authoring a literal for a self-managed prop. (F-6)
6. `refs` is a getter of nullable handles. (Amendment 1)
7. The generated non-react forms emit the registration import **and** the `whenDefined` await.
   (F-7)
8. Renderers translate a `="false"` literal on a boolean prop per framework. (F-10)

**To the kit, before PR B:**

| # | Fix | Why it blocks |
|---|---|---|
| F-8 | `WebComponentProps` + runtime gain `slot` and `hidden`; `undefined` clears a prop | without `slot` the react form of this block does not compile at all |
| F-5 | `readViewEntry` and `kai-tab-bar`'s item reader prefer the property over the attribute | without it the react form renders every view at once and the vue form breaks intermittently |
| F-9 | `gen-element-react.mjs` types the forwarded ref as the element interface it already generates | `#ref` promises a typed handle the react form cannot honour |
| F-10 | re-export `ConversationSummary` from `@kitn.ai/ui/stores` | small; the controller reaches into the root entry for a type its own dependency hands it |

**To verification (§5):**

- Make **vue-tsc the vue cell**, not a supplement to a `default`-project pass, and pin the
  augmentation with a planted-defect self-test — the cell is green-on-nothing without it.
- **Compile-only is not enough for react.** F-8's third hole (`undefined` cannot clear) and
  F-6's controlled-component loop both type-check perfectly and both break the block. If the
  react runtime cell is dropped for budget, say in the gate's output that the react form is
  compile-checked only, so nobody reads its green as more than it is.

---

## Appendix: the trees in full

The scratch directory is discarded, so the four files that matter are reproduced here.
The two adapters and the two components ARE the generator's targets.

### A1. The authored page (the contract under test)

`spike/support-widget/support-widget.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Support widget</title>
    <link rel="stylesheet" href="./support-widget.css" />
  </head>
  <body>
    <p class="host-stand-in">This blank page stands in for your site. The chat widget is in the bottom-right corner.</p>

    <!-- Bindings, per spec 2026-09-02 §3.1 plus the two amendments:
           .prop="field"      -> a JS PROPERTY set from controller state
           :attr="field"      -> a runtime SCALAR attribute from controller state
           @kai-event="action"-> a non-bubbling kai-* event on THIS element
           #ref="name"        -> a typed handle the controller gets (methods only)
         Everything else is a literal, exactly as today. -->
    <kai-dock
      #ref="dock"
      label="Support"
      position="bottom-end"
      hide-close
      .unread="unread"
      @kai-open-change="openChange"
    >
      <kai-panel slot="panel">
        <kai-panel-header slot="header">
          <kai-button
            slot="start"
            variant="ghost"
            size="icon-sm"
            icon="arrow-left"
            label="Back"
            :hidden="backHidden"
            @kai-click="back"
          ></kai-button>
          Support
          <kai-button
            slot="end"
            variant="ghost"
            size="icon-sm"
            icon="x"
            label="Close Support"
            @kai-click="close"
          ></kai-button>
        </kai-panel-header>

        <!-- The stack OWNS navigation. `view` stays a literal seed: driving it
             from the same state kai-view-change writes is a controlled loop,
             and back() has no `view` value that expresses it anyway. -->
        <kai-view-stack #ref="stack" view="home" @kai-view-change="viewChange">
          <!-- Home tab -->
          <kai-view name="home" tab-root>
            <div class="home">
              <div class="greeting">
                <h2>How can we help? &#x1F44B;</h2>
                <p class="subtitle">Orders, refunds, anything.</p>
              </div>
              <kai-row class="recent-card" interactive :hidden="recentHidden" @kai-click="openRecent">
                <span .textContent="recentTitle"></span>
                <span slot="subtitle" .textContent="recentPreview" :hidden="recentPreviewHidden"></span>
                <span slot="trailing" class="unread-dot" :hidden="recentDotHidden"></span>
                <span slot="trailing" .textContent="recentTime"></span>
              </kai-row>
              <kai-button full align="start" icon-trailing="arrow-right" @kai-click="startNew">Send us a message</kai-button>
              <div class="home-links">
                <kai-row href="https://ui.kitn.ai" chevron>
                  <kai-icon slot="leading" name="book-open" size="sm"></kai-icon>
                  Help center
                  <span slot="subtitle">Guides and FAQs</span>
                </kai-row>
              </div>
            </div>
          </kai-view>

          <!-- Messages tab: ITEM mode. AMENDMENT 3: the four binding kinds
               cannot express a list, so this needs a fifth, `*for`, with an
               explicit `:key`. -->
          <kai-view name="messages" tab-root>
            <kai-conversations
              searchable="false"
              .activeId="activeId"
              @kai-conversation-select="openConversation"
            >
              <span slot="header"></span>
              <kai-conversation-item
                *for="row of conversationRows"
                :key="row.id"
                :conversation-id="row.id"
                density="panel"
                :unread="row.unread"
              >
                <span .textContent="row.title"></span>
                <span slot="meta" .textContent="row.preview" :hidden="row.previewHidden"></span>
                <span slot="menu" class="row-time" .textContent="row.time"></span>
              </kai-conversation-item>
            </kai-conversations>
            <kai-button class="new-pill" variant="outline" size="sm" @kai-click="startNew">New conversation</kai-button>
          </kai-view>

          <!-- Drilled chat -->
          <kai-view name="chat">
            <kai-thread .messages="messages" .loading="loading">
              <kai-empty
                slot="empty"
                empty-title="Hi, we're here to help"
                description="Ask us about orders, refunds, and more."
              ></kai-empty>
            </kai-thread>
            <kai-prompt-input
              placeholder="Ask anything"
              .suggestions="suggestions"
              .loading="loading"
              @kai-submit="submit"
            ></kai-prompt-input>
          </kai-view>
        </kai-view-stack>

        <kai-tab-bar
          slot="footer"
          label="Widget navigation"
          .value="tab"
          :hidden="tabBarHidden"
          @kai-tab-change="tabChange"
        >
          <kai-tab-bar-item value="home" icon="home">Home</kai-tab-bar-item>
          <kai-tab-bar-item value="messages" icon="message-square" .dot="unread">Messages</kai-tab-bar-item>
        </kai-tab-bar>
      </kai-panel>
    </kai-dock>
  </body>
</html>
```

### A2. The framework-neutral controller

`spike/support-widget/support-widget.controller.ts`

```ts
/**
 * support-widget, the framework-neutral controller.
 *
 * The contract under test (spec 2026-09-02 §3.2, plus the two amendments):
 *
 *   createController(deps) => { state(): State; actions: Actions; subscribe(fn): () => void }
 *
 * Everything the imperative `support-widget.js` did to the DOM is now either
 * a field of `State` (bound onto an element with `.prop=` / `:attr=`) or an
 * `actions` entry (bound with `@kai-event=`). The ONLY DOM this file touches
 * is through `deps.refs()`, and only to call element METHODS that have no
 * declarative equivalent: the view stack's push/back/selectTab and the dock's
 * hide.
 *
 * AMENDMENT 1 (found by this conversion): `refs` is a GETTER, not a value.
 * No framework has its element handles at the moment the controller is
 * constructed - React's ref is null through the first render, Vue's template
 * ref is null until mount - so `deps.refs` has to be callable and every
 * handle has to be nullable.
 *
 * AMENDMENT 2 (found by this conversion): State is a VIEW MODEL, not domain
 * state. The binding syntax has no expressions, so every derivation the old
 * script did inline - `!drilled`, the relative-time string, the title/preview
 * dedupe, whether a preview line exists at all - is precomputed into its own
 * field here. That is the price of keeping bindings dumb enough for six
 * renderers to agree about, and it is worth paying, but it means the field
 * count is presentation-shaped rather than minimal.
 */
import { createAssistantStream, createMockResponder } from '@kitn.ai/ui/state';
import type { ChatMessage } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';
import { localStorageStore, createConversationController, isConversationUnread } from '@kitn.ai/ui/stores';
// GAP: `ConversationSummary` is the type `onSummariesChange` hands you, but
// `@kitn.ai/ui/stores` does not re-export it - only the heavy root entry does.
import type { ConversationSummary } from '@kitn.ai/ui';
import { MOCK_SCRIPT, MOCK_TOOL_OUTPUTS, SUGGESTIONS } from './mock';

// KNOWN RESIDUAL (spike finding F-9), carried over verbatim from the authored
// block: the "2m ago" formatter is internal to the Solid layer and is not
// exported from @kitn.ai/ui/stores, so the block restates it.
function relativeTimeShort(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const ASSISTANT_ACTIONS = ['copy', 'like', 'dislike'] as const;
const USER_ACTIONS = ['edit'] as const;

/** One rendered row of the messages list. Every field is already a string or
 *  a boolean, because `*for` bodies get bindings, not expressions. */
export interface ConversationRow {
  id: string;
  title: string;
  preview: string;
  previewHidden: boolean;
  time: string;
  unread: boolean;
}

export interface SupportWidgetState {
  // thread
  messages: ChatMessage[];
  suggestions: string[] | undefined;
  loading: boolean;
  // chrome
  backHidden: boolean;
  tabBarHidden: boolean;
  tab: string;
  unread: boolean;
  // messages tab
  activeId: string | undefined;
  conversationRows: ConversationRow[];
  // home tab's recent card
  recentHidden: boolean;
  recentTitle: string;
  recentTime: string;
  recentPreview: string;
  recentPreviewHidden: boolean;
  recentDotHidden: boolean;
}

/** The element handles the controller needs, narrowed to the methods it
 *  calls. Nullable because they arrive after construction. */
export interface SupportWidgetRefs {
  stack: { push(name: string): void; back(): void; selectTab(name: string): void } | null;
  dock: { hide(): void } | null;
}

export interface SupportWidgetDeps {
  refs: () => SupportWidgetRefs;
  /** Storage key; the block's default is its own id. */
  storageKey?: string;
}

export interface SupportWidgetActions {
  /** `@kai-view-change` on the view stack. */
  viewChange(event: CustomEvent<{ view?: string; root?: string; drilled: boolean }>): void;
  /** `@kai-tab-change` on the tab bar. */
  tabChange(event: CustomEvent<{ value: string }>): void;
  /** `@kai-open-change` on the dock. */
  openChange(event: CustomEvent<{ open: boolean }>): void;
  /** `@click` on the header back button. */
  back(): void;
  /** `@click` on the header close button. */
  close(): void;
  /** `@click` on the home CTA and the "New conversation" pill. */
  startNew(): void;
  /** `@kai-click` on the home recent row. */
  openRecent(): Promise<void>;
  /** `@kai-conversation-select` on the list. */
  openConversation(event: CustomEvent<{ id: string }>): Promise<void>;
  /** `@kai-submit` on the prompt input. */
  submit(event: CustomEvent<{ value: string; attachments?: unknown[] }>): Promise<void>;
  /** Mount hook: hydrate from storage. Not a binding - the host calls it. */
  boot(): Promise<void>;
}

export interface SupportWidgetController {
  state(): SupportWidgetState;
  actions: SupportWidgetActions;
  subscribe(listener: () => void): () => void;
}

export function createController(deps: SupportWidgetDeps): SupportWidgetController {
  const listeners = new Set<() => void>();

  let state: SupportWidgetState = {
    messages: [],
    suggestions: SUGGESTIONS,
    loading: false,
    backHidden: true,
    tabBarHidden: false,
    tab: 'home',
    unread: false,
    activeId: undefined,
    conversationRows: [],
    recentHidden: true,
    recentTitle: '',
    recentTime: '',
    recentPreview: '',
    recentPreviewHidden: true,
    recentDotHidden: true,
  };

  // A NEW state object every patch: the snapshot getter is compared by
  // identity by useSyncExternalStore, and the kai- reactivity contract wants a
  // new array reference for `messages` anyway.
  const patch = (next: Partial<SupportWidgetState>): void => {
    state = { ...state, ...next };
    for (const l of listeners) l();
  };

  const setMessages = (messages: ChatMessage[]): void =>
    patch({ messages, suggestions: messages.length === 0 ? SUGGESTIONS : undefined });

  const store = localStorageStore(deps.storageKey ?? 'support-widget');

  const controller = createConversationController(store, {
    initialView: 'home',
    initialOpen: false,
    onMessagesLoad: (msgs) => setMessages(msgs),
    onSummariesChange: (summaries) => patch(projectSummaries(summaries)),
    onUnreadChange: (anyUnread) => patch({ unread: anyUnread }),
  });

  function projectSummaries(summaries: ConversationSummary[]): Partial<SupportWidgetState> {
    const rows: ConversationRow[] = summaries.map((s) => {
      // Display dedupe: the store titles a conversation from message text, so
      // the title and the trailing preview can be the same string.
      const preview = s.trailing && s.trailing !== s.title ? s.trailing : '';
      return {
        id: s.id,
        title: s.title,
        preview,
        previewHidden: preview === '',
        time: relativeTimeShort(s.updatedAt ?? s.lastMessageAt),
        unread: isConversationUnread(s),
      };
    });
    const recent = rows[0];
    return {
      conversationRows: rows,
      activeId: controller.activeId(),
      recentHidden: !recent,
      recentTitle: recent?.title ?? '',
      recentTime: recent?.time ?? '',
      recentPreview: recent?.preview ?? '',
      recentPreviewHidden: !recent || recent.previewHidden,
      recentDotHidden: !recent || !recent.unread,
    };
  }

  const respond = createMockResponder({ replies: MOCK_SCRIPT });

  const actions: SupportWidgetActions = {
    viewChange(event) {
      const { view, root, drilled } = event.detail;
      // The stack's one rule, CONSUMED not restated: drilled shows the back
      // arrow and hides the tab bar.
      patch({ backHidden: !drilled, tabBarHidden: drilled, tab: root ?? state.tab });
      void controller.setView(view ?? 'home'); // only 'chat' satisfies the seen rule
    },

    tabChange(event) {
      deps.refs().stack?.selectTab(event.detail.value);
    },

    openChange(event) {
      void controller.setOpen(event.detail.open);
    },

    back() {
      deps.refs().stack?.back();
    },

    close() {
      deps.refs().dock?.hide();
    },

    startNew() {
      controller.startNew();
      deps.refs().stack?.push('chat');
    },

    async openRecent() {
      const recent = controller.summaries()[0];
      if (recent) await controller.select(recent.id);
      deps.refs().stack?.push('chat');
    },

    async openConversation(event) {
      await controller.select(event.detail.id);
      deps.refs().stack?.push('chat');
    },

    async submit(event) {
      const text = event.detail.value.trim();
      if (!text || state.loading) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        actions: [...USER_ACTIONS],
        parts: [
          { type: 'text', text },
          ...((event.detail.attachments ?? []) as never[]).map((attachment) => ({
            type: 'file' as const,
            attachment,
          })),
        ],
      };
      setMessages([...state.messages, userMessage]);
      patch({ loading: true });

      const stream = createAssistantStream((update) => setMessages(update(state.messages)));
      try {
        await readOpenAIStream(respond(text), stream);
        for (const part of state.messages.find((m) => m.id === stream.id)?.parts ?? []) {
          if (part.type !== 'tool' || part.tool.state !== 'input-available' || !part.tool.toolCallId) continue;
          const output = MOCK_TOOL_OUTPUTS[part.tool.type];
          if (output) stream.upsertTool(part.tool.toolCallId, { state: 'output-available', output });
        }
        stream.done();
        setMessages(
          state.messages.map((m) => (m.id === stream.id ? { ...m, actions: [...ASSISTANT_ACTIONS] } : m)),
        );
        await controller.saveTurn(state.messages);
      } catch (err) {
        stream.abort(err instanceof Error ? err.message : String(err));
      } finally {
        patch({ loading: false });
      }
    },

    async boot() {
      setMessages([]);
      await controller.refresh();
      await controller.restore();
    },
  };

  return {
    state: () => state,
    actions,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener) as unknown as void;
    },
  };
}
```

### A3. React — the component

`spike/react/SupportWidget.tsx`

```tsx
// The react FORM of support-widget: what the react renderer must emit.
// Hand-written here as the generator's target.
//
// Every kai element comes from the typed wrappers in `@kitn.ai/ui/react`, per
// the spec's structural check. Handler names are the wrapper generator's own
// rule (drop `kai-`, PascalCase, prefix `on`): kai-submit -> onSubmit,
// kai-view-change -> onViewChange, kai-conversation-select -> onConversationSelect.
import {
  Button,
  Conversations,
  ConversationItem,
  Dock,
  Empty,
  Icon,
  Panel,
  PanelHeader,
  PromptInput,
  Row,
  TabBar,
  TabBarItem,
  Thread,
  View,
  ViewStack,
} from '@kitn.ai/ui/react';
import type { KaiDockElement, KaiViewStackElement } from '@kitn.ai/ui/elements';
import { useSupportChat } from './useSupportChat';
import './support-widget.css';

export function SupportWidget() {
  const { state, actions, refs } = useSupportChat();

  return (
    <Dock
      ref={(el) => {
        refs.current.dock = el as KaiDockElement | null;
      }}
      label="Support"
      position="bottom-end"
      hideClose
      unread={state.unread}
      onOpenChange={actions.openChange}
    >
      <Panel slot="panel">
        <PanelHeader slot="header">
          <Button
            slot="start"
            variant="ghost"
            size="icon-sm"
            icon="arrow-left"
            label="Back"
            hidden={state.backHidden}
            onClick={actions.back}
          />
          Support
          <Button
            slot="end"
            variant="ghost"
            size="icon-sm"
            icon="x"
            label="Close Support"
            onClick={actions.close}
          />
        </PanelHeader>

        <ViewStack
          ref={(el) => {
            refs.current.stack = el as KaiViewStackElement | null;
          }}
          // NOTE: no `view="home"`. A literal attribute in the authored
          // markup becomes a prop React re-asserts on EVERY render, and this
          // element treats `view` as settable-and-navigating, so each
          // kai-view-change -> setState -> render cycle wrote 'home' back and
          // undid the navigation. The stack already defaults to its first tab
          // root, so the seed is redundant here. See the report, Q2/F-6.
          onViewChange={actions.viewChange}
        >
          <View name="home" tabRoot>
            <div className="home">
              <div className="greeting">
                <h2>How can we help? 👋</h2>
                <p className="subtitle">Orders, refunds, anything.</p>
              </div>
              <Row className="recent-card" interactive hidden={state.recentHidden} onClick={actions.openRecent}>
                <span>{state.recentTitle}</span>
                <span slot="subtitle" hidden={state.recentPreviewHidden}>
                  {state.recentPreview}
                </span>
                <span slot="trailing" className="unread-dot" hidden={state.recentDotHidden} />
                <span slot="trailing">{state.recentTime}</span>
              </Row>
              <Button full align="start" iconTrailing="arrow-right" onClick={actions.startNew}>
                Send us a message
              </Button>
              <div className="home-links">
                <Row href="https://ui.kitn.ai" chevron>
                  <Icon slot="leading" name="book-open" size="sm" />
                  Help center
                  <span slot="subtitle">Guides and FAQs</span>
                </Row>
              </div>
            </div>
          </View>

          <View name="messages" tabRoot>
            <Conversations
              searchable={false}
              activeId={state.activeId}
              onConversationSelect={actions.openConversation}
            >
              <span slot="header" />
              {state.conversationRows.map((row) => (
                <ConversationItem
                  key={row.id}
                  conversationId={row.id}
                  density="panel"
                  unread={row.unread}
                >
                  <span>{row.title}</span>
                  <span slot="meta" hidden={row.previewHidden}>
                    {row.preview}
                  </span>
                  <span slot="menu" className="row-time">
                    {row.time}
                  </span>
                </ConversationItem>
              ))}
            </Conversations>
            <Button className="new-pill" variant="outline" size="sm" onClick={actions.startNew}>
              New conversation
            </Button>
          </View>

          <View name="chat">
            <Thread messages={state.messages} loading={state.loading}>
              <Empty
                slot="empty"
                emptyTitle="Hi, we're here to help"
                description="Ask us about orders, refunds, and more."
              />
            </Thread>
            <PromptInput
              placeholder="Ask anything"
              suggestions={state.suggestions}
              loading={state.loading}
              onSubmit={actions.submit}
            />
          </View>
        </ViewStack>

        <TabBar
          slot="footer"
          label="Widget navigation"
          value={state.tab}
          hidden={state.tabBarHidden}
          onTabChange={actions.tabChange}
        >
          <TabBarItem value="home" icon="home">
            Home
          </TabBarItem>
          <TabBarItem value="messages" icon="message-square" dot={state.unread}>
            Messages
          </TabBarItem>
        </TabBar>
      </Panel>
    </Dock>
  );
}
```

### A4. React — the adapter

`spike/react/useSupportChat.ts`

```ts
// The react adapter. `useSyncExternalStore` takes exactly the getter +
// subscribe pair the controller contract specifies, so this file is the whole
// adapter: no state mirrored, no effects re-deriving anything.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  createController,
  type SupportWidgetRefs,
  type SupportWidgetState,
  type SupportWidgetActions,
} from '../support-widget/support-widget.controller';

export interface UseSupportChat {
  state: SupportWidgetState;
  actions: SupportWidgetActions;
  /** The two element handles the controller calls methods on. */
  refs: React.MutableRefObject<SupportWidgetRefs>;
}

export function useSupportChat(): UseSupportChat {
  // The refs object is stable and the controller reads it lazily, which is why
  // `deps.refs` is a getter: at this point both handles are still null.
  const refs = useRef<SupportWidgetRefs>({ stack: null, dock: null });
  const [controller] = useState(() => createController({ refs: () => refs.current }));

  const state = useSyncExternalStore(controller.subscribe, controller.state, controller.state);

  useEffect(() => {
    void controller.actions.boot();
  }, [controller]);

  return { state, actions: controller.actions, refs };
}
```

### A5. Vue — the component

`spike/vue/SupportWidget.vue`

```vue
<!--
  The vue FORM of support-widget: what the vue renderer must emit.
  Hand-written here as the generator's target.

  Bindings translate one for one from the authored markup:
    .prop="field"        ->  :prop.prop="state.field"
    :attr="field"        ->  :attr="state.field"
    @kai-event="action"  ->  @kai-event="actions.action"
    #ref="name"          ->  ref="name" + a matching `ref()` in <script setup>
    *for / :key          ->  v-for / :key
    .textContent="f"     ->  {{ state.f }}

  The project needs ONE config line for this file to compile and run:
    vue({ template: { compilerOptions: { isCustomElement: (t) => t.startsWith('kai-') } } })
-->
<script setup lang="ts">
// Registration. The authored block imported `@kitn.ai/ui/autoloader`; the
// bundled forms use the register-all bundle instead (the autoloader resolves
// element modules relative to its own URL and 404s through a bundler), which
// is exactly what `adaptRegistrationForBundler` already does for the wc form.
// The react form needs no equivalent - its wrappers self-register.
import '@kitn.ai/ui/elements';
import { ref } from 'vue';
import type { KaiDockElement, KaiViewStackElement } from '@kitn.ai/ui/elements';
import { useSupportChat } from './useSupportChat';
import './support-widget.css';

const dock = ref<KaiDockElement | null>(null);
const stack = ref<KaiViewStackElement | null>(null);

const { state, actions } = useSupportChat({ dock, stack });
</script>

<template>
  <kai-dock
    ref="dock"
    label="Support"
    position="bottom-end"
    hide-close
    :unread.prop="state.unread"
    @kai-open-change="actions.openChange"
  >
    <kai-panel slot="panel">
      <kai-panel-header slot="header">
        <kai-button
          slot="start"
          variant="ghost"
          size="icon-sm"
          icon="arrow-left"
          label="Back"
          :hidden="state.backHidden"
          @kai-click="actions.back"
        ></kai-button>
        Support
        <kai-button
          slot="end"
          variant="ghost"
          size="icon-sm"
          icon="x"
          label="Close Support"
          @kai-click="actions.close"
        ></kai-button>
      </kai-panel-header>

      <kai-view-stack ref="stack" view="home" @kai-view-change="actions.viewChange">
        <kai-view :name.attr="'home'" tab-root>
          <div class="home">
            <div class="greeting">
              <h2>How can we help? &#x1F44B;</h2>
              <p class="subtitle">Orders, refunds, anything.</p>
            </div>
            <kai-row
              class="recent-card"
              interactive
              :hidden="state.recentHidden"
              @kai-click="actions.openRecent"
            >
              <span>{{ state.recentTitle }}</span>
              <span slot="subtitle" :hidden="state.recentPreviewHidden">{{ state.recentPreview }}</span>
              <span slot="trailing" class="unread-dot" :hidden="state.recentDotHidden"></span>
              <span slot="trailing">{{ state.recentTime }}</span>
            </kai-row>
            <kai-button full align="start" icon-trailing="arrow-right" @kai-click="actions.startNew">
              Send us a message
            </kai-button>
            <div class="home-links">
              <kai-row href="https://ui.kitn.ai" chevron>
                <kai-icon slot="leading" name="book-open" size="sm"></kai-icon>
                Help center
                <span slot="subtitle">Guides and FAQs</span>
              </kai-row>
            </div>
          </div>
        </kai-view>

        <kai-view :name.attr="'messages'" tab-root>
          <kai-conversations
            :searchable.prop="false"
            :activeId.prop="state.activeId"
            @kai-conversation-select="actions.openConversation"
          >
            <span slot="header"></span>
            <kai-conversation-item
              v-for="row in state.conversationRows"
              :key="row.id"
              :conversation-id="row.id"
              density="panel"
              :unread="row.unread"
            >
              <span>{{ row.title }}</span>
              <span slot="meta" :hidden="row.previewHidden">{{ row.preview }}</span>
              <span slot="menu" class="row-time">{{ row.time }}</span>
            </kai-conversation-item>
          </kai-conversations>
          <kai-button class="new-pill" variant="outline" size="sm" @kai-click="actions.startNew">
            New conversation
          </kai-button>
        </kai-view>

        <kai-view :name.attr="'chat'">
          <kai-thread :messages.prop="state.messages" :loading.prop="state.loading">
            <kai-empty
              slot="empty"
              empty-title="Hi, we're here to help"
              description="Ask us about orders, refunds, and more."
            ></kai-empty>
          </kai-thread>
          <kai-prompt-input
            placeholder="Ask anything"
            :suggestions.prop="state.suggestions"
            :loading.prop="state.loading"
            @kai-submit="actions.submit"
          ></kai-prompt-input>
        </kai-view>
      </kai-view-stack>

      <kai-tab-bar
        slot="footer"
        label="Widget navigation"
        :value.prop="state.tab"
        :hidden="state.tabBarHidden"
        @kai-tab-change="actions.tabChange"
      >
        <kai-tab-bar-item :value.attr="'home'" icon="home">Home</kai-tab-bar-item>
        <kai-tab-bar-item :value.attr="'messages'" icon="message-square" :dot.prop="state.unread">
          Messages
        </kai-tab-bar-item>
      </kai-tab-bar>
    </kai-panel>
  </kai-dock>
</template>
```

### A6. Vue — the adapter

`spike/vue/useSupportChat.ts`

```ts
// The vue adapter. The controller's getter + subscribe pair goes into a
// shallowRef: one subscription, one assignment, no state mirrored.
import { onMounted, onUnmounted, shallowRef, type Ref, type ShallowRef } from 'vue';
import {
  createController,
  type SupportWidgetActions,
  type SupportWidgetState,
} from '../support-widget/support-widget.controller';

export interface SupportWidgetElementRefs {
  stack: Ref<{ push(name: string): void; back(): void; selectTab(name: string): void } | null>;
  dock: Ref<{ hide(): void } | null>;
}

export function useSupportChat(refs: SupportWidgetElementRefs): {
  state: ShallowRef<SupportWidgetState>;
  actions: SupportWidgetActions;
} {
  // Same reason as react's: the template refs are null right now, so the
  // controller reads them lazily through the getter.
  const controller = createController({
    refs: () => ({ stack: refs.stack.value, dock: refs.dock.value }),
  });

  const state = shallowRef<SupportWidgetState>(controller.state());
  const unsubscribe = controller.subscribe(() => {
    state.value = controller.state();
  });

  onMounted(() => {
    void controller.actions.boot();
  });
  onUnmounted(unsubscribe);

  return { state, actions: controller.actions };
}
```

### A7. Vue — the typings shim

`spike/vue/kai-elements.d.ts`

```ts
// THE shim a vue project needs, and it is one line of real content: importing
// `@kitn.ai/ui/elements` for its types pulls in the kit's own
// `declare module 'vue' { interface GlobalComponents { 'kai-dock': ... } }`
// augmentation, so every kai-* tag in a template is typed rather than an
// unknown-element error under vue-tsc.
import '@kitn.ai/ui/elements';

// Vite's `?inline`-free plain css import in an SFC.
declare module '*.css';
```
