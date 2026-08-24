# Findings — rung-5 front-door build (remote cards / ops console)

Comparer analysis of the clean-room builder's app against the kit SOURCE, the MCP transcript
(per-call claims cite `builder-run.md`, which cites transcript lines), and the spec's pre-named
expected findings (`docs/superpowers/specs/2026-08-21-rung-5-remote-cards-design.md`
§ Expected finding classes). Companions: `builder-run.md` (run metadata, the 13-call MCP table,
the package-read audit), `NOTES.md` (the builder's questions, verbatim), `seam-inventory.md`
(the REMOTE-CARD SEAM inventory — this rung's compile-to-WC spec input), `app/` (the delivered
source).

Numbering continues rung 4, which ended at F-25. **This rung files F-26 – F-42** across two
rounds: the clean-room build (F-26 – F-40) and the T9 insider real-mode smoke (F-41 – F-42).

Classes: **teaching gap** (the front door failed to teach a fact the kit knows) · **product gap**
(the kit lacks the thing itself) · **doc gap** (fact stated nowhere shipped — checked against the
tarball's `llms-full.txt` / `README.md` before filing) · **builder error** · **acceptable
variation** · **environmental / upstream** · **recorded non-finding**. Severity S1–S4 as in
rungs 1–4.

**Strip discipline.** Every candidate was checked against the real (unstripped)
`package/llms-full.txt` (2,910 lines) and `package/README.md` (442 lines) extracted straight out
of `ops/kitn.ai-ui-0.25.2.tgz`, never out of the stripped sandbox tree. **Zero findings are strip
artifacts.** Two candidates were re-checked specifically because they smelled like strip damage
(`dismissRecovery`, `createCardBridge`) and both are absent from the real tarball too — they are
F-27/F-33, not artifacts. Reproduce the counts with:

```
tar xzf ops/kitn.ai-ui-0.25.2.tgz && cd package
for t in mountRemoteCard createCardBridge listenForCardEvents emitCardEvent \
         onToolCallReady cardFromToolCall dismissRecovery; do
  printf '%-22s llms=%s README=%s\n' "$t" "$(grep -ci -- "$t" llms-full.txt)" "$(grep -ci -- "$t" README.md)"
done
```

## Headline verdicts

- **THE HEADLINE: `<kai-chat>` renders interactive cards into a void.** Rung 4 filed this as
  F-03 from the symptom ("`policy` lives on `<kai-cards>`"). This rung has the mechanism, and it
  is worse than a missing prop. `components/message.tsx:636` renders
  `<CardRenderer envelope=… types=… schemas=…>` — **no `host`, no `hostElement`, and no
  `CardProvider` anywhere above it in the tree**. Every built-in card's emit is
  `const h = local.host ?? ctxHost; if (h) h.emit(event); else if (local.hostElement)
  emitCardEvent(…)` (`components/confirm-card.tsx:190-194`), so inside `<kai-chat>` **both
  branches miss and the event is discarded with no warning** — `ready`, `action`, `submit`,
  `dismiss`, `reopen`, and the contract `error` alike. The kit's own
  `primitives/card-host.tsx:4` says in a header comment "Cards inside `<kai-chat>`/`<CardProvider>`
  use this"; no `CardProvider` exists on that path. Filed **F-26** (S1), with the diagnostic
  half as **F-34**.
- **13 MCP calls vs 36 direct package inspections (≈1:2.8)**, and the pivot point is exact: the
  third consecutive `debug` "No known failure pattern matched", ~1 minute into a 44-minute run
  (`builder-run.md`, rows 6/10/11). All three misses were about the card-verb and cross-origin
  mechanisms — the two things this rung is about. Rung 4 measured 10:37; the shape is unchanged.
- **`<Remote>` from `@kitn.ai/ui/react` cannot mount a card at all — measured, both registration
  orders.** The builder reported this from one path; I probed it in real Chromium against the
  built 0.25.2 tarball and **both** the documented opt-in-import order and the wrapper's own
  lazy-register path paint the permanent error while `el.providerOrigin` reads back correctly.
  Filed **F-28** (S1). My source-level prediction that the lazy path would survive via
  component-register's pre-upgrade harvest was **wrong**, and only the browser said so — recorded
  because it is the rung's methodological lesson.
- **The provider half of the remote transport does not exist in the front door.** In the MCP's
  own `kai-remote` reference (8,222 bytes, re-fetched live from the installed `bin/mcp.js`):
  `mountRemoteCard` 0 · `createCardBridge` 0 · `@kitn.ai/ui/provider` 0 · `CardBridge` 0 ·
  `RemoteCardRenderer` 0 · `handshake` 0. In the shipped `llms-full.txt`: the same zeros, and
  `kai-remote` itself appears **once**, as a props-table row. `./provider` is a real package
  export. Filed **F-27** (S1).
- **Rung-4's F-01/F-02 are unchanged one rung later.** `listenForCardEvents`, `emitCardEvent`,
  `onToolCallReady` and `stream.addCard` are still **zero** in the shipped `llms-full.txt`.
- **Zero builder errors this rung.** All eight self-reported candidates hold up against source
  (rung 4 filed two builder errors). Every guess in `NOTES.md` is a correct reading of the kit.
- **Rung-4 F-10 is FIXED** — the §0 wave landed; the emitted route now carries the 405 method
  guard and the JSON parse guard, and the mirrored app answers `405`/`400` and stays alive.
  Recorded as **F-40**, a non-finding, because it is the first rung-over-rung residual to close.
- **Build/run: green, zero comparer fixes**, verified on a fresh keyless mirror (Vite 8.2.2,
  TypeScript 7.0.2, React 19).

## The spec's pre-named expected findings — scorecard

### 1. The remote-card-in-a-list seam, on BOTH surfaces — CONFIRMED, NEITHER BRIDGES

The spec asked whether the `<kai-cards>` tag path or the `Chat.cardTypes`/`CardRenderer`
component path bridges to `kai-remote`'s `src`/`providerOrigin`/`envelope` contract. **Neither
does, and they fail differently.**

- **The tag path** (`elements/cards.tsx:132-141`) assigns exactly `data`, `cardId`, `heading`,
  `resolution`, the `theme` attribute and `data-card-id` onto the resolved tag. It never assigns
  `src`, `providerOrigin` or `envelope`. So `el.types = { 'run-board': 'kai-remote' }` — the
  documented override, the obvious way to put a remote card in a thread — mounts a
  `<kai-remote>` that immediately paints
  `[kai-remote] Invalid provider-origin ""`. Filed **F-31**.
- **The component path** (`components/card-renderer.tsx:153`) renders
  `<Dynamic component={comp()} envelope={…} host={host} />` — a Solid component contract, which
  a custom element is not. It cannot reach `kai-remote` at all, and its `host` is `undefined`
  inside `<kai-chat>` anyway (F-26).
- **What the builder invented instead:** it did not use the `types` override for the remote card.
  `src/RunBoardFrame.tsx` creates the element imperatively, sets every prop, and only then
  appends it (`NOTES.md` §2) — i.e. it left the card system entirely for the one card that is
  remote. The board is a framed page beside the thread, not a card in it.
- **Did the front door walk it into the unwired override?** No — it never offered it. The
  `kai-remote` reference never mentions `<kai-cards>`, and `<kai-cards>`'s reference (13,094 ch,
  row 8) never mentions `kai-remote`. The two halves of the seam are documented in separate
  rooms.

### 2. Front-door visibility of the remote surface — CONFIRMED, WORSE THAN F-01/F-02

Measured against the live installed MCP and the real tarball, not the sandbox tree:

| Symbol | MCP `kai-remote` ref | shipped `llms-full.txt` | shipped `README.md` |
|---|---|---|---|
| `mountRemoteCard` | 0 | 0 | 0 |
| `createCardBridge` | 0 | 0 | 0 |
| `@kitn.ai/ui/provider` | 0 | 0 | 0 |
| `CardBridge` / `RemoteCardRenderer` | 0 | 0 | 0 |
| `handshake` | 0 | 0 | 0 |
| `elements/remote` (the opt-in import) | 1 | 0 | 0 |
| `kai-remote` | — | 1 (a props-table row) | 0 |
| `providerOrigin` | — | 1 (same row) | 0 |

The one thing the front door does teach well is the opt-in import, and it teaches it loudly
(`ref-remote` §"Getting the element": "no error and no warning is logged"). Everything about
**serving** a card is invisible. Filed **F-27**.

### 3. Docs-rich vs front-door-silent — CONFIRMED, the F-14 class is intact

Four docs pages carry the card/remote story (`patterns/generative-ui-cards.mdx`,
`components/remote.mdx`, `examples/remote-cards.mdx`, `components/cards.mdx` — 607 lines
combined). What survives into what a bundler-installed consumer sees:

| Fact | docs | shipped `llms-full.txt` | MCP `kai-remote` ref |
|---|---|---|---|
| `dismissRecovery` | 7 | **0** | 0 |
| `createCardBridge` | 4 | **0** | 0 |
| `CardPolicy` | 9 | 1 | 3 |
| `x-kai-*` hints | 6 | 1 (inside an inlined type signature, not prose) | 0 |
| `cardFromToolCall` | 1 | **0** | 0 |
| `listenForCardEvents` / `emitCardEvent` / `onToolCallReady` | 0 | **0** | 0 |
| `handshake` | 2 | **0** | 0 |
| `frame-ancestors` | **0** | **0** | 0 |

Two readings, and both matter. **Docs-rich, front-door-silent**: `dismissRecovery` and
`createCardBridge` are well covered on the site and reach an installed consumer through nothing.
The builder got `dismissRecovery` anyway — from the one `debug` call that hit (row 7) — so the
pattern DB carries a fact the shipped corpus does not, which is a channel nobody planned.
**Silent everywhere**: `listenForCardEvents`/`emitCardEvent`/`onToolCallReady` score zero in all
three columns, and `frame-ancestors` scores zero including the docs (F-38).

### 4. F-24's cluster over interactive payloads — NOT EXERCISABLE THIS RUN

**The run is mock-only.** `builder-run.md` records `web_search_requests: 0`,
`web_fetch_requests: 0` and no provider integration; `NOTES.md` "Deliberate limitations" states
"The assistant is scripted, not a model" — `server/script.ts` hand-builds OpenAI SSE frames and
routes on keyword matching. So there is **no model-authored form/task argument in this run**, and
double-escaping, duplicate parallel calls and narrate-instead-of-call could not be measured over
interactive payloads. `parallel_tool_calls` / `tool_choice` remain absent from agent-tooling and
wire (unchanged since rung 4). **Verdict: deferred to a real-mode round, not answered.** The
one thing this run does establish is upstream of the models: F-35 (the kit's mock cannot emit a
tool call) is why every rung so far has had to hand-build the frames it wanted to test.

### 5. Two-origin dev friction — CONFIRMED, modest, and one real doc hole

- **Ports:** the builder ran two Vite servers, `:5173` (console) and `:5175` (board), started by
  a 60-line `scripts/dev.mjs` it had to write. The reason is stated correctly at
  `app/scripts/dev.mjs:1-7`: two origins, because `remote/origin.ts:9-11` throws
  `providerOrigin must be cross-origin to the host`. Nothing in the front door mentions that a
  remote-card app is a **two-server** dev setup; the scaffolder has no axis for it.
- **The failed handshake presents acceptably:** `remote/host-embed.ts:179` renders
  `[timeout] The card took too long to load.` after a 5s default. That is a loud failure, and it
  is the right call. **No finding.**
- **Theme across the wire works and the element does it alone:** `elements/remote.tsx:217-220`
  pushes theme changes through `handle.updateContext`. It is also the ONLY effect on that
  element, which is F-30.
- **CSP is the hole.** A production two-origin deployment needs the provider page to permit
  framing by the host (`frame-ancestors`), and `frame-ancestors` appears **zero times** in the
  docs, in `llms-full.txt`, and in the MCP reference. The kit sets its half
  (`DEFAULT_SANDBOX = 'allow-scripts allow-forms allow-same-origin'`,
  `host-embed.ts:60`) and says nothing about the provider's half. Filed **F-38**.

### 6. Rung-4 residuals newly exercisable — see the residuals table

F-22 under a malformed FORM call: **confirmed and worse** — F-34. F-03 at card scale:
**confirmed with its mechanism** — F-26. F-24's cluster: not exercisable (class 4 above).

## The builder's eight self-reported candidates — verdicts

Each verified against kit source at file:line before filing. **Eight for eight hold.**

| # | Candidate | Verdict | Evidence | Filed |
|---|---|---|---|---|
| 1 | `<kai-chat>` draws cards but emits nothing | **CONFIRMED, mechanism found** | `components/message.tsx:636` renders `CardRenderer` with no host/hostElement and no `CardProvider` above it; `confirm-card.tsx:190-194` then drops the event on both branches. `elements/chat.tsx` declares `cardTypes`/`cardSchemas` and **no** `policy`. | F-26 (S1) |
| 2 | React `<Remote>` cannot mount `<kai-remote>` | **CONFIRMED, and broader than reported** | `frameworks/react/runtime.tsx:103-115` assigns props in `useLayoutEffect`; `elements/remote.tsx:142-173` reads `providerOrigin`/`src`/`envelope` once inside `onMount` and renders a permanent error node. Probed in Chromium: **both** registration orders fail. | F-28 (S1) |
| 3 | Clearing `resolution` doesn't un-resolve a card | **CONFIRMED** | `components/use-card-resolution.ts:34-35` — `resolution = prop() ?? local()`, and only `on(opts.data, …)`, a **new `data` identity**, clears the optimistic `local`. The builder's `revive()` is the only lever. Stated nowhere shipped. | F-33 (S3) |
| 4 | `reopen` missing from the remote inbound allow-list | **CONFIRMED, and the guard is self-defeating** | `remote/validate.ts:17-19` lists 9 verbs; `primitives/card-contract.ts:32-42` defines **10** — `reopen` is the omission. The list is cast `as CardEventKind[]`, so the cast defeats the very type-check the comment above it ("Verbs MUST match CardEventKind… verify against source") relies on. `host-embed.ts:272` then drops the frame. Every native card emits `reopen` (`confirm-card.tsx:244`, `tasks-card.tsx:329`, `choice-card.tsx:367`) and `card-routing.ts:114` routes it — so the same card works natively and loses its Reopen through the iframe. | F-29 (S2) |
| 5 | `createMockResponder()` cannot emit tool calls | **CONFIRMED, verbatim repeat of F-05** | `state/mock.ts:99-114` — `MockResponderOptions` is `{ replies?: readonly string[], delayMs, chunkSize, announce }`. Text only. | F-35 (S2) |
| 6 | Card tool calls also render the raw tool panel | **CONFIRMED, repeat of F-17** | Accumulator turns the call into a `<kai-tool>` panel; nothing in the kit suppresses it for `kai_`-prefixed names. The builder wrapped the sink (`src/assistant.ts` `cardAwareSink`), the same shape rung 4 wrote. | F-36 (variation + product note) |
| 7 | `<kai-remote>` never re-sends a changed envelope | **CONFIRMED** | `remote/host-embed.ts:45-55` exposes `update(envelope)`; `elements/remote.tsx` calls it **nowhere** — its one `createEffect` (217-220) pushes theme only. | F-30 (S2) |
| 8 | `tasks` progress mode stays user-toggleable | **CONFIRMED** | `components/tasks-card.tsx:191` — `readonly` is a component/element prop, not card data; `mode: 'progress'` in the tasks schema has no display-only equivalent, so a card rendered through the registry cannot set it. | F-37 (S3) |

**Zero builder errors and zero non-findings among the eight.**

## Full findings

### F-26 — cards inside `<kai-chat>` have no `CardHost`, so every card event is silently dropped · product gap · S1 · rung-4 F-03, mechanism found

Rung 4 filed F-03 as "cards live in `<kai-chat>`; `policy` lives on `<kai-cards>`". That framing
suggests a missing prop. The source says something sharper.

`components/message.tsx:636`:

```tsx
{(p) => <CardRenderer envelope={p().envelope} types={props.cardTypes} schemas={props.cardSchemas} />}
```

`CardRenderer` gets its host from `useCardHost()` (`card-renderer.tsx:87`), a Solid context
whose only provider is `CardProvider` (`primitives/card-host.tsx:20`). **Nothing on the
`<kai-chat>` path renders a `CardProvider`** — grep for it across `src/` returns the definition,
the export, two story files, and no call site in `components/` or `elements/`. So `host` is
`undefined`, and every built-in card's emit funnel:

```ts
const emit = (event: CardEvent): void => {
  const h = local.host ?? ctxHost;
  if (h) h.emit(event);
  else if (local.hostElement) emitCardEvent(local.hostElement, event);
};                                   // components/confirm-card.tsx:190-194
```

misses both branches. No throw, no `console.warn`, no bubbling event: the verb is **discarded**.
This is the repo's own "decide loudly" rule violated on the path a consumer is most likely to
take, and `lint:silent-drops` does not cover it (that guard is scoped to `src/wire`).

Two aggravating details:

1. **The kit asserts the opposite in its own source.** `primitives/card-host.tsx:4` — "Cards
   inside `<kai-chat>`/`<CardProvider>` use this; bare cards fall back to the bubbling `kai-card`
   event". Neither half is true of `<kai-chat>`: there is no provider, and no `hostElement` is
   passed either, so there is no fallback.
2. **The `cardTypes` escape hatch does not escape.** Overriding with the built-in tag map does
   not help, because for a type the kit knows, `mergeCardComponents` puts the kit's *component*
   in the map and the component path wins (`card-renderer.tsx:88-89`,
   `primitives/card-registry`). The builder measured exactly this (`NOTES.md` §1).

**The cost of the workaround, and why this is S1.** To get events at all, the builder had to
declare the four built-in cards as the app's OWN types (`approval`, `parameters`, `options`,
`checklist`) with `use: []`, each pointing at the kit's element, carrying the kit's own schema.
That works — an unknown type dispatches to a tag, the element emits a bubbling `kai-card`, and
`listenForCardEvents` on `<kai-chat>` catches it. But the tool names become
`kai_approval`/`kai_parameters` instead of `kai_confirm`/`kai_form`. **The kit's canonical
card-tool vocabulary — the thing a model is prompted with — has to be abandoned to make the
kit's own cards interactive in the kit's own chat element.**

