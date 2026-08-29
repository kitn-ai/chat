# T-5 vocabulary rulings (2026-08-28)

Supervisor rulings on the consolidated T-5 package
(`docs/superpowers/research/2026-08-28-builder-t5-vocabulary-proposals.md`),
made under the owner's delegation mandate (see
`HANDOFF-2026-08-28-builder-design-complete.md`). Every ruling is reworkable
by the owner; each carries its reasoning against the standing tests
(one-chat-surface boundary · invoice/policy · derive-don't-type ·
vocabulary-never-logic · menu-honesty/decide-loudly · widen-never-restructure).

Mechanism facts were verified in-tree before ruling (2026-08-28):
`ChatMessageAction = 'copy'|'like'|'dislike'|'regenerate'|'edit'`
(`src/elements/chat-types.ts:11`) with no thread-level per-role defaults prop;
`source` parts already collapse to a citations row (`src/components/message.tsx`);
`ChatThread.triggers` is real and forwarded end to end; `conversations` is the
two-state list/thread toggle only; `ChatThread.voice` renders a mic button that
fires a `voice` event and nothing else.

## Rulings

| # | Item | Ruling |
|---|------|--------|
| 1 | messageActions + kit-tier 'speak' | **ADOPT** (kit gap sequenced first) |
| 2 | aside geometry | **ADOPT** |
| 3 | capabilities.voice: boolean | **DEFER** (revised — folded into item 9's gate) |
| 4 | assistant.greeting | **REJECT** — `empty` already covers it |
| 5 | conversations persistent rail | **DEFER-ADOPT** (shape agreed, kit-gated) |
| 6 | citation content | no action (proposal itself asked none) |
| 7 | research answer chrome | **ADOPT sources.strip; DEFER answerTabs/media/relatedQuestions** |
| 8 | workspace: workSurface / header / composer | **SPLIT** — see below |
| 9 | voice wholesale | **DEFER** (T-1a gate stands) |
| 10 | Multi-mode `modes[]` | **PARK FOR OWNER** |
| 10a | shell chrome | **ADOPT** |
| 11 | workspace variants | **ADOPT as registry data** (no schema change — per its own text) |

### 1. Message actions — ADOPT

`capabilities.messageActions: { user?: Action[]; assistant?: Action[] }`,
ordered role-scoped arrays. Display affordances on an existing medium fact —
pure HOW, nothing lands on an invoice. Two pieces of sequenced kit work,
both small:

- Add `'speak'` to `ChatMessageAction`, backed by the existing
  `kai-voice-output` (browser SpeechSynthesis — free, local, no provider,
  so no invoice concern; distinct from item 3/9's STT problem).
- ChatThread per-role default-actions props (today only per-message
  `m().actions` exists; a construct can't reach per-message data, so the
  thread needs role-level defaults that per-message `actions` overrides).

Derive-don't-type: the construct enum must read from ONE const list in
`chat-types.ts` that both the TS union and the zod enum consume — never a
restated string list in `schema.ts`. Registry-guard it (a drift test).

### 2. Aside geometry — ADOPT

`aside: { position?: 'start' | 'end'; width?: string }` — a layout-scoped
sibling of `widget`, same widen-never-restructure pattern, superRefined to
`layout: 'aside'` exactly as `widget` is to `'widget'`. `codegen.ts`
hardcodes both today; this only surfaces what codegen already decides.
`width` is a CSS length string, escaped at emit like every other
construct-authored value (setProperty, never interpolated CSS text).

### 3. Voice capability — DEFER (revised from the proposal)

The proposal's own premise ("`ChatThread.voice` exists with no construct
switch") checks out, but the mechanism check breaks it: the prop renders a
mic button that fires a `voice` EVENT for the app to handle. An emitted
construct has no app code — `voice: true` would emit a dead button. That
violates decide-loudly/menu-honesty harder than the missing key does. Voice
needs its STT/wiring story designed (item 9's round, already T-1a-gated);
one gate, not two half-answers.

### 4. assistant.greeting — REJECT

The schema already has `empty: { title, description, icon }` — the
empty-thread welcome, construct-wide, exactly this fact. Round R proposed a
second vocabulary for it under a new name. Builder greeting controls bind
to `empty`; no new key. (The don't-author-a-second-policy rule, applied to
vocabulary.)

### 5. Persistent conversations rail — DEFER-ADOPT

Shape agreed: widen `conversations` from `z.literal(true)` to
`true | { persistent: true }` (the boolean→object widening pattern).
GATED on kit work — ChatThread has no permanently-visible-rail mode, only
the list/thread toggle. Assistant-template v1 ships with `conversations:
true` (real today); the rail lands as its own follow-up task with the kit
mode. Not in this arc's phase 1.

### 7. Research answer chrome — ADOPT the real piece, DEFER the rest

- **ADOPT `capabilities.sources: { strip?: boolean }`** — source parts
  already render as a citations row; this is a visibility switch on an
  existing rendering. (Spec must verify whether a hide prop exists or is a
  small kit addition.)
- **DEFER `answerTabs` / `media` / `relatedQuestions`** — all three depend
  on CONTENT the provider must generate (tab-partitioned answers, an image
  strip, follow-up questions), not just chrome. Adopting the chrome switch
  without the content story emits empty chrome — the same dead-affordance
  problem as item 3. They return with the Research build round, where the
  wire/content story gets designed. Menu-honesty at ship time decides
  whether the Research card appears with only `sources.strip` landed.

### 8. Workspace — SPLIT

- **`workSurface` — DEFER.** The proposal itself concedes "a real pane
  likely needs more than this round attempts to guess." `layout: 'split'`
  + the fixed `pane` slot is the honest today-story: pane content is
  consumer-projected. This IS the guided ceiling the design spec predicted
  Workspace would prove; recording it as the ceiling is the T-5 deliverable,
  not forcing vocabulary over it. Revisit when a real artifact-wiring
  design exists.
- **Header — ADOPT `header.themeToggle?: boolean` and
  `header.actions?: { label, variant }[]`; REJECT `header.search` /
  `header.user`** — the proposal itself notes they'd set the SAME flags as
  `shell.commandPalette`/`shell.userMenu` (10a). One vocabulary per fact:
  shell flags own those; the header renders them when shell enables them.
  `variant` enum derives from the kit Button's variant list (drift-guarded),
  never restated. Emit path: ChatThread's built-in header bar +
  `header-end` slot territory — codegen work, no new kit surface expected.
- **Composer — ADOPT `composer: { triggers?: { slash?: Item[]; mention?:
  Item[] } }` only.** Triggers are backed by the real, shipped
  `ChatThread.triggers` end to end (confirmed live in the design round).
  **DEFER `chips` / `menu` / `contextPills`** — no verified kit mechanism
  behind any of them yet (story-tier only); each returns when its component
  mechanism exists.
- **ADOPT kit-tier `composerStart`/`composerEnd` JSX props on ChatThread**
  (mirrors `emptyContent`'s escape-hatch pattern; closes the bare-Solid gap
  the round named).
- **Default-on matrix — ADOPT as recommended** (triggers default on for
  Workspace/Multi-mode only). This is registry data (template starter
  constructs), not schema.
- Codex Ask/Code dual-composer: stays banked, as the round recorded.

### 9. Voice wholesale — DEFER

T-1a's gate stands (no Labs voice surface exists; `open` talk mode needs
new kit VAD work by the round's own audit; STT wiring undesigned — item 3).
The proposed shapes are recorded in the research doc and carry forward
unmodified when the gate lifts. `Captions` shipped independently and waits
on nothing.

### 10. Multi-mode `modes[]` — PARK FOR OWNER

The proposal itself flags this as possibly the construct-vocabulary ceiling
(each mode carries a nested construct's worth of config — a top-level-grain
restructure, not a widening) and its card gate was already owner-reserved
("until the owner names it and rules on the construct direction"). This is
the one item outside the delegation's sensible reach: parking it is the
ruling. Consequence: the Settings screen stays parked too (its dependency).

### 10a. Shell chrome — ADOPT

`shell: { commandPalette?: true; userMenu?: { name: string; plan?: string }
}`. Both reuse real kit pieces (command.tsx's CommandList; the documented
Dropdown+Avatar recipe); the emitted overlay/recipe code is codegen's to
write into App.tsx. `name`/`plan` are construct-authored untrusted text —
JSON.stringify'd at emit like every sibling. `commandPalette` is
presence-only `z.literal(true)`, matching `conversations`' pattern.

## Net phase-1 schema additions

`aside` · `capabilities.messageActions` · `capabilities.sources` ·
`header.themeToggle` + `header.actions` · `composer.triggers` · `shell`.

Kit tasks admitted: `'speak'` in `ChatMessageAction` (+ derivation const) ·
ChatThread per-role default actions · `composerStart`/`composerEnd` props ·
(verify) a citations-row visibility prop.

Deferred with shapes recorded: voice (all of it) · conversations
`{persistent}` · research answerTabs/media/relatedQuestions · workSurface ·
composer chips/menu/contextPills. Parked for owner: `modes[]` (+ Settings).
