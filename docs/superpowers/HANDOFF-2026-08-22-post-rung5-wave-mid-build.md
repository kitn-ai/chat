# Handoff: rung 5 MID-BUILD — §0 wave merged; clean-room app built; comparer pending

Date: 2026-08-22. Written for a fresh seat (any model) with no prior context. Companion to
`docs/superpowers/plans/2026-08-21-rung-5-remote-cards.md` (the plan — read it first) and
`docs/superpowers/specs/2026-08-21-rung-5-remote-cards-design.md` (the spec — binding authority).
Progress ledger of record: `.superpowers/sdd/2026-08-21-rung-5-remote-cards/progress.md`.

## 1. What has been done (all reviewed, evidence in the sdd workspace)

| Plan task | Status | Evidence |
|---|---|---|
| T1 F-20 provider-valid card-tool projections | ✅ done | commits 8bbcbf3..974d5a71; projection-layer relaxation (authored schemas untouched); generic note for consumer cards |
| T2 F-23 `cardTools require` option | ✅ done | commits 4d46ce35+5e4efc5a; loud throws on unknown key/path/field; barrel re-export |
| T3 F-10 route guards | ✅ done | commit ed125dbb; preamble trio (405/400/400) + 9 fragments + cloudflare/pi bespoke templates + Vite middleware catch + verify:scaffold structural checks |
| T4 wave gate + merge | ✅ **merged to main** | PR #305, squash d6d41735, CI run 32510702857 green by run id; local gates green (unit 4241 · emitted 35 · verify:scaffold · verify:consumer · lint:silent-drops · verify:generated · verify:fresh) |
| T5 clean-room harness | ✅ done + review APPROVED | scratchpad root `/var/folders/ss/nd1qr8qj1v1dthwcsck8h5v00000gn/T/opencode/rung5-cleanroom/`; launcher byte-matches rung-4's recorded tool list; planted defects watched red; keyless dry run $0.00 |
| T6 builder prompt | ✅ authored | `ops/builder-prompt.md`, sha256 f9ff4c8d…; product-only wording, no kit vocabulary (neutrality protects finding class 1) |
| T7 clean-room build | ✅ **complete** | 164 turns, $22.30, 43.8 min, end_turn, session f760a7ef; transcript 2.39 MB copied to ops/; credential trap-deleted and confirmed absent; app BUILDS (`npm run build` green, both servers) |

## 2. Where we left off — Task 8 (comparer), which has FAILED TWICE

Two dispatched comparer agents returned EMPTY results and wrote nothing; the research dir
`docs/superpowers/research/2026-08-21-rung-5-front-door/` does NOT exist. Diagnosis: one seat
cannot hold the 2.39 MB transcript + kit source + three deliverables. **Next seat's first
move: run Task 8 as THREE separate small dispatches, each writing its file incrementally
(skeleton first):**

- **8a → `builder-run.md`**: transcript mining only — per-call MCP table (tool + args + jsonl
  line no) via rg/sed slices; package-read audit (direct node_modules/@kitn.ai/ui reads
  outside MCP, split dist-bundle vs .d.ts).
- **8b → `seam-inventory.md`**: app files only (src/, board/, server/, plugins/, shared/) —
  classify every line-range bridging model→envelope→thread→board→wire-back; wc -l totals;
  name zero-seam files honestly.
- **8c → `findings.md`**: consumes 8a+8b outputs; verifies each candidate against kit SOURCE
  (file:line) and llms-full.txt (strip check) before filing. Continue F-numbers from F-26.

## 3. The builder's self-reported candidates (verify ALL in 8c — several look like REAL defects)

From the run result and NOTES.md:

1. `<kai-chat>` draws cards but emits NO events for them — `policy` lives on `<kai-cards>`,
   not kai-chat (rung-4 F-03 rediscovered independently). Builder workaround: declared the
   four built-ins as the APP'S OWN types pointing at kit elements → tool names became
   `kai_approval`/`kai_parameters` instead of `kai_confirm`/`kai_form` (it bypassed the
   built-in tool-name convention to get events — headline teaching/product finding).