*Fix direction (not prescribed here): either a `policy` prop on `<kai-chat>` that wraps its card
subtree in a `CardProvider`, or pass `hostElement={element}` so the documented bubbling fallback
actually exists. The second is smaller and makes `card-host.tsx:4`'s comment true.*

### F-27 — the provider half of the remote transport is absent from the entire front door · teaching gap · S1

`kai-remote` frames a card; something has to **serve** it. That something is
`createCardBridge({ root, renderers })` from `@kitn.ai/ui/provider` — a real, declared package
export (`package.json` `exports` includes `./provider`). Across the front door:

- MCP `component_reference kai-remote` (8,222 bytes, re-fetched live from the installed
  `bin/mcp.js`): `mountRemoteCard` **0**, `createCardBridge` **0**, `@kitn.ai/ui/provider` **0**,
  `CardBridge` **0**, `RemoteCardRenderer` **0**, `handshake` **0**.
- Shipped `llms-full.txt`: the same six zeros. `kai-remote` appears once, at line 2037, as a
  props-table heading with one `providerOrigin` row under it.
- Shipped `README.md`: zero for all of it.
- `debug`, asked directly ("how does `@kitn.ai/ui/provider` work", `builder-run.md` row 6):
  **"No known failure pattern matched."**

The builder recovered the whole provider contract — `createCardBridge`, `renderer.mount(root,
envelope, host)` returning a disposer, `host.emit(CardEvent)`, the `ResizeObserver` auto-resize,
remount-on-theme-change, the `__proto__`/`constructor`/`prototype` rejection — by reading
`remote/*.d.ts` and slicing minified bytes out of `dist/kai-provider.es.js`, which it `cat`ed
**whole** (`builder-run.md`, line 154). This is rung-4's F-01/F-02 shape on new ground: the kit
has the mechanism, the front door names one end of it.

