# Widget vocabulary candidates — owner ruling (2026-08-26)

Synthesizes `.superpowers/sdd/2026-08-25-construct-engine/research-widget-feature-audit.md` (kit/construct audit) and `research-widget-market-survey.md` (Intercom/Zendesk/Crisp/Chatbase-class market survey) against the owner's chat-box wishlist, per the construct engine's vocabulary-on-evidence rule.

## 1. Exec summary

Most of the wishlist is either already free (close/X, minimize, mobile fullscreen takeover, starters) or codegen-only — the kit surface exists (`Dock`, `ChatThread` slots, `ConversationList`) and the construct schema just needs a field plus an `emit*` branch to thread it through. Two items are genuinely new plumbing: user/visitor identity (the market's dominant pattern is a signed JWT/HMAC, not a raw id) and per-user history scoping, which depends on identity landing first. Everything shaped like scheduling, targeting, licensing, or consent policy is out of scope by the repo's own HOW/WHETHER rule, and the survey independently confirms each of those is treated as APP-side across the market. The recommended v1 batch is the codegen-only cluster plus plain (unsigned) identity passthrough — it's the smallest set that makes the widget layout read as a finished product, and it doesn't foreclose the signed-identity fork later.

## 2. Already ships / no work

| Feature | Status |
|---|---|
| Close/X toggle | Free via `Dock` — default open-state icon is `X` (lucide), Escape closes (scoped, non-swallowing). Ships unconditionally for `layout: 'widget'`. |
| Minimize to FAB | Free via `Dock` — panel stays mounted (`visibility:hidden` + `inert`), so minimize is non-destructive. |
| Starters / suggestions | Fully wired end-to-end: `capabilities.starters` → `emitStartersProp` → `ChatThread` `suggestions`/`suggestionMode`/`persistSuggestions`. The one capability the audit found with zero gap. |

No action needed on any of these. They validate that the Dock/ChatThread layer is solid; the gaps below are all "wire the schema to it," not "build it."

## 3. Codegen-only vocabulary

Kit surface exists; each needs a construct schema field plus an `emit*` branch in codegen. All are additive to `schema.ts` — no new kit primitives.

### 3a. FAB position + icon

- **Proposed shape:** layout-scoped, not top-level — `layout: { type: 'widget', position?: DockPosition, launcherIcon?: string }` (reusing `Dock`'s own `'bottom-end'|'bottom-start'|'top-end'|'top-start'` enum verbatim, not a new left/right binary). Recommend layout-scoped over a top-level `fab` field because position/icon only mean anything when `layout.type === 'widget'` — a top-level field would be meaningless noise on `fullscreen`/`aside`/`split` constructs.
- **Kit surface:** `Dock` `position` prop + `launcher`/`launcherOpen` slot override (`packages/ui/src/ui/dock.tsx`).
- **Market rating:** TABLE-STAKES (position, 6+/8 products), COMMON (custom icon, 4/8).
- **Effort:** S — `emitLayoutOpen` (codegen.ts:993) currently emits `<Dock label="${c.name}">` unconditionally; add `position` prop passthrough and an optional launcher-slot emission.

### 3b. Default-open panel

- **Proposed shape:** same layout-scoped object — `layout: { type: 'widget', defaultOpen?: boolean }`.
- **Kit surface:** `Dock` `defaultOpen` prop (dock.tsx:51), uncontrolled seed, no focus steal at mount.
- **Market rating:** DIFFERENTIATOR as declarative config (HubSpot's imperative `.open()` is the closer market analog), but the kit already has the declarative primitive, so no reason to make it a runtime call.
- **Effort:** S — emit `defaultOpen={true}` from the new boolean.

### 3c. Header title + logo

- **Proposed shape:** top-level `header: { title?: string }`, icon/logo via the *existing* `header-start` named slot rather than a dedicated `icon`/`logo` field. Recommend this over a bespoke logo field because the kit already has `header-start`/`header-end`/`header` REPLACE slots and `custom` layout's `slots` vocabulary already knows how to project into named slots — reuse that mechanism instead of adding a second image-prop convention.
- **Kit surface:** `ChatThreadProps.chatTitle` + `header-start`/`header-end`/`header` slots (`chat-thread.tsx`), facade `chat-title` attr on `<kai-chat>`.
- **Market rating:** TABLE-STAKES (title, 4+/8), COMMON (logo, 3/8). Note the survey also flags theme color as TABLE-STAKES with a WCAG-AA-checked value (Zendesk's pattern) — out of scope for this batch but worth flagging for a future theming pass, not folded into `header`.
- **Effort:** S — new `header` field, emit `chatTitle` prop; icon goes through slots, no new emission logic needed beyond what `custom` layout already has for slot projection.

### 3d. Empty state beyond suggestions

- **Proposed shape:** don't add a new field — extend the existing `slots` map (the one `custom` layout already uses) to accept an `empty` key that maps to `ChatThreadProps.empty`. Recommend this over a dedicated `emptyState: { title, description }` field because the kit's `Empty`/`EmptyHeader`/`EmptyTitle`/`EmptyDescription` primitives already compose arbitrary content — a structured title/description field would just be a worse, less flexible restatement of what slot projection already does.
- **Kit surface:** `ChatThreadProps.empty` REPLACE slot (chat-thread.tsx:118) + `Empty*` primitives (`components/empty.tsx`).
- **Market rating:** TABLE-STAKES (welcome/greeting message, 4+/8 — closest market analog, though products author it as string content not a slot).
- **Effort:** M — needs the `slots`-to-`empty` wiring in codegen plus a construct-author-facing way to compose `Empty*` primitives inside a slot; more moving parts than 3a-3c.

### 3e. Previous-conversations list

- **Proposed shape:** new `capabilities.conversations` object (mirrors the existing `capabilities.starters`/`capabilities.history` shape), threaded into `ChatThread`'s existing `sidebar` INJECT slot.
- **Kit surface:** `<kai-conversations>` + `<kai-conversation-item>`, `ConversationList`/`ConversationItem`, `ConversationSummary`/`ConversationGroup` types — all mature and unused by the construct engine today.
- **Market rating:** COMMON→TABLE-STAKES (broadly assumed in-category even where not exposed as JS config).
- **Effort:** M — the render wiring is straightforward (drop `ConversationList` into `sidebar`), but this needs a multi-thread state model the construct engine doesn't have yet (which thread is active, how switching interacts with `capabilities.history`). Larger than 3a-3d; treat as its own task, not a one-line addition.

## 4. New plumbing

### 4a. Identity passthrough (user/visitor id)

- **Proposed shape:** `provider: { userId?: string }` (or a `capabilities.identity` object if the signed variant is chosen — see Open Questions). Threaded into `emitProviderSetup` and `emitHistorySetup` so both live requests and the history endpoint carry it (query param or header, consumer's choice via an existing pattern, not a new one invented here).
- **Kit surface:** none today. No `userId`/`visitorId`/`sessionId` concept exists in `state/`, `wire/`, or the construct schema — the only near-hit is `ConversationGroup.userId`, which is a data field for a pre-fetched roster, not something threaded into requests.
- **Market rating:** TABLE-STAKES, but as a **signed** identity pattern, not a raw id. 5/8 surveyed products (Intercom `user_hash`→JWT, Crisp `user.signature`, Zendesk `authenticate`+JWT, Chatwoot HMAC, Chatbase server-signed JWT) converge on the same shape: the app holds a signing secret server-side, signs a token containing the user id, and the widget verifies the signature rather than trusting a bare id from the client. This maps directly onto the repo's HOW/WHETHER line: **KIT verifies** the signature (or, in the cheaper variant, just carries the id opaquely); **APP signs** and decides who the user is.
- **Effort:** S for plain id passthrough (no kit change, just new schema field + emission). M-L for signed-identity verification (new kit-side verify primitive, key handling story, migration path). See Open Questions — this fork needs an owner call before scoping the task.

### 4b. History scoping per user

- **Proposed shape:** extend the existing `THREAD_KEY` (`kai:${construct.name}:thread`, `emitHistorySetup`, codegen.ts:748-813) to fold in the identity value from 4a when present — `kai:${construct.name}:${userId}:thread` for `local`, and attach the id to the existing `endpoint` fetch (GET on mount / PUT on change) the same way the id reaches other requests.
- **Kit surface:** `capabilities.history` (schema.ts:80-88) already real and working; only gap is that `local` is keyed by construct tag only (one shared thread per tag per browser profile) and `endpoint` carries no identity at all today.
- **Market rating:** COMMON (session persistence mode is binary — localStorage vs memory — across 3/8 products, matching what this kit already has); identity-scoped history specifically ties to the TABLE-STAKES identity rating in 4a.
- **Effort:** S once 4a lands (pure extension of an existing key/fetch pattern); blocked until then — sequence after 4a, not in parallel.

### 4c. Mobile takeover for aside/split/fullscreen

- **Proposed shape:** no new construct field — this is a codegen/CSS fix, not authored vocabulary. Mirror `Dock`'s existing `@media (max-width: 480px)` full-bleed rule (`ui/dock.tsx:229-240`) directly inside `emitLayoutOpen`'s hand-rolled containers for `aside`/`split`/`fullscreen`.
- **Kit surface:** `widget` layout already has this solved unconditionally via `Dock`. `aside`/`split`/`fullscreen` have no breakpoints — `aside` is a fixed 380px column at every viewport width (codegen.ts:997) because codegen hand-rolls those containers per its own doc comment rather than using a dedicated kit component.
- **Market rating:** TABLE-STAKES as baked-in behavior, explicitly *not* a config knob anywhere surveyed (Intercom states padding/alignment are ignored on mobile; 4/8 confirm forced-takeover). This is strong evidence *against* adding an author-facing field here — the market treats "mobile = fullscreen" as an engine default.
- **Effort:** S — copy an existing, proven media-query pattern into three more emitted containers. No schema change.

## 5. Explicitly out of scope

Per the HOW/WHETHER rule (kit decides how it renders and connects; the app decides whether/when/who), each confirmed by the market survey as APP-side:

- **Business/office hours + routing** — scheduling/routing policy (Chatwoot per-day hours+timezone, Zendesk `hideWhenOffline`); not a rendering decision.
- **Campaign/proactive targeting** — targeting rules and trigger/delay logic (Drift `enableChatTargeting`, Botpress trigger+delay) are business policy, not presentation.
- **Consent/GDPR banner content and gating** — the mechanism (respecting a "don't persist before consent" flag) would be KIT; the banner copy, legal gating logic, and whether it's shown at all is the app's legal call. Not building either half now — no evidence of demand beyond one product (HubSpot).
- **Rate limits / allowed-origins allowlists / licensing-gated branding removal** — quota, security-policy, and monetization decisions, structurally identical to the limits/quotas the repo already excludes everywhere else.
- **Signing-secret custody** — whichever way 4a resolves, the app holds the key; the kit never becomes a place secrets live.

## 6. Recommended priority order

**Widget-chrome v1 batch (recommended):** 3a (FAB position/icon) + 3b (default-open) + 3c (header title) + 4c (mobile takeover for aside/split/fullscreen) + 4a-plain (unsigned `userId` passthrough only, no signature verification).

This is the smallest coherent set that makes the widget layout read as a finished product: an author can position and brand the launcher, control first-impression open state, title the panel, and the non-widget layouts stop looking broken on a phone — all without inventing new kit surface. Adding plain identity passthrough here is cheap (S effort, same shape as everything else in the batch) and unblocks 4b later without committing to the signed-identity fork now. Rough size: 5 tasks (3a, 3b, 3c, 4c, 4a-plain), each schema-field-plus-emit-branch scoped, consistent with how Tasks 1-13 on this branch have run.

**Second batch, sequenced after:** 3e (conversation list — needs its own multi-thread state design, don't fold into v1) then 4b (history scoping — blocked on 4a landing). 3d (empty state) can slot in either batch; it's self-contained but touches the `slots` mechanism more than the rest of the v1 set, so keep it out of the first batch to keep that batch's diff small and uniform.

**Not scheduled:** signed-identity verification (4a's harder variant) pending the Open Question below; everything in §5.

## 7. Open questions

- **Identity: plain id passthrough now, or signed identity from the start?** The market's dominant pattern (5/8 products) is a signed JWT/HMAC, not a bare id — Intercom and Chatbase are both actively migrating legacy HMAC to JWT, suggesting a raw-id-only design would be building toward a pattern the market is leaving. But building signed verification now is real new kit surface (a verify primitive, a key-format decision, docs for the app-side signing step) rather than a one-line schema field. Recommend starting with plain passthrough (§6) since it doesn't foreclose adding signature verification as an additive, backward-compatible field later — but this is the owner's call, not a default to assume silently, since it sets the shape of `provider`/`capabilities.identity` that later work builds on.
- **Header theme color:** the survey rates a WCAG-AA-checked theme color as TABLE-STAKES (Zendesk's pattern), but it wasn't part of the owner's original wishlist and doesn't have a kit primitive audited yet. Flagging rather than scoping — needs its own audit pass before it's a candidate, not a yes/no here.
