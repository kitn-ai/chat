# Handoff: conversations feature complete + full session state (2026-08-26)

Written for a fresh seat, any model, no prior context. The owner cleared the session here.

## Read in this order
1. `.superpowers/sdd/2026-08-26-conversations/progress.md` — THE LEDGER for the active branch (every ruling, rework round, review outcome). Trust it + `git log` over recollection.
2. `docs/superpowers/specs/2026-08-26-conversations-design.md` (C-1..C-9) + `docs/superpowers/plans/2026-08-26-conversations.md` — spec + plan. NOTE: the list-view DESIGN deviates from the spec by live owner direction (rework rounds, all ledgered): purpose-built `ConversationPanel`, not the spec's ConversationList composition.
3. Memory `[[construct-engine]]` (shipped state + next-phase bank) and `[[story-first-ui-iteration]]` (owner process policy).
4. The prior workstream's ledger (shipped): `.superpowers/sdd/2026-08-25-construct-engine/progress.md`.

## Where things stand

**Shipped to npm**: `@kitn.ai/ui 0.27.0` (the construct engine + widget chrome; `./define` live, cold-verified). PR #324 merged as `62ac3ea4`; release PR #312 merged; follow-up issues #325–#331 filed; docs PR #332 (multi-harness MCP setup) merged.

**Active branch `feat/conversations`** (off main `f5d81712`, head `c8c183c4` at handoff, 14 commits): the multi-conversation widget — ConversationStore adapter contract (+localStorage/fetch adapters, legacy-thread migration), ChatThread state machine (chat⇄list, lazy ids, auto-restore, close-reset, seenNow/unread), purpose-built ConversationPanel (Intercom pattern: full-area list, title + last-message preview + relative time, floating "New conversation" pill, chat-bubble/back-arrow header icons), kai-chat facade forwarding, construct vocabulary `capabilities.conversations` + `theme.unreadColor`, unread indicators (red default `--color-unread`, three surfaces incl. the FAB badge), a ChatThread Storybook story. **Owner APPROVED the demo (Task 6). FINAL REVIEW COMPLETE: FIX-FIRST → fix wave 96e847bb landed (kai-conversation-load facade event + missing-handler guard + phantom-unread hydration fix + fold-ins) → re-review PASS, CLEAR TO MERGE. Head at handoff: `b16c085e` (adds packages/ui/src/agent-tooling/README.md — the owner-requested onboarding doc). REMAINING: the owner's merge choice (merge local / PR / keep) — present the menu; then release sequencing (the conversations vocabulary reaches the published schema URL + npm on the next release). Follow-up notes to file at merge: fetchStore encodeURIComponent on ids · recency-sort duplication (panel vs chat-thread) · Dock FAB badge invisible to AT · suppressNextSave consumer-misuse edge (handler that never feeds messages back eats one save).**

**Demo**: `kai dev` on :5173 against `fixtures/owner-widget.construct.json` with the local tarball (`--ui file:<scratchpad>/kitn.ai-ui-0.27.0.tgz` — npm 0.27.0 lacks the conversations vocabulary until this branch ships). Editor "Property not allowed" squiggles on the fixture are expected pre-release drift ($schema URL serves the deployed schema).

## Agent-tooling: what it is and where it fits (owner asked to pin this down)

`packages/ui/src/agent-tooling/` is the kit's **machine-facing front door** — everything that makes AI coding agents (and now humans-via-CLI) fluent at building with the library. It is independent of the components; nothing in `components/`/`elements/` imports it. Four parts:

1. **The `kai` MCP server** (`agent-tooling/mcp/`, run via `npx @kitn.ai/ui mcp`, bin dispatcher at `packages/ui/bin/mcp.js`). Five tools: `component_reference` (element docs from the generated manifest) · `scaffold` (emits full consumer apps: frameworks × integrations × surfaces; gated by verify:scaffold) · `theme` · `debug` · `construct` (turn-by-turn construct authoring, starter-from-intent). Setup docs for 11 harnesses: docs site → guides/for-ai-agents (PR #332).
2. **The construct engine** (`agent-tooling/construct/`): `schema.ts` (Zod source of truth; published JSON Schema derived to `construct.v1.schema.json` + ui.kitn.ai/schemas/construct/v1.json, drift-guarded) · `codegen.ts` (construct JSON → a small Solid app composing the kit's own components → compiled to ONE self-registering element) · `cli.ts` (`kai validate|dev|compile|eject`) · `fixtures/` (owner-widget = the living example). Hard rule: vocabulary-never-logic. The CI gate `verify:construct` derives its fixture axes FROM the schema (adding a capability moves the cell count automatically).
3. **The catalogs** (`agent-tooling/catalog/`): integrations/archetypes/invariants/scenarios — the data the scaffold + acceptance machinery read. `scenarios.ts` = the acceptance-harness scenario list (S1–S7; the graded agent-builds-an-app runs via `scripts/acceptance-pack/run/eval.mjs`).
4. **How it relates to everything else**: the three front doors (create-kai CLI / the kai MCP / a future visual builder) are all thin skins over this layer — the construct format is the shared engine (see the next-phase bank in `[[construct-engine]]` memory: schema-derived terminal wizard → builder-as-schema-renderer). CLAUDE.md's Map section names it; `.claude/README.md` indexes the repo tooling.

If this section rots, the re-discovery path is: CLAUDE.md Map → `agent-tooling/` folder README-level doc comments → the memory files above.

## Owner decisions this session (conversations arc — all also in the ledger)
Adapter store contract (NO transport vocabulary — owner reversal of a REST proposal) · list-view behind header button · new+switch only v1 · conversations:true gated on history · purpose-built widget list (NOT the desktop roster) · full-area list takeover · last-message preview rows · single floating new-conversation pill · chat-bubble/back-arrow header icons sized to the X · close-while-on-list resets to chat · unread indicators (red default, `theme.unreadColor` customizable — owner would pick sky blue; fixture demos #38BDF8) · story-first policy for new visual surfaces ([[story-first-ui-iteration]]) · home screen = NEXT round, story-first, NOT this branch.

## Banked next-phase (owner ideation, none dispatched — full wording in ledger + [[construct-engine]] memory)
Vague-prompt acceptance scenario S8 (grades door discovery) · construct-MCP capability menu · create-kai terminal wizard DERIVED from the construct schema · wizard-as-builder-skeleton (schema rendered as visual knobs + live preview) · knobs-first-AI-after · guided-ceiling TBD (construct = seed not ceiling; eject hands off to agent harnesses).

## Known traps priced this session
Subagent background gates DIE at turn boundaries (run FOREGROUND — bit twice more this session) · scoped test runs miss branch failures (the FULL unit project is the only honest gate — 4 misses) · types-without-forwarding facade trap (bit twice; caught via verify:generated artifact diffs) · jsdom tests that pass a callback explicitly can never catch its absence in emitted code (the onConversationLoad lesson — test at the emitted layer) · Claude-in-Chrome observation tabs are frame-starved (false scroll bugs).