### F-28 — `<Remote>` from `@kitn.ai/ui/react` can never mount a card · product gap · S1 · MEASURED

Two mechanisms in tension:

- `frameworks/react/runtime.tsx:103-115` — every generated wrapper renders the bare tag with
  only `ref`/`className`/`style`/`id`, and assigns real props from a `useLayoutEffect`, i.e.
  after React has inserted the element into the document.
- `elements/remote.tsx:142-173` — `onMount` reads `props.providerOrigin`, `props.src` and
  `props.envelope` **once**, and on any miss appends a permanent error node to the shadow root
  and returns. No effect ever re-checks them; the only `createEffect` on the element (217-220)
  pushes theme.

The builder reported the failure on the path where the element is registered first. **I probed
both paths in real Chromium against the built 0.25.2 tarball** (Playwright, the mirrored app's
dev server, a `<Remote>` given valid `src`/`providerOrigin`/`envelope`):

| Case | At React's ref callback | Result after 1.2 s |
|---|---|---|
| **A** — the documented opt-in `import '@kitn.ai/ui/elements/remote'` runs first | defined ✓, in document ✓, shadow root already built ✓, own `providerOrigin` ✓ | `[kai-remote] Invalid provider-origin ""`, no iframe; `el.providerOrigin` reads back `http://localhost:5175` |
| **B** — no static import; the wrapper's own lazy `() => import('@kitn.ai/ui/elements/remote')` is the only registration | not defined, in document ✓, no shadow root | **identical** error, no iframe, same correct read-back |