2. **React `<Remote>` wrapper cannot mount `<kai-remote>` at all**: generated wrappers
   assign props in useLayoutEffect (after connectedCallback) while kai-remote reads required
   props once at mount → always paints `Invalid provider-origin ""`. Likely REAL wrapper
   defect; builder fell back to imperative element creation.
3. Clearing a card's `resolution` doesn't un-resolve it (optimistic copy; undo needed fresh
   `data` refs).
4. **`reopen` missing from the remote transport's inbound verb allow-list**
   (`packages/ui/src/remote/validate.ts` KINDS vs `primitives/card-contract` CardEventKind).
5. `createMockResponder()` still can't emit tool calls (F-05 again).
6. Card tool calls also render the raw tool panel (F-17 again).
7. `<kai-remote>` never re-sends a changed envelope after mount.
8. tasks `progress` mode stays user-toggleable through the card path (readonly is an element
   prop with no card-data equivalent).

Also expected-finding classes 1–6 from the spec need their verdict sections (docs-rich vs
front-door-silent counts; two-origin friction; F-22 channels under a malformed FORM call).

## 4. What remains (plan Tasks 8–12)

- **T8** comparer as three dispatches (above).
- **T9 insider completion**: land the app at `examples/apps/ops-console/` per corpus
  conventions (workspace:* deps, tsconfig trio, .env.example unprefixed-key comment, TWO
  free ports read from every vite.config under examples/, README provenance verbatim,
  verify:starters enrolled). Real mode: cardTools defs + F-23 require on form fields;
  DeepSeek default; mock kept verbatim beside the real seam.
- **T10 hardened IVP** — owner directive: verify with BOTH mock data AND real OpenRouter
  (`OPENROUTER_API_KEY` + `OPENROUTER_MODEL=deepseek/deepseek-v4-flash-0731`, copy `.env`
  from any examples/apps/* — never commit). Fix until working with high confidence. Probes
  pierce shadow DOM, demonstrate they CAN fail; capture request+SSE bytes before diagnosing.
- **T11 CI + PR** — see owner ruling below: NO MERGE.
- **T12 findings handoff** — update ladder memory + next handoff; check the parent spec's
  exit condition before declaring the ladder done.

In-rung FIX WAVES: whatever T8/T10 prove gets FIXED within this rung (TDD, reviewed) — the
owner granted standing permission ("fix them until we have a working version"). The eight
candidates above are the likely wave.

## 5. Owner rulings in force (verbatim intent)

- **"please dont merge into main. you may only commit and create PRs."** — everything lands
  via PR for owner review. (§0's #305 merged BEFORE this ruling.)
- Standing permission: fix missing/incorrect things without asking; log each as `Ruling:` in
  the ledger.
- Owner reviews the completed product at the END; wants IVP via subagents over mock AND live
  OpenRouter.
- Keep runs lean on cheap models where the work allows.

## 6. Working method (binding)

Subagent-driven development per the plan's Global Constraints: fresh implementer per task,
task reviewer per task, briefs via the sdd scripts + repo `scripts/brief.mjs`, writer-locks
via `scripts/writer-lock.mjs`, ledger updated EVERY task, commits are the controller's.
Never `nx test`; real builds are `npm run build` inside packages/ui; never trust nx caches.
Branch: `rung-5/app` (plain branch off main IN the main checkout — house rule, NO worktrees).

## 7. Sandbox paths (may be gone if temp was cleared — reconstruct via T5's report)

- Root: `/var/folders/ss/nd1qr8qj1v1dthwcsck8h5v00000gn/T/opencode/rung5-cleanroom/`
- App (delivered, builds): `app/` — src/App.tsx composes `<Chat cardTypes>`; RunBoardFrame
  mounts kai-remote imperatively; board/ = second Vite server (kitn-card provider);
  server/chat.ts + assistant.ts = mock SSE with tool-call framing
- Transcript: `ops/f760a7ef-2bf2-4d6f-a72e-b2986e5b0d26.jsonl`; run metadata `ops/run-result.json`
- Launcher + prompt + logs: `ops/launch-builder.sh`, `ops/builder-prompt.md`, `ops/launch-live.log`

Cost note for planning: the clean-room run cost $22.30 on the owner's seat. The remaining
work is insider + verification seats.
