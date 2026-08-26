# Conversations: the multi-thread widget (batch 2, workstream 2)

Date: 2026-08-26. Owner-brainstormed; every ruling below made in-session. Builds on the construct engine (spec: `2026-08-25-construct-engine-design.md`) and the shipped widget chrome (header row, empty-state welcome screen).

## Executive summary

A construct declares `capabilities.conversations: true` and its widget gains a prior-conversations list: a list button in the header row opens a list view (snippet + relative time per row, "+ New conversation" at the bottom); tapping a row resumes that thread; a new conversation starts empty — welcome screen and starters showing — and persists nothing until the first message.

The kit stays out of the data loop. Storage is a **kit-defined adapter interface set as a JS property**; the dev owns transport entirely (REST, GraphQL, WebSocket, local files, anything). The kit owns the interface, the payload types, and the lifecycle — when calls fire, lazy creation, graceful degradation. One built-in localStorage adapter keeps the zero-code path working.

## Decisions ledger

| # | Decision | Ruling | Why |
|---|---|---|---|
| C-1 | Navigation model | One panel, two states: chat (default) ⇄ list view behind a header button. | Crisp/Zendesk pattern; smallest surface; an Intercom-style home view can grow out of it later. |
| C-2 | Visitor actions v1 | Start new + switch only. No delete, no rename. | Intercom/Crisp v1 parity; smallest contract. Delete/rename = future vocabulary on evidence. |
| C-3 | Data contract | **Adapter interface as a JS property** — not REST, not events. Kit defines `ConversationStore` (types + when it's called); dev implements it however they like. | Owner ruling, reversing an earlier REST proposal: baking transport into the format digs a hole (GraphQL/WS/desktop files/localStorage are all legitimate). Async-function properties beat CustomEvents: return values are natural and typed. |
| C-4 | Opt-in | Explicit `capabilities.conversations: true`, valid only with history persistence on (superRefine, loud). | Single-thread-with-resume stays a legitimate product choice; consistent with every other capability. |
| C-5 | Zero-code path | Built-in localStorage adapter auto-wired for `history: local`. The old `endpoint` URL mode remains as a shipped fetch-adapter (back-compat), reframed in docs as *one example store*, not the contract. | The construct thesis (one JSON file → working widget) survives; full control lives in `.store` or eject — never an event bus. |
| C-6 | Conversation identity | Kit-generated `crypto.randomUUID()`, created **lazily**: nothing persists until the first message. | No ghost rows; industry norm. |
| C-7 | Migration | An existing single-thread key becomes conversation #1 in the index on first load. One-way, test-pinned. | Nobody's thread disappears on upgrade. |
| C-8 | Where the logic lives | The state machine (view, active id, store calls) is KIT code behind ChatThread-level props; the emitted App passes props only. | Composition-over-reauthoring — the hand-rolled-panel lesson. |
| C-9 | Facade | `kai-chat` forwards a `conversations` boolean; `store` is a JS **property**, never an attribute. | The kai- contract for object props; JSX/function values cannot cross the WC boundary as attributes. |

## The contract

```ts
/** Kit-owned interface. The dev owns every function body. */
interface ConversationStore {
  list(): Promise<ConversationSummary[]>;      // {id, snippet, updatedAt}
  load(id: string): Promise<ChatMessage[]>;
  save(id: string, messages: ChatMessage[]): Promise<void>;
}
```

- Kit owns: the interface, `ConversationSummary`/`ChatMessage` types, and the lifecycle — `list()` on list-view open (and once on mount to seed), `load(id)` on row tap, `save(id, …)` on message-array change for the active id, id creation (lazy, C-6).
- Dev owns: invocation, retrieval, transport, auth, retention. The kit never sees a URL, a method, or a schema for their backend.
- Built-ins: `localStorageStore(name, userId?)` (auto-wired for `history: local`; index key `kai:{name}:{userId?}:threads`, per-thread `…:thread:{id}`, reads/writes try/catch) and the existing endpoint fetch behavior recast as `fetchStore(url)` (back-compat for `history: endpoint`, `x-kai-user-id` header preserved).

## Vocabulary

`capabilities.conversations: z.literal(true).optional()` — widen-never-restructure; no urls, no methods, no options in v1. superRefine: rejected unless `history.persistence` is `local` or `endpoint` (path-addressed message). `custom` layout: excluded via the established loud pattern (disclosure comment + CU-1 pin list + absence test). Published schema regenerates via build:api under the drift guard.

## UI composition

- **Chat state** (default): today's widget plus a list button in the header row (left of the close X, via the header seam). Header renders whenever conversations is on.
- **List state**: the existing `ConversationList`/`ConversationItem` roster components fed from `store.list()` — snippet + relative time, active row marked, keyboard nav as shipped. Footer: full-width "+ New conversation".
- Row tap → `load(id)` → chat state, fresh array identity (reactivity contract). New conversation → empty chat: the welcome screen (`empty`) and starters compose naturally because the thread is empty. First send creates the id and the row.
- **Degradation**: `list()` pending → brief loading state; rejection → chat-only with a quiet retry on the button. A failed store never produces a dead widget; `save()` failures `.catch`-log and the thread stays usable (history precedent).

## Kit / emit split

Kit: ChatThread (or a thin composed sibling) gains `conversations?: boolean` and `store?: ConversationStore` plus the internal view state; headless logic unit testable without DOM. Facade per C-9. Emitted App: passes `conversations`, wires the built-in adapter for `local`, passes nothing for host-provided stores (host sets `el.store`). verify:construct picks the capability up from the schema-derived axes automatically.

## Testing

- Adapter conformance suite run against the shipped localStorage adapter, including the C-7 migration (watched red first).
- jsdom: list renders from a stub store; switch swaps threads with fresh array + item identity; new conversation persists nothing until first message; welcome screen + starters render in a fresh conversation.
- Codegen: emit gating both ways; hostile-string discipline per the discriminating-regex precedent where any author string reaches a sink.
- Element-level: the facade genuinely forwards `.store` and `conversations` (the `reasoningOpen` lesson — property set on the real custom element, behavior observed).
- Real-browser leg at the demo checkpoint (show-first) before the owner review.

## Non-goals (v1)

Delete/rename (C-2) · Intercom-style home view (C-1 growth path) · unread badges/proactive messages · cross-device sync beyond what the dev's own store provides · any transport vocabulary in the construct format (C-3).