**Both fail.** Case A is the plain insert-before-props race: the element upgraded and ran
`onMount` during insertion, before any React effect. Case B is the interesting one — I predicted
from source that component-register's pre-upgrade harvest (`initializeProps` reads
`element[key]` before installing the accessor, described at `elements/define.tsx:299-305`) would
rescue it. **It does not, and only the browser said so.** I did not isolate why; that is the fix
owner's diagnosis, and the finding stands on the measurement.

Two aggravations:

1. **Following the MCP's own instruction makes it worse.** The `kai-remote` reference's first
   section tells you, correctly and emphatically, to import the element's own entry point. Doing
   that puts you in case A.
2. **The wrapper exposes no event prop.** `frameworks/react/index.tsx:1362-1366` declares
   `Remote` with an **empty** event map `{ }`, while the element re-emits every routed
   `CardEvent` as a bubbling+composed `kai-card` (`elements/remote.tsx:53-93`). So even with the
   mount race fixed, a React consumer has no `onKaiCard` prop and must reach for a ref.

**Repro:** `probe.tsx` + `probe.html` in the keyless mirror; the Playwright driver reads
`window.__probe` after mount. Both artifacts are reproducible from the description above; they
live in the comparer's scratch, not in `app/`.

### F-29 — `reopen` is missing from the remote transport's inbound verb allow-list, and a cast hides it · product gap · S2

`packages/ui/src/remote/validate.ts:16-19`:

```ts
// Verbs MUST match CardEventKind in card-contract.ts (verify against source).
const KINDS: ReadonlySet<string> = new Set<CardEventKind>([
  'ready', 'submit', 'action', 'send-prompt', 'open', 'resize', 'state', 'dismiss', 'error',
] as CardEventKind[]);
```

Nine verbs. `primitives/card-contract.ts:32-42` defines **ten**: the omission is
`{ kind: 'reopen'; cardId: string }` (line 41). `host-embed.ts:272` gates on
`isKnownEventKind` and `warn(data); return`s — so a remote card that asks to be reopened is
dropped at the host boundary.

This is not theoretical. **Every native card emits `reopen`** — `confirm-card.tsx:244`,
`tasks-card.tsx:329`, `choice-card.tsx:367` — and `card-routing.ts:114-115` routes it to
`policy.onReopen`. `dismissRecovery` (`primitives/card-recovery.ts`) is built entirely around
the dismiss→reopen flow, and `elements/remote.tsx:84-87` even wires `onReopen` into the wrapped
policy it hands to `mountRemoteCard` — a handler that can never fire. **The same card component,
served through the provider bundle instead of natively, silently loses its Reopen affordance.**

Three things make this a "derive it, don't type it" case study rather than a typo:

1. The list is **hand-typed**, and its own comment admits it is a copy ("verify against source").
2. The `as CardEventKind[]` cast **defeats the check that would have caught it**. Without the
   cast, `Set<CardEventKind>` over a 9-element literal still compiles (a subset is fine) — so
   even the honest version would not fire. The type system cannot express "exhaustive" here
   without a mapped-type guard, and nobody wrote one.
3. `tests/remote/validate.test.ts:11-15` asserts three positive verbs and one negative. It
   **passes vacuously with respect to completeness** — the tenth verb's absence is invisible to
   it. A `Record<CardEventKind, true>` keyed on the union would make both the type and the test
   exhaustive by construction.

### F-30 — `<kai-remote>` never re-sends a changed envelope · product gap · S2

`remote/host-embed.ts:45-55` — the returned `RemoteCardHandle` exposes
`update(envelope)` ("Re-render with a new/updated envelope (same id = update)"). The element
facade **never calls it**: `elements/remote.tsx` reads `props.envelope` once in `onMount`
(line 169) and its only `createEffect` (217-220) calls `updateContext` for theme. So a host
cannot push a state change into a framed card, and remounting to force one would redo the
handshake every tick.

The transport can do the thing; the element cannot. The builder worked around it by giving the
framed board a stable envelope and letting the board page subscribe to the run feed on **its
own** origin (`NOTES.md` §6) — a good design, arrived at because the alternative was unavailable.
*Fix direction: a `createEffect` on `props.envelope` calling `handle.update()`, guarded on the
handle existing.*

### F-31 — neither card surface bridges to `kai-remote`'s contract · product gap · S2

`elements/cards.tsx:132-141` assigns, onto whatever tag `types` resolves to, exactly:

```ts
ref.data = props.envelope.data;
ref.cardId = props.envelope.id;
if (props.envelope.title != null) ref.heading = props.envelope.title;
ref.resolution = props.envelope.resolution;
ref.setAttribute('theme', props.theme);
ref.setAttribute('data-card-id', props.envelope.id);
```

`kai-remote` needs `src`, `providerOrigin` and `envelope` — none of which is in that list, and
`envelope` is not `data`. So the documented `types` override, pointed at `kai-remote`, produces
the permanent error node. The component-path dispatcher (`card-renderer.tsx:153`) renders Solid
components and cannot address a tag at all.

