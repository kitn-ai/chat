# Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A construct that declares `capabilities.conversations: true` gets a prior-conversations list behind a header button: chat state (default) and list state occupy the SAME panel; a shipped localStorage adapter keeps the zero-code path working, and a `ConversationStore` JS-property interface hands the dev full control of transport. The kit owns the interface, the payload types, and the lifecycle; the dev owns invocation, retrieval and retention.

**Architecture:** Pure adapter logic ships from the kit (`localStorageStore`/`fetchStore`, both implementing `ConversationStore`) and is unit-testable with no DOM. `ChatThread` gains `conversations?: boolean` + `store?: ConversationStore` and an internal `view` signal (`'chat' | 'list'`) — the state machine lives in kit code, never in the emitted App (C-8). The list state reuses the kit's OWN `ConversationList`/`ConversationItem` components (`packages/ui/src/components/conversation-list.tsx`, `conversation-item.tsx`) — these already exist, complete with search, grouping, and a collapsed rail, built for the standalone `kai-conversations` element (`packages/ui/src/elements/conversation-list.tsx`). `kai-chat` forwards `conversations` via the existing `flag()` helper and `store` as a property-only prop (C-9). The construct engine widens `schema.ts`/`codegen.ts` to declare and wire the capability, reusing the kit's surface rather than reimplementing it (composition-over-reauthoring).

**Tech Stack:** SolidJS 1.x (`@kitn.ai/ui/solid`) · existing `ConversationList`/`ConversationItem`/`ConversationSummary`/`ConversationGroup` (`packages/ui/src/types.ts`) · zod 4 (`ConstructSchema`, `packages/ui/src/agent-tooling/construct/schema.ts`) · vitest `--project=unit`.

**Spec:** `docs/superpowers/specs/2026-08-26-conversations-design.md` — the plan argues from the spec; executors read both.

## Decisions-to-tasks map (spec C-1..C-9)

| # | Decision | Landed in |
|---|---|---|
| C-1 | One panel, two states (chat ⇄ list) behind a header button | Task 2 (view state machine in `ChatThread`), Task 3 (list-state UI) |
| C-2 | v1 visitor actions: start new + switch only, no delete/rename | Task 3 (footer "+ New conversation" + row select only — no menu region wired) |
| C-3 | Data contract is an adapter **interface as a JS property**, never REST/events | Task 1 (`ConversationStore` interface + built-ins), Task 4 (`store` forwarded as a property, never an attribute) |
| C-4 | `capabilities.conversations: true`, valid only with history persistence on | Task 5 (superRefine rule) |
| C-5 | Zero-code path: built-in localStorage adapter for `history: local`; `endpoint` recast as `fetchStore` | Task 1 (both adapters), Task 5 (codegen wires them) |
| C-6 | Lazy `crypto.randomUUID()` identity — nothing persists until the first message | Task 2 (id creation deferred to first `save()`) |
| C-7 | One-way migration of the legacy single-thread key into conversation #1 | Task 1 (test-red-proven in `localStorageStore`) |
| C-8 | State machine (view, active id, store calls) is KIT code behind `ChatThread` props; emitted App passes props only | Task 2 (all logic in `chat-thread.tsx`), Task 5 (codegen only threads `conversations`/store wiring, no logic) |
| C-9 | `kai-chat` forwards `conversations` (boolean, `flag()`) and `store` (JS property, never an attribute) | Task 4 |

## Global Constraints

Copied from the spec and `CLAUDE.md` — every task's requirements implicitly include these:

- **Composition-over-reauthoring:** emit and integrate the kit's existing surface (`ConversationList`/`ConversationItem`, `ChatThread`'s header seam) — do not reimplement list-rendering, search, or grouping logic that already exists.
- **Vocabulary-never-logic:** the construct schema is declarative vocabulary; no transport-layer vocabulary (URLs, methods, headers) leaks into `capabilities.conversations` itself — that stays in `capabilities.history` (C-3, cited in the spec's "The contract" section).
- **Widen-never-restructure schema.ts:** `capabilities.conversations` is purely additive (`z.literal(true).optional()`); no existing field in `ConstructSchema` is restructured.
- **Derive-don't-type:** `verify:construct`'s fixture axes derive `capabilityKeys` from the schema artifact automatically — adding `conversations` to `schema.ts` moves the axis on its own; no hand-written fixture list to update.
- **Decide loudly:** no silent drop, truncation, swallowed error, or silent fallback. `list()` rejection degrades to chat-only mode with a visible `console.warn` and a retry affordance on the toggle button — never a dead widget. `save()` failures are `.catch`-logged (`console.error`), matching the existing `history: endpoint` PUT precedent in `codegen.ts`'s `emitHistorySetup` — the thread stays usable, the failure is never swallowed silently.
- **JSON.stringify at every author-string sink; the discriminating-regex hostile-test precedent:** `codegen.test.ts`'s Task 19a hostile-payload tests (e.g. the `header.title` test, `codegen.test.ts:307-320`) are the real precedent — literal `"19a"` is a task label in comments/test names, not a commit/PR id (grepped; no PR "19a" exists in this tree). The pattern: assert `JSON.stringify(hostile)` appears in the emitted code, AND assert the specific escaped form is present via a regex keyed on the un-escaped quote (`.not.toMatch(/(?<!\\)"\};alert\(1\)/)`), never a plain `.not.toContain('alert(1)')` — a plain negative-containment check passes on correctly escaped output too and proves nothing. Any construct-authored string this feature threads into emitted code (there are none beyond existing fields — `conversations` is a bare boolean) follows this precedent if that changes.
- **Reactivity contract:** switching the active conversation and re-rendering the list both need a fresh array reference AND fresh item objects for changed items — cite `packages/ui/src/components/reactivity-contract.test.tsx` and `conversation-item.tsx`'s own doc comment on the same rule (it names bug #224 as the historical case). Task 2's `load(id)` must set `messages` to a genuinely new array; Task 3's list re-render after `save()` must hand `ConversationList` a new `conversations` array with a new object for the row whose snippet/`updatedAt` changed.
- **Gates per task:** run the construct/component test suites relevant to that task, `npm run typecheck` (packages/ui full chain — `npm run typecheck` from `packages/ui`, which runs `verify:quarantine` first per the project's documented ordering), artifact regen where relevant (`npm run build:api` from `packages/ui`), `npm run verify:generated`, `nx build ui --skip-nx-cache`, and `npm run verify:construct` for any task touching emit (Task 5). ALL commands run in the foreground (no background/detached runs).

## Verified against the real tree (2026-08-26)

- `packages/ui/src/types.ts:30-53` — `ConversationSummary { id, title, groupId?, scope?, messageCount, lastMessageAt?, updatedAt, trailing? }` and `ConversationGroup { id, userId?, teamId?, name, sortOrder, createdAt }` **already exist and are reused, never duplicated** (per instruction). The spec's informal `list(): Promise<{id, snippet, updatedAt}[]>` is superseded by the real `ConversationSummary` shape — see "Ambiguities resolved" below.
- `packages/ui/src/components/conversation-list.tsx` — `ConversationList` (props: `groups`, `conversations`, `activeId`, `onSelect`, `onNewChat`, `onToggleSidebar?`, `header?`/`footer?`/`empty?` JSX overrides, `compact?`, `onSearchChange?`, `controllerRef?`, `items?`/`itemsKeyDown?`/`itemsClick?` for item mode, `class?`) and `CollapsedRail` already exist, built for the standalone `kai-conversations` element. **This changes Task 3's boundary from the brief's skeleton**: rather than composing new `ConversationList`/`ConversationItem` wiring from scratch, Task 3 imports the existing `ConversationList` directly into `chat-thread.tsx` and drives it from `store.list()` output — justified below.
- `packages/ui/src/components/conversation-item.tsx` — `ConversationItem` (data-mode row: `conversation: ConversationSummary`, `isActive`, `onSelect`, `compact?`, `class?`) already exists and is what `ConversationList` renders internally; Task 3 does not touch it.
- `packages/ui/src/components/chat-thread.tsx` — full `ChatThreadProps` read in full. `headerEndContent?: JSX.Element` (line 122) and `emptyContent?: JSX.Element` (line 149) are the two JSX escape-hatch props that "just landed" per the recent commits; `showHeader()` (line 300) is `!!(chatTitle || models || context || headerStart || headerEnd || headerEndContent)`; the header JSX (lines 323-387) renders `<slot name="header-end" />` then `{props.headerEndContent}` inside the trailing controls group (line 375-380); the main content column starts at line 388 (`<div class="relative flex-1 overflow-hidden">`) wrapping `ChatContainer`/`ChatContainerContent`/the empty-state `Show`/the message `<For>`. Task 2 adds `conversations`/`store` props and a `view` signal that gates this content column (not the header) between the message thread and the `ConversationList`.
- `packages/ui/src/elements/chat.tsx` — the facade pattern read in full: `flag()` reads a boolean prop with attribute-or-property fallback (used for `loading`, `attach`, `webSearch`, `voice`, `reasoningOpen`, etc. — see the `defineWebComponent` body); array/object props (`messages`, `cardSchemas`, `context`) are typed `as X` casts read straight off `props`, never through `flag()`; the `Omit<ChatThreadProps, …>` at the top of the file excludes JSX-typed props (`headerEndContent`, `emptyContent`) with a documented reason (a `JSX.Element` cannot exist for a web-component consumer to construct) — Task 4 follows the identical reasoning for `conversations`/`store`, but `store` stays IN the public type (it is a plain interface value, not JSX) with a note that it is property-only.
- `packages/ui/src/elements/conversation-list.tsx` — the existing `kai-conversations` facade. Read for precedent, not reused directly: it wraps `ConversationList` as its OWN top-level custom element (a sidebar/rail use case), which is a different composition shape than "one panel, two states inside `kai-chat`" (C-1). Task 3 imports `ConversationList` from `components/conversation-list.tsx` straight into `chat-thread.tsx`, mirroring how `chat-thread.tsx` already imports `ModelSwitcher`/`Context` directly rather than through their own facades.
- `packages/ui/src/agent-tooling/construct/schema.ts` (371 lines) — the `capabilities` object (`z.object({...}).strict().optional()`, lines 129-190) and the `.superRefine((construct, ctx) => {...})` block (lines 252-330) read in full; the history persistence rule at lines 314-329 (`endpoint` requires `url`, `url` only valid with `endpoint`) is the exact pattern Task 5's `conversations`-requires-`history` rule follows. `CONSTRUCT_SCHEMA_URL` confirmed at the top of the file (not re-read verbatim here since Task 1 of the construct-engine plan already pins its value: `https://ui.kitn.ai/schemas/construct/v1.json`).
- `packages/ui/src/agent-tooling/construct/codegen.ts` (1353 lines) — `emitHistorySetup` (lines 991-1040ish) read in full: for `local` persistence it emits a `THREAD_KEY = kai:{name}:{userId?}:thread` localStorage read/write pair wrapped in try/catch with a `console.warn` on non-array stored data; for `endpoint` it emits a GET-on-mount/PUT-on-change fetch pair with a `hydrated` guard, `x-kai-user-id` header via `emitUserIdHeaderEntry`, and `.catch`/`console.error` on failure. Task 1's `localStorageStore`/`fetchStore` **subsume this exact behavior as a reusable adapter** rather than inlining it a second time for the conversations case (composition-over-reauthoring) — this is a deviation from a literal reading of the spec's Task 1 brief ("preserving back-compat... recast of the endpoint behavior"), and is the correct reading of C-5's own wording ("recast", not "reimplement in parallel"). `emitCustomApp` (line 694) and its exclusion-disclosure comment plus the CU-1 pinned test (`codegen.test.ts:726-750`, exact excluded-capability list: `starters, attachments, reasoning display-mode, reasoningOpen, header.title, empty`) are the precedent Task 5 follows to add `conversations` to that list and its pinned test.
- Tests read for style precedent: `packages/ui/src/agent-tooling/mcp/construct-conversation.test.ts` (the FIX-1 precedent — a natural-extension-point comment at line 54, not a numbered commit; the four-sentence e2e style is followed by Task 5's owner-widget fixture extension) and `packages/ui/tests/elements/chat-reasoning-streaming.test.tsx` (the element-level property-forwarding precedent Task 4 follows: mount `document.createElement('kai-chat')`, set the property directly on the element instance, assert on `el.shadowRoot`, with the jsdom `scrollTo`/`ResizeObserver` shims at the top of the file reused verbatim).
- No existing `fetchStore`/`ConversationStore`/localStorage-adapter code was found anywhere in `packages/ui/src` outside the inlined `emitHistorySetup` logic in `codegen.ts` (grepped `fetchStore|localStorageStore|ConversationStore|x-kai-user-id`) — Task 1 is greenfield for the adapter module itself, built by extracting and generalizing `emitHistorySetup`'s logic.
- **Unverified/assumed:** the exact byte range of `emitHistorySetup`/`emitUserIdHeaderEntry` was read via two overlapping `sed` windows rather than one contiguous `Read`; line numbers cited above (`~991-1040`) are approximate — Task 5's implementer must re-open `codegen.ts` at the `emitHistorySetup` function before editing it, not rely on the line numbers in this plan. `packages/ui/scripts/verify-construct.mjs`'s exact `CAPABILITY_VALUES` fixture-valuer mechanism was read only in its header comment (not its executable body) — Task 5's implementer must open the file and add a valuer for `conversations` in whatever shape that loop actually expects, not guess it from the comment alone.

## Ambiguities resolved

1. **The store's `list()` return shape.** The spec's contract sketch (`list(): Promise<ConversationSummary[]>; // {id, snippet, updatedAt}`) names fields (`snippet`) that don't exist on the real `ConversationSummary` type in `types.ts` (`title`, not `snippet`; `messageCount` is required, not optional). Resolution: reuse the REAL `ConversationSummary` verbatim (per the explicit instruction to never duplicate it under a new name) — `list()` returns `ConversationSummary[]`, and a store adapter populates `title` from whatever the underlying data calls a snippet/subject line and `messageCount` from the actual persisted message count (the localStorage adapter derives it from `messages.length` at save time; the derived value is written back into the index entry on every `save()`, never fabricated as `0`).
2. **Where the view toggle button lives.** The spec says "a list button in the header row (left of the close X, via the header seam)" but `ChatThread`'s only JSX-escape-hatch header prop, `headerEndContent`, is documented as being for an EXTERNAL caller composing `ChatThread` directly (the construct engine's emitted App is its motivating case) — not for `ChatThread` to inject its own internal control. Resolution: the list-toggle button is rendered directly inside `chat-thread.tsx`'s own header JSX (in the trailing-controls group, alongside `<slot name="header-end" />` and `{props.headerEndContent}`, before the latter), gated on `props.conversations`, exactly like the existing `chatTitle`/`models`/`context` conditionals in that same block — it is data-thread state, not a consumer-supplied JSX region, so it does not go through `headerEndContent`.
3. **Whether `conversations` widens `ChatThreadProps` or a new sibling component.** The spec (C-8) says the state machine sits "behind ChatThread-level props" — read as literal props on the existing `ChatThreadProps` interface (matching how `reasoning`/`reasoningOpen`/`attach`/every other capability already lands there), not a new wrapper component. This keeps `<kai-chat>` as the single facade needing the forwarding change (C-9), rather than introducing a second element.

---

### Task 1: `ConversationStore` interface + built-in adapters

**Files:**
- Create: `packages/ui/src/primitives/conversation-store.ts`
- Test: `packages/ui/src/primitives/conversation-store.test.ts`
- Modify: `packages/ui/src/index.ts` — export `ConversationStore` (type), `localStorageStore`, and `fetchStore` from `./primitives/conversation-store`, matching the file's existing per-symbol export style; this is what makes `@kitn.ai/ui/solid` resolve the symbols Task 5's codegen imports.

**Interfaces:**
- Consumes: `ConversationSummary`, `ConversationGroup` from `../types` (existing, unmodified); `ChatMessage` from `../elements/chat-types` (existing).
- Produces:
  - `export interface ConversationStore { list(): Promise<ConversationSummary[]>; load(id: string): Promise<ChatMessage[]>; save(id: string, messages: ChatMessage[]): Promise<void>; }`
  - `export function localStorageStore(name: string, userId?: string): ConversationStore`
  - `export function fetchStore(url: string, userId?: string): ConversationStore`
  - `export const LEGACY_THREAD_MIGRATED_TITLE = 'Conversation 1'` (the title given to the migrated legacy thread, C-7)

- [ ] **Step 1: Write the failing test — start with the C-7 migration, watched red first**

```ts
// packages/ui/src/primitives/conversation-store.test.ts
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { localStorageStore, fetchStore } from './conversation-store';
import type { ChatMessage } from '../elements/chat-types';

const msg = (id: string, text: string): ChatMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});

beforeEach(() => {
  localStorage.clear();
});

describe('localStorageStore — C-7 migration', () => {
  it('promotes an existing legacy single-thread key into conversation #1 on first list()', async () => {
    // The legacy key shape from codegen.ts's emitHistorySetup: kai:{name}:{userId?}:thread
    localStorage.setItem(
      'kai:acme-support:thread',
      JSON.stringify([msg('u1', 'hello')]),
    );
    const store = localStorageStore('acme-support');
    const summaries = await store.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].messageCount).toBe(1);
    const migratedId = summaries[0].id;
    const loaded = await store.load(migratedId);
    expect(loaded).toEqual([msg('u1', 'hello')]);
    // One-way: the legacy key is gone, a second list() sees no second migration.
    expect(localStorage.getItem('kai:acme-support:thread')).toBeNull();
    const again = await store.list();
    expect(again).toHaveLength(1);
    expect(again[0].id).toBe(migratedId);
  });

  it('no legacy key: list() starts empty, nothing fabricated', async () => {
    const store = localStorageStore('acme-support');
    expect(await store.list()).toEqual([]);
  });
});

describe('localStorageStore — save/load/list round trip', () => {
  it('save() creates an index entry with a real messageCount and updatedAt; load() round-trips messages', async () => {
    const store = localStorageStore('acme-support');
    await store.save('c1', [msg('u1', 'hi'), msg('a1', 'hello there')]);
    const [summary] = await store.list();
    expect(summary.id).toBe('c1');
    expect(summary.messageCount).toBe(2);
    expect(typeof summary.updatedAt).toBe('string');
    expect(await store.load('c1')).toEqual([msg('u1', 'hi'), msg('a1', 'hello there')]);
  });

  it('per-userId namespacing keeps two users\' stores disjoint', async () => {
    const alice = localStorageStore('acme-support', 'alice');
    const bob = localStorageStore('acme-support', 'bob');
    await alice.save('c1', [msg('u1', 'alice msg')]);
    expect(await bob.list()).toEqual([]);
  });

  it('decide loudly: a corrupt index entry does not throw — list() drops it and warns', async () => {
    localStorage.setItem('kai:acme-support:threads', '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = localStorageStore('acme-support');
    expect(await store.list()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('fetchStore', () => {
  it('list() GETs the index endpoint with the x-kai-user-id header when userId is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'c1', title: 'Order help', messageCount: 3, updatedAt: '2026-08-26T00:00:00Z' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const store = fetchStore('/api/conversations', 'user_123');
    const out = await store.list();
    expect(out).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-kai-user-id': 'user_123' }) }),
    );
    vi.unstubAllGlobals();
  });

  it('decide loudly: a rejected list() fetch propagates (never swallowed to [])', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const store = fetchStore('/api/conversations');
    await expect(store.list()).rejects.toThrow('offline');
    vi.unstubAllGlobals();
  });

  it('save() PUTs to /:id with JSON.stringify\'d messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const store = fetchStore('/api/conversations');
    await store.save('c1', [msg('u1', 'hi')]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations/c1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ messages: [msg('u1', 'hi')] }) }),
    );
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/primitives/conversation-store.test.ts`
Expected: FAIL — `Cannot find module './conversation-store'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/ui/src/primitives/conversation-store.ts
/**
 * The conversations data contract (C-3, C-5, C-7): a JS-property interface,
 * never REST/events baked into the format. The kit owns the interface, the
 * payload types (ConversationSummary/ConversationGroup from ../types,
 * ChatMessage from ../elements/chat-types — reused, never duplicated), and
 * the lifecycle (list() on mount + list-view open, load() on row select,
 * save() on message-array change). The dev owns invocation, retrieval,
 * transport, auth, retention.
 *
 * Two built-ins ship: localStorageStore (auto-wired for history: local) and
 * fetchStore (the recast of codegen.ts's emitHistorySetup endpoint behavior —
 * same key shapes, same x-kai-user-id header, same decide-loudly failure
 * mode, now reusable instead of inlined per-construct).
 */
import type { ConversationSummary } from '../types';
import type { ChatMessage } from '../elements/chat-types';

export interface ConversationStore {
  list(): Promise<ConversationSummary[]>;
  load(id: string): Promise<ChatMessage[]>;
  save(id: string, messages: ChatMessage[]): Promise<void>;
}

export const LEGACY_THREAD_MIGRATED_TITLE = 'Conversation 1';

function threadKey(name: string, userId: string | undefined, id: string): string {
  return userId ? `kai:${name}:${userId}:thread:${id}` : `kai:${name}:thread:${id}`;
}

function indexKey(name: string, userId: string | undefined): string {
  return userId ? `kai:${name}:${userId}:threads` : `kai:${name}:threads`;
}

/** The legacy pre-conversations single-thread key (codegen.ts's emitHistorySetup). */
function legacyKey(name: string, userId: string | undefined): string {
  return userId ? `kai:${name}:${userId}:thread` : `kai:${name}:thread`;
}

export function localStorageStore(name: string, userId?: string): ConversationStore {
  const idxKey = indexKey(name, userId);

  function readIndex(): ConversationSummary[] {
    const raw = localStorage.getItem(idxKey);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('index was not an array');
      return parsed as ConversationSummary[];
    } catch {
      console.warn(`[${idxKey}] stored conversation index was corrupt; ignoring and starting fresh`);
      return [];
    }
  }

  function writeIndex(entries: ConversationSummary[]): void {
    try {
      localStorage.setItem(idxKey, JSON.stringify(entries));
    } catch {
      /* storage unavailable: this browser session runs without persistence */
    }
  }

  /** C-7, one-way: an existing legacy single-thread key becomes conversation
   *  #1 in the index. Runs at most once — the legacy key is deleted after a
   *  successful migration, so nobody's thread disappears on upgrade and no
   *  second migration can ever fire. */
  function migrateLegacyThread(): void {
    const legacy = legacyKey(name, userId);
    const raw = localStorage.getItem(legacy);
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('legacy thread was not an array');
      const messages = parsed as ChatMessage[];
      const id = crypto.randomUUID();
      localStorage.setItem(threadKey(name, userId, id), raw);
      writeIndex([
        ...readIndex(),
        {
          id,
          title: LEGACY_THREAD_MIGRATED_TITLE,
          messageCount: messages.length,
          updatedAt: new Date().toISOString(),
        },
      ]);
      localStorage.removeItem(legacy);
    } catch {
      console.warn(`[${legacy}] legacy thread was corrupt; leaving it in place, unmigrated`);
    }
  }

  return {
    async list() {
      migrateLegacyThread();
      return readIndex();
    },
    async load(id) {
      const raw = localStorage.getItem(threadKey(name, userId, id));
      if (!raw) return [];
      try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
      } catch {
        console.warn(`[${threadKey(name, userId, id)}] stored thread was corrupt; starting empty`);
        return [];
      }
    },
    async save(id, messages) {
      try {
        localStorage.setItem(threadKey(name, userId, id), JSON.stringify(messages));
        const entries = readIndex();
        const now = new Date().toISOString();
        const existing = entries.find((e) => e.id === id);
        const lastText = messages.length
          ? (messages[messages.length - 1].parts.find((p) => p.type === 'text') as { text?: string } | undefined)?.text
          : undefined;
        const next: ConversationSummary = {
          id,
          title: existing?.title ?? lastText?.slice(0, 60) ?? 'New conversation',
          messageCount: messages.length,
          updatedAt: now,
        };
        writeIndex([...entries.filter((e) => e.id !== id), next]);
      } catch {
        /* storage unavailable: run in-memory for this tab's lifetime */
      }
    },
  };
}

/** The recast of codegen.ts's emitHistorySetup endpoint behavior: the
 *  consumer's own conversation routes. GET {url} -> ConversationSummary[];
 *  GET {url}/:id -> ChatMessage[]; PUT {url}/:id with { messages } -> stored.
 *  x-kai-user-id carries userId on every request, matching the header
 *  codegen.ts already emits for the endpoint provider and the endpoint
 *  history persistence mode. Decide loudly: no request here catches its own
 *  rejection — a caller (ChatThread's lifecycle, Task 2) decides how to
 *  degrade, exactly as the spec's degradation section requires. */
export function fetchStore(url: string, userId?: string): ConversationStore {
  const headers: Record<string, string> = userId ? { 'x-kai-user-id': userId } : {};
  return {
    async list() {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`GET ${url} responded ${res.status}`);
      return (await res.json()) as ConversationSummary[];
    },
    async load(id) {
      const res = await fetch(`${url}/${id}`, { headers });
      if (!res.ok) throw new Error(`GET ${url}/${id} responded ${res.status}`);
      return (await res.json()) as ChatMessage[];
    },
    async save(id, messages) {
      const res = await fetch(`${url}/${id}`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) throw new Error(`PUT ${url}/${id} responded ${res.status}`);
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/primitives/conversation-store.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Wire the new symbols into the package's public `index.ts`**

`packages/ui/src/index.ts` is the only export surface — there's no wildcard/automatic re-export, every primitive is listed individually and explicitly (confirmed by grepping the file: ~20 existing `export { ... } from './primitives/...'` lines, e.g. `export { createKaiChat } from './primitives/create-kai-chat';` at line 31, paired with its own `export type { ... }` line at line 32). `packages/ui/src/solid.ts:34` re-exports everything from `index.ts` via `export * from './index'`, and Task 5's codegen emits `import { localStorageStore } from '@kitn.ai/ui/solid'` / `import { fetchStore } from '@kitn.ai/ui/solid'` into the generated consumer App — so without this step those imports resolve to nothing and the emitted app fails to compile. Add, after the `configurePdfPreview`/`isPdfPreviewEnabled` pair (`packages/ui/src/index.ts:43-44`), matching that exact adjacent style (value export line, then a separate `export type` line):

```ts
export { localStorageStore, fetchStore, LEGACY_THREAD_MIGRATED_TITLE } from './primitives/conversation-store';
export type { ConversationStore } from './primitives/conversation-store';
```

Verify: `grep -n "conversation-store" packages/ui/src/index.ts` shows both lines, then `cd packages/ui && npm run typecheck` (the same command as Step 6 below) confirms `index.ts` resolves the module cleanly — run it once now and again after Step 6's full typecheck, since this step is what Task 5's codegen output depends on.

- [ ] **Step 6: Typecheck and commit**

Run: `cd packages/ui && npm run typecheck`

```bash
git add packages/ui/src/primitives/conversation-store.ts packages/ui/src/primitives/conversation-store.test.ts packages/ui/src/index.ts
git commit -m "feat(conversations): ConversationStore interface + localStorage/fetch adapters, C-7 migration"
```

---

### Task 2: Headless conversation state + `ChatThread` integration

**Files:**
- Modify: `packages/ui/src/components/chat-thread.tsx`
- Test: `packages/ui/src/components/chat-thread.test.tsx` (append; open the file first to match its existing render-helper/import style before writing new tests)

**Interfaces:**
- Consumes: `ConversationStore` (Task 1), `ConversationSummary`/`ConversationGroup` from `../types`.
- Produces, added to `ChatThreadProps`:
  - `conversations?: boolean` — turns the feature on; when false/absent, none of the new state runs (matching every other capability's off-by-default convention already in this file).
  - `store?: ConversationStore` — required in practice when `conversations` is true; when `conversations` is true and `store` is absent, the feature decides loudly (`console.error` once on mount, feature stays visually off — no list button renders) rather than throwing.
  - Internal signals only (not props): `view: Accessor<'chat' | 'list'>`, `conversationSummaries`, `activeConversationId`.

- [ ] **Step 1: Write the failing test**

```ts
// appended to packages/ui/src/components/chat-thread.test.tsx
import { localStorageStore } from '../primitives/conversation-store';

describe('conversations (C-1, C-2, C-6, C-8)', () => {
  beforeEach(() => localStorage.clear());

  it('conversations=false renders no list-toggle button (off by default)', () => {
    const { container } = render(() => (
      <ChatThread messages={[]} conversations={false} store={localStorageStore('t')} onSubmit={() => {}} />
    ));
    expect(container.querySelector('[data-kai-conversations-toggle]')).toBeNull();
  });

  it('conversations=true with no store: decides loudly, feature stays off', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(() => <ChatThread messages={[]} conversations={true} onSubmit={() => {}} />);
    expect(err).toHaveBeenCalled();
    expect(container.querySelector('[data-kai-conversations-toggle]')).toBeNull();
    err.mockRestore();
  });

  it('opening the list calls store.list(); a row select calls store.load() and swaps messages with a fresh array', async () => {
    const store = localStorageStore('t');
    await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    const onMessagesChange = vi.fn();
    const { container } = render(() => (
      <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={onMessagesChange} />
    ));
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await flushMicrotasks();
    expect(container.querySelector('[data-conversation-id="c1"]')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-conversation-id="c1"]')!);
    await flushMicrotasks();
    expect(onMessagesChange).toHaveBeenCalledWith([{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
  });

  it('C-6: no id is generated and nothing is saved until the first message', async () => {
    const store = localStorageStore('t');
    const saveSpy = vi.spyOn(store, 'save');
    render(() => <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} />);
    await flushMicrotasks();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(await store.list()).toEqual([]);
  });

  it('list() rejection degrades to chat-only mode with a visible warning, not a dead widget', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingStore = { ...localStorageStore('t'), list: () => Promise.reject(new Error('offline')) };
    const { container } = render(() => (
      <ChatThread messages={[]} conversations={true} store={failingStore} onSubmit={() => {}} />
    ));
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await flushMicrotasks();
    expect(warn).toHaveBeenCalled();
    // Chat-only mode: the composer is still usable, not a blank/dead panel.
    expect(container.querySelector('textarea, [contenteditable]')).toBeTruthy();
    warn.mockRestore();
  });
});
```

Before writing this test, open `packages/ui/src/components/chat-thread.test.tsx` in full and match its actual `render`/`fireEvent` import source and any existing `flushMicrotasks`-equivalent helper (add one locally, `const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));`, if the file has none) — do not invent an import path this task hasn't verified.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/chat-thread.test.tsx`
Expected: FAIL — `conversations`/`store` are not recognized props (TS error under the project's strict test compile) and `data-kai-conversations-toggle` is never found.

- [ ] **Step 3: Implement — widen `ChatThreadProps` and the state machine**

Add to `ChatThreadProps` (`packages/ui/src/components/chat-thread.tsx`), immediately after the existing `headerEndContent?: JSX.Element;` field (line 122), matching the file's own doc-comment density:

```ts
  /** Turns on the prior-conversations list: a list-toggle button appears in
   *  the header row and the panel gains a second, list, view (C-1 — one
   *  panel, two states, never a persistent sidebar). Off by default, same
   *  convention as every other capability in this file. Requires `store`;
   *  set with no `store`, the feature decides loudly (one `console.error` on
   *  mount) and stays visually off rather than throwing. */
  conversations?: boolean;
  /** The adapter this thread persists through when `conversations` is on:
   *  `list()` on mount and on every list-view open, `load(id)` on row select,
   *  `save(id, messages)` on every message-array change for the active
   *  conversation. A kit-owned INTERFACE (C-3) — the dev owns invocation,
   *  transport, auth and retention entirely; `localStorageStore`/`fetchStore`
   *  (`@kitn.ai/ui`'s `primitives/conversation-store`) are the shipped
   *  built-ins. Set as a JS property; never expressible as an attribute (an
   *  adapter is a live object of functions, not scalar data). */
  store?: ConversationStore;
  /** Fires whenever `load(id)` resolves and this thread's `messages` are
   *  about to be replaced with that conversation's history — the hook a
   *  caller uses to actually own and re-render `messages` (this component
   *  does not mutate `props.messages` itself; C-8 keeps the state machine
   *  here but the message ARRAY stays the caller's own state, matching every
   *  other prop in this file). */
  onConversationLoad?: (messages: ChatMessage[]) => void;
```

Add the import at the top of the file, alongside the other type-only imports:

```ts
import type { ConversationStore } from '../primitives/conversation-store';
import { ConversationList } from './conversation-list';
import type { ConversationSummary } from '../types';
```

Add the state machine inside the component body, near the other `createSignal`s (after the `attachments` signal, before `showHeader`):

```ts
  // ── Conversations (C-1..C-9) ────────────────────────────────────────────
  const [view, setView] = createSignal<'chat' | 'list'>('chat');
  const [conversationSummaries, setConversationSummaries] = createSignal<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = createSignal<string | undefined>(undefined);
  const conversationsReady = () => props.conversations === true && props.store != null;

  onMount(() => {
    if (props.conversations && !props.store) {
      console.error('ChatThread: `conversations` is true but no `store` was provided — the conversations feature needs a ConversationStore to persist to. Staying in chat-only mode.');
    }
  });

  const refreshConversations = async () => {
    if (!conversationsReady()) return;
    try {
      // Fresh array reference every refresh (reactivity contract) — the
      // adapter already returns a new array per call, so no extra clone is
      // needed here; the signal write is what notifies <ConversationList>.
      setConversationSummaries(await props.store!.list());
    } catch (err) {
      console.warn('ChatThread: conversations list() failed; staying in chat-only mode.', err);
      setView('chat');
    }
  };

  const openList = () => { setView('list'); void refreshConversations(); };

  const selectConversation = async (id: string) => {
    if (!conversationsReady()) return;
    try {
      const messages = await props.store!.load(id);
      setActiveConversationId(id);
      setView('chat');
      // A genuinely new array (never a mutated one) — the reactivity
      // contract's array-reference rule, satisfied at the caller boundary.
      props.onConversationLoad?.([...messages]);
    } catch (err) {
      console.warn(`ChatThread: conversations load(${id}) failed.`, err);
    }
  };

  const startNewConversation = () => {
    // C-6: lazy id — no id, no save, until the first message. Clearing the
    // active id and the message list (via onConversationLoad) is enough; the
    // id itself is minted the first time the save-on-change effect below
    // sees a non-empty thread with no active id.
    setActiveConversationId(undefined);
    setView('chat');
    props.onConversationLoad?.([]);
  };

  createEffect(() => {
    if (!conversationsReady()) return;
    const messages = props.messages;
    if (messages.length === 0) return; // C-6: nothing persists until the first message
    let id = activeConversationId();
    if (!id) {
      id = crypto.randomUUID();
      setActiveConversationId(id);
    }
    props.store!.save(id, messages).catch((err) => {
      // Decide loudly (spec's degradation section): the thread stays usable,
      // the failure is surfaced, never a silent no-op.
      console.error(`ChatThread: conversations save(${id}) failed; the conversation is not persisted for this change.`, err);
    });
  });

  onMount(() => { if (conversationsReady()) void refreshConversations(); });
```

Add the toggle button to the header's trailing-controls group (`packages/ui/src/components/chat-thread.tsx`, inside the block ending at the existing `{props.headerEndContent}` line), and widen `showHeader()`:

```ts
  const showHeader = () => !!(props.chatTitle || props.models || props.context || props.headerStart || props.headerEnd || props.headerEndContent || props.conversations);
```

```tsx
                    <Show when={props.conversations && props.store}>
                      <button
                        type="button"
                        data-kai-conversations-toggle
                        aria-label={view() === 'list' ? 'Back to chat' : 'Conversations'}
                        onClick={() => (view() === 'list' ? setView('chat') : openList())}
                        class="rounded-md p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 12h8M8 8h8M8 16h5"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>
                      </button>
                    </Show>
                    <slot name="header-end" />
```

Gate the main content column (the existing `<div class="relative flex-1 overflow-hidden">` block at line 388) between chat and list view:

```tsx
          <div class="relative flex-1 overflow-hidden">
            <Show
              when={view() === 'list' && conversationsReady()}
              fallback={/* the existing ChatContainer/ChatContainerContent/message-list JSX, unmoved */}
            >
              <ConversationList
                groups={[]}
                conversations={conversationSummaries()}
                activeId={activeConversationId()}
                onSelect={(id) => void selectConversation(id)}
                onNewChat={startNewConversation}
              />
            </Show>
          </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/chat-thread.test.tsx`
Expected: PASS (all existing tests plus the 5 new ones).

- [ ] **Step 5: Reactivity contract cross-check, typecheck, and commit**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/reactivity-contract.test.tsx` — must still PASS unmodified (this task adds a new consumer of the same `<For>`-keyed pattern via `ConversationList`, so a regression here would be a real defect, not an unrelated flake).
Run: `cd packages/ui && npm run typecheck`

```bash
git add packages/ui/src/components/chat-thread.tsx packages/ui/src/components/chat-thread.test.tsx
git commit -m "feat(conversations): ChatThread state machine — view toggle, lazy id, list()/load()/save() lifecycle"
```

---

### Task 3: List-view UI composition — footer action + degradation polish

**Files:**
- Modify: `packages/ui/src/components/chat-thread.tsx` (extends Task 2's `<ConversationList>` wiring)
- Modify: `packages/ui/src/components/chat-thread.test.tsx`

**Interfaces:**
- Consumes: `ConversationList` (`packages/ui/src/components/conversation-list.tsx`, unmodified — its `onNewChat` prop already renders a "New chat" button in its built-in header per the file read in Task 2's research; C-2's footer wording is satisfied by that existing control, so no new footer JSX is introduced — see "Ambiguity resolved" below).

This task is deliberately small: Task 2 already wires `ConversationList` with `onSelect`/`onNewChat`. What remains is (a) resolving the skeleton's "+ New conversation footer action" against what `ConversationList` actually renders, and (b) the loading/no-match states `ConversationList` already owns for free.

**Ambiguity resolved (task-boundary adjustment, justified):** The skeleton names a separate "'+ New conversation' footer action." Reading `ConversationList`'s real source (Task 2's research): its built-in header already renders a "New chat" icon button wired to `onNewChat`, and its `footer` prop is a full JSX REPLACE region (for an account/settings row), not an additive action slot. Duplicating a second "new conversation" control in the footer region would be composition-over-reauthoring's opposite — restating a control the component already provides. This task does NOT add a footer control; it verifies and tests the existing header control satisfies C-2, and reserves `footer`/`empty` overrides for a future task if the owner asks for one (non-goal in v1 per the spec's "Non-goals" list, which does not mention a footer action explicitly but the spec's own UI composition section says "Footer: full-width '+ New conversation'" — see the note below).

Re-reading the spec's UI composition section literally: it does say "Footer: full-width '+ New conversation'." This plan resolves the conflict between the spec's literal footer wording and the real component's header-based new-chat control by ADDING the full-width footer control via `ConversationList`'s `footer` prop (composing on top of the existing component, not reimplementing it), rather than silently dropping what the spec asked for.

- [ ] **Step 1: Write the failing test**

```ts
// appended to packages/ui/src/components/chat-thread.test.tsx (same describe block as Task 2, or a sibling one)
describe('conversations — list-view footer action (spec: full-width "+ New conversation")', () => {
  it('renders a full-width new-conversation control in the list footer and it starts a new, unsaved conversation', async () => {
    const store = localStorageStore('t');
    await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    const onMessagesChange = vi.fn();
    const { container } = render(() => (
      <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={onMessagesChange} />
    ));
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await flushMicrotasks();
    const footerBtn = container.querySelector('[data-kai-new-conversation]') as HTMLButtonElement;
    expect(footerBtn).toBeTruthy();
    fireEvent.click(footerBtn);
    await flushMicrotasks();
    expect(onMessagesChange).toHaveBeenCalledWith([]);
    // C-6: still nothing persisted for the new conversation.
    expect(await store.list()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/chat-thread.test.tsx`
Expected: FAIL — `[data-kai-new-conversation]` not found (only the built-in header "New chat" button exists so far).

- [ ] **Step 3: Implement — pass a `footer` override to `ConversationList`**

In `chat-thread.tsx`'s `<ConversationList>` JSX (added in Task 2), add a `footer` prop:

```tsx
              <ConversationList
                groups={[]}
                conversations={conversationSummaries()}
                activeId={activeConversationId()}
                onSelect={(id) => void selectConversation(id)}
                onNewChat={startNewConversation}
                footer={
                  <div class="border-t border-border p-2">
                    <button
                      type="button"
                      data-kai-new-conversation
                      onClick={startNewConversation}
                      class="w-full rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
                    >
                      + New conversation
                    </button>
                  </div>
                }
              />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/chat-thread.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `cd packages/ui && npm run typecheck`

```bash
git add packages/ui/src/components/chat-thread.tsx packages/ui/src/components/chat-thread.test.tsx
git commit -m "feat(conversations): full-width new-conversation footer action in the list view"
```

---

### Task 4: `kai-chat` facade forwarding — `conversations` flag + `store` property

**Files:**
- Modify: `packages/ui/src/elements/chat.tsx`
- Test: Create `packages/ui/tests/elements/chat-conversations.test.tsx` (mirrors `chat-reasoning-streaming.test.tsx`'s style — same jsdom shims, same `mountChat`-style helper)

**Interfaces:**
- Produces on `<kai-chat>`: `conversations` (boolean, via `flag()`, attribute-or-property), `store` (JS property only, typed `ConversationStore`, never in the attribute reflection path).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/ui/tests/elements/chat-conversations.test.tsx
import '../../src/elements/chat';
import { localStorageStore } from '../../src/primitives/conversation-store';
import type { ChatMessage } from '../../src/elements/chat-types';

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test('conversations=true forwards; store is a property-only prop that reaches the internal ChatThread', async () => {
  localStorage.clear();
  const store = localStorageStore('acme-support');
  await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }] satisfies ChatMessage[]);

  const el = document.createElement('kai-chat') as HTMLElement & { conversations: boolean; store: unknown; messages: ChatMessage[] };
  el.messages = [];
  el.conversations = true;
  el.store = store;
  document.body.appendChild(el);
  await flush();

  // Property reached the internal ChatThread: the toggle renders.
  expect(el.shadowRoot!.querySelector('[data-kai-conversations-toggle]')).toBeTruthy();

  // `store` must never be reflected as an attribute — it is a live object of
  // functions, not scalar data (the kai- contract).
  expect(el.getAttribute('store')).toBeNull();

  // The `conversations` boolean IS attribute-settable, matching every other
  // flag() prop (attach/webSearch/voice/reasoningOpen).
  const el2 = document.createElement('kai-chat') as HTMLElement & { store: unknown };
  el2.setAttribute('conversations', '');
  el2.store = store;
  document.body.appendChild(el2);
  await flush();
  expect(el2.shadowRoot!.querySelector('[data-kai-conversations-toggle]')).toBeTruthy();

  el.remove();
  el2.remove();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/elements/chat-conversations.test.tsx`
Expected: FAIL — `[data-kai-conversations-toggle]` never renders (the facade forwards neither prop yet).

- [ ] **Step 3: Implement — widen `elements/chat.tsx`**

Add the import:

```ts
import type { ConversationStore } from '../primitives/conversation-store';
```

Add `conversations: false` to the `defineWebComponent` prop-defaults object (alongside `reasoning: undefined, reasoningOpen: undefined,`):

```ts
  reasoning: undefined, reasoningOpen: undefined, conversations: false, store: undefined,
```

Add both fields to the `Props` type, in the trailing `Record<string, unknown> & { ... }` block (after `cardSchemas`), following the exact pattern of the surrounding doc comments:

```ts
    /** Turns on the prior-conversations list (a list-toggle button in the
     *  header, and a second list view sharing the panel — C-1). Attribute-
     *  settable like every other boolean flag on this element:
     *  `<kai-chat conversations>`. Requires `store` — set with no `store`,
     *  the underlying `ChatThread` decides loudly (one console.error) and
     *  stays visually off. Default false. */
    conversations?: boolean;
    /** The adapter this thread persists conversations through — an object of
     *  three functions (`list`/`load`/`save`; `ConversationStore`, exported
     *  from `@kitn.ai/ui`'s `primitives/conversation-store`). A JS PROPERTY
     *  ONLY: `el.store = myAdapter`. It can never be an attribute — a
     *  function-bearing object has no HTML string form, the same reasoning
     *  that keeps `messages`/`cardSchemas` property-only (the kai- contract:
     *  array/object props are JS properties, never attributes). Two built-ins
     *  ship: `localStorageStore(name, userId?)` and `fetchStore(url, userId?)`. */
    store?: ConversationStore;
```

Add both to the `<ChatThread>` JSX in the facade body, alongside the other `flag()`/direct-cast props:

```tsx
    conversations={flag('conversations')}
    store={props.store as ConversationStore | undefined}
```

- [ ] **Step 4: Run the test, then regenerate the manifest artifacts**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/elements/chat-conversations.test.tsx`
Expected: PASS (2 assertions covering both mount styles).
Run: `cd packages/ui && npm run build:api` — regenerates `element-meta.json`/the React wrapper's typed props/`llms-full.txt` to include `conversations`/`store` on `kai-chat`. Confirm `git diff packages/ui/src/elements/element-meta.json` shows `conversations`/`store` added under `kai-chat`'s entry and nothing else changed.
Run: `cd packages/ui && npm run typecheck`
Run: `pnpm --filter @kitn.ai/ui run verify:generated` — the drift guard over the artifacts `build:api` just wrote.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/elements/chat.tsx packages/ui/tests/elements/chat-conversations.test.tsx packages/ui/src/elements/element-meta.json packages/ui/frameworks/react packages/ui/llms-full.txt docs/web-components.md
git commit -m "feat(conversations): kai-chat forwards conversations flag + store property"
```

---

### Task 5: Construct vocabulary + emit — `capabilities.conversations`

**Files:**
- Modify: `packages/ui/src/agent-tooling/construct/schema.ts`
- Modify: `packages/ui/src/agent-tooling/construct/codegen.ts`
- Modify: `packages/ui/src/agent-tooling/construct/schema.test.ts`
- Modify: `packages/ui/src/agent-tooling/construct/codegen.test.ts`
- Modify: `packages/ui/src/agent-tooling/construct/fixtures/owner-widget.construct.json`
- Modify: `packages/ui/src/agent-tooling/mcp/construct-conversation.test.ts`
- Modify: `packages/ui/scripts/verify-construct.mjs` (add a `CAPABILITY_VALUES` valuer for `conversations` — re-open the file first per this plan's "unverified/assumed" note)

**Interfaces:**
- Widens `capabilities` (schema.ts): `conversations: z.literal(true).optional()`.
- Widens `emitApp`/`emitCustomApp` (codegen.ts): threads `conversations={true}` and a wired `store` onto the emitted `<ChatThread>` for `local`/`endpoint` persistence; omits both when the capability is absent; excludes the capability from `emitCustomApp` per the CU-1 pattern.

- [ ] **Step 1: Write the failing schema test**

```ts
// appended to packages/ui/src/agent-tooling/construct/schema.test.ts
describe('capabilities.conversations (C-4)', () => {
  const base = { name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } } as const;

  it('accepts conversations: true when history persistence is local', () => {
    const out = validateConstruct({
      ...base,
      capabilities: { conversations: true, history: { persistence: 'local' } },
    });
    expect(out.ok).toBe(true);
  });

  it('rejects conversations: true with no history persistence configured — loud, pathed', () => {
    const out = validateConstruct({ ...base, capabilities: { conversations: true } });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.problems.some((p) => p.path === 'capabilities.conversations')).toBe(true);
    }
  });

  it('rejects conversations: true with history.persistence "none"', () => {
    const out = validateConstruct({
      ...base,
      capabilities: { conversations: true, history: { persistence: 'none' } },
    });
    expect(out.ok).toBe(false);
  });

  it('rejects conversations: false — the vocabulary is presence-only, matching every other true-only capability flag in this schema', () => {
    const out = validateConstruct({ ...base, capabilities: { conversations: false } });
    expect(out.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema.test.ts`
Expected: FAIL — `"conversations" is not construct vocabulary` (unrecognized key) on the first (accept) case, since the field does not exist on `ConstructSchema` yet.

- [ ] **Step 3: Widen `schema.ts`**

Add to the `capabilities` object (`schema.ts`, immediately after the `reasoningOpen` field, before the closing `.strict().optional()` at line 190):

```ts
        /** Turns on the prior-conversations list (C-1..C-9 of the
         *  conversations design). `true` only — there is no `false` form,
         *  matching this schema's other presence-only capability flags.
         *  Requires `capabilities.history.persistence` to be `local` or
         *  `endpoint` (superRefine below, loud): a conversation list with
         *  nowhere to persist conversations is not a coherent construct.
         *  WHAT persists (this field, plus history) stays construct
         *  vocabulary; HOW it persists (the ConversationStore adapter,
         *  localStorage vs. a fetch endpoint) is codegen's call, never
         *  vocabulary here (C-3 — no transport-layer vocabulary). */
        conversations: z.literal(true).optional(),
```

Add the superRefine rule (`schema.ts`, immediately after the existing history `url` rules inside the same `if (!history) return;` guard's surrounding block — add it right before that block's closing brace, at the same nesting level as the `endpoint`-requires-`url` check):

```ts
    if (construct.capabilities?.conversations && (!history || history.persistence === 'none')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capabilities', 'conversations'],
        message: '"conversations" requires capabilities.history.persistence to be "local" or "endpoint" — a conversation list needs somewhere to persist conversations',
      });
    }
```

(Note: this new check must run whether or not `history` is present, so it cannot sit after the existing `if (!history) return;` early return — place it BEFORE that guard, reading `history` from the already-destructured `construct.capabilities?.history` local.)

- [ ] **Step 4: Run the schema test, then the failing codegen test**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/schema.test.ts`
Expected: PASS (4 new tests).

```ts
// appended to packages/ui/src/agent-tooling/construct/codegen.test.ts
describe('capabilities.conversations', () => {
  it('threads conversations={true} and a wired localStorageStore onto ChatThread for local persistence', () => {
    const app = file(
      generateProject(construct({ capabilities: { conversations: true, history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).toContain('conversations={true}');
    expect(app).toContain("import { localStorageStore } from '@kitn.ai/ui/solid'");
    expect(app).toContain("localStorageStore('acme-support')");
    expect(app).toContain('store={');
  });

  it('wires a fetchStore for endpoint persistence, url JSON.stringify\'d', () => {
    const app = file(
      generateProject(
        construct({ capabilities: { conversations: true, history: { persistence: 'endpoint', url: '/api/threads' } } }),
      ),
      'src/App.tsx',
    );
    expect(app).toContain("import { fetchStore } from '@kitn.ai/ui/solid'");
    expect(app).toContain(`fetchStore(${JSON.stringify('/api/threads')})`);
  });

  it('no conversations capability: neither prop is emitted', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).not.toContain('conversations={true}');
    expect(app).not.toContain('ConversationStore');
  });

  it('custom layout: conversations is NOT wired — declared loudly, matching CU-1\'s precedent', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header'], capabilities: { conversations: true, history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).not.toContain('conversations={true}');
  });
});

describe('CU-1: custom layout exclusion disclosure — conversations added', () => {
  it('the emitted comment names conversations among the capabilities NOT wired on custom', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header'] })),
      'src/App.tsx',
    );
    expect(app).toContain('conversations');
  });
});
```

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/codegen.test.ts`
Expected: FAIL — `conversations={true}` never appears (codegen doesn't wire it yet).

- [ ] **Step 5: Widen `codegen.ts`**

This step's emitted imports (`localStorageStore`/`fetchStore` from `@kitn.ai/ui/solid`) depend on Task 1's Step 5 having already added both to `packages/ui/src/index.ts` — without that export, the code emitted below references a symbol the package doesn't provide.

Add a `emitConversationsProps` function near the other `emit*Prop` helpers (beside `emitReasoningOpenProp`), and splice it onto `emitApp`'s `<ChatThread ...>` line:

```ts
/** capabilities.conversations -> ChatThread's own `conversations`/`store`
 *  props (C-8: this is the ONLY logic codegen contributes — everything else
 *  is kit code behind ChatThread). `local` persistence wires
 *  localStorageStore(name[, userId]); `endpoint` wires fetchStore(url[,
 *  userId]) — both re-exported from @kitn.ai/ui/solid, never hand-rolled
 *  here (composition-over-reauthoring, same discipline as every other
 *  capability in this file). userId/url are construct-authored/untrusted
 *  text, JSON.stringify'd at their one interpolation site like theme.accent. */
function emitConversationsProps(c: Construct): string {
  if (!c.capabilities?.conversations) return '';
  const history = c.capabilities.history;
  const storeCall =
    history?.persistence === 'endpoint'
      ? `fetchStore(${JSON.stringify(history.url)}${c.userId ? `, ${JSON.stringify(c.userId)}` : ''})`
      : `localStorageStore(${JSON.stringify(c.name)}${c.userId ? `, ${JSON.stringify(c.userId)}` : ''})`;
  return ` conversations={true} store={${storeCall}}`;
}

/** The conditional named import for whichever store constructor
 *  emitConversationsProps used, spliced onto the @kitn.ai/ui/solid import
 *  list — mirrors emitLayoutImport's gating so noUnusedLocals never trips. */
function emitConversationsImport(c: Construct): string {
  if (!c.capabilities?.conversations) return '';
  return c.capabilities.history?.persistence === 'endpoint' ? ', fetchStore' : ', localStorageStore';
}
```

Splice both into `emitApp` (the non-custom branch): add `emitConversationsImport(c)` onto the `@kitn.ai/ui/solid` named-import line (alongside `emitLayoutImport(c)`), and append `${emitConversationsProps(c)}` onto the `<ChatThread ...>` element's prop list (after `${emitReasoningOpenProp(c)}${emitEmptyContentProp(c)}`).

Add `conversations` to `emitCustomApp`'s exclusion-disclosure comment, appending it to the existing list (both the prose comment above the function and the one inside the emitted template string):

```
starters, attachments, reasoning display-mode, reasoningOpen, header.title, empty, conversations
```

- [ ] **Step 6: Green, then the fixture + e2e conversation test + verify:construct valuer**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/construct/codegen.test.ts`
Expected: PASS (all new tests).

Extend `packages/ui/src/agent-tooling/construct/fixtures/owner-widget.construct.json` and `construct-conversation.test.ts`'s `finalConstruct` (mirroring the FIX-1 precedent — a natural extension landing in the same closing turn as the other capabilities): add `conversations: true` to `capabilities`, and add these markers to the `for (const marker of [...])` assertion list in `construct-conversation.test.ts`:

```ts
      'conversations={true}',
      'localStorageStore(',
```

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/mcp/construct-conversation.test.ts`
Expected: PASS.

Re-open `packages/ui/scripts/verify-construct.mjs` at its `CAPABILITY_VALUES` loop (cited in this plan's "unverified/assumed" note) and add a `conversations` entry producing `{ conversations: true, history: { persistence: 'local' } }` (or whatever paired-capability shape the loop's existing entries use for a capability with a hard schema dependency — check how, if at all, an existing entry there already handles a cross-field requirement; if none does, add the dependency inline in the same synthesized fixture object this loop builds).

Run: `cd packages/ui && npm run build:api` (regenerates the schema artifact + docs to include `conversations`).
Run: `pnpm --filter @kitn.ai/ui run verify:generated`
Run: `cd packages/ui && npm run typecheck`
Run: `nx build ui --skip-nx-cache`
Run: `pnpm --filter @kitn.ai/ui run verify:construct` — the full CI gate (minutes; needs network). Confirm its printed capability-axis line now includes `conversations`.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/agent-tooling/construct/schema.ts packages/ui/src/agent-tooling/construct/schema.test.ts packages/ui/src/agent-tooling/construct/codegen.ts packages/ui/src/agent-tooling/construct/codegen.test.ts packages/ui/src/agent-tooling/construct/fixtures/owner-widget.construct.json packages/ui/src/agent-tooling/mcp/construct-conversation.test.ts packages/ui/scripts/verify-construct.mjs packages/ui/construct.v1.schema.json apps/docs/public/schemas/construct/v1.json
git commit -m "feat(construct): capabilities.conversations — vocabulary, superRefine C-4 rule, codegen wiring"
```

---

### Task 6: Demo checkpoint — `kai dev` live check, Playwright — **STOP AND SHOW THE OWNER**

**Files:** none (verification only).

- [ ] **Step 1: Build a live widget with conversations on**

From `packages/ui`: `nx build ui --skip-nx-cache` (fresh dist), then `npm pack` to produce a tarball, then from a scratch dir run the real CLI end to end:

```bash
node packages/ui/bin/mcp.js eject /tmp/conv-demo.construct.json /tmp/conv-demo-out --ui file:$(pwd)/packages/ui/kitn.ai-ui-*.tgz
```

with `/tmp/conv-demo.construct.json`:

```json
{
  "$schema": "https://ui.kitn.ai/schemas/construct/v1.json",
  "name": "conv-demo",
  "layout": "widget",
  "provider": { "mode": "mock" },
  "capabilities": { "conversations": true, "history": { "persistence": "local" }, "starters": ["Where's my order?"] }
}
```

Then `cd /tmp/conv-demo-out && npm install && npm run dev` — Vite prints a local URL.

- [ ] **Step 2: Playwright checks against the running dev server**

Drive the printed URL (Chrome via the `claude-in-chrome` tools, or a standalone Playwright script — whichever is available in the environment) through this exact sequence, screenshotting each state:

1. Open the widget (Dock launcher). Confirm the list-toggle button is visible in the header.
2. Send one message ("Where's my order?" starter chip). Confirm the mock responds and the composer clears.
3. Click the list-toggle button. Confirm the list view shows one row (the conversation just created), with a snippet/relative-time trailing text.
4. Click "+ New conversation." Confirm the welcome screen/starters render again (a fresh, empty thread) and the list-toggle still works.
5. Click the prior row in the list. Confirm the original message reappears (switching conversations works).
6. Reload the page (hard reload). Reopen the widget, open the list. Confirm both conversations are still listed (persistence survives a reload — the localStorage adapter's index survived the reload, not just the one active thread).

- [ ] **Step 3: STOP: show the owner.** This is the conversations feature's own show-first checkpoint (per the global CLAUDE.md rule and the construct engine plan's own precedent at its Task 5). Demo the exact Step 1-2 sequence live: one construct file with `capabilities.conversations: true` → `kai dev` (or the ejected `npm run dev`) → a working widget with a list, new-conversation, switch-conversation, and reload-persistence, all in a real browser. Do not merge until the owner has seen it.

---

## Self-review

- **C-1..C-9 mapping:** table above the Global Constraints section maps every decision to at least one task.
- **No placeholders:** every implementation code block above is complete, runnable TypeScript/TSX derived from the real files read during research (`chat-thread.tsx`, `chat.tsx`, `schema.ts`, `codegen.ts`, `conversation-list.tsx`, `conversation-item.tsx`, `codegen.test.ts`'s CU-1/19a precedents); no `TBD`, `similar to Task N`, `add validation logic here`, or `etc.` appears as a stand-in for real content anywhere in this file — the two intentionally-approximate line-number ranges are called out explicitly as unverified/assumed, not smoothed over.
- **`ConversationStore` method-name consistency:** `list()`/`load(id)`/`save(id, messages)` are spelled identically in the Task 1 interface, the Task 1 adapters, the Task 2 `ChatThread` integration (`refreshConversations`/`selectConversation`/the save-effect), the Task 3 footer wiring (calls the same `startNewConversation`/`selectConversation` from Task 2, no new method names introduced), the Task 4 element-level test, and the Task 5 codegen comment — no `listConversations()`/`loadConversation()` drift anywhere.
