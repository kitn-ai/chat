# Handoff: builder implementation arc executed (2026-08-28, autonomous session)

Written by the supervisor seat that executed the owner mandate from
`HANDOFF-2026-08-28-builder-design-complete.md`. The owner was away for the
whole arc; every decision is ledgered for rework.

## What shipped (PR #350, branch feat/template-registry-builder)

1. **T-5 rulings** — `docs/superpowers/specs/2026-08-28-t5-vocabulary-rulings.md`.
   Adopted: messageActions (+ kit-tier `'speak'`), aside geometry,
   `sources.strip`, `header.themeToggle`/`actions`, `composer.triggers`,
   `shell`. Rejected: `assistant.greeting` (the existing `empty` key IS that
   fact). Deferred with shapes recorded: voice (all of it — a mic button with
   no STT story is a dead affordance), conversations `{persistent}`
   (kit-gated), research answerTabs/media/relatedQuestions
   (content-generation dependency), workSurface (the predicted guided
   ceiling, recorded as such), composer chips/menu/contextPills. **Parked
   for owner: `modes[]`** (top-level schema restructure; Settings screen
   stays parked with it).
2. **Real-build spec** — `2026-08-28-template-registry-and-builder-build.md`
   (B-1..B-26 + corrections C-1..C-6) and three executed plans
   (`2026-08-28-template-vocabulary-phase1/-registry-phase2/-builder-phase3.md`).
3. **Phase 1**: six schema keys + kit work ('speak' real, ChatThread
   userActions/assistantActions/hideSources/composerStart/End,
   controller.startNewConversation, hideSources on Message) + codegen for
   every key + verify:construct top-level AND cross-axis derived probes.
4. **Phase 2**: `templates.ts` registry (zod-free leaf; 5 buildable starters,
   voice story-only, 2 workspace variants, control manifests),
   `@kitn.ai/ui/construct/templates` subpath, generated fixtures riding
   verify:construct, create-kai template shape axis (**feat!:
   `--shape fullscreen` retired**), BuilderStart + MCP construct tool reading
   the registry (word-boundary intent matching), `inferTemplateId`.
5. **Phase 3**: CROSS_FIELD_RULES table (12 rules, behavior byte-pinned),
   construct-form-paths (presence/delete-on-empty/anchored translation,
   round-trip-tested over every starter), DerivedBuilderPanel (schema-walk +
   manifest scoping + RULE_VISIBILITY + axe-green a11y), the prebuilt
   builder page (`src/builder-app` → `dist/builder-page`), and
   **`kai dev --builder`** (loopback-only node:http, static page + API,
   atomic RAW-body validate-then-write, SSE off the existing watcher; plain
   `kai dev` byte-identical). Server-error banner, edit-staleness guard,
   invalid-file problems surfacing — all test-pinned.
6. **IVP evidence** (committed): `docs/superpowers/research/2026-08-28-builder-ivp/`
   — full Playwright pass over the real CLI from a real npm-pack install;
   caught 4 real defects (chunk-split page resolution, missing @source,
   pack ceiling, reload mislabel), all fixed and re-verified.

Also merged to main during the arc (separate PRs): release 0.30.0 +
create-kai 0.3.1 (#346, admin-bypass per the release-please precedent);
builder-story a11y + captions contrast fixes (#348) — main's advisory
storybook job now carries only the pre-existing #341 red (findings
commented on the issue: it is NOT a flake, and 'List View Populated' fails
too).

## Supervisor rulings beyond T-5 (all in the SDD ledgers under .superpowers/sdd/ — gitignored, session-local; the durable copies are this doc + the rulings doc)

- Pack ceiling 9.49→9.85 MiB: dist/builder-page (~280KB) is deliberate
  feature weight; raised per the guard's own margin rule, dated note.
- speech raw-access lives ONLY in primitives/speech.ts behind its local
  guard (no scanner exemption).
- Reload template label derives from construct shape via `inferTemplateId`
  (T-3 forbids a file key); scratch reloads as "Assistant" — accepted
  asymmetry.
- BuilderStart defaults to BUILDABLE (menu-honest); the Labs story passes
  all six explicitly.
- Fixture ADD-direction drift now enforced (verify-generated-sync globs the
  fixtures dir).

## Open / next

- **Owner review of the whole arc** + the parked `modes[]` ruling (+ Settings).
- Voice round still T-1a-gated (needs a Labs voice surface + STT story).
- Deferred vocabulary returns per its gates (persistent rail, research
  content chrome, workSurface, composer chips/menu/pills).
- #341 chat-thread a11y (role="listitem" on buttons) — real fix identified
  in the issue comment, unowned.
- Story migration: the four design-round template stories still seed
  non-schema stub state; migrating them onto DerivedBuilderPanel is a
  recorded follow-up.
- Screens gallery (general-UI docs round) unchanged from the prior handoff.