Note the irony in the same file: `elements/cards.tsx:199-206` deliberately reads `props.policy`
**at event time, not mount time**, with a comment explaining that this is what makes the standard
"set `el.policy` after the element is in the DOM" host pattern work. The repo already knows this
class of bug and solved it two files away from where F-28/F-31 land.

### F-32 — the scaffolder emits a bare, propless `<Remote />` — the one configuration that is guaranteed to fail · product gap · S2 · rung-4 F-09 class

Called live against the installed 0.25.2 MCP with
`{ integration: 'mock', placement: 'full-page', framework: 'react', components: ['kai-chat','kai-remote','kai-confirm'] }`, the emitted front end contains:

```jsx
{/* wire data props — see the component_reference MCP tool */}
<Remote />
{/* wire data props — see the component_reference MCP tool */}
<Confirm />
```

Rung 4 filed the bare-propless-sibling pattern as F-09 (`<Segmented />`, `<Checkpoint />`). It
is unchanged, and on `kai-remote` it is materially worse than on a layout element: a propless
`<Remote />` is precisely the input that paints
`[kai-remote] Invalid provider-origin ""` — and per F-28 the React wrapper cannot fix it by
adding props either. The emitted line cannot be made to work by following its own comment.

### F-33 — un-resolving a card requires a NEW `data` reference, and that is stated nowhere · doc gap · S3

`components/use-card-resolution.ts:31-35`:

```ts
const [local, setLocal] = createSignal<R | undefined>(undefined);
createEffect(on(opts.data, () => setLocal(undefined), { defer: true }));
const resolution = createMemo(() => opts.prop() ?? local());
```

A card keeps its own optimistic resolution from the moment it is clicked, and `prop() ?? local()`
means **clearing the envelope's `resolution` does not un-resolve it** — the card still looks
answered while the thread says it is live. The only reset is a new `data` **identity**. This
breaks both undo paths (reject→Undo, and everything `dismissRecovery` writes through `set`) until
you know it.

Checked before filing: `dismissRecovery` is documented 7 times on the docs site and **0 times**
in the shipped `llms-full.txt`; the *specific* fact that clearing a resolution is insufficient
appears in neither, and `debug` (row 7) explained `onReopen` "clears the resolution back to live"
without saying that clearing it is not enough. The builder's `revive()` in `src/card-store.ts`
is a correct reading, and it had to reverse-engineer it. Filed as a doc gap because the behaviour
itself is defensible (the reactivity-two-halves rule already says a changed item needs a new
object) — what is missing is anyone saying so on this surface.

### F-34 — a malformed card tool call is reported on NO channel at all · product gap · S2 · rung-4 F-22 at card scale

Rung 4's F-22: a malformed tool call is reported only on the channel card apps are told to
suppress (the tool panel). This rung makes it total, and there are **two** distinct malformed
cases, both ending at zero channels.

**Case 1 — unparseable arguments.** `wire/consume.ts:231-244` is the only reporter:

```ts
} catch (e) {
  const error = `Malformed tool arguments${truncated}: …`;
  sink.upsertTool(id, { type: name, state: 'output-error', errorText: error, rawInput, raw });
  return { ...base, error };
}
```

`onToolCallReady` is **not** called on this path (compare line 229 on the success path), so
`cardFromToolCall` never runs and no card is ever constructed. The single report is the
`upsertTool` patch — i.e. the tool panel. And a card app must suppress that panel, or every
proposal renders twice (F-36); the builder's `cardAwareSink` drops `upsertTool` for `kai_`-named
calls, which drops this error patch along with the duplicate. **One channel, and it is the one
the kit's own guidance forces you to close.**

**Case 2 — parseable arguments, invalid card data.** Here the card does get built, and the kit's
card-side diagnostic fires:

```ts
host?.emit({ kind: 'error', cardId: props.envelope.id, message });          // card-renderer.tsx:142
host?.emit({ kind: 'error', cardId, message: `Unsupported card type: …` }); // card-renderer.tsx:165-172
```

Both are `host?.` — and inside `<kai-chat>` `host` is `undefined` (F-26). A hard validation
failure still swaps in `CardFallback` with a reason string, so the *user* sees something; the
*application* is told nothing and cannot count, log, retry or re-prompt.

The optional chain is the whole defect in case 2, and the missing `onToolCallReady` call is the
whole defect in case 1. Both are silent drops on a diagnostic path — one wearing a safe-navigation
operator, one wearing an early return.

### F-35 — `createMockResponder()` still cannot emit tool calls · product gap · S2 · verbatim repeat of rung-4 F-05

`state/mock.ts:99-114` — `MockResponderOptions` is `{ replies?: readonly string[]; delayMs?;
chunkSize?; announce? }`, and `respond()` cycles canned **text**. An ops console is nothing but
tool calls, so the front door's zero-config path cannot carry a single card.

Consequence, measured across two rungs: **every ladder app that wants to demo the card path
hand-builds OpenAI tool-call SSE frames.** Rung 4 paid 95 lines for it
(`server/mock-stream.ts`); this rung paid it again in `app/server/script.ts`. The builder did it
well — it imports the kit's own tells (`MOCK_BANNER`, `MOCK_MARKER_KEY`, `MOCK_MARKER`,
`MOCK_MODEL_ID`, all-zero usage) rather than restating them, which is exactly what
`state/mock.ts:37-60` asks for — but the frame shape had to be read off the OpenAI reader in the
installed bundle. **This is the single highest-leverage unfixed item in the catalog**: it is the
reason the last two rungs both had to simulate the model before they could exercise the kit.

### F-36 — card tool calls also render the raw tool panel · acceptable variation, with a product note · repeat of rung-4 F-17

`kai-chat`'s "wiring the loop" section teaches `cardFromToolCall` + `isCardTool` but not that the
stream accumulator has *already* turned the same call into a `<kai-tool>` panel. The ordering is
explicit in `wire/consume.ts:221-229`: `sink.upsertTool(id, { state: 'input-available', … })`
fires **first**, unconditionally, and only then `opts.onToolCallReady?.(ready)`. `isCardTool`
exists (`schemas/from-tool-call.ts:120`) and is referenced nowhere in `wire/` or `state/`, so
nothing upstream of the consumer distinguishes a card call from a real one — so a proposal
renders twice, once as a collapsed `kai_approval` panel and once as the card. The builder wrapped
the sink (`app/src/assistant.ts` `cardAwareSink`, dropping `upsertTool` for tool-call ids whose
announce patch carries a `kai_` name) and deliberately did **not** suppress tools the app really
runs. That is the right call and the same shape rung 4 arrived at independently.

**Filed as a variation, not a defect, because the app's choice is correct.** The product note is
that two independent builders wrote the same wrapper for the same reason, which is the signature
of a missing kit affordance (an `onToolCallReady`-adjacent "this call became a card" suppression,
or a documented recipe). It is also load-bearing for F-34: the suppression closes the only
channel that was reporting malformed calls.

