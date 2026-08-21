# Handoff: rung 4 next, after the re-cast shipped end to end

Date: 2026-08-20 (late). Written for a fresh session with no prior context.
Supervisor of record: Fable seat, orchestrate-and-verify mode, writer-locks + briefs throughout.

## 1. State: everything below is MERGED on main (head a94e003f)

| PR | What |
|---|---|
| #297 | Rung 2: `examples/apps/voice-assistant/` — front-door-built, owner-validated live. |
| #298 | Rung-2 findings: `kai-voice-error` (mirrored), BREAKING `kai-speaking-change` on audio start, mock backend routes emitted by the scaffolder. |
| #299 | Post-rung-2 batch: support-widget adopts kai-dock (−114 lines) · MCP arg enforcement (candidate A closed) · coverage tranche (+4 defects fixed) · hygiene. |
| #300 | Rung 3: `examples/apps/workspace/` — front-door-built (the transcript SURVIVED; the scoped-umask harness repair held), React wrappers' first ladder drive, wire round trip through storage proven. Findings: `docs/superpowers/research/2026-08-20-rung-3-front-door/`. |
| #301 | The workspace re-cast SPEC + orchestration plan (`docs/superpowers/specs/2026-08-20-workspace-recast-design.md` — READ IT; it carries the owner's construction-over-configuration ruling and the four-tier taxonomy: primitives · elements · layout elements · blocks). |
| #302 | The re-cast IMPLEMENTATION, both phases: `kai-conversation-item` (+ parent↔item contract; NOTE the axe-forced vocabulary: list > listitem > button-body, menu as tabbable sibling — spec §2a amended in place) · BREAKING `kai-workspace` = 5-slot layout shell · BREAKING `search`→`webSearch` on the composer · `--kai-toast-z` · F-21 reasoning-opens-while-streaming · `@kitn.ai/ui/state` helpers (threads/persistence/parseStoredThread) · the FIRST BLOCK emitted by the scaffolder (workspace preset, all 8 frameworks) · corpus app migrated (ratchet point 1: 342→316 authored lines, method of record rung-3 findings §5). |
| #303 | Wisp (the composed Labs showcase — consumer-owned `kai-conversation-item` loop with a WORKING row kebab via kai-menu) · kai-menu gains `full` · flicker fixes · `.testlib.ts` out of the dts pass and the tarball (it was shipping). |

Left OPEN deliberately: #280 (kai-devtools, owner-parked) · #267 (release-please, owner's — NEVER touch).
**Release note for the owner:** main carries three `feat!` since 0.25.2; a release publishes the re-cast.

## 2. NEXT: rung 4 — the Lovable-style builder (owner said "rung 4")

Ladder row: *artifacts, preview panel* — the two component families nothing has driven.
Per the ladder discipline the spec DOES NOT EXIST YET and must be written fresh via
brainstorm → spec → plan, with rungs 1–3 findings in hand. Parent spec:
`docs/superpowers/specs/2026-08-18-iteration-ladder-design.md`.

**The convergence question to put to the owner FIRST** (flagged, undecided): rung 4's app is
itself a builder UI, and the owner's compile-to-WC builder idea (below) needs a front end.
Should rung 4 double as the builder's front-end exploration, or stay a pure component-coverage
rung? Both defensible; the supervisor recommended discussing before spec-writing.

Method carries over: front-door-first, clean-room harness per
`docs/superpowers/plans/2026-08-19-rung-1-support-widget.md` § "The MCP-only rebuild" + ALL
amendments (scoped umask — verbatim lesson recorded there; envDir does not isolate loadEnv —
keyless probing uses a mirrored dir excluding `.env*`). `verify:fresh` gates the pack. Owner
credential protocol: subscription seat, 0600 + trap-delete, disclose before launch.
Rung-1 findings candidate G says re-measure baseline failure classes at the rung where they
become exercisable — check what rung 4 newly exercises.

## 3. The builder idea — NO SPEC EXISTS YET (owner asked this be stated here)

`~/.claude/.../memory/builder-compile-to-wc.md` holds the full design sketch: a Solid-native
builder (live in-browser compile) whose finalize step wraps the composition in ONE web
component. Key design insight: the compiled widget's interior is PURE Solid (no facades, no
registry collisions); only the outer shell is a custom element. Must-hold: emit BOTH the
Solid source (an owned block) AND the compiled element. Supervisor assessment (owner engaged,
2026-08-20): it is the deferred third front door from `product-vision-three-front-doors`,
its prerequisites (composables + blocks) NOW EXIST, it does not simplify the MCP/tests/builds
(additive, same engine), better ship-time DX, transformative for no-bundler consumers
(Shopify class). **First step if chosen: write its spec via brainstorm.** It lost the
what-next toss to rung 4 but the convergence question above keeps it live.

## 4. Working method (unchanged) + lessons priced in today

- Plain branch off main; delegate ALL file work (workers via briefs from `scripts/brief.mjs`,
  writer-locks via `scripts/writer-lock.mjs`, workspace under `.superpowers/sdd/<plan>/`);
  supervisor serializes shared registries (slots.ts, register-impl.ts, element-meta regen) and
  applies workers' exact insertion strings; independent verifier for anything user-facing.
- Git from repo root; never `nx test`; `npm run build` inside packages/ui; ONE `build:api`
  regen per round, diff read and attributed file by file.
- **Watch CI by run id for the exact head SHA** (`gh run watch <id> --exit-status`);
  `gh pr checks --watch` exited stale THREE times today.
- **Storybook play functions run on canvas view in dev** — showcases stay pristine; interaction
  tests live in separate tagged stories (`['!dev']`), verified included in the test project by
  name before trusting the tag.
- `kai-conversations` item mode: the consumer MUST feed `activeId` reactively — the container
  sync clears stale actives (this bit the Wisp story; docs snippet now shows it).
- `kai-button/kai-menu full` fills the host's box; a content-hugging flex parent makes it
  visually inert — hand the flex item the space (`flex-1`). Recorded at the perplexity-pro site.
- The owner's live eyeball keeps out-earning the gates: today it found a tarball leak, a story
  wiring bug, a missing kit affordance, and four footer defects. Show-first for unseen UI.
- The dts pass deliberately has NO node types (it is the browser-purity guard) — never "fix"
  a TS2307 there by adding types; exclude the offending file from the build set.

## 5. Banked follow-ups (none scheduled — pick deliberately)

- create-kai: stale dist pin `^0.23.0` (CONSUMER-FACING — fresh scaffolds get a months-old
  kit) + the `.npmrc` travelling-dotfile guard vacuity. Both in laneE-report §banked.
- `docs/web-components.md` curated section list lacks `kai-conversation-item`.
- Element-coverage waivers: 14 remain (tranches keep catching shipped defects — 7 so far).
- kai-menu narrow coverage note; ~180 on-disk `.claude/worktrees/` dirs (registrations pruned).
- Docs voice pass over the re-cast surface; `surfaces.ts` stale-props note (laneE).
- The owner's live validation of the workspace app POST-re-cast (it migrated in #302).

## 6. Owner interaction points

- The rung-4-vs-builder convergence question (§2) BEFORE spec-writing.
- Live eyeball on any new UI before merge (standing).
- Release timing (§1 note). Credential disclosure before any clean-room run.
