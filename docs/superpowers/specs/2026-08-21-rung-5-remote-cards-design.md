# Design: rung 5 — remote cards (the ops approval console)

Date: 2026-08-21. Status: approved in brainstorming (owner), not implemented.
Parent: `2026-08-18-iteration-ladder-design.md` (rung 5 row: "generative UI, card envelopes,
the untrusted-output boundary"). Predecessors: rungs 1–4 (#291–#304) and the workspace
re-cast (#301–#303). Inputs of record: the rung-4 findings catalog
(`docs/superpowers/research/2026-08-20-rung-4-front-door/findings.md`, 25 F-numbers,
provenance-attributed) and the coupling map.

## What the row covers, corrected against the tree

The ladder row names three things. Two are undriven families; the third is the threat model
every part of this rung exercises.

**Family 1 — built-in interactive card envelopes from tools.** `cardTools()`
(`packages/ui/src/schemas/tool-defs.ts`) projects all seven card schemas into provider tool
definitions; no ladder app has ever driven any built-in except `artifact` (rung 4).
`confirm`, `choice`, `tasks`, `form`, `link`, `embed`: zero ladder coverage. In-thread
rendering goes through `CardRenderer` keyed by `chat.cardTypes` / `cardSchemas`
(`components/message.tsx:636`). The intended interaction surface is taught richly — on the
DOCS SITE: `patterns/generative-ui-cards.mdx` (CardPolicy verb table, dismissible proposals +
`dismissRecovery()` Undo, `resolution` re-hydration, `x-kai-*` form widget hints) plus
per-card references and `/guides/schemas-as-tools/`. None of those pages ship in the tarball.

**Family 2 — the remote iframe transport.** Shipped whole and driven by nothing:
`src/remote/` (wire/origin/version/validate/host-embed/provider-runtime — nonce-bound
handshake, origin+source pinning, resize/focus-edge interception, proto-pollution guards),
the `<kai-remote>` facade (`src/elements/remote.tsx`; deliberately **opt-in** — not imported
by `register-impl.ts`, pinned by `OPT_IN_ONLY` in `element-artifact-divergence.test.ts`,
reachable via `@kitn.ai/ui/elements/remote` or the React wrapper), and the
`@kitn.ai/ui/provider` subpath (`createCardBridge` + `RemoteCardRenderer`) for the framed
side. `isValidProviderOrigin` allows exact `http://localhost[:port]` origins for dev, so a
second local server is a legitimate cross-origin provider.

**Pre-named defect-in-waiting (measured against source 2026-08-21, deliberately NOT
pre-fixed):** `apps/docs/src/content/docs/examples/remote-cards.mdx` teaches
`cards.types = { booking: 'kai-remote' }` — mixed built-in + remote streams in one
`<kai-cards>`. But `<kai-cards>`' CardSlot assigns children `data`/`cardId`/`heading`/
`resolution` + `theme` (`elements/cards.tsx:132-141`) while `<kai-remote>` consumes
`src`/`providerOrigin`/`envelope`; nothing bridges the two, and the child is instantiated
bare inside `kai-cards`' shadow root (`<Dynamic component={tag()}>`, :176) where a consumer
cannot set attributes at all. The page's own escape hatch — "set them on the `<kai-cards>`
host" — reads nothing from the host. Same class as F-14/F-08: the recipe names the flow and
contradicts the mechanism.

## Decisions (owner-ratified 2026-08-21)

- **A pre-rung kit wave lands FIRST** (§ below). Rationale: rung 5 is a card-tool app by
  construction and sits directly on F-20 (S1) — measured HTTP 400 on OpenAI, Anthropic
  (all OpenRouter routes) and DeepSeek in the kit's default mode, with the kit's own
  `strict: true` error text prescribing exactly that path. The wave also carries F-23 and
  F-10 (both measured, both on this rung's rails). Everything the CLEAN ROOM turns up is a
  finding first and gets its own fix wave **within** the rung (the rung-4 pattern);
  the pre-rung wave carries only defects already measured three ways.
- **The app is an ops approval console**: an agent proposes consequential actions; each
  proposal lands as an interactive card in the thread; a live run board renders as a REMOTE
  card served by the app's own backend over the iframe transport. Widest family coverage,
  and the untrusted-output boundary is the star rather than a side concern.
- **Cards come from TOOLS, not structured output** — settled (model-driven-components
  memory); not re-litigated here.
- **React wrappers**, third React rung (continuing the parent spec's framework ruling).

## §0 The pre-rung kit wave (insider, supervised, before any clean-room work)

One PR-wave off `main`; each item failing-test-first:

- **F-20 (S1):** re-express `artifact.schema.json` (root `anyOf`) and `embed.schema.json`
  (root `allOf`) so their projected tool definitions satisfy the providers' top-level rule
  while `registry.validate()` semantics stay identical; fix the `strict: true` remediation
  text (`tool-defs.ts:228`) that currently routes developers into the refusal. Guard: a root
  combinator must fail CI on the **non-strict** path too (`checkProviderSubset` runs there),
  not only under `strict`. Note `embed`'s 400 is a derived prediction, not a measurement —
  the tests cite the provider-subsets tables, and the annotation stays honest about that.
- **F-23 (S2):** a `require` option on `cardTools()` that narrows the DERIVED tool schema
  (join paths into `required`, set `minItems`) without touching card validation — the
  kit-side generalization of the builder app's `demandFileCode()`.
- **F-10 (S1):** the emitted block-2 route gains a 405 method guard, a 400 parse guard, and
  a middleware `.catch()`; `verify:scaffold`'s structural checks assert all three.

Gate before the clean room: unit + emitted vitest projects + `verify:scaffold` green, real
build (`npm run build` inside `packages/ui`, never a cached nx verdict). The wave ships even
if the rung itself slips.

## The shell

- Left column: the thread — `<Chat>` with `cardTypes`/`cardSchemas`, the rungs 3–4 corpus
  composition shape (workspace composes `<Workspace>`+`<Conversations>`+`<Chat>`, builder
  mounts `<Chat cardTypes cardSchemas>` inside its own split), composer pinned at bottom.
- Right rail: the live **run board** mounted as a standalone `<kai-remote>` — deployment
  steps, health pings, rollback buttons rendered by the provider page.
- Slim top bar: app name + environment badge, chrome only.
- **Two origins by construction:** the app's Vite server serves the chat app; a SECOND Vite
  server (next free port, read from every vite.config under `examples/`) serves the provider
  page running `createCardBridge`. The handshake, resize, theme push and action round-trip
  are therefore genuinely cross-origin, not simulated. Provider page sets a CSP
  (`frame-ancestors` naming the app origin) — itself a likely finding site.

## Data flow

Composer submit → scaffolder-family route (post-F-10 guards) → OpenRouter, DeepSeek
default, carrying `cardTools(...)` definitions with F-23's `require` on the form fields.
Tool calls become envelopes via the rung-4-proven bridge: `onToolCallReady` →
`isCardTool` → `cardFromToolCall` → `stream.addCard`. The thread renders them through
`cardTypes`; ONE `CardPolicy` routes everything: confirm/choice `onAction` decisions go back
to the model as the next turn; the deploy checklist rides `kai-tasks` in progress mode;
form submissions collect parameters via real `x-kai-*` widgets; dismissible proposals get
undo (whether the builder finds `dismissRecovery()` unaided is a measurement). Approved runs
push state into the remote board host-side (`handle.update(envelope)` / context push), and
board actions come back over the wire as routed `CardEvent`s.

## The untrusted-output boundary

Everything the model produced is untrusted, and this rung drives the guards for real:
model-supplied URLs through `isSafeUrl`/`isRenderableLink` sinks; frames stay sandboxed (no
`allow-same-origin` — localhost providers still get an opaque origin); inbound wire frames
pass the origin/source/nonce pins and the proto-pollution guard. Acceptance includes
hostile-output fixtures: script-scheme srcs, oversized card payloads, pollution keys in card
data, and a corrupted tool-call turn (F-22's channels — where does the failure land?).

## Method

Ladder discipline verbatim (handoff §5, binding):

- **Front-door rule:** the app code is written by a clean-room agent — kai MCP (tarball bin
  over stdio), stripped installed copy, throwaway `CLAUDE_CONFIG_DIR`, cwd outside the repo
  — per rung-1 plan § "The MCP-only rebuild" + ALL amendments: umask scoped to credential
  extraction ONLY; keyless probes through a mirrored dir excluding `.env*`; post-strip
  positive controls; launcher with planted-defect-verified post-run assertions (reconstruct
  from `.superpowers/sdd/2026-08-20-rung-4-builder/task-1-report.md`; rung-4's launcher lived
  in TEMP and may be gone). Repo plumbing stays insider.
- **Supervisor mode:** delegated file work, briefs via `scripts/brief.mjs`, writer-locks via
  `scripts/writer-lock.mjs`, ledger under `.superpowers/sdd/<plan-basename>/progress.md`,
  independent reviewer per task; commits are the supervisor's.
- **Credential protocol:** keychain → 0600 file under the throwaway config dir, trap-deleted,
  disclosed to the owner BEFORE launch.
- **Model policy:** DeepSeek `deepseek-v4-flash-0731` default, gpt-4o-mini verified
  alternate; avoid OpenRouter Anthropic routes for streamed tool calls (F-21). `.env` copied
  from any `examples/apps/*`; never committed.
- **Verification floors:** multi-turn REAL acceptance (3 turns, both models); IVP probes
  pierce shadow DOM (F-19) and demonstrate they CAN fail; capture request + raw SSE bytes
  before diagnosing; watch CI by run id for the exact head SHA; the CI `test` job is the only
  merge gate; owner live eyeball on the UI before merge.
- README records the ENTIRE build conversation verbatim.
- **Prompt neutrality on card integration (protects finding class 1):** the builder prompt
  states the product requirements (approvals as interactive cards in the conversation; a
  live board served by the app's own backend) and NEVER names either integration path —
  not `cardTypes`, not `<kai-cards>`, not remote tags. Which path the builder finds and
  chooses is part of the measurement; the bias statement is recorded with the prompt as in
  rung 4.

## Expected finding classes (checked during the rung, not pre-fixed)

1. **The remote-card-in-a-list seam** (above), on BOTH surfaces that could carry it: the
   `<kai-cards>` element path the docs example teaches, and the `Chat.cardTypes` /
   `CardRenderer` path the corpus apps use (`components/card-renderer.tsx` "compares
   component identity where [kai-cards] compares tag identity" — does either bridge to
   `kai-remote`'s `src`/`providerOrigin`/`envelope` contract?). Does the front door walk the
   builder into the documented-but-unwired `types` override, and what does it invent instead?
2. **Front-door visibility of the remote surface:** the opt-in import path,
   `mountRemoteCard`, `createCardBridge`, `./provider` — counts across MCP responses and
   shipped `llms-full.txt` (the F-01/F-02 class).
3. **Docs-rich vs front-door-silent:** which facts of `generative-ui-cards.mdx`
   (CardPolicy verbs, `dismissRecovery`, `x-kai-*` hints, schemas-as-tools) survive into
   what a bundler-installed consumer sees (the F-14 class).
4. **F-24's cluster re-measured over INTERACTIVE payloads** — form/task arguments instead of
   HTML files, on cheap models: double-escaping, duplicate parallel calls,
   narrate-instead-of-call; and whether the post-wave emitted routes can yet ask for
   well-behaved tool calls (`parallel_tool_calls`/`tool_choice` are still absent from
   agent-tooling and wire).
5. **Two-origin dev friction:** ports, CSP/`frame-ancestors`, theme push across the wire,
   how a failed handshake presents.
6. **Rung-4 residuals newly exercisable:** F-22's error channels under a malformed FORM call
   (not an artifact call); F-03 (policy on the wrong element) for card events at scale.

## Explicitly not doing

- No pre-fix of the `kai-cards ↔ kai-remote` seam or any expected-finding class — measured
  first, fixed in the rung's own insider wave.
- No new kit components: no run-board element, no version switcher, no device toggle.
- No persistence, no multi-project, no real infrastructure side effects — approvals mutate
  local app state; this rung measures UI and transport, not deploys.
- No wire changes; no artifact re-drive beyond incidental reuse of the bridge.
- No acceptance dependence on a live model in CI.

## Done when

§0 merged; the app runs against a real provider end-to-end (interactive thread cards AND a
live cross-origin run-board round-trip), checked in at `examples/apps/ops-console/`,
building in CI; the findings catalog extended with per-round provenance; the rung's own fix
waves landed for what it proved; owner validation recorded in the run ledger.