### F-37 — a `tasks` card in `progress` mode cannot be made display-only through card data · product gap · S3

`components/tasks-card.tsx:191` declares `readonly?: boolean` as an element/component prop, and
275/471/649-670 drive the display-only rendering from it. There is no equivalent in the tasks
card's **data**, so a card rendered through the registry — which assigns only `data`, `cardId`,
`heading`, `resolution` (`elements/cards.tsx:132-141`) — cannot set it. `mode: 'progress'`
renders a checklist whose rows stay user-toggleable.

The builder's app rewrites the checklist from the run feed every ~2 s, so a stray toggle
self-corrects; it recorded that it could find no way to make a progress checklist genuinely
display-only (`NOTES.md` §7). This is the general shape of the card-data-vs-element-prop seam:
anything expressible only as an element prop is unreachable from a model-authored envelope.

### F-38 — CSP / `frame-ancestors` for a two-origin card deployment is documented nowhere · doc gap · S3

The kit sets its own half of the framing contract — `DEFAULT_SANDBOX =
'allow-scripts allow-forms allow-same-origin'` (`host-embed.ts:60`), exact-origin pinning,
`assertCrossOrigin` — and says nothing about the provider's half. A real deployment needs the
provider page to permit framing by the host origin, and `frame-ancestors` appears **zero times**
in the four docs pages, zero in the shipped `llms-full.txt`, and zero in the MCP `kai-remote`
reference. The builder never hit it because both origins were loopback Vite servers with no CSP
at all; the first real deployment will.

Adjacent, same class, recorded here rather than filed separately: the app's board API allows any
http loopback origin, which the builder correctly flagged as a dev-only convenience
(`NOTES.md`, "Deliberate limitations"). The kit gives no guidance on the production shape of
either header.

### F-39 — two in-source comments assert behaviour the code does not have · doc gap · S4

Both found while verifying candidates, both cheap to fix, both actively misleading to the next
reader:

- `primitives/card-host.tsx:4` — "Cards inside `<kai-chat>`/`<CardProvider>` use this; bare cards
  fall back to the bubbling `kai-card` event." No `CardProvider` is rendered on the `<kai-chat>`
  path and no `hostElement` is passed, so neither clause holds there (F-26).
- `frameworks/react/runtime.tsx:100-102` — "With self-registration (elements/register imported at
  the top of react/index.tsx) this is belt-and-braces — the element is already defined before
  React renders." `frameworks/react/index.tsx` contains **no** import of `elements/register`; its
  own header (lines 6-9) describes the opposite, per-wrapper lazy registration. The comment
  describes a design that was replaced, and it downplays exactly the race F-28 turns out to be.

### F-40 — recorded non-finding: rung-4's F-10 is FIXED · non-finding

Rung 4's headline residual — `GET /api/chat` terminating the dev server — is closed in 0.25.2.
The scaffolder's emitted route now carries both guards (verified in the live scaffold output:
`if (request.method !== 'POST') throw new ChatRequestError(405, …)` and a `try/catch` around
`request.json()`, with the middleware catch commented "this catch is the guard findings F-10
exists for"). The builder's app mirrors the same shape at `app/plugins/chat-api.ts:24-28` and
`app/server/chat.ts:34-40`, and the keyless mirror answers:

```
GET  /api/chat                    -> 405, server alive
POST /api/chat  body 'not json'   -> 400 {"error":"Request body is not valid JSON."}, server alive
POST /api/chat  valid             -> 200, marker-stamped SSE
```

Recorded as a non-finding so the residual table has a closure with evidence, and so nobody
re-files it.

## Findings from the T9 insider real-mode round (F-41 – F-42)

The clean-room build never contacted a provider (see Provenance). Task 9 landed the app at
`examples/apps/ops-console/` and ran a real two-turn OpenRouter smoke on two models, capturing
every stream to `.superpowers/sdd/2026-08-21-rung-5-remote-cards/t9-sse-captures/`. Six captures,
**re-parsed here from the raw bytes rather than from T9's summary**:

| Capture | prose ch | reasoning ch | reasoning tok | `finish_reason` | tool calls |
|---|---|---|---|---|---|
| `t1-deepseek-approval.sse` | 265 | 940 | 192 | `tool_calls` | `kai_approval` |
| `t1-gpt4omini.sse` | 0 | 0 | 0 | `tool_calls` | `kai_parameters` |
| **`t2-deepseek-checklist-LEAKED-INTO-REASONING.sse`** | **0** | **1,197** | **344** | **`stop`** | **none** |
| `t2-deepseek-checklist-run2.sse` | 0 | 79 | 16 | `tool_calls` | `kai_checklist` |
| `t2-deepseek-checklist-run3.sse` | 0 | 547 | 126 | `tool_calls` | `kai_checklist` |
| `t2-gpt4omini-approval.sse` | 0 | 0 | 0 | `tool_calls` | `kai_approval` |

Reproduce with a JSON parse over `data:` lines summing `delta.content`, `delta.reasoning`,
`delta.tool_calls[].function.name`, `choices[0].finish_reason` and
`usage.completion_tokens_details.reasoning_tokens`.

### F-41 — a complete tool call delivered as raw markup inside `delta.reasoning`, with `finish_reason: stop` · environmental / upstream defect · S3, with a kit consequence · rung-4 F-21 class, NEW form

On **1 of 3 byte-identical turn-2 requests**, OpenRouter's StreamLake/DeepSeek route emitted the
tool call the app asked for as raw provider-internal markup inside the reasoning channel instead
of in `tool_calls`. Verified from the capture bytes, not from the report:

- `"tool_calls"` occurrences in the whole file: **0**. `finish_reason`: **`stop`** (not
  `tool_calls`). Concatenated `delta.content`: **0 characters**.
- `delta.reasoning`: 336 deltas, 1,197 characters, and **344 of the turn's 345 completion
  tokens** were reasoning (`usage.completion_tokens_details.reasoning_tokens: 344`).
- 10 `DSML` markers in the reasoning text. The reassembled tail is a **complete and
  well-formed** call — not a truncation, not a narration:

```
<｜DSML｜tool_calls>
<｜DSML｜invoke name="kai_checklist">
<｜DSML｜parameter name="tasks" string="false">[{"id": "drain", "label": "Drain traffic from old fleet"}, …
  {"id": "ticket-complete", "label": "Mark CHG-4821 complete in ticketing"}]</｜DSML｜parameter>
<｜DSML｜parameter name="mode" string="true">progress</｜DSML｜parameter>
<｜DSML｜parameter name="heading" string="true">Payments deploy to us-east-1 (CHG-4821)</｜DSML｜parameter>
</｜DSML｜invoke>
</｜DSML｜tool_calls>
```

