# Design: rung 3 — the workspace

Date: 2026-08-20. Parent spec: `docs/superpowers/specs/2026-08-18-iteration-ladder-design.md`
(rung 3 row). Carried findings of record: candidate G and G-16 in
`docs/superpowers/research/2026-08-19-rung-1-mcp-rebuild/findings.md`.

## Why this rung earns its slot

Three surfaces this rung lights up have never been exercised the way the ladder means it:

- **`kai-conversations` has never been driven by a real application.** The framework starters
  wrap it (every starter ships a Sidebar over it), but always against a canned `chat-data.ts`
  roster and mock streams — no live provider, no history that outlives the tab. No app has ever
  made the sidebar carry state that matters.
- **The generated React wrappers (`@kitn.ai/ui/react`) have never been driven by a ladder app** —
  the one consumer surface vanilla cannot reach, which is exactly why the parent spec pre-decided
  the rung-3 framework switch: "By rung 3 (workspace, routing, history) structure starts paying
  for itself. Switch then, and prefer React, because the generated wrapper layer is code we
  could independently get wrong" (§ Decisions taken). The react/nextjs/tanstack starters use the
  wrappers, but as seeded demos; nothing has pushed streamed, persisted, identity-sensitive
  state through them under the ladder's real-provider, CI-gated regime.
- **The wire layer's serialize → store → rehydrate → re-encode cycle has never been exercised
  anywhere.** `grep -rln localStorage examples/` returns nothing. Every existing app holds its
  thread in memory and encodes it forward once; no code in the tree has ever proved that a
  stored thread survives a reload and continues byte-faithfully.

The obvious vehicle would be `kai-workspace` — the monolith already composes sidebar + thread +
input, at 32 props and 10 events (counted from `packages/ui/src/elements/element-meta.json`;
read the artifact, don't trust this sentence). It is deliberately not the vehicle.

### Owner ruling (2026-08-20) — compose from parts, not the black box

This is the rung's defining decision. The app is composed **from parts** — `kai-conversations`
+ `kai-thread` + `kai-prompt-input`, wired by the app — not driven through the `kai-workspace`
monolith.

Rationale:

- The composition-first RFC (`docs/superpowers/specs/2026-07-01-composition-first-architecture-proposal.md`,
  July) already calls for `kai-chat` / `kai-workspace` to become thin presets over public
  composables. Driving the monolith would invest in the shape that RFC exists to retire.
- The monolith's 32-prop surface is the config-driven treadmill the RFC names: config scales as
  parts × placements, so every user feature becomes our prop.
- The sidebar's missing delete affordance is that failure mode live: `kai-conversations` fires
  `kai-collapse-toggle` · `kai-conversation-select` · `kai-new-chat` · `kai-search` ·
  `kai-toggle-sidebar` (element-meta, its complete event list) — no delete, no rename. An app
  that wants to remove a conversation gets nothing from the component and must build around it.

Rung 3 is the evidence-gathering vehicle for the RFC's re-cast: **the app's glue code IS the
preset's design input.** How much wiring a real app needs between the parts is precisely what a
`kai-workspace` preset would have to encode. The re-cast itself is NOT this rung's work — a
DRAFTED re-cast spec is a named output of the rung (a deliverable, not a build; the owner
green-lights it separately).

## The app

`examples/apps/workspace/` — Vite + React, using the `@kitn.ai/ui/react` wrappers, in the
ladder corpus (auto-enrolled in `verify:starters`' derived roster). A multi-conversation chat
workspace:

- **New chat**, **switch threads**, **sidebar search**, **sidebar collapse**.
- **Streamed replies** into the active thread.
- **History persists in localStorage across reload** (owner ruling: client-only — the goal is
  components + wire-schema fidelity, not backend solutions).
- **Delete a conversation** — deliberately gap-surfacing: the component offers no affordance,
  so the builder must hand-roll it, and the stumble is the measurement.

Backend: the same stateless `/api/chat` middleware pattern as rungs 1–2 (the kit's mock frames
with no key, the OpenRouter chat-completions proxy with one; `toOpenAIMessages` /
`readOpenAIStream` only).

## Under test — three never-exercised surfaces

1. **The React wrappers in a real app**: typed events, and array/object prop identity flowing
   through React state against the reference-keyed re-render contract (new array reference to
   notify, new item object to make the change visible).
2. **The wire round trip through storage**: parts serialized to localStorage, rehydrated,
   re-encoded by `toOpenAIMessages`, continued by `readOpenAIStream`. A stored thread must be
   continuable byte-faithfully.
3. **The sidebar family composed by an application** for the first time — live data, real
   selection state, and the delete gap.

## Working method

Front-door-first, per the parent spec's front-door rule: the builder gets the kai MCP and the
consumer surface, never repo internals; insiders finish what the front door couldn't teach,
with every intervention logged as a named teaching gap; repo plumbing (workspace entry, CI
roster, verification) stays insider throughout.

Clean-room harness per the rung-1 plan § "The MCP-only rebuild"
(`docs/superpowers/plans/2026-08-19-rung-1-support-widget.md`), **including the rung-3
amendments recorded there**: scope any umask hardening to the credential extraction only —
rung 2's global `umask 177` destroyed the session transcript, the MCP logs, and the builder's
own Bash tool mid-run; and Vite's `envDir` does not isolate `loadEnv(mode, root, '')`, so the
keyless probe uses a mirrored app dir excluding `.env*` or it spends the owner's real key.

**The builder task prompt names NO elements and does not hint compose-vs-monolith.** Which path
the builder takes — `kai-conversations`, the `kai-workspace` monolith, or a hand-rolled
sidebar — is itself a measurement.

README provenance carries all phases verbatim, per the standing policy in the parent spec.

## Expected findings, named in advance so hindsight can't claim them

- The sidebar delete/rename affordance gap (the event list above; the builder must invent the
  UI and the state change).
- Whether the builder discovers `kai-conversations` vs the monolith vs hand-rolling a sidebar.
- The re-measure pair carried by candidate G (findings doc): original baseline failures #4
  (the guessed `scope` field) and #5 (`scaffold` emits an unwired second component) are
  structurally untestable at a one-element rung — rung 3 is their first exercisable rung.
- Wrapper-layer friction: event typing, prop identity through React state.
- **The glue-code inventory itself**: how much wiring the app needs between the parts is the
  headline number the re-cast spec consumes.

## Done when / acceptance

- Builds in CI via the derived roster (`verify:starters`). CI never contacts a live model.
- Real-browser IVP covering: multi-thread integrity (switch away and back, byte-identical) ·
  reload persistence · rehydrated-thread continuation · delete · and, per G-16 (findings doc:
  "every rung's verification must force one endpoint failure" — rung 1's rebuild shipped an
  invisible error path precisely because its 33-check harness was happy-path-only), at least
  one FORCED endpoint failure surfacing loudly.
- Owner validates live: mock, plus at least one real OpenRouter turn.

## Explicitly not doing

- Server-side history (client-only, per the owner ruling above).
- Rename / pinning / grouping beyond what the `groups` prop gives free.
- Model switching.
- SSR / Next — a different un-exercised surface; possibly its own later rung.
- Driving the `kai-workspace` monolith.
- Implementing the re-cast (drafting its spec is the deliverable; building it is not).

## Risks

- The builder may build on the monolith. Fine — that outcome feeds the re-cast spec too; the
  insider reference composes from parts either way.
- localStorage schema versioning: keep a version key from day one; migration machinery is out
  of scope.
- React wrapper defects could block the front-door build early — budget the insider completion
  phase accordingly.