Nine well-formed tasks, valid JSON in the `tasks` parameter, correct `mode` and `heading` — every
byte the app needed to draw the checklist, in the one channel that cannot carry it. The two clean
runs beside it (`run2`, `run3`) made the same call correctly with `finish_reason: tool_calls` and
zero `DSML` markers, on the same prompt.

**n = 3. That is far too small for a rate**, and it is recorded as an anecdote, exactly as F-21
was. What it establishes is that the failure mode exists and that it is not deterministic.

**The kit consequence, and it is the F-22 channel question again.** From the kit's side this turn
is indistinguishable from a model that simply answered nothing: `readOpenAIStream` sees reasoning
deltas and a `stop`, folds the reasoning onto a `reasoning` part, and finishes. No parse error, no
malformed-arguments path (`wire/consume.ts:231-244` never runs, because no tool call was ever
announced), no `onToolCallReady`, nothing for `isCardTool` to test. **Nothing anywhere on the kit
path can surface "the model called a tool but the route buried it in the reasoning channel"** —
and unlike F-34's two cases, there is no channel here that was closed by app choice; there is no
signal at all. The turn simply produces an assistant message with a reasoning panel and no card.

Two further notes, both consequences rather than findings:

- **Invisible to every mock.** `createMockResponder()` cannot emit tool calls at all (F-35), and
  a hand-built mock emits the frames its author intended — so no mock in this repo, present or
  future, can produce this shape. It is reachable only from a live route. This is the strongest
  argument yet for the real-mode round being a permanent part of the ladder rather than a
  garnish.
- **Not the kit's to fix, and probably not worth a heuristic.** Sniffing `delta.reasoning` for
  provider-internal tool markup would put a per-provider parser inside the layer whose whole
  contract is "the kit PARSES what the wire says". The defensible kit-side move is diagnostic,
  not corrective: a turn that ends `stop` with zero content and a large reasoning share is
  *anomalous*, and `@kitn.ai/ui/diagnostics` is where saying so would belong. Recorded as an
  option, not a recommendation.

### F-42 — the card arrives with no prose, on both models, despite the system prompt asking for a sentence first · teaching gap · S3 · rung-4 F-24 cluster

`examples/apps/ops-console/server/chat.ts:134` instructs: "Say one or two sentences about what
you are proposing, THEN make the call." Across the six captures, **five turns produced a tool
call and four of those five emitted zero prose** — every `delta.content` string concatenates to
the empty string in `t1-gpt4omini`, `t2-deepseek-checklist-run2`, `t2-deepseek-checklist-run3`
and `t2-gpt4omini-approval`. Only `t1-deepseek-approval` complied, with 265 characters.

The coordinator flagged this for the two clean DeepSeek turn-2 runs; the captures say it is
broader than that — **both** models do it, and the one turn that produced prose was the only
first-turn DeepSeek run. So this is not a DeepSeek quirk and not a turn-2 quirk.

The kit consequence is a UI one, and it is the reason this is a teaching gap rather than a note:
an app that assumes a card is preceded by an explanatory sentence will ship a thread where
consequential actions appear with no context whatever. Rung-4's F-24 named three things every
real model does that nothing in the kit warns about; **"a tool-calling turn frequently emits no
text at all, however firmly you ask for some"** is a fourth, and it is one a component library
can actually help with — the card's own `heading`/`title` is then carrying the entire burden of
explaining the action, which is a design constraint worth stating where cards are taught.

*Not filed as a product gap:* `tool_choice: 'auto'` and the prompt wording are the app's call,
and T9's justification for `'auto'` (recorded in its report) is sound.

## Counts by class

| Class | Count | IDs |
|---|---|---|
| teaching gap | 2 | F-27, **F-42** |
| product gap | 9 | F-26, F-28, F-29, F-30, F-31, F-32, F-34, F-35, F-37 |
| doc gap | 3 | F-33, F-38, F-39 |
| builder error | **0** | — (all eight self-reported candidates hold against source) |
| acceptable variation | 1 | F-36 |
| environmental / upstream | 1 | **F-41** |
| strip artifact | **0** | — (all candidates checked against the real `llms-full.txt` / `README.md`) |
| recorded non-finding | 1 | F-40 |
| **Classified total** | **16** | F-26 – F-42 less the non-finding F-40 |

By severity: **S1 ×3** (F-26, F-27, F-28) · **S2 ×6** (F-29, F-30, F-31, F-32, F-34, F-35) ·
**S3 ×5** (F-33, F-37, F-38, **F-41**, **F-42**) · **S4 ×1** (F-39). Fifteen severity-carrying
findings; F-36 carries none, and F-40 is a recorded non-finding.

**Catalog running total after rung 5: 40 classified findings across F-01 – F-42**
(rung 4's 24 + this rung's 16; F-19 and F-40 are the two recorded non-findings).

Shape against rung 4, since the ratio is the measurement: rung 4 was 4 teaching / 12 product /
3 doc / 2 builder-error. This rung is **2 teaching / 9 product / 3 doc / 0 builder-error**, and
one of the two teaching gaps (F-42) is only visible with a live provider. The
front door did not get better at teaching — the two teaching gaps it would have been charged with
(`listenForCardEvents`/`emitCardEvent`/`onToolCallReady` invisibility) are the *same* F-01/F-02
still open, so they are not re-filed. What moved is that a more capable builder converted what
rung 4 would have filed as its own mistakes into correct reverse-engineering, and every remaining
divergence sits in the kit.

## Rung-4 residuals, re-checked

| Residual | Status |
|---|---|
| **F-10** — `GET /api/chat` kills the dev server | **FIXED.** The §0 wave landed the 405 + parse guards in the emitted route; verified live against the scaffolder and against the running keyless mirror. Filed **F-40** (non-finding). |
| **F-03** — cards in `<kai-chat>`, `policy` on `<kai-cards>` | **NOT FIXED, and the mechanism is worse than the symptom.** No `CardHost` on the chat path at all, so events are silently discarded rather than merely unrouted. Filed **F-26** (S1, raised from F-03's S2). |
| **F-22** — a malformed tool call reported only on the suppressed channel | **NOT FIXED, now total.** On the card path the second channel is `host?.emit`, which is `undefined` inside `<kai-chat>`. Zero channels. Filed **F-34**. T9's real-mode round found a third shape with no channel at all — a call the route buried in `delta.reasoning`, which never reaches any reporting path (**F-41**). |
| **F-05** — `createMockResponder()` cannot carry the payload | **NOT FIXED, verbatim.** Second rung of hand-built tool-call SSE frames. Filed **F-35**. |
| **F-17** — the duplicate tool panel | **NOT FIXED.** Second independent builder, same hand-written sink wrapper. Filed **F-36**. |
| **F-09** — the components axis emits bare, propless elements | **NOT FIXED, and now lands on an element where propless is fatal.** Filed **F-32**. |
| **F-01 / F-02** — the streaming half of the bridge and the custom-card contract unnamed | **NOT FIXED.** `listenForCardEvents`, `emitCardEvent`, `onToolCallReady`, `stream.addCard`: still zero in the shipped `llms-full.txt`. Not re-filed under new numbers; F-27 is their remote-transport analogue. |
| **F-06** — `debug` answers nothing | **REPEATED, with a new detail.** 5 calls, **3 "No known failure pattern matched"** — and the 2 that hit were about non-bubbling events and dismiss recovery, i.e. facts the pattern DB has and the shipped corpus does not. Not re-filed; the rate is recorded in `builder-run.md`. |
| **F-24** — the cheap-model behaviour cluster | **PARTIALLY RE-EXERCISED by T9.** Not in the clean-room round (mock-only, scripted assistant, zero provider contact). T9's six captures add a **fourth** cluster member — a tool-calling turn emits no prose at all, 4 of 5 turns, both models (**F-42**). Double-escaping, duplicate parallel calls and narrate-instead-of-call remain unmeasured; n is far too small for rates. |
| **F-15** — who toggles `.dark` | Not re-exercised: this app never needed a manual toggle. Left open. |

## Independent build/run verification (keyless mirror)

The `app/` snapshot was mirrored to a scratch directory (`.env*` excluded — there were none in
the snapshot), the `@kitn.ai/ui` dependency re-pointed from the sandbox's relative path to the
absolute `ops/kitn.ai-ui-0.25.2.tgz` (the only edit made), and run with every provider key
unset (`env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u OPENROUTER_API_KEY`).

| Step | Result |
|---|---|
| `npm install` | **PASS** — 134 packages, exit 0, no lockfile needed |
| `npm run build` (`tsc --noEmit && vite build && vite build --config vite.board.config.ts`) | **PASS** — exit 0, no type errors, both bundles emitted (`dist/console`, `dist/board`) |
| `npm run dev` (both origins) | **PASS** — console on `:5173`, board on `:5175`, Vite 8.2.2, both ready in ~210 ms |
| `POST /api/chat` (keyless) | **PASS** — marker-stamped SSE: `: kai-mock` banner, `_kai_mock` on every frame, `model: "kai-mock"` |
| `GET /` on the board origin | **PASS** — 200 |
| `GET /api/chat` | **405**, server alive (F-40) |
| `POST /api/chat` with `not json` | **400** `{"error":"Request body is not valid JSON."}`, server alive (F-40) |

**Zero comparer fixes were needed to build or run the app.** Toolchain: Node 22.22.3, Vite
8.2.2, TypeScript 7.0.2, React 19.2.8, `@vitejs/plugin-react` 6.1.0. All processes killed after
the run.

## Provenance

Every finding names its round at its own site. This rung has **two** rounds.

| Round | Findings | What it could and could not see |
|---|---|---|
| **Clean-room build** (2026-08-21, session `f760a7ef`, 164 turns, $22.30, 43.8 min, `claude-opus-5`) | F-26 – F-40 | **Mock-only by design.** No provider was ever contacted (`web_fetch_requests: 0`, `web_search_requests: 0`); the app's assistant is a keyword-routed script emitting hand-built OpenAI SSE frames. Enough to measure the front door, the scaffolder, the kit's types and the whole native+remote card transport under a real two-origin browser session. **Not** enough to say anything about model behaviour: no finding in this round rests on what a model emits. |
| **T9 insider real-mode smoke** (2026-08-22, the app landed at `examples/apps/ops-console/`) | F-41 – F-42 | Two models over OpenRouter — `deepseek` (the app default) and `gpt-4o-mini` — two turns each, plus two repeats of the turn-2 prompt, **six streams captured whole** to `t9-sse-captures/`. Enough to find what a route *does* to a well-formed call (F-41) and a behaviour both models share (F-42); **n = 3 on the repeated prompt, so nothing here supports a rate.** The insider's own composition choices deliberately preserved the clean-room app's F-26/F-28/F-31/F-33/F-35/F-36 workarounds, so this round tested the same seams the build round measured. |

**Worth one line on model divergence**, because it shapes what a card app must handle: on the
*same* turn-1 prompt, `gpt-4o-mini` answered with **`kai_parameters`** — a form, to gather inputs
before proposing — while `deepseek` answered with **`kai_approval`** directly. Two defensible
readings of one prompt, producing two different card types and two different numbers of turns to
reach the same action. An app that hard-codes "turn 1 yields an approval" is model-specific
without knowing it; the builder's `intent`/`params` follow-up drive happens to handle both, which
is why the smoke passed on either model.

**Comparer additions beyond the builder's own report**, so the provenance of each is clear:

- F-28's case-B measurement (the lazy registration path) is **mine**, not the builder's; the
  builder measured case A only. My source-level prediction for case B was wrong and the browser
  corrected it.
- F-29's second and third points (the `as CardEventKind[]` cast defeating the check; the test
  passing vacuously w.r.t. completeness) are mine; the builder reported the missing verb only.
- F-32's live scaffold call, F-27's live MCP re-fetch, and every count table are mine, run
  against the installed 0.25.2 MCP and the real tarball rather than quoted from the transcript.
- F-39 was found while verifying other candidates and is in neither the builder's notes nor the
  handoff's candidate list.
- F-40 (the F-10 closure) is mine; the builder had no reason to know it was a residual.
- F-41 and F-42 come from T9's captures, but every number in them was **re-derived from the raw
  SSE bytes** rather than taken from T9's report — including two corrections: T9 described the
  zero-prose behaviour as the two clean DeepSeek turn-2 runs, and the captures show it in **4 of
  5** tool-calling turns across **both** models (F-42); and the leaked call is **complete and
  well-formed**, not partial, which is what makes F-41 a routing defect rather than a truncation.

**One comparer correction is recorded rather than smoothed over:** the handoff describes
candidate 1 as "rung-4 F-03 rediscovered independently". That undersells it. F-03 said the policy
handle is on the wrong element, which implies the events exist and go unrouted. They do not
exist: they are constructed and dropped. The severity is raised S2 → S1 accordingly, and F-34
exists because the same `?.` swallows the diagnostic channel.

---

# THE REMOTE-CARD SEAM INVENTORY

Delivered separately, at **`seam-inventory.md`** in this directory — every line the app wrote to
bridge model → card envelope → thread → board → wire-back (policy routing, board updates, action
round-trip, origin plumbing), the way rung 4's artifact-seam inventory seeded the compile-to-WC
spec. It is not duplicated here; read it alongside F-26 (why the thread-side routing exists at
all), F-31 (why the board is framed beside the thread instead of carried in it) and F-35 (why the
mock-side framing is seam the kit could delete).
